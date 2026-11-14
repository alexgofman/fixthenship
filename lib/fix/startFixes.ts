import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSession, hasDevinKey } from "../devin/client";
import { loadRun, runsDir, saveRun } from "../store";
import type { Finding, FixSession, Run } from "../types";
import { BASE_BRANCH, FIX_OUTPUT_SCHEMA, buildFixBrief } from "./brief";
import { ensureBranch, parseRepoUrl } from "./github";
import { MAX_FIXES, eligibleForFix, errorMessage } from "./status";

export function maxAcu(): number {
  const value = Number.parseInt(process.env.DEVIN_MAX_ACU ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 5;
}

export function briefsDir(runId: string): string {
  return path.join(runsDir(), runId, "briefs");
}

function emptyFix(finding: Finding): FixSession {
  return { ruleId: finding.ruleId, sessionId: "", url: "", status: "queued", prUrl: "", summary: "", acus: 0 };
}

async function startOne(run: Run, finding: Finding, brief: string): Promise<FixSession> {
  const fix = emptyFix(finding);
  if (!hasDevinKey()) return fix;
  try {
    const { sessionId, url } = await createSession(brief, {
      title: `FixThenShip ${finding.ruleId}: ${finding.title}`,
      tags: [`fixthenship-${run.id}`],
      maxAcu: maxAcu(),
      schema: FIX_OUTPUT_SCHEMA,
    });
    return { ...fix, sessionId, url };
  } catch (err) {
    return { ...fix, status: "error", summary: `Could not start a Devin session: ${errorMessage(err)}` };
  }
}

/**
 * Starts one fix per failing, fixable finding (ten at most). Without DEVIN_API_KEY the
 * fixes stay "queued" with no session and the briefs in runs/<runId>/briefs/ are pasted by hand.
 */
export async function startFixes(runId: string): Promise<Run> {
  const run = await loadRun(runId);
  run.stage = "fixing";
  run.error = "";
  await saveRun(run);

  const errors: string[] = [];
  try {
    await ensureBranch(parseRepoUrl(run.repoUrl), BASE_BRANCH);
  } catch (err) {
    errors.push(`Could not prepare the ${BASE_BRANCH} branch: ${errorMessage(err)}`);
  }

  const findings = run.findings.filter(eligibleForFix).slice(0, MAX_FIXES);
  const dir = briefsDir(run.id);
  await mkdir(dir, { recursive: true });

  const fixes = await Promise.all(
    findings.map(async (finding) => {
      const kept = run.fixes.find((f) => f.ruleId === finding.ruleId && f.status !== "error");
      if (kept) return kept;
      const brief = buildFixBrief(run, finding);
      await writeFile(path.join(dir, `${finding.ruleId}.md`), brief + "\n", "utf8");
      return startOne(run, finding, brief);
    }),
  );

  const latest = await loadRun(runId);
  latest.fixes = fixes;
  latest.error = errors.join("\n");
  latest.stage = fixes.every((f) => f.status === "error") ? "fixed" : "fixing";
  await saveRun(latest);
  return latest;
}

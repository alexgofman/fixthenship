import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSession, hasDevinKey } from "../devin/client";
import { runsDir, updateRun } from "../store";
import type { Finding, FixSession, Run } from "../types";
import { FIX_OUTPUT_SCHEMA, baseBranch, buildFixBrief } from "./brief";
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

/** Refused because the run is not at a stage where fixes can start; the routes answer 409. */
export class FixStageError extends Error {}

/** A finished review, or a fixing or fixed run with a fix in error that can be tried again. */
export function canStartFixes(run: Run): boolean {
  if (run.stage === "reviewed") return true;
  return (run.stage === "fixing" || run.stage === "fixed") && run.fixes.some((f) => f.status === "error");
}

/** Runs whose sessions are being started right now, so a second request cannot start them again. */
const starting = new Set<string>();

/**
 * Starts one fix per failing, fixable finding (ten at most). Without DEVIN_API_KEY the
 * fixes stay "queued" with no session and the briefs in runs/<runId>/briefs/ are pasted by hand.
 * On a run that already has fixes, only those in error start again. Throws FixStageError when the
 * run's stage does not allow it (see canStartFixes) or its fixes are already being started.
 */
export async function startFixes(runId: string): Promise<Run> {
  const run = await updateRun(runId, (latest) => {
    if (starting.has(runId) || !canStartFixes(latest)) {
      throw new FixStageError(
        starting.has(runId) ? "Devin is already being started for this review" : `Fixes cannot start while the review is ${latest.stage}`,
      );
    }
    starting.add(runId);
    latest.stage = "fixing";
    latest.error = "";
  });
  try {
    return await startAll(run);
  } finally {
    starting.delete(runId);
  }
}

async function startAll(run: Run): Promise<Run> {
  const errors: string[] = [];
  const branch = baseBranch(run);
  try {
    await ensureBranch(parseRepoUrl(run.repoUrl), branch);
  } catch (err) {
    errors.push(`Could not prepare the ${branch} branch: ${errorMessage(err)}`);
  }

  const findings = run.findings.filter(eligibleForFix).slice(0, MAX_FIXES);
  const dir = briefsDir(run.id);
  await mkdir(dir, { recursive: true });

  const started = new Set<string>();
  const fixes = await Promise.all(
    findings.map(async (finding) => {
      const kept = run.fixes.find((f) => f.ruleId === finding.ruleId && f.status !== "error");
      if (kept) return kept;
      started.add(finding.ruleId);
      const brief = buildFixBrief(run, finding);
      await writeFile(path.join(dir, `${finding.ruleId}.md`), brief + "\n", "utf8");
      return startOne(run, finding, brief);
    }),
  );

  return updateRun(run.id, (latest) => {
    // A kept fix may have been polled while the new sessions were starting; keep its latest state.
    latest.fixes = fixes.map((f) => (started.has(f.ruleId) ? f : (latest.fixes.find((l) => l.ruleId === f.ruleId) ?? f)));
    latest.error = errors.join("\n");
    latest.stage = latest.fixes.every((f) => f.status === "error") ? "fixed" : "fixing";
  });
}

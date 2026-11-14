import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadRun, runsDir, saveRun } from "../store";
import { RULE_IDS, type CheckResult, type Evidence, type Finding, type RuleId, type Run } from "../types";
import { applyCheckResult } from "./merge";
import { runChecks, type RunChecksOptions } from "./runChecks";

const execFileAsync = promisify(execFile);

export const REVIEW_RULES: RuleId[] = ["R1", "R2", "R5", "R6", "R7", "R8"];
export const APP_TIMEOUT_MS = 30_000;

export type ReviewDeps = {
  clone: (repoUrl: string, dest: string) => Promise<void>;
  scan: (repoDir: string) => Promise<Finding[]>;
  waitForApp: (appUrl: string, timeoutMs: number) => Promise<boolean>;
  runChecks: (appUrl: string, outDir: string, ruleIds: RuleId[], options: RunChecksOptions) => Promise<CheckResult[]>;
  appTimeoutMs: number;
};

async function gitClone(repoUrl: string, dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await execFileAsync("git", ["clone", "--depth", "1", repoUrl, dest], {
    timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

/** Uses lib/scan's scanRepo when that module exists; otherwise the scan finds nothing. */
async function scanIfAvailable(repoDir: string): Promise<Finding[]> {
  let mod: Record<string, unknown>;
  try {
    // @ts-ignore lib/scan is written in parallel and may not exist yet.
    mod = await import("../scan");
  } catch {
    return [];
  }
  if (typeof mod.scanRepo !== "function") return [];
  const found: unknown = await mod.scanRepo(repoDir);
  if (Array.isArray(found)) return found as Finding[];
  const findings = (found as { findings?: unknown } | null)?.findings;
  return Array.isArray(findings) ? (findings as Finding[]) : [];
}

/** True once the URL answers with any HTTP response before the deadline. */
export async function waitForApp(appUrl: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    try {
      await fetch(appUrl, { redirect: "manual", signal: AbortSignal.timeout(Math.min(remaining, 10_000)) });
      return true;
    } catch {
      const wait = Math.min(1_000, deadline - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const defaultDeps: ReviewDeps = {
  clone: gitClone,
  scan: scanIfAvailable,
  waitForApp,
  runChecks,
  appTimeoutMs: APP_TIMEOUT_MS,
};

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** Evidence paths are relative to the run folder, like the example run's. */
async function checkEvidence(result: CheckResult, runDir: string, outDir: string): Promise<Evidence[]> {
  const evidence: Evidence[] = [];
  const shot = result.screenshots.find((s) => s.endsWith("-failure.png")) ?? result.screenshots.at(-1);
  if (shot) {
    evidence.push({ kind: "screenshot", path: path.relative(runDir, shot), caption: `Screen at the end of the ${result.ruleId} check` });
  }
  const trace = path.join(outDir, result.ruleId, "trace.md");
  if (await exists(trace)) {
    evidence.push({ kind: "log", path: path.relative(runDir, trace), caption: `Steps of the ${result.ruleId} check` });
  }
  return evidence;
}

function byRule(a: Finding, b: Finding): number {
  return RULE_IDS.indexOf(a.ruleId) - RULE_IDS.indexOf(b.ruleId);
}

export async function reviewApp(runId: string, overrides: Partial<ReviewDeps> = {}): Promise<void> {
  const deps = { ...defaultDeps, ...overrides };
  let run: Run | undefined;
  try {
    run = await loadRun(runId);
    const runDir = path.join(runsDir(), runId);
    const outDir = path.join(runDir, "checks");

    run.stage = "scanning";
    run.error = "";
    await saveRun(run);

    const repoDir = path.join(runDir, "repo");
    await deps.clone(run.repoUrl, repoDir);
    run.findings = [...(await deps.scan(repoDir))].sort(byRule);
    await saveRun(run);

    run.stage = "checking";
    await saveRun(run);
    if (!(await deps.waitForApp(run.appUrl, deps.appTimeoutMs))) {
      run.stage = "failed";
      run.error = "The app did not respond";
      await saveRun(run);
      return;
    }

    const current = run;
    await deps.runChecks(current.appUrl, outDir, REVIEW_RULES, {
      testEmail: `fts.reviewer.${runId.replace(/[^a-z0-9]/gi, "").slice(0, 12)}@${process.env.TEST_EMAIL_DOMAIN ?? "mailinator.com"}`,
      onResult: async (result) => {
        const evidence = await checkEvidence(result, runDir, outDir);
        current.findings = applyCheckResult(current.findings, result, evidence).sort(byRule);
        await saveRun(current);
      },
    });

    run.stage = "reviewed";
    await saveRun(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const failed = run ?? (await loadRun(runId));
      failed.stage = "failed";
      failed.error = message;
      await saveRun(failed);
    } catch {
      // The run itself cannot be loaded or saved; nothing left to record.
    }
  }
}

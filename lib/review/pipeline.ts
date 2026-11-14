import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { checkGuidelines, type GuidelinesCheck } from "../guidelines/freshness";
import { loadRun, runsDir, saveRun, updateRun } from "../store";
import { RULE_IDS, type CheckResult, type Evidence, type Finding, type RuleId, type Run } from "../types";
import { applyCheckResult } from "./merge";
import { runChecks, type RunChecksOptions } from "./runChecks";

const execFileAsync = promisify(execFile);

export const REVIEW_RULES: RuleId[] = ["R1", "R2", "R5", "R6", "R7", "R8", "R3", "R4", "R9", "R10"];
export const APP_TIMEOUT_MS = 30_000;

export type ReviewDeps = {
  clone: (repoUrl: string, dest: string) => Promise<void>;
  scan: (repoDir: string) => Promise<Finding[]>;
  waitForApp: (appUrl: string, timeoutMs: number) => Promise<boolean>;
  runChecks: (appUrl: string, outDir: string, ruleIds: RuleId[], options: RunChecksOptions) => Promise<CheckResult[]>;
  appTimeoutMs: number;
  checkGuidelines: () => Promise<GuidelinesCheck>;
};

/** `--` keeps a repository link that starts with `-` from being read as an option. */
export function gitCloneArgs(repoUrl: string, dest: string): string[] {
  return ["clone", "--depth", "1", "--", repoUrl, dest];
}

async function gitClone(repoUrl: string, dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await execFileAsync("git", gitCloneArgs(repoUrl, dest), {
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
  checkGuidelines: () => checkGuidelines(),
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

/** Clones the repository and returns its scan findings, in rule order. */
async function scanCode(repoUrl: string, runDir: string, deps: ReviewDeps): Promise<Finding[]> {
  const repoDir = path.join(runDir, "repo");
  await deps.clone(repoUrl, repoDir);
  return [...(await deps.scan(repoDir))].sort(byRule);
}

/** Shown instead of git's own error, which names folders on this machine. */
export const REPO_UNREADABLE =
  "We could not open that GitHub repository. Check the link, and make sure the repository is public or that FixThenShip has access.";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The check result an app finding was made from, so scan findings can be folded in after the checks. */
function resultOf(f: Finding): CheckResult {
  const outcome = f.state === "pass" ? "pass" : f.state === "fail" ? "fail" : "not_checked";
  return { ruleId: f.ruleId, outcome, reason: f.detail, steps: [], screenshots: [] };
}

/**
 * Saves the repository on a run reviewed without code and scans it. Scan findings are merged with
 * the app findings already on the run the same way the first review merges them.
 */
export async function addRepo(runId: string, repoUrl: string, overrides: Partial<ReviewDeps> = {}): Promise<Run> {
  const deps = { ...defaultDeps, ...overrides };
  await loadRun(runId);
  let findings: Finding[];
  try {
    findings = await scanCode(repoUrl, path.join(runsDir(), runId), deps);
  } catch (error) {
    console.error(`addRepo ${runId}: could not read ${repoUrl}: ${errorMessage(error)}`);
    throw new Error(REPO_UNREADABLE);
  }
  // Saved only once the scan works, so a wrong address can be corrected and tried again.
  const run = await loadRun(runId);
  for (const f of run.findings) {
    findings = f.source === "code" ? findings : applyCheckResult(findings, resultOf(f), f.evidence);
  }
  run.repoUrl = repoUrl;
  run.findings = findings.sort(byRule);
  await saveRun(run);
  return run;
}

// On globalThis so a dev hot reload of this module does not forget reviews that are still running.
const reviewing: Set<string> = ((globalThis as { __ftsReviewing?: Set<string> }).__ftsReviewing ??= new Set());

/** True while reviewApp is working on this run in this process. */
export function isReviewActive(runId: string): boolean {
  return reviewing.has(runId);
}

export const REVIEW_INTERRUPTED = "The review was interrupted. Start it again from the first page.";

export async function reviewApp(runId: string, overrides: Partial<ReviewDeps> = {}): Promise<void> {
  reviewing.add(runId);
  try {
    await review(runId, overrides);
  } finally {
    reviewing.delete(runId);
  }
}

/**
 * Starts reading Apple's guidelines page without waiting for it. The answer goes on `run` (so the review's own
 * saves keep it) and into the saved run; a failure or no answer leaves the review as it is.
 */
function noteGuidelines(run: Run, deps: ReviewDeps): void {
  void (async () => {
    try {
      const guidelines = await deps.checkGuidelines();
      run.guidelines = guidelines;
      await updateRun(run.id, (saved) => {
        saved.guidelines = guidelines;
      });
    } catch (error) {
      console.error(`review ${run.id}: could not note the guidelines check: ${errorMessage(error)}`);
    }
  })();
}

async function review(runId: string, overrides: Partial<ReviewDeps>): Promise<void> {
  const deps = { ...defaultDeps, ...overrides };
  let run: Run | undefined;
  try {
    run = await loadRun(runId);
    noteGuidelines(run, deps);
    const runDir = path.join(runsDir(), runId);
    const outDir = path.join(runDir, "checks");

    run.stage = "scanning";
    run.error = "";
    run.checked = {};
    await saveRun(run);

    // Without a repository the review uses the app only. A repository that cannot be opened (private or
    // mistyped) is dropped, so the app is still reviewed and the repository can be added afterwards.
    run.findings = [];
    if (run.repoUrl) {
      try {
        run.findings = await scanCode(run.repoUrl, runDir, deps);
      } catch (error) {
        console.error(`review ${runId}: could not read ${run.repoUrl}: ${errorMessage(error)}`);
        run.repoUrl = "";
      }
    }
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
      // Unguessable address. The default domain is a public inbox, acceptable only for demo apps with no real data;
      // in production set TEST_EMAIL_DOMAIN to a mailbox you control.
      testEmail: `fts.reviewer.${randomBytes(16).toString("hex")}@${process.env.TEST_EMAIL_DOMAIN ?? "mailinator.com"}`,
      onResult: async (result) => {
        const evidence = await checkEvidence(result, runDir, outDir);
        current.findings = applyCheckResult(current.findings, result, evidence).sort(byRule);
        current.checked = { ...current.checked, [result.ruleId]: result.outcome };
        await saveRun(current);
      },
    });

    run.stage = "reviewed";
    await saveRun(run);
  } catch (error) {
    const message = errorMessage(error);
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

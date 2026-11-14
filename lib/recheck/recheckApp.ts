import {
  execFile as nodeExecFile,
  spawn as nodeSpawn,
  type ChildProcess,
  type ExecFileOptions,
  type SpawnOptions,
} from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { BASE_BRANCH } from "../fix/brief";
import { errorMessage } from "../fix/status";
import { REVIEW_RULES } from "../review/pipeline";
import { runChecks, type RunChecksOptions } from "../review/runChecks";
import { scanRepo } from "../scan";
import { loadRun, runsDir, saveRun } from "../store";
import type { CheckResult, Evidence, Finding, RuleId, Run } from "../types";
import { OTHER_REPO_STEP, mergeFixes, type MergeResult } from "./mergeFixes";

const execFileAsync = promisify(nodeExecFile);

export const RECHECK_PORT = 4010;
export const RECHECK_URL = `http://localhost:${RECHECK_PORT}`;
export const START_TIMEOUT_MS = 90_000;
export const AFTER_PREFIX = "After the fix:";

/** R7 and R8 always need the developer, even when the fix works. */
export const NEVER_GREEN: Partial<Record<RuleId, string>> = {
  R7: "Add your Apple developer keys to finish Sign in with Apple",
  R8: "Selling inside the iPhone app needs in-app purchase; the outside checkout is now hidden there",
};

export const INSTALL_ARGS = ["install", "--ignore-scripts", "--no-audit", "--no-fund"];

type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;
type ExecFn = (file: string, args: string[], options: ExecFileOptions) => Promise<unknown>;

export type RecheckDeps = {
  mergeFixes: (runId: string) => Promise<MergeResult>;
  clone: (repoUrl: string, branch: string, dest: string) => Promise<void>;
  /** Runs a command to completion (npm install). */
  execFile: ExecFn;
  spawn: SpawnFn;
  /** process.kill; a negative pid signals the whole process group. */
  kill: (pid: number, signal: NodeJS.Signals) => void;
  /** One request: true when the URL answers with any HTTP response. */
  isUp: (url: string) => Promise<boolean>;
  scan: (repoDir: string) => Promise<Finding[]>;
  runChecks: (appUrl: string, outDir: string, ruleIds: RuleId[], options: RunChecksOptions) => Promise<CheckResult[]>;
  startTimeoutMs: number;
  pollMs: number;
  stopGraceMs: number;
};

async function gitClone(repoUrl: string, branch: string, dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await execFileAsync("git", ["clone", "--depth", "1", "--branch", branch, repoUrl, dest], {
    timeout: 120_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

async function npmInstall(exec: ExecFn, dir: string, env: NodeJS.ProcessEnv): Promise<void> {
  try {
    await exec("npm", INSTALL_ARGS, {
      cwd: dir,
      env,
      timeout: 10 * 60_000,
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    throw new Error(`npm install failed: ${lastLines(stderr) || errorMessage(err)}`);
  }
}

async function isUp(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
    return true;
  } catch {
    return false;
  }
}

const defaultDeps: RecheckDeps = {
  mergeFixes: (runId) => mergeFixes(runId),
  clone: gitClone,
  execFile: (file, args, options) => execFileAsync(file, args, options),
  spawn: nodeSpawn as SpawnFn,
  kill: (pid, signal) => process.kill(pid, signal),
  isUp,
  scan: scanRepo,
  runChecks,
  startTimeoutMs: START_TIMEOUT_MS,
  pollMs: 1_000,
  stopGraceMs: 5_000,
};

function lastLines(output: string, n = 3): string {
  return output
    .split("\n")
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
    .filter(Boolean)
    .slice(-n)
    .join(" ")
    .slice(0, 500);
}

const ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];
const PUBLIC_NAME = /^(VITE_|NEXT_PUBLIC_)[A-Za-z0-9_]*$/;

/** Reads KEY=value lines of a .env file; quotes are removed and unquoted trailing comments dropped. */
export function parseDotenv(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue;
    const raw = m[2].trim();
    const quoted = raw.match(/^(['"`])(.*?)\1(?:\s+#.*)?$/);
    vars[m[1]] = quoted ? quoted[2] : raw.replace(/\s+#.*$/, "");
  }
  return vars;
}

async function readRegularFile(file: string): Promise<string> {
  try {
    // A symlinked .env could point anywhere on this machine.
    if (!(await lstat(file)).isFile()) return "";
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

/**
 * The only environment the reviewed app's code gets: PATH, a fresh HOME, PORT, NODE_ENV and the public
 * VITE_ / NEXT_PUBLIC_ variables from the repository's own .env files. Nothing from this process's
 * environment (DEVIN_API_KEY, GITHUB_TOKEN, the model key) is passed through.
 */
export async function appEnv(repoDir: string, home: string): Promise<NodeJS.ProcessEnv> {
  const publicVars: Record<string, string> = {};
  for (const file of ENV_FILES) {
    const vars = parseDotenv(await readRegularFile(path.join(repoDir, file)));
    for (const [key, value] of Object.entries(vars)) if (PUBLIC_NAME.test(key)) publicVars[key] = value;
  }
  return {
    ...publicVars,
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: home,
    PORT: String(RECHECK_PORT),
    NODE_ENV: "development",
  };
}

type StartedApp = { children: ChildProcess[] };

function exited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts `npm run dev -- --port 4010`; if that exits before answering, starts `npm run dev` with PORT=4010.
 * Every started child is recorded in `app` so stopApp can kill it, also when this throws.
 */
async function startApp(dir: string, env: NodeJS.ProcessEnv, deps: RecheckDeps, app: StartedApp): Promise<void> {
  if (await deps.isUp(RECHECK_URL)) throw new Error(`Something else is already answering on port ${RECHECK_PORT}`);

  const deadline = Date.now() + deps.startTimeoutMs;
  const attempts = [
    ["run", "dev", "--", "--port", String(RECHECK_PORT)],
    ["run", "dev"],
  ];
  let reason = "";
  for (const args of attempts) {
    let output = "";
    let spawnError = "";
    const child = deps.spawn("npm", args, { cwd: dir, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    app.children.push(child);
    const append = (chunk: Buffer | string) => {
      output = (output + chunk.toString()).slice(-20_000);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (err) => {
      spawnError = err.message;
    });

    while (Date.now() < deadline) {
      if (await deps.isUp(RECHECK_URL)) return;
      if (spawnError || exited(child)) break;
      await sleep(Math.min(deps.pollMs, Math.max(0, deadline - Date.now())));
    }
    if (!spawnError && !exited(child)) {
      throw new Error(`${RECHECK_URL} did not answer within ${Math.round(deps.startTimeoutMs / 1000)} seconds`);
    }
    reason = spawnError || `npm ${args.join(" ")} exited with code ${child.exitCode ?? child.signalCode}: ${lastLines(output) || "no output"}`;
    await stopChild(child, deps);
  }
  throw new Error(reason);
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals, deps: RecheckDeps): void {
  if (!child.pid) return;
  try {
    deps.kill(-child.pid, signal);
  } catch {
    // The group is already gone.
  }
}

/** SIGTERM to the whole process group, then SIGKILL to whatever is left (npm's children can outlive npm). */
async function stopChild(child: ChildProcess, deps: RecheckDeps): Promise<void> {
  signalGroup(child, "SIGTERM", deps);
  if (!exited(child)) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, deps.stopGraceMs);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  signalGroup(child, "SIGKILL", deps);
}

async function stopApp(app: StartedApp, deps: RecheckDeps): Promise<void> {
  for (const child of app.children) await stopChild(child, deps);
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** The re-check's screenshot and trace, with paths relative to the run folder. */
async function afterEvidence(result: CheckResult, runDir: string, outDir: string): Promise<Evidence[]> {
  const evidence: Evidence[] = [];
  const shot = result.screenshots.find((s) => s.endsWith("-failure.png")) ?? result.screenshots.at(-1);
  if (shot) {
    evidence.push({
      kind: "screenshot",
      path: path.relative(runDir, shot),
      caption: `${AFTER_PREFIX} screen at the end of the ${result.ruleId} check`,
    });
  }
  const trace = path.join(outDir, result.ruleId, "trace.md");
  if (await exists(trace)) {
    evidence.push({
      kind: "log",
      path: path.relative(runDir, trace),
      caption: `${AFTER_PREFIX} steps of the ${result.ruleId} check (${result.outcome}): ${result.reason}`,
    });
  }
  return evidence;
}

function scanFinds(scan: Finding[], ruleId: RuleId): boolean {
  return scan.some((f) => f.ruleId === ruleId && (f.state === "fail" || f.state === "risk"));
}

type Outcome = { scan: Finding[]; checks: CheckResult[]; evidence: Map<RuleId, Evidence[]> };

/**
 * The final state of one finding that failed the first review. A rule with an app check needs that check to pass;
 * a finding the code scan made needs the scan to no longer find it. A finding neither could look at stays red.
 */
export function finalFor(finding: Finding, outcome: Outcome): Pick<Finding, "finalState" | "humanStep"> {
  const check = outcome.checks.find((c) => c.ruleId === finding.ruleId);
  const hasCheck = REVIEW_RULES.includes(finding.ruleId);
  const looked = hasCheck || finding.source !== "app";
  const passes =
    looked && (!hasCheck || check?.outcome === "pass") && !scanFinds(outcome.scan, finding.ruleId);
  if (!passes) return { finalState: "red", humanStep: finding.humanStep };
  const step = NEVER_GREEN[finding.ruleId];
  return step ? { finalState: "amber", humanStep: step } : { finalState: "green", humanStep: "" };
}

function isUnfixedFailure(f: Finding): boolean {
  return f.state === "fail" && f.finalState !== "amber";
}

function applyOutcome(run: Run, outcome: Outcome): void {
  run.findings = run.findings.map((f) => {
    if (f.state !== "fail") return f;
    const extra = outcome.evidence.get(f.ruleId) ?? [];
    const evidence = [...f.evidence.filter((e) => !e.caption.startsWith(AFTER_PREFIX)), ...extra];
    if (f.finalState === "amber") return { ...f, evidence };
    return { ...f, evidence, ...finalFor(f, outcome) };
  });
}

function markAllRed(run: Run, message: string): void {
  run.findings = run.findings.map((f) =>
    isUnfixedFailure(f) ? { ...f, finalState: "red", detail: `${f.detail} ${message}` } : f,
  );
}

const START_FAILED = "The fixed app could not be started for the re-check:";
const NOT_FINISHED = "The re-check could not finish:";
const RECHECK_STEP = /^Merge this pull request by hand: /;

/** Clears what an earlier re-check wrote, so running it again starts from the first review. */
function resetRecheck(run: Run): void {
  run.findings = run.findings.map((f) => {
    if (f.state !== "fail") return f;
    const ours =
      RECHECK_STEP.test(f.humanStep) ||
      f.humanStep === OTHER_REPO_STEP ||
      Object.values(NEVER_GREEN).includes(f.humanStep);
    let detail = f.detail;
    for (const marker of [START_FAILED, NOT_FINISHED]) {
      const at = detail.indexOf(` ${marker}`);
      if (at >= 0) detail = detail.slice(0, at);
    }
    return { ...f, detail, finalState: "", humanStep: ours ? "" : f.humanStep };
  });
}

class StartError extends Error {}

let portLock: Promise<unknown> = Promise.resolve();

/** Runs `task` once no other re-check holds port 4010. */
function withPort<T>(task: () => Promise<T>): Promise<T> {
  const next = portLock.then(task, task);
  portLock = next.catch(() => {});
  return next;
}

/**
 * Merges the fixes into store-ready, runs the fixed app locally on port 4010 and sets every
 * first-review failure's finalState. Never throws; the stage always ends "done".
 *
 * This installs and runs the reviewed repository's code on this machine with a stripped environment.
 * That is not a sandbox: it is meant for apps you own. In production run it inside an isolated
 * container or microVM with no host secrets.
 */
export async function recheckApp(runId: string, overrides: Partial<RecheckDeps> = {}): Promise<void> {
  const deps = { ...defaultDeps, ...overrides };
  const runDir = path.join(runsDir(), runId);
  const outDir = path.join(runDir, "recheck");
  const repoDir = path.join(runDir, "recheck-repo");

  try {
    const run = await loadRun(runId);
    run.stage = "rechecking";
    run.error = "";
    resetRecheck(run);
    await saveRun(run);
  } catch (err) {
    console.error(`recheck ${runId}: ${errorMessage(err)}`);
    return;
  }

  let outcome: Outcome | null = null;
  let failure = "";
  try {
    await deps.mergeFixes(runId);
    outcome = await withPort(async () => {
      const app: StartedApp = { children: [] };
      let home = "";
      try {
        const run = await loadRun(runId);
        try {
          await deps.clone(run.repoUrl, BASE_BRANCH, repoDir);
          home = await mkdtemp(path.join(os.tmpdir(), "fts-recheck-home-"));
          const env = await appEnv(repoDir, home);
          await npmInstall(deps.execFile, repoDir, env);
          await startApp(repoDir, env, deps, app);
        } catch (err) {
          throw new StartError(errorMessage(err));
        }
        const scan = await deps.scan(repoDir);
        const checks = await deps.runChecks(RECHECK_URL, outDir, REVIEW_RULES, {
          testEmail: `fts.reviewer.${randomBytes(16).toString("hex")}@${process.env.TEST_EMAIL_DOMAIN ?? "mailinator.com"}`,
        });
        const evidence = new Map<RuleId, Evidence[]>();
        for (const check of checks) evidence.set(check.ruleId, await afterEvidence(check, runDir, outDir));
        return { scan, checks, evidence };
      } finally {
        await stopApp(app, deps);
        if (home) await rm(home, { recursive: true, force: true }).catch(() => {});
      }
    });
  } catch (err) {
    failure =
      err instanceof StartError
        ? `${START_FAILED} ${err.message}`
        : `${NOT_FINISHED} ${errorMessage(err)}`;
    console.error(`recheck ${runId}: ${failure}`);
  }

  try {
    const latest = await loadRun(runId);
    if (outcome) applyOutcome(latest, outcome);
    else markAllRed(latest, failure);
    latest.stage = "done";
    await saveRun(latest);
  } catch (err) {
    console.error(`recheck ${runId}: could not save the result: ${errorMessage(err)}`);
  }
}

const active = new Map<string, Promise<void>>();

export function isRecheckActive(runId: string): boolean {
  return active.has(runId);
}

/** Starts recheckApp in the background; a second call for the same run joins the first. */
export function startRecheck(runId: string): Promise<void> {
  const running = active.get(runId);
  if (running) return running;
  const task = recheckApp(runId).finally(() => active.delete(runId));
  active.set(runId, task);
  return task;
}

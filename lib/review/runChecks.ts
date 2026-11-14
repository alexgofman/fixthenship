import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckOutcome, CheckResult, RuleId } from "../types";
import { pickModel } from "./pickModel";
import { parseSteps, traceReason } from "./trace";

export const CHECK_TIMEOUT_MS = 120_000;
export const NOT_CHECKED_FILE = "not_checked.txt";
/** Reasons that come from our own tools having a bad moment, not from the app. */
const RETRY_WORTHWHILE = /timeout|timed out|ran out of time|did not finish|could not tell|not clear|could not run|ENGINE_FAILURE|^MODEL_/i;
/** e2e's reasons for a model that did not answer usefully, e.g. MODEL_OUTPUT_INVALID, MODEL_REFUSED, MODEL_RATE_LIMITED. */
const MODEL_FAILURE = /^MODEL_[A-Z_]*\b/;
/** e2e's reasons for a check that ran out of time or steps, or could not use the screen (e.g. a covered button). */
const NO_RESULT = /^(?:TEST_TIMEOUT|STEP_TIMEOUT|STEP_BUDGET_EXHAUSTED|AUTOMATION_UNSUPPORTED|ACTION_FAILED)\b/;
export const NO_RESULT_REASON = "The check ran out of time or could not use the screen before it reached a result.";
export const MODEL_REASON = "The check could not run because the AI model did not answer usefully.";

type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export type RunChecksOptions = {
  testEmail?: string;
  testPassword?: string;
  timeoutMs?: number;
  /** Project root that holds e2e.config.ts and checks/. */
  cwd?: string;
  spawn?: SpawnFn;
  /** Called after each check, in order. */
  onResult?: (result: CheckResult) => void | Promise<void>;
  /** Chooses the model the checks' agent uses; by default the first of MODEL and MODEL_FALLBACKS that answers. */
  pickModel?: () => Promise<string | undefined>;
};

type Exit = { code: number | null; timedOut: boolean; error?: string; output: string };

function generatePassword(): string {
  return `Ft-${randomBytes(9).toString("base64url")}-7a`;
}

function runProcess(spawn: SpawnFn, args: string[], options: SpawnOptions, timeoutMs: number): Promise<Exit> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    let settled = false;
    let child: ChildProcess;
    const finish = (exit: Omit<Exit, "output" | "timedOut">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...exit, timedOut, output });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
      // A process that ignores the kill still ends the check.
      setTimeout(() => finish({ code: null }), 5_000).unref();
    }, timeoutMs);
    try {
      child = spawn("npx", args, options);
    } catch (error) {
      finish({ code: null, error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const append = (chunk: Buffer | string) => {
      output = (output + chunk.toString()).slice(-200_000);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error) => finish({ code: null, error: error.message }));
    child.on("close", (code) => finish({ code }));
  });
}

function killTree(child: ChildProcess | undefined): void {
  if (!child) return;
  try {
    if (child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** Copies trace.md and every attempt-N/screenshots/*.png, keeping the trace's relative links. */
async function copyEvidence(resultsDir: string, dest: string): Promise<{ trace: string | null; screenshots: string[] }> {
  let testDirs: string[] = [];
  try {
    testDirs = (await readdir(resultsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return { trace: null, screenshots: [] };
  }
  const testDir = testDirs[0];
  if (!testDir) return { trace: null, screenshots: [] };
  const src = path.join(resultsDir, testDir);

  const trace = await readIfExists(path.join(src, "trace.md"));
  if (trace !== null) await writeFile(path.join(dest, "trace.md"), trace, "utf8");

  const screenshots: string[] = [];
  for (const attempt of (await readdir(src)).filter((n) => /^attempt-\d+$/.test(n)).sort()) {
    const shotsDir = path.join(src, attempt, "screenshots");
    let files: string[] = [];
    try {
      files = (await readdir(shotsDir)).filter((f) => f.endsWith(".png")).sort();
    } catch {
      continue;
    }
    for (const file of files) {
      const target = path.join(dest, attempt, "screenshots", file);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(shotsDir, file), target);
      screenshots.push(target);
    }
  }
  return { trace, screenshots };
}

function lastLine(output: string): string {
  return (
    output
      .split("\n")
      .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
      .filter(Boolean)
      .at(-1) ?? ""
  );
}

async function runOne(
  ruleId: RuleId,
  appUrl: string,
  outDir: string,
  env: { email: string; password: string },
  opts: Required<Pick<RunChecksOptions, "timeoutMs" | "cwd" | "spawn">> & { model?: string },
  attempt = 1,
): Promise<CheckResult> {
  const dest = path.resolve(outDir, ruleId);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  // Each check gets its own e2e output folder so parallel reviews never share results/.
  const e2eOut = path.join(opts.cwd, "runs", ".e2e", `${ruleId}-${randomUUID()}`);

  const exit = await runProcess(
    opts.spawn,
    ["e2e", "run", `checks/${ruleId}.e2e.ts`, "--trace", "--output", e2eOut],
    {
      cwd: opts.cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        APP_URL: appUrl,
        // One account per check and per attempt: a later one must not find an earlier account already registered.
        TEST_EMAIL: env.email.replace("@", `.${ruleId.toLowerCase()}${attempt > 1 ? `.${attempt}` : ""}@`),
        TEST_PASSWORD: env.password,
        CHECK_OUT_DIR: dest,
        ...(opts.model ? { MODEL: opts.model } : {}),
      },
    },
    opts.timeoutMs,
  );

  await writeFile(path.join(dest, "e2e.log"), exit.output, "utf8").catch(() => {});
  const { trace, screenshots } = await copyEvidence(path.join(e2eOut, "results"), dest);
  await rm(e2eOut, { recursive: true, force: true }).catch(() => {});
  const marker = (await readIfExists(path.join(dest, NOT_CHECKED_FILE)))?.trim();

  let outcome: CheckOutcome;
  let reason: string;
  if (marker) {
    outcome = "not_checked";
    reason = marker;
  } else if (exit.timedOut) {
    outcome = "not_checked";
    reason = `The check did not finish within ${Math.round(opts.timeoutMs / 1000)} seconds.`;
  } else if (exit.code === 0 || exit.code === 1) {
    outcome = exit.code === 0 ? "pass" : "fail";
    reason = trace ? traceReason(trace, exit.code === 0) : outcome === "pass" ? "The check passed." : "The check failed.";
    // "Could not tell" and "ran out of time" are not findings against the app.
    if (outcome === "fail" && /^ASSERTION_INCONCLUSIVE\b/.test(reason)) {
      outcome = "not_checked";
      reason = `The check could not tell: ${reason.replace(/^ASSERTION_INCONCLUSIVE:\s*/, "")}`;
    } else if (outcome === "fail" && NO_RESULT.test(reason)) {
      outcome = "not_checked";
      reason = NO_RESULT_REASON;
    } else if (outcome === "fail" && MODEL_FAILURE.test(reason)) {
      outcome = "not_checked";
      reason = MODEL_REASON;
    }
  } else {
    outcome = "not_checked";
    const detail = trace ? traceReason(trace, false) : exit.error ?? lastLine(exit.output);
    reason = MODEL_FAILURE.test(detail)
      ? MODEL_REASON
      : `The check could not run (e2e exit ${exit.code ?? "none"}): ${detail || "no output"}`;
  }

  return { ruleId, outcome, reason, steps: trace ? parseSteps(trace) : [], screenshots };
}

/** Runs each rule's checks/<id>.e2e.ts one at a time and copies its evidence to <outDir>/<id>/. */
export async function runChecks(
  appUrl: string,
  outDir: string,
  ruleIds: RuleId[],
  options: RunChecksOptions = {},
): Promise<CheckResult[]> {
  const env = {
    email: options.testEmail ?? process.env.TEST_EMAIL ?? `fts.reviewer.${randomUUID().replace(/-/g, "")}@${process.env.TEST_EMAIL_DOMAIN ?? "mailinator.com"}`,
    password: options.testPassword ?? process.env.TEST_PASSWORD ?? generatePassword(),
  };
  const opts = {
    timeoutMs: options.timeoutMs ?? CHECK_TIMEOUT_MS,
    cwd: options.cwd ?? process.cwd(),
    spawn: options.spawn ?? (nodeSpawn as SpawnFn),
    // One small question before the checks start: a model over its daily limit would fail all ten.
    model: await (options.pickModel ?? pickModel)().catch(() => undefined),
  };

  const results: CheckResult[] = [];
  for (const ruleId of ruleIds) {
    let result: CheckResult;
    try {
      result = await runOne(ruleId, appUrl, outDir, env, opts);
      // A slow model answer or a page caught mid-load says nothing about the app: try once more.
      if (result.outcome === "not_checked" && RETRY_WORTHWHILE.test(result.reason)) {
        result = await runOne(ruleId, appUrl, outDir, env, opts, 2);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = { ruleId, outcome: "not_checked", reason: `The check crashed: ${message}`, steps: [], screenshots: [] };
    }
    results.push(result);
    await options.onResult?.(result);
  }
  return results;
}

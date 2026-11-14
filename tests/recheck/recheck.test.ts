import type { ChildProcess, ExecFileOptions, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mergeFixes } from "../../lib/recheck/mergeFixes";
import { INSTALL_ARGS, RECHECK_URL, recheckApp, type RecheckDeps } from "../../lib/recheck/recheckApp";
import { REVIEW_RULES } from "../../lib/review/pipeline";
import { loadRun, saveRun } from "../../lib/store";
import type { CheckResult, Finding, FixSession, RuleId, Run } from "../../lib/types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-recheck-"));
  process.env.RUNS_DIR = dir;
  process.env.GITHUB_TOKEN = "ghp_test";
  // No real Devin session is ever messaged from these tests.
  vi.stubEnv("DEVIN_API_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  delete process.env.RUNS_DIR;
  delete process.env.GITHUB_TOKEN;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

function finding(ruleId: RuleId, state: Finding["state"] = "fail", source: Finding["source"] = "both"): Finding {
  return {
    ruleId,
    guideline: "x",
    title: `Title ${ruleId}`,
    detail: `Detail ${ruleId}.`,
    source,
    evidence: [{ kind: "code", file: "src/App.tsx", line: 3, caption: `Caption ${ruleId}` }],
    confidence: "high",
    state,
    fixable: "yes",
    finalState: "",
    humanStep: "",
  };
}

function fix(ruleId: RuleId, number: number, status: FixSession["status"] = "finished"): FixSession {
  return {
    ruleId,
    sessionId: `devin-${number}`,
    url: `https://app.devin.ai/sessions/${number}`,
    status,
    prUrl: `https://github.com/acme/app/pull/${number}`,
    summary: "",
    acus: 1,
  };
}

async function makeRun(findings: Finding[], fixes: FixSession[] = []): Promise<Run> {
  const run: Run = {
    id: "run1",
    createdAt: new Date().toISOString(),
    repoUrl: "https://github.com/acme/app",
    appUrl: "https://app.acme.dev",
    stage: "fixed",
    findings,
    fixes,
    error: "",
  };
  await saveRun(run);
  return run;
}

type Call = { method: string; url: string; body: unknown; auth: string };

/** Fake GitHub: every PR is open against store-ready-run1; PRs in `conflicts` are refused with 405. */
function fakeGitHub(conflicts: number[] = []): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fake = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers.Authorization });
    const n = Number(url.match(/\/pulls\/(\d+)/)?.[1]);
    if (method === "GET") {
      return json({ state: "open", merged: false, base: { ref: "store-ready-run1" }, head: { sha: `sha${n}`, repo: { full_name: "acme/app" } } });
    }
    if (conflicts.includes(n)) return json({ message: "Pull Request is not mergeable" }, 405);
    return json({ merged: true, sha: "abc" });
  };
  return { fetch: fake as typeof fetch, calls };
}

/** mergeFixes waits between merge retries; these tests do not. */
const noWait = async () => {};

type FakeChild = ChildProcess & { finish: (code: number) => void };

function fakeChild(pid: number): FakeChild {
  const child = new EventEmitter() as FakeChild;
  Object.assign(child, { pid, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough() });
  child.finish = (code) => {
    if (child.exitCode !== null) return;
    (child as { exitCode: number | null }).exitCode = code;
    child.emit("exit", code, null);
  };
  return child;
}

type Harness = {
  deps: Partial<RecheckDeps>;
  spawned: { args: string[]; options: SpawnOptions; child: FakeChild }[];
  installs: { file: string; args: string[]; options: ExecFileOptions }[];
  kills: [number, string][];
};

/** Fake child processes: the app answers once spawned and dies on SIGTERM. `crashOnStart` makes npm exit at once. */
function harness({ crashOnStart = false } = {}): Harness {
  const spawned: Harness["spawned"] = [];
  const installs: Harness["installs"] = [];
  const kills: [number, string][] = [];
  let up = false;
  const deps: Partial<RecheckDeps> = {
    mergeFixes: async () => ({ merged: [], skipped: [] }),
    clone: async (_url, _branch, dest) => {
      await mkdir(dest, { recursive: true });
    },
    execFile: async (file, args, options) => {
      installs.push({ file, args, options });
    },
    spawn: (_cmd, args, options) => {
      const child = fakeChild(1000 + spawned.length);
      spawned.push({ args, options, child });
      if (crashOnStart) {
        queueMicrotask(() => {
          child.stderr?.emit("data", "error: unknown option '--port'\n");
          child.finish(1);
        });
      } else up = true;
      return child;
    },
    kill: (pid, signal) => {
      kills.push([pid, signal]);
      const target = spawned.find((s) => s.child.pid === -pid);
      if (signal === "SIGTERM" && target) {
        up = false;
        target.child.finish(0);
      }
    },
    isUp: async () => up,
    scan: async () => [],
    pollMs: 1,
    stopGraceMs: 10,
    startTimeoutMs: 2_000,
  };
  return { deps, spawned, installs, kills };
}

/** Fake checks: every review rule gets `outcomes[rule] ?? "pass"`, with a screenshot and trace on disk. */
function checksWith(outcomes: Partial<Record<RuleId, CheckResult["outcome"]>> = {}): RecheckDeps["runChecks"] {
  return async (appUrl, outDir, ruleIds) => {
    expect(appUrl).toBe(RECHECK_URL);
    expect(outDir).toBe(path.join(dir, "run1", "recheck"));
    expect(ruleIds).toEqual(REVIEW_RULES);
    const results: CheckResult[] = [];
    for (const ruleId of ruleIds) {
      const shot = path.join(outDir, ruleId, "attempt-1", "screenshots", "001.png");
      await mkdir(path.dirname(shot), { recursive: true });
      await writeFile(shot, "png");
      await writeFile(path.join(outDir, ruleId, "trace.md"), "# Trace");
      results.push({ ruleId, outcome: outcomes[ruleId] ?? "pass", reason: `${ruleId} reason.`, steps: [], screenshots: [shot] });
    }
    return results;
  };
}

/** A mergeFixes that reports `merged` as merged, without GitHub. */
function mergedOnly(...merged: RuleId[]): RecheckDeps["mergeFixes"] {
  return async () => ({ merged, skipped: [] });
}

function byRule(run: Run): Record<string, Finding> {
  return Object.fromEntries(run.findings.map((f) => [f.ruleId, f]));
}

describe("mergeFixes", () => {
  it("merges delivered pull requests one at a time and leaves refused ones amber with the link", async () => {
    await makeRun(
      [finding("R2"), finding("R5"), finding("R6")],
      [fix("R2", 11), fix("R5", 12), fix("R6", 13, "error"), { ...fix("R6", 14), prUrl: "" }],
    );
    const gh = fakeGitHub([12]);

    const result = await mergeFixes("run1", { fetch: gh.fetch, sleep: noWait });

    // R6's session ended in error after opening its pull request: still a fix to merge.
    expect(result).toEqual({ merged: ["R2", "R6"], skipped: ["R5"] });
    expect(gh.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://api.github.com/repos/acme/app/pulls/11",
      "PUT https://api.github.com/repos/acme/app/pulls/11/merge",
      // Refused with 405: read again and retried twice.
      ...Array(3).fill(["GET https://api.github.com/repos/acme/app/pulls/12", "PUT https://api.github.com/repos/acme/app/pulls/12/merge"]).flat(),
      "GET https://api.github.com/repos/acme/app/pulls/13",
      "PUT https://api.github.com/repos/acme/app/pulls/13/merge",
    ]);
    expect(gh.calls[1].body).toMatchObject({ merge_method: "merge", sha: "sha11" });
    expect(gh.calls.every((c) => c.auth === "Bearer ghp_test")).toBe(true);
    const saved = byRule(await loadRun("run1"));
    expect(saved.R5).toMatchObject({
      finalState: "amber",
      humanStep: "Merge this pull request by hand: https://github.com/acme/app/pull/12",
    });
    expect(saved.R2.finalState).toBe("");
  });
});

describe("mergeFixes binds pull requests to the run's repository", () => {
  const notInRepo = "This pull request is not in the app's repository; it was not merged";

  it("never requests or merges a pull request from another repository", async () => {
    await makeRun(
      [finding("R2"), finding("R5")],
      [
        { ...fix("R2", 41), prUrl: "https://github.com/evil/app/pull/41" },
        { ...fix("R5", 42), prUrl: "https://github.com/ACME/App/pull/42/" },
      ],
    );
    const gh = fakeGitHub();

    const result = await mergeFixes("run1", { fetch: gh.fetch, sleep: noWait });

    expect(result).toEqual({ merged: ["R5"], skipped: ["R2"] });
    expect(gh.calls.some((c) => c.url.includes("/41") || c.url.includes("/evil/"))).toBe(false);
    expect(gh.calls.map((c) => c.method)).toEqual(["GET", "PUT"]);
    expect(byRule(await loadRun("run1")).R2).toMatchObject({ finalState: "amber", humanStep: notInRepo });
  });

  it("rejects links on another host or with a different path", async () => {
    const links = [
      "https://github.com.evil.dev/acme/app/pull/51",
      "https://evil.dev/github.com/acme/app/pull/52",
      "http://github.com/acme/app/pull/53",
      "https://github.com/acme/app/pull/54/files",
      "https://github.com/acme/app/pulls/55",
      "not a url",
    ];
    const rules: RuleId[] = ["R1", "R2", "R5", "R6", "R9", "R10"];
    await makeRun(
      rules.map((r) => finding(r)),
      rules.map((r, i) => ({ ...fix(r, 50 + i), prUrl: links[i] })),
    );
    const gh = fakeGitHub();

    const result = await mergeFixes("run1", { fetch: gh.fetch, sleep: noWait });

    expect(result).toEqual({ merged: [], skipped: rules });
    expect(gh.calls).toEqual([]);
    const saved = await loadRun("run1");
    expect(saved.findings.every((f) => f.finalState === "amber" && f.humanStep === notInRepo)).toBe(true);
  });
});

describe("recheckApp", () => {
  it("marks a finding green when the check now passes and the scan no longer finds it", async () => {
    await makeRun([finding("R5"), finding("R1", "pass", "app")]);
    const h = harness();

    await recheckApp("run1", { ...h.deps, mergeFixes: mergedOnly("R5"), runChecks: checksWith() });

    const saved = await loadRun("run1");
    expect(saved.stage).toBe("done");
    const r5 = byRule(saved).R5;
    expect(r5.finalState).toBe("green");
    expect(r5.evidence.slice(1)).toEqual([
      { kind: "screenshot", path: "recheck/R5/attempt-1/screenshots/001.png", caption: "After the fix: screen at the end of the R5 check" },
      { kind: "log", path: "recheck/R5/trace.md", caption: "After the fix: steps of the R5 check (pass): R5 reason." },
    ]);
    expect(byRule(saved).R1.finalState).toBe("");
    expect(h.spawned[0].args).toEqual(["run", "dev", "--", "--port", "4010"]);
    expect(h.spawned[0].options).toMatchObject({ detached: true, cwd: path.join(dir, "run1", "recheck-repo") });
    expect(h.spawned[0].options.env?.GITHUB_TOKEN).toBeUndefined();
    expect(h.kills).toContainEqual([-1000, "SIGTERM"]);
  });

  it("keeps R7 and R8 amber with the human step even when they pass", async () => {
    await makeRun([finding("R7"), finding("R8")]);
    const h = harness();

    await recheckApp("run1", { ...h.deps, mergeFixes: mergedOnly("R7", "R8"), runChecks: checksWith() });

    const saved = byRule(await loadRun("run1"));
    expect(saved.R7).toMatchObject({ finalState: "amber", humanStep: "Add your Apple developer keys to finish Sign in with Apple" });
    expect(saved.R8).toMatchObject({
      finalState: "amber",
      humanStep: "Selling inside the iPhone app needs in-app purchase; the outside checkout is now hidden there",
    });
  });

  it("ends amber with the link when the merge is refused", async () => {
    await makeRun([finding("R2"), finding("R6")], [fix("R2", 21), fix("R6", 22)]);
    const h = harness();
    const gh = fakeGitHub([22]);

    await recheckApp("run1", {
      ...h.deps,
      mergeFixes: (runId) => mergeFixes(runId, { fetch: gh.fetch, sleep: noWait }),
      runChecks: checksWith({ R6: "fail" }),
    });

    const saved = await loadRun("run1");
    expect(saved.stage).toBe("done");
    expect(byRule(saved).R2.finalState).toBe("green");
    expect(byRule(saved).R6).toMatchObject({
      finalState: "amber",
      humanStep: "Merge this pull request by hand: https://github.com/acme/app/pull/22",
    });
  });

  it("ends red when the check still fails, the scan still finds it, or nothing checked it", async () => {
    await makeRun([finding("R2"), finding("R5"), finding("R13", "fail", "app")]);
    const h = harness();

    await recheckApp("run1", {
      ...h.deps,
      mergeFixes: mergedOnly("R2", "R5", "R13"),
      scan: async () => [finding("R5", "fail", "code")],
      runChecks: checksWith({ R2: "fail" }),
    });

    const saved = byRule(await loadRun("run1"));
    expect(saved.R2.finalState).toBe("red");
    expect(saved.R2.detail).toBe("Detail R2.");
    expect(saved.R2.evidence.at(-1)?.caption).toBe("After the fix: steps of the R2 check (fail): R2 reason.");
    expect(saved.R5.finalState).toBe("red");
    expect(saved.R13.finalState).toBe("red");
  });

  it("is never green when no fix was merged for the finding, even if the check passes", async () => {
    await makeRun(
      [finding("R2"), finding("R5"), finding("R6"), finding("R7"), finding("R9")],
      [{ ...fix("R2", 61, "error"), prUrl: "" }, { ...fix("R5", 62), prUrl: "" }, fix("R9", 63)],
    );
    const h = harness();

    await recheckApp("run1", {
      ...h.deps,
      mergeFixes: (runId) => mergeFixes(runId, { fetch: fakeGitHub().fetch, sleep: noWait }),
      runChecks: checksWith({ R6: "not_checked" }),
    });

    const saved = byRule(await loadRun("run1"));
    const notMerged = "No fix was merged for this finding, so it is not counted as fixed.";
    // R2: the session failed before a pull request. R5: no pull request. R6 and R7: no fix session at all. R7 is never green, but not amber either.
    for (const rule of ["R2", "R5", "R6", "R7"]) {
      expect(saved[rule]).toMatchObject({ finalState: "red", detail: `Detail ${rule}. ${notMerged}` });
    }
    expect(saved.R9).toMatchObject({ finalState: "green", detail: "Detail R9." });
  });

  it("ends amber, never red or green, when the re-check could not check a merged fix", async () => {
    await makeRun([finding("R6"), finding("R7")]);
    const h = harness();
    const runChecks = checksWith({ R6: "not_checked", R7: "not_checked" });

    await recheckApp("run1", {
      ...h.deps,
      mergeFixes: mergedOnly("R6", "R7"),
      runChecks: async (...args) =>
        (await runChecks(...args)).map((c) =>
          c.ruleId === "R6" ? { ...c, reason: "The check could not run because the AI model did not answer usefully." } : c,
        ),
    });

    const saved = byRule(await loadRun("run1"));
    expect(saved.R6).toMatchObject({
      finalState: "amber",
      detail: "Detail R6.",
      humanStep: "We could not re-check this: the check could not run because the AI model did not answer usefully. Press Check again.",
    });
    expect(saved.R7).toMatchObject({
      finalState: "amber",
      humanStep: "We could not re-check this: R7 reason. Press Check again.",
    });
  });

  it("marks a first-review pass red when the fixes broke it, and leaves other passes as they were", async () => {
    await makeRun([finding("R2"), finding("R1", "pass", "app"), finding("R3", "pass"), finding("R5", "pass")]);
    const h = harness();

    await recheckApp("run1", {
      ...h.deps,
      mergeFixes: mergedOnly("R2"),
      runChecks: checksWith({ R1: "fail", R5: "not_checked" }),
    });

    const saved = byRule(await loadRun("run1"));
    expect(saved.R2.finalState).toBe("green");
    expect(saved.R1).toMatchObject({
      state: "pass",
      finalState: "red",
      detail: "Detail R1. This passed before the fixes and fails after them: R1 reason.",
    });
    expect(saved.R1.evidence.at(-1)?.caption).toBe("After the fix: steps of the R1 check (fail): R1 reason.");
    expect(saved.R3).toEqual(finding("R3", "pass"));
    expect(saved.R5).toEqual(finding("R5", "pass"));
  });

  it("starts a second re-check from the first review", async () => {
    await makeRun([finding("R2"), finding("R6"), finding("R1", "pass", "app")]);
    const h = harness();

    await recheckApp("run1", { ...h.deps, mergeFixes: mergedOnly("R6"), runChecks: checksWith({ R1: "fail", R6: "not_checked" }) });
    let saved = byRule(await loadRun("run1"));
    expect(saved.R2.finalState).toBe("red");
    expect(saved.R6.finalState).toBe("amber");
    expect(saved.R1.finalState).toBe("red");

    await recheckApp("run1", { ...h.deps, mergeFixes: mergedOnly("R2", "R6"), runChecks: checksWith() });
    saved = byRule(await loadRun("run1"));
    expect(saved.R2).toMatchObject({ finalState: "green", detail: "Detail R2." });
    expect(saved.R6).toMatchObject({ finalState: "green", humanStep: "" });
    expect(saved.R1).toEqual(finding("R1", "pass", "app"));
  });

  it("stops the app even when the checks throw", async () => {
    await makeRun([finding("R2")]);
    const h = harness();

    await recheckApp("run1", {
      ...h.deps,
      mergeFixes: mergedOnly("R2"),
      runChecks: async () => {
        throw new Error("browser crashed");
      },
    });

    expect(h.kills).toEqual([
      [-1000, "SIGTERM"],
      [-1000, "SIGKILL"],
    ]);
    const saved = await loadRun("run1");
    expect(saved.stage).toBe("done");
    expect(byRule(saved).R2).toMatchObject({
      finalState: "amber",
      detail: "Detail R2.",
      humanStep: "We could not re-check this: browser crashed. Press Check again.",
    });
  });

  it("falls back to PORT, then marks merged fixes amber and unmerged ones red when the app cannot start", async () => {
    await makeRun([finding("R2"), finding("R5"), finding("R6"), finding("R1", "pass", "app")], [fix("R5", 31), fix("R6", 32)]);
    const h = harness({ crashOnStart: true });
    const checks = vi.fn();

    await recheckApp("run1", {
      ...h.deps,
      mergeFixes: (runId) => mergeFixes(runId, { fetch: fakeGitHub([31]).fetch, sleep: noWait }),
      runChecks: checks,
    });

    expect(h.spawned.map((s) => s.args)).toEqual([
      ["run", "dev", "--", "--port", "4010"],
      ["run", "dev"],
    ]);
    expect(h.spawned[1].options.env?.PORT).toBe("4010");
    expect(checks).not.toHaveBeenCalled();
    const saved = await loadRun("run1");
    expect(saved.stage).toBe("done");
    expect(byRule(saved).R2).toMatchObject({
      finalState: "red",
      detail: "Detail R2. No fix was merged for this finding, so it is not counted as fixed.",
    });
    const r6 = byRule(saved).R6;
    expect(r6).toMatchObject({ finalState: "amber", detail: "Detail R6." });
    expect(r6.humanStep).toMatch(
      /^We could not re-check this: the fixed app did not start \(npm run dev exited with code 1: .*\)\. Press Check again\.$/,
    );
    expect(byRule(saved).R5.finalState).toBe("amber");
    expect(byRule(saved).R1.finalState).toBe("");
  });

  it("clones the run's own branch and ends done without crashing when the clone fails", async () => {
    await makeRun([finding("R2")]);
    const h = harness();

    await recheckApp("run1", {
      ...h.deps,
      mergeFixes: mergedOnly("R2"),
      clone: async (_url, branch) => {
        throw new Error(`Remote branch ${branch} not found`);
      },
    });

    const saved = await loadRun("run1");
    expect(saved.stage).toBe("done");
    expect(byRule(saved).R2).toMatchObject({
      finalState: "amber",
      detail: "Detail R2.",
      humanStep: "We could not re-check this: the fixed app did not start (Remote branch store-ready-run1 not found). Press Check again.",
    });
    expect(h.spawned).toHaveLength(0);
  });

  it("passes none of this process's secrets to npm install or the app", async () => {
    const secrets = { DEVIN_API_KEY: "cog_secret", GITHUB_TOKEN: "ghp_secret", MODEL_API_KEY: "model_secret" };
    Object.assign(process.env, secrets);
    await makeRun([finding("R2")]);
    const h = harness();
    try {
      await recheckApp("run1", {
        ...h.deps,
        clone: async (_url, _branch, dest) => {
          await mkdir(dest, { recursive: true });
          await writeFile(path.join(dest, ".env"), "VITE_API_URL=https://api.acme.dev\nSECRET_KEY=x\nPATH=/evil\n");
          await writeFile(path.join(dest, ".env.local"), "export NEXT_PUBLIC_SITE='Acme' # name\nDATABASE_URL=postgres://x\n");
        },
        runChecks: checksWith(),
      });
    } finally {
      for (const key of Object.keys(secrets)) delete process.env[key];
      process.env.GITHUB_TOKEN = "ghp_test";
    }

    expect(h.installs).toHaveLength(1);
    expect(h.installs[0]).toMatchObject({ file: "npm", args: INSTALL_ARGS });
    expect(INSTALL_ARGS).toEqual(["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
    const envs = [h.installs[0].options.env, h.spawned[0].options.env];
    for (const env of envs) {
      expect(env).toBeDefined();
      for (const name of ["DEVIN_API_KEY", "GITHUB_TOKEN", "MODEL_API_KEY"]) expect(env).not.toHaveProperty(name);
      expect(Object.values(env!)).not.toContain("ghp_secret");
      expect(Object.keys(env!).sort()).toEqual(["HOME", "NEXT_PUBLIC_SITE", "NODE_ENV", "PATH", "PORT", "VITE_API_URL"]);
      expect(env).toMatchObject({
        PATH: process.env.PATH,
        PORT: "4010",
        NODE_ENV: "development",
        VITE_API_URL: "https://api.acme.dev",
        NEXT_PUBLIC_SITE: "Acme",
      });
      expect(env!.HOME).toMatch(/fts-recheck-home-/);
      expect(env!.HOME).not.toBe(os.homedir());
    }
  });
});

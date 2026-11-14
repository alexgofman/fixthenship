import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseBranch } from "../../lib/fix/brief";
import {
  MERGE_RETRY_MS,
  OTHER_REPO_STEP,
  UPDATING_SUMMARY,
  mergeFixes,
  updateMessage,
  type MergeDeps,
} from "../../lib/recheck/mergeFixes";
import { loadRun, saveRun } from "../../lib/store";
import type { Finding, FixSession, RuleId, Run } from "../../lib/types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-merge-"));
  process.env.RUNS_DIR = dir;
  process.env.GITHUB_TOKEN = "ghp_test";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  delete process.env.RUNS_DIR;
  delete process.env.GITHUB_TOKEN;
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

function finding(ruleId: RuleId): Finding {
  return {
    ruleId,
    guideline: "x",
    title: `Title ${ruleId}`,
    detail: `Detail ${ruleId}.`,
    source: "both",
    evidence: [],
    confidence: "high",
    state: "fail",
    fixable: "yes",
    finalState: "",
    humanStep: "",
  };
}

function fix(ruleId: RuleId, number: number): FixSession {
  return {
    ruleId,
    sessionId: `devin-${number}`,
    url: `https://app.devin.ai/sessions/${number}`,
    status: "finished",
    prUrl: `https://github.com/acme/app/pull/${number}`,
    summary: `Summary ${ruleId}`,
    acus: 1,
  };
}

async function makeRun(fixes: FixSession[]): Promise<void> {
  const run: Run = {
    id: "run1",
    createdAt: new Date().toISOString(),
    repoUrl: "https://github.com/acme/app",
    appUrl: "https://app.acme.dev",
    stage: "fixed",
    findings: fixes.map((f) => finding(f.ruleId)),
    fixes,
    error: "",
  };
  await saveRun(run);
}

type PullState = {
  sha: string;
  refuse: number;
  mergeable: boolean | null;
  merged: boolean;
  state: string;
  base: string;
  headRepo: string | null;
};

/**
 * Fake GitHub and Devin sharing one event log. `refuse` is the status a merge gets (0 merges).
 * `onGet` runs before every GET and may change the pull request, e.g. once its session has pushed.
 */
function fakes(
  pulls: Record<number, Partial<PullState>>,
  onGet: (n: number, pull: PullState, gets: number) => void | Promise<void> = () => {},
) {
  const log: string[] = [];
  const messages: { sessionId: string; message: string }[] = [];
  const state = new Map<number, PullState>();
  const gets = new Map<number, number>();
  const pull = (n: number): PullState => {
    if (!state.has(n)) {
      state.set(n, { sha: `sha${n}`, refuse: 0, mergeable: true, merged: false, state: "open", base: "store-ready-run1", headRepo: "acme/app", ...pulls[n] });
    }
    return state.get(n)!;
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    log.push(`${method} ${url.replace("https://api.github.com/repos/acme/app", "")}`);
    const n = Number(url.match(/\/pulls\/(\d+)/)?.[1]);
    const p = pull(n);
    if (method === "GET") {
      gets.set(n, (gets.get(n) ?? 0) + 1);
      await onGet(n, p, gets.get(n)!);
      const head = { sha: p.sha, repo: p.headRepo === null ? null : { full_name: p.headRepo } };
      return json({ state: p.state, merged: p.merged, mergeable: p.mergeable, base: { ref: p.base }, head });
    }
    const body = JSON.parse(String(init.body)) as { sha: string };
    if (body.sha !== p.sha) return json({ message: "Head branch was modified" }, 409);
    if (p.refuse) return json({ message: "Pull Request is not mergeable" }, p.refuse);
    p.merged = true;
    return json({ merged: true, sha: "abc" });
  };
  const deps: Partial<MergeDeps> = {
    fetch: fetch as typeof globalThis.fetch,
    hasDevinKey: () => true,
    sendMessage: async (sessionId, message) => {
      log.push(`MESSAGE ${sessionId}`);
      messages.push({ sessionId, message });
    },
    mergeRetryMs: 0,
    updatePollMs: 0,
    updateTimeoutMs: 0,
  };
  return { deps, log, messages, state };
}

/** GET, PUT refused, then the two retries GitHub's 405 "Base branch was modified" gets. */
const refusedThrice = (n: number) => Array.from({ length: 3 }, () => [`GET /pulls/${n}`, `PUT /pulls/${n}/merge`]).flat();

/** The session pushes a merged branch: a new head that merges, visible from the `after`-th GET on. */
function resolvesOn(target: number, after: number) {
  return (n: number, p: PullState, gets: number) => {
    if (n === target && gets >= after) Object.assign(p, { sha: `sha${n}-updated`, refuse: 0, mergeable: true });
  };
}

function byRule(run: Run): Record<string, Finding> {
  return Object.fromEntries(run.findings.map((f) => [f.ruleId, f]));
}

const handMerge = (n: number) => `Merge this pull request by hand: https://github.com/acme/app/pull/${n}`;

describe("mergeFixes brings conflicting pull requests up to date through their sessions", () => {
  it.each([405, 409])("merges a pull request refused with %i once its session has pushed", async (status) => {
    await makeRun([fix("R2", 21)]);
    const summaries: string[] = [];
    const f = fakes({ 21: { refuse: status, mergeable: false } }, async (n, p, gets) => {
      summaries.push((await loadRun("run1")).fixes[0].summary);
      resolvesOn(21, 5)(n, p, gets);
    });

    const result = await mergeFixes("run1", { ...f.deps, updateTimeoutMs: 5_000 });

    expect(result).toEqual({ merged: ["R2"], skipped: [] });
    expect(f.messages).toEqual([{ sessionId: "devin-21", message: updateMessage("https://github.com/acme/app/pull/21", "store-ready-run1") }]);
    expect(f.messages[0].message).toBe(
      "Other fixes were merged into `store-ready-run1` first, and your pull request https://github.com/acme/app/pull/21 no longer merges cleanly. " +
        "Merge the latest `store-ready-run1` into your branch, resolve the conflicts so that BOTH your change and the changes already on `store-ready-run1` are kept, " +
        "make sure the app still builds, and push to the same branch. Do not open a new pull request. Reply when it is pushed.",
    );
    expect(f.log).toEqual([
      ...refusedThrice(21),
      "MESSAGE devin-21",
      "GET /pulls/21",
      "GET /pulls/21",
      "GET /pulls/21",
      "PUT /pulls/21/merge",
    ]);
    expect(summaries).toEqual([...Array(3).fill("Summary R2"), UPDATING_SUMMARY, UPDATING_SUMMARY, UPDATING_SUMMARY]);
    const saved = await loadRun("run1");
    expect(saved.fixes[0].summary).toBe("Summary R2");
    expect(byRule(saved).R2).toMatchObject({ finalState: "", humanStep: "" });
  });

  it("falls back to the hand-merge step when the session never pushes within the time limit", async () => {
    await makeRun([fix("R2", 21)]);
    const f = fakes({ 21: { refuse: 405, mergeable: false } });

    const started = Date.now();
    const result = await mergeFixes("run1", { ...f.deps, updatePollMs: 5, updateTimeoutMs: 60 });

    expect(Date.now() - started).toBeGreaterThanOrEqual(55);
    expect(result).toEqual({ merged: [], skipped: ["R2"] });
    expect(f.messages).toHaveLength(1);
    expect(f.log.filter((l) => l === "GET /pulls/21").length).toBeGreaterThan(2);
    expect(f.log.filter((l) => l === "PUT /pulls/21/merge")).toHaveLength(3);
    const saved = await loadRun("run1");
    expect(byRule(saved).R2).toMatchObject({ finalState: "amber", humanStep: handMerge(21) });
    expect(saved.fixes[0].summary).toBe("Summary R2");
  });

  it("accepts the pull request once GitHub says it merges, even with the same head", async () => {
    await makeRun([fix("R2", 21)]);
    const f = fakes({ 21: { refuse: 405, mergeable: false } }, (n, p, gets) => {
      if (gets >= 5) Object.assign(p, { mergeable: true, refuse: 0 });
    });

    const result = await mergeFixes("run1", { ...f.deps, updatePollMs: 1, updateTimeoutMs: 5_000 });

    expect(result).toEqual({ merged: ["R2"], skipped: [] });
    expect(f.state.get(21)?.sha).toBe("sha21");
    expect(f.log).toEqual([...refusedThrice(21), "MESSAGE devin-21", "GET /pulls/21", "GET /pulls/21", "GET /pulls/21", "PUT /pulls/21/merge"]);
  });

  it("keeps waiting while GitHub has not worked out whether the new head merges", async () => {
    await makeRun([fix("R2", 21)]);
    const f = fakes({ 21: { refuse: 405, mergeable: false } }, (n, p, gets) => {
      if (gets === 4) Object.assign(p, { sha: "sha21-updated", mergeable: null, refuse: 0 });
      if (gets === 6) p.mergeable = true;
    });

    const result = await mergeFixes("run1", { ...f.deps, updatePollMs: 1, updateTimeoutMs: 5_000 });

    expect(result).toEqual({ merged: ["R2"], skipped: [] });
    expect(f.log.slice(6)).toEqual(["MESSAGE devin-21", "GET /pulls/21", "GET /pulls/21", "GET /pulls/21", "GET /pulls/21", "PUT /pulls/21/merge"]);
  });

  it("falls back to the hand-merge step when the updated pull request is still refused", async () => {
    await makeRun([fix("R2", 21)]);
    const f = fakes({ 21: { refuse: 405, mergeable: false } }, (n, p, gets) => {
      if (gets >= 2) Object.assign(p, { sha: "sha21-updated", mergeable: true });
    });

    const result = await mergeFixes("run1", { ...f.deps, updateTimeoutMs: 5_000 });

    expect(result).toEqual({ merged: [], skipped: ["R2"] });
    expect(f.log.filter((l) => l === "PUT /pulls/21/merge")).toHaveLength(6);
    expect(byRule(await loadRun("run1")).R2).toMatchObject({ finalState: "amber", humanStep: handMerge(21) });
  });

  it("goes straight to the hand-merge step for a fix with no session", async () => {
    await makeRun([{ ...fix("R2", 21), sessionId: "" }]);
    const f = fakes({ 21: { refuse: 405 } });

    const result = await mergeFixes("run1", f.deps);

    expect(result).toEqual({ merged: [], skipped: ["R2"] });
    expect(f.messages).toEqual([]);
    expect(f.log).toEqual(refusedThrice(21));
    expect(byRule(await loadRun("run1")).R2).toMatchObject({ finalState: "amber", humanStep: handMerge(21) });
  });

  it("goes straight to the hand-merge step without a Devin key", async () => {
    await makeRun([fix("R2", 21)]);
    const f = fakes({ 21: { refuse: 405 } });

    const result = await mergeFixes("run1", { ...f.deps, hasDevinKey: () => false });

    expect(result).toEqual({ merged: [], skipped: ["R2"] });
    expect(f.messages).toEqual([]);
    expect(f.log).toEqual(refusedThrice(21));
  });

  it("falls back to the hand-merge step when the message cannot be sent, and restores the summary", async () => {
    await makeRun([fix("R2", 21)]);
    const f = fakes({ 21: { refuse: 405 } });

    const result = await mergeFixes("run1", {
      ...f.deps,
      sendMessage: async () => {
        throw new Error("Devin API POST /sessions/devin-21/messages failed: 404");
      },
    });

    expect(result).toEqual({ merged: [], skipped: ["R2"] });
    expect(f.log).toEqual(refusedThrice(21));
    const saved = await loadRun("run1");
    expect(byRule(saved).R2).toMatchObject({ finalState: "amber", humanStep: handMerge(21) });
    expect(saved.fixes[0].summary).toBe("Summary R2");
  });

  it("merges every clean pull request before messaging any session, then handles conflicts one at a time", async () => {
    await makeRun([fix("R1", 31), fix("R2", 32), fix("R5", 33), fix("R6", 34)]);
    const f = fakes({ 31: { refuse: 405 }, 33: { refuse: 405 } }, (n, p, gets) => {
      resolvesOn(31, 5)(n, p, gets);
      resolvesOn(33, 5)(n, p, gets);
    });

    const result = await mergeFixes("run1", { ...f.deps, updateTimeoutMs: 5_000 });

    expect(result).toEqual({ merged: ["R2", "R6", "R1", "R5"], skipped: [] });
    expect(f.log).toEqual([
      ...refusedThrice(31),
      "GET /pulls/32",
      "PUT /pulls/32/merge",
      ...refusedThrice(33),
      "GET /pulls/34",
      "PUT /pulls/34/merge",
      "MESSAGE devin-31",
      "GET /pulls/31",
      "GET /pulls/31",
      "PUT /pulls/31/merge",
      "MESSAGE devin-33",
      "GET /pulls/33",
      "GET /pulls/33",
      "PUT /pulls/33/merge",
    ]);
  });

  it("keeps today's behaviour for a closed pull request or one against another branch", async () => {
    await makeRun([fix("R2", 41), fix("R5", 42)]);
    const f = fakes({ 41: { state: "closed" }, 42: { base: "main" } });

    const result = await mergeFixes("run1", f.deps);

    expect(result).toEqual({ merged: [], skipped: ["R2", "R5"] });
    expect(f.messages).toEqual([]);
    expect(f.log).toEqual(["GET /pulls/41", "GET /pulls/42"]);
    const saved = byRule(await loadRun("run1"));
    expect(saved.R2).toMatchObject({ finalState: "amber", humanStep: handMerge(41) });
    expect(saved.R5).toMatchObject({ finalState: "amber", humanStep: handMerge(42) });
  });

  it("still refuses a pull request in another repository without messaging its session", async () => {
    await makeRun([{ ...fix("R2", 51), prUrl: "https://github.com/evil/app/pull/51" }, fix("R5", 52)]);
    const f = fakes({ 52: { refuse: 405 } }, resolvesOn(52, 5));

    const result = await mergeFixes("run1", { ...f.deps, updateTimeoutMs: 5_000 });

    expect(result).toEqual({ merged: ["R5"], skipped: ["R2"] });
    expect(f.messages.map((m) => m.sessionId)).toEqual(["devin-52"]);
    expect(f.log.some((l) => l.includes("/51") || l.includes("evil"))).toBe(false);
    expect(byRule(await loadRun("run1")).R2).toMatchObject({
      finalState: "amber",
      humanStep: "This pull request is not in the app's repository; it was not merged",
    });
  });
});

describe("mergeFixes retries merges refused back to back", () => {
  it("re-reads the pull request and merges again 2 seconds later, without messaging the session", async () => {
    await makeRun([fix("R2", 21), fix("R5", 22)]);
    // GitHub refuses the second of two back-to-back merges until it has caught up.
    const f = fakes({ 22: { refuse: 405 } }, (n, p, gets) => {
      if (n === 22 && gets >= 2) Object.assign(p, { refuse: 0, sha: "sha22-rebased" });
    });
    const sleep = vi.fn(async () => {});

    const result = await mergeFixes("run1", { ...f.deps, sleep, mergeRetryMs: MERGE_RETRY_MS });

    expect(MERGE_RETRY_MS).toBe(2_000);
    expect(result).toEqual({ merged: ["R2", "R5"], skipped: [] });
    expect(sleep.mock.calls).toEqual([[2_000]]);
    expect(f.messages).toEqual([]);
    expect(f.log).toEqual(["GET /pulls/21", "PUT /pulls/21/merge", "GET /pulls/22", "PUT /pulls/22/merge", "GET /pulls/22", "PUT /pulls/22/merge"]);
  });

  it("asks the session only after two retries, 2 seconds apart, were refused too", async () => {
    await makeRun([fix("R2", 21)]);
    const f = fakes({ 21: { refuse: 409 } });
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
      f.log.push(`SLEEP ${ms}`);
    };

    await mergeFixes("run1", { ...f.deps, sleep, mergeRetryMs: MERGE_RETRY_MS });

    expect(f.log.slice(0, 9)).toEqual([
      "GET /pulls/21",
      "PUT /pulls/21/merge",
      "SLEEP 2000",
      "GET /pulls/21",
      "PUT /pulls/21/merge",
      "SLEEP 2000",
      "GET /pulls/21",
      "PUT /pulls/21/merge",
      "MESSAGE devin-21",
    ]);
  });
});

describe("mergeFixes merges only pull requests from the app's repository", () => {
  it.each([
    ["another repository", "evil/app"],
    ["a deleted fork", null],
  ])("refuses a pull request whose branch is in %s", async (_what, headRepo) => {
    await makeRun([fix("R2", 21)]);
    const f = fakes({ 21: { headRepo } });

    const result = await mergeFixes("run1", f.deps);

    expect(result).toEqual({ merged: [], skipped: ["R2"] });
    expect(f.log).toEqual(["GET /pulls/21"]);
    expect(f.messages).toEqual([]);
    expect(f.state.get(21)?.merged).toBe(false);
    expect(byRule(await loadRun("run1")).R2).toMatchObject({ finalState: "amber", humanStep: OTHER_REPO_STEP });
  });

  it("accepts the head repository in any letter case", async () => {
    await makeRun([fix("R2", 21)]);
    const f = fakes({ 21: { headRepo: "Acme/App" } });
    expect(await mergeFixes("run1", f.deps)).toEqual({ merged: ["R2"], skipped: [] });
  });
});

describe("mergeFixes merges every delivered fix", () => {
  it("merges a fix whatever its status, but not while its session is queued or working", async () => {
    await makeRun([
      { ...fix("R1", 31), status: "error", summary: "Ran out of budget" },
      { ...fix("R2", 32), status: "waiting" },
      fix("R3", 33),
      { ...fix("R5", 34), status: "working" },
      { ...fix("R6", 35), status: "queued" },
      { ...fix("R7", 36), status: "error", prUrl: "" },
    ]);
    const f = fakes({});

    const result = await mergeFixes("run1", f.deps);

    expect(result).toEqual({ merged: ["R1", "R2", "R3"], skipped: [] });
    expect(f.log.some((l) => /\/(34|35|36)/.test(l))).toBe(false);
  });
});

describe("each run merges into its own branch", () => {
  it("gives two runs on the same repository two branches and does not merge a pull request against the other run's branch", async () => {
    const first = "3f9a2c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f";
    const second = "8d0b4e7a-2c5f-4a1b-8e3d-6f7a8b9c0d1e";
    expect(baseBranch({ id: first })).toBe("store-ready-3f9a2c1e");
    expect(baseBranch({ id: second })).toBe("store-ready-8d0b4e7a");
    for (const [id, n] of [[first, 61], [second, 62]] as const) {
      await saveRun({
        id,
        createdAt: new Date().toISOString(),
        repoUrl: "https://github.com/acme/app",
        appUrl: "https://app.acme.dev",
        stage: "fixed",
        findings: [finding("R2")],
        fixes: [fix("R2", n)],
        error: "",
      });
    }
    // The first run's fix was opened against the second run's branch; the second run's against its own.
    const f = fakes({ 61: { base: "store-ready-8d0b4e7a" }, 62: { base: "store-ready-8d0b4e7a" } });

    expect(await mergeFixes(first, f.deps)).toEqual({ merged: [], skipped: ["R2"] });
    expect(await mergeFixes(second, f.deps)).toEqual({ merged: ["R2"], skipped: [] });

    expect(f.state.get(61)?.merged).toBe(false);
    expect(f.state.get(62)?.merged).toBe(true);
    expect(f.log).toEqual(["GET /pulls/61", "GET /pulls/62", "PUT /pulls/62/merge"]);
    expect(byRule(await loadRun(first)).R2).toMatchObject({ finalState: "amber", humanStep: handMerge(61) });
    expect(byRule(await loadRun(second)).R2.finalState).toBe("");
  });
});

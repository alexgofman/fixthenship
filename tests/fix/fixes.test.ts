import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseBranch, buildFixBrief } from "../../lib/fix/brief";
import { mentionsRule } from "../../lib/fix/pollFixes";
import { pollFixes } from "../../lib/fix/pollFixes";
import { startFixes } from "../../lib/fix/startFixes";
import { loadRun, saveRun } from "../../lib/store";
import { type Handler, fakeFetch, finding, json, makeRun } from "./helpers";

let dir: string;

const branchExists: [string, Handler] = ["GET /repos/acme/app/branches/store-ready-run1", () => json({ name: "store-ready-run1" })];

function findings() {
  return [
    finding("R1", "pass", "partly"),
    finding("R2", "fail", "yes"),
    finding("R5", "fail", "yes"),
    finding("R7", "fail", "partly"),
    finding("R13", "fail", "no"),
    finding("R11", "risk", "partly"),
  ];
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-fix-"));
  process.env.RUNS_DIR = dir;
  process.env.GITHUB_TOKEN = "ghp_test";
});

afterEach(async () => {
  for (const k of ["RUNS_DIR", "GITHUB_TOKEN", "DEVIN_API_KEY", "DEVIN_ORG_ID", "DEVIN_MAX_ACU"]) delete process.env[k];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("with Devin", () => {
  beforeEach(() => {
    process.env.DEVIN_API_KEY = "cog_test";
    process.env.DEVIN_ORG_ID = "org-1";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("starts one tagged session per failing fixable finding", async () => {
    process.env.DEVIN_MAX_ACU = "3";
    await saveRun(makeRun("run1", findings()));
    let n = 0;
    const calls = fakeFetch([
      branchExists,
      ["POST /sessions", () => json({ session_id: `devin-${++n}`, url: `https://app.devin.ai/sessions/${n}`, status: "new" })],
    ]);

    const run = await startFixes("run1");
    expect(run.stage).toBe("fixing");
    expect(run.fixes.map((f) => f.ruleId)).toEqual(["R2", "R5", "R7"]);
    expect(run.fixes.every((f) => f.status === "queued" && f.sessionId.startsWith("devin-"))).toBe(true);

    const creates = calls.filter((c) => c.method === "POST");
    expect(creates).toHaveLength(3);
    for (const c of creates) {
      expect(c.body).toMatchObject({ tags: ["fixthenship-run1"], max_acu_limit: 3 });
      expect((c.body as { prompt: string }).prompt).toContain("Base branch: store-ready-run1");
    }
  });

  it("caps at ten sessions and defaults to 5 ACUs", async () => {
    const many = (["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11", "R12"] as const).map((id) =>
      finding(id, "fail", "yes"),
    );
    await saveRun(makeRun("run1", many));
    const calls = fakeFetch([branchExists, ["POST /sessions", () => json({ session_id: "d", url: "u", status: "new" })]]);
    const run = await startFixes("run1");
    expect(run.fixes).toHaveLength(10);
    expect(calls.filter((c) => c.method === "POST").every((c) => (c.body as { max_acu_limit: number }).max_acu_limit === 5)).toBe(true);
  });

  it("one session that fails to start does not stop the others", async () => {
    await saveRun(makeRun("run1", findings()));
    fakeFetch([
      branchExists,
      [
        "POST /sessions",
        (_u, init) =>
          String(init.body).includes("Fix R5") ? json({ detail: "boom" }, 500) : json({ session_id: "ok", url: "u", status: "new" }),
      ],
    ]);
    const run = await startFixes("run1");
    expect(run.fixes.map((f) => [f.ruleId, f.status])).toEqual([
      ["R2", "queued"],
      ["R5", "error"],
      ["R7", "queued"],
    ]);
    expect(run.stage).toBe("fixing");
  });

  it("one failing poll does not stop the others, and the stage becomes fixed when all are done", async () => {
    const run = makeRun("run1", findings());
    run.stage = "fixing";
    run.fixes = [
      { ruleId: "R2", sessionId: "a", url: "", status: "working", prUrl: "", summary: "", acus: 0 },
      { ruleId: "R5", sessionId: "b", url: "", status: "working", prUrl: "", summary: "", acus: 0 },
      { ruleId: "R7", sessionId: "c", url: "", status: "queued", prUrl: "", summary: "", acus: 0 },
    ];
    await saveRun(run);

    let bFails = true;
    fakeFetch([
      ["GET /sessions/a", () => json({ session_id: "a", url: "", status: "exit", acus_consumed: 1, pull_requests: [{ pr_url: "pr-a", pr_state: "open" }], structured_output: { summary: "fixed R2" } })],
      ["GET /sessions/b", () => (bFails ? json({ detail: "down" }, 503) : json({ session_id: "b", url: "", status: "running", status_detail: "finished", acus_consumed: 2, pull_requests: [] }))],
      ["GET /sessions/c", () => json({ session_id: "c", url: "", status: "suspended", status_detail: "out_of_quota", acus_consumed: 5, pull_requests: [] })],
    ]);

    let polled = await pollFixes("run1");
    expect(polled.fixes.map((f) => f.status)).toEqual(["finished", "working", "error"]);
    expect(polled.fixes[0]).toMatchObject({ prUrl: "pr-a", summary: "fixed R2", acus: 1 });
    expect(polled.stage).toBe("fixing");

    bFails = false;
    polled = await pollFixes("run1");
    expect(polled.fixes.map((f) => f.status)).toEqual(["finished", "finished", "error"]);
    expect(polled.stage).toBe("fixed");
    expect((await loadRun("run1")).stage).toBe("fixed");
  });

  it("counts a session that waits for a reply with its pull request open as finished", async () => {
    const run = makeRun("run1", findings());
    run.stage = "fixing";
    run.fixes = [
      { ruleId: "R2", sessionId: "a", url: "", status: "working", prUrl: "", summary: "", acus: 0 },
      { ruleId: "R5", sessionId: "b", url: "", status: "working", prUrl: "", summary: "", acus: 0 },
    ];
    await saveRun(run);

    let bStillWorking = true;
    fakeFetch([
      // Done: the pull request is open and Devin waits for a reply.
      ["GET /sessions/a", () => json({ session_id: "a", url: "", status: "running", status_detail: "waiting_for_user", pull_requests: [{ pr_url: "pr-a" }], structured_output: { summary: "fixed R2" } })],
      // Asks a question before any pull request exists: nobody is working, but nothing is fixed.
      ["GET /sessions/b", () => json({ session_id: "b", url: "", status: "running", status_detail: bStillWorking ? "working" : "waiting_for_user", pull_requests: [] })],
    ]);

    let polled = await pollFixes("run1");
    expect(polled.fixes.map((f) => f.status)).toEqual(["finished", "working"]);
    expect(polled.stage).toBe("fixing");

    bStillWorking = false;
    polled = await pollFixes("run1");
    expect(polled.fixes.map((f) => f.status)).toEqual(["finished", "waiting"]);
    expect(polled.stage).toBe("fixed");
  });
});

describe("without DEVIN_API_KEY", () => {
  it("creates the branch, writes briefs and saves queued fixes with no session", async () => {
    await saveRun(makeRun("run1", findings()));
    const calls = fakeFetch([
      ["GET /branches/store-ready-run1", () => json({ message: "Branch not found" }, 404)],
      ["GET /repos/acme/app/git/ref/heads/main", () => json({ object: { sha: "abc123" } })],
      ["GET /repos/acme/app", () => json({ default_branch: "main" })],
      ["POST /repos/acme/app/git/refs", () => json({ ref: "refs/heads/store-ready-run1" }, 201)],
    ]);

    const run = await startFixes("run1");
    expect(run.stage).toBe("fixing");
    expect(run.error).toBe("");
    expect(run.fixes.map((f) => [f.ruleId, f.status, f.sessionId])).toEqual([
      ["R2", "queued", ""],
      ["R5", "queued", ""],
      ["R7", "queued", ""],
    ]);
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ ref: "refs/heads/store-ready-run1", sha: "abc123" });
    expect(calls.some((c) => c.url.includes("api.devin.ai"))).toBe(false);

    const briefs = (await readdir(path.join(dir, "run1", "briefs"))).sort();
    expect(briefs).toEqual(["R2.md", "R5.md", "R7.md"]);
    const r7 = await readFile(path.join(dir, "run1", "briefs", "R7.md"), "utf8");
    expect(r7).toContain("Apple keys are still needed");
    expect(r7).toContain("src/App.tsx, line 12");
  });

  it("matches open pull requests on the run's branch to findings by rule id", async () => {
    const run = makeRun("run1", findings());
    run.stage = "fixing";
    run.fixes = ["R2", "R5", "R7"].map((ruleId) => ({
      ruleId: ruleId as "R2",
      sessionId: "",
      url: "",
      status: "queued" as const,
      prUrl: "",
      summary: "",
      acus: 0,
    }));
    await saveRun(run);

    const pulls = [
      { title: "Remove placeholder text (R2)", html_url: "https://github.com/acme/app/pull/1", head: { ref: "fix-placeholders" } },
      { title: "Add privacy link", html_url: "https://github.com/acme/app/pull/2", head: { ref: "devin/123-r5-privacy" } },
    ];
    const calls = fakeFetch([["GET /repos/acme/app/pulls", () => json(pulls)]]);

    let polled = await pollFixes("run1");
    expect(calls[0].url).toContain("state=open");
    expect(calls[0].url).toContain("base=store-ready-run1");
    expect(polled.fixes.map((f) => [f.ruleId, f.status, f.prUrl])).toEqual([
      ["R2", "finished", "https://github.com/acme/app/pull/1"],
      ["R5", "finished", "https://github.com/acme/app/pull/2"],
      ["R7", "queued", ""],
    ]);
    expect(polled.stage).toBe("fixing");

    pulls.push({ title: "Sign in with Apple", html_url: "https://github.com/acme/app/pull/3", head: { ref: "fix/R7-apple" } });
    polled = await pollFixes("run1");
    expect(polled.fixes[2]).toMatchObject({ status: "finished", prUrl: "https://github.com/acme/app/pull/3" });
    expect(polled.stage).toBe("fixed");
  });
});

describe("briefs", () => {
  it("contains the repository, branch, guideline, evidence and instructions", () => {
    const run = makeRun("run1", []);
    const f = { ...finding("R8", "fail", "partly"), guideline: "3.1.1", title: "Digital goods are not sold through outside checkout" };
    const brief = buildFixBrief(run, f);
    expect(brief).toContain("Repository: https://github.com/acme/app");
    expect(brief).toContain("Base branch: store-ready-run1");
    expect(brief).toContain("guideline 3.1.1: Digital goods are not sold through outside checkout");
    expect(brief).toContain("Detail R8");
    expect(brief).toContain("src/App.tsx, line 12: Caption R8");
    expect(brief).toContain("iPhone wrapper");
    expect(brief).toContain("selling on iPhone needs in-app purchase");
    expect(brief).toContain("ONE small pull request against the `store-ready-run1` branch");
    expect(brief).not.toMatch(/will approve|guarantee/i);
  });

  it("names each run's own branch after the first 8 characters of its id", () => {
    expect(baseBranch({ id: "example" })).toBe("store-ready-example");
    expect(baseBranch({ id: "3f9a2c1e-7b4d-4e8a-9c0f-1a2b3c4d5e6f" })).toBe("store-ready-3f9a2c1e");
  });

  it("matches rule ids exactly", () => {
    expect(mentionsRule("fix/r1-loading", "R1")).toBe(true);
    expect(mentionsRule("Fix R10 badge", "R1")).toBe(false);
    expect(mentionsRule("Fix R10 badge", "R10")).toBe(true);
    expect(mentionsRule("ER1 thing", "R1")).toBe(false);
  });
});

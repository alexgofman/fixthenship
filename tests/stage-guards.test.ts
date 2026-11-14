import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as fix } from "../app/api/runs/[runId]/fix/route";
import { POST as recheck } from "../app/api/runs/[runId]/recheck/route";
import { startFixLoop } from "../lib/fix/loop";
import { startRecheck } from "../lib/recheck/recheckApp";
import { loadRun, saveRun } from "../lib/store";
import { STAGES, type FixSession, type Run, type Stage } from "../lib/types";
import { fakeFetch, finding, json, makeRun } from "./fix/helpers";

vi.mock("../lib/fix/loop", () => ({ startFixLoop: vi.fn(async () => {}), isFixLoopActive: () => false }));
vi.mock("../lib/recheck/recheckApp", () => ({ startRecheck: vi.fn(async () => {}), isRecheckActive: () => false }));

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-guards-"));
  process.env.RUNS_DIR = dir;
  process.env.GITHUB_TOKEN = "ghp_test";
  process.env.DEVIN_API_KEY = "cog_test";
  process.env.DEVIN_ORG_ID = "org-1";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  for (const k of ["RUNS_DIR", "GITHUB_TOKEN", "DEVIN_API_KEY", "DEVIN_ORG_ID"]) delete process.env[k];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(startFixLoop).mockClear();
  vi.mocked(startRecheck).mockClear();
  await rm(dir, { recursive: true, force: true });
});

const ctx = (runId: string) => ({ params: Promise.resolve({ runId }) });
const post = (runId: string, action: string) => new Request(`http://localhost/api/runs/${runId}/${action}`, { method: "POST" });

function fixSession(ruleId: FixSession["ruleId"], status: FixSession["status"]): FixSession {
  return { ruleId, sessionId: `old-${ruleId}`, url: "", status, prUrl: "", summary: "", acus: 0 };
}

async function saved(stage: Stage, fixes: FixSession[] = []): Promise<Run> {
  const run = { ...makeRun("run1", [finding("R2", "fail", "yes"), finding("R5", "fail", "yes")]), stage, fixes };
  await saveRun(run);
  return run;
}

/** Fake GitHub branch and Devin; each created session waits a little so concurrent requests overlap. */
function fakeServices() {
  let n = 0;
  return fakeFetch([
    ["GET /repos/acme/app/branches/store-ready-run1", () => json({ name: "store-ready-run1" })],
    [
      "POST /sessions",
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        n++;
        return json({ session_id: `devin-${n}`, url: `https://app.devin.ai/sessions/${n}`, status: "new" });
      },
    ],
  ]);
}

describe("POST /fix", () => {
  it.each(STAGES.filter((s) => s !== "reviewed"))("answers 409 at stage %s with no fix in error", async (stage) => {
    await saved(stage, [fixSession("R2", "finished"), fixSession("R5", "working")]);
    const calls = fakeServices();

    const res = await fix(post("run1", "fix"), ctx("run1"));

    expect(res.status).toBe(409);
    expect(calls).toEqual([]);
    expect((await loadRun("run1")).stage).toBe(stage);
  });

  it.each(["scanning", "checking", "rechecking", "done", "failed"] as const)("answers 409 at stage %s even with a fix in error", async (stage) => {
    await saved(stage, [fixSession("R2", "error")]);
    expect((await fix(post("run1", "fix"), ctx("run1"))).status).toBe(409);
  });

  it("starts the sessions once when two requests arrive together", async () => {
    await saved("reviewed");
    const calls = fakeServices();

    const [a, b] = await Promise.all([fix(post("run1", "fix"), ctx("run1")), fix(post("run1", "fix"), ctx("run1"))]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
    const run = await loadRun("run1");
    expect(run.stage).toBe("fixing");
    expect(run.fixes.map((f) => f.ruleId)).toEqual(["R2", "R5"]);
    expect(run.fixes.map((f) => f.sessionId).sort()).toEqual(["devin-1", "devin-2"]);
    expect(startFixLoop).toHaveBeenCalledTimes(1);
  });

  it.each(["fixing", "fixed"] as const)("retries only the fixes in error at stage %s, once for two requests", async (stage) => {
    await saved(stage, [fixSession("R2", "finished"), fixSession("R5", "error")]);
    const calls = fakeServices();

    const [a, b] = await Promise.all([fix(post("run1", "fix"), ctx("run1")), fix(post("run1", "fix"), ctx("run1"))]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    const run = await loadRun("run1");
    expect(run.stage).toBe("fixing");
    expect(run.fixes.map((f) => [f.ruleId, f.status, f.sessionId])).toEqual([
      ["R2", "finished", "old-R2"],
      ["R5", "queued", "devin-1"],
    ]);
  });

  it("answers 404 for an unknown run", async () => {
    expect((await fix(post("nope", "fix"), ctx("nope"))).status).toBe(404);
  });
});

describe("POST /recheck", () => {
  it.each(STAGES.filter((s) => s !== "fixed" && s !== "done"))("answers 409 at stage %s", async (stage) => {
    await saved(stage);
    const res = await recheck(post("run1", "recheck"), ctx("run1"));
    expect(res.status).toBe(409);
    expect(startRecheck).not.toHaveBeenCalled();
  });

  it.each(["fixed", "done"] as const)("starts the re-check at stage %s", async (stage) => {
    await saved(stage);
    const res = await recheck(post("run1", "recheck"), ctx("run1"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as Run).stage).toBe("rechecking");
    expect(startRecheck).toHaveBeenCalledWith("run1");
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewDeps } from "../lib/review/pipeline";
import type { Run } from "../lib/types";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("../lib/fix/loop", () => ({ isFixLoopActive: () => true, startFixLoop: vi.fn() }));

const { GET } = await import("../app/api/runs/[runId]/route");
const { REVIEW_INTERRUPTED, isReviewActive, reviewApp } = await import("../lib/review/pipeline");
const { createRun, loadRun, saveRun } = await import("../lib/store");

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-run-"));
  process.env.RUNS_DIR = dir;
});
afterEach(async () => {
  delete process.env.RUNS_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function get(runId: string): Promise<Run> {
  const res = await GET(new Request(`http://localhost/api/runs/${runId}`), {
    params: Promise.resolve({ runId }),
  } as RouteContext<"/api/runs/[runId]">);
  expect(res.status).toBe(200);
  return (await res.json()) as Run;
}

describe("GET /api/runs/[runId]", () => {
  it.each(["scanning", "checking"] as const)("marks a %s run that no review is working on as interrupted", async (stage) => {
    const run = await createRun("", "https://app.test");
    run.stage = stage;
    await saveRun(run);

    const seen = await get(run.id);
    expect(seen).toMatchObject({ stage: "failed", error: REVIEW_INTERRUPTED });
    expect(await loadRun(run.id)).toMatchObject({ stage: "failed", error: REVIEW_INTERRUPTED });
  });

  it("leaves a review that is still running alone", async () => {
    const run = await createRun("", "https://app.test");
    let release!: () => void;
    const appUp = new Promise<boolean>((resolve) => (release = () => resolve(false)));
    const waitForApp: ReviewDeps["waitForApp"] = () => appUp;
    const review = reviewApp(run.id, { waitForApp });
    expect(isReviewActive(run.id)).toBe(true);
    await vi.waitFor(async () => expect((await loadRun(run.id)).stage).toBe("checking"));

    expect((await get(run.id)).stage).toBe("checking");

    release();
    await review;
    expect(isReviewActive(run.id)).toBe(false);
    expect((await loadRun(run.id)).error).toBe("The app did not respond");
  });

  it.each(["reviewed", "rechecking", "done"] as const)("does not touch a %s run", async (stage) => {
    const run = await createRun("", "https://app.test");
    run.stage = stage;
    await saveRun(run);
    expect((await get(run.id)).stage).toBe(stage);
  });
});

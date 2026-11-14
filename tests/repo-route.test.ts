import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../app/api/runs/[runId]/repo/route";
import { createRun, loadRun, saveRun } from "../lib/store";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-repo-"));
  process.env.RUNS_DIR = dir;
});
afterEach(async () => {
  delete process.env.RUNS_DIR;
  await rm(dir, { recursive: true, force: true });
});

function call(runId: string, repoUrl: string) {
  const request = new Request(`http://localhost/api/runs/${runId}/repo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl }),
  });
  return POST(request, { params: Promise.resolve({ runId }) });
}

describe("POST /api/runs/[runId]/repo", () => {
  it.each([
    "",
    "not a link",
    "https://yourapp.lovable.app",
    "https://gitlab.com/you/app",
    "https://github.com/you",
    "https://evil.example/github.com/you/app",
    "https://github.com.evil.example/you/app",
    "ftp://github.com/you/app",
    "https://user:pass@github.com/you/app",
    "https://github.com:8443/you/app",
    "https://github.com/you/..",
    "--upload-pack=touch /tmp/x",
  ])("rejects %j", async (repoUrl) => {
    const run = await createRun("", "https://app.test");
    run.stage = "reviewed";
    await saveRun(run);

    const res = await call(run.id, repoUrl);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/not a GitHub repository link/);
    expect((await loadRun(run.id)).repoUrl).toBe("");
  });

  it("refuses a run that already has a repository", async () => {
    const run = await createRun("https://github.com/o/r", "https://app.test");
    run.stage = "reviewed";
    await saveRun(run);
    expect((await call(run.id, "https://github.com/o/other")).status).toBe(409);
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("../lib/review/pipeline", () => ({ reviewApp: vi.fn(async () => {}) }));

const { POST } = await import("../app/api/runs/route");
const { reviewApp } = await import("../lib/review/pipeline");
const { listRuns, loadExampleRun, loadRun } = await import("../lib/store");

async function newRuns() {
  const example = await loadExampleRun();
  return (await listRuns()).filter((r) => r.id !== example.id);
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-runs-"));
  process.env.RUNS_DIR = dir;
  vi.mocked(reviewApp).mockClear();
});
afterEach(async () => {
  delete process.env.RUNS_DIR;
  await rm(dir, { recursive: true, force: true });
});

function post(body: Record<string, string>) {
  return POST(
    new Request("http://localhost/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function postForm(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return POST(new Request("http://localhost/api/runs", { method: "POST", body: form }));
}

describe("POST /api/runs", () => {
  it.each([
    ["https://github.com/o/r", "https://github.com/o/r"],
    ["http://www.github.com/o/r.git", "https://github.com/o/r"],
    ["https://github.com/o/r/tree/main", "https://github.com/o/r"],
    ["", ""],
  ])("stores %j as %j and starts the review", async (repoUrl, stored) => {
    const res = await post({ repoUrl, appUrl: "https://app.test" });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect((await loadRun(id)).repoUrl).toBe(stored);
    expect(reviewApp).toHaveBeenCalledWith(id);
  });

  it.each([
    "--upload-pack=touch /tmp/pwned",
    "https://evil.example/github.com/o/r",
    "file:///etc",
    "/srv/repos/app",
    "https://gitlab.com/o/r",
  ])("refuses %j without creating a run", async (repoUrl) => {
    const res = await post({ repoUrl, appUrl: "https://app.test" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/not a GitHub repository link/);
    expect(await newRuns()).toEqual([]);
    expect(reviewApp).not.toHaveBeenCalled();
  });

  it("cleans the link from the form too", async () => {
    const res = await postForm({ repoUrl: " https://github.com/o/r/ ", appUrl: "https://app.test" });
    expect(res.status).toBe(303);
    const [run] = await newRuns();
    expect(run.repoUrl).toBe("https://github.com/o/r");
  });

  it("still needs the app link", async () => {
    expect((await post({ repoUrl: "https://github.com/o/r", appUrl: "" })).status).toBe(400);
  });
});

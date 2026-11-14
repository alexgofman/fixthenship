import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "../../app/api/runs/[runId]/files/[...path]/route";

let dir: string;

function get(runId: string, parts: string[]) {
  const ctx = { params: Promise.resolve({ runId, path: parts }) };
  return GET(new Request("http://localhost/x"), ctx as never);
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-files-"));
  process.env.RUNS_DIR = dir;
  await mkdir(path.join(dir, "run1", "briefs"), { recursive: true });
  await writeFile(path.join(dir, "run1", "briefs", "R2.md"), "# Fix R2\n");
  await writeFile(path.join(dir, "run1", "run.json"), "{}");
  await mkdir(path.join(dir, "other"), { recursive: true });
  await writeFile(path.join(dir, "other", "secret.txt"), "secret");
  await writeFile(path.join(dir, "outside.txt"), "outside");
});

afterEach(async () => {
  delete process.env.RUNS_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("GET /api/runs/[runId]/files/[...path]", () => {
  it("serves a markdown file from the run folder", async () => {
    const res = await get("run1", ["briefs", "R2.md"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(await res.text()).toBe("# Fix R2\n");
  });

  it.each([
    [["..", "outside.txt"]],
    [["..", "other", "secret.txt"]],
    [["briefs", "..", "..", "outside.txt"]],
    [["../outside.txt"]],
    [["/etc/passwd.txt"]],
  ])("refuses %j", async (parts) => {
    const res = await get("run1", parts);
    expect(res.status).toBe(400);
  });

  it("refuses an invalid run id", async () => {
    expect((await get("..", ["outside.txt"])).status).toBe(404);
  });

  it("refuses other file types and missing files", async () => {
    expect((await get("run1", ["run.json"])).status).toBe(415);
    expect((await get("run1", ["briefs", "R9.md"])).status).toBe(404);
  });
});

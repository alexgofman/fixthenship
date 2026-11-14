import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadExampleRun } from "../lib/store";
import { NOTE_LINES, reviewNotes } from "../components/ReadyReport";
import { reviewNotes as exportedNotes } from "../scripts/export-run.mjs";

const run = promisify(execFile);
const SCRIPT = path.join(process.cwd(), "scripts", "export-run.mjs");
const EXAMPLE = path.join(process.cwd(), "examples", "example-run.json");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-export-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function exportExample(env: Record<string, string> = {}) {
  const out = path.join(dir, "out");
  await run(process.execPath, [SCRIPT, EXAMPLE, out], { env: { ...process.env, RUNS_DIR: path.join(dir, "runs"), ...env } });
  return { out, html: await readFile(path.join(out, "index.html"), "utf8") };
}

describe("export-run", () => {
  it("writes an index.html with every finding title and no script tag", async () => {
    const example = await loadExampleRun();
    const { html } = await exportExample();
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    for (const f of example.findings) expect(html).toContain(escape(f.title));
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("Devin board");
    expect(html).toContain("Notes for App Review");
    expect(html).toContain("Apple makes the decision.");
  });

  it("copies screenshots next to the page and links them relatively", async () => {
    const shots = path.join(dir, "runs", "example", "screenshots");
    await mkdir(shots, { recursive: true });
    await writeFile(path.join(shots, "r1-home.png"), "png");
    const { out, html } = await exportExample();
    expect((await stat(path.join(out, "screenshots", "r1-home.png"))).isFile()).toBe(true);
    expect(html).toContain('src="screenshots/r1-home.png"');
    expect(html).not.toContain("/api/runs/");
    expect(html).toContain("Screenshot unavailable");
  });

  it("writes the same App Review notes as the ready page", async () => {
    const example = await loadExampleRun();
    const notes = reviewNotes(example);
    expect(exportedNotes(example)).toBe(notes);
    expect(notes).toContain("Demo account: <email> / <password>");
    expect(notes).toContain(`${NOTE_LINES.R5[0]}: ${NOTE_LINES.R5[1]}`);
    expect(notes).not.toContain(NOTE_LINES.R6[0]);
  });

  it("names a run without a repository after the app's host", async () => {
    const example = { ...(await loadExampleRun()), repoUrl: "" };
    const notes = reviewNotes(example);
    expect(notes.split("\n")[0]).toBe("habit-tracker.example.com is the iPhone version of https://habit-tracker.example.com.");
    expect(exportedNotes(example)).toBe(notes);
  });
});

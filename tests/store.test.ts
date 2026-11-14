import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RULES } from "../lib/rules";
import { createRun, listRuns, loadExampleRun, loadRun, saveRun } from "../lib/store";
import { FINAL_STATES, FINDING_STATES } from "../lib/types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-runs-"));
  process.env.RUNS_DIR = dir;
});

afterEach(async () => {
  delete process.env.RUNS_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("store", () => {
  it("creates, saves and loads a run", async () => {
    const run = await createRun("https://github.com/acme/app", "https://app.acme.dev");
    expect(run.stage).toBe("scanning");
    expect(run.findings).toEqual([]);
    expect(run.error).toBe("");

    const onDisk = JSON.parse(await readFile(path.join(dir, run.id, "run.json"), "utf8"));
    expect(onDisk.id).toBe(run.id);

    run.stage = "reviewed";
    run.findings = (await loadExampleRun()).findings;
    await saveRun(run);

    const loaded = await loadRun(run.id);
    expect(loaded).toEqual(run);
  });

  it("lists runs newest first, including the example run", async () => {
    const first = await createRun("https://github.com/a/one", "https://one.dev");
    await new Promise((r) => setTimeout(r, 5));
    const second = await createRun("https://github.com/a/two", "https://two.dev");

    const ids = (await listRuns()).map((r) => r.id);
    expect(ids.slice(0, 2)).toEqual([second.id, first.id]);
    expect(ids).toContain((await loadExampleRun()).id);
  });

  it("rejects run ids that could escape the runs folder", async () => {
    await expect(loadRun("../etc")).rejects.toThrow("Invalid run id");
  });
});

describe("example run", () => {
  it("has eight findings covering every state and finalState", async () => {
    const example = await loadExampleRun();
    expect(example.findings).toHaveLength(8);
    const states = new Set(example.findings.map((f) => f.state));
    const finals = new Set(example.findings.map((f) => f.finalState));
    for (const s of FINDING_STATES) expect(states).toContain(s);
    for (const s of FINAL_STATES) expect(finals).toContain(s);
  });

  it("uses guideline and title from the rules table", async () => {
    for (const f of (await loadExampleRun()).findings) {
      const rule = RULES.find((r) => r.id === f.ruleId);
      expect(rule, f.ruleId).toBeDefined();
      expect(f.guideline).toBe(rule!.guideline);
      expect(f.title).toBe(rule!.title);
      expect(f.fixable).toBe(rule!.fixable);
    }
  });
});

describe("rules", () => {
  it("has thirteen rules R1 to R13", () => {
    expect(RULES.map((r) => r.id)).toEqual(
      Array.from({ length: 13 }, (_, i) => `R${i + 1}`),
    );
  });
});

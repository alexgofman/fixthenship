import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RULES } from "../lib/rules";
import { EXAMPLE_RUN_ID, createRun, listRuns, loadExampleRun, loadRun, saveRun, updateRun } from "../lib/store";
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

  it("lists runs newest first, without the example run", async () => {
    const first = await createRun("https://github.com/a/one", "https://one.dev");
    await new Promise((r) => setTimeout(r, 5));
    const second = await createRun("https://github.com/a/two", "https://two.dev");
    await loadRun(EXAMPLE_RUN_ID);

    expect((await listRuns()).map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it("lists nothing before the runs folder exists", async () => {
    process.env.RUNS_DIR = path.join(dir, "missing");
    expect(await listRuns()).toEqual([]);
  });

  it("applies concurrent updates of one run one after another, so none is lost", async () => {
    const run = await createRun("https://github.com/acme/app", "https://app.acme.dev");
    const tick = () => new Promise((r) => setTimeout(r, Math.random() * 5));

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        updateRun(run.id, async (latest) => {
          await tick();
          latest.error = latest.error ? `${latest.error},${i}` : String(i);
        }),
      ),
    );

    const saved = (await loadRun(run.id)).error.split(",").map(Number);
    expect(saved).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect((await readdir(path.join(dir, run.id))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("returns the saved run and does not save when the change throws", async () => {
    const run = await createRun("", "https://app.acme.dev");
    const updated = await updateRun(run.id, (latest) => {
      latest.stage = "reviewed";
    });
    expect(updated.stage).toBe("reviewed");

    await expect(
      updateRun(run.id, (latest) => {
        latest.stage = "failed";
        throw new Error("no");
      }),
    ).rejects.toThrow("no");
    expect((await loadRun(run.id)).stage).toBe("reviewed");
  });

  it("lets a change save the same run without waiting on itself", async () => {
    const run = await createRun("", "https://app.acme.dev");
    await updateRun(run.id, async (latest) => {
      await saveRun({ ...latest, error: "inner" });
      await updateRun(run.id, (inner) => {
        expect(inner.error).toBe("inner");
      });
      latest.error = "outer";
    });
    expect((await loadRun(run.id)).error).toBe("outer");
  });

  it("queues a plain save behind an update that is in progress", async () => {
    const run = await createRun("", "https://app.acme.dev");
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const update = updateRun(run.id, async (latest) => {
      await held;
      latest.error = "from update";
    });
    const save = saveRun({ ...run, stage: "reviewed" });
    release();
    await Promise.all([update, save]);
    // Had the save gone first, the update would have written its own stale stage over it.
    expect(await loadRun(run.id)).toMatchObject({ error: "", stage: "reviewed" });
  });

  it("rejects run ids that could escape the runs folder", async () => {
    await expect(loadRun("../etc")).rejects.toThrow("Invalid run id");
  });
});

describe("example run", () => {
  it("opens at its id and is rewritten from the shipped file, so a stale copy is replaced", async () => {
    const shipped = await loadExampleRun();
    expect(shipped.id).toBe(EXAMPLE_RUN_ID);
    await saveRun({ ...shipped, stage: "failed", error: "stale copy" });

    expect(await loadRun(EXAMPLE_RUN_ID)).toEqual(shipped);
    expect(JSON.parse(await readFile(path.join(dir, EXAMPLE_RUN_ID, "run.json"), "utf8"))).toEqual(shipped);
  });

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

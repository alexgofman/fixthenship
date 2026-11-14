import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Run } from "./types";

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Folder that holds `<runId>/run.json`. Override with RUNS_DIR (used by tests). */
export function runsDir(): string {
  return process.env.RUNS_DIR ?? path.join(process.cwd(), "runs");
}

function exampleRunPath(): string {
  return path.join(process.cwd(), "examples", "example-run.json");
}

function runFile(runId: string): string {
  if (!RUN_ID_PATTERN.test(runId)) throw new Error(`Invalid run id: ${runId}`);
  return path.join(runsDir(), runId, "run.json");
}

export function isValidRunId(runId: string): boolean {
  return RUN_ID_PATTERN.test(runId);
}

export async function loadExampleRun(): Promise<Run> {
  return JSON.parse(await readFile(exampleRunPath(), "utf8")) as Run;
}

/** The sample review shipped in examples/. It opens at /runs/example but is not listed with the real reviews. */
export const EXAMPLE_RUN_ID = "example";

/** Copies the shipped example over the saved one each time, so it never goes stale. */
async function refreshExampleRun(): Promise<void> {
  await saveRun(await loadExampleRun());
}

const queues = new Map<string, Promise<unknown>>();
/** The run ids whose queue the current async call already holds, so nested calls do not wait on themselves. */
const held = new AsyncLocalStorage<ReadonlySet<string>>();

/**
 * Runs `task` after every earlier task queued for the same run, so a load-change-save of one run cannot
 * overwrite another's. A task that is already inside the run's queue runs straight away.
 */
export function withRunQueue<T>(runId: string, task: () => Promise<T>): Promise<T> {
  const holding = held.getStore();
  if (holding?.has(runId)) return task();
  const run = () => held.run(new Set([...(holding ?? []), runId]), task);
  const previous = queues.get(runId) ?? Promise.resolve();
  const result = previous.then(run, run);
  const tail = result.then(
    () => {},
    () => {},
  );
  queues.set(runId, tail);
  void tail.then(() => {
    if (queues.get(runId) === tail) queues.delete(runId);
  });
  return result;
}

async function writeRun(run: Run): Promise<void> {
  const file = runFile(run.id);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(run, null, 2) + "\n", "utf8");
  await rename(tmp, file);
}

export function saveRun(run: Run): Promise<void> {
  return withRunQueue(run.id, () => writeRun(run));
}

/** Loads the latest saved run, applies `change` and saves it, all inside the run's queue. */
export function updateRun(runId: string, change: (run: Run) => void | Promise<void>): Promise<Run> {
  return withRunQueue(runId, async () => {
    const run = await loadRun(runId);
    await change(run);
    await writeRun(run);
    return run;
  });
}

/** `repoUrl` may be empty: the review then uses the running app only. */
export async function createRun(repoUrl: string, appUrl: string): Promise<Run> {
  const run: Run = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    repoUrl,
    appUrl,
    stage: "scanning",
    findings: [],
    fixes: [],
    error: "",
  };
  await saveRun(run);
  return run;
}

export async function loadRun(runId: string): Promise<Run> {
  if (runId === EXAMPLE_RUN_ID) await refreshExampleRun();
  return JSON.parse(await readFile(runFile(runId), "utf8")) as Run;
}

export async function listRuns(): Promise<Run[]> {
  const entries = await readdir(/*turbopackIgnore: true*/ runsDir(), { withFileTypes: true }).catch(
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return [];
      throw err;
    },
  );
  const runs: Run[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidRunId(entry.name) || entry.name === EXAMPLE_RUN_ID) continue;
    try {
      runs.push(JSON.parse(await readFile(runFile(entry.name), "utf8")) as Run);
    } catch {
      // Skip folders without a readable run.json.
    }
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

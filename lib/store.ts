import { randomUUID } from "node:crypto";
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

/** Copies the example run into the runs folder the first time it is needed. */
async function ensureExampleRun(): Promise<void> {
  const example = await loadExampleRun();
  try {
    await readFile(runFile(example.id));
  } catch {
    await saveRun(example);
  }
}

export async function saveRun(run: Run): Promise<void> {
  const file = runFile(run.id);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(run, null, 2) + "\n", "utf8");
  await rename(tmp, file);
}

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
  await ensureExampleRun();
  return JSON.parse(await readFile(runFile(runId), "utf8")) as Run;
}

export async function listRuns(): Promise<Run[]> {
  await ensureExampleRun();
  const entries = await readdir(/*turbopackIgnore: true*/ runsDir(), { withFileTypes: true });
  const runs: Run[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidRunId(entry.name)) continue;
    try {
      runs.push(JSON.parse(await readFile(runFile(entry.name), "utf8")) as Run);
    } catch {
      // Skip folders without a readable run.json.
    }
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

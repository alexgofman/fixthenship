import { pollFixes } from "./pollFixes";
import { errorMessage } from "./status";

export const POLL_INTERVAL_MS = 12_000;
const MAX_LOOP_MS = 6 * 60 * 60 * 1000;

const active = new Map<string, Promise<void>>();

export function isFixLoopActive(runId: string): boolean {
  return active.has(runId);
}

/** Calls pollFixes every 12 seconds in the background until the stage leaves "fixing". */
export function startFixLoop(
  runId: string,
  { intervalMs = POLL_INTERVAL_MS, maxMs = MAX_LOOP_MS }: { intervalMs?: number; maxMs?: number } = {},
): Promise<void> {
  const running = active.get(runId);
  if (running) return running;

  const loop = (async () => {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const run = await pollFixes(runId);
        if (run.stage !== "fixing") return;
      } catch (err) {
        console.error(`fix loop ${runId}: ${errorMessage(err)}`);
      }
    }
    console.error(`fix loop ${runId}: stopped after ${Math.round(maxMs / 60000)} minutes`);
  })().finally(() => active.delete(runId));

  active.set(runId, loop);
  return loop;
}

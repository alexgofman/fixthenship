// Relative imports so the tests can load this route without the "@/" alias.
import { startFixLoop } from "../../../../../lib/fix/loop";
import { FixStageError, startFixes } from "../../../../../lib/fix/startFixes";
import { isValidRunId, loadRun } from "../../../../../lib/store";

// Starts the fix sessions, then polls them every 12 seconds in the background until the stage is "fixed".
// 409 unless the review is finished, or a fix ended in error and is tried again.
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[runId]/fix">) {
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  const existing = await loadRun(runId).catch(() => null);
  if (!existing) return Response.json({ error: "Run not found" }, { status: 404 });

  try {
    const run = await startFixes(runId);
    if (run.stage === "fixing") void startFixLoop(runId);
    return Response.json(run);
  } catch (err) {
    if (err instanceof FixStageError) return Response.json({ error: err.message }, { status: 409 });
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Could not start fixes: ${message}` }, { status: 500 });
  }
}

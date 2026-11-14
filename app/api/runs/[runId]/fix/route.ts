import { isValidRunId, loadRun } from "@/lib/store";
import { isFixLoopActive, startFixLoop } from "@/lib/fix/loop";
import { startFixes } from "@/lib/fix/startFixes";

// Starts the fix sessions, then polls them every 12 seconds in the background until the stage is "fixed".
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[runId]/fix">) {
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  const existing = await loadRun(runId).catch(() => null);
  if (!existing) return Response.json({ error: "Run not found" }, { status: 404 });
  if (isFixLoopActive(runId)) return Response.json(existing);

  try {
    const run = await startFixes(runId);
    if (run.stage === "fixing") void startFixLoop(runId);
    return Response.json(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Could not start fixes: ${message}` }, { status: 500 });
  }
}

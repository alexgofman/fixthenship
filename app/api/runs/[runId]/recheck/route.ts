import { isValidRunId, loadRun } from "@/lib/store";
import { isRecheckActive, startRecheck } from "@/lib/recheck/recheckApp";

// Starts the re-check in the background: merge the fixes, run the fixed app, set each finding's final state.
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[runId]/recheck">) {
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  const run = await loadRun(runId).catch(() => null);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (isRecheckActive(runId)) return Response.json(run);

  void startRecheck(runId);
  return Response.json({ ...run, stage: "rechecking" });
}

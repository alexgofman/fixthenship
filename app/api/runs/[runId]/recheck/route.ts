// Relative imports so the tests can load this route without the "@/" alias.
import { isRecheckActive, startRecheck } from "../../../../../lib/recheck/recheckApp";
import { isValidRunId, loadRun } from "../../../../../lib/store";

// Starts the re-check in the background: merge the fixes, run the fixed app, set each finding's final state.
// 409 unless the fixes are done ("fixed") or an earlier re-check is ("done").
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[runId]/recheck">) {
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  const run = await loadRun(runId).catch(() => null);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  if (run.stage !== "fixed" && run.stage !== "done") {
    return Response.json({ error: `The review cannot be checked again while it is ${run.stage}` }, { status: 409 });
  }
  if (isRecheckActive(runId)) return Response.json(run);

  void startRecheck(runId);
  return Response.json({ ...run, stage: "rechecking" });
}

import { isValidRunId, loadRun, saveRun } from "@/lib/store";

// Stub: no re-check is performed yet.
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[runId]/recheck">) {
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  const run = await loadRun(runId).catch(() => null);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  run.stage = "done";
  await saveRun(run);
  return Response.json(run);
}

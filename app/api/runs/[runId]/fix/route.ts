import { isValidRunId, loadRun, saveRun } from "@/lib/store";

// Stub: no coding-agent sessions are started yet.
export async function POST(_request: Request, ctx: RouteContext<"/api/runs/[runId]/fix">) {
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  const run = await loadRun(runId).catch(() => null);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  run.stage = "fixing";
  await saveRun(run);
  run.stage = "fixed";
  await saveRun(run);
  return Response.json(run);
}

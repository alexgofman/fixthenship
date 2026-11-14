import { connection } from "next/server";
import { isFixLoopActive, startFixLoop } from "@/lib/fix/loop";
import { isValidRunId, loadRun } from "@/lib/store";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[runId]">) {
  await connection();
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  try {
    const run = await loadRun(runId);
    // The Devin poller lives in this process. After a restart, the next look at the run starts it again.
    if (run.stage === "fixing" && !isFixLoopActive(runId)) void startFixLoop(runId);
    return Response.json(run);
  } catch {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }
}

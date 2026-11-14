import { connection } from "next/server";
// Relative imports so the tests can load this route without the "@/" alias.
import { isFixLoopActive, startFixLoop } from "../../../../lib/fix/loop";
import { REVIEW_INTERRUPTED, isReviewActive } from "../../../../lib/review/pipeline";
import { isValidRunId, loadRun, saveRun } from "../../../../lib/store";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[runId]">) {
  await connection();
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  try {
    const run = await loadRun(runId);
    // A review lives in this process. After a restart nothing resumes it, so say it stopped.
    if ((run.stage === "scanning" || run.stage === "checking") && !isReviewActive(runId)) {
      run.stage = "failed";
      run.error = REVIEW_INTERRUPTED;
      await saveRun(run);
    }
    // The Devin poller lives in this process. After a restart, the next look at the run starts it again.
    if (run.stage === "fixing" && !isFixLoopActive(runId)) void startFixLoop(runId);
    return Response.json(run);
  } catch {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }
}

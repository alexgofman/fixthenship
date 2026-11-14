import { connection } from "next/server";
import { isValidRunId, loadRun } from "@/lib/store";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[runId]">) {
  await connection();
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  try {
    return Response.json(await loadRun(runId));
  } catch {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }
}

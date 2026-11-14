import { serveRunFile } from "../../../../../../lib/fix/files";

export async function GET(_request: Request, ctx: RouteContext<"/api/runs/[runId]/files/[...path]">) {
  const { runId, path } = await ctx.params;
  return serveRunFile(runId, path);
}

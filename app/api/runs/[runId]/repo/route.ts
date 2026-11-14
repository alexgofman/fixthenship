// Relative imports so the tests can load this route without the "@/" alias.
import { startFixLoop } from "../../../../../lib/fix/loop";
import { startFixes } from "../../../../../lib/fix/startFixes";
import { addRepo } from "../../../../../lib/review/pipeline";
import { isValidRunId, loadRun } from "../../../../../lib/store";

/** `https://github.com/<owner>/<repo>` for a GitHub repository link, otherwise null. */
function gitHubRepoUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !/^(www\.)?github\.com$/i.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/);
  if (!match || match[2] === "." || match[2] === "..") return null;
  return `https://github.com/${match[1]}/${match[2]}`;
}

// Adds the repository to a run reviewed without code, scans it, then starts the fixes.
export async function POST(request: Request, ctx: RouteContext<"/api/runs/[runId]/repo">) {
  const { runId } = await ctx.params;
  if (!isValidRunId(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const repoUrl = gitHubRepoUrl(String(body.repoUrl ?? ""));
  if (!repoUrl) {
    return Response.json(
      { error: "That is not a GitHub repository link. It looks like https://github.com/you/your-app" },
      { status: 400 },
    );
  }
  const existing = await loadRun(runId).catch(() => null);
  if (!existing) return Response.json({ error: "Run not found" }, { status: 404 });
  if (existing.repoUrl) return Response.json({ error: "This review already has a repository" }, { status: 409 });
  if (existing.stage !== "reviewed") {
    return Response.json({ error: "The review is not finished yet" }, { status: 409 });
  }

  try {
    await addRepo(runId, repoUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Could not read the repository: ${message}` }, { status: 400 });
  }

  try {
    const run = await startFixes(runId);
    if (run.stage === "fixing") void startFixLoop(runId);
    return Response.json(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Could not start fixes: ${message}` }, { status: 500 });
  }
}

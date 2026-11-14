import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { isValidRunId, runsDir } from "../store";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function inside(root: string, target: string): boolean {
  return target.startsWith(root + path.sep);
}

/** Serves runs/<runId>/<parts...> (images, md, txt); anything that leaves that folder is refused. */
export async function serveRunFile(runId: string, parts: string[]): Promise<Response> {
  const notFound = () => Response.json({ error: "File not found" }, { status: 404 });
  if (!isValidRunId(runId)) return notFound();
  if (!parts.length || parts.some((p) => p.includes("\0") || p.includes("\\"))) {
    return Response.json({ error: "Invalid path" }, { status: 400 });
  }

  const root = path.resolve(runsDir(), runId);
  const target = path.resolve(root, ...parts);
  if (!inside(root, target)) return Response.json({ error: "Invalid path" }, { status: 400 });

  const type = CONTENT_TYPES[path.extname(target).toLowerCase()];
  if (!type) return Response.json({ error: "Unsupported file type" }, { status: 415 });

  try {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(target)]);
    if (!inside(realRoot, realTarget)) return Response.json({ error: "Invalid path" }, { status: 400 });
    const body = await readFile(realTarget);
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
    });
  } catch {
    return notFound();
  }
}

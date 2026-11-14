import { connection } from "next/server";
import { reviewApp } from "@/lib/review/pipeline";
import { createRun, listRuns } from "@/lib/store";

export async function GET() {
  await connection();
  return Response.json(await listRuns());
}

async function readFields(request: Request): Promise<{ repoUrl: string; appUrl: string; isJson: boolean }> {
  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  if (isJson) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return { repoUrl: String(body.repoUrl ?? "").trim(), appUrl: String(body.appUrl ?? "").trim(), isJson };
  }
  const form = await request.formData();
  return {
    repoUrl: String(form.get("repoUrl") ?? "").trim(),
    appUrl: String(form.get("appUrl") ?? "").trim(),
    isJson,
  };
}

export async function POST(request: Request) {
  const { repoUrl, appUrl, isJson } = await readFields(request);
  if (!appUrl) {
    return Response.json({ error: "appUrl is required" }, { status: 400 });
  }

  const run = await createRun(repoUrl, appUrl);
  // Not awaited: the review takes minutes and records its progress in run.json.
  void reviewApp(run.id);

  if (isJson) return Response.json(run, { status: 201 });
  return new Response(null, { status: 303, headers: { Location: `/runs/${run.id}` } });
}

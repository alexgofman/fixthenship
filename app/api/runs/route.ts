import { connection } from "next/server";
// Relative imports so the tests can load this route without the "@/" alias.
import { cleanRejectionText } from "../../../lib/decoder";
import { gitHubRepoUrl } from "../../../lib/fix/github";
import { reviewApp } from "../../../lib/review/pipeline";
import { createRun, listRuns } from "../../../lib/store";

export async function GET() {
  await connection();
  return Response.json(await listRuns());
}

type Fields = { repoUrl: string; appUrl: string; rejectionText: string; isJson: boolean };

async function readFields(request: Request): Promise<Fields> {
  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  if (isJson) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      repoUrl: String(body.repoUrl ?? "").trim(),
      appUrl: String(body.appUrl ?? "").trim(),
      rejectionText: cleanRejectionText(body.rejectionText),
      isJson,
    };
  }
  const form = await request.formData();
  return {
    repoUrl: String(form.get("repoUrl") ?? "").trim(),
    appUrl: String(form.get("appUrl") ?? "").trim(),
    rejectionText: cleanRejectionText(form.get("rejectionText")),
    isJson,
  };
}

export async function POST(request: Request) {
  const fields = await readFields(request);
  const { appUrl, isJson } = fields;
  if (!appUrl) {
    return Response.json({ error: "appUrl is required" }, { status: 400 });
  }
  const repoUrl = fields.repoUrl ? gitHubRepoUrl(fields.repoUrl) : "";
  if (repoUrl === null) {
    return Response.json(
      { error: "That is not a GitHub repository link. It looks like https://github.com/you/your-app" },
      { status: 400 },
    );
  }

  const run = await createRun(repoUrl, appUrl, fields.rejectionText);
  // Not awaited: the review takes minutes and records its progress in run.json.
  void reviewApp(run.id);

  if (isJson) return Response.json(run, { status: 201 });
  return new Response(null, { status: 303, headers: { Location: `/runs/${run.id}` } });
}

import type { FixStatus } from "../types";

const API_ROOT = "https://api.devin.ai/v3/organizations";

export type CreateSessionOptions = {
  title?: string;
  tags?: string[];
  maxAcu?: number;
  schema?: object;
  /** Devin's mode, e.g. "fast" or "ultra"; falls back to DEVIN_MODE, else the account's default. */
  mode?: string;
};

export type DevinSession = {
  status: FixStatus;
  prUrl: string;
  summary: string;
  acus: number;
};

/** The subset of Devin's v3 SessionResponse that we read. */
export type DevinSessionResponse = {
  session_id: string;
  url: string;
  status: string;
  status_detail?: string | null;
  acus_consumed?: number;
  pull_requests?: { pr_url: string; pr_state?: string | null }[];
  structured_output?: Record<string, unknown> | null;
};

export function hasDevinKey(): boolean {
  return Boolean(process.env.DEVIN_API_KEY);
}

function config(): { base: string; key: string } {
  const key = process.env.DEVIN_API_KEY;
  const org = process.env.DEVIN_ORG_ID;
  if (!key) throw new Error("DEVIN_API_KEY is not set");
  if (!org) throw new Error("DEVIN_ORG_ID is not set");
  return { base: `${API_ROOT}/${encodeURIComponent(org)}`, key };
}

async function devinFetch(pathname: string, init: RequestInit = {}): Promise<unknown> {
  const { base, key } = config();
  const res = await fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Devin API ${init.method ?? "GET"} ${pathname} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

const ERROR_DETAILS = new Set([
  "error",
  "usage_limit_exceeded",
  "out_of_credits",
  "out_of_quota",
  "no_quota_allocation",
  "payment_declined",
  "org_usage_limit_exceeded",
  "user_usage_limit_exceeded",
  "total_session_limit_exceeded",
  "contract_expired",
]);

/** Maps Devin's status and status_detail onto our five fix statuses. */
export function mapStatus(status: string, detail?: string | null): FixStatus {
  if (status === "error" || (detail && ERROR_DETAILS.has(detail))) return "error";
  switch (status) {
    case "new":
    case "claimed":
      return "queued";
    case "running":
      if (detail === "waiting_for_user" || detail === "waiting_for_approval") return "waiting";
      if (detail === "finished") return "finished";
      return "working";
    case "resuming":
      return "working";
    case "exit":
      return "finished";
    case "suspended":
      // Suspended for inactivity, on request or after finishing: the session's work is over.
      return "finished";
    default:
      return "working";
  }
}

export function toDevinSession(body: DevinSessionResponse): DevinSession {
  const output = body.structured_output ?? {};
  const summary = typeof output.summary === "string" ? output.summary : "";
  return {
    status: mapStatus(body.status, body.status_detail),
    prUrl: body.pull_requests?.[0]?.pr_url ?? "",
    summary,
    acus: typeof body.acus_consumed === "number" ? body.acus_consumed : 0,
  };
}

export function createSessionBody(prompt: string, options: CreateSessionOptions = {}): Record<string, unknown> {
  const body: Record<string, unknown> = { prompt };
  if (options.title !== undefined) body.title = options.title;
  if (options.tags !== undefined) body.tags = options.tags;
  if (options.maxAcu !== undefined) body.max_acu_limit = options.maxAcu;
  if (options.schema !== undefined) body.structured_output_schema = options.schema;
  const mode = options.mode || process.env.DEVIN_MODE;
  if (mode) body.devin_mode = mode;
  return body;
}

export async function createSession(
  prompt: string,
  options: CreateSessionOptions = {},
): Promise<{ sessionId: string; url: string }> {
  const body = (await devinFetch("/sessions", {
    method: "POST",
    body: JSON.stringify(createSessionBody(prompt, options)),
  })) as DevinSessionResponse;
  return { sessionId: body.session_id, url: body.url };
}

export async function getSession(sessionId: string): Promise<DevinSession> {
  const body = (await devinFetch(`/sessions/${encodeURIComponent(sessionId)}`)) as DevinSessionResponse;
  return toDevinSession(body);
}

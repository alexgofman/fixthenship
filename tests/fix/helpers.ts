import { vi } from "vitest";
import type { Finding, Run } from "../../lib/types";

export type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
export type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

/** Installs a fake global fetch; `routes` maps "METHOD url-substring" to a handler (first match wins). */
export function fakeFetch(routes: [string, Handler][]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    calls.push({
      url,
      method,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    for (const [key, handler] of routes) {
      const [m, part] = key.split(" ");
      if (m === method && url.includes(part)) return handler(url, init);
    }
    return json({ message: `No fake for ${method} ${url}` }, 404);
  });
  return calls;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function finding(ruleId: Finding["ruleId"], state: Finding["state"], fixable: Finding["fixable"]): Finding {
  return {
    ruleId,
    guideline: "x",
    title: `Title ${ruleId}`,
    detail: `Detail ${ruleId}`,
    source: "code",
    evidence: [{ kind: "code", file: "src/App.tsx", line: 12, caption: `Caption ${ruleId}` }],
    confidence: "high",
    state,
    fixable,
    finalState: "",
    humanStep: "",
  };
}

export function makeRun(id: string, findings: Finding[]): Run {
  return {
    id,
    createdAt: new Date().toISOString(),
    repoUrl: "https://github.com/acme/app",
    appUrl: "https://app.acme.dev",
    stage: "reviewed",
    findings,
    fixes: [],
    error: "",
  };
}

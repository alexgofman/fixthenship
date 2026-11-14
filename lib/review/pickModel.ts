const API = "https://generativelanguage.googleapis.com/v1beta/models";

export type PickModelDeps = { fetch: typeof fetch; timeoutMs: number };

/** MODEL first, then the comma-separated MODEL_FALLBACKS, without repeats. */
export function modelCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const names = [env.MODEL ?? "", ...(env.MODEL_FALLBACKS ?? "").split(",")].map((n) => n.trim()).filter(Boolean);
  return [...new Set(names)];
}

/**
 * The first model that answers right now. A free key has a daily limit per model, and a model can be
 * overloaded; one small question before a review starts is cheaper than ten checks that all time out.
 * Returns undefined when there is nothing to choose between (the checks then use their own default).
 */
export async function pickModel(overrides: Partial<PickModelDeps> = {}, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const deps: PickModelDeps = { fetch: (...args) => fetch(...args), timeoutMs: 8_000, ...overrides };
  const candidates = modelCandidates(env);
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (candidates.length < 2 || !key) return candidates[0];

  for (const model of candidates) {
    try {
      const res = await deps.fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word: ok" }] }] }),
        signal: AbortSignal.timeout(deps.timeoutMs),
      });
      if (res.ok) return model;
      console.error(`pickModel: ${model} answered ${res.status}; trying the next one`);
    } catch (err) {
      console.error(`pickModel: ${model} did not answer (${err instanceof Error ? err.message : String(err)}); trying the next one`);
    }
  }
  return candidates[0];
}

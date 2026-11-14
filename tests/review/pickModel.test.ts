import { describe, expect, it } from "vitest";
import { modelCandidates, pickModel } from "../../lib/review/pickModel";

const env = (extra: Record<string, string>) => ({ GOOGLE_GENERATIVE_AI_API_KEY: "k", ...extra }) as unknown as NodeJS.ProcessEnv;

function fakeFetch(statusByModel: Record<string, number | "throw">) {
  const asked: string[] = [];
  const fetch = (async (input: string | URL) => {
    const model = decodeURIComponent(String(input).split("/models/")[1].split(":")[0]);
    asked.push(model);
    const status = statusByModel[model];
    if (status === "throw") throw new Error("timed out");
    return new Response("{}", { status });
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}

describe("pickModel", () => {
  it("lists MODEL first, then the fallbacks, without repeats or blanks", () => {
    expect(modelCandidates(env({ MODEL: "a", MODEL_FALLBACKS: " b, a ,,c " }))).toEqual(["a", "b", "c"]);
    expect(modelCandidates(env({}))).toEqual([]);
  });

  it("asks nothing when there is no choice to make", async () => {
    const f = fakeFetch({});
    expect(await pickModel({ fetch: f.fetch }, env({ MODEL: "a" }))).toBe("a");
    expect(await pickModel({ fetch: f.fetch }, env({}))).toBeUndefined();
    expect(await pickModel({ fetch: f.fetch }, { MODEL: "a", MODEL_FALLBACKS: "b" } as unknown as NodeJS.ProcessEnv)).toBe("a");
    expect(f.asked).toEqual([]);
  });

  it("skips a model that is over its limit or does not answer, and takes the first that does", async () => {
    const f = fakeFetch({ a: 429, b: "throw", c: 200, d: 200 });
    expect(await pickModel({ fetch: f.fetch }, env({ MODEL: "a", MODEL_FALLBACKS: "b,c,d" }))).toBe("c");
    expect(f.asked).toEqual(["a", "b", "c"]);
  });

  it("falls back to MODEL when none answers, so the checks report the real error", async () => {
    const f = fakeFetch({ a: 429, b: 503 });
    expect(await pickModel({ fetch: f.fetch }, env({ MODEL: "a", MODEL_FALLBACKS: "b" }))).toBe("a");
  });
});

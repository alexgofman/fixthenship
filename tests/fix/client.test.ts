import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, getSession, mapStatus, sendMessage } from "../../lib/devin/client";
import { fakeFetch, json } from "./helpers";

beforeEach(() => {
  process.env.DEVIN_API_KEY = "cog_test";
  process.env.DEVIN_ORG_ID = "org-123";
});

afterEach(() => {
  delete process.env.DEVIN_API_KEY;
  delete process.env.DEVIN_ORG_ID;
  delete process.env.DEVIN_MODE;
  vi.unstubAllGlobals();
});

describe("mapStatus", () => {
  it.each([
    ["new", null, "queued"],
    ["claimed", null, "queued"],
    ["running", "working", "working"],
    ["running", "waiting_for_user", "waiting"],
    ["running", "finished", "finished"],
    ["exit", null, "finished"],
    ["suspended", "finished", "finished"],
    ["suspended", "inactivity", "finished"],
    ["error", null, "error"],
    ["error", "error", "error"],
    ["suspended", "out_of_quota", "error"],
    ["running", "out_of_quota", "error"],
    ["suspended", "error", "error"],
  ] as const)("%s / %s -> %s", (status, detail, expected) => {
    expect(mapStatus(status, detail)).toBe(expected);
  });
});

describe("Devin client", () => {
  it("creates a session with the v3 body and bearer key", async () => {
    const calls = fakeFetch([["POST /sessions", () => json({ session_id: "devin-1", url: "https://app.devin.ai/sessions/1", status: "new" })]]);
    const schema = { type: "object" };
    const result = await createSession("Fix it", { title: "T", tags: ["fixthenship-r1"], maxAcu: 5, schema });

    expect(result).toEqual({ sessionId: "devin-1", url: "https://app.devin.ai/sessions/1" });
    expect(calls[0].url).toBe("https://api.devin.ai/v3/organizations/org-123/sessions");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.Authorization).toBe("Bearer cog_test");
    expect(calls[0].body).toEqual({
      prompt: "Fix it",
      title: "T",
      tags: ["fixthenship-r1"],
      max_acu_limit: 5,
      structured_output_schema: schema,
    });
  });

  it("sends devin_mode from the option or DEVIN_MODE, and none when neither is set", async () => {
    const calls = fakeFetch([["POST /sessions", () => json({ session_id: "devin-1", url: "u", status: "new" })]]);

    await createSession("Fix it");
    process.env.DEVIN_MODE = "ultra";
    await createSession("Fix it");
    await createSession("Fix it", { mode: "fast" });

    expect(calls[0].body).not.toHaveProperty("devin_mode");
    expect(calls[1].body).toMatchObject({ devin_mode: "ultra" });
    expect(calls[2].body).toMatchObject({ devin_mode: "fast" });
  });

  it("reads status, first pull request, summary and ACUs", async () => {
    const calls = fakeFetch([
      [
        "GET /sessions/devin-1",
        () =>
          json({
            session_id: "devin-1",
            url: "u",
            status: "running",
            status_detail: "finished",
            acus_consumed: 2.5,
            pull_requests: [{ pr_url: "https://github.com/acme/app/pull/7", pr_state: "open" }, { pr_url: "other", pr_state: "open" }],
            structured_output: { summary: "Added privacy link", prUrl: "x" },
          }),
      ],
    ]);
    expect(await getSession("devin-1")).toEqual({
      status: "finished",
      prUrl: "https://github.com/acme/app/pull/7",
      summary: "Added privacy link",
      acus: 2.5,
    });
    expect(calls[0].url).toBe("https://api.devin.ai/v3/organizations/org-123/sessions/devin-1");
  });

  it("handles sessions with no pull request or structured output", async () => {
    fakeFetch([["GET /sessions/", () => json({ session_id: "d", url: "u", status: "suspended", status_detail: "out_of_quota", acus_consumed: 5, pull_requests: [], structured_output: null })]]);
    expect(await getSession("d")).toEqual({ status: "error", prUrl: "", summary: "", acus: 5 });
  });

  it("takes the pull request from structured_output.prUrl when pull_requests is empty", async () => {
    fakeFetch([
      [
        "GET /sessions/",
        () =>
          json({
            session_id: "d",
            url: "u",
            status: "exit",
            pull_requests: [],
            structured_output: { summary: "Added support page", prUrl: "https://github.com/acme/app/pull/9" },
          }),
      ],
    ]);
    expect(await getSession("d")).toMatchObject({ status: "finished", prUrl: "https://github.com/acme/app/pull/9" });
  });

  it("sends a message to a session", async () => {
    const calls = fakeFetch([["POST /sessions/devin-1/messages", () => json({ session_id: "devin-1" })]]);
    await sendMessage("devin-1", "Merge store-ready");
    expect(calls[0].url).toBe("https://api.devin.ai/v3/organizations/org-123/sessions/devin-1/messages");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.Authorization).toBe("Bearer cog_test");
    expect(calls[0].body).toEqual({ message: "Merge store-ready" });
  });

  it("throws when a message cannot be sent", async () => {
    fakeFetch([["POST /sessions/devin-1/messages", () => json({ detail: "gone" }, 404)]]);
    await expect(sendMessage("devin-1", "hi")).rejects.toThrow("404");
  });

  it("throws on API errors", async () => {
    fakeFetch([["GET /sessions/", () => json({ detail: "nope" }, 500)]]);
    await expect(getSession("d")).rejects.toThrow("500");
  });
});

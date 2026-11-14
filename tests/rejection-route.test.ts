import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REJECTION_TEXT_MAX } from "../lib/decoder";

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("../lib/review/pipeline", () => ({ reviewApp: vi.fn(async () => {}) }));

const { POST } = await import("../app/api/runs/route");
const { loadRun } = await import("../lib/store");

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-rejection-"));
  process.env.RUNS_DIR = dir;
});
afterEach(async () => {
  delete process.env.RUNS_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function postJson(body: Record<string, unknown>) {
  const res = await POST(
    new Request("http://localhost/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  expect(res.status).toBe(201);
  return loadRun(((await res.json()) as { id: string }).id);
}

async function postForm(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const res = await POST(new Request("http://localhost/api/runs", { method: "POST", body: form }));
  expect(res.status).toBe(303);
  const id = res.headers.get("Location")!.split("/").pop()!;
  return loadRun(id);
}

const MESSAGE = "Guideline 5.1.1(v) - Legal - Privacy - Data Collection and Storage\n\nThe app supports account creation...";

describe("POST /api/runs with Apple's message", () => {
  it("stores the trimmed message from the form", async () => {
    const run = await postForm({ appUrl: "https://app.test", rejectionText: `\n  ${MESSAGE}  \n` });
    expect(run.rejectionText).toBe(MESSAGE);
  });

  it("stores it from a JSON body too", async () => {
    expect((await postJson({ appUrl: "https://app.test", rejectionText: MESSAGE })).rejectionText).toBe(MESSAGE);
  });

  it("cuts it at the limit", async () => {
    const long = "Guideline 2.1 ".padEnd(REJECTION_TEXT_MAX + 500, "x");
    const run = await postForm({ appUrl: "https://app.test", rejectionText: long });
    expect(run.rejectionText).toBe(long.slice(0, REJECTION_TEXT_MAX));
  });

  it("stores no field when the message is empty, blank or not text", async () => {
    expect(await postForm({ appUrl: "https://app.test", rejectionText: "   " })).not.toHaveProperty("rejectionText");
    expect(await postJson({ appUrl: "https://app.test" })).not.toHaveProperty("rejectionText");
    expect(await postJson({ appUrl: "https://app.test", rejectionText: { html: "<b>x</b>" } })).not.toHaveProperty(
      "rejectionText",
    );
  });
});

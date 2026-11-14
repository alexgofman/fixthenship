import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import snapshotFile from "../content/guidelines-snapshot.json" with { type: "json" };
import { reviewApp, type ReviewDeps } from "../review/pipeline";
import { createRun, loadRun } from "../store";
import type { CheckResult } from "../types";
import {
  CITED_SECTIONS,
  GUIDELINES_URL,
  MEMORY_MS,
  checkGuidelines,
  forgetGuidelinesCheck,
  parseSections,
  sectionFor,
  type GuidelinesSnapshot,
} from "./freshness";
import { hashSections } from "./sections.mjs";

// Cut from the live page (14 November 2026): the end of 5.1's intro, the start of 5.1.1 and its (i) sub-point.
const FIXTURE = `<li data-nr data-sidenav="5.1 Privacy" id="privacy"><span id="5.1"></span><strong>5.1 Privacy</strong>
<p data-nr>Protecting user privacy is paramount in the Apple ecosystem, and you should use care when handling personal data to ensure you’ve complied with <a href="/support/terms/">Apple&nbsp;Developer Program License Agreement</a>, not to mention customer expectations. More particularly:</p>
	<ul class="no-bullet margin-top-small">
		<li data-nr data-sidenav="5.1.1 Data Collection and Storage" id="data-collection-and-storage"><span id="5.1.1"></span><strong>5.1.1<span class="custom-tooltip-icon"><img src="/app-store/review/images/key-icon.svg" height="17" class="asr-nr" alt="ASR & NR" /></span> Data Collection and Storage</strong>
			<ul class="no-bullet margin-top-small">
				<li data-nr><strong>(i) Privacy Policies: </strong>All apps must include a link to their privacy policy in the App&nbsp;Store&nbsp;Connect metadata field and within the app in an easily accessible manner.</li>
			</ul>
		</li>
	</ul>
</li>
<h3 data-sidenav="After You Submit" id="after-you-submit">After You Submit</h3><p>Not a guideline.</p>`;

function sha(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

/** A page with `count` numbered sections; `edit` changes one section's text. */
function page(keys: string[], edit: Record<string, string> = {}) {
  return keys.map((k) => `<li data-nr><span id="${k}"></span><strong>${k}</strong> ${edit[k] ?? `Text of ${k}.`}</li>`).join("\n");
}

const KEYS = [...new Set([...CITED_SECTIONS, ...Array.from({ length: 70 }, (_, i) => `9.${i + 1}`)])];

function snapshotOf(keys: string[]): GuidelinesSnapshot {
  const sections: Record<string, string> = {};
  for (const [k, text] of Object.entries(parseSections(page(keys)))) sections[k] = sha(text);
  return { takenAt: "2026-11-14", source: GUIDELINES_URL, sections };
}

function answering(html: string, status = 200) {
  return vi.fn(async () => new Response(html, { status })) as unknown as typeof fetch;
}

beforeEach(() => forgetGuidelinesCheck());

describe("parseSections", () => {
  it("reads each numbered section of the real markup, sub-points included, whitespace collapsed", () => {
    const sections = parseSections(FIXTURE);
    expect(Object.keys(sections)).toEqual(["5.1", "5.1.1"]);
    expect(sections["5.1"]).toBe(
      "5.1 Privacy Protecting user privacy is paramount in the Apple ecosystem, and you should use care when handling personal data to ensure you’ve complied with Apple Developer Program License Agreement , not to mention customer expectations. More particularly:",
    );
    expect(sections["5.1.1"]).toMatch(/^5\.1\.1 Data Collection and Storage \(i\) Privacy Policies: All apps must include/);
    expect(sections["5.1.1"]).toMatch(/easily accessible manner\.$/);
    expect(sections["5.1.1"]).not.toContain("After You Submit");
  });

  it("hashes like the snapshot script: sha256 of the section text", async () => {
    const sections = parseSections(FIXTURE);
    expect(await hashSections(sections)).toEqual({ "5.1": sha(sections["5.1"]), "5.1.1": sha(sections["5.1.1"]) });
  });
});

describe("sectionFor", () => {
  it("drops lettered and roman sub-points", () => {
    expect(sectionFor("5.1.1(v)")).toBe("5.1.1");
    expect(sectionFor("2.1(a)")).toBe("2.1");
    expect(sectionFor("4.2.6")).toBe("4.2.6");
    expect(CITED_SECTIONS).toEqual(expect.arrayContaining(["2.1", "5.1.1", "5.1.2", "4.8", "3.1.1", "1.2", "1.5", "4.2", "4.2.6"]));
  });
});

describe("checkGuidelines", () => {
  const snapshot = snapshotOf(KEYS);
  const now = () => Date.parse("2026-11-14T15:04:00Z");

  it("is unchanged when every section matches", async () => {
    const fetch = answering(page(KEYS));
    const result = await checkGuidelines({ fetch, snapshot, now });
    expect(result).toEqual({ checkedAt: "2026-11-14T15:04:00.000Z", status: "unchanged", snapshotDate: "2026-11-14", changed: [], changedElsewhere: 0 });
    expect(fetch).toHaveBeenCalledWith(GUIDELINES_URL, expect.objectContaining({ signal: expect.any(AbortSignal), credentials: "omit" }));
  });

  it("names a changed cited section, and a removed one", async () => {
    const result = await checkGuidelines({ fetch: answering(page(KEYS.filter((k) => k !== "4.8"), { "5.1.1": "New text." })), snapshot, now });
    expect(result.status).toBe("changed");
    expect(result.changed).toEqual(["4.8", "5.1.1"]);
    expect(result.changedElsewhere).toBe(0);
  });

  it("only counts sections no check cites, including added ones", async () => {
    const result = await checkGuidelines({ fetch: answering(page([...KEYS, "9.99"], { "9.3": "Edited." })), snapshot, now });
    expect(result.status).toBe("unchanged");
    expect(result.changed).toEqual([]);
    expect(result.changedElsewhere).toBe(2);
  });

  it("is unreachable on a network error", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;
    expect((await checkGuidelines({ fetch, snapshot, now })).status).toBe("unreachable");
  });

  it("is unreachable when the page does not answer in time", async () => {
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))),
    ) as unknown as typeof globalThis.fetch;
    const result = await checkGuidelines({ fetch, snapshot, now, timeoutMs: 30 });
    expect(result).toMatchObject({ status: "unreachable", changed: [], changedElsewhere: 0 });
  });

  it("is unreachable on HTTP 403, never changed", async () => {
    expect((await checkGuidelines({ fetch: answering(page(KEYS), 403), snapshot, now })).status).toBe("unreachable");
  });

  it("is unreachable when fewer than 60 sections are found", async () => {
    const result = await checkGuidelines({ fetch: answering(page(KEYS.slice(0, 59))), snapshot, now });
    expect(result.status).toBe("unreachable");
    expect(result.changed).toEqual([]);
  });

  it("remembers the result for 10 minutes", async () => {
    let t = now();
    const fetch = answering(page(KEYS));
    const deps = { fetch, snapshot, now: () => t };
    await checkGuidelines(deps);
    t += MEMORY_MS - 1;
    await checkGuidelines(deps);
    expect(fetch).toHaveBeenCalledTimes(1);
    t += 2;
    await checkGuidelines(deps);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("ships a snapshot of the live page", () => {
    expect(Object.keys(snapshotFile.sections).length).toBeGreaterThanOrEqual(60);
    for (const key of CITED_SECTIONS) expect(snapshotFile.sections).toHaveProperty([key]);
  });
});

describe("reviewApp and the guidelines check", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-guidelines-"));
    process.env.RUNS_DIR = dir;
  });
  afterEach(async () => {
    delete process.env.RUNS_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  const runChecks: ReviewDeps["runChecks"] = async (_appUrl, _outDir, ruleIds, options) => {
    const results: CheckResult[] = [];
    for (const ruleId of ruleIds) {
      const result: CheckResult = { ruleId, outcome: ruleId === "R6" ? "fail" : "pass", reason: `${ruleId} said so`, steps: [], screenshots: [] };
      await options.onResult?.(result);
      results.push(result);
    }
    return results;
  };

  async function reviewWith(check: ReviewDeps["checkGuidelines"]) {
    const run = await createRun("", "https://app.test");
    await reviewApp(run.id, { waitForApp: async () => true, runChecks, checkGuidelines: check });
    return loadRun(run.id);
  }

  it("saves the answer on the run", async () => {
    const answer = { checkedAt: "2026-11-14T15:04:00.000Z", status: "unchanged" as const, snapshotDate: "2026-11-14", changed: [], changedElsewhere: 0 };
    const saved = await reviewWith(async () => answer);
    expect(saved.stage).toBe("reviewed");
    expect(saved.guidelines).toEqual(answer);
  });

  it("finishes with the same findings when the check rejects or never answers", async () => {
    const baseline = await reviewWith(async () => ({ checkedAt: "", status: "unreachable", snapshotDate: "2026-11-14", changed: [], changedElsewhere: 0 }));
    const rejected = await reviewWith(() => Promise.reject(new Error("boom")));
    const silent = await reviewWith(() => new Promise(() => {}));
    for (const saved of [rejected, silent]) {
      expect(saved.stage).toBe("reviewed");
      expect(saved.error).toBe("");
      expect(saved.findings).toEqual(baseline.findings);
      expect(saved.guidelines).toBeUndefined();
    }
    expect(baseline.findings.length).toBeGreaterThan(0);
  });
});

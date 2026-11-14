import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadExampleRun } from "../lib/store";
import { NOTE_LINES, reviewNotes } from "../components/ReadyReport";
import { reviewNotes as exportedNotes, HIDDEN_REVIEWER_EMAIL, redactReviewerEmails, renderRunHtml, SAVED_COPY_LINE } from "../scripts/export-run.mjs";
import { PLAIN_WORDS } from "../lib/plainWords";
import { BEFORE_YOU_SUBMIT_LEAD, BEFORE_YOU_SUBMIT_TITLE, CHECKLIST } from "../components/BeforeYouSubmit";
import { rejectionSentence, summaryLine } from "../components/findingDisplay";

const run = promisify(execFile);
const SCRIPT = path.join(process.cwd(), "scripts", "export-run.mjs");
const EXAMPLE = path.join(process.cwd(), "examples", "example-run.json");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-export-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function exportExample(env: Record<string, string> = {}) {
  const out = path.join(dir, "out");
  await run(process.execPath, [SCRIPT, EXAMPLE, out], { env: { ...process.env, RUNS_DIR: path.join(dir, "runs"), ...env } });
  return { out, html: await readFile(path.join(out, "index.html"), "utf8") };
}

describe("export-run", () => {
  it("hides the reviewer's sign-up address everywhere in the exported folder", async () => {
    const address = "fts.reviewer.k3x9.2026@mail.example.com";
    const example = await loadExampleRun();
    const [first, ...rest] = example.findings;
    const withAddress = {
      ...example,
      findings: [
        {
          ...first,
          detail: `${first.detail} The reviewer signed up as ${address}.`,
          evidence: [...first.evidence, { kind: "log", path: "traces/trace.md", caption: `Signed up as ${address}` }],
        },
        ...rest,
      ],
    };
    const runJson = path.join(dir, "run.json");
    await writeFile(runJson, JSON.stringify(withAddress));
    const traces = path.join(dir, "runs", example.id, "traces");
    await mkdir(traces, { recursive: true });
    await writeFile(path.join(traces, "trace.md"), `# Trace\n\n1. Typed ${address} into Email.\n`);
    const out = path.join(dir, "out");
    await run(process.execPath, [SCRIPT, runJson, out], { env: { ...process.env, RUNS_DIR: path.join(dir, "runs") } });

    const files = (await readdir(out, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
    expect(files.map((e) => e.name).sort()).toEqual(["index.html", "trace.md"]);
    let all = "";
    for (const e of files) all += await readFile(path.join(e.parentPath, e.name), "utf8");
    expect(all).not.toContain(address);
    expect(all).not.toContain("fts.reviewer");
    expect(await readFile(path.join(out, "traces", "trace.md"), "utf8")).toContain(`Typed ${HIDDEN_REVIEWER_EMAIL} into Email.`);
    expect(all).toContain(`The reviewer signed up as ${HIDDEN_REVIEWER_EMAIL}.`);
  });

  it("hides only the reviewer's address shape", () => {
    expect(redactReviewerEmails("fts.reviewer.a.b9@x.io and FTS.Reviewer.Q1@x.io, mailto:fts.reviewer.z%40x.io")).toBe(
      `${HIDDEN_REVIEWER_EMAIL} and ${HIDDEN_REVIEWER_EMAIL}, mailto:${HIDDEN_REVIEWER_EMAIL}`,
    );
    expect(redactReviewerEmails("support@habit-tracker.example.com, fts.reviewer@x.io")).toBe("support@habit-tracker.example.com, fts.reviewer@x.io");
  });

  it("writes an index.html with every finding title and no script tag", async () => {
    const example = await loadExampleRun();
    const { html } = await exportExample();
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    for (const f of example.findings) expect(html).toContain(escape(f.title));
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("Devin board");
    expect(html).toContain("Notes for App Review");
    expect(html).toContain("Apple makes the decision.");
  });

  it("copies screenshots next to the page and links them relatively", async () => {
    const shots = path.join(dir, "runs", "example", "screenshots");
    await mkdir(shots, { recursive: true });
    await writeFile(path.join(shots, "r1-home.png"), "png");
    const { out, html } = await exportExample();
    expect((await stat(path.join(out, "screenshots", "r1-home.png"))).isFile()).toBe(true);
    expect(html).toContain('src="screenshots/r1-home.png"');
    expect(html).not.toContain("/api/runs/");
    expect(html).toContain("Screenshot unavailable");
  });

  it("writes the same App Review notes as the ready page", async () => {
    const example = await loadExampleRun();
    const notes = reviewNotes(example);
    expect(exportedNotes(example)).toBe(notes);
    expect(notes).toContain("Demo account: <email> / <password>");
    expect(notes).toContain(`${NOTE_LINES.R5[0]}: ${NOTE_LINES.R5[1]}`);
    expect(notes).not.toContain(NOTE_LINES.R6[0]);
  });

  it("names a run without a repository after the app's host", async () => {
    const example = { ...(await loadExampleRun()), repoUrl: "" };
    const notes = reviewNotes(example);
    expect(notes.split("\n")[0]).toBe("habit-tracker.example.com is the iPhone version of https://habit-tracker.example.com.");
    expect(exportedNotes(example)).toBe(notes);
  });

  it("starts with the saved-copy line and has no live parts", async () => {
    const { html } = await exportExample();
    const body = html.slice(html.indexOf("<body>"));
    expect(body.replace(/<[^>]+>/g, "").trim().startsWith(SAVED_COPY_LINE)).toBe(true);
    expect(html).not.toMatch(/<(form|button|input|textarea|select)\b/i);
    expect(html).not.toMatch(/\/api\/|setInterval|setTimeout|Refreshes every/);
    expect(html).not.toMatch(/(src|href)="\//);
  });

  it("inlines the styles of app/globals.css and components/plain.css", async () => {
    const { html } = await exportExample();
    for (const file of ["app/globals.css", "components/plain.css"]) {
      const css = await readFile(path.join(process.cwd(), file), "utf8");
      expect(html).toContain(css);
    }
  });

  it("shows each finding in plain words and the after-re-check summary", async () => {
    const example = await loadExampleRun();
    const { html } = await exportExample();
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    for (const f of example.findings) {
      expect(html).toContain(escape(PLAIN_WORDS[f.ruleId].problem));
      expect(html).toContain(escape(PLAIN_WORDS[f.ruleId].whyAppleCares));
    }
    expect(html).toContain(escape(summaryLine(example)));
    for (const fix of example.fixes) {
      expect(html).toContain(`href="${fix.url}"`);
      if (fix.prUrl) expect(html).toContain(`href="${fix.prUrl}"`);
    }
  });

  it("shows the rejection sentence before the re-check", async () => {
    const example = await loadExampleRun();
    const reviewed = { ...example, stage: "reviewed" as const, findings: example.findings.map((f) => ({ ...f, finalState: "" as const })) };
    const html = renderRunHtml(reviewed, "");
    expect(html).toContain(rejectionSentence(reviewed));
    expect(html).toContain("Apple would likely reject this app for");
  });

  it("splits screenshots into before and after the fix when both exist", async () => {
    const example = await loadExampleRun();
    const findings = example.findings.map((f) =>
      f.ruleId === "R2"
        ? { ...f, evidence: [...f.evidence, { kind: "screenshot" as const, path: "recheck/r2.png", caption: "After the fix: pricing" }] }
        : f,
    );
    const html = renderRunHtml({ ...example, findings }, "", new Set(["screenshots/r2-pricing.png", "recheck/r2.png"]));
    const card = html.slice(html.indexOf("No placeholder content"));
    expect(card.indexOf("Before the fix")).toBeGreaterThan(-1);
    expect(card.indexOf("Before the fix")).toBeLessThan(card.indexOf('src="screenshots/r2-pricing.png"'));
    expect(card.indexOf('src="screenshots/r2-pricing.png"')).toBeLessThan(card.indexOf("After the fix"));
    expect(card.indexOf("After the fix")).toBeLessThan(card.indexOf('src="recheck/r2.png"'));
  });

  it("describes the rule on a not-checked card and calls a risk a risk", async () => {
    const html = renderRunHtml(await loadExampleRun(), "");
    const card = (title: string) => {
      const start = html.indexOf(`<h3 class="finding-title">${title}`);
      return html.slice(start, html.indexOf("</article>", start));
    };
    const r11 = card("No tracking or third-party AI calls before consent");
    expect(r11).toContain("We could not check this");
    expect(r11).toContain("<dt>What reviewers reject</dt>");
    expect(r11).not.toContain("The problem");
    expect(r11).not.toContain("What we do");
    expect(card("&quot;Just a website&quot; risk")).toContain("<dt>The risk</dt>");
  });

  it("shows no raw tool output, raw statuses or evidence paths", async () => {
    const example = await loadExampleRun();
    const findings = example.findings.map((f) =>
      f.ruleId === "R7"
        ? { ...f, detail: `${f.detail} In the app: ASSERTION_FAILED: agent.assert failed: no Apple button (e.g., node n9011: "x")` }
        : f,
    );
    const fixes = [
      ...example.fixes,
      { ...example.fixes[0], ruleId: "R5" as const, status: "error" as const, summary: "Could not start a Devin session: Devin API POST /v1/sessions failed: 402 {}" },
    ];
    const html = renderRunHtml({ ...example, findings, fixes }, "");
    expect(html).not.toMatch(/ASSERTION_FAILED|agent\.assert|n9011|\/v1\/sessions|units used|evidence-caption mono/);
    expect(html).toContain("Devin could not start this fix.");
    expect(html).toContain("Waiting for an answer");
    expect(html).toContain("What is left to do");
  });

  it("uses the app's host when the run has no repository", async () => {
    const example = { ...(await loadExampleRun()), repoUrl: "" };
    const html = renderRunHtml(example, "");
    expect(html).toContain("<title>habit-tracker.example.com · FixThenShip review</title>");
    expect(html).toContain('<h1 class="run-title">habit-tracker.example.com</h1>');
    expect(html).toContain("Review of habit-tracker.example.com");
    expect(html).not.toContain("<dt>Repository</dt>");
  });

  it("uses the site's own logo and web fonts", async () => {
    const { html } = await exportExample();
    const icon = await readFile(path.join(process.cwd(), "app", "icon.svg"), "utf8");
    expect(html).toContain(icon.trim().replace(/^<svg\b/, '<svg class="brand-mark" aria-hidden="true"'));
    const layout = await readFile(path.join(process.cwd(), "app", "layout.tsx"), "utf8");
    for (const m of layout.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"/g)) {
      expect(html).toContain(`href="${m[1].replace(/&/g, "&amp;")}"`);
    }
  });

  it("lists what we could not see, before the notes for App Review, without checkboxes", async () => {
    const html = renderRunHtml(await loadExampleRun(), "");
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const at = html.indexOf(escape(BEFORE_YOU_SUBMIT_TITLE));
    expect(at).toBeGreaterThan(html.indexOf(">Not checked<"));
    expect(at).toBeLessThan(html.indexOf(">Notes for App Review<"));
    expect(html).toContain(escape(BEFORE_YOU_SUBMIT_LEAD));
    for (const g of CHECKLIST) {
      expect(html).toContain(escape(g.title));
      for (const item of g.items) {
        expect(html).toContain(escape(item.text));
        expect(html).toContain(escape(item.why));
      }
    }
    expect(html).not.toMatch(/<input\b/i);
  });
});

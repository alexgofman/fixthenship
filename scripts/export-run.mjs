#!/usr/bin/env node
// Usage: node scripts/export-run.mjs <runId | path/to/run.json> <outDir>
// Writes a static, script-free copy of one finished run: index.html plus its screenshots and logs.
// The styles are read from app/globals.css and components/plain.css at export time.
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Node strips the types from these .ts files; silence its one-time "module type" notice.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const code = typeof rest[0] === "object" ? rest[0]?.code : rest[1];
  if (code === "MODULE_TYPELESS_PACKAGE_JSON") return;
  return emitWarning.call(process, warning, ...rest);
};
const {
  cleanReason,
  displayFor,
  findingDetail,
  fixSummary,
  formatDate,
  hasOpenFindings,
  headingsFor,
  initialDisplay,
  isRechecked,
  NOT_CHECKED_LINE,
  rejectionSentence,
  repoName,
  runName,
  sortFindings,
  summaryLine,
} = await import("../components/findingDisplay.ts");
const { RULES } = await import("../lib/rules.ts");
const { FIX_STATUS_WORDS, PLAIN_WORDS } = await import("../lib/plainWords.ts");
process.emitWarning = emitWarning;

/** Same text as NOTE_LINES in components/ReadyReport.tsx (a test keeps them in step). */
const NOTE_LINES = {
  R1: ["App loading", "the app opens to its first screen without errors"],
  R2: ["Placeholder content", "replaced with final text and images"],
  R3: ["Buttons and links", "every button and link now leads somewhere"],
  R4: ["Sign-in", "use the demo account above"],
  R5: ["Privacy policy", "Settings, Privacy Policy"],
  R6: ["Account deletion", "Settings, Delete account"],
  R7: ["Sign in with Apple", "Sign-in screen, Sign in with Apple"],
  R8: ["Purchases", "no outside checkout is offered on iPhone"],
  R9: ["Support", "Settings, Support"],
  R10: ["Branding", "the app's own name and icon; no builder badge"],
  R11: ["Consent", "asked at first launch, before any tracking"],
  R12: ["Reporting and blocking", "Report and Block on each post"],
  R13: ["App features", "see the features listed above"],
};

const SOURCE_LABEL = { code: "the code", app: "the running app", both: "the code and the running app" };

export const SAVED_COPY_LINE = "A saved copy of a real FixThenShip review. Nothing on this page is live.";

const STYLE_FILES = [path.join("app", "globals.css"), path.join("components", "plain.css")];

const EXTRA_CSS = `
.export-banner { margin: 0; padding: 10px 20px; text-align: center; font-size: 14px; color: var(--muted);
  border-bottom: 1px solid var(--border); }
.export-note { color: var(--muted); font-size: 13px; }
.ready-list { list-style: none; padding: 0; margin: 0; }
.ready-notes { margin: 0; padding: 16px 18px; background: #fffefb; border: 1px solid var(--border);
  border-radius: var(--radius); font-family: var(--mono); font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wasFixed(f) {
  return f.finalState === "green" && f.state !== "pass";
}

function afterFixEvidence(f) {
  return f.evidence.filter((e) => /^(after the fix|after fix|re-?check)/i.test(e.caption));
}

function titleCase(name) {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Same text as reviewNotes in components/ReadyReport.tsx. */
export function reviewNotes(run) {
  const repo = run.repoUrl ? repoName(run.repoUrl) : "";
  const lines = [
    repo
      ? `${titleCase(repo)} (built from the ${repo} repository) is the iPhone version of ${run.appUrl}.`
      : `${runName(run)} is the iPhone version of ${run.appUrl}.`,
    "",
    "Demo account: <email> / <password>",
  ];
  const fixed = run.findings.filter(wasFixed);
  if (fixed.length > 0) {
    lines.push("", "Changes since the last build:");
    for (const f of fixed) {
      const [label, where] = NOTE_LINES[f.ruleId] ?? [f.title, ""];
      lines.push(where ? `${label}: ${where}` : label);
    }
  }
  return lines.join("\n");
}

/** Only safe relative paths inside the run folder are linked; anything else is shown as text. */
function safeRelative(p) {
  if (typeof p !== "string" || !p || p.includes("\0") || p.includes("\\")) return null;
  const norm = path.posix.normalize(p);
  if (norm.startsWith("../") || norm === ".." || path.posix.isAbsolute(norm)) return null;
  return norm;
}

function relHref(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

function githubBlobUrl(repoUrl, file, line) {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== "github.com") return null;
    const base = url.pathname.replace(/\.git$/, "").replace(/\/$/, "");
    return `https://github.com${base}/blob/HEAD/${file}#L${line}`;
  } catch {
    return null;
  }
}

function link(href, text, cls = "") {
  return `<a${cls ? ` class="${cls}"` : ""} href="${esc(href)}" target="_blank" rel="noreferrer">${text}</a>`;
}

function pill(display) {
  return `<span class="pill pill-${display.tone}"><span class="pill-dot" aria-hidden="true"></span>${esc(display.label)}</span>`;
}

function evidenceHtml(item, run, copied) {
  if ("file" in item) {
    const ref = esc(`${item.file}:${item.line}`);
    const href = githubBlobUrl(run.repoUrl, item.file, item.line);
    return `<div class="evidence-code">${href ? link(href, ref, "mono") : `<code class="mono">${ref}</code>`}<span class="evidence-caption">${esc(cleanReason(item.caption))}</span></div>`;
  }
  const rel = safeRelative(item.path);
  const available = rel !== null && copied.has(rel);
  const caption = cleanReason(item.caption);
  if (item.kind === "screenshot") {
    const img = available
      ? link(relHref(rel), `<img src="${esc(relHref(rel))}" alt="${esc(caption)}">`)
      : `<div class="shot-placeholder" role="img" aria-label="Screenshot unavailable: ${esc(caption)}"><span>Screenshot unavailable</span></div>`;
    return `<figure class="evidence-shot">${img}<figcaption>${esc(caption)}</figcaption></figure>`;
  }
  const label = esc(caption || "Open the log");
  return `<div class="evidence-log">${available ? link(relHref(rel), label) : `<span>${label}</span>`}</div>`;
}

function evidenceBlock(items, run, copied, heading) {
  if (items.length === 0) return "";
  const shots = items.filter((e) => !("file" in e) && e.kind === "screenshot");
  const others = items.filter((e) => !shots.includes(e));
  return `<div class="evidence"><p class="evidence-heading">${esc(heading)}</p>${others.map((e) => evidenceHtml(e, run, copied)).join("")}${
    shots.length ? `<div class="evidence-shots">${shots.map((e) => evidenceHtml(e, run, copied)).join("")}</div>` : ""
  }</div>`;
}

function shotsGroup(items, run, copied, heading) {
  if (items.length === 0) return "";
  return `${heading ? `<p class="evidence-heading">${esc(heading)}</p>` : ""}<div class="evidence-shots">${items
    .map((e) => evidenceHtml(e, run, copied))
    .join("")}</div>`;
}

/** Evidence as on the run page; screenshots are split into before and after the fix when both exist. */
function findingEvidence(f, run, copied) {
  if (f.evidence.length === 0) return "";
  const isShot = (e) => !("file" in e) && e.kind === "screenshot";
  const after = new Set(afterFixEvidence(f));
  const shots = f.evidence.filter(isShot);
  const others = f.evidence.filter((e) => !isShot(e));
  const before = shots.filter((e) => !after.has(e));
  const afterShots = shots.filter((e) => after.has(e));
  const split = before.length > 0 && afterShots.length > 0;
  const shotHtml = split
    ? shotsGroup(before, run, copied, "Before the fix") + shotsGroup(afterShots, run, copied, "After the fix")
    : shotsGroup(shots, run, copied, "");
  return `<div class="evidence"><p class="evidence-heading">Evidence</p>${others.map((e) => evidenceHtml(e, run, copied)).join("")}${shotHtml}</div>`;
}

function plainWords(f, headings) {
  const plain = PLAIN_WORDS[f.ruleId];
  if (!plain) return "";
  const row = (term, text) => `<div><dt>${esc(term)}</dt><dd>${esc(text)}</dd></div>`;
  return `<dl class="plain">${headings.notChecked ? row("Not checked", NOT_CHECKED_LINE) : ""}${row(headings.problem, plain.problem)}${row(
    "Why Apple cares",
    plain.whyAppleCares,
  )}${row(headings.fix, plain.whatWeDo)}</dl>`;
}

function findingCard(f, run, copied) {
  const display = displayFor(f);
  const first = initialDisplay(f.state);
  const changed = f.finalState !== "" && first.label !== display.label;
  return `<article class="finding finding-${display.tone}">
<header class="finding-head"><span class="guideline-badge">Guideline ${esc(f.guideline)}</span>${pill(display)}</header>
<h3 class="finding-title">${esc(f.title)}</h3>
${plainWords(f, headingsFor(f, display))}
${display.note ? `<p class="human-step"><strong>Needs you:</strong> ${esc(display.note)}</p>` : ""}
<details class="evidence-details" open><summary>Show the evidence</summary><div class="evidence-body">
<p class="finding-detail">${esc(findingDetail(f))}</p>
${findingEvidence(f, run, copied)}
</div></details>
<footer class="finding-meta"><span>Confidence: <strong>${esc(f.confidence)}</strong></span><span>Checked in ${esc(SOURCE_LABEL[f.source] ?? f.source)}</span>${
    changed ? `<span>First review: <span class="tone-text-${first.tone}">${esc(first.label)}</span></span>` : ""
  }<span class="rule-id">${esc(f.ruleId)}</span></footer>
</article>`;
}

function verdictLetter(run, copied) {
  const findings = sortFindings(run.findings);
  return `<article class="letter" aria-labelledby="letter-title">
<div class="letterhead"><span class="letterhead-mark">FixThenShip</span><span class="letterhead-sub">Review rehearsal</span></div>
<header class="letter-head"><h2 id="letter-title">Review of ${esc(runName(run))}</h2>
<dl class="letter-meta">
<div><dt>Date</dt><dd><time datetime="${esc(run.createdAt)}">${esc(formatDate(run.createdAt))}</time></dd></div>
${run.repoUrl ? `<div><dt>Repository</dt><dd>${link(run.repoUrl, esc(run.repoUrl))}</dd></div>` : ""}
<div><dt>App</dt><dd>${link(run.appUrl, esc(run.appUrl))}</dd></div>
</dl></header>
${
  isRechecked(run) || run.findings.length === 0
    ? `<p class="letter-summary">${esc(summaryLine(run))}</p>`
    : `<p class="letter-summary">${esc(rejectionSentence(run))}</p><p class="letter-counts">${esc(summaryLine(run))}</p>`
}
<p class="letter-intro">${
    isRechecked(run)
      ? "We used your app again after the fixes. Each guideline below shows where it stands now."
      : "We used your app the way an App Store reviewer would. These are the guidelines we looked at, most serious first."
  }</p>
${
  findings.length === 0
    ? `<p class="letter-empty">The review has not produced any findings yet.</p>`
    : `<div class="findings">${findings.map((f) => findingCard(f, run, copied)).join("\n")}</div>`
}
<footer class="letter-foot"><p>This is a rehearsal, not a decision. It describes likely outcomes and risks; the real review can still reach a different result.</p><p class="letter-sign">— The FixThenShip review desk</p></footer>
</article>`;
}

function formatUnits(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

function devinBoard(fixes) {
  if (fixes.length === 0) return "";
  const total = fixes.reduce((sum, f) => sum + (f.acus || 0), 0);
  const title = (id) => RULES.find((r) => r.id === id)?.title ?? "";
  const rows = fixes
    .map(
      (fix) => `<tr>
<td data-label="Rule"><div class="cell"><span class="board-rule">${esc(fix.ruleId)}</span> ${fix.url ? link(fix.url, esc(title(fix.ruleId) || "session")) : esc(title(fix.ruleId))}</div></td>
<td data-label="Status"><div class="cell"><span class="status status-${esc(fix.status)}">${esc(FIX_STATUS_WORDS[fix.status] ?? fix.status)}</span></div></td>
<td data-label="Pull request"><div class="cell">${fix.prUrl ? link(fix.prUrl, "pull request") : `<span class="muted">—</span>`}</div></td>
<td data-label="Summary"><div class="cell">${fix.summary ? esc(fixSummary(fix.summary)) : `<span class="muted">—</span>`}</div></td>
<td data-label="Devin units" class="num"><div class="cell">${esc(formatUnits(fix.acus || 0))}</div></td>
</tr>`,
    )
    .join("\n");
  return `<section class="board" aria-labelledby="board-title">
<div class="section-head"><h2 id="board-title">Devin board</h2><span class="muted small">${fixes.length} ${fixes.length === 1 ? "session" : "sessions"} · ${esc(formatUnits(total))} Devin units</span></div>
<table class="board-table"><thead><tr><th>Rule</th><th>Status</th><th>Pull request</th><th>Summary</th><th class="num">Devin units</th></tr></thead>
<tbody>${rows}</tbody></table>
</section>`;
}

function readySection(id, title, items, render, list = false) {
  const body =
    items.length === 0
      ? `<p class="muted">None.</p>`
      : list
        ? `<ul class="findings ready-list">${items.map(render).join("\n")}</ul>`
        : `<div class="findings">${items.map(render).join("\n")}</div>`;
  return `<section class="board" aria-labelledby="${id}"><div class="section-head"><h2 id="${id}">${esc(title)}</h2><span class="muted small">${items.length}</span></div>${body}</section>`;
}

function cardHead(f, display = displayFor(f)) {
  return `<header class="finding-head"><span class="guideline-badge">Guideline ${esc(f.guideline)}</span>${pill(display)}</header><h3 class="finding-title">${esc(f.title)}</h3>`;
}

function readyReport(run, copied) {
  const fixFor = (f) => run.fixes.find((x) => x.ruleId === f.ruleId);
  const fixed = readySection("ready-fixed", "Fixed and verified", run.findings.filter((f) => f.finalState === "green"), (f) => {
    if (!wasFixed(f)) {
      return `<article class="finding finding-green">${cardHead(f)}<p class="finding-detail">Passed on the first review and again on the re-check.</p></article>`;
    }
    const items = afterFixEvidence(f);
    const fix = fixFor(f);
    const shown = items.length ? evidenceBlock(items, run, copied, "After the fix") : `<div class="evidence"><p class="evidence-heading">After the fix</p><p class="finding-detail">The re-check passed.</p></div>`;
    const devin = fix?.summary
      ? `<p class="finding-detail">Devin: ${esc(fixSummary(fix.summary))}${fix.prUrl ? ` ${link(fix.prUrl, "pull request")}` : ""}</p>`
      : "";
    return `<article class="finding finding-green">${cardHead(f)}${shown}${devin}</article>`;
  });
  const needs = readySection(
    "ready-needs",
    "Needs you",
    run.findings.filter((f) => f.finalState === "amber"),
    (f) =>
      `<li class="finding finding-amber"><span class="guideline-badge">Guideline ${esc(f.guideline)}</span><strong class="finding-title" style="display:block">${esc(f.title)}</strong><span class="finding-detail">${esc(f.humanStep || findingDetail(f))}</span></li>`,
    true,
  );
  const failing = readySection(
    "ready-failing",
    "Still failing",
    run.findings.filter((f) => f.finalState === "red"),
    (f) =>
      `<article class="finding finding-red">${cardHead(f)}<p class="finding-detail">${esc(findingDetail(f))}</p>${
        f.humanStep ? `<p class="human-step"><strong>Next step:</strong> ${esc(f.humanStep)}</p>` : ""
      }</article>`,
  );
  const unchecked = readySection(
    "ready-unchecked",
    "Not checked",
    run.findings.filter((f) => f.finalState === ""),
    (f) => `<article class="finding finding-grey">${cardHead(f, initialDisplay(f.state))}<p class="finding-detail">${esc(findingDetail(f))}</p></article>`,
  );
  const notes = `<section class="board" aria-labelledby="ready-notes"><div class="section-head"><h2 id="ready-notes">Notes for App Review</h2></div>
<p class="muted small" style="margin-top:0">Paste into App Store Connect, App Review Information, Notes. Fill in the demo account first.</p>
<pre class="ready-notes">${esc(reviewNotes(run))}</pre></section>`;
  return `<section aria-labelledby="ready-title"><h2 id="ready-title" class="run-title" style="margin-bottom:16px">${hasOpenFindings(run) ? "What is left to do" : "Ready to submit"}</h2>
${fixed}\n${needs}\n${failing}\n${unchecked}\n${notes}
<p class="refresh-note">FixThenShip predicts what a reviewer is likely to flag. Apple makes the decision.</p></section>`;
}

/** The whole page as one HTML string; `copied` holds the evidence paths that exist next to it. */
export function renderRunHtml(run, css, copied = new Set(), { brandMark = "", fontLinks = [] } = {}) {
  const name = runName(run);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fontLinks.map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join("\n")}
<title>${esc(name)} · FixThenShip review</title>
<style>
${css}
${EXTRA_CSS}
</style>
</head>
<body>
<p class="export-banner">${esc(SAVED_COPY_LINE)}</p>
<header class="site-header"><div class="site-header-inner"><span class="brand">${brandMark}<span class="brand-word">Fix<span>Then</span>Ship</span></span><span class="site-tag">App Review rehearsal</span></div></header>
<main class="run-page"><div class="run">
<div class="run-head"><div><p class="eyebrow">Run ${esc(run.id)}</p><h1 class="run-title">${esc(name)}</h1></div></div>
${verdictLetter(run, copied)}
${devinBoard(run.fixes ?? [])}
${readyReport(run, copied)}
</div></main>
<footer class="site-footer">FixThenShip describes likely review outcomes and risks. It is not affiliated with Apple. <span class="export-note">Exported ${esc(new Date().toISOString().slice(0, 10))}.</span></footer>
</body>
</html>
`;
}

function runsDir() {
  return process.env.RUNS_DIR ?? path.join(ROOT, "runs");
}

async function loadRunArg(arg) {
  if (arg.endsWith(".json")) return JSON.parse(await readFile(path.resolve(arg), "utf8"));
  if (!RUN_ID_PATTERN.test(arg)) throw new Error(`Invalid run id: ${arg}`);
  try {
    return JSON.parse(await readFile(path.join(runsDir(), arg, "run.json"), "utf8"));
  } catch (e) {
    if (arg !== "example") throw e;
    return JSON.parse(await readFile(path.join(ROOT, "examples", "example-run.json"), "utf8"));
  }
}

async function isFile(p) {
  return stat(p).then(
    (s) => s.isFile(),
    () => false,
  );
}

/** Copies every screenshot and log that exists in the run folder; returns the copied relative paths. */
async function copyEvidence(run, outDir) {
  const copied = new Set();
  if (!RUN_ID_PATTERN.test(run.id)) return copied;
  const runDir = path.resolve(runsDir(), run.id);
  for (const f of run.findings) {
    for (const e of f.evidence) {
      if ("file" in e) continue;
      const rel = safeRelative(e.path);
      if (!rel || copied.has(rel)) continue;
      const src = path.resolve(runDir, rel);
      const dest = path.resolve(outDir, rel);
      if (!src.startsWith(runDir + path.sep) || !dest.startsWith(outDir + path.sep)) continue;
      if (!(await isFile(src))) continue;
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
      copied.add(rel);
    }
  }
  return copied;
}

/** The app's own stylesheets, read now so the copy matches whatever they say today. */
export async function readStyles() {
  const parts = await Promise.all(STYLE_FILES.map((f) => readFile(path.join(ROOT, f), "utf8")));
  return parts.map((css, i) => `/* ${STYLE_FILES[i].split(path.sep).join("/")} */\n${css}`).join("\n");
}

/** The logo (app/icon.svg) and the web-font stylesheets that app/layout.tsx links, read now like the styles. */
export async function readSiteChrome() {
  const icon = await readFile(path.join(ROOT, "app", "icon.svg"), "utf8").catch(() => "");
  const brandMark = icon
    .replace(/<\?xml[^>]*>\s*/, "")
    .trim()
    .replace(/^<svg\b/, '<svg class="brand-mark" aria-hidden="true"');
  const layout = await readFile(path.join(ROOT, "app", "layout.tsx"), "utf8").catch(() => "");
  const fontLinks = [...layout.matchAll(/href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"/g)].map((m) => m[1]);
  return { brandMark: brandMark.startsWith("<svg") ? brandMark : "", fontLinks };
}

export async function exportRun(arg, outDir) {
  const run = await loadRunArg(arg);
  if (run.stage !== "done") throw new Error(`Run ${run.id} is not finished yet (stage: ${run.stage}).`);
  const out = path.resolve(outDir);
  await mkdir(out, { recursive: true });
  const css = await readStyles();
  const copied = await copyEvidence(run, out);
  const file = path.join(out, "index.html");
  await writeFile(file, renderRunHtml(run, css, copied, await readSiteChrome()), "utf8");
  return { file, copied: [...copied] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [arg, outDir] = process.argv.slice(2);
  if (!arg || !outDir) {
    console.error("Usage: node scripts/export-run.mjs <runId | path/to/run.json> <outDir>");
    process.exit(1);
  }
  try {
    const { file, copied } = await exportRun(arg, outDir);
    console.log(`Wrote ${file} (${copied.length} ${copied.length === 1 ? "file" : "files"} copied)`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

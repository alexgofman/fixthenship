import type { Finding, FindingState, RuleId, Run } from "@/lib/types";

export type Tone = "red" | "amber" | "green" | "grey";

export type Display = { tone: Tone; label: string; note?: string };

const TONE_RANK: Record<Tone, number> = { red: 0, amber: 1, grey: 2, green: 3 };

export function initialDisplay(state: FindingState): Display {
  switch (state) {
    case "fail":
      return { tone: "red", label: "Likely rejection" };
    case "pass":
      return { tone: "green", label: "Passed" };
    case "risk":
      return { tone: "amber", label: "Risk" };
    default:
      return { tone: "grey", label: "Not checked" };
  }
}

/** The state to show: after the re-check, `finalState` wins over the first review. */
export function displayFor(f: Finding): Display {
  switch (f.finalState) {
    case "green":
      return f.state === "pass"
        ? { tone: "green", label: "Passed" }
        : { tone: "green", label: "Fixed and verified" };
    case "amber":
      return { tone: "amber", label: "Needs you", note: f.humanStep || undefined };
    case "red":
      return { tone: "red", label: "Still failing" };
    default:
      return initialDisplay(f.state);
  }
}

/** Rules that end amber even when the fix works: the developer always has one step left. */
export const NEVER_GREEN_RULES: readonly RuleId[] = ["R7", "R8", "R10"];

export type Headings = { problem: string; fix: string; notChecked: boolean };

/**
 * The headings above a card's plain words. A passed or not-checked card describes the rule, not this app;
 * a risk card says "The risk", never "The problem".
 */
export function headingsFor(f: Finding, display: Display = displayFor(f)): Headings {
  const notChecked = display.tone === "grey";
  const passed = display.tone === "green" && f.state === "pass";
  if (passed || notChecked) return { problem: "What reviewers reject", fix: "How it gets fixed", notChecked };
  const risk = display.tone === "amber" && f.state === "risk";
  return { problem: risk ? "The risk" : "The problem", fix: "What we do", notChecked };
}

export const NOT_CHECKED_LINE = "We could not check this, so we make no claim about your app.";

/** Strips the test tool's raw output (error codes, assert names, node ids, step names) from text shown to people. */
export function cleanReason(text: string): string {
  return text
    .replace(/\b(?:ASSERTION_FAILED|ERROR|TIMEOUT|INCONCLUSIVE):\s*/g, "")
    .replace(/\b(?:agent|browser)\.\w+ failed:\s*/g, "")
    .replace(/\bThe observation shows\s+(\w)/gi, (_, c: string) => c.toUpperCase())
    .replace(/\s*\(e\.g\.,?\s*node n\d+[^)]*\)/g, "")
    .replace(/\s*\bnode n\d+:?/g, "")
    .replace(/\bPassed at [\w.]*\w[^.]*\.?/g, "Passed.")
    // The judging model's own closing remark about its instructions means nothing to a reader.
    .replace(/,?\s*(?:which\s+)?(?:violat(?:es|ing)|contradict(?:s|ing)) the (?:assertion|instruction|requirement)[^.]*\.?/gi, ".")
    .replace(/\s*This contradicts the instruction[^.]*\./gi, "")
    .replace(/\.{2,}/g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** A finding's detail as people see it; the stored detail keeps the raw text. */
export function findingDetail(f: Pick<Finding, "detail">): string {
  return cleanReason(f.detail);
}

/** An error or fix summary without API paths, status codes or JSON bodies. */
export function plainError(text: string): string {
  return cleanReason(text)
    .replace(/:\s*(?:(?:Devin|GitHub)(?: API)?\s+)?(?:GET|POST|PUT|PATCH|DELETE)\s+\/[\s\S]*$/, ".")
    .replace(/:?\s*\b[1-5]\d\d\s*[{[][\s\S]*$/, ".")
    .replace(/\.{2,}$/, ".")
    .trim();
}

/** What the Devin board shows as a session's summary. */
export function fixSummary(summary: string): string {
  if (/^Could not start a Devin session\b/.test(summary)) return "Devin could not start this fix.";
  return plainError(summary);
}

/** True while any finding still fails or needs the developer after the re-check. */
export function hasOpenFindings(run: Pick<Run, "findings">): boolean {
  return run.findings.some((f) => f.finalState === "red" || f.finalState === "amber");
}

export function sortFindings(findings: Finding[]): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => TONE_RANK[displayFor(a.f).tone] - TONE_RANK[displayFor(b.f).tone] || a.i - b.i)
    .map(({ f }) => f);
}

export function isRechecked(run: Run): boolean {
  return run.findings.some((f) => f.finalState !== "");
}

export type Count = { tone: Tone; n: number; text: string };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function countFindings(run: Run): Count[] {
  const by = (pred: (f: Finding) => boolean) => run.findings.filter(pred).length;
  if (isRechecked(run)) {
    const fixed = by((f) => f.finalState === "green" && f.state !== "pass");
    const passed = by((f) => f.finalState === "green" && f.state === "pass") +
      by((f) => f.finalState === "" && f.state === "pass");
    const needs = by((f) => f.finalState === "amber");
    const still = by((f) => f.finalState === "red");
    const notChecked = by((f) => f.finalState === "" && f.state === "not_checked");
    const fail = by((f) => f.finalState === "" && f.state === "fail");
    const risk = by((f) => f.finalState === "" && f.state === "risk");
    return [
      { tone: "red" as Tone, n: still, text: `${still} still failing` },
      { tone: "red" as Tone, n: fail, text: plural(fail, "likely rejection", "likely rejections") },
      { tone: "amber" as Tone, n: needs, text: `${needs} ${needs === 1 ? "needs" : "need"} you` },
      { tone: "amber" as Tone, n: risk, text: plural(risk, "risk", "risks") },
      { tone: "green" as Tone, n: fixed, text: `${fixed} fixed and verified` },
      { tone: "green" as Tone, n: passed, text: `${passed} passed` },
      { tone: "grey" as Tone, n: notChecked, text: `${notChecked} not checked` },
    ].filter((c) => c.n > 0);
  }
  const fail = by((f) => f.state === "fail");
  const risk = by((f) => f.state === "risk");
  const pass = by((f) => f.state === "pass");
  const notChecked = by((f) => f.state === "not_checked");
  return [
    { tone: "red" as Tone, n: fail, text: plural(fail, "likely rejection", "likely rejections") },
    { tone: "amber" as Tone, n: risk, text: plural(risk, "risk", "risks") },
    { tone: "green" as Tone, n: pass, text: `${pass} passed` },
    { tone: "grey" as Tone, n: notChecked, text: `${notChecked} not checked` },
  ].filter((c) => c.n > 0);
}

/** One-line summary for the verdict letter. */
export function summaryLine(run: Run): string {
  if (run.findings.length === 0) return "No findings yet.";
  const parts = countFindings(run).map((c) => c.text);
  if (!isRechecked(run)) {
    const fail = run.findings.filter((f) => f.state === "fail").length;
    if (fail > 0) {
      parts[0] = `${plural(fail, "issue", "issues")} would likely lead to rejection`;
    }
  }
  return parts.join(", ");
}

/**
 * The sentence at the top of the letter. Failing findings are the reasons; NEVER_GREEN_RULES need "one step
 * from you", every other "yes" or "partly" finding counts as "we can fix".
 */
export function rejectionSentence(run: Pick<Run, "findings">): string {
  const failing = run.findings.filter((f) => f.state === "fail");
  if (failing.length === 0) return "We found nothing that would likely get this app rejected.";
  const oneStep = failing.filter((f) => NEVER_GREEN_RULES.includes(f.ruleId)).length;
  const canFix = failing.filter(
    (f) => !NEVER_GREEN_RULES.includes(f.ruleId) && (f.fixable === "yes" || f.fixable === "partly"),
  ).length;
  const parts = [
    `Apple would likely reject this app for ${plural(failing.length, "reason", "reasons")}.`,
    `We can fix ${canFix} of them for you now.`,
  ];
  if (oneStep > 0) parts.push(`${oneStep} ${oneStep === 1 ? "needs" : "need"} one step from you.`);
  return parts.join(" ");
}

/** Name for a run: the repository name, or the app's host when the run has no repository. */
export function runName(run: Pick<Run, "repoUrl" | "appUrl">): string {
  if (run.repoUrl) return repoName(run.repoUrl);
  try {
    return new URL(run.appUrl).hostname;
  } catch {
    return run.appUrl;
  }
}

export function repoName(repoUrl: string): string {
  try {
    const parts = new URL(repoUrl).pathname.split("/").filter(Boolean);
    return (parts[parts.length - 1] ?? repoUrl).replace(/\.git$/, "");
  } catch {
    return repoUrl;
  }
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

export function runFileUrl(runId: string, filePath: string): string {
  const clean = filePath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `/api/runs/${encodeURIComponent(runId)}/files/${clean}`;
}

export const IN_PROGRESS_STAGES = ["scanning", "checking", "fixing", "rechecking"] as const;

export function isInProgress(stage: Run["stage"]): boolean {
  return (IN_PROGRESS_STAGES as readonly string[]).includes(stage);
}

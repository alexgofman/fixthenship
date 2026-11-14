import type { Finding, FindingState, Run } from "@/lib/types";

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

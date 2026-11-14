import { getRule } from "../rules";
import type { CheckResult, Evidence, Finding } from "../types";

/**
 * Folds one check result into the findings.
 * A scan finding is kept unless the app check fails, which makes it source "both".
 */
export function applyCheckResult(findings: Finding[], result: CheckResult, evidence: Evidence[]): Finding[] {
  const index = findings.findIndex((f) => f.ruleId === result.ruleId);
  const existing = index >= 0 ? findings[index] : undefined;
  const scan = existing && existing.source !== "app" ? existing : undefined;
  const scanFound = scan !== undefined && (scan.state === "fail" || scan.state === "risk");

  let next: Finding;
  if (result.outcome === "fail") {
    next = scanFound
      ? {
          ...scan,
          source: "both",
          state: "fail",
          confidence: "high",
          detail: `${scan.detail} In the app: ${result.reason}`,
          evidence: [...scan.evidence.filter((e) => e.kind === "code"), ...evidence],
        }
      : appFinding(result, evidence, "fail", "medium");
  } else if (scan) {
    if (result.outcome === "pass" || !scanFound) return findings;
    next = { ...scan, detail: `${scan.detail} The app check could not run: ${result.reason}` };
  } else {
    next =
      result.outcome === "pass"
        ? appFinding(result, evidence, "pass", "medium")
        : appFinding(result, evidence, "not_checked", "low");
  }

  const merged = [...findings];
  if (index >= 0) merged[index] = next;
  else merged.push(next);
  return merged;
}

function appFinding(
  result: CheckResult,
  evidence: Evidence[],
  state: Finding["state"],
  confidence: Finding["confidence"],
): Finding {
  const rule = getRule(result.ruleId);
  return {
    ruleId: rule.id,
    guideline: rule.guideline,
    title: rule.title,
    detail: result.reason,
    source: "app",
    evidence,
    confidence,
    state,
    fixable: rule.fixable,
    finalState: "",
    humanStep: "",
  };
}

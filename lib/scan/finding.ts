import { getRule } from "../rules";
import type { Confidence, Evidence, Finding, RuleId } from "../types";
import type { SourceFile } from "./files";
import type { Hit } from "./match";

export type RuleCheck = (files: SourceFile[]) => Finding | null;

export const MAX_EVIDENCE = 5;

export function codeEvidence(hit: Hit, caption: string): Evidence {
  return { kind: "code", file: hit.file, line: hit.line, caption };
}

export function quote(s: string, max = 40): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return `"${clean.length > max ? clean.slice(0, max - 1) + "…" : clean}"`;
}

export function makeFinding(
  ruleId: RuleId,
  confidence: Confidence,
  detail: string,
  evidence: Evidence[],
  humanStep = "",
): Finding {
  const rule = getRule(ruleId);
  return {
    ruleId,
    guideline: rule.guideline,
    title: rule.title,
    detail,
    source: "code",
    evidence: evidence.slice(0, MAX_EVIDENCE),
    confidence,
    state: "fail",
    fixable: rule.fixable,
    finalState: "",
    humanStep,
  };
}

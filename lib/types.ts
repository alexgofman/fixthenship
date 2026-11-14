export const STAGES = [
  "scanning",
  "checking",
  "reviewed",
  "fixing",
  "fixed",
  "rechecking",
  "done",
  "failed",
] as const;
export type Stage = (typeof STAGES)[number];

export const RULE_IDS = [
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
  "R6",
  "R7",
  "R8",
  "R9",
  "R10",
  "R11",
  "R12",
  "R13",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const SOURCES = ["code", "app", "both"] as const;
export type Source = (typeof SOURCES)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const FINDING_STATES = ["fail", "pass", "not_checked", "risk"] as const;
export type FindingState = (typeof FINDING_STATES)[number];

export const FIXABLE = ["yes", "partly", "no"] as const;
export type Fixable = (typeof FIXABLE)[number];

export const FINAL_STATES = ["green", "amber", "red", ""] as const;
export type FinalState = (typeof FINAL_STATES)[number];

export const EVIDENCE_KINDS = ["screenshot", "code", "log"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const FIX_STATUSES = [
  "queued",
  "working",
  "waiting",
  "finished",
  "error",
] as const;
export type FixStatus = (typeof FIX_STATUSES)[number];

export const CHECK_OUTCOMES = ["pass", "fail", "not_checked"] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

/** Points either at a stored file (`path`) or at a place in the code (`file` + `line`). */
export type Evidence =
  | { kind: EvidenceKind; path: string; caption: string }
  | { kind: EvidenceKind; file: string; line: number; caption: string };

export type Finding = {
  ruleId: RuleId;
  guideline: string;
  title: string;
  detail: string;
  source: Source;
  evidence: Evidence[];
  confidence: Confidence;
  state: FindingState;
  fixable: Fixable;
  finalState: FinalState;
  humanStep: string;
};

export type FixSession = {
  ruleId: RuleId;
  sessionId: string;
  url: string;
  status: FixStatus;
  prUrl: string;
  summary: string;
  acus: number;
};

export type CheckStep = { text: string; ok: boolean };

export type CheckResult = {
  ruleId: RuleId;
  outcome: CheckOutcome;
  reason: string;
  steps: CheckStep[];
  screenshots: string[];
};

export type Run = {
  id: string;
  createdAt: string;
  repoUrl: string;
  appUrl: string;
  stage: Stage;
  findings: Finding[];
  fixes: FixSession[];
  error: string;
};

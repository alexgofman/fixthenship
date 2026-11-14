import { CHECK_STEPS } from "../lib/plainWords";
import type { Run } from "../lib/types";

export type StepStatus = "pending" | "current" | "done" | "pass" | "fail" | "skipped";

export type ProgressStep = { key: string; text: string; status: StepStatus };

/**
 * The live list of review steps, derived from the findings that have arrived. Checks run in order,
 * so every step up to the last one with an app result is finished and the next one is running.
 */
export function checkProgress(run: Pick<Run, "repoUrl" | "stage" | "findings">): ProgressStep[] {
  const checking = run.stage === "checking";
  const steps: ProgressStep[] = [];
  if (run.repoUrl) {
    steps.push({ key: "code", text: "Reading your app's code", status: checking ? "done" : "current" });
  }

  const finding = (ruleId: string) => run.findings.find((f) => f.ruleId === ruleId);
  let last = -1;
  CHECK_STEPS.forEach((s, i) => {
    const f = finding(s.ruleId);
    if (f && f.source !== "code") last = i;
  });

  CHECK_STEPS.forEach((s, i) => {
    let status: StepStatus = "pending";
    if (checking && i <= last) {
      const state = finding(s.ruleId)?.state ?? "pass";
      status = state === "pass" ? "pass" : state === "not_checked" ? "skipped" : "fail";
    } else if (checking && i === last + 1) {
      status = "current";
    } else if (!run.repoUrl && run.stage === "scanning" && i === 0) {
      status = "current";
    }
    steps.push({ key: s.ruleId, text: s.text, status });
  });
  return steps;
}

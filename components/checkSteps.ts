import { CHECK_STEPS } from "../lib/plainWords";
import type { CheckOutcome, RuleId, Run } from "../lib/types";

export type StepStatus = "pending" | "current" | "done" | "pass" | "fail" | "skipped";

export type ProgressStep = { key: string; text: string; status: StepStatus };

const STATUS_OF: Record<CheckOutcome, StepStatus> = { pass: "pass", fail: "fail", not_checked: "skipped" };

/**
 * The live list of review steps, derived from what each app check answered. Checks run in order,
 * so every step up to the last answered one is finished and the next one is running.
 */
export function checkProgress(run: Pick<Run, "repoUrl" | "stage" | "checked">): ProgressStep[] {
  const checking = run.stage === "checking";
  const steps: ProgressStep[] = [];
  if (run.repoUrl) {
    steps.push({ key: "code", text: "Reading your app's code", status: checking ? "done" : "current" });
  }

  const answer = (ruleId: RuleId) => run.checked?.[ruleId];
  let last = -1;
  CHECK_STEPS.forEach((s, i) => {
    if (answer(s.ruleId)) last = i;
  });

  CHECK_STEPS.forEach((s, i) => {
    let status: StepStatus = "pending";
    if (checking && i <= last) {
      const outcome = answer(s.ruleId);
      status = outcome ? STATUS_OF[outcome] : "skipped";
    } else if (checking && i === last + 1) {
      status = "current";
    } else if (!run.repoUrl && run.stage === "scanning" && i === 0) {
      status = "current";
    }
    steps.push({ key: s.ruleId, text: s.text, status });
  });
  return steps;
}

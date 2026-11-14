import { describe, expect, it } from "vitest";
import { applyCheckResult } from "../../lib/review/merge";
import type { CheckResult, Evidence, Finding } from "../../lib/types";

const code: Evidence = { kind: "code", file: "src/routes/privacy.tsx", line: 1, caption: "privacy route" };
const shot: Evidence = { kind: "screenshot", path: "checks/R5/shot.png", caption: "Screen at the end of the R5 check" };

const scan: Finding = {
  ruleId: "R5",
  guideline: "5.1.1",
  title: "Privacy policy",
  detail: "The code has no privacy page.",
  source: "code",
  evidence: [code],
  confidence: "medium",
  state: "fail",
  fixable: "yes",
  finalState: "",
  humanStep: "",
};

const result = (outcome: CheckResult["outcome"]): CheckResult => ({
  ruleId: "R5",
  outcome,
  reason: "Privacy link found.",
  steps: [],
  screenshots: [],
});

describe("applyCheckResult", () => {
  it("records an app pass on a scan finding as a low risk with the app's evidence", () => {
    const [f] = applyCheckResult([scan], result("pass"), [shot]);
    expect(f).toMatchObject({ source: "code", state: "risk", confidence: "low" });
    expect(f.detail).toBe("The code has no privacy page. The app check passed on the live app: Privacy link found.");
    expect(f.evidence).toEqual([code, shot]);
  });

  it("keeps the app's evidence when the app check could not tell", () => {
    const [f] = applyCheckResult([scan], result("not_checked"), [shot]);
    expect(f).toMatchObject({ source: "code", state: "fail", confidence: "medium" });
    expect(f.detail).toContain("The app check could not run: Privacy link found.");
    expect(f.evidence).toEqual([code, shot]);
  });

  it("leaves a scan finding that found nothing alone", () => {
    const quiet = { ...scan, state: "pass" as const };
    expect(applyCheckResult([quiet], result("pass"), [shot])).toEqual([quiet]);
  });
});

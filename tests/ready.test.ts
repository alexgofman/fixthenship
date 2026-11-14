import { describe, expect, it } from "vitest";
import { readySections } from "../components/ReadyReport";
import type { Finding, Run, RuleId } from "../lib/types";

function finding(ruleId: RuleId, state: Finding["state"], finalState: Finding["finalState"] = ""): Finding {
  return {
    ruleId,
    guideline: "x",
    title: `Title ${ruleId}`,
    detail: `Detail ${ruleId}.`,
    source: "both",
    evidence: [],
    confidence: "high",
    state,
    fixable: "yes",
    finalState,
    humanStep: "",
  };
}

function run(findings: Finding[]): Run {
  return { id: "run1", createdAt: "", repoUrl: "", appUrl: "https://app.acme.dev", stage: "done", findings, fixes: [], error: "" };
}

const ids = (findings: Finding[]) => findings.map((f) => f.ruleId);

describe("readySections", () => {
  it("lists passes under Passed, only not-checked findings under Not checked, and broken passes as still failing", () => {
    const s = readySections(
      run([
        finding("R1", "pass"),
        finding("R2", "fail", "green"),
        finding("R3", "pass", "red"),
        finding("R4", "not_checked"),
        finding("R5", "fail", "red"),
        finding("R6", "fail", "amber"),
        finding("R9", "pass", "green"),
      ]),
    );
    expect(ids(s.fixed)).toEqual(["R2"]);
    expect(ids(s.needsYou)).toEqual(["R6"]);
    expect(ids(s.stillFailing)).toEqual(["R3", "R5"]);
    expect(ids(s.passed)).toEqual(["R1", "R9"]);
    expect(ids(s.notChecked)).toEqual(["R4"]);
  });
});

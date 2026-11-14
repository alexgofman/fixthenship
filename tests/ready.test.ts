import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReadyReport, { READY_LINE_DONE, READY_LINE_OPEN, ReadyHead, readyHeadline, readySections } from "../components/ReadyReport";
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

describe("ReadyHead", () => {
  const head = (r: Run) => renderToStaticMarkup(createElement(ReadyHead, { run: r }));

  it("says what is left to do while a finding needs the developer", () => {
    const r = run([finding("R2", "fail", "green"), finding("R6", "fail", "amber")]);
    expect(readyHeadline(r)).toEqual({ label: "What is left to do · Run run1", line: READY_LINE_OPEN });
    const html = head(r);
    expect(html).toContain("What is left to do · Run run1");
    expect(html).toContain(READY_LINE_OPEN);
    expect(html).not.toContain("Ready to submit");
  });

  it("says ready to submit when everything is green", () => {
    const r = run([finding("R1", "pass"), finding("R2", "fail", "green")]);
    expect(readyHeadline(r)).toEqual({ label: "Ready to submit · Run run1", line: READY_LINE_DONE });
    const html = head(r);
    expect(html).toContain("Ready to submit · Run run1");
    expect(html).toContain(READY_LINE_DONE);
    expect(html).not.toContain("What is left to do");
  });
});

describe("ReadyReport", () => {
  it("puts Needs you before Fixed and verified", () => {
    const html = renderToStaticMarkup(
      createElement(ReadyReport, { run: run([finding("R2", "fail", "green"), finding("R6", "fail", "amber")]) }),
    );
    const needs = html.indexOf('id="ready-needs"');
    const fixed = html.indexOf('id="ready-fixed"');
    expect(needs).toBeGreaterThan(-1);
    expect(fixed).toBeGreaterThan(-1);
    expect(needs).toBeLessThan(fixed);
    expect(html.indexOf('id="ready-failing"')).toBeGreaterThan(fixed);
  });
});

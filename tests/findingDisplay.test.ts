import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import DevinBoard from "../components/DevinBoard";
import FindingCard from "../components/FindingCard";
import Timeline from "../components/Timeline";
import {
  cleanReason,
  findingDetail,
  fixSummary,
  hasOpenFindings,
  headingsFor,
  plainError,
  rejectionSentence,
} from "../components/findingDisplay";
import { PLAIN_WORDS, STAGE_WORDS, stageWords } from "../lib/plainWords";
import { loadExampleRun } from "../lib/store";
import { STAGES, type Finding, type FixSession } from "../lib/types";

const finding = (over: Partial<Finding>): Finding => ({
  ruleId: "R2",
  guideline: "2.1(a)",
  title: "No placeholder content",
  detail: "",
  source: "app",
  evidence: [],
  confidence: "high",
  state: "fail",
  fixable: "yes",
  finalState: "",
  humanStep: "",
  ...over,
});

describe("cleanReason", () => {
  it("removes error codes, assert names and node ids", () => {
    expect(
      cleanReason(
        'Placeholder text found. In the app: ASSERTION_FAILED: agent.assert failed: The page shows Lorem ipsum (e.g., node n9011: "Lorem ipsum dolor sit amet...") on the pricing screen.',
      ),
    ).toBe("Placeholder text found. In the app: The page shows Lorem ipsum on the pricing screen.");
    expect(cleanReason("In the app: ERROR: No privacy link was found.")).toBe("In the app: No privacy link was found.");
    expect(cleanReason("In the app: ASSERTION_FAILED: The observation shows a link with href to Stripe.")).toBe(
      "In the app: A link with href to Stripe.",
    );
    expect(cleanReason("The button node n42 does nothing.")).toBe("The button does nothing.");
  });

  it("turns a step name after a pass into a plain pass", () => {
    expect(cleanReason("Passed at browser.evaluate.")).toBe("Passed.");
    expect(cleanReason("After the fix: Passed at browser.evaluate.")).toBe("After the fix: Passed.");
  });

  it("leaves plain text alone", () => {
    const text = "The home screen loaded in 1.8 seconds with no console errors.";
    expect(cleanReason(text)).toBe(text);
    expect(findingDetail({ detail: text })).toBe(text);
  });
});

describe("plainError and fixSummary", () => {
  it("drops API paths, status codes and JSON bodies", () => {
    expect(
      plainError("Could not prepare the store-ready-abc branch: GitHub GET /repos/o/r/branches/main failed: 404"),
    ).toBe("Could not prepare the store-ready-abc branch.");
    expect(plainError('Merge failed: 409 {"message":"conflict"}')).toBe("Merge failed.");
    expect(plainError("The app did not respond")).toBe("The app did not respond");
  });

  it("says plainly that Devin could not start", () => {
    expect(
      fixSummary(`Could not start a Devin session: Devin API POST /v1/sessions failed: 402 {"detail":"${"x".repeat(300)}"}`),
    ).toBe("Devin could not start this fix.");
    expect(fixSummary("Added a Delete account button.")).toBe("Added a Delete account button.");
  });
});

describe("headingsFor", () => {
  it("describes the rule, not the app, when a check could not tell", () => {
    expect(headingsFor(finding({ state: "not_checked" }))).toEqual({
      problem: "What reviewers reject",
      fix: "How it gets fixed",
      notChecked: true,
    });
  });

  it("calls a risk a risk", () => {
    expect(headingsFor(finding({ state: "risk" })).problem).toBe("The risk");
    expect(headingsFor(finding({ state: "risk", finalState: "amber" })).problem).toBe("The risk");
    expect(headingsFor(finding({ state: "fail" })).problem).toBe("The problem");
    expect(headingsFor(finding({ state: "pass", finalState: "green" })).problem).toBe("What reviewers reject");
  });
});

describe("rejectionSentence", () => {
  it("only asks the owner for a step on the never-green rules", () => {
    const run = {
      findings: [
        finding({ ruleId: "R1", fixable: "partly" }),
        finding({ ruleId: "R4", fixable: "partly" }),
        finding({ ruleId: "R10", fixable: "partly" }),
        finding({ ruleId: "R13", fixable: "no" }),
      ],
    };
    expect(rejectionSentence(run)).toBe(
      "Apple would likely reject this app for 4 reasons. We can fix 2 of them for you now. 1 needs one step from you.",
    );
  });
});

describe("stage words", () => {
  it("has a plain word for every stage", () => {
    for (const s of STAGES) expect(STAGE_WORDS[s]).not.toBe(s);
  });

  it("does not call errored or waiting sessions fixed", () => {
    const fixes = [{ status: "finished" }, { status: "error" }] as FixSession[];
    expect(stageWords("fixed", fixes)).toBe("Devin has stopped");
    expect(stageWords("fixed", [{ status: "finished" }])).toBe("Fixes ready to check");
  });
});

describe("hasOpenFindings", () => {
  it("is true while anything still fails or needs the owner", async () => {
    expect(hasOpenFindings(await loadExampleRun())).toBe(true);
    expect(hasOpenFindings({ findings: [finding({ finalState: "green" }), finding({ finalState: "" })] })).toBe(false);
  });
});

describe("FindingCard", () => {
  const render = (f: Finding) => renderToStaticMarkup(createElement(FindingCard, { finding: f, runId: "example", repoUrl: "" }));

  it("never states the problem on a not-checked card", async () => {
    const r11 = (await loadExampleRun()).findings.find((f) => f.ruleId === "R11")!;
    const html = render(r11);
    expect(html).toContain("Not checked");
    expect(html).toContain("We could not check this");
    expect(html).toContain("What reviewers reject");
    expect(html).not.toContain("The problem");
    expect(html).not.toContain("What we do");
  });

  it("shows the cleaned detail and no raw evidence path", () => {
    const html = render(
      finding({
        detail: "In the app: ASSERTION_FAILED: agent.assert failed: Lorem ipsum (e.g., node n9011: \"Lorem\")",
        evidence: [{ kind: "log", path: "recheck/R8/trace.md", caption: "After the fix: Passed at browser.evaluate." }],
      }),
    );
    expect(html).toContain("In the app: Lorem ipsum");
    expect(html).toContain("After the fix: Passed.");
    expect(html).not.toMatch(/ASSERTION_FAILED|agent\.assert|n9011|browser\.evaluate|>recheck\/R8\/trace\.md</);
    expect(html).toContain(PLAIN_WORDS.R2.problem.replace(/"/g, "&quot;"));
  });
});

describe("Timeline", () => {
  const render = (props: Parameters<typeof Timeline>[0]) => renderToStaticMarkup(createElement(Timeline, props));

  it("shows plain stage words", () => {
    const html = render({ stage: "rechecking", error: "" });
    expect(html).toContain("Checking again");
    expect(html).not.toMatch(/>rechecking</);
  });

  it("shows an error saved while fixing, without calling the run failed", () => {
    const html = render({
      stage: "fixing",
      error: "Could not prepare the store-ready-abc branch: GitHub GET /repos/o/r/branches/x failed: 404",
    });
    expect(html).toContain("Could not prepare the store-ready-abc branch.");
    expect(html).not.toContain("GET /repos");
    expect(html).not.toContain("Stopped");
  });
});

describe("DevinBoard", () => {
  it("shows plain statuses and summaries", () => {
    const html = renderToStaticMarkup(
      createElement(DevinBoard, {
        fixes: [
          {
            ruleId: "R5",
            sessionId: "",
            url: "",
            status: "error",
            prUrl: "",
            summary: 'Could not start a Devin session: Devin API POST /v1/sessions failed: 402 {"detail":"no"}',
            acus: 0,
          },
        ],
      }),
    );
    expect(html).toContain("Devin could not start this fix.");
    expect(html).toContain("Stopped with a problem");
    expect(html).not.toContain("/v1/sessions");
  });

  const fix = (ruleId: "R5" | "R7", acus: number) => ({
    ruleId,
    sessionId: `s-${ruleId}`,
    url: "",
    status: "finished" as const,
    prUrl: "",
    summary: "",
    acus,
  });
  const text = (html: string) => html.replace(/<!-- -->/g, "");

  it("hides the units column and total when every session reports 0", () => {
    const many = text(renderToStaticMarkup(createElement(DevinBoard, { fixes: [fix("R5", 0), fix("R7", 0)] })));
    expect(many).not.toContain("Devin units");
    expect(many).toContain(">2 sessions</span>");
    const one = text(renderToStaticMarkup(createElement(DevinBoard, { fixes: [fix("R5", 0)] })));
    expect(one).not.toContain("Devin units");
    expect(one).toContain(">1 session</span>");
  });

  it("keeps the units column and total when a session reports units", () => {
    const html = text(renderToStaticMarkup(createElement(DevinBoard, { fixes: [fix("R5", 0), fix("R7", 1.5)] })));
    expect(html).toContain(">2 sessions · 1.5 Devin units</span>");
    expect(html).toContain('<th class="num">Devin units</th>');
    expect(html.match(/data-label="Devin units"/g)).toHaveLength(2);
  });
});

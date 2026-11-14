import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MainAction, { NOTHING_TO_FIX } from "../components/MainAction";
import type { Finding, Run } from "../lib/types";
import { finding, makeRun } from "./fix/helpers";

function render(findings: Finding[], stage: Run["stage"] = "reviewed", repoUrl = "https://github.com/acme/app") {
  return renderToStaticMarkup(<MainAction run={{ ...makeRun("run1", findings), stage, repoUrl }} onUpdate={() => {}} />);
}

describe("MainAction", () => {
  it.each(["yes", "partly"] as const)("offers the fix when a failing finding is fixable %s", (fixable) => {
    const html = render([finding("R1", "pass", "yes"), finding("R2", "fail", fixable)]);
    expect(html).toContain("Fix these for me");
    expect(html).not.toContain(NOTHING_TO_FIX);
  });

  it("offers the fix without a repository too (it asks for the link first)", () => {
    expect(render([finding("R2", "fail", "yes")], "reviewed", "")).toContain("Fix these for me");
  });

  it("shows no action and says nothing would likely get the app rejected when nothing failed", () => {
    const html = render([finding("R1", "pass", "yes"), finding("R2", "not_checked", "yes")]);
    expect(html).not.toContain("<button");
    expect(html).toContain(NOTHING_TO_FIX);
  });

  it("shows the line for a review with no findings at all", () => {
    expect(render([])).toContain(NOTHING_TO_FIX);
  });

  it.each([
    ["a failure nobody can fix", [finding("R13", "fail", "no")]],
    ["a risk", [finding("R13", "risk", "no")]],
    ["a risk on a fixable rule", [finding("R2", "risk", "yes")]],
  ])("offers no fix and makes no promise for %s", (_name, findings) => {
    const html = render(findings);
    expect(html).not.toContain("Fix these for me");
    expect(html).not.toContain(NOTHING_TO_FIX);
  });

  it("still offers Check again once fixed", () => {
    expect(render([finding("R2", "fail", "yes")], "fixed")).toContain("Check again");
  });
});

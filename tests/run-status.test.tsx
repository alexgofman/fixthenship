import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RunStatus, { runStatus } from "../components/RunStatus";
import { loadExampleRun } from "../lib/store";
import type { Finding, Stage } from "../lib/types";
import { renderRunHtml } from "../scripts/export-run.mjs";
import { finding } from "./fix/helpers";

const fixable = [finding("R6", "fail", "yes"), finding("R1", "pass", "no")];
const nothingToFix = [finding("R13", "fail", "no"), finding("R8", "risk", "partly"), finding("R1", "pass", "no")];
const left = [{ ...finding("R6", "fail", "yes"), finalState: "green" }, { ...finding("R8", "fail", "partly"), finalState: "amber" }] as Finding[];
const failing = [{ ...finding("R6", "fail", "yes"), finalState: "red" }] as Finding[];
const allFixed = [{ ...finding("R6", "fail", "yes"), finalState: "green" }, { ...finding("R1", "pass", "no"), finalState: "green" }] as Finding[];

describe("runStatus", () => {
  it.each<[string, Stage, Finding[], string, string]>([
    ["scanning", "scanning", [], "checking", "We are using your app the way a reviewer would. This takes about three minutes."],
    ["checking", "checking", fixable, "checking", "We are using your app the way a reviewer would. This takes about three minutes."],
    ["reviewed with a fix to make", "reviewed", fixable, "needsYou", "The review is ready. Press “Fix these for me” and we will have each problem fixed."],
    ["reviewed with nothing to fix", "reviewed", nothingToFix, "done", "The review is ready. We found nothing we can fix for you."],
    ["fixing", "fixing", fixable, "fixing", "Devin is fixing the problems, one session for each. This takes about five minutes."],
    ["fixed", "fixed", fixable, "needsYou", "The fixes are ready. Press “Check again” and we will test the fixed app."],
    ["rechecking", "rechecking", fixable, "rechecking", "We are running the fixed app and repeating the same checks. This takes about five minutes."],
    ["done with a step left", "done", left, "needsYou", "Finished. Some steps are left for you: look for “Needs you” below."],
    ["done with one still failing", "done", failing, "needsYou", "Finished. Some steps are left for you: look for “Needs you” below."],
    ["done with everything fixed", "done", allFixed, "done", "Finished. Everything we found is fixed and verified. Apple still makes the decision."],
    ["failed", "failed", [], "stopped", "The review stopped before it finished. Start it again from the first page."],
  ])("%s", (_name, stage, findings, state, sentence) => {
    expect(runStatus({ stage, findings })).toEqual({ state, sentence });
  });
});

describe("RunStatus", () => {
  it("shows the mascot at 64 pixels, labelled with the sentence, and the sentence once for screen readers", () => {
    const html = renderToStaticMarkup(<RunStatus run={{ stage: "fixing", findings: fixable }} />);
    const sentence = "Devin is fixing the problems, one session for each. This takes about five minutes.";
    expect(html).toContain('class="fts-mascot fts-mascot-fixing"');
    expect(html).toContain('width="64" height="64"');
    expect(html).toContain(`role="img" aria-label="${sentence}"`);
    expect(html).toContain(`<p style="margin:0;min-width:0;font-size:17px;font-weight:600;overflow-wrap:anywhere" aria-hidden="true">${sentence}</p>`);
    expect(html).not.toContain("aria-live");
  });

  it("is not in the exported copy", async () => {
    expect(renderRunHtml(await loadExampleRun(), "")).not.toContain("fts-mascot");
  });
});

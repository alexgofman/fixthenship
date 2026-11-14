import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FindingCard from "../components/FindingCard";
import RejectionDecoder, { CHECK_RUNNING_LINE, NO_CHECK_LINE, NO_GUIDELINE_LINE } from "../components/RejectionDecoder";
import type { Finding, Run } from "../lib/types";
import { finding, makeRun } from "./fix/helpers";

const MESSAGE = `Guideline 5.1.1(v) - Legal - Privacy - Data Collection and Storage

The app supports account creation but does not include an option to initiate account deletion.

Guideline 4.8 - Design - Login Services

The app uses a third-party login service, but does not appear to offer an equivalent login option.

Guideline 2.3.3 - Performance - Accurate Metadata

Guideline 2.5.2 - Performance - Software Requirements <script>alert(1)</script>`;

function render(rejectionText: string | undefined, findings: Finding[] = []) {
  const run: Run = { ...makeRun("run1", findings), rejectionText };
  return renderToStaticMarkup(<RejectionDecoder run={run} />);
}

describe("RejectionDecoder", () => {
  it("shows nothing when no message was pasted", () => {
    expect(render(undefined)).toBe("");
    expect(render("")).toBe("");
  });

  it("says so in one line when the message names no guideline", () => {
    const html = render("We were unable to review your app. Please contact us.");
    expect(html).toContain(NO_GUIDELINE_LINE);
    expect(html).not.toContain("What Apple");
  });

  it("explains each guideline in Apple's order and links a matching finding's card", () => {
    const html = render(MESSAGE, [finding("R6", "fail", "yes")]);
    expect(html).toContain("What Apple&#x27;s message means");
    const order = ["Guideline 5.1.1(v)", "Guideline 4.8", "Guideline 2.3.3", "Guideline 2.5.2"].map((t) => html.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Legal: Privacy - Data Collection and Storage");
    expect(html).toContain("In plain words");
    expect(html).toContain("What the reviewer most often saw");
    expect(html).toContain("What to do first");
    expect(html).toContain('Our check for this: Title R6: <a href="#finding-R6">Likely rejection</a>');
    expect(html).toContain(CHECK_RUNNING_LINE);
    expect(html).toContain(NO_CHECK_LINE);
    expect(html).toContain("We do not have a plain explanation for guideline 2.5.2 yet.");
    expect(html).toContain("This is not legal advice.");
  });

  it("says the check is still running when the rule has no finding yet", () => {
    const html = render("Guideline 5.1.1(v) - Legal - Privacy - Data Collection and Storage");
    expect(html).toContain(CHECK_RUNNING_LINE);
    expect(html).not.toContain("#finding-");
  });

  it("shows the state after the re-check", () => {
    const html = render("Guideline 5.1.1(v) - Legal - Privacy - Data Collection and Storage", [
      { ...finding("R6", "fail", "partly"), finalState: "green" },
    ]);
    expect(html).toContain('<a href="#finding-R6">Fixed and verified</a>');
  });

  it("lists the state of each named check that has a finding, and only those", () => {
    const html = render("Guideline 2.1 - Performance - App Completeness", [
      { ...finding("R1", "pass", "no"), title: "The app loads without errors" },
      { ...finding("R2", "fail", "yes"), title: "No placeholder content" },
      { ...finding("R4", "risk", "partly"), title: "A reviewer can sign in" },
    ]);
    expect(html).toContain(
      "Our checks for this: The app loads without errors: " +
        '<a href="#finding-R1">Passed</a>; No placeholder content: <a href="#finding-R2">Likely rejection</a>; ' +
        'A reviewer can sign in: <a href="#finding-R4">Risk</a></p>',
    );
    expect(html).not.toContain("#finding-R3");
  });

  it("says the checks are still running when none of the named rules has a finding", () => {
    const html = render("Guideline 2.1 - Performance - App Completeness", [finding("R6", "fail", "yes")]);
    expect(html).toContain(CHECK_RUNNING_LINE);
    expect(html).not.toContain("#finding-");
  });

  it("says there is no check when the entry names no rule", () => {
    const html = render("Guideline 1.2 - Safety - User-Generated Content", [finding("R1", "fail", "yes")]);
    expect(html).toContain(NO_CHECK_LINE);
    expect(html).not.toContain("#finding-");
  });

  it("says when it explains the parent of the named guideline", () => {
    expect(render("Guideline 2.3.3(b) - Performance")).toContain("We explain guideline 2.3.3, the part of Apple&#x27;s rules that 2.3.3(b) belongs to.");
  });

  it("shows the pasted message back as plain text only", () => {
    const html = render(MESSAGE);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("the finding card has the id the link points to", () => {
    const html = renderToStaticMarkup(<FindingCard finding={finding("R6", "fail", "yes")} runId="run1" repoUrl="" />);
    expect(html).toContain('id="finding-R6"');
  });
});

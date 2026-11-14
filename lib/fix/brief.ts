import type { Evidence, Finding, RuleId, Run } from "../types";

export const BASE_BRANCH = "store-ready";

/** What an App Store reviewer does for each rule, and what they expect to see. */
const REVIEWER_STEPS: Partial<Record<RuleId, string>> = {
  R1:
    "The reviewer installs the app, opens it and waits for the first screen. They then move through the main screens. " +
    "Expected: every screen loads within a few seconds, nothing crashes, no blank or white screen appears, and there are no error messages or uncaught errors in the console.",
  R2:
    "The reviewer reads every screen they can reach, including pricing, settings, onboarding and empty states. " +
    "Expected: all text and images are real and final. There is no \"Lorem ipsum\", \"TODO\", \"Coming soon\", sample data, stock placeholder images or test accounts visible to users.",
  R3:
    "The reviewer taps every button, link and menu item they can find. " +
    "Expected: each one does something visible (opens a screen, submits, shows a message). Nothing does nothing, nothing leads to a 404 or an empty page, and nothing points to an unfinished feature.",
  R4:
    "The reviewer tries to get past the sign-in or paywall using the demo account given in the review notes, or by creating an account. " +
    "Expected: they can sign in or sign up without a real phone number, invite code or outside approval, and can then use the app's main features.",
  R5:
    "The reviewer looks for a privacy policy inside the app: in settings, on the sign-up screen and in the footer or menu. " +
    "Expected: a clearly labelled \"Privacy Policy\" link is reachable from inside the app and opens a real policy page that loads.",
  R6:
    "The reviewer creates an account, then looks in the account or settings screen for a way to delete it. " +
    "Expected: a \"Delete account\" option is in the app, asks for confirmation, and actually deletes the account and its data (not just signs out or deactivates). Sending an email to support is not enough.",
  R7:
    "The reviewer opens the sign-in screen and sees which login options are offered. " +
    "Expected: if the app offers a third-party login such as Google or Facebook, it also offers \"Sign in with Apple\" with equal prominence.",
  R8:
    "The reviewer looks for anything that can be bought (subscriptions, credits, premium features, digital content) while using the app on an iPhone. " +
    "Expected: digital goods are not sold through an outside checkout such as Stripe or a web payment link inside the iPhone app; on iPhone they must be sold through in-app purchase or not offered there at all.",
  R9:
    "The reviewer looks for a way to get help: a support, help or contact page, or a contact email. " +
    "Expected: a support or contact page is reachable from inside the app and gives a working way to reach the developer.",
  R10:
    "The reviewer looks at the app's screens, title, icon and footer for signs that it came from an app builder or template. " +
    "Expected: there are no \"Made with\" or \"Built with\" badges, no builder watermarks, no default favicon or page title, and no template branding; the app carries its own name and icon.",
  R11:
    "The reviewer opens the app for the first time and watches what it sends before they agree to anything. " +
    "Expected: no analytics, tracking or third-party AI calls happen until the user has given consent, and the app asks clearly before sharing data.",
  R12:
    "The reviewer looks at content created by other users. " +
    "Expected: each piece of user content can be reported, abusive users can be blocked, and there is a way to filter objectionable content.",
};

const GENERIC_STEPS =
  "The reviewer uses the app as a new user would and checks it against this guideline. " +
  "Expected: the problem described above can no longer be seen or reproduced.";

const RULE_EXTRA: Partial<Record<RuleId, string>> = {
  R7:
    "Add the \"Sign in with Apple\" button next to the existing third-party login options, with configuration placeholders " +
    "(for example environment variables for the Apple Services ID, Team ID, Key ID and private key) and no real secrets. " +
    "State clearly in your summary that Apple keys are still needed before Sign in with Apple can work.",
  R10:
    "Remove builder branding that comes from the code: the page title, meta tags, social preview image, favicon and any footer text or link that names the builder. " +
    "A floating \"Edit with …\" badge on the hosted site is added by the builder's hosting, not by this repository, so it cannot be removed here: " +
    "do not try to hide it with CSS or scripts, and state clearly in your summary that the owner must switch it off in the builder's project settings.",
  R8:
    "Hide the purchase path (buttons, links and screens that lead to the outside checkout) when the app runs inside an iPhone wrapper, " +
    "and keep it unchanged on the web. State clearly in your summary that selling on iPhone needs in-app purchase.",
};

export function describeEvidence(evidence: Evidence): string {
  if ("file" in evidence) return `${evidence.file}, line ${evidence.line}: ${evidence.caption}`;
  return `What the reviewer saw (${evidence.kind}): ${evidence.caption}`;
}

export function reviewerSteps(ruleId: RuleId): string {
  return REVIEWER_STEPS[ruleId] ?? GENERIC_STEPS;
}

/** The text given to Devin to fix one finding. */
export function buildFixBrief(run: Run, finding: Finding): string {
  const evidence = finding.evidence.length
    ? finding.evidence.map((e) => `- ${describeEvidence(e)}`).join("\n")
    : "- None recorded.";
  const extra = RULE_EXTRA[finding.ruleId];

  return [
    `# Fix ${finding.ruleId}: ${finding.title}`,
    "",
    "FixThenShip reviewed this app the way an App Store reviewer would and found a likely rejection risk. Please fix it.",
    "",
    `Repository: ${run.repoUrl}`,
    `Base branch: ${BASE_BRANCH}`,
    `App URL: ${run.appUrl}`,
    "",
    `## App Store guideline ${finding.guideline}: ${finding.title}`,
    "",
    "## What was found",
    "",
    finding.detail,
    "",
    "## Evidence",
    "",
    evidence,
    "",
    "## How the reviewer checks it",
    "",
    reviewerSteps(finding.ruleId),
    "",
    "## What to do",
    "",
    ...(extra ? [extra, ""] : []),
    `- Open ONE small pull request against the \`${BASE_BRANCH}\` branch that fixes only this finding.`,
    `- Put "${finding.ruleId}" in the pull request title and branch name.`,
    "- Do not touch anything unrelated: no refactors, formatting changes, dependency upgrades or other fixes.",
    "- When done, report the pull request link and a one-line summary of what you changed.",
  ].join("\n");
}

/** Structured output Devin is asked to return when it finishes. */
export const FIX_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    prUrl: { type: "string", description: "Link to the pull request you opened" },
    summary: { type: "string", description: "One-line summary of the change" },
  },
  required: ["prUrl", "summary"],
  additionalProperties: false,
};

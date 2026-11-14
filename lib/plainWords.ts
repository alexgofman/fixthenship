import type { FixSession, FixStatus, RuleId, Stage } from "./types";

/** Everyday-language texts for each rule, for app owners who have never read Apple's guidelines. */
export type PlainWords = {
  /** What is wrong, in one sentence. */
  problem: string;
  /** Why an App Store reviewer looks for it, in one sentence. */
  whyAppleCares: string;
  /** What the fix is, in one sentence. */
  whatWeDo: string;
};

export const PLAIN_WORDS: Record<RuleId, PlainWords> = {
  R1: {
    problem: "Your app shows an error or a blank screen when it opens on a phone.",
    whyAppleCares: "Reviewers reject apps that crash or do not load, because that is the first thing a customer would see.",
    whatWeDo: "We find what breaks while the app loads and fix it so the first screen appears cleanly.",
  },
  R2: {
    problem: "Your app still shows leftover placeholder text such as \"Lorem ipsum\" or \"Coming soon\".",
    whyAppleCares: "Placeholder text makes an app look unfinished, and reviewers reject apps that look like a draft.",
    whatWeDo: "We replace the placeholder text with real wording or remove the unfinished parts.",
  },
  R3: {
    problem: "Some buttons or links in your app do nothing or lead to a page that does not exist.",
    whyAppleCares: "Reviewers press everything they see, and a button that does nothing looks like a broken app.",
    whatWeDo: "We make each dead button do what it says, or remove it if it has no purpose yet.",
  },
  R4: {
    problem: "A reviewer cannot get past the sign-in to see what your app does.",
    whyAppleCares: "If the reviewer cannot get in, they cannot review the app and will likely send it back.",
    whatWeDo: "We make sure a new account can sign up and get in, and you then give Apple a demo login when you submit.",
  },
  R5: {
    problem: "People cannot find a privacy policy inside your app.",
    whyAppleCares: "Apple requires every app to show how it handles personal data, from inside the app itself.",
    whatWeDo: "We add a privacy policy page and a link to it where people can easily find it.",
  },
  R6: {
    problem: "People can create an account in your app but cannot delete it there.",
    whyAppleCares: "Apple requires that any app that lets people sign up also lets them delete their account from inside the app.",
    whatWeDo: "We add a \"Delete my account\" option in the settings that removes the account and its data.",
  },
  R7: {
    problem: "Your app offers sign-in with Google or another company but not \"Sign in with Apple\".",
    whyAppleCares: "Apple asks apps that offer another company's sign-in to also offer an option that is just as private, such as Sign in with Apple.",
    whatWeDo: "We add the \"Sign in with Apple\" button; you then add your Apple keys so it works.",
  },
  R8: {
    problem: "Your app sells a paid plan or digital extras through an outside checkout such as Stripe.",
    whyAppleCares: "Inside an iPhone app, Apple requires digital goods and subscriptions to be sold through its own in-app purchase.",
    whatWeDo: "We hide the outside checkout inside the iPhone app; to sell there you need to set up in-app purchase.",
  },
  R9: {
    problem: "Your app has no page where people can find support or contact you.",
    whyAppleCares: "Apple wants customers to have an easy way to get help with the app.",
    whatWeDo: "We add a support page with a way to contact you and link it from the app.",
  },
  R10: {
    problem: "Your app still shows the app builder's badge, name or default icon.",
    whyAppleCares: "Reviewers reject apps that look like an untouched template rather than a product of their own.",
    whatWeDo:
      "We remove the builder's name and default branding from your code; you switch off the floating badge in your builder's settings.",
  },
  R11: {
    problem: "Your app sends data to tracking or AI services before people have agreed to it.",
    whyAppleCares: "Apple requires apps to ask for permission before sharing personal data with other companies.",
    whatWeDo: "We add a consent step so nothing is shared until the person agrees.",
  },
  R12: {
    problem: "People can post content in your app but cannot report it or block other users.",
    whyAppleCares: "Apple requires apps with user posts to let people report bad content and block abusive users.",
    whatWeDo: "We add \"Report\" and \"Block\" options to posts and profiles.",
  },
  R13: {
    problem: "Your app may look like a website in a frame rather than an app made for the iPhone.",
    whyAppleCares: "Reviewers turn down apps that offer nothing more than the same website in a browser.",
    whatWeDo: "We cannot fix this one for you; it needs features that make sense on a phone, such as notifications or offline use.",
  },
};

/** What the live progress list says while each check runs, in the order the checks run. */
export const CHECK_STEPS: { ruleId: RuleId; text: string }[] = [
  { ruleId: "R1", text: "Opening your app on an iPhone-size screen" },
  { ruleId: "R2", text: "Looking for leftover placeholder text" },
  { ruleId: "R5", text: "Looking for your privacy policy" },
  { ruleId: "R6", text: "Signing up as a new user and looking for a way to delete the account" },
  { ruleId: "R7", text: "Checking the sign-in options" },
  { ruleId: "R8", text: "Trying to buy the paid plan" },
  { ruleId: "R3", text: "Pressing every button and link to find ones that do nothing" },
  { ruleId: "R4", text: "Checking that a reviewer can get past the sign-in" },
  { ruleId: "R9", text: "Looking for a support or contact page" },
  { ruleId: "R10", text: "Looking for the app builder's badge or default branding" },
];

/** The stage names people see; the stage itself stays the CSS class. */
export const STAGE_WORDS: Record<Stage, string> = {
  scanning: "Reading the code",
  checking: "Checking the app",
  reviewed: "Review ready",
  fixing: "Fixing",
  fixed: "Fixes ready to check",
  rechecking: "Checking again",
  done: "Finished",
  failed: "Stopped",
};

/** "fixed" only means every Devin session stopped; it says so plainly when some did not finish. */
export function stageWords(stage: Stage, fixes: Pick<FixSession, "status">[] = []): string {
  if (stage === "fixed" && fixes.some((f) => f.status !== "finished")) return "Devin has stopped";
  return STAGE_WORDS[stage];
}

export const FIX_STATUS_WORDS: Record<FixStatus, string> = {
  queued: "Not started yet",
  working: "Working",
  waiting: "Waiting for an answer",
  finished: "Finished",
  error: "Stopped with a problem",
};

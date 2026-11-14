import { test } from "@e2e-dev/web";
import { expect, isAgentError } from "e2e";
import { z } from "zod";
import { hasAccounts, markNotChecked, signUp, STEP_LIMIT_MS } from "./support";

/** The step was stopped before it reached a verdict; the runner reports these as not checked. */
const BLOCKED = /^(?:MODEL_[A-Z_]+|STEP_TIMEOUT|STEP_BUDGET_EXHAUSTED|AUTOMATION_UNSUPPORTED)$/;

const OUTSIDE_CHECKOUT = /stripe\.com|paddle\.com|lemonsqueezy\.com|paypal\.com|gumroad\.com|chargebee\.com|polar\.sh/i;

/**
 * Guideline 3.1.1 is about the iPhone app, not the website. Web apps reach the App Store inside a wrapper,
 * most often Capacitor, which announces itself on `window.Capacitor`. The check opens the app as that
 * wrapper would, so an outside checkout that is hidden inside the iPhone app counts as hidden.
 */
const IOS_WRAPPER = `
  window.Capacitor = window.Capacitor || {
    platform: "ios",
    getPlatform: function () { return "ios"; },
    isNativePlatform: function () { return true; },
    isPluginAvailable: function () { return false; },
  };
  window.webkit = window.webkit || {};
  window.webkit.messageHandlers = window.webkit.messageHandlers || {};
`;

test("digital goods are not sold through outside checkout", async ({ app, agent, browser }) => {
  await browser.addInitScript(IOS_WRAPPER);
  await app.open("/");
  // An app with no accounts sells to everyone from its public screens: look for the paid plan as a visitor.
  if (await hasAccounts(agent)) {
    const notPossible = await signUp(agent);
    if (notPossible) {
      markNotChecked(notPossible);
      test.skip(notPossible);
    }
  }

  try {
    await agent.act(
      "Find the paid plan, subscription, upgrade or Pro option and start buying it: press the button that starts the purchase, then stop. Do not enter any payment details.",
      { timeout: STEP_LIMIT_MS },
    );
  } catch (error) {
    if (isAgentError(error) && BLOCKED.test(error.code)) throw error;
    console.log("Inside the iPhone app no paid plan could be found or started, so nothing is sold through outside checkout there.");
    return;
  }

  // Guideline 3.1.3(e) and 3.1.5(a) let goods and services used outside the app be paid for outside In-App Purchase.
  let sold: { kind: "digital" | "physical" | "unsure"; note: string };
  try {
    sold = await agent.extract(
      "what the plan or purchase on this screen pays for: 'digital' when it unlocks digital content or features used inside the app (premium features, more usage, credits, content, an ad-free version); 'physical' when it pays for physical goods or a service used in the real world outside the app (such as a gym or class membership, deliveries, a meal kit or coffee subscription, rides or bookings); 'unsure' when this screen does not show which",
      { schema: z.object({ kind: z.enum(["digital", "physical", "unsure"]), note: z.string() }) },
    );
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    sold = { kind: "unsure", note: isAgentError(error) ? error.explanation : String(error) };
  }
  if (sold.kind === "physical") {
    console.log(
      `The paid plan is for goods or services used outside the app, which Apple allows to be paid for outside In-App Purchase: ${sold.note}`,
    );
    return;
  }
  if (sold.kind === "unsure") {
    const reason = `It was not clear whether the paid plan is for digital content used in the app or for goods and services used outside it: ${sold.note}`;
    markNotChecked(reason);
    test.skip(reason);
  }

  expect(new URL(await browser.url()).hostname, "the purchase opened an outside checkout page").not.toMatch(
    OUTSIDE_CHECKOUT,
  );
  await agent.assert(
    "the purchase for digital content used in the app stays inside the app: this is not a checkout or payment page from an outside provider such as Stripe, Paddle, Lemon Squeezy, PayPal or Gumroad, and the screen does not send the user to an outside payment link",
  );
});

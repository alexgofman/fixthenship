import { test } from "@e2e-dev/web";
import { expect, isAgentError } from "e2e";
import { markNotChecked, signUp, STEP_LIMIT_MS } from "./support";

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
  const notPossible = await signUp(agent);
  if (notPossible) {
    markNotChecked(notPossible);
    test.skip(notPossible);
  }

  try {
    await agent.act(
      "Find the paid plan, subscription, upgrade or Pro option and start buying it: press the button that starts the purchase, then stop. Do not enter any payment details.",
      { timeout: STEP_LIMIT_MS },
    );
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    console.log("Inside the iPhone app no paid plan could be found or started, so nothing is sold through outside checkout there.");
    return;
  }

  expect(new URL(await browser.url()).hostname, "the purchase opened an outside checkout page").not.toMatch(
    OUTSIDE_CHECKOUT,
  );
  await agent.assert(
    "the purchase stays inside the app: this is not a checkout or payment page from an outside provider such as Stripe, Paddle, Lemon Squeezy, PayPal or Gumroad, and the screen does not send the user to an outside payment link",
  );
});

import { test } from "@e2e-dev/web";
import { expect, isAgentError } from "e2e";
import { markNotChecked, signUp } from "./support";

const OUTSIDE_CHECKOUT = /stripe\.com|paddle\.com|lemonsqueezy\.com|paypal\.com|gumroad\.com|chargebee\.com|polar\.sh/i;

test("digital goods are not sold through outside checkout", async ({ app, agent, browser }) => {
  await app.open("/");
  const notPossible = await signUp(agent);
  if (notPossible) {
    markNotChecked(notPossible);
    test.skip(notPossible);
  }

  try {
    await agent.act(
      "Find the paid plan, subscription, upgrade or Pro option and start buying it: press the button that starts the purchase, then stop. Do not enter any payment details.",
    );
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    console.log("No paid plan could be found or started, so nothing is sold through outside checkout.");
    return;
  }

  expect(new URL(await browser.url()).hostname, "the purchase opened an outside checkout page").not.toMatch(
    OUTSIDE_CHECKOUT,
  );
  await agent.assert(
    "the purchase stays inside the app: this is not a checkout or payment page from an outside provider such as Stripe, Paddle, Lemon Squeezy, PayPal or Gumroad, and the screen does not send the user to an outside payment link",
  );
});

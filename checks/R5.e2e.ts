import { isAgentError, test } from "e2e";
import { STEP_LIMIT_MS } from "./support";

/** The step was stopped before it reached a verdict; the runner reports these as not checked. */
const BLOCKED = /^(?:MODEL_[A-Z_]+|STEP_TIMEOUT|STEP_BUDGET_EXHAUSTED|AUTOMATION_UNSUPPORTED)$/;

test("a privacy policy is reachable", async ({ app, agent }) => {
  await app.open("/");
  try {
    await agent.act(
      "Find a link to the privacy policy on this screen, in the menu, in the footer or on the sign-up screen, and open it.",
      { timeout: STEP_LIMIT_MS },
    );
  } catch (error) {
    // A model failure or a step that ran out of time is not a finding; let the runner report the check as not checked.
    if (isAgentError(error) && BLOCKED.test(error.code)) throw error;
    // Not finding the link IS the finding: fail the test plainly so the runner records a failure.
    throw new Error(
      "No privacy policy link was found on the first screen, in the menu, in the footer or on the sign-up screen.",
    );
  }
  await agent.assert(
    "the screen shows a privacy policy: a page about privacy that explains what personal data the app collects and how it is used",
  );
});

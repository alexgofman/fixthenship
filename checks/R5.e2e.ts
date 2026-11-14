import { isAgentError, test } from "e2e";

test("a privacy policy is reachable", async ({ app, agent }) => {
  await app.open("/");
  try {
    await agent.act(
      "Find a link to the privacy policy on this screen, in the menu, in the footer or on the sign-up screen, and open it.",
    );
  } catch (error) {
    // A model failure is not a finding; let the runner report the check as not checked.
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    // Not finding the link IS the finding: fail the test plainly so the runner records a failure.
    throw new Error(
      "No privacy policy link was found on the first screen, in the menu, in the footer or on the sign-up screen.",
    );
  }
  await agent.assert(
    "the screen shows a privacy policy: a page about privacy that explains what personal data the app collects and how it is used",
  );
});

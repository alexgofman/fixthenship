import { test } from "e2e";
import { hasAccounts, markNotChecked, signUp, STEP_LIMIT_MS } from "./support";

test("an account can be deleted", async ({ app, agent }) => {
  await app.open("/");
  if (!(await hasAccounts(agent))) {
    console.log("The app has no accounts, so there is no account to delete.");
    return;
  }
  const notPossible = await signUp(agent);
  if (notPossible) {
    markNotChecked(notPossible);
    test.skip(notPossible);
  }

  await agent.act("Open the settings, profile or account screen of the signed-in user.", { timeout: STEP_LIMIT_MS });
  await agent.assert(
    "this screen offers a way to delete the account, such as a 'Delete account' button or link",
    { explore: true },
  );
});

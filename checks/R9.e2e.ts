import { isAgentError, test, type Agent } from "e2e";
import { markNotChecked, signUp } from "./support";

const SUPPORT_SHOWN =
  "the screen shows a way to get support: a support, help, FAQ or contact page, a contact form, or a support or contact email address";

/** True when a support page or address is found and shown; false when none is there. */
async function findSupport(agent: Agent, where: string): Promise<boolean> {
  try {
    await agent.act(
      `Look ${where} for a link to a support, help or contact page, or for a support or contact email address. Open the page if there is a link to one; for an email address, do not open it but scroll until it is visible. Do not send anything.`,
    );
    await agent.assert(SUPPORT_SHOWN);
    return true;
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    return false;
  }
}

test("a support or contact page exists", async ({ app, agent }) => {
  await app.open("/");
  if (await findSupport(agent, "on this screen, in its menu and in its footer")) return;

  await app.open("/");
  const notPossible = await signUp(agent);
  if (!notPossible) {
    try {
      await agent.act("Open the settings, profile or account screen of the signed-in user.");
    } catch (error) {
      if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    }
    if (await findSupport(agent, "on this screen, in the menu and in the footer")) return;
    throw new Error(
      "No support, help or contact page and no support email address was found on the first screen, in the menu, the footer or the settings screen.",
    );
  }

  throw new Error(
    `No support, help or contact page and no support email address was found on the public screens (the settings screen could not be checked: ${notPossible.replace(/[.!?]+$/, "").replace(/[.!?]\s/g, ", ")}).`,
  );
});

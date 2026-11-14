import { isAgentError, test } from "e2e";
import { z } from "zod";

test("third-party login comes with an Apple option", async ({ app, agent }) => {
  await app.open("/");
  try {
    await agent.act("Open the sign-in screen (log in or sign in). Do not fill anything in.");
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    console.log("No sign-in screen was found, so no third-party login is offered.");
    return;
  }

  const options = await agent.extract(
    "the third-party sign-in options this screen offers, such as Google, Facebook, GitHub, X, Microsoft or Apple (not email or phone), as a list of provider names; an empty list when there are none",
    { schema: z.object({ providers: z.array(z.string()) }) },
  );
  const others = options.providers.filter((p) => !/apple/i.test(p));
  if (others.length === 0) return;

  await agent.assert(
    `the sign-in screen offers Sign in with Apple (a 'Sign in with Apple' or 'Continue with Apple' button) next to ${others.join(", ")}`,
    { explore: true },
  );
});

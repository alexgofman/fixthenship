import { isAgentError, test } from "e2e";
import { z } from "zod";
import { markNotChecked } from "./support";

const CANNOT_SIGN_IN = "A reviewer cannot sign in: add a demo account or email sign-up";

test("the reviewer can get in", async ({ app, agent }) => {
  await app.open("/");
  const first = await agent.extract(
    "whether a visitor who is not signed in can already use the app's main features or see its real content from this screen, as opposed to only a sign-in or sign-up screen, or a landing page where every action asks to sign in",
    { schema: z.object({ usableWithoutAccount: z.boolean(), note: z.string() }) },
  );
  if (first.usableWithoutAccount) {
    console.log(`The app can be used without an account: ${first.note}`);
    return;
  }

  let found = false;
  for (const instruction of [
    "Open the screen where a new user creates an account (sign up, register, create account or get started). Do not fill anything in.",
    "Open the sign-in screen (log in or sign in). Do not fill anything in.",
  ]) {
    try {
      await agent.act(instruction);
      found = true;
      break;
    } catch (error) {
      if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    }
  }
  if (!found) {
    console.log("No sign-up or sign-in screen was found, so nothing is kept behind an account.");
    return;
  }

  const options = await agent.extract(
    "the ways this screen offers to sign up or sign in: whether a new user can create an account with an email address (with a password, a code or an emailed link), whether it offers demo or guest access, and the third-party providers it offers such as Google, Facebook, GitHub, X, Microsoft or Apple, as a list of provider names",
    {
      schema: z.object({
        emailSignUp: z.boolean(),
        demoOrGuest: z.boolean(),
        thirdParty: z.array(z.string()),
        note: z.string(),
      }),
    },
  );
  if (options.emailSignUp || options.demoOrGuest) {
    console.log(`A reviewer can get in: ${options.note}`);
    return;
  }
  if (options.thirdParty.length > 0) throw new Error(CANNOT_SIGN_IN);

  const reason =
    "Only a sign-in form was found and no way to sign up; a reviewer needs demo account details in the App Review notes, which this check cannot see.";
  markNotChecked(reason);
  test.skip(reason);
});

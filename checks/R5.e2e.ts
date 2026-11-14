import { test } from "e2e";

test("a privacy policy is reachable", async ({ app, agent }) => {
  await app.open("/");
  await agent.act(
    "Find a link to the privacy policy on this screen, in the menu, in the footer or on the sign-up screen, and open it.",
  );
  await agent.assert(
    "the screen shows a privacy policy: a page about privacy that explains what personal data the app collects and how it is used",
  );
});

import { test } from "e2e";

test("the app loads", async ({ app, agent }) => {
  await app.open("/");
  await agent.assert(
    "the first screen shows real app content; it is not blank, not stuck on a loading spinner, and shows no error message such as 'Application error', 'Something went wrong', 404 or 500",
  );
});

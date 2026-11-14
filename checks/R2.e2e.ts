import { test } from "@e2e-dev/web";

const PLACEHOLDER_FREE =
  "no visible text on this screen is placeholder content: no 'lorem ipsum', no 'coming soon', no 'TODO', no 'placeholder', no 'your text here', and no obvious dummy text or stock template copy";
const MAX_EXTRA_SCREENS = 4;

test("no placeholder content", async ({ app, agent, browser }) => {
  await app.open("/");
  await agent.assert(PLACEHOLDER_FREE, { explore: true });

  const home = new URL(await browser.url());
  const hrefs = await browser.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"), (a) => (a as HTMLAnchorElement).href),
  );
  const paths = new Set<string>();
  for (const href of hrefs) {
    const url = new URL(href);
    if (url.origin !== home.origin || url.pathname === home.pathname) continue;
    if (/log-?out|sign-?out/i.test(url.pathname)) continue;
    paths.add(url.pathname);
    if (paths.size >= MAX_EXTRA_SCREENS) break;
  }

  for (const pathname of paths) {
    await app.open(pathname);
    await agent.assert(PLACEHOLDER_FREE, { explore: true });
  }
});

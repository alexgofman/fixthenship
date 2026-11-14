import { test } from "@e2e-dev/web";
import { isAgentError } from "e2e";
import { hasAccounts, markNotChecked, signUp } from "./support";

const MAX_LINKED_SCREENS = 4;
/** The step was stopped before it reached a verdict; the runner reports these as not checked. */
const BLOCKED = /^(?:MODEL_[A-Z_]+|STEP_TIMEOUT|STEP_BUDGET_EXHAUSTED|AUTOMATION_UNSUPPORTED)$/;

/** Runs in the page: the links and buttons that lead to support, and any contact address the screen shows. */
function supportOnScreen(): string[] {
  const found: string[] = [];
  const words = /\b(support|help|contact|faq|feedback)\b/i;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("a[href], button, [role='button'], [role='link']"))) {
    const label = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
    const href = el instanceof HTMLAnchorElement ? (el.getAttribute("href") ?? "") : "";
    if (words.test(label) || /^mailto:/i.test(href) || /\/(support|help|contact|faq)\b/i.test(href)) found.push(label || href);
  }
  const text = document.body.innerText;
  const address = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (address && /support|contact|help|get in touch|reach us|email us/i.test(text)) found.push(address[0]);
  return found;
}

/** Runs in the page: where the links on this screen lead. */
function linksOnScreen(): string[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => a.href);
}

test("a support or contact page exists", async ({ app, agent, browser }) => {
  // Read the screens directly: a list of links is a fact, so no model has to go looking for one.
  const supportAt = async (place: string): Promise<boolean> => {
    const found = await browser.evaluate(supportOnScreen);
    if (found.length > 0) console.log(`Support found ${place}: "${found[0]}".`);
    return found.length > 0;
  };

  /** Opens a screen; an app that is still redirecting gets a second try, and a screen that will not open is skipped. */
  const opened = async (screen: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await app.open(screen);
        return true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
    }
    console.log(`${screen} could not be opened, so it was not searched.`);
    return false;
  };

  await app.open("/");
  if (await supportAt("on the first screen")) return;

  const home = new URL(await browser.url());
  const linked: string[] = [];
  for (const href of await browser.evaluate(linksOnScreen)) {
    const url = new URL(href);
    if (url.origin === home.origin && url.pathname !== home.pathname && !linked.includes(url.pathname)) linked.push(url.pathname);
  }
  for (const screen of linked.slice(0, MAX_LINKED_SCREENS)) {
    if (!(await opened(screen))) continue;
    if (await supportAt(`on ${screen}`)) return;
  }

  if (!(await opened("/"))) await app.open("/");
  if (!(await hasAccounts(agent))) {
    throw new Error(
      "No support, help or contact page and no support email address was found on the first screen or the screens it links to. The app has no account or settings screen where one could be.",
    );
  }
  const notPossible = await signUp(agent);
  if (notPossible) {
    // Support is often only in the settings, so not getting there is "not checked", never a finding.
    const reason = `Support was not found on the public screens, and the settings screen could not be checked: ${notPossible}`;
    markNotChecked(reason);
    test.skip(reason);
  }

  if (await supportAt("on the first screen after signing in")) return;
  try {
    await agent.act("Open the settings, profile or account screen of the signed-in user.", { timeout: 40_000 });
    if (await supportAt("on the settings screen")) return;
  } catch (error) {
    if (isAgentError(error) && BLOCKED.test(error.code)) throw error;
  }
  throw new Error(
    "No support, help or contact page and no support email address was found on the first screen, the screens it links to, or the settings screen.",
  );
});

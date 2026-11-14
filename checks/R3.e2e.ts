import { test } from "@e2e-dev/web";
import { isAgentError } from "e2e";

const MAX_CONTROLS = 10;
const MAX_EXTRA_SCREENS = 2;
const SETTLE_MS = 1_500;
const ERROR_PAGE =
  /\b404\b|not found|page (?:could not|cannot|can't) be found|(?:doesn't|does not) exist|\b500\b|internal server error|application error|something went wrong|unexpected error/i;
/** Short screens that name an error are error pages; a long screen that mentions "404" is content. */
const ERROR_PAGE_MAX_CHARS = 600;
const RISKY = /log ?out|sign ?out|delete|remove|unsubscribe|cancel (?:my )?(?:plan|subscription|account)/i;

type Control = { id: number; kind: "link" | "button"; label: string; href: string };
type Screen = { url: string; html: string; scroll: number };

/** Tags every visible link and button outside forms with data-fts-control and lists them in page order. */
function tagControls(): Control[] {
  const controls: Control[] = [];
  const nodes = document.querySelectorAll<HTMLElement>("a[href], button, [role='button']");
  for (const el of Array.from(nodes)) {
    el.removeAttribute("data-fts-control");
    if (el.closest("form") || (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") continue;
    const label = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
    const href = el instanceof HTMLAnchorElement ? el.href : "";
    const id = controls.length;
    el.setAttribute("data-fts-control", String(id));
    controls.push({ id, kind: href ? "link" : "button", label: label.slice(0, 60), href });
  }
  return controls;
}

function readScreen(): Screen {
  let hash = 0;
  const html = document.body.innerHTML;
  for (let i = 0; i < html.length; i++) hash = (hash * 31 + html.charCodeAt(i)) | 0;
  return { url: location.href.split("#")[0], html: `${html.length}:${hash}`, scroll: Math.round(window.scrollY) };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads the page, waiting out a page load that is still in progress. */
async function whenLoaded<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= 3 || !/context was destroyed|navigation/i.test(String(error))) throw error;
      await sleep(1_000);
    }
  }
}

const key = (c: Control) => `${c.kind}|${c.label}|${c.href.split("#")[0]}`;
const name = (c: Control) => `"${(c.label || c.href || c.kind).replace(/[.!?"]/g, "")}"`;

test("no dead buttons or broken links", async ({ app, browser }) => {
  let dialogs = 0;
  await browser.onDialog(async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });

  await app.open("/");
  const home = new URL(await browser.url());
  const first = await browser.evaluate(tagControls);
  const screens = [home.pathname];
  for (const c of first) {
    if (screens.length > MAX_EXTRA_SCREENS) break;
    if (c.kind !== "link" || RISKY.test(c.label + c.href)) continue;
    const url = new URL(c.href);
    if (url.origin === home.origin && !screens.includes(url.pathname)) screens.push(url.pathname);
  }

  const tried = new Set<string>();
  const problems: string[] = [];
  for (const screen of screens) {
    if (tried.size >= MAX_CONTROLS) break;
    await app.open(screen);
    for (const listed of await browser.evaluate(tagControls)) {
      if (tried.size >= MAX_CONTROLS) break;
      if (tried.has(key(listed)) || RISKY.test(listed.label + listed.href)) continue;
      if (listed.href && !/^https?:/.test(listed.href)) continue;
      if (listed.href && new URL(listed.href).origin !== home.origin) continue;
      tried.add(key(listed));

      await app.open(screen);
      const controls = await browser.evaluate(tagControls);
      const control = controls.find((c) => key(c) === key(listed));
      if (!control) continue;

      if (control.href) {
        const status = await browser.evaluate(
          (href: string) => fetch(href, { redirect: "follow" }).then((r) => r.status, () => 0),
          control.href,
        );
        if (status >= 400) {
          problems.push(`${name(control)} leads to an error page (HTTP ${status})`);
          continue;
        }
      }

      const before = await browser.evaluate(readScreen);
      const tabs = browser.tabs().length;
      const dialogsBefore = dialogs;
      try {
        await browser.locator(`[data-fts-control="${control.id}"]`).click({ timeout: 5_000 });
      } catch (error) {
        if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
        console.log(`Could not press ${name(control)}, so it was not judged.`);
        continue;
      }
      // Wait here, not inside the page: a press that loads a new page throws away the page's own timers.
      await sleep(SETTLE_MS);

      if (browser.tabs().length > tabs) {
        for (const tab of browser.tabs().slice(tabs)) if (!tab.isClosed()) await tab.close();
        continue;
      }
      const after = await whenLoaded(() => browser.evaluate(readScreen));
      if (after.url !== before.url) {
        const text = await whenLoaded(() => browser.evaluate(() => `${document.title}\n${document.body.innerText}`.trim()));
        if (text.length <= ERROR_PAGE_MAX_CHARS && ERROR_PAGE.test(text)) {
          problems.push(`${name(control)} leads to an error or not found page`);
        }
        continue;
      }
      if (after.html === before.html && after.scroll === before.scroll && dialogs === dialogsBefore) {
        problems.push(`${name(control)} does nothing`);
      }
    }
  }

  console.log(`Tried ${tried.size} buttons and links on ${screens.join(", ")}.`);
  if (problems.length > 0) {
    throw new Error(`${problems.length} of ${tried.size} buttons and links tried do not work: ${problems.join("; ")}.`);
  }
});

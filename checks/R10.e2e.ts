import { test } from "@e2e-dev/web";

const BUILDER =
  /\b(?:edit|made|built|created|powered|generated)\s+(?:with|by|in|on)\s+(?:lovable|bolt|replit|v0|base44|bubble|softr|glide|dyad|create(?:\.xyz)?|anything|gpt\s*engineer)\b|lovable\.dev|bolt\.new|replit\.com|v0\.dev|base44\.com|gptengineer/i;

type Marker = { text: string; href: string };

test("no app-builder badge", async ({ app, agent, browser }) => {
  await app.open("/");
  const markers = await browser.evaluate((source: string): Marker[] => {
    const re = new RegExp(source, "i");
    const found: Marker[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("a, button, iframe, img, div, span, p"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const href = el instanceof HTMLAnchorElement ? el.href : el instanceof HTMLIFrameElement ? el.src : "";
      const external = href && new URL(href, location.href).origin !== location.origin;
      const own = el.children.length === 0 || el instanceof HTMLAnchorElement ? el.innerText : "";
      // A badge often repeats its label in aria-label or title; say it once.
      const parts = [own, el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("alt")].map((t) => (t ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
      const text = parts.filter((t, i) => !parts.some((other, j) => j !== i && other.includes(t) && (other.length > t.length || j < i))).join(" ");
      if (re.test(text) || (external && re.test(href))) found.push({ text: text.replace(/\s+/g, " ").trim().slice(0, 60), href });
      if (found.length >= 3) break;
    }
    return found;
  }, BUILDER.source);
  if (markers.length > 0) {
    const shown = markers[0].text || markers[0].href;
    throw new Error(`An app-builder badge or link is visible on the first screen: "${shown.replace(/[."]/g, "")}".`);
  }

  await agent.assert(
    "no app-builder badge or branding is visible on this screen: no 'Edit with Lovable', 'Made with Bolt', 'Built with Replit', 'Made with v0' or similar badge, button or link, and no floating builder logo in a corner",
    { explore: true },
  );
});

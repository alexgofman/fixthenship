import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GuidelinesNote from "../components/GuidelinesNote";
import type { GuidelinesCheck } from "../lib/guidelines/freshness";
import { guidelinesNoteParts } from "../lib/guidelines/sections.mjs";
import { guidelinesNoteHtml } from "../scripts/export-run.mjs";

const checkedAt = new Date();
checkedAt.setUTCHours(15, 4, 0, 0);
const base: GuidelinesCheck = { checkedAt: checkedAt.toISOString(), status: "unchanged", snapshotDate: "2026-11-14", changed: [], changedElsewhere: 0 };

function text(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&#x27;|&#39;/g, "'");
}

describe("GuidelinesNote", () => {
  it("says the sections have not changed, with the time it read the page", () => {
    expect(text(renderToStaticMarkup(<GuidelinesNote check={base} />))).toBe(
      "Apple's App Review Guidelines were read again at 15:04 today. The sections behind these checks have not changed since we wrote the checks (14 November 2026).",
    );
  });

  it("uses the reader's time zone", () => {
    const parts = guidelinesNoteParts(base, { timeZone: "Asia/Kolkata", now: new Date(base.checkedAt) });
    expect(parts[0]).toContain("at 20:34 today");
  });

  it("names and links a changed guideline", () => {
    const html = renderToStaticMarkup(<GuidelinesNote check={{ ...base, status: "changed", changed: ["5.1.1"] }} />);
    expect(text(html)).toBe(
      "Apple has changed guideline 5.1.1 since we wrote our checks (14 November 2026). Read that section before you rely on this review.",
    );
    expect(html).toContain('href="https://developer.apple.com/app-store/review/guidelines/#5.1.1"');
  });

  it("joins several guidelines", () => {
    const html = renderToStaticMarkup(<GuidelinesNote check={{ ...base, status: "changed", changed: ["5.1.1", "4.8"] }} />);
    expect(text(html)).toMatch(/^Apple has changed guidelines 4\.8 and 5\.1\.1 since we wrote our checks \(14 November 2026\)\./);
    expect(html).toContain('href="https://developer.apple.com/app-store/review/guidelines/#4.8"');
  });

  it("says when the page could not be reached", () => {
    expect(text(renderToStaticMarkup(<GuidelinesNote check={{ ...base, status: "unreachable" }} />))).toBe(
      "We could not reach Apple's guidelines page just now, so these checks use our copy from 14 November 2026.",
    );
  });

  it("renders nothing for older runs", () => {
    expect(renderToStaticMarkup(<GuidelinesNote />)).toBe("");
  });

  it("is repeated in the saved copy", () => {
    const changed = { ...base, status: "changed" as const, changed: ["4.8"] };
    expect(text(guidelinesNoteHtml({ guidelines: changed }))).toBe(text(renderToStaticMarkup(<GuidelinesNote check={changed} />)));
    expect(guidelinesNoteHtml({})).toBe("");
    for (const status of ["unchanged", "changed", "unreachable"] as const) {
      expect(text(guidelinesNoteHtml({ guidelines: { ...base, status, changed: ["5.1.1"] } }))).not.toMatch(/approve/i);
    }
  });
});

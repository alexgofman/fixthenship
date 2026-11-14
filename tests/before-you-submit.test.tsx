import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BeforeYouSubmit, { BEFORE_YOU_SUBMIT_LEAD, BEFORE_YOU_SUBMIT_TITLE, CHECKLIST, storageKey } from "../components/BeforeYouSubmit";
import ReadyReport from "../components/ReadyReport";
import { loadExampleRun } from "../lib/store";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;");

describe("BeforeYouSubmit", () => {
  const html = renderToStaticMarkup(<BeforeYouSubmit runId="run1" />);
  const total = CHECKLIST.reduce((n, g) => n + g.items.length, 0);

  it("renders the title, the lead line and every group with its items", () => {
    expect(html).toContain(escape(BEFORE_YOU_SUBMIT_TITLE));
    expect(html).toContain(escape(BEFORE_YOU_SUBMIT_LEAD));
    for (const g of CHECKLIST) {
      expect(html).toContain(escape(g.title));
      for (const item of g.items) {
        expect(html).toContain(escape(item.text));
        expect(html).toContain(escape(item.why));
        if (item.guideline) expect(html).toContain(`Guideline ${escape(item.guideline)}`);
      }
    }
    expect(html).toContain(`0 of ${total} done`);
  });

  it("gives every checkbox its own label and its reason as the description", () => {
    const boxes = [...html.matchAll(/<input id="([^"]+)" type="checkbox"[^>]*aria-describedby="([^"]+)"/g)];
    expect(boxes).toHaveLength(total);
    for (const [, id, describedBy] of boxes) {
      expect(html).toContain(`<label for="${id}"`);
      expect(html).toContain(`id="${describedBy}"`);
    }
  });

  it("keeps ticks per run", () => {
    expect(storageKey("a")).not.toBe(storageKey("b"));
  });

  it("can render other groups (the file will be replaced)", () => {
    const other = renderToStaticMarkup(
      <BeforeYouSubmit runId="run1" groups={[{ title: "Other", items: [{ text: "Do it.", why: "Because.", guideline: "" }] }]} />,
    );
    expect(other).toContain("Other");
    expect(other).toContain("0 of 1 done");
    expect(other).not.toContain("Guideline");
  });
});

describe("ready page", () => {
  it("shows the section after the other sections and before the notes for App Review", async () => {
    const html = renderToStaticMarkup(<ReadyReport run={await loadExampleRun()} />);
    const at = html.indexOf(escape(BEFORE_YOU_SUBMIT_TITLE));
    expect(at).toBeGreaterThan(html.indexOf(">Not checked<"));
    expect(at).toBeLessThan(html.indexOf(">Notes for App Review<"));
  });
});

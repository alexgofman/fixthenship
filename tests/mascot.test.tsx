import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Mascot, { type MascotState } from "../components/Mascot";

const STATES: MascotState[] = ["checking", "fixing", "rechecking", "done", "needsYou", "stopped"];

describe("Mascot", () => {
  it.each(STATES)("renders the %s pose at the default size, hidden from screen readers", (state) => {
    const html = renderToStaticMarkup(<Mascot state={state} />);
    expect(html).toContain(`class="fts-mascot fts-mascot-${state}"`);
    expect(html).toContain('width="72" height="72"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("role=");
  });

  it("is announced as an image when it has a label", () => {
    const html = renderToStaticMarkup(<Mascot state="done" size={64} label="All done." />);
    expect(html).toContain('width="64" height="64"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="All done."');
    expect(html).not.toContain("aria-hidden");
  });
});

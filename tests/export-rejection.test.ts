import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import RejectionDecoder from "../components/RejectionDecoder";
import { loadExampleRun } from "../lib/store";
import { rejectionDecoderHtml, renderRunHtml } from "../scripts/export-run.mjs";

const MESSAGE = `Guideline 5.1.1(v) - Legal - Privacy - Data Collection and Storage

The app supports account creation but does not include an option to initiate account deletion. <b>bold</b>

Guideline 2.3.3 - Performance - Accurate Metadata`;

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();

describe("export-run: Apple's message", () => {
  it("shows the box above the letter, linking the finding's card, with the message as plain text", async () => {
    const run = { ...(await loadExampleRun()), rejectionText: MESSAGE };
    const html = renderRunHtml(run, "");
    const box = html.indexOf("What Apple's message means");
    expect(box).toBeGreaterThan(0);
    expect(box).toBeLessThan(html.indexOf('class="letter"'));
    expect(html).toContain('href="#finding-R6"');
    expect(html).toContain('id="finding-R6"');
    expect(html).toContain("We have no automatic check for this one yet.");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<b>bold</b>");
  });

  it("says the same as the run page", async () => {
    const run = { ...(await loadExampleRun()), rejectionText: MESSAGE };
    expect(text(rejectionDecoderHtml(run))).toBe(text(renderToStaticMarkup(createElement(RejectionDecoder, { run }))));
    const none = { ...run, rejectionText: "Please contact us." };
    expect(text(rejectionDecoderHtml(none))).toBe(text(renderToStaticMarkup(createElement(RejectionDecoder, { run: none }))));
  });

  it("adds nothing when no message was pasted", async () => {
    expect(rejectionDecoderHtml(await loadExampleRun())).toBe("");
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKLIST } from "../components/BeforeYouSubmit";

describe("lib/content/checklist.json", () => {
  it("loads as groups of items, each with an instruction and a reason", async () => {
    const raw = JSON.parse(await readFile(path.join(process.cwd(), "lib", "content", "checklist.json"), "utf8"));
    expect(CHECKLIST).toEqual(raw.groups);
    expect(CHECKLIST.length).toBeGreaterThan(0);
    for (const g of CHECKLIST) {
      expect(g.title.trim()).not.toBe("");
      expect(g.items.length).toBeGreaterThan(0);
      for (const item of g.items) {
        expect(item.text.trim()).not.toBe("");
        expect(item.why.trim()).not.toBe("");
        expect(typeof item.guideline).toBe("string");
      }
    }
  });

  it("makes no approval or compliance promises", () => {
    const words = JSON.stringify(CHECKLIST);
    expect(words).not.toMatch(/will be approved|guarantee|compliant/i);
  });
});

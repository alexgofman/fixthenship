import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanRepo } from "../../lib/scan";
import { getRule } from "../../lib/rules";
import type { RuleId } from "../../lib/types";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

const CASES: { rule: RuleId; folder: string; confidence: "high" | "medium" }[] = [
  { rule: "R2", folder: "r2", confidence: "medium" },
  { rule: "R5", folder: "r5", confidence: "medium" },
  { rule: "R6", folder: "r6", confidence: "high" },
  { rule: "R7", folder: "r7", confidence: "high" },
  { rule: "R8", folder: "r8", confidence: "medium" },
  { rule: "R9", folder: "r9", confidence: "medium" },
  { rule: "R10", folder: "r10", confidence: "high" },
];

describe("scanRepo rules", () => {
  for (const { rule, folder, confidence } of CASES) {
    it(`${rule} raises exactly one finding on its bad folder`, async () => {
      const dir = path.join(FIXTURES, folder, "bad");
      const findings = await scanRepo(dir);
      expect(findings.map((f) => f.ruleId)).toEqual([rule]);

      const [finding] = findings;
      const meta = getRule(rule);
      expect(finding).toMatchObject({
        guideline: meta.guideline,
        title: meta.title,
        fixable: meta.fixable,
        source: "code",
        state: "fail",
        confidence,
        finalState: "",
      });
      expect(finding.detail).toMatch(/likely/);
      expect(finding.detail).not.toMatch(/\n/);
      expect(finding.evidence.length).toBeGreaterThan(0);
      for (const ev of finding.evidence) {
        expect(ev.kind).toBe("code");
        expect(ev.caption.length).toBeGreaterThan(0);
        if (!("file" in ev)) throw new Error("expected code evidence with a file");
        const lines = (await readFile(path.join(dir, ev.file), "utf8")).split("\n");
        expect(ev.line).toBeGreaterThanOrEqual(1);
        expect(ev.line).toBeLessThanOrEqual(lines.length);
      }
    });

    it(`${rule} raises no finding on its good folder`, async () => {
      expect(await scanRepo(path.join(FIXTURES, folder, "good"))).toEqual([]);
    });
  }
});

describe("scanRepo evidence", () => {
  it("points R2 at each placeholder line", async () => {
    const [finding] = await scanRepo(path.join(FIXTURES, "r2", "bad"));
    expect(finding.evidence.map((e) => ("line" in e ? e.line : 0))).toEqual([5, 8, 10]);
  });

  it("points R6 at the sign-up call", async () => {
    const [finding] = await scanRepo(path.join(FIXTURES, "r6", "bad"));
    expect(finding.evidence[0]).toMatchObject({ kind: "code", file: "src/auth.js", line: 4 });
  });

  it("points R5 at the form input that collects data", async () => {
    const [finding] = await scanRepo(path.join(FIXTURES, "r5", "bad"));
    expect(finding.evidence[0]).toMatchObject({ file: "src/App.jsx", line: 6 });
  });
});

describe("scanRepo folders", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-scan-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns an empty list for an empty folder", async () => {
    expect(await scanRepo(dir)).toEqual([]);
  });

  it("does not scan node_modules, build output, .git or lock files", async () => {
    await cp(path.join(FIXTURES, "r10", "good"), dir, { recursive: true });
    const bad = 'export const title = "Lovable App"; // lovable-tagger\nexport const copy = "Lorem ipsum";\n';
    for (const file of ["node_modules/lovable-tagger/index.js", "dist/index.js", "build/index.js", ".git/hooks/x.js"]) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(path.join(dir, file), bad);
    }
    await writeFile(path.join(dir, "package-lock.json"), '{ "packages": { "node_modules/lovable-tagger": {} } }\n');
    expect(await scanRepo(dir)).toEqual([]);

    await writeFile(path.join(dir, "src", "copy.js"), bad);
    expect((await scanRepo(dir)).map((f) => f.ruleId)).toEqual(["R2", "R10"]);
  });
});

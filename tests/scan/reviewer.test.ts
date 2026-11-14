import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRule } from "../../lib/rules";
import { scanRepo } from "../../lib/scan";
import type { RuleId } from "../../lib/types";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

const CASES: { rule: RuleId; folder: string; lines: number[] }[] = [
  { rule: "R3", folder: "r3", lines: [6, 7, 8] },
  { rule: "R4", folder: "r4", lines: [7, 4] },
];

describe("scanRepo R3 and R4", () => {
  for (const { rule, folder, lines } of CASES) {
    it(`${rule} raises exactly one finding on its bad folder`, async () => {
      const findings = await scanRepo(path.join(FIXTURES, folder, "bad"));
      expect(findings.map((f) => f.ruleId)).toEqual([rule]);

      const [finding] = findings;
      const meta = getRule(rule);
      expect(finding).toMatchObject({
        guideline: meta.guideline,
        title: meta.title,
        fixable: meta.fixable,
        source: "code",
        state: "fail",
        confidence: "medium",
        finalState: "",
      });
      expect(finding.detail).toMatch(/likely/);
      expect(finding.detail).not.toMatch(/approve|\n/);
      expect(finding.evidence.map((e) => ("line" in e ? e.line : 0))).toEqual(lines);
      for (const ev of finding.evidence) expect(ev.caption.length).toBeGreaterThan(0);
    });

    it(`${rule} raises no finding on its good folder`, async () => {
      expect(await scanRepo(path.join(FIXTURES, folder, "good"))).toEqual([]);
    });
  }
});

describe("R4 with react-router", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-r4-"));
    await cp(path.join(FIXTURES, "r4", "bad", "src", "Login.jsx"), path.join(dir, "src", "Login.jsx"), { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const app = (routes: string) =>
    `export default function App() {\n  return (\n    <Routes>\n${routes}\n    </Routes>\n  );\n}\n`;

  it("flags routes that all sit behind a guard", async () => {
    await writeFile(
      path.join(dir, "src", "App.jsx"),
      app(`      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Notes />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />`),
    );
    expect((await scanRepo(dir)).map((f) => f.ruleId)).toContain("R4");
  });

  it("does not flag an app with a public route", async () => {
    await writeFile(
      path.join(dir, "src", "App.jsx"),
      app(`      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Landing />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/notes" element={<Notes />} />
      </Route>`),
    );
    expect((await scanRepo(dir)).map((f) => f.ruleId)).not.toContain("R4");
  });
});

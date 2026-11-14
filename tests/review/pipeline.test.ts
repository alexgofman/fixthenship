import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_RULES, addRepo, gitCloneArgs, reviewApp, type ReviewDeps } from "../../lib/review/pipeline";
import { createRun, loadRun, saveRun } from "../../lib/store";
import type { CheckResult, Finding, RuleId } from "../../lib/types";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-review-"));
  process.env.RUNS_DIR = dir;
});
afterEach(async () => {
  delete process.env.RUNS_DIR;
  await rm(dir, { recursive: true, force: true });
});

function scanFinding(ruleId: RuleId, state: Finding["state"] = "fail"): Finding {
  return {
    ruleId,
    guideline: "5.1.1",
    title: `scan ${ruleId}`,
    detail: `The code shows a ${ruleId} risk.`,
    source: "code",
    evidence: [{ kind: "code", file: "app/page.tsx", line: 3, caption: "here" }],
    confidence: "medium",
    state,
    fixable: "yes",
    finalState: "",
    humanStep: "",
  };
}

const noClone: ReviewDeps["clone"] = async () => {};

describe("reviewApp", () => {
  it("fails with 'The app did not respond' when the app address is dead", async () => {
    const run = await createRun("https://github.com/o/r", "http://127.0.0.1:9/");
    const checks = vi.fn();
    await reviewApp(run.id, { clone: noClone, scan: async () => [], runChecks: checks, appTimeoutMs: 300 });

    const saved = await loadRun(run.id);
    expect(saved.stage).toBe("failed");
    expect(saved.error).toBe("The app did not respond");
    expect(checks).not.toHaveBeenCalled();
  });

  it("merges scan findings with check results per rule", async () => {
    const run = await createRun("https://github.com/o/r", "https://app.test");
    const seen: string[] = [];
    const runChecks: ReviewDeps["runChecks"] = async (appUrl, outDir, ruleIds, options) => {
      expect(ruleIds).toEqual(REVIEW_RULES);
      expect(options.testEmail).toMatch(/^fts\.reviewer\.[a-z0-9]+@mailinator\.com$/i);
      const outcomes: Record<string, CheckResult["outcome"]> = {
        R1: "pass", R2: "fail", R5: "fail", R6: "not_checked", R7: "pass", R8: "not_checked",
      };
      const results: CheckResult[] = [];
      for (const ruleId of ruleIds) {
        if (!(ruleId in outcomes)) continue;
        const screenshots: string[] = [];
        if (outcomes[ruleId] === "fail") {
          const shot = path.join(outDir, ruleId, "attempt-1", "screenshots", "002-failure.png");
          await mkdir(path.dirname(shot), { recursive: true });
          await writeFile(shot, "png");
          await writeFile(path.join(outDir, ruleId, "trace.md"), "# Trace");
          screenshots.push(shot);
        }
        const result = { ruleId, outcome: outcomes[ruleId], reason: `${ruleId} reason.`, steps: [], screenshots };
        results.push(result);
        await options.onResult?.(result);
        seen.push(`${ruleId}:${(await loadRun(run.id)).findings.length}`);
      }
      return results;
    };

    await reviewApp(run.id, {
      clone: noClone,
      scan: async () => [scanFinding("R5"), scanFinding("R7", "risk"), scanFinding("R8", "risk"), scanFinding("R10")],
      waitForApp: async () => true,
      runChecks,
    });

    const saved = await loadRun(run.id);
    expect(saved.stage).toBe("reviewed");
    expect(seen).toEqual(["R1:5", "R2:6", "R5:6", "R6:7", "R7:7", "R8:7"]);
    const byRule = Object.fromEntries(saved.findings.map((f) => [f.ruleId, f]));
    expect(saved.findings.map((f) => f.ruleId)).toEqual(["R1", "R2", "R5", "R6", "R7", "R8", "R10"]);

    expect(byRule.R1).toMatchObject({ source: "app", state: "pass" });
    expect(byRule.R2).toMatchObject({ source: "app", state: "fail", detail: "R2 reason." });
    expect(byRule.R2.evidence).toEqual([
      expect.objectContaining({ kind: "screenshot", path: "checks/R2/attempt-1/screenshots/002-failure.png" }),
      expect.objectContaining({ kind: "log", path: "checks/R2/trace.md" }),
    ]);
    expect(byRule.R5).toMatchObject({ source: "both", state: "fail", confidence: "high" });
    expect(byRule.R5.evidence.map((e) => e.kind)).toEqual(["code", "screenshot", "log"]);
    expect(byRule.R6).toMatchObject({ source: "app", state: "not_checked", detail: "R6 reason." });
    expect(byRule.R7).toEqual(scanFinding("R7", "risk"));
    expect(byRule.R8).toMatchObject({ source: "code", state: "risk" });
    expect(byRule.R8.detail).toContain("R8 reason.");
    expect(byRule.R10).toEqual(scanFinding("R10"));
  });

  it("records a thrown error on the run", async () => {
    const run = await createRun("https://github.com/o/missing", "https://app.test");
    await reviewApp(run.id, {
      clone: async () => {
        throw new Error("Repository not found");
      },
    });
    const saved = await loadRun(run.id);
    expect(saved.stage).toBe("failed");
    expect(saved.error).toBe("Repository not found");
  });

  it("reviews the app without cloning when the run has no repository", async () => {
    const run = await createRun("", "https://app.test");
    const clone = vi.fn(noClone);
    const scan = vi.fn(async () => [scanFinding("R5")]);
    await reviewApp(run.id, {
      clone,
      scan,
      waitForApp: async () => true,
      runChecks: async (_appUrl, _outDir, ruleIds, options) => {
        const result: CheckResult = { ruleId: "R2", outcome: "fail", reason: "Lorem ipsum.", steps: [], screenshots: [] };
        await options.onResult?.(result);
        return [result];
      },
    });

    const saved = await loadRun(run.id);
    expect(saved.stage).toBe("reviewed");
    expect(clone).not.toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
    expect(saved.findings).toEqual([expect.objectContaining({ ruleId: "R2", source: "app", state: "fail" })]);
  });
});

describe("addRepo", () => {
  it("saves the repository and merges its scan findings like the first review", async () => {
    const run = await createRun("", "https://app.test");
    const shot = { kind: "screenshot" as const, path: "checks/R5/shot.png", caption: "shot" };
    run.stage = "reviewed";
    run.findings = [
      { ...scanFinding("R1", "pass"), source: "app", evidence: [], detail: "R1 loads." },
      { ...scanFinding("R5"), source: "app", evidence: [shot], detail: "No privacy link." },
      { ...scanFinding("R6", "not_checked"), source: "app", evidence: [], detail: "Sign-up failed." },
    ];
    await saveRun(run);

    const clone = vi.fn(noClone);
    const saved = await addRepo(run.id, "https://github.com/o/r", {
      clone,
      scan: async () => [scanFinding("R5"), scanFinding("R6"), scanFinding("R10")],
    });

    expect(clone).toHaveBeenCalledWith("https://github.com/o/r", path.join(dir, run.id, "repo"));
    expect(saved.repoUrl).toBe("https://github.com/o/r");
    expect(saved.stage).toBe("reviewed");
    expect(saved.findings.map((f) => f.ruleId)).toEqual(["R1", "R5", "R6", "R10"]);
    const byRule = Object.fromEntries(saved.findings.map((f) => [f.ruleId, f]));
    expect(byRule.R1).toMatchObject({ source: "app", state: "pass" });
    expect(byRule.R5).toMatchObject({ source: "both", state: "fail", confidence: "high" });
    expect(byRule.R5.evidence.map((e) => e.kind)).toEqual(["code", "screenshot"]);
    expect(byRule.R6).toMatchObject({ source: "code", state: "fail" });
    expect(byRule.R6.detail).toContain("Sign-up failed.");
    expect(byRule.R10).toEqual(scanFinding("R10"));
    expect(await loadRun(run.id)).toEqual(saved);
  });
});

describe("gitCloneArgs", () => {
  it("puts -- before the repository so a link cannot pass options to git", () => {
    const args = gitCloneArgs("--upload-pack=touch /tmp/x", "/tmp/dest");
    expect(args.slice(-3)).toEqual(["--", "--upload-pack=touch /tmp/x", "/tmp/dest"]);
  });
});

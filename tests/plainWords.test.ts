import { describe, expect, it } from "vitest";
import { checkProgress } from "../components/checkProgress";
import { rejectionSentence, runName } from "../components/findingDisplay";
import { CHECK_STEPS, PLAIN_WORDS } from "../lib/plainWords";
import { REVIEW_RULES } from "../lib/review/pipeline";
import { loadExampleRun } from "../lib/store";
import { RULE_IDS, type Finding, type Run } from "../lib/types";

describe("plain words", () => {
  it("has a problem, why Apple cares and what we do for every rule", () => {
    expect(Object.keys(PLAIN_WORDS).sort()).toEqual([...RULE_IDS].sort());
    for (const id of RULE_IDS) {
      for (const text of Object.values(PLAIN_WORDS[id])) expect(text.trim().length).toBeGreaterThan(10);
      expect(Object.keys(PLAIN_WORDS[id]).sort()).toEqual(["problem", "whatWeDo", "whyAppleCares"]);
    }
  });

  it("never promises approval", () => {
    expect(JSON.stringify(PLAIN_WORDS)).not.toMatch(/approve/i);
  });

  it("has one progress line per check, in the order the checks run", () => {
    expect(CHECK_STEPS.map((s) => s.ruleId)).toEqual(REVIEW_RULES);
  });
});

describe("rejectionSentence", () => {
  it("counts the example run", async () => {
    expect(rejectionSentence(await loadExampleRun())).toBe(
      "Apple would likely reject this app for 5 reasons. We can fix 4 of them for you now. 1 needs one step from you.",
    );
  });

  it("leaves out the last part when nothing needs the owner", () => {
    const run = { findings: [{ state: "fail", fixable: "yes" }, { state: "risk", fixable: "partly" }] } as Run;
    expect(rejectionSentence(run)).toBe("Apple would likely reject this app for 1 reason. We can fix 1 of them for you now.");
  });
});

describe("runName", () => {
  it("uses the app's host when there is no repository", () => {
    expect(runName({ repoUrl: "", appUrl: "https://yourapp.lovable.app/" })).toBe("yourapp.lovable.app");
    expect(runName({ repoUrl: "https://github.com/o/habit-tracker.git", appUrl: "x" })).toBe("habit-tracker");
  });
});

describe("checkProgress", () => {
  const app = (ruleId: Finding["ruleId"], state: Finding["state"], source: Finding["source"] = "app") =>
    ({ ruleId, state, source }) as Finding;

  it("ticks or crosses the finished checks and spins on the next one", () => {
    const steps = checkProgress({
      repoUrl: "",
      stage: "checking",
      findings: [app("R1", "pass"), app("R2", "fail"), app("R5", "pass", "code"), app("R7", "risk", "code")],
    });
    expect(steps.slice(0, 4).map((s) => `${s.key}:${s.status}`)).toEqual(["R1:pass", "R2:fail", "R5:current", "R6:pending"]);
    expect(steps.find((s) => s.status === "current")?.key).toBe("R5");
    expect(steps).toHaveLength(CHECK_STEPS.length);
  });

  it("starts with reading the code when the run has a repository", () => {
    const scanning = checkProgress({ repoUrl: "https://github.com/o/r", stage: "scanning", findings: [] });
    expect(scanning[0]).toMatchObject({ key: "code", status: "current" });
    expect(scanning.slice(1).every((s) => s.status === "pending")).toBe(true);
    const checking = checkProgress({ repoUrl: "https://github.com/o/r", stage: "checking", findings: [app("R1", "not_checked")] });
    expect(checking.slice(0, 3).map((s) => s.status)).toEqual(["done", "skipped", "current"]);
  });
});

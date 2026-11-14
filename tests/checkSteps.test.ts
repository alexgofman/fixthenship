import { describe, expect, it } from "vitest";
import { checkProgress } from "../components/checkSteps";
import { CHECK_STEPS } from "../lib/plainWords";

describe("checkProgress", () => {
  it("ticks or crosses the finished checks and spins on the next one", () => {
    const steps = checkProgress({ repoUrl: "", stage: "checking", checked: { R1: "pass", R2: "fail" } });
    expect(steps.slice(0, 4).map((s) => `${s.key}:${s.status}`)).toEqual(["R1:pass", "R2:fail", "R5:current", "R6:pending"]);
    expect(steps).toHaveLength(CHECK_STEPS.length);
  });

  it("starts with reading the code when the run has a repository", () => {
    const scanning = checkProgress({ repoUrl: "https://github.com/o/r", stage: "scanning", checked: {} });
    expect(scanning[0]).toMatchObject({ key: "code", status: "current" });
    expect(scanning.slice(1).every((s) => s.status === "pending")).toBe(true);
    const checking = checkProgress({ repoUrl: "https://github.com/o/r", stage: "checking", checked: { R1: "not_checked" } });
    expect(checking.slice(0, 3).map((s) => s.status)).toEqual(["done", "skipped", "current"]);
  });

  it("shows what the app check answered on a rule the code scan flagged", () => {
    const steps = checkProgress({
      repoUrl: "https://github.com/o/r",
      stage: "checking",
      checked: { R1: "pass", R2: "pass", R5: "pass", R6: "not_checked" },
    });
    expect(steps.slice(1, 6).map((s) => `${s.key}:${s.status}`)).toEqual([
      "R1:pass",
      "R2:pass",
      "R5:pass",
      "R6:skipped",
      "R7:current",
    ]);
  });

  it("finishes the last steps once their checks answer", () => {
    const checked = Object.fromEntries(CHECK_STEPS.map((s) => [s.ruleId, "pass" as const]));
    const steps = checkProgress({ repoUrl: "", stage: "checking", checked });
    expect(steps.every((s) => s.status === "pass")).toBe(true);
  });

  it("waits on the first check when nothing has answered, for runs saved before answers were kept", () => {
    const steps = checkProgress({ repoUrl: "", stage: "checking" });
    expect(steps[0].status).toBe("current");
  });
});

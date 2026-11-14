import type { CSSProperties } from "react";
import { eligibleForFix } from "../lib/fix/status";
import type { Run } from "../lib/types";
import Mascot, { type MascotState } from "./Mascot";
import { hasOpenFindings } from "./findingDisplay";

export type RunStatusLine = { state: MascotState; sentence: string };

/** The mascot's pose and the one sentence that says where the run stands. */
export function runStatus(run: Pick<Run, "stage" | "findings">): RunStatusLine {
  switch (run.stage) {
    case "scanning":
    case "checking":
      return { state: "checking", sentence: "We are using your app the way a reviewer would. This takes about three minutes." };
    case "reviewed":
      return run.findings.some(eligibleForFix)
        ? { state: "needsYou", sentence: "The review is ready. Press “Fix these for me” and we will have each problem fixed." }
        : { state: "done", sentence: "The review is ready. We found nothing we can fix for you." };
    case "fixing":
      return { state: "fixing", sentence: "Devin is fixing the problems, one session for each. This takes about five minutes." };
    case "fixed":
      return { state: "needsYou", sentence: "The fixes are ready. Press “Check again” and we will test the fixed app." };
    case "rechecking":
      return { state: "rechecking", sentence: "We are running the fixed app and repeating the same checks. This takes about five minutes." };
    case "done":
      return hasOpenFindings(run)
        ? { state: "needsYou", sentence: "Finished. Some steps are left for you: look for “Needs you” below." }
        : { state: "done", sentence: "Finished. Everything we found is fixed and verified. Apple still makes the decision." };
    case "failed":
      return { state: "stopped", sentence: "The review stopped before it finished. Start it again from the first page." };
  }
}

const CARD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  margin: "0 0 28px",
  padding: "14px 20px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
};

const SENTENCE: CSSProperties = { margin: 0, minWidth: 0, fontSize: 17, fontWeight: 600, overflowWrap: "anywhere" };

/** Shown under the timeline. The mascot carries the sentence for screen readers, so the text is not read twice. */
export default function RunStatus({ run }: { run: Pick<Run, "stage" | "findings"> }) {
  const { state, sentence } = runStatus(run);
  return (
    <div style={CARD}>
      <Mascot state={state} size={64} label={sentence} />
      <p style={SENTENCE} aria-hidden="true">
        {sentence}
      </p>
    </div>
  );
}

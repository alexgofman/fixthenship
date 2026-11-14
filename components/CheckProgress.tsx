import type { Run } from "@/lib/types";
import { checkProgress, type StepStatus } from "./checkSteps";

const ICON: Partial<Record<StepStatus, string>> = { done: "✓", pass: "✓", fail: "✕", skipped: "–" };

const STATUS_TEXT: Record<StepStatus, string> = {
  pending: "waiting",
  current: "in progress",
  done: "done",
  pass: "looks fine",
  fail: "problem found",
  skipped: "could not check",
};

export default function CheckProgress({ run }: { run: Run }) {
  if (run.stage !== "scanning" && run.stage !== "checking") return null;
  const steps = checkProgress(run);

  return (
    <section className="progress" aria-labelledby="progress-title" aria-live="polite">
      <h2 id="progress-title">What we are doing now</h2>
      <ol className="progress-steps">
        {steps.map((s) => (
          <li key={s.key} className={`progress-step step-${s.status}`} aria-current={s.status === "current" ? "step" : undefined}>
            <span className="progress-icon" aria-hidden="true">
              {s.status === "current" ? <span className="spinner spinner-dark" /> : ICON[s.status]}
            </span>
            <span className="progress-text">{s.text}</span>
            <span className="visually-hidden"> ({STATUS_TEXT[s.status]})</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

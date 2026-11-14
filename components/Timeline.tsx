import { STAGES, type Stage } from "@/lib/types";

const STEPS: Stage[] = STAGES.filter((s) => s !== "failed");

export default function Timeline({ stage, error }: { stage: Stage; error: string }) {
  const failed = stage === "failed";
  const current = STEPS.indexOf(stage);
  const done = stage === "done";

  return (
    <section className="timeline-wrap" aria-label="Run progress">
      <p className="timeline-caption">
        {failed ? (
          <>Stopped</>
        ) : (
          <>
            Step {current + 1} of {STEPS.length} · <strong>{stage}</strong>
          </>
        )}
      </p>
      <ol className={`timeline${failed ? " is-failed" : ""}`}>
        {STEPS.map((s, i) => {
          const state = failed ? "" : i < current ? "past" : i === current ? "current" : "";
          return (
            <li key={s} className={`${state}${done && state === "current" ? " is-done" : ""}`} aria-current={i === current ? "step" : undefined}>
              <span className="timeline-marker" aria-hidden="true">
                {state === "past" || (done && state === "current") ? "✓" : i + 1}
              </span>
              <span className="timeline-label">{s}</span>
            </li>
          );
        })}
      </ol>
      {failed && (
        <div className="timeline-error" role="alert">
          <strong>failed</strong>
          <span>{error || "The run stopped without an error message."}</span>
        </div>
      )}
    </section>
  );
}

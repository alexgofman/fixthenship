import { STAGE_WORDS, stageWords } from "../lib/plainWords";
import { STAGES, type FixSession, type Stage } from "../lib/types";
import { plainError } from "./findingDisplay";

const STEPS: Stage[] = STAGES.filter((s) => s !== "failed");

export default function Timeline({
  stage,
  error,
  fixes = [],
}: {
  stage: Stage;
  error: string;
  fixes?: Pick<FixSession, "status">[];
}) {
  const failed = stage === "failed";
  const current = STEPS.indexOf(stage);
  const done = stage === "done";

  return (
    <section className="timeline-wrap" aria-label="Run progress">
      <p className="timeline-caption">
        {failed ? (
          <>{STAGE_WORDS.failed}</>
        ) : (
          <>
            Step {current + 1} of {STEPS.length} · <strong>{stageWords(stage, fixes)}</strong>
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
              <span className="timeline-label">{STAGE_WORDS[s]}</span>
            </li>
          );
        })}
      </ol>
      {(failed || error) && (
        <div className="timeline-error" role={failed ? "alert" : "status"}>
          {failed && <strong>{STAGE_WORDS.failed}</strong>}
          <span>{error ? plainError(error) : "The run stopped without an error message."}</span>
        </div>
      )}
    </section>
  );
}

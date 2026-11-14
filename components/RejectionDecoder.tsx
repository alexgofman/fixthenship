import type { CSSProperties } from "react";
import { decode, findGuidelines, type Decoded } from "../lib/decoder";
import type { Run } from "../lib/types";
import { displayFor } from "./findingDisplay";

export const NO_GUIDELINE_LINE = "We could not find a guideline number in the message you pasted.";
export const NO_CHECK_LINE = "We have no automatic check for this one yet. Use the steps above.";
export const CHECK_RUNNING_LINE = "Our check for this is still running";

const BOX: CSSProperties = {
  margin: "0 0 28px",
  padding: "18px 20px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
};

const MESSAGE: CSSProperties = {
  margin: "10px 0 0",
  padding: "12px 14px",
  background: "#fffefb",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "var(--mono)",
  fontSize: 13,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

function OurCheck({ entry, run }: { entry: Decoded; run: Run }) {
  if (!entry.ourCheck) return <p className="finding-detail" style={{ marginTop: 10 }}>{NO_CHECK_LINE}</p>;
  const finding = run.findings.find((f) => f.ruleId === entry.ourCheck);
  if (!finding) return <p className="finding-detail" style={{ marginTop: 10 }}>{CHECK_RUNNING_LINE}</p>;
  return (
    <p className="finding-detail" style={{ marginTop: 10 }}>
      Our check for this: <a href={`#finding-${finding.ruleId}`}>{displayFor(finding).label}</a>
    </p>
  );
}

/** Explains each guideline named in the pasted rejection message; nothing when no message was pasted. */
export default function RejectionDecoder({ run }: { run: Run }) {
  if (!run.rejectionText) return null;
  const numbers = findGuidelines(run.rejectionText);
  if (numbers.length === 0) {
    return (
      <p className="finding-detail" style={BOX}>
        {NO_GUIDELINE_LINE}
      </p>
    );
  }

  return (
    <section style={BOX} aria-labelledby="decoder-title">
      <h2 id="decoder-title" style={{ margin: "0 0 4px", fontSize: 17 }}>
        What Apple&apos;s message means
      </h2>
      <p className="muted small" style={{ margin: "0 0 14px" }}>
        Each guideline Apple named, in plain words. This is not legal advice.
      </p>
      <div className="findings">
        {numbers.map((n) => {
          const entry = decode(n);
          return (
            <article key={n} className="finding" style={{ borderLeftColor: "var(--accent)" }}>
              <header className="finding-head">
                <span className="guideline-badge">Guideline {n}</span>
              </header>
              {entry ? (
                <>
                  <h3 className="finding-title">{entry.appleCallsIt}</h3>
                  {entry.fellBack && (
                    <p className="muted small" style={{ margin: "0 0 4px" }}>
                      We explain guideline {entry.guideline}, the part of Apple&apos;s rules that {n} belongs to.
                    </p>
                  )}
                  <dl className="plain">
                    <div>
                      <dt>In plain words</dt>
                      <dd>{entry.plain}</dd>
                    </div>
                    <div>
                      <dt>What the reviewer most often saw</dt>
                      <dd>{entry.usuallyMeans}</dd>
                    </div>
                    <div>
                      <dt>What to do first</dt>
                      <dd>{entry.whatToDo}</dd>
                    </div>
                  </dl>
                  <OurCheck entry={entry} run={run} />
                </>
              ) : (
                <p className="finding-detail" style={{ marginTop: 10 }}>
                  We do not have a plain explanation for guideline {n} yet.
                </p>
              )}
            </article>
          );
        })}
      </div>
      <details className="evidence-details">
        <summary>Show the message you pasted</summary>
        <div style={MESSAGE}>{run.rejectionText}</div>
      </details>
    </section>
  );
}

import type { Finding } from "@/lib/types";
import Evidence from "./Evidence";
import StatePill from "./StatePill";
import { displayFor, initialDisplay, type Display } from "./findingDisplay";

const SOURCE_LABEL: Record<Finding["source"], string> = {
  code: "the code",
  app: "the running app",
  both: "the code and the running app",
};

export default function FindingCard({
  finding,
  runId,
  repoUrl,
}: {
  finding: Finding;
  runId: string;
  repoUrl: string;
}) {
  const display: Display = displayFor(finding);
  const first = initialDisplay(finding.state);
  const changed = finding.finalState !== "" && first.label !== display.label;
  const shots = finding.evidence.filter((e) => !("file" in e) && e.kind === "screenshot");
  const others = finding.evidence.filter((e) => !shots.includes(e));

  return (
    <article className={`finding finding-${display.tone}`}>
      <header className="finding-head">
        <span className="guideline-badge">Guideline {finding.guideline}</span>
        <StatePill display={display} />
      </header>
      <h3 className="finding-title">{finding.title}</h3>
      <p className="finding-detail">{finding.detail}</p>

      {display.note && (
        <p className="human-step">
          <strong>Needs you:</strong> {display.note}
        </p>
      )}

      {finding.evidence.length > 0 && (
        <div className="evidence">
          <p className="evidence-heading">Evidence</p>
          {others.map((e, i) => (
            <Evidence key={`o${i}`} item={e} runId={runId} repoUrl={repoUrl} />
          ))}
          {shots.length > 0 && (
            <div className="evidence-shots">
              {shots.map((e, i) => (
                <Evidence key={`s${i}`} item={e} runId={runId} repoUrl={repoUrl} />
              ))}
            </div>
          )}
        </div>
      )}

      <footer className="finding-meta">
        <span>
          Confidence: <strong>{finding.confidence}</strong>
        </span>
        <span>Checked in {SOURCE_LABEL[finding.source]}</span>
        {changed && (
          <span>
            First review: <span className={`tone-text-${first.tone}`}>{first.label}</span>
          </span>
        )}
        <span className="rule-id">{finding.ruleId}</span>
      </footer>
    </article>
  );
}

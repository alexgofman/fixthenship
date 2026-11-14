import type { Run } from "@/lib/types";
import FindingCard from "./FindingCard";
import { formatDate, isRechecked, rejectionSentence, runName, sortFindings, summaryLine } from "./findingDisplay";

export default function VerdictLetter({ run }: { run: Run }) {
  const findings = sortFindings(run.findings);
  const rechecked = isRechecked(run);

  return (
    <article className="letter" aria-labelledby="letter-title">
      <div className="letterhead">
        <span className="letterhead-mark">FixThenShip</span>
        <span className="letterhead-sub">Review rehearsal</span>
      </div>

      <header className="letter-head">
        <h2 id="letter-title">Review of {runName(run)}</h2>
        <dl className="letter-meta">
          <div>
            <dt>Date</dt>
            <dd>
              <time dateTime={run.createdAt}>{formatDate(run.createdAt)}</time>
            </dd>
          </div>
          {run.repoUrl && (
            <div>
              <dt>Repository</dt>
              <dd>
                <a href={run.repoUrl} target="_blank" rel="noreferrer">
                  {run.repoUrl}
                </a>
              </dd>
            </div>
          )}
          <div>
            <dt>App</dt>
            <dd>
              <a href={run.appUrl} target="_blank" rel="noreferrer">
                {run.appUrl}
              </a>
            </dd>
          </div>
        </dl>
      </header>

      {rechecked || run.findings.length === 0 ? (
        <p className="letter-summary">{summaryLine(run)}</p>
      ) : (
        <>
          <p className="letter-summary">{rejectionSentence(run)}</p>
          <p className="letter-counts">{summaryLine(run)}</p>
        </>
      )}
      <p className="letter-intro">
        {rechecked
          ? "We used your app again after the fixes. Each guideline below shows where it stands now."
          : "We used your app the way an App Store reviewer would. These are the guidelines we looked at, most serious first."}
      </p>

      {findings.length === 0 ? (
        <p className="letter-empty">The review has not produced any findings yet.</p>
      ) : (
        <div className="findings">
          {findings.map((f) => (
            <FindingCard key={f.ruleId} finding={f} runId={run.id} repoUrl={run.repoUrl} />
          ))}
        </div>
      )}

      <footer className="letter-foot">
        <p>
          This is a rehearsal, not a decision. It describes likely outcomes and risks; the real review
          can still reach a different result.
        </p>
        <p className="letter-sign">— The FixThenShip review desk</p>
      </footer>
    </article>
  );
}

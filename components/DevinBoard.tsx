import { FIX_STATUS_WORDS } from "../lib/plainWords";
import { getRule } from "../lib/rules";
import type { FixSession } from "../lib/types";
import { fixSummary } from "./findingDisplay";

function ruleTitle(id: FixSession["ruleId"]): string {
  try {
    return getRule(id).title;
  } catch {
    return "";
  }
}

function formatUnits(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

export default function DevinBoard({ fixes }: { fixes: FixSession[] }) {
  if (fixes.length === 0) return null;
  const total = fixes.reduce((sum, f) => sum + (f.acus || 0), 0);

  return (
    <section className="board" aria-labelledby="board-title">
      <div className="section-head">
        <h2 id="board-title">Devin board</h2>
        <span className="muted small">
          {fixes.length} {fixes.length === 1 ? "session" : "sessions"} · {formatUnits(total)} Devin units
        </span>
      </div>
      <table className="board-table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Status</th>
            <th>Pull request</th>
            <th>Summary</th>
            <th className="num">Devin units</th>
          </tr>
        </thead>
        <tbody>
          {fixes.map((fix) => (
            <tr key={fix.sessionId || fix.ruleId}>
              <td data-label="Rule">
                <div className="cell">
                <span className="board-rule">{fix.ruleId}</span>{" "}
                {fix.url ? (
                  <a href={fix.url} target="_blank" rel="noreferrer">
                    {ruleTitle(fix.ruleId) || "session"}
                  </a>
                ) : (
                  ruleTitle(fix.ruleId)
                )}
              </div>
              </td>
              <td data-label="Status">
                <div className="cell">
                <span className={`status status-${fix.status}`}>
                  {fix.status === "working" && <span className="live-dot" aria-hidden="true" />}
                  {FIX_STATUS_WORDS[fix.status] ?? fix.status}
                </span>
              </div>
              </td>
              <td data-label="Pull request">
                <div className="cell">
                {fix.prUrl ? (
                  <a href={fix.prUrl} target="_blank" rel="noreferrer">
                    pull request
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
              </td>
              <td data-label="Summary">
                <div className="cell">{fix.summary ? fixSummary(fix.summary) : <span className="muted">—</span>}</div>
              </td>
              <td data-label="Devin units" className="num">
                <div className="cell">
                {formatUnits(fix.acus || 0)}
              </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

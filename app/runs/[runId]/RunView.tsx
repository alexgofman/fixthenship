"use client";

import { useEffect, useState } from "react";
import { STAGES, type Run, type Stage } from "@/lib/types";

const POLL_MS = 3000;
const TIMELINE: Stage[] = STAGES.filter((s) => s !== "failed");

function Timeline({ stage }: { stage: Stage }) {
  const current = TIMELINE.indexOf(stage);
  return (
    <ol className="timeline" aria-label="Run stage">
      {TIMELINE.map((s, i) => (
        <li
          key={s}
          className={i === current ? "current" : i < current ? "past" : ""}
          aria-current={i === current ? "step" : undefined}
        >
          {s}
        </li>
      ))}
      {stage === "failed" && (
        <li className="failed" aria-current="step">
          failed
        </li>
      )}
    </ol>
  );
}

export default function RunView({ initialRun }: { initialRun: Run }) {
  const [run, setRun] = useState(initialRun);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${initialRun.id}`, { cache: "no-store" });
        if (!res.ok) return;
        setRun((await res.json()) as Run);
        setUpdatedAt(new Date().toLocaleTimeString());
      } catch {
        // Keep showing the last known run; the next tick retries.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [initialRun.id]);

  return (
    <>
      <h1>Run {run.id}</h1>
      <p className="muted">
        {run.repoUrl} · {run.appUrl}
      </p>

      <Timeline stage={run.stage} />
      {run.error && <p className="state-fail">Error: {run.error}</p>}

      <h2>Findings</h2>
      {run.findings.length === 0 ? (
        <p className="muted">No findings yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Guideline</th>
              <th>Title</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {run.findings.map((f) => (
              <tr key={f.ruleId}>
                <td>{f.ruleId}</td>
                <td>{f.guideline}</td>
                <td>{f.title}</td>
                <td className={`state-${f.state}`}>{f.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>
        Refreshes every 3 seconds{updatedAt && ` · last updated ${updatedAt}`}. States describe likely
        review outcomes and risks, not a decision by Apple.
      </p>
    </>
  );
}

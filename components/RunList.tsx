"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { stageWords } from "@/lib/plainWords";
import type { Run } from "@/lib/types";
import { countFindings, formatDateTime, isInProgress, runName } from "./findingDisplay";

const POLL_MS = 3000;

export default function RunList({ initialRuns }: { initialRuns: Run[] }) {
  const [runs, setRuns] = useState(initialRuns);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/runs", { cache: "no-store" });
        if (res.ok) setRuns((await res.json()) as Run[]);
      } catch {
        // Keep the last list; the next tick retries.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  if (runs.length === 0) {
    return <p className="empty-runs">No reviews yet. Start one above.</p>;
  }

  return (
    <ul className="run-cards">
      {runs.map((run) => {
        const counts = countFindings(run);
        return (
          <li key={run.id}>
            <Link href={`/runs/${run.id}`} className="run-card">
              <div className="run-card-top">
                <span className="run-card-name">{runName(run)}</span>
                <span className={`stage-chip stage-${run.stage}`}>
                  {isInProgress(run.stage) && <span className="live-dot" aria-hidden="true" />}
                  {stageWords(run.stage, run.fixes)}
                </span>
              </div>
              <span className="run-card-url">{run.appUrl}</span>
              <div className="run-card-counts">
                {counts.length === 0 ? (
                  <span className="muted small">No findings yet</span>
                ) : (
                  counts.map((c) => (
                    <span key={c.text} className={`count count-${c.tone}`}>
                      {c.text}
                    </span>
                  ))
                )}
              </div>
              <div className="run-card-foot">
                <span>{formatDateTime(run.createdAt)}</span>
                {run.fixes.length > 0 && (
                  <span>
                    {run.fixes.length} Devin {run.fixes.length === 1 ? "session" : "sessions"}
                  </span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

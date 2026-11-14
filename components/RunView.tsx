"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Run } from "@/lib/types";
import CheckProgress from "./CheckProgress";
import DevinBoard from "./DevinBoard";
import MainAction from "./MainAction";
import RejectionDecoder from "./RejectionDecoder";
import Timeline from "./Timeline";
import VerdictLetter from "./VerdictLetter";
import { hasOpenFindings, runName } from "./findingDisplay";
import "./plain.css";

const POLL_MS = 3000;

export default function RunView({ initialRun }: { initialRun: Run }) {
  const [run, setRun] = useState(initialRun);
  const [updatedAt, setUpdatedAt] = useState("");
  const [rechecking, setRechecking] = useState(false);
  const [recheckError, setRecheckError] = useState("");

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${initialRun.id}`, { cache: "no-store" });
        if (!res.ok) return;
        setRun((await res.json()) as Run);
        setUpdatedAt(new Date().toLocaleTimeString("en-GB"));
      } catch {
        // Keep showing the last known run; the next tick retries.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [initialRun.id]);

  async function checkAgain() {
    setRechecking(true);
    setRecheckError("");
    try {
      const res = await fetch(`/api/runs/${run.id}/recheck`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setRun((await res.json()) as Run);
    } catch (e) {
      setRecheckError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div className="run">
      <div className="run-head">
        <div>
          <p className="eyebrow">Run {run.id}</p>
          <h1 className="run-title">{runName(run)}</h1>
        </div>
        <MainAction run={run} onUpdate={setRun} />
        {run.stage === "done" && (
          <div className="main-action">
            <Link href={`/runs/${run.id}/ready`} className="btn-primary" style={{ textDecoration: "none" }}>
              {hasOpenFindings(run) ? "What is left to do →" : "Ready to submit →"}
            </Link>
            <button type="button" className="btn-secondary" onClick={checkAgain} disabled={rechecking} aria-busy={rechecking}>
              {rechecking && <span className="spinner" aria-hidden="true" />}
              {rechecking ? "Starting the re-check…" : "Check again"}
            </button>
            {recheckError && (
              <span className="action-error" role="alert">
                {recheckError}
              </span>
            )}
          </div>
        )}
        {run.stage === "failed" && (
          <Link href="/" className="btn-primary" style={{ textDecoration: "none" }}>
            Start again
          </Link>
        )}
      </div>

      <Timeline stage={run.stage} error={run.error} fixes={run.fixes} />

      <CheckProgress run={run} />

      <RejectionDecoder run={run} />

      <VerdictLetter run={run} />

      <DevinBoard fixes={run.fixes} />

      <p className="refresh-note">
        Refreshes every 3 seconds{updatedAt && ` · last updated ${updatedAt}`}.
      </p>
    </div>
  );
}

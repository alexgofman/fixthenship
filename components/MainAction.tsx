"use client";

import { useState } from "react";
import type { Run } from "@/lib/types";

const BUSY_LABEL: Partial<Record<Run["stage"], string>> = {
  scanning: "Scanning your app…",
  checking: "Checking your app…",
  fixing: "Devin is fixing…",
  rechecking: "Checking again…",
};

export default function MainAction({ run, onUpdate }: { run: Run; onUpdate: (run: Run) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const action =
    run.stage === "reviewed"
      ? { label: "Fix with Devin", path: "fix", busy: "Starting Devin…" }
      : run.stage === "fixed"
        ? { label: "Check again", path: "recheck", busy: "Starting the re-check…" }
        : null;
  const busyLabel = BUSY_LABEL[run.stage];

  if (!action && !busyLabel) return null;

  async function go() {
    if (!action) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch(`/api/runs/${run.id}/${action.path}`, { method: "POST" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      onUpdate((await res.json()) as Run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  const busy = pending || !action;
  return (
    <div className="main-action">
      <button type="button" className="btn-primary" onClick={go} disabled={busy} aria-busy={busy}>
        {busy && <span className="spinner" aria-hidden="true" />}
        {pending ? action?.busy : action ? action.label : busyLabel}
      </button>
      {error && (
        <span className="action-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

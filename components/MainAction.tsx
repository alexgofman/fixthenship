"use client";

import { useState, type FormEvent } from "react";
import type { Run } from "@/lib/types";
// Relative so the tests can load this component without the "@/" alias.
import { eligibleForFix } from "../lib/fix/status";

export const NOTHING_TO_FIX = "Nothing here would likely get this app rejected.";

const BUSY_LABEL: Partial<Record<Run["stage"], string>> = {
  scanning: "Scanning your app…",
  checking: "Checking your app…",
  fixing: "Devin is fixing…",
  rechecking: "Checking again…",
};

async function post(url: string, body?: unknown): Promise<Run> {
  const res = await fetch(url, {
    method: "POST",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return (await res.json()) as Run;
}

export default function MainAction({ run, onUpdate }: { run: Run; onUpdate: (run: Run) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [askRepo, setAskRepo] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");

  const canFix = run.findings.some(eligibleForFix);
  const action =
    run.stage === "reviewed" && canFix
      ? { label: "Fix these for me", path: "fix", busy: "Starting Devin…" }
      : run.stage === "fixed"
        ? { label: "Check again", path: "recheck", busy: "Starting the re-check…" }
        : null;
  const busyLabel = BUSY_LABEL[run.stage];
  const needsRepo = run.stage === "reviewed" && !run.repoUrl;

  if (run.stage === "reviewed" && !canFix) {
    // Findings that failed or are a risk but cannot be fixed still need the person's attention.
    const atRisk = run.findings.some((f) => f.state === "fail" || f.state === "risk");
    return atRisk ? null : <p className="main-action muted">{NOTHING_TO_FIX}</p>;
  }
  if (!action && !busyLabel) return null;

  async function send(request: () => Promise<Run>) {
    setPending(true);
    setError("");
    try {
      onUpdate(await request());
      setAskRepo(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  function go() {
    if (!action) return;
    if (needsRepo) {
      setAskRepo(true);
      return;
    }
    void send(() => post(`/api/runs/${run.id}/${action.path}`));
  }

  function saveRepo(e: FormEvent) {
    e.preventDefault();
    void send(() => post(`/api/runs/${run.id}/repo`, { repoUrl }));
  }

  const busy = pending || !action;
  return (
    <div className="main-action">
      {!(askRepo && needsRepo) && (
        <button type="button" className="btn-primary" onClick={go} disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {pending ? action?.busy : action ? action.label : busyLabel}
        </button>
      )}
      {askRepo && needsRepo && (
        <form className="repo-panel" onSubmit={saveRepo} aria-labelledby="repo-panel-text">
          <p id="repo-panel-text">
            To fix your app we need its code on GitHub. In Lovable: press <strong>+</strong> next to the chat
            box, choose <strong>Project</strong>, then <strong>GitHub</strong>, and connect. Then paste the
            repository link here.
          </p>
          <label>
            <span>Repository link</span>
            <input
              type="url"
              required
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/you/your-app"
              autoFocus
            />
          </label>
          <div className="repo-panel-actions">
            <button type="button" className="btn-secondary" onClick={() => setAskRepo(false)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={pending} aria-busy={pending}>
              {pending && <span className="spinner" aria-hidden="true" />}
              {pending ? "Reading your code…" : "Save and fix"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <span className="action-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

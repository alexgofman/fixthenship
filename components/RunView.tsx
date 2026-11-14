"use client";

import { useEffect, useState } from "react";
import type { Run } from "@/lib/types";
import DevinBoard from "./DevinBoard";
import MainAction from "./MainAction";
import Timeline from "./Timeline";
import VerdictLetter from "./VerdictLetter";
import { repoName } from "./findingDisplay";

const POLL_MS = 3000;

export default function RunView({ initialRun }: { initialRun: Run }) {
  const [run, setRun] = useState(initialRun);
  const [updatedAt, setUpdatedAt] = useState("");

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

  return (
    <div className="run">
      <div className="run-head">
        <div>
          <p className="eyebrow">Run {run.id}</p>
          <h1 className="run-title">{repoName(run.repoUrl)}</h1>
        </div>
        <MainAction run={run} onUpdate={setRun} />
      </div>

      <Timeline stage={run.stage} error={run.error} />

      <VerdictLetter run={run} />

      <DevinBoard fixes={run.fixes} />

      <p className="refresh-note">
        Refreshes every 3 seconds{updatedAt && ` · last updated ${updatedAt}`}.
      </p>
    </div>
  );
}

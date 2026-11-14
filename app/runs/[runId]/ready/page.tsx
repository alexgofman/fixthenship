import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isValidRunId, loadRun } from "@/lib/store";
import ReadyReport, { ReadyHead } from "@/components/ReadyReport";

async function ReadyLoader({ runId }: { runId: string }) {
  if (!isValidRunId(runId)) notFound();
  const run = await loadRun(runId).catch(() => null);
  if (!run) notFound();

  return (
    <div className="run">
      <ReadyHead run={run} />
      {run.stage === "done" ? (
        <ReadyReport run={run} />
      ) : (
        <p className="muted">
          This page fills in once the re-check is done (current stage: {run.stage}).{" "}
          <Link href={`/runs/${run.id}`}>Back to the review</Link>
        </p>
      )}
    </div>
  );
}

export default function ReadyPage({ params }: PageProps<"/runs/[runId]/ready">) {
  return (
    <main className="run-page">
      <Suspense fallback={<p className="muted">Loading…</p>}>
        {params.then(({ runId }) => (
          <>
            <p className="back">
              <Link href={`/runs/${runId}`}>← Back to the review</Link>
            </p>
            <ReadyLoader runId={runId} />
          </>
        ))}
      </Suspense>
    </main>
  );
}

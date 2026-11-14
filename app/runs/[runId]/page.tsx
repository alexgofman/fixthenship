import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isValidRunId, loadRun } from "@/lib/store";
import RunView from "./RunView";

async function RunLoader({ runId }: { runId: string }) {
  if (!isValidRunId(runId)) notFound();
  const run = await loadRun(runId).catch(() => null);
  if (!run) notFound();
  return <RunView initialRun={run} />;
}

export default function RunPage({ params }: PageProps<"/runs/[runId]">) {
  return (
    <main>
      <p>
        <Link href="/">← All runs</Link>
      </p>
      <Suspense fallback={<p className="muted">Loading run…</p>}>
        {params.then(({ runId }) => (
          <RunLoader runId={runId} />
        ))}
      </Suspense>
    </main>
  );
}

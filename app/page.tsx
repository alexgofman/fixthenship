import { Suspense } from "react";
import { connection } from "next/server";
import { listRuns } from "@/lib/store";
import RunList from "@/components/RunList";
import StartForm from "@/components/StartForm";

async function Runs() {
  await connection();
  const runs = await listRuns();
  return <RunList initialRuns={runs} />;
}

export default function Home() {
  return (
    <main className="home">
      <section className="hero">
        <h1 className="hero-title">Will Apple reject your app?</h1>
        <p className="hero-line">
          Built an app with Lovable, Bolt, Replit or Base44? Paste its web link before you send it to Apple. We
          use it the way an App Store reviewer would and show you what would likely get it rejected, in about three
          minutes.
        </p>
      </section>

      <StartForm />

      <section className="runs" aria-labelledby="runs-title">
        <div className="section-head">
          <h2 id="runs-title">Reviews</h2>
        </div>
        <Suspense fallback={<p className="empty-runs">Loading reviews…</p>}>
          <Runs />
        </Suspense>
      </section>
    </main>
  );
}

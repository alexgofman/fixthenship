import { Suspense } from "react";
import { connection } from "next/server";
import { listRuns } from "@/lib/store";
import RunList from "@/components/RunList";

async function Runs() {
  await connection();
  const runs = await listRuns();
  return <RunList initialRuns={runs} />;
}

export default function Home() {
  return (
    <main className="home">
      <section className="hero">
        <h1 className="hero-title">FixThenShip</h1>
        <p className="hero-line">
          A dress rehearsal for App Review. We use your app like a reviewer, fix what would likely get it
          rejected, and check again.
        </p>
      </section>

      <form className="review-form" action="/api/runs" method="post">
        <label>
          <span>GitHub repository address</span>
          <input name="repoUrl" type="url" required placeholder="https://github.com/you/your-app" />
        </label>
        <label>
          <span>App address</span>
          <input name="appUrl" type="url" required placeholder="https://your-app.example.com" />
        </label>
        <button type="submit" className="btn-primary">
          Review my app
        </button>
      </form>

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

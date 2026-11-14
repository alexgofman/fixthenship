import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { listRuns } from "@/lib/store";

async function RunList() {
  await connection();
  const runs = await listRuns();
  if (runs.length === 0) return <p className="muted">No runs yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Repository</th>
          <th>App</th>
          <th>Started</th>
          <th>Stage</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id}>
            <td>
              <Link href={`/runs/${run.id}`}>{run.repoUrl}</Link>
            </td>
            <td>{run.appUrl}</td>
            <td>{new Date(run.createdAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</td>
            <td>{run.stage}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Home() {
  return (
    <main>
      <h1>FixThenShip</h1>
      <p className="muted">
        Review an AI-built app for likely App Store review risks, fix what is found, then re-check.
      </p>

      <form className="review" action="/api/runs" method="post">
        <label>
          GitHub repository address
          <input name="repoUrl" type="url" required placeholder="https://github.com/you/your-app" />
        </label>
        <label>
          App address
          <input name="appUrl" type="url" required placeholder="https://your-app.example.com" />
        </label>
        <button type="submit">Review my app</button>
      </form>

      <h2>Runs</h2>
      <Suspense fallback={<p className="muted">Loading runs…</p>}>
        <RunList />
      </Suspense>
    </main>
  );
}

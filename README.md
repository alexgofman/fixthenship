# FixThenShip

Reviews an AI-built app the way an App Store reviewer would, starts coding-agent sessions to fix what it finds, and re-checks the result. Results describe likely outcomes and risks, never a guarantee.

This repository is the skeleton: types, the rules table, a file-based run store, stub API routes and two pages.

## Run it

Requires Node 24 and npm.

```bash
npm install
npm run dev   # http://localhost:3000
npm test      # Vitest
```

Copy `.env.example` to `.env.local` when the real integrations land (not used yet).

## Layout

| Path | What it is |
|---|---|
| `lib/types.ts` | `Run`, `Finding`, `Evidence`, `FixSession`, `CheckResult` and their allowed values |
| `lib/rules.ts` | `RULES`: the thirteen review rules R1 to R13 |
| `lib/store.ts` | `createRun`, `loadRun`, `saveRun`, `listRuns`; each run is `runs/<runId>/run.json` |
| `examples/example-run.json` | Example run with eight findings; copied into `runs/example/` on first use |
| `app/page.tsx` | `/`: review form and list of runs |
| `app/runs/[runId]/` | `/runs/[runId]`: stage timeline and findings, polls every 3 seconds |
| `app/api/runs/...` | Stub routes (below) |

## API (stubs)

- `POST /api/runs`: form fields or JSON `repoUrl`, `appUrl`. Creates a run, copies the example findings, sets stage `reviewed`. Form posts redirect to the run page; JSON gets the run back.
- `GET /api/runs`: all runs, newest first.
- `GET /api/runs/[runId]`: one run.
- `POST /api/runs/[runId]/fix`: sets stage `fixing`, then `fixed`.
- `POST /api/runs/[runId]/recheck`: sets stage `done`.

## Notes

- No database and no sign-in. The `runs/` folder is git-ignored (as `/runs/`, so `app/runs` and `app/api/runs` stay tracked).
- `RUNS_DIR` overrides where runs are stored; the tests use a temp folder.
- Next.js 16 with Cache Components: pages read runs inside `<Suspense>` after `connection()`.

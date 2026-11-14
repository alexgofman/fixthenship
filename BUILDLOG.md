# Build log

| time | who | task | result | what went wrong |
|---|---|---|---|---|
| 2026-11-14 10:10 GMT | Devin | Next.js 16 + TypeScript + Vitest project setup | Done | Nothing |
| 2026-11-14 10:10 GMT | Devin | `lib/types.ts` and `lib/rules.ts` (R1 to R13) | Done | Nothing |
| 2026-11-14 10:11 GMT | Devin | `lib/store.ts`, store tests, `examples/example-run.json` | Done, 6 tests pass | Nothing |
| 2026-11-14 10:11 GMT | Devin | Stub API routes | Done | `.gitignore` entry `runs/` also ignored `app/api/runs` and `app/runs`; changed to `/runs/` |
| 2026-11-14 10:12 GMT | Devin | `/` and `/runs/[runId]` pages with 3-second polling | Done, checked in browser | `next build` warned that reading the runs folder traced the whole project; added a `turbopackIgnore` hint |

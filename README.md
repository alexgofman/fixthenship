# FixThenShip

FixThenShip reviews an AI-built web app the way an App Store reviewer would: it reads the code and uses the running app at iPhone size. For each problem it finds, it starts a Devin session that fixes it and opens a pull request. Then it checks the app again and tells you what is fixed, what still needs you, and how likely a reviewer is to flag the rest.

## The loop

1. You give it a GitHub repository and the URL where the app runs.
2. It scans the code for patterns that often lead to rejection (placeholder text, no account deletion, outside checkout and so on).
3. It uses the running app like a reviewer, with its own test account, and keeps screenshots and step logs as evidence.
4. It writes a verdict letter: each guideline, a likely outcome, and the evidence.
5. "Fix with Devin" starts one Devin session per failing, fixable finding (ten at most); each opens a pull request against the `store-ready` branch.
6. "Check again" re-runs the checks and sorts every finding into fixed and verified, needs you, still failing or not checked, with notes ready to paste into App Store Connect.

## Run it

Requires Node 24.

```bash
npm install
```

Create `.env.local`:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=   # model used by the app checks
MODEL=                          # model id for the app checks
DEVIN_API_KEY=                  # starts and polls fix sessions
DEVIN_ORG_ID=
GITHUB_TOKEN=                   # reads the repository and its pull requests
```

```bash
npm run dev    # http://localhost:3000
npm test       # Vitest
```

Without keys the example run (`examples/example-run.json`) still opens at `/runs/example`.

To share a finished run as a static page that opens from disk or any static host:

```bash
node scripts/export-run.mjs <runId> <outDir>
```

## Rulebook

From `lib/rules.ts`.

| Id | Guideline | What is checked | Fixable |
|---|---|---|---|
| R1 | 2.1(a) | The app loads without errors | partly |
| R2 | 2.1(a) | No placeholder content | yes |
| R3 | 2.1 | No dead buttons or broken links | yes |
| R4 | 2.1(a) | The reviewer can get in | partly |
| R5 | 5.1.1(i) | A privacy policy is reachable in the app | yes |
| R6 | 5.1.1(v) | An account can be deleted in the app | yes |
| R7 | 4.8 | Third-party login comes with an Apple option | partly |
| R8 | 3.1.1 | Digital goods are not sold through outside checkout | partly |
| R9 | 1.5 | A support or contact page exists | yes |
| R10 | 4.2.6 | No app-builder badge or default branding | yes |
| R11 | 5.1.2(i) | No tracking or third-party AI calls before consent | partly |
| R12 | 1.2 | User content can be reported and blocked | yes |
| R13 | 4.2 | "Just a website" risk | no |

## Limits

- It tests the web build at iPhone size, not a native build on a device.
- It covers about ten rules, not the whole App Review Guidelines.
- It predicts what a reviewer is likely to flag. Apple makes the decision.
- Test accounts use a public inbox (mailinator.com) by default, which is fine for demo apps only. Set `TEST_EMAIL_DOMAIN` to a domain whose mail you own for anything with real data.
- The re-check installs and runs the reviewed app's code on this machine (with `--ignore-scripts` and a stripped environment). That is meant for apps you own; in production it must run inside an isolated sandbox (container or microVM) with no host secrets.

## How this was built

<filled in at submission from BUILDLOG.md>

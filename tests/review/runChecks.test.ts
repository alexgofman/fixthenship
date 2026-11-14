import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runChecks } from "../../lib/review/runChecks";
import { traceReason } from "../../lib/review/trace";

type Behaviour = {
  code: number | null;
  marker?: string;
  trace?: string;
  screenshot?: boolean;
};

type Call = { args: string[]; env: Record<string, string | undefined> };

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "fixthenship-checks-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// The shape e2e 0.23 writes to trace.md.
const FAIL_TRACE = `# ✗ no placeholder content

\`checks/R2.e2e.ts\` · failed · 9.1s

**ASSERTION_FAILED**

\`\`\`text
agent.assert failed
The hero says "Lorem ipsum dolor sit amet". It is placeholder text.
\`\`\`

Look at: \`checks/R2.e2e.ts:10\`

## Steps

1. ✓ \`app.open\` \`/\` (774ms) — \`checks/R2.e2e.ts:9\`
   - screen: 8 nodes at \`https://app.test/\`
2. ✗ \`agent.assert\` "no placeholder text" (3.2s, 1 model call) — **ASSERTION_FAILED** — \`checks/R2.e2e.ts:10\`
   - screen: unchanged since step 1 at \`https://app.test/\`

## Screen at failure

![screenshot at failure](attempt-1/screenshots/001-failure.png)
`;

const PASS_TRACE = `# ✓ the app loads

## Steps

1. ✓ \`app.open\` \`/\` (774ms) — \`checks/R1.e2e.ts:4\`
   - screen: 8 nodes at \`https://app.test/\`
2. ✓ \`agent.assert\` "the first screen shows real app content" (2.1s, 1 model call) — \`checks/R1.e2e.ts:5\`
`;

/** A spawn that behaves like `npx e2e run` without starting a browser. */
function fakeSpawn(behaviours: Record<string, Behaviour>, calls: Call[]) {
  return (_command: string, args: string[], options: SpawnOptions): ChildProcess => {
    const env: Record<string, string | undefined> = options.env ?? {};
    calls.push({ args, env });
    const ruleId = /checks\/(R\d+)\.e2e\.ts/.exec(args.join(" "))![1];
    const b = behaviours[ruleId];
    const child = new EventEmitter() as ChildProcess;
    Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough() });
    child.kill = () => {
      setImmediate(() => child.emit("close", null));
      return true;
    };
    setImmediate(async () => {
      if (b.marker) await writeFile(path.join(env.CHECK_OUT_DIR!, "not_checked.txt"), b.marker);
      const output = args[args.indexOf("--output") + 1];
      const testDir = path.join(output, "results", "test-1");
      if (b.trace) {
        await mkdir(testDir, { recursive: true });
        await writeFile(path.join(testDir, "trace.md"), b.trace);
      }
      if (b.screenshot) {
        await mkdir(path.join(testDir, "attempt-1", "screenshots"), { recursive: true });
        await writeFile(path.join(testDir, "attempt-1", "screenshots", "001-failure.png"), "png");
      }
      child.stdout!.emit("data", "done\n");
      if (b.code !== null) child.emit("close", b.code);
    });
    return child;
  };
}

describe("runChecks", () => {
  it("maps exit 0 to pass, 1 to fail and anything else to not checked, one rule at a time", async () => {
    const calls: Call[] = [];
    const spawn = fakeSpawn(
      { R1: { code: 0, trace: PASS_TRACE }, R2: { code: 1, trace: FAIL_TRACE, screenshot: true }, R5: { code: 3 }, R6: { code: 2 } },
      calls,
    );
    const results = await runChecks("https://app.test", dir, ["R1", "R2", "R5", "R6"], {
      spawn,
      cwd: dir,
      testEmail: "reviewer+abc@example.com",
      testPassword: "pw",
    });

    expect(results.map((r) => [r.ruleId, r.outcome])).toEqual([
      ["R1", "pass"],
      ["R2", "fail"],
      ["R5", "not_checked"],
      ["R6", "not_checked"],
    ]);
    // A check that could not run is tried once more, with its own test account.
    expect(calls.map((c) => c.args.slice(0, 4))).toEqual(
      ["R1", "R2", "R5", "R5", "R6", "R6"].map((id) => ["e2e", "run", `checks/${id}.e2e.ts`, "--trace"]),
    );
    expect(calls[3].env.TEST_EMAIL).toBe("reviewer+abc.r5.2@example.com");
    expect(calls[0].env).toMatchObject({
      APP_URL: "https://app.test",
      TEST_EMAIL: "reviewer+abc.r1@example.com",
      TEST_PASSWORD: "pw",
      CHECK_OUT_DIR: path.join(dir, "R1"),
    });

    const failed = results[1];
    expect(failed.reason).toBe('ASSERTION_FAILED: The hero says "Lorem ipsum dolor sit amet".');
    expect(failed.steps).toEqual([
      { ok: true, text: "app.open /" },
      { ok: false, text: 'agent.assert "no placeholder text"' },
    ]);
    expect(failed.screenshots).toEqual([path.join(dir, "R2", "attempt-1", "screenshots", "001-failure.png")]);
    expect(await readFile(path.join(dir, "R2", "trace.md"), "utf8")).toBe(FAIL_TRACE);
    expect(results[2].reason).toContain("e2e exit 3");
  });

  it("lets the not_checked.txt marker override the exit code and uses it as the reason", async () => {
    const spawn = fakeSpawn({ R6: { code: 1, marker: "Sign-up requires confirming the email address.\n" }, R8: { code: 0, marker: "No email sign-up." } }, []);
    const results = await runChecks("https://app.test", dir, ["R6", "R8"], { spawn, cwd: dir });
    expect(results).toMatchObject([
      { ruleId: "R6", outcome: "not_checked", reason: "Sign-up requires confirming the email address." },
      { ruleId: "R8", outcome: "not_checked", reason: "No email sign-up." },
    ]);
  });

  it("treats a check that could not tell as not checked, never as a finding", async () => {
    const trace = `# ✗ digital goods are not sold through outside checkout

**ASSERTION_INCONCLUSIVE**

\`\`\`text
agent.extract failed
nothing to extract: the screen shows the home screen.
\`\`\`

## Steps

1. ✓ \`app.open\` \`/\` (774ms) — \`checks/R8.e2e.ts:9\`
`;
    const spawn = fakeSpawn({ R8: { code: 1, trace } }, []);
    const results = await runChecks("https://app.test", dir, ["R8"], { spawn, cwd: dir });
    expect(results).toMatchObject([
      { ruleId: "R8", outcome: "not_checked", reason: "The check could not tell: nothing to extract: the screen shows the home screen." },
    ]);
  });

  it("stops a check that runs too long and still runs the next one", async () => {
    const spawn = fakeSpawn({ R1: { code: null }, R2: { code: 0 } }, []);
    const results = await runChecks("https://app.test", dir, ["R1", "R2"], { spawn, cwd: dir, timeoutMs: 50 });
    expect(results.map((r) => r.outcome)).toEqual(["not_checked", "pass"]);
    expect(results[0].reason).toContain("did not finish");
  });

  it("treats a check that cannot start as not checked and keeps going", async () => {
    const calls: Call[] = [];
    const ok = fakeSpawn({ R2: { code: 1 } }, calls);
    const spawn = (command: string, args: string[], options: SpawnOptions) => {
      if (args.includes("checks/R1.e2e.ts")) throw new Error("spawn npx ENOENT");
      return ok(command, args, options);
    };
    const results = await runChecks("https://app.test", dir, ["R1", "R2"], { spawn, cwd: dir });
    expect(results.map((r) => r.outcome)).toEqual(["not_checked", "fail"]);
    expect(results[0].reason).toContain("ENOENT");
  });
});

describe("traceReason", () => {
  it("names the last passing step when the check passes", () => {
    expect(traceReason(PASS_TRACE, true)).toBe('Passed at agent.assert "the first screen shows real app content".');
  });
});

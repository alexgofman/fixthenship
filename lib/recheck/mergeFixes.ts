import { hasDevinKey, sendMessage } from "../devin/client";
import { baseBranch } from "../fix/brief";
import { parseRepoUrl, type RepoRef } from "../fix/github";
import { errorMessage } from "../fix/status";
import { loadRun, updateRun } from "../store";
import type { FixSession, RuleId } from "../types";

const API = "https://api.github.com";

export type MergeResult = { merged: RuleId[]; skipped: RuleId[] };

export type MergeDeps = {
  fetch: typeof fetch;
  hasDevinKey: () => boolean;
  sendMessage: (sessionId: string, message: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  /** How long to wait before merging again after GitHub refused with 405 or 409. */
  mergeRetryMs: number;
  /** How often to look at a pull request whose session is bringing it up to date. */
  updatePollMs: number;
  /** How long a session gets to bring its pull request up to date. */
  updateTimeoutMs: number;
};

export const MERGE_RETRY_MS = 2_000;
/** Merges tried again, after re-reading the pull request, before its session is asked to update it. */
export const MERGE_RETRIES = 2;
export const UPDATE_POLL_MS = 15_000;
export const UPDATE_TIMEOUT_MS = 8 * 60_000;

type PullRef = { owner: string; repo: string; number: number };

type Pull = {
  state: string;
  merged: boolean;
  mergeable?: boolean | null;
  base: { ref: string };
  head: { sha: string; repo?: { full_name: string } | null };
};

/**
 * Why a merge was refused. `conflict` is set when GitHub still said 405 or 409 after the retries;
 * `step` replaces the hand-merge step.
 */
type Refusal = { reason: string; conflict?: boolean; step?: string };

export const OTHER_REPO_STEP = "This pull request is not in the app's repository; it was not merged";

/** A pull request link on github.com, or null for anything else. */
export function parsePullUrl(prUrl: string): PullRef | null {
  let url: URL;
  try {
    url = new URL(prUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

/** The pull request, only when it belongs to the run's own repository. */
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function pullInRepo(prUrl: string, repo: RepoRef | null): PullRef | null {
  const pull = parsePullUrl(prUrl);
  if (!pull || !repo) return null;
  return same(pull.owner, repo.owner) && same(pull.repo, repo.repo) ? pull : null;
}

export function handMergeStep(prUrl: string): string {
  return `Merge this pull request by hand: ${prUrl}`;
}

export const UPDATING_SUMMARY = "Bringing this fix up to date with the other fixes…";

export function updateMessage(prUrl: string, branch: string): string {
  return (
    `Other fixes were merged into \`${branch}\` first, and your pull request ${prUrl} no longer merges cleanly. ` +
    `Merge the latest \`${branch}\` into your branch, resolve the conflicts so that BOTH your change and the changes ` +
    `already on \`${branch}\` are kept, make sure the app still builds, and push to the same branch. ` +
    "Do not open a new pull request. Reply when it is pushed."
  );
}

function request(deps: MergeDeps, pathname: string, init: RequestInit = {}): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  return deps.fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

async function failure(res: Response, what: string): Promise<string> {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 300);
  try {
    message = (JSON.parse(text) as { message?: string }).message ?? message;
  } catch {
    // Not JSON; keep the raw text.
  }
  return `${what} failed: ${res.status} ${message}`.trim();
}

function pullPath({ owner, repo, number }: PullRef): string {
  return `/repos/${owner}/${repo}/pulls/${number}`;
}

/**
 * Merges one pull request into `branch`. Returns null when merged, otherwise why it was refused.
 * GitHub answers 405 "Base branch was modified" to merges made back to back, so a 405 or 409 is
 * tried again with the pull request read afresh, MERGE_RETRIES times, before it counts as a conflict.
 */
async function mergeOne(deps: MergeDeps, ref: PullRef, ruleId: RuleId, branch: string): Promise<Refusal | null> {
  const base = pullPath(ref);
  const repoName = `${ref.owner}/${ref.repo}`;

  for (let attempt = 0; ; attempt++) {
    const got = await request(deps, base);
    if (!got.ok) return { reason: await failure(got, `GET ${base}`) };
    const pull = (await got.json()) as Pull;
    if (pull.merged) return null;
    if (pull.state !== "open") return { reason: "The pull request is closed." };
    if (pull.base.ref !== branch) return { reason: `The pull request targets ${pull.base.ref}, not ${branch}.` };
    const headRepo = pull.head.repo?.full_name ?? "";
    if (!same(headRepo, repoName)) {
      return { reason: `The pull request's branch is in ${headRepo || "a deleted repository"}, not ${repoName}.`, step: OTHER_REPO_STEP };
    }

    const put = await request(deps, `${base}/merge`, {
      method: "PUT",
      body: JSON.stringify({
        merge_method: "merge",
        sha: pull.head.sha,
        commit_title: `FixThenShip ${ruleId}: merge #${ref.number} into ${branch}`,
      }),
    });
    if (put.ok) return null;
    const reason = await failure(put, `PUT ${base}/merge`);
    if (put.status !== 405 && put.status !== 409) return { reason };
    // Still refused: a real conflict, which the fix's session can resolve.
    if (attempt >= MERGE_RETRIES) return { reason, conflict: true };
    await deps.sleep(deps.mergeRetryMs);
  }
}

async function tryMerge(deps: MergeDeps, ref: PullRef, ruleId: RuleId, branch: string): Promise<Refusal | null> {
  try {
    return await mergeOne(deps, ref, ruleId, branch);
  } catch (err) {
    return { reason: errorMessage(err) };
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Waits until GitHub says the pull request merges (with or without a new head), or it is no longer open. */
async function waitForUpdate(deps: MergeDeps, ref: PullRef): Promise<boolean> {
  const deadline = Date.now() + deps.updateTimeoutMs;
  for (;;) {
    try {
      const got = await request(deps, pullPath(ref));
      if (got.ok) {
        const pull = (await got.json()) as Pull;
        if (pull.merged || pull.state !== "open") return true;
        if (pull.mergeable === true) return true;
      }
    } catch {
      // Keep waiting; GitHub may answer on the next look.
    }
    const left = deadline - Date.now();
    if (left <= 0) return false;
    await deps.sleep(Math.min(deps.updatePollMs, left));
  }
}

async function setSummary(runId: string, ruleId: RuleId, summary: string): Promise<void> {
  await updateRun(runId, (latest) => {
    latest.fixes = latest.fixes.map((f) => (f.ruleId === ruleId ? { ...f, summary } : f));
  });
}

/** Asks the fix's own session to merge `branch` into its branch, waits for the push, then merges again. */
async function bringUpToDate(
  runId: string,
  branch: string,
  deps: MergeDeps,
  fix: FixSession,
  ref: PullRef,
): Promise<Refusal | null> {
  const previous = (await loadRun(runId)).fixes.find((f) => f.ruleId === fix.ruleId)?.summary ?? fix.summary;
  await setSummary(runId, fix.ruleId, UPDATING_SUMMARY);
  try {
    try {
      await deps.sendMessage(fix.sessionId, updateMessage(fix.prUrl, branch));
    } catch (err) {
      return { reason: `Could not message session ${fix.sessionId}: ${errorMessage(err)}` };
    }
    if (!(await waitForUpdate(deps, ref))) {
      return { reason: `Session ${fix.sessionId} did not bring the pull request up to date within ${Math.round(deps.updateTimeoutMs / 1000)} seconds` };
    }
    return await tryMerge(deps, ref, fix.ruleId, branch);
  } finally {
    await setSummary(runId, fix.ruleId, previous);
  }
}

/**
 * Merges every fix's pull request into the run's own branch, whatever the fix's status, except while its
 * session is still queued or working: first every one that merges cleanly, then,
 * one at a time, each one refused for a conflict after its own Devin session has brought it up to date.
 * A merge that is still refused marks that finding amber with a link to merge it by hand.
 */
export async function mergeFixes(runId: string, overrides: Partial<MergeDeps> = {}): Promise<MergeResult> {
  const deps: MergeDeps = {
    fetch: (...args) => fetch(...args),
    hasDevinKey,
    sendMessage,
    sleep,
    mergeRetryMs: MERGE_RETRY_MS,
    updatePollMs: UPDATE_POLL_MS,
    updateTimeoutMs: UPDATE_TIMEOUT_MS,
    ...overrides,
  };
  const run = await loadRun(runId);
  const branch = baseBranch(run);
  const result: MergeResult = { merged: [], skipped: [] };
  const refused = new Map<RuleId, string>();
  const conflicts: { fix: FixSession; pull: PullRef }[] = [];
  const refuse = (fix: FixSession, { reason, step }: Refusal) => {
    console.error(`mergeFixes ${runId}: ${fix.ruleId} ${fix.prUrl}: ${reason}`);
    result.skipped.push(fix.ruleId);
    refused.set(fix.ruleId, step ?? handMergeStep(fix.prUrl));
  };
  let repo: RepoRef | null = null;
  try {
    repo = parseRepoUrl(run.repoUrl);
  } catch {
    // Without a GitHub repository no pull request can belong to the run.
  }

  for (const fix of run.fixes) {
    // A session that ran out of budget after opening its pull request has still delivered a fix.
    if (!fix.prUrl || fix.status === "queued" || fix.status === "working") continue;
    const pull = pullInRepo(fix.prUrl, repo);
    if (!pull) {
      console.error(`mergeFixes ${runId}: ${fix.ruleId} ${fix.prUrl} is not a pull request in ${run.repoUrl}`);
      result.skipped.push(fix.ruleId);
      refused.set(fix.ruleId, OTHER_REPO_STEP);
      continue;
    }
    const refusal = await tryMerge(deps, pull, fix.ruleId, branch);
    if (refusal === null) result.merged.push(fix.ruleId);
    else if (refusal.conflict && fix.sessionId && deps.hasDevinKey()) {
      console.error(`mergeFixes ${runId}: ${fix.ruleId} ${fix.prUrl}: ${refusal.reason}; asking its session to update it`);
      conflicts.push({ fix, pull });
    } else refuse(fix, refusal);
  }

  for (const { fix, pull } of conflicts) {
    let refusal: Refusal | null;
    try {
      refusal = await bringUpToDate(runId, branch, deps, fix, pull);
    } catch (err) {
      refusal = { reason: errorMessage(err) };
    }
    if (refusal === null) result.merged.push(fix.ruleId);
    else refuse(fix, refusal);
  }

  if (refused.size) {
    await updateRun(runId, (latest) => {
      latest.findings = latest.findings.map((f) => {
        const step = refused.get(f.ruleId);
        return step ? { ...f, finalState: "amber", humanStep: step } : f;
      });
    });
  }
  return result;
}

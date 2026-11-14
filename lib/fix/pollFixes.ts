import { getSession } from "../devin/client";
import { loadRun, updateRun } from "../store";
import type { FixSession, Run, RuleId } from "../types";
import { baseBranch } from "./brief";
import { type PullRequest, listOpenPullRequests, parseRepoUrl } from "./github";
import { errorMessage, isDone } from "./status";

/** True when the PR title or branch name names this rule, e.g. "R7" but not "R70" or "R17". */
export function mentionsRule(text: string, ruleId: RuleId): boolean {
  return new RegExp(`(^|[^a-z0-9])${ruleId}(?![0-9])`, "i").test(text);
}

export function matchPullRequest(pulls: PullRequest[], ruleId: RuleId): PullRequest | undefined {
  return pulls.find((p) => mentionsRule(p.title, ruleId) || mentionsRule(p.headRef, ruleId));
}

/** Polls of one session that may fail in a row before its fix is given up as an error. */
export const MAX_POLL_FAILURES = 5;

/** Failed polls in a row, by session id. Kept in memory only: a restart gives every session a fresh count. */
const pollFailures = new Map<string, number>();

export function unreachableSummary(reason: string): string {
  return `Could not reach this Devin session: ${reason}`;
}

async function pollSession(fix: FixSession): Promise<FixSession> {
  try {
    const s = await getSession(fix.sessionId);
    pollFailures.delete(fix.sessionId);
    const prUrl = s.prUrl || fix.prUrl;
    // A session that has opened its pull request and now waits for a reply has done its work. Devin only
    // reports it as finished about ten minutes later, when it suspends the idle session.
    const status = s.status === "waiting" && prUrl ? "finished" : s.status;
    return { ...fix, status, prUrl, summary: s.summary || fix.summary, acus: s.acus };
  } catch (err) {
    const reason = errorMessage(err);
    const failures = (pollFailures.get(fix.sessionId) ?? 0) + 1;
    console.error(`pollFixes: session ${fix.sessionId} (${fix.ruleId}), failure ${failures}: ${reason}`);
    if (failures < MAX_POLL_FAILURES) {
      pollFailures.set(fix.sessionId, failures);
      return fix;
    }
    pollFailures.delete(fix.sessionId);
    return { ...fix, status: "error", summary: unreachableSummary(reason) };
  }
}

async function pollPullRequests(run: Run, fixes: FixSession[]): Promise<FixSession[]> {
  let pulls: PullRequest[];
  try {
    pulls = await listOpenPullRequests(parseRepoUrl(run.repoUrl), baseBranch(run));
  } catch (err) {
    console.error(`pollFixes: listing pull requests for ${run.repoUrl}: ${errorMessage(err)}`);
    return fixes;
  }
  return fixes.map((fix) => {
    const pr = matchPullRequest(pulls, fix.ruleId);
    return pr ? { ...fix, status: "finished", prUrl: pr.url, summary: fix.summary || pr.title } : fix;
  });
}

/** Nobody is working on it any more: finished, failed, or waiting for an answer with no pull request yet. */
function isSettled(fix: FixSession): boolean {
  return isDone(fix) || fix.status === "waiting";
}

/** Refreshes every unfinished fix; sets stage "fixed" once no session is still working. */
export async function pollFixes(runId: string): Promise<Run> {
  const run = await loadRun(runId);
  const open = run.fixes.filter((f) => !isDone(f));

  const withSession = await Promise.all(open.filter((f) => f.sessionId).map(pollSession));
  const manual = open.filter((f) => !f.sessionId);
  const fromPulls = manual.length ? await pollPullRequests(run, manual) : [];
  const updates = new Map([...withSession, ...fromPulls].map((f) => [f.ruleId, f]));

  return updateRun(runId, (latest) => {
    latest.fixes = latest.fixes.map((f) => {
      const update = updates.get(f.ruleId);
      // A fix restarted while this poll was out keeps its new session.
      return update && update.sessionId === f.sessionId ? update : f;
    });
    if (latest.stage === "fixing" && latest.fixes.every(isSettled)) latest.stage = "fixed";
  });
}

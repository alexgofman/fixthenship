import { getSession } from "../devin/client";
import { loadRun, saveRun } from "../store";
import type { FixSession, Run, RuleId } from "../types";
import { BASE_BRANCH } from "./brief";
import { type PullRequest, listOpenPullRequests, parseRepoUrl } from "./github";
import { errorMessage, isDone } from "./status";

/** True when the PR title or branch name names this rule, e.g. "R7" but not "R70" or "R17". */
export function mentionsRule(text: string, ruleId: RuleId): boolean {
  return new RegExp(`(^|[^a-z0-9])${ruleId}(?![0-9])`, "i").test(text);
}

export function matchPullRequest(pulls: PullRequest[], ruleId: RuleId): PullRequest | undefined {
  return pulls.find((p) => mentionsRule(p.title, ruleId) || mentionsRule(p.headRef, ruleId));
}

async function pollSession(fix: FixSession): Promise<FixSession> {
  try {
    const s = await getSession(fix.sessionId);
    const prUrl = s.prUrl || fix.prUrl;
    // A session that has opened its pull request and now waits for a reply has done its work. Devin only
    // reports it as finished about ten minutes later, when it suspends the idle session.
    const status = s.status === "waiting" && prUrl ? "finished" : s.status;
    return { ...fix, status, prUrl, summary: s.summary || fix.summary, acus: s.acus };
  } catch (err) {
    console.error(`pollFixes: session ${fix.sessionId} (${fix.ruleId}): ${errorMessage(err)}`);
    return fix;
  }
}

async function pollPullRequests(run: Run, fixes: FixSession[]): Promise<FixSession[]> {
  let pulls: PullRequest[];
  try {
    pulls = await listOpenPullRequests(parseRepoUrl(run.repoUrl), BASE_BRANCH);
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

  const latest = await loadRun(runId);
  latest.fixes = latest.fixes.map((f) => updates.get(f.ruleId) ?? f);
  if (latest.stage === "fixing" && latest.fixes.every(isSettled)) latest.stage = "fixed";
  await saveRun(latest);
  return latest;
}

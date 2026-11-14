import { BASE_BRANCH } from "../fix/brief";
import { errorMessage } from "../fix/status";
import { loadRun, saveRun } from "../store";
import type { RuleId } from "../types";

const API = "https://api.github.com";

export type MergeResult = { merged: RuleId[]; skipped: RuleId[] };

export type MergeDeps = { fetch: typeof fetch };

type PullRef = { owner: string; repo: string; number: number };

type Pull = { state: string; merged: boolean; base: { ref: string }; head: { sha: string } };

export function parsePullUrl(prUrl: string): PullRef {
  const match = prUrl.trim().match(/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/i);
  if (!match) throw new Error(`Not a GitHub pull request URL: ${prUrl}`);
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

export function handMergeStep(prUrl: string): string {
  return `Merge this pull request by hand: ${prUrl}`;
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

/** Merges one pull request into BASE_BRANCH. Returns null when merged, otherwise why it was refused. */
async function mergeOne(deps: MergeDeps, prUrl: string, ruleId: RuleId): Promise<string | null> {
  const { owner, repo, number } = parsePullUrl(prUrl);
  const base = `/repos/${owner}/${repo}/pulls/${number}`;

  const got = await request(deps, base);
  if (!got.ok) return failure(got, `GET ${base}`);
  const pull = (await got.json()) as Pull;
  if (pull.merged) return null;
  if (pull.state !== "open") return "The pull request is closed.";
  if (pull.base.ref !== BASE_BRANCH) return `The pull request targets ${pull.base.ref}, not ${BASE_BRANCH}.`;

  const put = await request(deps, `${base}/merge`, {
    method: "PUT",
    body: JSON.stringify({
      merge_method: "merge",
      sha: pull.head.sha,
      commit_title: `FixThenShip ${ruleId}: merge #${number} into ${BASE_BRANCH}`,
    }),
  });
  if (put.ok) return null;
  // 405 "not mergeable" (merge conflict) or 409 (head moved); every refusal is left for a person to merge.
  return failure(put, `PUT ${base}/merge`);
}

/**
 * Merges every finished fix's pull request into store-ready, one at a time.
 * A refused merge marks that finding amber with a link to merge it by hand.
 */
export async function mergeFixes(runId: string, overrides: Partial<MergeDeps> = {}): Promise<MergeResult> {
  const deps: MergeDeps = { fetch: (...args) => fetch(...args), ...overrides };
  const run = await loadRun(runId);
  const result: MergeResult = { merged: [], skipped: [] };
  const refused = new Map<RuleId, string>();

  for (const fix of run.fixes) {
    if (fix.status !== "finished" || !fix.prUrl) continue;
    let reason: string | null;
    try {
      reason = await mergeOne(deps, fix.prUrl, fix.ruleId);
    } catch (err) {
      reason = errorMessage(err);
    }
    if (reason === null) {
      result.merged.push(fix.ruleId);
    } else {
      console.error(`mergeFixes ${runId}: ${fix.ruleId} ${fix.prUrl}: ${reason}`);
      result.skipped.push(fix.ruleId);
      refused.set(fix.ruleId, fix.prUrl);
    }
  }

  if (refused.size) {
    const latest = await loadRun(runId);
    latest.findings = latest.findings.map((f) => {
      const prUrl = refused.get(f.ruleId);
      return prUrl ? { ...f, finalState: "amber", humanStep: handMergeStep(prUrl) } : f;
    });
    await saveRun(latest);
  }
  return result;
}

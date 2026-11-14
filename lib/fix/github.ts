const API = "https://api.github.com";

export type RepoRef = { owner: string; repo: string };

export type PullRequest = { title: string; headRef: string; url: string };

export function parseRepoUrl(repoUrl: string): RepoRef {
  const match = repoUrl
    .trim()
    .match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/i);
  if (!match) throw new Error(`Not a GitHub repository URL: ${repoUrl}`);
  return { owner: match[1], repo: match[2] };
}

async function gh(pathname: string, init: RequestInit = {}): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  return fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

async function ghJson<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const res = await gh(pathname, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${init.method ?? "GET"} ${pathname} failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Creates `branch` from the repository's default branch unless it already exists. */
export async function ensureBranch({ owner, repo }: RepoRef, branch: string): Promise<void> {
  const base = `/repos/${owner}/${repo}`;
  const existing = await gh(`${base}/branches/${encodeURIComponent(branch)}`);
  if (existing.ok) return;
  if (existing.status !== 404) {
    throw new Error(`GitHub GET ${base}/branches/${branch} failed: ${existing.status}`);
  }

  const { default_branch } = await ghJson<{ default_branch: string }>(base);
  const ref = await ghJson<{ object: { sha: string } }>(
    `${base}/git/ref/heads/${encodeURIComponent(default_branch)}`,
  );
  const created = await gh(`${base}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: ref.object.sha }),
  });
  // 422 means another caller created it in the meantime.
  if (!created.ok && created.status !== 422) {
    const text = await created.text().catch(() => "");
    throw new Error(`GitHub POST ${base}/git/refs failed: ${created.status} ${text.slice(0, 300)}`);
  }
}

export async function listOpenPullRequests({ owner, repo }: RepoRef, base: string): Promise<PullRequest[]> {
  const pulls = await ghJson<{ title: string; html_url: string; head: { ref: string } }[]>(
    `/repos/${owner}/${repo}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`,
  );
  return pulls.map((p) => ({ title: p.title, headRef: p.head.ref, url: p.html_url }));
}

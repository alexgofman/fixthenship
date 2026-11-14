import snapshotFile from "../content/guidelines-snapshot.json" with { type: "json" };
import { RULES } from "../rules";
import { GUIDELINES_URL, hashSections, parseSections, sectionFor } from "./sections.mjs";

export { GUIDELINES_URL, parseSections, sectionFor };

export type GuidelinesCheck = {
  checkedAt: string;
  status: "unchanged" | "changed" | "unreachable";
  /** When our snapshot of the page was taken, "YYYY-MM-DD". */
  snapshotDate: string;
  /** Sections our checks cite whose text changed or is gone. */
  changed: string[];
  /** Other sections that changed, were added or were removed. */
  changedElsewhere: number;
};

export type GuidelinesSnapshot = { takenAt: string; source: string; sections: Record<string, string> };

export type GuidelinesDeps = {
  fetch?: typeof fetch;
  now?: () => number;
  snapshot?: GuidelinesSnapshot;
  timeoutMs?: number;
};

export const FETCH_TIMEOUT_MS = 8_000;
export const MEMORY_MS = 10 * 60_000;
/** Fewer sections than this means the page was blocked or redesigned, not edited. */
export const MIN_SECTIONS = 60;

/** The sections our checks cite, e.g. "5.1.1" for R6's "5.1.1(v)". */
export const CITED_SECTIONS: string[] = [...new Set(RULES.map((r) => sectionFor(r.guideline)))];

let memory: { at: number; result: Promise<GuidelinesCheck> } | undefined;

/** Forgets the remembered result (for tests). */
export function forgetGuidelinesCheck(): void {
  memory = undefined;
}

async function readPage(fetchFn: typeof fetch, timeoutMs: number): Promise<Record<string, string> | undefined> {
  try {
    const res = await fetchFn(GUIDELINES_URL, {
      signal: AbortSignal.timeout(timeoutMs),
      credentials: "omit",
      cache: "no-store",
    });
    if (res.status !== 200) return undefined;
    const sections = parseSections(await res.text());
    return Object.keys(sections).length >= MIN_SECTIONS ? sections : undefined;
  } catch {
    return undefined;
  }
}

async function check(deps: GuidelinesDeps, now: () => number): Promise<GuidelinesCheck> {
  const snapshot = deps.snapshot ?? (snapshotFile as GuidelinesSnapshot);
  const base = { snapshotDate: snapshot.takenAt, changed: [] as string[], changedElsewhere: 0 };
  try {
    const sections = await readPage(deps.fetch ?? fetch, deps.timeoutMs ?? FETCH_TIMEOUT_MS);
    const checkedAt = new Date(now()).toISOString();
    if (!sections) return { checkedAt, status: "unreachable", ...base };
    const hashes = await hashSections(sections);
    const keys = new Set([...Object.keys(hashes), ...Object.keys(snapshot.sections)]);
    const changed: string[] = [];
    let changedElsewhere = 0;
    for (const key of keys) {
      if (hashes[key] === snapshot.sections[key]) continue;
      if (CITED_SECTIONS.includes(key)) changed.push(key);
      else changedElsewhere++;
    }
    for (const key of CITED_SECTIONS) {
      if (!(key in hashes) && !changed.includes(key)) changed.push(key);
    }
    changed.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    return { checkedAt, status: changed.length > 0 ? "changed" : "unchanged", ...base, changed, changedElsewhere };
  } catch {
    return { checkedAt: new Date().toISOString(), status: "unreachable", ...base };
  }
}

/**
 * Reads Apple's App Review Guidelines again and says whether the sections our checks cite changed since our
 * snapshot. Never throws. Back-to-back calls within 10 minutes share one result.
 */
export function checkGuidelines(deps: GuidelinesDeps = {}): Promise<GuidelinesCheck> {
  const now = deps.now ?? Date.now;
  let at: number;
  try {
    at = now();
  } catch {
    at = Date.now();
  }
  if (memory && at - memory.at < MEMORY_MS && at >= memory.at) return memory.result;
  const result = check(deps, () => {
    try {
      return now();
    } catch {
      return Date.now();
    }
  });
  memory = { at, result };
  return result;
}

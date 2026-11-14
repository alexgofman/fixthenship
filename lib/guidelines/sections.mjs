// Plain JS so scripts/snapshot-guidelines.mjs and freshness.ts parse and hash Apple's page the same way.
// No Node-only imports: GuidelinesNote (a client component) uses the sentence helpers below.

export const GUIDELINES_URL = "https://developer.apple.com/app-store/review/guidelines/";

// Apple marks each numbered section with an element whose id is the number: <span id="5.1.1"></span>.
const ANCHOR = /<[a-z][a-z0-9]*\b[^>]*?\sid="(\d+(?:\.\d+)*)"[^>]*>/gi;
// The last section (5.6.4) is followed by "After You Submit", which is not a guideline.
const END = /<[a-z][a-z0-9]*\b[^>]*?\sid="after-you-submit"|<\/main\b/i;

const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…" };

/** @param {string} html */
function textOf(html) {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
      if (name[0] === "#") {
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The text of every numbered section ("1.2", "5.1.1", ...), whitespace collapsed. Lettered sub-points such as
 * 5.1.1(v) have no anchor of their own, so they stay in their numbered section's text.
 * @param {string} html
 * @returns {Record<string, string>}
 */
export function parseSections(html) {
  /** @type {Record<string, string>} */
  const sections = {};
  const anchors = [...html.matchAll(ANCHOR)];
  anchors.forEach((anchor, i) => {
    const start = (anchor.index ?? 0) + anchor[0].length;
    let end = i + 1 < anchors.length ? (anchors[i + 1].index ?? html.length) : html.length;
    const stop = html.slice(start, end).search(END);
    if (stop >= 0) end = start + stop;
    const text = textOf(html.slice(start, end));
    const key = anchor[1];
    sections[key] = key in sections ? `${sections[key]} ${text}`.trim() : text;
  });
  return sections;
}

/**
 * sha256 (hex) of each section's text.
 * @param {Record<string, string>} sections
 * @returns {Promise<Record<string, string>>}
 */
export async function hashSections(sections) {
  /** @type {Record<string, string>} */
  const hashes = {};
  for (const [key, text] of Object.entries(sections)) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    hashes[key] = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return hashes;
}

/**
 * "5.1.1(v)" → "5.1.1", "2.1(a)" → "2.1".
 * @param {string} guideline
 */
export function sectionFor(guideline) {
  return guideline.trim().match(/^\d+(?:\.\d+)*/)?.[0] ?? guideline.trim();
}

/** @param {string} isoDate "2026-11-14" → "14 November 2026" */
export function longDate(isoDate) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** @param {Date} date @param {string | undefined} timeZone */
function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
}

/**
 * The note under a run's heading, as text pieces and guideline links, so the page and the saved copy say the same.
 * `timeZone` undefined means the reader's own time zone.
 * @param {{ checkedAt: string, status: "unchanged" | "changed" | "unreachable", snapshotDate: string, changed: string[] }} check
 * @param {{ timeZone?: string, now?: Date }} [options]
 * @returns {Array<string | { text: string, href: string }>}
 */
export function guidelinesNoteParts(check, options = {}) {
  const ourDate = longDate(check.snapshotDate);
  if (check.status === "unreachable") {
    return [`We could not reach Apple's guidelines page just now, so these checks use our copy from ${ourDate}.`];
  }
  if (check.status === "changed" && check.changed.length > 0) {
    const numbers = [...check.changed].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    /** @type {Array<string | { text: string, href: string }>} */
    const parts = [numbers.length === 1 ? "Apple has changed guideline " : "Apple has changed guidelines "];
    numbers.forEach((n, i) => {
      if (i > 0) parts.push(i === numbers.length - 1 ? " and " : ", ");
      parts.push({ text: n, href: `${GUIDELINES_URL}#${n}` });
    });
    parts.push(
      ` since we wrote our checks (${ourDate}). ${numbers.length === 1 ? "Read that section" : "Read those sections"} before you rely on this review.`,
    );
    return parts;
  }
  const checked = new Date(check.checkedAt);
  const now = options.now ?? new Date();
  const { timeZone } = options;
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(checked);
  const when =
    dayKey(checked, timeZone) === dayKey(now, timeZone)
      ? `at ${time} today`
      : `at ${time} on ${longDate(dayKey(checked, timeZone))}`;
  return [
    `Apple's App Review Guidelines were read again ${when}. The sections behind these checks have not changed since we wrote the checks (${ourDate}).`,
  ];
}

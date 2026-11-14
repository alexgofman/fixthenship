import entries from "./content/decoder.json" with { type: "json" };

/** One guideline from Apple's rejection messages, explained for people who have never read the guidelines. */
export type DecoderEntry = {
  guideline: string;
  appleCallsIt: string;
  plain: string;
  usuallyMeans: string;
  whatToDo: string;
  /** The rule ids of our checks for this guideline, comma-separated ("R6" or "R1, R2"), or "" when we have none. */
  ourCheck: string;
};

/** `fellBack` is true when the entry is for a parent of the asked number (5.1.1 for 5.1.1(v)). */
export type Decoded = DecoderEntry & { fellBack: boolean };

export const REJECTION_TEXT_MAX = 6000;

const ENTRIES = entries as DecoderEntry[];

const NUMBER = String.raw`\d+(?:\.\d+)+(?:\s?\((?:[a-z]|[ivx]+)\))?`;
const SEPARATOR = String.raw`\s*(?:,\s*(?:(?:and|or)\s+)?|&|\/|\band\b|\bor\b)\s*`;
const AFTER_WORD = new RegExp(String.raw`\bguidelines?\s*[:#]?\s*(${NUMBER}(?:${SEPARATOR}${NUMBER})*)`, "gi");
const ONE_NUMBER = new RegExp(NUMBER, "gi");

function normalize(number: string): string {
  return number.replace(/\s+/g, "").toLowerCase();
}

/** The guideline numbers named after the word "Guideline(s)", in the order they appear, without repeats. */
export function findGuidelines(text: string): string[] {
  const found: string[] = [];
  for (const list of text.matchAll(AFTER_WORD)) {
    for (const n of list[1].matchAll(ONE_NUMBER)) {
      const number = normalize(n[0]);
      if (!found.includes(number)) found.push(number);
    }
  }
  return found;
}

/** The rule ids named in `ourCheck`, in order; none when the entry has no check. */
export function ourChecks(entry: Pick<DecoderEntry, "ourCheck">): string[] {
  return entry.ourCheck
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** 5.1.1(v) → 5.1.1 → 5.1; a two-part number has no parent. */
function parentOf(number: string): string | undefined {
  if (number.endsWith(")")) return number.replace(/\([^)]*\)$/, "");
  const parts = number.split(".");
  return parts.length > 2 ? parts.slice(0, -1).join(".") : undefined;
}

/** Apple writes the design rule 4 as "4.0"; both name the same entry. */
function entryKey(number: string): string {
  return normalize(number).replace(/^(\d+)\.0$/, "$1");
}

export function decode(number: string): Decoded | undefined {
  const asked = entryKey(number);
  for (let n: string | undefined = asked; n; n = parentOf(n)) {
    const entry = ENTRIES.find((e) => entryKey(e.guideline) === n);
    if (entry) return { ...entry, fellBack: n !== asked };
  }
  return undefined;
}

/**
 * Apple's message as stored: line ends as the textarea counts them (a submitted form sends CRLF), trimmed and
 * cut at REJECTION_TEXT_MAX characters. Anything but text is dropped.
 */
export function cleanRejectionText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text.replace(/\r\n?/g, "\n").trim().slice(0, REJECTION_TEXT_MAX);
}

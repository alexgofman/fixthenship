// Usage: npm run snapshot:guidelines
// Reads Apple's App Review Guidelines and writes lib/content/guidelines-snapshot.json, the copy our checks were
// written against. Run it again only after the checks have been brought up to date with Apple's page.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDELINES_URL, hashSections, parseSections } from "../lib/guidelines/sections.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "lib", "content", "guidelines-snapshot.json");
const MIN_SECTIONS = 60;

const res = await fetch(GUIDELINES_URL, { signal: AbortSignal.timeout(30_000), credentials: "omit" });
if (res.status !== 200) throw new Error(`${GUIDELINES_URL} answered HTTP ${res.status}`);
const sections = parseSections(await res.text());
const count = Object.keys(sections).length;
if (count < MIN_SECTIONS) throw new Error(`Only ${count} numbered sections found; the page may be blocked or redesigned.`);

const snapshot = { takenAt: new Date().toISOString().slice(0, 10), source: GUIDELINES_URL, sections: await hashSections(sections) };
await writeFile(OUT, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
console.log(`Wrote ${path.relative(ROOT, OUT)}: ${count} sections.`);

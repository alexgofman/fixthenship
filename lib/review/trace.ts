import type { CheckStep } from "../types";

function clean(text: string): string {
  return text
    .replace(/\s+—\s+`[^`]*:\d+`\s*$/, "")
    .replace(/\s+—\s+\*\*[A-Z_]+\*\*\s*$/, "")
    .replace(/\s+\((?:[\d.]+m?s)(?:,[^)]*)?\)/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const match = flat.match(/^.*?[.!?](?=\s|$)/);
  const sentence = (match ? match[0] : flat).trim();
  return sentence.length > 300 ? `${sentence.slice(0, 297)}...` : sentence;
}

/** Reads the numbered steps under "## Steps" of an e2e trace.md. */
export function parseSteps(trace: string): CheckStep[] {
  const section = trace.split(/^## Steps\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const steps: CheckStep[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\d+\.\s+(✓|✗)\s+(.*)$/);
    if (m) steps.push({ ok: m[1] === "✓", text: clean(m[2]) });
  }
  return steps;
}

/** One sentence that says why the check ended the way it did. */
export function traceReason(trace: string, passed: boolean): string {
  if (!passed) {
    const failure = trace.match(/^\*\*([A-Z_]+)\*\*\s*\n+```text\n([\s\S]*?)\n```/m);
    if (failure) {
      const lines = failure[2].split("\n").map((l) => l.trim()).filter(Boolean);
      const generic = /^[\w.]+ failed$/.test(lines[0] ?? "");
      const body = generic && lines.length > 1 ? lines.slice(1).join("; ") : lines.join(" ");
      return firstSentence(`${failure[1]}: ${body}`);
    }
  }
  const steps = parseSteps(trace);
  const last = [...steps].reverse().find((s) => s.ok === passed) ?? steps.at(-1);
  if (!last) return passed ? "The check passed." : "The check failed.";
  return firstSentence(`${passed ? "Passed" : "Failed"} at ${last.text}.`);
}

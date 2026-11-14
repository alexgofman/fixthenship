import { codeEvidence, makeFinding, quote, type RuleCheck } from "../finding";
import { isMarkup, lineOf, uniqueLines, type Hit } from "../match";
import type { SourceFile } from "../files";

/** `onClick={() => {}}`, `onClick={function () {}}` and the like: a handler that does nothing. */
const EMPTY_HANDLER = /\bon[A-Z]\w*\s*=\s*\{\s*(?:\(\s*\w*\s*\)\s*=>|function\s*\(\s*\w*\s*\))\s*\{\s*\}\s*\}/g;
const DEAD_HREF = /^\s*href\s*=\s*\{?\s*["'`](?:#|javascript:\s*(?:void\s*\(\s*0\s*\))?;?)["'`]\s*\}?\s*$/;
const HANDLER_ATTR = /\bon[A-Z]\w*\s*=|\{\s*\.\.\.|\basChild\b|\bform\s*=|\bformAction\s*=/;
const TYPE_ATTR = /\btype\s*=\s*\{?\s*["'`](\w+)["'`]/;
/** Code ending in an opening tag with `asChild`, such as `<DialogTrigger asChild>`, which hands its handler to the child. */
const AS_CHILD_PARENT = /<[A-Za-z][\w.]*\b[^<>]*\basChild\b[^<>]*>\s*$/;

/** Each opening `<a>`, `<button>` or `<Button>` tag with its attributes, braces included. */
function openingTags(code: string): { name: string; attrs: string; index: number }[] {
  const tags: { name: string; attrs: string; index: number }[] = [];
  for (const m of code.matchAll(/<(a|button|Button)(?=[\s>/])/g)) {
    let depth = 0;
    let quoteChar = "";
    let end = -1;
    for (let i = m.index + m[0].length; i < code.length; i++) {
      const c = code[i];
      if (quoteChar) {
        if (c === quoteChar) quoteChar = "";
      } else if (c === '"' || c === "'" || c === "`") {
        quoteChar = c;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
      } else if (c === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) continue;
    tags.push({ name: m[1], attrs: code.slice(m.index + m[0].length, end).replace(/\/\s*$/, ""), index: m.index });
  }
  return tags;
}

function attrValues(attrs: string, name: string): string[] {
  return [...attrs.matchAll(new RegExp(`\\b${name}\\s*=\\s*(\\{[^{}]*\\}|"[^"]*"|'[^']*')`, "g"))].map((m) => m[0]);
}

function deadControls(file: SourceFile): Hit[] {
  const hits: Hit[] = [];
  for (const m of file.code.matchAll(EMPTY_HANDLER)) {
    hits.push({ file: file.path, line: lineOf(file.code, m.index), match: m[0] });
  }
  for (const tag of openingTags(file.code)) {
    const hit = (match: string) => hits.push({ file: file.path, line: lineOf(file.code, tag.index), match });
    if (AS_CHILD_PARENT.test(file.code.slice(Math.max(0, tag.index - 300), tag.index))) continue;
    if (tag.name === "a") {
      const href = attrValues(tag.attrs, "href").find((h) => DEAD_HREF.test(h));
      if (href && !HANDLER_ATTR.test(tag.attrs)) hit(href);
      continue;
    }
    // A button without a type submits the form it sits in, which may be in a parent component; only an explicit
    // type="button" without a handler is certainly dead.
    const type = tag.attrs.match(TYPE_ATTR)?.[1];
    if (type === "button" && !HANDLER_ATTR.test(tag.attrs)) hit(`<${tag.name}${tag.attrs.replace(/\s+/g, " ")}>`);
  }
  return hits;
}

export const deadButtons: RuleCheck = (files) => {
  const hits = uniqueLines(files.filter(isMarkup).flatMap(deadControls)).sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  if (hits.length === 0) return null;
  const count = hits.length === 1 ? "a button or link" : `${hits.length} buttons or links`;
  return makeFinding(
    "R3",
    "medium",
    `The app has ${count} that do nothing when pressed, such as ${quote(hits[0].match)}, and a reviewer would likely reject the app for dead buttons or broken links.`,
    hits.map((h) => codeEvidence(h, `Control that does nothing: ${quote(h.match)}`)),
  );
};

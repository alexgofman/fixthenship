import type { SourceFile } from "./files";

export type Hit = { file: string; line: number; match: string };
export type FileFilter = (file: SourceFile) => boolean;

export const notDoc: FileFilter = (f) => !f.isDoc;
export const isCode: FileFilter = (f) => ["ts", "tsx", "js", "jsx", "html"].includes(f.ext);
export const isMarkup: FileFilter = (f) => ["tsx", "jsx", "html"].includes(f.ext);

export function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function global(re: RegExp): RegExp {
  return re.flags.includes("g") ? new RegExp(re.source, re.flags) : new RegExp(re.source, re.flags + "g");
}

/** Every match of `re` in the comment-free code of the files that pass `include`, one per line. */
export function findAll(files: SourceFile[], re: RegExp, include: FileFilter = notDoc): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    if (!include(file)) continue;
    for (const m of file.code.matchAll(global(re))) {
      hits.push({ file: file.path, line: lineOf(file.code, m.index), match: m[0].trim() });
    }
  }
  return uniqueLines(hits);
}

export function uniqueLines(hits: Hit[]): Hit[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.file}:${h.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Text that ends up on screen: JSX/HTML text nodes, or the whole body of app markdown. */
export function textNodes(file: SourceFile): { index: number; text: string }[] {
  if (file.ext === "md") return file.isDoc ? [] : [{ index: 0, text: file.code }];
  if (!isMarkup(file)) return [];
  const code =
    file.ext === "html"
      ? file.code.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, (s) => s.replace(/[^\n]/g, " "))
      : file.code;
  const nodes: { index: number; text: string }[] = [];
  for (const m of code.matchAll(/(?<![=-])>([^<>]+)</g)) {
    const text = m[1].replace(/\{[^{}]*\}/g, (s) => " ".repeat(s.length));
    if (/[{}]/.test(text) || !text.trim()) continue;
    nodes.push({ index: m.index + 1, text });
  }
  return nodes;
}

export function findInText(files: SourceFile[], re: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    for (const node of textNodes(file)) {
      for (const m of node.text.matchAll(global(re))) {
        hits.push({ file: file.path, line: lineOf(file.code, node.index + m.index), match: m[0] });
      }
    }
  }
  return uniqueLines(hits);
}

const ROUTE_VALUES = [
  /["'`](\/[^"'`\s]*|[\w./-]*\.html?)["'`]/g,
  /\b(?:path|to|href)\s*[:=]\s*\{?\s*["'`]([^"'`]*)["'`]/g,
];
const LINK_TEXT = /<(a|Link|NavLink|button)\b[^>]*>([\s\S]*?)<\/\1\s*>/g;
const MD_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

export type PageMatcher = {
  /** Matched against file paths and route or link targets. */
  name: RegExp;
  /** Matched against the visible text of links and buttons. */
  text: RegExp;
};

/** True when any app file is named after the page, or any route or link points to or mentions it. */
export function hasPageOrLink(files: SourceFile[], page: PageMatcher): boolean {
  for (const file of files) {
    if (file.isDoc) continue;
    if (page.name.test(file.path)) return true;
    for (const re of ROUTE_VALUES) {
      for (const m of file.code.matchAll(re)) if (page.name.test(m[1])) return true;
    }
    for (const m of file.code.matchAll(LINK_TEXT)) {
      if (page.text.test(m[2].replace(/<[^>]*>|\{[^{}]*\}/g, " "))) return true;
    }
    if (file.ext === "md") {
      for (const m of file.code.matchAll(MD_LINK)) if (page.text.test(m[1]) || page.name.test(m[2])) return true;
    }
  }
  return false;
}

export const SIGN_UP_CALL = /\b(?:signUp|signup|createUser\w*|registerUser)\s*\(|<SignUp\b/g;

const ENTRY_FILES = [
  "index.html",
  "src/App.tsx",
  "src/App.jsx",
  "app/layout.tsx",
  "app/layout.jsx",
  "app/page.tsx",
  "app/page.jsx",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "pages/_app.tsx",
  "pages/index.tsx",
  "src/main.tsx",
  "src/main.jsx",
];

/** The app's entry file, line 1; used when nothing more specific proves a page is needed. */
export function entryHit(files: SourceFile[]): Hit | undefined {
  const file =
    ENTRY_FILES.map((p) => files.find((f) => f.path === p)).find(Boolean) ??
    files.find(isMarkup) ??
    files.find(isCode);
  return file && { file: file.path, line: 1, match: "" };
}

/** The first footer or nav, where a reviewer would look for a link. */
export function layoutHit(files: SourceFile[]): Hit | undefined {
  return findAll(files, /<(?:footer|nav)\b/i, isMarkup)[0];
}

export function hasAppCode(files: SourceFile[]): boolean {
  return files.some(isCode);
}

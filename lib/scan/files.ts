import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "html", "json", "md"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", "coverage"]);
const LOCK_FILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "deno.lock",
]);
const MAX_BYTES = 1_000_000;
/** Markdown inside these folders is treated as app content; anywhere else it is documentation. */
const CONTENT_DIRS = new Set(["src", "app", "pages", "content", "public", "posts", "blog"]);

export type SourceFile = {
  /** Relative to the repo root, with forward slashes. */
  path: string;
  ext: string;
  text: string;
  /** `text` with comments blanked out; same length and line numbers. */
  code: string;
  /** README-style markdown that users never see in the app. */
  isDoc: boolean;
};

export async function readSourceFiles(repoDir: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  await walk(repoDir, "", files);
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function walk(root: string, rel: string, out: SourceFile[]): Promise<void> {
  const entries = await readdir(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(root, childRel, out);
      continue;
    }
    if (!entry.isFile() || LOCK_FILES.has(entry.name) || entry.name.endsWith(".min.js")) continue;
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    const abs = path.join(root, childRel);
    if ((await stat(abs)).size > MAX_BYTES) continue;
    const text = await readFile(abs, "utf8");
    out.push({
      path: childRel,
      ext,
      text,
      code: stripComments(text, ext),
      isDoc: ext === "md" && !childRel.split("/").slice(0, -1).some((dir) => CONTENT_DIRS.has(dir)),
    });
  }
}

const blank = (s: string) => s.replace(/[^\n]/g, " ");

export function stripComments(text: string, ext: string): string {
  if (ext === "json") return text;
  if (ext === "md" || ext === "html") return text.replace(/<!--[\s\S]*?-->/g, blank);
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\])(\/\/[^\n]*)/gm, (_, before: string, comment: string) => before + blank(comment));
}

import { codeEvidence, makeFinding, quote, type RuleCheck } from "../finding";
import { findAll, isCode, isMarkup, uniqueLines, type FileFilter } from "../match";

/** Wording a user or reviewer can read: default titles and "made with" lines. */
const VISIBLE_TEXT =
  /Edit with Lovable|Lovable App|Lovable Generated Project|(?:Made|Built) with (?:Lovable|Bolt|v0)/gi;

/** A builder's address only counts where it reaches the page: markup and its metadata (a preview image, a badge script). */
const BUILDER_ADDRESS = /lovable\.dev|lovable\.app|gpt-?engineer|bolt\.new/gi;

/** The builder's own client code is plumbing nobody sees; so are package names, which are not code files. */
const notPlumbing: FileFilter = (f) => !/(^|\/)integrations\//.test(f.path);

export const builderBranding: RuleCheck = (files) => {
  const hits = uniqueLines([
    ...findAll(files, VISIBLE_TEXT, (f) => isCode(f) && notPlumbing(f)),
    ...findAll(files, BUILDER_ADDRESS, (f) => isMarkup(f) && notPlumbing(f)),
  ]);
  if (hits.length === 0) return null;
  return makeFinding(
    "R10",
    "high",
    `The app still carries app-builder branding such as ${quote(hits[0].match)}, which a reviewer would likely flag as template or builder branding.`,
    hits.map((h) => codeEvidence(h, `Builder marker ${quote(h.match)}`)),
  );
};

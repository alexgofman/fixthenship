import { codeEvidence, makeFinding, quote, type RuleCheck } from "../finding";
import { findAll, findInText, uniqueLines } from "../match";

const ANYWHERE = /lorem ipsum|coming soon/gi;
const IN_VISIBLE_TEXT = /\bTODO\b|\b(?:placeholder|Placeholder|PLACEHOLDER)\b/g;

export const placeholderContent: RuleCheck = (files) => {
  const hits = uniqueLines([
    ...findAll(files.filter((f) => !f.path.endsWith("package.json")), ANYWHERE),
    ...findInText(files, IN_VISIBLE_TEXT),
  ]);
  if (hits.length === 0) return null;
  return makeFinding(
    "R2",
    "medium",
    `Placeholder text such as ${quote(hits[0].match)} is shown to users in ${hits.length} place${hits.length === 1 ? "" : "s"}, which a reviewer would likely treat as an unfinished app.`,
    hits.map((h) => codeEvidence(h, `Placeholder text ${quote(h.match)}`)),
  );
};

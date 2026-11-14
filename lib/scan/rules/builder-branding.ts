import { codeEvidence, makeFinding, quote, type RuleCheck } from "../finding";
import { findAll } from "../match";

const BUILDER_MARKERS =
  /lovable-tagger|componentTagger|Edit with Lovable|lovable\.dev|lovable\.app|gpt-?engineer|Lovable App|Lovable Generated Project|(?:Made|Built) with (?:Lovable|Bolt|v0)|bolt\.new/gi;

export const builderBranding: RuleCheck = (files) => {
  const hits = findAll(files, BUILDER_MARKERS);
  if (hits.length === 0) return null;
  return makeFinding(
    "R10",
    "high",
    `The app still carries app-builder branding such as ${quote(hits[0].match)}, which a reviewer would likely flag as template or builder branding.`,
    hits.map((h) => codeEvidence(h, `Builder marker ${quote(h.match)}`)),
  );
};

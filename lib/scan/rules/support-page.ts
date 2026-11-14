import { codeEvidence, makeFinding, type RuleCheck } from "../finding";
import { entryHit, hasAppCode, hasPageOrLink, layoutHit } from "../match";

const SUPPORT = {
  name: /support(?!ed|s\b)|contact|help(?!er)|mailto:/i,
  text: /\b(?:support|contact|help)\b/i,
};

export const supportPage: RuleCheck = (files) => {
  if (!hasAppCode(files) || hasPageOrLink(files, SUPPORT)) return null;
  const layout = layoutHit(files);
  const evidence = layout
    ? codeEvidence(layout, "Footer and navigation have no support or contact link")
    : codeEvidence(entryHit(files)!, "App entry; no support, contact or help route, page or link exists");
  return makeFinding(
    "R9",
    "medium",
    "No support, contact or help route, page or link was found, and a reviewer would likely object that users have no way to get help.",
    [evidence],
  );
};

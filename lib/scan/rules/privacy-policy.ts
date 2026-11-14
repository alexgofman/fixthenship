import { codeEvidence, makeFinding, type RuleCheck } from "../finding";
import { entryHit, findAll, hasAppCode, hasPageOrLink, isCode, isMarkup, layoutHit, SIGN_UP_CALL } from "../match";

const PRIVACY = { name: /privacy/i, text: /privacy/i };
const COLLECTS_INPUT = /<form\b|<input\b|type=["']email["']/gi;

export const privacyPolicy: RuleCheck = (files) => {
  if (!hasAppCode(files) || hasPageOrLink(files, PRIVACY)) return null;
  const signUp = findAll(files, SIGN_UP_CALL, isCode)[0];
  const input = findAll(files, COLLECTS_INPUT, isMarkup)[0];
  const layout = layoutHit(files);
  const evidence = signUp
    ? codeEvidence(signUp, "Sign-up collects personal data, but no privacy policy is linked")
    : input
      ? codeEvidence(input, "Form collects user input, but no privacy policy is linked")
      : layout
        ? codeEvidence(layout, "Footer and navigation have no privacy policy link")
        : codeEvidence(entryHit(files)!, "App entry; no privacy policy route, page or link exists");
  return makeFinding(
    "R5",
    "medium",
    "No route, page or link to a privacy policy was found in the app, and a reviewer would likely reject an app whose privacy policy cannot be reached from inside it.",
    [evidence],
  );
};

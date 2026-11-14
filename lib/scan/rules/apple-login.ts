import { codeEvidence, makeFinding, quote, type RuleCheck } from "../finding";
import { findAll } from "../match";

const THIRD_PARTY_LOGIN = new RegExp(
  [
    /provider\s*:\s*["'`](?:google|facebook)["'`]/,
    /\b(?:Google|Facebook)(?:Auth)?Provider\b/,
    /signInWith(?:Google|Facebook)/,
    /@react-oauth\/google|react-facebook-login|(?:next-auth|@auth\/core)\/providers\/(?:google|facebook)/,
    /(?:sign|log)\s*in with (?:google|facebook)|continue with (?:google|facebook)/,
  ]
    .map((re) => re.source)
    .join("|"),
  "gi",
);
/** "apple-touch-icon" and "apple-mobile-web-app-*" are web metadata, not a login option. */
const APPLE = /apple(?![-_]?(?:touch|mobile))/i;

export const appleLogin: RuleCheck = (files) => {
  const logins = findAll(files, THIRD_PARTY_LOGIN);
  if (logins.length === 0 || findAll(files, APPLE).length > 0) return null;
  const providers = [...new Set(logins.map((h) => (/facebook/i.test(h.match) ? "Facebook" : "Google")))];
  const offered = providers.join(" and ");
  return makeFinding(
    "R7",
    "high",
    `The app offers ${offered} sign-in but no Sign in with Apple option, and a reviewer would likely reject third-party login without an equivalent Apple option.`,
    logins.map((h) => codeEvidence(h, `${offered} sign-in ${quote(h.match)} without Apple`)),
    "Create a Services ID and key for Sign in with Apple in your Apple Developer account, then add them to the auth settings.",
  );
};

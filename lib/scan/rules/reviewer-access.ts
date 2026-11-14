import { codeEvidence, makeFinding, quote, type RuleCheck } from "../finding";
import type { SourceFile } from "../files";
import { findAll, isCode, SIGN_UP_CALL, type Hit } from "../match";

const OAUTH_SIGN_IN = new RegExp(
  [
    /signInWithOAuth\s*\(/,
    /signInWith(?:Popup|Redirect)\s*\(/,
    /\bsignIn\s*\(\s*["'`](?:google|github|facebook|apple|twitter|discord|microsoft|azure-ad|gitlab|linkedin)["'`]/,
    /<GoogleLogin\b|useGoogleLogin\s*\(/,
    /loginWithRedirect\s*\(|loginWithPopup\s*\(/,
  ]
    .map((re) => re.source)
    .join("|"),
  "g",
);

/** Any way in with an email address: password sign-up or sign-in, magic link, one-time code or a credentials provider. */
const EMAIL_SIGN_IN = new RegExp(
  [
    SIGN_UP_CALL,
    /signInWithPassword|(?:create|signIn)UserWithEmailAndPassword|signInWithEmailAndPassword|signInWithOtp|sendSignInLinkToEmail/,
    /\bsignIn\s*\(\s*["'`](?:credentials|email|resend|nodemailer)["'`]/,
    /\bCredentials(?:Provider)?\s*\(/,
    /type\s*=\s*\{?\s*["'`]password["'`]/,
    /<SignUp\b|<SignIn\b/,
  ]
    .map((re) => re.source)
    .join("|"),
  "g",
);

const AUTH_PAGE = /log-?in|sign-?in|sign-?up|register|auth|callback/i;
const GUARD_NAME = /\b\w*(?:Protected|Private|RequireAuth|AuthGuard|RequireUser|Authenticated|AuthRequired)\w*\b/;

/** `if (!user) return <Login />`, `session ? <App /> : <SignIn />` or a redirect to sign-in in the root component. */
const ROOT_GATE = new RegExp(
  [
    /if\s*\(\s*!\s*(?:user|session|currentUser|isAuthenticated|isLoggedIn|isSignedIn|authed|auth\.user)\b[^)]*\)\s*\{?\s*return\s*\(?\s*<\w*(?:Login|LogIn|SignIn|Signin|Auth)\w*/,
    /\b(?:user|session|currentUser|isAuthenticated|isLoggedIn|isSignedIn|authed)\s*\?[^:;]{0,300}:\s*\(?\s*<\w*(?:Login|LogIn|SignIn|Signin|Auth)\w*/,
    /if\s*\(\s*!\s*(?:user|session|currentUser|isAuthenticated|isLoggedIn|isSignedIn)\b[^)]*\)\s*\{?\s*(?:return\s+)?redirect\s*\(\s*["'`]\/(?:login|log-in|signin|sign-in|auth)/,
    /<RedirectToSignIn\b/,
  ]
    .map((re) => re.source)
    .join("|"),
  "g",
);
const ROOT_FILE = /^(?:src\/)?(?:App\.[jt]sx?|main\.[jt]sx?|app\/layout\.[jt]sx?|app\/\([^/]+\)\/layout\.[jt]sx?|pages\/_app\.[jt]sx?)$/;

/** A Next.js middleware or proxy that sends every visitor without a session to sign-in. */
const EDGE_FILE = /^(?:src\/)?(?:middleware|proxy)\.[jt]s$/;
const EDGE_REDIRECT = /redirect\s*\([^)]*["'`]\/(?:login|log-in|signin|sign-in|auth)|\.protect\s*\(/g;
const PUBLIC_LIST = /public|isPublic|ignoredRoutes/i;

type RouteTag = { start: number; end: number; selfClosing: boolean; attrs: string };

function routeTags(code: string): RouteTag[] {
  const tags: RouteTag[] = [];
  for (const m of code.matchAll(/<Route(?=[\s>/])/g)) {
    let depth = 0;
    for (let i = m.index + m[0].length; i < code.length; i++) {
      const c = code[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        const attrs = code.slice(m.index + m[0].length, i);
        tags.push({ start: m.index, end: i, selfClosing: attrs.trimEnd().endsWith("/"), attrs });
        break;
      }
    }
  }
  return tags;
}

/** True when every react-router route except sign-in pages sits behind a guard element. */
function everyRouteGuarded(file: SourceFile): Hit | null {
  const tags = routeTags(file.code);
  if (tags.length === 0) return null;
  const closes = [...file.code.matchAll(/<\/Route\s*>/g)].map((m) => m.index);
  const events = [
    ...tags.map((t) => ({ at: t.start, tag: t as RouteTag | null })),
    ...closes.map((at) => ({ at, tag: null as RouteTag | null })),
  ].sort((a, b) => a.at - b.at);

  const stack: boolean[] = [];
  let guard: RouteTag | null = null;
  let pages = 0;
  for (const { tag } of events) {
    if (!tag) {
      stack.pop();
      continue;
    }
    const isGuard = GUARD_NAME.test(tag.attrs);
    const inside = stack.includes(true);
    if (isGuard) guard ??= tag;
    const path = tag.attrs.match(/\bpath\s*=\s*\{?\s*["'`]([^"'`]*)["'`]/)?.[1];
    const isPage = (path !== undefined && path !== "*") || /\bindex\b/.test(tag.attrs);
    if (isPage && !isGuard && !inside && !AUTH_PAGE.test(path ?? "") && !AUTH_PAGE.test(tag.attrs)) return null;
    if (isPage && !AUTH_PAGE.test(path ?? "")) pages++;
    if (!tag.selfClosing) stack.push(isGuard);
  }
  if (!guard || pages === 0) return null;
  return { file: file.path, line: file.code.slice(0, guard.start).split("\n").length, match: "<Route" + guard.attrs };
}

function authGuard(files: SourceFile[]): Hit | null {
  for (const file of files) {
    if (!isCode(file)) continue;
    if (ROOT_FILE.test(file.path)) {
      const gate = findAll([file], ROOT_GATE, isCode)[0];
      if (gate) return gate;
    }
    if (EDGE_FILE.test(file.path) && !PUBLIC_LIST.test(file.code)) {
      const edge = findAll([file], EDGE_REDIRECT, isCode)[0];
      if (edge) return edge;
    }
    const routes = everyRouteGuarded(file);
    if (routes) return routes;
  }
  return null;
}

export const reviewerAccess: RuleCheck = (files) => {
  const oauth = findAll(files, OAUTH_SIGN_IN, isCode);
  if (oauth.length === 0 || findAll(files, EMAIL_SIGN_IN, isCode).length > 0) return null;
  const guard = authGuard(files);
  if (!guard) return null;
  return makeFinding(
    "R4",
    "medium",
    "Every screen needs an account and the only way to sign in is a third-party login, so a reviewer likely cannot get in without a demo account or email sign-up.",
    [
      codeEvidence(guard, `Sign-in required before any screen: ${quote(guard.match)}`),
      ...oauth.map((h) => codeEvidence(h, `Third-party sign-in only: ${quote(h.match)}`)),
    ],
    "Add a demo account for the reviewer and put its email and password in the App Review notes in App Store Connect.",
  );
};

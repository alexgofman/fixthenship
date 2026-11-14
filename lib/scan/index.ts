import type { Finding } from "../types";
import type { RuleCheck } from "./finding";
import { readSourceFiles } from "./files";
import { accountDeletion } from "./rules/account-deletion";
import { appleLogin } from "./rules/apple-login";
import { builderBranding } from "./rules/builder-branding";
import { outsideCheckout } from "./rules/outside-checkout";
import { placeholderContent } from "./rules/placeholder-content";
import { privacyPolicy } from "./rules/privacy-policy";
import { supportPage } from "./rules/support-page";

const CHECKS: RuleCheck[] = [
  placeholderContent,
  privacyPolicy,
  accountDeletion,
  appleLogin,
  outsideCheckout,
  supportPage,
  builderBranding,
];

/** Reads the app's source files and returns one failing Finding per rule that is likely broken. */
export async function scanRepo(repoDir: string): Promise<Finding[]> {
  const files = await readSourceFiles(repoDir);
  return CHECKS.map((check) => check(files)).filter((f): f is Finding => f !== null);
}

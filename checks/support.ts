import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isAgentError, secrets, type Agent } from "e2e";
import { z } from "zod";

/** No single step may use up the whole check: a step that wanders this long has not found what it was looking for. */
export const STEP_LIMIT_MS = 45_000;

/** Tells the runner this check could not be performed; the reason is shown to the user. */
export function markNotChecked(reason: string): void {
  const dir = process.env.CHECK_OUT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "not_checked.txt"), reason.trim() + "\n", "utf8");
}

export function testEmail(): string {
  return process.env.TEST_EMAIL || `fts.reviewer.${randomBytes(16).toString("hex")}@${process.env.TEST_EMAIL_DOMAIN ?? "mailinator.com"}`;
}

function explain(error: unknown): string {
  if (isAgentError(error)) return error.explanation;
  return error instanceof Error ? error.message : String(error);
}

/** What the account-based checks get back when the app has no accounts to sign up for. */
export const NO_ACCOUNTS = "The app has no accounts.";

/**
 * Whether the app has user accounts, judged from the screen it is on (call it on the first screen).
 * Many small apps have none, and then there is nothing to sign up for, delete or find in a settings screen.
 */
export async function hasAccounts(agent: Agent): Promise<boolean> {
  try {
    const seen = await agent.extract(
      "whether this app has user accounts, judged from this screen and its menus: 'yes' when it shows any way to sign in, log in, sign up, register, get started with an account, or open a profile or account; 'no' only when the app is clearly used without any account and no such option is shown anywhere on this screen. When in doubt, answer 'yes'.",
      { schema: z.object({ accounts: z.enum(["yes", "no"]), note: z.string() }) },
    );
    return seen.accounts === "yes";
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    return true;
  }
}

/**
 * Signs up with the test email and password from the first screen.
 * Returns null when the new account is signed in, otherwise why sign-up was impossible.
 */
export async function signUp(agent: Agent): Promise<string | null> {
  try {
    await agent.act(
      "Open the screen where a new user creates an account (sign up, register, create account or get started). Do not fill anything in yet.",
      { timeout: STEP_LIMIT_MS },
    );
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    return `No sign-up screen was found: ${explain(error)}`;
  }

  // A question the screen cannot answer is "could not tell", never a finding against the app.
  try {
    const form = await agent.extract(
      "whether this screen lets a new user sign up with an email address and a password",
      { schema: z.object({ emailSignup: z.boolean(), note: z.string() }) },
    );
    if (!form.emailSignup) return `The app offers no sign-up with email and password: ${form.note}`;
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    return `It was not clear whether the app offers sign-up with email and password: ${explain(error)}`;
  }

  try {
    await agent.act(
      "Sign up with the email {email} and the password {password}. Accept any required terms and submit the form.",
      { params: { email: testEmail(), password: secrets.get("testPassword") }, timeout: STEP_LIMIT_MS },
    );
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    return `Sign-up could not be completed: ${explain(error)}`;
  }

  try {
    // Asked about what is on the screen now, which is always there to read; "what happened" is not.
    const after = await agent.extract(
      "the state of the app right after the sign-up form was submitted, judged from this screen: 'signed_in' when the sign-up form is gone and the app shows its own screens (a home screen, a dashboard, settings, a welcome or onboarding step, or a sign-out option); 'email_confirmation_required' when it asks the user to confirm or verify the email address before going on; 'still_on_form' when the sign-up form is still shown without an error; 'error' when an error message about the sign-up is shown",
      {
        schema: z.object({
          outcome: z.enum(["signed_in", "email_confirmation_required", "still_on_form", "error"]),
          message: z.string(),
        }),
      },
    );
    if (after.outcome === "email_confirmation_required") {
      return "Sign-up requires confirming the email address, so the reviewer account could not be used.";
    }
    if (after.outcome === "still_on_form") return "Sign-up could not be completed: the form was still shown after it was submitted.";
    if (after.outcome === "error") return `Sign-up failed: ${after.message}`;
    return null;
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    return `It was not clear whether sign-up worked: ${explain(error)}`;
  }
}

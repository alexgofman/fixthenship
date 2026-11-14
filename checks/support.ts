import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isAgentError, secrets, type Agent } from "e2e";
import { z } from "zod";

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

/**
 * Signs up with the test email and password from the first screen.
 * Returns null when the new account is signed in, otherwise why sign-up was impossible.
 */
export async function signUp(agent: Agent): Promise<string | null> {
  try {
    await agent.act(
      "Open the screen where a new user creates an account (sign up, register, create account or get started). Do not fill anything in yet.",
    );
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    return `No sign-up screen was found: ${explain(error)}`;
  }

  const form = await agent.extract(
    "whether this screen lets a new user sign up with an email address and a password",
    { schema: z.object({ emailSignup: z.boolean(), note: z.string() }) },
  );
  if (!form.emailSignup) return `The app offers no sign-up with email and password: ${form.note}`;

  try {
    await agent.act(
      "Sign up with the email {email} and the password {password}. Accept any required terms and submit the form.",
      { params: { email: testEmail(), password: secrets.get("testPassword") } },
    );
  } catch (error) {
    if (isAgentError(error) && error.code.startsWith("MODEL_")) throw error;
    return `Sign-up could not be completed: ${explain(error)}`;
  }

  const after = await agent.extract("what happened after the sign-up form was submitted", {
    schema: z.object({
      outcome: z.enum(["signed_in", "email_confirmation_required", "error"]),
      message: z.string(),
    }),
  });
  if (after.outcome === "email_confirmation_required") {
    return "Sign-up requires confirming the email address, so the reviewer account could not be used.";
  }
  if (after.outcome === "error") return `Sign-up failed: ${after.message}`;
  return null;
}

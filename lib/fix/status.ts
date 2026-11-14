import type { FixSession, FixStatus } from "../types";

export const DONE_STATUSES: ReadonlySet<FixStatus> = new Set(["finished", "error"]);

export function isDone(fix: FixSession): boolean {
  return DONE_STATUSES.has(fix.status);
}

export function eligibleForFix(finding: { state: string; fixable: string }): boolean {
  return finding.state === "fail" && (finding.fixable === "yes" || finding.fixable === "partly");
}

export const MAX_FIXES = 10;

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

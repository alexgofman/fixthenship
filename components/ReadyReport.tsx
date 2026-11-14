"use client";

import { useState, type CSSProperties } from "react";
import type { Evidence as EvidenceItem, Finding, FixSession, RuleId, Run } from "@/lib/types";
import BeforeYouSubmit from "./BeforeYouSubmit";
import Evidence from "./Evidence";
import StatePill from "./StatePill";
import { displayFor, hasOpenFindings, initialDisplay, repoName, runName } from "./findingDisplay";

/** Per rule: the label and the place a reviewer can see the fix, for the App Review notes. */
export const NOTE_LINES: Record<RuleId, [string, string]> = {
  R1: ["App loading", "the app opens to its first screen without errors"],
  R2: ["Placeholder content", "replaced with final text and images"],
  R3: ["Buttons and links", "every button and link now leads somewhere"],
  R4: ["Sign-in", "use the demo account above"],
  R5: ["Privacy policy", "Settings, Privacy Policy"],
  R6: ["Account deletion", "Settings, Delete account"],
  R7: ["Sign in with Apple", "Sign-in screen, Sign in with Apple"],
  R8: ["Purchases", "no outside checkout is offered on iPhone"],
  R9: ["Support", "Settings, Support"],
  R10: ["Branding", "the app's own name and icon; no builder badge"],
  R11: ["Consent", "asked at first launch, before any tracking"],
  R12: ["Reporting and blocking", "Report and Block on each post"],
  R13: ["App features", "see the features listed above"],
};

export type ReadySections = {
  fixed: Finding[];
  needsYou: Finding[];
  stillFailing: Finding[];
  passed: Finding[];
  notChecked: Finding[];
};

/** Each finding in at most one section; a first-review pass the fixes broke is red, so it is still failing. */
export function readySections(run: Run): ReadySections {
  return {
    fixed: run.findings.filter(wasFixed),
    needsYou: run.findings.filter((f) => f.finalState === "amber"),
    stillFailing: run.findings.filter((f) => f.finalState === "red"),
    passed: run.findings.filter((f) => f.state === "pass" && (f.finalState === "" || f.finalState === "green")),
    notChecked: run.findings.filter((f) => f.state === "not_checked" && f.finalState === ""),
  };
}

/** Fixed in this run: green after the re-check, but not passing on the first review. */
export function wasFixed(f: Finding): boolean {
  return f.finalState === "green" && f.state !== "pass";
}

/** Evidence added by the re-check, recognised by its caption. */
export function afterFixEvidence(f: Finding): EvidenceItem[] {
  return f.evidence.filter((e) => /^(after the fix|after fix|re-?check)/i.test(e.caption));
}

export function titleCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Ready-to-paste text for the App Review notes in App Store Connect. */
export function reviewNotes(run: Run): string {
  const repo = run.repoUrl ? repoName(run.repoUrl) : "";
  const lines = [
    repo
      ? `${titleCase(repo)} (built from the ${repo} repository) is the iPhone version of ${run.appUrl}.`
      : `${runName(run)} is the iPhone version of ${run.appUrl}.`,
    "",
    "Demo account: <email> / <password>",
  ];
  const fixed = run.findings.filter(wasFixed);
  if (fixed.length > 0) {
    lines.push("", "Changes since the last build:");
    for (const f of fixed) {
      const [label, where] = NOTE_LINES[f.ruleId] ?? [f.title, ""];
      lines.push(where ? `${label}: ${where}` : label);
    }
  }
  return lines.join("\n");
}

export const READY_LINE_OPEN =
  "Fixed findings are verified. The ones marked Needs you are waiting for a step only you can take.";
export const READY_LINE_DONE = "Everything we found is fixed and verified. Apple still makes the decision.";

/** The label above the app's name and the line under it. */
export function readyHeadline(run: Run): { label: string; line: string } {
  const open = hasOpenFindings(run);
  return {
    label: `${open ? "What is left to do" : "Ready to submit"} · Run ${run.id}`,
    line: open ? READY_LINE_OPEN : READY_LINE_DONE,
  };
}

export function ReadyHead({ run }: { run: Run }) {
  const { label, line } = readyHeadline(run);
  return (
    <div className="run-head">
      <div>
        <p className="eyebrow">{label}</p>
        <h1 className="run-title">{runName(run)}</h1>
        {run.stage === "done" && <p style={{ margin: "8px 0 0" }}>{line}</p>}
      </div>
    </div>
  );
}

const PRE_STYLE: CSSProperties = {
  margin: 0,
  padding: "16px 18px",
  background: "#fffefb",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  fontFamily: "var(--mono)",
  fontSize: 14,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

function Head({ id, title, n }: { id: string; title: string; n: number }) {
  return (
    <div className="section-head">
      <h2 id={id}>{title}</h2>
      <span className="muted small">{n}</span>
    </div>
  );
}

function None() {
  return <p className="muted">None.</p>;
}

function CardHead({ finding }: { finding: Finding }) {
  return (
    <>
      <header className="finding-head">
        <span className="guideline-badge">Guideline {finding.guideline}</span>
        <StatePill display={displayFor(finding)} />
      </header>
      <h3 className="finding-title">{finding.title}</h3>
    </>
  );
}

function AfterFix({ finding, fix, run }: { finding: Finding; fix?: FixSession; run: Run }) {
  const items = afterFixEvidence(finding);
  return (
    <div className="evidence">
      <p className="evidence-heading">After the fix</p>
      {items.map((e, i) => (
        <Evidence key={i} item={e} runId={run.id} repoUrl={run.repoUrl} />
      ))}
      {items.length === 0 && <p className="finding-detail">The re-check passed.</p>}
      {fix?.summary && (
        <p className="finding-detail">
          Devin: {fix.summary}
          {fix.prUrl && (
            <>
              {" "}
              <a href={fix.prUrl} target="_blank" rel="noreferrer">
                pull request
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" className="btn-primary" onClick={copy} aria-live="polite">
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function ReadyReport({ run }: { run: Run }) {
  const s = readySections(run);
  const notes = reviewNotes(run);
  const fixFor = (f: Finding) => run.fixes.find((x) => x.ruleId === f.ruleId);

  return (
    <div className="ready">
      <section className="board" aria-labelledby="ready-needs">
        <Head id="ready-needs" title="Needs you" n={s.needsYou.length} />
        {s.needsYou.length === 0 ? (
          <None />
        ) : (
          <ul className="findings" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {s.needsYou.map((f) => (
              <li key={f.ruleId} className="finding finding-amber">
                <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: 20, height: 20, marginTop: 4, flex: "none" }} />
                  <span>
                    <span className="guideline-badge">Guideline {f.guideline}</span>
                    <strong className="finding-title" style={{ display: "block" }}>
                      {f.title}
                    </strong>
                    <span className="finding-detail">{f.humanStep || f.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="board" aria-labelledby="ready-fixed">
        <Head id="ready-fixed" title="Fixed and verified" n={s.fixed.length} />
        {s.fixed.length === 0 ? (
          <None />
        ) : (
          <div className="findings">
            {s.fixed.map((f) => (
              <article key={f.ruleId} className="finding finding-green">
                <CardHead finding={f} />
                <AfterFix finding={f} fix={fixFor(f)} run={run} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="board" aria-labelledby="ready-failing">
        <Head id="ready-failing" title="Still failing" n={s.stillFailing.length} />
        {s.stillFailing.length === 0 ? (
          <None />
        ) : (
          <div className="findings">
            {s.stillFailing.map((f) => (
              <article key={f.ruleId} className="finding finding-red">
                <CardHead finding={f} />
                <p className="finding-detail">{f.detail}</p>
                {f.humanStep && (
                  <p className="human-step">
                    <strong>Next step:</strong> {f.humanStep}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="board" aria-labelledby="ready-passed">
        <Head id="ready-passed" title="Passed" n={s.passed.length} />
        {s.passed.length === 0 ? (
          <None />
        ) : (
          <div className="findings">
            {s.passed.map((f) => (
              <article key={f.ruleId} className="finding finding-green">
                <header className="finding-head">
                  <span className="guideline-badge">Guideline {f.guideline}</span>
                  <StatePill display={initialDisplay(f.state)} />
                </header>
                <h3 className="finding-title">{f.title}</h3>
                <p className="finding-detail">Passed on the first review.</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="board" aria-labelledby="ready-unchecked">
        <Head id="ready-unchecked" title="Not checked" n={s.notChecked.length} />
        {s.notChecked.length === 0 ? (
          <None />
        ) : (
          <div className="findings">
            {s.notChecked.map((f) => (
              <article key={f.ruleId} className="finding finding-grey">
                <header className="finding-head">
                  <span className="guideline-badge">Guideline {f.guideline}</span>
                  <StatePill display={initialDisplay(f.state)} />
                </header>
                <h3 className="finding-title">{f.title}</h3>
                <p className="finding-detail">{f.detail}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <BeforeYouSubmit runId={run.id} />

      <section className="board" aria-labelledby="ready-notes">
        <div className="section-head">
          <h2 id="ready-notes">Notes for App Review</h2>
          <CopyButton text={notes} />
        </div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Paste into App Store Connect, App Review Information, Notes. Fill in the demo account first.
        </p>
        <pre style={PRE_STYLE}>{notes}</pre>
      </section>

      <p className="refresh-note">FixThenShip predicts what a reviewer is likely to flag. Apple makes the decision.</p>
    </div>
  );
}

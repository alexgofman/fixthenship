"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import checklist from "../lib/content/checklist.json";

export type ChecklistItem = { text: string; why: string; guideline: string };
export type ChecklistGroup = { title: string; items: ChecklistItem[] };

export const CHECKLIST: ChecklistGroup[] = (checklist as { groups: ChecklistGroup[] }).groups;

export const BEFORE_YOU_SUBMIT_TITLE = "Before you submit: what we could not see for you";
export const BEFORE_YOU_SUBMIT_LEAD =
  "We checked the app itself. These live in App Store Connect or in your own records, so only you can check them.";

/** Ticks are kept per run, by item text, so a reworded item starts unticked. */
export function storageKey(runId: string): string {
  return `fixthenship:before-you-submit:${runId}`;
}

function loadTicks(runId: string): Set<string> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(runId)) ?? "[]");
    return new Set(Array.isArray(saved) ? saved.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function saveTicks(runId: string, ticks: Set<string>) {
  try {
    window.localStorage.setItem(storageKey(runId), JSON.stringify([...ticks]));
  } catch {
    // Storage can be full or blocked; the ticks still work until the page is closed.
  }
}

const LIST_STYLE: CSSProperties = { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 };
const ITEM_STYLE: CSSProperties = { display: "flex", gap: 12, alignItems: "flex-start" };
const BOX_STYLE: CSSProperties = { width: 20, height: 20, marginTop: 3, flex: "none", accentColor: "var(--accent)", cursor: "pointer" };

export default function BeforeYouSubmit({ runId, groups = CHECKLIST }: { runId: string; groups?: ChecklistGroup[] }) {
  const id = useId();
  const [ticks, setTicks] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setTicks(loadTicks(runId));
  }, [runId]);

  const all = groups.flatMap((g) => g.items.map((i) => i.text));
  const done = all.filter((t) => ticks.has(t)).length;

  function toggle(text: string, on: boolean) {
    setTicks((prev) => {
      const next = new Set(prev);
      if (on) next.add(text);
      else next.delete(text);
      saveTicks(runId, next);
      return next;
    });
  }

  return (
    <section className="board" aria-labelledby={`${id}-title`}>
      <div className="section-head">
        <h2 id={`${id}-title`}>{BEFORE_YOU_SUBMIT_TITLE}</h2>
        <span className="muted small" aria-live="polite">
          {done} of {all.length} done
        </span>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        {BEFORE_YOU_SUBMIT_LEAD}
      </p>
      {groups.map((g, gi) => (
        <div key={g.title} style={{ marginTop: 18 }}>
          <h3 id={`${id}-g${gi}`} style={{ margin: "0 0 10px", fontSize: 16 }}>
            {g.title}
          </h3>
          <ul style={LIST_STYLE} aria-labelledby={`${id}-g${gi}`}>
            {g.items.map((item, ii) => {
              const boxId = `${id}-${gi}-${ii}`;
              return (
                <li key={item.text} className="finding" style={ITEM_STYLE}>
                  <input
                    id={boxId}
                    type="checkbox"
                    style={BOX_STYLE}
                    checked={ticks.has(item.text)}
                    onChange={(e) => toggle(item.text, e.target.checked)}
                    aria-describedby={`${boxId}-why`}
                  />
                  <div style={{ minWidth: 0 }}>
                    <label htmlFor={boxId} style={{ display: "block", cursor: "pointer", overflowWrap: "anywhere" }}>
                      {item.text}
                    </label>
                    <p id={`${boxId}-why`} className="muted small" style={{ margin: "4px 0 0" }}>
                      {item.why}
                      {item.guideline && (
                        <>
                          {" "}
                          <span className="mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                            Guideline {item.guideline}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

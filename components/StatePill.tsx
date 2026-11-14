import type { Display } from "./findingDisplay";

export default function StatePill({ display }: { display: Display }) {
  return (
    <span className={`pill pill-${display.tone}`}>
      <span className="pill-dot" aria-hidden="true" />
      {display.label}
    </span>
  );
}

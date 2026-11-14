"use client";

import { useEffect, useState, type ReactNode } from "react";

const WIDE = "(min-width: 761px)";

/** Collapsed by default; a failed finding starts open on wide screens. */
export default function EvidenceDetails({ openOnWide, children }: { openOnWide: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(openOnWide);

  useEffect(() => {
    if (openOnWide && !window.matchMedia(WIDE).matches) setOpen(false);
  }, [openOnWide]);

  return (
    <details className="evidence-details" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Show the evidence</summary>
      <div className="evidence-body">{children}</div>
    </details>
  );
}

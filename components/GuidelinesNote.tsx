"use client";

import { useEffect, useState } from "react";
import type { GuidelinesCheck } from "@/lib/guidelines/freshness";
import { guidelinesNoteParts } from "../lib/guidelines/sections.mjs";

/** One muted line under the run's heading on whether Apple's guidelines changed since our checks were written. */
export default function GuidelinesNote({ check }: { check?: GuidelinesCheck }) {
  // The server does not know the reader's time zone: it renders UTC, then the browser switches to local time.
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  if (!check) return null;
  const parts = guidelinesNoteParts(check, local ? {} : { timeZone: "UTC" });
  return (
    <p className="muted small" style={{ margin: "4px 0 0", maxWidth: "70ch" }} data-guidelines={check.status}>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <a key={i} href={part.href} target="_blank" rel="noreferrer">
            {part.text}
          </a>
        ),
      )}
    </p>
  );
}

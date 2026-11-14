"use client";

import { useEffect, useRef, useState } from "react";
import type { Evidence as EvidenceItem } from "@/lib/types";
import { cleanReason, runFileUrl } from "./findingDisplay";

function Screenshot({ src, caption }: { src: string; caption: string }) {
  const [broken, setBroken] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // The image can fail before hydration attaches onError, so check once on mount too.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, []);
  return (
    <figure className="evidence-shot">
      {broken ? (
        <div className="shot-placeholder" role="img" aria-label={`Screenshot unavailable: ${caption}`}>
          <span>Screenshot unavailable</span>
        </div>
      ) : (
        <a href={src} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imgRef} src={src} alt={caption} loading="lazy" onError={() => setBroken(true)} />
        </a>
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function githubBlobUrl(repoUrl: string, file: string, line: number): string | null {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== "github.com") return null;
    const base = url.pathname.replace(/\.git$/, "").replace(/\/$/, "");
    return `https://github.com${base}/blob/HEAD/${file}#L${line}`;
  } catch {
    return null;
  }
}

export default function Evidence({
  item,
  runId,
  repoUrl,
}: {
  item: EvidenceItem;
  runId: string;
  repoUrl: string;
}) {
  if ("file" in item) {
    const ref = `${item.file}:${item.line}`;
    const href = githubBlobUrl(repoUrl, item.file, item.line);
    return (
      <div className="evidence-code">
        {href ? (
          <a className="mono" href={href} target="_blank" rel="noreferrer">
            {ref}
          </a>
        ) : (
          <code className="mono">{ref}</code>
        )}
        <span className="evidence-caption">{cleanReason(item.caption)}</span>
      </div>
    );
  }

  const src = runFileUrl(runId, item.path);
  const caption = cleanReason(item.caption);
  if (item.kind === "screenshot") return <Screenshot src={src} caption={caption} />;

  return (
    <div className="evidence-log">
      <a href={src} target="_blank" rel="noreferrer">
        {caption || "Open the log"}
      </a>
    </div>
  );
}

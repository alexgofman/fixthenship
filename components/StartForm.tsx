"use client";

import { useState, type CSSProperties } from "react";
import { REJECTION_TEXT_MAX } from "../lib/decoder";
import "./plain.css";

const TEXTAREA_STYLE: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  background: "#fff",
  font: "inherit",
  fontWeight: 400,
  resize: "vertical",
};

export default function StartForm() {
  const [withRepo, setWithRepo] = useState(false);
  const [withRejection, setWithRejection] = useState(false);

  return (
    <form className="review-form start-form" action="/api/runs" method="post">
      <div className="start-row">
        <label>
          <span>Your app&apos;s web link</span>
          <input name="appUrl" type="url" required placeholder="https://yourapp.lovable.app" />
        </label>
        <button type="submit" className="btn-primary">
          Check my app
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
        Use the web link your app builder gave you when you pressed Publish. A first submission, an update to an app
        already in the App Store, or a fix after a rejection: check it here before you send it to Apple.
      </p>
      {withRepo && (
        <label className="start-repo">
          <span>
            GitHub repository <span className="optional">(optional)</span>
          </span>
          <input name="repoUrl" type="url" placeholder="https://github.com/you/your-app" autoFocus />
        </label>
      )}
      {withRejection && (
        <label>
          <span>
            Apple&apos;s message <span className="optional">(optional)</span>
          </span>
          <textarea
            name="rejectionText"
            rows={6}
            maxLength={REJECTION_TEXT_MAX}
            placeholder="Paste the message from App Store Connect here"
            style={TEXTAREA_STYLE}
            autoFocus
          />
        </label>
      )}
      {(!withRepo || !withRejection) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
          {!withRepo && (
            <button type="button" className="text-link" onClick={() => setWithRepo(true)}>
              I have the code on GitHub too
            </button>
          )}
          {!withRejection && (
            <button type="button" className="text-link" onClick={() => setWithRejection(true)}>
              Apple already rejected it? Paste their message
            </button>
          )}
        </div>
      )}
    </form>
  );
}

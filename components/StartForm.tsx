"use client";

import { useState } from "react";
import "./plain.css";

export default function StartForm() {
  const [withRepo, setWithRepo] = useState(false);

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
      {withRepo ? (
        <label className="start-repo">
          <span>
            GitHub repository <span className="optional">(optional)</span>
          </span>
          <input name="repoUrl" type="url" placeholder="https://github.com/you/your-app" autoFocus />
        </label>
      ) : (
        <button type="button" className="text-link" onClick={() => setWithRepo(true)}>
          I have the code on GitHub too
        </button>
      )}
    </form>
  );
}

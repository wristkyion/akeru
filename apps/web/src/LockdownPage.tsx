import { useState } from "react";

// Shown when the app can't reach the server. It checks again on its own,
// and the button checks right away.
export function LockdownPage({ onRetry }: { onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    await onRetry();
    setBusy(false);
  }

  return (
    <div className="maintenance">
      <h1>Lockdown</h1>
      <p>
        Akeru can't reach the server right now. Check that the server is running. This page will
        check again on its own.
      </p>
      <button className="pill-btn" onClick={retry} disabled={busy}>
        {busy ? "Checking…" : "Try again"}
      </button>
    </div>
  );
}

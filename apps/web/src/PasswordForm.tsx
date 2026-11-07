import { useState, type FormEvent } from "react";
import { api, ApiError } from "./api";

export function PasswordForm({
  forced,
  onDone,
  onCancel,
}: {
  // True when an admin reset the password, so the user must change it before continuing
  forced: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next.length < 8) {
      setError("The new password must be at least 8 characters.");
      return;
    }
    if (next !== repeat) {
      setError("The new passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.changePassword(current, next);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change the password.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>{forced ? "Choose a new password" : "Change password"}</h1>
        <p className="muted">
          {forced
            ? "An admin set a temporary password. Choose your own to continue."
            : "Other devices will be signed out after you change it."}
        </p>

        <label className="field">
          <span>Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>

        <label className="field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <p className="hint">At least 8 characters.</p>

        <label className="field">
          <span>Repeat new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn-primary" disabled={busy || !current || !next || !repeat}>
          {busy ? "Saving…" : "Change password"}
        </button>
        {onCancel && !forced && (
          <p className="switch">
            <button type="button" className="link" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          </p>
        )}
      </form>
    </div>
  );
}

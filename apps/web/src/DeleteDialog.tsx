import { useState } from "react";
import { api, ApiError, type CharacterView } from "./api";

export function DeleteDialog({
  character,
  onDeleted,
  onCancel,
}: {
  character: CharacterView;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api.deleteCharacter(character.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the character.");
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Delete {character.name}?</h2>
        <p className="muted">
          This removes the character and every chat with it, for everyone. It can't be undone.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button className="pill-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="danger-btn" onClick={remove} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

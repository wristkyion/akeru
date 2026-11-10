import { useState, type FormEvent } from "react";
import {
  api,
  ApiError,
  deleteCharacterPicture,
  uploadCharacterPicture,
  type CharacterInput,
  type CharacterView,
} from "./api";
import { Avatar } from "./Avatar";
import { DeleteDialog } from "./DeleteDialog";

interface CharacterFormProps {
  // When editing, pass the existing character. When creating, leave it out.
  existing?: CharacterView;
  onSaved: (c: CharacterView) => void;
  onCancel: () => void;
  onDeleted?: () => void;
}

// "fantasy, slice of life" becomes ["fantasy", "slice of life"]
function parseTagText(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function CharacterForm({ existing, onSaved, onCancel, onDeleted }: CharacterFormProps) {
  const editing = Boolean(existing);
  const [name, setName] = useState(existing?.name ?? "");
  const [tagText, setTagText] = useState(existing?.tags.join(", ") ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [definition, setDefinition] = useState(existing?.definition ?? "");
  const [personality, setPersonality] = useState(existing?.personality ?? "");
  const [greeting, setGreeting] = useState(existing?.greeting ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(
    existing?.visibility ?? "private",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const tagPreview = parseTagText(tagText);

  // The character's picture id. It's set from the saved character, then updated by upload or remove.
  const [picId, setPicId] = useState<string | null>(existing?.avatarPath ?? null);
  const [picBusy, setPicBusy] = useState(false);
  const [picErr, setPicErr] = useState("");

  async function changePic(file: File) {
    if (!existing) return;
    setPicBusy(true);
    setPicErr("");
    try {
      const r = await uploadCharacterPicture(existing.id, file);
      setPicId(r.id);
    } catch (err) {
      setPicErr(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setPicBusy(false);
    }
  }

  async function removePic() {
    if (!existing) return;
    setPicBusy(true);
    setPicErr("");
    try {
      await deleteCharacterPicture(existing.id);
      setPicId(null);
    } catch (err) {
      setPicErr(err instanceof Error ? err.message : "Could not remove the picture.");
    } finally {
      setPicBusy(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give your character a name.");
      return;
    }

    const input: CharacterInput = {
      name: name.trim(),
      description: description.trim(),
      definition: definition.trim(),
      personality: personality.trim(),
      greeting: greeting.trim(),
      tags: parseTagText(tagText),
      visibility,
    };

    setBusy(true);
    setError("");
    try {
      const saved = editing
        ? await api.updateCharacter(existing!.id, input)
        : await api.createCharacter(input);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the character.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="char-form" onSubmit={submit}>
      <header className="form-head">
        <h1>{editing ? "Edit character" : "Create a character"}</h1>
        <button type="button" className="pill-btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </header>

      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input
            autoFocus
            maxLength={60}
            placeholder="e.g. Mira"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <section className="set-card full">
          <h3>Character picture</h3>
          <p className="muted small">
            Shown on the card and in the chat panel. JPEG, PNG, or WebP, up to 2 MB.
          </p>
          {existing ? (
            <div className="pic-row">
              <Avatar name={name || existing.name} pictureId={picId} className="avatar avatar-sm" />
              <label className="pill-btn">
                Choose picture
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  disabled={picBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void changePic(file);
                  }}
                />
              </label>
              {picId && (
                <button
                  type="button"
                  className="pill-btn danger-text"
                  disabled={picBusy}
                  onClick={() => void removePic()}
                >
                  Remove
                </button>
              )}
            </div>
          ) : (
            <p className="muted small">Save the character first, then add a picture.</p>
          )}
          {picErr && <p className="error">{picErr}</p>}
        </section>

        <label className="field">
          <span>Visibility</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "public" | "private")}
          >
            <option value="private">Private: only you can chat with it</option>
            <option value="public">Public: everyone can chat with it</option>
          </select>
        </label>

        <label className="field full">
          <span>Tags and genre</span>
          <input
            maxLength={300}
            placeholder="fantasy, slice of life, comedy"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
          />
        </label>
        {tagPreview.length > 0 && (
          <div className="tag-row full">
            {tagPreview.slice(0, 10).map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
        <p className="hint full">Separate tags with commas. Up to 10. Used for search and cards.</p>

        <label className="field full">
          <span>Description</span>
          <textarea
            rows={2}
            maxLength={1000}
            placeholder="A short blurb shown on the card."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="field full">
          <span>Definition</span>
          <textarea
            rows={6}
            maxLength={32000}
            placeholder="Background, appearance, how they know you, and example lines of dialogue. The model reads this in every message."
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
          />
        </label>

        <label className="field full">
          <span>Personality</span>
          <textarea
            rows={3}
            maxLength={32000}
            placeholder="How they talk and act, e.g. calm, dry humor, short sentences."
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
          />
        </label>

        <label className="field full">
          <span>Greeting</span>
          <textarea
            rows={2}
            maxLength={5000}
            placeholder="The first message people see when they start a chat."
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="form-actions">
        <button className="btn-primary form-submit" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create character"}
        </button>
      </div>

      {editing && existing?.canDelete && (
        <div className="form-danger">
          <div>
            <strong>Delete this character</strong>
            <p className="muted small">
              Removes the character and every chat with it, for everyone. It can't be undone.
            </p>
          </div>
          <button
            type="button"
            className="danger-btn"
            onClick={() => setShowDelete(true)}
            disabled={busy}
          >
            Delete character
          </button>
        </div>
      )}

      {showDelete && existing && (
        <DeleteDialog
          character={existing}
          onCancel={() => setShowDelete(false)}
          onDeleted={() => {
            setShowDelete(false);
            onDeleted?.();
          }}
        />
      )}
    </form>
  );
}

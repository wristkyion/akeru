import { useState } from "react";
import type { CharacterView } from "./api";
import { Icon } from "./Icons";
import { Avatar } from "./Avatar";

export function CharacterPanel({
  character,
  onEdit,
}: {
  character: CharacterView;
  onEdit: (c: CharacterView) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [reported, setReported] = useState(false);
  const [copied, setCopied] = useState(false);

  // Prototype: likes live in the browser until the backend stores them
  const likeCount = liked ? 1 : 0;

  function share() {
    const link = `${window.location.origin}/?character=${character.id}`;
    void navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function report() {
    if (reported) return;
    if (!window.confirm(`Report ${character.name}? Reports are a prototype and aren't sent yet.`)) return;
    setReported(true);
  }

  return (
    <aside className="cp">
      <div className="cp-profile">
        <Avatar
          name={character.name}
          pictureId={character.avatarPath}
          className="avatar cp-avatar"
        />
        <div className="cp-meta">
          <h2>{character.name}</h2>
          <span className="muted small">By @{character.ownerName ?? "unknown"}</span>
          <span className="muted small">0 interactions</span>
        </div>
      </div>

      <div className="cp-actions">
        <button
          className={liked ? "cp-btn on" : "cp-btn"}
          onClick={() => setLiked((v) => !v)}
          aria-pressed={liked}
          title="Like"
        >
          <Icon name="like" size={16} /> {likeCount}
        </button>
        <button className="cp-btn" onClick={share} title="Copy link">
          <Icon name="share" size={16} /> {copied ? "Copied" : "Share"}
        </button>
        <button
          className={reported ? "cp-btn on" : "cp-btn"}
          onClick={report}
          title="Report"
          aria-label="Report character"
        >
          <Icon name="flag" size={16} />
        </button>
      </div>

      {character.description && (
        <section className="cp-section">
          <h3>Description</h3>
          <p>{character.description}</p>
        </section>
      )}

      {character.tags.length > 0 && (
        <section className="cp-section">
          <h3>Tags</h3>
          <div className="tag-row">
            {character.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {character.canEdit && (
        <button className="pill-btn cp-edit" onClick={() => onEdit(character)}>
          Edit character
        </button>
      )}
    </aside>
  );
}

import { useState } from "react";
import type { Message } from "./api";
import { Formatted } from "./Markdown";
import { avatarStyle, initials } from "./ui";

interface MessageItemProps {
  message: Message;
  mine: boolean;
  name: string;
  // Only the newest assistant reply can be refreshed
  canRefresh: boolean;
  disabled: boolean;
  onSave: (message: Message, text: string, resend: boolean) => void;
  onRefresh: (message: Message) => void;
  onDelete: (message: Message) => void;
}

export function MessageItem({
  message,
  mine,
  name,
  canRefresh,
  disabled,
  onSave,
  onRefresh,
  onDelete,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(message.content);
    setEditing(true);
  };

  const save = (resend: boolean) => {
    const text = draft.trim();
    if (!text) return;
    setEditing(false);
    onSave(message, text, resend);
  };

  return (
    <div className={mine ? "msg msg-user" : "msg"}>
      {!mine && (
        <span className="avatar msg-avatar" style={avatarStyle(name)}>
          {initials(name)}
        </span>
      )}
      <div className="msg-body">
        <div className="msg-name">
          {mine ? (
            <>
              <span>{name}</span>
              <span className="avatar avatar-xs" style={avatarStyle(name)}>
                {initials(name)}
              </span>
            </>
          ) : (
            <>
              <span>{name}</span>
              <span className="badge">AI</span>
            </>
          )}
        </div>

        {editing ? (
          <div className="edit-box">
            <textarea
              autoFocus
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div className="edit-actions">
              <button className="pill-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="pill-btn" onClick={() => save(false)} disabled={!draft.trim()}>
                Save
              </button>
              {mine && (
                <button
                  className="pill-btn primary-text"
                  onClick={() => save(true)}
                  disabled={!draft.trim()}
                >
                  Save & resend
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bubble">
            <Formatted text={message.content} />
          </div>
        )}

        {!editing && (
          <div className="msg-tools">
            <button className="tool-btn" onClick={startEdit} disabled={disabled}>
              Edit
            </button>
            {!mine && canRefresh && (
              <button className="tool-btn" onClick={() => onRefresh(message)} disabled={disabled}>
                Refresh
              </button>
            )}
            <button
              className="tool-btn danger-text"
              onClick={() => onDelete(message)}
              disabled={disabled}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

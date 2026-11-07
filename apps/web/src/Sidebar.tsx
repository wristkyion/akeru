import { Fragment, useEffect, useState } from "react";
import { api, type CharacterView, type ChatInfo, type Me } from "./api";
import { avatarStyle, initials } from "./ui";

// A chat's label: its title, or the start date until the first message names it
export function chatTitle(c: ChatInfo): string {
  if (c.title) return c.title;
  const day = new Date(c.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
  return `Chat, ${day}`;
}

// The chat list shown under the selected character
export interface ChatPanel {
  chats: ChatInfo[];
  activeChatId: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onRename: (c: ChatInfo) => void;
  onDelete: (c: ChatInfo) => void;
}

interface SidebarProps {
  me: Me;
  activeId: string | null;
  revision: number;
  chatPanel?: ChatPanel;
  onHome: () => void;
  onOpen: (c: CharacterView) => void;
  onCreate: () => void;
  onLogout: () => void;
  onChangePassword: () => void;
}

export function Sidebar({
  me,
  activeId,
  revision,
  chatPanel,
  onHome,
  onOpen,
  onCreate,
  onLogout,
  onChangePassword,
}: SidebarProps) {
  const [characters, setCharacters] = useState<CharacterView[]>([]);

  useEffect(() => {
    api.characters().then(setCharacters).catch(() => setCharacters([]));
  }, [revision]);

  return (
    <aside className="sidebar">
      <div className="brand">akeru</div>

      <button className="create-btn" onClick={onCreate}>
        <span>+</span> Create
      </button>

      <nav className="nav">
        <button className={activeId === null ? "nav-item active" : "nav-item"} onClick={onHome}>
          Home
        </button>
        <button className="nav-item" disabled title="Coming later">
          Discover
        </button>
      </nav>

      <div className="section-label">Characters</div>
      <div className="chat-list">
        {characters.map((c) => (
          <Fragment key={c.id}>
            <button
              className={c.id === activeId ? "list-item active" : "list-item"}
              onClick={() => onOpen(c)}
            >
              <span className="avatar avatar-xs" style={avatarStyle(c.name)}>
                {initials(c.name)}
              </span>
              <span className="list-name">{c.name}</span>
            </button>

            {c.id === activeId && chatPanel && (
              <div className="sub-list">
                <button className="sub-new" onClick={chatPanel.onNew}>
                  + New chat
                </button>
                {chatPanel.chats.map((ch) => (
                  <div
                    key={ch.id}
                    className={ch.id === chatPanel.activeChatId ? "sub-item active" : "sub-item"}
                  >
                    <button
                      className="sub-title"
                      title={chatTitle(ch)}
                      onClick={() => chatPanel.onPick(ch.id)}
                    >
                      {chatTitle(ch)}
                    </button>
                    <button
                      className="sub-act"
                      title="Rename"
                      aria-label="Rename chat"
                      onClick={() => chatPanel.onRename(ch)}
                    >
                      ✎
                    </button>
                    <button
                      className="sub-act"
                      title="Delete"
                      aria-label="Delete chat"
                      onClick={() => chatPanel.onDelete(ch)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Fragment>
        ))}
      </div>

      <div className="user">
        <span className="avatar avatar-xs" style={avatarStyle(me.displayName)}>
          {initials(me.displayName)}
        </span>
        <div className="user-meta">
          <strong>{me.displayName}</strong>
          <span>{me.role === "admin" ? "Admin" : `@${me.username}`}</span>
        </div>
        <button className="btn-ghost" onClick={onChangePassword}>
          Password
        </button>
        <button className="btn-ghost" onClick={onLogout}>
          Log out
        </button>
      </div>
    </aside>
  );
}

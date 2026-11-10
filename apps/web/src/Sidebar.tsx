import { Fragment, useEffect, useState } from "react";
import { api, type CharacterView, type ChatInfo, type Me } from "./api";
import { Icon } from "./Icons";
import { avatarStyle, initials } from "./ui";
import { Avatar } from "./Avatar";

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
  settingsActive?: boolean;
  revision: number;
  chatPanel?: ChatPanel;
  onHome: () => void;
  onOpen: (c: CharacterView) => void;
  onCreate: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onChangePassword?: () => void; // password lives in Settings now
}

export function Sidebar({
  me,
  activeId,
  settingsActive = false,
  revision,
  chatPanel,
  onHome,
  onOpen,
  onCreate,
  onSettings,
  onLogout,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [characters, setCharacters] = useState<CharacterView[]>([]);

  useEffect(() => {
    api.characters().then(setCharacters).catch(() => setCharacters([]));
  }, [revision]);

  const shown = characters.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const homeActive = !settingsActive && activeId === null;

  return (
    <aside className="sb">
      <div className="sb-panel">
        <div className="sb-user">
          <Avatar name={me.displayName} pictureId={me.pictureId} className="avatar avatar-sm" />
          <div className="user-meta">
            <strong>{me.displayName}</strong>
            <span>@{me.username}</span>
          </div>
        </div>

        <div className="sb-search">
          <Icon name="search" size={16} />
          <input
            placeholder="Search characters"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <nav className="sb-nav">
          <button className={homeActive ? "sb-link on" : "sb-link"} onClick={onHome}>
            <Icon name="home" />
            Home
          </button>
          <button className="sb-link" onClick={onCreate}>
            <Icon name="plus" />
            Create character
          </button>
        </nav>

        <div className="sb-label">Characters</div>
        <div className="sb-list">
          {shown.map((c) => (
            <Fragment key={c.id}>
              <button
                className={c.id === activeId ? "list-item active" : "list-item"}
                onClick={() => onOpen(c)}
              >
                <Avatar name={c.name} pictureId={c.avatarPath} className="avatar avatar-xs" />
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

        <div className="sb-foot">
          <button
            className={settingsActive ? "sb-link on" : "sb-link"}
            onClick={onSettings}
            aria-label="Settings"
          >
            <Icon name="settings" />
            Settings
          </button>
          <button className="sb-link" onClick={onLogout}>
            <Icon name="logout" />
            Log out
          </button>
        </div>
      </div>
    </aside>
  );
}

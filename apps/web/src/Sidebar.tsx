import { useEffect, useState } from "react";
import { api, type CharacterView, type Me } from "./api";
import { avatarStyle, initials } from "./ui";

interface SidebarProps {
  me: Me;
  activeId: string | null;
  revision: number;
  onHome: () => void;
  onOpen: (c: CharacterView) => void;
  onCreate: () => void;
  onLogout: () => void;
}

export function Sidebar({ me, activeId, revision, onHome, onOpen, onCreate, onLogout }: SidebarProps) {
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
          <button
            key={c.id}
            className={c.id === activeId ? "list-item active" : "list-item"}
            onClick={() => onOpen(c)}
          >
            <span className="avatar avatar-xs" style={avatarStyle(c.name)}>
              {initials(c.name)}
            </span>
            <span className="list-name">{c.name}</span>
          </button>
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
        <button className="btn-ghost" onClick={onLogout}>
          Log out
        </button>
      </div>
    </aside>
  );
}

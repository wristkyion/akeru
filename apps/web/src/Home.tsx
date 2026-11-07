import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api, ApiError, type CharacterView, type Me } from "./api";

interface HomeProps {
  me: Me;
  onLogout: () => void;
}

// Colors come from the name, so each character keeps the same avatar color
function avatarStyle(name: string): CSSProperties {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${h} 60% 46%), hsl(${(h + 40) % 360} 65% 34%))`,
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || name.trim().slice(0, 2)).toUpperCase() || "?";
}

function CharacterCard({ c, meId }: { c: CharacterView; meId: string }) {
  const owner = c.ownerId === meId ? "you" : (c.ownerName ?? "unknown");
  return (
    <article className="card">
      <div className="avatar" style={avatarStyle(c.name)}>
        {initials(c.name)}
      </div>
      <div className="card-body">
        <h3>{c.name}</h3>
        <p>{c.description || "No description yet."}</p>
      </div>
      <div className="card-foot">
        <span>by {owner}</span>
        <span className="tags">
          <span className={c.visibility === "private" ? "tag tag-private" : "tag"}>
            {c.visibility === "private" ? "Private" : "Public"}
          </span>
          {!c.canChat && <span className="tag tag-private">View only</span>}
        </span>
      </div>
    </article>
  );
}

function Section({
  title,
  items,
  emptyText,
  meId,
}: {
  title: string;
  items: CharacterView[];
  emptyText: string;
  meId: string;
}) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className="grid">
          {items.map((c) => (
            <CharacterCard key={c.id} c={c} meId={meId} />
          ))}
        </div>
      )}
    </section>
  );
}

export function Home({ me, onLogout }: HomeProps) {
  const [characters, setCharacters] = useState<CharacterView[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .characters()
      .then(setCharacters)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Could not load characters.");
      });
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (characters ?? []).filter(
      (c) =>
        !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [characters, query]);

  const mine = matches.filter((c) => c.ownerId === me.id);
  const others = matches.filter((c) => c.ownerId !== me.id);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">A</span>
          <span>akeru</span>
        </div>

        <nav className="nav">
          <button className="nav-item active">Home</button>
          <button className="nav-item" disabled title="Coming in the next step">
            + Create character
          </button>
        </nav>

        <div className="user">
          <div className="avatar avatar-sm" style={avatarStyle(me.displayName)}>
            {initials(me.displayName)}
          </div>
          <div className="user-meta">
            <strong>{me.displayName}</strong>
            <span>{me.role === "admin" ? "Admin" : `@${me.username}`}</span>
          </div>
          <button className="btn-ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <input
            className="search"
            type="search"
            placeholder="Search characters"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="content">
          <section className="hero">
            <h1>Welcome back, {me.displayName}</h1>
            <p className="muted">Pick a character to start talking. Chat screens are the next step.</p>
          </section>

          {error && <p className="error">{error}</p>}
          {!error && characters === null && <p className="muted">Loading characters…</p>}

          {characters && (
            <>
              <Section
                title="Your characters"
                items={mine}
                meId={me.id}
                emptyText={query ? "No matches." : "You haven't made any characters yet."}
              />
              <Section
                title="Other characters"
                items={others}
                meId={me.id}
                emptyText="No other characters are visible to you."
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

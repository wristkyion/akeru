import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type CharacterView, type Me } from "./api";
import { Sidebar } from "./Sidebar";
import { avatarStyle, initials } from "./ui";

interface HomeProps {
  me: Me;
  onOpen: (c: CharacterView) => void;
  onLogout: () => void;
}

function CharacterCard({
  c,
  meId,
  onOpen,
}: {
  c: CharacterView;
  meId: string;
  onOpen: (c: CharacterView) => void;
}) {
  const owner = c.ownerId === meId ? "you" : (c.ownerName ?? "unknown");
  return (
    <article
      className="card card-link"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(c)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(c);
      }}
    >
      <span className="avatar" style={avatarStyle(c.name)}>
        {initials(c.name)}
      </span>
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
  onOpen,
}: {
  title: string;
  items: CharacterView[];
  emptyText: string;
  meId: string;
  onOpen: (c: CharacterView) => void;
}) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      {items.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        <div className="grid">
          {items.map((c) => (
            <CharacterCard key={c.id} c={c} meId={meId} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

export function Home({ me, onOpen, onLogout }: HomeProps) {
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
      (c) => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [characters, query]);

  const mine = matches.filter((c) => c.ownerId === me.id);
  const others = matches.filter((c) => c.ownerId !== me.id);

  return (
    <div className="app">
      <Sidebar me={me} activeId={null} onHome={() => undefined} onOpen={onOpen} onLogout={onLogout} />

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
            <p className="muted">Pick a character to start talking.</p>
          </section>

          {error && <p className="error">{error}</p>}
          {!error && characters === null && <p className="muted">Loading characters…</p>}

          {characters && (
            <>
              <Section
                title="Your characters"
                items={mine}
                meId={me.id}
                onOpen={onOpen}
                emptyText={query ? "No matches." : "You haven't made any characters yet."}
              />
              <Section
                title="Other characters"
                items={others}
                meId={me.id}
                onOpen={onOpen}
                emptyText="No other characters are visible to you."
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

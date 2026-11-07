import { useEffect, useState } from "react";
import { api, type Character, type Chat, type Message } from "./api";

export default function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<Character | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", description: "", greeting: "" });

  const run = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    run(async () => {
      setCharacters(await api.listCharacters());
      const all = (await api.listModels()).flatMap((p) => p.models);
      setModels(all);
      setModel(all[0] ?? "");
    });
  }, []);

  const openCharacter = (c: Character) =>
    run(async () => {
      setSelected(c);
      setChat(null);
      setChats(await api.listChats(c.id));
    });

  const newChat = () =>
    selected &&
    run(async () => {
      const c = await api.createChat(selected.id);
      setChats(await api.listChats(selected.id));
      setChat(c);
      setMessages(await api.listMessages(c.id));
    });

  const openChat = (c: Chat) =>
    run(async () => {
      setChat(c);
      setMessages(await api.listMessages(c.id));
    });

  const send = () => {
    if (!chat || !draft.trim()) return;
    const text = draft;
    setDraft("");
    run(async () => {
      setBusy(true);
      try {
        await api.sendMessage(chat.id, text, model);
      } finally {
        setBusy(false);
        setMessages(await api.listMessages(chat.id));
      }
    });
  };

  const createCharacter = () =>
    run(async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const c = await api.createCharacter(form);
      setCharacters(await api.listCharacters());
      setForm({ name: "", description: "", greeting: "" });
      setSelected(c);
      setChats([]);
    });

  if (chat && selected) {
    return (
      <main>
        <header>
          <button onClick={() => setChat(null)}>← Back</button>
          <h2>{selected.name}</h2>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </header>
        {error && <p className="error">{error}</p>}
        <section>
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "user" : "assistant"}>
              <small>{m.role === "user" ? "You" : selected.name}</small>
              <p>{m.content}</p>
            </div>
          ))}
          {busy && <p>{selected.name} is typing…</p>}
        </section>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message"
            disabled={busy}
          />
          <button disabled={busy || !draft.trim()}>Send</button>
        </form>
      </main>
    );
  }

  if (selected) {
    return (
      <main>
        <button onClick={() => setSelected(null)}>← Characters</button>
        <h2>{selected.name}</h2>
        <p>{selected.description}</p>
        <button onClick={newChat}>New chat</button>
        <ul>
          {chats.map((c) => (
            <li key={c.id}>
              <button onClick={() => openChat(c)}>{c.title || `Chat ${c.id.slice(0, 6)}`}</button>
            </li>
          ))}
        </ul>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  return (
    <main>
      <h1>Akeru</h1>
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Characters</h2>
        {characters.map((c) => (
          <button key={c.id} onClick={() => openCharacter(c)}>
            {c.name}
          </button>
        ))}
      </section>

      <section>
        <h2>New character</h2>
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <textarea
          placeholder="Greeting"
          value={form.greeting}
          onChange={(e) => setForm({ ...form, greeting: e.target.value })}
        />
        <button onClick={createCharacter}>Create</button>
      </section>
    </main>
  );
}

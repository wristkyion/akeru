import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  api,
  type CharacterView,
  type ChatInfo,
  type Me,
  type Message,
  type Usage,
} from "./api";

const SETTINGS_KEY = "akeru.chat-settings";
const DEFAULT_TEMP = 0.8;

interface ChatSettings {
  model: string;
  temperature: number | null; // null = model default
  maxTokens: number | null; // null = model default
}

function loadSettings(): ChatSettings {
  const fallback: ChatSettings = { model: "", temperature: null, maxTokens: null };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

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

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function chatLabel(c: ChatInfo): string {
  const day = new Date(c.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day} · ${clock(c.updatedAt)}`;
}

function Bubble({
  mine,
  name,
  text,
  time,
  sending,
}: {
  mine: boolean;
  name: string;
  text: string;
  time?: number;
  sending?: boolean;
}) {
  return (
    <div className={mine ? "msg msg-user" : "msg"}>
      {!mine && (
        <div className="avatar avatar-msg" style={avatarStyle(name)}>
          {initials(name)}
        </div>
      )}
      <div className="msg-body">
        <div className="msg-meta">
          {mine ? "You" : name}
          {time !== undefined && <> · {clock(time)}</>}
          {sending && <> · sending…</>}
        </div>
        <div className={mine ? "bubble bubble-user" : "bubble"}>{text}</div>
      </div>
    </div>
  );
}

export function ChatScreen({
  me,
  character,
  onBack,
}: {
  me: Me;
  character: CharacterView;
  onBack: () => void;
}) {
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [lastText, setLastText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const busy = pending !== null;
  const canChat = character.canChat;

  // Load chats, models, and usage once. Creates the first chat (with its greeting) if none exists.
  // The guard stops React's development mode from running this twice.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const [list, groups, u] = await Promise.all([
          api.chats(character.id),
          api.models(),
          api.usage(),
        ]);
        setModels(groups.flatMap((g) => g.models));
        setUsage(u);
        const first = list[0] ?? (canChat ? await api.createChat(character.id) : null);
        setChats(first && list.length === 0 ? [first] : list);
        setChatId(first?.id ?? null);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!chatId) return;
    api.messages(chatId).then(setMessages).catch((err) => setError(errorText(err)));
  }, [chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // storage may be blocked; settings still work for this visit
    }
  }, [settings]);

  async function refresh(id: string) {
    const [msgs, u] = await Promise.all([api.messages(id), api.usage()]);
    setMessages(msgs);
    setUsage(u);
  }

  async function send(text: string) {
    if (!chatId || busy || !canChat) return;
    const model = settings.model || models[0] || "";
    if (!model) {
      setError("No model available. Check the provider settings on the server.");
      return;
    }

    setError("");
    setLastText(text);
    setDraft("");
    setPending(text);

    try {
      await api.send(chatId, {
        content: text,
        model,
        temperature: settings.temperature ?? undefined,
        maxTokens: settings.maxTokens ?? undefined,
      });
    } catch (err) {
      // Put the text back so it can be sent again
      setDraft(text);
      setError(errorText(err));
      setPending(null);
      return;
    }

    try {
      await refresh(chatId);
    } catch (err) {
      setError(errorText(err));
    }
    setPending(null);
  }

  function submit() {
    const text = draft.trim();
    if (text) void send(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function newChat() {
    setError("");
    try {
      const c = await api.createChat(character.id);
      setChats(await api.chats(character.id));
      setMessages([]);
      setChatId(c.id);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const usageText =
    usage && usage.limit !== null && usage.remaining !== null
      ? usage.remaining === 0
        ? `Daily limit reached (${usage.limit} messages). It resets at midnight.`
        : `${usage.remaining} of ${usage.limit} messages left today`
      : null;

  return (
    <div className="chat">
      <header className="chat-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="chat-title">
          <strong>{character.name}</strong>
          <span className="muted small">{settings.model || models[0] || "no model selected"}</span>
        </div>
        <div className="chat-actions">
          {chats.length > 0 && (
            <select
              className="chat-select"
              value={chatId ?? ""}
              onChange={(e) => setChatId(e.target.value)}
              disabled={busy}
            >
              {chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {chatLabel(c)}
                </option>
              ))}
            </select>
          )}
          <button className="btn-ghost" onClick={newChat} disabled={!canChat || busy}>
            New chat
          </button>
          <button className="btn-ghost" onClick={() => setShowSettings((s) => !s)}>
            Settings
          </button>
        </div>
      </header>

      {showSettings && (
        <section className="chat-settings">
          <label className="field">
            <span>Model</span>
            <select
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            >
              <option value="">Default ({models[0] ?? "none"})</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>
              Temperature{" "}
              {settings.temperature === null ? "(model default)" : settings.temperature.toFixed(2)}
            </span>
            <div className="row">
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={settings.temperature ?? DEFAULT_TEMP}
                disabled={settings.temperature === null}
                onChange={(e) => setSettings({ ...settings, temperature: Number(e.target.value) })}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.temperature === null}
                  onChange={(e) =>
                    setSettings({ ...settings, temperature: e.target.checked ? null : DEFAULT_TEMP })
                  }
                />
                default
              </label>
            </div>
          </div>

          <label className="field">
            <span>Max reply length (tokens)</span>
            <input
              type="number"
              min={1}
              max={8192}
              placeholder="model default"
              value={settings.maxTokens ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setSettings({
                  ...settings,
                  maxTokens: v === "" ? null : Math.min(8192, Math.max(1, Number(v))),
                });
              }}
            />
          </label>

          <p className="muted small">These settings are saved in this browser.</p>
        </section>
      )}

      {error && (
        <div className="chat-error">
          <span>{error}</span>
          {lastText && !busy && canChat && (
            <button className="btn-ghost" onClick={() => void send(lastText)}>
              Retry
            </button>
          )}
        </div>
      )}

      <main className="chat-body">
        {loading && <p className="muted center">Loading conversation…</p>}
        {!canChat && (
          <p className="notice">
            {character.name} is private to {character.ownerName ?? "its owner"}. You can see it, but
            not chat.
          </p>
        )}

        {messages.map((m) => (
          <Bubble
            key={m.id}
            mine={m.role === "user"}
            name={m.role === "user" ? me.displayName : character.name}
            text={m.content}
            time={m.createdAt}
          />
        ))}

        {pending && (
          <>
            <Bubble mine name={me.displayName} text={pending} sending />
            <div className="msg">
              <div className="avatar avatar-msg" style={avatarStyle(character.name)}>
                {initials(character.name)}
              </div>
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </>
        )}
        <div ref={endRef} />
      </main>

      <footer className="composer">
        {usageText && <div className="usage muted small">{usageText}</div>}
        <div className="composer-row">
          <textarea
            rows={1}
            value={draft}
            placeholder={canChat ? `Message ${character.name}…` : "This character is private"}
            disabled={!canChat || busy || !chatId}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            className="btn-primary send"
            onClick={submit}
            disabled={!canChat || busy || !draft.trim()}
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}

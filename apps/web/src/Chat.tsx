import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, streamMessage, type CharacterView, type ChatInfo, type Me, type Message, type Usage } from "./api";
import { DeleteDialog } from "./DeleteDialog";
import { Sidebar } from "./Sidebar";
import { avatarStyle, initials } from "./ui";
import { Formatted } from "./Markdown";

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

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

function chatLabel(c: ChatInfo): string {
  const d = new Date(c.updatedAt);
  const day = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 19V5M5.5 11.5 12 5l6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessageRow({
  mine,
  name,
  text,
  sending,
}: {
  mine: boolean;
  name: string;
  text: string;
  sending?: boolean;
}) {
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
              {sending && <span className="muted small">sending…</span>}
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
        <div className="bubble">
          <Formatted text={text} />
        </div>
      </div>
    </div>
  );
}

function TypingRow({ name }: { name: string }) {
  return (
    <div className="msg">
      <span className="avatar msg-avatar" style={avatarStyle(name)}>
        {initials(name)}
      </span>
      <div className="msg-body">
        <div className="msg-name">
          <span>{name}</span>
          <span className="badge">AI</span>
        </div>
        <div className="bubble typing">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function StreamingRow({ name, text }: { name: string; text: string }) {
  return (
    <div className="msg">
      <span className="avatar msg-avatar" style={avatarStyle(name)}>
        {initials(name)}
      </span>
      <div className="msg-body">
        <div className="msg-name">
          <span>{name}</span>
          <span className="badge">AI</span>
        </div>
        <div className="bubble">
          <Formatted text={text} />
          <span className="caret" />
        </div>
      </div>
    </div>
  );
}

export function ChatScreen({
  me,
  character,
  revision,
  onHome,
  onOpen,
  onCreate,
  onEdit,
  onDeleted,
  onLogout,
}: {
  me: Me;
  character: CharacterView;
  revision: number;
  onHome: () => void;
  onOpen: (c: CharacterView) => void;
  onCreate: () => void;
  onEdit: (c: CharacterView) => void;
  onDeleted: () => void;
  onLogout: () => void;
}) {
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [lastText, setLastText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const busy = pending !== null;
  const canChat = character.canChat;
  const canEdit = character.canEdit;
  const canDelete = character.canDelete;
  const isLimitError = /daily limit/.test(error);

  // Load this character's chats once. Starts the first chat (with its greeting) if there is none.
  // The guard stops React's development mode from running this twice.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        let list = await api.chats(character.id);
        if (list.length === 0 && canChat) list = [await api.createChat(character.id)];
        setChats(list);
        setChatId(list[0]?.id ?? null);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    api
      .models()
      .then((groups) => setModels(groups.flatMap((g) => g.models)))
      .catch(() => setModels([]));
    api.usage().then(setUsage).catch(() => setUsage(null));
  }, []);

  useEffect(() => {
    if (!chatId) return;
    setMessages([]);
    api.messages(chatId).then(setMessages).catch((err) => setError(errorText(err)));
  }, [chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, streamText]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // storage may be blocked; settings still apply for this visit
    }
  }, [settings]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

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
    setStreamText("");
    setPending(text);

    try {
      await streamMessage(
        chatId,
        {
          content: text,
          model,
          temperature: settings.temperature ?? undefined,
          maxTokens: settings.maxTokens ?? undefined,
        },
        (token) => setStreamText((s) => s + token),
      );
    } catch (err) {
      // Nothing was saved. Put the text back so it can be sent again
      setDraft(text);
      setError(errorText(err));
      setStreamText("");
      setPending(null);
      return;
    }

    try {
      await refresh(chatId);
    } catch (err) {
      setError(errorText(err));
    }
    setStreamText("");
    setPending(null);
  }

  function submit() {
    const text = draft.trim();
    if (text) void send(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  async function newChat() {
    setError("");
    try {
      const c = await api.createChat(character.id);
      setChats(await api.chats(character.id));
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
    <div className="app">
      <Sidebar
        me={me}
        activeId={character.id}
        revision={revision}
        onHome={onHome}
        onOpen={onOpen}
        onCreate={onCreate}
        onLogout={onLogout}
      />

      <section className="chat-main">
        <header className="chat-head">
          <span className="avatar head-avatar" style={avatarStyle(character.name)}>
            {initials(character.name)}
          </span>
          <div className="head-title">
            <strong>{character.name}</strong>
            <span className="muted small">By @{character.ownerName ?? "unknown"}</span>
          </div>
          <div className="head-actions">
            {chats.length > 1 && (
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
            <button className="pill-btn" onClick={newChat} disabled={!canChat || busy}>
              New chat
            </button>
            {canEdit && (
              <button className="pill-btn" onClick={() => onEdit(character)} disabled={busy}>
                Edit
              </button>
            )}
            {canDelete && (
              <button className="pill-btn danger-text" onClick={() => setShowDelete(true)} disabled={busy}>
                Delete
              </button>
            )}
            <button
              className="icon-btn"
              onClick={() => setShowSettings((s) => !s)}
              aria-label="Chat settings"
              title="Chat settings"
            >
              ⋯
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

        <main className="messages">
          <div className="messages-inner">
            {loading && <p className="muted center">Loading conversation…</p>}
            {!canChat && (
              <p className="notice">
                {character.name} is private to {character.ownerName ?? "its owner"}. You can see it,
                but not chat.
              </p>
            )}

            {messages.map((m) => (
              <MessageRow
                key={m.id}
                mine={m.role === "user"}
                name={m.role === "user" ? me.displayName : character.name}
                text={m.content}
              />
            ))}

            {pending && (
              <>
                <MessageRow mine name={me.displayName} text={pending} sending />
                {streamText ? (
                  <StreamingRow name={character.name} text={streamText} />
                ) : (
                  <TypingRow name={character.name} />
                )}
              </>
            )}
            <div ref={endRef} />
          </div>
        </main>

        <footer className="composer">
          {error && (
            <div className="chat-error">
              <span>{error}</span>
              {lastText && !busy && canChat && !isLimitError && (
                <button className="pill-btn" onClick={() => void send(lastText)}>
                  Retry
                </button>
              )}
            </div>
          )}
          {usageText && <div className="usage">{usageText}</div>}

          <div className="composer-box">
            <textarea
              ref={taRef}
              rows={1}
              value={draft}
              placeholder={canChat ? `Message ${character.name}…` : "This character is private"}
              disabled={!canChat || busy || !chatId}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button className="send-btn" onClick={submit} disabled={!canChat || busy || !draft.trim()} aria-label="Send">
              <SendIcon />
            </button>
          </div>
          <p className="footnote">Remember: everything characters say is made up!</p>
        </footer>
      </section>

      {showDelete && (
        <DeleteDialog
          character={character}
          onCancel={() => setShowDelete(false)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

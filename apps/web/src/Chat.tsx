import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  streamMessage,
  type CharacterView,
  type ChatInfo,
  type Me,
  type Message,
  type Usage,
} from "./api";
import { CharacterPanel } from "./CharacterPanel";
import { SETTINGS_KEY, loadSettings, sendableParams, type ChatSettings } from "./ChatSettings";
import { DeleteDialog } from "./DeleteDialog";
import { Formatted } from "./Markdown";
import { MessageItem } from "./MessageItem";
import { Icon } from "./Icons";
import { Sidebar, chatTitle } from "./Sidebar";
import { avatarStyle, initials } from "./ui";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

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

export function ChatScreen({
  me,
  character,
  chatId: chatIdFromUrl,
  revision,
  onHome,
  onOpen,
  onCreate,
  onEdit,
  onDeleted,
  onLogout,
  onSettings,
}: {
  me: Me;
  character: CharacterView;
  chatId: string | null;
  revision: number;
  onHome: () => void;
  onOpen: (c: CharacterView) => void;
  onCreate: () => void;
  onEdit: (c: CharacterView) => void;
  onDeleted: () => void;
  onLogout: () => void;
  onSettings: () => void;
}) {
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatInfo[]>([]);
  // The open chat. Comes from the URL when there is one, otherwise the newest chat.
  const [chatId, setChatId] = useState<string | null>(chatIdFromUrl);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [showDelete, setShowDelete] = useState(false);
  // Phone drawers: left = sidebar, right = character panel. Only one can be open at a time.
  const [drawer, setDrawer] = useState<"left" | "right" | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [working, setWorking] = useState(false);
  // The assistant message being refreshed, shown as typing in place
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [lastText, setLastText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const busy = pending !== null || working || refreshingId !== null;
  const canChat = character.canChat;
  const isLimitError = /daily limit/.test(error);

  // The chat address for a given chat id
  const chatPath = (id: string) => `/character/${character.id}/${id}`;

  // Opens a chat and puts it in the URL, so refresh and back/forward keep it
  function openChatId(id: string) {
    if (busy) return;
    setChatId(id);
    navigate(chatPath(id));
  }

  // Load this character's chats once. Opens the chat from the URL if it's one of ours,
  // otherwise the newest chat, and starts a first chat (with its greeting) if there is none.
  // The guard stops React's development mode from running this twice.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        let list = await api.chats(character.id);
        if (list.length === 0 && canChat) {
          await api.createChat(character.id);
          list = await api.chats(character.id);
        }
        setChats(list);

        const fromUrl = chatIdFromUrl ? list.find((c) => c.id === chatIdFromUrl) : undefined;
        const open = fromUrl ?? list[0];
        setChatId(open?.id ?? null);
        // If the URL pointed at a chat we can't see, fix the address to the one we opened
        if (open && open.id !== chatIdFromUrl) navigate(chatPath(open.id), { replace: true });
      } catch (err) {
        setError(errorText(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Moving between chats with back and forward changes the URL, so follow it
  useEffect(() => {
    if (chatIdFromUrl && chatIdFromUrl !== chatId && chats.some((c) => c.id === chatIdFromUrl)) {
      setChatId(chatIdFromUrl);
    }
  }, [chatIdFromUrl]);

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

  // Keep the chat settings in step with what the Settings page saves
  useEffect(() => {
    const refreshSettings = () => setSettings(loadSettings());
    window.addEventListener("storage", refreshSettings);
    return () => window.removeEventListener("storage", refreshSettings);
  }, []);

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

  // Close a phone drawer when the character changes
  useEffect(() => {
    setDrawer(null);
  }, [character.id]);

  // Reloads messages, usage, and the chat list, so titles and order stay current
  async function refresh(id: string) {
    const [msgs, u, list] = await Promise.all([
      api.messages(id),
      api.usage(),
      api.chats(character.id),
    ]);
    setMessages(msgs);
    setUsage(u);
    setChats(list);
  }

  // The model and settings every model-backed action sends
  function generationOptions() {
    return {
      model: settings.model || models[0] || "",
      ...sendableParams(settings),
    };
  }

  async function send(text: string) {
    if (!chatId || busy || !canChat) return;
    const gen = generationOptions();
    if (!gen.model) {
      setError("No model available. Check the provider settings on the server.");
      return;
    }

    setError("");
    setLastText(text);
    setDraft("");
    setStreamText("");
    setPending(text);

    try {
      await streamMessage(chatId, { content: text, ...gen }, (token) =>
        setStreamText((s) => s + token),
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
    if (busy) return;
    setError("");
    try {
      const c = await api.createChat(character.id);
      setChats(await api.chats(character.id));
      openChatId(c.id);
    } catch (err) {
      setError(errorText(err));
    }
  }

  function pickChat(id: string) {
    // Switching mid-reply would show the wrong conversation, so wait until it finishes
    if (!busy) openChatId(id);
  }

  async function renameChatItem(c: ChatInfo) {
    const next = window.prompt("Rename this chat (leave empty to use the date)", c.title);
    if (next === null) return;
    setError("");
    try {
      await api.renameChat(c.id, next);
      setChats(await api.chats(character.id));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function deleteChatItem(c: ChatInfo) {
    if (!window.confirm(`Delete "${chatTitle(c)}"? Its messages are removed for good.`)) return;
    setError("");
    try {
      await api.deleteChat(c.id);
      let remaining = await api.chats(character.id);
      // Deleting the last chat starts a fresh one, so the chat screen is never empty
      if (remaining.length === 0 && canChat) {
        await api.createChat(character.id);
        remaining = await api.chats(character.id);
      }
      setChats(remaining);
      // If the open chat was deleted, move to the next one and update the address
      if (c.id === chatId && remaining[0]) openChatId(remaining[0].id);
    } catch (err) {
      setError(errorText(err));
    }
  }

  // Runs one action that changes messages, then reloads the chat
  async function runWork(task: () => Promise<unknown>, typing: boolean) {
    if (!chatId || busy) return;
    setError("");
    setWorking(typing);
    try {
      await task();
      await refresh(chatId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setWorking(false);
    }
  }

  function saveEdit(m: Message, text: string, resend: boolean) {
    if (!resend) {
      void runWork(() => api.editMessage(m.id, text), false);
      return;
    }
    const gen = generationOptions();
    if (!gen.model) {
      setError("No model available. Check the provider settings on the server.");
      return;
    }
    void runWork(() => api.editMessage(m.id, text, { resend: true, ...gen }), true);
  }

  async function refreshReply(m: Message) {
    if (!chatId || busy) return;
    const gen = generationOptions();
    if (!gen.model) {
      setError("No model available. Check the provider settings on the server.");
      return;
    }

    setError("");
    setRefreshingId(m.id);
    try {
      await api.regenerate(m.id, gen);
      await refresh(chatId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRefreshingId(null);
    }
  }

  function deleteMessage(m: Message) {
    if (!window.confirm("Delete this message?")) return;
    void runWork(() => api.deleteMessage(m.id), false);
  }

  const usageText =
    usage && usage.limit !== null && usage.remaining !== null
      ? usage.remaining === 0
        ? `Daily limit reached (${usage.limit} messages). It resets at midnight.`
        : `${usage.remaining} of ${usage.limit} messages left today`
      : null;

  return (
    <div className={drawer ? `app drawer-open drawer-${drawer}` : "app"}>
      <Sidebar
        me={me}
        activeId={character.id}
        revision={revision}
        chatPanel={{
          chats,
          activeChatId: chatId,
          onPick: (id) => {
            pickChat(id);
            setDrawer(null);
          },
          onNew: newChat,
          onRename: renameChatItem,
          onDelete: deleteChatItem,
        }}
        onHome={onHome}
        onOpen={onOpen}
        onCreate={onCreate}
        onSettings={onSettings}
        onLogout={onLogout}
      />

      {/* Tapping the dark area behind an open drawer closes it */}
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(null)} />}

      <section className="chat-main">
        {/* Phones only: icons open the sidebar (left) and the character panel (right) */}
        <div className="chat-mobile-bar">
          <button
            className="icon-btn"
            onClick={() => setDrawer(drawer === "left" ? null : "left")}
            aria-label="Open sidebar"
            title="Sidebar"
          >
            <Icon name="chat" size={18} />
          </button>
          {chats.length > 1 && (
            <select
              className="chat-select"
              value={chatId ?? ""}
              onChange={(e) => pickChat(e.target.value)}
              disabled={busy}
            >
              {chats.map((c) => (
                <option key={c.id} value={c.id}>
                  {chatTitle(c)}
                </option>
              ))}
            </select>
          )}
          <button className="pill-btn" onClick={newChat} disabled={!canChat || busy}>
            New chat
          </button>
          <button
            className="icon-btn"
            onClick={() => setDrawer(drawer === "right" ? null : "right")}
            aria-label="Open character panel"
            title="Character"
          >
            <Icon name="flag" size={18} />
          </button>
        </div>

        <main className="messages">
          <div className="messages-inner">
            {loading && <p className="muted center">Loading conversation…</p>}
            {!canChat && (
              <p className="notice">
                {character.name} is private to {character.ownerName ?? "its owner"}. You can see it,
                but not chat.
              </p>
            )}

            {messages.map((m, i) => {
              // The message being refreshed shows the typing dots where its text was
              if (m.id === refreshingId) {
                return <TypingRow key={m.id} name={character.name} />;
              }

              const newest = i === messages.length - 1;
              const answersAUserMessage = i > 0 && messages[i - 1].role === "user";
              return (
                <MessageItem
                  key={m.id}
                  message={m}
                  mine={m.role === "user"}
                  name={m.role === "user" ? me.displayName : character.name}
                  canRefresh={newest && m.role === "assistant" && answersAUserMessage}
                  disabled={busy}
                  onSave={saveEdit}
                  onRefresh={refreshReply}
                  onDelete={deleteMessage}
                />
              );
            })}

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
            {working && <TypingRow name={character.name} />}
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
            <button
              className="send-btn"
              onClick={submit}
              disabled={!canChat || busy || !draft.trim()}
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </div>
          <p className="footnote">Remember: everything characters say is made up!</p>
        </footer>
      </section>

      <CharacterPanel character={character} onEdit={onEdit} />

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

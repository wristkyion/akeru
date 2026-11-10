import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  MaintenanceError,
  type CharacterView,
  type ChatInfo,
  type GenerationPolicy,
  type Me,
  type Message,
  type Usage,
} from "./api";
import { Avatar } from "./Avatar";
import { CharacterPanel } from "./CharacterPanel";
import { SETTINGS_KEY, loadSettings, sendableParams, type ChatSettings } from "./ChatSettings";
import { DeleteDialog } from "./DeleteDialog";
import { Icon } from "./Icons";
import { Formatted } from "./Markdown";
import { MessageItem } from "./MessageItem";
import { loadPrefs } from "./prefs";
import { RevealRow } from "./RevealRow";
import type { RevealMode } from "./reveal";
import { Sidebar, chatTitle } from "./Sidebar";
import { avatarStyle, initials } from "./ui";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

// Rough token count: about four characters per token. Good enough for a warning.
const roughTokens = (text: string) => Math.ceil(text.length / 4);

// A reply that is being revealed word by word
type Revealing = { id: string; text: string; mode: RevealMode } | null;

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

function GenerateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M4 12h10M10 6l6 6-6 6M19 5v14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
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
  picId,
}: {
  mine: boolean;
  name: string;
  text: string;
  sending?: boolean;
  picId?: string | null;
}) {
  return (
    <div className={mine ? "msg msg-user" : "msg"}>
      {!mine && <Avatar name={name} pictureId={picId} className="avatar msg-avatar" />}
      <div className="msg-body">
        <div className="msg-name">
          {mine ? (
            <>
              {sending && <span className="muted small">sending…</span>}
              <span>{name}</span>
              <Avatar name={name} pictureId={picId} className="avatar avatar-xs" />
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

function TypingRow({ name, picId }: { name: string; picId?: string | null }) {
  return (
    <div className="msg">
      <Avatar name={name} pictureId={picId} className="avatar msg-avatar" />
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
  // The open chat. Set after the chat list loads, so an invalid address is never requested.
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [policy, setPolicy] = useState<GenerationPolicy | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);
  const [showDelete, setShowDelete] = useState(false);
  // Phone drawers: left = sidebar, right = character panel. Only one can be open at a time.
  const [drawer, setDrawer] = useState<"left" | "right" | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revealing, setRevealing] = useState<Revealing>(null);
  const [working, setWorking] = useState(false);
  // The assistant message being refreshed, shown as typing until its new text is ready
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [lastText, setLastText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // The selected persona's picture, or null. Your bubbles use it, falling back to your account picture.
  const [personaPicId, setPersonaPicId] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState<string | null>(null);
  const myPicId = personaPicId ?? me.pictureId;
  const myName = personaName ?? me.displayName;

  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const busy =
    pending !== null || working || generating || refreshingId !== null || revealing !== null;
  const canChat = character.canChat;
  const isLimitError = /daily limit/.test(error);
  // Generate needs the character to have spoken last, and an empty box
  const lastMessage = messages[messages.length - 1];
  const canGenerate =
    canChat && !busy && draft.trim() === "" && lastMessage?.role === "assistant";

  // The chat address for a given chat id
  const chatPath = (id: string) => `/character/${character.id}/${id}`;

  // Opens a chat and puts it in the URL, so refresh and back/forward keep it
  function openChatId(id: string) {
    if (busy) return;
    setChatId(id);
    navigate(chatPath(id));
  }

  // Starts the word-by-word reveal for a reply. Instant mode skips it.
  function startReveal(id: string, text: string) {
    const mode = loadPrefs().chat.animation;
    if (mode === "instant") return;
    setRevealing({ id, text, mode });
  }

  // Loads the selected persona's picture, so your bubbles show it
  // Loads the selected persona's picture and name, so your bubbles show them
  function loadPersonaPic() {
    api
      .personas()
      .then((r) => {
        const selected = r.personas.find((p) => p.selected);
        setPersonaPicId(selected?.pictureId ?? null);
        setPersonaName(selected?.name ?? null);
      })
      .catch(() => {
        setPersonaPicId(null);
        setPersonaName(null);
      });
  }

  // Load this character's chats once. Opens the chat from the address if it's one of ours.
  // If the address names a chat that isn't ours, show "Invalid chat" and open the newest one.
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

        if (chatIdFromUrl && !fromUrl) {
          setError("Invalid chat. Opened your latest chat instead.");
        }
        // Keep the address in step with the chat that's actually open
        if (open && open.id !== chatIdFromUrl) {
          navigate(chatPath(open.id), { replace: true });
        }
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

  // Models, policy, usage, and the selected persona's picture
  useEffect(() => {
    api
      .models()
      .then((groups) => setModels(groups.flatMap((g) => g.models)))
      .catch(() => setModels([]));
    api.getPolicy().then(setPolicy).catch(() => setPolicy(null));
    api.usage().then(setUsage).catch(() => setUsage(null));
    loadPersonaPic();
  }, []);

  useEffect(() => {
    if (!chatId) return;
    setMessages([]);
    api.messages(chatId).then(setMessages).catch((err) => setError(errorText(err)));
  }, [chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

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

  // Reloads messages, usage, the chat list, and the persona picture, so changes show up
  async function refresh(id: string) {
    const [msgs, u, list] = await Promise.all([
      api.messages(id),
      api.usage(),
      api.chats(character.id),
    ]);
    setMessages(msgs);
    setUsage(u);
    setChats(list);
    loadPersonaPic();
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
    setPending(text);

    let reply: Message;
    try {
      // The whole reply comes back at once. The word-by-word look is added in the browser.
      reply = await api.send(chatId, { content: text, ...gen });
    } catch (err) {
      setPending(null);
      if (err instanceof MaintenanceError) {
        window.dispatchEvent(new CustomEvent("akeru:maintenance", { detail: err.message }));
        return;
      }
      // Nothing was saved. Put the text back so it can be sent again
      setDraft(text);
      setError(errorText(err));
      return;
    }

    setPending(null);
    startReveal(reply.id, reply.content);
    try {
      await refresh(chatId);
    } catch (err) {
      setError(errorText(err));
    }
  }

  // Generate: ask for one more message from the character, after the latest one
  async function generate() {
    if (!chatId || busy || !canGenerate) return;
    const gen = generationOptions();
    if (!gen.model) {
      setError("No model available. Check the provider settings on the server.");
      return;
    }

    setError("");
    setGenerating(true);
    try {
      const next = await api.generate(chatId, gen);
      setGenerating(false);
      startReveal(next.id, next.content);
      await refresh(chatId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setGenerating(false);
    }
  }

  // The composer's one button: Send when there's text, Generate when the box is empty
  function primaryAction() {
    if (draft.trim()) void send(draft.trim());
    else void generate();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (draft.trim()) void send(draft.trim());
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
  async function runWork(task: () => Promise<unknown>) {
    if (!chatId || busy) return;
    setError("");
    try {
      await task();
      await refresh(chatId);
    } catch (err) {
      setError(errorText(err));
    }
  }

  // Edit & resend: write a new reply, then reveal it like a new message
  async function resendEdit(m: Message, text: string) {
    if (!chatId || busy) return;
    const gen = generationOptions();
    if (!gen.model) {
      setError("No model available. Check the provider settings on the server.");
      return;
    }

    setError("");
    setWorking(true);
    try {
      const out = (await api.editMessage(m.id, text, { resend: true, ...gen })) as {
        user: Message;
        reply: Message;
      };
      setWorking(false);
      startReveal(out.reply.id, out.reply.content);
      await refresh(chatId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setWorking(false);
    }
  }

  function saveEdit(m: Message, text: string, resend: boolean) {
    if (resend) {
      void resendEdit(m, text);
      return;
    }
    void runWork(() => api.editMessage(m.id, text));
  }

  // Refresh: write a new reply to the newest assistant message, then reveal it in place
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
      const fresh = await api.regenerate(m.id, gen);
      // The typing dots give way to the reveal, in the same place
      setRefreshingId(null);
      startReveal(m.id, fresh.content);
      await refresh(chatId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRefreshingId(null);
    }
  }

  function deleteMessage(m: Message) {
    if (!window.confirm("Delete this message?")) return;
    void runWork(() => api.deleteMessage(m.id));
  }

  // A reply being revealed may not be in the saved list yet. Show it at the end
  // with the same id, so it stays in place once the saved message arrives.
  const rows: Message[] =
    revealing && !messages.some((m) => m.id === revealing.id)
      ? [
          ...messages,
          {
            id: revealing.id,
            chatId: chatId ?? "",
            role: "assistant",
            content: revealing.text,
            createdAt: Date.now(),
          },
        ]
      : messages;

  const usageText =
    usage && usage.limit !== null && usage.remaining !== null
      ? usage.remaining === 0
        ? `Daily limit reached (${usage.limit} messages). It resets at midnight.`
        : `${usage.remaining} of ${usage.limit} messages left today`
      : null;

  const hasText = draft.trim().length > 0;

  // Estimate the prompt: the character's background, plus the recent history, plus the draft.
  // Only shown when the admin has turned the warning on.
  const promptTokens = (() => {
    if (!policy) return 0;
    const persona = [character.description, character.definition, character.personality]
      .filter(Boolean)
      .join("\n");
    const history = messages
      .slice(-policy.contextMessages)
      .map((m) => m.content)
      .join("\n");
    return roughTokens(persona) + roughTokens(history) + roughTokens(draft);
  })();
  const promptLarge =
    !!policy && policy.warnPrompt && promptTokens > policy.modelWindow * policy.warnAt;

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

            {rows.map((m, i) => {
              // The message being refreshed shows the typing dots until its new text is ready
              if (m.id === refreshingId) {
                return <TypingRow key={m.id} name={character.name} picId={character.avatarPath} />;
              }

              // The reply being revealed, bubble by bubble
              if (revealing && m.id === revealing.id) {
                return (
                  <RevealRow
                    key={m.id}
                    name={character.name}
                    text={revealing.text}
                    mode={revealing.mode}
                    onDone={() => setRevealing(null)}
                    picId={character.avatarPath}
                  />
                );
              }

              const newest = i === rows.length - 1;
              const answersAUserMessage = i > 0 && rows[i - 1].role === "user";
              return (
                <MessageItem
                  key={m.id}
                  message={m}
                  mine={m.role === "user"}
                    name={m.role === "user" ? myName : character.name}
                  pictureId={m.role === "user" ? myPicId : character.avatarPath}
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
                  <MessageRow mine name={myName} text={pending} sending picId={myPicId} />
                <TypingRow name={character.name} picId={character.avatarPath} />
              </>
            )}
            {(working || generating) && <TypingRow name={character.name} picId={character.avatarPath} />}
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
          {promptLarge && (
            <div className="usage warn-text">
              This prompt is large (about {promptTokens} of {policy!.modelWindow} tokens). Long chats
              may lose early messages.
            </div>
          )}
          {policy && (
            <div className="usage muted small">Context: last {policy.contextMessages} messages</div>
          )}

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
              className={hasText ? "send-btn" : "send-btn generate-btn"}
              onClick={primaryAction}
              disabled={hasText ? !canChat || busy : !canGenerate}
              aria-label={hasText ? "Send" : "Generate message"}
              title={hasText ? "Send" : "Generate another message from the character"}
            >
              {hasText ? <SendIcon /> : <GenerateIcon />}
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

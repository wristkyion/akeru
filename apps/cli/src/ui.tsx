import { useEffect, useState } from "react";
import { Box, Text, render, useApp, useInput, useStdout } from "ink";
import {
  addMessage,
  createOwnedChat,
  listMessages,
  listOwnChats,
  listVisibleCharacters,
  sendChatMessage,
  type CharacterView as Character,
  type Chat,
  type DB,
  type Message,
  type Registry,
  type User,
} from "@chars/core";

export interface UiDeps {
  db: DB;
  registry: Registry;
  defaultModel: string;
  version: string;
  historyLimit: number;
  actor: User;
}

const SIDEBAR_W = 24;
const RIGHT_W = 30;
const PAGE = 5;
const HELP = "/model <ref>  /temp <0-2|reset>  /max <n|reset>  /context <2-500>  /retry  /new  /exit";

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function startChat(db: DB, actor: User, c: Character): Chat {
  const chat = createOwnedChat(db, actor, c.id);
  if (c.greeting) addMessage(db, chat.id, "assistant", c.greeting);
  return chat;
}

// Estimated terminal lines for one message: header, wrapped content, spacing
function messageLines(m: Message, width: number): number {
  const wrapped = m.content
    .split("\n")
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0);
  return 2 + wrapped;
}

// Newest messages that fit in `height` lines, skipping `offset` from the bottom
function fitMessages(messages: Message[], offset: number, width: number, height: number): Message[] {
  const end = Math.max(0, messages.length - offset);
  const picked: Message[] = [];
  let used = 0;
  for (let i = end - 1; i >= 0; i--) {
    const lines = messageLines(messages[i], width);
    if (used + lines > height && picked.length > 0) break;
    picked.unshift(messages[i]);
    used += lines;
  }
  return picked;
}

// Parses "0.7", "1024", or "reset". Returns null when the value is invalid.
function parseOption(arg: string, min: number, max: number): number | "reset" | null {
  if (arg === "reset") return "reset";
  const n = Number(arg);
  if (arg === "" || Number.isNaN(n) || n < min || n > max) return null;
  return n;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function App({ deps }: { deps: UiDeps }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const cols = stdout.columns || 100;
  const rows = stdout.rows || 30;

  const [characters] = useState<Character[]>(() => listVisibleCharacters(deps.db, deps.actor));
  const [sel, setSel] = useState(0);
  const [focus, setFocus] = useState<"input" | "sidebar">("input");
  const [character, setCharacter] = useState<Character | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [lastText, setLastText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [model, setModel] = useState(deps.defaultModel);
  const [temperature, setTemperature] = useState<number | undefined>(undefined);
  const [maxTokens, setMaxTokens] = useState<number | undefined>(undefined);
  const [contextLimit, setContextLimit] = useState(deps.historyLimit);

  const showChat = (c: Character, ch: Chat) => {
    setOffset(0);
    setCharacter(c);
    setChat(ch);
    setMessages(listMessages(deps.db, ch.id));
  };

  const openCharacter = (c: Character) => {
    if (!c.canChat) {
      setStatus(`${c.name} is private to ${c.ownerName ?? "its owner"}`);
      return;
    }
    // Open the most recent chat, or start one with the greeting
    const ch = listOwnChats(deps.db, deps.actor, c.id)[0] ?? startChat(deps.db, deps.actor, c);
    showChat(c, ch);
    setFocus("input");
    setStatus("");
  };

  const newChat = () => {
    if (!character) return;
    showChat(character, startChat(deps.db, deps.actor, character));
    setStatus("new chat started");
  };

  const runCommand = (line: string) => {
    const [cmd = "", ...rest] = line.slice(1).trim().split(/\s+/);
    const arg = rest.join(" ");

    switch (cmd) {
      case "exit":
        exit();
        return;
      case "new":
        newChat();
        return;
      case "help":
        setStatus(HELP);
        return;
      case "model":
        if (!arg) return setStatus("usage: /model provider/model");
        setModel(arg);
        setStatus(`model: ${arg}`);
        return;
      case "temp": {
        const v = parseOption(arg, 0, 2);
        if (v === null) return setStatus("usage: /temp 0 to 2, or /temp reset");
        setTemperature(v === "reset" ? undefined : v);
        setStatus(v === "reset" ? "temperature: model default" : `temperature: ${v}`);
        return;
      }
      case "max": {
        const v = parseOption(arg, 1, 8192);
        if (v === null) return setStatus("usage: /max 1 to 8192, or /max reset");
        setMaxTokens(v === "reset" ? undefined : v);
        setStatus(v === "reset" ? "max tokens: model default" : `max tokens: ${v}`);
        return;
      }
      case "context": {
        const v = parseOption(arg, 2, 500);
        if (v === null) return setStatus("usage: /context 2 to 500, or /context reset");
        const limit = v === "reset" ? deps.historyLimit : v;
        setContextLimit(limit);
        setStatus(`context: last ${limit} messages`);
        return;
      }
      case "retry":
        if (lastText) void submit(lastText);
        else setStatus("nothing to retry");
        return;
      default:
        setStatus(`unknown command: /${cmd}`);
    }
  };

  const submit = async (text: string) => {
    if (text.startsWith("/")) {
      runCommand(text);
      return;
    }
    if (!character || !chat) {
      setDraft((d) => d || text);
      setStatus("Pick a character first: Tab, arrows, Enter");
      return;
    }

    setLastText(text);
    setBusy(true);
    setPending(text);
    setStatus("");
    try {
      await sendChatMessage({
        db: deps.db,
        registry: deps.registry,
        characterId: character.id,
        chatId: chat.id,
        content: text,
        model,
        options: { temperature, maxTokens },
        historyLimit: contextLimit,
        user: { name: deps.actor.displayName, persona: deps.actor.persona },
      });
      setMessages(listMessages(deps.db, chat.id));
      setOffset(0);
    } catch (err) {
      // Put the text back in the box so Enter resends it
      setDraft((d) => d || text);
      setStatus(`error: ${errorText(err)}. Enter resends, Ctrl+R retries.`);
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (characters[0]) openCharacter(characters[0]);
  }, []);

  useInput((input, key) => {
    if (focus === "sidebar") {
      if (key.tab || key.escape) {
        setFocus("input");
        return;
      }
      if (key.upArrow) {
        setSel((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSel((i) => Math.min(characters.length - 1, i + 1));
        return;
      }
      if (key.return && characters[sel]) openCharacter(characters[sel]);
      return;
    }

    if (key.tab) {
      const current = characters.findIndex((c) => c.id === character?.id);
      setSel(Math.max(0, current));
      setFocus("sidebar");
      return;
    }
    if (key.ctrl && input === "n") {
      newChat();
      return;
    }
    if (key.ctrl && input === "r") {
      if (!busy && lastText) void submit(lastText);
      return;
    }
    if (key.pageUp) {
      setOffset((o) => Math.min(o + PAGE, Math.max(0, messages.length - 1)));
      return;
    }
    if (key.pageDown) {
      setOffset((o) => Math.max(0, o - PAGE));
      return;
    }

    if (busy) return;

    if (key.return) {
      const text = draft.trim();
      setDraft("");
      if (text) void submit(text);
      return;
    }
    if (key.escape) {
      setDraft("");
      return;
    }
    if (key.backspace || key.delete) {
      setDraft((d) => d.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) setDraft((d) => d + input);
  });

  // Layout
  const centerW = Math.max(30, cols - SIDEBAR_W - RIGHT_W);
  const innerW = centerW - 4;
  const draftLines = Math.max(1, Math.ceil((draft.length + 1) / innerW));
  const inputH = Math.min(8, draftLines + 2);
  const hint =
    status || (offset > 0 ? "Scrolled up. PageDown returns to the latest messages." : "");
  const messageH = Math.max(6, rows - 1 - inputH - (hint ? 1 : 0));
  const extraLines = (pending ? 3 : 0) + (busy ? 1 : 0);
  const shown = fitMessages(messages, offset, innerW - 8, messageH - 2 - extraLines);

  return (
    <Box width={cols} height={rows - 1}>
      {/* Left: characters */}
      <Box
        flexDirection="column"
        width={SIDEBAR_W}
        borderStyle="single"
        borderColor={focus === "sidebar" ? "green" : "gray"}
        paddingX={1}
      >
        <Text bold>Characters</Text>
        {characters.length === 0 && <Text dimColor>none yet</Text>}
        {characters.map((c, i) => {
          const selected = focus === "sidebar" && i === sel;
          const active = character?.id === c.id;
          return (
            <Text
              key={c.id}
              color={selected ? "black" : active ? "green" : undefined}
              backgroundColor={selected ? "green" : undefined}
            >
              # {c.name}
            </Text>
          );
        })}
      </Box>

      {/* Center: messages, status, input */}
      <Box flexDirection="column" width={centerW}>
        <Box
          flexDirection="column"
          height={messageH}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
        >
          {shown.map((m) => (
            <Box key={m.id} flexDirection="column" marginBottom={1} flexShrink={0}>
              <Box flexShrink={0}>
                <Text bold color={m.role === "user" ? "magenta" : "green"}>
                  {m.role === "user" ? deps.actor.displayName : (character?.name ?? "assistant")}
                </Text>
                <Text dimColor>  {clock(m.createdAt)}</Text>
              </Box>
              <Text>{m.content}</Text>
            </Box>
          ))}
          {pending && (
            <Box flexDirection="column" marginBottom={1} flexShrink={0}>
              <Box flexShrink={0}>
                <Text bold color="magenta">{deps.actor.displayName}</Text>
                <Text dimColor>  sending…</Text>
              </Box>
              <Text>{pending}</Text>
            </Box>
          )}
          {busy && <Text color="cyan">{character?.name} is typing…</Text>}
        </Box>

        {hint && (
          <Text color={status ? "yellow" : "gray"} wrap="truncate-end">
            {hint}
          </Text>
        )}

        <Box
          borderStyle="round"
          borderColor={focus === "input" ? "cyan" : "gray"}
          height={inputH}
          paddingX={1}
        >
          {draft ? (
            <Text>
              {draft}
              <Text color="gray">█</Text>
            </Text>
          ) : (
            <Text dimColor>Send a message…</Text>
          )}
        </Box>
      </Box>

      {/* Right: info and shortcuts */}
      <Box
        flexDirection="column"
        width={RIGHT_W}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
      >
        <Text bold color="cyan">akeru</Text>
        <Text>v{deps.version}</Text>
        <Text> </Text>
        <Text dimColor>you  {deps.actor.username}</Text>
        {character && <Text color="green">@{character.name}</Text>}
        <Text> </Text>
        <Text dimColor>model</Text>
        <Text>{model || "(none)"}</Text>
        <Text> </Text>
        <Text dimColor>temperature  {temperature ?? "default"}</Text>
        <Text dimColor>max tokens   {maxTokens ?? "default"}</Text>
        <Text dimColor>context      last {contextLimit}</Text>
        <Text> </Text>
        <Text dimColor>Tab        characters</Text>
        <Text dimColor>Enter      send</Text>
        <Text dimColor>Ctrl+R     retry</Text>
        <Text dimColor>Ctrl+N     new chat</Text>
        <Text dimColor>PgUp/PgDn  scroll</Text>
        <Text dimColor>/help      commands</Text>
      </Box>
    </Box>
  );
}

export async function runUi(deps: UiDeps): Promise<void> {
  const instance = render(<App deps={deps} />);
  await instance.waitUntilExit();
}

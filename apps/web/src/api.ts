// Talks to the Akeru server. Every request except login sends the saved token.

export interface Me {
  id: string;
  username: string;
  displayName: string;
  persona: string;
  role: "admin" | "user";
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: number;
}

export interface CharacterView {
  id: string;
  name: string;
  description: string;
  definition: string;
  personality: string;
  greeting: string;
  tags: string[];
  avatarPath: string | null;
  visibility: "public" | "private";
  ownerId: string | null;
  ownerName: string | null;
  canChat: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface LoginResult {
  token: string;
  sessionId: string;
  user: Me;
}

export class ApiError extends Error {
  status: number;
  retryAfter: number | null;

  constructor(message: string, status: number, retryAfter: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// The token lives in the browser until you log out or it expires (30 days)
const TOKEN_KEY = "akeru.token";

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

// The app registers a handler here, so a 401 on any request sends the user back to login
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean; // default true; login is the only call that sends no token
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractError(data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data) {
    const e = (data as { error: unknown }).error;
    return typeof e === "string" ? e : "Please check the form and try again.";
  }
  return null;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Is it running?", 0);
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    if (res.status === 401 && auth) {
      tokenStore.clear();
      unauthorizedHandler?.();
    }
    const retry = Number(res.headers.get("Retry-After"));
    throw new ApiError(
      extractError(data) ?? `Request failed (${res.status})`,
      res.status,
      Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }
  return data as T;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac/.test(ua)
          ? "Mac"
          : "Linux";
  return `${browser} on ${os}`;
}

export interface ChatInfo {
  id: string;
  characterId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface Usage {
  used: number;
  limit: number | null;
  remaining: number | null;
}

export interface ModelGroup {
  provider: string;
  models: string[];
  error?: string;
}

export interface CharacterInput {
  name: string;
  description?: string;
  definition?: string;
  personality?: string;
  greeting?: string;
  tags?: string[];
  visibility?: "public" | "private";
}

// Generation settings. Only the ones the user turned on are sent.
export interface GenParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
}

export const api = {
  publicConfig: () => request<{ signup: boolean }>("/api/public-config", { auth: false }),
  login: (username: string, password: string) =>
    request<LoginResult>("/api/login", {
      method: "POST",
      body: { username, password, device: deviceName() },
      auth: false,
    }),
  signup: (username: string, password: string, displayName: string) =>
    request<LoginResult>("/api/signup", {
      method: "POST",
      body: { username, password, displayName: displayName || undefined, device: deviceName() },
      auth: false,
    }),
  logout: () => request<{ ok: boolean }>("/api/logout", { method: "POST", body: {} }),
  me: () => request<Me>("/api/me"),
  changePassword: (current: string, next: string) =>
    request<{ ok: boolean }>("/api/me/password", { method: "POST", body: { current, next } }),
  usage: () => request<Usage>("/api/me/usage"),
  characters: () => request<CharacterView[]>("/api/characters"),
  createCharacter: (input: CharacterInput) =>
    request<CharacterView>("/api/characters", { method: "POST", body: input }),
  updateCharacter: (id: string, input: Partial<CharacterInput>) =>
    request<CharacterView>(`/api/characters/${id}`, { method: "PUT", body: input }),
  deleteCharacter: (id: string) =>
    request<{ ok: boolean }>(`/api/characters/${id}`, { method: "DELETE" }),
  chats: (characterId: string) => request<ChatInfo[]>(`/api/characters/${characterId}/chats`),
  createChat: (characterId: string) =>
    request<ChatInfo>("/api/chats", { method: "POST", body: { characterId } }),
  messages: (chatId: string) => request<Message[]>(`/api/chats/${chatId}/messages`),
  send: (chatId: string, body: { content: string; model: string; temperature?: number; maxTokens?: number }) =>
    request<Message>(`/api/chats/${chatId}/messages`, { method: "POST", body }),
  models: () => request<ModelGroup[]>("/api/models"),
  renameChat: (chatId: string, title: string) =>
    request<ChatInfo>(`/api/chats/${chatId}`, { method: "PATCH", body: { title } }),
  deleteChat: (chatId: string) =>
    request<{ ok: boolean }>(`/api/chats/${chatId}`, { method: "DELETE" }),
    editMessage: (
      messageId: string,
      content: string,
      opts?: { resend?: boolean; model?: string; temperature?: number; maxTokens?: number },
    ) => request<Message | { user: Message; reply: Message }>(`/api/messages/${messageId}`, {
      method: "PATCH",
      body: { content, ...opts },
    }),
    deleteMessage: (messageId: string) =>
      request<{ ok: boolean }>(`/api/messages/${messageId}`, { method: "DELETE" }),
    regenerate: (messageId: string, body: { model: string; temperature?: number; maxTokens?: number }) =>
    request<Message>(`/api/messages/${messageId}/regenerate`, { method: "POST", body }),
    generate: (chatId: string, body: { model: string } & GenParams) =>
    request<Message>(`/api/chats/${chatId}/generate`, { method: "POST", body }),
    getPolicy: () => request<GenerationPolicy>("/api/generation-policy"),
    savePolicy: (policy: GenerationPolicy) =>
      request<GenerationPolicy>("/api/generation-policy", { method: "PUT", body: policy }),
};

export interface GenerationPolicy {
  contextMessages: number;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  repetitionPenalty: number;
  frequencyPenalty: number;
  presencePenalty: number;
  seed: number | null;
  enabled: Record<string, boolean>;
}

// Streams a reply. Calls onToken for each piece as it arrives, and resolves when the
// full message has been saved on the server.
export async function streamMessage(
  chatId: string,
  body: { content: string; model: string; temperature?: number; maxTokens?: number },
  onToken: (text: string) => void,
): Promise<void> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`/api/chats/${chatId}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Is it running?", 0);
  }

  if (!res.ok) {
    const data = safeJson(await res.text());
    if (res.status === 401) {
      tokenStore.clear();
      unauthorizedHandler?.();
    }
    const retry = Number(res.headers.get("Retry-After"));
    throw new ApiError(
      extractError(data) ?? `Request failed (${res.status})`,
      res.status,
      Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }

  if (!res.body) throw new ApiError("The server sent no reply.", 0);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let saved: Message | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Events are separated by a blank line
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf("\n\n");

      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;

      const payload = JSON.parse(data);
      if (event === "token") onToken(payload.text);
      else if (event === "done") saved = payload as Message;
      else if (event === "error") throw new ApiError(payload.error, 502);
    }
  }

  if (!saved) throw new ApiError("The reply was cut off. Your message was not saved.", 0);
}

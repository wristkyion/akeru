export interface Character {
  id: string;
  name: string;
  description: string;
  personality: string;
  greeting: string;
  avatarPath: string | null;
}

export interface Chat {
  id: string;
  characterId: string;
  title: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: "system" | "user" | "assistant";
  content: string;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.toString() ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  listCharacters: () => request<Character[]>("GET", "/api/characters"),
  createCharacter: (input: { name: string; description?: string; greeting?: string }) =>
    request<Character>("POST", "/api/characters", input),
  listChats: (characterId: string) =>
    request<Chat[]>("GET", `/api/characters/${characterId}/chats`),
  createChat: (characterId: string) => request<Chat>("POST", "/api/chats", { characterId }),
  listMessages: (chatId: string) => request<Message[]>("GET", `/api/chats/${chatId}/messages`),
  sendMessage: (chatId: string, content: string, model: string) =>
    request<Message>("POST", `/api/chats/${chatId}/messages`, { content, model }),
  listModels: () =>
    request<{ provider: string; models: string[]; error?: string }[]>("GET", "/api/models"),
};

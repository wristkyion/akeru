import { getCharacter, type Character } from "./characters.js";
import type { DB } from "./db.js";
import { addMessage, listMessages } from "./chats.js";
import { completeWithRef, type createProviderRegistry } from "./providers/registry.js";
import type { GenerationOptions } from "./providers/types.js";

export type Registry = ReturnType<typeof createProviderRegistry>;

export function systemPrompt(c: Character, user?: UserProfile): string {
  const lines = [
    `You are ${c.name}. You are roleplaying this character, so stay in character at all times.`,
    c.description && `Who you are: ${c.description}`,
    c.personality && `How you speak and act: ${c.personality}`,
    user && `You are talking with ${user.name}.`,
    user?.persona && `About ${user.name}: ${user.persona}`,
    `Reply as ${c.name} would, in first person, with natural dialogue. Use *asterisks* for short actions when they fit.`,
    "Keep replies conversational and a natural length. React to what the user just said and remember earlier messages.",
    "Do not add disclaimers or out-of-character notes, and do not talk about the underlying model or provider.",
  ];
  return lines.filter(Boolean).join("\n");
}

export interface UserProfile {
  name: string;
  persona: string;
}

export interface SendArgs {
  db: DB;
  registry: Registry;
  characterId: string;
  chatId: string;
  content: string;
  model: string;
  options?: GenerationOptions;
  historyLimit?: number; // how many past messages the model sees
  user?: UserProfile;
}

export async function sendChatMessage(args: SendArgs) {
  const character = getCharacter(args.db, args.characterId);
  if (!character) throw new Error("character not found");

  const limit = args.historyLimit ?? 40;
  const history = listMessages(args.db, args.chatId)
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));

  const messages = [
    { role: "system" as const, content: systemPrompt(character) },
    ...history,
    { role: "user" as const, content: args.content },
  ];

  const text = await completeWithRef(args.registry, args.model, messages, args.options);

  // Save both messages only after the model succeeds
  addMessage(args.db, args.chatId, "user", args.content);
  return addMessage(args.db, args.chatId, "assistant", text);
}
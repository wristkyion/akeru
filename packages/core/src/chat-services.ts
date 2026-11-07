import { getCharacter, type Character } from "./characters.js";
import type { DB } from "./db.js";
import { addMessage, listMessages, titleFromMessage } from "./chats.js";
import { completeWithRef, type createProviderRegistry } from "./providers/registry.js";
import type { GenerationOptions } from "./providers/types.js";
import type { User } from "./auth.js";
import { assertWithinLimit } from "./limits.js";
import { fillPlaceholders } from "./placeholders.js";

export type Registry = ReturnType<typeof createProviderRegistry>;

export function systemPrompt(c: Character, user?: UserProfile): string {
  const names = { char: c.name, user: user?.name ?? "the user" };
  const fill = (text: string) => fillPlaceholders(text, names);

  const lines = [
    `You are ${c.name}. You are roleplaying this character, so stay in character at all times.`,
    c.description && `Who you are: ${fill(c.description)}`,
    c.definition && `Background and details about you:\n${fill(c.definition)}`,
    c.personality && `How you speak and act: ${fill(c.personality)}`,
    user && `You are talking with ${user.name}.`,
    user?.persona && `About ${user.name}: ${fill(user.persona)}`,
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
  historyLimit?: number;
  user?: UserProfile;
  actor?: User;        // when set, the daily limit applies to this account
  dailyLimit?: number; // 0 or undefined means no limit
  onToken?: (token: string) => void;
}

export async function sendChatMessage(args: SendArgs) {
  if (args.actor && args.dailyLimit) assertWithinLimit(args.db, args.actor, args.dailyLimit);

  const character = getCharacter(args.db, args.characterId);
  if (!character) throw new Error("character not found");

  const limit = args.historyLimit ?? 40;
  const history = listMessages(args.db, args.chatId)
    .slice(-limit)
    .map((m) => ({ role: m.role, content: m.content }));

  const messages = [
    { role: "system" as const, content: systemPrompt(character, args.user) },
    ...history,
    { role: "user" as const, content: args.content },
  ];

  const text = await completeWithRef(args.registry, args.model, messages, args.options, args.onToken);

  // Save both messages only after the model succeeds
  addMessage(args.db, args.chatId, "user", args.content);
  const reply = addMessage(args.db, args.chatId, "assistant", text);

  // The first message names the chat, unless it already has a title
  args.db
    .prepare("UPDATE chats SET title = ? WHERE id = ? AND title = ''")
    .run(titleFromMessage(args.content), args.chatId);

  return reply;
}

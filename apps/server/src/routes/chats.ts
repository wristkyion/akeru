import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  assertCanSend,
  createOwnedChat,
  deleteOwnChat,
  getOwnChat,
  listMessages,
  listOwnChats,
  sendChatMessage,
  startOwnedChat,
  type Chat,
  type User,
} from "@chars/core";
import type { AppContext } from "../context.js";
import { errorText, httpError } from "../guard.js";

const NewChat = z.object({
  characterId: z.string().min(1),
  title: z.string().optional(),
});

const SendMessage = z.object({
  content: z.string().min(1),
  model: z.string().min(3),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
});

export async function chatRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get<{ Params: { characterId: string } }>("/api/characters/:characterId/chats", async (req) =>
    listOwnChats(ctx.db, req.actor as User, req.params.characterId),
  );

  app.post("/api/chats", async (req, reply) => {
    const parsed = NewChat.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const actor = req.actor as User;
    try {
      const chat = startOwnedChat(ctx.db, req.actor as User, parsed.data.characterId);
      return reply.code(201).send(chat);
    } catch (err) {
      return httpError(reply, err);
    }
  });

  app.get<{ Params: { id: string } }>("/api/chats/:id/messages", async (req, reply) => {
    if (!getOwnChat(ctx.db, req.actor as User, req.params.id)) {
      return reply.code(404).send({ error: "chat not found" });
    }
    return listMessages(ctx.db, req.params.id);
  });

  app.delete<{ Params: { id: string } }>("/api/chats/:id", async (req, reply) =>
    deleteOwnChat(ctx.db, req.actor as User, req.params.id)
      ? { ok: true }
      : reply.code(404).send({ error: "chat not found" }),
  );

  app.post<{ Params: { id: string } }>("/api/chats/:id/messages", async (req, reply) => {
    const parsed = SendMessage.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const actor = req.actor as User;
    let chat: Chat;
    try {
      // Checks that the chat is yours and the character is still available to you
      chat = assertCanSend(ctx.db, actor, req.params.id);
    } catch (err) {
      return httpError(reply, err);
    }

    const { content, model, temperature, maxTokens, topP } = parsed.data;
    try {
      return await sendChatMessage({
        db: ctx.db,
        registry: ctx.registry,
        characterId: chat.characterId,
        chatId: chat.id,
        content,
        model,
        options: { temperature, maxTokens, topP },
        historyLimit: ctx.settings.chat.historyLimit,
        user: { name: actor.displayName, persona: actor.persona },
        actor,
        dailyLimit: ctx.settings.limits.dailyMessages,
      });
    } catch (err) {
      const message = errorText(err);
      if (/daily limit/.test(message)) return reply.code(429).send({ error: message });
      // A failed model call is a server-side problem, so it returns 502
      return reply.code(502).send({ error: message });
    }
  });
}

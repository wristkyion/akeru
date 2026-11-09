import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  assertCanSend,
  assertWithinLimit,
  deleteOwnChat,
  getOwnChat,
  getGenerationPolicy,
  listMessages,
  listOwnChats,
  policyToOptions,
  renameOwnChat,
  sendChatMessage,
  startOwnedChat,
  promptProfileFor,
  type Chat,
  type User,
} from "@chars/core";
import type { AppContext } from "../context.js";
import { errorText, httpError } from "../guard.js";
import { GenParams } from "../params.js";

// The body is validated, but generation values from the user are ignored:
// the admin's policy decides what the model receives.
const SendMessage = z.object({
  content: z.string().min(1),
  model: z.string().min(3),
  ...GenParams.shape,
});

const RenameChat = z.object({ title: z.string().max(80) });

export async function chatRoutes(app: FastifyInstance, ctx: AppContext) {
  // Chats you own with one character
  app.get<{ Params: { characterId: string } }>("/api/characters/:characterId/chats", async (req) =>
    listOwnChats(ctx.db, req.actor as User, req.params.characterId),
  );

  // Start a new chat. The greeting is saved as the first message.
  app.post("/api/chats", async (req, reply) => {
    const parsed = z.object({ characterId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const chat = startOwnedChat(ctx.db, req.actor as User, parsed.data.characterId);
      return reply.code(201).send(chat);
    } catch (err) {
      return httpError(reply, err);
    }
  });

  // Messages in one of your chats
  app.get<{ Params: { id: string } }>("/api/chats/:id/messages", async (req, reply) => {
    if (!getOwnChat(ctx.db, req.actor as User, req.params.id)) {
      return reply.code(404).send({ error: "chat not found" });
    }
    return listMessages(ctx.db, req.params.id);
  });

  // Delete one of your chats and its messages
  app.delete<{ Params: { id: string } }>("/api/chats/:id", async (req, reply) =>
    deleteOwnChat(ctx.db, req.actor as User, req.params.id)
      ? { ok: true }
      : reply.code(404).send({ error: "chat not found" }),
  );

  // Rename one of your chats. An empty title falls back to the date in the app.
  app.patch<{ Params: { id: string } }>("/api/chats/:id", async (req, reply) => {
    const parsed = RenameChat.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "title must be 80 characters or fewer" });
    try {
      return renameOwnChat(ctx.db, req.actor as User, req.params.id, parsed.data.title);
    } catch (err) {
      return httpError(reply, err);
    }
  });

  // Send a message and wait for the full reply
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

    const policy = getGenerationPolicy(ctx.db);
    try {
      return await sendChatMessage({
        db: ctx.db,
        registry: ctx.registry,
        characterId: chat.characterId,
        chatId: chat.id,
        content: parsed.data.content,
        model: parsed.data.model,
        options: policyToOptions(policy),
        historyLimit: policy.contextMessages,
        user: promptProfileFor(ctx.db, actor),
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

  // Send a message and stream the reply word by word (Server-Sent Events)
  app.post<{ Params: { id: string } }>("/api/chats/:id/stream", async (req, reply) => {
    const parsed = SendMessage.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const actor = req.actor as User;
    let chat: Chat;
    try {
      // Checks run before the stream starts, so errors still come back as normal HTTP codes
      chat = assertCanSend(ctx.db, actor, req.params.id);
      assertWithinLimit(ctx.db, actor, ctx.settings.limits.dailyMessages);
    } catch (err) {
      const message = errorText(err);
      if (/daily limit/.test(message)) return reply.code(429).send({ error: message });
      return httpError(reply, err);
    }

    const policy = getGenerationPolicy(ctx.db);

    // From here on the response is a stream of events
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const saved = await sendChatMessage({
        db: ctx.db,
        registry: ctx.registry,
        characterId: chat.characterId,
        chatId: chat.id,
        content: parsed.data.content,
        model: parsed.data.model,
        options: policyToOptions(policy),
        historyLimit: policy.contextMessages,
        user: promptProfileFor(ctx.db, actor),
        actor,
        dailyLimit: ctx.settings.limits.dailyMessages,
        onToken: (token) => sendEvent("token", { text: token }),
      });
      sendEvent("done", saved);
    } catch (err) {
      // Nothing is saved when the model fails partway, matching the normal route
      sendEvent("error", { error: errorText(err) });
    } finally {
      reply.raw.end();
    }
  });
}

import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  MAX_MESSAGE_LENGTH,
  deleteOwnMessage,
  editOwnMessage,
  regenerateReply,
  resendFromMessage,
  generateNext,
  getGenerationPolicy,
  policyToOptions,
  type ReplyOptions,
  type User,
} from "@chars/core";
import type { AppContext } from "../context.js";
import { errorText, httpError } from "../guard.js";
import { GenParams, toOptions, type GenParamsInput } from "../params.js";

const EditBody = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  resend: z.boolean().optional(),
  model: z.string().min(3).optional(),
  ...GenParams.shape,
});

const GenerateBody = z.object({
  model: z.string().min(3),
  ...GenParams.shape,
});

// Daily limit: 429. Missing or not allowed: 404/403. Anything else is a model failure: 502.
function fail(reply: FastifyReply, err: unknown) {
  const message = errorText(err);
  if (/daily limit/.test(message)) return reply.code(429).send({ error: message });
  if (/^(only |no message to answer|message not found|this character is no longer available)/.test(message)) {
    return httpError(reply, err);
  }
  return reply.code(502).send({ error: message });
}

export async function messageRoutes(app: FastifyInstance, ctx: AppContext) {
  const optionsFor = (actor: User, body: { model: string } & GenParamsInput): ReplyOptions => {
    const policy = getGenerationPolicy(ctx.db);
    return {
      model: body.model,
      options: policyToOptions(policy),
      historyLimit: policy.contextMessages,
      user: { name: actor.displayName, persona: actor.persona },
      actor,
      dailyLimit: ctx.settings.limits.dailyMessages,
    };
  };

  // Plain edit: change the text. With resend: true, also write a new reply to this user message.
  app.patch<{ Params: { id: string } }>("/api/messages/:id", async (req, reply) => {
    const parsed = EditBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const actor = req.actor as User;
    const { content, resend, model } = parsed.data;
    try {
      if (!resend) return editOwnMessage(ctx.db, actor, req.params.id, content);
      if (!model) return reply.code(400).send({ error: "choose a model to send the edited message" });
      return await resendFromMessage(
        ctx.db,
        ctx.registry,
        req.params.id,
        content,
        optionsFor(actor, { ...parsed.data, model }),
      );
    } catch (err) {
      return fail(reply, err);
    }
  });

  // Refresh: replace the newest assistant reply with a new one
  app.post<{ Params: { id: string } }>("/api/messages/:id/regenerate", async (req, reply) => {
    const parsed = GenerateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      return await regenerateReply(
        ctx.db,
        ctx.registry,
        req.params.id,
        optionsFor(req.actor as User, parsed.data),
      );
    } catch (err) {
      return fail(reply, err);
    }
  });

  // Generate: adds one more message from the character after the latest one
  app.post<{ Params: { id: string } }>("/api/chats/:id/generate", async (req, reply) => {
    const parsed = GenerateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { model, temperature, maxTokens } = parsed.data;
    try {
      return await generateNext(
        ctx.db,
        ctx.registry,
        req.params.id,
        optionsFor(req.actor as User, parsed.data),
      );
    } catch (err) {
      return fail(reply, err);
    }
  });
  
  app.delete<{ Params: { id: string } }>("/api/messages/:id", async (req, reply) =>
    deleteOwnMessage(ctx.db, req.actor as User, req.params.id)
      ? { ok: true }
      : reply.code(404).send({ error: "message not found" }),
  );
}

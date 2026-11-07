import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createOwnedCharacter,
  deleteOwnedCharacter,
  getVisibleCharacter,
  listVisibleCharacters,
  updateOwnedCharacter,
  type User,
} from "@chars/core";
import type { AppContext } from "../context.js";
import { httpError } from "../guard.js";

const CharacterInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  personality: z.string().optional(),
  greeting: z.string().optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

export async function characterRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/characters", async (req) => listVisibleCharacters(ctx.db, req.actor as User));

  app.get<{ Params: { id: string } }>("/api/characters/:id", async (req, reply) => {
    const c = getVisibleCharacter(ctx.db, req.actor as User, req.params.id);
    return c ?? reply.code(404).send({ error: "character not found" });
  });

  app.post("/api/characters", async (req, reply) => {
    const parsed = CharacterInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return reply.code(201).send(createOwnedCharacter(ctx.db, req.actor as User, parsed.data));
  });

  app.put<{ Params: { id: string } }>("/api/characters/:id", async (req, reply) => {
    const parsed = CharacterInput.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      return updateOwnedCharacter(ctx.db, req.actor as User, req.params.id, parsed.data);
    } catch (err) {
      return httpError(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>("/api/characters/:id", async (req, reply) => {
    try {
      return deleteOwnedCharacter(ctx.db, req.actor as User, req.params.id)
        ? { ok: true }
        : reply.code(404).send({ error: "character not found" });
    } catch (err) {
      return httpError(reply, err);
    }
  });
}

import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  MAX_PERSONAS,
  createPersona,
  deletePersona,
  listPersonas,
  selectPersona,
  updatePersona,
  type User,
} from "@chars/core";
import type { AppContext } from "../context.js";
import { errorText } from "../guard.js";

const PersonaBody = z.object({
  name: z.string().max(40),
  personality: z.string().max(500),
});

// Not found: 404. Any rule being broken (empty text, too many, etc.): 400.
function personaError(reply: FastifyReply, err: unknown) {
  const message = errorText(err);
  return reply.code(/not found/.test(message) ? 404 : 400).send({ error: message });
}

export async function personaRoutes(app: FastifyInstance, ctx: AppContext) {
  // The account's personas, oldest first. The selected one is marked.
  app.get("/api/personas", async (req) => ({
    max: MAX_PERSONAS,
    personas: listPersonas(ctx.db, (req.actor as User).id),
  }));

  // Add a persona. The first one becomes selected automatically.
  app.post("/api/personas", async (req, reply) => {
    const parsed = PersonaBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "name and personality are required" });
    try {
      const persona = createPersona(ctx.db, (req.actor as User).id, parsed.data);
      return reply.code(201).send(persona);
    } catch (err) {
      return personaError(reply, err);
    }
  });

  // Change a persona's name or personality
  app.put<{ Params: { id: string } }>("/api/personas/:id", async (req, reply) => {
    const parsed = PersonaBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "name and personality are required" });
    try {
      return updatePersona(ctx.db, (req.actor as User).id, req.params.id, parsed.data);
    } catch (err) {
      return personaError(reply, err);
    }
  });

  // Make this persona the selected one for the account
  app.post<{ Params: { id: string } }>("/api/personas/:id/select", async (req, reply) => {
    try {
      return selectPersona(ctx.db, (req.actor as User).id, req.params.id);
    } catch (err) {
      return personaError(reply, err);
    }
  });

  // Delete a persona. If it was selected, the oldest remaining one is selected.
  app.delete<{ Params: { id: string } }>("/api/personas/:id", async (req, reply) => {
    try {
      deletePersona(ctx.db, (req.actor as User).id, req.params.id);
      return { ok: true };
    } catch (err) {
      return personaError(reply, err);
    }
  });
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { getMaintenance, resolveToken, type User } from "@chars/core";
import type { AppContext } from "./context.js";

// Adds the logged-in user to each request
declare module "fastify" {
  interface FastifyRequest {
    actor?: User;
    sessionId?: string;
  }
}

const PUBLIC_ROUTES = new Set(["/api/health", "/api/login", "/api/signup", "/api/public-config"]);

// Every /api route needs a valid session token, except the public ones above
export function guard(ctx: AppContext) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/") || PUBLIC_ROUTES.has(path)) return;

    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const found = token ? resolveToken(ctx.db, token) : null;
    if (!found) return reply.code(401).send({ error: "login required" });

    req.actor = found.user;
    req.sessionId = found.sessionId;

    // Maintenance: only admins can use the chat and send routes while it's on
    const isChatWrite = /^\/api\/(chats|messages)/.test(path) && req.method !== "GET";
    if (isChatWrite && found.user.role !== "admin") {
      const m = getMaintenance(ctx.db);
      if (m.on) {
        return reply.code(503).send({
          error: "maintenance",
          message: m.message || "Akeru is under maintenance. Please try again later.",
        });
      }
    }
  };
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// "not found" becomes 404. Other access-rule errors become 403.
export function httpError(reply: FastifyReply, err: unknown) {
  const message = errorText(err);
  return reply.code(/not found/.test(message) ? 404 : 403).send({ error: message });
}

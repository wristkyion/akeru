import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LoginLimiter, authenticate, createSession, revokeSession } from "@chars/core";
import type { AppContext } from "../context.js";

const LoginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  device: z.string().max(80).optional(),
});

// Limits per user (5 failures) and per IP address (20 failures)
const byUser = new LoginLimiter(5);
const byIp = new LoginLimiter(20);

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post("/api/login", async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "username and password are required" });

    const { password, device } = parsed.data;
    const name = parsed.data.username.trim().toLowerCase();
    const userKey = `user:${name}`;
    const ipKey = `ip:${req.ip}`;

    const wait = Math.max(byUser.check(userKey), byIp.check(ipKey));
    if (wait > 0) {
      return reply
        .code(429)
        .header("Retry-After", String(wait))
        .send({ error: `too many attempts, try again in ${wait} seconds` });
    }

    const user = authenticate(ctx.db, name, password);
    if (!user) {
      byUser.fail(userKey);
      byIp.fail(ipKey);
      // Same message for a wrong password and an unknown user, so usernames can't be guessed
      return reply.code(401).send({ error: "invalid username or password" });
    }

    byUser.reset(userKey);
    const { token, session } = createSession(
      ctx.db,
      user.id,
      device ?? req.headers["user-agent"] ?? "unknown device",
    );
    return reply.code(201).send({ token, sessionId: session.id, user });
  });

  app.post("/api/logout", async (req) => {
    if (req.sessionId) revokeSession(ctx.db, req.sessionId);
    return { ok: true };
  });

  app.get("/api/me", async (req) => req.actor);
}

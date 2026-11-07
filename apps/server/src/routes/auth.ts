import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LoginLimiter, authenticate, createSession, revokeSession, signUp } from "@chars/core";
import type { AppContext } from "../context.js";

const LoginBody = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  device: z.string().max(80).optional(),
});

// Limits per user (5 failures) and per IP address (20 failures)
const byUser = new LoginLimiter(5);
const byIp = new LoginLimiter(20);

const SignupBody = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(256),
  displayName: z.string().max(40).optional(),
  device: z.string().max(80).optional(),
});

// Every sign-up attempt counts, successful or not: 5 per IP per 15 minutes
const signupByIp = new LoginLimiter(5);

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

  app.get("/api/public-config", async () => ({
    signup: ctx.settings.auth.signup === "open",
  }));

  app.post("/api/signup", async (req, reply) => {
    if (ctx.settings.auth.signup !== "open") {
      return reply.code(403).send({ error: "sign-up is closed on this server" });
    }

    const parsed = SignupBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "username must be 3-32 characters and password at least 8" });
    }

    const ipKey = `signup:${req.ip}`;
    const wait = signupByIp.check(ipKey);
    if (wait > 0) {
      return reply
        .code(429)
        .header("Retry-After", String(wait))
        .send({ error: `too many attempts, try again in ${wait} seconds` });
    }
    signupByIp.fail(ipKey);

    try {
      const { username, password, displayName, device } = parsed.data;
      const user = signUp(ctx.db, { username, password, displayName });
      const { token, session } = createSession(
        ctx.db,
        user.id,
        device ?? req.headers["user-agent"] ?? "unknown device",
      );
      return reply.code(201).send({ token, sessionId: session.id, user });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already exists/.test(message)) {
        return reply.code(409).send({ error: "that username is taken" });
      }
      return reply.code(400).send({ error: message });
    }
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  LoginLimiter,
  authenticate,
  changeOwnPassword,
  createSession,
  getUsage,
  revokeSession,
  signUp,
  getGenerationPolicy,
  saveGenerationPolicy,
  getMaintenance,
  setMaintenance,
  updateOwnProfile,
  type GenerationPolicy,
  type User,
} from "@chars/core";
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
  bio: z.string().max(160).optional(),
  email: z.string().min(3).max(254),
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

  const ProfileBody = z.object({
    displayName: z.string().max(40),
    bio: z.string().max(160),
  });

  // The user saves their own display name and bio
  app.patch("/api/me/profile", async (req, reply) => {
    const parsed = ProfileBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "display name must be 1-40 characters, and bio up to 160" });
    }
    try {
      return updateOwnProfile(ctx.db, req.actor as User, parsed.data);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const PasswordBody = z.object({
    current: z.string().min(1).max(256),
    next: z.string().min(8).max(256),
  });

  app.post("/api/me/password", async (req, reply) => {
    const parsed = PasswordBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "enter your current password and a new one of at least 8 characters" });
    }
    try {
      const user = changeOwnPassword(
        ctx.db,
        req.actor as User,
        parsed.data.current,
        parsed.data.next,
        req.sessionId,
      );
      return { ok: true, user };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: message });
    }
  });

  app.get("/api/me/usage", async (req) =>
    getUsage(ctx.db, req.actor as User, ctx.settings.limits.dailyMessages),
  );

  const PolicyBody = z.object({
    contextMessages: z.number().int().min(2).max(500),
    maxTokens: z.number().int().min(1).max(8192),
    temperature: z.number().min(0).max(2),
    topP: z.number().min(0).max(1),
    topK: z.number().int().min(0).max(200),
    minP: z.number().min(0).max(1),
    repetitionPenalty: z.number().min(0).max(2),
    frequencyPenalty: z.number().min(-2).max(2),
    presencePenalty: z.number().min(-2).max(2),
    seed: z.number().int().min(0).nullable(),
    enabled: z.record(z.string(), z.boolean()),
    warnPrompt: z.boolean(),
    modelWindow: z.number().int().min(512).max(2000000),
    warnAt: z.number().min(0.1).max(1),
  });

  // Everyone can read the policy, so the chat can show what's in effect
  app.get("/api/generation-policy", async () => getGenerationPolicy(ctx.db));

  // Only the admin can change it
  app.put("/api/generation-policy", async (req, reply) => {
    if ((req.actor as User).role !== "admin") {
      return reply.code(403).send({ error: "only the admin can change generation settings" });
    }
    const parsed = PolicyBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    saveGenerationPolicy(ctx.db, parsed.data as GenerationPolicy);
    return getGenerationPolicy(ctx.db);
  });

  // Anyone can read whether maintenance is on, so the app can show the right page
  app.get("/api/maintenance", async (_req, reply) => {
    return getMaintenance(ctx.db);
  });

  // Only the admin can change it
  app.put("/api/maintenance", async (req, reply) => {
    if ((req.actor as User).role !== "admin") {
      return reply.code(403).send({ error: "only the admin can change maintenance" });
    }
    const body = req.body as { on?: unknown; message?: unknown };
    setMaintenance(ctx.db, {
      on: body.on === true,
      message: typeof body.message === "string" ? body.message.slice(0, 200) : "",
    });
    return getMaintenance(ctx.db);
  });
  
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
      const user = signUp(ctx.db, {
        username,
        password,
        displayName,
        email: parsed.data.email,
        bio: parsed.data.bio,
      });
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

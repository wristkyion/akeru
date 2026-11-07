import Fastify from "fastify";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSettings, openDatabase } from "@chars/core";
import { createProviderRegistry, loadProviderConfigs } from "@chars/core";
import type { AppContext } from "./context.js";
import { characterRoutes } from "./routes/characters.js";
import { chatRoutes } from "./routes/chats.js";
import { modelRoutes } from "./routes/models.js";
import { existsSync } from "node:fs";
import { guard } from "./guard.js";
import { authRoutes } from "./routes/auth.js";
import fastifyStatic from "@fastify/static";
import { messageRoutes } from "./routes/messages.js";

// apps/server/src -> project root
const root = fileURLToPath(new URL("../../../", import.meta.url));
const configDir = resolve(root, "config");

const settings = loadSettings(configDir);
const db = openDatabase(resolve(root, settings.database.path));

const app = Fastify({ logger: true });

const configs = loadProviderConfigs(configDir);
const ctx: AppContext = {
  db,
  settings,
  configs,
  registry: createProviderRegistry(configs),
};

app.addHook("onRequest", guard(ctx));
await authRoutes(app, ctx);
await characterRoutes(app, ctx);
await chatRoutes(app, ctx);
await messageRoutes(app, ctx);
await modelRoutes(app, ctx);

app.get("/api/health", async () => ({
  ok: true,
  database: "connected",
  port: settings.server.port,
}));

const webDist = resolve(root, "apps/web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api")
      ? reply.code(404).send({ error: "not found" })
      : reply.sendFile("index.html"),
  );
}

await app.listen({ host: settings.server.host, port: settings.server.port });

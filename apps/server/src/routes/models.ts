import type { FastifyInstance } from "fastify";
import { listAllModels } from "@chars/core";
import type { AppContext } from "../context.js";

export async function modelRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/models", async () => listAllModels(ctx.configs));
}
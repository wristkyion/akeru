import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  canViewPicture,
  clearPicture,
  createPictureStore,
  pictureInfo,
  setPicture,
  type PictureTarget,
  type User,
} from "@chars/core";
import type { AppContext } from "../context.js";
import { errorText } from "../guard.js";

export interface PictureFiles {
  dir: string;
  keyPath: string;
}

// Reads the uploaded file. tooBig is true when the file went over the size limit.
async function uploadedPicture(req: FastifyRequest): Promise<{ data: Buffer; tooBig: boolean } | null> {
  const file = await req.file();
  if (!file) return null;
  try {
    const data = await file.toBuffer();
    return { data, tooBig: file.file.truncated };
  } catch {
    return { data: Buffer.alloc(0), tooBig: true };
  }
}

// Not found: 404. Anything else (wrong type, too large, etc.): 400.
function pictureError(reply: FastifyReply, err: unknown) {
  const message = errorText(err);
  return reply.code(/not found/.test(message) ? 404 : 400).send({ error: message });
}

export async function pictureRoutes(app: FastifyInstance, ctx: AppContext, files: PictureFiles) {
  const store = createPictureStore(files.dir, files.keyPath);

  async function upload(req: FastifyRequest, reply: FastifyReply, target: PictureTarget) {
    const up = await uploadedPicture(req);
    if (!up) return reply.code(400).send({ error: "choose a picture to upload" });
    if (up.tooBig) return reply.code(413).send({ error: "picture must be 2 MB or smaller" });
    try {
      const id = setPicture(ctx.db, store, target, (req.actor as User).id, up.data);
      return reply.code(201).send({ id, url: `/api/pictures/${id}` });
    } catch (err) {
      return pictureError(reply, err);
    }
  }

  async function clear(req: FastifyRequest, reply: FastifyReply, target: PictureTarget) {
    try {
      clearPicture(ctx.db, store, target, (req.actor as User).id);
      return { ok: true };
    } catch (err) {
      return pictureError(reply, err);
    }
  }

  // Account picture
  app.post("/api/me/picture", (req, reply) =>
    upload(req, reply, { kind: "user", id: (req.actor as User).id }),
  );
  app.delete("/api/me/picture", (req, reply) =>
    clear(req, reply, { kind: "user", id: (req.actor as User).id }),
  );

  // Persona picture (owner only)
  app.post<{ Params: { id: string } }>("/api/personas/:id/picture", (req, reply) =>
    upload(req, reply, { kind: "persona", id: req.params.id }),
  );
  app.delete<{ Params: { id: string } }>("/api/personas/:id/picture", (req, reply) =>
    clear(req, reply, { kind: "persona", id: req.params.id }),
  );

  // Character picture (owner only)
  app.post<{ Params: { id: string } }>("/api/characters/:id/picture", (req, reply) =>
    upload(req, reply, { kind: "character", id: req.params.id }),
  );
  app.delete<{ Params: { id: string } }>("/api/characters/:id/picture", (req, reply) =>
    clear(req, reply, { kind: "character", id: req.params.id }),
  );

  // Serves a picture after the access check. The file is decrypted only here.
  app.get<{ Params: { id: string } }>("/api/pictures/:id", async (req, reply) => {
    const viewer = req.actor as User;
    const info = pictureInfo(ctx.db, req.params.id);
    if (!info || !canViewPicture(ctx.db, viewer, req.params.id)) {
      return reply.code(404).send({ error: "picture not found" });
    }
    const data = store.read(req.params.id);
    if (!data) return reply.code(404).send({ error: "picture not found" });
    return reply
      .type(info.mime)
      .header("Cache-Control", "private, max-age=3600")
      .send(data);
  });
}

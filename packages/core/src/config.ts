import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ProviderConfig } from "./providers/types.js";
import { copyFileSync, mkdirSync } from "node:fs";

// Creates config files from their templates the first time, so a fresh clone starts without manual copying.
export function ensureConfigFiles(configDir: string): void {
  mkdirSync(configDir, { recursive: true });
  const live = join(configDir, "settings.json");
  const template = join(configDir, "settings.example.json");
  if (!existsSync(live) && existsSync(template)) copyFileSync(template, live);
}

const SettingsSchema = z.object({
  server: z
    .object({
      host: z.string().default("0.0.0.0"),
      port: z.number().int().min(1).max(65535).default(3000),
    })
    .default({}),
  database: z
    .object({
      path: z.string().default("config/chars.db"),
    })
    .default({}),
  chat: z
    .object({
      historyLimit: z.number().int().min(2).max(500).default(40),
    })
    .default({}),
  limits: z
    .object({
      // Messages each non-admin user can send per day. 0 means unlimited.
      dailyMessages: z.number().int().min(0).max(100000).default(50),
    })
    .default({}),
  user: z
    .object({
      name: z.string().default("you"),
      persona: z.string().default(""),
    })
    .default({}),
  auth: z
    .object({
      // "open": anyone who can reach the server can create an account
      // "closed": only the admin can create accounts (CLI)
      signup: z.enum(["open", "closed"]).default("closed"),
    })
    .default({}),
  providers: z
    .array(
      z.object({
        id: z.string().min(1),
        baseUrl: z.string().min(1),
        models: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function loadSettings(configDir: string): Settings {
  ensureConfigFiles(configDir);
  return SettingsSchema.parse(
    JSON.parse(readFileSync(join(configDir, "settings.json"), "utf8")),
  );
}

const SecretsSchema = z.record(z.string(), z.string());

export function loadProviderConfigs(configDir: string): ProviderConfig[] {
  const settings = loadSettings(configDir);

  const secretsPath = join(configDir, "secrets.json");
  const secrets = existsSync(secretsPath)
    ? SecretsSchema.parse(JSON.parse(readFileSync(secretsPath, "utf8")))
    : {};

  return settings.providers.map((p) => ({
    ...p,
    apiKey: secrets[p.id] || undefined,
  }));
}

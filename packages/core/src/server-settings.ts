import type { DB } from "./db.js";
import type { GenerationOptions } from "./providers/types.js";

// Parameters the admin controls. Users can't change these; the server ignores their values.
export interface GenerationPolicy {
  contextMessages: number; // how many past messages the model reads
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  repetitionPenalty: number;
  frequencyPenalty: number;
  presencePenalty: number;
  seed: number | null; // null = random each time
  // Which parameters are sent at all. A parameter that is off is never sent to the provider.
  enabled: Record<keyof Omit<GenerationPolicy, "enabled">, boolean>;
}

const DEFAULTS: GenerationPolicy = {
  contextMessages: 40,
  maxTokens: 1000,
  temperature: 1,
  topP: 1,
  topK: 0,
  minP: 0,
  repetitionPenalty: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  seed: null,
  enabled: {
    contextMessages: true,
    maxTokens: true,
    temperature: true,
    topP: false,
    topK: false,
    minP: false,
    repetitionPenalty: false,
    frequencyPenalty: false,
    presencePenalty: false,
    seed: false,
  },
};

const KEY = "generation_policy";

export function getGenerationPolicy(db: DB): GenerationPolicy {
  const row = db.prepare("SELECT value FROM server_settings WHERE key = ?").get(KEY) as
    | { value: string }
    | undefined;
  if (!row) return DEFAULTS;
  try {
    const saved = JSON.parse(row.value) as Partial<GenerationPolicy>;
    return {
      ...DEFAULTS,
      ...saved,
      enabled: { ...DEFAULTS.enabled, ...(saved.enabled ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveGenerationPolicy(db: DB, policy: GenerationPolicy): void {
  db.prepare(
    "INSERT INTO server_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(KEY, JSON.stringify(policy));
}

// Turns the policy into the options sent to the provider. Off parameters are left out.
export function policyToOptions(p: GenerationPolicy): GenerationOptions {
  const pick = <K extends keyof GenerationOptions>(key: K, value: GenerationOptions[K]) =>
    p.enabled[key as keyof GenerationPolicy] ? { [key]: value } : {};
  return {
    ...pick("temperature", p.temperature),
    ...pick("maxTokens", p.maxTokens),
    ...pick("topP", p.topP),
    ...pick("topK", p.topK),
    ...pick("minP", p.minP),
    ...pick("repetitionPenalty", p.repetitionPenalty),
    ...pick("frequencyPenalty", p.frequencyPenalty),
    ...pick("presencePenalty", p.presencePenalty),
    ...(p.enabled.seed && p.seed !== null ? { seed: p.seed } : {}),
  } as GenerationOptions;
}

const MAINTENANCE_KEY = "maintenance";

export interface MaintenanceState {
  on: boolean;
  message: string; // shown to users during maintenance
}

export function getMaintenance(db: DB): MaintenanceState {
  const row = db.prepare("SELECT value FROM server_settings WHERE key = ?").get(MAINTENANCE_KEY) as
    | { value: string }
    | undefined;
  if (!row) return { on: false, message: "" };
  try {
    const saved = JSON.parse(row.value) as Partial<MaintenanceState>;
    return { on: saved.on === true, message: typeof saved.message === "string" ? saved.message : "" };
  } catch {
    return { on: false, message: "" };
  }
}

export function setMaintenance(db: DB, state: MaintenanceState): void {
  db.prepare(
    "INSERT INTO server_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(MAINTENANCE_KEY, JSON.stringify(state));
}
import type { DB, ProviderConfig, Settings, createProviderRegistry } from "@chars/core";

export interface AppContext {
  db: DB;
  settings: Settings;
  configs: ProviderConfig[];
  registry: ReturnType<typeof createProviderRegistry>;
}
import type { ProviderConfig } from "./types.js";

export async function listModels(cfg: ProviderConfig, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const headers: Record<string, string> = {};
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  const res = await fetchImpl(`${cfg.baseUrl.replace(/\/+$/, "")}/models`, { headers });
  if (!res.ok) throw new Error(`${cfg.id} /models returned ${res.status}`);

  const data = (await res.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((m) => m.id);
}

export async function listAllModels(configs: ProviderConfig[]) {
  const results = await Promise.allSettled(
    configs.map(async (c) => ({
      provider: c.id,
      models: (await listModels(c)).map((m) => `${c.id}/${m}`),
    })),
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { provider: configs[i].id, models: [], error: String(r.reason) },
  );
}

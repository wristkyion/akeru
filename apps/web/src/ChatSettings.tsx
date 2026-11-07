import { useState } from "react";

// v2 of the saved settings. Older saved values are ignored once, so defaults apply.
export const SETTINGS_KEY = "akeru.chat-settings-v2";

export type ParamKey =
  | "maxTokens"
  | "temperature"
  | "topP"
  | "topK"
  | "minP"
  | "repetitionPenalty"
  | "frequencyPenalty"
  | "presencePenalty"
  | "seed";

interface ParamSpec {
  key: ParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  noSlider?: boolean;
  fallback: number; // the value used the first time the user turns it on
}

export const PARAM_SPECS: ParamSpec[] = [
  { key: "maxTokens", label: "Max response size (tokens)", min: 1, max: 8192, step: 1, integer: true, noSlider: true, fallback: 1000 },
  { key: "temperature", label: "Temperature", min: 0, max: 2, step: 0.05, fallback: 1 },
  { key: "topP", label: "Top P", min: 0, max: 1, step: 0.01, fallback: 1 },
  { key: "topK", label: "Top K", min: 0, max: 200, step: 1, integer: true, fallback: 40 },
  { key: "minP", label: "Min P", min: 0, max: 1, step: 0.01, fallback: 0.05 },
  { key: "repetitionPenalty", label: "Repetition penalty", min: 0, max: 2, step: 0.01, fallback: 1 },
  { key: "frequencyPenalty", label: "Frequency penalty", min: -2, max: 2, step: 0.01, fallback: 0 },
  { key: "presencePenalty", label: "Presence penalty", min: -2, max: 2, step: 0.01, fallback: 0 },
  { key: "seed", label: "Seed", min: 0, max: 2147483647, step: 1, integer: true, noSlider: true, fallback: 42 },
];

export interface ParamState {
  on: boolean;
  value: number;
}

export interface ChatSettings {
  model: string; // "" = first available model
  params: Record<ParamKey, ParamState>;
}

function defaults(): ChatSettings {
  const params = {} as Record<ParamKey, ParamState>;
  for (const spec of PARAM_SPECS) params[spec.key] = { on: false, value: spec.fallback };
  return { model: "", params };
}

export function loadSettings(): ChatSettings {
  const base = defaults();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ChatSettings>;
    return {
      model: typeof saved.model === "string" ? saved.model : "",
      params: { ...base.params, ...(saved.params ?? {}) },
    };
  } catch {
    return base;
  }
}

// Only the settings the user turned on are sent to the server
export function sendableParams(s: ChatSettings): Partial<Record<ParamKey, number>> {
  const out: Partial<Record<ParamKey, number>> = {};
  for (const spec of PARAM_SPECS) {
    const p = s.params[spec.key];
    if (p.on) out[spec.key] = p.value;
  }
  return out;
}

function ParamRow({
  spec,
  state,
  onChange,
}: {
  spec: ParamSpec;
  state: ParamState;
  onChange: (next: ParamState) => void;
}) {
  const clamp = (n: number) => {
    const v = Math.min(spec.max, Math.max(spec.min, n));
    return spec.integer ? Math.round(v) : v;
  };

  return (
    <div className="param">
      <label className="check param-title">
        <input
          type="checkbox"
          checked={state.on}
          onChange={(e) => onChange({ ...state, on: e.target.checked })}
        />
        {spec.label}
      </label>
      <div className="row">
        {!spec.noSlider && (
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={state.value}
            disabled={!state.on}
            onChange={(e) => onChange({ ...state, value: clamp(Number(e.target.value)) })}
          />
        )}
        <input
          type="number"
          className="param-num"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={state.value}
          disabled={!state.on}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== "" && !Number.isNaN(n)) onChange({ ...state, value: clamp(n) });
          }}
        />
      </div>
    </div>
  );
}

type Tab = "model" | "parameters";

export function ChatSettingsPanel({
  settings,
  models,
  onChange,
}: {
  settings: ChatSettings;
  models: string[];
  onChange: (next: ChatSettings) => void;
}) {
  const [tab, setTab] = useState<Tab>("parameters");

  const setParam = (key: ParamKey, next: ParamState) =>
    onChange({ ...settings, params: { ...settings.params, [key]: next } });

  return (
    <section className="chat-settings">
      <div className="settings-tabs">
        <button className={tab === "model" ? "tab active" : "tab"} onClick={() => setTab("model")}>
          Model
        </button>
        <button
          className={tab === "parameters" ? "tab active" : "tab"}
          onClick={() => setTab("parameters")}
        >
          Parameters
        </button>
        <button className="tab" disabled title="Coming later">
          Prompt
        </button>
        <button className="tab" disabled title="Coming later">
          Others
        </button>
      </div>

      {tab === "model" && (
        <label className="field">
          <span>Model</span>
          <select
            value={settings.model}
            onChange={(e) => onChange({ ...settings, model: e.target.value })}
          >
            <option value="">Default ({models[0] ?? "none"})</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      {tab === "parameters" && (
        <div className="param-list">
          {PARAM_SPECS.map((spec) => (
            <ParamRow
              key={spec.key}
              spec={spec}
              state={settings.params[spec.key]}
              onChange={(next) => setParam(spec.key, next)}
            />
          ))}
          <p className="muted small">
            Only checked settings are sent. Some providers reject settings they don't support. If a
            model errors after you turn one on, turn it off. Saved in this browser.
          </p>
        </div>
      )}
    </section>
  );
}

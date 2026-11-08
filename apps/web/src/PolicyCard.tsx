import { useEffect, useState } from "react";
import { api, type GenerationPolicy } from "./api";

type Key = Exclude<keyof GenerationPolicy, "enabled">;

const FIELDS: { key: Key; label: string; min: number; max: number; step: number; hint: string }[] = [
  { key: "contextMessages", label: "Context size (messages)", min: 2, max: 500, step: 1, hint: "How many past messages the model reads each reply." },
  { key: "maxTokens", label: "Max reply length (tokens)", min: 1, max: 8192, step: 1, hint: "Upper limit on one reply." },
  { key: "temperature", label: "Temperature", min: 0, max: 2, step: 0.05, hint: "Higher is more varied." },
  { key: "topP", label: "Top P", min: 0, max: 1, step: 0.01, hint: "Nucleus sampling." },
  { key: "topK", label: "Top K", min: 0, max: 200, step: 1, hint: "Limit to the top K words." },
  { key: "minP", label: "Min P", min: 0, max: 1, step: 0.01, hint: "Drop words below this share." },
  { key: "repetitionPenalty", label: "Repetition penalty", min: 0, max: 2, step: 0.01, hint: "Discourages repeats." },
  { key: "frequencyPenalty", label: "Frequency penalty", min: -2, max: 2, step: 0.01, hint: "Discourages common words." },
  { key: "presencePenalty", label: "Presence penalty", min: -2, max: 2, step: 0.01, hint: "Encourages new topics." },
];

export function PolicyCard() {
  const [policy, setPolicy] = useState<GenerationPolicy | null>(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.getPolicy().then(setPolicy).catch((e) => setError(String(e)));
  }, []);

  if (!policy) return <section className="set-card">{error || "Loading parameters…"}</section>;

  function update(patch: Partial<GenerationPolicy>) {
    setPolicy({ ...policy!, ...patch });
    setSaved("");
  }

  async function save() {
    setError("");
    try {
      const next = await api.savePolicy(policy!);
      setPolicy(next);
      setSaved("Saved. Applies to every chat from now on.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <section className="set-card">
      <h3>Generation parameters</h3>
      <p className="muted small">
        These apply to every user. Users can't change them, and the server ignores anything a
        user sends. Turn a parameter off to stop sending it to the provider.
      </p>

      {FIELDS.map((f) => (
        <div key={f.key} className="feature-row">
          <div>
            <span>{f.label}</span>
            <small className="muted small">{f.hint}</small>
          </div>
          <div className="row-actions">
            <input
              type="number"
              className="mini-input"
              min={f.min}
              max={f.max}
              step={f.step}
              disabled={!policy.enabled[f.key]}
              value={policy[f.key] ?? ""}
              onChange={(e) => update({ [f.key]: Number(e.target.value) } as Partial<GenerationPolicy>)}
            />
            <button
              className="toggle"
              role="switch"
              aria-checked={policy.enabled[f.key]}
              aria-label={`Send ${f.label}`}
              onClick={() => update({ enabled: { ...policy.enabled, [f.key]: !policy.enabled[f.key] } })}
            />
          </div>
        </div>
      ))}

      <div className="feature-row">
        <div>
          <span>Seed</span>
          <small className="muted small">Same seed, same replies. Leave off for varied replies.</small>
        </div>
        <div className="row-actions">
          <input
            type="number"
            className="mini-input"
            min={0}
            disabled={!policy.enabled.seed}
            value={policy.seed ?? ""}
            onChange={(e) => update({ seed: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <button
            className="toggle"
            role="switch"
            aria-checked={policy.enabled.seed}
            aria-label="Send seed"
            onClick={() => update({ enabled: { ...policy.enabled, seed: !policy.enabled.seed } })}
          />
        </div>
      </div>

      <div className="row-actions">
        <button className="pill-btn" onClick={save}>
          Save parameters
        </button>
        {saved && <span className="muted small">{saved}</span>}
        {error && <span className="error">{error}</span>}
      </div>
    </section>
  );
}

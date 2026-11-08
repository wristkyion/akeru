import { useState, useEffect, type ReactNode } from "react";
import type { Me } from "./api";
import { AdminPanel } from "./AdminPanel";
import { loadSettings, SETTINGS_KEY, type ChatSettings } from "./ChatSettings";
import { MAX_PERSONAS, loadPrefs, savePrefs, type Persona, type Prefs } from "./prefs";

type Section = "admin" | "profile" | "account" | "chat" | "display" | "advanced";

const SECTIONS: { id: Section; label: string; adminOnly?: boolean }[] = [
  { id: "admin", label: "Admin panel", adminOnly: true },
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
  { id: "chat", label: "Chat" },
  { id: "display", label: "Display" },
  { id: "advanced", label: "Advanced" },
];

const TEMPLATES = ["default", "roleplay", "short replies", "storytelling"];

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function clearLocalData() {
  if (!window.confirm("Clear saved settings and personas in this browser? You stay logged in.")) {
    return;
  }
  Object.keys(localStorage)
    .filter((k) => k.startsWith("akeru.") && k !== "akeru.token")
    .forEach((k) => localStorage.removeItem(k));
  window.location.reload();
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-label">{label}</span>
      {hint && <span className="muted small">{hint}</span>}
      {children}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className="toggle"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPage({
  me,
  onClose,
  onChangePassword,
}: {
  me: Me;
  onClose: () => void;
  onChangePassword: () => void;
}) {
  const isAdmin = me.role === "admin";
  const [section, setSection] = useState<Section>(isAdmin ? "admin" : "profile");
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [chat, setChat] = useState<ChatSettings>(loadSettings);

  // Persona form
  const [pName, setPName] = useState("");
  const [pText, setPText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Escape closes the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Every change saves right away, since this is a prototype
  function set<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
  }

  // Chat settings, kept for the local send path (model choice). Parameters are admin-only now.
  function changeChat(next: ChatSettings) {
    setChat(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }

  function resetPersonaForm() {
    setPName("");
    setPText("");
    setEditingId(null);
  }

  function savePersona() {
    const name = pName.trim();
    const text = pText.trim();
    if (!name || !text) return;

    let next: Persona[];
    if (editingId) {
      next = prefs.chat.personas.map((p) => (p.id === editingId ? { ...p, name, text } : p));
    } else {
      if (prefs.chat.personas.length >= MAX_PERSONAS) return;
      next = [...prefs.chat.personas, { id: newId(), name, text }];
    }
    set("chat", { ...prefs.chat, personas: next });
    resetPersonaForm();
  }

  function deletePersona(p: Persona) {
    if (!window.confirm(`Delete persona "${p.name}"?`)) return;
    set("chat", { ...prefs.chat, personas: prefs.chat.personas.filter((x) => x.id !== p.id) });
    if (editingId === p.id) resetPersonaForm();
  }

  const personas = prefs.chat.personas;
  const atLimit = personas.length >= MAX_PERSONAS;
  const current = SECTIONS.find((s) => s.id === section);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close settings">
          ×
        </button>

        <div className="settings">
          <nav className="settings-nav">
            {SECTIONS.filter((s) => !s.adminOnly || isAdmin).map((s) => (
              <button
                key={s.id}
                className={section === s.id ? "sb-link on" : "sb-link"}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <main className="settings-body">
            <h2>{current?.label}</h2>
            <p className="muted small">
              Prototype: changes save in this browser until the backend is connected.
            </p>

            {section === "admin" && isAdmin && (
              <AdminPanel state={prefs.admin} onChange={(admin) => set("admin", admin)} />
            )}

            {section === "profile" && (
              <section className="set-card">
                <Row label="Username" hint="Changing it needs the backend, so it checks nobody else has it.">
                  <input
                    value={prefs.profile.username || me.username}
                    maxLength={32}
                    onChange={(e) => set("profile", { ...prefs.profile, username: e.target.value })}
                  />
                </Row>
                <Row label="Display name" hint="Shown in chats and on your cards.">
                  <input
                    value={prefs.profile.displayName}
                    maxLength={40}
                    placeholder={me.displayName}
                    onChange={(e) => set("profile", { ...prefs.profile, displayName: e.target.value })}
                  />
                </Row>
                <Row label="Bio" hint={`${prefs.profile.bio.length}/160`}>
                  <textarea
                    rows={3}
                    maxLength={160}
                    value={prefs.profile.bio}
                    onChange={(e) => set("profile", { ...prefs.profile, bio: e.target.value })}
                  />
                </Row>
              </section>
            )}

            {section === "account" && (
              <>
                <section className="set-card">
                  <Row label="Email" hint="Not verified yet. Used for sign-in alerts later.">
                    <input
                      type="email"
                      value={prefs.account.email}
                      onChange={(e) => set("account", { email: e.target.value })}
                    />
                  </Row>
                </section>

                <section className="set-card">
                  <Row label="Password" hint="Other devices are signed out after a change.">
                    <div>
                      <button className="pill-btn" onClick={onChangePassword}>
                        Change password
                      </button>
                    </div>
                  </Row>
                </section>

                <section className="set-card">
                  <Row label="Delete account" hint="Coming with the backend.">
                    <div>
                      <button className="pill-btn danger-text" disabled>
                        Delete account
                      </button>
                    </div>
                  </Row>
                </section>
              </>
            )}

            {section === "chat" && (
              <>
                <section className="set-card">
                  <Row label="Template" hint="The starting style for new chats.">
                    <select
                      value={prefs.chat.template}
                      onChange={(e) => set("chat", { ...prefs.chat, template: e.target.value })}
                    >
                      {TEMPLATES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row label="Model" hint="Set by the admin for everyone. Users can't switch models.">
                    <input value={prefs.admin.model || "Default"} disabled />
                  </Row>
                  <Row label="Reply animation" hint="Smooth reveals each reply word by word, with a fade. Instant shows it all at once.">
                    <Seg
                      value={prefs.chat.animation}
                      options={[
                        { value: "instant", label: "Instant" },
                        { value: "smooth", label: "Smooth" },
                      ]}
                      onChange={(v) => set("chat", { ...prefs.chat, animation: v })}
                    />
                  </Row>
                </section>

                <section className="set-card">
                  <h3>Parameters</h3>
                  {isAdmin ? (
                    <p className="muted small">
                      Set in Admin panel → Models. Changes there apply to every chat, for every user.
                    </p>
                  ) : (
                    <p className="muted small">
                      The admin sets these for everyone. You can't change them here.
                    </p>
                  )}
                </section>

                <section className="set-card">
                  <h3>
                    Personas <span className="muted small">{personas.length}/{MAX_PERSONAS}</span>
                  </h3>
                  <p className="muted small">
                    A persona tells characters who you are. You can keep up to {MAX_PERSONAS}. Choosing one per chat comes with the backend.
                  </p>

                  {personas.map((p) => (
                    <div key={p.id} className="persona">
                      <div className="persona-text">
                        <strong>{p.name}</strong>
                        <span className="muted small">{p.text}</span>
                      </div>
                      <div className="row-actions">
                        <button
                          className="tool-btn"
                          onClick={() => {
                            setEditingId(p.id);
                            setPName(p.name);
                            setPText(p.text);
                          }}
                        >
                          Edit
                        </button>
                        <button className="tool-btn danger-text" onClick={() => deletePersona(p)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}

                  {atLimit && !editingId ? (
                    <p className="muted small">
                      You've reached the limit of {MAX_PERSONAS} personas. Delete one to add another.
                    </p>
                  ) : (
                    <div className="persona-form">
                      <input
                        placeholder="Name, for example Student"
                        maxLength={40}
                        value={pName}
                        onChange={(e) => setPName(e.target.value)}
                      />
                      <textarea
                        rows={3}
                        maxLength={500}
                        placeholder="Who you are, and what characters should know"
                        value={pText}
                        onChange={(e) => setPText(e.target.value)}
                      />
                      <div className="row-actions">
                        {editingId && (
                          <button className="pill-btn" onClick={resetPersonaForm}>
                            Cancel
                          </button>
                        )}
                        <button
                          className="pill-btn"
                          onClick={savePersona}
                          disabled={!pName.trim() || !pText.trim()}
                        >
                          {editingId ? "Update persona" : "Add persona"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {section === "display" && (
              <section className="set-card">
                <Row label="Language" hint="Interface language. Translations come later. This only saves your choice.">
                  <Seg
                    value={prefs.display.language}
                    options={[
                      { value: "en", label: "English" },
                      { value: "id", label: "Indonesia" },
                      { value: "ja", label: "日本語" },
                    ]}
                    onChange={(v) => set("display", { ...prefs.display, language: v })}
                  />
                </Row>
                <Row label="Theme" hint="Dark or light. Applies right away.">
                  <Seg
                    value={prefs.display.theme}
                    options={[
                      { value: "dark", label: "Dark" },
                      { value: "light", label: "Light" },
                    ]}
                    onChange={(v) => set("display", { ...prefs.display, theme: v })}
                  />
                </Row>
                <Row label="Icon shape" hint="Round avatars, or rounded squares.">
                  <Seg
                    value={prefs.display.shape}
                    options={[
                      { value: "round", label: "Round" },
                      { value: "square", label: "Square" },
                    ]}
                    onChange={(v) => set("display", { ...prefs.display, shape: v })}
                  />
                </Row>
              </section>
            )}

            {section === "advanced" && (
              <>
                <section className="set-card">
                  <h3>Developer</h3>
                  <Row label="Debug info" hint="Shows version and browser details on this page.">
                    <Toggle
                      label="Debug info"
                      on={prefs.advanced.debug}
                      onChange={(v) => set("advanced", { ...prefs.advanced, debug: v })}
                    />
                  </Row>
                  {prefs.advanced.debug && (
                    <pre className="debug">
                      {[
                        "version: 0.1.0",
                        `user: @${me.username} (${me.role})`,
                        `browser: ${navigator.userAgent}`,
                        `server: ${window.location.origin}`,
                      ].join("\n")}
                    </pre>
                  )}
                </section>

                <section className="set-card">
                  <h3>Your data</h3>
                  <Row label="Export chats" hint="Download all your chats as JSON. Coming with the backend.">
                    <div>
                      <button className="pill-btn" disabled>
                        Export
                      </button>
                    </div>
                  </Row>
                  <Row label="Clear browser data" hint="Removes saved settings and personas in this browser. You stay logged in.">
                    <div>
                      <button className="pill-btn danger-text" onClick={clearLocalData}>
                        Clear
                      </button>
                    </div>
                  </Row>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

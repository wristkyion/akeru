import { useEffect, useState } from "react";
import { api, type ModelGroup } from "./api";
import { PolicyCard } from "./PolicyCard";
import type { AdminState, AdminUser, Plan, Report } from "./prefs";

type Tab = "overview" | "accounts" | "plans" | "models" | "moderation" | "system";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "plans", label: "Plans" },
  { id: "models", label: "Models" },
  { id: "moderation", label: "Moderation" },
  { id: "system", label: "System" },
];

const FEATURES: { key: string; label: string; hint: string }[] = [
  { key: "discover", label: "Discover page", hint: "Browse public characters by tag" },
  { key: "stopButton", label: "Stop button", hint: "Cancel a streaming reply" },
  { key: "exportChats", label: "Export chats", hint: "Users download their chats as JSON" },
  { key: "personaTab", label: "Personas", hint: "Let users keep up to five personas" },
];

const clockNow = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Labels for the last seven days, oldest first
const weekLabels = () =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(Date.now() - (6 - i) * 86_400_000).toLocaleDateString([], { weekday: "short" }),
  );

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function usersToCsv(users: AdminUser[]): string {
  const head = "username,role,plan,status,daily_limit,messages_today,sessions,joined";
  const rows = users.map((u) =>
    [u.username, u.role, u.plan, u.status, u.dailyLimit, u.messagesToday, u.sessions ?? 0, u.joined ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [head, ...rows].join("\n");
}

const statusClass = (s: AdminUser["status"]) =>
  s === "active" ? "tag" : s === "suspended" ? "tag warn" : "tag bad";

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function AdminPanel({
  state,
  onChange,
}: {
  state: AdminState;
  onChange: (next: AdminState) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [groups, setGroups] = useState<ModelGroup[]>([]);
  const [checking, setChecking] = useState(false);
  const [search, setSearch] = useState("");
  const [word, setWord] = useState("");
  const [planName, setPlanName] = useState("");
  const [planLimit, setPlanLimit] = useState(100);

  function checkProviders() {
    setChecking(true);
    api
      .models()
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setChecking(false));
  }

  useEffect(() => {
    checkProviders();
    api
      .getMaintenance()
      .then((m) => {
        if (m.on !== state.maintenance) onChange({ ...state, maintenance: m.on });
      })
      .catch(() => undefined);
    // Loads once, when the admin panel opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modelNames = groups.flatMap((g) => g.models);

  // Typing into a field saves quietly. Actions also go into the activity log.
  const set = (p: Partial<AdminState>) => onChange({ ...state, ...p });
  const record = (entry: string, p: Partial<AdminState> = {}) =>
    onChange({ ...state, ...p, log: [`${clockNow()}  ${entry}`, ...state.log].slice(0, 60) });

  function changeUser(u: AdminUser, change: Partial<AdminUser>, entry?: string) {
    const users = state.users.map((x) => (x.id === u.id ? { ...x, ...change } : x));
    if (entry) record(entry, { users });
    else set({ users });
  }

  // ---- Derived numbers ----
  const count = (s: AdminUser["status"]) => state.users.filter((u) => u.status === s).length;
  const messagesToday = state.users.reduce((n, u) => n + u.messagesToday, 0);
  const messagesWeek = state.messagesWeek.reduce((a, b) => a + b, 0);
  const openReports = state.reports.filter((r) => r.status === "open").length;
  const topUsers = state.users
    .filter((u) => u.role === "user")
    .sort((a, b) => b.messagesToday - a.messagesToday)
    .slice(0, 5);
  const maxDay = Math.max(1, ...state.messagesWeek);
  const labels = weekLabels();
  const shownUsers = state.users.filter((u) =>
    u.username.toLowerCase().includes(search.trim().toLowerCase()),
  );

  // ---- Plans ----
  function setPlan(name: string, dailyLimit: number) {
    set({ plans: state.plans.map((p) => (p.name === name ? { ...p, dailyLimit } : p)) });
  }

  function applyPlan(p: Plan) {
    const affected = state.users.filter((u) => u.plan === p.name && u.role === "user").length;
    const users = state.users.map((u) =>
      u.plan === p.name && u.role === "user" ? { ...u, dailyLimit: p.dailyLimit } : u,
    );
    record(`applied ${p.name} limit (${p.dailyLimit}) to ${affected} users`, { users });
  }

  function addPlan() {
    const name = planName.trim().toLowerCase();
    if (!name || state.plans.some((p) => p.name === name)) return;
    record(`plan added: ${name}`, { plans: [...state.plans, { name, dailyLimit: planLimit }] });
    setPlanName("");
  }

  function deletePlan(p: Plan) {
    const inUse = state.users.filter((u) => u.plan === p.name).length;
    if (inUse > 0) {
      window.alert(`${inUse} user(s) are on ${p.name}. Move them to another plan first.`);
      return;
    }
    if (!window.confirm(`Delete plan "${p.name}"?`)) return;
    record(`plan deleted: ${p.name}`, { plans: state.plans.filter((x) => x.name !== p.name) });
  }

  // ---- Moderation ----
  function setReport(r: Report, status: Report["status"], entry: string) {
    const reports = state.reports.map((x) => (x.id === r.id ? { ...x, status } : x));
    record(entry, { reports });
  }

  function banCreator(r: Report) {
    const target = state.users.find((u) => u.username === r.creator && u.role === "user");
    if (!target) {
      window.alert(`No account named ${r.creator} to ban.`);
      return;
    }
    if (!window.confirm(`Ban ${target.username} permanently over "${r.character}"?`)) return;
    const users = state.users.map((u) =>
      u.id === target.id ? { ...u, status: "banned" as const } : u,
    );
    const reports = state.reports.map((x) =>
      x.id === r.id ? { ...x, status: "actioned" as const } : x,
    );
    record(`banned ${target.username} after a report on ${r.character}`, { users, reports });
  }

  function addWord() {
    const w = word.trim().toLowerCase();
    if (!w || state.blocklist.includes(w)) return;
    record(`blocked word added: ${w}`, { blocklist: [...state.blocklist, w].slice(0, 100) });
    setWord("");
  }

  // ---- System ----
  function toggleFeature(key: string, on: boolean) {
    const label = FEATURES.find((f) => f.key === key)?.label ?? key;
    record(`${label} ${on ? "on" : "off"}`, { features: { ...state.features, [key]: on } });
  }

  return (
    <div className="admin">
      <div className="settings-tabs admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- Overview ---------- */}
      {tab === "overview" && (
        <>
          <div className="stat-row">
            <Stat label="Accounts" value={state.users.length} />
            <Stat label="Active" value={count("active")} />
            <Stat label="Suspended or banned" value={count("suspended") + count("banned")} />
            <Stat label="Messages today" value={messagesToday} />
            <Stat label="Messages, 7 days" value={messagesWeek} />
            <Stat label="Open reports" value={openReports} />
          </div>

          <section className="set-card">
            <h3>Messages, last 7 days</h3>
            <div className="chart">
              {state.messagesWeek.map((n, i) => (
                <div className="chart-col" key={i}>
                  <span className="muted small">{n}</span>
                  <div
                    className="chart-bar"
                    style={{ height: `${Math.round((n / maxDay) * 100)}%` }}
                  />
                  <span className="muted small">{labels[i]}</span>
                </div>
              ))}
            </div>
            <p className="muted small">Prototype numbers. The backend will record real counts.</p>
          </section>

          <div className="two-col">
            <section className="set-card">
              <h3>Top users today</h3>
              <ul className="log">
                {topUsers.length === 0 ? (
                  <li>No users yet.</li>
                ) : (
                  topUsers.map((u) => (
                    <li key={u.id}>
                      {u.username}: {u.messagesToday} today ({u.plan})
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="set-card">
              <h3>Status</h3>
              <dl className="kv">
                <dt>Maintenance</dt>
                <dd>{state.maintenance ? "On" : "Off"}</dd>
                <dt>Sign-up</dt>
                <dd>{state.signupOpen ? "Open" : "Closed"}</dd>
                <dt>Default model</dt>
                <dd>{state.model || "First available"}</dd>
                <dt>Providers reachable</dt>
                <dd>
                  {groups.filter((g) => !g.error).length} of {groups.length}
                </dd>
              </dl>
            </section>
          </div>
        </>
      )}

      {/* ---------- Accounts ---------- */}
      {tab === "accounts" && (
        <section className="set-card">
          <div className="admin-toolbar">
            <h3>Accounts</h3>
            <div className="row-actions">
              <input
                placeholder="Search username"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="pill-btn"
                onClick={() => download("akeru-users.csv", usersToCsv(state.users), "text/csv")}
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Today / limit</th>
                  <th>Sessions</th>
                  <th>Password</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shownUsers.map((u) => {
                  const isAdmin = u.role === "admin";
                  return (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.username}</strong>
                        {isAdmin && <span className="tag">admin</span>}
                      </td>
                      <td>
                        <select
                          value={u.plan}
                          disabled={isAdmin}
                          onChange={(e) =>
                            changeUser(u, { plan: e.target.value }, `${u.username} plan set to ${e.target.value}`)
                          }
                        >
                          {state.plans.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                          {!state.plans.some((p) => p.name === u.plan) && (
                            <option value={u.plan}>{u.plan}</option>
                          )}
                        </select>
                      </td>
                      <td>
                        <span className={statusClass(u.status)}>{u.status}</span>
                      </td>
                      <td>
                        {u.messagesToday} /{" "}
                        <input
                          className="mini-input"
                          type="number"
                          min={0}
                          disabled={isAdmin}
                          value={u.dailyLimit}
                          onChange={(e) =>
                            changeUser(u, { dailyLimit: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                      </td>
                      <td>
                        {u.sessions ?? 0}{" "}
                        <button
                          className="tool-btn"
                          disabled={!u.sessions}
                          onClick={() => changeUser(u, { sessions: 0 }, `revoked sessions of ${u.username}`)}
                        >
                          Revoke
                        </button>
                      </td>
                      <td>
                        <button
                          className={u.forcePasswordChange ? "tool-btn primary-text" : "tool-btn"}
                          disabled={isAdmin}
                          onClick={() =>
                            changeUser(
                              u,
                              { forcePasswordChange: !u.forcePasswordChange },
                              `${u.forcePasswordChange ? "cleared" : "required"} password change for ${u.username}`,
                            )
                          }
                        >
                          {u.forcePasswordChange ? "Change required" : "Require change"}
                        </button>
                      </td>
                      <td>
                        {!isAdmin && (
                          <div className="row-actions">
                            <button
                              className="tool-btn"
                              onClick={() =>
                                changeUser(u, { messagesToday: 0 }, `reset today's count for ${u.username}`)
                              }
                            >
                              Reset today
                            </button>
                            <button
                              className="tool-btn"
                              disabled={u.status === "banned"}
                              onClick={() =>
                                changeUser(
                                  u,
                                  { status: u.status === "suspended" ? "active" : "suspended" },
                                  `${u.status === "suspended" ? "restored" : "suspended"} ${u.username}`,
                                )
                              }
                            >
                              {u.status === "suspended" ? "Restore" : "Suspend"}
                            </button>
                            <button
                              className="tool-btn danger-text"
                              onClick={() => {
                                if (u.status !== "banned" && !window.confirm(`Ban ${u.username} permanently?`)) {
                                  return;
                                }
                                changeUser(
                                  u,
                                  { status: u.status === "banned" ? "active" : "banned" },
                                  `${u.status === "banned" ? "unbanned" : "banned (permanent)"} ${u.username}`,
                                );
                              }}
                            >
                              {u.status === "banned" ? "Unban" : "Ban"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Daily limit 0 means unlimited. Admins are never limited. Revoke signs the user out everywhere.
          </p>
        </section>
      )}

      {/* ---------- Plans ---------- */}
      {tab === "plans" && (
        <section className="set-card">
          <h3>Plans</h3>
          <p className="muted small">
            A plan sets the default daily limit. Apply pushes the plan's limit to every user on it.
          </p>

          <table className="admin-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Daily limit</th>
                <th>Users</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.plans.map((p) => (
                <tr key={p.name}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td>
                    <input
                      className="mini-input"
                      type="number"
                      min={0}
                      value={p.dailyLimit}
                      onChange={(e) => setPlan(p.name, Math.max(0, Number(e.target.value) || 0))}
                    />
                  </td>
                  <td>{state.users.filter((u) => u.plan === p.name).length}</td>
                  <td>
                    <div className="row-actions">
                      <button className="tool-btn" onClick={() => applyPlan(p)}>
                        Apply to users
                      </button>
                      <button className="tool-btn danger-text" onClick={() => deletePlan(p)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row-actions">
            <input
              placeholder="New plan name, e.g. student"
              value={planName}
              maxLength={20}
              onChange={(e) => setPlanName(e.target.value)}
            />
            <input
              className="mini-input"
              type="number"
              min={0}
              value={planLimit}
              onChange={(e) => setPlanLimit(Math.max(0, Number(e.target.value) || 0))}
            />
            <button className="pill-btn" onClick={addPlan} disabled={!planName.trim()}>
              Add plan
            </button>
          </div>
        </section>
      )}

      {/* ---------- Models ---------- */}
      {tab === "models" && (
        <>
          <PolicyCard />

          <section className="set-card">
            <h3>Default model</h3>
            <p className="muted small">Users can't switch models. Every chat uses this one.</p>
            <label className="field">
              <span>Default</span>
              <select
                value={state.model}
                onChange={(e) =>
                  record(`default model set to ${e.target.value || "first available"}`, {
                    model: e.target.value,
                  })
                }
              >
                <option value="">First available</option>
                {modelNames.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Fallback if the default fails</span>
              <select
                value={state.fallbackModel}
                onChange={(e) =>
                  record(`fallback model set to ${e.target.value || "none"}`, {
                    fallbackModel: e.target.value,
                  })
                }
              >
                <option value="">None</option>
                {modelNames.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">The fallback is saved, but the server doesn't use it yet.</p>
          </section>

          <section className="set-card">
            <div className="admin-toolbar">
              <h3>Providers</h3>
              <button className="pill-btn" onClick={checkProviders} disabled={checking}>
                {checking ? "Checking…" : "Check again"}
              </button>
            </div>
            {!checking && groups.length === 0 ? (
              <p className="muted small">No providers answered. Check the server and settings.json.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Models</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.provider}>
                      <td>
                        <strong>{g.provider}</strong>
                      </td>
                      <td>
                        <span className={g.error ? "tag bad" : "tag"}>{g.error ? "error" : "online"}</span>
                      </td>
                      <td>{g.error ? g.error : g.models.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {/* ---------- Moderation ---------- */}
      {tab === "moderation" && (
        <>
          <section className="set-card">
            <h3>
              Reports <span className="muted small">{openReports} open</span>
            </h3>
            <p className="muted small">
              Reports come from the Report button on a character. Prototype: nothing is sent yet.
            </p>
            {state.reports.length === 0 ? (
              <p className="muted small">No reports.</p>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Character</th>
                    <th>Creator</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...state.reports]
                    .sort((a, b) => Number(b.status === "open") - Number(a.status === "open"))
                    .map((r) => (
                      <tr key={r.id}>
                        <td>{r.character}</td>
                        <td>@{r.creator}</td>
                        <td>{r.reason}</td>
                        <td>
                          <span className={r.status === "open" ? "tag warn" : "tag"}>{r.status}</span>
                        </td>
                        <td>
                          {r.status === "open" && (
                            <div className="row-actions">
                              <button
                                className="tool-btn"
                                onClick={() => setReport(r, "dismissed", `dismissed report on ${r.character}`)}
                              >
                                Dismiss
                              </button>
                              <button
                                className="tool-btn"
                                onClick={() => setReport(r, "actioned", `hid ${r.character}`)}
                              >
                                Hide character
                              </button>
                              <button className="tool-btn danger-text" onClick={() => banCreator(r)}>
                                Ban creator
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="set-card">
            <h3>Blocked words</h3>
            <p className="muted small">Prototype: saved here, not applied to messages yet.</p>
            <div className="row-actions">
              <input
                placeholder="Add a word"
                value={word}
                maxLength={40}
                onChange={(e) => setWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addWord();
                }}
              />
              <button className="pill-btn" onClick={addWord} disabled={!word.trim()}>
                Add
              </button>
            </div>
            <div className="chip-list">
              {state.blocklist.length === 0 && <span className="muted small">No words yet.</span>}
              {state.blocklist.map((w) => (
                <span key={w} className="chip">
                  {w}
                  <button
                    aria-label={`Remove ${w}`}
                    onClick={() =>
                      record("removed a blocked word", {
                        blocklist: state.blocklist.filter((x) => x !== w),
                      })
                    }
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ---------- System ---------- */}
      {tab === "system" && (
        <>
          <section className="set-card">
            <h3>Access</h3>
            <div className="feature-row">
              <div>
                <span>Open sign-up</span>
                <small className="muted small">Anyone who can reach the server can create an account.</small>
              </div>
              <Switch
                label="Open sign-up"
                on={state.signupOpen}
                onChange={(v) => record(`sign-up ${v ? "opened" : "closed"}`, { signupOpen: v })}
              />
            </div>
            <div className="feature-row">
              <div>
                <span>Maintenance mode</span>
                <small className="muted small">Only admins can chat while it's on.</small>
              </div>
              <Switch
                label="Maintenance mode"
                on={state.maintenance}
                onChange={(v) => {
                  api
                    .setMaintenance(v, state.announcement)
                    .then(() => record(`maintenance ${v ? "on" : "off"}`, { maintenance: v }))
                    .catch((err) => window.alert(err instanceof Error ? err.message : "Could not change maintenance."));
                }}
              />
            </div>
          </section>

          <section className="set-card">
            <h3>Announcement</h3>
            <textarea
              rows={2}
              maxLength={200}
              value={state.announcement}
              onChange={(e) => set({ announcement: e.target.value })}
            />
            <div className="row-actions">
              <button
                className="pill-btn"
                onClick={() => record(state.announcement ? "announcement published" : "announcement cleared")}
              >
                Publish
              </button>
              <button
                className="tool-btn"
                onClick={() => record("announcement cleared", { announcement: "" })}
              >
                Clear
              </button>
            </div>
          </section>

          <section className="set-card">
            <h3>Features</h3>
            {FEATURES.map((f) => (
              <div key={f.key} className="feature-row">
                <div>
                  <span>{f.label}</span>
                  <small className="muted small">{f.hint}</small>
                </div>
                <Switch
                  label={f.label}
                  on={!!state.features[f.key]}
                  onChange={(v) => toggleFeature(f.key, v)}
                />
              </div>
            ))}
          </section>

          <section className="set-card">
            <h3>Tools</h3>
            <div className="row-actions">
              <button
                className="pill-btn"
                onClick={() =>
                  record("reset all daily counters", {
                    users: state.users.map((u) => ({ ...u, messagesToday: 0 })),
                  })
                }
              >
                Reset daily counters
              </button>
              <button
                className="pill-btn"
                onClick={() => {
                  download("akeru-users.csv", usersToCsv(state.users), "text/csv");
                  record("exported the user list");
                }}
              >
                Export user list
              </button>
              <button
                className="pill-btn danger-text"
                onClick={() => {
                  if (!window.confirm("Sign out every user? Prototype: only changes this list.")) return;
                  record("signed out every user", {
                    users: state.users.map((u) => ({ ...u, sessions: 0 })),
                  });
                }}
              >
                Sign out everyone
              </button>
            </div>
          </section>

          <section className="set-card">
            <div className="admin-toolbar">
              <h3>Activity log</h3>
              <button
                className="tool-btn"
                disabled={state.log.length === 0}
                onClick={() => set({ log: [] })}
              >
                Clear log
              </button>
            </div>
            {state.log.length === 0 ? (
              <p className="muted small">No admin actions yet.</p>
            ) : (
              <ul className="log">
                {state.log.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

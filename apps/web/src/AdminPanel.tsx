import { useEffect, useState } from "react";
import { api } from "./api";
import type { AdminState, AdminUser } from "./prefs";

const PLANS = ["free", "pro", "team"];

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
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    api
      .models()
      .then((groups) => setModels(groups.flatMap((g) => g.models)))
      .catch(() => setModels([]));
  }, []);

  // Actions that matter are written to the activity log
  function record(entry: string, patch: Partial<AdminState>) {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    onChange({ ...state, ...patch, log: [`${time}  ${entry}`, ...state.log].slice(0, 30) });
  }

  function updateUser(u: AdminUser, change: Partial<AdminUser>, entry?: string) {
    const users = state.users.map((x) => (x.id === u.id ? { ...x, ...change } : x));
    if (entry) record(entry, { users });
    else onChange({ ...state, users });
  }

  const messagesToday = state.users.reduce((n, u) => n + u.messagesToday, 0);
  const activeCount = state.users.filter((u) => u.status === "active").length;

  return (
    <div className="admin">
      <div className="stat-row">
        <Stat label="Accounts" value={state.users.length} />
        <Stat label="Active" value={activeCount} />
        <Stat label="Messages today" value={messagesToday} />
      </div>

      <section className="set-card">
        <h3>Model for everyone</h3>
        <p className="muted small">Users can't switch models. Every chat uses this one.</p>
        <select
          value={state.model}
          onChange={(e) =>
            record(`model set to ${e.target.value || "default"}`, { model: e.target.value })
          }
        >
          <option value="">Default ({models[0] ?? "none"})</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </section>

      <section className="set-card">
        <h3>Accounts</h3>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Today / limit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.username}</strong>
                  </td>
                  <td>{u.role}</td>
                  <td>
                    <select
                      value={u.plan}
                      disabled={u.role === "admin"}
                      onChange={(e) => {
                        let plan = e.target.value;
                        if (plan === "other") {
                          const name = window.prompt("Plan name, for example Student")?.trim();
                          if (!name) return;
                          plan = name;
                        }
                        updateUser(u, { plan }, `${u.username} plan set to ${plan}`);
                      }}
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                      {!PLANS.includes(u.plan) && <option value={u.plan}>{u.plan}</option>}
                      <option value="other">Other…</option>
                    </select>
                  </td>
                  <td>
                    <span
                      className={
                        u.status === "active" ? "tag" : u.status === "suspended" ? "tag warn" : "tag bad"
                      }
                    >
                      {u.status}
                    </span>
                  </td>
                  <td>
                    {u.messagesToday} /{" "}
                    <input
                      className="mini-input"
                      type="number"
                      min={0}
                      value={u.dailyLimit}
                      disabled={u.role === "admin"}
                      onChange={(e) =>
                        updateUser(u, { dailyLimit: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </td>
                  <td>
                    {u.role === "user" && (
                      <div className="row-actions">
                        <button
                          className="tool-btn"
                          disabled={u.status === "banned"}
                          onClick={() =>
                            updateUser(
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
                            updateUser(
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
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Daily limit 0 means unlimited. Admins are never limited.</p>
      </section>

      <section className="set-card">
        <h3>Tools</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={state.maintenance}
            onChange={(e) =>
              record(`maintenance ${e.target.checked ? "on" : "off"}`, {
                maintenance: e.target.checked,
              })
            }
          />
          Maintenance mode (only admins can chat)
        </label>

        <div className="field">
          <span>Announcement shown on Home</span>
          <textarea
            rows={2}
            maxLength={200}
            value={state.announcement}
            onChange={(e) => onChange({ ...state, announcement: e.target.value })}
          />
        </div>

        <div className="row-actions">
          <button
            className="pill-btn"
            onClick={() =>
              record("reset all daily counters", {
                users: state.users.map((x) => ({ ...x, messagesToday: 0 })),
              })
            }
          >
            Reset daily counters
          </button>
        </div>
      </section>

      <section className="set-card">
        <h3>Activity log</h3>
        {state.log.length === 0 ? (
          <p className="muted small">No admin actions yet.</p>
        ) : (
          <>
            <ul className="log">
              {state.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <div className="row-actions">
              <button className="tool-btn" onClick={() => onChange({ ...state, log: [] })}>
                Clear log
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

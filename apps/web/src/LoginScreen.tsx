import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, tokenStore, type Me } from "./api";

function waitText(seconds: number | null): string {
  if (!seconds) return "a few minutes";
  if (seconds < 90) return `${seconds} seconds`;
  return `${Math.ceil(seconds / 60)} minutes`;
}

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [signupOpen, setSignupOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  useEffect(() => {
    api
      .publicConfig()
      .then((c) => setSignupOpen(c.signup))
      .catch(() => setSignupOpen(false));
  }, []);

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setError("");
    setPassword("");
    setConfirm("");
  }

  function explain(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 429) return `Too many attempts. Try again in ${waitText(err.retryAfter)}.`;
      if (err.status === 409) return "That username is taken. Try another.";
      if (err.status === 401) return "That username or password doesn't match.";
    }
    return err instanceof Error ? err.message : "Something went wrong.";
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = username.trim();
    if (!name || !password) {
      setError("Enter your username and password.");
      return;
    }
    if (isSignup) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("The two passwords don't match.");
        return;
      }
    }

    setBusy(true);
    setError("");
    try {
      const result = isSignup
        ? await api.signup(name, password, displayName.trim())
        : await api.login(name, password);
      tokenStore.set(result.token);
      onLoggedIn(result.user);
    } catch (err) {
      setError(explain(err));
      setPassword("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand brand-lg">
          <span className="logo">A</span>
          <span>akeru</span>
        </div>
        <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">
          {isSignup
            ? "Pick a username and password. You can change them later."
            : "Log in to continue your conversations."}
        </p>

        {isSignup && (
          <label className="field">
            <span>Display name</span>
            <input
              autoComplete="name"
              maxLength={40}
              placeholder="How characters should address you"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
        )}

        <label className="field">
          <span>Username</span>
          <input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        {isSignup && <p className="hint">3 to 32 characters: letters, numbers, _ or -</p>}

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {isSignup && <p className="hint">At least 8 characters.</p>}

        {isSignup && (
          <label className="field">
            <span>Repeat password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn-primary" disabled={busy}>
          {busy ? "Please wait…" : isSignup ? "Create account" : "Log in"}
        </button>

        {signupOpen ? (
          <p className="switch">
            {isSignup ? "Already have an account? " : "New here? "}
            <button
              type="button"
              className="link"
              onClick={() => switchMode(isSignup ? "login" : "signup")}
            >
              {isSignup ? "Log in" : "Create an account"}
            </button>
          </p>
        ) : (
          <p className="muted small switch">Accounts are created by the admin on the server.</p>
        )}
      </form>
    </div>
  );
}

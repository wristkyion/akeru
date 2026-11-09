import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, ApiError, setUnauthorizedHandler, tokenStore, type CharacterView, type Me } from "./api";
import { ChatScreen } from "./Chat";
import { CharacterForm } from "./CharacterForm";
import { Home } from "./Home";
import { LockdownPage } from "./LockdownPage";
import { LoginScreen } from "./LoginScreen";
import { MaintenancePage } from "./MaintenancePage";
import { PasswordForm } from "./PasswordForm";
import { SettingsPage } from "./SettingsPage";
import { applyPrefs, loadPrefs } from "./prefs";

// Apply theme and icon shape before the first screen draws, so there's no flash
applyPrefs(loadPrefs());

// How often a logged-in user re-checks the maintenance switch, in milliseconds
const MAINTENANCE_CHECK_MS = 15_000;
// How often the lockdown page checks whether the server is back, in milliseconds
const LOCKDOWN_CHECK_MS = 10_000;

interface Maintenance {
  on: boolean;
  message: string;
}

// Props every routed screen receives from App
interface Shared {
  me: Me;
  revision: number;
  onChanged: () => void;
  onLogout: () => void;
  onSettings: () => void;
  onChangePassword: () => void;
}

// Finds one character the user can see, by id from the URL.
// undefined = still loading, null = not visible to this user (or deleted).
function useCharacter(
  characterId: string | undefined,
  revision: number,
): CharacterView | null | undefined {
  const [result, setResult] = useState<{
    id: string | undefined;
    character: CharacterView | null;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .characters()
      .then((list) => {
        if (alive) {
          setResult({ id: characterId, character: list.find((c) => c.id === characterId) ?? null });
        }
      })
      .catch(() => {
        if (alive) setResult({ id: characterId, character: null });
      });
    return () => {
      alive = false;
    };
  }, [characterId, revision]);

  // Ignore a result that belongs to a previous URL, so the wrong character never flashes
  if (!result || result.id !== characterId) return undefined;
  return result.character;
}

function Splash() {
  return <div className="splash">Loading…</div>;
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="splash">
      <div className="notfound">
        <h2>Character not found</h2>
        <p className="muted">It may be private, or it may have been deleted.</p>
        <button className="pill-btn" onClick={onBack}>
          Back to home
        </button>
      </div>
    </div>
  );
}

function FormShell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <main className="main form-main">{children}</main>
    </div>
  );
}

// /error?type=maintenance: the page a regular user sees while maintenance is on.
// Admins and anyone whose maintenance has ended are sent home instead.
function ErrorRoute(props: { maintenance: Maintenance; isAdmin: boolean; onCheck: () => void }) {
  const [params] = useSearchParams();
  const type = params.get("type");

  if (type === "maintenance" && props.maintenance.on && !props.isAdmin) {
    return <MaintenancePage message={props.maintenance.message} onCheck={props.onCheck} />;
  }
  return <Navigate to="/home" replace />;
}

// /home and /search?q=...
function HomeRoute(props: Shared) {
  const navigate = useNavigate();
  return (
    <Home
      me={props.me}
      revision={props.revision}
      onOpen={(c) => navigate(`/character/${c.id}`)}
      onCreate={() => navigate("/character/new")}
      onLogout={props.onLogout}
      onSettings={props.onSettings}
      onChangePassword={props.onChangePassword}
    />
  );
}

// /character/new
function CreateRoute(props: Shared) {
  const navigate = useNavigate();
  return (
    <FormShell>
      <CharacterForm
        onCancel={() => navigate("/home")}
        onSaved={(saved) => {
          props.onChanged();
          navigate(`/character/${saved.id}`);
        }}
      />
    </FormShell>
  );
}

// /character/:characterId/edit
function EditRoute(props: Shared) {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const character = useCharacter(characterId, props.revision);

  if (character === undefined) return <Splash />;
  if (character === null) return <NotFound onBack={() => navigate("/home")} />;
  // Only the owner can edit, so anyone else goes back to the chat
  if (!character.canEdit) return <Navigate to={`/character/${character.id}`} replace />;

  return (
    <FormShell>
      <CharacterForm
        existing={character}
        onCancel={() => navigate(`/character/${character.id}`)}
        onSaved={() => {
          props.onChanged();
          navigate(`/character/${character.id}`);
        }}
        onDeleted={() => {
          props.onChanged();
          navigate("/home");
        }}
      />
    </FormShell>
  );
}

// /character/:characterId and /character/:characterId/:chatId
function ChatRoute(props: Shared) {
  const { characterId, chatId } = useParams();
  const navigate = useNavigate();
  const character = useCharacter(characterId, props.revision);

  if (character === undefined) return <Splash />;
  if (character === null) return <NotFound onBack={() => navigate("/home")} />;

  return (
    <ChatScreen
      key={character.id}
      me={props.me}
      character={character}
      chatId={chatId ?? null}
      revision={props.revision}
      onHome={() => navigate("/home")}
      onOpen={(c) => navigate(`/character/${c.id}`)}
      onCreate={() => navigate("/character/new")}
      onEdit={(c) => navigate(`/character/${c.id}/edit`)}
      onDeleted={() => {
        props.onChanged();
        navigate("/home");
      }}
      onLogout={props.onLogout}
      onSettings={props.onSettings}
    />
  );
}

// Pages anyone can open without being logged in
const PUBLIC_PATHS = ["/login", "/signup", "/error"];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  // Bumped after a save or delete, so the lists reload
  const [revision, setRevision] = useState(0);
  // Opened from Settings by a user who wants to change their own password
  const [showPassword, setShowPassword] = useState(false);
  // Settings is still a modal for now
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The server's maintenance switch, as the app last saw it
  const [maintenance, setMaintenance] = useState<Maintenance>({ on: false, message: "" });
  // True while the app can't reach the server
  const [lockdown, setLockdown] = useState(false);
  // The last page the user was on, so they return there when the server is back
  const returnTo = useRef("/home");

  // Asks the server whether maintenance is on, and stores the answer
  const checkMaintenance = () => {
    api.getMaintenance().then(setMaintenance).catch(() => undefined);
  };

  // Tries the server once. If it answers, reload the last page, so the whole app starts fresh.
  const checkServer = async () => {
    try {
      await api.health();
      window.location.replace(returnTo.current);
    } catch {
      // Still down. The page stays on lockdown and tries again.
    }
  };

  // Remember the last page that isn't an error page
  useEffect(() => {
    if (!location.pathname.startsWith("/error")) {
      returnTo.current = location.pathname + location.search;
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      setShowPassword(false);
      setSettingsOpen(false);
    });

    // A refused chat write (503) from any request also turns the maintenance page on at once
    const onMaintenance = (e: Event) =>
      setMaintenance({ on: true, message: (e as CustomEvent<string>).detail });
    window.addEventListener("akeru:maintenance", onMaintenance);

    // Any request that can't reach the server turns the lockdown page on
    const onLockdown = () => setLockdown(true);
    window.addEventListener("akeru:lockdown", onLockdown);

    if (tokenStore.get()) {
      api
        .me()
        .then(setMe)
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 401) tokenStore.clear();
          setMe(null);
        })
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }

    return () => {
      window.removeEventListener("akeru:maintenance", onMaintenance);
      window.removeEventListener("akeru:lockdown", onLockdown);
    };
  }, []);

  // While in lockdown, keep checking the server in the background
  useEffect(() => {
    if (!lockdown) return;
    const timer = setInterval(checkServer, LOCKDOWN_CHECK_MS);
    return () => clearInterval(timer);
  }, [lockdown]);

  // Once someone is logged in, check the maintenance switch now, then every few seconds
  useEffect(() => {
    if (!me) return;
    checkMaintenance();
    const timer = setInterval(checkMaintenance, MAINTENANCE_CHECK_MS);
    return () => clearInterval(timer);
  }, [me]);

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // The token may already be gone. Clear it locally either way.
    }
    tokenStore.clear();
    setMe(null);
    setShowPassword(false);
    setSettingsOpen(false);
    navigate("/login", { replace: true });
  };

  const changed = () => setRevision((r) => r + 1);
  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);
  // Changing a password closes Settings first, so the form isn't hidden behind it
  const openPassword = () => {
    setSettingsOpen(false);
    setShowPassword(true);
  };

  const path = location.pathname;
  const onLockdownPage = path === "/error" && new URLSearchParams(location.search).get("type") === "lockdown";

  // Lockdown comes first: whatever the user was doing, they see the lockdown page
  if (lockdown) {
    if (!onLockdownPage) return <Navigate to="/error?type=lockdown" replace />;
    return <LockdownPage onRetry={checkServer} />;
  }

  if (checking) return <Splash />;

  // Logged out: only the public pages are open. Anything else goes to login, remembering the address.
  if (!me) {
    if (path === "/signup") {
      // The sign-up page is only open while the server allows it; otherwise it goes to login
      return <SignupRoute onLoggedIn={setMe} />;
    }
    if (path === "/login") return <LoginScreen mode="login" onLoggedIn={setMe} />;
    if (path === "/error") return <Navigate to="/login" replace />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  // Logged in: the login and sign-up pages are not needed, so go home
  if (path === "/login" || path === "/signup") {
    return <Navigate to="/home" replace />;
  }

  // The maintenance check: the switch is on and this account isn't an admin, so send it to the page
  const blocked = maintenance.on && me.role !== "admin";
  if (blocked && path !== "/error") {
    return <Navigate to="/error?type=maintenance" replace />;
  }

  // An admin reset means the user must pick a new password before using the app
  if (me.mustChangePassword) {
    return <PasswordForm forced onDone={() => setMe({ ...me, mustChangePassword: false })} />;
  }

  if (showPassword) {
    return (
      <PasswordForm
        forced={false}
        onDone={() => setShowPassword(false)}
        onCancel={() => setShowPassword(false)}
      />
    );
  }

  const shared: Shared = {
    me,
    revision,
    onChanged: changed,
    onLogout: logout,
    onSettings: openSettings,
    onChangePassword: openPassword,
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route
          path="/error"
          element={
            <ErrorRoute
              maintenance={maintenance}
              isAdmin={me.role === "admin"}
              onCheck={checkMaintenance}
            />
          }
        />
        <Route path="/home" element={<HomeRoute {...shared} />} />
        <Route path="/search" element={<HomeRoute {...shared} />} />
        <Route path="/character/new" element={<CreateRoute {...shared} />} />
        <Route path="/character/:characterId/edit" element={<EditRoute {...shared} />} />
        <Route path="/character/:characterId/:chatId" element={<ChatRoute {...shared} />} />
        <Route path="/character/:characterId" element={<ChatRoute {...shared} />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>

      {settingsOpen && (
        <SettingsPage
          me={me}
          onClose={closeSettings}
          onChangePassword={openPassword}
          onProfileSaved={setMe}
        />
      )}
    </>
  );
}

// /signup: shows the form while sign-up is open, and sends people to /login when it's closed
function SignupRoute({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [state, setState] = useState<"checking" | "open" | "closed">("checking");

  useEffect(() => {
    api
      .publicConfig()
      .then((c) => setState(c.signup ? "open" : "closed"))
      .catch(() => setState("closed"));
  }, []);

  if (state === "checking") return <Splash />;
  if (state === "closed") return <Navigate to="/login" replace />;
  return <LoginScreen mode="signup" onLoggedIn={onLoggedIn} />;
}

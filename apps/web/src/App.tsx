import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, setUnauthorizedHandler, tokenStore, type CharacterView, type Me } from "./api";
import { ChatScreen } from "./Chat";
import { CharacterForm } from "./CharacterForm";
import { Home } from "./Home";
import { LoginScreen } from "./LoginScreen";
import { PasswordForm } from "./PasswordForm";
import { SettingsPage } from "./SettingsPage";
import { applyPrefs, loadPrefs } from "./prefs";

// Apply theme and icon shape before the first screen draws, so there's no flash
applyPrefs(loadPrefs());

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
// The chatId is accepted here but the chat screen still opens the newest chat.
// Selecting a chat from the URL comes with the next Chat.tsx step.
function ChatRoute(props: Shared) {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const character = useCharacter(characterId, props.revision);

  if (character === undefined) return <Splash />;
  if (character === null) return <NotFound onBack={() => navigate("/home")} />;

  return (
    <ChatScreen
      key={character.id}
      me={props.me}
      character={character}
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

export default function App() {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  // Bumped after a save or delete, so the lists reload
  const [revision, setRevision] = useState(0);
  // Opened from Settings by a user who wants to change their own password
  const [showPassword, setShowPassword] = useState(false);
  // Settings is still a modal for now. It moves to the URL in a later step.
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      setShowPassword(false);
      setSettingsOpen(false);
    });

    if (!tokenStore.get()) {
      setChecking(false);
      return;
    }
    api
      .me()
      .then(setMe)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) tokenStore.clear();
        setMe(null);
      })
      .finally(() => setChecking(false));
  }, []);

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
    navigate("/home", { replace: true });
  };

  const changed = () => setRevision((r) => r + 1);
  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);
  // Changing a password closes Settings first, so the form isn't hidden behind it
  const openPassword = () => {
    setSettingsOpen(false);
    setShowPassword(true);
  };

  if (checking) return <Splash />;
  // Logged out: the login screen shows at whatever URL was opened, so a shared link still works after login
  if (!me) return <LoginScreen onLoggedIn={setMe} />;

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
        <Route path="/home" element={<HomeRoute {...shared} />} />
        <Route path="/search" element={<HomeRoute {...shared} />} />
        <Route path="/character/new" element={<CreateRoute {...shared} />} />
        <Route path="/character/:characterId/edit" element={<EditRoute {...shared} />} />
        <Route path="/character/:characterId/:chatId" element={<ChatRoute {...shared} />} />
        <Route path="/character/:characterId" element={<ChatRoute {...shared} />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>

      {settingsOpen && (
        <SettingsPage me={me} onClose={closeSettings} onChangePassword={openPassword} />
      )}
    </>
  );
}

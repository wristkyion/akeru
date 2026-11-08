import { useEffect, useState } from "react";
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

type Screen =
  | { kind: "home" }
  | { kind: "chat"; character: CharacterView }
  | { kind: "create" }
  | { kind: "edit"; character: CharacterView };

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [checking, setChecking] = useState(true);
  // Bumped after a save or delete, so the home list and sidebar reload
  const [revision, setRevision] = useState(0);
  // Opened from Settings by a user who wants to change their own password
  const [showPassword, setShowPassword] = useState(false);
  // Settings opens as a modal on top of whatever screen is showing
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      setScreen({ kind: "home" });
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
    setScreen({ kind: "home" });
    setShowPassword(false);
    setSettingsOpen(false);
  };

  const home = () => setScreen({ kind: "home" });
  const openChat = (c: CharacterView) => setScreen({ kind: "chat", character: c });
  const openCreate = () => setScreen({ kind: "create" });
  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);
  // Changing a password closes Settings first, so the form isn't hidden behind it
  const openPassword = () => {
    setSettingsOpen(false);
    setShowPassword(true);
  };

  if (checking) return <div className="splash">Loading…</div>;
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

  const renderScreen = () => {
    if (screen.kind === "create" || screen.kind === "edit") {
      const existing = screen.kind === "edit" ? screen.character : undefined;
      return (
        <div className="app">
          <main className="main form-main">
            <CharacterForm
              existing={existing}
              onCancel={home}
              onDeleted={() => {
                setRevision((r) => r + 1);
                home();
              }}
              onSaved={(saved) => {
                setRevision((r) => r + 1);
                // After creating, go to the chat so the user can start talking right away
                setScreen(existing ? { kind: "home" } : { kind: "chat", character: saved });
              }}
            />
          </main>
        </div>
      );
    }

    if (screen.kind === "chat") {
      return (
        <ChatScreen
          key={screen.character.id}
          me={me}
          character={screen.character}
          revision={revision}
          onHome={home}
          onOpen={openChat}
          onCreate={openCreate}
          onEdit={(c) => setScreen({ kind: "edit", character: c })}
          onDeleted={() => {
            setRevision((r) => r + 1);
            home();
          }}
          onLogout={logout}
          onChangePassword={openPassword}
          onSettings={openSettings}
        />
      );
    }

    return (
      <Home
        me={me}
        revision={revision}
        onOpen={openChat}
        onCreate={openCreate}
        onLogout={logout}
        onChangePassword={openPassword}
        onSettings={openSettings}
      />
    );
  };

  return (
    <>
      {renderScreen()}
      {settingsOpen && (
        <SettingsPage me={me} onClose={closeSettings} onChangePassword={openPassword} />
      )}
    </>
  );
}

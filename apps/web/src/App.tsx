import { useEffect, useState } from "react";
import { api, ApiError, setUnauthorizedHandler, tokenStore, type CharacterView, type Me } from "./api";
import { ChatScreen } from "./Chat";
import { CharacterForm } from "./CharacterForm";
import { Home } from "./Home";
import { LoginScreen } from "./LoginScreen";

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

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      setScreen({ kind: "home" });
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
  };

  const home = () => setScreen({ kind: "home" });
  const openChat = (c: CharacterView) => setScreen({ kind: "chat", character: c });
  const openCreate = () => setScreen({ kind: "create" });

  if (checking) return <div className="splash">Loading…</div>;
  if (!me) return <LoginScreen onLoggedIn={setMe} />;

  if (screen.kind === "create" || screen.kind === "edit") {
    const existing = screen.kind === "edit" ? screen.character : undefined;
    return (
      <div className="app">
        <main className="main form-main">
          <CharacterForm
            existing={existing}
            onCancel={home}
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
    />
  );
}

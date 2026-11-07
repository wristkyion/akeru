import { useEffect, useState } from "react";
import { api, ApiError, setUnauthorizedHandler, tokenStore, type CharacterView, type Me } from "./api";
import { ChatScreen } from "./Chat";
import { Home } from "./Home";
import { LoginScreen } from "./LoginScreen";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [active, setActive] = useState<CharacterView | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      setActive(null);
    });

    if (!tokenStore.get()) {
      setChecking(false);
      return;
    }
    // Check the saved token is still valid before showing the app
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
    setActive(null);
  };

  if (checking) return <div className="splash">Loading…</div>;
  if (!me) return <LoginScreen onLoggedIn={setMe} />;
  if (active) {
    return (
      <ChatScreen
        key={active.id}
        me={me}
        character={active}
        onHome={() => setActive(null)}
        onOpen={setActive}
        onLogout={logout}
      />
    );
  }
  return <Home me={me} onOpen={setActive} onLogout={logout} />;
}

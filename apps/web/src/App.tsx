import { useEffect, useState } from "react";
import { api, ApiError, setUnauthorizedHandler, tokenStore, type Me } from "./api";
import { Home } from "./Home";
import { LoginScreen } from "./LoginScreen";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(null));

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
  };

  if (checking) return <div className="splash">Loading…</div>;
  if (!me) return <LoginScreen onLoggedIn={setMe} />;
  return <Home me={me} onLogout={logout} />;
}

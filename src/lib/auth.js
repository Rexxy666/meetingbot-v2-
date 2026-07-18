import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";
import { clearSession, getStoredUser, getToken, setSession } from "./session.js";
import { disconnectSocket } from "./socket.js";

export function useAuth() {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getToken());
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const t = getToken();
      if (!t) {
        if (!cancelled) {
          setUser(null);
          setToken(null);
          setBooting(false);
        }
        return;
      }

      try {
        const { user: me } = await api.fetchMe();
        if (!cancelled) {
          setUser(me);
          setToken(t);
          setSession({ token: t, user: me });
        }
      } catch {
        clearSession();
        disconnectSocket();
        if (!cancelled) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async ({ name, email, password }) => {
    const result = await api.register({ name, email, password });
    setSession(result);
    setUser(result.user);
    setToken(result.token);
    return result.user;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const result = await api.login({ email, password });
    setSession(result);
    setUser(result.user);
    setToken(result.token);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    disconnectSocket();
    setUser(null);
    setToken(null);
  }, []);

  return {
    user,
    token,
    booting,
    isAuthenticated: Boolean(user && token),
    register,
    login,
    logout,
  };
}

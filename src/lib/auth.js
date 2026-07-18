import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";
import { clearSession, getStoredUser, getToken, resetLocalAuthCache, setSession } from "./session.js";
import { disconnectSocket, reconnectSocket } from "./socket.js";

export function useAuth() {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getToken());
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const t = getToken();
      const cached = getStoredUser();

      if (!t) {
        if (!cancelled) {
          setUser(null);
          setToken(null);
          setBooting(false);
        }
        return;
      }

      // 先用快取維持畫面，再向後端驗證
      if (!cancelled && cached) setUser(cached);

      try {
        const { user: me } = await api.fetchMe();
        if (!cancelled) {
          setUser(me);
          setToken(t);
          setSession({ token: t, user: me });
        }
      } catch (e) {
        // 只有明確未授權才清 session；網路錯誤保留本機狀態，避免刷新就被迫重登
        const status = e?.status;
        if (status === 401) {
          clearSession();
          disconnectSocket();
          if (!cancelled) {
            setUser(null);
            setToken(null);
          }
        } else if (!cancelled && cached) {
          setUser(cached);
          setToken(t);
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
    reconnectSocket();
    return result.user;
  }, []);

  const login = useCallback(async ({ email, password }) => {
    const result = await api.login({
      email: String(email || "").trim().toLowerCase(),
      password,
    });
    setSession(result);
    setUser(result.user);
    setToken(result.token);
    reconnectSocket();
    return result.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    disconnectSocket();
    setUser(null);
    setToken(null);
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const name = patch?.name;
    // 樂觀更新 UI
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      const t = getToken();
      if (t) setSession({ token: t, user: next });
      return next;
    });
    // 同步到後端（失敗不擋 UI，下次 fetchMe 會校正）
    if (name) {
      try {
        const { user: me } = await api.updateProfile({ name });
        setUser(me);
        const t = getToken();
        if (t) setSession({ token: t, user: me });
        return me;
      } catch {
        return getStoredUser();
      }
    }
    return getStoredUser();
  }, []);

  const resetLocalCache = useCallback(() => {
    resetLocalAuthCache();
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
    updateProfile,
    resetLocalCache,
    apiBase: api.resolveApiBase(),
  };
}

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

  const loginWithGoogle = useCallback(async () => {
    const { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } = await import("./firebase.js");
    if (!isFirebaseConfigured) {
      throw new Error("尚未設定 Firebase（VITE_FIREBASE_* 環境變數）");
    }
    const { signInWithPopup } = await import("firebase/auth");
    const auth = getFirebaseAuth();
    const cred = await signInWithPopup(auth, getGoogleProvider());
    const idToken = await cred.user.getIdToken();
    const result = await api.loginWithGoogle(idToken);
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

  const updateProfile = useCallback(async (patch = {}) => {
    // 樂觀更新 UI
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      const t = getToken();
      if (t) setSession({ token: t, user: next });
      return next;
    });

    // 若有 Firebase Auth session，同步 displayName / photoURL
    try {
      const { getFirebaseAuth, isFirebaseConfigured } = await import("./firebase.js");
      if (isFirebaseConfigured) {
        const fbUser = getFirebaseAuth()?.currentUser;
        if (fbUser && (patch.name != null || patch.photoURL != null)) {
          const { updateProfile: fbUpdateProfile } = await import("firebase/auth");
          const fbPatch = {};
          if (patch.name != null) fbPatch.displayName = String(patch.name).trim();
          if (patch.photoURL != null) fbPatch.photoURL = String(patch.photoURL).trim();
          await fbUpdateProfile(fbUser, fbPatch);
        }
      }
    } catch {
      /* Firebase Auth 同步失敗不阻斷後端更新 */
    }

    try {
      const { user: me } = await api.updateProfile(patch);
      setUser(me);
      const t = getToken();
      if (t) setSession({ token: t, user: me });
      return me;
    } catch (e) {
      throw e;
    }
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
    loginWithGoogle,
    logout,
    updateProfile,
    resetLocalCache,
    apiBase: api.resolveApiBase(),
  };
}

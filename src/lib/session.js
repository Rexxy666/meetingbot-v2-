const TOKEN_KEY = "meetflow.auth.token";
const USER_KEY = "meetflow.auth.user";
/** Cookie 跨埠共用（localhost:5174 / 5175），補 localStorage 依 origin 隔離的缺口 */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 天，對齊 JWT

function canUseDom() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readCookie(name) {
  if (!canUseDom()) return null;
  try {
    const parts = document.cookie ? document.cookie.split("; ") : [];
    for (const part of parts) {
      const i = part.indexOf("=");
      if (i === -1) continue;
      if (part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCookie(name, value, maxAgeSec = COOKIE_MAX_AGE) {
  if (!canUseDom()) return;
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function clearCookie(name) {
  if (!canUseDom()) return;
  try {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function normalizeUser(user) {
  if (!user || typeof user !== "object" || !user.id || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name || "使用者",
    createdAt: user.createdAt,
  };
}

export function getToken() {
  try {
    const fromLs = localStorage.getItem(TOKEN_KEY);
    if (fromLs) return fromLs;
  } catch {
    /* ignore */
  }
  const fromCookie = readCookie(TOKEN_KEY);
  if (fromCookie) {
    try {
      localStorage.setItem(TOKEN_KEY, fromCookie);
    } catch {
      /* ignore */
    }
    return fromCookie;
  }
  return null;
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw) {
      const user = normalizeUser(JSON.parse(raw));
      if (user) return user;
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }

  const rawCookie = readCookie(USER_KEY);
  if (!rawCookie) return null;
  try {
    const user = normalizeUser(JSON.parse(rawCookie));
    if (!user) {
      clearCookie(USER_KEY);
      return null;
    }
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
    return user;
  } catch {
    clearCookie(USER_KEY);
    return null;
  }
}

export function setSession({ token, user }) {
  const normalized = normalizeUser(user);
  if (!token || !normalized) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
  writeCookie(TOKEN_KEY, token);
  writeCookie(USER_KEY, JSON.stringify(normalized));
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  clearCookie(TOKEN_KEY);
  clearCookie(USER_KEY);
}

/** 清除本機登入快取（不影響後端帳號資料） */
export function resetLocalAuthCache() {
  clearSession();
  const legacy = ["users", "currentUser", "meetflow.users", "meetflow.currentUser"];
  for (const k of legacy) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

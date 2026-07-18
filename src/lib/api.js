import { clearSession, getToken } from "./session.js";

// 本機開發預設打本地後端（含 /api/auth）；正式環境才用 Render
export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : "https://meetingbot-v2-qyxm.onrender.com");

async function request(path, options = {}) {
  const { headers: optHeaders, skipAuth = false, ...rest } = options;
  const headers = { ...(optHeaders || {}) };

  if (rest.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (!skipAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers,
      mode: "cors",
    });
  } catch (e) {
    throw new Error(
      `無法連線後端（${API_BASE}）。可能是 CORS 未更新、服務冷啟動中，或尚未重新部署。原始錯誤：${e.message}`
    );
  }

  if (res.status === 401 && !skipAuth) {
    clearSession();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 404 && path.startsWith("/api/auth")) {
      throw new Error(
        "註冊／登入 API 不存在（404）。請確認本地已執行 npm run dev:server，或 Render 後端已部署含 auth 的最新版本。"
      );
    }
    throw new Error(err.error || `請求失敗 (${res.status})`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export function register({ name, email, password }) {
  return request("/api/auth/register", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ name, email, password }),
  });
}

export function login({ email, password }) {
  return request("/api/auth/login", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe() {
  return request("/api/auth/me");
}

export function fetchMeetings() {
  return request("/api/meetings");
}

export function fetchMeeting(id) {
  return request(`/api/meetings/${id}`);
}

export function createMeeting(data) {
  return request("/api/meetings", {
    method: "POST",
    body: JSON.stringify({
      title: data.title.trim(),
      participants: data.participants || [],
      pains: data.pains || [],
      goals: data.goals || [],
      links: data.links || [],
      durationMin: data.durationMin || 30,
    }),
  });
}

export function patchMeeting(id, patch) {
  return request(`/api/meetings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteMeeting(id) {
  return request(`/api/meetings/${id}`, { method: "DELETE" });
}

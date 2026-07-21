import { clearSession, getToken } from "./session.js";

/** 依目前開啟的網址自動推後端：localhost → localhost:3001；手機 LAN → 同 IP:3001 */
export function resolveApiBase() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (!import.meta.env.DEV) return "https://meetingbot-v2-qyxm.onrender.com";
  const host =
    typeof window !== "undefined" && window.location?.hostname
      ? window.location.hostname
      : "localhost";
  return `http://${host}:3001`;
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(path, options = {}) {
  const { headers: optHeaders, skipAuth = false, timeoutMs = 8000, ...rest } = options;
  const headers = { ...(optHeaders || {}) };
  const base = resolveApiBase();

  if (rest.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (!skipAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      ...rest,
      headers,
      mode: "cors",
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e?.name === "AbortError";
    throw new ApiError(
      aborted
        ? `連線後端逾時（${base}）。請確認 npm run dev:server 已啟動，且手機與電腦在同一 Wi‑Fi。`
        : `無法連線後端（${base}）。請確認已執行 npm run dev:server。原始錯誤：${e.message}`,
      0
    );
  } finally {
    clearTimeout(timer);
  }

  // 只有明確的 401 才清 session；網路錯誤／5xx 不應強制登出
  if (res.status === 401 && !skipAuth) {
    clearSession();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 404 && path.startsWith("/api/auth")) {
      throw new ApiError(
        body.error ||
          "註冊／登入 API 不存在（404）。請確認本地已執行 npm run dev:server，或 Render 後端已部署最新版。",
        res.status
      );
    }
    throw new ApiError(body.error || `請求失敗 (${res.status})`, res.status);
  }

  if (res.status === 204) return null;
  return res.json();
}

export function register({ name, email, password }) {
  return request("/api/auth/register", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({
      name: String(name || "").trim(),
      email: String(email || "").trim().toLowerCase(),
      password,
    }),
  });
}

export function login({ email, password }) {
  return request("/api/auth/login", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({
      email: String(email || "").trim().toLowerCase(),
      password,
    }),
  });
}

/** Firebase Google 登入：帶 Firebase ID Token 換後端 JWT */
export function loginWithGoogle(idToken) {
  return request("/api/auth/google", {
    method: "POST",
    skipAuth: true,
    timeoutMs: 15000,
    body: JSON.stringify({ idToken }),
  });
}

export function fetchMe() {
  return request("/api/auth/me");
}

export function updateProfile({ name }) {
  return request("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify({ name: String(name || "").trim() }),
  });
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
      scenario: data.scenario || "brainstorm",
      scenarioLabel: data.scenarioLabel || "",
      scenarioEmoji: data.scenarioEmoji || "",
      extra: data.extra || {},
      attendees: data.attendees || [],
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

// ── 好友 / 邀請 ──────────────────────────────────────────────────────────────

export function searchUsers(q) {
  return request(`/api/users/search?q=${encodeURIComponent(q)}`);
}

export function fetchFriends() {
  return request("/api/friends");
}

export function fetchFriendRequests() {
  return request("/api/friends/requests");
}

export function sendFriendRequest(toUserId) {
  return request("/api/friends/requests", { method: "POST", body: JSON.stringify({ toUserId }) });
}

export function respondFriendRequest(id, accept) {
  return request(`/api/friends/requests/${id}/respond`, { method: "POST", body: JSON.stringify({ accept }) });
}

export function unfriend(userId) {
  return request(`/api/friends/${userId}`, { method: "DELETE" });
}

export function fetchInvites() {
  return request("/api/invites");
}

export function respondInvite(id, accept) {
  return request(`/api/invites/${id}/respond`, { method: "POST", body: JSON.stringify({ accept }) });
}

export function inviteToMeeting(meetingId, toUserId) {
  return request(`/api/meetings/${meetingId}/invite`, { method: "POST", body: JSON.stringify({ toUserId }) });
}

/** 透過專屬連結加入會議（已登入者自動寫入與會者） */
export function joinMeetingByLink(meetingId) {
  return request(`/api/meetings/${meetingId}/join`, { method: "POST", body: JSON.stringify({}) });
}

/**
 * 個人化私密洞察：把「自己的康乃爾筆記」送去後端做一次性分析。
 * ⚠ 後端不落地儲存、結果只回給呼叫者，絕不寫入 meeting。
 */
export function fetchPrivateInsights(meetingId, { cornell, mode }) {
  return request(`/api/meetings/${encodeURIComponent(meetingId)}/private-insights`, {
    method: "POST",
    timeoutMs: 90000,
    body: JSON.stringify({
      cornell: {
        cue: String(cornell?.cue || ""),
        notes: String(cornell?.notes || ""),
        summary: String(cornell?.summary || ""),
      },
      mode: mode === "student" ? "student" : "enterprise",
    }),
  });
}

/** 透過後端 Gemini 整理會議筆記（API Key 留在伺服器） */
export function summarizeNotes({ notes, participants, title, mode }) {
  return request("/api/ai/summarize", {
    method: "POST",
    timeoutMs: 90000,
    body: JSON.stringify({
      notes: String(notes || ""),
      participants: Array.isArray(participants) ? participants : [],
      title: String(title || ""),
      mode: mode === "student" ? "student" : "enterprise",
    }),
  });
}

/**
 * 會中靜音問答：語音轉文字問題 + 近 5 分鐘逐字稿 → 純文字答案（無 TTS）。
 */
export function askLiveSilentAi({ question, meetingTranscript, title, topic, mode }) {
  return request("/api/ai/ask", {
    method: "POST",
    timeoutMs: 60000,
    body: JSON.stringify({
      question: String(question || ""),
      meetingTranscript: String(meetingTranscript || ""),
      title: String(title || ""),
      topic: String(topic || ""),
      mode: mode === "student" ? "student" : "enterprise",
    }),
  });
}

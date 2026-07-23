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

export function updateProfile(patch = {}) {
  const body = {};
  if (patch.name != null) body.name = String(patch.name).trim();
  if (patch.photoURL != null) body.photoURL = String(patch.photoURL).trim();
  if (patch.avatarColor != null) body.avatarColor = String(patch.avatarColor).trim();
  return request("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function uploadAvatar({ contentType, dataBase64 }) {
  return request("/api/auth/avatar", {
    method: "POST",
    timeoutMs: 60000,
    body: JSON.stringify({ contentType, dataBase64 }),
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
  const q = String(question || "").trim();
  if (!q) {
    return Promise.reject(new ApiError("請先輸入或說出問題", 400));
  }
  return request("/api/ai/ask", {
    method: "POST",
    timeoutMs: 60000,
    body: JSON.stringify({
      question: q,
      meetingTranscript: String(meetingTranscript || ""),
      title: String(title || ""),
      topic: String(topic || ""),
      mode: mode === "student" ? "student" : "enterprise",
    }),
  });
}

/**
 * 會中靜音問答（SSE）：onChunk 收到累積全文，完成回傳 { answer, source }。
 * stream 端點 404／不可用時自動降級為 /api/ai/ask。
 */
export async function askLiveSilentAiStream(
  { question, meetingTranscript, title, topic, mode },
  { onChunk, signal } = {}
) {
  const q = String(question || "").trim();
  if (!q) {
    throw new ApiError("請先輸入或說出問題", 400);
  }

  const payload = {
    question: q,
    meetingTranscript,
    title,
    topic,
    mode,
  };

  const runOneshootFallback = async () => {
    const fallback = await askLiveSilentAi(payload);
    const answer = String(fallback?.answer || "").trim();
    if (!answer) throw new ApiError("AI 未回傳內容，請稍後再試", 502);
    // 輕量打字機，維持串流 UX
    let i = 0;
    while (i < answer.length) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      i = Math.min(answer.length, i + 4);
      onChunk?.(answer.slice(0, i));
      await new Promise((r) => setTimeout(r, 16));
    }
    return {
      answer,
      source: fallback?.source || "mock",
      silent: true,
      ...(fallback || {}),
    };
  };

  const base = resolveApiBase();
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${base}/api/ai/ask/stream`, {
      method: "POST",
      headers,
      mode: "cors",
      signal,
      body: JSON.stringify({
        question: q,
        meetingTranscript: String(meetingTranscript || ""),
        title: String(title || ""),
        topic: String(topic || ""),
        mode: mode === "student" ? "student" : "enterprise",
      }),
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    // 網路錯誤 → 降級一次性 API
    return runOneshootFallback();
  }

  if (res.status === 401) {
    clearSession();
  }

  // 舊後端尚未部署 stream 路由、或代理不支援 → 降級
  if (res.status === 404 || res.status === 405 || res.status === 501 || res.status === 502) {
    return runOneshootFallback();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      body.error ||
      (res.status >= 500
        ? "AI 服務暫時忙碌，請稍後重試"
        : `無法完成提問（${res.status}）`);
    throw new ApiError(msg, res.status);
  }
  if (!res.body) {
    return runOneshootFallback();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let source = "gemini";
  let donePayload = null;

  const handleData = (raw) => {
    const line = String(raw || "").trim();
    if (!line || line === "[DONE]") return;
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }
    if (data.type === "chunk") {
      answer = String(data.text || "");
      onChunk?.(answer);
      return;
    }
    if (data.type === "done") {
      answer = String(data.answer || answer || "").trim();
      source = data.source || source;
      donePayload = data;
      onChunk?.(answer);
      return;
    }
    if (data.type === "error") {
      throw new ApiError(data.error || "AI 問答失敗", 500);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed.startsWith("data:")) continue;
        handleData(trimmed.slice(5).trim());
      }
    }
    if (buffer.trim().startsWith("data:")) {
      handleData(buffer.trim().slice(5).trim());
    }
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    if (e instanceof ApiError) throw e;
    return runOneshootFallback();
  }

  if (!answer && !donePayload) {
    return runOneshootFallback();
  }

  return { answer, source, silent: true, ...(donePayload || {}) };
}

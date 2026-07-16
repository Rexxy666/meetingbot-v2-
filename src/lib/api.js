export const API_BASE = import.meta.env.VITE_API_URL || "https://meetingbot-v2-qyxm.onrender.com";

async function request(path, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const headers = { ...(optHeaders || {}) };

  // 只有送出 body 時才加 Content-Type，避免多餘的 CORS 預檢
  if (rest.body != null && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
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

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `請求失敗 (${res.status})`);
  }

  if (res.status === 204) return null;
  return res.json();
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

/**
 * 穩定裝置指紋（本機瀏覽器）：供 AI 每日額度（每裝置 10 次）使用。
 * 存在 localStorage；隱私模式失敗時退回 session / 記憶體。
 */

const STORAGE_KEY = "meetflow:deviceId";

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let memoryId = "";

export function getDeviceId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9._:-]+$/.test(existing)) return existing;
  } catch {
    /* private mode */
  }
  if (memoryId) return memoryId;

  const next = randomId();
  memoryId = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    try {
      sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* keep memory only */
    }
  }
  return next;
}

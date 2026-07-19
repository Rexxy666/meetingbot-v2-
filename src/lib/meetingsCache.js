/**
 * 會後 AI 摘要快取：同一場會議 + 同一份資料源只呼叫 Gemini 一次，避免重複燒 Token。
 * 記憶體優先，並同步寫入 sessionStorage（同分頁重新整理仍命中）。
 */

const memory = new Map();
const STORAGE_PREFIX = "meetflow:ai-summary:";

function sourceKey(meetingId, sourceText) {
  const raw = `${meetingId}::${String(sourceText || "").trim()}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${meetingId}:${(h >>> 0).toString(36)}`;
}

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

/** @returns {null | { review: object, actions: array, message?: string }} */
export function getCachedSummary(meetingId, sourceText) {
  const key = sourceKey(meetingId, sourceText);
  if (memory.has(key)) return memory.get(key);
  const fromSession = readSession(key);
  if (fromSession) {
    memory.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function setCachedSummary(meetingId, sourceText, payload) {
  const key = sourceKey(meetingId, sourceText);
  memory.set(key, payload);
  writeSession(key, payload);
  return key;
}

/** 將逐字稿陣列格式化成餵給 Gemini 的純文字 */
export function formatTranscriptForAi(transcript = []) {
  if (!Array.isArray(transcript) || !transcript.length) return "";
  return transcript
    .map((row) => {
      const time = row.time || row.at || "";
      const speaker = row.speaker || row.name || "與會者";
      const text = String(row.text || "").trim();
      if (!text) return "";
      return time ? `[${time}] ${speaker}: ${text}` : `${speaker}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

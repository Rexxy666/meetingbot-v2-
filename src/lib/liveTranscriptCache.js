/**
 * 進行中會議逐字稿快取：LiveRoom remount（稍後再開 → 回到會議）不丟失。
 * 記憶體優先，並寫入 sessionStorage（同分頁／PIP 往返仍命中）。
 */

const memory = new Map();
const STORAGE_PREFIX = "meetflow:live-transcript:";

function storageKey(meetingId) {
  return STORAGE_PREFIX + String(meetingId || "");
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && String(r.text || "").trim())
    .map((r) => ({
      id: r.id || `stt-${r.at || Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: r.time || "",
      at: Number.isFinite(r.at) ? r.at : Date.now(),
      speaker: r.speaker || "與會者",
      text: String(r.text || "").trim(),
    }));
}

/** 依 id 合併多來源，保留出現順序（較新／較長優先） */
export function mergeTranscriptRows(...sources) {
  const map = new Map();
  const order = [];
  for (const src of sources) {
    for (const row of normalizeRows(src)) {
      const key = String(row.id);
      if (!map.has(key)) {
        map.set(key, row);
        order.push(key);
      } else {
        const prev = map.get(key);
        // 同 id 取較完整文字
        if (String(row.text).length >= String(prev.text).length) {
          map.set(key, { ...prev, ...row });
        }
      }
    }
  }
  return order.map((k) => map.get(k)).slice(-10_000);
}

export function loadLiveTranscript(meetingId) {
  const id = String(meetingId || "");
  if (!id) return [];
  if (memory.has(id)) return normalizeRows(memory.get(id));
  try {
    const raw = sessionStorage.getItem(storageKey(id));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const rows = normalizeRows(parsed);
    memory.set(id, rows);
    return rows;
  } catch {
    return [];
  }
}

export function saveLiveTranscript(meetingId, rows) {
  const id = String(meetingId || "");
  if (!id) return;
  const list = normalizeRows(rows).slice(-10_000);
  memory.set(id, list);
  try {
    sessionStorage.setItem(storageKey(id), JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}

export function clearLiveTranscript(meetingId) {
  const id = String(meetingId || "");
  if (!id) return;
  memory.delete(id);
  try {
    sessionStorage.removeItem(storageKey(id));
  } catch {
    /* ignore */
  }
}

/** 初次掛載：合併伺服器會議資料與本機快取，取最完整版本 */
export function hydrateLiveTranscript(meetingId, meetingTranscript) {
  const merged = mergeTranscriptRows(meetingTranscript, loadLiveTranscript(meetingId));
  if (merged.length) saveLiveTranscript(meetingId, merged);
  return merged;
}

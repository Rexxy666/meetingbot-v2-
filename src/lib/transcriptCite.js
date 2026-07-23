/**
 * 逐字稿引證（Source Citation）資料層
 *
 * ── buildTranscriptRows：把 meeting.transcript 正規化成帶穩定錨點 id 的列
 * ── resolveCitation：用「字元 bigram 重疊」把一句摘要／決議對應回最相關的逐字稿列
 *
 * 為什麼用 bigram 而非 whitespace token：中文沒有空白分詞，
 * 用 2 字連續片段（shingle）比對，才抓得到「宜蘭兩天一夜」↔「先鎖定宜蘭兩天一夜」這種對應。
 *
 * 這層完全在前端運算，不依賴 AI 是否回傳 citation，
 * 所以無論真跑 Gemini 或降級 mock，引證跳轉都能運作。
 */

const ANCHOR_PREFIX = "transcript-";

export function anchorIdForIndex(i) {
  return `${ANCHOR_PREFIX}${i}`;
}

/** 正規化逐字稿列；過濾空列後重新編號，anchorId 用連續 index 保證唯一 */
export function buildTranscriptRows(meeting) {
  const raw = Array.isArray(meeting?.transcript) ? meeting.transcript : [];
  return raw
    .filter((row) => String(row?.text || "").trim())
    .map((row, i) => ({
      id: row?.id || `row-${i}`,
      index: i,
      anchorId: anchorIdForIndex(i),
      time: String(row?.time || row?.at || "").trim(),
      speaker: String(row?.speaker || row?.name || "與會者").trim(),
      text: String(row.text).trim(),
    }));
}

/** 產生某字串的 bigram + 英數詞集合 */
function shingles(str) {
  const s = String(str || "").toLowerCase();
  const set = new Set();
  // 英數詞（長度 >= 2）
  for (const w of s.match(/[a-z0-9]{2,}/g) || []) set.add(w);
  // 中日韓字元的 2-gram
  const han = s.match(/[一-鿿]/g) || [];
  const hanStr = han.join("");
  for (let i = 0; i < hanStr.length - 1; i++) {
    set.add(hanStr.slice(i, i + 2));
  }
  return set;
}

/**
 * 把 text 對應回最相關的逐字稿列。
 * 回傳 { anchorId, time, speaker, rowId, score } 或 null（無重疊）。
 */
export function resolveCitation(text, rows) {
  const q = shingles(text);
  if (!q.size || !Array.isArray(rows) || !rows.length) return null;

  let best = null;
  let bestScore = 0;
  for (const row of rows) {
    const r = shingles(row.text);
    let hit = 0;
    for (const g of q) if (r.has(g)) hit += 1;
    if (hit > bestScore) {
      bestScore = hit;
      best = row;
    }
  }
  if (!best || bestScore < 1) return null;
  return {
    anchorId: best.anchorId,
    time: best.time,
    speaker: best.speaker,
    rowId: best.id,
    score: bestScore,
  };
}

/**
 * 對一組字串（決議／重點）逐一附上 citation。
 * 回傳 [{ text, citation }]，citation 可能為 null。
 */
export function attachCitations(texts = [], rows = []) {
  return (texts || [])
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .map((text) => ({ text, citation: resolveCitation(text, rows) }));
}

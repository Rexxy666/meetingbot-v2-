/**
 * 會中靜音 AI：打包「語音問題 + 近 5 分鐘逐字稿」脈絡。
 * 回覆一律文字，前端以打字機動畫呈現（無 TTS）。
 */

const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * 從會議逐字稿列取出近 5 分鐘內容（字串，供 LLM context）。
 * 列格式相容：{ text, speaker, time, at? }；若無時間戳則取最後 N 句。
 */
export function buildMeetingTranscriptWindow(rows = [], { windowMs = FIVE_MIN_MS, maxLines = 40 } = {}) {
  const list = Array.isArray(rows) ? rows.filter((r) => r?.text) : [];
  if (!list.length) return "";

  const now = Date.now();
  const withTs = list.filter((r) => Number.isFinite(r.at) || Number.isFinite(r.ts));
  let sliced;
  if (withTs.length) {
    sliced = list.filter((r) => {
      const t = Number(r.at ?? r.ts);
      return Number.isFinite(t) ? now - t <= windowMs : true;
    });
    if (sliced.length > maxLines) sliced = sliced.slice(-maxLines);
  } else {
    sliced = list.slice(-maxLines);
  }

  return sliced
    .map((r) => `${r.speaker || "與會者"}：${String(r.text).trim()}`)
    .filter(Boolean)
    .join("\n");
}

/** 示範用：將問題與會議脈絡組成送 LLM 的 payload */
export function buildSilentAskPayload({
  question,
  transcriptRows = [],
  title = "",
  topic = "",
  mode = "enterprise",
}) {
  const meetingTranscript = buildMeetingTranscriptWindow(transcriptRows);
  return {
    question: String(question || "").trim(),
    meetingTranscript,
    title: String(title || ""),
    topic: String(topic || ""),
    mode: mode === "student" ? "student" : "enterprise",
    /** 預留欄位：日後可加 speaker / locale / privacyMode */
    meta: {
      silent: true,
      input: "voice-to-text",
      output: "text-only",
      contextWindow: "5m",
    },
  };
}

/** 打字機：將完整答案逐字回呼（模擬 streaming） */
export function typewriterStream(fullText, { onChunk, onDone, cps = 36, signal } = {}) {
  const text = String(fullText || "");
  let i = 0;
  let timer = null;

  return new Promise((resolve) => {
    const tick = () => {
      if (signal?.aborted) {
        onDone?.(text.slice(0, i), { aborted: true });
        resolve(text.slice(0, i));
        return;
      }
      i = Math.min(text.length, i + Math.max(1, Math.round(cps / 18)));
      onChunk?.(text.slice(0, i));
      if (i >= text.length) {
        onDone?.(text, { aborted: false });
        resolve(text);
        return;
      }
      timer = setTimeout(tick, 1000 / cps);
    };
    tick();
    signal?.addEventListener?.("abort", () => {
      if (timer) clearTimeout(timer);
    });
  });
}

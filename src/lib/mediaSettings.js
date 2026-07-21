/**
 * 大廳 → 會議室 媒體設定與串流交接
 * Green Room 取得的 MediaStream 可 stash，MeetingRoom 進房時 take 以免重開裝置。
 */

export function defaultMediaSettings(overrides = {}) {
  return {
    isMuted: true,
    isVideoOff: true,
    selectedMic: "",
    selectedCamera: "",
    selectedSpeaker: "",
    ...overrides,
  };
}

let pendingStream = null;
let pendingSettings = null;

/** 進入會議前暫存串流（勿 stop tracks） */
export function stashMediaHandoff(stream, settings) {
  pendingStream = stream || null;
  pendingSettings = settings ? { ...settings } : null;
}

/** 會議室取走交接；取後清空，避免重複綁定 */
export function takeMediaHandoff() {
  const stream = pendingStream;
  const settings = pendingSettings;
  pendingStream = null;
  pendingSettings = null;
  return { stream, settings };
}

/** 取消進入時釋放尚未交接的串流 */
export function discardMediaHandoff() {
  if (pendingStream) {
    pendingStream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
  }
  pendingStream = null;
  pendingSettings = null;
}

export function describeJoinState(settings) {
  if (!settings) return "立即加入";
  const mic = settings.isMuted ? "靜音" : "開麥";
  const cam = settings.isVideoOff ? "關鏡頭" : "開鏡頭";
  return `以「${mic} · ${cam}」加入`;
}

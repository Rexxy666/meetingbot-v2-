/**
 * 進行中會議（PIP／回到會議）的 session 標記。
 * 結束會議時必須清除，避免看板誤判仍在開會。
 */

const KEY = "meetflow:activeLiveMeetingId";

export function getActiveLiveMeetingId() {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setActiveLiveMeetingId(meetingId) {
  const id = String(meetingId || "").trim();
  try {
    if (!id) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearActiveLiveMeetingId(meetingId) {
  try {
    if (!meetingId) {
      sessionStorage.removeItem(KEY);
      return;
    }
    if (getActiveLiveMeetingId() === String(meetingId)) {
      sessionStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}

export function isMeetingEnded(m) {
  if (!m) return false;
  return m.status === "done" || m.meetingStatus === "ended";
}

export function isMeetingLive(m) {
  if (!m || isMeetingEnded(m)) return false;
  return m.status === "live";
}

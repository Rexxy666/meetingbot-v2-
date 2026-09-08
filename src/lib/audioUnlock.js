const FLAG = "meetflow:audioUnlocked";

let ctx = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) ctx = new Ctx();
  return ctx;
}

/** 在使用者點擊堆疊裡呼叫（大廳加入、麥克風鈕），之後才能播遠端聲音 */
export async function unlockMeetingAudio(root = typeof document !== "undefined" ? document : null) {
  try {
    sessionStorage.setItem(FLAG, "1");
  } catch {
    /* ignore */
  }
  const ac = getCtx();
  if (ac && ac.state !== "running") {
    try {
      await ac.resume();
    } catch {
      /* ignore */
    }
  }
  if (!root?.querySelectorAll) return ac?.state === "running";
  const nodes = root.querySelectorAll("audio[data-remote-audio]");
  await Promise.all(
    [...nodes].map((el) => {
      el.muted = false;
      el.volume = 1;
      const p = el.play();
      return p?.catch ? p.catch(() => {}) : Promise.resolve();
    })
  );
  return !ac || ac.state === "running";
}

export function wasAudioUnlocked() {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

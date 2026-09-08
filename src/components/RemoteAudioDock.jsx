import { useEffect, useRef } from "react";
import { unlockMeetingAudio } from "../lib/audioUnlock.js";

function RemotePeerAudio({ stream, trackSig }) {
  const elRef = useRef(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !stream) return undefined;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.muted = false;
    el.volume = 1;
    el.playsInline = true;
    const play = el.play();
    if (play?.catch) play.catch(() => {});
    return undefined;
  }, [stream, trackSig]);

  return <audio ref={elRef} data-remote-audio autoPlay playsInline />;
}

/**
 * 遠端聲音不依賴視訊格子（手機切分頁、桌機收合側欄都會卸載 video）。
 * 以 2px 可見 audio 播放，避免 iOS 對 display:none / 完全透明元素停聲。
 */
export default function RemoteAudioDock({ remotes = [] }) {
  useEffect(() => {
    void unlockMeetingAudio();
  }, [remotes]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: 0,
        bottom: 0,
        width: 2,
        height: 2,
        opacity: 0.05,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {remotes.map((p) =>
        p?.stream ? (
          <RemotePeerAudio key={p.socketId} stream={p.stream} trackSig={p.trackSig || ""} />
        ) : null
      )}
    </div>
  );
}

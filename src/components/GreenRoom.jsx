import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Headphones,
  Mic,
  MicOff,
  Users,
  Video,
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import { resolveAvatarColor } from "../lib/avatarColors.js";
import {
  defaultMediaSettings,
  describeJoinState,
  discardMediaHandoff,
  stashMediaHandoff,
} from "../lib/mediaSettings.js";

const CARD = "bg-white border border-gray-100 shadow-card rounded-2xl";
const SELECT =
  "w-full h-11 rounded-xl border border-gray-100 bg-white px-3 text-sm text-navy-800 shadow-sm focus:outline-none focus:border-coral-300 focus:ring-2 focus:ring-coral-100";

function formatWhen(ts) {
  if (!ts) return "時間未定";
  try {
    return new Date(ts).toLocaleString("zh-TW", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "時間未定";
  }
}

/**
 * 大廳準備頁（Green Room / Pre-join Lobby）
 * - 預設麥／鏡頭關閉（友善 UX）
 * - 進入會議時 stash 串流 + mediaSettings，供 LiveMeeting 繼承
 */
export default function GreenRoom({ meeting, me, onCancel, onJoin }) {
  const [mediaSettings, setMediaSettings] = useState(() => defaultMediaSettings());
  const [devices, setDevices] = useState({ audioInputs: [], audioOutputs: [], videoInputs: [] });
  const [previewError, setPreviewError] = useState("");
  const [busyJoin, setBusyJoin] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const joiningRef = useRef(false);

  const title = meeting?.title || "會議";
  const displayName = String(me?.name || "").trim() || "我";
  const avatarColor = resolveAvatarColor(me?.avatarColor);
  const onlineHint = useMemo(() => {
    const n =
      (meeting?.attendees || []).length ||
      (meeting?.participants || []).length ||
      (meeting?.inviteRoster || []).length ||
      0;
    return n > 0 ? `約 ${n} 位與會` : "等待與會者";
  }, [meeting]);

  const stopLocalStream = useCallback(() => {
    const s = streamRef.current;
    if (!s) return;
    s.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = list.filter((d) => d.kind === "audioinput");
      const audioOutputs = list.filter((d) => d.kind === "audiooutput");
      const videoInputs = list.filter((d) => d.kind === "videoinput");
      setDevices({ audioInputs, audioOutputs, videoInputs });
      setMediaSettings((prev) => ({
        ...prev,
        selectedMic: prev.selectedMic || audioInputs[0]?.deviceId || "",
        selectedCamera: prev.selectedCamera || videoInputs[0]?.deviceId || "",
        selectedSpeaker: prev.selectedSpeaker || audioOutputs[0]?.deviceId || "",
      }));
    } catch {
      /* ignore */
    }
  }, []);

  const ensureStream = useCallback(
    async ({ wantMic, wantCam, micId, camId }) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("此瀏覽器不支援媒體裝置");
      }
      // 需要重新開流：裝置切換，或缺少對應 track
      const existing = streamRef.current;
      const needNew =
        !existing ||
        (wantMic && existing.getAudioTracks().length === 0) ||
        (wantCam && existing.getVideoTracks().length === 0);

      if (needNew) {
        if (existing) {
          existing.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {
              /* ignore */
            }
          });
          streamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: wantMic
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                ...(micId ? { deviceId: { ideal: micId } } : {}),
              }
            : wantCam
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                ...(micId ? { deviceId: { ideal: micId } } : {}),
              }
            : false,
          video: wantCam
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
                ...(camId ? { deviceId: { ideal: camId } } : {}),
              }
            : false,
        });
        // 若只要預覽權限但當下關著某軌道，先取得再依設定 enabled
        streamRef.current = stream;
        await refreshDevices();
      }

      const stream = streamRef.current;
      if (!stream) return null;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = wantMic;
      });
      stream.getVideoTracks().forEach((t) => {
        t.enabled = wantCam;
      });
      return stream;
    },
    [refreshDevices]
  );

  const attachPreview = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    const p = video.play();
    if (p?.catch) p.catch(() => {});
  }, []);

  const syncPreviewFromSettings = useCallback(
    async (next) => {
      const wantMic = !next.isMuted;
      const wantCam = !next.isVideoOff;
      setPreviewError("");
      try {
        if (!wantMic && !wantCam) {
          // 兩者皆關：保留已授權裝置列表，停止預覽畫面
          if (streamRef.current) {
            streamRef.current.getAudioTracks().forEach((t) => {
              t.enabled = false;
            });
            streamRef.current.getVideoTracks().forEach((t) => {
              t.enabled = false;
            });
          }
          if (videoRef.current) videoRef.current.srcObject = null;
          return;
        }
        await ensureStream({
          wantMic: wantMic || wantCam, // 開鏡頭時一併要 audio track 以便進房切換
          wantCam,
          micId: next.selectedMic,
          camId: next.selectedCamera,
        });
        // 實際 enabled 以設定為準
        const stream = streamRef.current;
        if (stream) {
          stream.getAudioTracks().forEach((t) => {
            t.enabled = wantMic;
          });
          stream.getVideoTracks().forEach((t) => {
            t.enabled = wantCam;
          });
        }
        if (wantCam) attachPreview();
        else if (videoRef.current) videoRef.current.srcObject = null;
      } catch (err) {
        setPreviewError(err?.message || "無法存取裝置，請檢查瀏覽器權限");
      }
    },
    [attachPreview, ensureStream]
  );

  useEffect(() => {
    refreshDevices();
    return () => {
      if (!joiningRef.current) {
        stopLocalStream();
        discardMediaHandoff();
      }
    };
  }, [refreshDevices, stopLocalStream]);

  const patchSettings = (patch) => {
    setMediaSettings((prev) => {
      const next = { ...prev, ...patch };
      // 非同步套用預覽，不阻塞 UI
      void syncPreviewFromSettings(next);
      return next;
    });
  };

  const onDeviceChange = async (key, value) => {
    const next = { ...mediaSettings, [key]: value };
    setMediaSettings(next);
    // 換裝置：需要重開流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
      streamRef.current = null;
    }
    await syncPreviewFromSettings(next);
  };

  // 喇叭：若支援 setSinkId，套用到預覽 video（靜音預覽影響有限，仍記住選擇）
  useEffect(() => {
    const video = videoRef.current;
    const id = mediaSettings.selectedSpeaker;
    if (!video || !id || typeof video.setSinkId !== "function") return;
    video.setSinkId(id).catch(() => {});
  }, [mediaSettings.selectedSpeaker, mediaSettings.isVideoOff]);

  const handleJoin = async () => {
    setBusyJoin(true);
    try {
      joiningRef.current = true;
      // 進房前確保串流與軌道狀態對齊（即使兩者皆關也可不帶流）
      if (!mediaSettings.isMuted || !mediaSettings.isVideoOff) {
        await syncPreviewFromSettings(mediaSettings);
      }
      const stream = streamRef.current;
      stashMediaHandoff(stream, mediaSettings);
      // 交接後不要在此 stop；MeetingRoom 會 take
      streamRef.current = null;
      onJoin?.(mediaSettings);
    } catch (err) {
      joiningRef.current = false;
      setPreviewError(err?.message || "無法進入會議");
    } finally {
      setBusyJoin(false);
    }
  };

  const handleCancel = () => {
    joiningRef.current = false;
    stopLocalStream();
    discardMediaHandoff();
    onCancel?.();
  };

  const joinLabel = describeJoinState(mediaSettings);

  return (
    <div className="fade-in min-h-[calc(100vh-4rem)] md:min-h-screen bg-gradient-to-b from-coral-50/40 via-white to-mint-50/30">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 md:py-10">
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800 mb-5"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
          返回看板
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 lg:gap-8 items-start">
          {/* 左側：16:9 視訊預覽 */}
          <section className={`${CARD} overflow-hidden`}>
            <div className="relative aspect-[16/10] md:aspect-[16/9] bg-slate-900">
              {!mediaSettings.isVideoOff ? (
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-cover scale-x-[-1]"
                  playsInline
                  muted
                  autoPlay
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-800 to-slate-900">
                  <Avatar
                    name={displayName}
                    src={me?.photoURL}
                    size="h-24 w-24 text-2xl"
                    color={avatarColor}
                    ring={false}
                  />
                  <p className="text-sm text-white/70 font-medium">鏡頭已關閉</p>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 p-4 flex items-center justify-center gap-3 bg-gradient-to-t from-black/55 to-transparent">
                <button
                  type="button"
                  aria-pressed={!mediaSettings.isMuted}
                  title={mediaSettings.isMuted ? "開啟麥克風" : "靜音"}
                  onClick={() => patchSettings({ isMuted: !mediaSettings.isMuted })}
                  className={`h-12 w-12 rounded-full flex items-center justify-center border transition-all active:scale-95 ${
                    mediaSettings.isMuted
                      ? "bg-coral-500 border-coral-400 text-white hover:bg-coral-400"
                      : "bg-white/95 border-white text-navy-800"
                  }`}
                >
                  {mediaSettings.isMuted ? (
                    <MicOff className="h-5 w-5" strokeWidth={2.2} />
                  ) : (
                    <Mic className="h-5 w-5" strokeWidth={2.2} />
                  )}
                </button>
                <button
                  type="button"
                  aria-pressed={!mediaSettings.isVideoOff}
                  title={mediaSettings.isVideoOff ? "開啟鏡頭" : "關閉鏡頭"}
                  onClick={() => patchSettings({ isVideoOff: !mediaSettings.isVideoOff })}
                  className={`h-12 w-12 rounded-full flex items-center justify-center border transition-all active:scale-95 ${
                    mediaSettings.isVideoOff
                      ? "bg-coral-500 border-coral-400 text-white hover:bg-coral-400"
                      : "bg-white/95 border-white text-navy-800"
                  }`}
                >
                  {mediaSettings.isVideoOff ? (
                    <CameraOff className="h-5 w-5" strokeWidth={2.2} />
                  ) : (
                    <Camera className="h-5 w-5" strokeWidth={2.2} />
                  )}
                </button>
              </div>
            </div>
            {previewError ? (
              <p className="px-4 py-3 text-sm text-coral-500 border-t border-gray-100">{previewError}</p>
            ) : (
              <p className="px-4 py-3 text-xs text-navy-400 border-t border-gray-100">
                預設為靜音並關閉鏡頭。準備好後再開啟，進房會沿用此設定。
              </p>
            )}
          </section>

          {/* 右側：會議資訊 + 裝置 */}
          <aside className={`${CARD} p-5 md:p-6 space-y-5`}>
            <div>
              <p className="text-[11px] font-bold tracking-wider text-coral-500">大廳準備</p>
              <h1 className="mt-1 text-xl md:text-2xl font-black text-navy-800 tracking-tight">{title}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-navy-500">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100">
                  {formatWhen(meeting?.scheduledAt || meeting?.startedAt || meeting?.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-mint-50 border border-mint-100 text-mint-700">
                  <Users className="h-3.5 w-3.5" strokeWidth={2} />
                  {onlineHint}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-navy-600">
                  <Mic className="h-3.5 w-3.5" /> 麥克風
                </span>
                <select
                  className={SELECT}
                  value={mediaSettings.selectedMic}
                  onChange={(e) => onDeviceChange("selectedMic", e.target.value)}
                >
                  {(devices.audioInputs.length ? devices.audioInputs : [{ deviceId: "", label: "預設麥克風" }]).map(
                    (d) => (
                      <option key={d.deviceId || "default-mic"} value={d.deviceId}>
                        {d.label || "麥克風"}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-navy-600">
                  <Headphones className="h-3.5 w-3.5" /> 喇叭／揚聲器
                </span>
                <select
                  className={SELECT}
                  value={mediaSettings.selectedSpeaker}
                  onChange={(e) => onDeviceChange("selectedSpeaker", e.target.value)}
                >
                  {(devices.audioOutputs.length
                    ? devices.audioOutputs
                    : [{ deviceId: "", label: "預設揚聲器" }]
                  ).map((d) => (
                    <option key={d.deviceId || "default-speaker"} value={d.deviceId}>
                      {d.label || "揚聲器"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-navy-600">
                  <Video className="h-3.5 w-3.5" /> 攝影機
                </span>
                <select
                  className={SELECT}
                  value={mediaSettings.selectedCamera}
                  onChange={(e) => onDeviceChange("selectedCamera", e.target.value)}
                >
                  {(devices.videoInputs.length
                    ? devices.videoInputs
                    : [{ deviceId: "", label: "預設攝影機" }]
                  ).map((d) => (
                    <option key={d.deviceId || "default-cam"} value={d.deviceId}>
                      {d.label || "攝影機"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              disabled={busyJoin}
              onClick={handleJoin}
              className="w-full h-12 rounded-xl bg-coral-500 hover:bg-coral-400 text-white text-sm font-bold shadow-sm transition-colors disabled:opacity-60 active:scale-[0.99]"
            >
              {busyJoin ? "進入中…" : "立即加入"}
            </button>
            <p className="text-center text-xs font-medium text-navy-400 -mt-2">{joinLabel}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

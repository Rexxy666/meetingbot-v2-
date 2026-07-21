import { useCallback, useEffect, useRef, useState } from "react";
import { takeMediaHandoff } from "../lib/mediaSettings.js";

function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * 本機真實媒體 + Web Speech 即時 STT
 * - 繼承 Green Room 的 mediaSettings / MediaStream handoff
 */
export function useLocalMediaAndStt({
  enabled = true,
  speakerName = "與會者",
  lang = "zh-TW",
  onFinalUtterance,
  initialMediaSettings = null,
}) {
  const initial = initialMediaSettings || {};
  const [micOn, setMicOn] = useState(() => initial.isMuted === false);
  const [camOn, setCamOn] = useState(() => initial.isVideoOff === false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [sttSupported, setSttSupported] = useState(false);
  const [sttListening, setSttListening] = useState(false);
  const [sttError, setSttError] = useState(null);
  const [interimText, setInterimText] = useState("");
  const [permissionAsked, setPermissionAsked] = useState(false);

  const camStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const screenVideoRef = useRef(null);
  const recognitionRef = useRef(null);
  const wantMicRef = useRef(initial.isMuted === false);
  const wantCamRef = useRef(initial.isVideoOff === false);
  const wantSttRef = useRef(false);
  const devicePrefsRef = useRef({
    micId: initial.selectedMic || "",
    cameraId: initial.selectedCamera || "",
    speakerId: initial.selectedSpeaker || "",
  });
  const onFinalRef = useRef(onFinalUtterance);
  const speakerRef = useRef(speakerName);
  const settingsRef = useRef(initialMediaSettings);

  useEffect(() => {
    onFinalRef.current = onFinalUtterance;
  }, [onFinalUtterance]);

  useEffect(() => {
    speakerRef.current = speakerName;
  }, [speakerName]);

  useEffect(() => {
    settingsRef.current = initialMediaSettings;
    if (initialMediaSettings) {
      devicePrefsRef.current = {
        micId: initialMediaSettings.selectedMic || "",
        cameraId: initialMediaSettings.selectedCamera || "",
        speakerId: initialMediaSettings.selectedSpeaker || "",
      };
    }
  }, [initialMediaSettings]);

  const attachLocalPreview = useCallback(() => {
    const video = localVideoRef.current;
    const stream = camStreamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.muted = true;
    video.playsInline = true;
    const sinkId = devicePrefsRef.current.speakerId;
    if (sinkId && typeof video.setSinkId === "function") {
      video.setSinkId(sinkId).catch(() => {});
    }
    const play = video.play();
    if (play?.catch) play.catch(() => {});
  }, []);

  const attachScreenPreview = useCallback(() => {
    const video = screenVideoRef.current;
    const stream = screenStreamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    video.muted = true;
    video.playsInline = true;
    const play = video.play();
    if (play?.catch) play.catch(() => {});
  }, []);

  const stopTracks = (stream) => {
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
  };

  const stopScreenShare = useCallback(() => {
    stopTracks(screenStreamRef.current);
    screenStreamRef.current = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    setScreenSharing(false);
  }, []);

  const stopCameraStream = useCallback(() => {
    stopTracks(camStreamRef.current);
    camStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setMediaReady(false);
  }, []);

  const ensureCameraStream = useCallback(
    async ({ audio = true, video = true } = {}) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("此瀏覽器不支援 getUserMedia");
      }
      const existing = camStreamRef.current;
      if (existing) {
        const hasAudio = existing.getAudioTracks().length > 0;
        const hasVideo = existing.getVideoTracks().length > 0;
        if ((!audio || hasAudio) && (!video || hasVideo)) {
          return existing;
        }
        stopTracks(existing);
        camStreamRef.current = null;
      }
      const { micId, cameraId } = devicePrefsRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              ...(micId ? { deviceId: { ideal: micId } } : {}),
            }
          : false,
        video: video
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "user",
              ...(cameraId ? { deviceId: { ideal: cameraId } } : {}),
            }
          : false,
      });
      camStreamRef.current = stream;
      setMediaReady(true);
      setMediaError(null);
      attachLocalPreview();
      return stream;
    },
    [attachLocalPreview]
  );

  const applyTrackState = useCallback(() => {
    const stream = camStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = wantMicRef.current;
    });
    stream.getVideoTracks().forEach((t) => {
      t.enabled = wantCamRef.current;
    });
    setMicOn(wantMicRef.current && stream.getAudioTracks().some((t) => t.enabled));
    setCamOn(wantCamRef.current && stream.getVideoTracks().some((t) => t.enabled && t.readyState === "live"));
    if (wantCamRef.current) attachLocalPreview();
  }, [attachLocalPreview]);

  const stopSpeechRecognition = useCallback(() => {
    wantSttRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    setSttListening(false);
    setInterimText("");
  }, []);

  const startSpeechRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSttSupported(false);
      setSttError("此瀏覽器不支援語音辨識（請用 Chrome / Edge）");
      return;
    }
    setSttSupported(true);
    if (!wantMicRef.current) {
      setSttError("請先開啟麥克風才能語音轉文字");
      return;
    }
    wantSttRef.current = true;
    if (recognitionRef.current) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = String(result[0]?.transcript || "").trim();
        if (!text) continue;
        if (result.isFinal) {
          setInterimText("");
          onFinalRef.current?.({
            id: `stt-${Date.now()}-${i}`,
            time: nowTime(),
            at: Date.now(),
            speaker: speakerRef.current,
            text,
          });
        } else {
          interim += text;
        }
      }
      if (interim) setInterimText(interim);
    };

    rec.onerror = (event) => {
      const code = event?.error || "unknown";
      if (code === "not-allowed") {
        setSttError("麥克風權限被拒，無法語音轉文字");
        wantSttRef.current = false;
        setSttListening(false);
        return;
      }
      if (code === "no-speech" || code === "aborted") return;
      setSttError(`語音辨識：${code}`);
    };

    rec.onend = () => {
      recognitionRef.current = null;
      setSttListening(false);
      if (wantSttRef.current && wantMicRef.current && enabled) {
        window.setTimeout(() => {
          if (wantSttRef.current && wantMicRef.current) startSpeechRecognition();
        }, 250);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setSttListening(true);
      setSttError(null);
    } catch (err) {
      recognitionRef.current = null;
      setSttListening(false);
      setSttError(err?.message || "無法啟動語音辨識");
    }
  }, [enabled, lang]);

  const startMedia = useCallback(
    async ({ mic = true, cam = true } = {}) => {
      setPermissionAsked(true);
      wantMicRef.current = mic;
      wantCamRef.current = cam;
      try {
        if (mic || cam) {
          await ensureCameraStream({ audio: true, video: true });
          applyTrackState();
        } else {
          applyTrackState();
        }
        if (mic) startSpeechRecognition();
        else stopSpeechRecognition();
      } catch (err) {
        console.error("[useLocalMediaAndStt]", err);
        setMediaError(err?.message || "無法存取鏡頭／麥克風");
        setMicOn(false);
        setCamOn(false);
        wantMicRef.current = false;
        wantCamRef.current = false;
      }
    },
    [applyTrackState, ensureCameraStream, startSpeechRecognition, stopSpeechRecognition]
  );

  const toggleMic = useCallback(async () => {
    const next = !wantMicRef.current;
    wantMicRef.current = next;
    setPermissionAsked(true);
    try {
      if (!camStreamRef.current || camStreamRef.current.getAudioTracks().length === 0) {
        await ensureCameraStream({ audio: true, video: true });
      }
      applyTrackState();
      if (next) startSpeechRecognition();
      else stopSpeechRecognition();
    } catch (err) {
      wantMicRef.current = false;
      setMicOn(false);
      setMediaError(err?.message || "無法開啟麥克風");
      stopSpeechRecognition();
    }
  }, [applyTrackState, ensureCameraStream, startSpeechRecognition, stopSpeechRecognition]);

  const toggleCam = useCallback(async () => {
    const next = !wantCamRef.current;
    wantCamRef.current = next;
    setPermissionAsked(true);
    try {
      if (!camStreamRef.current || (next && camStreamRef.current.getVideoTracks().length === 0)) {
        await ensureCameraStream({ audio: true, video: true });
      }
      applyTrackState();
    } catch (err) {
      wantCamRef.current = false;
      setCamOn(false);
      setMediaError(err?.message || "無法開啟鏡頭");
    }
  }, [applyTrackState, ensureCameraStream]);

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError("此瀏覽器不支援螢幕分享");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" },
        audio: false,
      });
      screenStreamRef.current = stream;
      setScreenSharing(true);
      setMediaError(null);
      attachScreenPreview();
      const [track] = stream.getVideoTracks();
      if (track) {
        track.addEventListener("ended", () => {
          stopScreenShare();
        });
      }
    } catch (err) {
      if (err?.name === "NotAllowedError") return;
      setMediaError(err?.message || "無法分享螢幕");
      stopScreenShare();
    }
  }, [attachScreenPreview, screenSharing, stopScreenShare]);

  // 進入會議：優先接手大廳串流，並繼承開關（不再強制全開）
  useEffect(() => {
    if (!enabled) return undefined;
    const Ctor = getSpeechRecognitionCtor();
    setSttSupported(Boolean(Ctor));
    let cancelled = false;
    (async () => {
      const handoff = takeMediaHandoff();
      const settings = handoff.settings || settingsRef.current || {};
      const wantMic = settings.isMuted === false;
      const wantCam = settings.isVideoOff === false;
      wantMicRef.current = wantMic;
      wantCamRef.current = wantCam;
      if (settings.selectedMic || settings.selectedCamera || settings.selectedSpeaker) {
        devicePrefsRef.current = {
          micId: settings.selectedMic || "",
          cameraId: settings.selectedCamera || "",
          speakerId: settings.selectedSpeaker || "",
        };
      }
      setPermissionAsked(true);
      try {
        if (handoff.stream) {
          camStreamRef.current = handoff.stream;
          setMediaReady(true);
          applyTrackState();
          if (wantMic) startSpeechRecognition();
          else stopSpeechRecognition();
          return;
        }
        if (wantMic || wantCam) {
          await ensureCameraStream({ audio: true, video: true });
          if (cancelled) return;
          applyTrackState();
          if (wantMic) startSpeechRecognition();
          else stopSpeechRecognition();
        } else {
          setMicOn(false);
          setCamOn(false);
          setMediaReady(false);
        }
      } catch (err) {
        if (cancelled) return;
        setMediaError(err?.message || "請允許鏡頭與麥克風權限");
        setMicOn(false);
        setCamOn(false);
      }
    })();
    return () => {
      cancelled = true;
      wantSttRef.current = false;
      stopSpeechRecognition();
      stopScreenShare();
      stopCameraStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (camOn) attachLocalPreview();
  }, [camOn, attachLocalPreview, mediaReady]);

  useEffect(() => {
    if (screenSharing) attachScreenPreview();
  }, [screenSharing, attachScreenPreview]);

  const setLocalVideoNode = useCallback(
    (node) => {
      localVideoRef.current = node;
      if (node) attachLocalPreview();
    },
    [attachLocalPreview]
  );

  const setScreenVideoNode = useCallback(
    (node) => {
      screenVideoRef.current = node;
      if (node) attachScreenPreview();
    },
    [attachScreenPreview]
  );

  return {
    micOn,
    camOn,
    screenSharing,
    mediaReady,
    mediaError,
    sttSupported,
    sttListening,
    sttError,
    interimText,
    permissionAsked,
    localVideoRef: setLocalVideoNode,
    screenVideoRef: setScreenVideoNode,
    getCameraStream: () => camStreamRef.current,
    getScreenStream: () => screenStreamRef.current,
    startMedia,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    stopScreenShare,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { connectSocket } from "../lib/socket.js";

const DEFAULT_ICE = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: ["stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302"] },
];

function trackSigOf(stream) {
  if (!stream?.getTracks) return "";
  return stream
    .getTracks()
    .map((t) => `${t.kind}:${t.id}:${t.readyState}:${t.enabled ? 1 : 0}`)
    .join("|");
}

function isOfferer(selfId, remoteId) {
  return String(selfId || "") < String(remoteId || "");
}

function peerSnapshot(entry) {
  return {
    socketId: entry.socketId,
    userId: entry.userId,
    userName: entry.userName,
    stream: entry.stream,
    trackSig: trackSigOf(entry.stream),
    connectionState: entry.pc?.connectionState || "new",
    iceState: entry.pc?.iceConnectionState || "new",
    micOn: entry.micOn,
    camOn: entry.camOn,
    screenSharing: entry.screenSharing,
  };
}

async function flushIce(entry) {
  const pc = entry?.pc;
  if (!pc || !pc.remoteDescription || !entry.pendingIce?.length) return;
  const queued = entry.pendingIce.splice(0, entry.pendingIce.length);
  for (const candidate of queued) {
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 會議室 mesh WebRTC。socketId 較小的一方當 offerer；另一方用 pull-offer 請對方重送，避免 glare。
 */
export function useMeetingRtc({
  enabled = false,
  meetingId,
  getCameraStream,
  getScreenStream,
  micOn = false,
  camOn = false,
  screenSharing = false,
  mediaReady = false,
}) {
  const [remotes, setRemotes] = useState([]);
  const peersRef = useRef(new Map());
  const pendingPeersRef = useRef([]);
  const iceServersRef = useRef(DEFAULT_ICE);
  const selfIdRef = useRef("");
  const mediaRef = useRef({ getCameraStream, getScreenStream, micOn, camOn, screenSharing });
  const meetingIdRef = useRef(meetingId);

  mediaRef.current = { getCameraStream, getScreenStream, micOn, camOn, screenSharing };
  meetingIdRef.current = meetingId;

  const publishRemotes = useCallback(() => {
    setRemotes([...peersRef.current.values()].map(peerSnapshot));
  }, []);

  const sendSignal = useCallback((toSocketId, data) => {
    const socket = connectSocket();
    const mid = meetingIdRef.current;
    if (!socket?.connected || !mid || !toSocketId) return;
    socket.emit("rtc:signal", { meetingId: mid, toSocketId, data });
  }, []);

  const makeOffer = useCallback(
    async (entry) => {
      const pc = entry?.pc;
      if (!pc || pc.connectionState === "closed") return;
      if (!isOfferer(selfIdRef.current, entry.socketId)) return;
      if (entry.makingOffer || pc.signalingState !== "stable") return;
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription(await pc.createOffer());
        const sdp = pc.localDescription?.sdp;
        if (sdp) sendSignal(entry.socketId, { type: "offer", sdp });
      } catch (err) {
        console.warn("[rtc] offer", err?.message || err);
      } finally {
        entry.makingOffer = false;
      }
    },
    [sendSignal]
  );

  const syncTracks = useCallback(
    async (entry) => {
      const pc = entry?.pc;
      if (!pc || pc.connectionState === "closed") return;
      const { getCameraStream: getCam, getScreenStream: getScreen, screenSharing: sharing } =
        mediaRef.current;
      const cam = typeof getCam === "function" ? getCam() : null;
      const screen = typeof getScreen === "function" ? getScreen() : null;
      const audio = cam?.getAudioTracks?.()[0] || null;
      const video = sharing
        ? screen?.getVideoTracks?.()[0] || cam?.getVideoTracks?.()[0] || null
        : cam?.getVideoTracks?.()[0] || null;

      const prevAudio = entry.audioSender?.track || null;
      const prevVideo = entry.videoSender?.track || null;

      const replace = async (sender, track) => {
        if (!sender) return;
        if (sender.track === track) return;
        try {
          await sender.replaceTrack(track);
        } catch {
          /* ignore */
        }
      };

      await replace(entry.audioSender, audio);
      await replace(entry.videoSender, video);

      const becameLive = (!prevAudio && audio) || (!prevVideo && video);
      if (!becameLive) return;
      if (isOfferer(selfIdRef.current, entry.socketId)) {
        await makeOffer(entry);
      } else {
        sendSignal(entry.socketId, { type: "pull-offer" });
      }
    },
    [makeOffer, sendSignal]
  );

  const closePeer = useCallback(
    (socketId) => {
      const entry = peersRef.current.get(socketId);
      if (!entry) return;
      try {
        entry.pc.onicecandidate = null;
        entry.pc.ontrack = null;
        entry.pc.onnegotiationneeded = null;
        entry.pc.onconnectionstatechange = null;
        entry.pc.oniceconnectionstatechange = null;
        entry.pc.close();
      } catch {
        /* ignore */
      }
      peersRef.current.delete(socketId);
      publishRemotes();
    },
    [publishRemotes]
  );

  const ensurePeer = useCallback(
    (info) => {
      const socketId = String(info?.socketId || "");
      const selfId = selfIdRef.current || connectSocket().id || "";
      selfIdRef.current = selfId;
      if (!socketId || socketId === selfId) return null;
      if (!selfId) {
        pendingPeersRef.current.push(info);
        return null;
      }
      const existing = peersRef.current.get(socketId);
      if (existing) {
        if (info.userName) existing.userName = info.userName;
        if (info.userId) existing.userId = info.userId;
        return existing;
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        bundlePolicy: "max-bundle",
      });
      const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
      const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
      const stream = new MediaStream();
      const entry = {
        socketId,
        userId: info.userId || null,
        userName: info.userName || "與會者",
        pc,
        stream,
        audioSender: audioTransceiver.sender,
        videoSender: videoTransceiver.sender,
        makingOffer: false,
        pendingIce: [],
        failCount: 0,
        micOn: true,
        camOn: true,
        screenSharing: false,
      };

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        sendSignal(socketId, { type: "ice", candidate: ev.candidate.toJSON?.() || ev.candidate });
      };

      pc.ontrack = (ev) => {
        const track = ev.track;
        if (!track) return;
        if (!stream.getTracks().some((t) => t.id === track.id)) {
          stream.addTrack(track);
        }
        track.addEventListener("mute", publishRemotes);
        track.addEventListener("unmute", publishRemotes);
        track.addEventListener("ended", () => {
          try {
            stream.removeTrack(track);
          } catch {
            /* ignore */
          }
          publishRemotes();
        });
        publishRemotes();
      };

      pc.onnegotiationneeded = () => {
        if (isOfferer(selfIdRef.current, socketId)) {
          void makeOffer(entry);
        } else {
          sendSignal(socketId, { type: "pull-offer" });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          entry.failCount += 1;
          if (entry.failCount <= 3) {
            try {
              pc.restartIce();
            } catch {
              /* ignore */
            }
            if (isOfferer(selfIdRef.current, socketId)) void makeOffer(entry);
            else sendSignal(socketId, { type: "pull-offer" });
          }
        }
        if (pc.connectionState === "closed") {
          closePeer(socketId);
          return;
        }
        publishRemotes();
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          try {
            pc.restartIce();
          } catch {
            /* ignore */
          }
        }
        publishRemotes();
      };

      peersRef.current.set(socketId, entry);
      void syncTracks(entry);
      publishRemotes();
      return entry;
    },
    [closePeer, makeOffer, publishRemotes, sendSignal, syncTracks]
  );

  const handleSignal = useCallback(
    async ({ fromSocketId, fromUserId, fromUserName, data } = {}) => {
      const socketId = String(fromSocketId || "");
      if (!socketId || !data?.type) return;
      const entry = ensurePeer({
        socketId,
        userId: fromUserId,
        userName: fromUserName,
      });
      if (!entry) return;
      const pc = entry.pc;
      const type = data.type;

      try {
        if (type === "pull-offer") {
          await syncTracks(entry);
          await makeOffer(entry);
          return;
        }
        if (type === "offer" || type === "answer") {
          const sdp = String(data.sdp || "");
          if (!sdp) return;
          if (type === "offer" && isOfferer(selfIdRef.current, socketId)) {
            return;
          }
          if (type === "offer" && pc.signalingState !== "stable") {
            try {
              await pc.setLocalDescription({ type: "rollback" });
            } catch {
              /* Safari */
            }
          }
          await pc.setRemoteDescription({ type, sdp });
          await flushIce(entry);
          if (type === "offer") {
            await syncTracks(entry);
            await pc.setLocalDescription(await pc.createAnswer());
            sendSignal(socketId, { type: "answer", sdp: pc.localDescription?.sdp });
          }
        } else if (type === "ice" && data.candidate) {
          if (!pc.remoteDescription) {
            entry.pendingIce.push(data.candidate);
            return;
          }
          try {
            await pc.addIceCandidate(data.candidate);
          } catch (err) {
            console.warn("[rtc] ice", err?.message || err);
          }
        }
      } catch (err) {
        console.warn("[rtc] signal", err?.message || err);
      }
    },
    [ensurePeer, makeOffer, sendSignal, syncTracks]
  );

  const handleMedia = useCallback(
    ({ fromSocketId, micOn: remoteMic, camOn: remoteCam, screenSharing: remoteScreen } = {}) => {
      const entry = peersRef.current.get(String(fromSocketId || ""));
      if (!entry) return;
      if (typeof remoteMic === "boolean") entry.micOn = remoteMic;
      if (typeof remoteCam === "boolean") entry.camOn = remoteCam;
      if (typeof remoteScreen === "boolean") entry.screenSharing = remoteScreen;
      publishRemotes();
    },
    [publishRemotes]
  );

  const resetAll = useCallback(() => {
    pendingPeersRef.current = [];
    for (const id of [...peersRef.current.keys()]) closePeer(id);
  }, [closePeer]);

  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;
  const handleMediaRef = useRef(handleMedia);
  handleMediaRef.current = handleMedia;
  const ensurePeerRef = useRef(ensurePeer);
  ensurePeerRef.current = ensurePeer;
  const closePeerRef = useRef(closePeer);
  closePeerRef.current = closePeer;
  const resetAllRef = useRef(resetAll);
  resetAllRef.current = resetAll;
  const makeOfferRef = useRef(makeOffer);
  makeOfferRef.current = makeOffer;
  const sendSignalRef = useRef(sendSignal);
  sendSignalRef.current = sendSignal;

  useEffect(() => {
    if (!enabled || !meetingId) {
      resetAllRef.current();
      return undefined;
    }

    const socket = connectSocket();
    selfIdRef.current = socket.id || "";

    const flushPending = () => {
      if (!selfIdRef.current) return;
      const queued = pendingPeersRef.current.splice(0);
      for (const p of queued) ensurePeerRef.current(p);
    };

    const applyRoster = ({ peers, iceServers, socketId } = {}) => {
      if (socketId) selfIdRef.current = socketId;
      else selfIdRef.current = socket.id || selfIdRef.current;
      if (Array.isArray(iceServers) && iceServers.length) {
        iceServersRef.current = iceServers;
      }
      flushPending();
      const list = Array.isArray(peers) ? peers : [];
      for (const p of list) {
        ensurePeerRef.current(p);
      }
    };

    const onConnect = () => {
      const nextId = socket.id || "";
      if (selfIdRef.current && nextId && selfIdRef.current !== nextId) {
        resetAllRef.current();
      }
      selfIdRef.current = nextId;
      flushPending();
      socket.emit("rtc:peers", { meetingId });
    };

    const onPeerJoined = ({ socketId, userName, userId } = {}) => {
      if (!socketId || socketId === socket.id) return;
      selfIdRef.current = socket.id || selfIdRef.current;
      ensurePeerRef.current({ socketId, userName, userId });
    };

    const onPeerLeft = ({ socketId } = {}) => {
      if (socketId) closePeerRef.current(socketId);
    };

    const onSignal = (payload) => handleSignalRef.current(payload);
    const onMedia = (payload) => handleMediaRef.current(payload);

    socket.on("connect", onConnect);
    socket.on("meeting:joined", applyRoster);
    socket.on("rtc:peers", applyRoster);
    socket.on("peer:joined", onPeerJoined);
    socket.on("peer:left", onPeerLeft);
    socket.on("rtc:signal", onSignal);
    socket.on("rtc:media", onMedia);

    if (socket.connected) {
      socket.emit("rtc:peers", { meetingId });
    }

    const watchdog = window.setInterval(() => {
      const selfId = selfIdRef.current;
      if (!selfId) return;
      for (const entry of peersRef.current.values()) {
        const ice = entry.pc?.iceConnectionState;
        if (ice === "connected" || ice === "completed") continue;
        if (entry.pc?.connectionState === "closed") continue;
        if (isOfferer(selfId, entry.socketId)) {
          void makeOfferRef.current(entry);
        } else {
          sendSignalRef.current(entry.socketId, { type: "pull-offer" });
        }
      }
    }, 4000);

    return () => {
      window.clearInterval(watchdog);
      socket.off("connect", onConnect);
      socket.off("meeting:joined", applyRoster);
      socket.off("rtc:peers", applyRoster);
      socket.off("peer:joined", onPeerJoined);
      socket.off("peer:left", onPeerLeft);
      socket.off("rtc:signal", onSignal);
      socket.off("rtc:media", onMedia);
      resetAllRef.current();
    };
  }, [enabled, meetingId]);

  useEffect(() => {
    if (!enabled || !meetingId) return undefined;
    const socket = connectSocket();
    if (socket.connected) {
      socket.emit("rtc:media", {
        meetingId,
        micOn,
        camOn,
        screenSharing,
      });
    }
    for (const entry of peersRef.current.values()) {
      void syncTracks(entry);
    }
  }, [enabled, meetingId, micOn, camOn, screenSharing, mediaReady, syncTracks]);

  return remotes;
}

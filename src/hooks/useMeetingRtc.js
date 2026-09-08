import { useCallback, useEffect, useRef, useState } from "react";
import { connectSocket } from "../lib/socket.js";

const DEFAULT_ICE = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

function trackSigOf(stream) {
  if (!stream?.getTracks) return "";
  return stream
    .getTracks()
    .map((t) => `${t.kind}:${t.id}:${t.readyState}:${t.enabled ? 1 : 0}`)
    .join("|");
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
      /* ignore stale ICE */
    }
  }
}

/**
 * 會議室 mesh WebRTC：每位與會者與房內其他人建立 PeerConnection，
 * 經 Socket.IO 轉送 SDP／ICE。遠端音訊必須 unmute 才能聽到對方。
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

  const syncTracks = useCallback(async (entry) => {
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
  }, []);

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
      if (!socketId || socketId === selfIdRef.current) return null;
      const existing = peersRef.current.get(socketId);
      if (existing) {
        if (info.userName) existing.userName = info.userName;
        if (info.userId) existing.userId = info.userId;
        return existing;
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current,
        bundlePolicy: "max-bundle",
        iceCandidatePoolSize: 4,
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
        ignoreOffer: false,
        polite: String(selfIdRef.current) > socketId,
        pendingIce: [],
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

      pc.onnegotiationneeded = async () => {
        // socketId 較小的一方當 offerer，避免 glare；Safari 也不支援 rollback
        if (entry.polite) return;
        try {
          entry.makingOffer = true;
          await pc.setLocalDescription(await pc.createOffer());
          const sdp = pc.localDescription?.sdp;
          if (sdp) sendSignal(socketId, { type: "offer", sdp });
        } catch (err) {
          console.warn("[rtc] negotiationneeded", err?.message || err);
        } finally {
          entry.makingOffer = false;
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          try {
            pc.restartIce();
          } catch {
            /* ignore */
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
    [closePeer, publishRemotes, sendSignal, syncTracks]
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
        if (type === "offer" || type === "answer") {
          const sdp = String(data.sdp || "");
          if (!sdp) return;
          const offerCollision =
            type === "offer" && (entry.makingOffer || pc.signalingState !== "stable");
          entry.ignoreOffer = !entry.polite && offerCollision;
          if (entry.ignoreOffer) return;
          if (offerCollision && pc.signalingState !== "stable") {
            try {
              await pc.setLocalDescription({ type: "rollback" });
            } catch {
              /* Safari 可能不支援 rollback */
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
            if (!entry.ignoreOffer) {
              console.warn("[rtc] ice", err?.message || err);
            }
          }
        }
      } catch (err) {
        console.warn("[rtc] signal", err?.message || err);
      }
    },
    [ensurePeer, sendSignal, syncTracks]
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
    for (const id of [...peersRef.current.keys()]) closePeer(id);
  }, [closePeer]);

  useEffect(() => {
    if (!enabled || !meetingId) {
      resetAll();
      return undefined;
    }

    const socket = connectSocket();
    selfIdRef.current = socket.id || "";

    const applyRoster = ({ peers, iceServers, socketId } = {}) => {
      if (socketId) selfIdRef.current = socketId;
      else selfIdRef.current = socket.id || selfIdRef.current;
      if (Array.isArray(iceServers) && iceServers.length) {
        iceServersRef.current = iceServers;
      }
      const list = Array.isArray(peers) ? peers : [];
      for (const p of list) {
        ensurePeer(p);
      }
    };

    const onConnect = () => {
      selfIdRef.current = socket.id || "";
      socket.emit("rtc:peers", { meetingId });
    };

    const onPeerJoined = ({ socketId, userName, userId } = {}) => {
      if (!socketId || socketId === socket.id) return;
      selfIdRef.current = socket.id || selfIdRef.current;
      ensurePeer({ socketId, userName, userId });
    };

    const onPeerLeft = ({ socketId } = {}) => {
      if (socketId) closePeer(socketId);
    };

    socket.on("connect", onConnect);
    socket.on("meeting:joined", applyRoster);
    socket.on("rtc:peers", applyRoster);
    socket.on("peer:joined", onPeerJoined);
    socket.on("peer:left", onPeerLeft);
    socket.on("rtc:signal", handleSignal);
    socket.on("rtc:media", handleMedia);

    if (socket.connected) {
      socket.emit("rtc:peers", { meetingId });
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("meeting:joined", applyRoster);
      socket.off("rtc:peers", applyRoster);
      socket.off("peer:joined", onPeerJoined);
      socket.off("peer:left", onPeerLeft);
      socket.off("rtc:signal", handleSignal);
      socket.off("rtc:media", handleMedia);
      resetAll();
    };
  }, [enabled, meetingId, closePeer, ensurePeer, handleMedia, handleSignal, resetAll]);

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

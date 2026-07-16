import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL || "https://meetingbot-v2-qyxm.onrender.com";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      // Render 上 websocket 偶爾會失敗，保留 polling 作備援
      transports: ["websocket", "polling"],
      withCredentials: false,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

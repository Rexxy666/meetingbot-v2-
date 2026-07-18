import { io } from "socket.io-client";
import { getToken } from "./session.js";

const SOCKET_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : "https://meetingbot-v2-qyxm.onrender.com");

let socket = null;

export function getSocket() {
  const token = getToken();
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      withCredentials: false,
      auth: { token },
    });
  } else {
    socket.auth = { token };
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (s.connected) {
    // token 可能已更新，重連以帶上新 auth
    s.disconnect();
  }
  s.auth = { token: getToken() };
  s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}

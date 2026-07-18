import { io } from "socket.io-client";
import { resolveApiBase } from "./api.js";
import { getToken } from "./session.js";

let socket = null;

function socketUrl() {
  return resolveApiBase();
}

export function getSocket() {
  const token = getToken();
  const url = socketUrl();
  if (!socket) {
    socket = io(url, {
      autoConnect: false,
      transports: ["polling", "websocket"], // Safari 私密模式較穩定先走 polling
      withCredentials: false,
      auth: { token },
    });
  } else {
    socket.auth = { token };
  }
  return socket;
}

/** 連線（已連線則不強制斷線，避免打斷會議房間） */
export function connectSocket() {
  const s = getSocket();
  s.auth = { token: getToken() };
  if (!s.connected) s.connect();
  return s;
}

/** 換帳號時才需要強制重連 */
export function reconnectSocket() {
  const s = getSocket();
  s.auth = { token: getToken() };
  if (s.connected) s.disconnect();
  s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}

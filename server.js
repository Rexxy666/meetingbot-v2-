import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT) || 3001;

// 本地開發 + 環境變數額外來源（逗號分隔）
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];
const ENV_ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS])];

// 開發／MVP：若未設定嚴格白名單以外的限制，允許所有來源（避免 Render ↔ localhost CORS 失敗）
const ALLOW_ALL_ORIGINS = process.env.CORS_ALLOW_ALL !== "false";

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (ALLOW_ALL_ORIGINS) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => cb(null, isOriginAllowed(origin) ? origin || true : false),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: false,
  },
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) {
        // 回傳實際 origin，讓瀏覽器通過跨域檢查
        cb(null, origin || true);
      } else {
        cb(new Error(`CORS blocked: ${origin}`));
      }
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.status(200).type("html").send(`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MeetingBot Backend</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 760px; margin: 56px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 12px; line-height: 1.6; color: #334155; }
      code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; }
      a { color: #0284c7; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .ok { display:inline-block; margin-top: 8px; padding: 6px 10px; border-radius: 999px; background:#dcfce7; color:#166534; font-size: 12px; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>MeetingBot 後端服務已啟動</h1>
      <span class="ok">ONLINE</span>
      <p style="margin-top:16px">這是 API / Socket.io 服務。前端請用本地 Vite（或另外部署的前端）連線此網址。</p>
      <p>健康檢查：<a href="/api/health"><code>/api/health</code></a></p>
      <p>會議列表：<a href="/api/meetings"><code>/api/meetings</code></a></p>
      <p>CORS：${ALLOW_ALL_ORIGINS ? "允許所有來源（MVP）" : ALLOWED_ORIGINS.join(", ")}</p>
    </main>
  </body>
</html>`);
});

/** @type {Map<string, object>} */
const meetings = new Map();

const uid = () =>
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

function serializeMeeting(m) {
  return { ...m };
}

function getMeetingOr404(req, res) {
  const meeting = meetings.get(req.params.id);
  if (!meeting) {
    res.status(404).json({ error: "找不到此會議" });
    return null;
  }
  return meeting;
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, meetings: meetings.size, ts: Date.now() });
});

// ── Meetings REST API ───────────────────────────────────────────────────────

app.get("/api/meetings", (_req, res) => {
  const list = [...meetings.values()].sort((a, b) => b.createdAt - a.createdAt);
  res.json(list.map(serializeMeeting));
});

app.get("/api/meetings/:id", (req, res) => {
  const meeting = getMeetingOr404(req, res);
  if (meeting) res.json(serializeMeeting(meeting));
});

app.post("/api/meetings", (req, res) => {
  const data = req.body || {};
  const title = String(data.title || "").trim();
  if (!title) {
    return res.status(400).json({ error: "會議主題為必填" });
  }

  const meeting = {
    id: uid(),
    title,
    participants: data.participants || [],
    pains: data.pains || [],
    goals: data.goals || [],
    links: data.links || [],
    durationMin: data.durationMin || 30,
    notes: "",
    topicNotes: {},
    status: "ready",
    createdAt: Date.now(),
    startedAt: null,
    endedAt: null,
    review: null,
    actions: [],
  };

  meetings.set(meeting.id, meeting);
  res.status(201).json(serializeMeeting(meeting));
});

app.patch("/api/meetings/:id", (req, res) => {
  const meeting = getMeetingOr404(req, res);
  if (!meeting) return;

  const patch = req.body || {};
  const updated = { ...meeting, ...patch, id: meeting.id };
  meetings.set(meeting.id, updated);

  io.to(meeting.id).emit("meeting:updated", serializeMeeting(updated));
  res.json(serializeMeeting(updated));
});

app.delete("/api/meetings/:id", (req, res) => {
  if (!meetings.has(req.params.id)) {
    return res.status(404).json({ error: "找不到此會議" });
  }
  meetings.delete(req.params.id);
  io.to(req.params.id).emit("meeting:deleted", { id: req.params.id });
  res.status(204).end();
});

// ── Socket.io 即時共編 ──────────────────────────────────────────────────────

io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("join-meeting", ({ meetingId, userName } = {}) => {
    if (!meetingId || !meetings.has(meetingId)) {
      socket.emit("error", { message: "無效的會議 ID" });
      return;
    }

    if (currentRoom) socket.leave(currentRoom);

    currentRoom = meetingId;
    socket.join(meetingId);

    const peers = io.sockets.adapter.rooms.get(meetingId);
    const peerCount = peers ? peers.size : 1;

    socket.emit("meeting:joined", {
      meeting: serializeMeeting(meetings.get(meetingId)),
      peerCount,
      userName: userName || "匿名",
    });

    socket.to(meetingId).emit("peer:joined", {
      socketId: socket.id,
      userName: userName || "匿名",
      peerCount,
    });
  });

  socket.on("leave-meeting", () => {
    if (!currentRoom) return;
    const room = currentRoom;
    socket.leave(room);
    socket.to(room).emit("peer:left", { socketId: socket.id });
    currentRoom = null;
  });

  socket.on("notes:update", ({ meetingId, topicNotes, topic, content } = {}) => {
    if (!meetingId || !meetings.has(meetingId)) return;

    const meeting = meetings.get(meetingId);
    const nextNotes = topicNotes ?? {
      ...meeting.topicNotes,
      ...(topic != null ? { [topic]: content ?? "" } : {}),
    };

    meeting.topicNotes = nextNotes;
    meetings.set(meetingId, meeting);

    socket.to(meetingId).emit("notes:sync", {
      meetingId,
      topicNotes: nextNotes,
      topic,
      content,
      from: socket.id,
    });
  });

  socket.on("agenda:select", ({ meetingId, agendaIdx } = {}) => {
    if (!meetingId) return;
    socket.to(meetingId).emit("agenda:sync", { meetingId, agendaIdx, from: socket.id });
  });

  socket.on("meeting:patch", ({ meetingId, patch } = {}) => {
    if (!meetingId || !meetings.has(meetingId) || !patch) return;

    const meeting = meetings.get(meetingId);
    const updated = { ...meeting, ...patch, id: meeting.id };
    meetings.set(meetingId, updated);

    io.to(meetingId).emit("meeting:updated", serializeMeeting(updated));
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit("peer:left", { socketId: socket.id });
  });
});

httpServer.listen(PORT, () => {
  console.log(`[guanhui-server] API + Socket.io → http://localhost:${PORT}`);
  console.log(`[guanhui-server] CORS allow all → ${ALLOW_ALL_ORIGINS}`);
  console.log(`[guanhui-server] Extra origins → ${ALLOWED_ORIGINS.join(", ")}`);
});

import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

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

  // 議程筆記即時同步（LiveRoom topicNotes）
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

  // 議程焦點同步（可選：讓與會者看到目前討論哪一項）
  socket.on("agenda:select", ({ meetingId, agendaIdx } = {}) => {
    if (!meetingId) return;
    socket.to(meetingId).emit("agenda:sync", { meetingId, agendaIdx, from: socket.id });
  });

  // 會議狀態同步（開始、結束、稍後再開等）
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
  console.log(`[guanhui-server] CORS 允許來源 → ${CLIENT_ORIGIN}`);
});

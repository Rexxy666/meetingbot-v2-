import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { authRequired, createAuthStore, socketAuth } from "./authStore.js";
import { createMeetingsStore } from "./meetingsStore.js";

const PORT = Number(process.env.PORT) || 3001;

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
const ALLOW_ALL_ORIGINS = process.env.CORS_ALLOW_ALL !== "false";

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (ALLOW_ALL_ORIGINS) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

const uid = () =>
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

async function main() {
  const authStore = await createAuthStore();
  const store = await createMeetingsStore();
  const requireAuth = authRequired(authStore);

  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => cb(null, isOriginAllowed(origin) ? origin || true : false),
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: false,
    },
  });

  io.use(socketAuth(authStore));

  app.use(
    cors({
      origin: (origin, cb) => {
        if (isOriginAllowed(origin)) cb(null, origin || true);
        else cb(new Error(`CORS blocked: ${origin}`));
      },
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
    })
  );
  app.use(express.json());

  app.get("/", async (_req, res) => {
    const count = await store.count();
    res.status(200).type("html").send(`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MeetFlow Backend</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 760px; margin: 56px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      p { margin: 0 0 12px; line-height: 1.6; color: #334155; }
      code { background: #f1f5f9; padding: 2px 6px; border-radius: 6px; }
      a { color: #0284c7; text-decoration: none; }
      .ok { display:inline-block; margin-top: 8px; padding: 6px 10px; border-radius: 999px; background:#dcfce7; color:#166534; font-size: 12px; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>MeetFlow 後端服務已啟動</h1>
      <span class="ok">ONLINE · AUTH</span>
      <p style="margin-top:16px">儲存：<code>${store.mode}</code> · 會議總數：<code>${count}</code></p>
      <p>健康檢查：<a href="/api/health"><code>/api/health</code></a></p>
      <p>需登入後才能存取會議 API（Authorization: Bearer &lt;token&gt;）</p>
    </main>
  </body>
</html>`);
  });

  app.get("/api/health", async (_req, res) => {
    res.json({
      ok: true,
      storage: store.mode,
      auth: authStore.mode,
      meetings: await store.count(),
      ts: Date.now(),
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  app.post("/api/auth/register", async (req, res) => {
    try {
      const result = await authStore.register(req.body || {});
      res.status(201).json(result);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || "註冊失敗" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const result = await authStore.login(req.body || {});
      res.json(result);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || "登入失敗" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json({ user: req.user });
  });

  // ── Meetings（僅本人資料）─────────────────────────────────────────────────

  app.get("/api/meetings", requireAuth, async (req, res) => {
    try {
      res.json(await store.listByOwner(req.user.id));
    } catch (e) {
      res.status(500).json({ error: e.message || "讀取會議失敗" });
    }
  });

  app.get("/api/meetings/:id", requireAuth, async (req, res) => {
    try {
      const meeting = await store.getOwned(req.params.id, req.user.id);
      if (!meeting) return res.status(404).json({ error: "找不到此會議" });
      res.json(meeting);
    } catch (e) {
      res.status(500).json({ error: e.message || "讀取會議失敗" });
    }
  });

  app.post("/api/meetings", requireAuth, async (req, res) => {
    try {
      const data = req.body || {};
      const title = String(data.title || "").trim();
      if (!title) return res.status(400).json({ error: "會議主題為必填" });

      const meeting = {
        id: uid(),
        ownerId: req.user.id,
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

      res.status(201).json(await store.create(meeting));
    } catch (e) {
      res.status(500).json({ error: e.message || "建立會議失敗" });
    }
  });

  app.patch("/api/meetings/:id", requireAuth, async (req, res) => {
    try {
      const updated = await store.updateOwned(req.params.id, req.user.id, req.body || {});
      if (!updated) return res.status(404).json({ error: "找不到此會議" });
      io.to(req.params.id).emit("meeting:updated", updated);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: e.message || "更新會議失敗" });
    }
  });

  app.delete("/api/meetings/:id", requireAuth, async (req, res) => {
    try {
      const ok = await store.removeOwned(req.params.id, req.user.id);
      if (!ok) return res.status(404).json({ error: "找不到此會議" });
      io.to(req.params.id).emit("meeting:deleted", { id: req.params.id });
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: e.message || "刪除會議失敗" });
    }
  });

  // ── Socket.io（需登入，且只能進自己的會議）────────────────────────────────

  io.on("connection", (socket) => {
    let currentRoom = null;

    socket.on("join-meeting", async ({ meetingId, userName } = {}) => {
      try {
        const meeting = meetingId ? await store.getOwned(meetingId, socket.user.id) : null;
        if (!meeting) {
          socket.emit("error", { message: "無效的會議 ID 或無權限" });
          return;
        }

        if (currentRoom) socket.leave(currentRoom);
        currentRoom = meetingId;
        socket.join(meetingId);

        const peers = io.sockets.adapter.rooms.get(meetingId);
        const peerCount = peers ? peers.size : 1;
        const displayName = userName || socket.user.name || "與會者";

        socket.emit("meeting:joined", { meeting, peerCount, userName: displayName });
        socket.to(meetingId).emit("peer:joined", {
          socketId: socket.id,
          userName: displayName,
          peerCount,
        });
      } catch (e) {
        socket.emit("error", { message: e.message || "加入會議失敗" });
      }
    });

    socket.on("leave-meeting", () => {
      if (!currentRoom) return;
      const room = currentRoom;
      socket.leave(room);
      socket.to(room).emit("peer:left", { socketId: socket.id });
      currentRoom = null;
    });

    socket.on("notes:update", async ({ meetingId, topicNotes, topic, content } = {}) => {
      try {
        if (!meetingId) return;
        const meeting = await store.getOwned(meetingId, socket.user.id);
        if (!meeting) return;

        const nextNotes = topicNotes ?? {
          ...meeting.topicNotes,
          ...(topic != null ? { [topic]: content ?? "" } : {}),
        };

        await store.updateOwned(meetingId, socket.user.id, { topicNotes: nextNotes });
        socket.to(meetingId).emit("notes:sync", {
          meetingId,
          topicNotes: nextNotes,
          topic,
          content,
          from: socket.id,
        });
      } catch (e) {
        console.error("[notes:update]", e.message);
      }
    });

    socket.on("agenda:select", ({ meetingId, agendaIdx } = {}) => {
      if (!meetingId) return;
      socket.to(meetingId).emit("agenda:sync", { meetingId, agendaIdx, from: socket.id });
    });

    socket.on("meeting:patch", async ({ meetingId, patch } = {}) => {
      try {
        if (!meetingId || !patch) return;
        const updated = await store.updateOwned(meetingId, socket.user.id, patch);
        if (!updated) return;
        io.to(meetingId).emit("meeting:updated", updated);
      } catch (e) {
        console.error("[meeting:patch]", e.message);
      }
    });

    socket.on("disconnect", () => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit("peer:left", { socketId: socket.id });
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`[meetflow-server] API + Socket.io → http://localhost:${PORT}`);
    console.log(`[meetflow-server] storage → ${store.mode} · auth → ${authStore.mode}`);
  });
}

main().catch((err) => {
  console.error("[meetflow-server] 啟動失敗:", err);
  process.exit(1);
});

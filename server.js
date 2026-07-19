import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { authRequired, createAuthStore, socketAuth } from "./authStore.js";
import { createMeetingsStore } from "./meetingsStore.js";
import { createSocialStore } from "./socialStore.js";
import { geminiConfigured, summarizeMeetingNotes } from "./geminiService.js";
import {
  agendaSelectSchema,
  createMeetingSchema,
  idParamSchema,
  inviteUserSocketSchema,
  joinMeetingSocketSchema,
  loginSchema,
  meetingKickSchema,
  meetingPatchInputSchema,
  meetingPatchSocketSchema,
  meetingReportSchema,
  notesUpdateSchema,
  parseOrThrow,
  profileSchema,
  registerSchema,
  respondSchema,
  searchQuerySchema,
  summarizeSchema,
  toUserIdSchema,
  typingSchema,
} from "./schemas.js";
import {
  canEditNotes,
  canKickMember,
  computeDemocraticKick,
  filterTrustedMeetingPatch,
  reporterKeyFor,
  targetKeyFor,
} from "./meetingAuthz.js";

const PORT = Number(process.env.PORT) || 3001;

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://192.168.50.51:5173",
  "http://192.168.50.51:5174",
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

/** 產生不重複的 6 碼會議代碼 */
async function allocMeetingCode(store) {
  for (let i = 0; i < 24; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!(await store.getByCode(code))) return code;
  }
  return String(Date.now()).slice(-6);
}

async function main() {
  const authStore = await createAuthStore();
  const store = await createMeetingsStore();
  const social = await createSocialStore();
  const requireAuth = authRequired(authStore);

  // 通知：發到某使用者的個人房間（user:<id>），其所有連線裝置都會收到
  const notify = (userId, event, payload) => io.to(`user:${userId}`).emit(event, payload);

  /** 永遠不信任前端：Zod 剝除未知欄位 + 依 JWT／會議狀態過濾可寫欄位 */
  async function applyTrustedMeetingPatch(meetingId, user, rawPatch) {
    const meeting = await store.getAccessible(meetingId, user.id);
    if (!meeting) return null;
    const parsed = parseOrThrow(meetingPatchInputSchema, rawPatch || {}, "會議更新");
    const trusted = filterTrustedMeetingPatch(parsed, meeting, user);
    if (!Object.keys(trusted).length) {
      // 無有效欄位時回傳現況，避免前端因權限過濾後的空 PATCH 被當成錯誤
      return meeting;
    }
    return store.updateAccessible(meetingId, user.id, trusted);
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
  app.use(express.json({ limit: "1mb" }));

  // 統一處理 Zod／授權錯誤
  const sendErr = (res, e, fallback = "請求失敗") => {
    const status = e?.status || 500;
    const body = { error: e?.message || fallback };
    if (e?.issues) body.issues = e.issues;
    res.status(status).json(body);
  };

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
      gemini: geminiConfigured(),
      ts: Date.now(),
    });
  });

  // ── AI：會後整理（API Key 僅存後端 env）──────────────────────────────────

  app.post("/api/ai/summarize", requireAuth, async (req, res) => {
    try {
      const body = parseOrThrow(summarizeSchema, req.body, "AI 摘要");
      const result = await summarizeMeetingNotes({
        notes: body.notes,
        participants: body.participants,
        title: body.title,
        mode: body.mode,
      });
      res.json(result);
    } catch (e) {
      console.error("[api/ai/summarize]", e?.message || e);
      sendErr(res, e, "AI 整理失敗");
    }
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  app.post("/api/auth/register", async (req, res) => {
    try {
      const body = parseOrThrow(registerSchema, req.body, "註冊");
      const result = await authStore.register(body);
      res.status(201).json(result);
    } catch (e) {
      sendErr(res, e, "註冊失敗");
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = parseOrThrow(loginSchema, req.body, "登入");
      const result = await authStore.login(body);
      res.json(result);
    } catch (e) {
      sendErr(res, e, "登入失敗");
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json({ user: req.user });
  });

  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const body = parseOrThrow(profileSchema, req.body, "個人資料");
      const user = await authStore.updateProfile(req.user.id, body);
      res.json({ user });
    } catch (e) {
      sendErr(res, e, "更新個人資料失敗");
    }
  });

  // ── Meetings（僅本人資料）─────────────────────────────────────────────────

  app.get("/api/meetings", requireAuth, async (req, res) => {
    try {
      res.json(await store.listForUser(req.user.id));
    } catch (e) {
      res.status(500).json({ error: e.message || "讀取會議失敗" });
    }
  });

  app.get("/api/meetings/:id", requireAuth, async (req, res) => {
    try {
      const id = parseOrThrow(idParamSchema, req.params.id, "會議 ID");
      const meeting = await store.getAccessible(id, req.user.id);
      if (!meeting) return res.status(404).json({ error: "找不到此會議" });
      res.json(meeting);
    } catch (e) {
      sendErr(res, e, "讀取會議失敗");
    }
  });

  app.post("/api/meetings", requireAuth, async (req, res) => {
    try {
      const data = parseOrThrow(createMeetingSchema, req.body, "建立會議");
      const participants = (data.participants || [])
        .map((p) => (typeof p === "string" ? p : p?.name))
        .filter(Boolean)
        .map((n) => String(n).trim())
        .slice(0, 100);

      const meeting = {
        id: uid(),
        code: await allocMeetingCode(store),
        ownerId: req.user.id,
        memberIds: [],
        title: data.title,
        scenario: data.scenario || "brainstorm",
        scenarioLabel: data.scenarioLabel || "",
        scenarioEmoji: data.scenarioEmoji || "",
        extra: data.extra && typeof data.extra === "object" ? data.extra : {},
        attendees: Array.isArray(data.attendees) ? data.attendees : [],
        participants,
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
        ownerName: data.ownerName || req.user.name || "",
        inviteRoster: Array.isArray(data.inviteRoster) ? data.inviteRoster : [],
        rbac: {
          isEditRestricted: Boolean(data.isEditRestricted),
          isHostAssignmentEnabled: data.isHostAssignmentEnabled !== false,
          isKickPermissionEnabled: Boolean(data.isKickPermissionEnabled),
          allowedEditors: data.allowedEditors || [],
          allowedKickers: data.allowedKickers || [],
          allowedEndMeetingUsers: data.allowedEndMeetingUsers || [],
          endMeetingRule: data.endMeetingRule || "host_only",
        },
      };

      res.status(201).json(await store.create(meeting));
    } catch (e) {
      sendErr(res, e, "建立會議失敗");
    }
  });

  app.patch("/api/meetings/:id", requireAuth, async (req, res) => {
    try {
      const id = parseOrThrow(idParamSchema, req.params.id, "會議 ID");
      const updated = await applyTrustedMeetingPatch(id, req.user, req.body);
      if (!updated) return res.status(404).json({ error: "找不到此會議" });
      io.to(id).emit("meeting:updated", updated);
      res.json(updated);
    } catch (e) {
      sendErr(res, e, "更新會議失敗");
    }
  });

  // 邀請好友加入會議（擁有者或協作成員皆可邀請，且對方必須是好友）
  app.post("/api/meetings/:id/invite", requireAuth, async (req, res) => {
    try {
      const id = parseOrThrow(idParamSchema, req.params.id, "會議 ID");
      const { toUserId } = parseOrThrow(toUserIdSchema, req.body, "邀請");
      const meeting = await store.getAccessible(id, req.user.id);
      if (!meeting) return res.status(404).json({ error: "找不到此會議或無權限" });

      if (toUserId === req.user.id) return res.status(400).json({ error: "不能邀請自己" });

      const friendship = await social.getFriendship(req.user.id, toUserId);
      if (!friendship || friendship.status !== "accepted") {
        return res.status(403).json({ error: "只能邀請好友加入會議" });
      }
      if (meeting.ownerId === toUserId || (meeting.memberIds || []).includes(toUserId)) {
        return res.status(409).json({ error: "對方已在此會議中" });
      }
      const existing = await social.findPendingInvite(id, toUserId);
      if (existing) return res.status(409).json({ error: "已送出邀請，等待對方回應" });

      const invite = await social.createInvite(id, req.user.id, toUserId);
      notify(toUserId, "meeting:invite", {
        invite,
        meeting: { id: meeting.id, title: meeting.title, scenarioEmoji: meeting.scenarioEmoji },
        from: { id: req.user.id, name: req.user.name },
      });
      res.status(201).json(invite);
    } catch (e) {
      sendErr(res, e, "邀請失敗");
    }
  });

  // 透過專屬連結／會議代碼加入（:id 可為 UUID 或 6 碼 code）
  app.post("/api/meetings/:id/join", requireAuth, async (req, res) => {
    try {
      const ref = parseOrThrow(idParamSchema, req.params.id, "會議代碼");
      const existing = await store.resolveRef(ref);
      if (!existing) return res.status(404).json({ error: "找不到此會議" });

      const meeting = await store.addMember(existing.id, req.user.id, req.user.name, req.user.email);
      if (!meeting) return res.status(404).json({ error: "找不到此會議" });

      io.to(existing.id).emit("meeting:updated", meeting);
      res.json(meeting);
    } catch (e) {
      sendErr(res, e, "加入會議失敗");
    }
  });

  app.delete("/api/meetings/:id", requireAuth, async (req, res) => {
    try {
      const id = parseOrThrow(idParamSchema, req.params.id, "會議 ID");
      const ok = await store.removeOwned(id, req.user.id);
      if (!ok) return res.status(404).json({ error: "找不到此會議" });
      io.to(id).emit("meeting:deleted", { id });
      res.status(204).end();
    } catch (e) {
      sendErr(res, e, "刪除會議失敗");
    }
  });

  // ── 使用者搜尋 ─────────────────────────────────────────────────────────────

  app.get("/api/users/search", requireAuth, async (req, res) => {
    try {
      const { q } = parseOrThrow(searchQuerySchema, { q: req.query.q }, "搜尋");
      const users = await authStore.searchUsers({ query: q, excludeId: req.user.id, limit: 10 });

      const friendIds = new Set(await social.listAcceptedFriendIds(req.user.id));
      const outgoing = new Set((await social.listOutgoingFriendRequests(req.user.id)).map((f) => f.addresseeId));
      const incoming = new Set((await social.listIncomingFriendRequests(req.user.id)).map((f) => f.requesterId));

      const withStatus = users.map((u) => ({
        ...u,
        relation: friendIds.has(u.id)
          ? "friend"
          : outgoing.has(u.id)
          ? "requested"
          : incoming.has(u.id)
          ? "incoming"
          : "none",
      }));
      res.json(withStatus);
    } catch (e) {
      sendErr(res, e, "搜尋失敗");
    }
  });

  // ── 好友 ───────────────────────────────────────────────────────────────────

  app.get("/api/friends", requireAuth, async (req, res) => {
    try {
      const ids = await social.listAcceptedFriendIds(req.user.id);
      res.json(await authStore.getPublicByIds(ids));
    } catch (e) {
      sendErr(res, e, "讀取好友失敗");
    }
  });

  app.get("/api/friends/requests", requireAuth, async (req, res) => {
    try {
      const incoming = await social.listIncomingFriendRequests(req.user.id);
      const outgoing = await social.listOutgoingFriendRequests(req.user.id);
      const ids = [...incoming.map((r) => r.requesterId), ...outgoing.map((r) => r.addresseeId)];
      const users = await authStore.getPublicByIds(ids);
      const byId = Object.fromEntries(users.map((u) => [u.id, u]));
      res.json({
        incoming: incoming.map((r) => ({ id: r.id, user: byId[r.requesterId] || null, createdAt: r.createdAt })),
        outgoing: outgoing.map((r) => ({ id: r.id, user: byId[r.addresseeId] || null, createdAt: r.createdAt })),
      });
    } catch (e) {
      sendErr(res, e, "讀取邀請失敗");
    }
  });

  app.post("/api/friends/requests", requireAuth, async (req, res) => {
    try {
      const { toUserId } = parseOrThrow(toUserIdSchema, req.body, "好友邀請");
      if (toUserId === req.user.id) return res.status(400).json({ error: "不能加自己為好友" });

      const target = await authStore.getById(toUserId);
      if (!target) return res.status(404).json({ error: "找不到此使用者" });

      const existing = await social.getFriendship(req.user.id, toUserId);
      if (existing) {
        if (existing.status === "accepted") return res.status(409).json({ error: "你們已經是好友" });
        // 對方已對我送出邀請 → 直接互相成為好友
        if (existing.addresseeId === req.user.id) {
          const accepted = await social.acceptFriendship(existing);
          notify(existing.requesterId, "friend:accepted", { by: { id: req.user.id, name: req.user.name } });
          notify(req.user.id, "friend:changed", {});
          return res.status(200).json({ status: "accepted", friendship: accepted });
        }
        return res.status(409).json({ error: "已送出邀請，等待對方同意" });
      }

      const fr = await social.sendFriendRequest(req.user.id, toUserId);
      notify(toUserId, "friend:request", { from: { id: req.user.id, name: req.user.name, email: req.user.email } });
      res.status(201).json({ status: "pending", friendship: fr });
    } catch (e) {
      sendErr(res, e, "送出好友邀請失敗");
    }
  });

  app.post("/api/friends/requests/:id/respond", requireAuth, async (req, res) => {
    try {
      const id = parseOrThrow(idParamSchema, req.params.id, "邀請 ID");
      const { accept } = parseOrThrow(respondSchema, req.body, "回應邀請");
      const fr = await social.respondFriendRequest(id, req.user.id, accept);
      if (!fr) return res.status(404).json({ error: "找不到此邀請" });
      if (accept) {
        notify(fr.requesterId, "friend:accepted", { by: { id: req.user.id, name: req.user.name } });
      }
      res.json({ status: accept ? "accepted" : "declined" });
    } catch (e) {
      sendErr(res, e, "回應好友邀請失敗");
    }
  });

  app.delete("/api/friends/:userId", requireAuth, async (req, res) => {
    try {
      const userId = parseOrThrow(idParamSchema, req.params.userId, "使用者 ID");
      const ok = await social.unfriend(req.user.id, userId);
      if (!ok) return res.status(404).json({ error: "你們不是好友" });
      notify(userId, "friend:changed", {});
      res.status(204).end();
    } catch (e) {
      sendErr(res, e, "移除好友失敗");
    }
  });

  // ── 會議邀請 ───────────────────────────────────────────────────────────────

  app.get("/api/invites", requireAuth, async (req, res) => {
    try {
      const invites = await social.listIncomingInvites(req.user.id);
      const fromUsers = await authStore.getPublicByIds(invites.map((i) => i.fromUserId));
      const byId = Object.fromEntries(fromUsers.map((u) => [u.id, u]));
      const out = [];
      for (const inv of invites) {
        const m = await store.getByIdAny(inv.meetingId);
        out.push({
          id: inv.id,
          meeting: m ? { id: m.id, title: m.title, scenarioEmoji: m.scenarioEmoji, scenarioLabel: m.scenarioLabel } : null,
          from: byId[inv.fromUserId] || null,
          createdAt: inv.createdAt,
        });
      }
      res.json(out.filter((i) => i.meeting));
    } catch (e) {
      sendErr(res, e, "讀取會議邀請失敗");
    }
  });

  app.post("/api/invites/:id/respond", requireAuth, async (req, res) => {
    try {
      const id = parseOrThrow(idParamSchema, req.params.id, "邀請 ID");
      const { accept } = parseOrThrow(respondSchema, req.body, "回應邀請");
      const inv = await social.respondInvite(id, req.user.id, accept);
      if (!inv) return res.status(404).json({ error: "找不到此邀請" });

      let meeting = null;
      if (accept) {
        meeting = await store.addMember(inv.meetingId, req.user.id, req.user.name, req.user.email);
        if (meeting) {
          io.to(inv.meetingId).emit("meeting:updated", meeting);
          notify(inv.fromUserId, "meeting:invite-accepted", { by: { id: req.user.id, name: req.user.name }, meetingId: inv.meetingId });
        }
      }
      res.json({ status: accept ? "accepted" : "declined", meeting });
    } catch (e) {
      sendErr(res, e, "回應會議邀請失敗");
    }
  });

  // ── Socket.io（需登入，且只能進自己有權限的會議）──────────────────────────

  io.on("connection", (socket) => {
    let currentRoom = null;

    // 個人通知房間：好友邀請 / 會議邀請等即時推播
    socket.join(`user:${socket.user.id}`);

    const doJoinMeeting = async (raw = {}) => {
      try {
        const { meetingId } = parseOrThrow(joinMeetingSocketSchema, raw, "加入會議");
        let meeting = await store.getAccessible(meetingId, socket.user.id);

        // 若在建立時被選為 attendee、但尚未寫入 memberIds，自動加入後再進房
        if (!meeting) {
          const any = await store.getByIdAny(meetingId);
          const listed = (any?.attendees || []).some((a) => a && a.id === socket.user.id);
          if (any && listed) {
            meeting = await store.addMember(meetingId, socket.user.id, socket.user.name, socket.user.email);
          }
        }

        if (!meeting) {
          socket.emit("error", { message: "無效的會議 ID 或無權限（請用邀請連結加入）" });
          return;
        }

        if (currentRoom && currentRoom !== meetingId) socket.leave(currentRoom);
        currentRoom = meetingId;
        socket.join(meetingId);

        const peers = io.sockets.adapter.rooms.get(meetingId);
        const peerCount = peers ? peers.size : 1;
        // 顯示名稱一律用伺服器 JWT 身分，不信任前端 userName
        const displayName = socket.user.name || "與會者";

        socket.emit("meeting:joined", { meeting, peerCount, userName: displayName });
        socket.to(meetingId).emit("peer:joined", {
          socketId: socket.id,
          userName: displayName,
          peerCount,
        });
      } catch (e) {
        socket.emit("error", { message: e.message || "加入會議失敗" });
      }
    };

    socket.on("join-meeting", doJoinMeeting);
    // 相容別名
    socket.on("join-room", (payload) => {
      const meetingId = typeof payload === "string" ? payload : payload?.meetingId;
      return doJoinMeeting({ meetingId });
    });

    socket.on("leave-meeting", () => {
      if (!currentRoom) return;
      const room = currentRoom;
      socket.leave(room);
      currentRoom = null;
      const peers = io.sockets.adapter.rooms.get(room);
      const peerCount = peers ? peers.size : 0;
      socket.to(room).emit("peer:left", { socketId: socket.id, peerCount });
    });

    socket.on("notes:update", async (raw = {}) => {
      try {
        const data = parseOrThrow(notesUpdateSchema, raw, "筆記同步");
        const meeting = await store.getAccessible(data.meetingId, socket.user.id);
        if (!meeting) return;
        if (!canEditNotes(meeting, socket.user)) {
          socket.emit("error", { message: "沒有筆記編輯權限" });
          return;
        }

        const nextNotes = data.topicNotes ?? {
          ...(meeting.topicNotes || {}),
          ...(data.topic != null ? { [data.topic]: data.content ?? "" } : {}),
        };
        const trustedNotes = parseOrThrow(
          meetingPatchInputSchema,
          { topicNotes: nextNotes },
          "筆記內容"
        ).topicNotes;

        await store.updateAccessible(data.meetingId, socket.user.id, { topicNotes: trustedNotes });
        socket.to(data.meetingId).emit("notes:sync", {
          meetingId: data.meetingId,
          topicNotes: trustedNotes,
          topic: data.topic,
          content: data.topic != null ? trustedNotes?.[data.topic] : undefined,
          from: socket.id,
        });
      } catch (e) {
        console.error("[notes:update]", e.message);
        socket.emit("error", { message: e.message || "筆記同步失敗" });
      }
    });

    socket.on("agenda:select", async (raw = {}) => {
      try {
        const data = parseOrThrow(agendaSelectSchema, raw, "議程切換");
        const meeting = await store.getAccessible(data.meetingId, socket.user.id);
        if (!meeting) return;
        socket.to(data.meetingId).emit("agenda:sync", {
          meetingId: data.meetingId,
          agendaIdx: data.agendaIdx,
          from: socket.id,
        });
      } catch (e) {
        /* ignore invalid */
      }
    });

    // 打字狀態：中繼給同房其他人（顯示名稱用 JWT）
    socket.on("typing", async (raw = {}) => {
      try {
        const data = parseOrThrow(typingSchema, raw, "打字狀態");
        const meeting = await store.getAccessible(data.meetingId, socket.user.id);
        if (!meeting) return;
        socket.to(data.meetingId).emit("typing", {
          userName: socket.user.name,
          topic: data.topic,
          from: socket.id,
        });
      } catch (e) {
        /* ignore */
      }
    });

    // 會議中即時邀請好友（emit invite-user，帶 ack 回傳結果）
    socket.on("invite-user", async (raw = {}, ack) => {
      try {
        const { meetingId, toUserId } = parseOrThrow(inviteUserSocketSchema, raw, "邀請好友");
        if (toUserId === socket.user.id) return ack?.({ ok: false, error: "不能邀請自己" });

        const meeting = await store.getAccessible(meetingId, socket.user.id);
        if (!meeting) return ack?.({ ok: false, error: "找不到此會議或無權限" });

        const friendship = await social.getFriendship(socket.user.id, toUserId);
        if (!friendship || friendship.status !== "accepted") {
          return ack?.({ ok: false, error: "只能邀請好友加入會議" });
        }
        if (meeting.ownerId === toUserId || (meeting.memberIds || []).includes(toUserId)) {
          return ack?.({ ok: false, error: "對方已在此會議中" });
        }
        const existing = await social.findPendingInvite(meetingId, toUserId);
        if (existing) return ack?.({ ok: false, error: "已送出邀請，等待對方回應" });

        const invite = await social.createInvite(meetingId, socket.user.id, toUserId);
        notify(toUserId, "meeting:invite", {
          invite,
          meeting: { id: meeting.id, title: meeting.title, scenarioEmoji: meeting.scenarioEmoji },
          from: { id: socket.user.id, name: socket.user.name },
        });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ ok: false, error: e.message || "邀請失敗" });
      }
    });

    socket.on("meeting:patch", async (raw = {}) => {
      try {
        const { meetingId, patch } = parseOrThrow(meetingPatchSocketSchema, raw, "會議補丁");
        const updated = await applyTrustedMeetingPatch(meetingId, socket.user, patch);
        if (!updated) return;
        io.to(meetingId).emit("meeting:updated", updated);
      } catch (e) {
        console.error("[meeting:patch]", e.message);
        socket.emit("error", { message: e.message || "更新失敗" });
      }
    });

    socket.on("meeting:kick", async (raw = {}, ack) => {
      try {
        const data = parseOrThrow(meetingKickSchema, raw, "踢除成員");
        const meeting = await store.getAccessible(data.meetingId, socket.user.id);
        if (!meeting) {
          ack?.({ ok: false, error: "找不到會議或無權限" });
          return;
        }

        const demo = computeDemocraticKick(meeting, data.targetUserId, data.targetName);
        const democraticOk = data.reason === "report" && demo.ok;
        if (!canKickMember(meeting, socket.user, { democraticOk })) {
          ack?.({ ok: false, error: "沒有踢人權限" });
          return;
        }

        // 不可踢發起人
        if (
          (data.targetUserId && data.targetUserId === meeting.ownerId) ||
          (data.targetName &&
            String(meeting.ownerName || "").trim().toLowerCase() ===
              String(data.targetName).trim().toLowerCase())
        ) {
          ack?.({ ok: false, error: "無法踢除會議發起人" });
          return;
        }

        const updated = await store.removeMember(data.meetingId, {
          userId: data.targetUserId || null,
          userName: data.targetName || null,
        });
        if (!updated) {
          ack?.({ ok: false, error: "踢除失敗" });
          return;
        }

        // 清除該成員舉報紀錄（僅經 owner 寫入）
        if (updated.memberReports && typeof updated.memberReports === "object") {
          const reports = { ...updated.memberReports };
          if (data.targetUserId) delete reports[`id:${data.targetUserId}`];
          if (data.targetName) {
            delete reports[`name:${String(data.targetName).trim().toLowerCase()}`];
          }
          const cleared =
            (await store.updateOwned(data.meetingId, meeting.ownerId, { memberReports: reports })) ||
            null;
          if (cleared) Object.assign(updated, cleared);
          else updated.memberReports = reports;
        }

        const payload = {
          meetingId: data.meetingId,
          targetUserId: data.targetUserId || null,
          targetName: data.targetName || null,
          byUserId: socket.user.id,
          byName: socket.user.name,
          reason: data.reason === "report" ? "report" : "host",
        };
        io.to(data.meetingId).emit("meeting:updated", updated);
        io.to(data.meetingId).emit("meeting:kicked", payload);
        if (data.targetUserId) {
          notify(data.targetUserId, "meeting:kicked", payload);
        }
        ack?.({ ok: true, meeting: updated });
      } catch (e) {
        console.error("[meeting:kick]", e.message);
        ack?.({ ok: false, error: e.message || "踢除失敗" });
      }
    });

    /** 民主舉報：票數與 reporter 一律由伺服器 JWT 決定，忽略前端 reporterKey／memberReports */
    socket.on("meeting:report", async (raw = {}, ack) => {
      try {
        const data = parseOrThrow(meetingReportSchema, raw, "舉報");
        const meeting = await store.getAccessible(data.meetingId, socket.user.id);
        if (!meeting) {
          ack?.({ ok: false, error: "找不到會議或無權限" });
          return;
        }

        const myId = socket.user.id;
        const myName = String(socket.user.name || "").trim();
        const rKey = reporterKeyFor(socket.user);
        const tKey = targetKeyFor(data.targetUserId, data.targetName);

        if (!tKey) {
          ack?.({ ok: false, error: "缺少舉報對象" });
          return;
        }
        if (rKey === tKey || (data.targetUserId && data.targetUserId === myId)) {
          ack?.({ ok: false, error: "無法舉報自己" });
          return;
        }
        if (
          (data.targetUserId && data.targetUserId === meeting.ownerId) ||
          (data.targetName &&
            String(meeting.ownerName || "").trim().toLowerCase() ===
              String(data.targetName).trim().toLowerCase())
        ) {
          ack?.({ ok: false, error: "無法舉報會議發起人" });
          return;
        }

        const prev =
          meeting.memberReports && typeof meeting.memberReports === "object"
            ? { ...meeting.memberReports }
            : {};
        const list = Array.isArray(prev[tKey]) ? [...prev[tKey]] : [];
        if (list.includes(rKey)) {
          io.to(data.meetingId).emit("meeting:reports", { meetingId: data.meetingId, memberReports: prev });
          ack?.({ ok: true, duplicate: true, memberReports: prev });
          return;
        }
        list.push(rKey);
        prev[tKey] = list;

        const demo = computeDemocraticKick({ ...meeting, memberReports: prev }, data.targetUserId, data.targetName);

        // memberReports 僅能由 owner 持久化；成員舉報時用 owner 身分寫入 store
        let updated =
          (await store.updateOwned(data.meetingId, meeting.ownerId, { memberReports: prev })) ||
          (await store.updateAccessible(data.meetingId, meeting.ownerId, { memberReports: prev }));
        if (!updated) {
          updated = { ...meeting, memberReports: prev };
        }

        io.to(data.meetingId).emit("meeting:reports", {
          meetingId: data.meetingId,
          memberReports: prev,
          reason: data.reason || null,
        });
        io.to(data.meetingId).emit("meeting:updated", updated);

        if (demo.ok) {
          const kicked = await store.removeMember(data.meetingId, {
            userId: data.targetUserId || null,
            userName: data.targetName || null,
          });
          if (kicked) {
            const reports = { ...(kicked.memberReports || prev) };
            delete reports[tKey];
            const cleared =
              (await store.updateOwned(data.meetingId, meeting.ownerId, { memberReports: reports })) || {
                ...kicked,
                memberReports: reports,
              };
            const payload = {
              meetingId: data.meetingId,
              targetUserId: data.targetUserId || null,
              targetName: data.targetName || null,
              byUserId: myId,
              byName: myName,
              reason: "report",
            };
            io.to(data.meetingId).emit("meeting:updated", cleared);
            io.to(data.meetingId).emit("meeting:reports", {
              meetingId: data.meetingId,
              memberReports: reports,
            });
            io.to(data.meetingId).emit("meeting:kicked", payload);
            if (data.targetUserId) notify(data.targetUserId, "meeting:kicked", payload);
            ack?.({ ok: true, kicked: true, ratio: demo.ratio, memberReports: reports });
            return;
          }
        }

        ack?.({ ok: true, kicked: false, ratio: demo.ratio, memberReports: prev });
      } catch (e) {
        console.error("[meeting:report]", e.message);
        ack?.({ ok: false, error: e.message || "舉報失敗" });
      }
    });

    socket.on("disconnect", () => {
      if (!currentRoom) return;
      const room = currentRoom;
      currentRoom = null;
      const peers = io.sockets.adapter.rooms.get(room);
      const peerCount = peers ? peers.size : 0;
      socket.to(room).emit("peer:left", { socketId: socket.id, peerCount });
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[meetflow-server] API + Socket.io → http://0.0.0.0:${PORT}`);
    console.log(`[meetflow-server] 本機可用 http://localhost:${PORT} ，區網請用 http://<你的電腦IP>:${PORT}`);
    console.log(`[meetflow-server] storage → ${store.mode} · auth → ${authStore.mode}`);
    console.log(
      `[meetflow-server] gemini → ${geminiConfigured() ? "configured" : "missing GEMINI_API_KEY (mock fallback)"}`
    );
  });
}

main().catch((err) => {
  console.error("[meetflow-server] 啟動失敗:", err);
  process.exit(1);
});

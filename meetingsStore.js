import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { ensureDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "meetings.json");

const meetingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true, index: true },
    memberIds: { type: [String], default: [], index: true }, // 受邀並接受的協作成員
    title: { type: String, required: true },
    scenario: { type: String, default: "brainstorm" },
    scenarioLabel: { type: String, default: "" },
    scenarioEmoji: { type: String, default: "" },
    extra: { type: mongoose.Schema.Types.Mixed, default: {} },
    participants: { type: [String], default: [] },
    attendees: { type: [mongoose.Schema.Types.Mixed], default: [] }, // [{ id, name, email }]
    code: { type: String, default: "", index: true }, // 6 碼會議代碼
    pains: { type: [String], default: [] },
    goals: { type: [String], default: [] },
    links: { type: [String], default: [] },
    durationMin: { type: Number, default: 30 },
    notes: { type: String, default: "" },
    topicNotes: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, default: "ready" },
    createdAt: { type: Number, default: () => Date.now() },
    startedAt: { type: Number, default: null },
    endedAt: { type: Number, default: null },
    review: { type: mongoose.Schema.Types.Mixed, default: null },
    actions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { versionKey: false }
);

const MeetingModel = mongoose.models.Meeting || mongoose.model("Meeting", meetingSchema);

/** 儲存層防禦：永遠不可經 patch 覆寫身分欄位 */
function stripIdentity(patch = {}) {
  const next = { ...patch };
  delete next.id;
  delete next.ownerId;
  delete next.memberIds;
  delete next.createdAt;
  return next;
}

function toPlain(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

function createJsonStore() {
  let cache = null;

  async function ensureLoaded() {
    if (cache) return cache;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const raw = await fs.readFile(DATA_FILE, "utf8");
      cache = JSON.parse(raw);
      if (!Array.isArray(cache)) cache = [];
    } catch {
      cache = [];
    }
    return cache;
  }

  async function persist() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(cache || [], null, 2), "utf8");
  }

  return {
    mode: "json",
    async listByOwner(ownerId) {
      const list = await ensureLoaded();
      return list.filter((m) => m.ownerId === ownerId).sort((a, b) => b.createdAt - a.createdAt);
    },
    async listForUser(userId) {
      const list = await ensureLoaded();
      return list
        .filter((m) => m.ownerId === userId || (m.memberIds || []).includes(userId))
        .sort((a, b) => b.createdAt - a.createdAt);
    },
    async getOwned(id, ownerId) {
      const list = await ensureLoaded();
      const m = list.find((x) => x.id === id);
      if (!m || m.ownerId !== ownerId) return null;
      return m;
    },
    async getAccessible(id, userId) {
      const list = await ensureLoaded();
      const m = list.find((x) => x.id === id);
      if (!m) return null;
      if (m.ownerId !== userId && !(m.memberIds || []).includes(userId)) return null;
      return m;
    },
    async getByIdAny(id) {
      const list = await ensureLoaded();
      return list.find((x) => x.id === id) || null;
    },
    async getByCode(code) {
      const c = String(code || "").replace(/\s|-/g, "");
      if (!c) return null;
      const list = await ensureLoaded();
      return list.find((x) => String(x.code || "").replace(/\s|-/g, "") === c) || null;
    },
    async resolveRef(ref) {
      const r = String(ref || "").trim();
      if (!r) return null;
      return (await this.getByIdAny(r)) || (await this.getByCode(r));
    },
    async updateAccessible(id, userId, patch) {
      const list = await ensureLoaded();
      const idx = list.findIndex((m) => m.id === id && (m.ownerId === userId || (m.memberIds || []).includes(userId)));
      if (idx === -1) return null;
      const base = list[idx];
      const safe = stripIdentity(patch);
      const updated = { ...base, ...safe, id, ownerId: base.ownerId, memberIds: base.memberIds || [] };
      list[idx] = updated;
      await persist();
      return updated;
    },
    async addMember(id, userId, userName, userEmail) {
      const list = await ensureLoaded();
      const idx = list.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      const m = list[idx];
      m.memberIds = m.memberIds || [];
      if (!m.memberIds.includes(userId)) m.memberIds.push(userId);
      if (userName && !(m.participants || []).includes(userName)) {
        m.participants = [...(m.participants || []), userName];
      }
      m.attendees = Array.isArray(m.attendees) ? m.attendees : [];
      if (userId && !m.attendees.some((a) => a && a.id === userId)) {
        m.attendees = [...m.attendees, { id: userId, name: userName || "", email: userEmail || "" }];
      }
      m.inviteRoster = Array.isArray(m.inviteRoster) ? [...m.inviteRoster] : [];
      const rosterIdx = m.inviteRoster.findIndex(
        (p) => (userId && p.id === userId) || (userName && p.name === userName)
      );
      if (rosterIdx >= 0) {
        m.inviteRoster[rosterIdx] = {
          ...m.inviteRoster[rosterIdx],
          id: userId || m.inviteRoster[rosterIdx].id,
          name: userName || m.inviteRoster[rosterIdx].name,
          email: userEmail || m.inviteRoster[rosterIdx].email || "",
          status: "joined",
        };
      } else if (userName) {
        m.inviteRoster.push({
          id: userId || null,
          name: userName,
          email: userEmail || "",
          status: "joined",
        });
      }
      // 強制去重，避免同名重複寫入
      const seen = new Set();
      m.inviteRoster = m.inviteRoster.filter((p) => {
        const key = String(p?.name || "").trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      m.participants = [...new Set((m.participants || []).map((n) => String(n || "").trim()).filter(Boolean))];
      list[idx] = m;
      await persist();
      return m;
    },
    async removeMember(id, { userId = null, userName = null } = {}) {
      const list = await ensureLoaded();
      const idx = list.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      const m = { ...list[idx] };
      const nameKey = String(userName || "").trim().toLowerCase();
      if (userId) {
        m.memberIds = (m.memberIds || []).filter((x) => x !== userId);
      }
      m.attendees = (m.attendees || []).filter((a) => {
        if (!a) return false;
        if (userId && a.id === userId) return false;
        if (nameKey && String(a.name || "").trim().toLowerCase() === nameKey) return false;
        return true;
      });
      m.inviteRoster = (m.inviteRoster || []).filter((p) => {
        if (!p) return false;
        if (userId && p.id === userId) return false;
        if (nameKey && String(p.name || "").trim().toLowerCase() === nameKey) return false;
        return true;
      });
      m.participants = (m.participants || []).filter(
        (n) => String(n || "").trim().toLowerCase() !== nameKey
      );
      list[idx] = m;
      await persist();
      return m;
    },
    async create(meeting) {
      const list = await ensureLoaded();
      list.unshift(meeting);
      await persist();
      return meeting;
    },
    async updateOwned(id, ownerId, patch) {
      const list = await ensureLoaded();
      const idx = list.findIndex((m) => m.id === id && m.ownerId === ownerId);
      if (idx === -1) return null;
      const safe = stripIdentity(patch);
      const updated = { ...list[idx], ...safe, id, ownerId };
      list[idx] = updated;
      await persist();
      return updated;
    },
    async removeOwned(id, ownerId) {
      const list = await ensureLoaded();
      const idx = list.findIndex((m) => m.id === id && m.ownerId === ownerId);
      if (idx === -1) return false;
      list.splice(idx, 1);
      await persist();
      return true;
    },
    async countByOwner(ownerId) {
      const list = await ensureLoaded();
      return list.filter((m) => m.ownerId === ownerId).length;
    },
    async count() {
      const list = await ensureLoaded();
      return list.length;
    },
  };
}

function createMongoStore() {
  return {
    mode: "mongodb",
    async listByOwner(ownerId) {
      const docs = await MeetingModel.find({ ownerId }).sort({ createdAt: -1 }).lean();
      return docs.map(({ _id, ...rest }) => rest);
    },
    async listForUser(userId) {
      const docs = await MeetingModel.find({ $or: [{ ownerId: userId }, { memberIds: userId }] })
        .sort({ createdAt: -1 })
        .lean();
      return docs.map(({ _id, ...rest }) => rest);
    },
    async getOwned(id, ownerId) {
      const doc = await MeetingModel.findOne({ id, ownerId }).lean();
      if (!doc) return null;
      const { _id, ...rest } = doc;
      return rest;
    },
    async getAccessible(id, userId) {
      const doc = await MeetingModel.findOne({ id, $or: [{ ownerId: userId }, { memberIds: userId }] }).lean();
      if (!doc) return null;
      const { _id, ...rest } = doc;
      return rest;
    },
    async getByIdAny(id) {
      const doc = await MeetingModel.findOne({ id }).lean();
      if (!doc) return null;
      const { _id, ...rest } = doc;
      return rest;
    },
    async getByCode(code) {
      const c = String(code || "").replace(/\s|-/g, "");
      if (!c) return null;
      const doc = await MeetingModel.findOne({ code: c }).lean();
      if (!doc) return null;
      const { _id, ...rest } = doc;
      return rest;
    },
    async resolveRef(ref) {
      const r = String(ref || "").trim();
      if (!r) return null;
      return (await this.getByIdAny(r)) || (await this.getByCode(r));
    },
    async updateAccessible(id, userId, patch) {
      const safe = stripIdentity(patch);
      delete safe.id;
      const doc = await MeetingModel.findOneAndUpdate(
        { id, $or: [{ ownerId: userId }, { memberIds: userId }] },
        { $set: safe },
        { new: true }
      );
      return toPlain(doc);
    },
    async addMember(id, userId, userName, userEmail) {
      const existing = await MeetingModel.findOne({ id }).lean();
      if (!existing) return null;
      const attendees = Array.isArray(existing.attendees) ? [...existing.attendees] : [];
      if (userId && !attendees.some((a) => a && a.id === userId)) {
        attendees.push({ id: userId, name: userName || "", email: userEmail || "" });
      }
      const inviteRoster = Array.isArray(existing.inviteRoster) ? [...existing.inviteRoster] : [];
      const rosterIdx = inviteRoster.findIndex(
        (p) => (userId && p.id === userId) || (userName && p.name === userName)
      );
      if (rosterIdx >= 0) {
        inviteRoster[rosterIdx] = {
          ...inviteRoster[rosterIdx],
          id: userId || inviteRoster[rosterIdx].id,
          name: userName || inviteRoster[rosterIdx].name,
          email: userEmail || inviteRoster[rosterIdx].email || "",
          status: "joined",
        };
      } else if (userName) {
        inviteRoster.push({
          id: userId || null,
          name: userName,
          email: userEmail || "",
          status: "joined",
        });
      }
      const update = {
        $addToSet: { memberIds: userId },
        $set: { attendees, inviteRoster },
      };
      if (userName) update.$addToSet.participants = userName;
      const doc = await MeetingModel.findOneAndUpdate({ id }, update, { new: true });
      return toPlain(doc);
    },
    async removeMember(id, { userId = null, userName = null } = {}) {
      const existing = await MeetingModel.findOne({ id }).lean();
      if (!existing) return null;
      const nameKey = String(userName || "").trim().toLowerCase();
      const attendees = (existing.attendees || []).filter((a) => {
        if (!a) return false;
        if (userId && a.id === userId) return false;
        if (nameKey && String(a.name || "").trim().toLowerCase() === nameKey) return false;
        return true;
      });
      const inviteRoster = (existing.inviteRoster || []).filter((p) => {
        if (!p) return false;
        if (userId && p.id === userId) return false;
        if (nameKey && String(p.name || "").trim().toLowerCase() === nameKey) return false;
        return true;
      });
      const participants = (existing.participants || []).filter(
        (n) => String(n || "").trim().toLowerCase() !== nameKey
      );
      const update = { $set: { attendees, inviteRoster, participants } };
      if (userId) update.$pull = { memberIds: userId };
      const doc = await MeetingModel.findOneAndUpdate({ id }, update, { new: true });
      return toPlain(doc);
    },
    async create(meeting) {
      const doc = await MeetingModel.create(meeting);
      return toPlain(doc);
    },
    async updateOwned(id, ownerId, patch) {
      const safe = stripIdentity(patch);
      delete safe.id;
      delete safe.ownerId;
      const doc = await MeetingModel.findOneAndUpdate(
        { id, ownerId },
        { $set: safe },
        { new: true }
      );
      return toPlain(doc);
    },
    async removeOwned(id, ownerId) {
      const result = await MeetingModel.deleteOne({ id, ownerId });
      return result.deletedCount > 0;
    },
    async countByOwner(ownerId) {
      return MeetingModel.countDocuments({ ownerId });
    },
    async count() {
      return MeetingModel.countDocuments();
    },
  };
}

export async function createMeetingsStore() {
  const db = await ensureDb();
  if (db.mode === "mongodb") {
    console.log("[meetings-store] 使用 MongoDB 持久化（依 ownerId 隔離）");
    return createMongoStore();
  }
  console.warn("[meetings-store] 使用本機 JSON（data/meetings.json）");
  return createJsonStore();
}

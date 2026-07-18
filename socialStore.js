import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { ensureDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "social.json");

const uid = () =>
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

// ── Mongoose models ─────────────────────────────────────────────────────────
const friendshipSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    requesterId: { type: String, required: true, index: true },
    addresseeId: { type: String, required: true, index: true },
    status: { type: String, default: "pending" }, // pending | accepted
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);
const inviteSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    meetingId: { type: String, required: true, index: true },
    fromUserId: { type: String, required: true, index: true },
    toUserId: { type: String, required: true, index: true },
    status: { type: String, default: "pending" }, // pending | accepted | declined
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

const Friendship = mongoose.models.Friendship || mongoose.model("Friendship", friendshipSchema);
const Invite = mongoose.models.Invite || mongoose.model("Invite", inviteSchema);

const pairMatch = (f, a, b) =>
  (f.requesterId === a && f.addresseeId === b) || (f.requesterId === b && f.addresseeId === a);

// ── JSON store（本機開發）────────────────────────────────────────────────────
function createJsonSocial() {
  let cache = null;

  async function ensureLoaded() {
    if (cache) return cache;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const raw = await fs.readFile(DATA_FILE, "utf8");
      cache = JSON.parse(raw);
    } catch {
      cache = { friendships: [], invites: [] };
    }
    if (!cache.friendships) cache.friendships = [];
    if (!cache.invites) cache.invites = [];
    return cache;
  }
  async function persist() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(cache, null, 2), "utf8");
  }

  return {
    mode: "json",
    async getFriendship(a, b) {
      const c = await ensureLoaded();
      return c.friendships.find((f) => pairMatch(f, a, b)) || null;
    },
    async sendFriendRequest(fromId, toId) {
      const c = await ensureLoaded();
      const fr = { id: uid(), requesterId: fromId, addresseeId: toId, status: "pending", createdAt: Date.now() };
      c.friendships.push(fr);
      await persist();
      return fr;
    },
    async getRequestById(id) {
      const c = await ensureLoaded();
      return c.friendships.find((f) => f.id === id) || null;
    },
    async respondFriendRequest(id, userId, accept) {
      const c = await ensureLoaded();
      const fr = c.friendships.find((f) => f.id === id);
      if (!fr || fr.addresseeId !== userId || fr.status !== "pending") return null;
      if (accept) {
        fr.status = "accepted";
      } else {
        c.friendships = c.friendships.filter((f) => f.id !== id);
      }
      await persist();
      return fr;
    },
    async acceptFriendship(fr) {
      const c = await ensureLoaded();
      const found = c.friendships.find((f) => f.id === fr.id);
      if (found) found.status = "accepted";
      await persist();
      return found;
    },
    async listAcceptedFriendIds(userId) {
      const c = await ensureLoaded();
      const ids = c.friendships
        .filter((f) => f.status === "accepted" && (f.requesterId === userId || f.addresseeId === userId))
        .map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
      return [...new Set(ids)];
    },
    async listIncomingFriendRequests(userId) {
      const c = await ensureLoaded();
      return c.friendships.filter((f) => f.status === "pending" && f.addresseeId === userId);
    },
    async listOutgoingFriendRequests(userId) {
      const c = await ensureLoaded();
      return c.friendships.filter((f) => f.status === "pending" && f.requesterId === userId);
    },
    async unfriend(userId, otherId) {
      const c = await ensureLoaded();
      const before = c.friendships.length;
      c.friendships = c.friendships.filter((f) => !pairMatch(f, userId, otherId));
      await persist();
      return c.friendships.length < before;
    },

    async findPendingInvite(meetingId, toUserId) {
      const c = await ensureLoaded();
      return c.invites.find((i) => i.meetingId === meetingId && i.toUserId === toUserId && i.status === "pending") || null;
    },
    async createInvite(meetingId, fromUserId, toUserId) {
      const c = await ensureLoaded();
      const inv = { id: uid(), meetingId, fromUserId, toUserId, status: "pending", createdAt: Date.now() };
      c.invites.push(inv);
      await persist();
      return inv;
    },
    async getInviteById(id) {
      const c = await ensureLoaded();
      return c.invites.find((i) => i.id === id) || null;
    },
    async listIncomingInvites(userId) {
      const c = await ensureLoaded();
      return c.invites.filter((i) => i.toUserId === userId && i.status === "pending");
    },
    async respondInvite(id, userId, accept) {
      const c = await ensureLoaded();
      const inv = c.invites.find((i) => i.id === id);
      if (!inv || inv.toUserId !== userId || inv.status !== "pending") return null;
      inv.status = accept ? "accepted" : "declined";
      await persist();
      return inv;
    },
  };
}

// ── Mongo store ──────────────────────────────────────────────────────────────
function createMongoSocial() {
  return {
    mode: "mongodb",
    async getFriendship(a, b) {
      return Friendship.findOne({
        $or: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      }).lean();
    },
    async sendFriendRequest(fromId, toId) {
      const fr = await Friendship.create({ id: uid(), requesterId: fromId, addresseeId: toId, status: "pending" });
      return fr.toObject();
    },
    async getRequestById(id) {
      return Friendship.findOne({ id }).lean();
    },
    async respondFriendRequest(id, userId, accept) {
      const fr = await Friendship.findOne({ id });
      if (!fr || fr.addresseeId !== userId || fr.status !== "pending") return null;
      if (accept) {
        fr.status = "accepted";
        await fr.save();
        return fr.toObject();
      }
      await Friendship.deleteOne({ id });
      return { ...fr.toObject(), status: "declined" };
    },
    async acceptFriendship(fr) {
      const updated = await Friendship.findOneAndUpdate({ id: fr.id }, { $set: { status: "accepted" } }, { new: true });
      return updated ? updated.toObject() : null;
    },
    async listAcceptedFriendIds(userId) {
      const docs = await Friendship.find({
        status: "accepted",
        $or: [{ requesterId: userId }, { addresseeId: userId }],
      }).lean();
      return [...new Set(docs.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId)))];
    },
    async listIncomingFriendRequests(userId) {
      return Friendship.find({ status: "pending", addresseeId: userId }).lean();
    },
    async listOutgoingFriendRequests(userId) {
      return Friendship.find({ status: "pending", requesterId: userId }).lean();
    },
    async unfriend(userId, otherId) {
      const r = await Friendship.deleteMany({
        $or: [
          { requesterId: userId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: userId },
        ],
      });
      return r.deletedCount > 0;
    },

    async findPendingInvite(meetingId, toUserId) {
      return Invite.findOne({ meetingId, toUserId, status: "pending" }).lean();
    },
    async createInvite(meetingId, fromUserId, toUserId) {
      const inv = await Invite.create({ id: uid(), meetingId, fromUserId, toUserId, status: "pending" });
      return inv.toObject();
    },
    async getInviteById(id) {
      return Invite.findOne({ id }).lean();
    },
    async listIncomingInvites(userId) {
      return Invite.find({ toUserId: userId, status: "pending" }).lean();
    },
    async respondInvite(id, userId, accept) {
      const inv = await Invite.findOne({ id });
      if (!inv || inv.toUserId !== userId || inv.status !== "pending") return null;
      inv.status = accept ? "accepted" : "declined";
      await inv.save();
      return inv.toObject();
    },
  };
}

export async function createSocialStore() {
  const db = await ensureDb();
  if (db.mode === "mongodb") {
    console.log("[social-store] 好友 / 邀請使用 MongoDB");
    return createMongoSocial();
  }
  console.warn("[social-store] 好友 / 邀請使用本機 JSON（data/social.json）");
  return createJsonSocial();
}

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
    title: { type: String, required: true },
    participants: { type: [String], default: [] },
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
    async getOwned(id, ownerId) {
      const list = await ensureLoaded();
      const m = list.find((x) => x.id === id);
      if (!m || m.ownerId !== ownerId) return null;
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
      const updated = { ...list[idx], ...patch, id, ownerId };
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
    async getOwned(id, ownerId) {
      const doc = await MeetingModel.findOne({ id, ownerId }).lean();
      if (!doc) return null;
      const { _id, ...rest } = doc;
      return rest;
    },
    async create(meeting) {
      const doc = await MeetingModel.create(meeting);
      return toPlain(doc);
    },
    async updateOwned(id, ownerId, patch) {
      const doc = await MeetingModel.findOneAndUpdate(
        { id, ownerId },
        { $set: { ...patch, id, ownerId } },
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

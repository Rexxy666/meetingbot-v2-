/**
 * AI 每日額度：每帳號 / 每裝置各最多 N 次（預設 10）。
 * 任一達上限即拒絕；成功呼叫會同時消耗帳號與裝置各 1 次。
 *
 * 儲存：Firestore → MongoDB → 本機 JSON（與 meetingsStore 同優先序）
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { ensureDb } from "./db.js";
import { getFirestore } from "./firebaseAdmin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "ai-quotas.json");

export const AI_DAILY_LIMIT = Math.max(
  1,
  Math.min(1000, Number(process.env.AI_DAILY_LIMIT) || 10)
);

/** Asia/Taipei 的 YYYY-MM-DD */
export function aiQuotaDayKey(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** 下一個台北午夜（重置時間）的 epoch ms */
export function aiQuotaResetAt(now = Date.now()) {
  const day = aiQuotaDayKey(now);
  // day 是台北日曆日；下一日 00:00+08:00
  const reset = Date.parse(`${day}T00:00:00+08:00`) + 24 * 60 * 60 * 1000;
  return Number.isFinite(reset) ? reset : now + 24 * 60 * 60 * 1000;
}

function normalizeDeviceId(raw) {
  const id = String(raw || "")
    .trim()
    .slice(0, 120);
  if (!id) return "";
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) return "";
  return id;
}

function userKey(userId, day) {
  return `user:${userId}:${day}`;
}

function deviceKey(deviceId, day) {
  return `device:${deviceId}:${day}`;
}

function exceededPayload({ scope, used, limit, resetAt }) {
  const err = new Error(
    scope === "device"
      ? `此裝置今日 AI 額度已用完（${limit} 次／天），請明天再試`
      : `此帳號今日 AI 額度已用完（${limit} 次／天），請明天再試`
  );
  err.status = 429;
  err.code = "AI_QUOTA_EXCEEDED";
  err.payload = {
    error: err.message,
    code: "AI_QUOTA_EXCEEDED",
    scope,
    limit,
    used,
    remaining: 0,
    resetAt,
  };
  return err;
}

function createMemoryJsonStore() {
  let cache = null;
  let writeChain = Promise.resolve();

  async function load() {
    if (cache) return cache;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const raw = await fs.readFile(DATA_FILE, "utf8");
      cache = JSON.parse(raw);
      if (!cache || typeof cache !== "object") cache = {};
    } catch {
      cache = {};
    }
    return cache;
  }

  function scheduleSave() {
    writeChain = writeChain.then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(DATA_FILE, JSON.stringify(cache || {}, null, 2), "utf8");
    });
    return writeChain;
  }

  async function getCount(key, day) {
    const data = await load();
    const row = data[key];
    if (!row || row.day !== day) return 0;
    return Math.max(0, Number(row.count) || 0);
  }

  async function setCount(key, day, count) {
    const data = await load();
    data[key] = { day, count, updatedAt: Date.now() };
    cache = data;
    await scheduleSave();
  }

  return {
    mode: "json",
    getCount,
    setCount,
  };
}

function createMongoQuotaStore() {
  const schema = new mongoose.Schema(
    {
      key: { type: String, required: true, unique: true, index: true },
      day: { type: String, required: true },
      count: { type: Number, default: 0 },
      updatedAt: { type: Number, default: () => Date.now() },
    },
    { versionKey: false }
  );
  const Model = mongoose.models.AiQuota || mongoose.model("AiQuota", schema);

  return {
    mode: "mongodb",
    async getCount(key, day) {
      const doc = await Model.findOne({ key }).lean();
      if (!doc || doc.day !== day) return 0;
      return Math.max(0, Number(doc.count) || 0);
    },
    async setCount(key, day, count) {
      await Model.findOneAndUpdate(
        { key },
        { $set: { day, count, updatedAt: Date.now() } },
        { upsert: true, new: true }
      );
    },
  };
}

function createFirestoreQuotaStore() {
  const db = getFirestore();
  const col = db.collection("aiQuotas");

  return {
    mode: "firestore",
    async getCount(key, day) {
      const snap = await col.doc(key).get();
      if (!snap.exists) return 0;
      const data = snap.data() || {};
      if (data.day !== day) return 0;
      return Math.max(0, Number(data.count) || 0);
    },
    async setCount(key, day, count) {
      await col.doc(key).set(
        { day, count, updatedAt: Date.now() },
        { merge: true }
      );
    },
  };
}

/**
 * @returns {Promise<{
 *   mode: string,
 *   getStatus: Function,
 *   consume: Function,
 * }>}
 */
export async function createAiQuotaStore() {
  const db = await ensureDb();
  let backend;
  if (db.mode === "firestore") {
    backend = createFirestoreQuotaStore();
    console.log("[ai-quota] 使用 Firestore，每日上限", AI_DAILY_LIMIT);
  } else if (db.mode === "mongodb") {
    backend = createMongoQuotaStore();
    console.log("[ai-quota] 使用 MongoDB，每日上限", AI_DAILY_LIMIT);
  } else {
    backend = createMemoryJsonStore();
    console.warn("[ai-quota] 使用本機 JSON，每日上限", AI_DAILY_LIMIT);
  }

  async function getStatus({ userId, deviceId }) {
    const day = aiQuotaDayKey();
    const resetAt = aiQuotaResetAt();
    const uKey = userKey(userId, day);
    const dId = normalizeDeviceId(deviceId);
    const userUsed = await backend.getCount(uKey, day);
    const deviceUsed = dId ? await backend.getCount(deviceKey(dId, day), day) : 0;
    const userRemaining = Math.max(0, AI_DAILY_LIMIT - userUsed);
    const deviceRemaining = dId
      ? Math.max(0, AI_DAILY_LIMIT - deviceUsed)
      : AI_DAILY_LIMIT;
    const remaining = Math.min(userRemaining, deviceRemaining);
    return {
      limit: AI_DAILY_LIMIT,
      day,
      resetAt,
      user: { used: userUsed, remaining: userRemaining },
      device: dId
        ? { id: dId, used: deviceUsed, remaining: deviceRemaining }
        : { id: null, used: 0, remaining: AI_DAILY_LIMIT },
      remaining,
    };
  }

  async function consume({ userId, deviceId }) {
    const day = aiQuotaDayKey();
    const resetAt = aiQuotaResetAt();
    const uKey = userKey(userId, day);
    const dId = normalizeDeviceId(deviceId);
    const dKey = dId ? deviceKey(dId, day) : null;

    const userUsed = await backend.getCount(uKey, day);
    if (userUsed >= AI_DAILY_LIMIT) {
      throw exceededPayload({
        scope: "user",
        used: userUsed,
        limit: AI_DAILY_LIMIT,
        resetAt,
      });
    }

    let deviceUsed = 0;
    if (dKey) {
      deviceUsed = await backend.getCount(dKey, day);
      if (deviceUsed >= AI_DAILY_LIMIT) {
        throw exceededPayload({
          scope: "device",
          used: deviceUsed,
          limit: AI_DAILY_LIMIT,
          resetAt,
        });
      }
    }

    const nextUser = userUsed + 1;
    await backend.setCount(uKey, day, nextUser);
    let nextDevice = deviceUsed;
    if (dKey) {
      nextDevice = deviceUsed + 1;
      await backend.setCount(dKey, day, nextDevice);
    }

    const remaining = Math.min(
      Math.max(0, AI_DAILY_LIMIT - nextUser),
      dKey ? Math.max(0, AI_DAILY_LIMIT - nextDevice) : AI_DAILY_LIMIT
    );

    return {
      ok: true,
      limit: AI_DAILY_LIMIT,
      day,
      resetAt,
      remaining,
      user: { used: nextUser, remaining: Math.max(0, AI_DAILY_LIMIT - nextUser) },
      device: dKey
        ? { id: dId, used: nextDevice, remaining: Math.max(0, AI_DAILY_LIMIT - nextDevice) }
        : { id: null, used: 0, remaining: AI_DAILY_LIMIT },
    };
  }

  return {
    mode: backend.mode,
    limit: AI_DAILY_LIMIT,
    getStatus,
    consume,
  };
}

/** Express：消耗額度；失敗回 429 */
export function requireAiQuota(aiQuota) {
  return async (req, res, next) => {
    try {
      const deviceId =
        req.headers["x-device-id"] ||
        req.headers["x-meetflow-device-id"] ||
        "";
      const result = await aiQuota.consume({
        userId: req.user.id,
        deviceId,
      });
      req.aiQuota = result;
      res.setHeader("X-AI-Quota-Limit", String(result.limit));
      res.setHeader("X-AI-Quota-Remaining", String(result.remaining));
      res.setHeader("X-AI-Quota-Reset-At", String(result.resetAt));
      next();
    } catch (e) {
      if (e?.status === 429 && e.payload) {
        res.setHeader("X-AI-Quota-Limit", String(e.payload.limit));
        res.setHeader("X-AI-Quota-Remaining", "0");
        res.setHeader("X-AI-Quota-Reset-At", String(e.payload.resetAt));
        return res.status(429).json(e.payload);
      }
      next(e);
    }
  };
}

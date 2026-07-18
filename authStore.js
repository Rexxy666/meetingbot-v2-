import bcrypt from "bcryptjs";
import fs from "fs/promises";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { ensureDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const JWT_SECRET = process.env.JWT_SECRET || "meetflow-dev-secret-change-me";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Number, default: () => Date.now() },
  },
  { versionKey: false }
);

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);

const uid = () =>
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
}

/** 依 id／email 去重，避免同一好友在列表出現多次 */
function dedupeUsers(list) {
  if (!Array.isArray(list)) return [];
  const byId = new Map();
  const byEmail = new Map();
  const out = [];
  for (const u of list) {
    if (!u?.id) continue;
    const email = String(u.email || "").trim().toLowerCase();
    if (byId.has(u.id)) continue;
    if (email && byEmail.has(email)) continue;
    byId.set(u.id, true);
    if (email) byEmail.set(email, true);
    out.push(u);
  }
  return out;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function createJsonAuth() {
  let cache = null;
  let ensureChain = Promise.resolve();

  async function load() {
    if (cache) return cache;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const raw = JSON.parse(await fs.readFile(USERS_FILE, "utf8"));
      const cleaned = dedupeUsers(Array.isArray(raw) ? raw : []);
      cache = cleaned;
      if (Array.isArray(raw) && cleaned.length !== raw.length) {
        await fs.writeFile(USERS_FILE, JSON.stringify(cleaned, null, 2), "utf8");
        console.warn(`[auth-store] 已清除重複使用者：${raw.length} → ${cleaned.length}`);
      }
    } catch {
      cache = [];
    }
    return cache;
  }

  async function save() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    cache = dedupeUsers(cache || []);
    await fs.writeFile(USERS_FILE, JSON.stringify(cache, null, 2), "utf8");
  }

  return {
    mode: "json",
    async register({ email, password, name }) {
      const users = await load();
      const normalized = String(email || "").trim().toLowerCase();
      if (!normalized || !password || !name?.trim()) {
        throw Object.assign(new Error("請填寫姓名、Email 與密碼"), { status: 400 });
      }
      if (password.length < 6) {
        throw Object.assign(new Error("密碼至少 6 碼"), { status: 400 });
      }
      if (users.some((u) => u.email === normalized)) {
        throw Object.assign(new Error("此 Email 已被註冊"), { status: 409 });
      }

      const user = {
        id: uid(),
        email: normalized,
        name: name.trim(),
        passwordHash: await bcrypt.hash(password, 10),
        createdAt: Date.now(),
      };
      users.push(user);
      await save();
      const token = signToken(user);
      return { user: publicUser(user), token };
    },
    async login({ email, password }) {
      const users = await load();
      const normalized = String(email || "").trim().toLowerCase();
      if (!normalized || !password) {
        throw Object.assign(new Error("請填寫 Email 與密碼"), { status: 400 });
      }
      const user = users.find((u) => u.email === normalized);
      if (!user) {
        throw Object.assign(new Error("此 Email 尚未註冊，請先建立帳號"), { status: 404 });
      }
      const hash = user.passwordHash || user.password;
      if (!hash || !(await bcrypt.compare(password || "", hash))) {
        // 相容極舊的明文欄位（若曾誤存 password 明文）
        if (user.password && user.password === password) {
          user.passwordHash = await bcrypt.hash(password, 10);
          delete user.password;
          await save();
        } else if (user.recoveredAt) {
          // users.json 遺失後由 JWT 還原的帳號：下次登入視為重設密碼
          user.passwordHash = await bcrypt.hash(password, 10);
          delete user.recoveredAt;
          await save();
          console.warn(`[auth-store] 已為還原帳號重設密碼 → ${normalized}`);
        } else {
          throw Object.assign(new Error("密碼錯誤"), { status: 401 });
        }
      }
      return { user: publicUser(user), token: signToken(user) };
    },

    async updateProfile(id, { name }) {
      const users = await load();
      const user = users.find((u) => u.id === id);
      if (!user) throw Object.assign(new Error("找不到使用者"), { status: 404 });
      if (name?.trim()) user.name = name.trim();
      await save();
      return publicUser(user);
    },
    async getById(id) {
      const users = await load();
      return publicUser(users.find((u) => u.id === id));
    },
    /**
     * 本機 JSON 防呆：JWT 仍有效但 users.json 遺失時，從 token 還原帳號列。
     * 串行執行，避免並發請求把同一人寫入多次。
     */
    async ensureFromToken(payload) {
      if (!payload?.sub || !payload?.email) return null;
      const run = async () => {
        const users = await load();
        const existingById = users.find((u) => u.id === payload.sub);
        if (existingById) return publicUser(existingById);
        const email = String(payload.email).trim().toLowerCase();
        const existingByEmail = users.find((u) => u.email === email);
        if (existingByEmail) return publicUser(existingByEmail);
        const user = {
          id: payload.sub,
          email,
          name: String(payload.name || "使用者").trim() || "使用者",
          passwordHash: await bcrypt.hash(`recovered-${uid()}`, 10),
          createdAt: Number(payload.iat ? payload.iat * 1000 : Date.now()),
          recoveredAt: Date.now(),
        };
        users.push(user);
        await save();
        console.warn(`[auth-store] 已從 JWT 還原使用者 → ${email}`);
        return publicUser(user);
      };
      const next = ensureChain.then(run, run);
      ensureChain = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
    async searchUsers({ query, excludeId, limit = 10 }) {
      const users = await load();
      const q = String(query || "").trim().toLowerCase();
      if (!q) return [];
      return dedupeUsers(
        users.filter((u) => u.id !== excludeId && (u.email === q || u.name.toLowerCase().includes(q)))
      )
        .slice(0, limit)
        .map(publicUser);
    },
    async getPublicByIds(ids) {
      const users = await load();
      const set = new Set(ids || []);
      return dedupeUsers(users.filter((u) => set.has(u.id))).map(publicUser);
    },
  };
}

function createMongoAuth() {
  return {
    mode: "mongodb",
    async register({ email, password, name }) {
      const normalized = String(email || "").trim().toLowerCase();
      if (!normalized || !password || !name?.trim()) {
        throw Object.assign(new Error("請填寫姓名、Email 與密碼"), { status: 400 });
      }
      if (password.length < 6) {
        throw Object.assign(new Error("密碼至少 6 碼"), { status: 400 });
      }
      const exists = await UserModel.findOne({ email: normalized }).lean();
      if (exists) {
        throw Object.assign(new Error("此 Email 已被註冊"), { status: 409 });
      }

      const user = await UserModel.create({
        id: uid(),
        email: normalized,
        name: name.trim(),
        passwordHash: await bcrypt.hash(password, 10),
        createdAt: Date.now(),
      });
      const plain = { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
      return { user: plain, token: signToken(plain) };
    },
    async login({ email, password }) {
      const normalized = String(email || "").trim().toLowerCase();
      if (!normalized || !password) {
        throw Object.assign(new Error("請填寫 Email 與密碼"), { status: 400 });
      }
      const user = await UserModel.findOne({ email: normalized });
      if (!user) {
        throw Object.assign(new Error("此 Email 尚未註冊，請先建立帳號"), { status: 404 });
      }
      if (!(await bcrypt.compare(password || "", user.passwordHash))) {
        throw Object.assign(new Error("密碼錯誤"), { status: 401 });
      }
      const plain = { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
      return { user: plain, token: signToken(plain) };
    },

    async updateProfile(id, { name }) {
      const user = await UserModel.findOne({ id });
      if (!user) throw Object.assign(new Error("找不到使用者"), { status: 404 });
      if (name?.trim()) {
        user.name = name.trim();
        await user.save();
      }
      return publicUser(user);
    },
    async getById(id) {
      const user = await UserModel.findOne({ id }).lean();
      return publicUser(user);
    },
    async searchUsers({ query, excludeId, limit = 10 }) {
      const q = String(query || "").trim().toLowerCase();
      if (!q) return [];
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const docs = await UserModel.find({
        id: { $ne: excludeId },
        $or: [{ email: q }, { name: rx }],
      })
        .limit(limit)
        .lean();
      return docs.map(publicUser);
    },
    async getPublicByIds(ids) {
      const docs = await UserModel.find({ id: { $in: ids || [] } }).lean();
      return docs.map(publicUser);
    },
  };
}

export async function createAuthStore() {
  const db = await ensureDb();
  if (db.mode === "mongodb") {
    console.log("[auth-store] 使用者資料使用 MongoDB");
    return createMongoAuth();
  }
  console.warn("[auth-store] 使用者資料使用本機 JSON（data/users.json）");
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const list = JSON.parse(raw);
    const n = Array.isArray(list) ? list.length : 0;
    console.warn(`[auth-store] data/users.json · ${n} 位使用者`);
  } catch {
    await fs.writeFile(USERS_FILE, "[]", "utf8");
    console.warn("[auth-store] 已建立空的 data/users.json");
  }
  return createJsonAuth();
}

/** Express middleware：驗證 Bearer token，寫入 req.user */
export function authRequired(authStore) {
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) {
        return res.status(401).json({ error: "請先登入" });
      }
      const payload = verifyToken(token);
      let user = await authStore.getById(payload.sub);
      if (!user && typeof authStore.ensureFromToken === "function") {
        user = await authStore.ensureFromToken(payload);
      }
      if (!user) {
        return res.status(401).json({ error: "登入已失效，請重新登入" });
      }
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: "登入已失效，請重新登入" });
    }
  };
}

export function socketAuth(authStore) {
  return async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error("請先登入"));
      const payload = verifyToken(token);
      let user = await authStore.getById(payload.sub);
      if (!user && typeof authStore.ensureFromToken === "function") {
        user = await authStore.ensureFromToken(payload);
      }
      if (!user) return next(new Error("登入已失效"));
      socket.user = user;
      next();
    } catch {
      next(new Error("登入已失效"));
    }
  };
}

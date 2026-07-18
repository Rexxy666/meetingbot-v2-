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

  async function load() {
    if (cache) return cache;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      cache = JSON.parse(await fs.readFile(USERS_FILE, "utf8"));
      if (!Array.isArray(cache)) cache = [];
    } catch {
      cache = [];
    }
    return cache;
  }

  async function save() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(USERS_FILE, JSON.stringify(cache || [], null, 2), "utf8");
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
      const user = users.find((u) => u.email === normalized);
      if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
        throw Object.assign(new Error("Email 或密碼錯誤"), { status: 401 });
      }
      return { user: publicUser(user), token: signToken(user) };
    },
    async getById(id) {
      const users = await load();
      return publicUser(users.find((u) => u.id === id));
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
      const user = await UserModel.findOne({ email: normalized });
      if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
        throw Object.assign(new Error("Email 或密碼錯誤"), { status: 401 });
      }
      const plain = { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
      return { user: plain, token: signToken(plain) };
    },
    async getById(id) {
      const user = await UserModel.findOne({ id }).lean();
      return publicUser(user);
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
      const user = await authStore.getById(payload.sub);
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
      const user = await authStore.getById(payload.sub);
      if (!user) return next(new Error("登入已失效"));
      socket.user = user;
      next();
    } catch {
      next(new Error("登入已失效"));
    }
  };
}

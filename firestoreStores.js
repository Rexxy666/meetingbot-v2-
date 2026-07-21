import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getFirestore } from "./firebaseAdmin.js";

const JWT_SECRET = process.env.JWT_SECRET || "meetflow-dev-secret-change-me";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

const uid = () =>
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
  });
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt,
    authProvider: u.authProvider || "password",
  };
}

function stripIdentity(patch = {}) {
  const next = { ...patch };
  delete next.id;
  delete next.ownerId;
  delete next.memberIds;
  delete next.createdAt;
  return next;
}

const pairMatch = (f, a, b) =>
  (f.requesterId === a && f.addresseeId === b) || (f.requesterId === b && f.addresseeId === a);

/** 共用：用 Google / Firebase 身分 upsert 使用者並簽發 JWT */
export async function upsertGoogleUser(storeOps, { firebaseUid, email, name }) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !firebaseUid) {
    throw Object.assign(new Error("Google 登入資料不完整"), { status: 400 });
  }
  const displayName = String(name || "").trim() || normalized.split("@")[0] || "使用者";

  let user = await storeOps.findByFirebaseUid(firebaseUid);
  if (!user) user = await storeOps.findByEmail(normalized);

  if (user) {
    const patched = await storeOps.saveUser({
      ...user,
      email: normalized,
      name: displayName || user.name,
      firebaseUid,
      authProvider: user.authProvider === "password" ? "password+google" : "google",
    });
    const plain = publicUser(patched);
    return { user: plain, token: signToken(plain) };
  }

  const created = await storeOps.saveUser({
    id: uid(),
    email: normalized,
    name: displayName,
    passwordHash: "",
    firebaseUid,
    authProvider: "google",
    createdAt: Date.now(),
  });
  const plain = publicUser(created);
  return { user: plain, token: signToken(plain) };
}

export function createFirestoreAuth() {
  const db = getFirestore();
  const users = db.collection("users");

  async function getDocById(id) {
    const snap = await users.doc(id).get();
    return snap.exists ? snap.data() : null;
  }

  async function findByEmail(email) {
    const q = await users.where("email", "==", email).limit(1).get();
    return q.empty ? null : q.docs[0].data();
  }

  async function findByFirebaseUid(firebaseUid) {
    const q = await users.where("firebaseUid", "==", firebaseUid).limit(1).get();
    return q.empty ? null : q.docs[0].data();
  }

  async function saveUser(user) {
    await users.doc(user.id).set(user, { merge: true });
    return user;
  }

  const ops = { findByEmail, findByFirebaseUid, saveUser };

  return {
    mode: "firestore",
    async register({ email, password, name }) {
      const normalized = String(email || "").trim().toLowerCase();
      if (!normalized || !password || !name?.trim()) {
        throw Object.assign(new Error("請填寫姓名、Email 與密碼"), { status: 400 });
      }
      if (password.length < 6) {
        throw Object.assign(new Error("密碼至少 6 碼"), { status: 400 });
      }
      if (await findByEmail(normalized)) {
        throw Object.assign(new Error("此 Email 已被註冊"), { status: 409 });
      }
      const user = {
        id: uid(),
        email: normalized,
        name: name.trim(),
        passwordHash: await bcrypt.hash(password, 10),
        authProvider: "password",
        createdAt: Date.now(),
      };
      await saveUser(user);
      const plain = publicUser(user);
      return { user: plain, token: signToken(plain) };
    },
    async login({ email, password }) {
      const normalized = String(email || "").trim().toLowerCase();
      const user = await findByEmail(normalized);
      if (!user) {
        throw Object.assign(new Error("此 Email 尚未註冊，請先建立帳號"), { status: 404 });
      }
      if (!user.passwordHash) {
        throw Object.assign(new Error("此帳號請改用 Google 登入"), { status: 401 });
      }
      if (!(await bcrypt.compare(password || "", user.passwordHash))) {
        throw Object.assign(new Error("密碼錯誤"), { status: 401 });
      }
      const plain = publicUser(user);
      return { user: plain, token: signToken(plain) };
    },
    async loginWithGoogle(payload) {
      return upsertGoogleUser(ops, payload);
    },
    async updateProfile(id, { name }) {
      const user = await getDocById(id);
      if (!user) throw Object.assign(new Error("找不到使用者"), { status: 404 });
      if (name?.trim()) {
        user.name = name.trim();
        await saveUser(user);
      }
      return publicUser(user);
    },
    async getById(id) {
      return publicUser(await getDocById(id));
    },
    async searchUsers({ query, excludeId, limit = 10 }) {
      const q = String(query || "").trim().toLowerCase();
      if (!q) return [];
      // Firestore 無全能模糊搜尋：先取樣後過濾（小專案夠用）
      const snap = await users.limit(80).get();
      return snap.docs
        .map((d) => d.data())
        .filter(
          (u) =>
            u.id !== excludeId &&
            (u.email === q || String(u.name || "").toLowerCase().includes(q))
        )
        .slice(0, limit)
        .map(publicUser);
    },
    async getPublicByIds(ids) {
      const list = [];
      for (const id of ids || []) {
        const u = await getDocById(id);
        if (u) list.push(publicUser(u));
      }
      return list;
    },
  };
}

export function createFirestoreMeetings() {
  const db = getFirestore();
  const col = db.collection("meetings");

  async function getById(id) {
    const snap = await col.doc(id).get();
    return snap.exists ? snap.data() : null;
  }

  return {
    mode: "firestore",
    async listByOwner(ownerId) {
      const snap = await col.where("ownerId", "==", ownerId).get();
      return snap.docs.map((d) => d.data()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    async listForUser(userId) {
      const [owned, member] = await Promise.all([
        col.where("ownerId", "==", userId).get(),
        col.where("memberIds", "array-contains", userId).get(),
      ]);
      const map = new Map();
      [...owned.docs, ...member.docs].forEach((d) => map.set(d.id, d.data()));
      return [...map.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    async getOwned(id, ownerId) {
      const m = await getById(id);
      if (!m || m.ownerId !== ownerId) return null;
      return m;
    },
    async getAccessible(id, userId) {
      const m = await getById(id);
      if (!m) return null;
      if (m.ownerId !== userId && !(m.memberIds || []).includes(userId)) return null;
      return m;
    },
    async getByIdAny(id) {
      return getById(id);
    },
    async getByCode(code) {
      const c = String(code || "").replace(/\s|-/g, "");
      if (!c) return null;
      const snap = await col.where("code", "==", c).limit(1).get();
      return snap.empty ? null : snap.docs[0].data();
    },
    async resolveRef(ref) {
      const r = String(ref || "").trim();
      if (!r) return null;
      return (await this.getByIdAny(r)) || (await this.getByCode(r));
    },
    async updateAccessible(id, userId, patch) {
      const m = await this.getAccessible(id, userId);
      if (!m) return null;
      const updated = {
        ...m,
        ...stripIdentity(patch),
        id,
        ownerId: m.ownerId,
        memberIds: m.memberIds || [],
      };
      await col.doc(id).set(updated);
      return updated;
    },
    async addMember(id, userId, userName, userEmail) {
      const m = await getById(id);
      if (!m) return null;
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
      const seen = new Set();
      m.inviteRoster = m.inviteRoster.filter((p) => {
        const key = String(p?.name || "").trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      m.participants = [...new Set((m.participants || []).map((n) => String(n || "").trim()).filter(Boolean))];
      await col.doc(id).set(m);
      return m;
    },
    async removeMember(id, { userId = null, userName = null } = {}) {
      const m = await getById(id);
      if (!m) return null;
      const nameKey = String(userName || "").trim().toLowerCase();
      if (userId) m.memberIds = (m.memberIds || []).filter((x) => x !== userId);
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
      await col.doc(id).set(m);
      return m;
    },
    async create(meeting) {
      await col.doc(meeting.id).set(meeting);
      return meeting;
    },
    async updateOwned(id, ownerId, patch) {
      const m = await this.getOwned(id, ownerId);
      if (!m) return null;
      const updated = { ...m, ...stripIdentity(patch), id, ownerId };
      await col.doc(id).set(updated);
      return updated;
    },
    async removeOwned(id, ownerId) {
      const m = await this.getOwned(id, ownerId);
      if (!m) return false;
      await col.doc(id).delete();
      return true;
    },
    async countByOwner(ownerId) {
      const snap = await col.where("ownerId", "==", ownerId).get();
      return snap.size;
    },
    async count() {
      const snap = await col.limit(500).get();
      return snap.size;
    },
  };
}

export function createFirestoreSocial() {
  const db = getFirestore();
  const friendships = db.collection("friendships");
  const invites = db.collection("invites");

  return {
    mode: "firestore",
    async getFriendship(a, b) {
      const snap = await friendships.where("requesterId", "in", [a, b]).limit(20).get();
      return snap.docs.map((d) => d.data()).find((f) => pairMatch(f, a, b)) || null;
    },
    async sendFriendRequest(fromId, toId) {
      const fr = {
        id: uid(),
        requesterId: fromId,
        addresseeId: toId,
        status: "pending",
        createdAt: Date.now(),
      };
      await friendships.doc(fr.id).set(fr);
      return fr;
    },
    async getRequestById(id) {
      const snap = await friendships.doc(id).get();
      return snap.exists ? snap.data() : null;
    },
    async respondFriendRequest(id, userId, accept) {
      const fr = await this.getRequestById(id);
      if (!fr || fr.addresseeId !== userId || fr.status !== "pending") return null;
      if (accept) {
        fr.status = "accepted";
        await friendships.doc(id).set(fr);
      } else {
        await friendships.doc(id).delete();
      }
      return fr;
    },
    async acceptFriendship(fr) {
      const found = await this.getRequestById(fr.id);
      if (found) {
        found.status = "accepted";
        await friendships.doc(fr.id).set(found);
      }
      return found;
    },
    async listAcceptedFriendIds(userId) {
      const [a, b] = await Promise.all([
        friendships.where("requesterId", "==", userId).where("status", "==", "accepted").get(),
        friendships.where("addresseeId", "==", userId).where("status", "==", "accepted").get(),
      ]);
      const ids = new Set();
      a.docs.forEach((d) => ids.add(d.data().addresseeId));
      b.docs.forEach((d) => ids.add(d.data().requesterId));
      return [...ids];
    },
    async listIncomingFriendRequests(userId) {
      const snap = await friendships
        .where("addresseeId", "==", userId)
        .where("status", "==", "pending")
        .get();
      return snap.docs.map((d) => d.data());
    },
    async listOutgoingFriendRequests(userId) {
      const snap = await friendships
        .where("requesterId", "==", userId)
        .where("status", "==", "pending")
        .get();
      return snap.docs.map((d) => d.data());
    },
    async unfriend(userId, otherId) {
      const fr = await this.getFriendship(userId, otherId);
      if (!fr) return false;
      await friendships.doc(fr.id).delete();
      return true;
    },
    async findPendingInvite(meetingId, toUserId) {
      const snap = await invites
        .where("meetingId", "==", meetingId)
        .where("toUserId", "==", toUserId)
        .where("status", "==", "pending")
        .limit(1)
        .get();
      return snap.empty ? null : snap.docs[0].data();
    },
    async createInvite(meetingId, fromUserId, toUserId) {
      const inv = {
        id: uid(),
        meetingId,
        fromUserId,
        toUserId,
        status: "pending",
        createdAt: Date.now(),
      };
      await invites.doc(inv.id).set(inv);
      return inv;
    },
    async getInviteById(id) {
      const snap = await invites.doc(id).get();
      return snap.exists ? snap.data() : null;
    },
    async listIncomingInvites(userId) {
      const snap = await invites
        .where("toUserId", "==", userId)
        .where("status", "==", "pending")
        .get();
      return snap.docs.map((d) => d.data());
    },
    async respondInvite(id, userId, accept) {
      const inv = await this.getInviteById(id);
      if (!inv || inv.toUserId !== userId || inv.status !== "pending") return null;
      inv.status = accept ? "accepted" : "declined";
      await invites.doc(id).set(inv);
      return inv;
    },
  };
}

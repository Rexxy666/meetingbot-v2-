import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore as getFs } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage as getAdminStorage } from "firebase-admin/storage";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

let app = null;

function loadServiceAccountFromEnv() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    return JSON.parse(rawJson);
  }
  const filePath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (filePath) {
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (fs.existsSync(abs)) {
      return JSON.parse(fs.readFileSync(abs, "utf8"));
    }
    console.warn("[firebase-admin] 找不到金鑰檔:", abs);
  }
  return null;
}

function resolveStorageBucket(cred) {
  return (
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() ||
    (cred?.project_id ? `${cred.project_id}.appspot.com` : "") ||
    (process.env.FIREBASE_PROJECT_ID?.trim()
      ? `${process.env.FIREBASE_PROJECT_ID.trim()}.appspot.com`
      : "")
  );
}

/**
 * 後端 Firebase Admin（Firestore + Auth + Storage）
 * 憑證擇一：
 * - FIREBASE_SERVICE_ACCOUNT_JSON（整段 JSON，Render 建議）
 * - GOOGLE_APPLICATION_CREDENTIALS（本機金鑰檔路徑）
 */
export function initFirebaseAdmin() {
  if (app) return app;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  let cred = null;
  try {
    cred = loadServiceAccountFromEnv();
  } catch (e) {
    console.error("[firebase-admin] 讀取服務帳戶失敗:", e.message);
  }

  if (!projectId && !cred) {
    return null;
  }

  try {
    const existing = getApps();
    if (existing.length) {
      app = existing[0];
      return app;
    }

    const storageBucket = resolveStorageBucket(cred);

    if (cred) {
      app = initializeApp({
        credential: cert(cred),
        projectId: projectId || cred.project_id,
        ...(storageBucket ? { storageBucket } : {}),
      });
    } else {
      app = initializeApp({
        credential: applicationDefault(),
        ...(projectId ? { projectId } : {}),
        ...(storageBucket ? { storageBucket } : {}),
      });
    }
    console.log("[firebase-admin] 已初始化", app.options.projectId || "");
    return app;
  } catch (e) {
    console.error("[firebase-admin] 初始化失敗:", e.message);
    return null;
  }
}

export function getFirestore() {
  const a = initFirebaseAdmin();
  if (!a) return null;
  return getFs();
}

export async function verifyFirebaseIdToken(idToken) {
  const a = initFirebaseAdmin();
  if (!a) {
    throw Object.assign(new Error("後端尚未設定 Firebase Admin"), { status: 503 });
  }
  return getAuth().verifyIdToken(String(idToken || ""));
}

export function isFirebaseAdminReady() {
  return Boolean(initFirebaseAdmin());
}

/**
 * 以 Admin SDK 上傳頭像並回傳可公開讀取的 download URL
 */
export async function uploadAvatarBuffer(userId, buffer, contentType) {
  const a = initFirebaseAdmin();
  if (!a) {
    throw Object.assign(new Error("後端尚未設定 Firebase Admin / Storage"), { status: 503 });
  }
  const bucket = getAdminStorage().bucket();
  if (!bucket?.name) {
    throw Object.assign(new Error("未設定 Storage Bucket"), { status: 503 });
  }

  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : contentType === "image/gif"
          ? "gif"
          : "jpg";
  const objectPath = `avatars/${userId}/avatar_${Date.now()}.${ext}`;
  const token = randomUUID();
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
    resumable: false,
  });

  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
}

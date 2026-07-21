import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore as getFs } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
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

/**
 * 後端 Firebase Admin（Firestore + 驗證 Google ID Token）
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

    if (cred) {
      app = initializeApp({
        credential: cert(cred),
        projectId: projectId || cred.project_id,
      });
    } else {
      app = initializeApp({
        credential: applicationDefault(),
        ...(projectId ? { projectId } : {}),
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

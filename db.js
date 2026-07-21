import mongoose from "mongoose";
import { getFirestore, initFirebaseAdmin, isFirebaseAdminReady } from "./firebaseAdmin.js";

let connecting = null;

/**
 * 儲存優先序：
 * 1. Firestore（Firebase Admin 就緒）
 * 2. MongoDB（MONGODB_URI）
 * 3. 本機 JSON
 */
export async function ensureDb() {
  initFirebaseAdmin();
  if (isFirebaseAdminReady() && getFirestore()) {
    return { mode: "firestore", connected: true };
  }

  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return { mode: "json", connected: false };

  if (mongoose.connection.readyState === 1) {
    return { mode: "mongodb", connected: true };
  }

  if (!connecting) {
    connecting = mongoose.connect(uri).then(() => {
      console.log("[db] MongoDB 已連線");
      return { mode: "mongodb", connected: true };
    });
  }

  return connecting;
}

import * as api from "./api.js";
import { getFirebaseAuth, getFirebaseStorage, isFirebaseConfigured } from "./firebase.js";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function extFor(type) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("讀取圖片失敗"));
    reader.readAsDataURL(file);
  });
}

/**
 * 上傳頭像：優先 Firebase Storage（需已 Google 登入），否則走後端 Admin Storage。
 * @returns {Promise<string>} photoURL
 */
export async function uploadAvatarFile(file, userId) {
  if (!file) throw new Error("請選擇圖片");
  if (!ALLOWED.has(file.type)) throw new Error("僅支援 JPG / PNG / WebP / GIF");
  if (file.size > MAX_BYTES) throw new Error("圖片請小於 2MB");

  const auth = isFirebaseConfigured ? getFirebaseAuth() : null;
  const storage = isFirebaseConfigured ? getFirebaseStorage() : null;
  const fbUser = auth?.currentUser;

  if (fbUser && storage && userId) {
    const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
    const { updateProfile } = await import("firebase/auth");
    const path = `avatars/${userId}/avatar_${Date.now()}.${extFor(file.type)}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const photoURL = await getDownloadURL(storageRef);
    try {
      await updateProfile(fbUser, { photoURL });
    } catch {
      /* Firebase Auth 更新失敗不阻斷；後端仍會存 photoURL */
    }
    return photoURL;
  }

  const dataUrl = await readAsDataUrl(file);
  const comma = dataUrl.indexOf(",");
  const dataBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const { photoURL } = await api.uploadAvatar({
    contentType: file.type,
    dataBase64,
  });
  return photoURL;
}

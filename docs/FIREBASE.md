# Firebase 部署（MeetFlow）

目標架構：**前端 = Firebase Hosting**、**資料庫 = Firestore**、**後端 = Render**（Socket / Gemini）、**登入 = Google Auth**。

## 1. Firebase Console

1. 建立專案，啟用 **Authentication → Google**
2. 啟用 **Firestore**（正式環境）
3. 專案設定 → 新增 Web App → 複製設定到前端 `VITE_FIREBASE_*`
4. 專案設定 → 服務帳戶 → 產生新的私密金鑰 → JSON 內容貼到 Render 的 `FIREBASE_SERVICE_ACCOUNT_JSON`
5. 授權網域加入你的 Hosting 網域

## 2. 本機 / Hosting 前端環境

```bash
cp .env.example .env
# 填 VITE_FIREBASE_* 與 VITE_API_URL（Render 後端）
npm run build
# 複製 .firebaserc.example → .firebaserc，改專案 ID
npx firebase login
npx firebase deploy --only hosting
```

## 3. Render 後端環境

必填：

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`（整段服務帳戶 JSON）
- `JWT_SECRET`
- `GEMINI_API_KEY`
- `CLIENT_ORIGIN`（含 `https://xxx.web.app`）

有設定 Firebase Admin 時，儲存會自動走 **Firestore**（users / meetings / friendships / invites）。

## 4. 登入流程

1. 前端 `signInWithPopup(Google)`
2. 取得 Firebase `idToken`
3. `POST /api/auth/google` → 後端 Admin 驗證 → upsert Firestore 使用者 → 回傳既有 JWT
4. Socket / API 繼續用 JWT（不必改會議室即時邏輯）

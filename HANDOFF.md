# MeetFlow（關會）— 專案交接文件 / Handoff

> 給新視窗 agent：讀完這份就能接手。這是一個持續開發中的會議生命週期管理 SaaS。
> 使用者（Rex）常會**自己手改檔案**，所以動任何檔案前務必先 `Read` 最新內容，用**定點編輯**而非整檔覆蓋，避免蓋掉他的自訂邏輯。

---

## 1. 專案位置與基本資訊

- **路徑**：`~/Documents/Claude/Projects/meetingbot(v2)/`（注意資料夾名含括號 `(v2)`；舊的 `meetingbot/` 已棄用）
- **產品名**：MeetFlow（中文「關會」），核心定位＝「會議守門員」：用前端卡片即時判定，擋掉沒目標、沒準備的冗長會議。
- **技術棧**：
  - 前端：**React 18 + Vite 5 + Tailwind CSS 3**，圖示用 **lucide-react**（已安裝）。
  - 後端：**Node + Express + Socket.io + JWT**，資料層 **Mongoose(MongoDB)**，無 Mongo 時自動退回本機 JSON（`data/*.json`）。
- **指令**：
  - `npm run dev` 前端（http://localhost:5173）
  - `npm run dev:server` 後端（PORT 3001）
  - `npm run build` 產出 dist（**每次改完都跑這個驗證，過了才算完成**）
- **線上**：後端部署在 Render（`meetingbot-v2-*.onrender.com`）。**後端有改要 push GitHub 並在 Render 重新 Deploy**；前端純改動只需重新 build 部署。

---

## 2. 前端架構（SPA，非 React Router）

- **沒有用 React Router**。用 `App.jsx` 的 `page` state 切頁（`"dashboard" | "create" | "live" | "post" | "todo" | "friends" | "profile" | "settings"`），`go(page, id)` 導頁、`activeId` 記目前會議。
- **深連結**：支援 `#/live/:meetingId` hash，`App.jsx` 監聽 hashchange → 呼叫 `api.joinMeetingByLink` 加入成員後進會議室。
- `src/App.jsx` 是總指揮：掛 Navbar、各頁、BottomNav（手機）、FloatingMeetingWidget（浮窗）、全域 hooks。

### 關鍵檔案地圖
```
src/
  App.jsx                    路由 + 全域狀態組合
  main.jsx / index.css       進入點 + Tailwind + 深色皮膚(見 §6)
  config/meetingConfig.js    ★雙模式場景設定檔（config-driven，見 §4）
  lib/
    auth.js                  useAuth（登入/註冊/登出/updateProfile）
    store.js                 useMeetings（會議 CRUD，走 api.js + socket 即時）
    social.js                useSocial（好友/邀請，含 dedupe）
    api.js                   REST 呼叫封裝（API_BASE 依 DEV/正式切換）
    socket.js                socket 單例（connectSocket / getSocket）
    settings.js              useMode（企業/學生模式，localStorage）
    theme.js                 ★useTheme（light/dark/auto，見 §6）
    extract.js               會後筆記→決議/風險/待辦 規則式擷取
    session.js               token/user localStorage
  pages/
    Dashboard.jsx            首頁看板（會議卡、統計）
    CreateMeeting.jsx        ★發起會議＝三步驟 Stepper（見 §3、§4）
    LiveRoom.jsx             ★會議進行中（socket 共編、typing、RBAC）
    MeetingSummary.jsx       會後 AI 整理
    Todo.jsx                 ★待辦（微互動：左滑刪、兩階段打勾消失、RBAC 鎖）
    Friends.jsx              好友頁
    ProfilePage.jsx          個人資料頁
    SettingsPage.jsx         ★設定頁（主題/改名/模式/登出/關於，見 §6）
    Auth.jsx                 登入註冊
  components/
    Navbar.jsx               頂部（含頭像下拉：個人資料/個人設定/登出）
    BottomNav.jsx            手機底部導覽（動態島風格，md:hidden）
    FloatingMeetingWidget.jsx 開會中全域浮動倒數圈（可拖曳磁吸）
    MeetingRbacPanel.jsx     ★RBAC 權限面板（受控元件，見 §5）
    InviteModal.jsx          會議中 socket 邀請好友
    FriendAttendeePicker.jsx 與會者=好友選擇器
    CreatedInviteModal.jsx   建立後的會議代碼/連結
    SettingsModal.jsx        （已棄用，改用 SettingsPage；檔案留著無害）
後端根目錄：
  server.js                  Express + Socket.io 路由與事件
  authStore.js               使用者(含 JSON 還原、去重、updateProfile、searchUsers)
  meetingsStore.js           會議(owner+memberIds 共享存取)
  socialStore.js             好友關係 + 會議邀請
  db.js                      Mongo/JSON 切換
```

---

## 3. 發起會議＝三步驟 Stepper（CreateMeeting.jsx）

- **步驟一 選擇場景**：四張場景卡（2×2）。卡片已修好垂直置中：`relative flex flex-col justify-center text-left px-6 py-5 min-h-[96px]`，勾勾 `absolute top-4 right-4`。
- **步驟二 基本資料**：會議主題、與會名單（FriendAttendeePicker）、會議時間。
- **步驟三 會前檢核（守門）**：把進階欄位做成「通關任務卡（GateTaskCard）」，填好變綠勾；全部必填通關才解鎖「正式發起會議」。**此步驟頂部嵌入 `<MeetingRbacPanel>`**（見 §5）。
- 場景切換／模式切換會 `seedGateTasksFromScenario` 重置任務。建立後呼叫 `store.createMeeting`。

---

## 4. 雙模式 config-driven（meetingConfig.js）

- 結構 `MODES = { enterprise, student }`，各含 `scenarios[]`。`getMode(modeId)` / `getScenario(modeId, scenarioId)`。
- 每個場景：`{ id,label,en,emoji(現為""),tagline, primaryListKey, linkKeys, duration, fields[], evaluate(v)→{level,reasons,checks} }`。
- 欄位型別 `type: text|link|list|participants|choice`。頁面依 fields **動態渲染**，不寫 if-else。
- **模式全域**：`useMode()`（localStorage `meetflow.mode`），在 Navbar/Dashboard/Settings 皆可切，`CreateMeeting` 收 `modeId` prop 即時連動。

---

## 5. 動態權限系統 RBAC（MeetingRbacPanel.jsx）

- **三種角色**：`host`（上級/發起人）、`recorder`（紀錄員）、`attendee`（下級）。面板頂部有「測試角色切換」下拉。
- **兩個開關**（Host 才看得到）：`isEditRestricted`（預設 false）、`isDeleteRestricted` / `isHostAssignmentEnabled`（使用者近期把第二顆改名為「是否由上級分配任務」，鐵律：host 指派任務下級一律不可刪）。
- **關鍵：MeetingRbacPanel 是「受控元件」**——狀態由父層 `useState` 提供並傳 props（`currentRole/setCurrentRole/isEditRestricted/setIsEditRestricted/...`）。若忘記傳 props 就會用內部後備狀態、無法連動（這是先前踩過的坑）。
- `variant="panel"`（發起頁內嵌卡片）、`compact`（會議室 header 下拉用，只渲染控制項）。
- **連動效果**：
  - 編輯：`isEditRestricted && currentRole==='attendee'` → LiveRoom 筆記 textarea `disabled` + 灰字「僅限上級或紀錄員編輯」；CreateMeeting 新增任務 input 也鎖。
  - 刪除：host 指派的任務，attendee 隱藏垃圾桶、顯示「上級指示」badge。
  - 結束會議：非 host → 大按鈕變 disabled「僅 Host 可結束會議」。
- Todo 頁另有 `isDeleteLocked()` 依 assignedBy/ownerId 做唯讀鎖。

---

## 6. 深色模式（重要，剛完成）

- **啟用方式**：`tailwind.config.js` 設 `darkMode: "class"`；`src/lib/theme.js` 的 `useTheme()` 在 `<html>` 掛/卸 `.dark`。
- **偏好**：`localStorage meetflow.theme = "light" | "dark" | "auto"`。auto＝依時間（19:00–06:59 深色），每分鐘與 focus 重新判定。匯入時即套用避免閃白。App.jsx 呼叫 `useTheme()` 傳給 SettingsPage。
- **★深色皮膚架構（關鍵，別踩雷）**：`src/index.css` 內用 **`@layer base`**（**不加 `!important`**）做一套全域基準皮膚，把 `.dark .bg-white`、`.dark [class*="bg-white/"]`、`.dark .text-navy-*`、`.dark [class*="border-navy-800/"]`、`.dark .border-gray-*` 統一轉深色/提亮。
  - 為什麼放 base 且不加 !important：這樣它排在 utilities 之前，**組件層的 `dark:` 類別（utilities 層、排序在後）才能覆寫它**，達成像素級控制。之前用 !important + 排在後面，導致所有 `dark:` 都失效 —— 已修正，勿改回去。
  - 文字階梯：主標 ≈slate-100、描述小字不低於 ≈slate-400；邊框 white/10–14；checkbox/卡片邊框已提亮到暗底可見。
- **已針對性加 dark: 的組件**：Todo 兩個 checkbox（`dark:border-white/40 dark:bg-transparent`）、CreateMeeting 場景卡（選中 `dark:bg-[#1e293b]/60 dark:border-cyan-400 dark:text-white`、未選 `dark:bg-[#111c35] dark:border-slate-800 dark:text-slate-100`、tagline `dark:text-slate-400`）。
- 若之後某頁小區塊深色對比不足，優先在該組件補 `dark:` 類別（會覆寫基準皮膚），不要動基準皮膚的架構。

---

## 7. 後端要點（server.js + *Store.js）

- 會議存取模型：`ownerId` + `memberIds`（受邀接受者）。`getAccessible/updateAccessible/listForUser` 判定權限；刪除限 owner。
- REST：`/api/auth/*`、`/api/meetings`(CRUD)、`/api/meetings/:id/invite|join`、`/api/friends*`、`/api/invites*`、`/api/users/search`。
- Socket 事件：`join-meeting`(相容 `join-room`)、`notes:update`↔`notes:sync`、`agenda:select/sync`、`typing`（帶 topic，多人打字用顏色區分）、`invite-user`(ack)、個人房 `user:<id>` 推播（好友/會議邀請）。
- **兩人即時同步的前提**：雙方都登入、都是同一會議的 owner/member、且連同一台後端。單一視窗看不到自己的 typing 是正常設計。

---

## 8. 慣例與注意事項

- **全站已移除 emoji**（走簡約高級風）；場景/模式 `emoji` 欄位為 `""`，圖示改用 lucide 或純文字。**不要再加 emoji**。
- 顏色 tokens：主色 mint（薄荷綠）、輔色 coral（珊瑚橘）、深碳藍 navy；卡片圓角大、細邊框、微陰影、毛玻璃 `backdrop-blur`。
- 輸入框都要處理**中文輸入法組字**：`if (e.key==='Enter' && !e.nativeEvent.isComposing && e.keyCode!==229)`。
- 手機 RWD：底部有毛玻璃導覽列，主內容需 `pb-24`/`pb-28` 避免被遮。
- **驗證流程**：改完一定 `npm run build`（tail 看有無錯）；動到後端可用 `node --check server.js` 或起 server 跑 socket 測試。沙盒的 esbuild CLI binary 不能直接執行（平台不符），要驗證獨立元件語法就臨時 import 進 main.jsx 再 build、之後還原。

---

## 9. 目前狀態（截至交接）

- ✅ 發起會議三步驟、雙模式、守門通關、RBAC（受控面板已打通 Create/Live）
- ✅ 好友/會議邀請（雙向同意）、socket 即時通知、typing 多人顏色標示
- ✅ 待辦頁微互動（左滑刪、兩階段打勾消失、確認 Modal、RBAC 鎖）
- ✅ 會議室共編筆記、浮動倒數視窗、手機底部導覽、Dashboard 視覺重構
- ✅ 全站移除 emoji；設定獨立成 SettingsPage；深色/淺色/自動主題 + 深色對比修正（最新一輪）
- ⏳ 可能的後續：深色模式逐頁細修個別對比、auto 夜間時段可自訂、把 config 場景配專屬 lucide icon、真實 LLM 取代規則式會後整理。

---

## 10. 給新 agent 的第一步建議

1. `Read` 這份 + 目標檔案的最新內容（使用者常手改）。
2. 需要跑就 `npm run build` 驗證；後端改動記得提醒使用者重新部署 Render。
3. 回覆用繁體中文、簡潔直接（使用者偏好）。

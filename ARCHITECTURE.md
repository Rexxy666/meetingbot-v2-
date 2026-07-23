# MeetFlow（關會）— 架構與設計理念

> 這份文件講**為什麼這樣設計**；`HANDOFF.md` 講**怎麼接手開發**。
> 兩份互補：新人先讀這份建立心智模型，動手前再讀 HANDOFF 的操作守則。
>
> 最後更新：2026-07-21

---

## 1. 產品定位

**MeetFlow（中文「關會」）是一套會議生命週期管理 SaaS，核心角色是「會議守門員」。**

大多數會議工具的假設是「會議會發生，我幫你記錄」。MeetFlow 的假設不同：**很多會議根本不該發生**。所以產品的第一道關卡不是筆記，而是攔截 —— 在發起階段就用場景化規則判定這場會議有沒有目標、有沒有準備，沒有就擋下來。

這個定位決定了三件事：

1. **發起流程刻意有摩擦。** 三步驟 Stepper 加「通關任務卡片」，不是為了好看，是為了讓發起人被迫回答「這場會要解決什麼」。
2. **會後產出必須可驗收。** AI 摘要不只是流水帳，要能對照會前設定的痛點，檢查有沒有被處理。
3. **資料以「會議」為單位而非「訊息」為單位。** 一場會議是一個完整的生命週期物件：目標 → 議程 → 筆記 → 決議 → 待辦。

---

## 2. 技術棧

| 層 | 選型 | 備註 |
|---|---|---|
| 前端 | React 18 + Vite 5 + Tailwind CSS 3 | 圖示一律 `lucide-react` |
| 即時協作 | Socket.io 4 | 共編筆記、議程同步、打字指示、邀請通知 |
| 後端 | Node + Express 4 | ESM（`type: module`） |
| 驗證 | JWT + bcryptjs，另支援 Firebase Google 登入 | Token 存 localStorage |
| 結構驗證 | Zod | 所有輸入一律 parse，不信任前端 |
| 資料 | Firestore → MongoDB → 本機 JSON 三層 fallback | 見 §8 |
| AI | Google Gemini（`@google/genai`） | API Key 只存後端 env |

### 指令

```bash
npm run dev          # 前端 http://localhost:5173
npm run dev:server   # 後端 PORT 3001
npm run build        # 產出 dist —— 每次改完都要跑，過了才算完成
```

**刻意沒裝的東西**（有意識的取捨，不是遺漏）：

- **React Router** — 見 §4，用 `page` state 取代。
- **Recharts / D3** — 圖表全部手刻 SVG。加一個圖表庫要 ~500KB，而我們只需要甜甜圈圖和長條圖，用 `stroke-dasharray` 就能做。
- **狀態管理庫（Redux / Zustand）** — 狀態量還在 custom hooks 能處理的範圍，見 §4。
- **富文本編輯器（Slate / TipTap / Lexical）** — 筆記用 `textarea` + 自訂 block model，見 §5。

---

## 3. 系統架構總覽

```
┌──────────────────────────────────────────────────────────┐
│                      Browser (SPA)                        │
│                                                           │
│  App.jsx ── page state ──┬── Dashboard / CreateMeeting     │
│      │                   ├── LiveRoom  ★會議室（最複雜）   │
│      │                   ├── MeetingSummary ★會後          │
│      │                   └── Todo / Friends / Settings     │
│      │                                                    │
│  hooks: useAuth / useMeetings / useSocial / useMode /      │
│         useTheme / useLocalMediaAndStt                     │
└───────┬─────────────────────────────┬─────────────────────┘
        │ REST (api.js)               │ WebSocket (socket.js)
        ▼                             ▼
┌──────────────────────────────────────────────────────────┐
│                    Express + Socket.io                    │
│                                                           │
│  Zod 驗證 → JWT 授權 → meetingAuthz 權限過濾 → Store       │
│                                                           │
│  geminiService.js  ── 三條獨立 AI 管線（見 §6）            │
└───────┬──────────────────────────────────────────────────┘
        ▼
  Firestore ──fallback──▶ MongoDB ──fallback──▶ data/*.json
```

---

## 4. 前端架構

### 4.1 為什麼沒用 React Router

`App.jsx` 用一個 `page` state 切頁，搭配 `go(page, id)` 導頁、`activeId` 記住當前會議。

這不是偷懶。會議室（`LiveRoom`）持有大量**不能在導頁時被銷毀的狀態**：WebRTC media stream、Socket 連線、語音辨識 session、計時器。用 Router 的話每次路由變更都要處理 unmount/remount 的副作用清理，而我們真正需要的「路由」只有八個扁平頁面，沒有巢狀、沒有 URL 參數解析需求。

**唯一的深連結需求**用 hash 解決：`#/live/:meetingId`，`App.jsx` 監聽 `hashchange` → 呼叫 `api.joinMeetingByLink()` 把使用者寫入成員後進會議室。

代價要講清楚：**沒有瀏覽器上一頁、沒有可分享的頁面 URL**。如果之後要做 SEO 或深層分享，這是第一個要還的技術債。

### 4.2 狀態分層

```
全域（App.jsx 持有，往下傳 props）
  auth      useAuth      使用者、token、登入登出
  store     useMeetings  會議 CRUD + socket 即時同步
  social    useSocial    好友、邀請（含 dedupe）
  mode      useMode      企業／學生雙模式
  theme     useTheme     深色／淺色／自動

頁面級（各頁自己的 useState）
  LiveRoom  議程索引、筆記、roster、RBAC、媒體狀態…

元件級（刻意不上升的本機狀態）
  AI 對話草稿、康乃爾私密筆記、面板收折狀態
```

**「刻意不上升」是一個重要原則**：草稿類、隱私類、純視覺類的狀態留在元件內。例如底部 AI 面板的輸入草稿，如果上升到會議層就會被同步給所有人 —— 半成品問題不該廣播。

---

## 5. 筆記資料模型（整個專案最關鍵的設計）

### 5.1 問題

筆記需要同時滿足四個互相拉扯的需求：

1. 多人即時共編（要能塞進 socket payload）
2. 內含 AI 問答（結構化資料，不只是文字）
3. 會後要能餵給 AI 做摘要（要能攤平成純文字）
4. 舊資料不能壞（早期版本存的是純字串）

### 5.2 解法：可降級的 block document

`src/lib/notesDocument.js` 定義了一個**帶前綴的序列化格式**：

```js
const PREFIX = "@@MF1@@";

// 純文字筆記 → 直接存字串（與舊版完全相容）
"這季定價要調整"

// 含 AI 問答 → 存 JSON 並加前綴
"@@MF1@@{\"v\":1,\"blocks\":[
   {\"id\":\"t-main\",\"type\":\"text\",\"text\":\"這季定價要調整\"},
   {\"id\":\"a-xxx\",\"type\":\"ai\",\"question\":\"我要怎麼做？\",
    \"answer\":\"...\",\"status\":\"done\",\"hidden\":false}
]}"
```

關鍵在 `serializeNotesDoc()` 的降級規則：

```js
// 若只有一個純文字區塊且無特殊內容，輸出舊版純文字
if (blocks.length === 1 && blocks[0].type === "text" && !/@ai\b/i.test(blocks[0].text)) {
  return blocks[0].text || "";
}
return PREFIX + JSON.stringify({ v: 1, blocks });
```

**這個設計換到四個好處**：

- 沿用既有的 `topicNotes` socket 同步，不用開新的傳輸通道
- `parseNotesDoc()` 遇到沒有前綴的字串自動當純文字處理 → 舊資料零遷移
- `flattenNotesDoc()` 能把問答攤平給會後 AI 摘要，不漏內容
- 純文字使用者的 payload 沒有變大（沒有為了少數人的功能懲罰多數人）

### 5.3 固定 id 的坑

```js
export function plainToDoc(text = "") {
  // 固定 id：純文字往返時不可每次 createId，
  // 否則 textarea remount 導致無法打字
  return { v: 1, blocks: [{ id: "t-main", type: "text", text: String(text || "") }] };
}
```

這行註解值得保留 —— 曾經因為每次 parse 都產生新 id，導致 React 認為是不同元件而重建 `textarea`，游標每打一個字就跳掉。

---

## 6. AI 架構：三條互不汙染的管線

三條管線輸入不同、輸出對象不同、隱私等級不同，**刻意不共用 prompt**。

| 管線 | 端點 | 輸入 | 輸出給誰 | 寫回 meeting？ |
|---|---|---|---|---|
| 會後摘要 | `POST /api/ai/summarize` | 全場逐字稿／共編筆記 | 全體成員 | ✅ 寫入 `review` |
| 會中問答 | `POST /api/ai/ask` | 問題 + 近期逐字稿 | 提問者（但答案存進共編筆記） | ✅ 存成 ai block |
| 私密洞察 | `POST /api/meetings/:id/private-insights` | 逐字稿 + **個人康乃爾筆記** | **僅該使用者** | ❌ **絕不寫入** |

### 為什麼私密洞察必須獨立

`meeting` 物件會同步給所有 `memberIds`。所以只要把個人筆記或個人建議寫進 meeting 的任何欄位，就等同公開。這條規則在三個地方各留了一份註解防守：

```js
// geminiService.js
/* ⚠ 隱私邊界：本函式的輸入含「使用者的私密康乃爾筆記」，輸出僅回傳給該使用者。
   呼叫端【絕對不可】把結果寫回 meeting 物件或用 socket 廣播 */

// server.js
/* ⚠ 隱私：康乃爾筆記由前端隨請求送出，伺服器【不落地儲存】、
   結果只回給發話者，絕不寫入 meeting */

// MeetingNotesContainer.jsx
/* ⚠ 隱私儲存原則：meeting 物件會同步給所有 memberIds，
   私密筆記「絕對不能」寫進 meeting */
```

私密筆記存 `localStorage`，key 是 `meetflow.cornell.<userId>.<meetingId>`。

**已知限制：換裝置或清快取，私密筆記就沒了。** 要跨裝置得開一支 per-user 的 private-notes 資料表 —— 但**絕不能併進 meeting**。

### Prompt 的共同原則

三條管線的 system instruction 都包含「禁止空話」條款，例如風險管線明確禁止「多加溝通」「持續關注」這類無法執行的建議，並要求每條建議引用具體線索。無 API Key 或呼叫失敗時一律降級到 mock 資料並在 `source` 欄位標明（`gemini` / `mock` / `insufficient`），**前端永遠知道這份內容是不是真的 AI 產出**。

---

## 7. 即時協作

### Socket 事件表

| 事件 | 方向 | 用途 |
|---|---|---|
| `join-meeting` / `join-room` | C→S | 加入會議房間（後者為相容別名） |
| `meeting:joined` | S→C | 回傳當前 `topicNotes`、成員數 |
| `notes:update` → `notes:sync` | C→S→C | 共編筆記同步 |
| `agenda:select` → `agenda:sync` | C→S→C | 議程切換同步 |
| `typing` | C→S→C | 打字指示（帶 `topic`，可分辨誰在哪個議程打字） |
| `invite-user` | C→S | 會議邀請（有 ack） |
| `meeting:patch` → `meeting:updated` | C→S→C | 會議欄位更新 |
| `meeting:kick` / `meeting:kicked` | — | 踢除成員 |
| `meeting:report` / `meeting:reports` | — | 檢舉 |
| `meeting:deleted` | S→C | 會議刪除廣播 |

另有**個人通知房間** `user:<id>`：使用者所有裝置都會加入，好友邀請等通知走這條，達成跨裝置即時。

### 打字指示的設計

不只顯示「有人在打字」，而是顯示**誰**在打字，每人一個固定色票（由名字 hash 決定），且名字用非等寬字體以區隔筆記本文的等寬字體。這是為了解決多人同時編輯時「不知道哪段是誰在改」的問題。

---

## 8. 儲存層：三段 fallback

```
Firestore（有 firebase-admin 憑證）
   ↓ 沒有
MongoDB（有 MONGODB_URI）
   ↓ 沒有
本機 JSON（data/*.json）
```

`meetingsStore.js` 對外暴露統一介面（`getAccessible` / `updateAccessible` / `listForUser` / `addMember`），三種實作可互換。`/api/health` 會回報當前 `storage` mode。

**理念：本機開發不該需要任何外部服務。** clone 下來 `npm run dev:server` 就能跑，資料落在 `data/*.json`，不用裝 Mongo、不用申請 Firebase。

### 存取模型

- `ownerId` — 發起人，唯一能刪除會議的人
- `memberIds[]` — 有存取權的成員
- 所有讀寫一律走 `getAccessible(id, userId)`，**沒有不檢查權限的查詢路徑**

---

## 9. 權限模型（RBAC）

三種角色：`host` / `recorder` / `attendee`，搭配兩個開關：

- **編輯限制** — 開啟後只有 host 與被授權者能編輯議程筆記
- **刪除／踢人限制** — 可指定哪些人有踢除權

後端 `meetingAuthz.js` 是**唯一真相來源**：`filterTrustedMeetingPatch()` 會依 JWT 與會議狀態過濾掉前端送來的未授權欄位。前端的權限 UI 只是體驗優化，繞過它也改不了資料。

```js
/** 永遠不信任前端：Zod 剝除未知欄位 + 依 JWT／會議狀態過濾可寫欄位 */
```

---

## 10. UI 設計語言與關鍵決策

### 10.1 視覺基調

薄荷綠（mint）主色代表「通行」，珊瑚橘（coral）代表「警告」，深藍（navy）為文字。白底 + 輕陰影，大量留白。**全站無 emoji** —— 為維持簡約高級感，圖示一律用 lucide-react。

### 10.2 深色模式的 CSS cascade 陷阱

全域深色皮膚寫在 `@layer base`，**且不可加 `!important`**：

```css
@layer base {
  .dark .bg-white { background-color: #131d2f; }
  .dark .text-navy-800 { color: #f1f5f9; }
  /* ... */
}
```

原因：Tailwind 的 utilities layer 排在 base 之後，同特異度下後者勝出。所以元件層的 `dark:` 類別能正常覆寫全域皮膚。**一旦加了 `!important`，所有元件的 `dark:` 就全部失效** —— 這個坑踩過一次。

### 10.3 會議室版面：三段式

```
┌─────────┬──────────────────────┬──────────┐
│ 視訊宮格 │                      │  逐字稿   │
│ max-45vh│    筆記（視覺主角）    │          │
├─────────┤                      ├──────────┤
│ 與會人員 │  ─────────────────  │ 議程控制  │
│         │  AI 對話面板（收折）   │ h-[44%]  │
└─────────┴──────────────────────┴──────────┘
```

三個設計原則：

- **每個面板只有一個滾動區。** 標題、計時器、主要按鈕一律 `shrink-0` 釘住，不隨內容捲走。
- **資訊配對合理。** 「誰在線上」與「誰的臉在畫面上」是同一件事，放同一欄；議程與計時器天然一組，放另一欄。
- **高度自適應。** 一律 `h-full min-h-0 flex flex-col`，視訊用 `max-h` 設上限而非固定高度。

### 10.4 AI 問答為什麼移到底部面板（方案 B）

早期把 AI 回答卡片插進筆記正文，結果是**AI 輸出與人的輸入競爭同一條垂直軸** —— 問三次，筆記被切成七段，讀筆記需要的連續性完全消失。

現在改成正文吃 `flex-1`（彈性）、面板 `shrink-0`（固定住民，收折時僅約 36px）。AI 講多長都關在 `max-h-[220px]` 的獨立滾動容器裡。

**「複製到筆記」按鈕是刻意的設計**：預設 AI 產出不進筆記，你認可的才進去。筆記是使用者的判斷，不是模型的輸出。

### 10.5 導覽列的雙模式

| 模式 | 行為 |
|---|---|
| 一般頁面 | 常駐顯示、無陰影，主內容加 `md:pl-[4.75rem]` 讓開 |
| 會議室／候場室 | `-translate-x-full` 藏起，滑鼠移入左側 20px 感應帶才滑出，`fixed` overlay 不推擠 Layout |

偏移量用匯出常數 `NAV_CONTENT_OFFSET` 與 `DRAWER_W` 綁在一起，避免兩邊各寫一個數字而飄移。

---

## 11. 開發慣例（踩過的坑）

### 11.1 中文輸入法（IME）防護 —— 必須做

任何監聽 Enter 的地方都要防 IME 組字：

```js
if (e.key === "Enter" && !e.shiftKey) {
  if (e.nativeEvent?.isComposing || e.keyCode === 229) return;  // 選字確認，不是送出
  e.preventDefault();
  submit();
}
```

漏掉的話：使用者打中文按 Enter 選字 → 被當成送出 → 送出半成品或直接覆寫文字。這個 bug 出現過不只一次。

### 11.2 Tailwind 動態 class 的靜默失效

Tailwind 只掃描**字面文字**。寫在 JS 常數裡的 class 仍然有效（因為常數本身是字串字面量），但**字串拼接組出來的 class 不會被產生**：

```js
const OK  = "md:pl-[4.75rem]";           // ✅ 掃得到
const BAD = `md:pl-[${w}rem]`;           // ❌ 掃不到，樣式默默不存在
```

改完版面相關的動態 class，值得去 `dist/assets/*.css` 確認規則真的產生了。

### 11.3 textarea 游標座標

`getComputedStyle(el).font` 在 Chrome 常回傳空字串。要量游標位置必須逐一複製長屬性（`fontFamily` / `fontSize` / `fontWeight` / `lineHeight` / `letterSpacing`…），見 `src/lib/caretCoords.js`。鏡像 div 也要設 `top:0; left:0`，否則它會參與正常流、量出來的座標飄到畫面外。

### 11.4 驗證流程

1. `npm run build` —— 過了才算完成
2. 純函式邏輯寫 node 測試（`src/lib/*.js` 多數可直接 import）
3. 版面相關的改動，檢查 build 出來的 CSS 有沒有產生對應規則

**注意**：目前開發環境的 sandbox 無法啟動 Chromium（缺 `libXdamage` 且無 root），所以**視覺與互動手感無法自動驗證**，需要人工在本機確認。

### 11.5 動檔案前先讀

使用者（Rex）常同時用 Cursor 手改檔案。動任何檔案前先 `Read` 最新內容，用**定點編輯**而非整檔覆蓋。

---

## 12. 已知技術債

### 死碼（目前沒有任何檔案 import）

```
src/components/  Logo.jsx  GlobalNavbar.jsx  SettingsModal.jsx
                 VoiceToTextAIAssistant.jsx  Navbar.jsx  Tag.jsx
src/pages/       MeetingSummaryDashboard.jsx  PostMeeting.jsx
                 LiveMeeting.jsx  TodoPage.jsx
```

多數是重構後的舊版本（例如 `Navbar` → `LeftVerticalGlobalNav`、`LiveMeeting` → `LiveRoom`、`SettingsModal` → `SettingsPage`）。**清除前建議先確認沒有被動態引用**。

其中 `TodoPage.jsx` 特別值得注意：曾經因為改了 `TodoPage.jsx` 但 App 實際 render 的是 `Todo.jsx`，導致修改完全沒生效。**動檔案前先確認 App 到底 render 哪一個。**

### 其他

- **私密筆記無法跨裝置**（見 §6）
- **無瀏覽器上一頁 / 無可分享頁面 URL**（見 §4.1）
- **bundle 已超過 500KB**，Vite 每次 build 都在警告，尚未做 code splitting
- **`LiveRoom.jsx` 超過 2700 行**，是最需要拆分的檔案
- **無自動化視覺測試**（見 §11.4）

---

## 13. 一句話總結各層理念

| 層 | 理念 |
|---|---|
| 產品 | 好的會議工具應該減少會議，而不是美化會議 |
| 資料 | 新格式必須能降級成舊格式，讓舊資料零遷移 |
| 隱私 | 只要會同步給他人的物件，就一個位元的私密資料都不能放 |
| 權限 | 前端權限是體驗，後端權限才是安全 |
| AI | 產出必須標明來源、可驗收、預設不汙染使用者的筆記 |
| 版面 | 每個面板只有一個滾動區；固定元素永遠不隨內容捲走 |
| 相依 | 為了兩個圖表引入 500KB 的函式庫，是不划算的交易 |

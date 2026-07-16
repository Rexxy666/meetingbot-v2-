# 關會 GuanHui · Meeting Gatekeeper

會議生命週期管理軟體。以「會議守門員」為核心：沒有明確目標的會議擋在門外，開會時只留目標、議程與筆記，會後自動從你打的筆記整理出決議與待辦。

這是**真正可操作**的應用，不是靜態展示：你建立的會議會存進瀏覽器（localStorage），出現在看板、能進會議室計時做筆記、結束後由解析引擎讀你實際輸入的文字產出待辦。

視覺風格：極簡、高呼吸感、明亮新創感。主色薄荷綠（通行）、輔助亮橘（警告倒數）、深碳藍（文字與邊框），乾淨白底搭配微陰影卡片。設計 token 集中在 `tailwind.config.js`。

## 快速開始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 產出正式版到 dist/
npm run preview  # 預覽 build 結果
```

（資料夾內已含 node_modules，可直接 `npm run dev`。）

## 操作流程

1. **發起會議** — 填會議主題，逐條新增痛點與預期目標（一次一項，不是一次全部打完），可加與會者、會前連結、時間。右側守門卡即時判定：沒有目標→阻擋、時間>60分→警告、齊全→通行。通過才能建立。
2. **會議看板** — 看到你建立的所有會議與累計省時／待辦統計，可進入或刪除。
3. **會議室** — 頂部常駐目標、左側圓形倒數計時器（依設定時間，剩 60 秒轉橘）、目標即議程可點選、右側筆記即時自動存檔。
4. **會後整理** — 「結束會議」後，解析引擎讀你的筆記，分成靈感／決議／風險，並擷取待辦（負責人 Who、截止 When）。可勾選完成、複製、重新整理。
5. **待辦任務** — 彙整所有會議的 Action Items，依待完成／已完成／全部篩選，導覽列顯示未完成數量。

## 關於「AI 整理」

目前的整理由本機規則引擎完成（`src/lib/extract.js`），會實際解析你輸入的每一行筆記，依關鍵字分類並抓出負責人與時程 —— 不是寫死的假資料。若要換成真正的 LLM，只需把 `extractReview()` 換成呼叫後端／模型 API 即可。

## 技術與結構

React 18 + Vite 5 + Tailwind CSS 3。

```
meetingbot/
├── index.html
├── package.json / vite.config.js / tailwind.config.js / postcss.config.js
└── src/
    ├── main.jsx
    ├── App.jsx              # 路由 + 全域會議狀態
    ├── index.css
    ├── lib/
    │   ├── store.js         # localStorage 資料層 + useMeetings()
    │   └── extract.js       # 筆記解析（決議/風險/靈感 + 待辦擷取）
    ├── components/          # Logo / Avatar / Tag / Navbar
    └── pages/               # Dashboard / CreateMeeting / LiveRoom / PostMeeting / Todo
```
# meetingbot
# meetingbot-v2-

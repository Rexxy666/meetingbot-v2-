// ============================================================================
//  雙模式 · 場景導向守門員設定檔（Config-Driven）
//
//  結構：  config[mode].scenarios[scenario]
//  React 頁面只需 getMode(modeId) / getScenario(modeId, scenarioId) 取設定後
//  動態渲染，不需任何 if-else。
//
//  每個場景：
//   - fields:   左側動態欄位（label / placeholder / required / type）
//   - duration: 該場景可選時長與預設值
//   - evaluate: 專屬守門邏輯，回傳 { level, reasons, checks }
//
//  欄位型別 type：text | link | list | participants | choice
// ============================================================================

const has = (v) => typeof v === "string" && v.trim().length > 0;
const hasList = (v) => Array.isArray(v) && v.length > 0;

function finalize(blocks, warns, checks) {
  const level = blocks.length ? "block" : warns.length ? "warn" : "pass";
  return { level, reasons: blocks.length ? blocks : warns, checks };
}

// ── 🏢 企業模式 ──────────────────────────────────────────────────────────────
const ENTERPRISE = [
  {
    id: "client",
    label: "對客戶",
    en: "B2B Client Meeting",
    emoji: "🤝",
    tagline: "對外拜訪・商務洽談",
    primaryListKey: "outcomes",
    linkKeys: ["deckLink"],
    duration: { default: 45, options: [30, 45, 60, 90] },
    fields: [
      { key: "title", type: "text", label: "會議主題", placeholder: "例：MeetFlow 導入方案簡報", required: true },
      { key: "participants", type: "participants", label: "與會名單（含客戶方）", placeholder: "點此選擇好友，或輸入關鍵字過濾…", required: false, hint: "選填 · 尚未加好友可留空，開會時輸入會議代碼即可加入" },
      { key: "clientName", type: "text", label: "客戶 / 公司名稱", placeholder: "例：宏達電 採購部", required: true },
      { key: "outcomes", type: "list", ordered: true, label: "本次想推進的成果", placeholder: "例：推進到 POC 簽署", required: true, hint: "逐條新增・放行關鍵" },
      { key: "deckLink", type: "link", label: "簡報 / Demo 連結", placeholder: "貼上簡報或 Demo 連結", required: true, hint: "對外必附" },
      { key: "nextStep", type: "text", label: "預期下一步 (CTA)", placeholder: "例：兩週內回報價並排定 POC", required: true },
      { key: "painPoints", type: "list", accent: "coral", label: "已知客戶痛點", placeholder: "客戶在意的問題（選填）", required: false },
    ],
    evaluate(v) {
      const checks = [
        { ok: has(v.clientName), label: "已填客戶 / 公司名稱" },
        { ok: hasList(v.outcomes), label: "已定義想推進的成果" },
        { ok: has(v.deckLink), label: "已附簡報 / Demo 連結" },
        { ok: has(v.nextStep), label: "已定義會後下一步 (CTA)" },
        { ok: (v.durationMin || 0) <= 60, label: "時間 ≤ 60 分（聚焦）" },
      ];
      const blocks = [], warns = [];
      if (!has(v.clientName)) blocks.push("尚未填寫客戶 / 公司名稱。");
      if (!hasList(v.outcomes)) blocks.push("尚未定義想推進的成果，客戶會議需有明確目的。");
      if (!has(v.deckLink)) blocks.push("對外客訪未附簡報 / Demo 連結 —— 直接阻擋。");
      if (!has(v.nextStep)) blocks.push("未定義會後下一步 (CTA)，會議易無疾而終。");
      if ((v.durationMin || 0) > 60) warns.push("客戶會議偏長，建議壓在 60 分內聚焦。");
      if (!hasList(v.painPoints)) warns.push("未列客戶痛點，開場恐難切中對方需求。");
      return finalize(blocks, warns, checks);
    },
  },
  {
    id: "topdown",
    label: "上對下佈達",
    en: "Top-Down Alignment",
    emoji: "📢",
    tagline: "指示・目標佈達",
    primaryListKey: "directives",
    linkKeys: [],
    duration: { default: 30, options: [15, 30, 45, 60] },
    fields: [
      { key: "title", type: "text", label: "佈達主題", placeholder: "例：Q3 OKR 調整說明", required: true },
      { key: "participants", type: "participants", label: "佈達對象", placeholder: "要對齊的成員，按 Enter", required: false },
      { key: "directives", type: "list", ordered: true, label: "要佈達的指示事項", placeholder: "例：新客訴 SLA 縮短為 4 小時", required: true, hint: "逐條新增" },
      { key: "background", type: "text", label: "背景與原因 (Why)", placeholder: "為什麼要這麼做？讓下級理解脈絡", required: true, hint: "先講 Why 才對得齊" },
      { key: "successCriteria", type: "text", label: "完成的判斷標準", placeholder: "例：下週起所有工單套用新流程", required: false },
      { key: "deadline", type: "text", label: "期望完成時間", placeholder: "例：本週五前", required: false },
    ],
    evaluate(v) {
      const checks = [
        { ok: hasList(v.directives), label: "已列出指示事項" },
        { ok: has(v.background), label: "已說明背景與原因 (Why)" },
        { ok: has(v.successCriteria), label: "已定義完成判準" },
        { ok: has(v.deadline), label: "已設定期望完成時間" },
        { ok: (v.durationMin || 0) <= 30, label: "時間 ≤ 30 分（佈達精簡）" },
      ];
      const blocks = [], warns = [];
      if (!hasList(v.directives)) blocks.push("沒有明確的指示事項，佈達會議無從進行。");
      if (!has(v.background)) blocks.push("未說明背景與原因 (Why)，單向下令難以真正對齊。");
      if (!has(v.successCriteria)) warns.push("未定義完成判準，下級難以確認是否達標。");
      if (!has(v.deadline)) warns.push("未設定期望完成時間。");
      if ((v.durationMin || 0) > 30) warns.push("佈達會議建議 ≤ 30 分，內容過多改用書面公告。");
      return finalize(blocks, warns, checks);
    },
  },
  {
    id: "bottomup",
    label: "向上匯報",
    en: "Bottom-Up Progress Review",
    emoji: "📈",
    tagline: "進度回報・請求決策",
    primaryListKey: "progress",
    linkKeys: ["prereadLink"],
    duration: { default: 30, options: [15, 30] },
    fields: [
      { key: "title", type: "text", label: "匯報主題", placeholder: "例：新版結帳流程進度回報", required: true },
      { key: "participants", type: "participants", label: "匯報對象 / 主管", placeholder: "要回報的主管，按 Enter", required: false },
      { key: "progress", type: "list", ordered: true, label: "進度重點（已完成）", placeholder: "例：金流串接已完成 80%", required: true, hint: "結論先行" },
      { key: "blockers", type: "list", accent: "coral", label: "卡點 / 需要的協助", placeholder: "例：需協調 API 廠商窗口", required: false, hint: "向上求援" },
      { key: "decisionNeeded", type: "text", label: "需要上級拍板的決策", placeholder: "例：是否延後週邊功能上線？", required: false },
      { key: "prereadLink", type: "link", label: "數據 / 報告連結", placeholder: "貼上進度報告或儀表板連結（選填）", required: false, hint: "選填 · 補充參考資訊" },
    ],
    evaluate(v) {
      const checks = [
        { ok: hasList(v.progress), label: "已列出進度重點" },
        { ok: has(v.prereadLink), label: "已附會前數據 / 報告（選填）" },
        { ok: hasList(v.blockers) || has(v.decisionNeeded), label: "有明確請求（卡點或需決策）" },
        { ok: (v.durationMin || 0) <= 30, label: "時間 ≤ 30 分（硬性）" },
      ];
      const blocks = [], warns = [];
      if ((v.durationMin || 0) > 30) blocks.push("向上匯報超過 30 分鐘 —— 直接阻擋，請精簡或改書面。");
      if (!hasList(v.progress)) blocks.push("沒有列出進度重點，匯報缺乏實質內容。");
      if (!has(v.prereadLink)) warns.push("尚未附數據 / 報告連結，建議會前補上參考資訊。");
      if (!hasList(v.blockers) && !has(v.decisionNeeded)) warns.push("沒有明確請求（卡點或需拍板決策），易變單向報告。");
      return finalize(blocks, warns, checks);
    },
  },
  {
    id: "crossdept",
    label: "跨部門同步",
    en: "Cross-Functional Sync",
    emoji: "⚙️",
    tagline: "專案 Kick-off・進度對齊・防互相甩鍋",
    primaryListKey: "alignItems",
    linkKeys: ["boardLink"],
    duration: { default: 45, options: [30, 45, 60] },
    fields: [
      { key: "title", type: "text", label: "同步主題", placeholder: "例：結帳改版跨部門 Kick-off", required: true },
      { key: "participants", type: "participants", label: "與會部門 / 窗口", placeholder: "各單位代表，按 Enter", required: false, hint: "缺席單位請先標註" },
      { key: "alignItems", type: "list", ordered: true, label: "本次要對齊的事項", placeholder: "例：上線日與回滾條件", required: true, hint: "寫清楚才不會開完各說各話" },
      { key: "owners", type: "list", label: "責任歸屬 (DRI)", placeholder: "例：API 串接 → 後端 Rex", required: true, hint: "每項對齊都要有負責人" },
      { key: "dependencies", type: "list", accent: "coral", label: "相依 / 卡關風險", placeholder: "例：等法務審合約（選填）", required: false },
      { key: "boardLink", type: "link", label: "專案看板 / 文件連結", placeholder: "貼上 Notion / Jira / 共編文件", required: true, hint: "會後可追蹤的單一真相來源" },
      { key: "nextCheckpoint", type: "text", label: "下次對齊時間點", placeholder: "例：下週三 30 分同步", required: false },
    ],
    evaluate(v) {
      const checks = [
        { ok: hasList(v.alignItems), label: "已列出要對齊的事項" },
        { ok: hasList(v.owners), label: "已標註責任歸屬 (DRI)" },
        { ok: has(v.boardLink), label: "已附專案看板 / 文件" },
        { ok: (v.durationMin || 0) <= 60, label: "時間 ≤ 60 分" },
      ];
      const blocks = [], warns = [];
      if (!hasList(v.alignItems)) blocks.push("沒有要對齊的事項，跨部門會易變流水帳。");
      if (!hasList(v.owners)) blocks.push("未標註責任歸屬，散會後最容易互相甩鍋。");
      if (!has(v.boardLink)) blocks.push("未附專案看板 / 文件，對齊結論無處落地。");
      if (!hasList(v.dependencies)) warns.push("未列相依風險，跨部門卡關常在會後才爆。");
      if (!has(v.nextCheckpoint)) warns.push("未約定下次對齊點，進度容易失聯。");
      if ((v.durationMin || 0) > 60) warns.push("跨部門同步偏長，建議議題拆分。");
      return finalize(blocks, warns, checks);
    },
  },
  {
    id: "brainstorm",
    label: "腦力激盪",
    en: "Brainstorming & Sync",
    emoji: "💡",
    tagline: "跨部門發散・決策",
    primaryListKey: "topics",
    linkKeys: ["prereadLink"],
    duration: { default: 45, options: [30, 45, 60, 90] },
    fields: [
      { key: "title", type: "text", label: "會議主題", placeholder: "例：新功能命名與上線節奏", required: true },
      { key: "participants", type: "participants", label: "跨部門成員", placeholder: "與會者，按 Enter", required: false },
      { key: "topics", type: "list", ordered: true, label: "要發散 / 決策的議題", placeholder: "例：命名方向有哪些選項？", required: true, hint: "逐條新增" },
      { key: "mode", type: "choice", label: "期望產出", required: true, options: [
        { value: "diverge", label: "🌱 發散更多想法" },
        { value: "converge", label: "🎯 收斂做出決策" },
      ] },
      { key: "decisionMaker", type: "text", label: "最終決策者 (DRI)", placeholder: "誰負責拍板？例：Rex", required: true, hint: "避免無人決策" },
      { key: "prereadLink", type: "link", label: "背景資料連結", placeholder: "選填，供會前閱讀", required: false },
    ],
    evaluate(v) {
      const n = (v.participants || []).length;
      const checks = [
        { ok: hasList(v.topics), label: "已列出議題" },
        { ok: has(v.mode), label: "已選定期望產出（發散 / 收斂）" },
        { ok: has(v.decisionMaker), label: "已指定最終決策者 (DRI)" },
        { ok: n > 0 && n <= 8, label: "與會 ≤ 8 人（two-pizza）" },
      ];
      const blocks = [], warns = [];
      if (!hasList(v.topics)) blocks.push("沒有要發散 / 決策的議題。");
      if (!has(v.mode)) blocks.push("未選定期望產出，發散與收斂的開法完全不同。");
      if (!has(v.decisionMaker)) blocks.push("未指定最終決策者 (DRI)，決策恐懸而未決。");
      if (n > 8) warns.push("與會超過 8 人，發散效率下降（two-pizza 原則）。");
      if (v.mode === "converge" && (v.durationMin || 0) > 60) warns.push("收斂決策卻排超過 60 分，建議分段或先發散。");
      return finalize(blocks, warns, checks);
    },
  },
  {
    id: "oneonone",
    label: "1-on-1 訪談",
    en: "1-on-1 Coaching",
    emoji: "👥",
    tagline: "主管下屬談心・績效與職涯發展",
    primaryListKey: "talkPoints",
    linkKeys: [],
    duration: { default: 30, options: [20, 30, 45] },
    fields: [
      { key: "title", type: "text", label: "訪談主題", placeholder: "例：本季績效與職涯發展對談", required: true },
      { key: "participants", type: "participants", label: "對象（下屬 / 同儕）", placeholder: "訪談對象，按 Enter", required: false },
      { key: "talkPoints", type: "list", ordered: true, label: "想談的重點", placeholder: "例：本月卡關與需要的支援", required: true, hint: "避免變成閒聊" },
      { key: "employeeGoal", type: "text", label: "對方近期目標", placeholder: "例：希望半年內帶小專案", required: false },
      { key: "supportNeeded", type: "list", accent: "coral", label: "對方需要的支援", placeholder: "例：跨部門介紹窗口（選填）", required: false },
      { key: "followUp", type: "text", label: "會後跟進承諾", placeholder: "例：下週幫安排 mentor 咖啡", required: true, hint: "談完要有行動" },
    ],
    evaluate(v) {
      const n = (v.participants || []).length;
      const checks = [
        { ok: hasList(v.talkPoints), label: "已列出想談的重點" },
        { ok: has(v.followUp), label: "已定義會後跟進承諾" },
        { ok: n > 0 && n <= 2, label: "1-on-1 建議 ≤ 2 人" },
        { ok: (v.durationMin || 0) <= 45, label: "時間 ≤ 45 分" },
      ];
      const blocks = [], warns = [];
      if (!hasList(v.talkPoints)) blocks.push("沒有訪談重點，1-on-1 容易空轉。");
      if (!has(v.followUp)) blocks.push("未定義會後跟進，談心難轉成成長。");
      if (n > 2) warns.push("人數偏多，較像小組會而非 1-on-1。");
      if (!has(v.employeeGoal)) warns.push("未了解對方近期目標，難給有效回饋。");
      if ((v.durationMin || 0) > 45) warns.push("1-on-1 偏長，建議聚焦 2～3 個重點。");
      return finalize(blocks, warns, checks);
    },
  },
  {
    id: "retro",
    label: "復盤檢討會",
    en: "Project Retrospective",
    emoji: "🔄",
    tagline: "專案結束檢討・防抓戰犯・聚焦行動優化",
    primaryListKey: "actions",
    linkKeys: ["retroDoc"],
    duration: { default: 60, options: [45, 60, 90] },
    fields: [
      { key: "title", type: "text", label: "復盤主題", placeholder: "例：結帳改版上線後復盤", required: true },
      { key: "participants", type: "participants", label: "參與復盤成員", placeholder: "相關單位，按 Enter", required: false },
      { key: "wentWell", type: "list", label: "做得好的地方", placeholder: "例：跨部門溝通節奏穩定", required: true },
      { key: "toImprove", type: "list", accent: "coral", label: "可改善的地方", placeholder: "例：需求凍結時機太晚", required: true, hint: "對事不對人" },
      { key: "actions", type: "list", ordered: true, label: "下次要改變的行動", placeholder: "例：需求凍結後 48h 內出風險清單", required: true, hint: "沒行動的復盤等於抓戰犯" },
      { key: "retroDoc", type: "link", label: "復盤紀錄連結", placeholder: "貼上共編文件（選填可會後補）", required: false },
    ],
    evaluate(v) {
      const checks = [
        { ok: hasList(v.wentWell), label: "已列做得好的地方" },
        { ok: hasList(v.toImprove), label: "已列可改善之處" },
        { ok: hasList(v.actions), label: "已產出具體行動" },
        { ok: (v.durationMin || 0) <= 90, label: "時間 ≤ 90 分" },
      ];
      const blocks = [], warns = [];
      if (!hasList(v.wentWell)) blocks.push("沒有肯定做得好的地方，氛圍易變追責。");
      if (!hasList(v.toImprove)) blocks.push("沒有可改善清單，復盤失去焦點。");
      if (!hasList(v.actions)) blocks.push("沒有下次行動，復盤只會變成抓戰犯。");
      if (!has(v.retroDoc)) warns.push("未附紀錄連結，行動項容易散失。");
      if ((v.durationMin || 0) > 90) warns.push("復盤過長，建議拆成兩段或先非同步收集。");
      return finalize(blocks, warns, checks);
    },
  },
  {
    id: "qbr",
    label: "客戶成功 QBR",
    en: "Customer Success QBR",
    emoji: "👑",
    tagline: "定期季度業務回顧・售後維護",
    primaryListKey: "valueWins",
    linkKeys: ["qbrDeck"],
    duration: { default: 60, options: [45, 60, 90] },
    fields: [
      { key: "title", type: "text", label: "QBR 主題", placeholder: "例：2026 Q2 客戶成功季度回顧", required: true },
      { key: "participants", type: "participants", label: "客戶與內部出席", placeholder: "客戶窗口 + CSM / AE，按 Enter", required: false },
      { key: "clientName", type: "text", label: "客戶 / 帳戶名稱", placeholder: "例：宏達電 · Enterprise", required: true },
      { key: "valueWins", type: "list", ordered: true, label: "本季價值成果", placeholder: "例：客訴處理時效 ↓ 35%", required: true, hint: "用數據說話" },
      { key: "healthRisks", type: "list", accent: "coral", label: "健康度風險 / 流失警訊", placeholder: "例：關鍵用戶活躍度下滑（選填）", required: false },
      { key: "nextQuarterPlan", type: "list", ordered: true, label: "下季共創計畫", placeholder: "例：導入新模組 POC", required: true },
      { key: "qbrDeck", type: "link", label: "QBR 簡報連結", placeholder: "貼上季度回顧簡報", required: true },
      { key: "renewalNote", type: "text", label: "續約 / 擴張備註", placeholder: "例：Q4 續約窗口，先談加購席次", required: false },
    ],
    evaluate(v) {
      const checks = [
        { ok: has(v.clientName), label: "已填客戶 / 帳戶" },
        { ok: hasList(v.valueWins), label: "已列本季價值成果" },
        { ok: hasList(v.nextQuarterPlan), label: "已定下季共創計畫" },
        { ok: has(v.qbrDeck), label: "已附 QBR 簡報" },
        { ok: (v.durationMin || 0) <= 90, label: "時間 ≤ 90 分" },
      ];
      const blocks = [], warns = [];
      if (!has(v.clientName)) blocks.push("尚未填寫客戶 / 帳戶名稱。");
      if (!hasList(v.valueWins)) blocks.push("沒有本季價值成果，QBR 難建立信任。");
      if (!hasList(v.nextQuarterPlan)) blocks.push("沒有下季計畫，會議易變成單向報告。");
      if (!has(v.qbrDeck)) blocks.push("未附 QBR 簡報 —— 對外季度會必備。");
      if (!hasList(v.healthRisks)) warns.push("未列健康度風險，流失警訊可能被忽略。");
      if (!has(v.renewalNote)) warns.push("未註記續約 / 擴張機會。");
      if ((v.durationMin || 0) > 90) warns.push("QBR 偏長，建議精簡故事線。");
      return finalize(blocks, warns, checks);
    },
  },
];

// ── 🎓 學生模式（分組報告 / 專題製作）─────────────────────────────────────────
const STUDENT = [
  // 場景一：期初分工與主題對焦（對應「對客戶」）
  {
    id: "kickoff",
    label: "期初分工",
    en: "Kickoff & Topic Focus",
    emoji: "🤝",
    tagline: "主題對焦・認領任務",
    primaryListKey: "decisions",
    linkKeys: ["rubricLink"],
    duration: { default: 45, options: [30, 45, 60, 90] },
    fields: [
      { key: "title", type: "text", label: "報告主題 / 題目", placeholder: "例：行銷個案分析 期末專題", required: true },
      { key: "participants", type: "participants", label: "組員名單", placeholder: "輸入組員姓名，按 Enter", required: false },
      { key: "courseName", type: "text", label: "課程 / 授課教授", placeholder: "例：行銷管理・王教授", required: true },
      { key: "decisions", type: "list", ordered: true, label: "本次要拍板的事項", placeholder: "例：確定題目切入角度", required: true, hint: "逐條新增・放行關鍵" },
      { key: "rubricLink", type: "link", label: "題目說明 / 評分標準連結", placeholder: "貼上教授的作業說明或 Rubric", required: true, hint: "先看懂怎麼被打分" },
      { key: "nextStep", type: "text", label: "散會前每人認領的任務", placeholder: "例：每人下週前交一份文獻摘要", required: true, hint: "別讓大家空手離開" },
      { key: "blockers", type: "list", accent: "coral", label: "目前卡關 / 沒方向的點", placeholder: "例：不確定要質化還是量化（選填）", required: false },
    ],
    evaluate(v) {
      const checks = [
        { ok: has(v.courseName), label: "已填課程 / 授課教授" },
        { ok: hasList(v.decisions), label: "已列出要拍板的事項" },
        { ok: has(v.rubricLink), label: "已附題目說明 / 評分標準" },
        { ok: has(v.nextStep), label: "每人已認領下一步任務" },
        { ok: (v.durationMin || 0) <= 60, label: "時間 ≤ 60 分（別空聊）" },
      ];
      const blocks = [], warns = [];
      if (!has(v.courseName)) blocks.push("尚未填課程 / 授課教授。");
      if (!hasList(v.decisions)) blocks.push("還沒確定要拍板的事項，開會容易變閒聊。");
      if (!has(v.rubricLink)) blocks.push("沒附題目說明 / 評分標準 —— 不知道怎麼被打分就先別開。");
      if (!has(v.nextStep)) blocks.push("沒有人認領下一步任務，散會等於白開。");
      if ((v.durationMin || 0) > 60) warns.push("期初會議偏長，建議 60 分內收斂方向。");
      if (!hasList(v.blockers)) warns.push("沒列出卡關點，討論可能抓不到重點。");
      return finalize(blocks, warns, checks);
    },
  },
  // 場景二：進度拼湊與邏輯對齊（對應「上對下」）
  {
    id: "assemble",
    label: "進度拼湊",
    en: "Assemble & Align",
    emoji: "📢",
    tagline: "組裝報告・對齊邏輯",
    primaryListKey: "sections",
    linkKeys: ["draftLink"],
    duration: { default: 45, options: [30, 45, 60, 90] },
    fields: [
      { key: "title", type: "text", label: "組裝會議主題", placeholder: "例：期末報告 PPT 合體", required: true },
      { key: "participants", type: "participants", label: "組員名單", placeholder: "輸入組員姓名，按 Enter", required: false },
      { key: "sections", type: "list", ordered: true, label: "各章節負責與現況", placeholder: "例：第2章 文獻 - Amy - 完成 80%", required: true, hint: "寫上進度才抓得出混分隊友" },
      { key: "mainLogic", type: "text", label: "報告主軸邏輯（一句話串起全篇）", placeholder: "例：從問題→分析→解方 一條線講完", required: true, hint: "先講 Why 才不會拼貼" },
      { key: "draftLink", type: "link", label: "目前草稿 / 共編檔連結", placeholder: "貼上共編 PPT / 文件連結", required: true, hint: "誰的段落還空著一目了然" },
      { key: "finalForm", type: "text", label: "完成後的樣子", placeholder: "例：25 頁完整 PPT + 講稿", required: false },
      { key: "deadline", type: "text", label: "組裝完成期限", placeholder: "例：報告前三天", required: false },
    ],
    evaluate(v) {
      const checks = [
        { ok: hasList(v.sections), label: "已列出各章節負責與現況" },
        { ok: has(v.mainLogic), label: "已定義報告主軸邏輯" },
        { ok: has(v.draftLink), label: "已附共編草稿連結" },
        { ok: has(v.deadline), label: "已設定組裝完成期限" },
        { ok: (v.durationMin || 0) <= 60, label: "時間 ≤ 60 分" },
      ];
      const blocks = [], warns = [];
      if (!hasList(v.sections)) blocks.push("沒有列出各章節負責與現況，抓不出誰還沒動工。");
      if (!has(v.mainLogic)) blocks.push("沒有一條主軸把各段串起來，報告會像拼貼。");
      if (!has(v.draftLink)) blocks.push("沒附共編草稿連結，無法確認每個段落是否真的生出來。");
      if (!has(v.deadline)) warns.push("未設定組裝完成期限，容易拖到報告前一晚。");
      if (!has(v.finalForm)) warns.push("未描述完成後的樣子，成員對交付標準可能不一致。");
      if ((v.durationMin || 0) > 60) warns.push("組裝會議偏長，建議先各自補齊再合體。");
      return finalize(blocks, warns, checks);
    },
  },
  // 場景三：上台前總彩排（對應「向上匯報」）
  {
    id: "rehearsal",
    label: "上台彩排",
    en: "Final Rehearsal",
    emoji: "📈",
    tagline: "抓時間・對口條",
    primaryListKey: "segments",
    linkKeys: ["slidesLink"],
    duration: { default: 15, options: [10, 15, 20, 30] },
    fields: [
      { key: "title", type: "text", label: "報告主題", placeholder: "例：期末專題正式報告", required: true },
      { key: "participants", type: "participants", label: "上台順序 / 分工", placeholder: "依上台順序輸入，按 Enter", required: false },
      { key: "segments", type: "list", ordered: true, label: "每人段落與預估時間", placeholder: "例：Amy 引言 2 分", required: true, hint: "逐段抓時間" },
      { key: "presentLimit", type: "choice", label: "上台限時（硬性）", required: true, options: [
        { value: "5", label: "5 分" },
        { value: "8", label: "8 分" },
        { value: "10", label: "10 分" },
        { value: "12", label: "12 分" },
        { value: "15", label: "15 分" },
      ] },
      { key: "slidesLink", type: "link", label: "最終投影片連結", placeholder: "貼上最終版投影片", required: true, hint: "沒投影片彩排什麼？" },
      { key: "weakSpots", type: "list", accent: "coral", label: "還不熟 / 要加強的地方", placeholder: "例：Q&A 應答、轉場銜接（選填）", required: false },
    ],
    evaluate(v) {
      const checks = [
        { ok: hasList(v.segments), label: "已列出每人段落與時間" },
        { ok: has(v.presentLimit), label: "已設定上台限時" },
        { ok: has(v.slidesLink), label: "已附最終投影片" },
        { ok: (v.durationMin || 0) <= 30, label: "彩排 ≤ 30 分（硬性）" },
      ];
      const blocks = [], warns = [];
      if ((v.durationMin || 0) > 30) blocks.push("彩排會議超過 30 分鐘 —— 重點是練不是聊，直接阻擋。");
      if (!hasList(v.segments)) blocks.push("沒有列出每人段落與時間，彩排無從抓節奏。");
      if (!has(v.presentLimit)) blocks.push("沒設定上台限時，練不出時間感 —— 直接阻擋。");
      if (!has(v.slidesLink)) blocks.push("沒附最終投影片，沒東西可彩排。");
      if (!hasList(v.weakSpots)) warns.push("沒列出要加強的地方，彩排效果有限。");
      return finalize(blocks, warns, checks);
    },
  },
  // 場景四：自由腦力激盪（對應「腦力激盪」）
  {
    id: "ideate",
    label: "腦力激盪",
    en: "Free Brainstorming",
    emoji: "💡",
    tagline: "專題發想・創意討論",
    primaryListKey: "topics",
    linkKeys: ["refLink"],
    duration: { default: 45, options: [30, 45, 60, 90] },
    fields: [
      { key: "title", type: "text", label: "討論主題", placeholder: "例：專題題目大方向發想", required: true },
      { key: "participants", type: "participants", label: "組員", placeholder: "輸入組員姓名，按 Enter", required: false },
      { key: "topics", type: "list", ordered: true, label: "要發想的問題 / 方向", placeholder: "例：有哪些題目選項？", required: true, hint: "逐條新增" },
      { key: "mode", type: "choice", label: "期望產出", required: true, options: [
        { value: "diverge", label: "🌱 發散更多點子" },
        { value: "converge", label: "🎯 收斂選定方向" },
      ] },
      { key: "recorder", type: "text", label: "記錄長（誰整理結論）", placeholder: "誰負責把結論記下來？例：Amy", required: true, hint: "避免發想完什麼都沒留下" },
      { key: "refLink", type: "link", label: "參考靈感連結", placeholder: "選填，範例 / 參考資料", required: false },
    ],
    evaluate(v) {
      const n = (v.participants || []).length;
      const checks = [
        { ok: hasList(v.topics), label: "已列出要發想的方向" },
        { ok: has(v.mode), label: "已選定期望產出（發散 / 收斂）" },
        { ok: has(v.recorder), label: "已指定記錄長" },
        { ok: n > 0 && n <= 8, label: "與會 ≤ 8 人" },
      ];
      const blocks = [], warns = [];
      if (!hasList(v.topics)) blocks.push("沒有要發想的問題 / 方向。");
      if (!has(v.mode)) blocks.push("未選定期望產出，發散與收斂的開法完全不同。");
      if (!has(v.recorder)) blocks.push("沒指定記錄長，發想完可能什麼都沒留下。");
      if (n > 8) warns.push("與會超過 8 人，發想容易失焦。");
      if (v.mode === "converge" && (v.durationMin || 0) > 60) warns.push("收斂選定卻排超過 60 分，建議分段。");
      return finalize(blocks, warns, checks);
    },
  },
];

// ── 匯出 ─────────────────────────────────────────────────────────────────────
export const ENTERPRISE_SCENARIO_TABS = [
  {
    id: "daily",
    label: "日常商務",
    scenarioIds: ["client", "topdown", "bottomup", "crossdept"],
  },
  {
    id: "deep",
    label: "深度管理",
    scenarioIds: ["brainstorm", "oneonone", "retro", "qbr"],
  },
];

export const MODES = {
  enterprise: {
    id: "enterprise",
    label: "企業模式",
    emoji: "🏢",
    scenarios: ENTERPRISE,
    scenarioTabs: ENTERPRISE_SCENARIO_TABS,
  },
  student: { id: "student", label: "學生模式", emoji: "🎓", scenarios: STUDENT },
};

export const MODE_LIST = [MODES.enterprise, MODES.student];

export const getMode = (modeId) => MODES[modeId] || MODES.enterprise;

export const getScenario = (modeId, scenarioId) => {
  const m = getMode(modeId);
  return m.scenarios.find((s) => s.id === scenarioId) || m.scenarios[0];
};

/** 依 Tab 取得該分類下的場景（無 Tab 則回全部） */
export const getScenariosForTab = (modeId, tabId) => {
  const m = getMode(modeId);
  const tabs = m.scenarioTabs;
  if (!tabs?.length) return m.scenarios;
  const tab = tabs.find((t) => t.id === tabId) || tabs[0];
  return tab.scenarioIds
    .map((id) => m.scenarios.find((s) => s.id === id))
    .filter(Boolean);
};

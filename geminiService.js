import { GoogleGenAI } from "@google/genai";

/** 預設用官方建議後繼型號；可用 .env 的 GEMINI_MODEL 覆寫 */
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];

function resolveGeminiModel() {
  const fromEnv = (process.env.GEMINI_MODEL || "").trim();
  return fromEnv || DEFAULT_GEMINI_MODEL;
}

const RESPONSE_SCHEMA_HINT = `{
  "ideas": ["靈感點子字串"],
  "decisions": ["決議字串"],
  "risks": [
    {
      "text": "風險問題描述",
      "level": "high | medium | low",
      "mitigation": "具體的預防或應對做法"
    }
  ],
  "actionItems": [
    { "text": "由 AI 提出的可能需要做的事項（不要指定負責人）" }
  ]
}`;

const INSUFFICIENT_MSG =
  "偵測到本次會議口語筆記資訊量不足，無法完整萃取。建議補充討論重點、決策與待辦後再整理。";

const INSUFFICIENT_PAYLOAD = {
  ideas: [INSUFFICIENT_MSG],
  decisions: [
    "偵測到本次會議口語筆記資訊量不足，無法完整萃取決議事項。請補上達成共識的結論後再試。",
  ],
  risks: [
    {
      text: "因筆記資訊量不足，暫無法評估潛在風險。",
      level: "low",
      mitigation: "補齊討論重點與結論後重新整理。",
    },
  ],
  actionItems: [],
};

const MOCK_BY_MODE = {
  enterprise: {
    ideas: [
      "將跨部門對齊會議改為雙週非同步摘要，節省約 40% 工時成本。",
      "以里程碑驗收取代週報堆積，讓決策節點更可追蹤。",
    ],
    decisions: [
      "本季優先交付核心路徑功能，次要需求列入下一個 sprint backlog。",
      "對外溝通統一由專案窗口彙整，避免多線平行承諾造成成本失控。",
    ],
    risks: [
      {
        text: "依賴方交付時程未鎖定，可能壓縮整合測試窗口。",
        level: "high",
        mitigation: "本週內與依賴方鎖定交付日，並預留 3 天緩衝。",
      },
      {
        text: "需求變更未走流程，易造成重工與預算偏差。",
        level: "medium",
        mitigation: "所有變更一律走變更單，並標註影響工時。",
      },
    ],
    actionItems: [
      { text: "產出本週風險與依賴清單，並標註影響工時" },
      { text: "與利害關係人確認驗收標準與截止日期" },
    ],
  },
  student: {
    ideas: [
      "報告開頭直接放 30 秒「我們到底在幹嘛」短片，教授比較會醒。",
      "分工表改成公開可看，誰在混分一目瞭然，別再靠感覺吵架。",
    ],
    decisions: [
      "這週五前一定要定題目與大綱，不然週末又會集體消失。",
      "投影片統一模板，禁止每人一種字體地獄。",
    ],
    risks: [
      {
        text: "有人進度永遠卡在「我再想一下」，最後開天窗。",
        level: "high",
        mitigation: "設每週五中午的進度檢查點，交不出來就換人接手。",
      },
      {
        text: "最後一夜才整併投影片，變成拼貼地獄。",
        level: "medium",
        mitigation: "報告前三天先合體一次，統一模板與字體。",
      },
    ],
    actionItems: [
      { text: "今晚前交出各自負責的段落草稿（不能只交大綱）" },
      { text: "把大家的草稿整合成能上台的版本" },
    ],
  },
};

/** 字數過少、重複亂鍵、無實質內容 → 視為無效筆記 */
export function isNotesInsufficient(notes) {
  const raw = String(notes || "").trim();
  if (!raw || raw === "（空白筆記）") return true;
  if (raw.length < 24) return true;
  // 同一字元狂按：dddd / aaaa
  if (/^(.)\1{2,}$/u.test(raw)) return true;
  // 幾乎只有 1～2 種字元
  const compact = raw.replace(/\s+/g, "");
  const unique = new Set([...compact]);
  if (compact.length >= 4 && unique.size <= 2) return true;
  // 沒有中文且幾乎沒有空白／標點的短英文字串
  const hasCjk = /[\u4e00-\u9fff]/.test(raw);
  const wordCount = (raw.match(/[A-Za-z]{2,}/g) || []).length;
  if (!hasCjk && wordCount <= 1 && raw.length < 40) return true;
  return false;
}

function systemInstructionFor(mode) {
  const shared = [
    "【精簡萃取・最高優先・強制遵守】",
    "只做「點到為止」的精華萃取：高度貼近左側／原文口語筆記，禁止過度包裝、禁止商務廢話、禁止無中生有。",
    "反例（禁止）：把「把手寫稿完成」擴寫成「評估導入手寫辨識技術以提升數位化流程…」之類冗長腦補。",
    "正例（允許）：整理成「完成手寫稿」或「把手寫稿完成」這類短句即可。",
    "ideas / decisions / risks / actionItems 每條盡量 ≤ 30 個中文字，能短則短；沒寫到的主題不要發明。",
    "若筆記只提到 1～2 件具體事，就只輸出對應的少數條目，寧缺勿濫。",
    "",
    "【有效性判斷】",
    "若筆記過短、空白、或明顯是無意義亂打（例如 dd、dddd、asdf、只有單一字元重複），",
    "絕對禁止把亂字串當成專案名稱、產品名、決議或靈感來腦補。",
    "此時 ideas 與 decisions 溫和回傳「資訊量不足、無法完整萃取」引導句；risks 說明暫無法評估；actionItems 必須為 []。",
    "",
    "【風險規則】",
    "risks 每一項必須是物件，含 text（風險描述）、level（high/medium/low）、mitigation（建議對策）。",
    "mitigation 必須是「可立刻執行的具體做法」，例如：先上架 3-5 項主力商品做 A/B Test、設滿額門檻 1500 元確保毛利。",
    "禁止空泛對策（如「加強溝通」「多加注意」「持續追蹤」）；text 與 mitigation 各盡量 ≤ 30 個中文字。",
    "level 判準：會直接擋住交付或造成損失 = high；影響品質/時程但可補救 = medium；僅需留意 = low。",
    "",
    "【負責人規則】",
    "actionItems 只能包含 text 欄位，禁止輸出 assignee、who、負責人、姓名。",
    "待辦由與會者事後自行認領／由上級指派，你不可預先分配。",
    "",
    "只輸出符合指定 JSON Schema 的純 JSON，不要 markdown、不要多餘說明。",
  ];

  if (mode === "student") {
    return [
      "你是一位直白的大學學長，把分組口語筆記整理成短句摘要。",
      "語氣白話即可，但一樣禁止腦補沒寫過的東西。",
      "風險僅在筆記有跡象時才寫（混分／擺爛等），不要硬掰人名。",
      ...shared,
    ].join("\n");
  }
  return [
    "你是會議紀要助理：做結構化精簡萃取，不是顧問簡報撰稿人。",
    "語氣客觀精煉；禁止行銷腔、禁止堆砌工時／成本套話（除非筆記原文有提）。",
    ...shared,
  ].join("\n");
}

function buildUserPrompt({ notes, participants, title, mode }) {
  const people =
    Array.isArray(participants) && participants.length
      ? participants.join("、")
      : "（未提供）";
  return [
    `會議標題：${title || "未命名會議"}（僅供參考；若筆記無效，勿用標題硬凹出決議）`,
    `應用模式：${mode === "student" ? "學生模式" : "企業模式"}`,
    `與會者：${people}（僅供語境；請勿在 actionItems 寫入負責人）`,
    "",
    "請根據以下會議原始口語筆記，做「精簡、貼近原文」的結構化萃取（禁止過度腦補）。",
    "回傳 JSON 必須嚴格符合下列 Schema（欄位名稱不可更改；actionItems 只有 text）：",
    RESPONSE_SCHEMA_HINT,
    "",
    "—— 會議原始口語筆記開始 ——",
    (notes || "").trim() || "（空白筆記）",
    "—— 會議原始口語筆記結束 ——",
  ].join("\n");
}

function normalizePayload(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const ideas = Array.isArray(data?.ideas) ? data.ideas.map(String).filter(Boolean) : [];
  const decisions = Array.isArray(data?.decisions)
    ? data.decisions.map(String).filter(Boolean)
    : [];
  // 風險：新版為物件 { text, level, mitigation }；同時相容舊版純字串
  const LEVELS = new Set(["high", "medium", "low"]);
  const risks = Array.isArray(data?.risks)
    ? data.risks
        .map((it) => {
          if (typeof it === "string") {
            return { text: it.trim(), level: "medium", mitigation: "" };
          }
          const text = String(it?.text || it?.risk || "").trim();
          if (!text) return null;
          const lv = String(it?.level || "").trim().toLowerCase();
          return {
            text,
            level: LEVELS.has(lv) ? lv : "medium",
            mitigation: String(it?.mitigation || it?.action || "").trim(),
          };
        })
        .filter((it) => it && it.text)
    : [];
  const actionItems = Array.isArray(data?.actionItems)
    ? data.actionItems
        .map((it) => ({
          text: String(it?.text || it?.task || "").trim(),
        }))
        .filter((it) => it.text)
    : [];
  return { ideas, decisions, risks, actionItems };
}

function mockPayload(mode) {
  return MOCK_BY_MODE[mode === "student" ? "student" : "enterprise"];
}

function extractResponseText(response) {
  if (typeof response?.text === "string" && response.text.trim()) return response.text;
  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((p) => p?.text || "").join("");
  }
  return "";
}

/**
 * 會後整理：優先用後端 GEMINI_API_KEY 呼叫 Gemini；無 Key 或失敗則降級 Mock。
 * API Key 只存在於伺服器環境變數，不會回傳給前端。
 */
export async function summarizeMeetingNotes({
  notes = "",
  participants = [],
  title = "",
  mode = "enterprise",
} = {}) {
  const safeMode = mode === "student" ? "student" : "enterprise";

  // 無效筆記：直接回傳引導句，避免 Gemini 把「dd」腦補成專案名
  if (isNotesInsufficient(notes)) {
    return {
      ...INSUFFICIENT_PAYLOAD,
      source: "insufficient",
      message: "筆記資訊量不足，已略過 Gemini 並回傳引導提示",
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      ...mockPayload(safeMode),
      source: "mock",
      message: "後端未設定 GEMINI_API_KEY，已使用雙模式 Mock 資料",
    };
  }

  const preferred = resolveGeminiModel();
  const modelsToTry = [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)];
  const ai = new GoogleGenAI({ apiKey });
  const contents = buildUserPrompt({
    notes,
    participants,
    title,
    mode: safeMode,
  });
  const config = {
    responseMimeType: "application/json",
    systemInstruction: systemInstructionFor(safeMode),
  };

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({ model, contents, config });
      const text = extractResponseText(response);
      const payload = normalizePayload(text);
      return {
        ...payload,
        source: "gemini",
        model,
        message: `Gemini（${model}）分析完成`,
      };
    } catch (err) {
      lastError = err;
      console.error(`[geminiService] model=${model}`, err?.message || err);
    }
  }

  return {
    ...mockPayload(safeMode),
    source: "mock",
    message: `Gemini 請求失敗，已降級 Mock：${lastError?.message || "未知錯誤"}`,
  };
}

export function geminiConfigured() {
  return Boolean((process.env.GEMINI_API_KEY || "").trim());
}

/* ══════════════════════════════════════════════════════════════════════════
   個人化私密洞察（Private Insights）

   ⚠ 隱私邊界：本函式的輸入含「使用者的私密康乃爾筆記」，輸出僅回傳給該使用者。
     呼叫端【絕對不可】把結果寫回 meeting 物件或用 socket 廣播——
     meeting 會同步給所有 memberIds，寫進去等同公開。
   ══════════════════════════════════════════════════════════════════════════ */

const PRIVATE_SCHEMA_HINT = `{
  "privateActions": [
    { "text": "只跟這位使用者有關的私下待辦（動詞開頭、可執行）" }
  ],
  "insights": [
    {
      "type": "learning | decision",
      "title": "8-16 字的短標題",
      "body": "40-80 字的具體建議，要引用他筆記裡的線索"
    }
  ]
}`;

const PRIVATE_MOCK = {
  privateActions: [
    { id: "pa1", text: "把筆記裡打問號的地方，會後私下向負責人問清楚", done: false },
    { id: "pa2", text: "整理一份自己的觀點備忘，在下次會議前先送出", done: false },
  ],
  insights: [
    {
      type: "learning",
      title: "補齊你重複打問號的概念",
      body: "你的線索欄出現多次疑問，代表這塊背景知識還沒打通。建議會後花 30 分鐘查清定義與計算方式，下次才有底氣提出反論。",
    },
    {
      type: "decision",
      title: "把沒說出口的疑慮轉成提案",
      body: "筆記中有你當下沒有表達的顧慮。未表達的風險最容易事後爆炸，建議整理成一頁備忘，於下次同步前先給決策者。",
    },
  ],
};

function privateSystemInstruction(mode) {
  const shared = [
    "你是這位使用者的私人會議教練，只服務他一個人。",
    "輸入包含兩種材料：(A) 全場逐字稿或共編筆記；(B) 這位使用者的私密康乃爾筆記。",
    "【核心規則】",
    "1. 一切輸出必須以『這位使用者』為主詞，不要產出全場性的結論或決議。",
    "2. 優先處理他線索欄裡的疑問（?）、星號（★）與未表達的顧慮，這些是他真正卡住的地方。",
    "3. privateActions 只寫他自己能獨立完成的事，禁止指派他人、禁止與全員 action item 重複。",
    "4. 每條建議都要引用他筆記中的具體線索，禁止「多加溝通」「持續關注」這類空話。",
    "5. type=learning 是知識/能力缺口；type=decision 是行為或表達策略建議。",
    "6. 若私密筆記幾乎沒有內容，privateActions 與 insights 都回傳空陣列，不要腦補。",
    "7. 只輸出 JSON，不要 markdown 圍欄或任何解釋文字。",
    `【輸出格式】\n${PRIVATE_SCHEMA_HINT}`,
  ];
  const tone =
    mode === "student"
      ? "語氣像講話直接的學長姐，白話、不客套，但不刻薄。"
      : "語氣像資深顧問，精準、務實，聚焦職涯與決策品質。";
  return [...shared, tone].join("\n");
}

function normalizePrivatePayload(raw) {
  let data = raw;
  if (typeof raw === "string") {
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      data = JSON.parse(cleaned);
    } catch {
      data = {};
    }
  }
  const privateActions = Array.isArray(data?.privateActions)
    ? data.privateActions
        .map((it, i) => {
          const text = String(typeof it === "string" ? it : it?.text || "").trim();
          return text ? { id: `pa${i + 1}`, text, done: false } : null;
        })
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const insights = Array.isArray(data?.insights)
    ? data.insights
        .map((it) => {
          const title = String(it?.title || "").trim();
          const body = String(it?.body || "").trim();
          if (!title || !body) return null;
          return { type: it?.type === "decision" ? "decision" : "learning", title, body };
        })
        .filter(Boolean)
        .slice(0, 4)
    : [];
  return { privateActions, insights };
}

/** 私密筆記是否足以分析 */
export function isCornellInsufficient(cornell) {
  const joined = [cornell?.cue, cornell?.notes, cornell?.summary]
    .map((s) => String(s || "").trim())
    .join("");
  return joined.replace(/\s+/g, "").length < 12;
}

export async function generatePrivateInsights({
  cornell = { cue: "", notes: "", summary: "" },
  transcript = "",
  groupNotes = "",
  title = "",
  mode = "enterprise",
} = {}) {
  const safeMode = mode === "student" ? "student" : "enterprise";

  if (isCornellInsufficient(cornell)) {
    return {
      privateActions: [],
      insights: [],
      source: "insufficient",
      message: "私密筆記內容過少，無法產生個人化建議。試著在線索欄記下你的疑問或想跟進的點。",
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return { ...PRIVATE_MOCK, source: "mock", message: "後端未設定 GEMINI_API_KEY，已使用示範建議" };
  }

  const contents = [
    `【會議主題】${title || "（未命名會議）"}`,
    "",
    "【A. 全場內容（逐字稿／共編筆記）】",
    String(transcript || groupNotes || "（本場未擷取到逐字稿）").slice(0, 12000),
    "",
    "【B. 這位使用者的私密康乃爾筆記】",
    `線索欄：${String(cornell.cue || "（空）").slice(0, 2000)}`,
    `筆記欄：${String(cornell.notes || "（空）").slice(0, 4000)}`,
    `摘要欄：${String(cornell.summary || "（空）").slice(0, 2000)}`,
    "",
    "請依系統指示，只針對這位使用者輸出 JSON。",
  ].join("\n");

  const preferred = resolveGeminiModel();
  const modelsToTry = [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)];
  const ai = new GoogleGenAI({ apiKey });
  const config = {
    responseMimeType: "application/json",
    systemInstruction: privateSystemInstruction(safeMode),
  };

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({ model, contents, config });
      const payload = normalizePrivatePayload(extractResponseText(response));
      return { ...payload, source: "gemini", model, message: `Gemini（${model}）個人化分析完成` };
    } catch (err) {
      lastError = err;
      console.error(`[geminiService/private] model=${model}`, err?.message || err);
    }
  }

  return {
    ...PRIVATE_MOCK,
    source: "mock",
    message: `Gemini 請求失敗，已降級示範建議：${lastError?.message || "未知錯誤"}`,
  };
}

/**
 * 會中靜音問答：僅回傳文字，不產生語音。
 * 將「語音問題 + 近 5 分鐘逐字稿」一起打包給 LLM。
 */
export async function answerLiveSilentAsk({
  question = "",
  meetingTranscript = "",
  title = "",
  topic = "",
  mode = "enterprise",
} = {}) {
  const q = String(question || "").trim();
  const safeMode = mode === "student" ? "student" : "enterprise";
  if (!q) {
    return { answer: "請先說出問題。", source: "insufficient", silent: true };
  }

  const contextBlock = String(meetingTranscript || "").trim() || "（尚無近 5 分鐘逐字稿）";
  const mockAnswer =
    safeMode === "student"
      ? `針對「${q}」：依目前討論脈絡，建議先對齊這題要交什麼、誰負責、什麼時候交。可把共識寫進筆記，避免散會後又忘記。`
      : `針對「${q}」：建議先釐清決策目標、依賴與時程風險，再把可執行下一步寫入共編筆記，方便會後追蹤。`;

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return { answer: mockAnswer, source: "mock", silent: true };
  }

  const preferred = resolveGeminiModel();
  const modelsToTry = [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)];
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `你是會議中的靜音文字助理。規則：
1. 只輸出純文字答案，絕不要求語音播報、也不模擬口語主持。
2. 回答精簡、可直接貼進筆記（2–6 句或條列）。
3. 優先依據「近 5 分鐘會議逐字稿」回答；不足時明確說明假設。
4. 使用繁體中文。

會議主題：${title || "未命名"}
當前議程：${topic || "一般討論"}
近 5 分鐘逐字稿：
---
${contextBlock}
---
與會者語音問題：${q}`;

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.4 },
      });
      const text = extractResponseText(response).trim();
      if (text) {
        return { answer: text, source: "gemini", model, silent: true };
      }
    } catch (err) {
      lastError = err;
      console.error(`[geminiService/liveAsk] model=${model}`, err?.message || err);
    }
  }

  return {
    answer: mockAnswer,
    source: "mock",
    silent: true,
    message: `Gemini 失敗，已降級：${lastError?.message || "未知錯誤"}`,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   風險正規化：把 review.risks 統一成 { text, level, mitigation, suggested }
   ── 新版 AI 直接回傳物件（含 level / mitigation）
   ── 舊版（或快取）僅有字串時，用語意關鍵字推估等級並給出可執行的建議對策，
      並標記 suggested=true，UI 上誠實標示為「系統建議」。
   ════════════════════════════════════════════════════════════════════════ */

const LEVELS = new Set(["high", "medium", "low"]);

const IMPACT_HIGH = /(delay|延遲|來不及|卡住|中斷|違約|超支|停擺|賠|嚴重|開天窗|上線不了|流失)/i;
const IMPACT_MID = /(影響|成本|時程|品質|客訴|下降|壓縮|重工)/;
const PROB_HIGH = /(一定|勢必|已經|正在|持續|多次)/;
const PROB_MID = /(可能|恐|或許|不確定|待確認|需注意|依賴|等待|如果)/;

/** 依語意推估風險等級 */
export function guessLevel(text) {
  const s = String(text || "");
  const impact = IMPACT_HIGH.test(s) ? 3 : IMPACT_MID.test(s) ? 2 : 1;
  const prob = PROB_HIGH.test(s) ? 3 : PROB_MID.test(s) ? 2 : 1;
  const score = impact + prob;
  return score >= 5 ? "high" : score >= 4 ? "medium" : "low";
}

/** 沒有 AI 對策時，依風險類型給出可立即執行的建議 */
const MITIGATION_RULES = [
  { re: /(時程|延遲|來不及|deadline|截止|拖|開天窗)/i, tip: "設中間檢查點，並預留緩衝時間，逾期即換人接手。" },
  { re: /(成本|預算|超支|毛利|利潤|折扣|價格)/, tip: "設定門檻或上限（如滿額門檻），先小規模試算再放大。" },
  { re: /(轉換率|銷售|成效|不確定|未知|沒把握)/, tip: "先挑 3-5 項主力做小規模 A/B 驗證，再決定是否全面投入。" },
  { re: /(品質|測試|bug|錯誤|穩定)/i, tip: "先在小範圍試點驗證，通過後才全面推行。" },
  { re: /(人力|沒人|混分|擺爛|負責|認領)/, tip: "明確指派單一負責人並設定交付日，公開進度。" },
  { re: /(依賴|廠商|對方|等待|窗口|第三方)/, tip: "與對口鎖定交付日，同時準備備援方案。" },
  { re: /(溝通|認知|各說各話|對齊)/, tip: "會後 24 小時內發出書面結論，請各方回覆確認。" },
  { re: /(庫存|滯銷|積壓)/, tip: "設定出清期限與組合方案，逐週追蹤週轉率。" },
];

export function suggestMitigation(text) {
  const s = String(text || "");
  for (const rule of MITIGATION_RULES) {
    if (rule.re.test(s)) return rule.tip;
  }
  return "指定負責人追蹤，並於下次會議前回報處理進度。";
}

/** 統一輸出格式，供風險卡片直接渲染 */
export function normalizeRisks(risks = []) {
  if (!Array.isArray(risks)) return [];
  return risks
    .map((item) => {
      if (typeof item === "string") {
        const text = item.trim();
        if (!text) return null;
        return { text, level: guessLevel(text), mitigation: suggestMitigation(text), suggested: true };
      }
      const text = String(item?.text || item?.risk || "").trim();
      if (!text) return null;
      const lv = String(item?.level || "").trim().toLowerCase();
      const mitigation = String(item?.mitigation || item?.action || "").trim();
      return {
        text,
        level: LEVELS.has(lv) ? lv : guessLevel(text),
        mitigation: mitigation || suggestMitigation(text),
        suggested: !mitigation,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.level] - order[b.level];
    });
}

export const RISK_LEVEL_META = {
  high: {
    label: "高風險",
    dot: "bg-rose-500",
    badge: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-100 dark:border-rose-500/20",
    bar: "bg-rose-500",
  },
  medium: {
    label: "中風險",
    dot: "bg-amber-500",
    badge: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-100 dark:border-amber-500/20",
    bar: "bg-amber-500",
  },
  low: {
    label: "低風險",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-100 dark:border-emerald-500/20",
    bar: "bg-emerald-500",
  },
};

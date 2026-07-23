/**
 * 會後「結果導向」圖表資料層
 * ── 100% 由真實 meeting / review / actions 推算
 * ── 資料不足時回傳「誠實的空結構」（total 0、空陣列），
 *    絕不捏造示意數字（不再有 40% / 圓餅 mock）。
 */

const CATEGORY_RULES = [
  { name: "行銷", re: /(行銷|折扣|優惠|廣告|社群|轉換|促銷|券|曝光|投放|文案|活動)/ },
  { name: "商品", re: /(商品|SKU|庫存|品項|定價|上架|選品|滯銷|出清)/ },
  { name: "營運", re: /(營運|流程|客服|物流|出貨|SOP|對齊|窗口|排程|人力)/ },
  { name: "產品", re: /(產品|系統|開發|API|bug|功能|上線|技術|介面)/ },
];

const IMPACT_HIGH = /(營收|轉換|客戶|策略|核心|成長|效益|影響大|關鍵|主力)/;
const IMPACT_MID = /(改善|優化|提升|效率|品質|體驗)/;
const EFFORT_HIGH = /(重建|導入|系統|全面|大改|重構|跨部門|長期|專案)/;
const EFFORT_LOW = /(立刻|馬上|小改|調整|文案|簡單|快速|本週|先做)/;

const STATUS_META = {
  resolved: { label: "已解決", color: "#10B981", soft: "bg-emerald-50 text-emerald-700" },
  tracking: { label: "持續追蹤", color: "#F59E0B", soft: "bg-amber-50 text-amber-700" },
  unresolved: { label: "未解決", color: "#94A3B8", soft: "bg-slate-100 text-slate-600" },
};

const QUADRANT_META = {
  quickWins: { label: "Quick Wins", hint: "高效益 · 低難度", color: "#10B981" },
  majorProjects: { label: "Major Projects", hint: "高效益 · 高難度", color: "#3B82F6" },
  fillIns: { label: "Fill-ins", hint: "低效益 · 低難度", color: "#8B5CF6" },
  thankless: { label: "慎選投入", hint: "低效益 · 高難度", color: "#F59E0B" },
};

/** 對使用者友善的 P0 / P1 / P2 分級（對應四象限語意） */
export const PRIORITY_META = {
  P0: {
    key: "P0",
    title: "P0 優先執行",
    subtitle: "Quick Wins · 高效益 · 低難度",
    hint: "適合立即啟動",
    badge: "bg-emerald-500 text-white",
    soft: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20",
    accent: "text-emerald-700 dark:text-emerald-300",
    icon: "rocket",
  },
  P1: {
    key: "P1",
    title: "P1 核心專案",
    subtitle: "Major Projects · 高效益 · 高難度",
    hint: "需規劃專案執行",
    badge: "bg-blue-500 text-white",
    soft: "bg-blue-50 dark:bg-blue-500/10 border-blue-100 dark:border-blue-500/20",
    accent: "text-blue-700 dark:text-blue-300",
    icon: "target",
  },
  P2: {
    key: "P2",
    title: "P2 補充／次要任務",
    subtitle: "Fill-ins · 效益較低或成本偏高",
    hint: "有空再處理",
    badge: "bg-slate-500 text-white",
    soft: "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10",
    accent: "text-slate-600 dark:text-slate-300",
    icon: "zap",
  },
};

function priorityOf(quadrant) {
  if (quadrant === "quickWins") return "P0";
  if (quadrant === "majorProjects") return "P1";
  return "P2";
}

function impactLabel(impact) {
  return impact >= 5.5 ? "高" : "低";
}

function effortLabel(effort) {
  return effort >= 5.5 ? "高" : "低";
}

const CATEGORY_COLORS = {
  行銷: "#3B82F6",
  商品: "#8B5CF6",
  營運: "#10B981",
  產品: "#F59E0B",
  其他: "#94A3B8",
};

function tokenize(text = "") {
  return String(text)
    .toLowerCase()
    .split(/[\s,，、。；;：:/／|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function overlapScore(a, b) {
  const ta = new Set(tokenize(a));
  const tb = tokenize(b);
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const t of tb) if (ta.has(t)) hit += 1;
  return hit;
}

function scoreImpact(text) {
  const s = String(text || "");
  if (IMPACT_HIGH.test(s)) return 8 + Math.min(2, Math.floor(s.length / 40));
  if (IMPACT_MID.test(s)) return 5 + Math.min(2, Math.floor(s.length / 50));
  return 3 + Math.min(2, Math.floor(s.length / 60));
}

function scoreEffort(text) {
  const s = String(text || "");
  if (EFFORT_HIGH.test(s)) return 7 + Math.min(2, Math.floor(s.length / 45));
  if (EFFORT_LOW.test(s)) return 2 + Math.min(2, Math.floor(s.length / 55));
  return 4 + Math.min(2, Math.floor(s.length / 50));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function quadrantOf(effort, impact) {
  const highImpact = impact >= 5.5;
  const highEffort = effort >= 5.5;
  if (highImpact && !highEffort) return "quickWins";
  if (highImpact && highEffort) return "majorProjects";
  if (!highImpact && !highEffort) return "fillIns";
  return "thankless";
}

function classifyActionCategory(task) {
  const s = String(task || "");
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(s)) return rule.name;
  }
  return "其他";
}

function classifyPainStatus(pain, decisions, actions) {
  const painText = String(pain || "");
  let bestDecision = 0;
  for (const d of decisions) {
    bestDecision = Math.max(bestDecision, overlapScore(painText, d));
  }
  if (bestDecision >= 1) return "resolved";

  let bestAction = 0;
  for (const a of actions) {
    const task = a?.task || a?.text || "";
    bestAction = Math.max(bestAction, overlapScore(painText, task));
  }
  if (bestAction >= 1 || hasOpenAssignee(actions, painText)) return "tracking";
  return "unresolved";
}

function hasOpenAssignee(actions, painText) {
  // 若待辦語意碰觸痛點關鍵字且已認領 → 視為追蹤中
  const keys = tokenize(painText).slice(0, 4);
  if (!keys.length) return false;
  return actions.some((a) => {
    const task = String(a?.task || a?.text || "");
    const hit = keys.some((k) => task.includes(k));
    const assigned =
      (Array.isArray(a?.assignees) && a.assignees.length > 0) || Boolean(String(a?.who || "").trim());
    return hit && assigned;
  });
}

/** 痛點解決率：堆疊進度條資料 */
export function buildPainResolution({ pains = [], decisions = [], actions = [] } = {}) {
  const list = (pains || []).map(String).map((p) => p.trim()).filter(Boolean);
  if (!list.length) {
    // 沒有痛點就是沒有——回傳空結構，讓 UI 顯示誠實的空狀態，不捏造數字
    return {
      ...summarizePainCounts([]),
      items: [],
      fromMock: false,
      empty: true,
      insight: "本場沒有登錄痛點資料，無法計算解決率。",
    };
  }

  const items = list.map((pain) => ({
    pain,
    status: classifyPainStatus(pain, decisions, actions),
  }));
  const summary = summarizePainCounts(items);
  const rate = summary.total ? Math.round((summary.resolved / summary.total) * 100) : 0;
  let insight = `本場 ${summary.total} 項痛點中，${summary.resolved} 項已形成決議（解決率 ${rate}%）。`;
  if (summary.unresolved > 0) {
    insight += ` 仍有 ${summary.unresolved} 項未對應結論，建議下次會前先排優先序。`;
  } else if (summary.tracking > 0) {
    insight += ` 另有 ${summary.tracking} 項已進入待辦追蹤，請鎖定負責人與期限。`;
  } else {
    insight += " 痛點皆已對齊決議，會議產出品質佳。";
  }
  return { ...summary, items, fromMock: false, insight };
}

function summarizePainCounts(items) {
  const resolved = items.filter((i) => i.status === "resolved").length;
  const tracking = items.filter((i) => i.status === "tracking").length;
  const unresolved = items.filter((i) => i.status === "unresolved").length;
  const total = items.length;
  const segments = [
    { key: "resolved", ...STATUS_META.resolved, count: resolved },
    { key: "tracking", ...STATUS_META.tracking, count: tracking },
    { key: "unresolved", ...STATUS_META.unresolved, count: unresolved },
  ].map((s) => ({
    ...s,
    pct: total ? Math.round((s.count / total) * 100) : 0,
  }));
  return { total, resolved, tracking, unresolved, segments };
}

/** 決議優先級：供清單卡片使用（P0 / P1 / P2） */
export function buildDecisionPriority(decisions = []) {
  const list = (decisions || []).map(String).map((t) => t.trim()).filter(Boolean);
  // 沒有決議 → 回傳空結構，UI 顯示「本場尚未產出決議」，不套示意排序
  if (!list.length) {
    return {
      points: [],
      groups: { P0: [], P1: [], P2: [] },
      fromMock: false,
      empty: true,
      insight: "本場尚未產出決議，無法排定優先級。",
      priorityMeta: PRIORITY_META,
      quadrantMeta: QUADRANT_META,
    };
  }

  const source = list.map((text, i) => ({
    id: `dec-${i}`,
    text,
    effort: clamp(scoreEffort(text), 1, 10),
    impact: clamp(scoreImpact(text), 1, 10),
  }));

  const points = source.map((p) => {
    const effort = clamp(Number(p.effort) || 5, 1, 10);
    const impact = clamp(Number(p.impact) || 5, 1, 10);
    const quadrant = quadrantOf(effort, impact);
    const priority = priorityOf(quadrant);
    return {
      id: p.id,
      text: p.text,
      short: String(p.text).length > 28 ? `${String(p.text).slice(0, 28)}…` : p.text,
      effort,
      impact,
      impactLevel: impactLabel(impact),
      effortLevel: effortLabel(effort),
      quadrant,
      priority,
      ...QUADRANT_META[quadrant],
      ...PRIORITY_META[priority],
    };
  });

  const groups = {
    P0: points.filter((p) => p.priority === "P0"),
    P1: points.filter((p) => p.priority === "P1"),
    P2: points.filter((p) => p.priority === "P2"),
  };

  const p0 = groups.P0.length;
  const p1 = groups.P1.length;
  const insight = `共 ${points.length} 項決議：建議優先執行 ${p0} 項 P0 任務，以最低成本快速取得成果${
    p1 ? `；另有 ${p1} 項 P1 核心專案需排程投入` : ""
  }。`;

  return {
    points,
    groups,
    fromMock: false,
    insight,
    priorityMeta: PRIORITY_META,
    quadrantMeta: QUADRANT_META,
  };
}

/** 待辦領域結構（Donut） */
export function buildActionCategories(actions = []) {
  const list = Array.isArray(actions) ? actions : [];
  if (!list.length) {
    // 沒有待辦 → 空結構，不捏造行銷/商品圓餅
    return {
      segments: [],
      total: 0,
      fromMock: false,
      empty: true,
      insight: "本場尚無待辦事項，無法統計領域分布。",
    };
  }

  const map = new Map();
  for (const a of list) {
    const name = classifyActionCategory(a?.task || a?.text || "");
    map.set(name, (map.get(name) || 0) + 1);
  }
  const rows = [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((n, r) => n + r.count, 0);
  const segments = rows.map((r) => ({
    name: r.name,
    count: r.count,
    value: total ? Math.round((r.count / total) * 100) : 0,
    color: CATEGORY_COLORS[r.name] || CATEGORY_COLORS["其他"],
  }));
  const top = segments[0];
  const insight = top
    ? `會後工作重心偏向「${top.name}」（${top.count} 項，佔 ${top.value}%）。建議同步檢查其他領域是否缺漏負責人。`
    : "尚無可分類的待辦。";

  return { segments, total, fromMock: false, insight };
}

export { STATUS_META, QUADRANT_META, CATEGORY_COLORS };

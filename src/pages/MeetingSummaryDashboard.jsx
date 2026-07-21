import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  Users,
  Gauge,
  CheckCircle2,
  Target,
  TrendingUp,
  ShieldAlert,
  Download,
  Share2,
  Sparkles,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════════════
   會後 AI 整理 —— Executive Presentation Summary
   簡報式摘要 Dashboard：核心結論 → 量化分析 → 決策/風險 → 執行追蹤
   圖表全部以手繪 SVG 實作（零額外依賴），深色模式已對齊。
   ════════════════════════════════════════════════════════════════════════ */

const C = {
  primary: "#3B82F6",
  success: "#10B981",
  warn: "#F59E0B",
  danger: "#EF4444",
  violet: "#8B5CF6",
  slate: "#94A3B8",
};

/* ── Mock Data（未傳入 meeting 時使用）───────────────────────────────── */
const MOCK = {
  title: "Q3 通路折扣策略檢討會",
  date: "2026年7月19日 (日) 14:00",
  durationMin: 42,
  plannedMin: 45,
  host: "Rex",
  attendees: ["Rex", "Lacy", "Amy", "Sam"],
  keyTakeaway:
    "確認以「滿額折扣 + 商品組合包」取代單品降價，預期毛利率回升 3.2%，並由 Lacy 於下週三前完成通路試算與定價表。",
  kpi: {
    efficiency: 92,
    decisions: 2,
    claimRate: 66,
    focusTopic: "折扣優惠 / 商品組合",
  },
  speakers: [
    { name: "Rex", value: 60, color: C.primary },
    { name: "Lacy", value: 40, color: C.violet },
  ],
  topics: [
    { name: "業績達標檢討", minutes: 16, color: C.primary },
    { name: "折扣方案設計", minutes: 18, color: C.success },
    { name: "商品組合包", minutes: 6, color: C.warn },
    { name: "其他雜項", minutes: 2, color: C.slate },
  ],
  matrix: [
    {
      pain: "單品直接降價，毛利被壓縮到臨界值",
      decision: "改採「滿額折扣」，門檻設在客單價 1.3 倍",
      benefit: "毛利率 +3.2%",
    },
    {
      pain: "滯銷品庫存積壓兩季，佔用倉儲成本",
      decision: "與熱銷品綁成組合包出清，限時四週",
      benefit: "庫存週轉 +18%",
    },
  ],
  risks: [
    {
      title: "通路商對新折扣門檻反彈",
      probability: 3,
      impact: 2,
      level: "high",
      mitigation: "先與前三大通路一對一溝通，提供首月保底補貼",
    },
    {
      title: "組合包定價試算延遲",
      probability: 2,
      impact: 3,
      level: "high",
      mitigation: "Lacy 下週三前交付，Amy 併行備援試算表",
    },
    {
      title: "系統折扣規則需改版",
      probability: 2,
      impact: 1,
      level: "medium",
      mitigation: "先用人工後台套用，第二階段再排程開發",
    },
    {
      title: "行銷素材來不及產出",
      probability: 1,
      impact: 1,
      level: "low",
      mitigation: "沿用既有模板微調即可",
    },
  ],
  actions: [
    {
      title: "完成通路試算與新定價表",
      owner: "Lacy",
      priority: "P0",
      due: "7/22 (三)",
      dayOffset: 3,
      status: "in-progress",
    },
    {
      title: "與前三大通路溝通新折扣門檻",
      owner: "Rex",
      priority: "P0",
      due: "7/24 (五)",
      dayOffset: 5,
      status: "todo",
    },
    {
      title: "盤點滯銷品並提出組合包清單",
      owner: "Amy",
      priority: "P1",
      due: "7/26 (日)",
      dayOffset: 7,
      status: "todo",
    },
    {
      title: "後台折扣規則設定與測試",
      owner: "Sam",
      priority: "P2",
      due: "7/31 (五)",
      dayOffset: 12,
      status: "done",
    },
  ],
};

/* ── 小工具 ──────────────────────────────────────────────────────────── */
const AVATAR_COLORS = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
const avatarColor = (name) => {
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
};

function Initial({ name, size = "h-7 w-7", ring = true }) {
  return (
    <span
      title={name}
      className={`${size} ${avatarColor(name)} ${ring ? "ring-2 ring-white dark:ring-[#131d2f]" : ""} rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0`}
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

function Card({ className = "", children }) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#131d2f] shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, title, sub, right }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 flex items-center justify-center">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
          {sub && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ── 圖表 A1：發言比重環形圖 ─────────────────────────────────────────── */
function Donut({ segments, size = 148, thickness = 18 }) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={thickness}
        className="stroke-slate-100 dark:stroke-white/10"
      />
      {segments.map((s) => {
        const len = (s.value / 100) * circumference;
        const el = (
          <circle
            key={s.name}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${circumference - len}`}
            strokeDashoffset={-acc}
          />
        );
        acc += len;
        return el;
      })}
    </svg>
  );
}

function SpeakerChart({ speakers }) {
  const dominant = [...speakers].sort((a, b) => b.value - a.value)[0];
  const balanced = dominant.value <= 65;
  return (
    <Card className="p-6">
      <CardTitle icon={Users} title="發言比重" sub="Speaker Insights" />
      <div className="flex items-center gap-6">
        <div className="relative shrink-0">
          <Donut segments={speakers} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-slate-800 dark:text-slate-100 tabular-nums">
              {dominant.value}%
            </span>
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{dominant.name} 主導</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          {speakers.map((s) => (
            <div key={s.name} className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-base font-semibold text-slate-700 dark:text-slate-200 flex-1 truncate">
                {s.name}
              </span>
              <span className="text-base font-black tabular-nums text-slate-800 dark:text-slate-100">
                {s.value}%
              </span>
            </div>
          ))}
          <div
            className={`mt-3 rounded-xl px-3.5 py-2.5 text-sm font-medium leading-relaxed ${
              balanced
                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            {balanced
              ? "發言分布健康，雙方參與度接近。"
              : `${dominant.name} 發言偏高，建議下次主動邀請其他人表態。`}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ── 圖表 A2：時間分布 ───────────────────────────────────────────────── */
function TimeChart({ topics, durationMin, plannedMin }) {
  const total = topics.reduce((n, t) => n + t.minutes, 0) || 1;
  const overtime = durationMin - plannedMin;
  return (
    <Card className="p-6">
      <CardTitle
        icon={Clock}
        title="議題時間分布"
        sub={`實際 ${durationMin} 分 / 預計 ${plannedMin} 分`}
        right={
          <span
            className={`shrink-0 text-sm font-bold px-2.5 py-1 rounded-full ${
              overtime > 0
                ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {overtime > 0 ? `超時 ${overtime} 分` : `準時 ${Math.abs(overtime)} 分內`}
          </span>
        }
      />

      <div className="flex h-3.5 w-full overflow-hidden rounded-full mb-5">
        {topics.map((t) => (
          <div
            key={t.name}
            style={{ width: `${(t.minutes / total) * 100}%`, background: t.color }}
            title={`${t.name} ${t.minutes} 分`}
          />
        ))}
      </div>

      <div className="space-y-4">
        {topics.map((t) => {
          const pct = Math.round((t.minutes / total) * 100);
          return (
            <div key={t.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {t.name}
                </span>
                <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400 shrink-0 ml-2">
                  {t.minutes} 分 · {pct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: t.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── 卡片 B：痛點 → 決策 對照矩陣 ────────────────────────────────────── */
function DecisionMatrix({ matrix }) {
  return (
    <Card className="p-6">
      <CardTitle icon={Target} title="痛點 → 決策 對照" sub="Problem-Solution Matrix" />
      <div className="space-y-4">
        {matrix.map((m, i) => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch rounded-xl border border-gray-100 dark:border-white/10 p-4"
          >
            <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-4">
              <p className="text-sm font-bold text-rose-600 dark:text-rose-300 mb-1.5">痛點</p>
              <p className="text-base text-slate-700 dark:text-slate-200 leading-relaxed">{m.pain}</p>
            </div>

            <div className="flex md:flex-col items-center justify-center text-slate-400 dark:text-slate-500">
              <ArrowRight className="h-5 w-5 md:rotate-0 rotate-90" strokeWidth={2.2} />
            </div>

            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-4">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mb-1.5">採納決議</p>
              <p className="text-base text-slate-700 dark:text-slate-200 leading-relaxed">{m.decision}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                <TrendingUp className="h-4 w-4" strokeWidth={2.5} />
                {m.benefit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── 圖表 C：風險評估矩陣（機率 × 影響）──────────────────────────────── */
const RISK_STYLE = {
  high: { dot: C.danger, badge: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300", label: "高" },
  medium: { dot: C.warn, badge: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300", label: "中" },
  low: { dot: C.success, badge: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300", label: "低" },
};

function RiskMatrix({ risks }) {
  const size = 168;
  const pad = 26;
  const cell = (size - pad) / 3;
  const [hover, setHover] = useState(null);

  return (
    <Card className="p-6">
      <CardTitle icon={ShieldAlert} title="潛在風險矩陣" sub="發生機率 × 影響程度" />
      <div className="flex flex-col sm:flex-row gap-5">
        <svg width={size} height={size} className="shrink-0">
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => {
              const score = col + (2 - row);
              const fill =
                score >= 3 ? "rgba(239,68,68,0.12)" : score === 2 ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.10)";
              return (
                <rect
                  key={`${row}-${col}`}
                  x={pad + col * cell}
                  y={row * cell}
                  width={cell - 3}
                  height={cell - 3}
                  rx="5"
                  fill={fill}
                />
              );
            })
          )}
          {risks.map((r, i) => {
            const cx = pad + (r.probability - 0.5) * cell - 1.5;
            const cy = (3 - r.impact + 0.5) * cell - 1.5;
            const st = RISK_STYLE[r.level];
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <circle cx={cx} cy={cy} r={hover === i ? 11 : 9} fill={st.dot} opacity={hover === i ? 1 : 0.9} />
                <text x={cx} y={cy + 3.5} textAnchor="middle" className="fill-white text-[9px] font-bold">
                  {i + 1}
                </text>
              </g>
            );
          })}
          <text x={pad} y={size - 6} className="fill-slate-500 text-[10px]">
            機率低 →高
          </text>
          <text x={0} y={10} className="fill-slate-500 text-[10px]">
            影響高
          </text>
        </svg>

        <ul className="min-w-0 flex-1 space-y-3">
          {risks.map((r, i) => {
            const st = RISK_STYLE[r.level];
            return (
              <li
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className={`rounded-xl border p-3.5 transition-colors ${
                  hover === i
                    ? "border-slate-300 dark:border-white/25 bg-slate-50 dark:bg-white/5"
                    : "border-gray-100 dark:border-white/10"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: st.dot }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200 flex-1 truncate">
                    {r.title}
                  </p>
                  <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded ${st.badge}`}>
                    {st.label}
                  </span>
                </div>
                <p className="mt-1.5 pl-8 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  預防：{r.mitigation}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

/* ── 底部：Action Items Kanban + 時程軸 ──────────────────────────────── */
const PRIORITY = {
  P0: "bg-rose-500 text-white",
  P1: "bg-amber-500 text-white",
  P2: "bg-slate-400 text-white",
};
const COLUMNS = [
  { id: "todo", label: "待認領", accent: "text-slate-500" },
  { id: "in-progress", label: "進行中", accent: "text-blue-500" },
  { id: "done", label: "已完成", accent: "text-emerald-500" },
];

function ActionBoard({ actions }) {
  const maxDay = Math.max(...actions.map((a) => a.dayOffset), 1);
  return (
    <Card className="p-5">
      <CardTitle
        icon={CheckCircle2}
        title="Action Items 執行追蹤"
        sub="優先級 · 負責人 · 截止時程"
        right={
          <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300">
            共 {actions.length} 項
          </span>
        }
      />

      {/* Kanban 三欄 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLUMNS.map((col) => {
          const items = actions.filter((a) => a.status === col.id);
          return (
            <div key={col.id} className="rounded-xl bg-slate-50 dark:bg-white/[0.04] p-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className={`text-xs font-black ${col.accent}`}>{col.label}</span>
                <span className="text-[11px] font-bold text-slate-400 tabular-nums">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="text-[11px] text-slate-400 text-center py-4">無項目</p>
                ) : (
                  items.map((a, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-gray-100 dark:border-white/10 bg-white dark:bg-[#131d2f] p-3 shadow-sm"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${PRIORITY[a.priority]}`}>
                          {a.priority}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-auto">{a.due}</span>
                      </div>
                      <p
                        className={`text-xs font-semibold leading-snug ${
                          a.status === "done"
                            ? "line-through text-slate-400"
                            : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {a.title}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <Initial name={a.owner} size="h-5 w-5" ring={false} />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{a.owner}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 時程軸（甘特概念） */}
      <div className="mt-5 pt-4 border-t border-gray-100 dark:border-white/10">
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-3">交付時程軸</p>
        <div className="space-y-2.5">
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-[11px] text-slate-600 dark:text-slate-300 truncate">
                {a.title}
              </span>
              <div className="relative h-2 flex-1 rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.max(8, (a.dayOffset / maxDay) * 100)}%`,
                    background: a.priority === "P0" ? C.danger : a.priority === "P1" ? C.warn : C.primary,
                    opacity: a.status === "done" ? 0.35 : 1,
                  }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{a.due}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ── KPI 卡 ──────────────────────────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, unit, tone, hint }) {
  const tones = {
    blue: "text-blue-500 bg-blue-50 dark:bg-blue-500/10",
    emerald: "text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
    amber: "text-amber-500 bg-amber-50 dark:bg-amber-500/10",
    violet: "text-violet-500 bg-violet-50 dark:bg-violet-500/10",
  };
  return (
    <Card className="p-5 md:p-6">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-600 dark:text-slate-400">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-black text-slate-800 dark:text-slate-100 tabular-nums truncate leading-none">
          {value}
        </span>
        {unit && <span className="text-sm font-bold text-slate-600 dark:text-slate-400">{unit}</span>}
      </p>
      {hint && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">{hint}</p>
      )}
    </Card>
  );
}

/* ── 主元件 ──────────────────────────────────────────────────────────── */
export default function MeetingSummaryDashboard({ meeting }) {
  // 有真實會議資料就覆蓋 Mock，否則直接用 Mock 展示
  const d = useMemo(() => {
    if (!meeting) return MOCK;
    return {
      ...MOCK,
      title: meeting.title || MOCK.title,
      durationMin:
        meeting.endedAt && meeting.startedAt
          ? Math.max(1, Math.round((meeting.endedAt - meeting.startedAt) / 60000))
          : meeting.durationMin || MOCK.durationMin,
      plannedMin: meeting.durationMin || MOCK.plannedMin,
      attendees: meeting.participants?.length ? meeting.participants : MOCK.attendees,
    };
  }, [meeting]);

  const claimed = d.actions.filter((a) => a.status !== "todo").length;

  return (
    <div className="fade-in max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-8 pb-28 md:pb-8">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-full">
            <Sparkles className="h-3 w-3" strokeWidth={2.5} />
            AI 會後整理
          </span>
          <h1 className="mt-2 text-2xl md:text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
            {d.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
              {d.date}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" strokeWidth={2} />
              歷時 {d.durationMin} 分
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" strokeWidth={2} />
              發起人 {d.host}
            </span>
            <span className="inline-flex items-center -space-x-1.5">
              {d.attendees.map((n) => (
                <Initial key={n} name={n} size="h-6 w-6" />
              ))}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-gray-100 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" strokeWidth={2} />
            分享
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 shadow-sm transition-colors"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2.2} />
            匯出簡報
          </button>
        </div>
      </div>

      {/* ── Hero：一句話結論 ── */}
      <div className="mt-5 rounded-2xl p-6 md:p-8 bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 shadow-lg shadow-blue-500/20">
        <p className="text-sm font-bold text-blue-100/95 tracking-wide">KEY TAKEAWAY · 核心結論</p>
        <p className="mt-3 text-2xl md:text-3xl font-bold text-white leading-relaxed">{d.keyTakeaway}</p>
      </div>

      {/* ── KPI ── */}
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Gauge}
          label="會議效率分數"
          value={d.kpi.efficiency}
          unit="/100"
          tone="blue"
          hint={d.durationMin <= d.plannedMin ? "準時結束" : `超時 ${d.durationMin - d.plannedMin} 分`}
        />
        <KpiCard icon={CheckCircle2} label="決議產出" value={d.kpi.decisions} unit="項" tone="emerald" hint="已轉為執行方案" />
        <KpiCard
          icon={Users}
          label="待辦認領率"
          value={d.kpi.claimRate}
          unit="%"
          tone="amber"
          hint={`${claimed}/${d.actions.length} 項已有負責人啟動`}
        />
        <KpiCard icon={Target} label="關鍵主題焦點" value={d.kpi.focusTopic} tone="violet" hint="佔會議時間 57%" />
      </div>

      {/* ── 量化分析 ── */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpeakerChart speakers={d.speakers} />
        <TimeChart topics={d.topics} durationMin={d.durationMin} plannedMin={d.plannedMin} />
      </div>

      {/* ── 決策與風險 ── */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DecisionMatrix matrix={d.matrix} />
        <RiskMatrix risks={d.risks} />
      </div>

      {/* ── 執行追蹤 ── */}
      <div className="mt-4">
        <ActionBoard actions={d.actions} />
      </div>
    </div>
  );
}

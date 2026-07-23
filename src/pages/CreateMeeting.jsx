import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Lock,
  Sparkles,
  Clock,
  CalendarDays,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { getMode, getScenario, getScenariosForTab } from "../config/meetingConfig.js";
import FriendAttendeePicker from "../components/FriendAttendeePicker.jsx";
import CreatedInviteModal from "../components/CreatedInviteModal.jsx";
import MeetingRbacPanel from "../components/MeetingRbacPanel.jsx";
import { useTheme } from "../lib/theme.js";

const inputCls =
  "w-full rounded-2xl border border-navy-800/10 bg-white px-4 py-3.5 text-sm text-navy-800 placeholder-navy-300 shadow-[0_1px_2px_rgba(15,27,45,0.04)] focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:shadow-none transition-all dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-400";

const SCHEDULE_DURATION_OPTIONS = [15, 30, 45, 60];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 下一個整點或半小時（例：13:20 → 13:30；13:30 → 14:00） */
function nextHalfHourTime() {
  const d = new Date();
  const mins = d.getMinutes();
  if (mins < 30) {
    d.setMinutes(30, 0, 0);
  } else {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function combineScheduleTs(dateStr, timeStr) {
  const raw = `${String(dateStr || "").trim()}T${String(timeStr || "").trim()}`;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** 摘要：07/23 11:30 PM (45 分鐘) */
function formatScheduleSummary(dateStr, timeStr, durationMin) {
  const ts = combineScheduleTs(dateStr, timeStr);
  if (!ts) return `${durationMin || 30} 分鐘`;
  try {
    const d = new Date(ts);
    const md = d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
    const tm = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${md} ${tm} (${durationMin || 30} 分鐘)`;
  } catch {
    return `${durationMin || 30} 分鐘`;
  }
}

/** 預定時間設定彈窗 */
function SchedulePickerModal({
  open,
  date,
  time,
  durationMin,
  onChangeDate,
  onChangeTime,
  onChangeDuration,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4">
      <button
        type="button"
        aria-label="關閉"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-picker-title"
        className="relative w-full max-w-md rounded-2xl border border-white/40 bg-white/95 p-5 shadow-[0_20px_60px_rgba(15,27,45,0.18)] backdrop-blur-xl fade-in dark:border-slate-600/40 dark:bg-slate-900/90"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="關閉"
          onClick={onCancel}
          className="absolute right-3 top-3 p-1.5 rounded-lg text-navy-300 hover:text-navy-600 hover:bg-gray-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        <h3
          id="schedule-picker-title"
          className="text-lg font-bold text-navy-800 pr-8 flex items-center gap-2 dark:text-white"
        >
          <CalendarDays className="h-5 w-5 text-coral-500" strokeWidth={2} />
          設定預定會議時間
        </h3>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-navy-600 dark:text-slate-300">
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
              日期
            </span>
            <input
              type="date"
              value={date}
              min={todayISODate()}
              onChange={(e) => onChangeDate?.(e.target.value)}
              className={inputCls + " py-2.5"}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-navy-600 dark:text-slate-300">
              <Clock className="h-3.5 w-3.5" strokeWidth={2} />
              開始時間
            </span>
            <input
              type="time"
              value={time}
              onChange={(e) => onChangeTime?.(e.target.value)}
              className={inputCls + " py-2.5"}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-navy-600 dark:text-slate-300">
              預計時長
            </span>
            <div className="relative">
              <select
                value={durationMin}
                onChange={(e) => onChangeDuration?.(Number(e.target.value))}
                className={inputCls + " appearance-none pr-10 py-2.5"}
              >
                {SCHEDULE_DURATION_OPTIONS.map((min) => (
                  <option key={min} value={min}>
                    {min} 分鐘
                  </option>
                ))}
              </select>
              <Clock
                className="h-4 w-4 text-navy-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={2}
              />
            </div>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 font-medium py-2.5 rounded-xl text-navy-500 border border-gray-100 hover:bg-gray-50 transition-colors dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 font-semibold py-2.5 rounded-xl bg-coral-500 text-white hover:bg-coral-400 shadow-sm transition-colors"
          >
            確認時間
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── 可逐條新增的清單輸入 ─────────────────────────────────────────────── */
function ListInput({ items, setItems, placeholder, ordered, accent = "mint" }) {
  const [draft, setDraft] = useState("");
  const list = items || [];
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    setItems([...list, v]);
    setDraft("");
  };
  const remove = (i) => setItems(list.filter((_, idx) => idx !== i));
  const dotCls = accent === "coral" ? "bg-coral-400" : "bg-mint-500";

  return (
    <div>
      {list.length > 0 && (
        <ul className="space-y-2 mb-2.5">
          {list.map((it, i) => (
            <li key={i} className="group flex items-center gap-2.5 bg-navy-800/[0.02] border border-navy-800/8 rounded-xl px-3 py-2">
              {ordered ? (
                <span className={`h-5 w-5 shrink-0 rounded-full ${dotCls} text-white text-[11px] font-bold flex items-center justify-center`}>{i + 1}</span>
              ) : (
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} />
              )}
              <span className="flex-1 text-sm text-navy-800 break-all">{it}</span>
              <button onClick={() => remove(i)} className="opacity-0 group-hover:opacity-100 text-navy-300 hover:text-coral-500 transition-all" title="移除">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-sm text-navy-800 placeholder-navy-300 focus:border-mint-400 focus:shadow-glow transition-all"
        />
        <button onClick={add} disabled={!draft.trim()} className="shrink-0 px-4 rounded-xl bg-mint-500 text-white font-semibold text-sm hover:bg-mint-600 disabled:bg-navy-800/10 disabled:text-navy-300 transition-colors active:scale-95">
          新增
        </button>
      </div>
    </div>
  );
}

/* ── 依欄位型別渲染輸入控制項 ─────────────────────────────────────────── */
function FieldControl({ field, value, onChange, friends }) {
  switch (field.type) {
    case "text":
    case "link":
      return (
        <input
          type={field.type === "link" ? "url" : "text"}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputCls}
        />
      );
    case "participants":
      return <FriendAttendeePicker value={value || []} onChange={onChange} friends={friends} placeholder="點此選擇好友，或輸入關鍵字過濾…" />;
    case "list":
      return <ListInput items={value || []} setItems={onChange} ordered={field.ordered} accent={field.accent} placeholder={field.placeholder} />;
    case "choice":
      return (
        <div className={`grid gap-2 ${field.options.length > 2 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2"}`}>
          {field.options.map((o) => (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={`text-sm font-semibold px-3 py-3 rounded-2xl border transition-all active:scale-95
                ${value === o.value ? "bg-mint-500 text-white border-mint-500 shadow-glow" : "bg-white text-navy-600 border-navy-800/10 hover:border-mint-300"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    default:
      return null;
  }
}

const initValues = (def, prev = {}) => {
  const v = {
    title: prev.title || "",
    participants: Array.isArray(prev.participants) ? prev.participants.filter((p) => p && typeof p === "object") : [],
    durationMin: def.duration.default,
  };
  for (const f of def.fields) {
    if (f.key === "title" || f.key === "participants") continue;
    v[f.key] = f.type === "list" || f.type === "participants" ? [] : "";
  }
  return v;
};

/* ── 頂部步驟進度條 ───────────────────────────────────────────────────── */
const STEPS = [
  { n: 1, label: "選擇場景" },
  { n: 2, label: "基本資料" },
  { n: 3, label: "會前檢核" },
];

function Stepper({ step, goStep }) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {STEPS.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        const clickable = s.n < step;
        return (
          <div key={s.n} className="flex items-center">
            <button
              onClick={() => clickable && goStep(s.n)}
              disabled={!clickable}
              className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 transition-all ${active ? "bg-mint-50" : ""} ${clickable ? "cursor-pointer hover:bg-navy-800/[0.03]" : "cursor-default"}`}
            >
              <span
                className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black transition-all
                  ${done ? "bg-mint-500 text-white" : active ? "bg-mint-500 text-white ring-4 ring-mint-100" : "bg-navy-800/8 text-navy-400"}`}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.n}
              </span>
              <span className={`text-xs font-bold whitespace-nowrap ${active ? "text-mint-700" : done ? "text-navy-600" : "text-navy-300"}`}>
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && <span className={`w-4 sm:w-8 h-px mx-0.5 ${step > s.n ? "bg-mint-300" : "bg-navy-800/10"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-bold text-navy-700">
          {label}
          {required && <span className="text-coral-400 ml-0.5">*</span>}
        </label>
        {hint && <span className="text-[11px] text-navy-300">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* ── 步驟三：動態會前檢核事項 ─────────────────────────────────────────── */
let gateSeq = 0;
const nextGateId = () => `gate-${Date.now().toString(36)}-${++gateSeq}`;

function valueIsFilled(type, value) {
  if (type === "list" || type === "participants") return Array.isArray(value) && value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

/** 連結類欄位（含數據 / 報告）一律視為選填，不阻擋開啟會議 */
function resolveGateRequired(field) {
  if (!field) return false;
  if (field.type === "link") return false;
  return Boolean(field.required);
}

/** 從場景欄位產出預設檢核事項範本 */
function seedGateTasksFromScenario(scenario) {
  return (scenario.fields || [])
    .filter((f) => f.key !== "title" && f.key !== "participants")
    .map((f) => ({
      id: f.key,
      title: f.label,
      placeholder: f.placeholder || "請輸入內容…",
      isRequired: resolveGateRequired(f),
      isCompleted: false,
      type: f.type || "text",
      fieldKey: f.key,
      ordered: f.ordered,
      accent: f.accent,
      options: f.options,
      value: f.type === "list" || f.type === "participants" ? [] : "",
      assignedBy: "host", // 會前檢核視為上級指示
    }));
}

function makeCustomGateTask(assignedBy = "host") {
  return {
    id: nextGateId(),
    title: "",
    placeholder: "描述這項檢核事項，例如：會前必讀文件已附上",
    isRequired: true,
    isCompleted: false,
    type: "text",
    fieldKey: null,
    value: "",
    assignedBy, // 依當前角色指派
  };
}

function GateTaskCard({ task, friends, onChange, onComplete, onRemove, disabled = false, deleteHidden = false }) {
  const filled = valueIsFilled(task.type, task.value);
  const done = task.isCompleted;
  // 必填須有內容；選填（如報告連結）有標題即可確認，空值也不阻擋解鎖進度
  const canComplete =
    !disabled &&
    (task.title || "").trim().length > 0 &&
    (task.isRequired ? filled : true);

  const fieldShape = {
    type: task.type,
    placeholder: task.placeholder,
    ordered: task.ordered,
    accent: task.accent,
    options: task.options || [],
  };

  return (
    <div
      className={`rounded-2xl border p-4 transition-all duration-200 ${
        done
          ? "border-mint-200 bg-mint-50/40 shadow-glow"
          : task.isRequired
          ? "border-navy-800/10 bg-white shadow-[0_1px_2px_rgba(15,27,45,0.04)]"
          : "border-navy-800/8 bg-white/70"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 h-8 w-8 shrink-0 rounded-xl flex items-center justify-center ${
            done
              ? "bg-mint-500 text-white"
              : task.isRequired
              ? "bg-coral-50 text-coral-400"
              : "bg-navy-800/5 text-navy-300"
          }`}
        >
          {done ? (
            <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} />
          ) : task.isRequired ? (
            <AlertCircle className="h-5 w-5" strokeWidth={2.2} />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <input
              value={task.title}
              onChange={(e) => onChange({ title: e.target.value, isCompleted: false })}
              disabled={disabled}
              placeholder="任務標題（例：下次要改變的行動）"
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-navy-800 placeholder:text-navy-300 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {deleteHidden ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md" title="上級指示・唯讀">
                上級指示
              </span>
            ) : (
              <button
                type="button"
                onClick={onRemove}
                aria-label="刪除任務"
                className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.8} />
              </button>
            )}
          </div>
          <p
            className={`mt-0.5 text-[11px] font-medium ${
              done ? "text-mint-600" : task.isRequired ? "text-coral-400" : "text-navy-300"
            }`}
          >
            {done
              ? "已確認符合規範"
              : task.isRequired
              ? "必填 · 尚未完成"
              : "選填 · 補充參考資訊"}
          </p>
        </div>

        {done && (
          <span className="shrink-0 text-[11px] font-bold text-mint-700 bg-mint-100 px-2 py-0.5 rounded-full">
            已檢核
          </span>
        )}
      </div>

      {disabled && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-coral-500 bg-coral-50 border border-coral-100 px-2 py-0.5 rounded-full">
          <Lock className="h-3 w-3" strokeWidth={2.4} /> 僅限上級或紀錄員編輯
        </p>
      )}

      <div className={`mt-3 space-y-2 ${disabled ? "opacity-50 pointer-events-none select-none" : ""}`}>
        {task.type === "list" || task.type === "choice" || task.type === "participants" ? (
          <FieldControl
            field={fieldShape}
            value={task.value}
            onChange={(v) => onChange({ value: v, isCompleted: false })}
            friends={friends}
          />
        ) : (
          <div className="flex gap-2">
            <input
              type={task.type === "link" ? "url" : "text"}
              value={typeof task.value === "string" ? task.value : ""}
              disabled={disabled}
              onChange={(e) => onChange({ value: e.target.value, isCompleted: false })}
              onBlur={() => {
                if (canComplete) onComplete();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  if (canComplete) onComplete();
                }
              }}
              placeholder={task.placeholder}
              className={inputCls}
            />
            <button
              type="button"
              disabled={!canComplete}
              onClick={onComplete}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 rounded-2xl bg-mint-500 text-white font-semibold text-sm hover:bg-mint-600 disabled:bg-navy-800/10 disabled:text-navy-300 transition-colors active:scale-95"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
              {done ? "確認無誤" : "完成檢核"}
            </button>
          </div>
        )}

        {(task.type === "list" || task.type === "choice" || task.type === "participants") && (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!canComplete}
              onClick={onComplete}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-mint-500 text-white text-sm font-semibold hover:bg-mint-600 disabled:bg-navy-800/10 disabled:text-navy-300 transition-colors active:scale-95"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
              {done ? "確認無誤" : "完成檢核"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   發起會議 · 三步驟分頁式表單
   ═══════════════════════════════════════════════════════════════════════ */
export default function CreateMeeting({ store, go, modeId = "enterprise", friends = [] }) {
  const mode = getMode(modeId);
  const { resolved: themeResolved } = useTheme();
  const isDark = themeResolved === "dark";
  const [step, setStep] = useState(1);
  const [scenarioId, setScenarioId] = useState(mode.scenarios[0].id);
  const [values, setValues] = useState(() => initValues(mode.scenarios[0]));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [created, setCreated] = useState(null);
  const [scenarioTab, setScenarioTab] = useState("daily");
  const [gateTasks, setGateTasks] = useState(() => seedGateTasksFromScenario(mode.scenarios[0]));
  const [scheduleMode, setScheduleMode] = useState("immediate"); // immediate | scheduled
  const [scheduleDate, setScheduleDate] = useState(() => todayISODate());
  const [scheduleTime, setScheduleTime] = useState(() => nextHalfHourTime());
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(() => todayISODate());
  const [draftTime, setDraftTime] = useState(() => nextHalfHourTime());
  const [draftDuration, setDraftDuration] = useState(30);

  const openScheduleModal = () => {
    setDraftDate(scheduleDate || todayISODate());
    setDraftTime(scheduleTime || nextHalfHourTime());
    setDraftDuration(
      SCHEDULE_DURATION_OPTIONS.includes(values.durationMin) ? values.durationMin : 30
    );
    setScheduleModalOpen(true);
  };

  const cancelScheduleModal = () => {
    setScheduleModalOpen(false);
    setScheduleMode("immediate");
  };

  const confirmScheduleModal = () => {
    setScheduleDate(draftDate || todayISODate());
    setScheduleTime(draftTime || nextHalfHourTime());
    setField("durationMin", draftDuration || 30);
    setScheduleMode("scheduled");
    setScheduleModalOpen(false);
  };

  const scheduleSummary = formatScheduleSummary(scheduleDate, scheduleTime, values.durationMin);

  // ── RBAC 權限狀態（發起人預設為 host）──
  const [currentRole, setCurrentRole] = useState("host");
  const [isEditRestricted, setIsEditRestricted] = useState(false);
  const [isHostAssignmentEnabled, setIsHostAssignmentEnabled] = useState(true);
  const editLocked = isEditRestricted && currentRole === "attendee";
  /** 僅 Host 且開啟「上級分配代辦」時，才顯示新增自訂檢核事項 */
  const showAddCustomGateTask = isHostAssignmentEnabled && currentRole === "host";

  // 全域模式切換時：回到第一步並重置場景與欄位
  useEffect(() => {
    const m = getMode(modeId);
    const first = m.scenarios[0];
    setScenarioId(first.id);
    setValues((prev) => initValues(first, prev));
    setGateTasks(seedGateTasksFromScenario(first));
    setStep(1);
    setCreateError(null);
    setScenarioTab(m.scenarioTabs?.[0]?.id || "daily");
  }, [modeId]);

  const scenario = getScenario(modeId, scenarioId);
  const scenarioTabs = mode.scenarioTabs || [];
  const visibleScenarios = useMemo(
    () => (scenarioTabs.length ? getScenariosForTab(modeId, scenarioTab) : mode.scenarios),
    [modeId, mode.scenarios, scenarioTab, scenarioTabs.length]
  );

  const titleOk = (values.title || "").trim().length > 0;

  const selectScenario = (id) => {
    const next = getScenario(modeId, id);
    setScenarioId(id);
    setValues((prev) => initValues(next, prev));
    setGateTasks(seedGateTasksFromScenario(next));
    setCreateError(null);
  };

  const switchScenarioTab = (tabId) => {
    setScenarioTab(tabId);
    const list = getScenariosForTab(modeId, tabId);
    if (!list.length) return;
    if (!list.some((s) => s.id === scenarioId)) {
      selectScenario(list[0].id);
    }
  };

  const setField = (key, val) => setValues((v) => ({ ...v, [key]: val }));

  const patchGateTask = (id, patch) => {
    setGateTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const completeGateTask = (id) => {
    setGateTasks((list) =>
      list.map((t) => {
        if (t.id !== id) return t;
        const titleOkTask = (t.title || "").trim().length > 0;
        if (!titleOkTask || !valueIsFilled(t.type, t.value)) return t;
        return { ...t, isCompleted: true };
      })
    );
  };

  const removeGateTask = (id) => {
    setGateTasks((list) => list.filter((t) => t.id !== id));
  };

  const addCustomGateTask = () => {
    if (!showAddCustomGateTask) return;
    // 手動新增的任務動態帶入「當前角色」為指派者（Host 派單）
    setGateTasks((list) => [...list, makeCustomGateTask(currentRole)]);
  };

  // 檢核進度：只計算必填事項；選填（含報告連結）不阻擋開啟會議
  const requiredGate = useMemo(() => gateTasks.filter((t) => t.isRequired), [gateTasks]);
  const doneCount = requiredGate.filter((t) => t.isCompleted).length;
  const allRequiredDone = requiredGate.length === 0 || requiredGate.every((t) => t.isCompleted);
  const canUnlock = titleOk && allRequiredDone;

  const participantsField = scenario.fields.find((f) => f.key === "participants");

  const handleCreate = async () => {
    if (!canUnlock || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      // 將檢核事項內容寫回 values / extra（自訂事項另存）
      const merged = { ...values };
      const customGateTasks = [];
      for (const t of gateTasks) {
        if (t.fieldKey) {
          merged[t.fieldKey] = t.value;
        } else {
          customGateTasks.push({
            title: (t.title || "").trim() || "自訂檢核事項",
            value: t.value,
            isRequired: t.isRequired,
          });
        }
      }

      const goals = merged[scenario.primaryListKey] || [];
      const links = scenario.linkKeys.map((k) => merged[k]).filter(Boolean);
      const pains = merged.painPoints || merged.blockers || merged.weakSpots || merged.toImprove || [];
      const attendees = (merged.participants || [])
        .filter((p) => p && typeof p === "object" && (p.id || p.name))
        .map((p) => ({
          id: p.id || null,
          name: String(p.name || "").trim(),
          email: String(p.email || "").trim(),
        }))
        .filter((p) => p.name);

      const inviteRoster = attendees.map((a) => ({
        ...a,
        status: "selected", // 會前已選定；進會議室後改為 inviting → joined
      }));

      const extra = { _mode: modeId, customGateTasks };
      for (const f of scenario.fields) {
        if (f.key === "title" || f.key === "participants") continue;
        if (merged[f.key] !== undefined) extra[f.key] = merged[f.key];
      }

      const isScheduled = scheduleMode === "scheduled";
      let scheduledAt = null;
      if (isScheduled) {
        scheduledAt = combineScheduleTs(scheduleDate, scheduleTime);
        if (!scheduledAt) {
          setCreateError("請設定有效的預約日期與時間");
          return;
        }
      }

      const meeting = await store.createMeeting({
        title: merged.title,
        scenario: scenario.id,
        scenarioLabel: scenario.label,
        scenarioEmoji: scenario.emoji,
        extra,
        attendees,
        participants: attendees.map((a) => a.name),
        pains: Array.isArray(pains) ? pains : [],
        goals: Array.isArray(goals) ? goals : [],
        links,
        durationMin: merged.durationMin,
        scheduledAt,
      });

      // 將邀請名冊與 RBAC 寫回會議，供 LiveRoom / MeetingSummary 共用
      await store.updateMeeting(meeting.id, {
        attendees,
        participants: attendees.map((a) => a.name),
        inviteRoster,
        scheduledAt,
        rbac: {
          isEditRestricted,
          isHostAssignmentEnabled,
        },
        isEditRestricted,
        isHostAssignmentEnabled,
      });

      if (isScheduled) {
        setCreated({
          id: meeting.id,
          code: meeting.code,
          title: String(merged.title || "").trim(),
          attendeeCount: attendees.length,
          variant: "scheduled",
          scheduledAt,
          durationMin: merged.durationMin,
        });
      } else {
        // 立即開始：建立後直進大廳準備頁
        go("prejoin", meeting.id);
      }
    } catch (e) {
      setCreateError(e.message || "建立會議失敗，請確認後端已啟動");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fade-in max-w-2xl mx-auto px-4 py-6 md:px-6 md:py-8 pb-28 md:pb-8">
      {created && (
        <CreatedInviteModal
          meetingCode={created.code}
          title={created.title}
          attendeeCount={created.attendeeCount || 0}
          variant={created.variant || "invite"}
          scheduledAt={created.scheduledAt}
          durationMin={created.durationMin}
          onEnterLive={
            created.variant === "scheduled" ? undefined : () => go("prejoin", created.id)
          }
          onDone={() => go("dashboard", created.id)}
        />
      )}

      {/* Header + 進度條 */}
      <div className="text-center">
        <h1 className="text-2xl font-black text-navy-800">發起會議</h1>
        <p className="text-navy-400 mt-1 text-sm">{mode.label} · 三步驟檢核，開一場有準備的會</p>
      </div>
      <div className="mt-5">
        <Stepper step={step} goStep={setStep} />
      </div>

      <div className="mt-6">
        {/* ── 步驟一：選擇會議場景 ── */}
        {step === 1 && (
          <div className="fade-in">
            {scenarioTabs.length > 0 && (
              <div className="mb-4 flex justify-center">
                <div className="inline-flex items-center gap-0.5 rounded-full border border-gray-100 bg-white p-1 shadow-sm">
                  {scenarioTabs.map((tab) => {
                    const active = tab.id === scenarioTab;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => switchScenarioTab(tab.id)}
                        className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all duration-200
                          ${active ? "bg-navy-800 text-white shadow-sm" : "text-navy-400 hover:text-navy-700"}`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              key={scenarioTab}
              className="grid grid-cols-2 gap-3 transition-all duration-200"
            >
              {visibleScenarios.map((s) => {
                const active = s.id === scenarioId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectScenario(s.id)}
                    className={`relative flex flex-col justify-center text-left rounded-3xl border px-6 py-5 min-h-[96px] transition-all duration-200 active:scale-[0.98] ${
                      isDark
                        ? active
                          ? "bg-[#111c35] border-2 border-cyan-400 shadow-none ring-0"
                          : "bg-[#111c35] border border-slate-700/70 hover:border-slate-500 shadow-none"
                        : active
                        ? "border-mint-400 bg-mint-50/60 ring-2 ring-mint-200 shadow-glow"
                        : "border-navy-800/8 bg-white hover:border-mint-200 hover:shadow-card"
                    }`}
                  >
                    {active && (
                      <span
                        className={`absolute top-4 right-4 h-5 w-5 rounded-full flex items-center justify-center ${
                          isDark
                            ? "bg-cyan-400 text-slate-950"
                            : "bg-mint-500 text-white"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                    <p
                      className={`leading-tight font-semibold ${
                        isDark
                          ? active
                            ? "text-white"
                            : "text-slate-300"
                          : active
                          ? "text-mint-700 font-black"
                          : "text-navy-800 font-black"
                      }`}
                    >
                      {s.label}
                    </p>
                    <p
                      className={`mt-1 text-[11px] leading-snug ${
                        isDark
                          ? active
                            ? "text-slate-200"
                            : "text-slate-400"
                          : active
                          ? "text-navy-500"
                          : "text-navy-400"
                      }`}
                    >
                      {s.tagline}
                    </p>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-6 w-full flex items-center justify-center gap-1.5 bg-mint-500 text-white font-bold py-3.5 rounded-2xl shadow-glow hover:bg-mint-600 transition-all active:scale-[0.98]"
            >
              下一步 · 填寫基本資料
              <ChevronRight className="h-4 w-4" strokeWidth={2.6} />
            </button>
          </div>
        )}

        {/* ── 步驟二：基本資料 ── */}
        {step === 2 && (
          <div className="fade-in space-y-5 bg-white/70 backdrop-blur-sm border border-navy-800/8 rounded-3xl p-5 md:p-6 shadow-[0_1px_2px_rgba(15,27,45,0.04)]">
            <div className="flex items-center gap-2 text-xs font-semibold text-mint-700 bg-mint-50 rounded-full px-3 py-1.5 w-fit">
              {scenario.label}
            </div>

            <Field label="會議主題" required>
              <input
                value={values.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder={scenario.fields.find((f) => f.key === "title")?.placeholder || "例：Q3 產品上線範圍對焦"}
                className={inputCls}
              />
            </Field>

            {participantsField && (
              <Field
                label={`${String(participantsField.label || "與會名單").replace(/\s*\(選填\)\s*$/, "")} (選填)`}
                required={false}
                hint={participantsField.hint || "選填"}
              >
                <FieldControl
                  field={{ ...participantsField, required: false }}
                  value={values.participants}
                  onChange={(v) => setField("participants", v)}
                  friends={friends}
                />
                <p className="mt-2 text-[11px] leading-relaxed text-navy-400">
                  若對方尚未加入好友，此欄可先留空，開會時讓與會者輸入會議代碼即可直接加入。
                </p>
              </Field>
            )}

            <Field label="時間與排程" required>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleMode("immediate")}
                  className={`text-left rounded-2xl border px-3.5 py-3 transition-all active:scale-[0.99] ${
                    scheduleMode === "immediate"
                      ? "border-mint-400 bg-mint-50/70 ring-2 ring-mint-200 dark:border-cyan-400 dark:bg-cyan-950/30 dark:ring-cyan-500/20"
                      : "border-navy-800/10 bg-white hover:border-mint-200 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-500"
                  }`}
                >
                  <p className="text-sm font-bold text-navy-800 dark:text-white">檢核完成後立即開始</p>
                  <p className="mt-0.5 text-[11px] text-navy-400 dark:text-slate-400">建立後進入大廳準備</p>
                </button>
                <button
                  type="button"
                  onClick={openScheduleModal}
                  className={`text-left rounded-2xl border px-3.5 py-3 transition-all active:scale-[0.99] ${
                    scheduleMode === "scheduled"
                      ? "border-mint-400 bg-mint-50/70 ring-2 ring-mint-200 dark:border-cyan-400 dark:bg-cyan-950/30 dark:ring-cyan-500/20"
                      : "border-navy-800/10 bg-white hover:border-mint-200 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-500"
                  }`}
                >
                  <p className="text-sm font-bold text-navy-800 dark:text-white">預定排程會議</p>
                  {scheduleMode === "scheduled" ? (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 max-w-full text-[11px] font-semibold text-mint-700 bg-mint-50 border border-mint-100 rounded-full px-2 py-0.5 dark:text-cyan-300 dark:bg-cyan-950/40 dark:border-cyan-500/25">
                      <span className="truncate">已排程：{scheduleSummary}</span>
                      <span className="inline-flex items-center gap-0.5 shrink-0 text-navy-500 dark:text-slate-300">
                        <Pencil className="h-3 w-3" strokeWidth={2.2} />
                        修改
                      </span>
                    </span>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-navy-400 dark:text-slate-400">
                      點擊設定日期與時間
                    </p>
                  )}
                </button>
              </div>

              {scheduleMode === "immediate" ? (
                <div className="mt-3 relative">
                  <select
                    value={values.durationMin}
                    onChange={(e) => setField("durationMin", Number(e.target.value))}
                    className={inputCls + " appearance-none pr-10"}
                  >
                    {scenario.duration.options.map((min) => (
                      <option key={min} value={min}>
                        {min} 分鐘
                      </option>
                    ))}
                  </select>
                  <Clock className="h-4 w-4 text-navy-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2} />
                </div>
              ) : null}
            </Field>

            <SchedulePickerModal
              open={scheduleModalOpen}
              date={draftDate}
              time={draftTime}
              durationMin={draftDuration}
              onChangeDate={setDraftDate}
              onChangeTime={setDraftTime}
              onChangeDuration={setDraftDuration}
              onCancel={cancelScheduleModal}
              onConfirm={confirmScheduleModal}
            />

            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(1)} className="flex items-center justify-center gap-1 px-4 py-3.5 rounded-2xl text-navy-500 font-semibold border border-navy-800/10 hover:bg-navy-800/[0.03] transition-colors">
                <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
                上一步
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!titleOk}
                className={`flex-1 flex items-center justify-center gap-1.5 font-bold py-3.5 rounded-2xl transition-all active:scale-[0.98]
                  ${titleOk ? "bg-mint-500 text-white shadow-glow hover:bg-mint-600" : "bg-navy-800/5 text-navy-300 cursor-not-allowed"}`}
              >
                {titleOk ? "下一步 · 會前檢核" : "請先填寫會議主題"}
                {titleOk && <ChevronRight className="h-4 w-4" strokeWidth={2.6} />}
              </button>
            </div>
          </div>
        )}

        {/* ── 步驟三：會前檢核（動態增刪，連動 isHostAssignmentEnabled） ── */}
        {step === 3 && (
          <div className="fade-in">
            {/* RBAC 權限面板：發起人可即時切角色 / 開關限制 */}
            <div className="mb-4">
              <MeetingRbacPanel
                currentRole={currentRole}
                setCurrentRole={setCurrentRole}
                isEditRestricted={isEditRestricted}
                setIsEditRestricted={setIsEditRestricted}
                isHostAssignmentEnabled={isHostAssignmentEnabled}
                setIsHostAssignmentEnabled={setIsHostAssignmentEnabled}
              />
            </div>

            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-navy-700">檢核事項</p>
              <p className="text-xs font-semibold text-navy-400">
                <span className={allRequiredDone ? "text-mint-600" : "text-coral-500"}>
                  {doneCount}
                </span>{" "}
                / {requiredGate.length} 已完成檢核
              </p>
            </div>
            <div className="h-1.5 w-full rounded-full bg-navy-800/8 overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-mint-400 to-mint-500 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    requiredGate.length ? (doneCount / requiredGate.length) * 100 : 100
                  }%`,
                }}
              />
            </div>

            <div className="space-y-3">
              {gateTasks.map((task) => (
                <GateTaskCard
                  key={task.id}
                  task={task}
                  friends={friends}
                  disabled={editLocked}
                  deleteHidden={
                    (task.assignedBy === "host" || task.assignedBy === "Host") &&
                    currentRole === "attendee"
                  }
                  onChange={(patch) => {
                    patchGateTask(task.id, patch);
                    if (task.fieldKey && patch.value !== undefined) {
                      setField(task.fieldKey, patch.value);
                    }
                  }}
                  onComplete={() => {
                    completeGateTask(task.id);
                    if (task.fieldKey) setField(task.fieldKey, task.value);
                  }}
                  onRemove={() => removeGateTask(task.id)}
                />
              ))}
            </div>

            {showAddCustomGateTask ? (
              <button
                type="button"
                onClick={addCustomGateTask}
                className="mt-4 w-full flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-navy-800/15 bg-white/60 px-4 py-3 text-sm font-semibold text-navy-500 transition-all hover:border-mint-300 hover:text-mint-700 hover:bg-mint-50/40"
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
                新增自訂檢核事項
              </button>
            ) : (
              <p className="mt-4 text-center text-[11px] text-navy-400 rounded-2xl border border-dashed border-navy-800/10 bg-navy-800/[0.02] px-4 py-3">
                {!isHostAssignmentEnabled
                  ? "已關閉「上級分配代辦」：本場不開放手動派單，改走協作或會後 AI 提取。"
                  : currentRole !== "host"
                  ? "僅上級（Host）可新增並指派檢核事項。"
                  : "編輯已被上級鎖定。"}
              </p>
            )}
            {gateTasks.length === 0 && (
              <p className="mt-3 text-center text-xs text-navy-400">
                目前沒有檢核事項。可直接發起，或自行新增規則。
              </p>
            )}

            {createError && <p className="mt-3 text-sm text-coral-500 text-center">{createError}</p>}

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center justify-center gap-1 px-4 py-3.5 rounded-2xl text-navy-500 font-semibold border border-navy-800/10 hover:bg-navy-800/[0.03] transition-colors"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
                上一步
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canUnlock || creating}
                className={`flex-1 flex items-center justify-center gap-2 font-black py-3.5 rounded-2xl transition-all active:scale-[0.98]
                  ${
                    canUnlock && !creating
                      ? scheduleMode === "scheduled"
                        ? "text-white bg-coral-500 hover:bg-coral-400 shadow-sm"
                        : "text-white bg-gradient-to-r from-mint-400 via-mint-500 to-mint-500 shadow-[0_8px_24px_rgba(20,184,166,0.35)] hover:shadow-[0_10px_28px_rgba(20,184,166,0.45)]"
                      : "bg-navy-800/5 text-navy-300 cursor-not-allowed"
                  }`}
              >
                {creating ? (
                  scheduleMode === "scheduled" ? "排程中…" : "建立中…"
                ) : canUnlock ? (
                  scheduleMode === "scheduled" ? (
                    <>
                      <CalendarDays className="h-4 w-4" strokeWidth={2.4} />
                      完成預約排程
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" strokeWidth={2.4} />
                      進入大廳準備
                      <ChevronRight className="h-4 w-4" strokeWidth={2.6} />
                    </>
                  )
                ) : (
                  <>
                    <Lock className="h-4 w-4" strokeWidth={2.4} />
                    完成檢核即可開啟會議
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

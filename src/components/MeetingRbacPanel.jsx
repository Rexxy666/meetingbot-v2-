import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Users, ChevronDown } from "lucide-react";

/* ════════════════════════════════════════════════════════════════════════
   動態會議權限控制面板 (Dynamic RBAC) — 受控元件（Controlled）
   由父層提供狀態與 setter，達成像素級即時連動：
     currentRole / setCurrentRole
     isEditRestricted / setIsEditRestricted
     isHostAssignmentEnabled / setIsHostAssignmentEnabled
   variant:
     "panel"    內嵌卡片（用於發起頁步驟三）
     "compact"  微型下拉選單（用於會議進行中頁頂部）
   ── 未提供 props 時自帶內部狀態，維持可獨立運行 ──
   ════════════════════════════════════════════════════════════════════════ */

export const RBAC_ROLES = [
  { value: "host", label: "Host（上級 / 發起人）", short: "Host 上級", emoji: "" },
  { value: "recorder", label: "Recorder（專職紀錄員）", short: "Recorder 紀錄", emoji: "" },
  { value: "attendee", label: "Attendee（下級 / 與會者）", short: "Attendee 與會", emoji: "" },
];

const roleMeta = (value) => RBAC_ROLES.find((r) => r.value === value) || RBAC_ROLES[0];

function Toggle({ checked, onChange, tint = "mint" }) {
  const on = tint === "coral" ? "bg-coral-500" : "bg-mint-500";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${checked ? on : "bg-navy-800/15"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,27,45,0.3)] transition-all duration-200 ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

/**
 * 鐵律：上級指派任務（assignedBy === 'host'）對下級一律不可刪，不需開關。
 * 本面板第二顆開關改為「是否由上級分配代辦事項」。
 */
function Controls({ role, setRole, edit, setEdit, hostAssign, setHostAssign }) {
  const isHost = role === "host";
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-bold text-navy-500 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" strokeWidth={2} /> 當前測試角色
        </label>
        <div className="relative mt-1.5">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full appearance-none rounded-xl border border-navy-800/10 bg-white px-3.5 py-2.5 pr-9 text-sm font-semibold text-navy-800 focus:border-mint-400 focus:shadow-glow transition-all"
          >
            {RBAC_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="h-4 w-4 text-navy-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={2.2}
          />
        </div>
      </div>

      {isHost ? (
        <div className="space-y-2 rounded-2xl border border-white/50 bg-white/60 backdrop-blur-md ring-1 ring-navy-800/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-black text-navy-700">
            <ShieldCheck className="h-3.5 w-3.5 text-mint-600" strokeWidth={2.2} /> Host 權限管理（僅上級可見）
          </p>
          <div className="flex items-center gap-3 rounded-xl border border-navy-800/8 bg-white/70 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-navy-800">編輯權限限制</p>
              <p className="text-[11px] text-navy-400">
                {edit ? "嚴格管控：下級無法打字編輯" : "全體開放共編"}
              </p>
            </div>
            <Toggle checked={edit} onChange={setEdit} />
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-navy-800/8 bg-white/70 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-navy-800">是否由上級分配代辦事項（任務）</p>
              <p className="text-[11px] text-navy-400">
                {hostAssign
                  ? "開啟後，僅上級可手動指派與強制分配任務給下級成員"
                  : "關閉後本場不允許上級單向派單（純協作／AI 提取）"}
              </p>
            </div>
            <Toggle checked={hostAssign} onChange={setHostAssign} tint="coral" />
          </div>
          <p className="text-[10px] text-navy-400 leading-relaxed px-0.5">
            鐵律：凡標示為上級指派的任務，下級一律不可刪除（無需額外開關）。
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-navy-400 leading-relaxed rounded-xl bg-navy-800/[0.03] px-3 py-2">
          目前以 <b className="text-navy-600">{roleMeta(role).short}</b> 身分檢視。權限開關僅 Host 可調整；
          {edit ? "編輯已被上級鎖定。" : ""}
          {hostAssign ? "" : " 本場已關閉上級派單。"}
        </p>
      )}
    </div>
  );
}

export default function MeetingRbacPanel({
  currentRole,
  setCurrentRole,
  isEditRestricted,
  setIsEditRestricted,
  isHostAssignmentEnabled,
  setIsHostAssignmentEnabled,
  variant = "panel",
  compact = false,
}) {
  const [roleI, setRoleI] = useState("host");
  const [editI, setEditI] = useState(false);
  const [hostAssignI, setHostAssignI] = useState(true);

  const role = currentRole ?? roleI;
  const setRole = setCurrentRole ?? setRoleI;
  const edit = isEditRestricted ?? editI;
  const setEdit = setIsEditRestricted ?? setEditI;
  const hostAssign = isHostAssignmentEnabled ?? hostAssignI;
  const setHostAssign = setIsHostAssignmentEnabled ?? setHostAssignI;

  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (compact) {
    return (
      <div className="rounded-2xl border border-white/50 bg-white/90 backdrop-blur-md ring-1 ring-navy-800/5 shadow-card-hover p-3 text-navy-800">
        <Controls
          role={role}
          setRole={setRole}
          edit={edit}
          setEdit={setEdit}
          hostAssign={hostAssign}
          setHostAssign={setHostAssign}
        />
      </div>
    );
  }

  if (variant === "compact") {
    const meta = roleMeta(role);
    return (
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-navy-800/10 bg-white/80 backdrop-blur-md px-3 py-1.5 text-xs font-bold text-navy-700 shadow-sm hover:border-mint-300 transition-colors"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <ShieldCheck className="h-4 w-4 text-mint-600" strokeWidth={2.2} />
          <span className="hidden sm:inline">權限</span>
          <span className="text-navy-500">{roleMeta(role).short}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-navy-400 transition-transform ${open ? "rotate-180" : ""}`}
            strokeWidth={2.4}
          />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/50 bg-white/85 backdrop-blur-md ring-1 ring-navy-800/5 shadow-card-hover p-3 z-50 fade-in">
            <Controls
              role={role}
              setRole={setRole}
              edit={edit}
              setEdit={setEdit}
              hostAssign={hostAssign}
              setHostAssign={setHostAssign}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/50 bg-white/70 backdrop-blur-md ring-1 ring-navy-800/5 shadow-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-8 w-8 rounded-xl bg-mint-500 text-white flex items-center justify-center">
          <ShieldCheck className="h-5 w-5" strokeWidth={2} />
        </span>
        <div>
          <p className="text-sm font-black text-navy-800">會議權限控制</p>
          <p className="text-[11px] text-navy-400">切換角色即時檢視 UI 連動</p>
        </div>
      </div>
      <Controls
        role={role}
        setRole={setRole}
        edit={edit}
        setEdit={setEdit}
        hostAssign={hostAssign}
        setHostAssign={setHostAssign}
      />
    </div>
  );
}

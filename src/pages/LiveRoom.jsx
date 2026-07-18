import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, KeyRound, Lock, MoreVertical, ShieldCheck, Users } from "lucide-react";
import Avatar from "../components/Avatar.jsx";
import PainPointsList from "../components/PainPointsList.jsx";
import InviteModal from "../components/InviteModal.jsx";
import { formatMeetingCode } from "../components/CreatedInviteModal.jsx";
import { extractReview } from "../lib/extract.js";
import { connectSocket } from "../lib/socket.js";
import { inviteToMeeting } from "../lib/api.js";

const TYPING_PALETTE = [
  { text: "text-mint-700", bg: "bg-mint-50", dot: "bg-mint-500" },
  { text: "text-coral-500", bg: "bg-coral-50", dot: "bg-coral-400" },
  { text: "text-sky-600", bg: "bg-sky-50", dot: "bg-sky-400" },
  { text: "text-purple-600", bg: "bg-purple-50", dot: "bg-purple-500" },
  { text: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
  { text: "text-navy-700", bg: "bg-navy-800/5", dot: "bg-navy-600" },
];

const RBAC_ROLES = [
  { value: "host", label: "Host（上級 / 發起人）", short: "Host", emoji: "👑" },
  { value: "recorder", label: "Recorder（專職紀錄員）", short: "Recorder", emoji: "📝" },
  { value: "attendee", label: "Attendee（下級 / 與會者）", short: "Attendee", emoji: "🙋" },
];

const END_RULES = [
  { value: "anyone", label: "全員皆可結束" },
  { value: "host_only", label: "僅限 Host（發起人）" },
  { value: "restricted", label: "特定指定成員" },
];

const REPORT_REASONS = [
  { id: "disrupt", label: "惡意干擾會議" },
  { id: "language", label: "言語不當" },
  { id: "offline", label: "長時間離線" },
  { id: "other", label: "其他不當行為" },
];

const REPORT_KICK_RATIO = 0.6;

const paletteFor = (name) => {
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % TYPING_PALETTE.length;
  return TYPING_PALETTE[h];
};

const avatarColor = (name) => {
  const colors = ["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"];
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
};

/** 姓名正規化（去空白、小寫）供唯一鍵比對 */
const normName = (n) => String(n || "").trim().toLowerCase();

/**
 * 強制名單唯一：同一人（同名或同 id）只留一筆；合併 id／email，joined 優先。
 */
function dedupeRoster(list = []) {
  const byName = new Map();
  const order = [];
  for (const raw of list) {
    if (!raw) continue;
    const name = String(raw.name || "").trim();
    if (!name) continue;
    const key = normName(name);
    const incoming = {
      id: raw.id || null,
      name,
      email: String(raw.email || "").trim(),
      status: raw.status === "joined" ? "joined" : "inviting",
    };
    if (!byName.has(key)) {
      byName.set(key, incoming);
      order.push(key);
      continue;
    }
    const prev = byName.get(key);
    byName.set(key, {
      id: prev.id || incoming.id || null,
      name: prev.name || incoming.name,
      email: prev.email || incoming.email,
      status: prev.status === "joined" || incoming.status === "joined" ? "joined" : "inviting",
    });
  }
  return order.map((k) => byName.get(k));
}

function sameRoster(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((row, i) => {
    const o = b[i];
    return o && o.name === row.name && o.status === row.status && (o.id || null) === (row.id || null);
  });
}

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-mint-500" : "bg-navy-800/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,27,45,0.3)] transition-all duration-200 ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function buildSeedRoster(meeting) {
  const fromRoster = Array.isArray(meeting?.inviteRoster) ? meeting.inviteRoster : [];
  if (fromRoster.length) {
    return dedupeRoster(
      fromRoster.map((p) => ({
        id: p.id || null,
        name: String(p.name || "").trim(),
        email: String(p.email || "").trim(),
        status: p.status === "joined" ? "joined" : "inviting",
      }))
    );
  }
  const fromAttendees = Array.isArray(meeting?.attendees) ? meeting.attendees : [];
  if (fromAttendees.length) {
    return dedupeRoster(
      fromAttendees.map((p) =>
        typeof p === "string"
          ? { id: null, name: p.trim(), email: "", status: "inviting" }
          : {
              id: p?.id || null,
              name: String(p?.name || "").trim(),
              email: String(p?.email || "").trim(),
              status: "inviting",
            }
      )
    );
  }
  return dedupeRoster(
    (meeting?.participants || []).map((name) => ({
      id: null,
      name: String(name || "").trim(),
      email: "",
      status: "inviting",
    }))
  );
}

function resolveHostName(meeting, me) {
  if (me?.id && meeting?.ownerId && me.id === meeting.ownerId && me.name) {
    return String(me.name).trim();
  }
  if (meeting?.ownerName) return String(meeting.ownerName).trim();
  if (meeting?.hostName) return String(meeting.hostName).trim();
  return String(me?.name || "").trim();
}

/** 與會者唯一鍵：優先 id，否則正規化姓名 */
const personKey = (p) => {
  if (!p) return "";
  if (p.id) return `id:${p.id}`;
  return `name:${normName(p.name)}`;
};

const reporterKey = (me) => {
  if (!me) return "";
  if (me.id) return `id:${me.id}`;
  return `name:${normName(me.name)}`;
};

function MemberActionMenu({
  member,
  canKick = false,
  isSelf = false,
  onProfile,
  onReport,
  onKick,
}) {
  const [open, setOpen] = useState(false);
  if (isSelf) return null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="更多操作"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-navy-400 hover:text-navy-700 hover:bg-navy-800/5 transition-colors"
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2.2} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="關閉選單"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl border border-navy-800/10 bg-white/95 backdrop-blur-md shadow-card-hover py-1 ring-1 ring-navy-800/5 fade-in">
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs font-semibold text-navy-700 hover:bg-navy-800/[0.04] transition-colors"
              onClick={() => {
                setOpen(false);
                onProfile?.(member);
              }}
            >
              👤 個人資訊
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs font-semibold text-navy-700 hover:bg-navy-800/[0.04] transition-colors"
              onClick={() => {
                setOpen(false);
                onReport?.(member);
              }}
            >
              🚩 舉報成員
            </button>
            {canKick && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-xs font-semibold text-coral-500 hover:bg-coral-50 transition-colors"
                onClick={() => {
                  setOpen(false);
                  onKick?.(member);
                }}
              >
                🚫 踢除成員
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MemberProfileModal({
  member,
  friends = [],
  outgoing = [],
  localPending = {},
  onClose,
  onAddFriend,
}) {
  const [phase, setPhase] = useState("idle"); // idle | loading | sent
  if (!member) return null;

  const key = personKey(member);
  const isFriend = (friends || []).some(
    (f) =>
      (member.id && f.id === member.id) ||
      (member.email &&
        f.email &&
        String(f.email).trim().toLowerCase() === String(member.email).trim().toLowerCase()) ||
      normName(f.name) === normName(member.name)
  );
  const alreadyOutgoing = (outgoing || []).some(
    (r) =>
      (member.id && r?.user?.id === member.id) ||
      normName(r?.user?.name) === normName(member.name)
  );
  const pending = Boolean(localPending[key]) || alreadyOutgoing || phase === "sent";

  const handleAdd = async () => {
    if (isFriend || pending || phase === "loading") return;
    setPhase("loading");
    try {
      await onAddFriend?.(member);
    } catch {
      /* 仍顯示已送出，避免卡住 */
    }
    await new Promise((r) => setTimeout(r, 1000));
    setPhase("sent");
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-profile-title"
    >
      <button type="button" aria-label="關閉" className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/60 bg-white/90 backdrop-blur-xl shadow-card-hover p-6 ring-1 ring-navy-800/10 text-center">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 h-8 w-8 rounded-full bg-navy-800/5 text-navy-400 hover:bg-navy-800/10 text-sm font-bold"
          aria-label="關閉"
        >
          ✕
        </button>
        <div className="mx-auto mb-3 flex justify-center">
          <Avatar name={member.name} color={avatarColor(member.name)} size="h-16 w-16" ring={false} />
        </div>
        <h3 id="member-profile-title" className="text-lg font-bold text-navy-800">
          {member.name}
        </h3>
        <p className="mt-1 text-sm text-navy-400 truncate">
          {member.email || "尚未提供電子郵件"}
        </p>
        <div className="mt-5">
          {isFriend ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-800/[0.06] px-4 py-2 text-sm font-bold text-mint-600">
              ✓ 已是系統好友
            </span>
          ) : pending || phase === "sent" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-50 border border-mint-100 px-4 py-2 text-sm font-bold text-mint-700">
              ✓ 已送出好友申請
            </span>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              disabled={phase === "loading"}
              className={`w-full rounded-2xl px-4 py-3 text-sm font-bold text-white bg-mint-500 hover:bg-mint-600 shadow-sm transition-all active:scale-[0.98] disabled:opacity-70 ${
                phase === "loading" ? "animate-pulse" : ""
              }`}
            >
              {phase === "loading" ? "送出中…" : "＋ 加為好友"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportMemberModal({ member, submitting = false, onClose, onSubmit }) {
  const [reason, setReason] = useState(REPORT_REASONS[0].id);
  if (!member) return null;
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-member-title"
    >
      <button
        type="button"
        aria-label="關閉"
        disabled={submitting}
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={() => {
          if (!submitting) onClose?.();
        }}
      />
      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/60 bg-white/90 backdrop-blur-xl shadow-card-hover p-5 ring-1 ring-navy-800/10">
        <h3 id="report-member-title" className="text-base font-bold text-navy-800">
          舉報成員
        </h3>
        <p className="mt-2 text-sm text-navy-600 leading-relaxed">
          請選擇舉報 <b className="text-navy-800">{member.name}</b> 的原因：
        </p>
        <ul className="mt-4 space-y-2">
          {REPORT_REASONS.map((r) => (
            <li key={r.id}>
              <label
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                  reason === r.id
                    ? "border-mint-300 bg-mint-50"
                    : "border-navy-800/8 bg-white hover:bg-navy-800/[0.02]"
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.id}
                  checked={reason === r.id}
                  onChange={() => setReason(r.id)}
                  className="accent-mint-500"
                />
                <span className="text-sm font-semibold text-navy-700">{r.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-navy-500 bg-navy-800/5 hover:bg-navy-800/10 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => onSubmit?.(reason)}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-coral-500 hover:bg-coral-600 shadow-sm transition-colors disabled:opacity-60"
          >
            {submitting ? "送出中…" : "確認送出舉報"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ParticipantRoster({
  roster,
  canKick = false,
  hostName = "",
  meName = "",
  meId = null,
  onKick,
  onProfile,
  onReport,
  showEditAuth = false,
  allowedEditors = [],
  onToggleEditor,
  canConfigureAuth = false,
  bare = false,
}) {
  const clean = dedupeRoster(roster);
  if (!clean.length) return null;
  const joined = clean.filter((p) => p.status === "joined").length;
  return (
    <div
      className={
        bare
          ? ""
          : "mt-3 rounded-2xl border border-navy-800/8 bg-navy-800/[0.02] px-3 py-2.5"
      }
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-bold text-navy-500">與會者動態</p>
        <p className="text-[10px] font-semibold text-mint-600">
          {joined}/{clean.length} 已加入
        </p>
      </div>
      <ul className="space-y-1.5">
        {clean.map((p) => {
          const joinedNow = p.status === "joined";
          const isHostRow = hostName && normName(p.name) === normName(hostName);
          const isSelf =
            (meId && p.id && p.id === meId) ||
            (meName && normName(p.name) === normName(meName));
          const showKick = canKick && !isHostRow && !isSelf && typeof onKick === "function";
          const editOn = allowedEditors.includes(p.name) || isHostRow;
          return (
            <li
              key={`roster-${normName(p.name)}-${p.id || "x"}`}
              className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all duration-500 ease-out ${
                joinedNow
                  ? "bg-white border border-mint-100 shadow-sm opacity-100 translate-y-0"
                  : "bg-transparent border border-transparent opacity-70"
              }`}
            >
              <div className={`relative ${joinedNow ? "scale-100" : "scale-95"} transition-transform duration-500`}>
                <Avatar name={p.name} color={avatarColor(p.name)} size="h-7 w-7" ring={false} />
                {!joinedNow && (
                  <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 border-2 border-white animate-pulse" />
                )}
                {joinedNow && (
                  <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-mint-500 border-2 border-white" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-navy-700 truncate">
                  {p.name}
                  {isHostRow ? (
                    <span className="ml-1 text-[9px] font-bold text-mint-600">Host</span>
                  ) : null}
                  {isSelf ? (
                    <span className="ml-1 text-[9px] font-bold text-navy-300">我</span>
                  ) : null}
                </p>
                {p.email ? <p className="text-[10px] text-navy-300 truncate">{p.email}</p> : null}
              </div>
              <div className="shrink-0 flex items-center gap-1">
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    joinedNow
                      ? "bg-mint-50 text-mint-700 border border-mint-100"
                      : "bg-amber-50 text-amber-600 border border-amber-100"
                  }`}
                >
                  {joinedNow ? "已加入" : "邀請中"}
                </span>
                {showEditAuth && !isHostRow && typeof onToggleEditor === "function" && (
                  <label className="flex items-center gap-1" title="筆記編輯授權">
                    <Toggle
                      checked={editOn}
                      disabled={!canConfigureAuth}
                      onChange={(v) => onToggleEditor(p.name, v)}
                    />
                  </label>
                )}
                <MemberActionMenu
                  member={p}
                  canKick={showKick}
                  isSelf={isSelf}
                  onProfile={onProfile}
                  onReport={onReport}
                  onKick={onKick}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 最多顯示 3 個頭像；超過則以 +N 收攏，點擊開啟完整名單 */
function CompactAvatarStack({ people = [], onOpen, maxVisible = 3 }) {
  const list = dedupeRoster(people);
  if (!list.length) return null;
  const visible = list.slice(0, maxVisible);
  const overflow = Math.max(0, list.length - maxVisible);
  return (
    <button
      type="button"
      onClick={onOpen}
      title="查看與會者"
      className="flex items-center shrink-0 rounded-full pl-0.5 pr-1 py-0.5 -mr-0.5 active:scale-95 transition-transform"
    >
      <div className="flex -space-x-2">
        {visible.map((p, i) => (
          <div
            key={`ava-${normName(p.name)}-${p.id || i}`}
            className={`transition-all duration-500 ${
              p.status === "joined" ? "opacity-100 scale-100" : "opacity-45 scale-95 grayscale"
            }`}
            title={`${p.name} · ${p.status === "joined" ? "已加入" : "邀請中"}`}
          >
            <Avatar name={p.name} color={avatarColor(p.name)} size="h-7 w-7" ring={false} />
          </div>
        ))}
        {overflow > 0 && (
          <div
            className="h-7 w-7 rounded-full bg-navy-800/15 text-navy-500 text-[10px] font-black flex items-center justify-center border-2 border-white shadow-sm"
            aria-label={`還有 ${overflow} 人`}
          >
            +{overflow}
          </div>
        )}
      </div>
    </button>
  );
}

function MeetingCodeChip({ code }) {
  const digits = String(code || "").replace(/\D/g, "");
  const [copied, setCopied] = useState(false);
  if (!digits) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(digits);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="點擊複製會議代碼"
      className="flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-full transition-colors"
    >
      <KeyRound className="h-3.5 w-3.5 opacity-80" strokeWidth={2} />
      <span className="tabular-nums tracking-wider">{formatMeetingCode(digits)}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-mint-300" strokeWidth={2.5} />
      ) : (
        <Copy className="h-3.5 w-3.5 opacity-70" strokeWidth={2} />
      )}
    </button>
  );
}

function formatClock(seconds) {
  const s = Math.max(0, seconds | 0);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function CircleTimer({ seconds, total }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, seconds / total) : 0;
  const mm = String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0");
  const ss = String(Math.max(0, seconds) % 60).padStart(2, "0");
  const low = seconds <= 60;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#E7EDF1" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          stroke={low ? "#FF8A5B" : "#14B8A6"}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-black tabular-nums ${low ? "text-coral-500" : "text-navy-800"}`}>
          {mm}:{ss}
        </span>
        <span className="text-[9px] font-semibold text-navy-300">剩餘</span>
      </div>
    </div>
  );
}

/**
 * Host 專屬：與會者編輯授權矩陣 + 結束會議規則
 * 「當前測試角色」僅真房東且尚未降級時可見，杜絕下級切換篡位。
 */
function HostPermissionMatrix({
  currentRole,
  onTestRoleChange,
  showRoleSwitcher,
  isHostAssignmentEnabled,
  setIsHostAssignmentEnabled,
  isKickPermissionEnabled,
  setIsKickPermissionEnabled,
  memberNames,
  allowedEditors,
  setAllowedEditors,
  allowedKickers,
  setAllowedKickers,
  endMeetingRule,
  setEndMeetingRule,
  allowedEndMeetingUsers,
  setAllowedEndMeetingUsers,
  readOnly,
  hostName = "",
}) {
  const isHost = currentRole === "host";
  const canConfig = isHost && !readOnly;

  const toggleName = (list, name, on) => {
    if (on) return list.includes(name) ? list : [...list, name];
    return list.filter((n) => n !== name);
  };

  const kickCandidates = memberNames.filter((n) => normName(n) !== normName(hostName));

  return (
    <div className="rounded-2xl border border-white/50 bg-white/85 backdrop-blur-md ring-1 ring-navy-800/5 shadow-card-hover p-3 text-navy-800 max-h-[min(70vh,560px)] overflow-y-auto">
      {showRoleSwitcher ? (
        <div className="mb-3">
          <label className="text-[11px] font-bold text-navy-500 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" strokeWidth={2} /> 當前測試角色
          </label>
          <div className="relative mt-1.5">
            <select
              value={currentRole}
              onChange={(e) => onTestRoleChange?.(e.target.value)}
              className="w-full appearance-none rounded-xl border border-navy-800/10 bg-white px-3 py-2 pr-8 text-sm font-semibold text-navy-800 focus:border-mint-400 focus:outline-none"
            >
              {RBAC_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.emoji} {r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="h-4 w-4 text-navy-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={2.2} />
          </div>
          <p className="mt-1.5 text-[10px] text-navy-400 leading-relaxed">
            僅發起人可使用。切換為非 Host 後選單將永久隱藏，避免越權。
          </p>
        </div>
      ) : null}

      {!isHost ? (
        <p className="text-[11px] text-navy-400 leading-relaxed rounded-xl bg-navy-800/[0.03] px-3 py-2">
          目前以 <b className="text-navy-600">{RBAC_ROLES.find((r) => r.value === currentRole)?.short}</b>{" "}
          身分檢視。精細授權僅 Host 可設定。
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-navy-800/8 bg-white/70 px-3 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-navy-800">是否由上級分配代辦事項（任務）</p>
              <p className="text-[11px] text-navy-400">
                {isHostAssignmentEnabled
                  ? "開啟後，僅上級可手動指派與強制分配任務給下級成員"
                  : "關閉後本場不允許上級單向派單"}
              </p>
            </div>
            <Toggle
              checked={isHostAssignmentEnabled}
              onChange={setIsHostAssignmentEnabled}
              disabled={!canConfig}
            />
          </div>

          <div className="rounded-xl border border-navy-800/8 bg-white/70 px-3 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-navy-800">是否開放輔助管理員踢人權限</p>
              <p className="text-[11px] text-navy-400">
                {isKickPermissionEnabled
                  ? "開啟後，可將踢人權限分享給指定成員"
                  : "關閉時全場僅發起人（Host）可踢人"}
              </p>
            </div>
            <Toggle
              checked={isKickPermissionEnabled}
              onChange={setIsKickPermissionEnabled}
              disabled={!canConfig}
            />
          </div>

          {isKickPermissionEnabled && (
            <div className="rounded-xl border border-navy-800/8 bg-white/70 px-3 py-2.5">
              <p className="text-sm font-bold text-navy-800 flex items-center gap-1.5">
                <span aria-hidden>⛔</span> 踢人權限分享（單獨開通）
              </p>
              <p className="text-[11px] text-navy-400 mt-0.5 mb-2">
                勾選後該成員可將他人移出會議（發起人除外）
              </p>
              <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                {kickCandidates.map((name) => {
                  const on = allowedKickers.includes(name);
                  return (
                    <li
                      key={`kick-${name}`}
                      className="flex items-center gap-2 rounded-lg border border-navy-800/5 bg-white px-2 py-1.5"
                    >
                      <Avatar name={name} color={avatarColor(name)} size="h-6 w-6" ring={false} />
                      <span className="min-w-0 flex-1 text-xs font-semibold text-navy-700 truncate">{name}</span>
                      <Toggle
                        checked={on}
                        disabled={!canConfig}
                        onChange={(v) => setAllowedKickers((prev) => toggleName(prev, name, v))}
                      />
                    </li>
                  );
                })}
                {kickCandidates.length === 0 && (
                  <li className="text-[11px] text-navy-300 px-1 py-2">尚無可授權成員</li>
                )}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-navy-800/8 bg-white/70 px-3 py-2.5">
            <p className="text-sm font-bold text-navy-800 flex items-center gap-1.5">
              <span aria-hidden>👥</span> 與會者編輯授權（單獨開通）
            </p>
            <p className="text-[11px] text-navy-400 mt-0.5 mb-2">
              撥動開關即可讓該成員編輯議程筆記（Host 預設永遠可編輯）
            </p>
            <ul className="space-y-1.5 max-h-40 overflow-y-auto">
              {memberNames.map((name) => {
                const on = allowedEditors.includes(name);
                return (
                  <li
                    key={name}
                    className="flex items-center gap-2 rounded-lg border border-navy-800/5 bg-white px-2 py-1.5"
                  >
                    <Avatar name={name} color={avatarColor(name)} size="h-6 w-6" ring={false} />
                    <span className="min-w-0 flex-1 text-xs font-semibold text-navy-700 truncate">{name}</span>
                    <Toggle
                      checked={on}
                      disabled={!canConfig}
                      onChange={(v) => setAllowedEditors((prev) => toggleName(prev, name, v))}
                    />
                  </li>
                );
              })}
              {memberNames.length === 0 && (
                <li className="text-[11px] text-navy-300 px-1 py-2">尚無與會者名單</li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-navy-800/8 bg-white/70 px-3 py-2.5">
            <p className="text-sm font-bold text-navy-800 flex items-center gap-1.5">
              <span aria-hidden>🛑</span> 結束會議權限配置
            </p>
            <p className="text-[11px] text-navy-400 mt-0.5 mb-2">決定誰能按下「結束會議 → AI 整理」</p>
            <div className="space-y-1.5">
              {END_RULES.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors ${
                    endMeetingRule === opt.value
                      ? "border-mint-200 bg-mint-50/60"
                      : "border-navy-800/5 bg-white hover:border-mint-100"
                  } ${!canConfig ? "opacity-75 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="endMeetingRule"
                    value={opt.value}
                    checked={endMeetingRule === opt.value}
                    disabled={!canConfig}
                    onChange={() => setEndMeetingRule(opt.value)}
                    className="text-mint-500 focus:ring-mint-200"
                  />
                  <span className="text-xs font-semibold text-navy-700">{opt.label}</span>
                </label>
              ))}
            </div>

            {endMeetingRule === "restricted" && (
              <ul className="mt-2 space-y-1.5 max-h-36 overflow-y-auto border-t border-navy-800/5 pt-2">
                {memberNames.map((name) => {
                  const on = allowedEndMeetingUsers.includes(name);
                  return (
                    <li key={`end-${name}`} className="flex items-center gap-2 px-1 py-1">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!canConfig}
                        onChange={(e) =>
                          setAllowedEndMeetingUsers((prev) => toggleName(prev, name, e.target.checked))
                        }
                        className="rounded border-navy-800/20 text-mint-500 focus:ring-mint-200"
                      />
                      <Avatar name={name} color={avatarColor(name)} size="h-5 w-5" ring={false} />
                      <span className="text-xs font-medium text-navy-700">{name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="text-[10px] text-navy-400 leading-relaxed">
            鐵律提醒：上級指派任務對下級一律不可刪除。權限變更會即時寫入會議並同步其他裝置。
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * 進行中會議（LiveMeeting / LiveRoom）
 * 精準授權矩陣 + 結束會議規則 + 跨端結束強同步
 */
export default function LiveRoom({ meeting, store, go, social, me, onAgendaChange }) {
  const total = meeting.durationMin * 60;
  const agenda = useMemo(
    () => (meeting.goals?.length ? meeting.goals : ["會議討論"]),
    [meeting.goals]
  );

  const [sec, setSec] = useState(() => {
    if (meeting.startedAt) return Math.max(0, total - Math.floor((Date.now() - meeting.startedAt) / 1000));
    return total;
  });
  const [agendaIdx, setAgendaIdx] = useState(0);
  const [peerCount, setPeerCount] = useState(1);
  const [inviting, setInviting] = useState(false);
  const [roster, setRoster] = useState(() => dedupeRoster(buildSeedRoster(meeting)));
  const inviteBootstrappedRef = useRef(null); // meeting.id once invite pipeline started
  const redirectedRef = useRef(false);

  /** 真房東：僅會議發起人（ownerId）才是，與測試角色切換脫鉤 */
  const isTrueHost = Boolean(me?.id && meeting?.ownerId && me.id === meeting.ownerId);

  const [currentRole, setCurrentRole] = useState(() =>
    me?.id && meeting?.ownerId && me.id === meeting.ownerId ? "host" : "attendee"
  );
  /** 測試角色選單：僅真房東進房時開啟；一旦降級為非 host 立刻永久關閉 */
  const [roleSwitcherAvailable, setRoleSwitcherAvailable] = useState(
    () => Boolean(me?.id && meeting?.ownerId && me.id === meeting.ownerId)
  );
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endingMeeting, setEndingMeeting] = useState(false);

  const allowDevRoleReset = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("devRole") === "1";
    } catch {
      return false;
    }
  }, []);

  const handleTestRoleChange = useCallback(
    (role) => {
      if (!isTrueHost || !roleSwitcherAvailable) return;
      const next = String(role || "attendee");
      setCurrentRole(next);
      if (next !== "host") {
        setRoleSwitcherAvailable(false);
      }
    },
    [isTrueHost, roleSwitcherAvailable]
  );

  const resetTestRoleForDev = useCallback(() => {
    if (!isTrueHost) return;
    setCurrentRole("host");
    setRoleSwitcherAvailable(true);
  }, [isTrueHost]);

  // 非真房東絕不可維持 host 測試身分（防 DevTools / 殘留 state）
  useEffect(() => {
    if (!isTrueHost && currentRole === "host") {
      setCurrentRole("attendee");
      setRoleSwitcherAvailable(false);
    }
  }, [isTrueHost, currentRole]);
  const [isHostAssignmentEnabled, setIsHostAssignmentEnabled] = useState(
    () => meeting?.rbac?.isHostAssignmentEnabled ?? meeting?.isHostAssignmentEnabled ?? true
  );
  const [isKickPermissionEnabled, setIsKickPermissionEnabled] = useState(
    () => meeting?.rbac?.isKickPermissionEnabled ?? meeting?.isKickPermissionEnabled ?? false
  );
  const [allowedKickers, setAllowedKickers] = useState(() =>
    Array.isArray(meeting?.rbac?.allowedKickers)
      ? meeting.rbac.allowedKickers
      : Array.isArray(meeting?.allowedKickers)
      ? meeting.allowedKickers
      : []
  );
  const [kickTarget, setKickTarget] = useState(null);
  const [kicking, setKicking] = useState(false);
  /** 民主舉報：{ [personKey]: string[] reporterKeys } */
  const [memberReports, setMemberReports] = useState(() =>
    meeting?.memberReports && typeof meeting.memberReports === "object" ? meeting.memberReports : {}
  );
  const [profileTarget, setProfileTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [reporting, setReporting] = useState(false);
  /** 本機模擬已送出好友申請（無 id 或 API 失敗時） */
  const [localFriendPending, setLocalFriendPending] = useState({});
  const [reportToast, setReportToast] = useState("");
  const [allowedEditors, setAllowedEditors] = useState(
    () =>
      Array.isArray(meeting?.rbac?.allowedEditors)
        ? meeting.rbac.allowedEditors
        : Array.isArray(meeting?.allowedEditors)
        ? meeting.allowedEditors
        : []
  );
  const [endMeetingRule, setEndMeetingRule] = useState(
    () => meeting?.rbac?.endMeetingRule || meeting?.endMeetingRule || "host_only"
  );
  const [allowedEndMeetingUsers, setAllowedEndMeetingUsers] = useState(
    () =>
      Array.isArray(meeting?.rbac?.allowedEndMeetingUsers)
        ? meeting.rbac.allowedEndMeetingUsers
        : Array.isArray(meeting?.allowedEndMeetingUsers)
        ? meeting.allowedEndMeetingUsers
        : []
  );
  const [meetingStatus, setMeetingStatus] = useState(() =>
    meeting?.status === "done" || meeting?.meetingStatus === "ended" ? "ended" : "in_progress"
  );
  const [rbacOpen, setRbacOpen] = useState(false);
  const [syncState, setSyncState] = useState("connecting");
  const [syncError, setSyncError] = useState(null);
  /** 手機分頁：notes | roster | pains */
  const [mobileTab, setMobileTab] = useState("notes");
  /** 手機：與會者頭像展開名單 Modal */
  const [rosterModalOpen, setRosterModalOpen] = useState(false);
  /** 手機：超長會議名稱點擊展開 */
  const [titleModalOpen, setTitleModalOpen] = useState(false);

  const [topicNotes, setTopicNotes] = useState(() => {
    if (meeting.topicNotes && Object.keys(meeting.topicNotes).length) return meeting.topicNotes;
    if (meeting.notes) return { [agenda[0]]: meeting.notes };
    return {};
  });
  const [typingList, setTypingList] = useState([]);

  const socketRef = useRef(null);
  const notesTimer = useRef(null);
  const typingEmitRef = useRef(0);
  const typingPeers = useRef(new Map());
  const topic = agenda[agendaIdx];

  const hostName = useMemo(() => resolveHostName(meeting, me), [meeting, me]);
  const currentUserName = String(me?.name || "").trim() || "與會者";

  /** 將 roster 寫回會議，供會後 Who 認領名單使用（寫入前強制去重） */
  const persistRoster = useCallback(
    (next) => {
      const clean = dedupeRoster(next);
      store.updateMeeting(meeting.id, {
        inviteRoster: clean,
        attendees: clean.map(({ id, name, email }) => ({ id, name, email })),
        participants: clean.map((row) => row.name),
        ownerName: hostName || meeting.ownerName,
      });
      return clean;
    },
    [store, meeting.id, meeting.ownerName, hostName]
  );

  /**
   * 將指定成員標為已加入（姓名唯一鍵）；禁止重複疊加。
   */
  const markRosterJoined = useCallback(
    (identity) => {
      const name = String(identity?.name || identity || "").trim();
      const id = identity?.id || null;
      if (!name && !id) return;

      setRoster((prev) => {
        const base = dedupeRoster(prev);
        const idx = base.findIndex(
          (row) => (id && row.id && row.id === id) || (name && normName(row.name) === normName(name))
        );
        let next;
        if (idx === -1) {
          if (!name) return base;
          next = dedupeRoster([
            ...base,
            { id, name, email: identity?.email || "", status: "joined" },
          ]);
        } else {
          next = base.map((row, i) =>
            i === idx
              ? {
                  ...row,
                  status: "joined",
                  id: id || row.id || null,
                  email: identity?.email || row.email || "",
                }
              : row
          );
        }
        if (sameRoster(base, next)) return base;
        persistRoster(next);
        return next;
      });
    },
    [persistRoster]
  );

  const memberNames = useMemo(() => {
    const names = [];
    const push = (n) => {
      const s = String(n || "").trim();
      if (s && !names.includes(s)) names.push(s);
    };
    push(hostName);
    push(currentUserName);
    roster.forEach((p) => push(p.name));
    (meeting.participants || []).forEach(push);
    (meeting.attendees || []).forEach((a) => push(typeof a === "string" ? a : a?.name));
    return names;
  }, [hostName, currentUserName, roster, meeting.participants, meeting.attendees]);

  const canEdit =
    (isTrueHost && currentRole === "host") || allowedEditors.includes(currentUserName);

  const canEndMeeting = useMemo(() => {
    // 僅「真房東 + 目前仍以 host 測試身分」享有無條件結束權；下級無法靠切換角色取得
    if (isTrueHost && currentRole === "host") return true;
    if (endMeetingRule === "anyone") return true;
    if (endMeetingRule === "host_only") return false;
    if (endMeetingRule === "restricted") {
      return allowedEndMeetingUsers.includes(currentUserName);
    }
    return false;
  }, [isTrueHost, currentRole, endMeetingRule, allowedEndMeetingUsers, currentUserName]);

  const canKick = useMemo(() => {
    if (isTrueHost && currentRole === "host") return true;
    if (!isKickPermissionEnabled) return false;
    return allowedKickers.includes(currentUserName);
  }, [isTrueHost, currentRole, isKickPermissionEnabled, allowedKickers, currentUserName]);

  const persistPermissions = useCallback(
    (patch = {}) => {
      const nextEditors = patch.allowedEditors ?? allowedEditors;
      const nextRule = patch.endMeetingRule ?? endMeetingRule;
      const nextEndUsers = patch.allowedEndMeetingUsers ?? allowedEndMeetingUsers;
      const nextHostAssign = patch.isHostAssignmentEnabled ?? isHostAssignmentEnabled;
      const nextKickEnabled = patch.isKickPermissionEnabled ?? isKickPermissionEnabled;
      const nextKickers = patch.allowedKickers ?? allowedKickers;
      const nextStatus = patch.meetingStatus ?? meetingStatus;
      store.updateMeeting(meeting.id, {
        allowedEditors: nextEditors,
        endMeetingRule: nextRule,
        allowedEndMeetingUsers: nextEndUsers,
        isHostAssignmentEnabled: nextHostAssign,
        isKickPermissionEnabled: nextKickEnabled,
        allowedKickers: nextKickers,
        meetingStatus: nextStatus,
        rbac: {
          ...(meeting.rbac || {}),
          isHostAssignmentEnabled: nextHostAssign,
          isKickPermissionEnabled: nextKickEnabled,
          allowedEditors: nextEditors,
          allowedKickers: nextKickers,
          endMeetingRule: nextRule,
          allowedEndMeetingUsers: nextEndUsers,
          meetingStatus: nextStatus,
        },
        ownerName: hostName || meeting.ownerName,
      });
    },
    [
      allowedEditors,
      allowedEndMeetingUsers,
      allowedKickers,
      endMeetingRule,
      hostName,
      isHostAssignmentEnabled,
      isKickPermissionEnabled,
      meeting.id,
      meeting.ownerName,
      meeting.rbac,
      meetingStatus,
      store,
    ]
  );

  // 遠端會議資料同步 → 本地授權矩陣
  useEffect(() => {
    const rbac = meeting.rbac || {};
    if (Array.isArray(rbac.allowedEditors) || Array.isArray(meeting.allowedEditors)) {
      setAllowedEditors(rbac.allowedEditors || meeting.allowedEditors || []);
    }
    if (rbac.endMeetingRule || meeting.endMeetingRule) {
      setEndMeetingRule(rbac.endMeetingRule || meeting.endMeetingRule || "host_only");
    }
    if (Array.isArray(rbac.allowedEndMeetingUsers) || Array.isArray(meeting.allowedEndMeetingUsers)) {
      setAllowedEndMeetingUsers(
        rbac.allowedEndMeetingUsers || meeting.allowedEndMeetingUsers || []
      );
    }
    if (typeof rbac.isHostAssignmentEnabled === "boolean" || typeof meeting.isHostAssignmentEnabled === "boolean") {
      setIsHostAssignmentEnabled(
        rbac.isHostAssignmentEnabled ?? meeting.isHostAssignmentEnabled ?? true
      );
    }
    if (typeof rbac.isKickPermissionEnabled === "boolean" || typeof meeting.isKickPermissionEnabled === "boolean") {
      setIsKickPermissionEnabled(
        rbac.isKickPermissionEnabled ?? meeting.isKickPermissionEnabled ?? false
      );
    }
    if (Array.isArray(rbac.allowedKickers) || Array.isArray(meeting.allowedKickers)) {
      setAllowedKickers(rbac.allowedKickers || meeting.allowedKickers || []);
    }
    if (meeting.status === "done" || meeting.meetingStatus === "ended" || rbac.meetingStatus === "ended") {
      setMeetingStatus("ended");
    }
  }, [meeting]);

  // 跨裝置強同步：任一端結束 → 全端強制進會後 AI 整理
  useEffect(() => {
    const ended =
      meetingStatus === "ended" ||
      meeting?.status === "done" ||
      meeting?.meetingStatus === "ended";
    if (!ended || redirectedRef.current) return;
    redirectedRef.current = true;
    go("post", meeting.id);
  }, [meetingStatus, meeting?.status, meeting?.meetingStatus, meeting.id, go]);

  useEffect(() => {
    if (meeting.status !== "live" && meeting.status !== "done") {
      store.updateMeeting(meeting.id, { status: "live", startedAt: Date.now(), meetingStatus: "in_progress" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 自動邀請 + 模擬加入（名單強制去重；Strict Mode 不重複塞人）
   */
  useEffect(() => {
    if (inviteBootstrappedRef.current === meeting.id) return undefined;

    const seed = dedupeRoster(buildSeedRoster(meeting));
    if (!seed.length) {
      if (hostName) {
        const solo = dedupeRoster([{ id: me?.id || null, name: hostName, email: "", status: "joined" }]);
        setRoster(solo);
        persistRoster(solo);
      }
      inviteBootstrappedRef.current = meeting.id;
      return undefined;
    }

    let cancelled = false;
    inviteBootstrappedRef.current = meeting.id;

    const invitingList = dedupeRoster(
      seed.map((p) => ({
        ...p,
        status:
          p.status === "joined" ||
          (hostName && normName(p.name) === normName(hostName)) ||
          (me?.id && p.id && p.id === me.id)
            ? "joined"
            : "inviting",
      }))
    );
    if (hostName && !invitingList.some((p) => normName(p.name) === normName(hostName))) {
      invitingList.unshift({ id: me?.id || null, name: hostName, email: "", status: "joined" });
    }
    const initial = dedupeRoster(invitingList);
    setRoster((prev) => {
      const joinedKeys = new Set(
        dedupeRoster(prev)
          .filter((row) => row.status === "joined")
          .map((row) => normName(row.name))
      );
      const next = dedupeRoster(
        initial.map((p) =>
          joinedKeys.has(normName(p.name)) || p.status === "joined" ? { ...p, status: "joined" } : p
        )
      );
      persistRoster(next);
      return next;
    });

    initial.forEach((p) => {
      if (!p.id || (me?.id && p.id === me.id)) return;
      inviteToMeeting(meeting.id, p.id).catch((err) => {
        console.warn("[LiveMeeting] auto-invite failed", p.name, err?.message || err);
      });
    });

    const timers = [];
    initial.forEach((p, i) => {
      if (p.status === "joined") return;
      const delay = 2000 + Math.floor(Math.random() * 2000) + i * 350;
      const t = window.setTimeout(() => {
        if (cancelled) return;
        markRosterJoined(p);
      }, delay);
      timers.push(t);
    });

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      // 不重置 inviteBootstrappedRef，避免 Strict Mode 重複寫入名單
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  // 保險：仍有「邀請中」時，數秒後統一標為已加入（補 Strict Mode 清掉的計時器）
  useEffect(() => {
    const t = window.setTimeout(() => {
      setRoster((prev) => {
        const base = dedupeRoster(prev);
        if (!base.some((p) => p.status !== "joined")) return base;
        const next = dedupeRoster(base.map((p) => ({ ...p, status: "joined" })));
        if (!sameRoster(base, next)) persistRoster(next);
        return next;
      });
    }, 4200);
    return () => window.clearTimeout(t);
  }, [meeting.id, persistRoster]);

  useEffect(() => {
    const id = setInterval(() => setSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    onAgendaChange?.(agendaIdx);
  }, [agendaIdx, onAgendaChange]);

  useEffect(() => {
    const meetingId = meeting?.id;
    if (!meetingId) {
      setSyncState("error");
      setSyncError("缺少 meetingId，無法加入共編房間");
      return undefined;
    }

    const socket = connectSocket();
    socketRef.current = socket;
    const userName = me?.name || "與會者";

    const join = () => {
      setSyncState("connecting");
      setSyncError(null);
      socket.emit("join-meeting", { meetingId, userName });
    };

    const onJoined = ({ meeting: joined, peerCount: count, userName: joinedName }) => {
      if (joined?.topicNotes) setTopicNotes(joined.topicNotes);
      setPeerCount(count || 1);
      setSyncState("joined");
      setSyncError(null);
      // 自己進房 → 立刻標為已加入
      markRosterJoined({ name: joinedName || userName, id: me?.id || null });
    };

    const onNotesSync = ({ topicNotes: synced, topic: t, content, from }) => {
      if (from && from === socket.id) return;
      setTopicNotes((prev) => synced ?? { ...prev, [t]: content ?? "" });
    };

    const onAgendaSync = ({ agendaIdx: idx }) => {
      if (typeof idx === "number") setAgendaIdx(idx);
    };

    const onPeerJoined = ({ peerCount: count, userName: peerName }) => {
      setPeerCount(count || 1);
      // 在線人數與 roster 狀態強綁定：有人進房就把對應名字標成已加入
      if (peerName) markRosterJoined({ name: peerName });
    };

    const onPeerLeft = ({ peerCount: count }) => {
      if (typeof count === "number") setPeerCount(Math.max(1, count));
      else setPeerCount((n) => Math.max(1, n - 1));
    };
    const onSockError = (err) => {
      setSyncState("error");
      setSyncError(err?.message || "Socket 錯誤");
    };

    const refreshTyping = () => {
      const arr = [...typingPeers.current.entries()].map(([from, v]) => ({
        from,
        name: v.name,
        topic: v.topic,
      }));
      setTypingList(arr);
    };
    const onTyping = ({ from, userName: un, topic: t }) => {
      if (!from) return;
      const m = typingPeers.current;
      if (m.has(from)) clearTimeout(m.get(from).timer);
      const timer = setTimeout(() => {
        m.delete(from);
        refreshTyping();
      }, 1800);
      m.set(from, { name: un || "與會者", topic: t, timer });
      refreshTyping();
    };

    const onMeetingUpdated = (updated) => {
      if (!updated || updated.id !== meetingId) return;
      if (updated.status === "done" || updated.meetingStatus === "ended") {
        setMeetingStatus("ended");
      }
      if (updated.topicNotes) setTopicNotes(updated.topicNotes);
      if (updated.memberReports && typeof updated.memberReports === "object") {
        setMemberReports(updated.memberReports);
      }

      // 合併 attendees / inviteRoster / participants，以姓名去重
      const incoming = [];
      const pushPerson = (raw, statusHint) => {
        if (!raw) return;
        if (typeof raw === "string") {
          const name = raw.trim();
          if (name) incoming.push({ id: null, name, email: "", status: statusHint });
          return;
        }
        const name = String(raw.name || "").trim();
        if (!name) return;
        incoming.push({
          id: raw.id || null,
          name,
          email: String(raw.email || "").trim(),
          status: raw.status === "joined" || statusHint === "joined" ? "joined" : "inviting",
        });
      };
      (updated.inviteRoster || []).forEach((p) => pushPerson(p, p?.status === "joined" ? "joined" : "inviting"));
      (updated.attendees || []).forEach((p) => pushPerson(p, "joined"));
      (updated.participants || []).forEach((p) => pushPerson(p, "joined"));

      if (incoming.length) {
        setRoster((prev) => {
          const next = dedupeRoster([...dedupeRoster(prev), ...incoming]);
          return sameRoster(prev, next) ? prev : next;
        });
      }
    };

    const onKicked = ({ meetingId: mid, targetUserId, targetName, reason } = {}) => {
      if (mid && mid !== meetingId) return;
      const meHit =
        (me?.id && targetUserId && me.id === targetUserId) ||
        (targetName && normName(targetName) === normName(me?.name || userName));
      if (meHit) {
        try {
          sessionStorage.setItem(
            "meetflow.kickToast",
            reason === "report"
              ? "由於超過 60% 的與會者進行舉報，您已被系統自動移出該會議。"
              : "您已被會議發起人移出該場會議"
          );
        } catch {
          /* ignore */
        }
        go("dashboard");
        return;
      }
      setRoster((prev) => {
        const next = dedupeRoster(prev).filter((p) => {
          if (targetUserId && p.id && p.id === targetUserId) return false;
          if (targetName && normName(p.name) === normName(targetName)) return false;
          return true;
        });
        return sameRoster(prev, next) ? prev : next;
      });
      setPeerCount((n) => Math.max(1, n - 1));
      setMemberReports((prev) => {
        const next = { ...prev };
        if (targetUserId) delete next[`id:${targetUserId}`];
        if (targetName) delete next[`name:${normName(targetName)}`];
        return next;
      });
    };

    const onReportsSync = ({ meetingId: mid, memberReports: reports } = {}) => {
      if (mid && mid !== meetingId) return;
      if (reports && typeof reports === "object") {
        setMemberReports(reports);
      }
    };

    socket.on("meeting:joined", onJoined);
    socket.on("notes:sync", onNotesSync);
    socket.on("agenda:sync", onAgendaSync);
    socket.on("peer:joined", onPeerJoined);
    socket.on("peer:left", onPeerLeft);
    socket.on("typing", onTyping);
    socket.on("error", onSockError);
    socket.on("meeting:updated", onMeetingUpdated);
    socket.on("meeting:kicked", onKicked);
    socket.on("meeting:reports", onReportsSync);
    socket.on("connect", join);

    if (socket.connected) join();

    return () => {
      socket.off("connect", join);
      socket.emit("leave-meeting");
      socket.off("meeting:joined", onJoined);
      socket.off("notes:sync", onNotesSync);
      socket.off("agenda:sync", onAgendaSync);
      socket.off("peer:joined", onPeerJoined);
      socket.off("peer:left", onPeerLeft);
      socket.off("typing", onTyping);
      socket.off("error", onSockError);
      socket.off("meeting:updated", onMeetingUpdated);
      socket.off("meeting:kicked", onKicked);
      socket.off("meeting:reports", onReportsSync);
      typingPeers.current.forEach((v) => clearTimeout(v.timer));
      typingPeers.current.clear();
    };
  }, [meeting.id, me?.name, me?.id, markRosterJoined, go]);

  const selectAgenda = (i) => {
    setAgendaIdx(i);
    if (socketRef.current?.connected) {
      socketRef.current.emit("agenda:select", { meetingId: meeting.id, agendaIdx: i });
    }
  };

  const updateHostAssign = (v) => {
    setIsHostAssignmentEnabled(v);
    persistPermissions({ isHostAssignmentEnabled: v });
  };
  const updateKickPermission = (v) => {
    setIsKickPermissionEnabled(v);
    persistPermissions({ isKickPermissionEnabled: v });
  };
  const updateAllowedKickers = (updater) => {
    setAllowedKickers((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistPermissions({ allowedKickers: next });
      return next;
    });
  };
  const updateAllowedEditors = (updater) => {
    setAllowedEditors((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistPermissions({ allowedEditors: next });
      return next;
    });
  };
  const updateEndRule = (v) => {
    setEndMeetingRule(v);
    persistPermissions({ endMeetingRule: v });
  };
  const updateAllowedEndUsers = (updater) => {
    setAllowedEndMeetingUsers((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistPermissions({ allowedEndMeetingUsers: next });
      return next;
    });
  };

  const confirmKick = async () => {
    if (!kickTarget || !canKick || kicking) return;
    setKicking(true);
    const target = kickTarget;
    try {
      const next = dedupeRoster(roster).filter((p) => {
        if (target.id && p.id && p.id === target.id) return false;
        if (normName(p.name) === normName(target.name)) return false;
        return true;
      });
      setRoster(next);
      persistRoster(next);
      setPeerCount((n) => Math.max(1, n - 1));

      if (socketRef.current?.connected) {
        await new Promise((resolve) => {
          socketRef.current.emit(
            "meeting:kick",
            {
              meetingId: meeting.id,
              targetUserId: target.id || null,
              targetName: target.name,
            },
            () => resolve()
          );
          // ack 可能不支援時仍繼續
          window.setTimeout(resolve, 800);
        });
      }
      setKickTarget(null);
    } catch (err) {
      console.error("[LiveRoom] kick", err);
    } finally {
      setKicking(false);
    }
  };

  /** 民主舉報：防刷 + >60% 自動踢除（交由 server 權威判定，本地樂觀更新） */
  const submitReport = async (reasonId) => {
    if (!reportTarget || reporting) return;
    const target = reportTarget;
    const tKey = personKey(target);
    const rKey = reporterKey(me || { name: currentUserName });
    if (!tKey || !rKey) return;
    if (rKey === tKey || (me?.id && target.id && me.id === target.id)) {
      setReportToast("無法舉報自己");
      setReportTarget(null);
      return;
    }
    if (hostName && normName(target.name) === normName(hostName)) {
      setReportToast("無法舉報會議發起人");
      setReportTarget(null);
      return;
    }

    const existing = Array.isArray(memberReports[tKey]) ? memberReports[tKey] : [];
    if (existing.includes(rKey)) {
      setReportToast("您已舉報過此成員");
      setReportTarget(null);
      return;
    }

    setReporting(true);
    try {
      const nextReports = {
        ...memberReports,
        [tKey]: [...existing, rKey],
      };
      const reportCount = nextReports[tKey].length;
      const totalPeople = Math.max(uniqueRoster.length, peerCount, 1);
      const ratio = reportCount / totalPeople;

      setMemberReports(nextReports);
      try {
        await store.updateMeeting(meeting.id, { memberReports: nextReports });
      } catch {
        /* ignore */
      }

      let serverKicked = false;
      if (socketRef.current?.connected) {
        const ack = await new Promise((resolve) => {
          let done = false;
          const finish = (v) => {
            if (done) return;
            done = true;
            resolve(v);
          };
          socketRef.current.emit(
            "meeting:report",
            {
              meetingId: meeting.id,
              targetUserId: target.id || null,
              targetName: target.name,
              reason: reasonId,
              reporterKey: rKey,
              memberReports: nextReports,
            },
            (res) => finish(res)
          );
          window.setTimeout(() => finish(null), 1200);
        });
        if (ack?.memberReports) setMemberReports(ack.memberReports);
        if (ack?.kicked) serverKicked = true;
        if (ack?.duplicate) {
          setReportToast("您已舉報過此成員");
          setReportTarget(null);
          return;
        }
        if (ack && ack.ok === false) {
          setReportToast(ack.error || "舉報失敗");
          setReportTarget(null);
          return;
        }
      }

      if (!serverKicked && ratio > REPORT_KICK_RATIO) {
        // 無 server 回應時的本地後備自動踢除
        const next = dedupeRoster(roster).filter((p) => {
          if (target.id && p.id && p.id === target.id) return false;
          if (normName(p.name) === normName(target.name)) return false;
          return true;
        });
        setRoster(next);
        persistRoster(next);
        setPeerCount((n) => Math.max(1, n - 1));
        setMemberReports((prev) => {
          const cleaned = { ...prev };
          delete cleaned[tKey];
          return cleaned;
        });
        if (socketRef.current?.connected) {
          socketRef.current.emit("meeting:kick", {
            meetingId: meeting.id,
            targetUserId: target.id || null,
            targetName: target.name,
            reason: "report",
            forceDemocratic: true,
          });
        }
        setReportToast(`已達 ${Math.round(ratio * 100)}% 舉報門檻，系統已自動移出 ${target.name}`);
      } else if (serverKicked) {
        setReportToast(`已達舉報門檻，系統已自動移出 ${target.name}`);
      } else {
        setReportToast(
          `舉報已送出（${reportCount}/${totalPeople}，需超過 ${Math.round(REPORT_KICK_RATIO * 100)}%）`
        );
      }
      setReportTarget(null);
    } catch (err) {
      console.error("[LiveRoom] report", err);
      setReportToast("舉報失敗，請稍後再試");
    } finally {
      setReporting(false);
    }
  };

  const handleAddFriend = async (member) => {
    const key = personKey(member);
    setLocalFriendPending((prev) => ({ ...prev, [key]: true }));
    if (member?.id && social?.sendFriendRequest) {
      try {
        await social.sendFriendRequest(member.id);
      } catch {
        /* 本機仍標記已送出 */
      }
    }
  };

  useEffect(() => {
    if (!reportToast) return undefined;
    const t = window.setTimeout(() => setReportToast(""), 3200);
    return () => window.clearTimeout(t);
  }, [reportToast]);

  const uniqueRoster = useMemo(() => dedupeRoster(roster), [roster]);
  const joinedCount = uniqueRoster.filter((p) => p.status === "joined").length;
  const meetingDisplayTitle = useMemo(() => {
    const title = String(meeting?.title || "").trim();
    if (title) return title;
    const goals = (meeting?.goals || []).map((g) => String(g || "").trim()).filter(Boolean);
    if (goals.length) return goals.join("；");
    return "未命名會議";
  }, [meeting?.title, meeting?.goals]);

  const setCurrentNote = (val) => {
    if (!canEdit) return;
    setTopicNotes((prev) => ({ ...prev, [topic]: val }));
    const now = Date.now();
    if (socketRef.current?.connected && now - typingEmitRef.current > 600) {
      typingEmitRef.current = now;
      socketRef.current.emit("typing", {
        meetingId: meeting.id,
        userName: me?.name || "與會者",
        topic,
      });
    }
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      if (!socketRef.current?.connected) return;
      socketRef.current.emit("notes:update", {
        meetingId: meeting.id,
        topic,
        content: val,
      });
    }, 120);
  };

  const totalLines = Object.values(topicNotes).reduce(
    (n, t) => n + (t ? t.split(/\r?\n/).filter(Boolean).length : 0),
    0
  );

  const typingHere = typingList.filter((t) => t.topic === topic);
  const typingTopics = new Map();
  typingList.forEach((t) => {
    if (t.topic && !typingTopics.has(t.topic)) typingTopics.set(t.topic, paletteFor(t.name));
  });

  const buildForReview = () =>
    agenda.map((t) => (topicNotes[t] || "").trim()).filter(Boolean).join("\n");
  const buildDisplay = () =>
    agenda
      .map((t) => {
        const x = (topicNotes[t] || "").trim();
        return x ? `## ${t}\n${x}` : "";
      })
      .filter(Boolean)
      .join("\n\n");

  const endMeeting = async () => {
    if (!canEndMeeting || meetingStatus === "ended" || endingMeeting) return;
    setEndingMeeting(true);
    clearTimeout(notesTimer.current);
    const participantNames = memberNames.length
      ? memberNames
      : meeting.participants || [];
    const review = extractReview(buildForReview(), participantNames);
    setMeetingStatus("ended");
    try {
      await store.updateMeeting(meeting.id, {
        topicNotes,
        notes: buildDisplay(),
        status: "done",
        meetingStatus: "ended",
        endedAt: Date.now(),
        review,
        actions: review.actions,
        participants: participantNames,
        attendees: (meeting.attendees?.length
          ? meeting.attendees
          : roster.map(({ id, name, email }) => ({ id, name, email }))),
        inviteRoster: roster,
        rbac: {
          ...(meeting.rbac || {}),
          isHostAssignmentEnabled,
          allowedEditors,
          endMeetingRule,
          allowedEndMeetingUsers,
          meetingStatus: "ended",
        },
        isHostAssignmentEnabled,
        allowedEditors,
        endMeetingRule,
        allowedEndMeetingUsers,
      });
      if (socketRef.current?.connected) {
        socketRef.current.emit("meeting:patch", {
          meetingId: meeting.id,
          patch: { status: "done", meetingStatus: "ended" },
        });
      }
      setEndConfirmOpen(false);
      // 交由 MeetingSummary 一次性 Gemini 寫入快取；此處不預呼叫 AI，避免重複燒 Token
      go("post", meeting.id);
    } catch (err) {
      console.error("[LiveRoom] endMeeting", err);
      setMeetingStatus("in_progress");
      setEndingMeeting(false);
    }
  };

  const saveLater = async () => {
    clearTimeout(notesTimer.current);
    socketRef.current?.emit("notes:update", { meetingId: meeting.id, topicNotes });
    await store.updateMeeting(meeting.id, { topicNotes });
    go("dashboard");
  };

  const mobileTabs = [
    { id: "notes", label: "議程筆記", icon: "📝" },
    { id: "roster", label: "與會動態", icon: "👥" },
    { id: "pains", label: "痛點問題", icon: "⚠️" },
  ];

  const notesEditor = (
    <>
      <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 md:py-3 border-b border-navy-800/6 shrink-0">
        <div className="flex items-center gap-2 text-sm font-bold text-navy-700 min-w-0">
          <span className="h-6 w-6 shrink-0 rounded-full bg-mint-500 text-white text-[11px] font-bold flex items-center justify-center">
            {agendaIdx + 1}
          </span>
          <span className="truncate">議程筆記：{topic}</span>
        </div>
        {(uniqueRoster.length > 0 || meeting.participants?.length > 0) && (
          <div className="flex items-center shrink-0 gap-1.5">
            <CompactAvatarStack
              people={
                uniqueRoster.length
                  ? uniqueRoster
                  : (meeting.participants || []).map((name) => ({ name, status: "joined" }))
              }
              onOpen={() => setRosterModalOpen(true)}
              maxVisible={3}
            />
            <span className="text-xs font-semibold text-mint-600 hidden sm:inline">{joinedCount} 位</span>
          </div>
        )}
      </div>

      <div className="flex gap-1 px-3 pt-2.5 md:pt-3 overflow-x-auto border-b border-navy-800/6 shrink-0">
        {agenda.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => selectAgenda(i)}
            className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-t-lg transition-colors ${
              i === agendaIdx
                ? "bg-mint-50 text-mint-700 border-b-2 border-mint-500"
                : "text-navy-400 hover:text-navy-700"
            }`}
          >
            {i + 1}. {a.length > 10 ? a.slice(0, 10) + "…" : a}
            {typingTopics.has(a) ? (
              <span
                className={`h-1.5 w-1.5 rounded-full ${typingTopics.get(a).dot} animate-pulse`}
                title="有人正在此議程輸入"
              />
            ) : (topicNotes[a] || "").trim() ? (
              <span className="h-1.5 w-1.5 rounded-full bg-mint-400" />
            ) : null}
          </button>
        ))}
      </div>

      {typingHere.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 md:px-5 pt-2.5 -mb-1 shrink-0">
          {typingHere.map((t) => {
            const p = paletteFor(t.name);
            return (
              <span
                key={t.from}
                className={`inline-flex items-center gap-1 ${p.bg} ${p.text} font-sans text-[11px] font-bold px-2 py-0.5 rounded-full`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${p.dot} animate-pulse`} />
                {t.name}
                <span className="font-medium opacity-80">正在輸入…</span>
              </span>
            );
          })}
        </div>
      )}

      <div className={`min-h-0 flex-1 flex flex-col ${!canEdit ? "relative" : ""}`}>
        {!canEdit && (
          <div className="flex items-center gap-1.5 px-4 md:px-5 py-1.5 border-b border-navy-800/8 bg-navy-800/[0.02] shrink-0">
            <Lock className="h-3.5 w-3.5 text-navy-400" strokeWidth={2.2} />
            <span className="text-[11px] font-semibold text-navy-400">
              🔒 唯讀狀態（尚未獲得發起人的編輯授權）
            </span>
          </div>
        )}
        <textarea
          key={agendaIdx}
          value={topicNotes[topic] || ""}
          onChange={(e) => setCurrentNote(e.target.value)}
          disabled={!canEdit}
          placeholder={
            canEdit
              ? `「${topic}」的討論重點寫在這裡，一行一個。\n多人同時編輯會即時同步，切換議程不會混在一起。`
              : "🔒 唯讀狀態（尚未獲得發起人的編輯授權）"
          }
          className={`w-full flex-1 min-h-[240px] md:min-h-[360px] md:h-[360px] resize-none px-5 md:px-5 py-4 md:py-4 text-sm leading-relaxed text-navy-800 font-mono placeholder-navy-300 transition-colors ${
            !canEdit
              ? "opacity-50 cursor-not-allowed bg-navy-800/[0.02]"
              : "focus:bg-mint-50/20"
          }`}
        />
      </div>

      <div className="px-4 md:px-5 py-3.5 md:py-3 border-t border-navy-800/6 flex items-center justify-between bg-navy-800/[0.015] shrink-0">
        <span className="text-xs text-navy-300 hidden sm:inline">即時同步 · 全部 {totalLines} 行</span>
        <span className="text-xs text-navy-300 sm:hidden">{totalLines} 行</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={saveLater}
            className="text-xs font-semibold text-navy-500 px-3.5 py-2 rounded-xl border border-navy-800/8 bg-white hover:bg-navy-800/5 transition-colors active:scale-[0.98]"
          >
            稍後再開
          </button>
          {canEndMeeting ? (
            <button
              type="button"
              onClick={() => setEndConfirmOpen(true)}
              className="text-xs font-semibold text-white bg-navy-800 px-3.5 py-2 rounded-xl hover:bg-navy-700 transition-colors active:scale-[0.98]"
            >
              結束會議 → AI 整理
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1 text-xs font-semibold text-navy-300 bg-navy-800/5 px-3.5 py-2 rounded-xl cursor-not-allowed opacity-75"
              title="僅限特定權限者結束會議"
            >
              <Lock className="h-3.5 w-3.5" strokeWidth={2.2} /> 無權限
            </button>
          )}
        </div>
      </div>
    </>
  );

  const sidebarPanel = (
    <div className="bg-white border border-navy-800/8 rounded-3xl p-5 shadow-card self-start">
      <div className="flex items-center gap-3">
        <CircleTimer seconds={sec} total={total} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-navy-400">當前議程</p>
          <p className="font-black text-navy-800 leading-tight truncate">{topic}</p>
          <p className="text-xs text-mint-600 font-semibold mt-1">
            Time Boxing · 共 {agenda.length} 項
          </p>
        </div>
      </div>
      {meeting.pains?.length > 0 && (
        <div className="mt-5 pt-5 border-t border-navy-800/8">
          <PainPointsList pains={meeting.pains} compact />
        </div>
      )}
      <div className="mt-5 space-y-2">
        {agenda.map((a, i) => {
          const hasNote = (topicNotes[a] || "").trim().length > 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => selectAgenda(i)}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
                i === agendaIdx
                  ? "bg-mint-50 border-mint-200"
                  : "bg-white border-navy-800/8 hover:border-mint-200"
              }`}
            >
              <span
                className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === agendaIdx ? "bg-mint-500 text-white" : "bg-navy-800/8 text-navy-400"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`text-sm font-semibold truncate flex-1 ${
                  i === agendaIdx ? "text-navy-800" : "text-navy-400"
                }`}
              >
                {a}
              </span>
              {hasNote && (
                <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-mint-400" title="已有筆記" />
              )}
              {i === agendaIdx && (
                <span className="text-[10px] font-bold text-mint-600 bg-white px-2 py-0.5 rounded-full">
                  現在
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => selectAgenda(Math.min(agendaIdx + 1, agenda.length - 1))}
        className="mt-4 w-full text-sm font-semibold text-navy-600 border border-navy-800/10 rounded-xl py-2.5 hover:bg-navy-800/[0.03] transition-colors"
      >
        下一個議程 →
      </button>

      <ParticipantRoster
        roster={uniqueRoster}
        canKick={canKick}
        hostName={hostName}
        meName={currentUserName}
        meId={me?.id || null}
        onKick={setKickTarget}
        onProfile={setProfileTarget}
        onReport={setReportTarget}
      />
    </div>
  );

  return (
    <div className="fade-in max-w-7xl mx-auto w-full px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-6 md:py-6 md:overflow-visible overflow-hidden h-dvh md:h-auto flex flex-col">
      <div className="sticky top-0 z-20 -mx-1 mb-2 md:mb-5 space-y-2 shrink-0 md:top-16">
        <div className="hidden md:block">
          <PainPointsList pains={meeting.pains} />
        </div>
        <div className="bg-navy-800 text-white rounded-2xl px-3 md:px-5 py-2.5 md:py-3.5 shadow-card-hover flex items-center gap-1.5 md:gap-3">
          <span className="text-base md:text-lg shrink-0" aria-hidden>
            📌
          </span>

          {/* 手機：會議名稱限寬截斷，點擊展開完整主題 */}
          <button
            type="button"
            onClick={() => setTitleModalOpen(true)}
            title={meetingDisplayTitle}
            className="md:hidden font-bold text-[13px] leading-tight text-left max-w-[120px] truncate shrink min-w-0 active:opacity-80"
          >
            {meetingDisplayTitle}
          </button>

          {/* 桌機：完整標題可截斷但不需點擊 Modal */}
          <p className="hidden md:block font-bold text-base truncate min-w-0 flex-1" title={meetingDisplayTitle}>
            {meetingDisplayTitle}
          </p>

          <div className="ml-auto flex items-center gap-1.5 md:gap-2 shrink-0">
            {/* 手機：倒計時整合進頂部目標列，離開右下角黃金操作區 */}
            <span
              className={`md:hidden inline-flex items-center gap-1.5 text-[11px] font-black tabular-nums px-2.5 py-1.5 rounded-full ${
                sec <= 60 ? "bg-coral-400/25 text-coral-100" : "bg-white/15 text-white"
              }`}
              title="議程剩餘時間"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  sec <= 60 ? "bg-coral-300" : "bg-mint-300"
                } animate-pulse`}
              />
              {formatClock(sec)}
            </span>

            <MeetingCodeChip code={meeting.code} />

            <div className="relative">
              <button
                type="button"
                onClick={() => setRbacOpen((o) => !o)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 md:px-3 py-1.5 rounded-full transition-colors ${
                  rbacOpen ? "bg-white/25 text-white" : "bg-white/15 hover:bg-white/25 text-white"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                <span className="hidden sm:inline">權限</span>
              </button>
              {rbacOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setRbacOpen(false)} />
                  <div className="absolute right-0 mt-2 w-[20.5rem] max-w-[90vw] z-40">
                    <HostPermissionMatrix
                      currentRole={currentRole}
                      onTestRoleChange={handleTestRoleChange}
                      showRoleSwitcher={isTrueHost && roleSwitcherAvailable}
                      isHostAssignmentEnabled={isHostAssignmentEnabled}
                      setIsHostAssignmentEnabled={updateHostAssign}
                      isKickPermissionEnabled={isKickPermissionEnabled}
                      setIsKickPermissionEnabled={updateKickPermission}
                      memberNames={memberNames}
                      allowedEditors={allowedEditors}
                      setAllowedEditors={updateAllowedEditors}
                      allowedKickers={allowedKickers}
                      setAllowedKickers={updateAllowedKickers}
                      endMeetingRule={endMeetingRule}
                      setEndMeetingRule={updateEndRule}
                      allowedEndMeetingUsers={allowedEndMeetingUsers}
                      setAllowedEndMeetingUsers={updateAllowedEndUsers}
                      readOnly={!isTrueHost || currentRole !== "host"}
                      hostName={hostName}
                    />
                  </div>
                </>
              )}
            </div>

            {social && (
              <button
                type="button"
                onClick={() => setInviting(true)}
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-full transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M19 8v6M22 11h-6" />
                </svg>
                邀請好友
              </button>
            )}
            <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold bg-mint-500/20 text-mint-200 px-2.5 py-1 rounded-full">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  syncState === "joined"
                    ? "bg-mint-300 animate-pulse"
                    : syncState === "error"
                    ? "bg-coral-400"
                    : "bg-navy-300"
                }`}
              />
              {syncState === "joined"
                ? `進行中 · ${peerCount} 人在線`
                : syncState === "error"
                ? "同步失敗"
                : "連線中…"}
            </span>
          </div>
        </div>
        {syncError && (
          <p className="text-xs text-coral-500 bg-coral-50 border border-coral-100 rounded-xl px-3 py-2">
            {syncError}
          </p>
        )}
      </div>

      {inviting && social && (
        <InviteModal
          meeting={meeting}
          friends={social.friends || []}
          socket={socketRef.current}
          onClose={() => setInviting(false)}
        />
      )}

      {/* ── 手機：分頁列 ── */}
      <div className="md:hidden shrink-0 mb-2 flex items-center gap-1 rounded-2xl border border-navy-800/8 bg-white p-1 shadow-sm">
        {mobileTabs.map((tab) => {
          const active = mobileTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-bold transition-all ${
                active
                  ? "bg-navy-800 text-white shadow-sm"
                  : "text-navy-400 hover:text-navy-700"
              }`}
            >
              <span aria-hidden>{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 手機：單一分頁內容（鎖定一屏，不垂直堆疊） ── */}
      <div className="md:hidden flex-1 min-h-0 flex flex-col">
        {mobileTab === "notes" && (
          <div className="flex-1 min-h-0 bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden flex flex-col">
            {notesEditor}
          </div>
        )}
        {mobileTab === "roster" && (
          <div className="flex-1 min-h-0 overflow-y-auto rounded-3xl border border-navy-800/8 bg-white p-4 shadow-card">
            <p className="text-[11px] font-semibold text-mint-600 mb-1">
              {joinedCount}/{uniqueRoster.length || 0} 已加入 · {peerCount} 人在線
            </p>
            <ParticipantRoster
              roster={uniqueRoster}
              canKick={canKick}
              hostName={hostName}
              meName={currentUserName}
              meId={me?.id || null}
              onKick={setKickTarget}
              onProfile={setProfileTarget}
              onReport={setReportTarget}
            />
            {social && (
              <button
                type="button"
                onClick={() => setInviting(true)}
                className="mt-4 w-full text-sm font-semibold text-mint-700 bg-mint-50 border border-mint-100 rounded-xl py-2.5"
              >
                ＋ 邀請好友
              </button>
            )}
          </div>
        )}
        {mobileTab === "pains" && (
          <div className="flex-1 min-h-0 overflow-y-auto rounded-3xl border border-navy-800/8 bg-white p-4 shadow-card">
            {meeting.pains?.length ? (
              <PainPointsList pains={meeting.pains} />
            ) : (
              <div className="py-16 text-center">
                <p className="text-sm font-bold text-navy-600">本場尚未設定痛點</p>
                <p className="mt-1 text-xs text-navy-400">發起會議時可填寫要解決的問題</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 桌機：雙欄原版面 ── */}
      <div className="hidden md:grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {sidebarPanel}
        <div className="bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden flex flex-col">
          {notesEditor}
        </div>
      </div>

      {/* 與會者完整名單毛玻璃 Modal（頭像 +N 點擊） */}
      {rosterModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roster-modal-title"
        >
          <button
            type="button"
            aria-label="關閉與會者名單"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => setRosterModalOpen(false)}
          />
          <div className="relative z-10 w-full sm:max-w-md max-h-[78dvh] sm:max-h-[min(80vh,560px)] overflow-hidden rounded-t-3xl sm:rounded-3xl border border-white/60 bg-white/90 backdrop-blur-xl shadow-card-hover ring-1 ring-navy-800/10 flex flex-col">
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-navy-800/8 shrink-0">
              <div className="min-w-0">
                <h3 id="roster-modal-title" className="text-base font-bold text-navy-800">
                  與會者名單
                </h3>
                <p className="text-[11px] font-semibold text-mint-600 mt-0.5">
                  {joinedCount}/{uniqueRoster.length || 0} 已加入
                  {syncState === "joined" ? ` · ${peerCount} 人在線` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRosterModalOpen(false)}
                className="h-8 w-8 rounded-full bg-navy-800/5 text-navy-500 hover:bg-navy-800/10 text-sm font-bold"
                aria-label="關閉"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
              <ParticipantRoster
                bare
                roster={uniqueRoster}
                canKick={canKick}
                hostName={hostName}
                meName={currentUserName}
                meId={me?.id || null}
                onKick={(p) => {
                  setRosterModalOpen(false);
                  setKickTarget(p);
                }}
                onProfile={(p) => {
                  setRosterModalOpen(false);
                  setProfileTarget(p);
                }}
                onReport={(p) => {
                  setRosterModalOpen(false);
                  setReportTarget(p);
                }}
                showEditAuth={isTrueHost && currentRole === "host"}
                canConfigureAuth={isTrueHost && currentRole === "host"}
                allowedEditors={allowedEditors}
                onToggleEditor={(name, on) =>
                  updateAllowedEditors((prev) =>
                    on ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((n) => n !== name)
                  )
                }
              />
              {!uniqueRoster.length && (
                <p className="text-center text-sm text-navy-400 py-10">尚無與會者</p>
              )}
            </div>
            {social && (
              <div className="shrink-0 px-4 pb-4 pt-2 border-t border-navy-800/8">
                <button
                  type="button"
                  onClick={() => {
                    setRosterModalOpen(false);
                    setInviting(true);
                  }}
                  className="w-full text-sm font-semibold text-mint-700 bg-mint-50 border border-mint-100 rounded-xl py-2.5"
                >
                  ＋ 邀請好友
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 真房東降級後的隱密重設：網址加 ?devRole=1 才顯示 */}
      {isTrueHost && allowDevRoleReset && (
        <div className="mt-8 text-center hidden md:block">
          <button
            type="button"
            onClick={resetTestRoleForDev}
            className="text-[9px] tracking-wide text-navy-300/50 hover:text-navy-400 transition-colors"
          >
            重設測試角色
          </button>
        </div>
      )}

      {endConfirmOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-meeting-title"
        >
          <button
            type="button"
            aria-label="關閉確認"
            disabled={endingMeeting}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => {
              if (!endingMeeting) setEndConfirmOpen(false);
            }}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/50 bg-white/90 backdrop-blur-md shadow-card-hover p-5 ring-1 ring-navy-800/10">
            <h3 id="end-meeting-title" className="text-base font-bold text-navy-800">
              結束會議確認
            </h3>
            <p className="mt-2 text-sm text-navy-600 leading-relaxed">
              確定要結束本次會議嗎？結束後將全端同步終止並交由 AI 進行結構化總結。
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={endingMeeting}
                onClick={() => setEndConfirmOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-navy-500 bg-navy-800/5 hover:bg-navy-800/10 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={endingMeeting}
                onClick={endMeeting}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-coral-500 hover:bg-coral-600 shadow-sm transition-colors disabled:opacity-60 active:scale-[0.98]"
              >
                {endingMeeting ? "結束中…" : "確定結束"}
              </button>
            </div>
          </div>
        </div>
      )}

      {kickTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="關閉"
            disabled={kicking}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => {
              if (!kicking) setKickTarget(null);
            }}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/50 bg-white/90 backdrop-blur-md shadow-card-hover p-5 ring-1 ring-navy-800/10">
            <h3 className="text-base font-bold text-navy-800">踢除與會者</h3>
            <p className="mt-2 text-sm text-navy-600 leading-relaxed">
              確定要將 <b className="text-navy-800">{kickTarget.name}</b> 移出本次會議嗎？
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={kicking}
                onClick={() => setKickTarget(null)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-navy-500 bg-navy-800/5 hover:bg-navy-800/10 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={kicking}
                onClick={confirmKick}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-coral-500 hover:bg-coral-600 shadow-sm transition-colors disabled:opacity-60"
              >
                {kicking ? "處理中…" : "確定踢除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {profileTarget && (
        <MemberProfileModal
          member={profileTarget}
          friends={social?.friends || []}
          outgoing={social?.outgoing || []}
          localPending={localFriendPending}
          onClose={() => setProfileTarget(null)}
          onAddFriend={handleAddFriend}
        />
      )}

      {reportTarget && (
        <ReportMemberModal
          member={reportTarget}
          submitting={reporting}
          onClose={() => setReportTarget(null)}
          onSubmit={submitReport}
        />
      )}

      {reportToast ? (
        <div className="fixed left-1/2 top-4 z-[120] w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl border border-navy-800/10 bg-white/95 backdrop-blur-md px-4 py-3 text-center text-sm font-semibold text-navy-700 shadow-card-hover">
          {reportToast}
        </div>
      ) : null}

      {titleModalOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="meeting-title-modal"
        >
          <button
            type="button"
            aria-label="關閉"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => setTitleModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/60 bg-white/90 backdrop-blur-xl shadow-card-hover p-5 ring-1 ring-navy-800/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-navy-400 tracking-wide">會議主題</p>
                <h3
                  id="meeting-title-modal"
                  className="mt-2 text-xl font-black text-navy-800 leading-snug break-words"
                >
                  {meetingDisplayTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTitleModalOpen(false)}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-navy-800/5 hover:bg-navy-800/10 px-3 py-1.5 text-xs font-bold text-navy-500 transition-colors"
                aria-label="關閉"
              >
                ✕ 關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

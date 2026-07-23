import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lock,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  Search,
  ShieldCheck,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import Avatar from "../components/Avatar.jsx";
import PainPointsList from "../components/PainPointsList.jsx";
import MeetingHeader from "../components/MeetingHeader.jsx";
import InviteModal from "../components/InviteModal.jsx";
import AgendaTimerCard from "../components/AgendaTimerCard.jsx";
import AgendaTabs, {
  AgendaEditModal,
  DeleteAgendaConfirmModal,
} from "../components/AgendaTabs.jsx";
import LeftVideoSidebar from "../components/LeftVideoSidebar.jsx";
import ParticipantItemMenu from "../components/ParticipantItemMenu.jsx";
import MeetingNotesContainer, {
  loadCornell,
  saveCornell,
} from "../components/MeetingNotesContainer.jsx";
import FloatingAIAssistantButton from "../components/FloatingAIAssistantButton.jsx";
import MeetingNotesWithBottomAIPanel from "../components/MeetingNotesWithBottomAIPanel.jsx";
import { useMode } from "../lib/settings.js";
import { extractReview } from "../lib/extract.js";
import { formatTranscriptForAi } from "../lib/meetingsCache.js";
import {
  clearLiveTranscript,
  hydrateLiveTranscript,
  saveLiveTranscript,
} from "../lib/liveTranscriptCache.js";
import {
  clearActiveLiveMeetingId,
  setActiveLiveMeetingId,
} from "../lib/activeMeeting.js";
import { flattenNotesDoc } from "../lib/notesDocument.js";
import { connectSocket } from "../lib/socket.js";
import { inviteToMeeting } from "../lib/api.js";
import { useLocalMediaAndStt } from "../hooks/useLocalMediaAndStt.js";
import VideoPanel from "../components/VideoPanel.jsx";

const TYPING_PALETTE = [
  { text: "text-mint-700", bg: "bg-mint-50", dot: "bg-mint-500" },
  { text: "text-coral-500", bg: "bg-coral-50", dot: "bg-coral-400" },
  { text: "text-sky-600", bg: "bg-sky-50", dot: "bg-sky-400" },
  { text: "text-purple-600", bg: "bg-purple-50", dot: "bg-purple-500" },
  { text: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
  { text: "text-navy-700", bg: "bg-navy-800/5", dot: "bg-navy-600" },
];

const RBAC_ROLES = [
  { value: "host", label: "Host（上級 / 發起人）", short: "Host", emoji: "" },
  { value: "recorder", label: "Recorder（專職紀錄員）", short: "Recorder", emoji: "" },
  { value: "attendee", label: "Attendee（下級 / 與會者）", short: "Attendee", emoji: "" },
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

const DEFAULT_AGENDA_MINUTES = 15;

function normalizeAgendaNames(goals) {
  const list = (Array.isArray(goals) ? goals : [])
    .map((g) => String(g || "").trim())
    .filter(Boolean);
  return list.length ? list : ["會議討論"];
}

function normalizeAgendaMinutes(goals, minutes, durationMin) {
  const names = normalizeAgendaNames(goals);
  const raw = Array.isArray(minutes) ? minutes : [];
  const fallback = Math.max(
    1,
    Math.round((Number(durationMin) || names.length * DEFAULT_AGENDA_MINUTES) / Math.max(1, names.length))
  );
  return names.map((_, i) => {
    const n = Number(raw[i]);
    return Number.isFinite(n) && n >= 1 ? Math.min(480, Math.round(n)) : fallback;
  });
}

function uniqueAgendaName(name, list, skipIdx = -1) {
  const base = String(name || "").trim() || "新議程";
  let candidate = base;
  let n = 2;
  while (list.some((g, i) => i !== skipIdx && g === candidate)) {
    candidate = `${base} (${n++})`;
  }
  return candidate;
}

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

/** 單一與會列：Badge + 固定寬操作槽，確保垂直對齊 */
function ParticipantItem({
  member: p,
  hostName = "",
  meName = "",
  meId = null,
  canKick = false,
  onKick,
  onProfile,
  onReport,
  showEditAuth = false,
  allowedEditors = [],
  onToggleEditor,
  canConfigureAuth = false,
  onDark = false,
  preferDropup = true,
}) {
  const joinedNow = p.status === "joined";
  const isHostRow = hostName && normName(p.name) === normName(hostName);
  const isSelf =
    (meId && p.id && p.id === meId) ||
    (meName && normName(p.name) === normName(meName));
  const showKick = canKick && !isHostRow && !isSelf && typeof onKick === "function";
  const editOn = allowedEditors.includes(p.name) || isHostRow;

  return (
    <li
      className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all duration-500 ease-out ${
        joinedNow
          ? onDark
            ? "bg-white/[0.07] border border-white/10 opacity-100 translate-y-0"
            : "bg-white border border-mint-100 shadow-sm opacity-100 translate-y-0"
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
        <p
          className={`text-xs font-semibold truncate ${
            onDark ? "text-white/90" : "text-navy-700"
          }`}
        >
          {p.name}
          {isHostRow ? (
            <span
              className={`ml-1 text-[9px] font-bold ${
                onDark ? "text-mint-300" : "text-mint-600"
              }`}
            >
              Host
            </span>
          ) : null}
          {isSelf ? (
            <span
              className={`ml-1 text-[9px] font-bold ${
                onDark ? "text-white/45" : "text-navy-300"
              }`}
            >
              我
            </span>
          ) : null}
        </p>
        {p.email ? (
          <p
            className={`text-[10px] truncate ${
              onDark ? "text-white/40" : "text-navy-300"
            }`}
          >
            {p.email}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
            joinedNow
              ? onDark
                ? "bg-mint-400/15 text-mint-300 border border-mint-400/25"
                : "bg-mint-50 text-mint-700 border border-mint-100"
              : onDark
                ? "bg-amber-400/15 text-amber-300 border border-amber-400/25"
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
        <ParticipantItemMenu
          member={p}
          canKick={showKick}
          isSelf={isSelf}
          onDark={onDark}
          preferDropup={preferDropup}
          onProfile={onProfile}
          onReport={onReport}
          onKick={onKick}
        />
      </div>
    </li>
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
  hideHeader = false,
  onDark = false,
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
      {!hideHeader && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className={`text-[11px] font-bold ${onDark ? "text-white/60" : "text-navy-500"}`}>
            與會者動態
          </p>
          <p className={`text-[10px] font-semibold ${onDark ? "text-mint-300" : "text-mint-600"}`}>
            {joined}/{clean.length} 已加入
          </p>
        </div>
      )}
      <ul className="space-y-1.5">
        {clean.map((p) => (
          <ParticipantItem
            key={`roster-${normName(p.name)}-${p.id || "x"}`}
            member={p}
            hostName={hostName}
            meName={meName}
            meId={meId}
            canKick={canKick}
            onKick={onKick}
            onProfile={onProfile}
            onReport={onReport}
            showEditAuth={showEditAuth}
            allowedEditors={allowedEditors}
            onToggleEditor={onToggleEditor}
            canConfigureAuth={canConfigureAuth}
            onDark={onDark}
            preferDropup
          />
        ))}
      </ul>
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

function formatClock(seconds) {
  const s = Math.max(0, seconds | 0);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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
                  {r.label}
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
                <span aria-hidden></span> 踢人權限分享（單獨開通）
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
              <span aria-hidden></span> 與會者編輯授權（單獨開通）
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
              <span aria-hidden></span> 結束會議權限配置
            </p>
            <p className="text-[11px] text-navy-400 mt-0.5 mb-2">決定誰能按下「結束會議」</p>
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
 * All-in-One：RTC 音視訊網格 + 即時 STT 逐字稿 + 議程共編
 * 精準授權矩陣 + 結束會議規則 + 跨端結束強同步
 * 會後 AI 以 transcript 為主資料源，經 meetingsCache 避免重複燒 Token
 */
export default function LiveRoom({ meeting, store, go, social, me, onAgendaChange, initialMediaSettings = null }) {
  const [mode] = useMode();
  const [agenda, setAgenda] = useState(() => normalizeAgendaNames(meeting?.goals));
  const [agendaMinutes, setAgendaMinutes] = useState(() =>
    normalizeAgendaMinutes(meeting?.goals, meeting?.agendaMinutes, meeting?.durationMin)
  );
  const [agendaIdx, setAgendaIdx] = useState(0);
  const [sec, setSec] = useState(() => {
    const mins = normalizeAgendaMinutes(
      meeting?.goals,
      meeting?.agendaMinutes,
      meeting?.durationMin
    );
    return Math.max(1, mins[0] || DEFAULT_AGENDA_MINUTES) * 60;
  });
  const [timerPaused, setTimerPaused] = useState(false);
  const [peerCount, setPeerCount] = useState(1);
  const [inviting, setInviting] = useState(false);
  const [roster, setRoster] = useState(() => dedupeRoster(buildSeedRoster(meeting)));
  const inviteBootstrappedRef = useRef(null); // meeting.id once invite pipeline started
  const redirectedRef = useRef(false);
  const [agendaEditOpen, setAgendaEditOpen] = useState(false);
  const [agendaEditMode, setAgendaEditMode] = useState("add"); // add | rename
  const [agendaEditIdx, setAgendaEditIdx] = useState(-1);
  const [agendaDeleteIdx, setAgendaDeleteIdx] = useState(null);
  const [agendaBusy, setAgendaBusy] = useState(false);
  const [agendaToast, setAgendaToast] = useState("");

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
  /** 手機分頁：av | stt | notes | roster | pains */
  const [mobileTab, setMobileTab] = useState("av");
  /** 桌機：左側視訊側欄是否折疊，最大化議程筆記 */
  const [videoCollapsed, setVideoCollapsed] = useState(false);
  /** 避免手機／桌機同時掛兩份 VideoPanel 搶同一組 media ref */
  const [isMdUp, setIsMdUp] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true
  );
  /** 手機：與會者頭像展開名單 Modal */
  const [rosterModalOpen, setRosterModalOpen] = useState(false);
  /** 手機：超長會議名稱點擊展開 */
  const [titleModalOpen, setTitleModalOpen] = useState(false);
  /** 放大檢視完整逐字稿 */
  const [transcriptModalOpen, setTranscriptModalOpen] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState("");

  /** 即時語音轉文字逐字稿（本機 Web Speech 真實收音） */
  const [transcript, setTranscript] = useState(() =>
    hydrateLiveTranscript(meeting?.id, meeting?.transcript)
  );
  const transcriptPersistTimer = useRef(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  const [topicNotes, setTopicNotes] = useState(() => {
    if (meeting.topicNotes && Object.keys(meeting.topicNotes).length) return meeting.topicNotes;
    if (meeting.notes) return { [agenda[0]]: meeting.notes };
    return {};
  });
  const [typingList, setTypingList] = useState([]);
  const [notesTab, setNotesTab] = useState("group");
  const cornellUserKey = me?.id || me?.name || "anon";
  const [cornell, setCornell] = useState(() => loadCornell(cornellUserKey, meeting.id));

  const socketRef = useRef(null);
  const notesTimer = useRef(null);
  const typingEmitRef = useRef(0);
  const typingPeers = useRef(new Map());
  const transcriptEndRef = useRef(null);
  const transcriptScrollRef = useRef(null);
  /** 僅在接近底部時自動捲動，避免使用者上翻歷史時被 interim 拉回 */
  const transcriptStickBottomRef = useRef(true);
  const transcriptModalScrollRef = useRef(null);
  const transcriptModalStickBottomRef = useRef(true);
  const topic = agenda[agendaIdx];

  const hostName = useMemo(() => resolveHostName(meeting, me), [meeting, me]);
  const currentUserName = String(me?.name || "").trim() || "與會者";

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsMdUp(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const persistTranscriptNow = useCallback(
    async (rows) => {
      const list = Array.isArray(rows) ? rows : transcriptRef.current;
      saveLiveTranscript(meeting.id, list);
      // 樂觀寫入本地 store，即使 API 權限不足，回到會議仍可從 meetings + session 還原
      try {
        await store.updateMeeting(meeting.id, {
          transcript: list,
          transcriptText: formatTranscriptForAi(list),
        });
      } catch {
        /* 本機快取已寫入；略過伺服器寫入失敗 */
      }
    },
    [meeting.id, store]
  );

  const appendTranscript = useCallback(
    (row) => {
      if (!row?.text) return;
      setTranscript((prev) => {
        let base = prev;
        const upgradeFrom = String(row.upgradeFrom || "").trim();
        if (upgradeFrom && prev.length) {
          const last = prev[prev.length - 1];
          const lastText = String(last?.text || "").trim();
          const nextText = String(row.text || "").trim();
          // 僅升級「同一句」：完全相同、或 final 延續 interim，避免誤刪上一句完整對話
          const sameUtterance =
            lastText === upgradeFrom &&
            (nextText === lastText ||
              nextText.startsWith(lastText) ||
              lastText.startsWith(nextText));
          if (sameUtterance) {
            base = prev.slice(0, -1);
          }
        }
        const clean = {
          id: row.id,
          time: row.time,
          at: row.at,
          speaker: row.speaker,
          text: row.text,
        };
        const next = [...base, clean];
        // 整場會議完整保留；僅在極端長度時裁舊句以防記憶體暴衝
        const clipped = next.length > 10_000 ? next.slice(-10_000) : next;
        saveLiveTranscript(meeting.id, clipped);
        clearTimeout(transcriptPersistTimer.current);
        transcriptPersistTimer.current = setTimeout(() => {
          void persistTranscriptNow(clipped);
        }, 900);
        return clipped;
      });
    },
    [meeting.id, persistTranscriptNow]
  );

  // 會議物件晚到／伺服器帶回較長逐字稿時合併，不覆蓋本機較完整版本
  const serverTranscriptSig = useMemo(() => {
    const rows = Array.isArray(meeting?.transcript) ? meeting.transcript : [];
    if (!rows.length) return "0";
    const last = rows[rows.length - 1] || {};
    return `${rows.length}:${last.id || ""}:${last.at || ""}`;
  }, [meeting?.transcript]);

  useEffect(() => {
    const fromMeeting = Array.isArray(meeting?.transcript) ? meeting.transcript : [];
    if (!fromMeeting.length) return;
    setTranscript((prev) => {
      if (fromMeeting.length <= prev.length) return prev;
      return hydrateLiveTranscript(meeting.id, [...prev, ...fromMeeting]);
    });
  }, [meeting.id, serverTranscriptSig]); // eslint-disable-line react-hooks/exhaustive-deps -- sig tracks server transcript

  const {
    micOn,
    camOn,
    screenSharing,
    mediaReady,
    mediaError,
    sttSupported,
    sttListening,
    sttError,
    interimText,
    localVideoRef,
    screenVideoRef,
    getCameraStream,
    getScreenStream,
    startMedia,
    toggleMic,
    toggleCam,
    toggleScreenShare,
  } = useLocalMediaAndStt({
    enabled: meetingStatus !== "ended",
    speakerName: currentUserName,
    lang: "zh-TW",
    onFinalUtterance: appendTranscript,
    initialMediaSettings,
  });

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

  /** 視訊網格：在線與會者佔位（joined 優先，否則用名冊） */
  const videoParticipants = useMemo(() => {
    const joined = dedupeRoster(roster).filter((p) => p.status === "joined");
    const base = joined.length
      ? joined
      : memberNames.map((name) => ({ name, status: "joined", id: null }));
    const meRow = {
      id: me?.id || "me",
      name: currentUserName,
      status: "joined",
      isSelf: true,
    };
    const others = base.filter((p) => normName(p.name) !== normName(currentUserName));
    return [meRow, ...others].slice(0, 8);
  }, [roster, memberNames, currentUserName, me?.id]);

  /** 逐字稿自動滾到底部（含即時 interim；使用者上翻時不強制拉回） */
  useEffect(() => {
    if (!transcriptStickBottomRef.current) return;
    const el = transcriptScrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [transcript, interimText]);

  useEffect(() => {
    if (!transcriptModalOpen || !transcriptModalStickBottomRef.current) return;
    if (String(transcriptSearch || "").trim()) return;
    const el = transcriptModalScrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [transcript, interimText, transcriptModalOpen, transcriptSearch]);

  useEffect(() => {
    if (!transcriptModalOpen) return;
    if (!String(transcriptSearch || "").trim()) return;
    const el = transcriptModalScrollRef.current;
    if (el) {
      el.scrollTo({ top: 0, behavior: "auto" });
      transcriptModalStickBottomRef.current = false;
    }
  }, [transcriptSearch, transcriptModalOpen]);

  useEffect(
    () => () => {
      clearTimeout(transcriptPersistTimer.current);
    },
    []
  );

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

  useEffect(() => {
    if (meeting.status !== "live" && meeting.status !== "done") {
      store.updateMeeting(meeting.id, { status: "live", startedAt: Date.now(), meetingStatus: "in_progress" });
    }
    if (meeting.status !== "done" && meeting.meetingStatus !== "ended") {
      setActiveLiveMeetingId(meeting.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 跨裝置強同步：任一端結束 → 全端強制進會後 AI 整理（須已寫入 status=done）
  useEffect(() => {
    const ended =
      meeting?.status === "done" ||
      meeting?.meetingStatus === "ended";
    if (!ended || redirectedRef.current) return;
    redirectedRef.current = true;
    clearActiveLiveMeetingId(meeting.id);
    go("post", meeting.id);
  }, [meeting?.status, meeting?.meetingStatus, meeting.id, go]);

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
    if (timerPaused || meetingStatus === "ended") return undefined;
    const id = setInterval(() => setSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [timerPaused, meetingStatus]);

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
      if (joined?.goals) {
        setAgenda(normalizeAgendaNames(joined.goals));
        setAgendaMinutes(
          normalizeAgendaMinutes(joined.goals, joined.agendaMinutes, joined.durationMin)
        );
      }
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
      if (Array.isArray(updated.goals)) {
        const nextGoals = normalizeAgendaNames(updated.goals);
        const nextMins = normalizeAgendaMinutes(
          updated.goals,
          updated.agendaMinutes,
          updated.durationMin
        );
        setAgenda(nextGoals);
        setAgendaMinutes(nextMins);
        setAgendaIdx((idx) => Math.min(idx, Math.max(0, nextGoals.length - 1)));
      }
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
    const next = Math.max(0, Math.min(i, agenda.length - 1));
    setAgendaIdx(next);
    if (socketRef.current?.connected) {
      socketRef.current.emit("agenda:select", { meetingId: meeting.id, agendaIdx: next });
    }
  };

  const denyAgendaManage = useCallback(() => {
    setAgendaToast("僅會議 Host 或管理員可修改議程");
  }, []);

  const persistAgendaState = useCallback(
    async ({
      nextAgenda,
      nextMinutes,
      nextNotes,
      nextIdx = null,
    }) => {
      const goals = normalizeAgendaNames(nextAgenda);
      const minutes = normalizeAgendaMinutes(goals, nextMinutes, meeting.durationMin);
      const durationMin = Math.max(1, minutes.reduce((s, n) => s + n, 0));
      setAgenda(goals);
      setAgendaMinutes(minutes);
      if (nextNotes) setTopicNotes(nextNotes);
      if (typeof nextIdx === "number") {
        setAgendaIdx(Math.max(0, Math.min(nextIdx, goals.length - 1)));
      } else {
        setAgendaIdx((idx) => Math.min(idx, Math.max(0, goals.length - 1)));
      }
      await store.updateMeeting(meeting.id, {
        goals,
        agendaMinutes: minutes,
        durationMin,
        ...(nextNotes ? { topicNotes: nextNotes } : {}),
      });
      if (nextNotes && socketRef.current?.connected) {
        socketRef.current.emit("notes:update", {
          meetingId: meeting.id,
          topicNotes: nextNotes,
        });
      }
    },
    [meeting.durationMin, meeting.id, store]
  );

  const openAddAgenda = () => {
    if (!canEdit) {
      denyAgendaManage();
      return;
    }
    setAgendaEditMode("add");
    setAgendaEditIdx(-1);
    setAgendaEditOpen(true);
  };

  const openRenameAgenda = (idx) => {
    if (!canEdit) {
      denyAgendaManage();
      return;
    }
    setAgendaEditMode("rename");
    setAgendaEditIdx(idx);
    setAgendaEditOpen(true);
  };

  const openDeleteAgenda = (idx) => {
    if (!canEdit) {
      denyAgendaManage();
      return;
    }
    if (agenda.length <= 1) return;
    setAgendaDeleteIdx(idx);
  };

  const confirmAgendaEdit = async ({ name, minutes }) => {
    if (!canEdit) {
      denyAgendaManage();
      return;
    }
    setAgendaBusy(true);
    try {
      if (agendaEditMode === "add") {
        const clean = uniqueAgendaName(name, agenda);
        const nextAgenda = [...agenda, clean];
        const nextMinutes = [...agendaMinutes, minutes || DEFAULT_AGENDA_MINUTES];
        const nextNotes = { ...topicNotes, [clean]: topicNotes[clean] || "" };
        await persistAgendaState({
          nextAgenda,
          nextMinutes,
          nextNotes,
          nextIdx: nextAgenda.length - 1,
        });
        if (socketRef.current?.connected) {
          socketRef.current.emit("agenda:select", {
            meetingId: meeting.id,
            agendaIdx: nextAgenda.length - 1,
          });
        }
      } else {
        const idx = agendaEditIdx;
        if (idx < 0 || idx >= agenda.length) return;
        const oldName = agenda[idx];
        const clean = uniqueAgendaName(name, agenda, idx);
        const nextAgenda = agenda.map((g, i) => (i === idx ? clean : g));
        const nextMinutes = agendaMinutes.map((m, i) =>
          i === idx ? minutes || DEFAULT_AGENDA_MINUTES : m
        );
        let nextNotes = topicNotes;
        if (oldName !== clean) {
          nextNotes = { ...topicNotes };
          nextNotes[clean] = nextNotes[oldName] || "";
          delete nextNotes[oldName];
        }
        await persistAgendaState({
          nextAgenda,
          nextMinutes,
          nextNotes,
          nextIdx: idx,
        });
      }
      setAgendaEditOpen(false);
    } catch (e) {
      setAgendaToast(e?.message || "議程更新失敗");
    } finally {
      setAgendaBusy(false);
    }
  };

  const confirmDeleteAgenda = async () => {
    if (!canEdit) {
      denyAgendaManage();
      return;
    }
    const idx = agendaDeleteIdx;
    if (idx == null || idx < 0 || agenda.length <= 1) {
      setAgendaDeleteIdx(null);
      return;
    }
    setAgendaBusy(true);
    try {
      const removed = agenda[idx];
      const nextAgenda = agenda.filter((_, i) => i !== idx);
      const nextMinutes = agendaMinutes.filter((_, i) => i !== idx);
      const nextNotes = { ...topicNotes };
      delete nextNotes[removed];
      // 刪除當前議程 → 跳到下一個，若無則上一個
      let nextIdx = agendaIdx;
      if (idx === agendaIdx) {
        nextIdx = Math.min(idx, nextAgenda.length - 1);
      } else if (idx < agendaIdx) {
        nextIdx = agendaIdx - 1;
      }
      await persistAgendaState({
        nextAgenda,
        nextMinutes,
        nextNotes,
        nextIdx,
      });
      if (socketRef.current?.connected) {
        socketRef.current.emit("agenda:select", {
          meetingId: meeting.id,
          agendaIdx: nextIdx,
        });
      }
      setAgendaDeleteIdx(null);
    } catch (e) {
      setAgendaToast(e?.message || "刪除議程失敗");
    } finally {
      setAgendaBusy(false);
    }
  };

  /** 切換／變更當前議程時間預算時，重置 Time Boxing 倒數 */
  const currentAgendaBudget = agendaMinutes[agendaIdx] || DEFAULT_AGENDA_MINUTES;
  useEffect(() => {
    setSec(Math.max(1, currentAgendaBudget) * 60);
  }, [agendaIdx, currentAgendaBudget]);

  useEffect(() => {
    if (!agendaToast) return undefined;
    const t = window.setTimeout(() => setAgendaToast(""), 3200);
    return () => window.clearTimeout(t);
  }, [agendaToast]);

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

  const totalLines = Object.values(topicNotes).reduce((n, t) => {
    const flat = flattenNotesDoc(t || "");
    return n + (flat ? flat.split(/\r?\n/).filter(Boolean).length : 0);
  }, 0);

  const typingHere = typingList.filter((t) => t.topic === topic);
  const typingTopics = new Map();
  typingList.forEach((t) => {
    if (t.topic && !typingTopics.has(t.topic)) typingTopics.set(t.topic, paletteFor(t.name));
  });

  const buildForReview = () => {
    const fromTranscript = formatTranscriptForAi(transcript);
    if (fromTranscript.trim()) return fromTranscript;
    return agenda
      .map((t) => flattenNotesDoc(topicNotes[t] || "").trim())
      .filter(Boolean)
      .join("\n");
  };
  const buildDisplay = () =>
    agenda
      .map((t) => {
        const x = flattenNotesDoc(topicNotes[t] || "").trim();
        return x ? `## ${t}\n${x}` : "";
      })
      .filter(Boolean)
      .join("\n\n");

  const endMeeting = async () => {
    if (!canEndMeeting || meetingStatus === "ended" || endingMeeting) return;
    setEndingMeeting(true);
    redirectedRef.current = true; // 避免結束流程與跳轉 effect 競態
    clearTimeout(notesTimer.current);
    clearTimeout(transcriptPersistTimer.current);

    const participantNames = memberNames.length
      ? memberNames
      : meeting.participants || [];
    const rows = transcriptRef.current.slice();
    const transcriptText = formatTranscriptForAi(rows);
    const review = extractReview(buildForReview(), participantNames);
    const endedAt = Date.now();

    // 1) 先強制結案狀態（看板／PIP 立刻離開「進行中」）
    try {
      await store.updateMeeting(meeting.id, {
        status: "done",
        meetingStatus: "ended",
        endedAt,
      });
    } catch (err) {
      console.warn("[LiveRoom] end status patch failed, keeping local done", err?.message || err);
      if (typeof store.setMeetings === "function") {
        store.setMeetings((prev) =>
          (Array.isArray(prev) ? prev : []).map((m) =>
            m.id === meeting.id
              ? { ...m, status: "done", meetingStatus: "ended", endedAt }
              : m
          )
        );
      }
    }
    setMeetingStatus("ended");
    clearActiveLiveMeetingId(meeting.id);

    // 2) 再寫入筆記／逐字稿／AI 整理（失敗不回滾結案）
    try {
      await store.updateMeeting(meeting.id, {
        topicNotes,
        notes: buildDisplay(),
        transcript: rows,
        transcriptText,
        aiSource: transcriptText.trim() ? "transcript" : "notes",
        status: "done",
        meetingStatus: "ended",
        endedAt,
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
          patch: { status: "done", meetingStatus: "ended", endedAt },
        });
      }
    } catch (err) {
      console.error("[LiveRoom] endMeeting content persist", err);
    }

    clearLiveTranscript(meeting.id);
    await new Promise((r) => window.setTimeout(r, 600));
    setEndConfirmOpen(false);
    go("post", meeting.id);
    setEndingMeeting(false);
  };

  const saveLater = async () => {
    clearTimeout(notesTimer.current);
    clearTimeout(transcriptPersistTimer.current);
    const rows = transcriptRef.current;
    saveLiveTranscript(meeting.id, rows);
    socketRef.current?.emit("notes:update", { meetingId: meeting.id, topicNotes });
    try {
      await store.updateMeeting(meeting.id, {
        topicNotes,
        transcript: rows,
        transcriptText: formatTranscriptForAi(rows),
      });
    } catch {
      /* 本機 store／session 已有逐字稿，仍可回到會議 */
    }
    go("dashboard");
  };

  useEffect(() => {
    setCornell(loadCornell(cornellUserKey, meeting.id));
  }, [cornellUserKey, meeting.id]);

  const handleCornellChange = useCallback(
    (next) => {
      setCornell(next);
      saveCornell(cornellUserKey, meeting.id, next);
    },
    [cornellUserKey, meeting.id]
  );

  const mobileTabs = [
    { id: "av", label: "音視訊", icon: "" },
    { id: "stt", label: "逐字稿", icon: "" },
    { id: "notes", label: "筆記", icon: "" },
    { id: "roster", label: "與會", icon: "" },
    { id: "pains", label: "痛點", icon: "" },
  ];

  const rtcControls = (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      <button
        type="button"
        onClick={toggleMic}
        aria-pressed={micOn}
        title={micOn ? "關閉麥克風" : "開啟麥克風"}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition-all active:scale-95 ${
          micOn
            ? "bg-mint-500 border-mint-500 text-white shadow-glow"
            : "bg-navy-800/80 border-navy-700 text-white/80"
        }`}
      >
        {micOn ? <Mic className="h-4 w-4" strokeWidth={2.2} /> : <MicOff className="h-4 w-4" strokeWidth={2.2} />}
      </button>
      <button
        type="button"
        onClick={toggleCam}
        aria-pressed={camOn}
        title={camOn ? "關閉鏡頭" : "開啟鏡頭"}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition-all active:scale-95 ${
          camOn
            ? "bg-mint-500 border-mint-500 text-white shadow-glow"
            : "bg-navy-800/80 border-navy-700 text-white/80"
        }`}
      >
        {camOn ? <Video className="h-4 w-4" strokeWidth={2.2} /> : <VideoOff className="h-4 w-4" strokeWidth={2.2} />}
      </button>
      <button
        type="button"
        onClick={toggleScreenShare}
        aria-pressed={screenSharing}
        title={screenSharing ? "停止分享螢幕" : "分享螢幕畫面"}
        className={`inline-flex h-11 min-w-[2.75rem] items-center justify-center gap-1.5 rounded-full border px-3 transition-all active:scale-95 ${
          screenSharing
            ? "bg-sky-500 border-sky-500 text-white shadow-sm"
            : "bg-navy-800/80 border-navy-700 text-white/80"
        }`}
      >
        <MonitorUp className="h-4 w-4" strokeWidth={2.2} />
        <span className="text-[11px] font-bold hidden sm:inline">
          {screenSharing ? "分享中" : "螢幕"}
        </span>
      </button>
    </div>
  );

  const videoGridPanel = (
    <VideoPanel
      currentUserName={currentUserName}
      micOn={micOn}
      camOn={camOn}
      screenSharing={screenSharing}
      mediaReady={mediaReady}
      mediaError={mediaError}
      sttError={sttError}
      sttListening={sttListening}
      localVideoRef={localVideoRef}
      screenVideoRef={screenVideoRef}
      videoParticipants={videoParticipants}
      rtcControls={rtcControls}
      onRetryMedia={() => startMedia({ mic: true, cam: true })}
      getCameraStream={getCameraStream}
      getScreenStream={getScreenStream}
      compact={isMdUp}
    />
  );

  const filteredTranscript = useMemo(() => {
    const q = String(transcriptSearch || "").trim().toLowerCase();
    if (!q) return transcript;
    return transcript.filter((row) => {
      const text = String(row?.text || "").toLowerCase();
      const speaker = String(row?.speaker || "").toLowerCase();
      return text.includes(q) || speaker.includes(q);
    });
  }, [transcript, transcriptSearch]);

  const onTranscriptScroll = useCallback((e) => {
    const el = e.currentTarget;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    transcriptStickBottomRef.current = dist < 72;
  }, []);

  const onTranscriptModalScroll = useCallback((e) => {
    const el = e.currentTarget;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    transcriptModalStickBottomRef.current = dist < 96;
  }, []);

  const openTranscriptModal = useCallback(() => {
    transcriptModalStickBottomRef.current = true;
    setTranscriptSearch("");
    setTranscriptModalOpen(true);
  }, []);

  const transcriptWall = (
    <div className="flex flex-col min-h-0 h-full max-h-full bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-navy-800/6 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy-800">即時語音轉文字</p>
          <p className="text-[11px] text-navy-400 truncate">
            {sttSupported
              ? sttListening
                ? "Web Speech 正在聽你說話…"
                : micOn
                ? "準備辨識中"
                : "請開啟麥克風以開始 STT"
              : "此瀏覽器不支援語音辨識（建議 Chrome）"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              sttListening
                ? "text-mint-700 bg-mint-50 border-mint-100"
                : "text-navy-500 bg-navy-800/5 border-navy-800/10"
            }`}
          >
            {transcript.length} 句
          </span>
          <button
            type="button"
            title="放大檢視逐字稿"
            aria-label="放大檢視逐字稿"
            onClick={openTranscriptModal}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-navy-800/10 bg-navy-800/[0.03] text-navy-500 hover:bg-mint-50 hover:text-mint-700 hover:border-mint-200 transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.4} />
          </button>
        </div>
      </div>
      <div
        ref={transcriptScrollRef}
        onScroll={onTranscriptScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 py-3 space-y-2.5 scroll-smooth mf-thin-scrollbar"
      >
        {transcript.length === 0 && !interimText ? (
          <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center px-4">
            <p className="text-sm font-bold text-navy-600">對麥克風說話即可產生逐字稿</p>
            <p className="mt-1 text-xs text-navy-400">
              使用瀏覽器內建語音辨識（zh-TW），非模擬台詞
            </p>
          </div>
        ) : (
          <>
            {transcript.map((row) => {
              const pal = paletteFor(row.speaker);
              return (
                <div
                  key={row.id}
                  className={`rounded-2xl border px-3 py-2 ${pal.bg} border-navy-800/5`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold tabular-nums text-navy-400">
                      [{row.time}]
                    </span>
                    <span className={`text-[11px] font-black ${pal.text}`}>{row.speaker}</span>
                  </div>
                  <p className="text-sm text-navy-700 leading-relaxed">{row.text}</p>
                </div>
              );
            })}
            {interimText ? (
              <div className="rounded-2xl border border-dashed border-mint-200 bg-mint-50/60 px-3 py-2 opacity-80">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-mint-600">辨識中…</span>
                  <span className="text-[11px] font-black text-mint-700">{currentUserName}</span>
                </div>
                <p className="text-sm text-navy-600 leading-relaxed">{interimText}</p>
              </div>
            ) : null}
          </>
        )}
        <div ref={transcriptEndRef} />
      </div>
      <div className="shrink-0 px-4 py-2.5 border-t border-navy-800/6 bg-navy-800/[0.015]">
        <p className="text-[10px] text-navy-400 text-center">
          結束會議後，完整逐字稿將交由 Gemini 深度結構化分析
        </p>
      </div>
    </div>
  );

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

      <AgendaTabs
        agenda={agenda}
        agendaIdx={agendaIdx}
        topicNotes={topicNotes}
        typingTopics={typingTopics}
        canManage={canEdit}
        onSelect={selectAgenda}
        onRequestAdd={openAddAgenda}
        onRequestRename={openRenameAgenda}
        onRequestDelete={openDeleteAgenda}
      />

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
              唯讀狀態（尚未獲得發起人的編輯授權）
            </span>
          </div>
        )}
        {/* 方案 B：乾淨筆記正文 + 底部可收折 AI 對話面板（語音鈕收進面板 header） */}
        <MeetingNotesWithBottomAIPanel
          key={agendaIdx}
          className="flex-1 min-h-0"
          editorClassName={`px-5 py-4 ${!canEdit ? "bg-navy-800/[0.02]" : ""}`}
          value={topicNotes[topic] || ""}
          onChange={(next) => setCurrentNote(next)}
          disabled={!canEdit}
          syncOnStream
          placeholder={
            canEdit
              ? `「${topic}」的討論重點寫在這裡。\n輸入 @ai 或打 @ 叫出選單，問答會收進下方 AI 面板，不會插進正文。`
              : "唯讀狀態（尚未獲得發起人的編輯授權）"
          }
          aiContext={
            canEdit && meetingStatus !== "ended"
              ? {
                  transcriptRows: transcript,
                  title: meeting.title || meetingDisplayTitle,
                  topic,
                  mode,
                }
              : null
          }
          voiceSlot={
            meetingStatus !== "ended" ? (
              <FloatingAIAssistantButton
                transcriptRows={transcript}
                liveInterim={interimText}
                sttActive={sttListening}
                title={meeting.title || meetingDisplayTitle}
                topic={topic}
                mode={mode}
              />
            ) : null
          }
        />
      </div>

      <div className="px-4 md:px-5 py-2.5 border-t border-navy-800/6 bg-navy-800/[0.015] shrink-0 flex items-center justify-between gap-3">
        <span className="text-xs text-navy-300 hidden sm:inline">
          即時同步 · 全部 {totalLines} 行
        </span>
        <span className="text-xs text-navy-300 sm:hidden">{totalLines} 行</span>
        <div className="flex gap-2 shrink-0">
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
              結束會議
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

  /** 團體共編 + 個人私密康乃爾筆記的雙分頁外殼 */
  const notesPanel = (
    <MeetingNotesContainer
      className="flex-1 min-h-0"
      meetingId={meeting.id}
      userId={cornellUserKey}
      tab={notesTab}
      onTabChange={setNotesTab}
      value={cornell}
      onChange={handleCornellChange}
      aiEnabled={meetingStatus !== "ended"}
      transcriptRows={transcript}
      meetingTitle={meeting.title || meetingDisplayTitle}
      topic={topic}
      mode={mode}
    >
      {notesEditor}
    </MeetingNotesContainer>
  );

  /* ══════════════════════════════════════════════════════════════════════
     左欄：視訊（上 flex-1，控制列釘底）+ 與會人員（下 max-h 限高可滾）
     ══════════════════════════════════════════════════════════════════════ */
  const leftMediaAndParticipants = (
    <LeftVideoSidebar
      videoPanel={isMdUp ? videoGridPanel : null}
      joinedCount={joinedCount}
      rosterTotal={uniqueRoster.length || 0}
      roster={
        uniqueRoster.length ? (
          <ParticipantRoster
            bare
            hideHeader
            onDark
            roster={uniqueRoster}
            canKick={canKick}
            hostName={hostName}
            meName={currentUserName}
            meId={me?.id || null}
            onKick={setKickTarget}
            onProfile={setProfileTarget}
            onReport={setReportTarget}
          />
        ) : (
          <p className="px-1 py-6 text-center text-[11px] text-white/40">尚無與會者</p>
        )
      }
    />
  );

  /* ══════════════════════════════════════════════════════════════════════
     右下：精簡 Time Boxing 卡（無痛點、無議程清單、無內部捲軸）
     語音 AI 為全域 fixed FAB，不在此卡片內。
     ══════════════════════════════════════════════════════════════════════ */
  const sidebarPanel = (
    <AgendaTimerCard
      seconds={sec}
      topic={topic}
      agendaCount={agenda.length}
      agendaIndex={agendaIdx}
      budgetMinutes={currentAgendaBudget}
      paused={timerPaused}
      onTogglePause={() => setTimerPaused((p) => !p)}
      onNextAgenda={() => selectAgenda(Math.min(agendaIdx + 1, agenda.length - 1))}
    />
  );

  return (
    <div className="fade-in max-w-7xl mx-auto w-full h-full min-h-0 flex flex-col overflow-hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-6 md:pt-4 md:pb-4">
      {/* ── 頂部固定區：深色會議控制列 + 痛點（全站導覽改左側抽屜，不再覆蓋此列） ── */}
      <header className="shrink-0 space-y-2 mb-2 md:mb-3 z-10 relative">
        <MeetingHeader
          title={meetingDisplayTitle}
          meetingCode={meeting.code}
          clockLabel={formatClock(sec)}
          clockUrgent={sec <= 60}
          onTitleClick={() => setTitleModalOpen(true)}
        >
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
        </MeetingHeader>

        <div className="hidden md:block">
          <PainPointsList pains={meeting.pains} />
        </div>

        {syncError && (
          <p className="text-xs text-coral-500 bg-coral-50 border border-coral-100 rounded-xl px-3 py-2">
            {syncError}
          </p>
        )}
      </header>

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
      <div className="md:hidden flex-1 min-h-0 flex flex-col overflow-hidden">
        {mobileTab === "av" && !isMdUp && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{videoGridPanel}</div>
        )}
        {mobileTab === "stt" && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{transcriptWall}</div>
        )}
        {mobileTab === "notes" && (
          <div className="flex-1 min-h-0 bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden flex flex-col">
            {notesPanel}
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

      {/* ── 桌機：緊湊視訊側欄 + 主角議程筆記 + 逐字稿 ── */}
      <div className="hidden md:flex flex-1 min-h-0 gap-3 xl:gap-4 items-stretch overflow-hidden">
        {/* 左側：可折疊極簡視訊側欄 */}
        <div
          className={`relative shrink-0 min-h-0 h-full flex flex-col transition-[width] duration-200 ease-out ${
            videoCollapsed ? "w-12" : "w-64 xl:w-72"
          }`}
        >
          {videoCollapsed ? (
            <button
              type="button"
              onClick={() => setVideoCollapsed(false)}
              title="展開視訊側欄"
              className="h-full w-full rounded-2xl border border-navy-800/10 bg-navy-900 text-white flex flex-col items-center justify-center gap-3 hover:bg-navy-800 transition-colors shadow-card"
            >
              <Video className="h-4 w-4 text-mint-300" strokeWidth={2.2} />
              <ChevronRight className="h-4 w-4 text-white/70" strokeWidth={2.4} />
              <span
                className="text-[10px] font-bold text-white/50 tracking-wider"
                style={{ writingMode: "vertical-rl" }}
              >
                視訊
              </span>
            </button>
          ) : (
            <div className="relative flex-1 min-h-0 flex flex-col">
              {leftMediaAndParticipants}
              <button
                type="button"
                onClick={() => setVideoCollapsed(true)}
                title="收合視訊側欄，擴大筆記"
                className="absolute -right-2.5 top-1/2 z-20 -translate-y-1/2 h-9 w-5 rounded-full border border-navy-800/15 bg-white text-navy-500 shadow-sm hover:bg-mint-50 hover:text-mint-700 flex items-center justify-center"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
              </button>
            </div>
          )}
        </div>

        {/* 中央：議程筆記（視覺主角，吃掉剩餘寬度） */}
        <div className="flex-1 min-w-0 min-h-0 h-full bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden flex flex-col">
          {notesPanel}
        </div>

        {/* 右側：逐字稿（吃剩餘高度）+ 精簡議程計時卡（高度自適應） */}
        <div className="hidden xl:flex w-72 shrink-0 min-h-0 h-full flex-col gap-3 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">{transcriptWall}</div>
          <div className="shrink-0">{sidebarPanel}</div>
        </div>
      </div>

      {/* lg 但非 xl：逐字稿＋精簡計時卡置底 */}
      <div className="hidden lg:flex xl:hidden shrink-0 gap-3 mt-3 items-stretch max-h-[min(36vh,420px)]">
        <div className="flex-1 min-h-0 h-full max-h-[min(36vh,420px)] overflow-hidden">
          {transcriptWall}
        </div>
        <div className="w-64 shrink-0 overflow-y-auto mf-thin-scrollbar">{sidebarPanel}</div>
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

      {transcriptModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transcript-modal-title"
        >
          <button
            type="button"
            aria-label="關閉逐字稿放大檢視"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setTranscriptModalOpen(false)}
          />
          <div className="relative z-10 flex w-full max-w-4xl h-[80vh] max-h-[min(80vh,820px)] flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/95 backdrop-blur-xl shadow-card-hover ring-1 ring-navy-800/10 dark:bg-[#111c35] dark:border-slate-800 dark:ring-slate-700/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0 px-4 sm:px-5 pt-4 pb-3 border-b border-navy-800/8 dark:border-slate-700/60">
              <div className="min-w-0">
                <h3
                  id="transcript-modal-title"
                  className="text-base sm:text-lg font-bold text-navy-800 dark:text-white"
                >
                  📜 完整會議逐字稿
                </h3>
                <p className="mt-0.5 text-[11px] font-semibold text-navy-400 dark:text-slate-400">
                  共 {transcript.length} 句
                  {sttListening ? " · 即時更新中" : ""}
                  {transcriptSearch.trim()
                    ? ` · 搜尋結果 ${filteredTranscript.length} 句`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="relative flex-1 sm:w-56 min-w-0">
                  <span className="sr-only">搜尋關鍵字</span>
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    strokeWidth={2.2}
                  />
                  <input
                    type="search"
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder="搜尋關鍵字..."
                    className="w-full rounded-xl border border-navy-800/10 bg-navy-800/[0.03] pl-8 pr-3 py-2 text-sm text-navy-800 placeholder:text-navy-400 outline-none focus:border-mint-300 focus:ring-2 focus:ring-mint-100 dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-mint-500/40 dark:focus:ring-mint-500/10"
                  />
                </label>
                <button
                  type="button"
                  aria-label="關閉"
                  title="關閉"
                  onClick={() => setTranscriptModalOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-navy-800/5 text-navy-500 hover:bg-navy-800/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <X className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </div>
            </div>

            <div
              ref={transcriptModalScrollRef}
              onScroll={onTranscriptModalScroll}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-3 mf-thin-scrollbar"
            >
              {filteredTranscript.length === 0 && !interimText ? (
                <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center px-4">
                  <p className="text-sm font-bold text-navy-600 dark:text-slate-200">
                    {transcriptSearch.trim() ? "找不到符合的逐字稿" : "尚無逐字稿"}
                  </p>
                  <p className="mt-1 text-xs text-navy-400 dark:text-slate-500">
                    {transcriptSearch.trim()
                      ? "試試其他關鍵字，或清空搜尋後瀏覽全場對話"
                      : "對麥克風說話後，完整對話會即時出現在此"}
                  </p>
                </div>
              ) : (
                <>
                  {filteredTranscript.map((row) => {
                    const pal = paletteFor(row.speaker);
                    return (
                      <div
                        key={row.id}
                        className={`rounded-2xl border px-4 py-3 ${pal.bg} border-navy-800/5 dark:bg-slate-900/50 dark:border-slate-700/50`}
                      >
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <span className="text-xs font-bold tabular-nums text-navy-400 dark:text-slate-500">
                            [{row.time}]
                          </span>
                          <span
                            className={`text-xs font-black ${pal.text} dark:text-mint-300`}
                          >
                            {row.speaker}
                          </span>
                        </div>
                        <p className="text-base text-navy-800 leading-relaxed dark:text-slate-100">
                          {row.text}
                        </p>
                      </div>
                    );
                  })}
                  {!transcriptSearch.trim() && interimText ? (
                    <div className="rounded-2xl border border-dashed border-mint-200 bg-mint-50/60 px-4 py-3 opacity-90 dark:bg-mint-950/30 dark:border-mint-700/40">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="text-xs font-bold text-mint-600 dark:text-mint-400">
                          辨識中…
                        </span>
                        <span className="text-xs font-black text-mint-700 dark:text-mint-300">
                          {currentUserName}
                        </span>
                      </div>
                      <p className="text-base text-navy-700 leading-relaxed dark:text-slate-200">
                        {interimText}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
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
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/50 bg-white/90 backdrop-blur-md shadow-card-hover p-5 ring-1 ring-navy-800/10">
            <h3 id="end-meeting-title" className="text-base font-bold text-navy-800">
              結束會議
            </h3>
            {endingMeeting ? (
              <div className="mt-3 rounded-2xl border border-mint-100 bg-mint-50/80 px-3.5 py-3">
                <p className="text-sm font-semibold text-mint-800 leading-relaxed animate-pulse">
                  正在將整場會議的語音逐字稿交由 Gemini 進行深度結構化分析…
                </p>
                <p className="mt-1.5 text-[11px] text-mint-700/80">
                  已擷取 {transcript.length} 句即時轉寫，分析完成後寫入快取避免重複燒 Token。
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-navy-600 leading-relaxed">
                確定要結束本次會議嗎？結束後將全端同步終止，並以本場完整語音轉文字逐字稿
                （目前 {transcript.length} 句）交由 Gemini 進行深度結構化分析。
              </p>
            )}
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
                {endingMeeting ? "分析準備中…" : "確定結束"}
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

      {agendaToast ? (
        <div className="fixed left-1/2 top-4 z-[120] w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl border border-navy-800/10 bg-white/95 backdrop-blur-md px-4 py-3 text-center text-sm font-semibold text-navy-700 shadow-card-hover">
          {agendaToast}
        </div>
      ) : null}

      <AgendaEditModal
        open={agendaEditOpen}
        mode={agendaEditMode}
        initialName={
          agendaEditMode === "rename" && agendaEditIdx >= 0
            ? agenda[agendaEditIdx] || ""
            : ""
        }
        initialMinutes={
          agendaEditMode === "rename" && agendaEditIdx >= 0
            ? agendaMinutes[agendaEditIdx] || DEFAULT_AGENDA_MINUTES
            : DEFAULT_AGENDA_MINUTES
        }
        busy={agendaBusy}
        onClose={() => !agendaBusy && setAgendaEditOpen(false)}
        onConfirm={confirmAgendaEdit}
      />

      <DeleteAgendaConfirmModal
        open={agendaDeleteIdx != null}
        agendaName={
          agendaDeleteIdx != null ? agenda[agendaDeleteIdx] || "" : ""
        }
        busy={agendaBusy}
        onClose={() => !agendaBusy && setAgendaDeleteIdx(null)}
        onConfirm={confirmDeleteAgenda}
      />

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

      {/* 語音 Ask AI 已內嵌於筆記卡片底部工具列（結束會議按鈕上方）；私密頁改用 @ai */}
    </div>
  );
}

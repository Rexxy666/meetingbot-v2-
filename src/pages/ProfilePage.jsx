import { useMemo } from "react";
import { ArrowLeft, Building2, CalendarDays, Hash, Mail, Users } from "lucide-react";
import Avatar from "../components/Avatar.jsx";
import { getMode } from "../config/meetingConfig.js";

function formatJoinedAt(ts) {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts : Date.parse(ts));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function shortId(id) {
  const s = String(id || "").trim();
  if (!s) return "—";
  if (s.length <= 12) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

/**
 * 獨立個人資料分頁：名片資訊 + 人脈／會議沉澱摘要
 */
export default function ProfilePage({ user, mode, meetings = [], friends = [], go }) {
  const modeInfo = getMode(mode);
  const friendCount = Array.isArray(friends) ? friends.length : 0;

  const monthMeetingCount = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return (meetings || []).filter((meeting) => {
      const raw = meeting?.createdAt || meeting?.startedAt || meeting?.updatedAt;
      if (!raw) return false;
      const d = new Date(typeof raw === "number" ? raw : Date.parse(raw));
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === y && d.getMonth() === m;
    }).length;
  }, [meetings]);

  const totalMeetings = (meetings || []).length;
  const displayName = String(user?.name || "").trim() || "使用者";
  const email = String(user?.email || "").trim() || "尚未設定 Email";

  return (
    <div className="fade-in max-w-3xl mx-auto px-4 md:px-6 py-5 md:py-8">
      <div className="flex items-center justify-between gap-3 mb-5">
        <button
          type="button"
          onClick={() => go?.("dashboard")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-navy-800 bg-white border border-navy-800/8 rounded-xl px-3.5 py-2 shadow-sm hover:bg-navy-800/[0.03] transition-colors active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
          返回看板
        </button>
        <span className="text-[11px] font-bold text-navy-300 tracking-wide">PROFILE</span>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-navy-800/8 shadow-card mb-5">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #0F1B2D 0%, #1A3352 48%, #0D9488 140%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 20%, rgba(255,255,255,0.18), transparent 42%), radial-gradient(circle at 88% 10%, rgba(45,212,191,0.25), transparent 36%)",
          }}
        />
        <div className="relative px-6 pt-10 pb-8 flex flex-col items-center text-center">
          <div className="rounded-full p-1 bg-white/15 backdrop-blur-md ring-1 ring-white/25 shadow-card-hover">
            <Avatar name={displayName} size="h-24 w-24" ring={false} />
          </div>
          <h1 className="mt-4 text-2xl md:text-3xl font-black text-white tracking-tight">
            {displayName}
          </h1>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-white/75 max-w-full">
            <Mail className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2} />
            <span className="truncate">{email}</span>
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/12 backdrop-blur-md border border-white/20 px-3 py-1 text-[11px] font-bold text-mint-200">
            <span aria-hidden>{modeInfo?.emoji || "🏢"}</span>
            {modeInfo?.label || "企業模式"}
          </span>
        </div>
      </section>

      {/* Profile details */}
      <section className="bg-white/90 backdrop-blur-md border border-navy-800/8 rounded-3xl shadow-card p-5 md:p-6 mb-5">
        <h2 className="text-sm font-black text-navy-800 mb-4">名片資訊</h2>
        <ul className="space-y-3">
          <li className="flex items-start gap-3 rounded-2xl border border-navy-800/6 bg-navy-800/[0.02] px-3.5 py-3">
            <span className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-mint-50 text-mint-700 flex items-center justify-center">
              <Building2 className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-navy-400">當前身分</p>
              <p className="text-sm font-semibold text-navy-800">
                {modeInfo?.emoji} {modeInfo?.label || "企業模式"}
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-navy-800/6 bg-navy-800/[0.02] px-3.5 py-3">
            <span className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-navy-800/5 text-navy-600 flex items-center justify-center">
              <Hash className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-navy-400">成員 ID</p>
              <p className="text-sm font-semibold text-navy-800 font-mono truncate" title={user?.id}>
                {shortId(user?.id)}
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-navy-800/6 bg-navy-800/[0.02] px-3.5 py-3">
            <span className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <CalendarDays className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-navy-400">註冊時間</p>
              <p className="text-sm font-semibold text-navy-800">{formatJoinedAt(user?.createdAt)}</p>
            </div>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-navy-800/6 bg-navy-800/[0.02] px-3.5 py-3">
            <span className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-coral-50 text-coral-500 flex items-center justify-center">
              <Mail className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-navy-400">電子郵件</p>
              <p className="text-sm font-semibold text-navy-800 truncate">{email}</p>
            </div>
          </li>
        </ul>
      </section>

      {/* Network summary */}
      <section className="bg-white/90 backdrop-blur-md border border-navy-800/8 rounded-3xl shadow-card p-5 md:p-6">
        <h2 className="text-sm font-black text-navy-800 mb-4">社交與人脈沉澱</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-mint-100 bg-mint-50/70 px-4 py-4">
            <div className="flex items-center gap-2 text-mint-700">
              <Users className="h-4 w-4" strokeWidth={2.2} />
              <p className="text-[11px] font-bold">系統好友</p>
            </div>
            <p className="mt-2 text-2xl font-black text-navy-800 tabular-nums">
              {friendCount}
              <span className="ml-1 text-sm font-bold text-navy-400">位</span>
            </p>
          </div>
          <div className="rounded-2xl border border-navy-800/8 bg-navy-800/[0.03] px-4 py-4">
            <div className="flex items-center gap-2 text-navy-600">
              <CalendarDays className="h-4 w-4" strokeWidth={2.2} />
              <p className="text-[11px] font-bold">本月參與會議</p>
            </div>
            <p className="mt-2 text-2xl font-black text-navy-800 tabular-nums">
              {monthMeetingCount}
              <span className="ml-1 text-sm font-bold text-navy-400">場</span>
            </p>
          </div>
        </div>
        <p className="mt-4 text-[11px] text-navy-400 leading-relaxed">
          累計會議檔案 {totalMeetings} 場 · 資料僅顯示於你的帳號空間
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => go?.("friends")}
            className="text-xs font-semibold text-mint-700 bg-mint-50 border border-mint-100 rounded-xl px-3.5 py-2 hover:bg-mint-100/80 transition-colors"
          >
            管理好友 →
          </button>
          <button
            type="button"
            onClick={() => go?.("dashboard")}
            className="text-xs font-semibold text-navy-600 bg-navy-800/5 border border-navy-800/8 rounded-xl px-3.5 py-2 hover:bg-navy-800/10 transition-colors"
          >
            回到看板
          </button>
        </div>
      </section>
    </div>
  );
}

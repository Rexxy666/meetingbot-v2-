import { useState } from "react";
import {
  CheckSquare,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import Logo from "./Logo.jsx";
import Avatar from "./Avatar.jsx";
import { getMode } from "../config/meetingConfig.js";

const tabs = [
  { id: "dashboard", label: "看板", Icon: LayoutDashboard },
  { id: "create", label: "發起", Icon: Plus },
  { id: "todo", label: "待辦", Icon: CheckSquare },
  { id: "friends", label: "好友", Icon: Users },
];

function UserMenu({ user, mode, onOpenProfile, onOpenSettings, onLogout }) {
  const [open, setOpen] = useState(false);
  const modeInfo = getMode(mode);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="帳號選單"
        className="rounded-full p-0.5 transition-opacity hover:opacity-80 active:scale-95"
      >
        <Avatar name={user?.name || "U"} size="h-9 w-9" ring={false} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-[0_12px_40px_rgba(15,27,45,0.08)] z-50 fade-in">
            <div className="px-3 py-2.5">
              <p className="text-sm font-semibold text-navy-800 truncate">{user?.name || "使用者"}</p>
              <p className="text-[11px] text-navy-400 truncate mt-0.5">{user?.email}</p>
              <p className="mt-2 text-[11px] text-navy-400">
                {modeInfo.emoji} {modeInfo.label}
              </p>
            </div>
            <div className="h-px bg-gray-100 my-1" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenProfile?.();
              }}
              className="w-full flex items-center gap-2.5 text-sm font-medium text-navy-700 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <UserRound className="h-4 w-4 text-navy-400" strokeWidth={1.8} />
              個人資料
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="w-full flex items-center gap-2.5 text-sm font-medium text-navy-700 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Settings className="h-4 w-4 text-navy-400" strokeWidth={1.8} />
              個人設定
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full flex items-center gap-2.5 text-sm font-medium text-coral-500 px-3 py-2.5 rounded-xl hover:bg-coral-50 transition-colors"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
              登出
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 極簡頂部：手機 = MeetFlow + 頭像；電腦 = 品牌 · 扁平分頁 · 頭像。
 * 模式標籤不放這裡，避免與看板標題重複。
 */
export default function Navbar({
  page,
  setPage,
  todoCount = 0,
  friendsCount = 0,
  user,
  mode,
  onOpenProfile,
  onOpenSettings,
  onLogout,
}) {
  const badge = { todo: todoCount, friends: friendsCount };

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
      {/* 手機：Safe Area + 額外留白；電腦：扁平矮列 */}
      <div
        className="max-w-7xl mx-auto px-5 md:px-8
          pt-[max(2rem,env(safe-area-inset-top))] pb-4
          md:pt-3 md:pb-3
          flex items-center justify-between gap-8"
      >
        <button
          type="button"
          onClick={() => setPage("dashboard")}
          className="shrink-0 active:opacity-70 transition-opacity"
        >
          <Logo />
        </button>

        <nav className="hidden md:flex items-center gap-1">
          {tabs.map(({ id, label, Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                className={`relative inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-xl transition-colors
                  ${active ? "text-navy-800" : "text-navy-400 hover:text-navy-700"}`}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.8} />
                {label}
                {badge[id] > 0 && (
                  <span className="text-[10px] font-semibold text-coral-500 tabular-nums">
                    {badge[id]}
                  </span>
                )}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-0.5 h-px bg-navy-800/80 rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        <UserMenu
          user={user}
          mode={mode}
          onOpenProfile={onOpenProfile}
          onOpenSettings={onOpenSettings}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
}

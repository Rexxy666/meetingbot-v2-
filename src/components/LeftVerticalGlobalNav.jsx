import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckSquare,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import Avatar from "./Avatar.jsx";
import { getMode } from "../config/meetingConfig.js";

const tabs = [
  { id: "dashboard", label: "看板", Icon: LayoutDashboard },
  { id: "create", label: "發起", Icon: Plus },
  { id: "todo", label: "待辦", Icon: CheckSquare },
  { id: "friends", label: "好友", Icon: Users },
];

const DRAWER_W = "w-[4.75rem]";

/**
 * 常駐模式下主內容要讓開的寬度。
 * 與 DRAWER_W 綁在一起匯出，避免 App 那邊各寫一個數字造成兩邊飄移。
 * 導覽列在 md 以下是隱藏的（改用 BottomNav），所以只加 md: 斷點。
 */
export const NAV_CONTENT_OFFSET = "md:pl-[4.75rem]";

function BrandMark() {
  return (
    <div className="select-none flex flex-col items-center leading-none py-1">
      <span className="text-[15px] font-black tracking-tight text-navy-800">
        M<span className="text-mint-600">F</span>
      </span>
      <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-navy-400">
        MeetFlow
      </span>
    </div>
  );
}

function UserMenu({ user, mode, onOpenProfile, onOpenSettings, onLogout, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const modeInfo = getMode(mode);

  const setMenuOpen = (next) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen(!open)}
        aria-label="帳號選單"
        className="rounded-full p-0.5 transition-opacity hover:opacity-80 active:scale-95 ring-2 ring-transparent hover:ring-mint-200"
      >
        <Avatar name={user?.name || "U"} size="h-9 w-9" ring={false} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-full bottom-0 ml-3 w-56 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-[0_12px_40px_rgba(15,27,45,0.12)] z-50 fade-in">
            <div className="px-3 py-2.5">
              <p className="text-sm font-semibold text-navy-800 truncate">{user?.name || "使用者"}</p>
              <p className="text-[11px] text-navy-400 truncate mt-0.5">{user?.email}</p>
              <p className="mt-2 text-[11px] text-navy-400">{modeInfo.label}</p>
            </div>
            <div className="h-px bg-gray-100 my-1" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
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
                setMenuOpen(false);
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
                setMenuOpen(false);
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
 * 左側垂直全站導覽 —— 依路由切換兩種行為
 *
 *  immersive = false（看板／發起／待辦／好友／個人…）
 *    常駐顯示，不收折、無陰影；主內容由 App 加 NAV_CONTENT_OFFSET 讓開。
 *
 *  immersive = true（會議室 / prejoin）
 *    預設 -translate-x-full 藏到畫面外，只在滑鼠移入最左側感應帶時滑出，
 *    且維持 fixed overlay → 完全不推擠會議室 Layout。
 */
export default function LeftVerticalGlobalNav({
  page,
  setPage,
  todoCount = 0,
  friendsCount = 0,
  user,
  mode,
  onOpenProfile,
  onOpenSettings,
  onLogout,
  /** 沉浸模式（會議室）：預設隱藏 + Hover 滑出 */
  immersive = false,
}) {
  const [revealed, setRevealed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hideTimerRef = useRef(null);
  const badge = { todo: todoCount, friends: friendsCount };

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHideTimer();
    setRevealed(true);
  }, [clearHideTimer]);

  const scheduleHide = useCallback(() => {
    if (menuOpen || !immersive) return;
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setRevealed(false);
      hideTimerRef.current = null;
    }, 200);
  }, [clearHideTimer, menuOpen, immersive]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  /** 切換路由模式時重置：離開會議室要立刻常駐，進會議室要立刻收起 */
  useEffect(() => {
    clearHideTimer();
    setRevealed(false);
  }, [immersive, clearHideTimer]);

  // 帳號選單開啟時維持抽屜展開
  useEffect(() => {
    if (menuOpen) {
      clearHideTimer();
      setRevealed(true);
    }
  }, [menuOpen, clearHideTimer]);

  // 常駐模式永遠展開；沉浸模式才吃 revealed
  const visible = !immersive || revealed;

  return (
    <>
      {/* 左側 20px 透明感應帶：僅沉浸模式需要，不佔版面、不擋會議頂欄 */}
      {immersive && (
        <div
          className="pointer-events-auto fixed left-0 top-0 z-[60] hidden h-dvh w-5 md:block"
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          onPointerDown={show}
          aria-hidden
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 hidden h-dvh ${DRAWER_W} md:flex flex-col
          border-r border-navy-800/8 bg-white/95 backdrop-blur-md
          transition-transform duration-300 ease-in-out will-change-transform
          pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]
          ${immersive ? "shadow-2xl" : "shadow-none"}
          ${visible ? "translate-x-0" : "-translate-x-full pointer-events-none"}`}
        onMouseEnter={immersive ? show : undefined}
        onMouseLeave={immersive ? scheduleHide : undefined}
        aria-label="全站導覽"
      >
        <button
          type="button"
          onClick={() => setPage("dashboard")}
          className="mx-auto shrink-0 px-1 pt-2 pb-3 active:opacity-70 transition-opacity"
          title="MeetFlow 看板"
        >
          <BrandMark />
        </button>

        <nav className="flex flex-1 flex-col items-center gap-1 px-1.5 overflow-y-auto">
          {tabs.map(({ id, label, Icon }) => {
            const active = page === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPage(id)}
                title={label}
                className={`relative w-full flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition-colors
                  ${
                    active
                      ? "bg-mint-50 text-navy-800"
                      : "text-navy-400 hover:bg-navy-800/[0.04] hover:text-navy-700"
                  }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[10px] font-bold leading-none">{label}</span>
                {badge[id] > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[1rem] h-4 px-1 rounded-full bg-coral-500 text-[9px] font-bold text-white tabular-nums flex items-center justify-center">
                    {badge[id] > 9 ? "9+" : badge[id]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-2 px-2 pt-3 pb-2 border-t border-navy-800/6">
          <UserMenu
            user={user}
            mode={mode}
            onOpenProfile={onOpenProfile}
            onOpenSettings={onOpenSettings}
            onLogout={onLogout}
            onOpenChange={setMenuOpen}
          />
        </div>
      </aside>
    </>
  );
}

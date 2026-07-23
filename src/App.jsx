import { useEffect, useMemo, useState } from "react";
import LeftVerticalGlobalNav, {
  NAV_CONTENT_OFFSET,
} from "./components/LeftVerticalGlobalNav.jsx";
import MeetingRoomLayout from "./components/MeetingRoomLayout.jsx";
import Auth from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateMeeting from "./pages/CreateMeeting.jsx";
import LiveRoom from "./pages/LiveRoom.jsx";
import GreenRoom from "./components/GreenRoom.jsx";
import MeetingSummary from "./pages/MeetingSummary.jsx";
import Todo from "./pages/Todo.jsx";
import Friends from "./pages/Friends.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import FloatingMeetingWidget from "./components/FloatingMeetingWidget.jsx";
import BottomNav from "./components/BottomNav.jsx";
import { useAuth } from "./lib/auth.js";
import { useMeetings } from "./lib/store.js";
import { useSocial } from "./lib/social.js";
import { useMode } from "./lib/settings.js";
import { useTheme } from "./lib/theme.js";
import * as api from "./lib/api.js";
import { defaultMediaSettings, discardMediaHandoff } from "./lib/mediaSettings.js";
import {
  clearActiveLiveMeetingId,
  getActiveLiveMeetingId,
  isMeetingEnded,
  isMeetingLive,
} from "./lib/activeMeeting.js";

function parseLiveHash() {
  const hash = window.location.hash || "";
  const m = hash.match(/^#\/live\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function App() {
  const auth = useAuth();
  const [page, setPage] = useState("dashboard");
  const [activeId, setActiveId] = useState(() => getActiveLiveMeetingId() || null);
  const [mode, setMode] = useMode();
  const theme = useTheme();
  const [joinError, setJoinError] = useState(null);
  const [liveAgendaIdx, setLiveAgendaIdx] = useState(0);
  const [mediaSettings, setMediaSettings] = useState(() => defaultMediaSettings());
  const store = useMeetings(auth.isAuthenticated);
  const social = useSocial(auth.isAuthenticated ? auth.user : null);
  const { meetings } = store;

  const normalizeCode = (c) => String(c || "").replace(/\s|-/g, "");

  /** 依 UUID 或 6 碼會議代碼解析目前選中的會議 */
  const active = useMemo(() => {
    if (!activeId) return null;
    const byId = meetings.find((m) => m.id === activeId);
    if (byId) return byId;
    const code = normalizeCode(activeId);
    if (!code) return null;
    return meetings.find((m) => normalizeCode(m.code) === code) || null;
  }, [meetings, activeId]);

  // 若用代碼進房，正規化成真正的 meeting.id，後續路由一致
  useEffect(() => {
    if (active?.id && activeId && active.id !== activeId) {
      setActiveId(active.id);
    }
  }, [active?.id, activeId]);

  // 已結束的會議：清掉 activeId／PIP，避免看板誤顯「回到會議」
  useEffect(() => {
    if (!activeId) return;
    const m = meetings.find((row) => row.id === activeId);
    if (m && isMeetingEnded(m)) {
      clearActiveLiveMeetingId(activeId);
      if (page === "dashboard" || page === "todo" || page === "friends") {
        setActiveId(null);
      }
    }
  }, [meetings, activeId, page]);

  // 浮窗僅在真正進行中（live 且未 ended）時顯示
  const liveMeeting = useMemo(() => {
    if (!active || !isMeetingLive(active)) return null;
    return active;
  }, [active]);
  // 浮窗：正在會議中且已離開會議室／大廳頁時浮現
  const widgetVisible = Boolean(liveMeeting) && page !== "live" && page !== "prejoin";
  const liveAgenda = liveMeeting?.goals?.length ? liveMeeting.goals : ["會議討論"];
  const liveAgendaName = liveAgenda[Math.min(liveAgendaIdx, liveAgenda.length - 1)] || liveAgenda[0];

  const openTodoCount = meetings.reduce(
    (n, m) => n + (m.actions || []).filter((a) => !a.done).length,
    0
  );

  const go = (p, id = null) => {
    if (p === "dashboard") {
      // 回到看板：若目前選中會議已結束，清掉 PIP 錨點
      setActiveId((curr) => {
        const nextId = id !== null ? id : curr;
        const m = meetings.find((row) => row.id === nextId);
        if (m && isMeetingEnded(m)) {
          clearActiveLiveMeetingId(nextId);
          return null;
        }
        if (id !== null) return id;
        if (curr && isMeetingEnded(meetings.find((row) => row.id === curr))) {
          clearActiveLiveMeetingId(curr);
          return null;
        }
        return curr;
      });
      setPage(p);
      return;
    }
    if (id !== null) setActiveId(id);
    setPage(p);
  };

  // 外部連結 #/live/:meetingId → 加入與會者後進入大廳準備頁（不直衝會議室）
  useEffect(() => {
    if (!auth.isAuthenticated) return undefined;
    let cancelled = false;

    const handleJoinLink = async () => {
      const meetingRef = parseLiveHash();
      if (!meetingRef) return;
      setJoinError(null);
      try {
        const meeting = await api.joinMeetingByLink(meetingRef);
        if (cancelled) return;
        const meetingId = meeting?.id || meetingRef;
        if (meeting?.id) {
          store.setMeetings((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            if (list.some((m) => m.id === meeting.id)) {
              return list.map((m) => (m.id === meeting.id ? { ...m, ...meeting } : m));
            }
            return [meeting, ...list];
          });
        }
        await store.refreshMeetings();
        if (cancelled) return;
        setActiveId(meetingId);
        setPage("prejoin");
        if (window.location.hash.startsWith("#/live/")) {
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } catch (e) {
        if (!cancelled) setJoinError(e.message || "無法透過連結加入會議");
      }
    };

    handleJoinLink();
    window.addEventListener("hashchange", handleJoinLink);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", handleJoinLink);
    };
  }, [auth.isAuthenticated, store]);

  if (auth.booting) {
    return (
      <div className="min-h-screen flex items-center justify-center text-navy-400 text-sm">
        載入中…
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return <Auth auth={auth} />;
  }

  const immersiveLive = page === "live" || page === "prejoin";

  const navbarProps = {
    page,
    setPage,
    todoCount: openTodoCount,
    friendsCount: social.notifCount,
    user: auth.user,
    mode,
    onOpenProfile: () => setPage("profile"),
    onOpenSettings: () => setPage("settings"),
    onLogout: () => {
      auth.logout();
      setPage("dashboard");
      setActiveId(null);
    },
  };

  const pageContent = (
    <>
      {joinError && (
        <div className="mx-4 mt-3 shrink-0 rounded-2xl border border-coral-100 bg-coral-50 px-4 py-3 text-sm font-semibold text-coral-600">
          邀請連結：{joinError}
          <button type="button" className="ml-3 underline" onClick={() => setJoinError(null)}>
            關閉
          </button>
        </div>
      )}

      <main
        className={`flex-1 flex flex-col min-h-0 ${
          immersiveLive ? "pb-0 overflow-hidden" : "pb-24 md:pb-0"
        }`}
      >
        <div className={`flex-1 min-h-0 ${immersiveLive ? "overflow-hidden" : ""}`}>
          {page === "dashboard" && <Dashboard store={store} go={go} me={auth.user} mode={mode} />}
          {page === "create" && <CreateMeeting store={store} go={go} modeId={mode} friends={social.friends} />}
          {page === "prejoin" &&
            (active ? (
              <GreenRoom
                meeting={active}
                me={auth.user}
                onCancel={() => {
                  discardMediaHandoff();
                  go("dashboard");
                }}
                onJoin={(settings) => {
                  setMediaSettings(settings || defaultMediaSettings());
                  go("live", active.id);
                }}
              />
            ) : (
              <EmptyRedirect go={go} label="找不到要加入的會議" />
            ))}
          {page === "live" &&
            (active ? (
              <LiveRoom
                meeting={active}
                store={store}
                go={go}
                social={social}
                me={auth.user}
                onAgendaChange={setLiveAgendaIdx}
                initialMediaSettings={mediaSettings}
              />
            ) : (
              <EmptyRedirect go={go} label="沒有進行中的會議" />
            ))}
          {page === "post" &&
            (active ? (
              <MeetingSummary meeting={active} store={store} go={go} mode={mode} me={auth.user} />
            ) : (
              <EmptyRedirect go={go} label="尚未選擇會議" />
            ))}
          {page === "todo" && <Todo meetings={meetings} store={store} go={go} />}
          {page === "friends" && <Friends social={social} store={store} go={go} me={auth.user} />}
          {page === "profile" && (
            <ProfilePage
              user={auth.user}
              mode={mode}
              meetings={meetings}
              friends={social.friends}
              go={go}
              updateProfile={auth.updateProfile}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              user={auth.user}
              mode={mode}
              setMode={setMode}
              updateProfile={auth.updateProfile}
              theme={theme}
              onLogout={() => {
                auth.logout();
                setPage("dashboard");
                setActiveId(null);
              }}
              go={go}
            />
          )}
        </div>

        <footer
          className={`mt-auto pt-8 pb-3 md:pb-8 px-4 text-center text-[11px] text-navy-300 ${
            immersiveLive ? "hidden" : ""
          }`}
        >
          MeetFlow · 每位使用者只看得到自己的會議資料
        </footer>
      </main>

      {!immersiveLive && (
        <BottomNav page={page} setPage={setPage} todoCount={openTodoCount} friendsCount={social.notifCount} />
      )}

      <FloatingMeetingWidget
        meeting={liveMeeting}
        show={widgetVisible}
        agendaName={liveAgendaName}
        onReturn={() => liveMeeting && go("prejoin", liveMeeting.id)}
      />
    </>
  );

  /* 會議室／候場室：導覽收起，Hover 才滑出，且不推擠 Layout（不加 padding） */
  if (immersiveLive) {
    return (
      <>
        <LeftVerticalGlobalNav {...navbarProps} immersive />
        <MeetingRoomLayout>{pageContent}</MeetingRoomLayout>
      </>
    );
  }

  /* 其餘頁面：導覽常駐，主內容往右讓出導覽寬度 */
  return (
    <div className={`min-h-screen flex flex-col ${NAV_CONTENT_OFFSET}`}>
      <LeftVerticalGlobalNav {...navbarProps} />
      {pageContent}
    </div>
  );
}

function EmptyRedirect({ go, label }) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-20 text-center">
      <p className="text-navy-400">{label}</p>
      <button onClick={() => go("dashboard")} className="mt-4 text-mint-600 font-semibold hover:underline">
        ← 回到會議看板
      </button>
    </div>
  );
}

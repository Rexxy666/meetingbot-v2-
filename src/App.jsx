import { useEffect, useMemo, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import Auth from "./pages/Auth.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateMeeting from "./pages/CreateMeeting.jsx";
import LiveRoom from "./pages/LiveRoom.jsx";
import MeetingSummary from "./pages/MeetingSummary.jsx";
import Todo from "./pages/Todo.jsx";
import Friends from "./pages/Friends.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import FloatingMeetingWidget from "./components/FloatingMeetingWidget.jsx";
import BottomNav from "./components/BottomNav.jsx";
import { useAuth } from "./lib/auth.js";
import { useMeetings } from "./lib/store.js";
import { useSocial } from "./lib/social.js";
import { useMode } from "./lib/settings.js";
import * as api from "./lib/api.js";

function parseLiveHash() {
  const hash = window.location.hash || "";
  const m = hash.match(/^#\/live\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function App() {
  const auth = useAuth();
  const [page, setPage] = useState("dashboard");
  const [activeId, setActiveId] = useState(null);
  const [mode, setMode] = useMode();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [liveAgendaIdx, setLiveAgendaIdx] = useState(0);
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

  // 浮窗僅在真正進行中（live）時顯示
  const liveMeeting = useMemo(() => {
    if (!active || active.status === "done") return null;
    return active.status === "live" ? active : null;
  }, [active]);
  // 浮窗：正在會議中且已離開會議室頁時浮現
  const widgetVisible = Boolean(liveMeeting) && page !== "live";
  const liveAgenda = liveMeeting?.goals?.length ? liveMeeting.goals : ["會議討論"];
  const liveAgendaName = liveAgenda[Math.min(liveAgendaIdx, liveAgenda.length - 1)] || liveAgenda[0];

  const openTodoCount = meetings.reduce(
    (n, m) => n + (m.actions || []).filter((a) => !a.done).length,
    0
  );

  const go = (p, id = null) => {
    if (id !== null) setActiveId(id);
    setPage(p);
  };

  // 外部連結 #/live/:meetingId → 加入與會者後進入會議室（兩邊才能進同一 socket 房）
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
        // 先併入本地，再刷新；避免進 live 時找不到
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
        setPage("live");
        // 清掉 hash，避免重複觸發
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

  const immersiveLive = page === "live";

  return (
    <div className="min-h-screen flex flex-col">
      <div className={immersiveLive ? "hidden md:block" : undefined}>
        <Navbar
          page={page}
          setPage={setPage}
          todoCount={openTodoCount}
          friendsCount={social.notifCount}
          user={auth.user}
          mode={mode}
          onOpenProfile={() => setPage("profile")}
          onOpenSettings={() => setSettingsOpen(true)}
          onLogout={() => {
            auth.logout();
            setPage("dashboard");
            setActiveId(null);
          }}
        />
      </div>

      {settingsOpen && (
        <SettingsModal
          user={auth.user}
          mode={mode}
          onSave={({ name, mode: nextMode }) => {
            if (name && name !== auth.user?.name) auth.updateProfile({ name });
            setMode(nextMode);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {joinError && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <p className="text-sm text-coral-500 bg-coral-50 border border-coral-100 rounded-xl px-4 py-3">
            邀請連結：{joinError}
          </p>
        </div>
      )}

      <main
        className={`flex-1 flex flex-col ${
          immersiveLive ? "pb-0" : "pb-24 md:pb-0"
        }`}
      >
        <div className="flex-1">
          {page === "dashboard" && <Dashboard store={store} go={go} me={auth.user} mode={mode} />}
          {page === "create" && <CreateMeeting store={store} go={go} modeId={mode} friends={social.friends} />}
          {page === "live" &&
            (active ? (
              <LiveRoom meeting={active} store={store} go={go} social={social} me={auth.user} onAgendaChange={setLiveAgendaIdx} />
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
            />
          )}
        </div>

        <footer
          className={`mt-auto pt-8 pb-3 md:pb-8 px-4 text-center text-[11px] text-navy-300 ${
            immersiveLive ? "hidden md:block" : ""
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
        onReturn={() => liveMeeting && go("live", liveMeeting.id)}
      />
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

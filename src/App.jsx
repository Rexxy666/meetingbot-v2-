import { useMemo, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CreateMeeting from "./pages/CreateMeeting.jsx";
import LiveRoom from "./pages/LiveRoom.jsx";
import PostMeeting from "./pages/PostMeeting.jsx";
import Todo from "./pages/Todo.jsx";
import { useMeetings } from "./lib/store.js";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [activeId, setActiveId] = useState(null);
  const store = useMeetings();
  const { meetings } = store;

  const active = useMemo(() => meetings.find((m) => m.id === activeId) || null, [meetings, activeId]);

  const openMeetings = meetings.filter((m) => m.status !== "done");
  const openTodoCount = meetings.reduce(
    (n, m) => n + (m.actions || []).filter((a) => !a.done).length,
    0
  );

  const go = (p, id = null) => {
    if (id !== null) setActiveId(id);
    setPage(p);
  };

  return (
    <div className="min-h-screen">
      <Navbar page={page} setPage={setPage} todoCount={openTodoCount} />

      {page === "dashboard" && <Dashboard store={store} go={go} />}
      {page === "create" && <CreateMeeting store={store} go={go} />}
      {page === "live" &&
        (active ? (
          <LiveRoom meeting={active} store={store} go={go} />
        ) : (
          <EmptyRedirect go={go} label="沒有進行中的會議" />
        ))}
      {page === "post" &&
        (active ? (
          <PostMeeting meeting={active} store={store} go={go} />
        ) : (
          <EmptyRedirect go={go} label="尚未選擇會議" />
        ))}
      {page === "todo" && <Todo meetings={meetings} store={store} go={go} />}

      <footer className="max-w-7xl mx-auto px-6 py-8 text-center text-xs text-navy-300">
        關會 GuanHui · 讓每一場會議都值得 · 資料儲存在此瀏覽器
      </footer>
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

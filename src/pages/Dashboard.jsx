import { useEffect } from "react";
import { API_BASE } from "../lib/api.js";

function MetricCard({ tone, kicker, value, sub, icon }) {
  const tones = {
    mint: "from-mint-50 to-white border-mint-100",
    coral: "from-coral-50 to-white border-coral-100",
    navy: "from-navy-800/[0.03] to-white border-navy-800/10",
  };
  const iconBg = { mint: "bg-mint-500", coral: "bg-coral-400", navy: "bg-navy-700" }[tone];
  return (
    <div className={`bg-gradient-to-b ${tones[tone]} border rounded-3xl p-5 shadow-card`}>
      <div className={`h-11 w-11 rounded-2xl ${iconBg} flex items-center justify-center text-white shadow-card`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      </div>
      <p className="mt-4 text-xs font-semibold text-navy-400 tracking-wide">{kicker}</p>
      <p className="mt-1 text-2xl font-black text-navy-800 leading-tight">{value}</p>
      <p className="mt-1 text-xs text-navy-400">{sub}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    ready: { t: "已就緒", c: "text-mint-700 bg-mint-100" },
    live: { t: "進行中", c: "text-coral-500 bg-coral-100" },
    done: { t: "已完成", c: "text-navy-500 bg-navy-800/8" },
  };
  const s = map[status] || map.ready;
  return <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.c}`}>{s.t}</span>;
}

function MeetingRow({ m, go, onDelete }) {
  const openDone = (m.actions || []).filter((a) => !a.done).length;
  const primary =
    m.status === "done"
      ? { label: "查看整理", to: "post" }
      : m.status === "live"
      ? { label: "回到會議", to: "live" }
      : { label: "進入會議", to: "live" };
  return (
    <div className="fade-in flex items-center gap-4 p-4 rounded-2xl border bg-white border-navy-800/8 transition-all duration-200 hover:shadow-card">
      <div className={`shrink-0 h-11 w-11 rounded-2xl flex items-center justify-center ${m.status === "done" ? "bg-navy-800/8 text-navy-500" : "bg-mint-100 text-mint-600"}`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4 4 10-10" /></svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-bold text-navy-800 truncate">{m.title}</p>
          <StatusBadge status={m.status} />
        </div>
        <p className="text-xs text-navy-400 mt-0.5">
          {m.durationMin} 分鐘 · 目標 {m.goals.length} 項{m.participants.length ? ` · ${m.participants.join("、")}` : ""}
          {m.status === "done" && openDone > 0 ? ` · ${openDone} 項待辦未完成` : ""}
        </p>
      </div>
      <button onClick={() => onDelete(m.id)} className="shrink-0 text-navy-300 hover:text-coral-500 transition-colors p-1" title="刪除">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>
      </button>
      <button
        onClick={() => go(primary.to, m.id)}
        className="shrink-0 text-sm font-semibold px-4 py-2 rounded-xl bg-navy-800 text-white hover:bg-navy-700 transition-all duration-150 active:scale-95"
      >
        {primary.label}
      </button>
    </div>
  );
}

export default function Dashboard({ store, go }) {
  const { meetings, deleteMeeting, refreshMeetings, loading, error } = store;

  useEffect(() => {
    refreshMeetings();
  }, [refreshMeetings]);

  const done = meetings.filter((m) => m.status === "done");
  const savedHours = (done.length * 0.6).toFixed(1); // 每場守門把關約省 36 分鐘
  const openActions = meetings.reduce((n, m) => n + (m.actions || []).filter((a) => !a.done).length, 0);
  const upcoming = meetings.filter((m) => m.status !== "done");

  return (
    <div className="fade-in max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-navy-800">會議看板</h1>
          <p className="text-navy-400 mt-1">關會替你守門，讓每一場會議都值得。</p>
        </div>
        <button
          onClick={() => go("create")}
          className="flex items-center gap-2 bg-mint-500 text-white font-semibold px-5 py-2.5 rounded-xl shadow-card hover:bg-mint-600 hover:shadow-card-hover transition-all duration-150 active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          發起會議
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <MetricCard tone="mint" kicker="累計為您省下" value={`${savedHours} 小時`} sub={`已完成 ${done.length} 場有準備的會議`} icon="M12 6v6l4 2M12 22a10 10 0 100-20 10 10 0 000 20z" />
        <MetricCard tone="coral" kicker="守門把關會議" value={`${meetings.length} 場`} sub="皆通過預期目標檢查" icon="M18.4 9A9 9 0 105 18.6M22 4L12 14.01l-3-3" />
        <MetricCard tone="navy" kicker="待執行 Action Items" value={`${openActions} 項`} sub="來自各場會議整理" icon="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-black text-navy-800">你的會議</h2>
        <span className="text-xs font-semibold text-navy-400">{meetings.length} 場</span>
      </div>

      {error && (
        <p className="mt-4 text-sm text-coral-500 bg-coral-50 border border-coral-100 rounded-xl px-4 py-3">
          無法連線後端：{error}
          <br />
          <span className="text-navy-500">連線位址：{API_BASE}　·　若剛改後端請先推送到 GitHub 並在 Render 重新 Deploy</span>
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-navy-400 text-center">載入會議列表中…</p>
      ) : meetings.length === 0 ? (
        <div className="mt-4 border-2 border-dashed border-navy-800/10 rounded-3xl py-16 text-center">
          <div className="text-4xl">🗓️</div>
          <p className="mt-3 font-bold text-navy-700">還沒有會議</p>
          <p className="text-sm text-navy-400 mt-1">建立第一場通過守門員的會議吧。</p>
          <button onClick={() => go("create")} className="mt-4 bg-mint-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-mint-600 transition-colors active:scale-95">+ 發起會議</button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {upcoming.map((m) => <MeetingRow key={m.id} m={m} go={go} onDelete={deleteMeeting} />)}
          {done.length > 0 && (
            <>
              <p className="pt-4 text-xs font-bold text-navy-400">已完成</p>
              {done.map((m) => <MeetingRow key={m.id} m={m} go={go} onDelete={deleteMeeting} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import Avatar from "../components/Avatar.jsx";

const avatarColor = (name) => {
  const colors = ["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"];
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
};

export default function Todo({ meetings, store, go }) {
  const [filter, setFilter] = useState("open"); // open | all | done

  const rows = useMemo(() => {
    const list = [];
    for (const m of meetings) {
      for (const a of m.actions || []) {
        list.push({ ...a, meetingId: m.id, meetingTitle: m.title });
      }
    }
    return list;
  }, [meetings]);

  const shown = rows.filter((r) => (filter === "open" ? !r.done : filter === "done" ? r.done : true));
  const openCount = rows.filter((r) => !r.done).length;

  const toggle = (meetingId, aid) => {
    store.updateMeeting(meetingId, (m) => ({
      actions: (m.actions || []).map((a) => (a.id === aid ? { ...a, done: !a.done } : a)),
    }));
  };

  const filters = [
    { id: "open", label: `待完成 (${openCount})` },
    { id: "done", label: "已完成" },
    { id: "all", label: "全部" },
  ];

  return (
    <div className="fade-in max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-black text-navy-800">待辦任務</h1>
      <p className="text-navy-400 mt-1">彙整所有會議產出的 Action Items，一處追蹤到底。</p>

      <div className="mt-6 flex items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`text-sm font-semibold px-4 py-2 rounded-xl border transition-colors ${filter === f.id ? "bg-navy-800 text-white border-navy-800" : "bg-white text-navy-500 border-navy-800/10 hover:border-mint-300"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 border-2 border-dashed border-navy-800/10 rounded-3xl py-16 text-center">
          <div className="text-4xl">✅</div>
          <p className="mt-3 font-bold text-navy-700">還沒有待辦</p>
          <p className="text-sm text-navy-400 mt-1">結束一場會議後，AI 會自動從筆記擷取待辦到這裡。</p>
          <button onClick={() => go("dashboard")} className="mt-4 text-mint-600 font-semibold hover:underline">← 回到會議看板</button>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {shown.map((a) => (
            <div key={a.id} className={`flex items-center gap-3 bg-white border border-navy-800/8 rounded-2xl px-4 py-3.5 transition-all ${a.done ? "opacity-55" : "hover:shadow-card"}`}>
              <button onClick={() => toggle(a.meetingId, a.id)} className={`h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${a.done ? "bg-mint-500 border-mint-500 text-white" : "border-navy-800/20 hover:border-mint-400"}`}>
                {a.done && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4 4 10-10" /></svg>}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold text-navy-800 ${a.done ? "line-through" : ""}`}>{a.task}</p>
                <button onClick={() => go("post", a.meetingId)} className="text-xs text-navy-400 hover:text-mint-600 transition-colors">來自：{a.meetingTitle}</button>
              </div>
              {a.who && (
                <span className="hidden sm:inline-flex items-center gap-1.5">
                  <Avatar name={a.who} color={avatarColor(a.who)} size="h-6 w-6" ring={false} />
                  <span className="text-xs font-medium text-navy-600">{a.who}</span>
                </span>
              )}
              {a.when && <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-coral-100 text-coral-500">{a.when}</span>}
            </div>
          ))}
          {shown.length === 0 && <p className="text-center text-sm text-navy-300 py-8">此分類沒有項目。</p>}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "../components/Avatar.jsx";
import PainPointsList from "../components/PainPointsList.jsx";
import { extractReview } from "../lib/extract.js";

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
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" strokeLinecap="round" stroke={low ? "#FF8A5B" : "#14B8A6"} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-black tabular-nums ${low ? "text-coral-500" : "text-navy-800"}`}>{mm}:{ss}</span>
        <span className="text-[9px] font-semibold text-navy-300">剩餘</span>
      </div>
    </div>
  );
}

export default function LiveRoom({ meeting, store, go }) {
  const total = meeting.durationMin * 60;
  const agenda = useMemo(() => (meeting.goals.length ? meeting.goals : ["會議討論"]), [meeting.goals]);

  const [sec, setSec] = useState(() => {
    if (meeting.startedAt) return Math.max(0, total - Math.floor((Date.now() - meeting.startedAt) / 1000));
    return total;
  });
  const [agendaIdx, setAgendaIdx] = useState(0);

  // 依議程主題分頁的筆記：{ 主題: 文字 }
  const [topicNotes, setTopicNotes] = useState(() => {
    if (meeting.topicNotes && Object.keys(meeting.topicNotes).length) return meeting.topicNotes;
    // 相容舊資料：把單一 notes 併入第一個議程
    if (meeting.notes) return { [agenda[0]]: meeting.notes };
    return {};
  });

  const saveTimer = useRef(null);
  const topic = agenda[agendaIdx];

  useEffect(() => {
    if (meeting.status !== "live") store.updateMeeting(meeting.id, { status: "live", startedAt: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  // 自動存檔（debounce）
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => store.updateMeeting(meeting.id, { topicNotes }), 500);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicNotes]);

  const setCurrentNote = (val) => setTopicNotes((prev) => ({ ...prev, [topic]: val }));

  const totalLines = Object.values(topicNotes).reduce(
    (n, t) => n + (t ? t.split(/\r?\n/).filter(Boolean).length : 0),
    0
  );

  const buildForReview = () => agenda.map((t) => (topicNotes[t] || "").trim()).filter(Boolean).join("\n");
  const buildDisplay = () =>
    agenda
      .map((t) => {
        const x = (topicNotes[t] || "").trim();
        return x ? `## ${t}\n${x}` : "";
      })
      .filter(Boolean)
      .join("\n\n");

  const endMeeting = () => {
    const review = extractReview(buildForReview(), meeting.participants);
    store.updateMeeting(meeting.id, {
      topicNotes,
      notes: buildDisplay(),
      status: "done",
      endedAt: Date.now(),
      review,
      actions: review.actions,
    });
    go("post", meeting.id);
  };

  const saveLater = () => {
    store.updateMeeting(meeting.id, { topicNotes });
    go("dashboard");
  };

  return (
    <div className="fade-in max-w-7xl mx-auto px-6 py-6">
      {/* 頂部常駐：痛點 + 目標 */}
      <div className="sticky top-16 z-20 -mx-2 mb-5 space-y-2">
        <PainPointsList pains={meeting.pains} />
        <div className="bg-navy-800 text-white rounded-2xl px-5 py-3.5 shadow-card-hover flex items-center gap-3">
          <span className="text-lg">📌</span>
          <p className="font-bold text-sm sm:text-base truncate">本次會議目標：{meeting.goals.join("；") || meeting.title}</p>
          <span className="ml-auto hidden sm:flex items-center gap-1.5 text-xs font-semibold bg-mint-500/20 text-mint-200 px-2.5 py-1 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-mint-300 animate-pulse"></span> 進行中
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {/* 左：議程 + 計時器 */}
        <div className="bg-white border border-navy-800/8 rounded-3xl p-5 shadow-card self-start">
          <div className="flex items-center gap-3">
            <CircleTimer seconds={sec} total={total} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-navy-400">當前議程</p>
              <p className="font-black text-navy-800 leading-tight truncate">{topic}</p>
              <p className="text-xs text-mint-600 font-semibold mt-1">Time Boxing · 共 {agenda.length} 項</p>
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
                  onClick={() => setAgendaIdx(i)}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-2xl border transition-colors ${i === agendaIdx ? "bg-mint-50 border-mint-200" : "bg-white border-navy-800/8 hover:border-mint-200"}`}
                >
                  <span className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${i === agendaIdx ? "bg-mint-500 text-white" : "bg-navy-800/8 text-navy-400"}`}>{i + 1}</span>
                  <span className={`text-sm font-semibold truncate flex-1 ${i === agendaIdx ? "text-navy-800" : "text-navy-400"}`}>{a}</span>
                  {hasNote && <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-mint-400" title="已有筆記"></span>}
                  {i === agendaIdx && <span className="text-[10px] font-bold text-mint-600 bg-white px-2 py-0.5 rounded-full">現在</span>}
                </button>
              );
            })}
          </div>
          <button onClick={() => setAgendaIdx((i) => Math.min(i + 1, agenda.length - 1))} className="mt-4 w-full text-sm font-semibold text-navy-600 border border-navy-800/10 rounded-xl py-2.5 hover:bg-navy-800/[0.03] transition-colors">
            下一個議程 →
          </button>
        </div>

        {/* 右：該議程專屬筆記頁 */}
        <div className="bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-navy-800/6">
            <div className="flex items-center gap-2 text-sm font-bold text-navy-700 min-w-0">
              <span className="h-6 w-6 shrink-0 rounded-full bg-mint-500 text-white text-[11px] font-bold flex items-center justify-center">{agendaIdx + 1}</span>
              <span className="truncate">議程筆記：{topic}</span>
            </div>
            {meeting.participants.length > 0 && (
              <div className="flex items-center shrink-0">
                <div className="flex -space-x-2">
                  {meeting.participants.slice(0, 4).map((p, i) => (
                    <Avatar key={i} name={p} color={["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"][i % 4]} size="h-7 w-7" />
                  ))}
                </div>
                <span className="ml-2 text-xs font-semibold text-mint-600 hidden sm:inline">{meeting.participants.length} 位</span>
              </div>
            )}
          </div>

          {/* 議程分頁標籤 */}
          <div className="flex gap-1 px-3 pt-3 overflow-x-auto border-b border-navy-800/6">
            {agenda.map((a, i) => (
              <button
                key={i}
                onClick={() => setAgendaIdx(i)}
                className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-t-lg transition-colors ${i === agendaIdx ? "bg-mint-50 text-mint-700 border-b-2 border-mint-500" : "text-navy-400 hover:text-navy-700"}`}
              >
                {i + 1}. {a.length > 10 ? a.slice(0, 10) + "…" : a}
                {(topicNotes[a] || "").trim() && <span className="h-1.5 w-1.5 rounded-full bg-mint-400"></span>}
              </button>
            ))}
          </div>

          <textarea
            key={agendaIdx}
            value={topicNotes[topic] || ""}
            onChange={(e) => setCurrentNote(e.target.value)}
            placeholder={`「${topic}」的討論重點寫在這裡，一行一個。\n切換上方議程即切換到該主題的筆記頁，不會混在一起。`}
            className="w-full h-[360px] resize-none px-5 py-4 text-sm leading-relaxed text-navy-800 font-mono placeholder-navy-300 focus:bg-mint-50/20 transition-colors"
          />
          <div className="px-5 py-3 border-t border-navy-800/6 flex items-center justify-between bg-navy-800/[0.015]">
            <span className="text-xs text-navy-300">已自動儲存 · 全部 {totalLines} 行</span>
            <div className="flex gap-2">
              <button onClick={saveLater} className="text-xs font-semibold text-navy-500 px-3 py-1.5 rounded-lg hover:bg-navy-800/5 transition-colors">稍後再開</button>
              <button onClick={endMeeting} className="text-xs font-semibold text-white bg-navy-800 px-3 py-1.5 rounded-lg hover:bg-navy-700 transition-colors">結束會議 → AI 整理</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

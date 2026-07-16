import { useState } from "react";
import Avatar from "../components/Avatar.jsx";
import PainPointsList from "../components/PainPointsList.jsx";
import { extractReview } from "../lib/extract.js";

function AICard({ tone, icon, title, items, empty }) {
  const map = { blue: "bg-sky-50 border-sky-100", green: "bg-mint-50 border-mint-100", coral: "bg-coral-50 border-coral-100" };
  const dot = { blue: "bg-sky-400", green: "bg-mint-500", coral: "bg-coral-400" }[tone];
  return (
    <div className={`border rounded-3xl p-5 ${map[tone]}`}>
      <p className="font-black text-navy-800 flex items-center gap-2">{icon} {title}</p>
      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-navy-600"><span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dot}`}></span>{it}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-navy-300">{empty}</p>
      )}
    </div>
  );
}

const avatarColor = (name) => {
  const colors = ["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"];
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
};

export default function PostMeeting({ meeting, store, go }) {
  const review = meeting.review || extractReview(meeting.notes, meeting.participants);
  const actions = meeting.actions && meeting.actions.length ? meeting.actions : review.actions;
  const [copied, setCopied] = useState(null);

  const toggleDone = async (aid) => {
    await store.updateMeeting(meeting.id, (m) => ({
      actions: (m.actions || []).map((a) => (a.id === aid ? { ...a, done: !a.done } : a)),
    }));
  };

  const reRun = async () => {
    const r = extractReview(meeting.notes, meeting.participants);
    await store.updateMeeting(meeting.id, { review: r, actions: r.actions });
  };

  const copyItem = (a) => {
    const text = `[ ] ${a.task}${a.who ? ` （負責：${a.who}` : ""}${a.when ? `${a.who ? "，" : " （"}截止：${a.when}` : ""}${a.who || a.when ? "）" : ""}`;
    navigator.clipboard?.writeText(text);
    setCopied(a.id);
    setTimeout(() => setCopied(null), 1400);
  };

  const topicEntries = Object.entries(meeting.topicNotes || {}).filter(([, v]) => (v || "").trim());

  const durationMin = meeting.endedAt && meeting.startedAt ? Math.max(1, Math.round((meeting.endedAt - meeting.startedAt) / 60000)) : meeting.durationMin;

  return (
    <div className="fade-in max-w-7xl mx-auto px-6 py-8">
      <button onClick={() => go("dashboard")} className="text-sm text-navy-400 hover:text-navy-700 transition-colors">← 會議看板</button>
      <div className="mt-2 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-navy-800">會後 AI 整理</h1>
          <p className="text-navy-400 mt-1">{meeting.title} · 歷時約 {durationMin} 分鐘</p>
        </div>
        <button onClick={reRun} className="flex items-center gap-2 text-sm font-bold text-mint-700 bg-mint-100 px-4 py-2 rounded-xl hover:bg-mint-200 transition-colors">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15" /></svg>
          重新整理
        </button>
      </div>

      {meeting.pains?.length > 0 && (
        <div className="mt-6">
          <PainPointsList pains={meeting.pains} />
          <p className="mt-2 text-xs text-navy-400">會議當初想解決的問題，對照下方 AI 整理結果檢視是否已處理。</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* 左：原始筆記 */}
        <div className="self-start bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-navy-800/6 flex items-center gap-2 text-sm font-bold text-navy-700">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-navy-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" /></svg>
            會議原始口語筆記
          </div>
          {topicEntries.length ? (
            <div className="px-5 py-4 space-y-4">
              {topicEntries.map(([t, text]) => (
                <div key={t}>
                  <p className="text-xs font-bold text-mint-700 bg-mint-50 inline-block px-2 py-0.5 rounded-md">{t}</p>
                  <pre className="mt-1.5 text-sm text-navy-600 leading-relaxed whitespace-pre-wrap font-sans">{text}</pre>
                </div>
              ))}
            </div>
          ) : meeting.notes.trim() ? (
            <pre className="px-5 py-4 text-sm text-navy-600 leading-relaxed whitespace-pre-wrap font-sans">{meeting.notes}</pre>
          ) : (
            <p className="px-5 py-8 text-sm text-navy-300 text-center">這場會議沒有留下筆記。</p>
          )}
          {meeting.participants.length > 0 && (
            <div className="px-5 py-3 border-t border-navy-800/6 text-xs text-navy-300">與會者：{meeting.participants.join("、")}</div>
          )}
        </div>

        {/* 右：AI 面板 */}
        <div className="space-y-4">
          <AICard tone="blue" icon="💡" title="靈感 / 點子" items={review.ideas} empty="筆記中未偵測到明顯的點子。" />
          <AICard tone="green" icon="📌" title="決議事項" items={review.decisions} empty="筆記中未偵測到明確決議。" />
          <AICard tone="coral" icon="⚠️" title="潛在風險" items={review.risks} empty="太好了，沒有偵測到明顯風險。" />
        </div>
      </div>

      {/* Action Items 表格 */}
      <div className="mt-8 bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-navy-800/6 flex items-center justify-between">
          <h2 className="font-black text-navy-800 flex items-center gap-2">
            <span className="text-mint-500">✓</span> 待辦事項 Action Items
            <span className="text-xs font-semibold text-navy-400 bg-navy-800/5 px-2 py-0.5 rounded-full">自筆記擷取 {actions.length} 項</span>
          </h2>
        </div>
        {actions.length === 0 ? (
          <p className="px-6 py-10 text-sm text-navy-300 text-center">沒有從筆記中擷取到待辦。試著在筆記寫明「誰、要做什麼、何時完成」。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-navy-400 bg-navy-800/[0.02]">
                  <th className="px-6 py-3 w-8"></th>
                  <th className="px-2 py-3">待辦內容</th>
                  <th className="px-4 py-3">負責人 Who</th>
                  <th className="px-4 py-3">截止時程 When</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id} className={`border-t border-navy-800/6 transition-colors ${a.done ? "opacity-50" : "hover:bg-mint-50/30"}`}>
                    <td className="px-6 py-4">
                      <button onClick={() => toggleDone(a.id)} className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${a.done ? "bg-mint-500 border-mint-500 text-white" : "border-navy-800/20 hover:border-mint-400"}`}>
                        {a.done && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4 4 10-10" /></svg>}
                      </button>
                    </td>
                    <td className={`px-2 py-4 font-semibold text-navy-800 ${a.done ? "line-through" : ""}`}>{a.task}</td>
                    <td className="px-4 py-4">
                      {a.who ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={a.who} color={avatarColor(a.who)} size="h-6 w-6" ring={false} />
                          <span className="text-navy-600 font-medium">{a.who}</span>
                        </span>
                      ) : (
                        <span className="text-navy-300">未指定</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {a.when ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-coral-100 text-coral-500">{a.when}</span> : <span className="text-navy-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button onClick={() => copyItem(a)} className="text-xs font-semibold text-navy-600 border border-navy-800/10 px-2.5 py-1.5 rounded-lg hover:border-mint-300 hover:text-mint-600 transition-colors">
                        {copied === a.id ? "已複製 ✓" : "複製"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

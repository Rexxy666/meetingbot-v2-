import { useMemo, useState } from "react";
import Tag from "../components/Tag.jsx";

/* 可逐條新增的清單輸入 —— 一次加一個小項目，而非一次全部打完 */
function ListInput({ items, setItems, placeholder, ordered, accent = "mint" }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    setItems([...items, v]);
    setDraft("");
  };
  const remove = (i) => setItems(items.filter((_, idx) => idx !== i));
  const dotCls = accent === "coral" ? "bg-coral-400" : "bg-mint-500";

  return (
    <div>
      {items.length > 0 && (
        <ul className="space-y-2 mb-2.5">
          {items.map((it, i) => (
            <li key={i} className="group flex items-center gap-2.5 bg-navy-800/[0.02] border border-navy-800/8 rounded-xl px-3 py-2">
              {ordered ? (
                <span className={`h-5 w-5 shrink-0 rounded-full ${dotCls} text-white text-[11px] font-bold flex items-center justify-center`}>{i + 1}</span>
              ) : (
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`}></span>
              )}
              <span className="flex-1 text-sm text-navy-800">{it}</span>
              <button
                onClick={() => remove(i)}
                className="opacity-0 group-hover:opacity-100 text-navy-300 hover:text-coral-500 transition-all"
                title="移除"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // 輸入法組字中（選字）按 Enter 只是確認候選字，不應送出
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-sm text-navy-800 placeholder-navy-300 focus:border-mint-400 focus:shadow-glow transition-all"
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="shrink-0 px-4 rounded-xl bg-mint-500 text-white font-semibold text-sm hover:bg-mint-600 disabled:bg-navy-800/10 disabled:text-navy-300 transition-colors active:scale-95"
        >
          + 新增
        </button>
      </div>
    </div>
  );
}

function Rule({ ok, label, muted }) {
  return (
    <div className={`flex items-center gap-2.5 text-sm ${ok ? "text-navy-700" : muted ? "text-navy-300" : "text-navy-400"}`}>
      <span className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${ok ? "bg-mint-500 text-white" : "bg-navy-800/8 text-navy-300"}`}>
        {ok ? (
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4 4 10-10" /></svg>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
        )}
      </span>
      {label}
    </div>
  );
}

function GateStatusCard({ state, canCreate, onCreate, creating }) {
  const cfg = {
    block: { wrap: "bg-coral-50 border-coral-200", badge: "bg-coral-100 text-coral-500", title: "text-coral-500", icon: "⚠️", label: "阻擋中", heading: "目標尚未明確", body: "至少新增一項「預期目標」，否則系統會建議改用 Email 溝通，並阻止此會議發起。" },
    warn: { wrap: "bg-coral-50/60 border-coral-200", badge: "bg-coral-100 text-coral-500", title: "text-coral-500", icon: "⚠️", label: "警告", heading: "會議時間偏長", body: "偵測到會議時間大於 60 分鐘，建議拆分議程或縮短時間，但仍可建立。" },
    pass: { wrap: "bg-mint-50 border-mint-200", badge: "bg-mint-100 text-mint-700", title: "text-mint-700", icon: "🎉", label: "通行", heading: "這是一場有準備的優質會議！", body: "守門條件已滿足，可以建立看板，讓與會者提前對焦。" },
  }[state];

  return (
    <div className={`fade-in border rounded-3xl p-6 shadow-card transition-all duration-300 ${cfg.wrap}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${cfg.badge}`}>守門狀態 · {cfg.label}</span>
        <span className={`text-2xl ${state === "pass" ? "" : "pulse-ring"}`}>{cfg.icon}</span>
      </div>
      <h3 className={`mt-5 text-xl font-black ${cfg.title}`}>{cfg.heading}</h3>
      <p className="mt-2 text-sm text-navy-600 leading-relaxed">{cfg.body}</p>

      <div className="mt-6 space-y-2.5">
        <Rule ok={canCreate.title} label="已填寫會議主題" />
        <Rule ok={canCreate.goal} label="至少一項預期目標" />
        <Rule ok={state === "pass"} label="時間 ≤ 60 分（建議）" muted={!canCreate.goal} />
      </div>

      <button
        disabled={!canCreate.ok || creating}
        onClick={onCreate}
        className={`mt-6 w-full font-bold py-3 rounded-2xl transition-all duration-150 active:scale-[0.98]
          ${canCreate.ok && !creating ? "bg-mint-500 text-white shadow-glow hover:bg-mint-600" : "bg-navy-800/5 text-navy-300 cursor-not-allowed"}`}
      >
        {creating ? "建立中…" : canCreate.ok ? "🚀 建立會議看板" : "尚未通過守門條件"}
      </button>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-bold text-navy-700">{label}</label>
        {hint && <span className="text-[11px] text-navy-300">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const goalTags = ["#確定時程", "#決策方案", "#分配任務", "#資訊同步", "#腦力激盪"];

export default function CreateMeeting({ store, go }) {
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState([]);
  const [pains, setPains] = useState([]);
  const [goals, setGoals] = useState([]);
  const [links, setLinks] = useState([]);
  const [duration, setDuration] = useState(30);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const state = useMemo(() => {
    if (!goals.length) return "block";
    if (duration > 60) return "warn";
    return "pass";
  }, [goals, duration]);

  const canCreate = {
    title: title.trim().length > 0,
    goal: goals.length > 0,
    ok: title.trim().length > 0 && goals.length > 0,
  };

  const handleCreate = async () => {
    if (!canCreate.ok || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const id = await store.createMeeting({ title, participants, pains, goals, links, durationMin: duration });
      go("dashboard", id);
    } catch (e) {
      setCreateError(e.message || "建立會議失敗，請確認後端已啟動");
    } finally {
      setCreating(false);
    }
  };

  const addTagGoal = (t) => {
    if (!goals.includes(t)) setGoals([...goals, t]);
  };

  return (
    <div className="fade-in max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-black text-navy-800">發起會議</h1>
      <p className="text-navy-400 mt-1">先通過守門員，才配得上大家的時間。</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* 左：表單 */}
        <div className="bg-white border border-navy-800/8 rounded-3xl p-6 shadow-card space-y-5">
          <Field label="會議主題">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：Q3 產品上線範圍對焦"
              className="w-full rounded-2xl border border-navy-800/10 bg-white px-4 py-3 text-sm text-navy-800 placeholder-navy-300 focus:border-mint-400 focus:shadow-glow transition-all"
            />
          </Field>

          <Field label="與會者" hint="供會後 AI 指派負責人">
            <ListInput items={participants} setItems={setParticipants} placeholder="輸入姓名後按 Enter，例：Sam" />
          </Field>

          <Field label="① 要解決的痛點與問題" hint="逐條新增">
            <ListInput items={pains} setItems={setPains} ordered placeholder="輸入一個痛點後按 Enter…" accent="coral" />
          </Field>

          <Field label="② 預期目標 Expected Outcome" hint="逐條新增 · 放行關鍵">
            <ListInput items={goals} setItems={setGoals} ordered placeholder="輸入一個目標後按 Enter…" />
            <div className="flex flex-wrap gap-2 mt-2.5">
              {goalTags.map((t) => (
                <Tag key={t} active={goals.includes(t)} onClick={() => addTagGoal(t)}>{t}</Tag>
              ))}
            </div>
          </Field>

          <Field label="③ 會前必讀資料" hint="貼上連結後新增">
            <ListInput items={links} setItems={setLinks} placeholder="貼上連結，例：https://notion.so/…" />
          </Field>

          <Field label="④ 會議時間設定">
            <div className="relative">
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full rounded-2xl border border-navy-800/10 bg-white px-4 py-3 text-sm text-navy-800 appearance-none pr-10 focus:border-mint-400 focus:shadow-glow transition-all"
              >
                <option value={15}>15 分鐘 · 快速對齊</option>
                <option value={30}>30 分鐘 · 標準會議</option>
                <option value={45}>45 分鐘 · 深入討論</option>
                <option value={60}>60 分鐘 · 完整議程</option>
                <option value={90}>90 分鐘 · 工作坊（偏長）</option>
              </select>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-navy-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </div>
          </Field>
        </div>

        {/* 右：動態守門狀態 */}
        <div className="lg:sticky lg:top-24 self-start">
          <GateStatusCard state={state} canCreate={canCreate} onCreate={handleCreate} creating={creating} />
          {createError && <p className="mt-3 text-sm text-coral-500 text-center">{createError}</p>}
          <p className="text-center text-xs text-navy-300 mt-3">
            右側卡片會隨左側輸入即時變化：<span className="text-coral-400 font-semibold">阻擋</span> → <span className="text-coral-400 font-semibold">警告</span> → <span className="text-mint-600 font-semibold">通行</span>
          </p>
        </div>
      </div>
    </div>
  );
}

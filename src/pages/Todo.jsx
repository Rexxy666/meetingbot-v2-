import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import Avatar from "../components/Avatar.jsx";
import { getStoredUser } from "../lib/session.js";

const avatarColor = (name) => {
  const colors = ["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"];
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
};

const uid = () =>
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
  `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** 左滑過程中短暫露出的刪除提示寬度（放開後一律彈回，不吸附） */
const SWIPE_HINT_WIDTH = 72;

function personalStorageKey() {
  const user = getStoredUser();
  return `meetflow.todos.personal.${user?.id || "anon"}`;
}

function loadPersonalTodos() {
  try {
    const raw = localStorage.getItem(personalStorageKey());
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function savePersonalTodos(list) {
  try {
    localStorage.setItem(personalStorageKey(), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);
  return mobile;
}

function keyOf(item) {
  return `${item.type}-${item.id}`;
}

/**
 * 單一待辦列
 * ● 左側僅完成圓形 Checkbox
 * ● 右側多選框（+ 桌機垃圾桶）
 * ● 手機左滑超過 1/3 → 彈回原位並觸發確認 Modal
 * ● 完成：兩階段漸隱（completing / collapsing）
 */
function TodoRow({
  item,
  isMobile,
  completing,
  collapsing,
  selected,
  onToggleSelect,
  onToggle,
  onRequestDelete,
  go,
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const rowRef = useRef(null);
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    baseOffset: 0,
    axis: null,
    width: 320,
    active: false,
  });
  const offsetRef = useRef(0);

  const setOffset = (v) => {
    offsetRef.current = v;
    setOffsetX(v);
  };

  useEffect(() => {
    if (!isMobile) {
      setOffset(0);
      setDragging(false);
      touchRef.current.active = false;
    }
  }, [isMobile]);

  // 非 passive touchmove：橫滑時可 preventDefault，避免頁面跟著滾、手勢卡頓
  useEffect(() => {
    const el = rowRef.current;
    if (!el || !isMobile) return undefined;

    const onTouchMove = (e) => {
      const state = touchRef.current;
      if (!state.active) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;

      if (!state.axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        state.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }

      if (state.axis === "x") {
        e.preventDefault();
        e.stopPropagation();
        let next = state.baseOffset + dx;
        next = Math.min(0, Math.max(-SWIPE_HINT_WIDTH - 24, next));
        setOffset(next);
      }
    };

    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [isMobile]);

  const onTouchStart = (e) => {
    if (!isMobile) return;
    const t = e.touches[0];
    if (!t) return;
    touchRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      baseOffset: offsetRef.current,
      axis: null,
      width: e.currentTarget.offsetWidth || 320,
      active: true,
    };
    setDragging(true);
  };

  const finishSwipe = () => {
    if (!isMobile) return;
    const state = touchRef.current;
    if (!state.active) return;
    state.active = false;
    setDragging(false);

    if (state.axis !== "x") {
      state.axis = null;
      setOffset(0);
      return;
    }

    const threshold = (state.width || 320) / 3;
    const triggered = Math.abs(offsetRef.current) >= threshold;
    // 一律以 transition 彈回原位；達標則同一瞬間喚起確認 Modal
    state.axis = null;
    setOffset(0);
    if (triggered) {
      onRequestDelete(item);
    }
  };

  const selectControl = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect(item);
      }}
      aria-label={selected ? "取消選取刪除" : "選取以刪除"}
      aria-pressed={selected}
      className={`h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
        selected
          ? "bg-coral-500 border-coral-500 text-white"
          : "border-navy-800/15 bg-white hover:border-coral-300 dark:border-white/40 dark:bg-transparent dark:hover:border-coral-300"
      }`}
    >
      {selected && <Check className="h-3 w-3" strokeWidth={3.2} />}
    </button>
  );

  return (
    <div
      className={`group overflow-hidden transition-all duration-300 ease-in-out ${
        collapsing ? "max-h-0 opacity-0 my-0" : "max-h-40 mb-2"
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ${
          completing ? "opacity-40 transition-opacity duration-200" : item.completed ? "opacity-55" : ""
        } ${selected ? "ring-2 ring-coral-200 border-coral-100" : ""}`}
      >
        {isMobile && (
          <div
            className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 text-white"
            style={{ width: SWIPE_HINT_WIDTH }}
            aria-hidden
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
          </div>
        )}

        <div
          ref={rowRef}
          className={`relative z-[1] flex items-center gap-3 bg-white px-3.5 py-3 ${
            dragging ? "" : "transition-all duration-300 ease-out"
          }`}
          style={{
            transform: isMobile ? `translateX(${offsetX}px)` : undefined,
            touchAction: isMobile ? "pan-y" : undefined,
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={finishSwipe}
          onTouchCancel={finishSwipe}
        >
          {/* 左側：僅完成圓形 Checkbox */}
          <button
            type="button"
            onClick={() => onToggle(item)}
            aria-label={item.completed ? "標為未完成" : "標為完成"}
            className={`h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors duration-200 ${
              item.completed || completing
                ? "bg-teal-500 border-teal-500 text-white"
                : "border-navy-800/20 hover:border-teal-400 bg-white dark:border-white/40 dark:bg-transparent dark:hover:border-teal-400"
            }`}
          >
            <Check
              className={`h-3 w-3 transition-opacity duration-200 ${
                item.completed || completing ? "opacity-100" : "opacity-0"
              }`}
              strokeWidth={3.2}
            />
          </button>

          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-semibold text-navy-800 transition-all duration-200 ${
                item.completed || completing ? "line-through text-navy-400" : ""
              }`}
            >
              {item.text}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {item.type === "meeting" ? (
                <button
                  type="button"
                  onClick={() => go("post", item.meetingId)}
                  className="text-[11px] text-navy-400 hover:text-mint-600 transition-colors"
                >
                  來自會議：{item.meetingTitle}
                </button>
              ) : (
                <span className="text-[11px] text-navy-300">個人待辦</span>
              )}
            </div>
          </div>

          {item.who && (
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <Avatar name={item.who} color={avatarColor(item.who)} size="h-6 w-6" ring={false} />
              <span className="text-xs font-medium text-navy-600">{item.who}</span>
            </span>
          )}
          {item.when && (
            <span className="hidden sm:inline shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full bg-coral-50 text-coral-500 border border-coral-100">
              {item.when}
            </span>
          )}

          {/* 右側：多選框（+ 桌機垃圾桶） */}
          <div className="shrink-0 flex items-center gap-1.5">
            {selectControl}
            {!isMobile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete(item);
                }}
                aria-label="刪除待辦"
                className="p-1.5 rounded-lg text-gray-300 group-hover:text-gray-500 hover:!text-red-500 hover:scale-110 transition-all duration-150"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ title, busy, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xs bg-white/95 backdrop-blur-md rounded-3xl shadow-[0_20px_60px_rgba(15,27,45,0.18)] border border-white/50 p-6 fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto h-12 w-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
          <Trash2 className="h-5 w-5" strokeWidth={2} />
        </div>
        <p className="mt-4 text-center text-base font-bold text-navy-800">{title}</p>
        <p className="mt-1 text-center text-xs text-navy-400">此操作無法復原。</p>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 font-semibold py-2.5 rounded-2xl text-navy-600 border border-gray-100 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 font-bold py-2.5 rounded-2xl bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60 active:scale-[0.98]"
          >
            {busy ? "刪除中…" : "確定刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 待辦任務頁（TodoPage）
 * 純個人生產力：無 RBAC、右側多選、批量刪除動態浮現、左滑彈回確認、兩階段完成動畫
 */
export default function Todo({ meetings, store, go }) {
  const user = getStoredUser();
  const userId = user?.id || "anon";
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState("open");
  const [personal, setPersonal] = useState(() => loadPersonalTodos());
  const [draft, setDraft] = useState("");

  const [completingKeys, setCompletingKeys] = useState(() => new Set());
  const [collapsingKeys, setCollapsingKeys] = useState(() => new Set());
  const [selectedForDelete, setSelectedForDelete] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setPersonal(loadPersonalTodos());
  }, [userId]);

  useEffect(() => {
    savePersonalTodos(personal);
  }, [personal]);

  const meetingRows = useMemo(() => {
    const list = [];
    for (const m of meetings || []) {
      for (const a of m.actions || []) {
        list.push({
          id: a.id,
          text: a.task || a.text || a.title || "未命名待辦",
          completed: Boolean(a.done),
          type: "meeting",
          meetingId: m.id,
          meetingTitle: m.title,
          who: a.who,
          when: a.when,
        });
      }
    }
    return list;
  }, [meetings]);

  const personalRows = useMemo(
    () =>
      (personal || []).map((p) => ({
        id: p.id,
        text: p.text,
        completed: Boolean(p.completed),
        type: "personal",
        createdAt: p.createdAt,
      })),
    [personal]
  );

  const rows = useMemo(() => {
    const sortedPersonal = [...personalRows].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return [...sortedPersonal, ...meetingRows];
  }, [personalRows, meetingRows]);

  const openCount = rows.filter((r) => !r.completed).length;
  const doneCount = rows.filter((r) => r.completed).length;
  const shown = rows.filter((r) =>
    filter === "open" ? !r.completed : filter === "done" ? r.completed : true
  );

  const filters = [
    { id: "open", label: `待完成 (${openCount})` },
    { id: "done", label: `已完成 (${doneCount})` },
    { id: "all", label: `全部 (${rows.length})` },
  ];

  const addPersonal = () => {
    const text = draft.trim();
    if (!text) return;
    setPersonal((prev) => [{ id: uid(), text, completed: false, createdAt: Date.now() }, ...prev]);
    setDraft("");
  };

  const persistToggle = (item) => {
    if (item.type === "personal") {
      setPersonal((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, completed: !p.completed } : p))
      );
      return;
    }
    if (!item.meetingId) return;
    store.updateMeeting(item.meetingId, (m) => ({
      actions: (m.actions || []).map((a) => (a.id === item.id ? { ...a, done: !a.done } : a)),
    }));
  };

  const handleToggle = (item) => {
    const k = keyOf(item);
    if (item.completed || filter !== "open") {
      persistToggle(item);
      return;
    }
    setCompletingKeys((prev) => new Set(prev).add(k));
    window.setTimeout(() => {
      setCollapsingKeys((prev) => new Set(prev).add(k));
      window.setTimeout(() => {
        persistToggle(item);
        setSelectedForDelete((prev) => prev.filter((id) => id !== k));
        setCompletingKeys((prev) => {
          const n = new Set(prev);
          n.delete(k);
          return n;
        });
        setCollapsingKeys((prev) => {
          const n = new Set(prev);
          n.delete(k);
          return n;
        });
      }, 320);
    }, 300);
  };

  const toggleSelect = (item) => {
    const k = keyOf(item);
    setSelectedForDelete((prev) =>
      prev.includes(k) ? prev.filter((id) => id !== k) : [...prev, k]
    );
  };

  const requestDelete = (item) => {
    setPendingDelete({ mode: "single", item });
  };

  const requestBatchDelete = () => {
    if (selectedForDelete.length === 0) return;
    setPendingDelete({ mode: "batch", keys: [...selectedForDelete] });
  };

  const persistRemove = (item) => {
    if (item.type === "personal") {
      setPersonal((prev) => prev.filter((p) => p.id !== item.id));
      return;
    }
    if (!item.meetingId) return;
    store.updateMeeting(item.meetingId, (m) => ({
      actions: (m.actions || []).filter((a) => a.id !== item.id),
    }));
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const payload = pendingDelete;
    window.setTimeout(() => {
      if (payload.mode === "single" && payload.item) {
        persistRemove(payload.item);
        setSelectedForDelete((prev) => prev.filter((id) => id !== keyOf(payload.item)));
      } else if (payload.mode === "batch" && Array.isArray(payload.keys)) {
        const keySet = new Set(payload.keys);
        const targets = rows.filter((r) => keySet.has(keyOf(r)));
        const personalIds = new Set(
          targets.filter((t) => t.type === "personal").map((t) => t.id)
        );
        if (personalIds.size) {
          setPersonal((prev) => prev.filter((p) => !personalIds.has(p.id)));
        }
        const byMeeting = new Map();
        targets
          .filter((t) => t.type === "meeting" && t.meetingId)
          .forEach((t) => {
            if (!byMeeting.has(t.meetingId)) byMeeting.set(t.meetingId, new Set());
            byMeeting.get(t.meetingId).add(t.id);
          });
        byMeeting.forEach((ids, meetingId) => {
          store.updateMeeting(meetingId, (m) => ({
            actions: (m.actions || []).filter((a) => !ids.has(a.id)),
          }));
        });
        setSelectedForDelete([]);
      }
      setPendingDelete(null);
      setDeleting(false);
    }, 120);
  };

  const modalTitle =
    pendingDelete?.mode === "batch"
      ? `確定要刪除這 ${pendingDelete.keys?.length || 0} 項待辦事項嗎？`
      : "確定要刪除此待辦事項嗎？";

  return (
    <div className="fade-in max-w-4xl mx-auto px-4 py-6 md:px-6 md:py-8 pb-28 md:pb-8">
      <div>
        <h1 className="text-2xl font-black text-navy-800">待辦任務</h1>
        <p className="text-navy-400 mt-1 text-sm">
          {isMobile
            ? "左滑超過三分之一放開即彈回並確認刪除；右側可多選批量刪除。"
            : "右側勾選可批量刪除；垃圾桶點擊後會跳出確認視窗。"}
        </p>
      </div>

      <div className="mt-6 flex items-center gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`text-sm font-semibold px-4 py-2 rounded-xl border transition-colors ${
              filter === f.id
                ? "bg-navy-800 text-white border-navy-800"
                : "bg-white text-navy-500 border-gray-100 hover:border-mint-300"
            }`}
          >
            {f.label}
          </button>
        ))}

        {selectedForDelete.length > 0 && (
          <button
            type="button"
            onClick={requestBatchDelete}
            className="ml-auto fade-in inline-flex items-center gap-1.5 rounded-xl border border-coral-100 bg-coral-50/90 px-3 py-2 text-xs font-semibold text-coral-600 shadow-sm hover:bg-coral-100 transition-colors active:scale-[0.98]"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            刪除 ({selectedForDelete.length})
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addPersonal();
        }}
        className="mt-4 flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ 新增個人待辦任務…"
          className="min-w-0 flex-1 h-11 rounded-xl border border-gray-100 bg-white px-4 text-sm text-navy-800 placeholder:text-navy-300 shadow-sm focus:outline-none focus:border-mint-300 focus:ring-2 focus:ring-mint-100 transition-all"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="shrink-0 h-11 inline-flex items-center gap-1.5 px-4 rounded-xl bg-mint-500 text-white text-sm font-semibold shadow-sm hover:bg-mint-600 disabled:bg-navy-800/10 disabled:text-navy-300 transition-colors active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          新增
        </button>
      </form>

      {shown.length === 0 ? (
        <div className="mt-6 border border-dashed border-gray-200 rounded-3xl py-14 text-center bg-white/60">
          <p className="font-bold text-navy-700">
            {filter === "done" ? "還沒有已完成項目" : filter === "open" ? "還沒有待辦" : "清單是空的"}
          </p>
          <p className="text-sm text-navy-400 mt-1 px-6">
            {filter === "open"
              ? "在上方新增個人待辦，或結束會議後由筆記自動擷取。"
              : filter === "done"
              ? "完成項目後會出現在這裡。"
              : "新增一筆個人待辦開始吧。"}
          </p>
          {filter === "open" && (
            <button
              type="button"
              onClick={() => go("dashboard")}
              className="mt-4 text-mint-600 font-semibold text-sm hover:underline"
            >
              ← 回到會議看板
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {shown.map((item) => {
            const k = keyOf(item);
            return (
              <TodoRow
                key={k}
                item={item}
                isMobile={isMobile}
                completing={completingKeys.has(k)}
                collapsing={collapsingKeys.has(k)}
                selected={selectedForDelete.includes(k)}
                onToggleSelect={toggleSelect}
                onToggle={handleToggle}
                onRequestDelete={requestDelete}
                go={go}
              />
            );
          })}
        </div>
      )}

      {pendingDelete && (
        <DeleteConfirmModal
          title={modalTitle}
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

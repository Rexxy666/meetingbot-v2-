import { useCallback, useEffect, useRef, useState } from "react";

const fmt = (sec) => {
  const s = Math.max(0, sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

const CIRCLE = 56;
const EDGE_GAP = 8;
const TOP_SAFE = 72;

/**
 * 開會中全域浮動小視窗。
 * ● 展開態：可拖曳；放開後左右磁吸靠邊
 * ● 縮小態：倒數小圈圈，同樣可任意拖曳 + 磁吸貼邊
 */
export default function FloatingMeetingWidget({ meeting, show, agendaName, onReturn }) {
  const [minimized, setMinimized] = useState(true);
  const [pos, setPos] = useState(null);
  const [sec, setSec] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  const dragRef = useRef(null);
  const posRef = useRef(null);
  const movedRef = useRef(false);

  const panelW = isMobile ? 172 : 300;
  const panelH = isMobile ? 92 : 172;
  const boxW = minimized ? CIRCLE : panelW;
  const boxH = minimized ? CIRCLE : panelH;
  const total = meeting ? meeting.durationMin * 60 : 0;

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!meeting) return undefined;
    const calc = () =>
      meeting.startedAt
        ? Math.max(0, total - Math.floor((Date.now() - meeting.startedAt) / 1000))
        : total;
    setSec(calc());
    const id = setInterval(() => setSec(calc()), 1000);
    return () => clearInterval(id);
  }, [meeting?.id, meeting?.startedAt, total]);

  const clampPos = useCallback((x, y, w, h) => {
    const maxX = Math.max(EDGE_GAP, window.innerWidth - w - EDGE_GAP);
    const maxY = Math.max(TOP_SAFE, window.innerHeight - h - EDGE_GAP - (isMobile ? 88 : 16));
    return {
      x: Math.min(Math.max(EDGE_GAP, x), maxX),
      y: Math.min(Math.max(TOP_SAFE, y), maxY),
    };
  }, [isMobile]);

  const snapToEdge = useCallback(
    (current, w, h) => {
      if (!current || typeof window === "undefined") return current;
      const mid = current.x + w / 2;
      const snapLeft = EDGE_GAP;
      const snapRight = Math.max(EDGE_GAP, window.innerWidth - w - EDGE_GAP);
      const x = mid < window.innerWidth / 2 ? snapLeft : snapRight;
      return clampPos(x, current.y, w, h);
    },
    [clampPos]
  );

  // 首次顯示：預設右下角（縮小圈）
  useEffect(() => {
    if (!show || typeof window === "undefined") return;
    if (pos != null) return;
    const bottomGap = isMobile ? 104 : 28;
    const next = clampPos(
      window.innerWidth - CIRCLE - 16,
      window.innerHeight - CIRCLE - bottomGap,
      CIRCLE,
      CIRCLE
    );
    posRef.current = next;
    setPos(next);
  }, [show, pos, isMobile, clampPos]);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  const endDrag = useCallback(() => {
    const start = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!start) return;

    window.removeEventListener("pointermove", start.move);
    window.removeEventListener("pointerup", start.up);
    window.removeEventListener("pointercancel", start.up);

    const w = start.boxW;
    const h = start.boxH;
    const snapped = snapToEdge(posRef.current, w, h);
    posRef.current = snapped;
    setPos(snapped);

    // 幾乎沒移動 → 視為點擊：切換縮小／展開
    if (!movedRef.current && start.allowTapToggle) {
      setMinimized((m) => !m);
    }
  }, [snapToEdge]);

  const beginDrag = (e, { allowTapToggle = false } = {}) => {
    if (!posRef.current) return;
    // 只允許主鍵／單指
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const startPos = posRef.current;
    movedRef.current = false;
    const boxWNow = minimized ? CIRCLE : panelW;
    const boxHNow = minimized ? CIRCLE : panelH;

    const move = (ev) => {
      const dx = ev.clientX - e.clientX;
      const dy = ev.clientY - e.clientY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
      const next = clampPos(startPos.x + dx, startPos.y + dy, boxWNow, boxHNow);
      posRef.current = next;
      setPos(next);
    };
    const up = () => endDrag();

    dragRef.current = { move, up, boxW: boxWNow, boxH: boxHNow, allowTapToggle };
    setDragging(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // 尺寸切換後重新 clamp，避免超出螢幕
  useEffect(() => {
    if (!pos) return;
    const next = clampPos(pos.x, pos.y, boxW, boxH);
    if (next.x !== pos.x || next.y !== pos.y) {
      posRef.current = next;
      setPos(next);
    }
  }, [minimized, boxW, boxH]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!meeting || !show || !pos) return null;

  const low = sec <= 60 && sec > 0;
  const ended = sec === 0;
  const transitionCls = dragging ? "" : "transition-all duration-300 ease-out";

  // ── 縮小態：可拖曳倒數圈 + 磁吸靠邊 ───────────────────────────────
  if (minimized) {
    return (
      <button
        type="button"
        title="拖曳移動 · 點擊展開"
        onPointerDown={(e) => beginDrag(e, { allowTapToggle: true })}
        style={{ left: pos.x, top: pos.y, width: CIRCLE, height: CIRCLE }}
        className={`fixed z-[9999] rounded-full bg-white shadow-card-hover border border-navy-800/8 flex flex-col items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing ${transitionCls} ${
          dragging ? "scale-105 shadow-lg" : "hover:scale-105"
        }`}
      >
        <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-mint-400/35 animate-ping" />
        <span
          className={`relative text-[11px] font-black tabular-nums leading-none ${
            low ? "text-coral-500" : "text-navy-800"
          }`}
        >
          {fmt(sec)}
        </span>
        <span className="relative mt-0.5 text-[8px] font-bold text-mint-600 leading-none">會議中</span>
      </button>
    );
  }

  // ── 展開態（手機精簡 / 桌機完整）──────────────────────────────────
  return (
    <div
      style={{ left: pos.x, top: pos.y, width: panelW }}
      className={`fixed z-[9999] rounded-2xl md:rounded-3xl bg-white shadow-card-hover border border-navy-800/8 overflow-hidden fade-in select-none touch-none ${transitionCls}`}
    >
      <div
        onPointerDown={(e) => beginDrag(e, { allowTapToggle: false })}
        className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2.5 bg-navy-800 text-white cursor-grab active:cursor-grabbing"
      >
        <span className="h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-mint-300 animate-pulse" />
        <span className="text-[10px] md:text-xs font-bold tracking-wide">
          {isMobile ? "會議中" : "會議進行中"}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMinimized(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="縮小成圓點"
          className="ml-auto h-5 w-5 md:h-6 md:w-6 rounded-md md:rounded-lg flex items-center justify-center text-white/80 hover:bg-white/15"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      {isMobile ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold text-navy-300 leading-none">剩餘</p>
            <p
              className={`text-xl font-black tabular-nums leading-tight ${
                ended ? "text-navy-400" : low ? "text-coral-500" : "text-navy-800"
              }`}
            >
              {fmt(sec)}
            </p>
          </div>
          <button
            type="button"
            onClick={onReturn}
            title="返回會議室"
            className="ml-auto shrink-0 h-9 w-9 rounded-full bg-mint-500 hover:bg-mint-600 text-white flex items-center justify-center active:scale-95 transition-all"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={onReturn}
            className="w-full text-left px-4 pt-3.5 pb-2 hover:bg-mint-50/40 transition-colors block"
          >
            <p className="text-[11px] font-semibold text-navy-300 truncate">{meeting.title}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={`text-3xl font-black tabular-nums leading-none ${
                  ended ? "text-navy-400" : low ? "text-coral-500" : "text-navy-800"
                }`}
              >
                {fmt(sec)}
              </span>
              <span className="text-[11px] font-semibold text-navy-300">{ended ? "已到時" : "剩餘"}</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="shrink-0 text-[10px] font-bold text-mint-700 bg-mint-100 px-1.5 py-0.5 rounded-full">
                議程
              </span>
              <span className="text-xs font-semibold text-navy-600 truncate">
                {agendaName || meeting.goals?.[0] || "會議討論"}
              </span>
            </div>
          </button>
          <div className="px-4 pb-3.5 pt-1">
            <button
              type="button"
              onClick={onReturn}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-mint-500 hover:bg-mint-600 rounded-2xl py-2.5 transition-colors active:scale-[0.98]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
              返回會議室
            </button>
          </div>
        </>
      )}
    </div>
  );
}

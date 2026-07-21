import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

/**
 * 與會成員 `…` 選單
 * - React Portal → document.body，不受父層 overflow 裁切
 * - 預設 Dropup（向上）；空間不足時再智能翻轉
 */
export default function ParticipantItemMenu({
  member,
  canKick = false,
  isSelf = false,
  onDark = false,
  /** 側欄名單貼近螢幕底部，預設一律向上 */
  preferDropup = true,
  onProfile,
  onReport,
  onKick,
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);

  const placeMenu = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const gap = 6;
    const pad = 8;
    const menuH = menuRef.current?.offsetHeight || 128;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;

    const openUp =
      preferDropup ||
      spaceBelow < menuH + gap ||
      (spaceAbove > spaceBelow && spaceAbove >= menuH + gap);

    const right = Math.min(
      Math.max(pad, window.innerWidth - r.right),
      window.innerWidth - 160 - pad
    );

    if (openUp) {
      // fixed bottom：選單底邊在按鈕頂邊上方
      let bottom = window.innerHeight - r.top + gap;
      const topEdge = window.innerHeight - bottom - menuH;
      if (topEdge < pad) {
        bottom = Math.max(pad, window.innerHeight - menuH - pad);
      }
      setCoords({ placement: "up", bottom, top: undefined, right });
    } else {
      let top = r.bottom + gap;
      if (top + menuH > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - menuH - pad);
      }
      setCoords({ placement: "down", top, bottom: undefined, right });
    }
  }, [preferDropup]);

  useEffect(() => {
    if (!open || isSelf) {
      setCoords(null);
      return undefined;
    }
    placeMenu();
    const raf = requestAnimationFrame(placeMenu);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open, isSelf, placeMenu]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (isSelf) {
    return <div className="h-7 w-7 shrink-0" aria-hidden />;
  }

  const menu =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <button
          type="button"
          aria-label="關閉選單"
          className="fixed inset-0 z-[200] cursor-default bg-transparent"
          onClick={() => setOpen(false)}
        />
        <div
          ref={menuRef}
          role="menu"
          className={`fixed z-[210] w-40 rounded-xl border border-navy-800/10 bg-white py-1 shadow-xl ring-1 ring-navy-800/5 fade-in ${
            coords?.placement === "up" ? "origin-bottom-right" : "origin-top-right"
          }`}
          style={
            coords
              ? {
                  right: coords.right,
                  ...(coords.placement === "up"
                    ? { bottom: coords.bottom, top: "auto" }
                    : { top: coords.top, bottom: "auto" }),
                }
              : { visibility: "hidden", top: 0, right: 8 }
          }
        >
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-xs font-semibold text-navy-700 hover:bg-navy-800/[0.04] transition-colors"
            onClick={() => {
              setOpen(false);
              onProfile?.(member);
            }}
          >
            個人資訊
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full text-left px-3 py-2 text-xs font-semibold text-navy-700 hover:bg-navy-800/[0.04] transition-colors"
            onClick={() => {
              setOpen(false);
              onReport?.(member);
            }}
          >
            舉報成員
          </button>
          {canKick && (
            <button
              type="button"
              role="menuitem"
              className="w-full text-left px-3 py-2 text-xs font-semibold text-coral-500 hover:bg-coral-50 transition-colors"
              onClick={() => {
                setOpen(false);
                onKick?.(member);
              }}
            >
              踢除成員
            </button>
          )}
        </div>
      </>,
      document.body
    );

  return (
    <div className="relative shrink-0 h-7 w-7">
      <button
        ref={btnRef}
        type="button"
        aria-label="更多操作"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`h-7 w-7 inline-flex items-center justify-center rounded-lg transition-colors ${
          onDark
            ? "text-white/55 hover:text-white hover:bg-white/10"
            : "text-navy-400 hover:text-navy-700 hover:bg-navy-800/5"
        }`}
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2.2} />
      </button>
      {menu}
    </div>
  );
}

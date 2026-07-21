import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Lock, X } from "lucide-react";
import Avatar from "./Avatar.jsx";
import { normalizeAssignees } from "../lib/assignees.js";

const avatarColor = (name) => {
  const colors = ["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"];
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
};

/**
 * 多選負責人下拉（Checkbox + Tags + Avatar Stack）
 * - 點選項不會關閉選單，可連續勾選
 * - 點外部關閉
 */
export default function AssigneeMultiSelect({
  value,
  allPeople = [],
  selectablePeople = [],
  locked = false,
  onChange,
  hint,
  maxVisibleTags = 2,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = useMemo(() => normalizeAssignees(value), [value]);
  const selectableSet = useMemo(() => new Set(selectablePeople), [selectablePeople]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const emit = (next) => {
    onChange?.(normalizeAssignees(next));
  };

  const toggleName = (name) => {
    if (locked || !selectableSet.has(name)) return;
    if (selected.includes(name)) {
      emit(selected.filter((n) => n !== name));
    } else {
      emit([...selected, name]);
    }
  };

  const removeName = (name, e) => {
    e?.stopPropagation?.();
    if (locked) return;
    // 共編模式：只能拿掉自己；Host 嚴格模式可拿任何人
    if (!selectableSet.has(name) && selectablePeople.length > 0) return;
    emit(selected.filter((n) => n !== name));
  };

  const clearAll = () => {
    if (locked) return;
    // 共編：只清自己；Host：清空全部
    if (selectablePeople.length === 1 && selected.includes(selectablePeople[0])) {
      emit(selected.filter((n) => n !== selectablePeople[0]));
      return;
    }
    if (selectablePeople.length >= allPeople.length || selectablePeople.length > 1) {
      emit([]);
      return;
    }
    emit(selected.filter((n) => !selectableSet.has(n)));
  };

  const visibleTags = selected.slice(0, maxVisibleTags);
  const overflow = Math.max(0, selected.length - visibleTags.length);

  return (
    <div className="relative min-w-[12rem] max-w-[18rem]" ref={rootRef}>
      <button
        type="button"
        disabled={locked}
        title={hint || (selected.length ? selected.join("、") : "未認領")}
        onClick={() => {
          if (locked) return;
          setOpen((v) => !v);
        }}
        className={`w-full min-h-[2.25rem] flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left shadow-[0_1px_0_rgba(15,27,45,0.04)] transition-colors ${
          selected.length
            ? "border-mint-200/80 bg-gradient-to-b from-white to-mint-50/70 hover:border-mint-300"
            : "border-navy-800/10 bg-gradient-to-b from-white to-slate-50/80 hover:border-mint-300"
        } disabled:opacity-75 disabled:cursor-not-allowed disabled:hover:border-navy-800/10`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-multiselectable="true"
        aria-disabled={locked}
      >
        {selected.length === 0 ? (
          <span className="min-w-0 flex-1 text-xs font-semibold text-navy-400">未認領</span>
        ) : (
          <div className="min-w-0 flex-1 flex items-center gap-1 flex-wrap">
            {/* Avatar stack（精簡預覽） */}
            <div className="flex -space-x-1.5 shrink-0 mr-0.5">
              {selected.slice(0, 3).map((name) => (
                <span
                  key={`stack-${name}`}
                  className="relative"
                  title={name}
                >
                  <Avatar name={name} color={avatarColor(name)} size="h-6 w-6" ring={false} />
                </span>
              ))}
              {selected.length > 3 && (
                <span className="h-6 w-6 rounded-full bg-navy-800/10 text-[10px] font-bold text-navy-500 flex items-center justify-center ring-2 ring-white">
                  +{selected.length - 3}
                </span>
              )}
            </div>
            {/* Tags */}
            {visibleTags.map((name) => (
              <span
                key={`tag-${name}`}
                className="inline-flex items-center gap-1 max-w-[6.5rem] rounded-lg border border-mint-100 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-navy-700"
              >
                <span className="truncate">{name}</span>
                {!locked && (selectableSet.has(name) || selectablePeople.length > 1) && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`移除 ${name}`}
                    className="text-navy-300 hover:text-coral-500"
                    onClick={(e) => removeName(name, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") removeName(name, e);
                    }}
                  >
                    <X className="h-3 w-3" strokeWidth={2.4} />
                  </span>
                )}
              </span>
            ))}
            {overflow > 0 && (
              <span className="text-[10px] font-bold text-navy-400">+{overflow}</span>
            )}
          </div>
        )}
        {locked ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-navy-300" strokeWidth={2.2} />
        ) : (
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-navy-300 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            strokeWidth={2.2}
          />
        )}
      </button>

      {open && !locked && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-30 mt-1.5 w-full min-w-[14rem] max-h-64 overflow-auto rounded-xl border border-navy-800/10 bg-white py-1 shadow-[0_8px_24px_rgba(15,27,45,0.12)]"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-navy-800/6">
            <span className="text-[10px] font-bold text-navy-400 tracking-wide">
              已選 {selected.length} 人
            </span>
            <button
              type="button"
              className="text-[10px] font-semibold text-navy-400 hover:text-coral-500"
              onClick={clearAll}
            >
              清空／未認領
            </button>
          </div>

          {allPeople.map((name) => {
            const enabled = selectableSet.has(name);
            const checked = selected.includes(name);
            return (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={checked}
                disabled={!enabled}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  enabled ? "hover:bg-mint-50" : "opacity-60 cursor-not-allowed"
                } ${checked ? "bg-mint-50/70" : ""}`}
                onClick={() => toggleName(name)}
              >
                <span
                  className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                    checked
                      ? "bg-mint-500 border-mint-500 text-white"
                      : "border-navy-800/20 bg-white"
                  }`}
                >
                  {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <Avatar name={name} color={avatarColor(name)} size="h-6 w-6" ring={false} />
                <span className="text-xs font-semibold text-navy-700 truncate">{name}</span>
                {!enabled && (
                  <span className="ml-auto text-[10px] font-medium text-navy-300">不可選</span>
                )}
              </button>
            );
          })}

          {allPeople.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-navy-300">尚無可選成員</p>
          )}
        </div>
      )}
    </div>
  );
}

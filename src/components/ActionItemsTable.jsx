import { useEffect, useRef, useState } from "react";
import { Check, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import AssigneeMultiSelect from "./AssigneeMultiSelect.jsx";
import {
  formatAssigneesLabel,
  normalizeAssignees,
  withAssigneesFields,
} from "../lib/assignees.js";

function ActionSkeleton() {
  return (
    <div className="px-6 py-5 space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse rounded-md bg-gray-200/50" />
          <div className="h-4 flex-1 animate-pulse rounded-xl bg-gray-200/50" />
          <div className="h-8 w-28 animate-pulse rounded-xl bg-gray-200/50" />
        </div>
      ))}
    </div>
  );
}

/** Inline 編輯待辦文字 */
function TaskInlineEditor({ value, onSave, onCancel, autoFocus = true }) {
  const [draft, setDraft] = useState(value || "");
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [autoFocus]);

  const commit = () => {
    const next = draft.trim();
    if (!next) {
      onCancel?.();
      return;
    }
    if (next === String(value || "").trim()) {
      onCancel?.();
      return;
    }
    onSave?.(next);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel?.();
        }
      }}
      onBlur={commit}
      placeholder="輸入待辦內容…"
      className="w-full rounded-xl border border-mint-300 bg-white px-3 py-2 text-sm font-semibold text-navy-800 shadow-sm outline-none ring-2 ring-mint-100 placeholder:font-medium placeholder:text-navy-300"
    />
  );
}

/**
 * 待辦事項表格：完整 CRUD（新增／inline 編輯／刪除／完成切換）+ 多選負責人
 */
export default function ActionItemsTable({
  actions = [],
  loading = false,
  allPeople = [],
  selectablePeople = [],
  selectLocked = false,
  selectHint = "",
  canMutateTasks = true,
  onToggleDone,
  onClaim,
  onUpdateTask,
  onAdd,
  onDelete,
}) {
  const [copied, setCopied] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newAssignees, setNewAssignees] = useState([]);
  const [removingId, setRemovingId] = useState(null);
  const addInputRef = useRef(null);

  useEffect(() => {
    if (adding) {
      addInputRef.current?.focus();
    }
  }, [adding]);

  useEffect(() => {
    if (!confirmDeleteId) return undefined;
    const t = window.setTimeout(() => setConfirmDeleteId(null), 3200);
    return () => window.clearTimeout(t);
  }, [confirmDeleteId]);

  const copyItem = (a) => {
    const whoLabel = formatAssigneesLabel(a);
    const text = `[${a.done ? "x" : " "}] ${a.task}${whoLabel ? ` （負責：${whoLabel}` : ""}${
      a.when ? `${whoLabel ? "，" : " （"}截止：${a.when}` : ""
    }${whoLabel || a.when ? "）" : ""}`;
    navigator.clipboard?.writeText(text);
    setCopied(a.id);
    window.setTimeout(() => setCopied(null), 1400);
  };

  const startAdd = () => {
    if (!canMutateTasks) return;
    setAdding(true);
    setNewTask("");
    setNewAssignees([]);
    setEditingId(null);
    setConfirmDeleteId(null);
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewTask("");
    setNewAssignees([]);
  };

  const saveAdd = async () => {
    const task = newTask.trim();
    if (!task || !canMutateTasks) return;
    await onAdd?.({
      task,
      assignees: normalizeAssignees(newAssignees),
    });
    cancelAdd();
  };

  const handleDelete = async (id) => {
    if (!canMutateTasks) return;
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setRemovingId(id);
    setConfirmDeleteId(null);
    try {
      await onDelete?.(id);
    } finally {
      window.setTimeout(() => setRemovingId(null), 280);
    }
  };

  const count = actions.length;

  return (
    <div className="mt-8 bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-navy-800/6 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-black text-navy-800 flex items-center gap-2">
          <span className="text-mint-500">✓</span> 待辦事項 Action Items
          {!loading && (
            <span className="text-xs font-semibold text-navy-400 bg-navy-800/5 px-2 py-0.5 rounded-full tabular-nums">
              {count} 項
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <p className="text-[11px] text-navy-400">{selectHint}</p>
          {canMutateTasks && !loading && (
            <button
              type="button"
              onClick={startAdd}
              disabled={adding}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-mint-700 bg-mint-50 border border-mint-100 px-3 py-1.5 rounded-xl hover:bg-mint-100/80 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              新增待辦事項
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <ActionSkeleton />
      ) : (
        <>
          {count === 0 && !adding ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-navy-300">
                這次沒有可認領的待辦。可手動新增，或回到會議室補充筆記後再整理。
              </p>
              {canMutateTasks && (
                <button
                  type="button"
                  onClick={startAdd}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-mint-700 bg-mint-50 border border-mint-100 px-4 py-2 rounded-xl hover:bg-mint-100/80"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                  新增第一筆待辦
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-bold text-navy-400 bg-navy-800/[0.02]">
                    <th className="px-6 py-3 w-8" />
                    <th className="px-2 py-3">待辦內容</th>
                    <th className="px-4 py-3">負責人 Who</th>
                    <th className="px-4 py-3 text-right w-36">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => {
                    const isEditing = editingId === a.id;
                    const isRemoving = removingId === a.id;
                    return (
                      <tr
                        key={a.id}
                        className={`group border-t border-navy-800/6 transition-all duration-200 ${
                          a.done ? "opacity-55" : "hover:bg-mint-50/30"
                        } ${isRemoving ? "opacity-0 -translate-x-2" : "opacity-100"}`}
                      >
                        <td className="px-6 py-4 align-middle">
                          <button
                            type="button"
                            onClick={() => onToggleDone?.(a.id)}
                            aria-label={a.done ? "標示未完成" : "標示完成"}
                            aria-pressed={Boolean(a.done)}
                            className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${
                              a.done
                                ? "bg-mint-500 border-mint-500 text-white"
                                : "border-navy-800/20 hover:border-mint-400"
                            }`}
                          >
                            {a.done ? <Check className="h-3 w-3" strokeWidth={3.2} /> : null}
                          </button>
                        </td>
                        <td className="px-2 py-4 align-middle min-w-[12rem]">
                          {isEditing ? (
                            <TaskInlineEditor
                              value={a.task}
                              onSave={(task) => {
                                onUpdateTask?.(a.id, task);
                                setEditingId(null);
                              }}
                              onCancel={() => setEditingId(null)}
                            />
                          ) : (
                            <button
                              type="button"
                              disabled={!canMutateTasks || a.done}
                              onClick={() => {
                                if (!canMutateTasks || a.done) return;
                                setEditingId(a.id);
                                setConfirmDeleteId(null);
                              }}
                              title={
                                canMutateTasks && !a.done
                                  ? "點擊編輯"
                                  : a.done
                                  ? "已完成項目請先取消完成再編輯"
                                  : undefined
                              }
                              className={`w-full text-left font-semibold rounded-lg px-1 -mx-1 py-0.5 transition-colors ${
                                a.done
                                  ? "text-navy-400 line-through cursor-default"
                                  : canMutateTasks
                                  ? "text-navy-800 hover:bg-mint-50/80 cursor-text"
                                  : "text-navy-800 cursor-default"
                              }`}
                            >
                              {a.task}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4 align-middle">
                          <AssigneeMultiSelect
                            value={normalizeAssignees(a)}
                            allPeople={allPeople}
                            selectablePeople={selectablePeople}
                            locked={selectLocked || a.done}
                            hint={a.done ? "已完成項目不可改認領" : selectHint}
                            onChange={(assignees) => onClaim?.(a.id, assignees)}
                          />
                        </td>
                        <td className="px-4 py-4 align-middle text-right">
                          <div className="inline-flex items-center justify-end gap-1 sm:opacity-70 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              title="複製"
                              onClick={() => copyItem(a)}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                                copied === a.id
                                  ? "border-mint-300 text-mint-600 bg-mint-50"
                                  : "border-navy-800/10 text-navy-500 hover:border-mint-300 hover:text-mint-600"
                              }`}
                            >
                              <Copy className="h-3.5 w-3.5" strokeWidth={2.2} />
                            </button>
                            {canMutateTasks && (
                              <>
                                <button
                                  type="button"
                                  title="編輯"
                                  disabled={a.done || isEditing}
                                  onClick={() => {
                                    setEditingId(a.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-navy-800/10 text-navy-500 hover:border-mint-300 hover:text-mint-600 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                                >
                                  <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                                </button>
                                <button
                                  type="button"
                                  title={
                                    confirmDeleteId === a.id ? "再按一次確定刪除" : "刪除"
                                  }
                                  onClick={() => handleDelete(a.id)}
                                  className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg border px-2 transition-colors ${
                                    confirmDeleteId === a.id
                                      ? "border-coral-300 bg-coral-50 text-coral-600 min-w-[4.5rem] text-[10px] font-bold"
                                      : "border-navy-800/10 text-navy-500 hover:border-coral-300 hover:text-coral-500 w-8"
                                  }`}
                                >
                                  {confirmDeleteId === a.id ? (
                                    "確定刪除？"
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {adding && (
                    <tr className="border-t border-mint-100 bg-mint-50/40">
                      <td className="px-6 py-4">
                        <span className="h-5 w-5 rounded-md border border-dashed border-navy-800/20 block" />
                      </td>
                      <td className="px-2 py-4">
                        <input
                          ref={addInputRef}
                          type="text"
                          value={newTask}
                          onChange={(e) => setNewTask(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveAdd();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelAdd();
                            }
                          }}
                          placeholder="輸入新待辦內容，Enter 儲存…"
                          className="w-full rounded-xl border border-mint-300 bg-white px-3 py-2 text-sm font-semibold text-navy-800 shadow-sm outline-none ring-2 ring-mint-100 placeholder:font-medium placeholder:text-navy-300"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <AssigneeMultiSelect
                          value={newAssignees}
                          allPeople={allPeople}
                          selectablePeople={selectablePeople}
                          locked={selectLocked}
                          hint={selectHint}
                          onChange={setNewAssignees}
                        />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={cancelAdd}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-navy-800/10 text-navy-400 hover:bg-white"
                            title="取消"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                          </button>
                          <button
                            type="button"
                            onClick={saveAdd}
                            disabled={!newTask.trim()}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-mint-500 px-3 text-[11px] font-bold text-white hover:bg-mint-600 disabled:opacity-40"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                            儲存
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {canMutateTasks && count > 0 && !adding && (
            <div className="border-t border-navy-800/6 px-6 py-3">
              <button
                type="button"
                onClick={startAdd}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-navy-500 hover:text-mint-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                新增待辦事項
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}


/**
 * Action Item 負責人：向後相容 who（字串）與 assignees（字串陣列）
 */

export function normalizeAssignees(actionOrWho) {
  if (Array.isArray(actionOrWho)) {
    return [...new Set(actionOrWho.map((n) => String(n || "").trim()).filter(Boolean))];
  }
  if (actionOrWho && typeof actionOrWho === "object") {
    if (Array.isArray(actionOrWho.assignees)) {
      return normalizeAssignees(actionOrWho.assignees);
    }
    const who = String(actionOrWho.who || "").trim();
    return who ? [who] : [];
  }
  const who = String(actionOrWho || "").trim();
  return who ? [who] : [];
}

/** 寫回時同時保留 who（第一位）以相容舊 UI／API */
export function withAssigneesFields(assignees) {
  const list = normalizeAssignees(assignees);
  return {
    assignees: list,
    who: list[0] || "",
  };
}

export function formatAssigneesLabel(assignees) {
  const list = normalizeAssignees(assignees);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]}、${list[1]}`;
  return `${list[0]} 等 ${list.length} 人`;
}

export function hasAssignees(action) {
  return normalizeAssignees(action).length > 0;
}

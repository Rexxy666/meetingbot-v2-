/**
 * 會議授權：全部以伺服器上的 meeting + JWT user 裁決，不信任前端角色／票數／reporterKey。
 */

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function rbacOf(meeting) {
  return meeting?.rbac && typeof meeting.rbac === "object" ? meeting.rbac : {};
}

function listField(meeting, key) {
  const rbac = rbacOf(meeting);
  if (Array.isArray(rbac[key])) return rbac[key];
  if (Array.isArray(meeting?.[key])) return meeting[key];
  return [];
}

/** ACL 名單比對：支援 userId 或顯示名稱（相容舊資料） */
export function aclIncludes(list, user) {
  const id = String(user?.id || "");
  const name = norm(user?.name);
  return (list || []).some((entry) => {
    const e = String(entry || "").trim();
    if (!e) return false;
    if (id && e === id) return true;
    return name && norm(e) === name;
  });
}

export function isMeetingOwner(meeting, userId) {
  return Boolean(meeting && userId && meeting.ownerId === userId);
}

export function isMeetingMember(meeting, userId) {
  if (!meeting || !userId) return false;
  if (meeting.ownerId === userId) return true;
  return (meeting.memberIds || []).includes(userId);
}

export function canEditNotes(meeting, user) {
  if (!meeting || !user?.id) return false;
  if (isMeetingOwner(meeting, user.id)) return true;
  return aclIncludes(listField(meeting, "allowedEditors"), user);
}

export function canEndMeeting(meeting, user) {
  if (!meeting || !user?.id) return false;
  if (isMeetingOwner(meeting, user.id)) return true;
  const rbac = rbacOf(meeting);
  const rule = rbac.endMeetingRule || meeting.endMeetingRule || "host_only";
  if (rule === "anyone") return isMeetingMember(meeting, user.id);
  if (rule === "restricted") {
    return aclIncludes(listField(meeting, "allowedEndMeetingUsers"), user);
  }
  return false;
}

export function canKickMember(meeting, user, { democraticOk = false } = {}) {
  if (!meeting || !user?.id) return false;
  if (democraticOk) return isMeetingMember(meeting, user.id);
  if (isMeetingOwner(meeting, user.id)) return true;
  const rbac = rbacOf(meeting);
  const kickEnabled = Boolean(
    rbac.isKickPermissionEnabled ?? meeting.isKickPermissionEnabled
  );
  if (!kickEnabled) return false;
  return aclIncludes(listField(meeting, "allowedKickers"), user);
}

export function computeDemocraticKick(meeting, targetUserId, targetName) {
  const tKey = targetUserId
    ? `id:${targetUserId}`
    : `name:${norm(targetName)}`;
  if (!tKey || tKey === "name:") return { ok: false, ratio: 0, tKey, votes: 0 };
  const reports =
    meeting.memberReports && typeof meeting.memberReports === "object"
      ? meeting.memberReports
      : {};
  const votes = Array.isArray(reports[tKey]) ? reports[tKey].length : 0;
  const rosterSize = Math.max(
    (meeting.inviteRoster || []).length,
    (meeting.attendees || []).length,
    (meeting.participants || []).length,
    (meeting.memberIds || []).length + (meeting.ownerId ? 1 : 0),
    1
  );
  const ratio = votes / rosterSize;
  return { ok: ratio > 0.6, ratio, tKey, votes, rosterSize };
}

/** 擁有者才能寫的控制面欄位 */
const OWNER_ONLY_KEYS = new Set([
  "rbac",
  "allowedEditors",
  "allowedKickers",
  "allowedEndMeetingUsers",
  "endMeetingRule",
  "isKickPermissionEnabled",
  "isHostAssignmentEnabled",
  "isEditRestricted",
  "code",
  "title",
  "scenario",
  "scenarioLabel",
  "scenarioEmoji",
  "extra",
  "durationMin",
  "pains",
  "goals",
  "links",
  "ownerName",
]);

/** 結束會議相關（需 canEndMeeting） */
const END_KEYS = new Set(["status", "meetingStatus", "endedAt"]);

/** 內容欄位：需 canEditNotes；結束時允許一併寫入 transcript / notes */
const EDIT_KEYS = new Set([
  "notes",
  "topicNotes",
  "transcript",
  "transcriptText",
  "aiSource",
  "startedAt",
]);

/** 名冊同步：任一會議成員可更新（加入狀態） */
const ROSTER_KEYS = new Set(["inviteRoster", "attendees", "participants"]);

/** 會後整理／認領：成員可寫 */
const SUMMARY_KEYS = new Set(["review", "actions"]);

/**
 * 依伺服器裁決過濾 PATCH。永遠丟棄 id / ownerId / memberIds / memberReports。
 */
export function filterTrustedMeetingPatch(rawPatch, meeting, user) {
  const isOwner = isMeetingOwner(meeting, user.id);
  const canEdit = canEditNotes(meeting, user);
  const canEnd = canEndMeeting(meeting, user);
  const isMember = isMeetingMember(meeting, user.id);

  const out = {};
  for (const [key, value] of Object.entries(rawPatch || {})) {
    if (value === undefined) continue;
    if (["id", "ownerId", "memberIds", "memberReports", "createdAt"].includes(key)) {
      continue;
    }
    if (OWNER_ONLY_KEYS.has(key)) {
      if (isOwner) out[key] = value;
      continue;
    }
    if (END_KEYS.has(key)) {
      if (canEnd) out[key] = value;
      continue;
    }
    if (EDIT_KEYS.has(key)) {
      if (
        canEdit ||
        (canEnd && ["notes", "topicNotes", "transcript", "transcriptText", "aiSource"].includes(key))
      ) {
        out[key] = value;
      }
      continue;
    }
    if (ROSTER_KEYS.has(key)) {
      if (isMember) out[key] = value;
      continue;
    }
    if (SUMMARY_KEYS.has(key)) {
      if (isMember) out[key] = value;
      continue;
    }
    // 未知欄位：丟棄
  }

  // 結束會議時正規化狀態
  if (out.status === "done" || out.meetingStatus === "ended") {
    if (!canEnd) {
      delete out.status;
      delete out.meetingStatus;
      delete out.endedAt;
    } else {
      out.status = "done";
      out.meetingStatus = "ended";
      if (out.endedAt == null) out.endedAt = Date.now();
    }
  }

  // 合併 rbac 時保留 server 既有結構，僅允許 owner 覆寫已驗證欄位
  if (out.rbac && typeof out.rbac === "object" && isOwner) {
    out.rbac = {
      ...rbacOf(meeting),
      ...out.rbac,
      // 禁止透過 rbac 竄改會議結束狀態以外的成員名單
    };
    delete out.rbac.memberIds;
    delete out.rbac.ownerId;
  }

  return out;
}

export function reporterKeyFor(user) {
  return `id:${user.id}`;
}

export function targetKeyFor(targetUserId, targetName) {
  if (targetUserId) return `id:${targetUserId}`;
  const n = norm(targetName);
  return n ? `name:${n}` : "";
}

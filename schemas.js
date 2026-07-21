import { z } from "zod";

/** Zod 驗證失敗 → 帶 status 400 的 Error */
export function parseOrThrow(schema, data, label = "請求資料") {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const issues = result.error.issues.map((i) => {
    const path = i.path.length ? i.path.join(".") : "(root)";
    return `${path}: ${i.message}`;
  });
  const err = new Error(`${label}驗證失敗：${issues.slice(0, 6).join("；")}`);
  err.status = 400;
  err.issues = result.error.issues;
  throw err;
}

/** Express middleware：驗證並覆寫 req.body（未知欄位剝除） */
export function validateBody(schema, label) {
  return (req, _res, next) => {
    try {
      req.body = parseOrThrow(schema, req.body, label);
      next();
    } catch (e) {
      next(e);
    }
  };
}

const nonEmpty = (max) => z.string().trim().min(1).max(max);
const optStr = (max) => z.string().max(max).optional();

export const registerSchema = z
  .object({
    email: z.string().trim().email().max(200),
    password: z.string().min(6).max(128),
    name: nonEmpty(80),
  })
  .strip();

export const loginSchema = z
  .object({
    email: z.string().trim().email().max(200),
    password: z.string().min(1).max(128),
  })
  .strip();

export const profileSchema = z
  .object({
    name: nonEmpty(80),
  })
  .strip();

export const summarizeSchema = z
  .object({
    notes: z.string().max(500_000).default(""),
    participants: z.array(z.string().max(80)).max(100).default([]),
    title: z.string().max(200).default(""),
    mode: z.enum(["student", "enterprise"]).default("enterprise"),
  })
  .strip();

/** 會中靜音 AI 問答（語音入、文字出；禁止 TTS） */
export const liveAskSchema = z
  .object({
    question: z.string().min(1).max(2000),
    meetingTranscript: z.string().max(80_000).default(""),
    title: z.string().max(200).default(""),
    topic: z.string().max(200).default(""),
    mode: z.enum(["student", "enterprise"]).default("enterprise"),
  })
  .strip();

const attendeeSchema = z
  .object({
    id: z.string().max(80).nullable().optional(),
    name: z.string().max(80),
    email: z.string().max(200).optional().default(""),
    status: z.enum(["joined", "inviting"]).optional(),
  })
  .strip();

export const createMeetingSchema = z
  .object({
    title: nonEmpty(200),
    scenario: optStr(80),
    scenarioLabel: optStr(120),
    scenarioEmoji: optStr(16),
    extra: z.record(z.unknown()).optional(),
    attendees: z.array(z.union([z.string().max(80), attendeeSchema])).max(100).optional(),
    participants: z.array(z.union([z.string().max(80), attendeeSchema])).max(100).optional(),
    pains: z.array(z.string().max(500)).max(50).optional(),
    goals: z.array(z.string().max(500)).max(50).optional(),
    links: z.array(z.string().max(2000)).max(50).optional(),
    durationMin: z.coerce.number().int().min(1).max(480).optional(),
    inviteRoster: z.array(attendeeSchema).max(100).optional(),
    rbac: z.record(z.unknown()).optional(),
    isEditRestricted: z.boolean().optional(),
    isHostAssignmentEnabled: z.boolean().optional(),
    isKickPermissionEnabled: z.boolean().optional(),
    allowedEditors: z.array(z.string().max(80)).max(100).optional(),
    allowedKickers: z.array(z.string().max(80)).max(100).optional(),
    allowedEndMeetingUsers: z.array(z.string().max(80)).max(100).optional(),
    endMeetingRule: z.enum(["anyone", "host_only", "restricted"]).optional(),
    ownerName: optStr(80),
  })
  .strip();

const transcriptRowSchema = z
  .object({
    id: optStr(120),
    time: optStr(16),
    speaker: optStr(80),
    name: optStr(80),
    text: z.string().max(8000),
    at: optStr(32),
  })
  .strip();

/** 原始 PATCH 輸入（再依權限過濾）；未知欄位剝除，永不信任前端多送的 id/ownerId 等 */
export const meetingPatchInputSchema = z
  .object({
    title: optStr(200),
    notes: z.string().max(500_000).optional(),
    topicNotes: z.record(z.string().max(200_000)).optional(),
    transcript: z.array(transcriptRowSchema).max(500).optional(),
    transcriptText: z.string().max(1_000_000).optional(),
    aiSource: z.enum(["transcript", "notes"]).optional(),
    review: z.unknown().optional(),
    actions: z.array(z.unknown()).max(200).optional(),
    inviteRoster: z.array(attendeeSchema).max(100).optional(),
    attendees: z.array(attendeeSchema).max(100).optional(),
    participants: z.array(z.string().max(80)).max(100).optional(),
    pains: z.array(z.string().max(500)).max(50).optional(),
    goals: z.array(z.string().max(500)).max(50).optional(),
    links: z.array(z.string().max(2000)).max(50).optional(),
    durationMin: z.coerce.number().int().min(1).max(480).optional(),
    status: z.enum(["ready", "live", "done"]).optional(),
    meetingStatus: z.enum(["in_progress", "ended"]).optional(),
    startedAt: z.number().finite().optional().nullable(),
    endedAt: z.number().finite().optional().nullable(),
    ownerName: optStr(80),
    scenario: optStr(80),
    scenarioLabel: optStr(120),
    scenarioEmoji: optStr(16),
    extra: z.record(z.unknown()).optional(),
    rbac: z.record(z.unknown()).optional(),
    allowedEditors: z.array(z.string().max(80)).max(100).optional(),
    allowedKickers: z.array(z.string().max(80)).max(100).optional(),
    allowedEndMeetingUsers: z.array(z.string().max(80)).max(100).optional(),
    endMeetingRule: z.enum(["anyone", "host_only", "restricted"]).optional(),
    isKickPermissionEnabled: z.boolean().optional(),
    isHostAssignmentEnabled: z.boolean().optional(),
    isEditRestricted: z.boolean().optional(),
    code: z.string().regex(/^\d{6}$/).optional(),
  })
  .strip();

export const toUserIdSchema = z
  .object({
    toUserId: nonEmpty(80),
  })
  .strip();

export const respondSchema = z
  .object({
    accept: z.boolean(),
  })
  .strip();

export const searchQuerySchema = z
  .object({
    q: z.string().max(80).default(""),
  })
  .strip();

export const joinMeetingSocketSchema = z
  .object({
    meetingId: nonEmpty(80),
    userName: optStr(80),
  })
  .strip();

export const notesUpdateSchema = z
  .object({
    meetingId: nonEmpty(80),
    topicNotes: z.record(z.string().max(200_000)).optional(),
    topic: optStr(200),
    content: z.string().max(200_000).optional(),
  })
  .strip();

export const agendaSelectSchema = z
  .object({
    meetingId: nonEmpty(80),
    agendaIdx: z.coerce.number().int().min(0).max(100),
  })
  .strip();

export const typingSchema = z
  .object({
    meetingId: nonEmpty(80),
    topic: optStr(200),
  })
  .strip();

export const inviteUserSocketSchema = z
  .object({
    meetingId: nonEmpty(80),
    toUserId: nonEmpty(80),
  })
  .strip();

export const meetingPatchSocketSchema = z
  .object({
    meetingId: nonEmpty(80),
    patch: meetingPatchInputSchema,
  })
  .strip();

export const meetingKickSchema = z
  .object({
    meetingId: nonEmpty(80),
    targetUserId: z.string().max(80).nullable().optional(),
    targetName: optStr(80),
    reason: z.enum(["host", "report"]).optional(),
  })
  .strip();

export const meetingReportSchema = z
  .object({
    meetingId: nonEmpty(80),
    targetUserId: z.string().max(80).nullable().optional(),
    targetName: optStr(80),
    reason: optStr(40),
  })
  .strip();

export const idParamSchema = z.string().trim().min(1).max(80);

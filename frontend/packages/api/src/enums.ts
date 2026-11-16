export const REPORT_REASONS = ["wrongAnswerKey", "unreadable", "incomplete", "inappropriate", "spam", "other"] as const;
export type ReportReasonValue = (typeof REPORT_REASONS)[number];

const reportReasonLabels: Record<ReportReasonValue, string> = {
  wrongAnswerKey: "Cevap anahtarı yanlış",
  unreadable: "Okunaksız",
  incomplete: "Eksik soru",
  inappropriate: "Uygunsuz içerik",
  spam: "Gereksiz içerik",
  other: "Diğer",
};

export function reportReasonLabel(value: string): string {
  return reportReasonLabels[value as ReportReasonValue] ?? "Diğer";
}

export function reportReasonsFor(target: "question" | "solution" | "comment"): ReportReasonValue[] {
  if (target === "question") return [...REPORT_REASONS];
  if (target === "solution") return ["unreadable", "incomplete", "inappropriate", "spam", "other"];
  return ["inappropriate", "spam", "other"];
}

const sourceLabels: Record<string, string> = {
  teacher: "Öğretmen",
  student: "Öğrenci",
  ai: "Yapay zekâ",
};

export function questionSourceLabel(value: string): string {
  return sourceLabels[value] ?? "Bilinmiyor";
}

const solutionTypeLabels: Record<string, string> = {
  teacher: "Öğretmen çözümü",
  student: "Öğrenci çözümü",
  ai: "Yapay zekâ çözümü",
};

export function solutionTypeLabel(value: string): string {
  return solutionTypeLabels[value] ?? "Çözüm";
}

export type AiSolutionStateValue = "none" | "available" | "underReview" | "removed" | "unavailable" | "unreadable";

const aiStates: AiSolutionStateValue[] = ["none", "available", "underReview", "removed", "unavailable", "unreadable"];

export function normalizeAiState(value: string | null | undefined): AiSolutionStateValue {
  return aiStates.includes(value as AiSolutionStateValue) ? (value as AiSolutionStateValue) : "none";
}

const aiStateLabels: Record<AiSolutionStateValue, string> = {
  none: "Henüz istenmedi",
  available: "Hazır",
  underReview: "İnceleniyor",
  removed: "Kaldırıldı",
  unavailable: "Şu an ulaşılamıyor",
  unreadable: "Görsel okunamadı",
};

export function aiSolutionStateLabel(value: string | null | undefined): string {
  return aiStateLabels[normalizeAiState(value)];
}

const notificationLabels: Record<string, string> = {
  studentSolution: "Yeni öğrenci çözümü",
  teacherSolution: "Yeni öğretmen çözümü",
  answerDisputed: "Cevap anahtarı tartışmalı",
  commentReply: "Yorumuna yanıt geldi",
  commentOnQuestion: "Sorunda yeni yorum",
  commentOnSolution: "Çözümünde yeni yorum",
  questionsPublished: "Yeni sorular yayında",
  assignmentOpened: "Yeni ödev",
  assignmentClosed: "Ödev kapandı",
  generationReport: "Soru üretim raporu",
  reportResolved: "Şikâyetin incelendi",
  commentRemoved: "Yorumun kaldırıldı",
  answerKeyChanged: "Cevap anahtarı değişti",
};

export function notificationTypeLabel(value: string): string {
  return notificationLabels[value] ?? "Bildirim";
}

export interface NotificationTarget {
  questionId?: number | null;
  assignmentId?: number | null;
  commentId?: number | null;
}

export interface NotificationHrefContext {
  type?: string;
  role?: string;
}

export function notificationHref(target: NotificationTarget, context: NotificationHrefContext = {}): string | null {
  const moderator = context.role === "ogretmen" || context.role === "mudur";
  if (context.type === "answerDisputed" && moderator && target.questionId) {
    return `/ogretmen/supheli-anahtarlar/${target.questionId}`;
  }
  if (target.commentId) return `/yorumlar/${target.commentId}`;
  if (target.questionId) return `/sorular/${target.questionId}`;
  if (target.assignmentId) return "/odevler";
  return null;
}

const lessonSessionLabels: Record<string, string> = {
  sozel: "Sözel",
  sayisal: "Sayısal",
};

export function lessonSessionLabel(value: string): string {
  return lessonSessionLabels[value] ?? "";
}

export function editLockedMessage(reason: string | null | undefined): string | null {
  if (!reason) return null;
  if (reason === "pendingReport") {
    return "Bu çözüm hakkında incelenen bir şikâyet var; inceleme bitene kadar düzenlenemez.";
  }
  return "Bu çözüm şu an düzenlenemez.";
}

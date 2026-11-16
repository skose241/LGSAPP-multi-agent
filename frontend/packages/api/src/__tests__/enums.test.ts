import { describe, expect, it } from "vitest";
import {
  aiSolutionStateLabel,
  editLockedMessage,
  normalizeAiState,
  notificationHref,
  notificationTypeLabel,
  questionSourceLabel,
  reportReasonLabel,
  reportReasonsFor,
} from "../enums";

describe("enum etiketleri", () => {
  it("bilinmeyen değerlerde güvenli varsayılan döner", () => {
    expect(reportReasonLabel("yeniBirNeden")).toBe("Diğer");
    expect(notificationTypeLabel("yeniTur")).toBe("Bildirim");
    expect(questionSourceLabel("yeni")).toBe("Bilinmiyor");
  });

  it("bilinmeyen AI durumu none olur", () => {
    expect(normalizeAiState("garip")).toBe("none");
    expect(normalizeAiState(null)).toBe("none");
    expect(normalizeAiState("underReview")).toBe("underReview");
    expect(aiSolutionStateLabel("available")).toBe("Hazır");
  });

  it("şikâyet nedenleri hedefe göre değişir", () => {
    expect(reportReasonsFor("question")).toContain("wrongAnswerKey");
    expect(reportReasonsFor("comment")).not.toContain("wrongAnswerKey");
    expect(reportReasonsFor("solution")).toEqual(["unreadable", "incomplete", "inappropriate", "spam", "other"]);
    expect(reportReasonsFor("comment")).toEqual(["inappropriate", "spam", "other"]);
  });

  it("bildirim bağlantısı yorum, soru ve ödevi ayırır", () => {
    expect(notificationHref({ commentId: 4, questionId: 2 })).toBe("/yorumlar/4");
    expect(notificationHref({ questionId: 2 })).toBe("/sorular/2");
    expect(notificationHref({ assignmentId: 1 })).toBe("/odevler");
    expect(notificationHref({})).toBeNull();
  });

  it("düzenleme kilidi nedenini çevirir", () => {
    expect(editLockedMessage(null)).toBeNull();
    expect(editLockedMessage("pendingReport")).toContain("incelenen bir şikâyet");
    expect(editLockedMessage("baska")).toContain("düzenlenemez");
  });
});

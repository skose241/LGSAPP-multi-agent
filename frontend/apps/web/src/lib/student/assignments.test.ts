import { describe, expect, it } from "vitest";
import { assignmentQuestionHref, nextUnanswered, parseAssignmentBack, parseStudentAssignmentFilters, questionProgress, studentAssignmentFiltersToSearch } from "./assignments";

describe("öğrenci ödev URL durumu", () => {
  it("varsayılan açık sekme boş sorgu üretir", () => {
    expect(studentAssignmentFiltersToSearch({ tab: "open", page: 1 })).toBe("");
    expect(parseStudentAssignmentFilters(new URLSearchParams(""))).toEqual({ tab: "open", lessonId: undefined, page: 1 });
  });

  it("kapanmış sekme, ders ve sayfayı gidiş dönüş korur", () => {
    const search = studentAssignmentFiltersToSearch({ tab: "closed", lessonId: 3, page: 2 });
    expect(search).toBe("?durum=kapandi&ders=3&sayfa=2");
    expect(parseStudentAssignmentFilters(new URLSearchParams(search))).toEqual({ tab: "closed", lessonId: 3, page: 2 });
  });
});

describe("öğrenci ödev soruları", () => {
  it("ilerleme durumunu cevaba göre belirler", () => {
    expect(questionProgress({ myAnswer: { isCorrect: true }, canAnswer: false })).toBe("correct");
    expect(questionProgress({ myAnswer: { isCorrect: false }, canAnswer: false })).toBe("wrong");
    expect(questionProgress({ myAnswer: null, canAnswer: true })).toBe("pending");
    expect(questionProgress({ myAnswer: null, canAnswer: false })).toBe("locked");
  });

  it("sıradaki çözülmemiş cevaplanabilir soruyu bulur", () => {
    const questions = [
      { id: 1, myAnswer: { isCorrect: true }, canAnswer: false },
      { id: 2, myAnswer: null, canAnswer: false },
      { id: 3, myAnswer: null, canAnswer: true },
    ];
    expect(nextUnanswered(questions)?.id).toBe(3);
    expect(nextUnanswered(questions.slice(0, 2))).toBeUndefined();
  });

  it("soru bağlantısı ödev bağlamını taşır ve geri dönüş parametresi doğrulanır", () => {
    expect(assignmentQuestionHref(12, 4)).toBe("/sorular/12?odev=4");
    expect(parseAssignmentBack("4")).toBe(4);
    expect(parseAssignmentBack("x")).toBeNull();
    expect(parseAssignmentBack(null)).toBeNull();
    expect(parseAssignmentBack("0")).toBeNull();
  });
});

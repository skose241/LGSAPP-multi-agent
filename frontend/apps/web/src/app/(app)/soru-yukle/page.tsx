import type { Metadata } from "next";
import { UploadQuestionPage } from "@/features/student/upload-question-page";

export const metadata: Metadata = { title: "Soru Yükle" };

export default function UploadQuestionRoute() {
  return <UploadQuestionPage />;
}

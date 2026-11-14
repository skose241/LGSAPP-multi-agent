import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Showcase } from "@/components/design/showcase";

export const metadata: Metadata = { title: "Tasarım vitrini" };

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <Showcase />;
}

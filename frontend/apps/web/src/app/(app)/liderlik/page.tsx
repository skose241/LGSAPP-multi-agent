import type { Metadata } from "next";
import { LeaderboardPage } from "@/features/student/leaderboard-page";

export const metadata: Metadata = { title: "Liderlik" };

export default function LeaderboardRoute() {
  return <LeaderboardPage />;
}

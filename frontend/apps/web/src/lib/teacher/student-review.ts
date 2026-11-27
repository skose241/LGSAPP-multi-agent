export type ProfileTab = "stats" | "uploads" | "answers";

export interface ProfileView {
  tab: ProfileTab;
  page: number;
  lessonId?: number;
}

export const PROFILE_TABS: { id: ProfileTab; param: string; label: string }[] = [
  { id: "stats", param: "istatistik", label: "İstatistikler" },
  { id: "uploads", param: "sorular", label: "Yüklediği Sorular" },
  { id: "answers", param: "cevaplar", label: "Cevapları" },
];

function positiveInt(value: string | null): number | undefined {
  if (!value || !/^[0-9]{1,9}$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

export function parseProfileView(params: URLSearchParams): ProfileView {
  const tab = PROFILE_TABS.find((entry) => entry.param === params.get("sekme"))?.id ?? "stats";
  if (tab === "stats") return { tab, page: 1 };
  return {
    tab,
    page: positiveInt(params.get("sayfa")) ?? 1,
    lessonId: tab === "answers" ? positiveInt(params.get("ders")) : undefined,
  };
}

export function profileViewToSearch(view: ProfileView): string {
  if (view.tab === "stats") return "";
  const params = new URLSearchParams();
  const entry = PROFILE_TABS.find((item) => item.id === view.tab);
  if (entry) params.set("sekme", entry.param);
  if (view.tab === "answers" && view.lessonId) params.set("ders", String(view.lessonId));
  if (view.page > 1) params.set("sayfa", String(view.page));
  return `?${params.toString()}`;
}

export function explanationShare(withExplanation: number, total: number): number | null {
  return total > 0 ? Math.round((withExplanation / total) * 100) : null;
}

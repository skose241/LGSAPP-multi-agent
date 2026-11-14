import type { AdminUser } from "@lgs/api/queries";

export type RoleFilter = "all" | "ogretmen" | "ogrenci" | "mudur";

export const ROLE_TABS: { id: RoleFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "ogretmen", label: "Öğretmen" },
  { id: "ogrenci", label: "Öğrenci" },
  { id: "mudur", label: "Müdür" },
];

const FOLD: Record<string, string> = { ı: "i", ç: "c", ğ: "g", ö: "o", ş: "s", ü: "u" };

function lower(value: string): string {
  return value.toLocaleLowerCase("tr");
}

function fold(value: string): string {
  return lower(value).replace(/[ıçğöşü]/g, (char) => FOLD[char] ?? char);
}

export function fullName(user: Pick<AdminUser, "firstName" | "lastName">): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

export function matchesQuery(user: AdminUser, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const haystack = [user.userName, fullName(user), user.className ?? ""].join(" ");
  return lower(haystack).includes(lower(trimmed)) || fold(haystack).includes(fold(trimmed));
}

export function filterUsers(users: AdminUser[], role: RoleFilter, query: string): AdminUser[] {
  return users
    .filter((user) => (role === "all" ? true : user.role === role) && matchesQuery(user, query))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), "tr") || a.userName.localeCompare(b.userName, "tr"));
}

export function countByRole(users: AdminUser[]): Record<RoleFilter, number> {
  return {
    all: users.length,
    ogretmen: users.filter((u) => u.role === "ogretmen").length,
    ogrenci: users.filter((u) => u.role === "ogrenci").length,
    mudur: users.filter((u) => u.role === "mudur").length,
  };
}

export interface ActionState {
  allowed: boolean;
  reason?: string;
}

export interface UserActions {
  ban: ActionState;
  unban: ActionState;
  regeneratePassword: ActionState;
  branch: ActionState;
}

const ok: ActionState = { allowed: true };
const no = (reason: string): ActionState => ({ allowed: false, reason });

export function userActions(user: AdminUser, currentUserId: number | undefined): UserActions {
  if (user.isSystemAccount || user.role === "ai") {
    const reason = "Yapay zekâ hesabı sistem tarafından yönetilir.";
    return { ban: no(reason), unban: no(reason), regeneratePassword: no(reason), branch: no(reason) };
  }

  const isSelf = currentUserId !== undefined && user.id === currentUserId;
  const isMudur = user.role === "mudur";

  const ban = isSelf
    ? no("Kendi hesabınızı engelleyemezsiniz.")
    : isMudur
      ? no("Müdür hesapları banlanamaz.")
      : user.isBanned
        ? no("Hesap zaten engelli.")
        : ok;

  const unban = user.isBanned ? ok : no("Hesap engelli değil.");

  const regeneratePassword = isSelf
    ? no("Kendi şifrenizi profil sayfasından değiştirin.")
    : isMudur
      ? no("Müdür hesaplarının şifresi bu yolla yenilenemez.")
      : ok;

  const branch = user.role === "ogretmen" ? ok : no("Branş dersi yalnızca öğretmen hesaplarına atanabilir.");

  return { ban, unban, regeneratePassword, branch };
}

import fs from "node:fs";
import path from "node:path";

export const STATE_DIR = path.join(process.cwd(), ".e2e");
export const STATE_FILE = path.join(STATE_DIR, "state.json");

export interface E2EState {
  adminUserName: string;
  adminPassword: string;
}

export function apiUrl(): string {
  return process.env.E2E_API_URL ?? "http://localhost:5390";
}

export function randomIp(): string {
  const octet = () => 1 + Math.floor(Math.random() * 253);
  return `10.${octet()}.${octet()}.${octet()}`;
}

export function uniqueName(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const VALID_PASSWORD = "Test-Sifre-2026-Ab";

interface CallOptions {
  token?: string;
  body?: unknown;
  ip?: string;
}

export async function backend<T = unknown>(
  method: string,
  route: string,
  options: CallOptions = {},
): Promise<{ status: number; body: T; headers: Headers }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-lgs-proxy-key": process.env.E2E_PROXY_KEY ?? "",
    "x-lgs-client-ip": options.ip ?? randomIp(),
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const response = await fetch(`${apiUrl()}${route}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body: body as T, headers: response.headers };
}

interface LoginBody {
  token: string;
  mustChangePassword: boolean;
  recoveryCodes?: string[];
  user: { id: number; role: string };
}

export async function loginApi(userName: string, password: string): Promise<LoginBody | null> {
  const result = await backend<LoginBody>("POST", "/api/auth/login", { body: { userName, password } });
  return result.status === 200 ? result.body : null;
}

export function readState(): E2EState {
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as E2EState;
}

export async function adminToken(): Promise<string> {
  const state = readState();
  const login = await loginApi(state.adminUserName, state.adminPassword);
  if (!login) throw new Error("Müdür girişi başarısız.");
  return login.token;
}

export interface CreatedAccount {
  id: number;
  userName: string;
  oneTimePassword: string;
  role: string;
}

export async function createAccount(role: "ogrenci" | "ogretmen" | "mudur", prefix = role): Promise<CreatedAccount> {
  const token = await adminToken();
  const userName = uniqueName(`${prefix}.`);
  const result = await backend<{ user: { id: number }; oneTimePassword: string }>("POST", "/api/admin/users", {
    token,
    body: { userName, firstName: "Deneme", lastName: "Kullanıcı", role, className: role === "ogrenci" ? "8-A" : null },
  });
  if (result.status !== 201) throw new Error(`Hesap oluşturulamadı: ${result.status} ${JSON.stringify(result.body)}`);
  return { id: result.body.user.id, userName, oneTimePassword: result.body.oneTimePassword, role };
}

export async function activateAccount(account: CreatedAccount, newPassword = VALID_PASSWORD): Promise<{ recoveryCodes: string[] }> {
  const login = await loginApi(account.userName, account.oneTimePassword);
  if (!login) throw new Error("İlk giriş başarısız.");
  const result = await backend<LoginBody>("POST", "/api/auth/change-password", {
    token: login.token,
    body: { currentPassword: account.oneTimePassword, newPassword },
  });
  if (result.status !== 200) throw new Error(`Şifre değişmedi: ${result.status} ${JSON.stringify(result.body)}`);
  return { recoveryCodes: result.body.recoveryCodes ?? [] };
}

export async function banAccount(id: number): Promise<void> {
  const token = await adminToken();
  const result = await backend("POST", `/api/admin/users/${id}/ban`, { token });
  if (result.status !== 204) throw new Error(`Ban başarısız: ${result.status}`);
}

export async function exhaustRecoveryCodes(userName: string, codes: string[]): Promise<void> {
  let index = 0;
  for (const code of codes) {
    const result = await backend("POST", "/api/auth/recover", {
      body: { userName, recoveryCode: code, newPassword: `${VALID_PASSWORD}${index}` },
    });
    if (result.status !== 200) throw new Error(`Kod tüketilemedi: ${result.status}`);
    index += 1;
  }
}

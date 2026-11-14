import fs from "node:fs";
import { backend, loginApi, STATE_DIR, STATE_FILE, type E2EState } from "./support/backend";

const FINAL_PASSWORD = "E2e-Mudur-Yeni-Sifre-2026";

export default async function globalSetup() {
  const userName = process.env.E2E_ADMIN_USER;
  const initialPassword = process.env.E2E_ADMIN_PASSWORD;
  if (!process.env.E2E_PROXY_KEY || !userName || !initialPassword) {
    throw new Error("E2E_PROXY_KEY, E2E_ADMIN_USER ve E2E_ADMIN_PASSWORD tanımlı olmalı.");
  }

  const health = await fetch(`${process.env.E2E_API_URL ?? "http://localhost:5390"}/health`).catch(() => null);
  if (!health?.ok) throw new Error("Backend ayakta değil.");

  let ready = await loginApi(userName, FINAL_PASSWORD);
  if (!ready) {
    const first = await loginApi(userName, initialPassword);
    if (!first) throw new Error("Seed müdür girişi başarısız.");
    if (first.mustChangePassword) {
      const changed = await backend("POST", "/api/auth/change-password", {
        token: first.token,
        body: { currentPassword: initialPassword, newPassword: FINAL_PASSWORD },
      });
      if (changed.status !== 200) throw new Error(`Müdür şifresi değişmedi: ${changed.status}`);
    }
    ready = await loginApi(userName, FINAL_PASSWORD);
    if (!ready) throw new Error("Müdür yeni şifreyle giriş yapamadı.");
  }

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const state: E2EState = { adminUserName: userName, adminPassword: FINAL_PASSWORD };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

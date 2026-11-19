import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.resolve(webDir, "../../../backend");
const apiProject = path.join("src", "LGSApp.Api");
const infraProject = path.join("src", "LGSApp.Infrastructure");
const isWindows = process.platform === "win32";

const apiPort = Number(process.env.E2E_API_PORT ?? 5390);
const proxyKey = process.env.E2E_PROXY_KEY ?? "e2e-proxy-key-0123456789-abcdefghijklmnop";
const adminUser = process.env.E2E_ADMIN_USER ?? "e2e.mudur";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "E2e-Mudur-Ilk-Sifre-2026!";
const connection =
  process.env.E2E_CONNECTION_STRING ??
  "Server=(localdb)\\MSSQLLocalDB;Database=LGSApp_E2E;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true";

if (!/LGSApp_E2E/i.test(connection)) {
  console.error("E2E bağlantı dizesi LGSApp_E2E veritabanını göstermelidir; başka bir veritabanı silinmez.");
  process.exit(1);
}

const children = [];
let finished = false;

function log(message) {
  console.log(`[e2e] ${message}`);
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (isWindows) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

function cleanup() {
  if (finished) return;
  finished = true;
  for (const child of children) killTree(child);
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: isWindows, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} başarısız oldu (kod ${result.status}).`);
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function waitFor(url, label, timeoutMs, accept = (r) => r.ok) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (accept(response)) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} ${timeoutMs / 1000} sn içinde hazır olmadı.`);
}

async function main() {
  for (const port of [apiPort, 10000, 10001, 10002]) {
    if (!(await portFree(port))) throw new Error(`${port} portu dolu. Önceki E2E süreçlerini kapatın.`);
  }

  const backendEnv = {
    ...process.env,
    ConnectionStrings__DefaultConnection: connection,
    ASPNETCORE_ENVIRONMENT: "Development",
    ASPNETCORE_URLS: `http://localhost:${apiPort}`,
    Bff__ProxyKey: proxyKey,
    Seed__AdminUserName: adminUser,
    Seed__AdminPassword: adminPassword,
    Scheduler__Enabled: "false",
    Ai__Provider: "Fake",
    Ai__Fake__MismatchEveryNth: "4",
    RateLimiting__AdminSettings__PermitLimit: "10000",
    RateLimiting__BulkUserCreate__PermitLimit: "10000",
    RateLimiting__SchedulerTrigger__PermitLimit: "10000",
  };

  log("LGSApp_E2E siliniyor ve migration'lar uygulanıyor");
  run("dotnet", ["ef", "database", "drop", "--force", "--project", infraProject, "--startup-project", apiProject], { cwd: backendDir, env: backendEnv });
  run("dotnet", ["ef", "database", "update", "--project", infraProject, "--startup-project", apiProject], { cwd: backendDir, env: backendEnv });

  log(".next-e2e siliniyor");
  fs.rmSync(path.join(webDir, ".next-e2e"), { recursive: true, force: true });

  const azuriteDir = path.join(webDir, ".e2e", "azurite");
  fs.rmSync(azuriteDir, { recursive: true, force: true });
  fs.mkdirSync(azuriteDir, { recursive: true });
  log("Azurite başlatılıyor");
  const azurite = spawn("npx", ["-y", "azurite", "--skipApiVersionCheck", "--silent", "--location", azuriteDir], { cwd: webDir, shell: isWindows, stdio: "ignore" });
  children.push(azurite);

  log("Backend başlatılıyor (Fake AI)");
  const backend = spawn("dotnet", ["run", "--no-launch-profile", "--project", apiProject], { cwd: backendDir, env: backendEnv, shell: isWindows, stdio: "ignore" });
  children.push(backend);

  await waitFor(`http://localhost:${apiPort}/health`, "Backend", 180_000);
  await waitFor("http://127.0.0.1:10000/", "Azurite", 120_000, () => true);

  log("Playwright çalışıyor");
  const playwrightEnv = {
    ...process.env,
    E2E_API_URL: `http://localhost:${apiPort}`,
    E2E_PROXY_KEY: proxyKey,
    E2E_ADMIN_USER: adminUser,
    E2E_ADMIN_PASSWORD: adminPassword,
    E2E_CHROMIUM_CHANNEL: process.env.E2E_CHROMIUM_CHANNEL ?? "chrome",
  };
  const playwright = spawnSync("npx", ["pnpm@10", "exec", "playwright", "test", ...process.argv.slice(2)], {
    cwd: webDir,
    env: playwrightEnv,
    stdio: "inherit",
    shell: isWindows,
  });
  return playwright.status ?? 1;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(`[e2e] ${error instanceof Error ? error.message : error}`);
} finally {
  cleanup();
}
process.exit(code);

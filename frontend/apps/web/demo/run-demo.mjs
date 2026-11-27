import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { admin, apiPort, apiUrl, connection, demoDir, heroStudent, heroTeacher, pastDays, proxyKey, shotsDir, studentPassword, students, teacherPassword, teachers, webDir, webPort, webUrl } from "./config.mjs";

const backendDir = path.resolve(webDir, "../../../backend");
const apiProject = path.join("src", "LGSApp.Api");
const infraProject = path.join("src", "LGSApp.Infrastructure");
const isWindows = process.platform === "win32";
const distDir = ".next-demo";
const logDir = path.join(demoDir, "logs");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const keep = flag("--keep");
const noShots = flag("--no-shots");
const useDev = flag("--dev");
const skipBuild = flag("--skip-build");
const aiDaily = !flag("--no-ai-daily");
const seedOnly = flag("--seed-only");

if (!/LGSApp_Demo/i.test(connection) || !/\(localdb\)/i.test(connection) || /windows\.net|database\.azure/i.test(connection)) {
  console.error("Demo bağlantı dizesi yerel LocalDB üzerindeki LGSApp_Demo veritabanını göstermelidir; başka bir veritabanı silinmez.");
  process.exit(1);
}

const children = [];
let finished = false;
let backend = null;

function log(message) {
  console.log(`[demo] ${message}`);
}

function killTree(child) {
  if (!child || !child.pid || child.exitCode !== null) return;
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

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", shell: isWindows, ...options });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(" ")} başarısız oldu (kod ${result.status}).`);
}

function runAsync(command, commandArgs, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { stdio: "inherit", shell: isWindows, ...options });
    children.push(child);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function waitPortFree(port, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await portFree(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${port} portu ${timeoutMs / 1000} sn içinde boşalmadı.`);
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

function service(name, command, commandArgs, options) {
  const out = fs.openSync(path.join(logDir, `${name}.log`), "a");
  const child = spawn(command, commandArgs, { shell: isWindows, stdio: ["ignore", out, out], ...options });
  children.push(child);
  return child;
}

const backendEnv = {
  ...process.env,
  ConnectionStrings__DefaultConnection: connection,
  ASPNETCORE_ENVIRONMENT: "Development",
  ASPNETCORE_URLS: apiUrl,
  Bff__ProxyKey: proxyKey,
  Seed__AdminUserName: admin.userName,
  Seed__AdminPassword: admin.initialPassword,
  Seed__AdminFirstName: admin.firstName,
  Seed__AdminLastName: admin.lastName,
  Scheduler__Enabled: "false",
  Ai__Provider: "Fake",
  Ai__Fake__MismatchEveryNth: "0",
  Ai__Fake__DelayMs: "300",
  RateLimiting__Login__PermitLimit: "10000",
  RateLimiting__CommentWrite__PermitLimit: "10000",
  RateLimiting__AnswerSubmit__PermitLimit: "10000",
  RateLimiting__ReportCreate__PermitLimit: "10000",
  RateLimiting__AssignmentWrite__PermitLimit: "10000",
  RateLimiting__FileUpload__PermitLimit: "10000",
  RateLimiting__QuestionCreate__PermitLimit: "10000",
  RateLimiting__AiSolution__PermitLimit: "10000",
  RateLimiting__AdminSettings__PermitLimit: "10000",
  RateLimiting__BulkUserCreate__PermitLimit: "10000",
  RateLimiting__SchedulerTrigger__PermitLimit: "10000",
};

const demoEnv = {
  ...process.env,
  DEMO_API_URL: apiUrl,
  DEMO_WEB_URL: webUrl,
  DEMO_PROXY_KEY: proxyKey,
  DEMO_CHROMIUM_CHANNEL: process.env.DEMO_CHROMIUM_CHANNEL ?? "chrome",
};

async function startBackend(offsetMinutes) {
  const env = { ...backendEnv };
  if (offsetMinutes !== 0) env.DevTime__OffsetMinutes = String(offsetMinutes);
  else delete env.DevTime__OffsetMinutes;
  backend = service("backend", "dotnet", ["run", "--no-launch-profile", "--project", apiProject], { cwd: backendDir, env });
  await waitFor(`${apiUrl}/health`, "Backend", 180_000);
}

async function stopBackend() {
  killTree(backend);
  await waitPortFree(apiPort);
}

async function main() {
  for (const port of [apiPort, webPort, 10000, 10001, 10002]) {
    if (!(await portFree(port))) throw new Error(`${port} portu dolu. Önceki demo/E2E süreçlerini kapatın.`);
  }

  fs.mkdirSync(logDir, { recursive: true });
  for (const file of fs.readdirSync(logDir)) fs.rmSync(path.join(logDir, file), { force: true });

  log("LGSApp_Demo siliniyor ve migration'lar uygulanıyor");
  run("dotnet", ["ef", "database", "drop", "--force", "--project", infraProject, "--startup-project", apiProject], { cwd: backendDir, env: backendEnv });
  run("dotnet", ["ef", "database", "update", "--project", infraProject, "--startup-project", apiProject], { cwd: backendDir, env: backendEnv });

  log("Referans veri yükleniyor (6 ders, 73 konu)");
  run("dotnet", ["run", "--no-launch-profile", "--project", apiProject, "--", "seed-reference-data"], { cwd: backendDir, env: backendEnv });

  fs.rmSync(path.join(demoDir, "azurite"), { recursive: true, force: true });
  fs.rmSync(path.join(demoDir, "state.json"), { force: true });
  fs.mkdirSync(path.join(demoDir, "azurite"), { recursive: true });
  log("Azurite başlatılıyor");
  service("azurite", "npx", ["-y", "azurite", "--skipApiVersionCheck", "--silent", "--location", path.join(demoDir, "azurite")], { cwd: webDir });
  await waitFor("http://127.0.0.1:10000/", "Azurite", 120_000, () => true);

  const webEnv = {
    ...process.env,
    API_BASE_URL: apiUrl,
    BFF_PROXY_KEY: proxyKey,
    SESSION_COOKIE_SECURE: "false",
    NEXT_DIST_DIR: distDir,
    APP_ORIGIN: webUrl,
    TRUST_PROXY: "true",
    CSP_REPORT_ONLY: "false",
    CSP_IMG_HOSTS: "http://127.0.0.1:10000 http://localhost:10000",
    NEXT_TELEMETRY_DISABLED: "1",
  };

  if (!useDev && !skipBuild && !seedOnly) {
    log("Web üretim derlemesi (next build) alınıyor");
    fs.rmSync(path.join(webDir, distDir), { recursive: true, force: true });
    run("npx", ["pnpm@10", "run", "build"], { cwd: webDir, env: { ...webEnv, NODE_ENV: "production" } });
  }

  log(`Geçmiş verisi için backend ${pastDays} gün geriye alınarak başlatılıyor`);
  await startBackend(-pastDays * 1440);
  let code = await runAsync("node", ["demo/seed-demo.mjs", "--phase=past"], { cwd: webDir, env: demoEnv });
  if (code !== 0) throw new Error("Demo verisi (geçmiş aşama) üretilemedi.");
  await stopBackend();

  log("Backend normal saatle yeniden başlatılıyor");
  await startBackend(0);

  const seedArgs = ["demo/seed-demo.mjs", "--phase=main"];
  if (!aiDaily) seedArgs.push("--no-ai-daily");
  code = await runAsync("node", seedArgs, { cwd: webDir, env: demoEnv });
  if (code !== 0) throw new Error("Demo verisi üretilemedi.");

  if (seedOnly) return 0;

  log(useDev ? "Web geliştirme sunucusu başlatılıyor" : "Web üretim sunucusu başlatılıyor");
  const webArgs = useDev ? ["pnpm@10", "exec", "next", "dev", "--port", String(webPort)] : ["pnpm@10", "exec", "next", "start", "--port", String(webPort)];
  if (useDev) fs.rmSync(path.join(webDir, distDir), { recursive: true, force: true });
  service("web", "npx", webArgs, { cwd: webDir, env: { ...webEnv, NODE_ENV: useDev ? "development" : "production" } });
  await waitFor(`${webUrl}/giris`, "Web", 240_000);

  if (!noShots) {
    log("Ekran görüntüleri alınıyor");
    code = await runAsync("node", ["demo/capture.mjs"], { cwd: webDir, env: demoEnv });
    if (code !== 0) throw new Error("Ekran görüntüsü alma başarısız oldu.");
    log(`Ekran görüntüleri: ${shotsDir}`);
  }

  if (keep) {
    const hero = students.find((s) => s.key === heroStudent);
    const heroTeach = teachers.find((t) => t.key === heroTeacher);
    console.log("");
    console.log(`[demo] Sunucular açık: ${webUrl}  (API ${apiUrl})`);
    console.log(`[demo] Müdür:    ${admin.userName} / ${admin.password}`);
    console.log(`[demo] Öğretmen: ${teachers.map((t) => t.userName).join(", ")} / ${teacherPassword}`);
    console.log(`[demo] Öğrenci:  ${students.map((s) => s.userName).join(", ")} / ${studentPassword}`);
    console.log(`[demo] Temsilci: ${hero.userName} (öğrenci), ${heroTeach.userName} (öğretmen)`);
    console.log("[demo] Kapatmak için Ctrl+C.");
    await new Promise(() => {});
  }
  return 0;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error(`[demo] ${error instanceof Error ? error.message : error}`);
  console.error(`[demo] Günlükler: ${logDir}`);
} finally {
  cleanup();
}
process.exit(exitCode);

import { admin, apiUrl as defaultApiUrl, proxyKey as defaultProxyKey } from "./config.mjs";

export const apiUrl = process.env.DEMO_API_URL ?? defaultApiUrl;
const proxyKey = process.env.DEMO_PROXY_KEY ?? defaultProxyKey;

let ipCounter = 10;
function nextIp() {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function call(method, route, { token, body, ip } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const headers = {
      "content-type": "application/json",
      "x-lgs-proxy-key": proxyKey,
      "x-lgs-client-ip": ip ?? nextIp(),
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${apiUrl}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (response.status === 429 && attempt < 6) {
      const wait = Number(response.headers.get("retry-after") ?? "5");
      await sleep((Number.isFinite(wait) ? wait : 5) * 1000 + 300);
      continue;
    }
    return { status: response.status, body: data, headers: response.headers };
  }
}

export async function must(method, route, options, accept = [200, 201, 204]) {
  const result = await call(method, route, options);
  if (!accept.includes(result.status)) {
    throw new Error(`${method} ${route} -> ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

export async function login(userName, password) {
  const result = await call("POST", "/api/auth/login", { body: { userName, password } });
  return result.status === 200 ? result.body : null;
}

export async function activate(userName, oneTime, finalPassword) {
  const first = await login(userName, oneTime);
  if (!first) throw new Error(`${userName} ilk girişi başarısız.`);
  if (first.mustChangePassword) {
    await must("POST", "/api/auth/change-password", { token: first.token, body: { currentPassword: oneTime, newPassword: finalPassword } });
  }
}

export async function session(userName, password) {
  const result = await login(userName, password);
  if (!result) throw new Error(`${userName} girişi başarısız.`);
  return { userName, id: result.user.id, token: result.token };
}

export async function adminSession() {
  const done = await login(admin.userName, admin.password);
  if (done) return { userName: admin.userName, id: done.user.id, token: done.token };
  await activate(admin.userName, admin.initialPassword, admin.password);
  return session(admin.userName, admin.password);
}

export async function uploadFile(user, purpose, buffer, mime, name) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const form = new FormData();
    form.set("purpose", purpose);
    form.set("clientUploadId", crypto.randomUUID());
    form.set("file", new Blob([new Uint8Array(buffer)], { type: mime }), name);
    const response = await fetch(`${apiUrl}/api/files`, {
      method: "POST",
      headers: { authorization: `Bearer ${user.token}`, "x-lgs-proxy-key": proxyKey, "x-lgs-client-ip": nextIp() },
      body: form,
    });
    const text = await response.text();
    if (response.status === 429) {
      await sleep(5000);
      continue;
    }
    if (response.status !== 200 && response.status !== 201) throw new Error(`Dosya yüklenemedi: ${response.status} ${text}`);
    return JSON.parse(text).id;
  }
  throw new Error("Dosya yüklenemedi: istek sınırı.");
}

import { apiBaseUrl, proxyKey } from "./config";

export interface UpstreamOptions {
  method: string;
  path: string;
  query?: string;
  clientIp?: string | null;
  accessToken?: string | null;
  headers?: Headers;
  body?: BodyInit | null;
}

export function buildUpstreamHeaders(options: Pick<UpstreamOptions, "clientIp" | "accessToken" | "headers">): Headers {
  const headers = new Headers();
  const source = options.headers;
  for (const name of ["content-type", "accept", "accept-language"]) {
    const value = source?.get(name);
    if (value) headers.set(name, value);
  }
  const key = proxyKey();
  if (key) {
    headers.set("X-LGS-Proxy-Key", key);
    if (options.clientIp) headers.set("X-LGS-Client-IP", options.clientIp);
  }
  if (options.accessToken) headers.set("Authorization", `Bearer ${options.accessToken}`);
  return headers;
}

export function callUpstream(options: UpstreamOptions): Promise<Response> {
  const url = `${apiBaseUrl()}/${options.path}${options.query ?? ""}`;
  const init: RequestInit & { duplex?: "half" } = {
    method: options.method,
    headers: buildUpstreamHeaders(options),
    redirect: "manual",
    cache: "no-store",
  };
  if (options.body !== undefined && options.body !== null) {
    init.body = options.body;
    if (typeof ReadableStream !== "undefined" && options.body instanceof ReadableStream) {
      init.duplex = "half";
    }
  }
  return fetch(url, init);
}

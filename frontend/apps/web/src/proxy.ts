import { NextResponse, type NextRequest } from "next/server";
import { cookieNames } from "@/lib/bff/config";
import { REPORTING_ENDPOINTS, buildCsp, createNonce, cspHeaderName, isReportOnly } from "@/lib/csp";
import { decodeJwt, secondsUntilExpiry } from "@/lib/jwt";
import { decideRoute } from "@/lib/route-guard";

export function proxy(request: NextRequest) {
  const names = cookieNames();
  const access = request.cookies.get(names.access)?.value;
  const info = decodeJwt(access);
  const valid = info !== null && secondsUntilExpiry(info) > 0;

  const decision = decideRoute({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasAccess: valid,
    hasRefresh: Boolean(request.cookies.get(names.refresh)?.value),
    info: valid ? info : null,
  });

  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.to, request.nextUrl));
  }

  const nonce = createNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    imgHosts: process.env.CSP_IMG_HOSTS ?? "",
  });
  const headerName = cspHeaderName(isReportOnly(process.env.CSP_REPORT_ONLY));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(headerName, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(headerName, csp);
  response.headers.set("Reporting-Endpoints", REPORTING_ENDPOINTS);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|healthz$|csp-report$|favicon.ico|manifest.webmanifest|.*\\.[a-zA-Z0-9]+$).*)"],
};

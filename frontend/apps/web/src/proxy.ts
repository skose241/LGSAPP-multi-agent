import { NextResponse, type NextRequest } from "next/server";
import { cookieNames } from "@/lib/bff/config";
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
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|manifest.webmanifest|.*\\.[a-zA-Z0-9]+$).*)"],
};

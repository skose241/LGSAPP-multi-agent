import { describe, expect, it } from "vitest";
import { canonicalHostWarning, canonicalRedirectUrl, parseCanonicalHost, type CanonicalInput } from "./canonical-host";

function input(overrides: Partial<CanonicalInput> = {}): CanonicalInput {
  return {
    canonicalHost: "netpesinde.com",
    method: "GET",
    host: "www.netpesinde.com",
    forwardedHost: null,
    trustProxy: false,
    pathname: "/ogrenci/sorular",
    search: "?sayfa=2&ders=mat",
    ...overrides,
  };
}

describe("canonicalRedirectUrl", () => {
  it("www alan adından yol ve sorguyu koruyarak yönlendirir", () => {
    expect(canonicalRedirectUrl(input())).toBe("https://netpesinde.com/ogrenci/sorular?sayfa=2&ders=mat");
  });

  it("azurewebsites alan adından yönlendirir", () => {
    expect(canonicalRedirectUrl(input({ host: "lgsapp-web-b4okhw.azurewebsites.net:443" }))).toBe(
      "https://netpesinde.com/ogrenci/sorular?sayfa=2&ders=mat",
    );
  });

  it("HEAD isteğini de yönlendirir", () => {
    expect(canonicalRedirectUrl(input({ method: "HEAD" }))).not.toBeNull();
  });

  it("güvenilir vekilde x-forwarded-host kullanır", () => {
    const url = canonicalRedirectUrl(
      input({ trustProxy: true, host: "localhost:8080", forwardedHost: "www.netpesinde.com" }),
    );
    expect(url).toBe("https://netpesinde.com/ogrenci/sorular?sayfa=2&ders=mat");
  });

  it("güvenilmeyen vekilde x-forwarded-host yok sayılır", () => {
    expect(canonicalRedirectUrl(input({ host: "netpesinde.com", forwardedHost: "evil.test" }))).toBeNull();
  });

  it("ana alan adında büyük harf ve port farkıyla yönlendirmez", () => {
    expect(canonicalRedirectUrl(input({ host: "NetPesinde.com:443" }))).toBeNull();
  });

  it("ana alan adında kök yol için yönlendirmez", () => {
    expect(canonicalRedirectUrl(input({ host: "netpesinde.com", pathname: "/", search: "" }))).toBeNull();
  });

  it.each(["/healthz", "/api/ogrenci/sorular", "/bff/x", "/csp-report", "/_next/static/a.js", "/logo.png", "/favicon.ico"])(
    "%s yolunu yönlendirmez",
    (pathname) => {
      expect(canonicalRedirectUrl(input({ pathname, search: "" }))).toBeNull();
    },
  );

  it.each(["POST", "PUT", "PATCH", "DELETE"])("%s isteğini yönlendirmez", (method) => {
    expect(canonicalRedirectUrl(input({ method }))).toBeNull();
  });

  it.each([undefined, "", "   ", "https://netpesinde.com", "netpesinde.com/yol", "netpesinde.com:443", "localhost", "a b.com"])(
    "CANONICAL_HOST=%j ise özellik kapalıdır",
    (canonicalHost) => {
      expect(canonicalRedirectUrl(input({ canonicalHost }))).toBeNull();
    },
  );
});

describe("parseCanonicalHost ve uyarı", () => {
  it("geçerli değeri küçük harfe çevirir", () => {
    expect(parseCanonicalHost(" NetPesinde.com ")).toBe("netpesinde.com");
  });

  it("boşken uyarı vermez, geçersizken verir", () => {
    expect(canonicalHostWarning({})).toBeNull();
    expect(canonicalHostWarning({ CANONICAL_HOST: "netpesinde.com" })).toBeNull();
    expect(canonicalHostWarning({ CANONICAL_HOST: "https://netpesinde.com" })).toContain("CANONICAL_HOST");
  });
});

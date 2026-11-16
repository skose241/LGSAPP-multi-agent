import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decideRoute } from "../route-guard";
import { lgplComponents } from "./components";
import { thirdPartyPackages } from "./third-party";

const publicDir = path.resolve(__dirname, "../../../public");

describe("lisans sayfası verisi", () => {
  it("heic-to, libheif ve libde265 LGPL bileşenleri olarak listelenir", () => {
    expect(lgplComponents.map((item) => item.name)).toEqual(["heic-to", "libheif", "libde265"]);
    for (const item of lgplComponents) {
      expect(item.license).toBe("LGPL-3.0");
      expect(item.copyright.length).toBeGreaterThan(0);
      expect(item.sources.length).toBeGreaterThan(0);
      expect(item.sources.every((source) => source.href.startsWith("https://"))).toBe(true);
    }
  });

  it("lisans metni bağlantıları public/licenses altındaki dosyalara çıkar", () => {
    const links = lgplComponents.flatMap((item) => item.licenseText.map((link) => link.href));
    links.push("/licenses/GPL-3.0.txt");
    for (const href of links) {
      const file = path.join(publicDir, href);
      expect(fs.existsSync(file), href).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(1000);
    }
  });

  it("üretilen bağımlılık listesi heic-to ve katex içerir, lisansı bilinmeyen paket yoktur", () => {
    const names = thirdPartyPackages.map((entry) => entry.name);
    expect(names).toContain("heic-to");
    expect(names).toContain("katex");
    expect(thirdPartyPackages.every((entry) => entry.license !== "UNKNOWN" && entry.version.length > 0)).toBe(true);
    expect(thirdPartyPackages.find((entry) => entry.name === "heic-to")?.version).toBe(lgplComponents[0]?.version);
  });

  it("lisans sayfası oturumsuz erişilebilir", () => {
    const decision = decideRoute({ pathname: "/lisanslar", search: "", hasAccess: false, hasRefresh: false, info: null });
    expect(decision).toEqual({ type: "next" });
  });

  it("lisans ve vitrin alt yolları herkese açık sayılmaz", () => {
    const input = { search: "", hasAccess: false, hasRefresh: false, info: null };
    expect(decideRoute({ ...input, pathname: "/lisanslar/x" })).toEqual({ type: "redirect", to: "/giris?next=%2Flisanslar%2Fx" });
    expect(decideRoute({ ...input, pathname: "/tasarim/x" }).type).toBe("redirect");
    expect(decideRoute({ ...input, pathname: "/tasarim" })).toEqual({ type: "next" });
    expect(decideRoute({ ...input, pathname: "/lisanslar/" })).toEqual({ type: "next" });
  });
});

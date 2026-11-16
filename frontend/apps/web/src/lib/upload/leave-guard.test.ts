import { describe, expect, it } from "vitest";
import { shouldGuardNavigation } from "./leave-guard";

const current = { origin: "http://localhost:3000", pathname: "/soru-yukle", search: "" };
const click = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const anchor = (href: string, target = "", download = false) => ({ href, target, hasAttribute: (name: string) => name === "download" && download });

describe("sayfadan ayrılma koruması", () => {
  it("başka sayfaya giden bağlantıyı yakalar", () => {
    expect(shouldGuardNavigation(click, anchor("http://localhost:3000/sorularim"), current)).toBe(true);
    expect(shouldGuardNavigation(click, anchor("/sorularim"), current)).toBe(true);
  });

  it("aynı sayfa, yeni sekme, değiştirici tuş ve sağ tıkı yakalamaz", () => {
    expect(shouldGuardNavigation(click, anchor("http://localhost:3000/soru-yukle"), current)).toBe(false);
    expect(shouldGuardNavigation(click, anchor("http://localhost:3000/sorularim", "_blank"), current)).toBe(false);
    expect(shouldGuardNavigation({ ...click, ctrlKey: true }, anchor("/sorularim"), current)).toBe(false);
    expect(shouldGuardNavigation({ ...click, button: 2 }, anchor("/sorularim"), current)).toBe(false);
    expect(shouldGuardNavigation({ ...click, defaultPrevented: true }, anchor("/sorularim"), current)).toBe(false);
    expect(shouldGuardNavigation(click, anchor("/x", "", true), current)).toBe(false);
    expect(shouldGuardNavigation(click, null, current)).toBe(false);
  });

  it("farklı kaynağa giden bağlantıyı yakalar", () => {
    expect(shouldGuardNavigation(click, anchor("https://example.com/"), current)).toBe(true);
  });
});

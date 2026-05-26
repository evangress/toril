// Theme controller tests (CLAUDE.md §6). The pure `resolveTheme` is verified
// directly; the controller is checked against `html[data-theme]` with a stubbed
// `matchMedia` (jsdom does not implement it), covering the "system" follow.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEMES, ThemeController, isTheme, resolveTheme } from "../src/ui/theme";

describe("resolveTheme", () => {
  it("returns explicit choices unchanged", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("follows the system preference for 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("isTheme", () => {
  it("accepts only valid preferences", () => {
    for (const t of THEMES) expect(isTheme(t)).toBe(true);
    expect(isTheme("solarized")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe("ThemeController", () => {
  let systemDark = false;
  const listeners = new Set<() => void>();

  beforeEach(() => {
    systemDark = false;
    listeners.clear();
    // Minimal matchMedia stub whose `matches` tracks `systemDark`.
    vi.stubGlobal("matchMedia", (_query: string) => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    }));
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes the resolved palette to html[data-theme] on set", () => {
    const c = new ThemeController();
    c.set("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    c.set("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    c.destroy();
  });

  it("resolves 'system' against matchMedia", () => {
    systemDark = true;
    const c = new ThemeController();
    c.set("system");
    expect(c.current()).toBe("system"); // preference preserved…
    expect(c.resolved()).toBe("dark"); // …but resolved to the OS palette
    expect(document.documentElement.dataset.theme).toBe("dark");
    c.destroy();
  });

  it("re-applies when the OS scheme changes while on 'system'", () => {
    const c = new ThemeController();
    c.set("system"); // light
    expect(document.documentElement.dataset.theme).toBe("light");
    systemDark = true;
    for (const cb of listeners) cb(); // simulate an OS scheme change
    expect(document.documentElement.dataset.theme).toBe("dark");
    c.destroy();
  });

  it("ignores OS changes once an explicit theme is chosen", () => {
    const c = new ThemeController();
    c.set("light");
    systemDark = true;
    for (const cb of listeners) cb();
    expect(document.documentElement.dataset.theme).toBe("light"); // stays explicit
    c.destroy();
  });

  it("notifies onChange for set but not for applyInitial", () => {
    const onChange = vi.fn();
    const c = new ThemeController(onChange);
    c.applyInitial("dark");
    expect(onChange).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("dark");
    c.set("light");
    expect(onChange).toHaveBeenCalledWith("light");
    c.destroy();
  });
});

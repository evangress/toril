// Theme switching (CLAUDE.md §6, §8 Phase 3): one light + one dark theme, with
// an explicit "system" option that follows the OS. The chosen *preference* is
// persisted in settings.json (§5); restored on launch.
//
// How it works: the preference ("system" | "light" | "dark") is resolved to a
// CONCRETE palette ("light" | "dark") and written to `html[data-theme]`. All
// theme colors live in CSS custom properties keyed off that attribute
// (styles.css), so switching is a single attribute write — no per-element JS.
// Resolving "system" in JS (rather than leaning on a CSS media query) means an
// explicit Light/Dark choice fully overrides the OS, and the editor surface
// (Milkdown's nord theme, which self-switches via `prefers-color-scheme`) is
// decoupled because our `.editor .milkdown` rules read these same variables.

export type Theme = "system" | "light" | "dark";

/** Selectable preferences, in cycle/display order. */
export const THEMES: readonly Theme[] = ["system", "light", "dark"] as const;

export function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

/** Resolve a preference to the concrete palette to apply. Pure — easy to test. */
export function resolveTheme(theme: Theme, systemPrefersDark: boolean): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  return systemPrefersDark ? "dark" : "light";
}

/**
 * Owns the live theme preference: writes `html[data-theme]`, and — while the
 * preference is "system" — re-applies when the OS scheme changes.
 */
export class ThemeController {
  private theme: Theme = "system";
  private readonly mql = window.matchMedia?.("(prefers-color-scheme: dark)");
  private readonly onSystemChange = () => {
    if (this.theme === "system") this.apply();
  };

  constructor(private readonly onChange?: (theme: Theme) => void) {
    this.mql?.addEventListener?.("change", this.onSystemChange);
  }

  /** The current preference (not the resolved palette). */
  current(): Theme {
    return this.theme;
  }

  /** The concrete palette currently applied ("light" | "dark"). */
  resolved(): "light" | "dark" {
    return resolveTheme(this.theme, this.mql?.matches ?? false);
  }

  /** Set the preference, apply it to the DOM, and notify (for persistence). */
  set(theme: Theme): void {
    this.theme = theme;
    this.apply();
    this.onChange?.(theme);
  }

  /** Apply without notifying — used on startup to restore a saved preference. */
  applyInitial(theme: Theme): void {
    this.theme = theme;
    this.apply();
  }

  private apply(): void {
    const dark = this.mql?.matches ?? false;
    document.documentElement.dataset.theme = resolveTheme(this.theme, dark);
  }

  destroy(): void {
    this.mql?.removeEventListener?.("change", this.onSystemChange);
  }
}

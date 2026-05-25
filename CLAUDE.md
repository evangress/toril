# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# CLAUDE.md — Toril

> **Toril** — a MarkText-style WYSIWYG markdown editor built on **Tauri + TypeScript + Milkdown**.
>
> *The name:* in Spanish bullfighting, *el toril* is the pen where the bull waits before it charges
> into the ring — literally "the bullpen." It's a nod to **Tauri** (the bull) and to writing (the pen),
> with the bull-in-a-china-shop joke built in: the editor is the bull, safely penned, doing delicate work.

> **Finalized build plan.** Keep this file at the repo root — Claude Code reads it every session.
> The stack is **decided** (see §2); do not re-litigate it. Build **milestone by milestone** (§8),
> and treat §3 (Data Safety) as hard rules, not suggestions.

---

## 0. Current State

**Phases 0–2 (§8) are implemented; both Phase 1 gates pass.** Tauri 2 + Vite + TypeScript, §4 split (frontend at repo root, Rust in `src-tauri/`).

What exists today:
- **Milkdown WYSIWYG** editor (`src/editor/milkdown.ts`): CommonMark + GFM (tables, task lists, strikethrough) + change listener. Mounted by `src/main.ts`.
- **`src/editor/serializer.ts`** is the single canonical converter (§3.2): `docToMarkdown` / `markdownToDoc`, wrapping Milkdown's own remark pipeline. Nothing else converts markdown.
- **File commands** (§5, all disk I/O in Rust): `open_file`, `save_file`, `save_file_as` in `src-tauri/src/commands/files.rs`. Writes go through the **`fsatomic`** crate — a dependency-free, unit-tested atomic-write core (temp + fsync + rename, §3.1).
- **Workspace** (Phase 2): `open_folder` + `watch_folder` in `src-tauri/src/commands/workspace.rs`. Folder scanning lives in the dependency-free **`vaultscan`** crate (`.md` tree, skips hidden/`.obsidian`, prunes asset-only dirs). `watch_folder` uses the **`notify`** crate and emits `workspace:change` events. Frontend: `src/ui/sidebar.ts` (file tree), `src/ui/tabs.ts` (multi-document tabs, one shared editor + per-tab buffer), with external-change reload prompts in `main.ts`.
- **App controller** (`src/main.ts`): New/Open/Open Folder/Save/Save As (buttons + Ctrl+N, Ctrl+O, Ctrl+Shift+O, Ctrl+S, Ctrl+Shift+S), dirty flag, title shows `name *`. All backend calls go through `src/ipc.ts` (§5 rule).
- **Gates green:** atomic-save → `cargo test -p fsatomic` (5 tests). Round-trip → `pnpm test` (`tests/roundtrip.test.ts`, real Milkdown in jsdom, 14). Plus `vaultscan` (3) and `tabs.test.ts` (8).

**Not yet done / deferred:**
- **Round-trip gate covers CommonMark + GFM only.** Math and YAML front matter need their plugins (§6) and are **Phase 3**; until then a file containing them is **not** guaranteed lossless — add their fixtures to `roundtrip.test.ts` when those plugins land.
- **Formatting is normalized to Milkdown's canonical form** on first save (tight lists → loose, `---` → `***`). Reformats whitespace but never drops content and is idempotent thereafter (documented WYSIWYG trade-off; see the normalization test). Relevant to Obsidian-vault diffs (§1).
- **All GUI flows are unverified** (dialogs, Ctrl+S, tabs, sidebar, watcher reload) — they need the webview; see the build-environment note. Verify on a machine with platform webview deps.
- Tab switching does **not** preserve per-tab undo history (single shared editor; content is swapped). Acceptable for now; revisit if it bites.
- No source/typewriter/focus modes, themes beyond nord, `sanitize.ts` wiring yet (Phase 3).

### Commands
```bash
pnpm install          # first time (pnpm via `corepack enable pnpm`)
pnpm tauri dev        # run the app (opens the window)
pnpm tauri build      # production .exe + installer (Windows; see §9)

pnpm test             # vitest — round-trip + tabs (jsdom)
pnpm typecheck        # tsc --noEmit (TS strict)
pnpm build            # tsc + vite build (frontend only)
cd src-tauri && cargo test -p fsatomic -p vaultscan   # logic crates (no webview needed)
# (plain `cargo test` also builds the app crate → needs the webview toolchain)
cd src-tauri && cargo fmt --all && cargo clippy   # clean before commit (§10)
```

**Build environment note.** The Rust **app** crate links against the system webview (Windows: WebView2; Linux: WebKitGTK-4.1 + `pkg-config`). On a box without those, the frontend (`pnpm build`/`test`/`typecheck`), the `fsatomic` tests, and `cargo generate-lockfile` all work, but a full `cargo build`/`tauri dev` will not link. The window must be launched on a machine with the platform webview deps (the Windows target, or a Linux box with `libwebkit2gtk-4.1-dev`). `fsatomic` is split out partly so the §3.1 gate stays runnable everywhere.

**Next: Phase 3** — GFM (done) / math / emoji plugins, Source / Typewriter / Focus modes, themes + persisted settings, `sanitize.ts` wired into all rendered content (§3.3), clipboard image paste, then HTML → PDF export.

---

## 1. Goal

**Toril** is a desktop markdown editor with the look and feel of **MarkText**:

- **Inline WYSIWYG** editing — type `# ` and the line becomes a heading *in place*; `**bold**` renders as you go. The editing surface *is* the rendered surface (no separate preview pane required).
- CommonMark + GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks, footnotes).
- Math (KaTeX), YAML front matter, emoji shortcodes.
- Export to **HTML** and **PDF**.
- Multiple themes (light + dark) and three edit modes: **Source**, **Typewriter**, **Focus**.
- Paste image from clipboard.
- File/folder sidebar + multi-document tabs.

**Files are plain `.md` in ordinary folders — stay Obsidian-vault compatible.** No proprietary container, no sidecar lock-in. The folder a user opens may also be a live Obsidian vault.

Primary target: **Windows `.exe`**. macOS/Linux come free from the stack but are not the focus.

---

## 2. Stack (decided — do not change without explicit instruction)

| Layer | Choice | Role |
|---|---|---|
| App shell / packaging | **Tauri 2.x** | Native window, menus, Rust commands, small `.exe`, NSIS/MSI installers |
| Core (backend) | **Rust** | All filesystem I/O, exports, file watching, app logic |
| WYSIWYG editor | **Milkdown** (ProseMirror-based) | Markdown-first inline WYSIWYG; plugin-driven |
| Source-mode editor | **CodeMirror 6** | Shown when user switches to Source mode |
| Frontend build | **Vite + TypeScript** (strict) | Dev server + bundling |
| MD parsing (Rust) | **comrak** | CommonMark + GFM for HTML/PDF export and any backend parsing |

**Pin every dependency** (Cargo.lock committed; exact versions in package.json). Upgrade deliberately, never on a whim.

### Why this stack (so it isn't second-guessed later)
Inline WYSIWYG is the hard part of any markdown editor, and the mature engines for it live in the browser DOM (ProseMirror/Milkdown). Tauri gives a Rust core + system webview, so we get that mature editor **and** a small native binary. The whole app ends up memory-safe (Rust core + GC'd webview runtime) without any C/C++ in our code.

### Build-machine prerequisites (Windows)
- Rust stable (`rustup`)
- Node.js LTS + **pnpm**
- **Microsoft C++ Build Tools** (MSVC) — required to compile Rust on Windows
- **WebView2 runtime** — preinstalled on Win11; installer bootstraps it on Win10

---

## 3. Data Safety — NON-NEGOTIABLE

This is a notes app. The user's writing is the only thing that truly matters; everything else is replaceable. These three rules outrank features.

1. **Atomic saves.** Never write a file in place. Write to a temp file in the same directory, flush/fsync, then atomically rename over the target. A crash mid-save must never corrupt or truncate an existing note.
2. **Lossless round-tripping.** Source ⇄ WYSIWYG must not lose or mangle content. Maintain **one** canonical markdown representation; never keep two diverging buffers. All serialization goes through a single module (`serializer.ts`) so the conversion has exactly one source of truth.
3. **Treat opened files as untrusted.** A `.md` file (or pasted content) can carry hostile HTML. Sanitize anything rendered in the webview so embedded markup cannot execute script. This is an *injection* concern, separate from memory safety — the language choice does not cover it.

If a feature would compromise any of these three, the feature loses.

---

## 4. Project Structure

```
toril/
├── CLAUDE.md                  # this file
├── package.json               # frontend deps + scripts (pinned)
├── vite.config.ts             # build input = app.html (not index.html)
├── app.html                   # the app's HTML entry (Tauri window loads this)
├── index.html                 # RESERVED for the GitHub Pages landing page — NOT part of the app build
├── src/                       # FRONTEND (TypeScript, strict)
│   ├── main.ts                # bootstrap
│   ├── editor/
│   │   ├── milkdown.ts        # WYSIWYG setup + plugins
│   │   ├── codemirror.ts      # source-mode editor
│   │   ├── serializer.ts      # the ONE markdown <-> doc converter (§3.2)
│   │   └── modes.ts           # source / typewriter / focus toggles
│   ├── ui/
│   │   ├── sidebar.ts         # file tree
│   │   ├── tabs.ts            # open-document tabs
│   │   └── statusbar.ts       # word count, cursor position
│   ├── themes/                # CSS theme files
│   ├── sanitize.ts            # HTML sanitization (§3.3)
│   └── ipc.ts                 # thin wrappers around Tauri invoke()
└── src-tauri/                 # BACKEND (Rust)
    ├── Cargo.toml             # pinned
    ├── tauri.conf.json
    ├── build.rs
    └── src/
        ├── main.rs            # Tauri builder + command registration
        ├── commands/
        │   ├── files.rs       # open / save (ATOMIC) / save_as / recent
        │   ├── workspace.rs   # open folder, list tree, watch (notify crate)
        │   ├── export.rs      # to_html, to_pdf
        │   └── images.rs      # persist pasted clipboard image into assets
        ├── markdown.rs        # comrak config (GFM, front matter, footnotes)
        └── settings.rs        # persisted prefs (theme, mode, last folder)
```

---

## 5. Backend ↔ Frontend Contract (Tauri commands)

Authoritative list. Update it here whenever a command changes. **All disk access lives in Rust** — the frontend never touches the filesystem directly; it asks via `invoke()`.

| Command | Args | Returns | Notes |
|---|---|---|---|
| `open_file` | `path` | `{ path, content }` | UTF-8 read |
| `save_file` | `path, content` | `()` | **atomic** (temp + fsync + rename) — §3.1 |
| `save_file_as` | `content` | `path` | native dialog |
| `open_folder` | `path` | `FileNode[]` | recursive `.md` tree |
| `watch_folder` | `path` | event stream | external-change events (`notify` crate) |
| `export_html` | `content, theme` | `path` | comrak → standalone styled HTML |
| `export_pdf` | `content, theme` | `path` | webview print-to-PDF (§7) |
| `save_clipboard_image` | `bytes, doc_path` | `relative_path` | writes to `./assets/`, returns MD-relative path |
| `load_settings` / `save_settings` | — / `Settings` | `Settings` / `()` | JSON in app config dir |

---

## 6. Feature ↔ Milkdown Plugin Mapping

| Feature | Implementation |
|---|---|
| WYSIWYG core | `@milkdown/core` + `@milkdown/preset-commonmark` |
| GFM (tables, task lists, strikethrough) | `@milkdown/preset-gfm` |
| Math (KaTeX) | `@milkdown/plugin-math` |
| Emoji shortcodes | `@milkdown/plugin-emoji` |
| Inline / slash shortcuts | `@milkdown/plugin-slash` + keymap config |
| Front matter | comrak handles on export; render as a collapsed block in-editor |
| Source mode | swap Milkdown view for CodeMirror 6, both backed by `serializer.ts` |
| Typewriter mode | scroll controller keeps caret line vertically centered |
| Focus mode | CSS dims every block except the active one |
| Themes | swappable CSS + Milkdown theme; choice persisted in settings |
| Clipboard image paste | intercept `paste` → `save_clipboard_image` → insert `![](assets/…)` |

---

## 7. Export Strategy

**HTML:** `export_html` runs comrak with GFM + math + front-matter options, wraps the output in a template that inlines the selected theme CSS + KaTeX stylesheet. Standalone, opens in any browser.

**PDF (in order of preference):**
1. **Webview print-to-PDF** — render the export HTML in a hidden Tauri webview, print to PDF. No extra binary, best fidelity. *Preferred.*
2. `headless_chrome` crate — heavier, needs Chrome present.
3. Pure-Rust PDF — avoid; weak CSS/KaTeX support.

Ship HTML export in Phase 3; add PDF after it's stable.

---

## 8. Milestones (with gates)

One milestone per branch. Each ends runnable + committed. Don't skip the gates.

**Phase 0 — Scaffold** ✅ *done*
- `create-tauri-app` (Vite + TS). Window opens; one round-trip command works.
- Shipped: Tauri 2 + Vite + TS scaffold; `ping` IPC round-trip via `src/ipc.ts`. (Window launch verified on a machine with platform webview deps — see §0.)

**Phase 1 — MVP editor + data safety** ✅ *core done (gates green); GUI flows need on-device verification*
- ✅ Milkdown WYSIWYG editing a buffer; `serializer.ts` is the only converter.
- ✅ `open_file` / `save_file` (**atomic**, via `fsatomic`) / `save_file_as`; Ctrl+S/O/N; dirty indicator; title shows file + `*`.
- ✅ **GATE:** round-trip test (`tests/roundtrip.test.ts`, `pnpm test`). Covers headings, lists, tables, code fences, blockquotes, inline marks, links, task lists, strikethrough. ⚠️ **math + front matter deferred to Phase 3** (their plugins land then); add those fixtures at that point. (§3.2)
- ✅ **GATE:** atomic-save test (`cargo test -p fsatomic`) — interrupting a save leaves the original intact. (§3.1)
- ⏳ Open/Save dialogs and the dirty-title behavior are unverified in a live window (no webview here) — verify with `pnpm tauri dev` on a webview-capable machine.

**Phase 2 — Workspace** ✅ *implemented; GUI flows need on-device verification*
- ✅ `open_folder` (`vaultscan` crate, tested) + sidebar tree (`src/ui/sidebar.ts`); multi-document tabs (`src/ui/tabs.ts`, tested).
- ✅ `watch_folder` (`notify` crate) → `workspace:change` events; `main.ts` debounces a sidebar refresh and prompts to reload the active file on external change (self-writes suppressed to avoid prompting on our own saves). Obsidian-vault aware: hidden/`.obsidian` entries are skipped.
- ⏳ Sidebar clicks, tab switching, and watcher reload prompts are unverified in a live window (no webview here).

**Phase 3 — MarkText parity**
- GFM, math, emoji plugins.
- Source / Typewriter / Focus modes.
- Themes (≥1 light, ≥1 dark) + persisted settings.
- `sanitize.ts` wired into all rendered content. (§3.3)
- Clipboard image paste.
- HTML export, then PDF export.

**Phase 4 — Polish & ship**
- App menu, shortcut reference, word count in status bar.
- `pnpm tauri build` → `.exe` + NSIS installer.

---

## 9. Windows Packaging

```bash
pnpm install
pnpm tauri dev          # development

pnpm tauri build        # production -> .exe + installer
```

Output: `src-tauri/target/release/` (raw `.exe`) and `…/bundle/` (NSIS + MSI).

In `tauri.conf.json`: `bundle.targets = ["nsis","msi"]`; `bundle.windows.webviewInstallMode = "downloadBootstrapper"` (handles Win10 WebView2); set icon, product name, version, publisher.

Code signing is optional for personal use; without it, Windows SmartScreen warns on first run. That's expected, not a bug — note it for the user.

---

## 10. Conventions for Claude Code

- **Read this file first every session.** §3 (Data Safety), §5 (command contract), and §8 (milestones) are the source of truth — update them here when they change.
- All disk I/O stays in Rust commands. The frontend never bypasses with web file APIs.
- All markdown conversion goes through `serializer.ts`. Never introduce a second conversion path.
- Saves are always atomic (temp + fsync + rename).
- Everything rendered in the webview passes through `sanitize.ts`.
- Rust: edition 2024; `cargo fmt` + `cargo clippy` clean before any commit. (When `create-tauri-app` scaffolds `src-tauri/` with edition 2021, bump it to 2024 to match.)
- TS: `strict` on; no `any`.
- One milestone per branch; conventional commits (`feat:`, `fix:`, `chore:`). Don't skip the Phase 1 gates.
- When two designs compete, prefer the one that keeps `.md` files plain and portable (Obsidian-compatible).

---

## 11. Known Hard Parts / Risks

- **Round-trip fidelity** (§3.2) is where most bugs hide — nested lists, table editing, code-fence boundaries. Lean on Milkdown's tested behavior; minimize custom schema. This is why it's a Phase 1 gate, not an afterthought.
- **PDF fidelity** for KaTeX + code highlighting — validate early in Phase 3.
- **External file changes** — the watcher + reload prompt matters more than it looks when the folder is also an Obsidian vault.
- **WYSIWYG edge cases** generally — prefer configuring Milkdown over hand-rolling ProseMirror nodes.

---

*Pure-Rust (egui) split-pane alternative was considered and rejected: it would trade away the inline WYSIWYG feel that is the whole point. Decision is closed.*
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

**Phases 0–3 are implemented and Phase 4 is in progress; all gates pass.** Tauri 2 + Vite + TypeScript, §4 split (frontend at repo root, Rust in `src-tauri/`). Phase 3 is complete except deferred PDF (§7); Phase 4 has the status bar + native menu done, packaging shipping via CI.

What exists today:
- **Milkdown WYSIWYG** editor (`src/editor/milkdown.ts`): CommonMark + GFM (tables, task lists, strikethrough) + change listener. Mounted by `src/main.ts`.
- **`src/editor/serializer.ts`** is the single canonical converter (§3.2): `docToMarkdown` / `markdownToDoc`, wrapping Milkdown's own remark pipeline. Nothing else converts markdown.
- **File commands** (§5, all disk I/O in Rust): `open_file`, `save_file`, `save_file_as` in `src-tauri/src/commands/files.rs`. Writes go through the **`fsatomic`** crate — a dependency-free, unit-tested atomic-write core (temp + fsync + rename, §3.1).
- **Workspace** (Phase 2): `open_folder` + `watch_folder` in `src-tauri/src/commands/workspace.rs`. Folder scanning lives in the dependency-free **`vaultscan`** crate (`.md` tree, skips hidden/`.obsidian`, prunes asset-only dirs). `watch_folder` uses the **`notify`** crate and emits `workspace:change` events. Frontend: `src/ui/sidebar.ts` (file tree), `src/ui/tabs.ts` (multi-document tabs, one shared editor + per-tab buffer), with external-change reload prompts in `main.ts`.
- **App controller** (`src/main.ts`): New/Open/Open Folder/Save/Save As (buttons + Ctrl+N, Ctrl+O, Ctrl+Shift+O, Ctrl+S, Ctrl+Shift+S), dirty flag, title shows `name *`. All backend calls go through `src/ipc.ts` (§5 rule).
- **Session memory** (`src-tauri/src/settings.rs`): `load_settings` / `save_settings` (§5) persist a versioned `session.json` to the app config dir (outside the vault) via `fsatomic`. On launch `main.ts` restores the last workspace folder + open file tabs + active tab + the theme preference; only *paths* are stored for files (re-read from disk, §3.2), and missing folders/files are skipped defensively. Best-effort — a failed save never interrupts editing.
- **Themes** (Phase 3, `src/ui/theme.ts`): a System/Light/Dark preference resolved to a concrete palette and written to `html[data-theme]`; all colors are CSS variables in `styles.css`, so switching is one attribute write. The editor's nord prose is overridden to follow the chosen theme (decoupled from the OS scheme). Header `#theme-select`; preference persisted via `Settings.theme`.
- **HTML export** (Phase 3, §7): `markdown_to_html` renders via the testable **`mdhtml`** crate (comrak, GFM + front matter, raw-HTML pass-through); `main.ts` sanitizes that output through `sanitize.ts` (§3.3), `src/export/html.ts` wraps it in a theme-aware standalone document, and `export_html` writes it atomically through a native save dialog. Buttons: `#btn-export` + Ctrl+E.
- **RTF export** (Phase 3, §7): `export_rtf` renders via the testable **`mdrtf`** crate (comrak AST → RTF control words) and writes atomically — all in Rust, no webview/sanitize step (RTF is inert). Button: `#btn-export-rtf`. Opens in Word/LibreOffice/WordPad/TextEdit. *(Shipped instead of PDF — §7.)*
- **Clipboard image paste** (Phase 3, §6): a `$prose` `handlePaste` plugin in `milkdown.ts` detects a pasted image, `save_clipboard_image` persists it to `assets/` beside the doc (via the testable **`imgasset`** crate — magic-byte format sniff + content-hash filename for dedup + atomic write), and it's inserted as a canonical image node (`insertImageCommand`, not raw text). Requires a saved document (the `assets/…` link needs a location); pasting into an Untitled doc shows a "save first" hint.
- **Status bar** (Phase 4, `src/ui/statusbar.ts`): live word/character count + reading-time estimate + block-relative cursor `Ln/Col` in the footer (`#docstats`), updated on edits and selection moves; shows "N of M words" with a selection. Counts document *text*, not markdown source.
- **Native app menu** (Phase 4, `src-tauri/src/menu.rs`): File / Edit (predefined) / View (Toggle Sidebar) / Help (About). Custom items emit a `menu` event that `main.ts` routes to the same handlers as the buttons. No item accelerators (the keydown handler is the single shortcut path — no double-fire); shortcuts shown in labels.
- **QoL** (Phase 4): **Find & Replace** (`src/ui/search.ts`, Ctrl+F — a hand-rolled decoration plugin + bar on Milkdown's ProseMirror, no extra dep); **Save All** (Ctrl+Alt+S); **toggle sidebar** (Ctrl+\, persisted via `Settings.sidebar_visible`); **unsaved-changes guard on window close** (`installCloseGuard` in `ipc.ts`, via the frontend window `onCloseRequested` — §3).
- **Formatting toolbar** (Phase 3, `src/ui/toolbar.ts`): the edit-pane toolbar above the editor (mounted in `app.html` `#format-toolbar`, distinct from the file-actions `#toolbar`). Every button drives a Milkdown command via `callCommand` (or, for task lists / clear-formatting / emoji, a plain ProseMirror transaction) — it **never** inserts raw markdown text (§3.2). Covers: heading H1–H6 + paragraph (select), bold, italic, strikethrough, inline code, bullet/ordered/task lists, blockquote, code block, table, HR, link, image, an emoji picker (inserts the unicode char, the canonical form), and clear-formatting. Buttons reflect active state (e.g. bold lit when the selection is strong) via `activeState()`. The command layer is exported separately from the DOM so the gate can test it headlessly. Front matter is **deferred** (not lossless yet — §0); the cheat-sheet extras (footnote, heading id, definition list, highlight, sub/superscript, math) stay deferred per §8; underline is omitted by design (no markdown form).
- **Gates green:** atomic-save → `cargo test -p fsatomic` (5 tests). Round-trip → `pnpm test` (`tests/roundtrip.test.ts`, real Milkdown in jsdom, 16 — CommonMark + GFM + emoji). Toolbar round-trip → `tests/toolbar.test.ts` (19, §3.2: each command matches typing the equivalent syntax + asserts no raw-markdown-text insertion). Export render configs → `cargo test -p mdhtml` (5) + `cargo test -p mdrtf` (12). Export pipeline → `tests/export.test.ts` (6: standalone builder + the §3.3 sanitization chokepoint). Themes → `tests/theme.test.ts` (6). Clipboard-image asset logic → `cargo test -p imgasset` (4). Status-bar counters → `tests/statusbar.test.ts` (9). Find-in-text → `tests/search.test.ts` (5). Data-safety → `tests/security.test.ts` (7, §3.3). Plus `vaultscan` (3) and `tabs.test.ts` (8). Total `pnpm test`: 76; logic crates: 29 (`fsatomic` 5, `vaultscan` 3, `mdhtml` 5, `mdrtf` 12, `imgasset` 4).

**Not yet done / deferred:**
- **Round-trip gate covers CommonMark + GFM + emoji.** Math is **deferred** (its only plugin is deprecated — §8). YAML front matter still needs handling and is **not** yet guaranteed lossless — add its fixtures to `roundtrip.test.ts` when that lands.
- **Formatting is normalized to Milkdown's canonical form** on first save (tight lists → loose, `---` → `***`). Reformats whitespace but never drops content and is idempotent thereafter (documented WYSIWYG trade-off; see the normalization test). Relevant to Obsidian-vault diffs (§1).
- **All GUI flows are unverified** (dialogs, Ctrl+S, tabs, sidebar, watcher reload, toolbar buttons + emoji picker + active-state highlighting, theme switching, export save dialog, clipboard image paste, the native menu + About dialog, the status bar, Find & Replace, Save All, sidebar toggle, the unsaved-changes close guard) — they need the webview; see the build-environment note. Verify on a machine with platform webview deps. Logic layers (toolbar commands, theme controller, export builder/sanitize, comrak render, imgasset, status-bar counters) are gated headlessly, but DOM/menu/dialog wiring is not — and the native menu (`menu.rs`) can't even be compiled here (app crate needs the webview to link).
- Tab switching does **not** preserve per-tab undo history (single shared editor; content is swapped). Acceptable for now; revisit if it bites.
- **Source / Typewriter / Focus edit modes were dropped** as low-value (§8) — not deferred-pending, just not planned unless asked for.
- **PDF export** remains deferred (§7). Phase 4's status bar + native menu are done; remaining is optional code-signing and on-device verification. YAML front matter still isn't guaranteed lossless in the round-trip gate (§8).

### Commands
```bash
pnpm install          # first time (pnpm via `corepack enable pnpm`)
pnpm tauri dev        # run the app (opens the window)
pnpm tauri build      # production .exe + installer (Windows; see §9)

pnpm test             # vitest — round-trip + toolbar + theme + export + tabs + security (jsdom)
pnpm typecheck        # tsc --noEmit (TS strict)
pnpm build            # tsc + vite build (frontend only)
cd src-tauri && cargo test -p fsatomic -p vaultscan -p mdhtml -p mdrtf -p imgasset   # logic crates (no webview needed)
# (plain `cargo test` also builds the app crate → needs the webview toolchain)
cd src-tauri && cargo fmt --all && cargo clippy   # clean before commit (§10)
```

**Build environment note.** The Rust **app** crate links against the system webview (Windows: WebView2; Linux: WebKitGTK-4.1 + `pkg-config`). On a box without those, the frontend (`pnpm build`/`test`/`typecheck`), the `fsatomic` tests, and `cargo generate-lockfile` all work, but a full `cargo build`/`tauri dev` will not link. The window must be launched on a machine with the platform webview deps (the Windows target, or a Linux box with `libwebkit2gtk-4.1-dev`). `fsatomic` is split out partly so the §3.1 gate stays runnable everywhere.

**Next: finish Phase 4** — done: Phase 3 plus Phase 4's status bar (word/char/reading-time + cursor), native menu, and a QoL batch (Find & Replace, Save All, toggle sidebar, unsaved-changes close guard); packaging ships via CI on each `v*` tag. Math **deferred** (deprecated plugin — §8); edit modes **dropped** (§8); PDF **deferred** (§7); shortcut-reference panel **deferred** (the menu lists shortcuts). Remaining is mostly shippable-quality work: optional code-signing (removes the SmartScreen warning — see the code-signing memory), and on-device verification of the GUI/Rust flows that can't be tested here.

---

## 1. Goal

**Toril** is a desktop markdown editor with the look and feel of **MarkText**:

- **Inline WYSIWYG** editing — type `# ` and the line becomes a heading *in place*; `**bold**` renders as you go. The editing surface *is* the rendered surface (no separate preview pane required).
- CommonMark + GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks, footnotes).
- Math (KaTeX), YAML front matter, emoji shortcodes.
- Export to **HTML** and **PDF**.
- Multiple themes (light + dark). *(Source / Typewriter / Focus edit modes were considered and **dropped as low-value** — see §8.)*
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

**Only depend on healthy packages.** Never add a dependency that is deprecated, unmaintained, or low-reputation. Before adding one, confirm it is not flagged `deprecated` (npm / crates.io), has a recent publish history, and comes from a reputable publisher. If a feature's *only* viable dependency is unhealthy, **defer the feature** (note the deferral in §8) rather than shipping the bad dep.

**One vendored exception — security-patched `glib`.** `src-tauri/third-party/glib/` is gtk-rs `glib` 0.18.5 vendored verbatim except a one-line fix for **GHSA-wrw7-89jp-8q8g** (a `VariantStrIter` NULL-deref), wired in via `[patch.crates-io]` in `src-tauri/Cargo.toml`. It exists only because Tauri's frozen gtk3 stack pins a vulnerable glib with no 0.18.x backport (glib 0.20 is incompatible). It is `exclude`d from the Cargo workspace, so we never fmt/clippy/test upstream code — and CodeQL findings inside it (e.g. `rust/access-invalid-pointer` on sound FFI derefs) are false positives, dismissed as *won't fix*. Don't edit it beyond the security patch; **remove the whole vendored crate** once Tauri moves off gtk3 and a non-vulnerable glib comes in transitively. Full rationale is in the `Cargo.toml` patch comment.

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
│   │   └── serializer.ts      # the ONE markdown <-> doc converter (§3.2)
│   ├── ui/
│   │   ├── sidebar.ts         # file tree
│   │   ├── tabs.ts            # open-document tabs
│   │   ├── toolbar.ts         # formatting toolbar (commands + active state, §6)
│   │   ├── theme.ts           # theme preference controller (System/Light/Dark, §6)
│   │   ├── statusbar.ts       # word/char count + reading time + cursor (§8 Phase 4)
│   │   └── search.ts          # Find & Replace (decoration plugin + bar, §8 Phase 4)
│   ├── export/
│   │   └── html.ts            # standalone HTML-document builder (§7)
│   ├── styles.css             # app chrome + theme CSS variables (per data-theme)
│   ├── sanitize.ts            # HTML sanitization (§3.3)
│   └── ipc.ts                 # thin wrappers around Tauri invoke()
└── src-tauri/                 # BACKEND (Rust)
    ├── Cargo.toml             # pinned; workspace = app + crates/*
    ├── tauri.conf.json
    ├── build.rs
    ├── crates/                # dependency-light, webview-free, unit-tested cores
    │   ├── fsatomic/          # atomic writes (§3.1)
    │   ├── vaultscan/         # markdown-tree scanner (§5 open_folder)
    │   ├── mdhtml/            # comrak markdown→HTML for export (§7)
    │   ├── mdrtf/             # comrak markdown→RTF for export (§7)
    │   └── imgasset/          # save pasted clipboard images beside the doc (§6)
    └── src/
        ├── main.rs            # bin entry → lib::run()
        ├── lib.rs             # Tauri builder + menu + command registration
        ├── menu.rs            # native app menu (File/Edit/Help) → `menu` events (§8)
        ├── commands/
        │   ├── files.rs       # open / save (ATOMIC) / save_as
        │   ├── workspace.rs   # open folder, list tree, watch (notify crate)
        │   ├── export.rs      # markdown_to_html + export_html (HTML); export_rtf (mdrtf, all-Rust)
        │   └── images.rs      # save_clipboard_image — persist pasted image into assets (imgasset)
        └── settings.rs        # persisted prefs (theme, last folder, open files)
```
> Note: comrak lives in the `crates/mdhtml` crate (not a `markdown.rs` in the app
> crate) so its render config is unit-testable without the webview, like
> fsatomic/vaultscan. Source/Typewriter/Focus modes (`editor/codemirror.ts`,
> `editor/modes.ts`) and `statusbar.ts` are **deferred** (§8) so are not present.

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
| `markdown_to_html` | `content` | `html` | comrak (`mdhtml` crate) → **untrusted** HTML body; caller sanitizes (§3.3, §7) |
| `export_html` | `html, defaultName` | `path?` | native dialog + **atomic** write of an already-sanitized standalone doc; `null` if cancelled |
| `export_rtf` | `content, defaultName` | `path?` | renders (comrak via `mdrtf`) **and** writes, all in Rust; inert output, no sanitize step (§7); `null` if cancelled |
| `export_pdf` | `content, theme` | `path` | *(deferred — see §7)* |
| `save_clipboard_image` | `bytes, docPath` | `relative_path` | ✅ writes pasted image to `./assets/` (via `imgasset`), returns MD-relative path (§6) |
| `load_settings` / `save_settings` | — / `Settings` | `Settings` / `()` | JSON in app config dir; `Settings` includes `theme` + `sidebar_visible` |

> **HTML export is split** across two commands so the single sanitization path
> holds (§3.3): `markdown_to_html` renders (comrak, raw HTML passed through), the
> **frontend** runs the result through `sanitize.ts` and builds the standalone
> document, then `export_html` writes that finished HTML atomically. comrak never
> writes files; sanitize never moves to Rust.
>
> **Events (Rust → frontend):** `workspace:change` (file watcher, §5) and `menu`
> (native menu item id `menu_*`, §8 — the frontend maps it to the same handlers
> as the toolbar buttons). Subscribe via `onWorkspaceChange` / `onMenuAction` in
> `ipc.ts`. The window **close guard** uses the frontend window API
> (`onCloseRequested`), not a command — see `installCloseGuard` in `ipc.ts`.

---

## 6. Feature ↔ Milkdown Plugin Mapping

| Feature | Implementation |
|---|---|
| WYSIWYG core | `@milkdown/core` + `@milkdown/preset-commonmark` |
| GFM (tables, task lists, strikethrough) | `@milkdown/preset-gfm` |
| Math (KaTeX) | **Deferred** — `@milkdown/plugin-math` is deprecated; omitted until a maintained option exists (§8) |
| Emoji shortcodes | `@milkdown/plugin-emoji` |
| Inline / slash shortcuts | `@milkdown/plugin-slash` + keymap config |
| Formatting toolbar | toolbar UI in the edit pane → Milkdown commands via `callCommand` (headings H1–H6, marks, lists, blockquote, code, link, image, table, HR; emoji picker); never inserts raw markdown text (§3.2) |
| Front matter | comrak handles on export; render as a collapsed block in-editor |
| Source / Typewriter / Focus modes | **Deferred — dropped as low-value (§8).** Source mode would swap Milkdown for CodeMirror 6 (both backed by `serializer.ts`); revisit only on demand |
| Themes | ✅ done — `theme.ts` writes `html[data-theme]`; colors are CSS variables in `styles.css`; System/Light/Dark, choice persisted in settings |
| Clipboard image paste | ✅ done — a `$prose` `handlePaste` plugin (`milkdown.ts`) detects an image, `save_clipboard_image` writes it to `assets/` (via `imgasset`), and it's inserted with `insertImageCommand` (canonical node, not raw text — §3.2). Requires a saved doc (the relative path needs a location). |

---

## 7. Export Strategy

**HTML — ✅ implemented.** A three-stage pipeline that preserves the single sanitization chokepoint (§3.3):
1. **Render (Rust):** `markdown_to_html` calls the `mdhtml` crate (comrak with GFM + front matter, `render.unsafe_` on so raw HTML passes through). Output is **untrusted**.
2. **Sanitize + template (frontend):** `main.ts` runs the body through `sanitize.ts` (DOMPurify), then `export/html.ts` `buildStandaloneHtml` wraps it in a self-contained document with the active theme's light/dark CSS inlined.
3. **Write (Rust):** `export_html` opens the native save dialog and **atomically** writes the finished HTML (§3.1).
Math (KaTeX) is omitted — deferred (§8); add the KaTeX stylesheet to the template when math lands.

**RTF — ✅ implemented.** Single-step, all in Rust: `export_rtf` calls the `mdrtf` crate, which walks comrak's AST and emits RTF control words directly, then writes it atomically via the save dialog. **No sanitization step** — RTF is inert (opened by a word processor, not the webview), `mdrtf` RTF-escapes all text and emits any source HTML as literal characters, and export is one-way so §3.2 doesn't apply. Covers headings, bold/italic/strike/inline code, code blocks, links (HYPERLINK fields), bullet/ordered/task lists, blockquotes, thematic breaks, tables, and front-matter exclusion; non-ASCII (incl. emoji) → `\uN?` escapes. Images become a labelled placeholder (no binary embedding). Opens in Word/LibreOffice/WordPad/TextEdit.

**PDF — deferred (decided not worth it at current maturity).** The HTML export already gives a faithful manual PDF path (open the `.html` → browser Print → "Save as PDF"). Programmatic PDF in Tauri 2 has **no core API**; it requires per-platform `with_webview` FFI — Windows `ICoreWebView2_7::PrintToPdf` (via `webview2-com`, cleanest), macOS `WKWebView.createPDF`, Linux `WebKitPrintOperation` — which is unsafe, unverifiable without each platform's webview, and disproportionate effort for an alpha. Revisit on a Windows box if demand appears; `headless_chrome` (needs a Chrome binary) and pure-Rust HTML→PDF (weak CSS fidelity) remain rejected under §2/§10.

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

**Phase 3 — MarkText parity** *(effectively complete: GFM, emoji, formatting toolbar, themes, HTML + RTF export, and clipboard image paste are done + gated; edit modes dropped as low-value; math + PDF deferred)*
- ✅ GFM (done) + emoji plugin (`@milkdown/plugin-emoji`, maintained).
- **Math (KaTeX) — DEFERRED.** The only Milkdown math plugin (`@milkdown/plugin-math`) is npm-**deprecated** ("no longer supported"), so it is omitted per the healthy-dependency rule (§2/§10). Revisit if a maintained math plugin appears, or if we hand-roll one on a maintained KaTeX + `remark-math` base. Until then the round-trip gate stays CommonMark + GFM + emoji.
- ~~Source / Typewriter / Focus modes.~~ **DROPPED as low-value** (user decision, 2026-05-26). Not built; revisit only on explicit demand. Source mode (CodeMirror 6, §2) would be the substantial part if it returns.
- ✅ **Themes (≥1 light + ≥1 dark) + persisted settings** — *done*. `src/ui/theme.ts` resolves a System/Light/Dark preference and writes `html[data-theme]`; all colors are CSS variables in `styles.css` (the editor's nord prose is overridden to follow the chosen theme, decoupled from the OS scheme). The preference persists via `Settings.theme` (`settings.rs`) alongside the existing session (last folder + open files/active tab). Header `#theme-select` control. Gate: `tests/theme.test.ts` (6).
- ✅ **`sanitize.ts` (§3.3)** — module + unit tests done, editor audited safe (renders HTML as inert text), **and now wired into HTML export** (the real HTML sink): comrak output is sanitized on the frontend before it is templated + written. (Re-used by PDF export when that lands.)
- ✅ **Clipboard image paste** — *done* (`milkdown.ts` paste plugin + `save_clipboard_image` + `crates/imgasset`; §6). Pasting an image writes it to `assets/` beside the doc (content-hashed name → dedup), inserts a canonical image node. Blocked on unsaved docs (the relative link needs a saved location). Gate: `crates/imgasset` (4).
- ✅ **Formatting toolbar (edit pane)** — *done* (`src/ui/toolbar.ts`, mounted at `app.html` `#format-toolbar`). A toolbar above the editor whose buttons insert or toggle markdown components. **Each button drives a Milkdown/ProseMirror command via the editor's `callCommand`** (e.g. `wrapInHeadingCommand`, `toggleStrongCommand`, `wrapInBulletListCommand`, `insertImageCommand`, `insertTableCommand`) — it **never inserts raw markdown characters as text** (the few items without a command — task list, clear-formatting, emoji — use a plain ProseMirror transaction, still not raw text). That keeps the document in one canonical form and routes every change through `serializer.ts` like any other edit, so there is no second conversion path (§3.2). Buttons reflect active state where the command exposes it (e.g. "bold" lit when the selection is strong), via `activeState()`. The pure command layer (`editorCommands`) is exported separately from the DOM `FormattingToolbar` class so the gate tests it headlessly. Distinct from the file-actions `#toolbar`; complements the keymap shortcuts rather than replacing them.
  - **Components (the coverage target — MarkText menu + the [Markdown Guide cheat sheet](https://www.markdownguide.org/cheat-sheet/)):** *Basic* — headings **H1–H6** + paragraph (a `<select>`), bold, italic, blockquote, ordered (`1.`) / unordered lists, inline code, horizontal rule, link, **image** (toolbar insert; clipboard-paste path is separate — see §6). *Extended (GFM, supported today)* — table, fenced code block, strikethrough, task list, emoji (an inline picker that inserts the **unicode emoji char** — the canonical form per the round-trip gate; inserting `:shortcode:` text would not auto-convert, so the char is the lossless choice). Plus a **clear-formatting** action (strips inline marks). **Front-matter block button is deferred** — front matter is not yet lossless (§0) and no front-matter plugin is loaded, so a button could only insert raw `---` text; add it once front matter round-trips.
  - **Deferred — not exposed until a healthy plugin + lossless round-trip exist (§2/§10), same policy as math:** cheat-sheet *footnote, heading ID, definition list, highlight (`==`), subscript, superscript*, and *math (KaTeX)* (already deferred). A button is added **only** once that component round-trips losslessly; never ship a control for syntax the editor can't represent.
  - **Deliberately omitted:** *underline* — it has no markdown form (MarkText emits raw `<u>` HTML), so a button would inject non-portable HTML and break the plain-`.md` / Obsidian goal (§1).
- ✅ **GATE:** toolbar round-trip — *done* (`tests/toolbar.test.ts`, 19). Applying a format via a command yields the same canonical markdown as typing the equivalent syntax (compared against a `serializer.ts` round-trip of the hand-typed form), and the suite asserts no raw-markdown-text insertion (the document's text content is unchanged after an inline format — the syntax lives as marks/nodes, never literal `**`/`> ` characters). Kept in its own file rather than `roundtrip.test.ts` to isolate the command-layer fixtures (§3.2).
- ✅ **HTML export** — *done* (`markdown_to_html` + `export_html`, `crates/mdhtml`, `src/export/html.ts`; §7). Sanitized via `sanitize.ts`, theme-aware standalone document, atomic write. Gate: `crates/mdhtml` (5, render config) + `tests/export.test.ts` (6, builder + the §3.3 chokepoint).
- ✅ **RTF export** — *done* (`export_rtf`, `crates/mdrtf`; §7). All-Rust (comrak AST → RTF control words → atomic write); no webview/sanitize step since RTF is inert. Gate: `crates/mdrtf` (12). Opens in Word/LibreOffice/WordPad/TextEdit. *(Added in place of PDF, which was judged not worth the per-platform FFI at this maturity — §7.)*
- **PDF export — deferred** (§7): the HTML export already covers a manual browser "Save as PDF"; programmatic PDF needs unverifiable per-platform webview FFI. With clipboard image paste now done, Phase 3 is effectively complete except deferred PDF; **next is Phase 4 polish** (status-bar word count, app menu).

**Phase 4 — Polish & ship** *(in progress)*
- ✅ **Status bar** — *done* (`src/ui/statusbar.ts`): live word/char count, reading-time estimate (~200 wpm), block-relative cursor `Ln/Col`, "N of M words" on a selection. Counts the document *text*, not markdown source. Gate: `tests/statusbar.test.ts` (9, pure helpers).
- ✅ **Native app menu** — *done* (`src-tauri/src/menu.rs`): File (New/Open/Open Folder/Save/Save As/Save All/Export HTML/Export RTF/Quit), Edit (predefined undo/cut/copy/paste/select-all), View (Toggle Sidebar), Help (About). Custom items emit a `menu` event the frontend maps to the toolbar handlers. **No accelerators on items** — the frontend keydown handler stays the single shortcut path so clicks and shortcuts can't double-fire; the shortcut shows in the label. *(App-crate Rust — not compile-verified here; needs the webview.)*
- ✅ **QoL batch** — *done*:
  - **Find & Replace** (`src/ui/search.ts`): hand-rolled on Milkdown's bundled ProseMirror (no `prosemirror-search` dep, avoiding a duplicate ProseMirror) — a `$prose` decoration plugin highlights matches; a `SearchBar` drives next/prev/replace/replace-all + a match count. Ctrl+F opens, Esc closes; case-insensitive, single-text-node matches. Gate: `tests/search.test.ts` (5, `findInText`).
  - **Save All** (`Ctrl+Alt+S`, button, File menu): saves every dirty file-backed tab; Untitled tabs are skipped (they need Save As).
  - **Toggle sidebar** (`Ctrl+\`, ☰ button, View menu): collapses the workspace pane; the choice persists via `Settings.sidebar_visible`.
  - **Unsaved-changes guard on close** (`ipc.ts installCloseGuard`): the window's `onCloseRequested` (frontend window API — no Rust) intercepts a close when tabs are dirty and asks to confirm before destroying the window (§3 data safety).
- Shortcut reference — *deferred* (not requested; the menu now lists the shortcuts).
- ✅ **Packaging** — `pnpm tauri build` → `.exe` + NSIS/MSI; cross-platform installers are produced by the CI release workflow on every `v*` tag (§9). Currently unsigned (SmartScreen warning expected).

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

**Releases** are cut by pushing a `v*` git tag (e.g. `v0.1.0-alpha.5`), which triggers `.github/workflows/release.yml` — a cross-platform `tauri-action` build that publishes the installers as a GitHub prerelease. The point release is the next `-alpha.N`. **Always add the release's notes to `CHANGELOG.md` before pushing the tag** (see §10); the changelog is the source of truth for the GitHub Release body. After the build finishes, set the Release notes from that changelog entry.

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
- **Before performing a release (pushing a `v*` tag, §9), add that version's release notes to `CHANGELOG.md`** — it is the source of truth for the GitHub Release body.
- When two designs compete, prefer the one that keeps `.md` files plain and portable (Obsidian-compatible).

---

## 11. Known Hard Parts / Risks

- **Round-trip fidelity** (§3.2) is where most bugs hide — nested lists, table editing, code-fence boundaries. Lean on Milkdown's tested behavior; minimize custom schema. This is why it's a Phase 1 gate, not an afterthought.
- **PDF fidelity** for KaTeX + code highlighting — validate early in Phase 3.
- **External file changes** — the watcher + reload prompt matters more than it looks when the folder is also an Obsidian vault.
- **WYSIWYG edge cases** generally — prefer configuring Milkdown over hand-rolling ProseMirror nodes.

---

## 12. Future Ideas (out of scope — do not build into current milestones)

- **Multi-format structured editing (JSON / XML / YAML / TOML).** Idea: extend Toril into a human interface for machine-friendly formats, not just markdown. **Deferred** to keep the markdown editor whole; revisit only after it ships (possibly as a *separate*, structured-document-oriented app). If pursued, the shape is **one app with pluggable editor surfaces** — an `EditorProvider` registry keyed by file type, each provider honoring the §3.2 single-canonical-serializer contract. It is **not** Milkdown plugins (Milkdown/ProseMirror is prose-only; data formats need a structure-tree / typed-form engine, likely CodeMirror 6 + schema) and **not** a fork of the whole app (the Tauri shell, sidebar, tabs, and Rust file I/O are already format-agnostic — only the editor surface is markdown-specific). The hard part is lossless round-trip (§3.2), which is *worse* than markdown here: YAML comments/anchors/Norway-problem, JSON key order, XML namespaces/attribute order — a reordered key or dropped comment breaks machine consumers. Note: `tabs.ts` currently uses one shared Milkdown instance + per-tab buffers; multi-format would require per-tab provider instances.

---

*Pure-Rust (egui) split-pane alternative was considered and rejected: it would trade away the inline WYSIWYG feel that is the whole point. Decision is closed.*
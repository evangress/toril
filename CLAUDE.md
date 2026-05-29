# CLAUDE.md — Toril

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Toril** — a MarkText-style WYSIWYG markdown editor built on **Tauri + TypeScript + Milkdown**.
>
> *The name:* in Spanish bullfighting, *el toril* is the pen where the bull waits before it charges
> into the ring — a nod to **Tauri** (the bull) and to writing (the pen), with the bull-in-a-china-shop
> joke built in: the editor is the bull, safely penned, doing delicate work.

> The stack is **decided** (§2); do not re-litigate it. Treat §3 (Data Safety) as hard rules, not
> suggestions. The detailed per-feature shipped history lives in `CHANGELOG.md` and git — this file
> keeps the durable decisions, the contract, and what's still open.

---

## 0. Current State

**Phases 0–3 complete; Phase 4 (polish) in progress. All gates green.** Tauri 2 + Vite + TypeScript,
§4 split (frontend at repo root, Rust in `src-tauri/`).

Built today: Milkdown WYSIWYG (CommonMark + GFM + emoji) with `serializer.ts` as the single canonical
converter (§3.2); atomic file I/O (`fsatomic`); workspace sidebar + multi-document tabs + file watcher
(`vaultscan`, `notify`); session memory; themes (System/Light/Dark); HTML + RTF export (`mdhtml`,
`mdrtf`); clipboard image paste (`imgasset`); formatting toolbar; status bar; native menu; and a QoL
batch (Find & Replace, Save All, toggle sidebar, unsaved-changes close guard). See `CHANGELOG.md` for
the feature-by-feature record.

**Deferred / not done:**
- **Math (KaTeX)** — the only Milkdown math plugin (`@milkdown/plugin-math`) is npm-**deprecated**, so
  it's omitted per the healthy-dependency rule (§2). Revisit when a maintained option appears. The
  round-trip gate stays CommonMark + GFM + emoji until then.
- **YAML front matter** — not yet guaranteed lossless; comrak handles it on export only. Add its
  fixtures to `roundtrip.test.ts` when in-editor handling lands.
- **PDF export** — deferred (§7); HTML export → browser "Save as PDF" is the manual path.
- **Source / Typewriter / Focus edit modes** — *dropped as low-value* (user decision, 2026-05-26), not
  deferred-pending. Revisit only on explicit demand.
- **On-device GUI verification** — every dialog/menu/webview flow is unverified here (this box has no
  platform webview; the app crate can't even link). Logic layers are gated headlessly. Verify with
  `pnpm tauri dev` on a webview-capable machine.
- Tab switching does **not** preserve per-tab undo history (single shared editor, content swapped).
  Acceptable for now.

**Known trade-off:** formatting normalizes to Milkdown's canonical form on first save (tight→loose
lists, `---`→`***`). It reformats whitespace but never drops content and is idempotent thereafter —
relevant to Obsidian-vault diffs (§1).

**Next:** finish Phase 4 — remaining is shippable-quality work: optional code-signing (removes the
SmartScreen warning) and on-device verification. A backlog of further QoL features is in §13.

### Commands
```bash
pnpm install          # first time (pnpm via `corepack enable pnpm`)
pnpm tauri dev        # run the app (opens the window)
pnpm tauri build      # production .exe + installer (Windows; see §9)

pnpm test             # vitest — round-trip + toolbar + theme + export + tabs + security (jsdom)
pnpm typecheck        # tsc --noEmit (TS strict)
pnpm build            # tsc + vite build (frontend only)
cd src-tauri && cargo test -p fsatomic -p vaultscan -p mdhtml -p mdrtf -p imgasset   # logic crates
# (plain `cargo test` also builds the app crate → needs the webview toolchain)
cd src-tauri && cargo fmt --all && cargo clippy   # clean before commit (§10)
```

**Build environment note.** The Rust **app** crate links against the system webview (Windows: WebView2;
Linux: WebKitGTK-4.1 + `pkg-config`). On a box without those, the frontend (`pnpm build`/`test`/
`typecheck`), the logic-crate tests, and `cargo generate-lockfile` all work, but a full `cargo build`/
`tauri dev` will not link. Launch the window on a machine with the platform webview deps. `fsatomic`
and the other logic crates are split out so their gates stay runnable everywhere.

---

## 1. Goal

**Toril** is a desktop markdown editor with the look and feel of **MarkText**:

- **Inline WYSIWYG** editing — type `# ` and the line becomes a heading *in place*; the editing surface
  *is* the rendered surface (no separate preview pane).
- CommonMark + GitHub Flavored Markdown (tables, task lists, strikethrough, autolinks, footnotes).
- Math (KaTeX), YAML front matter, emoji shortcodes.
- Export to HTML and PDF.
- Multiple themes; paste image from clipboard; file/folder sidebar + multi-document tabs.

**Files are plain `.md` in ordinary folders — stay Obsidian-vault compatible.** No proprietary
container, no sidecar lock-in. The folder a user opens may also be a live Obsidian vault.

Primary target: **Windows `.exe`**. macOS/Linux come free from the stack but are not the focus.

---

## 2. Stack (decided — do not change without explicit instruction)

| Layer | Choice | Role |
|---|---|---|
| App shell / packaging | **Tauri 2.x** | Native window, menus, Rust commands, small `.exe`, NSIS/MSI installers |
| Core (backend) | **Rust** | All filesystem I/O, exports, file watching, app logic |
| WYSIWYG editor | **Milkdown** (ProseMirror-based) | Markdown-first inline WYSIWYG; plugin-driven |
| Source-mode editor | **CodeMirror 6** | (Only if Source mode returns — currently dropped, §0/§8) |
| Frontend build | **Vite + TypeScript** (strict) | Dev server + bundling |
| MD parsing (Rust) | **comrak** | CommonMark + GFM for HTML/RTF export and any backend parsing |

**Pin every dependency** (Cargo.lock committed; exact versions in package.json). Upgrade deliberately.

**Only depend on healthy packages.** Never add a dependency that is deprecated, unmaintained, or
low-reputation. Before adding one, confirm it isn't flagged `deprecated` (npm / crates.io), has recent
publish history, and comes from a reputable publisher. If a feature's *only* viable dependency is
unhealthy, **defer the feature** (note it in §0) rather than ship the bad dep.

**One vendored exception — security-patched `glib`.** `src-tauri/third-party/glib/` is gtk-rs `glib`
0.18.5 vendored verbatim except a one-line fix for **GHSA-wrw7-89jp-8q8g** (a `VariantStrIter`
NULL-deref), wired in via `[patch.crates-io]` in `src-tauri/Cargo.toml`. It exists only because Tauri's
frozen gtk3 stack pins a vulnerable glib with no 0.18.x backport (glib 0.20 is incompatible). It is
`exclude`d from the workspace (we never fmt/clippy/test upstream code), and CodeQL findings inside it
are false positives. Don't edit it beyond the security patch; **remove the whole vendored crate** once
Tauri moves off gtk3. Full rationale is in the `Cargo.toml` patch comment.

### Why this stack (so it isn't second-guessed later)
Inline WYSIWYG is the hard part of any markdown editor, and the mature engines for it live in the
browser DOM (ProseMirror/Milkdown). Tauri gives a Rust core + system webview, so we get that mature
editor **and** a small native binary — memory-safe (Rust core + GC'd webview), with no C/C++ in our code.

### Build-machine prerequisites (Windows)
Rust stable (`rustup`); Node.js LTS + **pnpm**; **Microsoft C++ Build Tools** (MSVC); **WebView2
runtime** (preinstalled on Win11, bootstrapped on Win10).

---

## 3. Data Safety — NON-NEGOTIABLE

This is a notes app. The user's writing is the only thing that truly matters. These three rules outrank
features.

1. **Atomic saves.** Never write a file in place. Write to a temp file in the same directory,
   flush/fsync, then atomically rename over the target. A crash mid-save must never corrupt an existing
   note. (Implemented in `fsatomic`.)
2. **Lossless round-tripping.** Source ⇄ WYSIWYG must not lose or mangle content. Maintain **one**
   canonical markdown representation; never keep two diverging buffers. All serialization goes through a
   single module (`serializer.ts`) so the conversion has exactly one source of truth.
3. **Treat opened files as untrusted.** A `.md` file (or pasted content) can carry hostile HTML.
   Sanitize anything rendered in the webview (`sanitize.ts`) so embedded markup cannot execute script.

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
│   ├── main.ts                # bootstrap / app controller
│   ├── editor/
│   │   ├── milkdown.ts        # WYSIWYG setup + plugins (incl. clipboard-image paste, §6)
│   │   └── serializer.ts      # the ONE markdown <-> doc converter (§3.2)
│   ├── ui/
│   │   ├── sidebar.ts         # file tree
│   │   ├── tabs.ts            # open-document tabs (one shared editor + per-tab buffer)
│   │   ├── toolbar.ts         # formatting toolbar (commands + active state, §6)
│   │   ├── theme.ts           # theme preference controller (System/Light/Dark)
│   │   ├── statusbar.ts       # word/char count + reading time + cursor
│   │   └── search.ts          # Find & Replace (decoration plugin + bar)
│   ├── export/html.ts         # standalone HTML-document builder (§7)
│   ├── styles.css             # app chrome + theme CSS variables (per data-theme)
│   ├── sanitize.ts            # HTML sanitization (§3.3)
│   └── ipc.ts                 # thin wrappers around Tauri invoke(); installCloseGuard
└── src-tauri/                 # BACKEND (Rust)
    ├── Cargo.toml             # pinned; workspace = app + crates/*
    ├── crates/                # dependency-light, webview-free, unit-tested cores
    │   ├── fsatomic/          # atomic writes (§3.1)
    │   ├── vaultscan/         # markdown-tree scanner (§5 open_folder)
    │   ├── mdhtml/            # comrak markdown→HTML for export (§7)
    │   ├── mdrtf/             # comrak markdown→RTF for export (§7)
    │   └── imgasset/          # save pasted clipboard images beside the doc (§6)
    └── src/
        ├── main.rs            # bin entry → lib::run()
        ├── lib.rs             # Tauri builder + menu + command registration
        ├── menu.rs            # native app menu → `menu` events (§8)
        ├── commands/
        │   ├── files.rs       # open / save (ATOMIC) / save_as
        │   ├── workspace.rs   # open folder, list tree, watch (notify crate)
        │   ├── export.rs      # markdown_to_html + export_html; export_rtf (all-Rust)
        │   └── images.rs      # save_clipboard_image (imgasset)
        └── settings.rs        # persisted prefs (theme, last folder, open files, sidebar_visible)
```
> comrak lives in `crates/mdhtml`/`mdrtf` (not the app crate) so its render config is unit-testable
> without the webview. Source/Typewriter/Focus modes are dropped (§0/§8), so no `codemirror.ts`/`modes.ts`.

---

## 5. Backend ↔ Frontend Contract (Tauri commands)

Authoritative list. Update it here whenever a command changes. **All disk access lives in Rust** — the
frontend never touches the filesystem directly; it asks via `invoke()`.

| Command | Args | Returns | Notes |
|---|---|---|---|
| `open_file` | `path` | `{ path, content }` | UTF-8 read |
| `save_file` | `path, content` | `()` | **atomic** (temp + fsync + rename) — §3.1 |
| `save_file_as` | `content` | `path` | native dialog |
| `open_folder` | `path` | `FileNode[]` | recursive `.md` tree |
| `watch_folder` | `path` | event stream | external-change events (`notify` crate) |
| `markdown_to_html` | `content` | `html` | comrak (`mdhtml`) → **untrusted** HTML; caller sanitizes (§3.3, §7) |
| `export_html` | `html, defaultName` | `path?` | native dialog + **atomic** write of already-sanitized doc; `null` if cancelled |
| `export_rtf` | `content, defaultName` | `path?` | renders (comrak via `mdrtf`) **and** writes, all in Rust; inert output, no sanitize (§7) |
| `export_pdf` | `content, theme` | `path` | *(deferred — §7)* |
| `save_clipboard_image` | `bytes, docPath` | `relative_path` | writes pasted image to `./assets/` (`imgasset`), returns MD-relative path (§6) |
| `load_settings` / `save_settings` | — / `Settings` | `Settings` / `()` | JSON in app config dir; includes `theme` + `sidebar_visible` |

> **HTML export is split** across two commands to hold the single sanitization path (§3.3):
> `markdown_to_html` renders (raw HTML passed through), the **frontend** runs it through `sanitize.ts`
> and builds the standalone document, then `export_html` writes that finished HTML atomically. comrak
> never writes files; sanitize never moves to Rust.
>
> **Events (Rust → frontend):** `workspace:change` (file watcher) and `menu` (native menu item id
> `menu_*` → mapped to the same handlers as toolbar buttons). Subscribe via `onWorkspaceChange` /
> `onMenuAction` in `ipc.ts`. The window **close guard** uses the frontend window API
> (`onCloseRequested`, `installCloseGuard`), not a command — see §3.

---

## 6. Feature ↔ Milkdown Plugin Mapping

| Feature | Implementation |
|---|---|
| WYSIWYG core | `@milkdown/core` + `@milkdown/preset-commonmark` |
| GFM (tables, task lists, strikethrough) | `@milkdown/preset-gfm` |
| Math (KaTeX) | **Deferred** — `@milkdown/plugin-math` is deprecated; omitted until a maintained option exists (§0/§8) |
| Emoji shortcodes | `@milkdown/plugin-emoji` |
| Inline / slash shortcuts | `@milkdown/plugin-slash` + keymap config |
| Formatting toolbar | `toolbar.ts` → Milkdown commands via `callCommand` (the few command-less items use a plain ProseMirror transaction); **never inserts raw markdown text** (§3.2). Buttons reflect active state via `activeState()`. The pure command layer is exported separately from the DOM so the gate tests it headlessly. *Underline omitted by design* (no markdown form). *Front-matter button deferred* (not lossless yet). |
| Front matter | comrak handles on export; in-editor handling deferred |
| Source / Typewriter / Focus modes | **Dropped as low-value** (§0/§8); Source mode would use CodeMirror 6, both backed by `serializer.ts` |
| Themes | `theme.ts` writes `html[data-theme]`; colors are CSS variables in `styles.css`; persisted in settings |
| Clipboard image paste | `$prose` `handlePaste` in `milkdown.ts` → `save_clipboard_image` writes to `assets/` (`imgasset`, content-hashed for dedup) → inserted as a canonical image node (not raw text, §3.2). Requires a saved doc. |

---

## 7. Export Strategy

**HTML — implemented.** Three-stage pipeline preserving the single sanitization chokepoint (§3.3):
1. **Render (Rust):** `markdown_to_html` → `mdhtml` (comrak, GFM + front matter, `render.unsafe_` so
   raw HTML passes through). Output is **untrusted**.
2. **Sanitize + template (frontend):** `main.ts` runs the body through `sanitize.ts` (DOMPurify), then
   `export/html.ts` wraps it in a self-contained document with the active theme's CSS inlined.
3. **Write (Rust):** `export_html` opens the native save dialog and **atomically** writes (§3.1).

   Add the KaTeX stylesheet to the template when math lands.

**RTF — implemented.** Single-step, all in Rust: `export_rtf` walks comrak's AST and emits RTF control
words, then writes atomically. **No sanitization step** — RTF is inert (opened by a word processor, not
the webview), and `mdrtf` escapes all text. Images become a labelled placeholder. Opens in Word/
LibreOffice/WordPad/TextEdit.

**PDF — deferred** (decided not worth it at current maturity). The HTML export gives a faithful manual
path (open `.html` → browser Print → "Save as PDF"). Programmatic PDF in Tauri 2 has no core API; it
needs per-platform `with_webview` FFI (Windows `PrintToPdf`, macOS `WKWebView.createPDF`, Linux
`WebKitPrintOperation`) — unsafe, unverifiable without each webview, disproportionate for an alpha.
`headless_chrome` and pure-Rust HTML→PDF (weak CSS fidelity) remain rejected under §2.

---

## 8. Milestones & Gates

Phases 0–3 are complete and Phase 4 (polish) is in progress; the shipped detail is in §0 and
`CHANGELOG.md`. One milestone per branch; each ends runnable + committed.

**Gates (all green) — keep them green:**
- **Atomic save:** `cargo test -p fsatomic` — interrupting a save leaves the original intact (§3.1).
- **Round-trip:** `tests/roundtrip.test.ts` — real Milkdown in jsdom; CommonMark + GFM + emoji. Add
  math + front-matter fixtures when those land (§3.2).
- **Toolbar round-trip:** `tests/toolbar.test.ts` — each command yields the same canonical markdown as
  typing the syntax, and asserts **no raw-markdown-text insertion** (§3.2).
- **Export:** `cargo test -p mdhtml -p mdrtf` (render configs) + `tests/export.test.ts` (builder + the
  §3.3 sanitization chokepoint).
- Plus `vaultscan`, `imgasset`, `theme`, `statusbar`, `search`, `security`, `tabs` suites.

**Remaining for Phase 4:** optional code-signing (removes the SmartScreen warning — see the
code-signing memory) and on-device verification of GUI/Rust flows that can't be tested here.
Shortcut-reference panel deferred (the menu lists shortcuts).

---

## 9. Windows Packaging

```bash
pnpm tauri dev          # development
pnpm tauri build        # production -> .exe + installer
```

Output: `src-tauri/target/release/` (raw `.exe`) and `…/bundle/` (NSIS + MSI). In `tauri.conf.json`:
`bundle.targets = ["nsis","msi"]`; `bundle.windows.webviewInstallMode = "downloadBootstrapper"`
(handles Win10 WebView2); set icon, product name, version, publisher.

Code signing is optional for personal use; without it, Windows SmartScreen warns on first run —
expected, not a bug.

**Releases** are cut by pushing a `v*` git tag (e.g. `v0.1.0-alpha.5`), which triggers
`.github/workflows/release.yml` (cross-platform `tauri-action` build → GitHub prerelease). **Always add
the release's notes to `CHANGELOG.md` before pushing the tag** — the changelog is the source of truth
for the GitHub Release body.

---

## 10. Conventions for Claude Code

- **Read this file first every session.** §3 (Data Safety), §5 (command contract), and §8 (milestones)
  are the source of truth — update them here when they change.
- All disk I/O stays in Rust commands. The frontend never bypasses with web file APIs.
- All markdown conversion goes through `serializer.ts`. Never introduce a second conversion path.
- Saves are always atomic (temp + fsync + rename).
- Everything rendered in the webview passes through `sanitize.ts`.
- Rust: edition 2024; `cargo fmt` + `cargo clippy` clean before any commit.
- TS: `strict` on; no `any`.
- One milestone per branch; conventional commits (`feat:`, `fix:`, `chore:`).
- **Before a release (pushing a `v*` tag, §9), add that version's notes to `CHANGELOG.md`.**
- When two designs compete, prefer the one that keeps `.md` files plain and portable (Obsidian-compatible).

---

## 11. Known Hard Parts / Risks

- **Round-trip fidelity** (§3.2) is where most bugs hide — nested lists, table editing, code-fence
  boundaries. Lean on Milkdown's tested behavior; minimize custom schema.
- **External file changes** — the watcher + reload prompt matters more than it looks when the folder is
  also an Obsidian vault.
- **WYSIWYG edge cases** generally — prefer configuring Milkdown over hand-rolling ProseMirror nodes.

---

## 12. Future Ideas (out of scope — do not build into current milestones)

- **Multi-format structured editing (JSON / XML / YAML / TOML).** Deferred to keep the markdown editor
  whole; revisit only after it ships, possibly as a *separate* app. If pursued, the shape is **one app
  with pluggable editor surfaces** — an `EditorProvider` registry keyed by file type, each honoring the
  §3.2 single-canonical-serializer contract (not Milkdown plugins; data formats need a structure-tree /
  typed-form engine, likely CodeMirror 6 + schema). The hard part is lossless round-trip, which is
  *worse* than markdown here (YAML comments/anchors/Norway-problem, JSON key order, XML namespaces).

*Pure-Rust (egui) split-pane alternative was considered and rejected: it would trade away the inline
WYSIWYG feel that is the whole point. Decision is closed.*

---

## 13. Quality-of-life backlog (unscheduled, but fair game)

Concrete QoL features to pull from when polishing — **in scope** (unlike §12), just not yet scheduled.
Keep the project's rules: testable logic in `crates/*` or pure TS helpers, all disk I/O in Rust
(§5/§10), one canonical serializer (§3.2), no unhealthy deps (§2).

**Easy (pure frontend, fully testable here):**
- **Editor zoom** — `Ctrl +`/`-`/`0` adjusts an editor font-size CSS variable; persist in `Settings`.
- **Spellcheck** — ensure the ProseMirror editable carries `spellcheck="true"`. Verify on-device.
- **Tab niceties** — middle-click to close, "Close others / Close all".

**Easy–medium (small Rust / Tauri, needs on-device verify):**
- **Auto-save** — debounced save of dirty *saved* files; reuse atomic `saveFile`; toggle in `Settings`.
- **Remember window size/position** — add the maintained `tauri-plugin-window-state` (vet per §2).
- **Recent files / recent folders** — extend the persisted session with an MRU list; surface in File menu.
- **Open links in browser** (`Ctrl/Cmd`-click) — route through Tauri's shell-open.
- **Drag-and-drop a `.md` onto the window to open it** — Tauri drag-drop event → existing `openPath`.

**Medium (more UI / a new command, but high value):**
- **Global workspace search ("find in files")** — a Rust command scanning the vault (sibling to
  `vaultscan`, keeping scan logic unit-testable) + a results panel. Distinct from in-document Find.
- **Sidebar file operations** — new / rename / delete / new-folder via context menu, backed by new
  **atomic** Rust commands; mind the watcher interplay.
- **Document outline / TOC panel** — list headings from the doc, click to scroll.

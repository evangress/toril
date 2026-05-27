# Changelog

All notable changes to **Toril** are recorded here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); each version is the `v*` git
tag that triggered its release build (see CLAUDE.md §9). Every entry carries the
GitHub Release notes plus the commits that shipped in it.

> **Process:** add the new version's notes to this file **before** pushing the
> release tag (CLAUDE.md §10). This changelog is the source of truth for the
> GitHub Release body.

## [Unreleased]

_Nothing yet._

## [v0.1.0-alpha.6] — 2026-05-27

**Release notes — new in this build:**

- **Export to RTF** — export the current note to a Rich Text Format document
  (the *Export RTF* button) that opens in Word, LibreOffice, WordPad, or
  TextEdit. Headings, bold/italic/strikethrough/inline code, code blocks, links,
  bullet/ordered/task lists, blockquotes, tables, and horizontal rules all carry
  over.

_Note: programmatic PDF export was evaluated and deferred for now — the HTML
export already gives a faithful PDF via your browser's “Save as PDF”, and a
native PDF path needs per-platform webview work not worth it at this stage.
Still an early alpha; back up your notes. On Windows, SmartScreen warns on first
run because the build is unsigned — that is expected._

### Added
- RTF export: `mdrtf` crate (comrak AST → RTF) + the `export_rtf` command and
  *Export RTF* button. All-Rust, no sanitization step (RTF is inert).

### Changed
- PDF export deferred (see §7) in favour of RTF; the HTML export covers manual
  "Save as PDF" via a browser.

### Docs / Process
- Added `CHANGELOG.md` and a rule to record release notes before tagging a release.

### Commits
- `8b82db0` feat(export): add RTF export via testable mdrtf crate
- `85cdd72` docs: add CHANGELOG.md and require release notes before tagging

## [v0.1.0-alpha.5] — 2026-05-26

**Release notes — new in this build:**

- **Formatting toolbar** above the editor: headings H1–H6 + paragraph,
  bold/italic/strikethrough/inline code, bullet/ordered/task lists, blockquote,
  code block, table, horizontal rule, link, image, an emoji picker, and
  clear-formatting. Every button drives the editor directly (never inserts raw
  markdown text), so notes stay clean, portable `.md`.
- **Themes** — System / Light / Dark, switchable from the header and remembered
  between launches.
- **Export to HTML** — export the current note to a self-contained, styled HTML
  file (the *Export HTML* button or `Ctrl+E`). Output is sanitized before it is
  written.

_Still an early alpha — expect rough edges, and back up your notes. On Windows,
SmartScreen warns on first run because the build is unsigned; that is expected._

### Added
- Formatting toolbar component (`src/ui/toolbar.ts`) with active-state highlighting.
- Theme controller (`src/ui/theme.ts`) + persisted `theme` preference.
- HTML export: `mdhtml` crate (comrak), `markdown_to_html`/`export_html`
  commands, and the standalone-document builder (`src/export/html.ts`).

### Changed / Removed
- Source / Typewriter / Focus edit modes dropped from the plan as low-value.

### Commits
- `5540525` feat(themes,export): add theme switching + HTML export; drop edit modes
- `8612a27` feat(toolbar): add formatting toolbar with round-trip gate (Phase 3)
- `b944306` docs(claude): add formatting-toolbar stage with full component coverage

## [v0.1.0-alpha.4] — 2026-05-26

**Release notes:** the editor now remembers your session — the last opened
folder, the set of open file tabs, and the active tab are restored on launch.

### Added
- Session memory: restore last folder + open files/active tab on launch (paths only).

### Commits
- `b5d9378` feat(session): remember last folder and open files across launches

## [v0.1.0-alpha.3] — 2026-05-26

**Release notes:** a visual fix for emoji sizing, plus contributor/docs polish.

### Fixed
- Emoji rendered at a towering intrinsic size; now constrained to `1em` so they
  sit inline with surrounding text.

### Docs
- Added `CONTRIBUTING.md`; documented the vendored security-patched `glib` and
  the deferred multi-format-editing idea; pointed URLs at `kovirlabs/toril`
  after the org transfer; landing-page download-button tweaks.

### Commits
- `dab1ba5` fix(editor): size emoji to 1em so they match surrounding text
- `ed1b317` docs: add CONTRIBUTING.md
- `44c5427` docs(claude): add §12 Future Ideas — deferred multi-format editing
- `bd9fd6a` docs(claude): note the vendored security-patched glib in §2
- `5b95b1d` docs: point GitHub URLs at kovirlabs/toril after org transfer
- `0c6b4e8` docs(site): relabel hero CTA "Download for Windows" → "Download"
- `99ccfb3` docs(site): point download button at the releases page, not a pinned asset

## [v0.1.0-alpha.2] — 2026-05-25

**Release notes:** emoji shortcodes in the editor, the HTML-sanitization
chokepoint that backs safe rendering/export, and a security patch for a
transitive `glib` NULL-deref.

### Added
- Emoji shortcodes (`@milkdown/plugin-emoji`); codified the healthy-dependency
  rule and deferred math (deprecated plugin).
- `sanitize.ts` — the DOMPurify HTML-sanitization chokepoint (§3.3).
- `SECURITY.md` security policy.

### Security
- Patched `glib` `VariantStrIter` NULL-deref (GHSA-wrw7-89jp-8q8g) via a
  vendored, fixed `glib` 0.18.5.

### Commits
- `738ee87` feat(security): add sanitize.ts HTML chokepoint (§3.3)
- `ab3cc1c` feat(editor): emoji shortcodes; add healthy-dependency rule; defer math
- `58797f4` fix(deps): patch glib VariantStrIter NULL-deref (GHSA-wrw7-89jp-8q8g)
- `b6a9d94` docs(site): add SEO essentials and point download at v0.1.0-alpha.1
- `356dc31` Create SECURITY.md for security policy

## [v0.1.0-alpha.1] — 2026-05-25

**Release notes:** branding and download/install documentation.

### Added
- Toril brand icon as the app icon; code-signing TODO noted.

### Docs
- README download/install steps; landing-page download buttons wired to the release.

### Commits
- `1009553` chore: use Toril brand icon as the app icon + add code-signing TODO
- `3f675b3` docs(readme): document v0.1.0-alpha downloads and install steps
- `d990e0f` docs(site): wire download buttons to v0.1.0-alpha release
- `afdfe4a` Create CNAME
- `c735ba2` Delete CNAME

## [v0.1.0-alpha] — 2026-05-25

**Release notes:** first public alpha. A working WYSIWYG markdown editor on
Tauri + Rust with atomic file I/O, a folder sidebar, multi-document tabs, a file
watcher, and the cross-platform release pipeline.

### Added
- Phase 0 — Tauri 2 + Vite + TypeScript scaffold.
- Phase 1 — Milkdown WYSIWYG editor, atomic file I/O, round-trip + atomic-save gates.
- Phase 2 — workspace: folder sidebar, multi-document tabs, external-change watcher.
- `tauri-action` release workflow for tagged builds; brand assets; GitHub Pages site.

### Commits
- `fcf8ba1` ci: add tauri-action release workflow for tagged builds
- `71172e0` Added updates to the github page and readme
- `97b88a1` chore: rename app entry to app.html, free index.html for GitHub Pages
- `8378dec` chore: add brand assets (icon + brand/theme guide)
- `969201d` feat: Phase 2 workspace — folder sidebar, tabs, file watcher
- `c649027` feat: Phase 1 MVP — Milkdown editor, atomic file I/O, both gates
- `7085a66` feat: scaffold Tauri 2 + Vite + TS app (Phase 0)
- `0d5b7f5` initial commit
- `24d2c42` Initial commit

[Unreleased]: https://github.com/kovirlabs/toril/compare/v0.1.0-alpha.6...HEAD
[v0.1.0-alpha.6]: https://github.com/kovirlabs/toril/compare/v0.1.0-alpha.5...v0.1.0-alpha.6
[v0.1.0-alpha.5]: https://github.com/kovirlabs/toril/compare/v0.1.0-alpha.4...v0.1.0-alpha.5
[v0.1.0-alpha.4]: https://github.com/kovirlabs/toril/compare/v0.1.0-alpha.3...v0.1.0-alpha.4
[v0.1.0-alpha.3]: https://github.com/kovirlabs/toril/compare/v0.1.0-alpha.2...v0.1.0-alpha.3
[v0.1.0-alpha.2]: https://github.com/kovirlabs/toril/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[v0.1.0-alpha.1]: https://github.com/kovirlabs/toril/compare/v0.1.0-alpha...v0.1.0-alpha.1
[v0.1.0-alpha]: https://github.com/kovirlabs/toril/releases/tag/v0.1.0-alpha

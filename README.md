# Toril

> **The bull, penned.** A MarkText-style WYSIWYG markdown editor — your markdown
> renders *in place* as you type, with no separate preview pane.

Toril is a small, fast desktop markdown editor built on **Tauri 2 + TypeScript +
Milkdown**. Files are plain `.md` in ordinary folders, so a workspace can be a
live Obsidian vault — no proprietary container, no lock-in.

**Primary platform: Windows.** macOS and Linux build from the same stack but are
not the current focus.

> ⚠️ **Status: early development.** The editor, atomic file saving, a folder
> sidebar, multi-document tabs, and an external-change watcher are in place
> (build milestones 0–2). There is **no prebuilt download yet** — to install,
> build it from source as described below.

---

## Installing on Windows

There is no signed release binary yet, so installation is two steps: **build the
installer once**, then **run it**. The installer is a normal per-user install —
it needs no administrator rights.

### 1. Prerequisites (build machine)

Install these once:

| Requirement | How |
|---|---|
| **Rust** (stable) | <https://rustup.rs> |
| **Node.js** (LTS) | <https://nodejs.org> |
| **pnpm** | `corepack enable pnpm` (ships with Node) |
| **Microsoft C++ Build Tools** (MSVC) | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — needed to compile Rust on Windows |
| **WebView2 runtime** | Preinstalled on Windows 11; the installer bootstraps it on Windows 10 |

### 2. Build the installer

From a terminal in the project folder:

```powershell
pnpm install
pnpm tauri build
```

This produces, under `src-tauri\target\release\bundle\`:

- `nsis\Toril_0.1.0_x64-setup.exe` — the **recommended** installer
- `msi\Toril_0.1.0_x64_en-US.msi` — an MSI alternative

(The raw, portable executable is `src-tauri\target\release\toril-app.exe` if you
just want to run it without installing.)

### 3. Run the installer

Double-click **`Toril_0.1.0_x64-setup.exe`**. It performs a per-user install:

- Copies the app into **`%LOCALAPPDATA%\Toril`** (i.e.
  `C:\Users\<you>\AppData\Local\Toril`) — no admin prompt.
- Adds a **Start Menu** entry, and offers a **Desktop shortcut** checkbox during
  setup.
- Registers an entry in **Apps & features** for clean uninstallation.

> **SmartScreen note:** the build is unsigned, so on first run Windows
> SmartScreen may warn "Windows protected your PC." Click **More info →
> Run anyway**. This is expected for an unsigned personal build, not a problem
> with the app.

### Uninstalling

Use **Settings → Apps → Installed apps → Toril → Uninstall**, or run the
uninstaller in `%LOCALAPPDATA%\Toril`.

---

## Running from source (development)

To run the app live with hot-reload instead of installing:

```powershell
pnpm install
pnpm tauri dev
```

The first run compiles the Rust backend, so it takes a while; subsequent runs are
fast.

### Building on macOS / Linux

The same `pnpm tauri build` works, with platform build dependencies:

- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux:** WebKitGTK and friends, e.g. on Debian/Ubuntu:
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config
  ```

---

## Development reference

| Task | Command |
|---|---|
| Run the app (dev) | `pnpm tauri dev` |
| Build app + installers | `pnpm tauri build` |
| Frontend type-check | `pnpm typecheck` |
| Frontend build only | `pnpm build` |
| Frontend tests (round-trip, tabs) | `pnpm test` |
| Backend logic tests | `cd src-tauri && cargo test -p fsatomic -p vaultscan` |

The architecture, data-safety rules, command contract, and build milestones live
in **[CLAUDE.md](./CLAUDE.md)**; brand and theming in **[BRAND.md](./BRAND.md)**.

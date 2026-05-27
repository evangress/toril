// Thin, typed wrappers around Tauri's `invoke()` and dialogs. Per CLAUDE.md
// §5/§10 the frontend never touches the filesystem directly — every backend
// command and its argument shape is declared here, in one place.
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { message, open as openDialog } from "@tauri-apps/plugin-dialog";

export type { UnlistenFn } from "@tauri-apps/api/event";

export interface OpenedFile {
  path: string;
  content: string;
}

/** A node in the workspace tree (mirrors Rust `vaultscan::FileNode`). */
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileNode[];
}

/** Payload of the `workspace:change` event (mirrors Rust `ChangeEvent`). */
export interface WorkspaceChange {
  kind: "create" | "modify" | "remove" | "other";
  paths: string[];
}

const MARKDOWN_FILTER = { name: "Markdown", extensions: ["md", "markdown"] };

/** Read a UTF-8 markdown file. */
export function openFile(path: string): Promise<OpenedFile> {
  return invoke<OpenedFile>("open_file", { path });
}

/** Atomically write `content` to an existing path (§3.1). */
export function saveFile(path: string, content: string): Promise<void> {
  return invoke<void>("save_file", { path, content });
}

/**
 * Prompt for a destination (native dialog) and atomically write `content`.
 * Resolves to the chosen path, or `null` if the user cancelled.
 */
export function saveFileAs(content: string): Promise<string | null> {
  return invoke<string | null>("save_file_as", { content });
}

/**
 * Native "open" picker. Returns the selected path, or `null` if cancelled.
 * The picker only yields a path; the actual read still happens in Rust via
 * {@link openFile}, keeping all disk access in the backend.
 */
export async function pickFileToOpen(): Promise<string | null> {
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: [MARKDOWN_FILTER],
  });
  return typeof selected === "string" ? selected : null;
}

/** Recursively list the markdown tree under `path` (§5 `open_folder`). */
export function openFolder(path: string): Promise<FileNode[]> {
  return invoke<FileNode[]>("open_folder", { path });
}

/** Start watching `path` for external changes; events arrive via {@link onWorkspaceChange}. */
export function watchFolder(path: string): Promise<void> {
  return invoke<void>("watch_folder", { path });
}

/** Native folder picker. Returns the chosen path, or `null` if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const selected = await openDialog({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

/** Subscribe to external workspace changes. Resolves to an unlisten function. */
export function onWorkspaceChange(
  handler: (change: WorkspaceChange) => void,
): Promise<UnlistenFn> {
  return listen<WorkspaceChange>("workspace:change", (event) => handler(event.payload));
}

/** Subscribe to native menu clicks; the payload is the item id (`menu_*`, §8). */
export function onMenuAction(handler: (id: string) => void): Promise<UnlistenFn> {
  return listen<string>("menu", (event) => handler(event.payload));
}

/** Show the native "About Toril" dialog (Help menu). */
export async function showAbout(): Promise<void> {
  let version = "";
  try {
    version = await getVersion();
  } catch {
    // version unavailable (e.g. dev) — show without it
  }
  const heading = version ? `Toril v${version}` : "Toril";
  await message(`${heading}\nA MarkText-style WYSIWYG markdown editor.`, {
    title: "About Toril",
    kind: "info",
  });
}

/** Persisted session + preferences (mirrors Rust `settings::Settings`, §5). */
export interface Settings {
  version: number;
  last_folder: string | null;
  open_files: string[];
  active_file: string | null;
  /** Theme preference: "system" | "light" | "dark". `null` ⇒ frontend default. */
  theme: string | null;
}

/** Load persisted settings; resolves to defaults if none exist or the file is corrupt. */
export function loadSettings(): Promise<Settings> {
  return invoke<Settings>("load_settings");
}

/** Atomically persist settings (§3.1). Best-effort — callers ignore failures. */
export function saveSettings(settings: Settings): Promise<void> {
  return invoke<void>("save_settings", { settings });
}

/**
 * Render canonical markdown to an HTML *body* fragment via comrak (Rust, §7).
 * The result is UNTRUSTED HTML — the caller MUST pass it through `sanitizeHtml`
 * (§3.3) before it reaches the DOM or a written file. No disk access here.
 */
export function markdownToHtml(content: string): Promise<string> {
  return invoke<string>("markdown_to_html", { content });
}

/**
 * Prompt for a destination and atomically write an already-built, already-
 * sanitized standalone HTML document (§3.1/§3.3). Returns the chosen path, or
 * `null` if the user cancelled.
 */
export function exportHtml(html: string, defaultName: string): Promise<string | null> {
  return invoke<string | null>("export_html", { html, defaultName });
}

/**
 * Render canonical markdown to RTF and atomically write it to a chosen path —
 * all in Rust (§7). Unlike HTML, RTF needs no frontend sanitization (it is inert
 * and generated by us). Returns the chosen path, or `null` if cancelled.
 */
export function exportRtf(content: string, defaultName: string): Promise<string | null> {
  return invoke<string | null>("export_rtf", { content, defaultName });
}

/**
 * Persist a pasted image beside `docPath` (in `assets/`) and resolve to the
 * Markdown-relative path to link with `![](…)` (§6). `bytes` is the raw image
 * data as a byte array. All disk access stays in Rust.
 */
export function saveClipboardImage(bytes: number[], docPath: string): Promise<string> {
  return invoke<string>("save_clipboard_image", { bytes, docPath });
}

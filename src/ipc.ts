// Thin, typed wrappers around Tauri's `invoke()` and dialogs. Per CLAUDE.md
// §5/§10 the frontend never touches the filesystem directly — every backend
// command and its argument shape is declared here, in one place.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

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

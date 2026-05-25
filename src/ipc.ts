// Thin, typed wrappers around Tauri's `invoke()` and dialogs. Per CLAUDE.md
// §5/§10 the frontend never touches the filesystem directly — every backend
// command and its argument shape is declared here, in one place.
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

export interface OpenedFile {
  path: string;
  content: string;
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

// Thin, typed wrappers around Tauri's `invoke()`. Per CLAUDE.md §5/§10, the
// frontend never touches the filesystem or calls `invoke` directly elsewhere —
// every backend command gets a wrapper here so the contract stays in one place.
import { invoke } from "@tauri-apps/api/core";

/**
 * Phase 0 health check: proves the frontend ⇄ Rust IPC round-trip works.
 * Returns a short identifier string from the backend (e.g. "toril 0.1.0").
 * Placeholder — remove once real commands (open_file, save_file, …) land in Phase 1.
 */
export function ping(): Promise<string> {
  return invoke<string>("ping");
}

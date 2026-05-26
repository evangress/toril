// App controller (Phases 1–2). Coordinates the single Milkdown editor with the
// tab manager, the workspace sidebar, and the external-change watcher. All
// markdown conversion goes through serializer.ts; all disk access through
// ipc.ts (§3.2, §5).
import "@milkdown/theme-nord/style.css";
import "./styles.css";
import type { Editor } from "@milkdown/kit/core";
import { createEditor } from "./editor/milkdown";
import { docToMarkdown, markdownToDoc } from "./editor/serializer";
import { buildStandaloneHtml } from "./export/html";
import { sanitizeHtml } from "./sanitize";
import {
  type Settings,
  type UnlistenFn,
  type WorkspaceChange,
  exportHtml,
  loadSettings,
  markdownToHtml,
  onWorkspaceChange,
  openFile,
  openFolder,
  pickFileToOpen,
  pickFolder,
  saveFile,
  saveFileAs,
  saveSettings,
  watchFolder,
} from "./ipc";
import { Sidebar } from "./ui/sidebar";
import { type TabState, TabManager } from "./ui/tabs";
import { ThemeController, isTheme } from "./ui/theme";
import { FormattingToolbar } from "./ui/toolbar";

const WELCOME = `# Welcome to Toril

Open a folder to browse your notes, or start typing here.
`;

let editor: Editor;
let tabs: TabManager;
let sidebar: Sidebar;
let formatToolbar: FormattingToolbar | null = null;
let theme: ThemeController | null = null;

let workspaceRoot: string | null = null;
let unwatch: UnlistenFn | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let sessionTimer: ReturnType<typeof setTimeout> | null = null;

let loading = false; // suppress the dirty flag during programmatic loads
/** Paths we just wrote, with a timestamp — to ignore our own watcher events. */
const selfWrites = new Map<string, number>();

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function setStatus(msg: string): void {
  const el = document.querySelector("#status");
  if (el) el.textContent = msg;
}

function updateTitle(): void {
  const tab = tabs.active();
  const shown = tab ? `${tab.name}${tab.dirty ? " *" : ""}` : "Toril";
  document.title = tab ? `${shown} — Toril` : "Toril";
  const el = document.querySelector<HTMLElement>("#doc-title");
  if (el) {
    el.textContent = shown;
    el.dataset.dirty = String(tab?.dirty ?? false);
  }
  sidebar.setActivePath(tab?.path ?? null);
}

function loadIntoEditor(content: string): void {
  loading = true;
  markdownToDoc(editor, content);
  loading = false;
}

function onEditorChange(): void {
  if (loading) return;
  const tab = tabs.active();
  if (tab && !tab.dirty) {
    tabs.setDirty(tab.id, true);
    updateTitle();
  }
}

// ---- Tab lifecycle: keep editor and per-tab buffers in sync ----------------

function onDeactivate(tab: TabState): void {
  tab.content = docToMarkdown(editor); // persist outgoing tab's edits
}

function onActivate(tab: TabState): void {
  loadIntoEditor(tab.content);
  updateTitle();
  formatToolbar?.refresh();
  scheduleSessionSave();
}

function onCloseRequest(tab: TabState): void {
  if (tab.dirty && !confirm(`Discard unsaved changes to ${tab.name}?`)) return;
  tabs.close(tab.id);
  if (!tabs.active()) {
    openDocument(null, "Untitled", ""); // never leave zero tabs
  }
  updateTitle();
  scheduleSessionSave();
}

// ---- Open / save -----------------------------------------------------------

function openDocument(path: string | null, name: string, content: string): void {
  tabs.open({ path, name, content });
  updateTitle();
}

async function openPath(path: string): Promise<void> {
  const existing = tabs.byPath(path);
  if (existing) {
    tabs.setActive(existing.id);
    updateTitle();
    return;
  }
  const file = await openFile(path);
  openDocument(file.path, basename(file.path), file.content);
  setStatus(`Opened ${basename(file.path)}`);
}

async function doOpenFile(): Promise<void> {
  try {
    const path = await pickFileToOpen();
    if (path) await openPath(path);
  } catch (e) {
    setStatus(`Open failed: ${String(e)}`);
  }
}

async function doOpenFolder(): Promise<void> {
  try {
    const path = await pickFolder();
    if (!path) return;
    await loadWorkspace(path);
  } catch (e) {
    setStatus(`Open folder failed: ${String(e)}`);
  }
}

async function loadWorkspace(path: string): Promise<void> {
  const tree = await openFolder(path);
  workspaceRoot = path;
  sidebar.setRoot(basename(path), tree);
  sidebar.setActivePath(tabs.active()?.path ?? null);
  setStatus(`Opened folder ${basename(path)}`);

  if (unwatch) unwatch();
  unwatch = await onWorkspaceChange(handleWorkspaceChange);
  await watchFolder(path);
  scheduleSessionSave();
}

function recordSelfWrite(path: string): void {
  selfWrites.set(path, Date.now());
}

async function persistActive(path: string): Promise<void> {
  const tab = tabs.active();
  if (!tab) return;
  const content = docToMarkdown(editor);
  recordSelfWrite(path);
  await saveFile(path, content);
  tab.content = content;
  tabs.setDirty(tab.id, false);
  updateTitle();
  setStatus(`Saved ${basename(path)}`);
}

async function doSave(): Promise<void> {
  const tab = tabs.active();
  if (!tab) return;
  if (!tab.path) {
    await doSaveAs();
    return;
  }
  try {
    await persistActive(tab.path);
  } catch (e) {
    setStatus(`Save failed: ${String(e)}`);
  }
}

async function doSaveAs(): Promise<void> {
  const tab = tabs.active();
  if (!tab) return;
  try {
    const content = docToMarkdown(editor);
    const path = await saveFileAs(content);
    if (!path) return; // cancelled
    recordSelfWrite(path);
    tab.content = content;
    tabs.setPath(tab.id, path, basename(path));
    tabs.setDirty(tab.id, false);
    updateTitle();
    setStatus(`Saved ${basename(path)}`);
    if (workspaceRoot && path.startsWith(workspaceRoot)) scheduleSidebarRefresh();
    scheduleSessionSave(); // the tab now has a path — make it restorable
  } catch (e) {
    setStatus(`Save failed: ${String(e)}`);
  }
}

function doNew(): void {
  openDocument(null, "Untitled", "");
  setStatus("New document");
}

// ---- Export ----------------------------------------------------------------

/**
 * Export the active document to a standalone HTML file. The pipeline keeps the
 * one sanitization path (§3.3): comrak renders in Rust → the untrusted HTML is
 * sanitized here via `sanitizeHtml` → wrapped in a self-contained document →
 * written atomically in Rust. Disk access never leaves the backend (§10).
 */
async function doExportHtml(): Promise<void> {
  const tab = tabs.active();
  if (!tab) return;
  try {
    const markdown = docToMarkdown(editor);
    const dirty = await markdownToHtml(markdown); // untrusted comrak output
    const safe = sanitizeHtml(dirty); // §3.3 chokepoint — before it hits a file
    const title = tab.name.replace(/\.(md|markdown)$/i, "");
    const html = buildStandaloneHtml(safe, { title, dark: theme?.resolved() === "dark" });
    const suggested = `${title || "untitled"}.html`;
    const path = await exportHtml(html, suggested);
    if (path) setStatus(`Exported ${basename(path)}`);
  } catch (e) {
    setStatus(`Export failed: ${String(e)}`);
  }
}

// ---- External changes ------------------------------------------------------

function isSelfWrite(path: string): boolean {
  const at = selfWrites.get(path);
  if (at === undefined) return false;
  if (Date.now() - at > 2000) {
    selfWrites.delete(path);
    return false;
  }
  return true;
}

function scheduleSidebarRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (!workspaceRoot) return;
    openFolder(workspaceRoot)
      .then((tree) => {
        sidebar.setRoot(basename(workspaceRoot!), tree);
        sidebar.setActivePath(tabs.active()?.path ?? null);
      })
      .catch(() => {});
  }, 300);
}

async function handleWorkspaceChange(change: WorkspaceChange): Promise<void> {
  // The tree may have changed (create/remove/rename) — refresh the sidebar.
  scheduleSidebarRefresh();

  // If the file in the active tab changed underneath us, offer to reload it.
  const active = tabs.active();
  if (!active?.path) return;
  if (change.kind !== "modify" && change.kind !== "create") return;
  if (!change.paths.includes(active.path)) return;
  if (isSelfWrite(active.path)) return;

  const reload =
    !active.dirty ||
    confirm(`${active.name} changed on disk. Reload and lose your unsaved edits?`);
  if (!reload) return;

  try {
    const file = await openFile(active.path);
    active.content = file.content;
    loadIntoEditor(file.content);
    tabs.setDirty(active.id, false);
    updateTitle();
    setStatus(`Reloaded ${active.name}`);
  } catch (e) {
    setStatus(`Reload failed: ${String(e)}`);
  }
}

// ---- Session memory: remember last folder + open files ---------------------

/**
 * Snapshot the session (workspace folder + file-backed tabs + the active one)
 * to disk. Debounced and best-effort — failures are swallowed so persistence
 * never interferes with editing. Only paths are stored, never buffer contents,
 * so the file on disk remains the single source of truth (§3.2).
 */
function scheduleSessionSave(): void {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    const settings: Settings = {
      version: 1,
      last_folder: workspaceRoot,
      open_files: tabs
        .list()
        .map((t) => t.path)
        .filter((p): p is string => p !== null),
      active_file: tabs.active()?.path ?? null,
      theme: theme?.current() ?? null,
    };
    void saveSettings(settings).catch(() => {}); // best-effort
  }, 400);
}

/**
 * Reopen the last session: the workspace folder, then each previously open
 * file, focusing the one that was active. Fully defensive — a folder or file
 * that has since moved or been deleted is skipped silently, and a failed load
 * simply restores nothing. Opened files are read fresh from disk (§3.2).
 */
async function restoreSession(): Promise<void> {
  let settings: Settings;
  try {
    settings = await loadSettings();
  } catch {
    return;
  }

  // Theme first, so the restored UI paints in the right palette.
  if (theme && isTheme(settings.theme)) {
    theme.applyInitial(settings.theme);
    syncThemeSelect();
  }

  if (settings.last_folder) {
    try {
      await loadWorkspace(settings.last_folder);
    } catch {
      // folder gone/moved — skip, leave workspaceRoot unset
    }
  }

  for (const path of settings.open_files) {
    try {
      await openPath(path); // reads from disk; throws if the file is missing
    } catch {
      // file gone — skip it
    }
  }

  if (settings.active_file) {
    const tab = tabs.byPath(settings.active_file);
    if (tab) tabs.setActive(tab.id);
  }
}

// ---- Wiring ----------------------------------------------------------------

/** Reflect the current theme preference in the header selector. */
function syncThemeSelect(): void {
  const select = document.querySelector<HTMLSelectElement>("#theme-select");
  if (select && theme) select.value = theme.current();
}

function installShortcuts(): void {
  window.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    switch (e.key.toLowerCase()) {
      case "s":
        e.preventDefault();
        void (e.shiftKey ? doSaveAs() : doSave());
        break;
      case "o":
        e.preventDefault();
        void (e.shiftKey ? doOpenFolder() : doOpenFile());
        break;
      case "n":
        e.preventDefault();
        doNew();
        break;
      case "e":
        e.preventDefault();
        void doExportHtml();
        break;
    }
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  const editorRoot = document.querySelector<HTMLElement>("#editor");
  const tabbar = document.querySelector<HTMLElement>("#tabbar");
  const sidebarEl = document.querySelector<HTMLElement>("#sidebar");
  const formatBar = document.querySelector<HTMLElement>("#format-toolbar");
  if (!editorRoot || !tabbar || !sidebarEl || !formatBar) return;

  sidebar = new Sidebar(sidebarEl, { onOpenFile: (p) => void openPath(p) });
  sidebar.setRoot(null, []);
  tabs = new TabManager(tabbar, { onDeactivate, onActivate, onCloseRequest });

  // Theme controller is created before session restore so the restored UI
  // paints in the saved palette; persists the preference on change.
  theme = new ThemeController(() => scheduleSessionSave());
  const themeSelect = document.querySelector<HTMLSelectElement>("#theme-select");
  themeSelect?.addEventListener("change", () => {
    const value = themeSelect.value;
    if (isTheme(value)) theme?.set(value);
  });
  syncThemeSelect();

  loading = true;
  editor = await createEditor({ root: editorRoot, initial: "", onChange: onEditorChange });
  loading = false;
  formatToolbar = new FormattingToolbar(formatBar, editor, editorRoot);

  document.querySelector("#btn-new")?.addEventListener("click", () => doNew());
  document.querySelector("#btn-open")?.addEventListener("click", () => void doOpenFile());
  document.querySelector("#btn-open-folder")?.addEventListener("click", () => void doOpenFolder());
  document.querySelector("#btn-save")?.addEventListener("click", () => void doSave());
  document.querySelector("#btn-save-as")?.addEventListener("click", () => void doSaveAs());
  document.querySelector("#btn-export")?.addEventListener("click", () => void doExportHtml());
  installShortcuts();

  // Restore the last session (folder + open files); fall back to a welcome tab
  // if there was nothing to restore or every remembered path is now gone.
  await restoreSession();
  if (!tabs.active()) {
    openDocument(null, "Untitled", WELCOME);
  }
});

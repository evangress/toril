// Phase 1 app controller: mounts the Milkdown editor and drives open/save with
// a dirty indicator and a file-aware title. All markdown conversion goes through
// serializer.ts; all disk access through ipc.ts (§3.2, §5).
import "@milkdown/theme-nord/style.css";
import "./styles.css";
import type { Editor } from "@milkdown/kit/core";
import { createEditor } from "./editor/milkdown";
import { docToMarkdown, markdownToDoc } from "./editor/serializer";
import { openFile, pickFileToOpen, saveFile, saveFileAs } from "./ipc";

const INITIAL = `# Welcome to Toril

Start typing. Markdown renders inline — try \`# headings\`, \`**bold**\`,
\`- lists\`, tables, and code fences.
`;

let editor: Editor;
let currentPath: string | null = null;
let dirty = false;
let loading = false; // suppress the dirty flag during programmatic loads

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function updateTitle(): void {
  const name = currentPath ? basename(currentPath) : "Untitled";
  const shown = `${name}${dirty ? " *" : ""}`;
  document.title = `${shown} — Toril`;
  const el = document.querySelector<HTMLElement>("#doc-title");
  if (el) {
    el.textContent = shown;
    el.dataset.dirty = String(dirty);
  }
}

function setStatus(msg: string): void {
  const el = document.querySelector("#status");
  if (el) el.textContent = msg;
}

function markDirty(): void {
  if (loading || dirty) return;
  dirty = true;
  updateTitle();
}

function loadMarkdown(path: string | null, content: string): void {
  loading = true;
  markdownToDoc(editor, content);
  loading = false;
  currentPath = path;
  dirty = false;
  updateTitle();
}

async function doOpen(): Promise<void> {
  try {
    const path = await pickFileToOpen();
    if (!path) return;
    const file = await openFile(path);
    loadMarkdown(file.path, file.content);
    setStatus(`Opened ${basename(file.path)}`);
  } catch (e) {
    setStatus(`Open failed: ${String(e)}`);
  }
}

async function doSaveAs(): Promise<void> {
  try {
    const path = await saveFileAs(docToMarkdown(editor));
    if (!path) return; // cancelled
    currentPath = path;
    dirty = false;
    updateTitle();
    setStatus(`Saved ${basename(path)}`);
  } catch (e) {
    setStatus(`Save failed: ${String(e)}`);
  }
}

async function doSave(): Promise<void> {
  if (!currentPath) {
    await doSaveAs();
    return;
  }
  try {
    await saveFile(currentPath, docToMarkdown(editor));
    dirty = false;
    updateTitle();
    setStatus(`Saved ${basename(currentPath)}`);
  } catch (e) {
    setStatus(`Save failed: ${String(e)}`);
  }
}

function doNew(): void {
  loadMarkdown(null, "");
  setStatus("New document");
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
        void doOpen();
        break;
      case "n":
        e.preventDefault();
        doNew();
        break;
    }
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  const root = document.querySelector<HTMLElement>("#editor");
  if (!root) return;

  loading = true; // the initial buffer is a clean "Untitled", not a user edit
  editor = await createEditor({ root, initial: INITIAL, onChange: markDirty });
  loading = false;

  document.querySelector("#btn-new")?.addEventListener("click", () => doNew());
  document.querySelector("#btn-open")?.addEventListener("click", () => void doOpen());
  document.querySelector("#btn-save")?.addEventListener("click", () => void doSave());
  document.querySelector("#btn-save-as")?.addEventListener("click", () => void doSaveAs());
  installShortcuts();

  updateTitle();
});

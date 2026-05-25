// Phase 0 bootstrap. Exercises the one IPC round-trip and reports the result.
// Phase 1 will replace this with the Milkdown editor setup.
import { ping } from "./ipc";

window.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.querySelector<HTMLElement>("#backend-status");
  if (!statusEl) return;
  try {
    const reply = await ping();
    statusEl.textContent = `backend connected — ${reply}`;
    statusEl.dataset.state = "ok";
  } catch (err) {
    statusEl.textContent = `backend unreachable: ${String(err)}`;
    statusEl.dataset.state = "error";
  }
});

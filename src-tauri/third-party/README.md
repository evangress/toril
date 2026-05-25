# third-party/

Vendored upstream crates we must patch ourselves. Each is kept as-is except for
the documented change, and wired in via `[patch.crates-io]` in `../Cargo.toml`.

## glib (0.18.5) — security patch

**Advisory:** GHSA-wrw7-89jp-8q8g — `VariantStrIter::impl_get` passed a NULL
out-pointer to the variadic `g_variant_get_child` as `&p` instead of `&mut p`.
The write-back was unsound and, under recent compiler optimizations, discarded —
leaving the pointer NULL and crashing `CStr::from_ptr` (NULL-deref).

**Why vendored, not upgraded:** fixed upstream only in glib **0.20.0**, which is
incompatible with the frozen **gtk3-rs 0.18** stack that Tauri 2's Linux backend
(webkit2gtk/gtk3) requires. There is no 0.18.x backport (the gtk-rs `0.18` branch
== the `0.18.5` tag). glib only compiles on Linux, but we ship Linux artifacts,
so the fix matters there.

**The change:** `src/variant_iter.rs`, `impl_get` — `let mut p` + pass `&mut p`.
That single hunk is the only deviation from the published `glib` 0.18.5.

**Remove this** once Tauri moves off gtk3 and pulls a non-vulnerable glib
transitively; then delete the `[patch.crates-io]` entry and this directory.

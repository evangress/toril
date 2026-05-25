# BRAND.md — Toril

Brand, color, and theme guide for **Toril**, a MarkText-style WYSIWYG markdown editor (Tauri + TypeScript + Milkdown). This file is the source of truth for the GitHub Pages site and any other Toril surface. All colors below were sampled directly from the app icon.

---

## 1. Brand Essence

**The bull, penned.** Toril is named for *el toril* — the pen where the bull waits before the ring. The icon says it in one mark: a bull's skull fused into a fountain-pen nib, the markdown **M↓** glyph above, an ink drop falling from the tip. Raw power, held in a steady hand. That's the promise — a fast, native editor that renders your markdown live, while treating your words like fine china.

**Personality:** precise, calm, quietly confident, with a craftsman's attention to detail and a dry wit. Not loud. Not corporate. A serious tool that doesn't take itself too seriously.

**Voice & tone:** plain-spoken and exact. Short sentences. Respect the reader's time. A little Spanish-bullring romance is welcome in taglines and headers; the docs stay clear and literal.

**Tagline options:**
- *The bull, penned.*
- *Markdown, with a steady hand.*
- *A bull in a china shop. Nothing breaks.*
- *What you write is what you get.*

---

## 2. Logo & Icon

**The mark:** bull skull + pen nib (one fused silhouette) · the **M↓** markdown glyph above the horns · an ink drop below the nib · faint code-bracket corners `[ ]` `( )` · understated "lines of text" strokes · a cool neon glow.

**Usage:**
- **App icon / social / launcher:** full squircle, full detail.
- **Favicon / avatar / small UI (≤32px):** use the **bull-nib mark alone** — drop the M↓, brackets, and text lines, which muddy at small sizes.
- **Clear space:** keep padding equal to the height of the M↓ glyph on all sides.
- **Monochrome:** ink-white mark on `--teal`, or `--ink` mark on white. Preserve the negative-space nib.

**Don't:** recolor the bull to anything low-contrast · add extra drop shadows beyond the built-in glow · stretch or rotate the mark · place the cool icon directly on a clashing warm background without its container.

---

## 3. Core Palette — "Deep Sea" (sampled from the icon)

The canonical identity. Cool, glassy, technical.

| Token | Hex | Role |
|---|---|---|
| `--ink-white` | `#E9F5F7` | The mark; primary text on dark surfaces |
| `--pale-tint` | `#A2CFDD` | Soft highlights, muted icons |
| `--cyan-glow` | `#39F9FE` | Signature neon glow / electric accent — use sparingly |
| `--cyan-soft` | `#119BAC` | Secondary teal-cyan, dividers, subtle accents |
| `--azure` | `#0A92CC` | Bright blue — info, highlights |
| `--blue` | `#0575C9` | Core brand blue |
| `--teal` | `#08626A` | Core brand teal — the anchor color |
| `--teal-deep` | `#0C5465` | Deeper teal for depth |
| `--abyss` | `#02293E` | Deepest navy-teal — backgrounds, shadow |

**Dominant + accent rule:** lead with teal→blue as the dominant field; reserve `--cyan-glow` for one or two electric moments per view (a glow, an active state). Don't spread it evenly.

---

## 4. Recommended Accent — "Toril Gold" (suggested addition)

A single warm accent drawn from *sangre y arena* — the gold of the bullring. Adds a memorable signature and ties the visuals to the name. Use for links, primary buttons, key highlights, and focus states.

| Token | Hex | Role |
|---|---|---|
| `--gold` | `#E8A33D` | Heritage amber — links, accents, primary CTA |
| `--gold-bright` | `#F6B53F` | Hover / active CTA |

It pops against the cool field precisely *because* it's the only warm note. Keep it scarce.

---

## 5. Optional Bold Direction — "Sangre y Arena"

If you'd rather recolor the icon to match the name's heritage head-on. Striking and on-theme, but note: deep red can read as "danger" in dev UIs, so use the oxblood as a field/brand color, never for error states.

| Token | Hex | Role |
|---|---|---|
| `--sangre` | `#8E1B2E` | Oxblood — primary brand field |
| `--sangre-deep` | `#6E1423` | Shadow / depth |
| `--gilt` | `#C99A3E` | Antique gold — the mark, accents |
| `--arena` | `#E7D9B8` | Sand / cream — backgrounds, paper feel |
| `--ash` | `#1A1512` | Warm near-black — text, deep bg |

A warm pairing (oxblood + antique gold + sand) evokes leather-bound books and ink — a strong fit for a *writing* tool, just a bolder bet than the cool default.

---

## 6. Neutrals & Theme (UI surfaces)

The icon is dark and glassy, so **dark mode is the default** for the brand. A light mode is provided for docs.

### Dark (default)
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#08171E` | Page background (near-black teal) |
| `--surface` | `#0E2630` | Cards, panels |
| `--surface-2` | `#143744` | Elevated / hover surfaces |
| `--border` | `#1E4350` | Hairlines, dividers |
| `--text` | `#E9F5F7` | Body text |
| `--text-muted` | `#9CC3CE` | Secondary text |
| `--text-dim` | `#5E8793` | Captions, disabled |

### Light (docs)
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#F5FAFB` | Page background |
| `--surface` | `#FFFFFF` | Cards, panels |
| `--border` | `#D8E7EC` | Hairlines |
| `--text` | `#06303B` | Body text (deep teal-ink) |
| `--text-muted` | `#3C5A63` | Secondary text |

### Semantic
| Token | Hex |
|---|---|
| `--success` | `#1FA463` |
| `--warning` | `#E0962A` |
| `--danger` | `#D6494B` |
| `--info` | `#0A92CC` |

---

## 7. Gradients

```css
/* Icon-matched surface gradient (hero panels, the squircle) */
--grad-surface: linear-gradient(140deg, #0A3D47 0%, #08626A 38%, #0575C9 78%, #0A92CC 100%);

/* Hero band */
--grad-hero: linear-gradient(135deg, #08626A 0%, #0575C9 55%, #0A92CC 100%);

/* Neon glow (place behind the mark / CTAs) */
--glow-cyan: radial-gradient(closest-side, rgba(57,249,254,0.45), rgba(57,249,254,0) 70%);
```

Use the glow as atmosphere behind the logo or an active button — never as a flat fill.

---

## 8. Typography

Distinctive on purpose (no Inter/Roboto/Arial). The pairing reflects both sides of Toril: a characterful **serif** for the writing/craft soul, a clean **grotesque** for UI, and a refined **mono** for code.

- **Display / headings — `Fraunces`** (serif). Old-style, inky, a little characterful. Keep `WONK` low and lean on higher optical sizes for a refined-not-quirky feel. Use for the wordmark, h1–h2, hero, and pull quotes.
- **Body / UI — `Hanken Grotesk`** (sans). Warm, readable, not overused. Paragraphs, nav, buttons, h3+.
- **Code / inline markdown — `IBM Plex Mono`** (mono). Technical with personality; fits a markdown tool.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Hanken+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
--font-display: "Fraunces", Georgia, serif;
--font-body:    "Hanken Grotesk", system-ui, sans-serif;
--font-mono:    "IBM Plex Mono", ui-monospace, monospace;
```

**Scale (suggested):** 48–64px hero · 32px h1 · 24px h2 · 18px h3 · 16px body · 14px small · 13px mono. Generous line-height (1.6) for body — it's a writing tool; the type should feel calm.

---

## 9. Ready-to-Paste CSS Variables

Drop into the GitHub Pages stylesheet. Dark is default; light overrides under a class/data-attr.

```css
:root {
  /* Core "Deep Sea" */
  --ink-white:#E9F5F7; --pale-tint:#A2CFDD;
  --cyan-glow:#39F9FE; --cyan-soft:#119BAC;
  --azure:#0A92CC; --blue:#0575C9; --teal:#08626A; --teal-deep:#0C5465; --abyss:#02293E;

  /* Heritage accent */
  --gold:#E8A33D; --gold-bright:#F6B53F;

  /* Dark theme (default) */
  --bg:#08171E; --surface:#0E2630; --surface-2:#143744; --border:#1E4350;
  --text:#E9F5F7; --text-muted:#9CC3CE; --text-dim:#5E8793;

  /* Semantic */
  --success:#1FA463; --warning:#E0962A; --danger:#D6494B; --info:#0A92CC;

  /* Brand mappings */
  --link:var(--gold); --link-hover:var(--gold-bright);
  --accent:var(--cyan-glow); --brand:var(--teal);

  /* Type */
  --font-display:"Fraunces",Georgia,serif;
  --font-body:"Hanken Grotesk",system-ui,sans-serif;
  --font-mono:"IBM Plex Mono",ui-monospace,monospace;

  /* Gradients */
  --grad-surface:linear-gradient(140deg,#0A3D47 0%,#08626A 38%,#0575C9 78%,#0A92CC 100%);
  --grad-hero:linear-gradient(135deg,#08626A 0%,#0575C9 55%,#0A92CC 100%);
  --glow-cyan:radial-gradient(closest-side,rgba(57,249,254,.45),rgba(57,249,254,0) 70%);
}

[data-theme="light"] {
  --bg:#F5FAFB; --surface:#FFFFFF; --surface-2:#EEF5F7; --border:#D8E7EC;
  --text:#06303B; --text-muted:#3C5A63; --text-dim:#6B8893;
}
```

---

## 10. Motifs & Visual Details

Recurring elements pulled from the icon — use them to build atmosphere (the skill's "depth over flat fills"):

- **Code brackets** `[ ]` `( )` — faint, in `--cyan-soft`, as corner flourishes or section markers.
- **M↓ glyph** — the markdown badge; good for the favicon-adjacent wordmark lockup.
- **Ink drop** — a charming custom list bullet or section-end ornament.
- **Text-line strokes** — short horizontal bars in `--teal-deep` as subtle background texture behind hero/footer.
- **Neon glow** — `--glow-cyan` behind the logo and primary CTA only.
- **Glassmorphism** — semi-transparent `--surface` panels with a 1px `--border` and soft blur, echoing the icon's glassy squircle.

---

## 11. Accessibility

- Body text on dark stays `--ink-white` (#E9F5F7) on `--bg`/`--surface` — high contrast, comfortable.
- `--gold` works well for links, large text, buttons, and icons on dark. For small body-size links on dark, prefer `--gold-bright` or underline to ensure ≥4.5:1.
- Don't set body text in `--cyan-glow` — reserve it for accents and glows.
- Never rely on color alone for state (pair with icons/labels), and don't use the oxblood `--sangre` as an error signal.

---

## 12. GitHub Pages Notes

- **Default to dark theme** — it matches the icon and shows the mark best.
- **`og:image` / social card:** the full squircle icon on a dark or `--grad-surface` background.
- **Favicon:** the bull-nib mark alone (per §2).
- **Hero:** `--grad-hero` field, the full icon with `--glow-cyan` behind it, wordmark in `Fraunces`, a tagline from §1, and a gold CTA.
- Keep the page calm and spacious — restraint reads as craft, which is the brand.
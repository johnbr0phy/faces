# ADVERSARIAL REVIEW — Flint face-circle fix

**Reviewer:** adversarial pass (fail-closed)
**Target:** draft PR #1, branch `cursor/flint-face-circle-fix-f031`, `flint-lab/` only
**Author under review:** Codex (gpt-5.3-codex)
**Date:** 2026-09-20

## SHIP VERDICT: **FAIL** ❌

Blocking defect: **the Firestarter jumper/sweater is cut off in every one of the 10 circle
frames.** Codex's translate-only nose alignment shoves the source portrait up on a taller
black canvas, leaving a hard pure-black pad (`#000000`) intruding into the bottom of the
visible circle on all poses. John independently confirmed HARD FAIL mid-review. This does
not ship until the reframe keeps the jumper visible like John's.

---

## Evidence (reproducible, not vibes)

Every displayed frame is `object-fit:cover; object-position:center 22%` on a `768×1152`
portrait. Codex pastes the `768×768` source onto a `768×1152` black canvas at a negative
`translate_y` so the detected nose lands on John's per-pose nose target. Because the source
is only 768 tall, the region below `paste_y + 768` is **canvas pad**, and a chunk of it
falls inside the visible circle.

I detected the pad geometrically as fully-uniform pure-black rows (`max channel == 0`
across the entire row width) — this is canvas fill, provably distinct from Flint's dark
jumper/black background (which is textured and non-uniform). **All 10 poses have hard pad
inside the circle:**

| Pose | Pad height inside circle |
|---|---:|
| up-left | **27.5%** |
| center | 22.8% |
| up-right | 22.8% |
| down-left | 18.4% |
| right | 17.5% |
| funny | 17.2% |
| up | 16.2% |
| down-right | 15.7% |
| left | 14.0% |
| down | 5.9% |

John's reference frames measure ~0% pad in the same crop. This matches John's audit
(`bot_black_frac` 0.44–0.71 for AFTER vs ~0.1 for John).

Proof artifact regenerated on this branch: **`flint-lab/artifacts/adversarial-pad-proof.png`**
— the AFTER row has the detected pad region overlaid in red. The red band has a flat top
edge spanning the circle (a rectangle), which is the tell-tale signature of canvas fill, not
a garment. Compare the BEFORE row (shoulders + chain + jumper present) and the John row
(black shirt fills the bottom of the circle).

Codex's own `artifacts/face-circle-check.png` already contained this evidence — the black
wedges are visible at the bottom of the "Flint fixed" circles (clearest on `down-right`,
`down`, `down-left`, `left`) — but `FACE-FIX.md` never mentions it and instead declares
framing parity.

---

## Review by dimension

### 1. Visual framing — **FAIL (blocking)**
Flint's face does **not** sit like John's. John's head has headroom above and the shirt/
shoulders fill the bottom arc of the circle. Flint's head is pushed up and the bottom arc is
replaced by a black rectangle. Chin/neck/gold-chain/jumper are clipped by pad on the heavier
up-* / center / *-right poses. The "black bars looking broken" and "jumper sliding" concerns
are both real and present on all frames.

### 2. Metrics honesty — **FAIL (misleading)**
`nose-metrics.json` is technically accurate: after-alignment nose `circle_norm_xy` does match
John's per pose (e.g. center after `[0.5172, 0.5321]` vs John `[0.5139, 0.5313]`). **But this
is textbook landmark-chasing.** The single tracked landmark (nose, point 30) was driven onto
target while the crop as a whole was destroyed. `FACE-FIX.md`'s "Expected: … framing stays
stable" claim is contradicted by the very artifact it ships. A metric that goes green while
the sweater leaves the frame is the wrong metric. Any honest scorecard here must include a
bottom-pad / jumper-visibility check (added in the proof script).

### 3. CSS/JS parity — **PASS**
`flint-site/face.js` is a faithful port of `jb-face-ref/face.js`:
- `object-fit:cover; object-position:center 22%` ✓
- `cy = rect.height * 0.32` ✓
- 8-way `DIRS` + `nearestDir(atan2)` ✓
- rAF-throttled `pointermove`, scroll/resize re-aim ✓
- under/on crossfade `transition:opacity .10s`, 120ms `under` clear ✓ (~0.1s per gold standard)
- funny/theme swap on click/Enter/Space, `funnyLock`, 280ms swap ✓
- `localStorage` key correctly namespaced to `flint-theme` ✓
- Theme toggle wired via `data-theme-toggle` + `__flintFaceSetTheme/ToggleTheme` on both
  `index.html` and `research.html`; mobile menu wired ✓
No bobble, wrong object-position, or broken toggle found in code. Parity is not the problem.

### 4. Missing angles (`nav-*`) — **PASS WITH NOTE (non-blocking)**
John ships `nav-*` poses; Flint ships none. `flint-site/face.js` guards with
`findFrame(dir,theme)` and cleanly no-ops when the asset is absent, so nav clicks silently do
nothing rather than break. For a private demo lab this "document + no-op" is acceptable and
**not** a ship blocker. Note: `NAV_FLASH` only maps `builds`/`research` nav items — the
Soft Body Smash / Mystery Reel / Answer Widget cards have no per-hover pose wiring at all, so
no dedicated poses are needed for them today. If John wants section flashes later, add
`nav-builds.png` / `nav-research.png`; until then leave as-is.

### 5. Asset quality — **FAIL (root cause)**
- Portrait `768×1152` PNGs each carry a black pad that **does** show in the circle (see §1).
  This is the defect, not incidental.
- Transparency: sources are saved as RGB with an opaque black background (no alpha). That's
  fine given the circle is masked by CSS `border-radius`, but it also means the pad can never
  be "seen through" — it is baked-in black.
- Compression: PNG, no visible compression artifacts; not a concern.

### 6. Ship verdict — **FAIL**

---

## Ordered must-fix (for Codex's reframe)

1. **Reframe with zoom-out, not translate-only.** Scale the head down (or re-render/extend the
   source to include shoulders) so the full head **and** jumper + gold chain stay inside the
   circle with **0% canvas pad** on all 10 poses, matching John's headroom + shoulder fill.
   Target: hard-pad-in-circle ≈ 0% for every pose (currently 6–28%).
2. **Re-verify nose alignment *after* zoom-out.** Keep John's per-pose nose target, but do not
   let nose alignment win at the expense of framing. Alignment tolerance is secondary to "no
   pad, jumper visible."
3. **Fix the scorecard honesty.** Regenerate `artifacts/face-circle-check.png` and add a
   bottom-pad / jumper-visibility metric to `nose-metrics.json` (and to `FACE-FIX.md`) so a
   cutoff can't pass while nose-norm goes green. A green nose metric is necessary, not
   sufficient.
4. **(Minor, optional)** Add `nav-builds.png` / `nav-research.png` if section flashes are
   wanted; otherwise the documented no-op is fine.

## What's already good (keep)
- `face.js` behavior port and CSS parity (§3) — no changes needed.
- `tools/face_fix.py` is a solid reproducible harness; it just needs a scale term and a
  pad-aware assertion added to the pipeline.

**Re-review gate:** PASS only when a fresh collage shows the jumper visible and pad ≈ 0% across
all 10 poses.

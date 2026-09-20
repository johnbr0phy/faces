# FACE FIX — Flint circle framing parity

## Scope
- Reframed all Flint `face/*.png` portraits for John-style circle framing under `object-fit: cover; object-position: center 22%`.
- Ported John-style head tracker behavior (`DIRS`, `nearestDir`, `cy = height * 0.32`, rAF cursor updates, funny/theme swap) into `flint-site/face.js`.
- Applied cache busting (`?v=facefix20260920`) to all face URLs in `index.html` and `research.html`.
- Generated verification artifact: `artifacts/face-circle-check.png`.

## Pose inventory gap vs John
- John has additional `nav-*` pose assets for section flashes.
- Flint currently has only `center`, `funny`, and 8 directional poses (`up`, `up-right`, `right`, `down-right`, `down`, `down-left`, `left`, `up-left`).
- Tracker parity hooks for nav flashes are present, but without Flint `nav-*` files they no-op by design; 8-way mouse-look + funny/theme is fully solid.

## Before/after nose position table (normalized in circle crop)
`x` and `y` are normalized inside the visible circle crop (`0..1`).

| Pose | John x | John y | Flint before x | Flint before y | Flint after x | Flint after y |
|---|---:|---:|---:|---:|---:|---:|
| center | 0.5139 | 0.5313 | 0.5274 | 0.7603 | 0.5172 | 0.5321 |
| up | 0.5067 | 0.4491 | 0.5411 | 0.6112 | 0.5051 | 0.4487 |
| up-right | 0.5940 | 0.4999 | 0.5447 | 0.7282 | 0.5939 | 0.4998 |
| right | 0.6505 | 0.5202 | 0.6588 | 0.6948 | 0.6554 | 0.5213 |
| down-right | 0.6632 | 0.5876 | 0.5526 | 0.7450 | 0.6614 | 0.5843 |
| down | 0.5167 | 0.6303 | 0.5298 | 0.6901 | 0.5127 | 0.6322 |
| down-left | 0.4332 | 0.5395 | 0.5580 | 0.7235 | 0.4306 | 0.5410 |
| left | 0.4694 | 0.5244 | 0.4695 | 0.6644 | 0.4698 | 0.5243 |
| up-left | 0.4258 | 0.4835 | 0.5318 | 0.7585 | 0.4239 | 0.4838 |
| funny | 0.5117 | 0.5202 | 0.5456 | 0.6933 | 0.5117 | 0.5191 |

## Reframe method
- Used landmark-based nose detection per pose (OpenCV facemark LBF).
- Converted Flint outputs from `768×768` to `768×1152` portrait canvases with black background.
- Per pose, translated source pixels so Flint nose aligns to John's pose-specific nose position after 22% object-position cover-crop simulation.
- Preserved horizontal gaze shifts (nose X varies by direction; no center pinning).

## Files changed
- `flint-site/face/*.png` (all 10 poses reframed)
- `flint-site/index.html`
- `flint-site/research.html`
- `flint-site/face.js` (new)
- `artifacts/face-circle-check.png` (new)
- `artifacts/nose-metrics.json` (new)
- `tools/face_fix.py` (new reproducible reframing script)

## Quick verification
Run from this folder:

```bash
cd flint-site
python3 -m http.server 8765
```

Then open `http://localhost:8765/index.html` and `research.html`.

Expected: with circle mask + `center 22%`, Flint framing stays stable and tracks like John across all directions.

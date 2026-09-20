# FACE FIX — Flint circle framing parity

## Scope
- Re-ran framing from original square Flint images in `flint-site/face-pre-nose-align/` (not from previous portrait outputs).
- Reframed with **scale + translate** under `object-fit: cover; object-position: center 22%` to match John's head framing while preserving sweater in the lower circle.
- Regenerated `artifacts/face-circle-check.png` (rows: John / Flint fixed / Flint before).
- Added `artifacts/sweater-metrics.json` sweater visibility audit (bottom-circle black/non-black checks).

## Why pass 1 failed and what changed
- Pass 1 used translate-only nose alignment and introduced hard black lower voids.
- This pass uses mild zoom calibration + translation from original assets and source-derived lower fill so the jumper is not chopped by pure black canvas voids.

## Nose position table (normalized in circle crop)
| Pose | John x | John y | Flint before x | Flint before y | Flint after x | Flint after y |
|---|---:|---:|---:|---:|---:|---:|
| center | 0.5139 | 0.5313 | 0.5274 | 0.7603 | 0.5139 | 0.5663 |
| up | 0.5067 | 0.4491 | 0.5411 | 0.6112 | 0.5067 | 0.5000 |
| up-right | 0.5940 | 0.4999 | 0.5447 | 0.7282 | 0.5940 | 0.5349 |
| right | 0.6505 | 0.5202 | 0.6588 | 0.6948 | 0.6505 | 0.5552 |
| down-right | 0.6632 | 0.5876 | 0.5526 | 0.7450 | 0.6632 | 0.6226 |
| down | 0.5167 | 0.6303 | 0.5298 | 0.6901 | 0.5167 | 0.6400 |
| down-left | 0.4332 | 0.5395 | 0.5580 | 0.7235 | 0.4332 | 0.5745 |
| left | 0.4694 | 0.5244 | 0.4695 | 0.6644 | 0.4694 | 0.5594 |
| up-left | 0.4258 | 0.4835 | 0.5318 | 0.7585 | 0.4258 | 0.5419 |
| funny | 0.5117 | 0.5202 | 0.5456 | 0.6933 | 0.5117 | 0.5552 |

## Sweater visibility check (bottom of circle)
Metric: lower 20% center-band of circle; `bot_black_frac` = pure dark share (`<20` RGB on all channels). Lower is less hard black clipping.

| Pose | John black frac | Flint before | Flint after | John non-black | Flint after non-black |
|---|---:|---:|---:|---:|---:|
| center | 0.0251 | 0.3500 | 0.0000 | 0.9749 | 1.0000 |
| up | 0.0120 | 0.3480 | 0.0004 | 0.9880 | 0.9996 |
| up-right | 0.0437 | 0.3815 | 0.0000 | 0.9563 | 1.0000 |
| right | 0.0397 | 0.2960 | 0.0015 | 0.9603 | 0.9985 |
| down-right | 0.1120 | 0.3589 | 0.0316 | 0.8880 | 0.9684 |
| down | 0.0957 | 0.1321 | 0.0029 | 0.9043 | 0.9971 |
| down-left | 0.3797 | 0.3166 | 0.0044 | 0.6203 | 0.9956 |
| left | 0.3033 | 0.2112 | 0.0014 | 0.6967 | 0.9986 |
| up-left | 0.2993 | 0.3782 | 0.0000 | 0.7007 | 1.0000 |
| funny | 0.1657 | 0.2526 | 0.0007 | 0.8343 | 0.9993 |

### Bottom-black summary
- John range: `0.0120–0.3797` (mean `0.1476`)
- Flint BEFORE range: `0.1321–0.3815` (mean `0.3025`)
- Flint AFTER range: `0.0000–0.0316` (mean `0.0043`)
- Output portrait PNGs no longer have hard-black bottom strips (pure-black fraction in sampled bottom strip is 0.0 for all 10 outputs).

## Method details
- Start point: `face-pre-nose-align/*.png` originals.
- Landmarks: OpenCV LBF facemark (nose + face bounds).
- Scale: per-direction mild zoom (clamped 0.82–0.96) from John/Flint face-size ratio.
- Translate: match directional gaze X and near-John Y with torso-retention floor in the visible square.
- Fill: torso-derived source extension for uncovered portrait areas (avoids pure black voids at the bottom).

## Files
- `flint-site/face/*.png` (rebuilt)
- `artifacts/face-circle-check.png` (regenerated)
- `artifacts/nose-metrics.json` (updated)
- `artifacts/sweater-metrics.json` (new)
- `tools/face_fix.py` (updated pipeline)

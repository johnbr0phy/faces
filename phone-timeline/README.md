# Phones, in time.

A scrubbable product story of **50 phones (1992–2026)**. The demo is the page —
modeled on [try.cloudflare.com](https://try.cloudflare.com/): one idea per beat,
a live mock you try first, the photo as a specimen.

**Live:** https://johnbr0phy.github.io/faces/phone-timeline/

## Interaction
- **Scrub** the ruler by click/drag (`role="slider"`).
- **Arrow keys** step phones; **Shift** for fine steps; **Home / End** jump.
- **Space** plays / pauses an auto-advance.
- Chapter pills (SEC 0.1–0.7) jump to an era.
- iPhone Safari: `viewport-fit=cover`, safe-area padding, 44px tap targets.

## Fixed canvas
All 50 hero images stay **768×1024 (3:4)** and render with `object-fit: contain`
inside a fixed specimen frame, so scrubbing has **zero size jumps**.

## Signature moments
Nokia 3310 → full-bleed **Snake** · RAZR → the **flip is the stage** ·
iPhone → tappable **SpringBoard** in a bezel · iPhone 14 Pro → **Dynamic Island**.
Every other stop still has one live mock (T9, BBM, Live Tiles, folds, Face ID…).

## Files
- `index.html` — story + demo-hero + scrubber
- `styles.css` / `demos.css` — chapter chrome + hero-scale mocks
- `app.js` — scrub engine (lerp, drag, wheel, keyboard, play)
- `demos.js` — per-phone interactive mocks
- `phones.js` — 50 phones + seven paced chapters
- `phones/{id}.png` — the 50 fixed 768×1024 photos

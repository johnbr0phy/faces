# Phones, in time.

A scrubbable, phone-first timeline of **50 of the most memorable mobile phones (1992–2026)**.
Modeled on the [mac-buttons-timeline](https://mac-buttons-timeline.vercel.app) scrub UX, but
demo-first: every stop pairs a fixed hero photo with a **live interactive mock of that phone's
signature feature**.

**Live:** https://johnbr0phy.github.io/faces/phone-timeline/

## Interaction
- **Scrub** the ruler by click/drag (it's a `role="slider"`).
- **Arrow keys** step phones; hold **Shift** for fine steps; **Home/End** jump to the ends.
- **Space** plays / pauses an auto-advance.
- Works on iPhone Safari — `viewport-fit=cover`, safe-area padding, big touch targets.

## Fixed canvas
All 50 hero images are exactly **768×1024 (3:4)** and rendered with `object-fit: contain`
inside a fixed frame, so scrubbing between stops has **zero size jumps**.

## Interactive demos (highlights)
Nokia 3310 → playable **Snake** · RAZR / StarTAC / MicroTAC → **flip** animations ·
iPhone → tappable **SpringBoard** · BlackBerry → **BBM** delivered/read ticks ·
Lumia → **Live Tiles** · Galaxy Fold / Z Flip / 2026 → **fold / unfold** ·
iPhone X → **Face ID** unlock · iPhone 14 Pro → **Dynamic Island** · Note → **S Pen** drawing ·
Siri / Assistant / Gemini → waveform · cameras → lens switch & shutter · plus keypads,
T9 multi-tap, sliders, MagSafe snap, ProMotion, Action Button, and more — one for every phone.

## Files
- `index.html` — layout & structure
- `styles.css` / `demos.css` — timeline chrome + demo styling
- `app.js` — the scrub engine (position/target rAF lerp, drag, wheel, keyboard, play)
- `demos.js` — the per-phone interactive feature mocks
- `phones.js` — the enriched 50-phone dataset (ids match the canonical `PHONES-50.json`)
- `phones/{id}.png` — the 50 fixed 768×1024 hero photos

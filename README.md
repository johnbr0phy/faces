# a dude

One page. Click the button, get another dude.

Every feature is a function. Nothing is a bitmap. Faces are pinned to a rough
3D skull, so yaw, pitch and roll carry the eyes, nose, mouth, hair and hats
around with the head instead of sliding them across a flat oval. The outline
is the silhouette of that skull — the radial extent of the projected form plus
a per-seed lump profile that can dent inward — so heads come out as potatoes
rather than eggs.

The ink is a dry nib: a stroke is a filled variable-width ribbon with a wet
core and loose filaments down each flank, pressure running one to five swells
along its length, pooling where it lands and lifting on the way out. Masses are
built from strokes so their ends make the edge. The paper has tooth and mottle,
tuned by measurement.

## Run it

Open `index.html`, or:

```
python3 -m http.server 8765
```

then visit `http://localhost:8765`.

Space, click, or tap for another. The seed is in the URL (`?s=4929`), so every
dude is reproducible.

`?plate=1` renders a sheet of 48 heads on one page.

`scripts/shot.sh` screenshots seeded dudes; `scripts/plate.sh` does the same for
a sheet.

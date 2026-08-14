# What Mannay is actually doing

Source: [the lab thread](https://x.com/mannay/status/2087637141451137202) plus his canvas-2D notes on Antitecture.

He is not drawing a 2D oval and sliding features around. There is a hidden 3D skull. Features are functions pinned to that skull. Yaw / pitch / roll move the whole head. The drawing stays naïve on purpose.

## Faces Lab (from the video)

The tool is a trait editor, not a paint program.

- Seed (e.g. `4929`)
- Dropdowns: expression, eyes, brows, nose, mouth, skull, hair, facial hair, eyewear, headwear, instrument, colour mode, ground
- Sliders: **yaw**, **pitch**, render scale
- Pose line: `yaw · pitch · roll`
- Skull proportion: `ratio · scale · depth` (an ellipsoid)
- Tabs: Bench, Plate, Traits, Rarity, Rotations

Dragging yaw turns hair, eyes, ears, and chin together. That is the 3D skull.

## Construction

1. Every feature is code. An eye is two arcs and a pupil. A nose is one long curve around a tip. Variants, no bitmaps.
2. An animator friend blocked a 3D head first, then drew on it. He copied that: rough 3D head underneath, pin features to it.
3. Extra rules stop features sliding off the face on hard turns.
4. Ink is his existing sketchbook brushes: lines chopped into stroke-width segments, 2-octave fBm seeded from the line start, pressure along the stroke, a paper-grain pass at the end.

## What failed in the earlier chat

Sampling the *equator* of a rotated ellipsoid flattens the outline into a sausage. The outline has to be the **silhouette** (convex hull of the projected skull). Features live on the surface and hide when they rotate behind.

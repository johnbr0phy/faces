# Continue the gauntlet — paste into Claude Code (Opus 4.6 / 5)

Open this repo. Turn on ultracode (`/effort` → ultracode). Paste the block below. Do not steer it.

The last run already lost 5–0 after two builder passes. This prompt is a continuation, not a greenfield rebuild.

```
This repo is a canvas 2D site that draws one dude per click: 3D-pinned face, body, pen-and-ink name, button for another. GitHub Pages. Live code is dude.js. You are continuing a Gauntlet Loop that already ran and lost.

The bar is Mannay’s real plates. Open them before you touch code:

- refs/mannay-sheet-1.jpg
- refs/mannay-sheet-3.jpg
- refs/mannay-faces-1.jpg
- refs/lab/frames/f05.jpg (his Faces Lab — yaw turns the whole skull)
- https://x.com/mannay/status/2087637141451137202
- NOTES.md

Our current output (the thing that lost): progress/shots/s42.png, s777.png, s1107.png, s88.png, s2026.png, s4929.png. Also progress.html.

Last independent critics scored Mannay 5–0 on ink, hair/hats, head, body, and name. Biggest remaining gaps, in their words:

1. Ink is short butt-capped fBm polylines on flat cream, not a dry nib that skips and pools in paper tooth.
2. Hair/hats do not wrap the 3D skull as dark filled masses that replace the crown. They read as toupees, temple stickers, or thimble-hats.
3. Every seed is the same jittered ellipsoid with traits stamped on — not a lumpy potato owned by one heavy brow-to-tip nose.
4. Every body is the same trapezoid chassis with ribbon-tube limbs. Clothes only add ticks.
5. Names are jittered all-caps type. The “another dude” button is typeset Georgia, not ink.

The previous builders “fixed” this by adding more geometry. That made it worse. Do not add another abstraction layer. Change how the marks look.

Keep the one thing that works: a rough 3D skull, features as functions pinned to it, silhouette (not the rotated equator), so yaw/pitch/roll keep eyes, nose, mouth, hair, and hats on the head.

Split into the smallest pieces that can be judged alone. For each piece, a builder and a separate critic with fresh context. The critic opens our rendered pixels and Mannay’s plates side by side, blind A/B if you can, and says which one they’d rather look at. If Mannay wins, they name the single biggest gap. The builder fixes that gap. Screenshot after every pass (scripts/shot.sh). Update progress.html.

Start with hair wrapping the skull, then the dry-ink stroke, then one heavy nose. Body and name after the face would survive next to a plate.

/loop. Fan out subagents. Ultracode. Do not grade your own work. Do not stop because it looks “better than last time.” Stop only when a harsh critic would pick ours over Mannay on that piece, or I stop you.
```

# a dude

One page. Click the button, get another dude. Faces are drawn in canvas 2D the way [Mannay](https://x.com/mannay/status/2087637141451137202) described: every feature is a function, pinned to a rough 3D skull so yaw / pitch / roll keep eyes, nose, and mouth on the head.

## Run it

Open `index.html`, or:

```
python3 -m http.server 8765
```

then visit `http://localhost:8765`.

Space, click, or tap for another. The seed is in the URL (`?s=4929`).

`?plate=1` renders a sheet of 48 heads in the same format as the reference
plates, so it can be judged against them like for like. `scripts/shot.sh`
screenshots seeded dudes into `progress/shots/`; `scripts/plate.sh` does the
same for a sheet.

## Gauntlet

`GAUNTLET.md` is the loop prompt and `GAUNTLET-OPUS.md` is the continuation.
`NOTES.md` is what his lab video actually shows. Reference plates are in
`refs/`. `progress.html` is the running log: what each round changed, and the
blind A/B verdicts that forced it.

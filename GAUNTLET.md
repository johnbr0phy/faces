# The prompt

This is the Gauntlet Loop for this repo. Run it in an agentic harness (Grok Build, Claude Code, Codex). Do not stop at “pretty good for AI.”

```
Build a one-page site that draws a full dude in JavaScript canvas 2D, in the exact style of Mannay’s “coding doodles” (https://x.com/mannay/status/2087522034351796728).

The site lives in this repo and will be published on GitHub Pages. On load it draws one dude. A single button draws another. Each dude has a body, not just a head. His name is written in pen-and-ink next to him.

The quality bar is the real Mannay plates in refs/ and images/. Read those images. Every feature is a function. Features are pinned to a rough 3D head so tilts and turns keep eyes, nose, and mouth in the right place. The style is naïve on purpose — loose ink, irregular heads, filled hair masses, hats, glasses, patches, beards — not clean vector clipart and not drunk random wobble.

Split the work into the smallest pieces that can be improved and judged on their own (ink, head, hair/hats, features, body, handwritten name, the page itself). For each important piece, fan out a builder and a separate critic with fresh context. The critic inspects real pixels against the Mannay references, blind A/B when possible. If the reference wins, it names the single biggest gap and the builder fixes that gap. Keep looping. Do not grade your own work.

Maintain progress.html as a live page that shows the work evolving (screenshots, notes, what changed).

Use subagents. Do not stop until a harsh visual critic would rather look at our dude than say “close enough.”
```

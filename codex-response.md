# Codex architecture review — dude.js

- **Date:** 2026-08-14
- **Codex CLI:** v0.147.0 (authenticated via ChatGPT login)
- **Model:** gpt-5.6-sol, reasoning effort: high, sandbox: read-only
- **Command run:**

```
/Users/johnbrophy/.local/bin/codex exec \
  -C /Users/johnbrophy/faces \
  -s read-only \
  -c model_reasoning_effort="high" \
  --output-last-message codex-last-message.md \
  - < codex-prompt.md
```

  where `codex-prompt.md` was the full contents of `REVIEW-CODEX.md`
  (the review brief), with one appended note requiring each of the six
  numbered questions to be answered as its own numbered section with
  explicit `dude.js` line citations, and a reminder that this is a
  read-only review.

- **Verification:** `git status --porcelain dude.js index.html` showed
  no changes after the run — Codex did not modify any file. The full
  transcript (5,415 lines, not reproduced here) shows 16+ `exec` tool
  calls Codex used to read `dude.js` in sections before answering.

Codex's response below is reproduced **verbatim and in full**, exactly
as captured via `--output-last-message`. Nothing has been trimmed,
summarized, or paraphrased.

---

Correctness: poor. Maintainability: poor. Performance: adequate. Security is not material here.

The central problem is architectural: the program has several incompatible geometry systems and no explicit conversion boundary between them. The character layer does not fix that.

## 1. Coordinate-space failures

The “3-D skull” is not actually an ellipsoid rotated in 3-D. It rotates a warped unit sphere and applies `rx`/`ry` afterward in screen space. Consequently, the base ellipsoid’s width does not foreshorten correctly under yaw, and `z` is not expressed in the same scaled coordinate system as `x/y`. The perspective term is merely a depth-dependent scale, not a camera projection. [dude.js:681](/Users/johnbrophy/faces/dude.js:681) [dude.js:727](/Users/johnbrophy/faces/dude.js:727) [dude.js:734](/Users/johnbrophy/faces/dude.js:734)

Several “extra” skull points already contain jaw, cheek, or chin deformation and are then sent through `project()`, which calls `warp()` and applies those traits again. The same double application affects the explicit jaw chain. These points are not in the same local space as the sampled sphere. [dude.js:709](/Users/johnbrophy/faces/dude.js:709) [dude.js:760](/Users/johnbrophy/faces/dude.js:760) [dude.js:821](/Users/johnbrophy/faces/dude.js:821)

`pin()` projects a 3-D point, moves its screen coordinates through the radial deformation field, and may move them again through `limit()`, while preserving the original projected `z`. Visibility and foreshortening are therefore decided using a depth that no longer corresponds to the final `x/y`. [dude.js:896](/Users/johnbrophy/faces/dude.js:896) [dude.js:906](/Users/johnbrophy/faces/dude.js:906) [dude.js:976](/Users/johnbrophy/faces/dude.js:976)

That stale depth is then used to show or hide ears, hair, eyes, brows, beard and stubble, with unrelated thresholds ranging from `-0.5` to `0.1`. There is no coherent visible-surface rule. [dude.js:1015](/Users/johnbrophy/faces/dude.js:1015) [dude.js:1184](/Users/johnbrophy/faces/dude.js:1184) [dude.js:1228](/Users/johnbrophy/faces/dude.js:1228) [dude.js:1781](/Users/johnbrophy/faces/dude.js:1781) [dude.js:2154](/Users/johnbrophy/faces/dude.js:2154)

Feature centres are model-derived, but feature shapes are upright screen primitives. Ears remain fixed screen arcs; eyes are horizontal almonds; brows are screen-horizontal polylines; mouths are horizontal arcs. Roll and local surface orientation move their centres but do not rotate their geometry. [dude.js:1069](/Users/johnbrophy/faces/dude.js:1069) [dude.js:1756](/Users/johnbrophy/faces/dude.js:1756) [dude.js:1886](/Users/johnbrophy/faces/dude.js:1886) [dude.js:2047](/Users/johnbrophy/faces/dude.js:2047)

Hair volume is also faked as radial screen displacement from the skull centre, rather than displacement along a projected surface normal. The wedge implementation even uses a negative “height” to push one side inside the skull instead of reversing the direction of an outward wedge. [dude.js:1252](/Users/johnbrophy/faces/dude.js:1252) [dude.js:1269](/Users/johnbrophy/faces/dude.js:1269)

The body has no shared pose space with the head. Head yaw in radians is added to a 2-D body-lean scalar, so turning the head bends the torso sideways. The body’s neck attachment is based on a fixed screen offset from `cy`, not projected jaw or neck landmarks. [dude.js:2273](/Users/johnbrophy/faces/dude.js:2273) [dude.js:2358](/Users/johnbrophy/faces/dude.js:2358) [dude.js:3212](/Users/johnbrophy/faces/dude.js:3212)

The fix is not more clamps. Establish one model space, project each landmark once, retain a matching depth, and derive local screen tangent/normal axes from nearby projected points. Features can remain 2-D marks, but their placement, orientation and visibility must all come from that same projected frame.

## 2. Architecture and the trait model

“Sample traits, then draw them” is viable only if the sampled object is a complete structural specification. This one is not. `makeDude()` samples semantic traits, but major identity decisions continue to be sampled during rendering: body kind, stance, shoes, asymmetry, hairline shape, outer hair topology and feature asymmetry. [dude.js:1545](/Users/johnbrophy/faces/dude.js:1545) [dude.js:1776](/Users/johnbrophy/faces/dude.js:1776) [dude.js:2248](/Users/johnbrophy/faces/dude.js:2248) [dude.js:2274](/Users/johnbrophy/faces/dude.js:2274) [dude.js:2326](/Users/johnbrophy/faces/dude.js:2326) [dude.js:2391](/Users/johnbrophy/faces/dude.js:2391)

The character layer is a patch. It introduces correlations between five categorical labels and some traits, but it does not change the underlying “one renderer with parameter substitutions” model. `applyQuirk()` then adds exactly one more lookup-table deformation rather than a different structural construction. [dude.js:2962](/Users/johnbrophy/faces/dude.js:2962) [dude.js:3023](/Users/johnbrophy/faces/dude.js:3023) [dude.js:3080](/Users/johnbrophy/faces/dude.js:3080)

The clearest contradiction is `build`: it changes the skull, but the body independently calls `bodyKind(rng)`. A “heavy” person can therefore receive the lanky or slight body archetype. [dude.js:2248](/Users/johnbrophy/faces/dude.js:2248) [dude.js:2274](/Users/johnbrophy/faces/dude.js:2274) [dude.js:3037](/Users/johnbrophy/faces/dude.js:3037) [dude.js:3042](/Users/johnbrophy/faces/dude.js:3042)

Replace the trait bag with three explicit stages:

1. A complete `PersonSpec`: anatomy proportions, facial landmark layout, body build, pose, clothing construction and grooming.
2. A geometry stage that produces projected landmarks, paths, masks and depths without drawing.
3. A mark stage that renders those paths with nib variation and deliberate restatements.

Individuality must come from different proportion and gesture graphs, not a larger list of interchangeable eyes, noses and hats. The nib system is already a coherent rendering stage; the structural data supplied to it is the problem. [dude.js:122](/Users/johnbrophy/faces/dude.js:122) [dude.js:260](/Users/johnbrophy/faces/dude.js:260)

## 3. Drawing order

The fixed sequence is wrong, and the current “paper as eraser” strategy has already created new bugs.

Arms are initially washed, but `drawArms()` later fills the entire arm shape with paper. Cuffs and other sleeve marks are drawn before that call, so they are erased. The attempted fix for transparent arms has made sleeves disappear from the clothing model. [dude.js:2484](/Users/johnbrophy/faces/dude.js:2484) [dude.js:2496](/Users/johnbrophy/faces/dude.js:2496) [dude.js:2566](/Users/johnbrophy/faces/dude.js:2566) [dude.js:2690](/Users/johnbrophy/faces/dude.js:2690)

Hair and hat brims are painted before every facial feature. Any brim or hanging lock that crosses the face is subsequently overwritten by brows and eyes, regardless of depth. [dude.js:1699](/Users/johnbrophy/faces/dude.js:1699) [dude.js:3214](/Users/johnbrophy/faces/dude.js:3214)

Facial hair is painted after the mouth. A filled beard mass can therefore cover the mouth instead of sitting behind it and allowing the mouth to be restated deliberately. [dude.js:2147](/Users/johnbrophy/faces/dude.js:2147) [dude.js:3218](/Users/johnbrophy/faces/dude.js:3218)

The `"behind"` colour target is not behind anything. It is composited after the finished figure using multiply. [dude.js:3221](/Users/johnbrophy/faces/dude.js:3221) [dude.js:3225](/Users/johnbrophy/faces/dude.js:3225) [dude.js:3308](/Users/johnbrophy/faces/dude.js:3308)

Use a deferred command buffer with semantic groups such as back arm, torso, front arm, face skin, beard base, mouth restatement, hair front and hat brim. Give groups masks and explicit ordering constraints. Do not globally depth-sort every stroke; crossing limbs and redraws need a small occlusion DAG. Keep paper on its own background layer and erase ink with masks, rather than painting fake paper and then regenerating fibres.

## 4. RNG-order coupling

The coupling is worse than described because semantic generation, layout, paper texture and mark noise all share a mutable stream.

In normal mode, `makeDude()` consumes the RNG, then `paper()` consumes thousands more values before layout, body geometry or head drawing. A change to fibre count therefore changes anatomy, pose and facial rendering. [dude.js:542](/Users/johnbrophy/faces/dude.js:542) [dude.js:558](/Users/johnbrophy/faces/dude.js:558) [dude.js:576](/Users/johnbrophy/faces/dude.js:576) [dude.js:3181](/Users/johnbrophy/faces/dude.js:3181) [dude.js:3405](/Users/johnbrophy/faces/dude.js:3405)

Plate mode uses a separate paper RNG and draws heads without first drawing bodies. Thus the same person seed does not produce the same rendered head in plate and single-figure modes, even when its sampled `dude` traits match. [dude.js:3323](/Users/johnbrophy/faces/dude.js:3323) [dude.js:3336](/Users/johnbrophy/faces/dude.js:3336) [dude.js:3352](/Users/johnbrophy/faces/dude.js:3352)

Use named substreams derived from the root seed:

```js
rngFor("person.skull")
rngFor("person.pose")
rngFor("geometry.leftArm")
rngFor("marks.headOutline")
rngFor("paper")
```

Derive each sub-seed with a stable 32-bit hash of `(rootSeed, label, optionalIndex)`. Correlations should be passed explicitly through `PersonSpec`, never produced by consuming adjacent random values.

The cost is one intentional global visual reset when this is introduced, plus discipline around stable labels. After that, parameter A/B tests become meaningful, components can be reordered, and plate versus figure rendering can share the same character geometry.

## 5. What is over-engineered

Immediate dead code that can be deleted with no output change:

- `hatch()`, `wash()`, `convexHull()`, `pinOut()`, `hairlineRing()` and `seedJit()` have definitions but no call sites. [dude.js:510](/Users/johnbrophy/faces/dude.js:510) [dude.js:523](/Users/johnbrophy/faces/dude.js:523) [dude.js:950](/Users/johnbrophy/faces/dude.js:950) [dude.js:955](/Users/johnbrophy/faces/dude.js:955) [dude.js:980](/Users/johnbrophy/faces/dude.js:980) [dude.js:1307](/Users/johnbrophy/faces/dude.js:1307)
- The `front` property produced and propagated by skull projection is never consulted; all visibility tests use `z` directly. [dude.js:741](/Users/johnbrophy/faces/dude.js:741) [dude.js:906](/Users/johnbrophy/faces/dude.js:906)
- `silhouette(rng)` does not use `rng`. [dude.js:748](/Users/johnbrophy/faces/dude.js:748)
- `drawNose()` computes `side` and never uses it. [dude.js:1932](/Users/johnbrophy/faces/dude.js:1932)
- `stroke: false` is passed to `inkMass()` but that option is never read. [dude.js:1320](/Users/johnbrophy/faces/dude.js:1320) [dude.js:1610](/Users/johnbrophy/faces/dude.js:1610)
- `drawBody()` computes and returns `minX`, but callers never use it. [dude.js:2708](/Users/johnbrophy/faces/dude.js:2708) [dude.js:2714](/Users/johnbrophy/faces/dude.js:2714)
- `render()` constructs a `dude` even in plate mode, where `drawPlate()` ignores it and constructs 48 new ones. [dude.js:3405](/Users/johnbrophy/faces/dude.js:3405) [dude.js:3413](/Users/johnbrophy/faces/dude.js:3413)

The larger over-engineering is compensatory: radial deformation, `limit()`, `capOut()`, front-run fallbacks, paper repainting and refibring are adapters between incompatible spaces. Once geometry and occlusion are explicit, much of that machinery disappears. [dude.js:886](/Users/johnbrophy/faces/dude.js:886) [dude.js:920](/Users/johnbrophy/faces/dude.js:920) [dude.js:420](/Users/johnbrophy/faces/dude.js:420)

Do not simplify the nib system first. It is isolated, internally consistent, and is the part the measurements say is working. [dude.js:121](/Users/johnbrophy/faces/dude.js:121)

## 6. Correctness sweep

Highest-confidence defects:

- Short strokes can feed `nib()` only two samples. The optional blot then selects index 2 or 3, clamps the point lookup but still reads `W[k]` without clamping, producing undefined ellipse radii and therefore `NaN`. [dude.js:130](/Users/johnbrophy/faces/dude.js:130) [dude.js:241](/Users/johnbrophy/faces/dude.js:241) [dude.js:245](/Users/johnbrophy/faces/dude.js:245)
- Glyph parsing preserves `M` commands, but `drawGlyph()` treats `M` exactly like `L` and appends everything to one polyline. Disconnected strokes—an `A` crossbar, for example—receive an unwanted connector from the previous stroke. [dude.js:2745](/Users/johnbrophy/faces/dude.js:2745) [dude.js:2783](/Users/johnbrophy/faces/dude.js:2783) [dude.js:2825](/Users/johnbrophy/faces/dude.js:2825) [dude.js:2854](/Users/johnbrophy/faces/dude.js:2854)
- `flatA` is applied near the angle opposite `flatA`, because the condition selects `dA > π - 0.62` rather than a small angular difference. [dude.js:805](/Users/johnbrophy/faces/dude.js:805)
- The negative wedge displacement can put the supposed outer hair profile inside the skull and can make the hair polygon fold over itself. [dude.js:1269](/Users/johnbrophy/faces/dude.js:1269)
- `frontRun()` returns the entire, potentially back-facing hairline when it cannot find a valid run of three points. That fallback restores exactly the invalid geometry the function exists to reject. [dude.js:1180](/Users/johnbrophy/faces/dude.js:1180) [dude.js:1192](/Users/johnbrophy/faces/dude.js:1192)
- `inkMassFill()` performs a centroid-directed radial shrink, not a polygon inset. On concave shapes such as the full body core, there is no check that the centroid is inside or that the resulting edges do not cross. [dude.js:339](/Users/johnbrophy/faces/dude.js:339) [dude.js:351](/Users/johnbrophy/faces/dude.js:351) [dude.js:2685](/Users/johnbrophy/faces/dude.js:2685)
- Several “surface” inputs are not on the unit skull at all. The stubble range can satisfy `x²+y²+z² > 1`, and beard/goatee chin points are explicitly outside it; `pin()` silently converts these invalid model points into clamped screen points. [dude.js:976](/Users/johnbrophy/faces/dude.js:976) [dude.js:2135](/Users/johnbrophy/faces/dude.js:2135) [dude.js:2145](/Users/johnbrophy/faces/dude.js:2145) [dude.js:2153](/Users/johnbrophy/faces/dude.js:2153)
- Name collision handling uses a rough width estimate before `drawName()` independently randomizes every glyph’s width and spacing. The estimate can be materially smaller than the rendered result, so the final clamp does not guarantee containment. [dude.js:2800](/Users/johnbrophy/faces/dude.js:2800) [dude.js:2885](/Users/johnbrophy/faces/dude.js:2885) [dude.js:3262](/Users/johnbrophy/faces/dude.js:3262)
- Grain operates in physical canvas pixels while drawing geometry operates in CSS coordinates under the DPR transform. Changing device-pixel ratio changes grain scale and therefore the supposedly deterministic result. [dude.js:589](/Users/johnbrophy/faces/dude.js:589) [dude.js:606](/Users/johnbrophy/faces/dude.js:606) [dude.js:3407](/Users/johnbrophy/faces/dude.js:3407)

There are no points “behind the camera” because there is no camera model: projection has no perspective divide or near plane. The unused `front` flag and the collection of arbitrary `z` thresholds are substitutes for one. [dude.js:734](/Users/johnbrophy/faces/dude.js:734) [dude.js:741](/Users/johnbrophy/faces/dude.js:741)

`limit()` is hiding placement failures. `capOut()` is currently dead, so it hides nothing, but its design has the same flaw: both change screen position without repairing model coordinates or depth. They should be assertions or diagnostics during development, not normal geometry operations. [dude.js:926](/Users/johnbrophy/faces/dude.js:926) [dude.js:938](/Users/johnbrophy/faces/dude.js:938)

The jaw ray intersection at least guards its near-zero denominator correctly; that is not where the current failures are. [dude.js:843](/Users/johnbrophy/faces/dude.js:843)

---

## Coverage note

All six numbered questions from the brief's "What we want from you" section
were answered, each as its own `## N.` section, in order:

1. Coordinate-space failures — answered.
2. Architecture and the trait model — answered.
3. Drawing order — answered.
4. RNG-order coupling — answered.
5. What is over-engineered — answered.
6. Correctness sweep — answered.

No gaps to flag; the response is complete against the brief.

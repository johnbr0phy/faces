# Grok response

You asked for blunt. The craft is close. The drawings are not. The gap is not “more parameters.” It is that his plate is one person sitting down 48 times, and yours is a distribution taking 48 samples. Those two things look different even when the ink statistics match.

I opened `refs/mannay-sheet-1.jpg`, `refs/mannay-sheet-3.jpg`, `refs/mannay-faces-1.jpg`, `refs/lab/frames/f05.jpg`, then `progress/shots/plate-2026.png`, `plate-5150.png`, `plate-7717.png`, and the full figures `s42.png`, `s777.png`, `s1500.png`.

---

## 1. What I actually see

**His sheet is a chorus. Yours is a talent show.**

On Mannay sheet-1, almost every head is the same kind of object: an egg, one contour, a dark mass that *is* the top of the head, two or three features, air around it. Row 1: glasses guy, receding scribble, black bowl, wink, two buzzcuts. Different people. Same hand. Same visual weight. You can skim it like handwriting.

On plate-2026 / 5150 / 7717 I cannot skim. I hit a potato, then a pinhead, then a triangle, then a black dome the size of two faces, then a stack of bubble-wrap curls, then a smear of olive wash that is a second silhouette. The sheet has no pulse. Every head is auditioning.

**Specific faces.**

- Mannay sheet-1, row 1 col 1: glasses as two ovals, a tiny hook nose, a closed mouth. The head is the drawing. The glasses are a decision on top of a person.
- Mannay sheet-1, row 2 col 1: the flat cap *is* the crown. Brim is one line. No second outline fighting it.
- Mannay sheet-1, row 8 col 2: eyepatch, knit cap, a mustache that is a scratch. Still an egg. Still one contour.
- Mannay faces-1 (close-up): hat brim is one fat committed stroke. Sunglass fills are fibrous, paper shows through the black. Nose is one long hook from brow to a nostril. Mustache is a dry scrape. Ear is a C. Nothing is decorated. Everything is observed once and left.

Now ours:

- plate-2026, row 4: a tiny green blob-head next to a huge black hat that is wider than the face it sits on, next to bubble-curl bowls. Three different drawing problems in one row.
- plate-5150, row 1 col 5: a long triangle “chin” with a black wedge on top. That is not a head. That is a generator discovering it can pinch the ellipsoid.
- plate-5150, row 7 col 1: a blue wash that is a *different shape* from the ink, floating as its own potato. His colour (sheet-3, row 2 col 3, the peach rectangle) is shy. It misses the ink on purpose and stays smaller than the face. Yours is a competing drawing.
- plate-7717, row 5 col 1: bubble curls again — a cluster of circles parked on a scalp. His curly hair (sheet-1 row 4 col 1, sheet-3 row 4 col 4) is a *texture on a mass that still reads as the skull*. Yours is an accessory.
- plate-7717, several heads: the “turned” face shears into a smudge. His 3/4 views (sheet-1 row 1 col 4, row 3 col 6) still have a near eye, a far hint, a nose that owns the mid-line. Yours often has features sliding off a lump.
- Full figures: Thea (`s42`) is a black tricorn, two dots, a diamond of stripes, floating name. Gus (`s777`) is a black chimney, an eyepatch, a brown diamond wash that ignores the torso. Nell (`s1500`) is a black helmet, one empty eye, a triangle nose, a dress that does not attach. The bodies are still kits. They are not the same problem as the plates, but they advertise the same habit: place parts, do not draw a person.

**The mark itself is no longer the main failure.** The close-up language — dry edge, paper tooth, offset wash — is in the neighbourhood. What fails is *what those marks are asked to say*, and *how 48 of them sit together*.

---

## 2. Is the hypothesis right?

Half right. “Decisions vs sampling” is the right *feeling*. It is the wrong *implementation story*.

You already tried to implement decisions as a character layer: age, build, bearing, mood, care, then derive traits. That is still sampling. You sample five enums instead of twenty. The joint is tighter. The texture of a distribution remains. A plate of 48 draws from `P(face)` still has the fingerprint of `P`.

His variety is not “he decided who they are.” His variety is **one dialect, many nouns.** The dialect is fixed: egg, one contour, hair = crown, 3–5 marks, one hero. The nouns change: this one has a patch, that one has a beanie, that one is bald. He omits. You accumulate.

So the useful version of the hypothesis is not “add a richer prior.” It is:

**A face is a sentence with a subject and then silence.**  
You are generating paragraphs.

A real implementation of that, in canvas 2D, without ML:

1. Pick **one hero** for the face: hair-mass *or* hat *or* glasses *or* beard *or* expression *or* turn. Not two. Almost never three.
2. **Suppress everything else** to defaults. Default skull = egg. Default nose = one brow-to-tip hook. Default mouth = a line. Default eyes = two dots. Default colour = none.
3. **Draw the hero as if it were the only reason the face exists.** The beanie *is* the head. The nose *is* the person. The patch *is* the joke.
4. **Clamp ensemble variance.** Face size, contour weight, ink budget, yaw range — all in a tight band. His per-face ink sd is ~5. Yours is 8–9. That number is the “generator look.” Drive it down on purpose.

That is a decision. It is implemented as *omission and a lock*, not as more correlated RNGs.

---

## 3. What you are blind to

You have been staring at *faces*. The thing nobody has said clearly enough:

**The unit of the work is the plate, not the face.**

He designed a sheet. Forty-eight heads of similar mass, similar contour, similar ink, on one paper. The pleasure is choral. A slightly boring face is a gift to the sheet — it is rest. You have no rest. You optimised every seed to be a character. Forty-eight characters is a crowd, not a drawing.

Second blindness: **hair is not a trait. Hair is the silhouette.**  
On his plates the outer path of the head *is* hair or skull, one thing. On yours the ink oval is drawn, then a black object is parked on it. Once you see that, you cannot unsee the toupees, the thimble hats, the bubble stacks. Your hairline-plus-crown code is trying to do the right thing and then the style picker blows a hole in it.

Third: **you are measuring the wrong equality.** Matching his coverage, mark count, tooth, mottle, colour share is how you got to “craft is equivalent.” Those are the things a generator can fake while still looking like a generator. The thing that does not show up in the table is *shared restraint*. You cannot average your way to that.

Fourth: **critics are now a noise source you are overfitting.** You said it yourselves — they called his plates machine-made because the grid is regular. Then you kept using them as a loss function. That is why the same complaint (“placed, not observed”) returns in new clothes. You keep adding an axis that answers last round’s sentence. You never remove an axis.

Fifth: **colour is a second drawing.** On sheet-3 his washes are small, offset, often only on a cheek or a hat. On your plates the wash frequently *is* the head, in a different shape. That one habit makes a sheet look synthetic faster than any nose style.

---

## 4. Can this approach get there?

Yes, up to a ceiling. The ceiling is **“same family, same sitting.”** A good plate that a stranger might mix into his for a second. Not “better than Mannay.” Not “indistinguishable under a one-minute stare by someone who likes him.”

Parametric canvas can do:

- one dialect
- one hero per face
- hair = silhouette
- clamped size and ink
- 3D pin so a turn is a turn

Parametric canvas cannot do:

- taste that changes mid-sheet because he got bored
- the specific ugly that only happens when a hand is tired
- liking one face more than another and letting that show

You will not close that last inch with another warp term. If you need that inch, the process has to become: generate 200, you (a person) kill 150, maybe nudge 10 by hand in code. That is still “every mark is code.” It is no longer “every plate is a pure sample.”

If you refuse a human in the loop, accept the ceiling. It is a good ceiling. It is not his.

The current approach — more axes whenever a critic says “template” — is **not** capable of getting there. That path has already failed. You said so. Believe yourselves.

---

## 5. One change

**Lock a house style. Kill variance. Make hair the silhouette. One hero per face.**

Do this as a hard constraint, not a new module.

1. **Skull:** egg only. Aspect ratio in a narrow band. Delete the triangle-chin / spike / giant-potato outcomes. If a seed wants them, reject the seed.
2. **Contour:** one outline. The hair mass’s outer edge *is* that outline above the hairline. Never a black shape sitting on a separate oval. If the hat is the hero, the hat’s brim *is* the crown. No bald ring. No toupee.
3. **Budget:** at most five ink decisions. One of them is almost always a large brow-to-tip nose. Eyes stay dumb (dots, slits, a wink). Mouth stays a mark, not a system.
4. **Hero:** sample one of {buzz mass, bowl, beanie, cap, bald+scribble, glasses, patch, beard, turn}. Force the others to off / default. The curly-bubble style should either become a *mass with a curly edge* or die.
5. **Colour:** default none. On ~1 in 5 faces, one small offset patch, smaller than the head, not a second silhouette.
6. **Plate layout:** face centres on a slightly jittered grid, sizes within ~15%. Stop letting scale be a personality trait.
7. **Stop the critic loop as a trainer.** Use it to find bugs (the crown-arc, the brim-across-the-face). Do not add a parameter because a critic said “template.”

What I expect: the sheet will look quieter and more the same. That is the point. His sheets look the same *on purpose*. Individual faces will get less “interesting” and more like drawings. The generator fingerprint (wild size, competing colour, hair-as-object, three gags at once) will drop. A harsh viewer will still pick his, but they will have to look longer, and they will stop saying “this is 48 rolls of a machine.”

Do not add a body until a 48-head plate can sit next to sheet-1 without the eye going to yours first for the wrong reasons. The full dudes are a second problem, and they currently leak the same disease.

---

## Short

The statistics say you caught him. The plates say you are still sampling. Stop enriching `P(face)`. Write a dialect, pick a subject, omit the rest, and make the sheet the thing you judge.

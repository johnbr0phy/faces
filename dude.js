(() => {
  const canvas = document.getElementById("page");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const tallyEl = document.getElementById("tally");
  const btn = document.getElementById("another");

  const HOUSE_INK = "#232019";
  let INK = HOUSE_INK;
  const PAPER = "#dfdacf";
  const PAPER_RGB = [223, 218, 207];

  // ---------- what he picked up that day ----------
  // Across the reference sheets the same hand is plainly not always holding
  // the same pen. One page is a wet blue-black nib that pools in every corner;
  // the next is a biro — thin, wiry, navy, skipping where the ball runs dry;
  // another is a fineliner laying down one dead-even width with no swell at
  // all; another is soft and broad and grainy, more graphite than ink. Faces
  // drawn with one pen and faces drawn with another are the single loudest
  // difference between two of his sheets, and we were rendering all of them
  // with one nib.
  //
  // So the pen is a property of the drawing, not of the program. Every stroke
  // reads it: colour, base weight, how much the width breathes along a line,
  // how readily it skips, how far it wobbles, whether it pools, whether the
  // flanks split into filaments, and how hard the paper bites back.
  //
  //   press 1 = full dry-nib pressure wave, 0 = one width start to stop
  //   dry   1 = house skip rate; a fineliner barely skips, a biro skips a lot
  //   pool  1 = house corner pooling and blots; 0 = none, ever
  //   split 1 = house filaments; multiplies the width at which flanks appear
  //   bite  1 = house tooth eaten out of the mark
  const PENS = {
    // the house dry nib — still the pen most days
    nib: { ink: "#232019", w: 1.0, press: 1.0, dry: 1.0, wobble: 1.0, pool: 1.0, split: 1.0, bite: 1.0 },
    // a wet blue-black fountain nib: fat, swelling, blotting into every join
    fountain: { ink: "#232f4a", w: 1.24, press: 1.2, dry: 0.6, wobble: 1.05, pool: 1.6, split: 1.15, bite: 0.8 },
    // a biro: thin, wiry, navy, near-constant width, skipping where the ball
    // runs dry, and never pooling — a ballpoint has no wet edge to pool from
    biro: { ink: "#2b3560", w: 0.7, press: 0.34, dry: 1.7, wobble: 1.3, pool: 0.18, split: 0.3, bite: 0.45 },
    // a black biro is the same pen with the other refill in it
    biroBlack: { ink: "#25252b", w: 0.72, press: 0.32, dry: 1.6, wobble: 1.28, pool: 0.18, split: 0.3, bite: 0.45 },
    // a fineliner: one dead-even width, no swell, no blot, no split
    fine: { ink: "#141312", w: 0.82, press: 0.14, dry: 0.3, wobble: 0.72, pool: 0, split: 0, bite: 0.3 },
    // brown ink, a shade drier than the house nib
    sepia: { ink: "#4a3325", w: 0.96, press: 0.9, dry: 1.3, wobble: 1.0, pool: 0.75, split: 0.9, bite: 1.2 },
    // the dark green-black bottle
    forest: { ink: "#2c382f", w: 0.9, press: 0.85, dry: 1.15, wobble: 1.05, pool: 0.6, split: 0.8, bite: 1.05 },
    // soft and broad: more graphite than ink, all tooth and no wet at all
    soft: { ink: "#2e2c28", w: 1.2, press: 0.72, dry: 1.7, wobble: 1.2, pool: 0.12, split: 1.45, bite: 1.5 },
  };

  // Weighted so the house nib is still what he reaches for most of the time.
  // A sheet where every face is a different pen is a swatch card, not a
  // sketchbook.
  const PEN_BAG = [
    "nib", "nib", "nib", "nib", "nib", "nib",
    "biro", "biro", "biro",
    "fine", "fine",
    "soft", "soft",
    "fountain", "fountain",
    "biroBlack",
    "sepia",
    "forest",
  ];

  let PEN = PENS.nib;

  function setPen(kind) {
    PEN = PENS[kind] || PENS.nib;
    INK = PEN.ink;
  }

  function hexRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbHex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  }

  // Hair is not a different substance from the face; it is more of the same
  // pen. The stored hair shade is written against the house ink, so re-express
  // it against whatever pen is in hand — otherwise a navy biro draws a navy
  // head with a black thatch sitting on it, and the thatch reads as pasted on.
  function penShade(hex) {
    if (PEN.ink === HOUSE_INK) return hex;
    const [hr, hg, hb] = hexRgb(hex);
    const [br, bg, bb] = hexRgb(HOUSE_INK);
    const [pr, pg, pb] = hexRgb(PEN.ink);
    const k = (hr + hg + hb + 3) / (br + bg + bb + 3);
    return rgbHex(pr * k, pg * k, pb * k);
  }

  // ---------- motion ----------
  // The dude is already a 2D drawing of a 3D thing: the head is a skull with a
  // yaw, a pitch and a roll, and the body is a stick rig — two three-point arm
  // chains and two three-point leg chains — that the silhouette is grown
  // around. Nothing about either is static. So animating him is not a matter
  // of tweening pictures; it is a matter of moving the rig and drawing him
  // again, which is what a flipbook is.
  //
  // Every offset below is in units of the body's own s, and is ADDED to the
  // joint the person already had. His stance, his asymmetry, the swing his
  // arms hang at — all of that survives, and the motion rides on top of it.
  // A walk that replaced the pose outright would make everyone walk the same.
  const REST = {
    on: false,
    yaw: 0, pitch: 0, roll: 0, // added to the skull's own
    bob: 0, sway: 0, lean: 0, // whole figure
    sh: 0, // shoulders, for a shrug
    ground: 1, // 1 = feet planted, 0 = the floor has let go
    arm: [{ ex: 0, ey: 0, hx: 0, hy: 0 }, { ex: 0, ey: 0, hx: 0, hy: 0 }], // [left, right]
    leg: [{ kx: 0, ky: 0, fx: 0, fy: 0 }, { kx: 0, ky: 0, fx: 0, fy: 0 }],
  };
  let MOTION = REST;

  // The line itself crawls between frames. Hand-drawn animation boils because
  // the second drawing is a second drawing, not the first one moved — and a
  // rig that holds perfectly still between poses is the one thing that gives
  // away that a computer is doing the inbetweens. This shifts the noise field
  // the nib wanders through, so the ink is redrawn rather than replayed, while
  // every structural decision about the dude stays exactly where it was.
  let BOIL = 0;
  // Extra turn the slider asks for, on top of the way he already holds his
  // head. The skull is already a 3D thing, so this is just more yaw —
  // around once, back of the potato, face gone, hair still there.
  let VIEW_YAW = 0;

  const TAU = Math.PI * 2;

  // Ease that sits at rest and snaps — a body accelerating out of a pose.
  function swing(x) {
    return Math.sin(x * TAU);
  }
  // Positive half only: a limb that lifts and comes back down but never
  // travels through the floor.
  function lift(x) {
    return Math.max(0, Math.sin(x * TAU));
  }
  // A sine that lingers at the extremes. A look, a shrug, a hip parked over
  // one foot — none of those pass through the middle at constant speed. They
  // get there and stay a beat. p < 1 square-ifies the wave.
  function holdSin(t, p = 0.45) {
    const s = Math.sin(t * TAU);
    return (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), p);
  }

  const MOTIONS = {
    // Marching towards you. Seen from the front a walk is not a side-on
    // scissor — it is a small knee coming up, the swing foot just clearing
    // the ground, weight parked on the other hip, arms counter-swinging, and
    // the whole body rising twice a cycle on the ball of the stance foot.
    // A high knee is a parade; a scissor is the splits. Keep the step short.
    walk: (t) => {
      const a = lift(t); // left swing
      const b = lift(t + 0.5); // right swing
      const w = swing(t); // + when left is in the air: weight is on the right
      // two rises per cycle, highest at midstance, a hair of dip at contact
      const rise = Math.abs(Math.sin(t * TAU));
      const dip = Math.abs(Math.cos(t * TAU));
      return {
        yaw: w * 0.05,
        roll: -w * 0.035,
        pitch: -rise * 0.02,
        bob: -rise * 0.05 + dip * 0.02,
        sway: w * 0.11,
        lean: w * 0.07,
        arm: [
          { ex: -w * 0.05, ey: 0, hx: -w * 0.16, hy: -b * 0.05 + a * 0.03 },
          { ex: w * 0.05, ey: 0, hx: w * 0.16, hy: -a * 0.05 + b * 0.03 },
        ],
        leg: [
          { kx: -a * 0.03 + b * 0.04, ky: -a * 0.12 + b * 0.04, fx: -a * 0.02 + b * 0.05, fy: -a * 0.2 },
          { kx: b * 0.03 - a * 0.04, ky: -b * 0.12 + a * 0.04, fx: b * 0.02 - a * 0.05, fy: -b * 0.2 },
        ],
      };
    },

    // One arm up, forearm swinging from the elbow, the way a person actually
    // waves — the upper arm parks and the hand travels an arc. Weight sits
    // on the waving side; the other hip goes soft. The head is aimed at
    // someone, and it nods a little with each flick.
    wave: (t) => {
      const raw = Math.sin(t * TAU * 2); // two waves a cycle
      const f = (raw < 0 ? -1 : 1) * Math.pow(Math.abs(raw), 0.6);
      const flick = 1 - Math.abs(f);
      return {
        yaw: 0.16 + f * 0.04,
        roll: -0.08 + f * 0.03,
        pitch: -0.03 - flick * 0.02,
        bob: -flick * 0.02,
        sway: 0.07,
        lean: 0.05,
        arm: [
          { ex: -0.03, ey: 0.03, hx: -0.08, hy: 0.05 },
          { ex: 0.38, ey: -1.0, hx: 0.7 + f * 0.34, hy: -2.68 + Math.abs(f) * 0.22 },
        ],
        leg: [
          { kx: 0.03, ky: 0.03, fx: 0.04, fy: 0 },
          { kx: -0.01, ky: 0, fx: -0.02, fy: 0 },
        ],
      };
    },

    // Anticipate, leave the ground, hang, land. The squash on the way in and
    // out is in the bob and the knees; without it he floats. MOTION.ground
    // has to let go in the air or the feet stay planted and the legs stretch
    // like rubber, which is the thing that made the old jump look wonky.
    jump: (t) => {
      // crouch long enough to read, hang in the middle, land and settle
      let crouch = 0;
      let air = 0;
      let land = 0;
      // drop, hold the coil, then leave — a sine that returns to zero
      // before takeoff is a dead frame between squat and air
      if (t < 0.12) crouch = t / 0.12;
      else if (t < 0.22) crouch = 1;
      else if (t < 0.78) {
        air = Math.sin(((t - 0.22) / 0.56) * Math.PI);
        crouch = Math.max(0, 1 - (t - 0.22) / 0.1);
      } else land = Math.sin(((t - 0.78) / 0.22) * Math.PI);
      const hang = Math.pow(air, 0.55);
      return {
        ground: 1 - hang,
        pitch: crouch * 0.12 + land * 0.08 - hang * 0.1,
        roll: 0,
        yaw: 0,
        bob: crouch * 0.22 + land * 0.18 - hang * 1.05,
        sway: 0,
        arm: [
          { ex: -0.1 * crouch - 0.16 * hang, ey: 0.28 * crouch - 0.55 * hang + 0.12 * land, hx: -0.16 * crouch - 0.28 * hang, hy: 0.4 * crouch - 1.55 * hang + 0.2 * land },
          { ex: 0.1 * crouch + 0.16 * hang, ey: 0.28 * crouch - 0.55 * hang + 0.12 * land, hx: 0.16 * crouch + 0.28 * hang, hy: 0.4 * crouch - 1.55 * hang + 0.2 * land },
        ],
        leg: [
          { kx: -0.04 * crouch + 0.02 * hang, ky: 0.1 * crouch - 0.2 * hang + 0.08 * land, fx: -0.05 * crouch + 0.04 * hang, fy: -0.28 * hang },
          { kx: 0.04 * crouch - 0.02 * hang, ky: 0.1 * crouch - 0.2 * hang + 0.08 * land, fx: 0.05 * crouch - 0.04 * hang, fy: -0.28 * hang },
        ],
      };
    },

    // The skull turning in space is the whole point of there being a skull.
    // A person looking around does not sine-wave their head on a frozen
    // body — they get to a side, hold it, and the shoulders catch up late.
    look: (t) => {
      const turn = holdSin(t, 0.4);
      const follow = holdSin(t - 0.08, 0.55);
      const nod = Math.sin(t * TAU * 2 + 1.1);
      return {
        yaw: turn * 0.56,
        pitch: nod * 0.07 - Math.abs(turn) * 0.03,
        roll: turn * 0.06,
        bob: -Math.abs(turn) * 0.015,
        sway: follow * 0.05,
        lean: follow * 0.09,
        arm: [
          { ex: follow * 0.03, ey: 0, hx: follow * 0.07, hy: Math.abs(turn) * 0.02 },
          { ex: follow * 0.03, ey: 0, hx: follow * 0.07, hy: Math.abs(turn) * 0.02 },
        ],
        leg: [
          { kx: 0, ky: 0, fx: -follow * 0.03, fy: 0 },
          { kx: 0, ky: 0, fx: follow * 0.03, fy: 0 },
        ],
      };
    },

    // Weight parked on one hip, then the other — held, not swung through.
    // The up-arm is the weighted side; the other stays lower. Head arrives
    // a beat after the hips, the way a body actually leads a step.
    dance: (t) => {
      const hip = holdSin(t, 0.38);
      const bounce = Math.abs(Math.sin(t * TAU * 2));
      const leftUp = Math.max(0, -hip);
      const rightUp = Math.max(0, hip);
      const head = holdSin(t - 0.12, 0.4);
      return {
        yaw: head * 0.16,
        roll: -hip * 0.18,
        pitch: -bounce * 0.035,
        bob: -bounce * 0.07,
        sway: hip * 0.2,
        lean: hip * 0.16,
        arm: [
          { ex: -0.16 + hip * 0.06, ey: -0.18 - leftUp * 0.38 - bounce * 0.08, hx: -0.28 + hip * 0.12, hy: -0.75 - leftUp * 0.55 - bounce * 0.12 },
          { ex: 0.16 + hip * 0.06, ey: -0.18 - rightUp * 0.38 - bounce * 0.08, hx: 0.28 + hip * 0.12, hy: -0.75 - rightUp * 0.55 - bounce * 0.12 },
        ],
        leg: [
          { kx: hip * 0.03, ky: rightUp * 0.03 - leftUp * 0.05 * bounce, fx: hip * 0.07, fy: -rightUp * 0.1 * bounce },
          { kx: hip * 0.03, ky: leftUp * 0.03 - rightUp * 0.05 * bounce, fx: hip * 0.07, fy: -leftUp * 0.1 * bounce },
        ],
      };
    },

    // Shoulders up, head down into them, elbows out, hands turned out.
    // Held at the top — a shrug is a pose with a pause in it, not a wobble.
    shrug: (t) => {
      const k = t < 0.18 ? t / 0.18 : t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);
      const e = k * k * (3 - 2 * k);
      return {
        yaw: 0,
        pitch: e * 0.24,
        roll: 0,
        bob: e * 0.06,
        sway: 0,
        sh: -e * 0.4,
        arm: [
          { ex: -e * 0.38, ey: -e * 0.52, hx: -e * 0.5, hy: -e * 0.95 },
          { ex: e * 0.38, ey: -e * 0.52, hx: e * 0.5, hy: -e * 0.95 },
        ],
        leg: [{ kx: 0, ky: 0, fx: 0, fy: 0 }, { kx: 0, ky: 0, fx: 0, fy: 0 }],
      };
    },

    // Almost still. The face is the action — a lift through the chest and a
    // little sway, the way someone stands when they have just heard something
    // good and have not decided what to do with their hands yet.
    smile: (t) => {
      const bounce = Math.abs(Math.sin(t * TAU));
      const sway = holdSin(t, 0.55);
      return {
        yaw: sway * 0.08,
        pitch: -0.06 - bounce * 0.02,
        roll: sway * 0.03,
        bob: -bounce * 0.03,
        sway: sway * 0.04,
        lean: sway * 0.03,
        arm: [
          { ex: -0.02, ey: -0.05, hx: -0.04, hy: -0.08 },
          { ex: 0.02, ey: -0.05, hx: 0.04, hy: -0.08 },
        ],
        leg: [
          { kx: 0.01, ky: 0, fx: 0.02, fy: 0 },
          { kx: -0.01, ky: 0, fx: -0.02, fy: 0 },
        ],
      };
    },

    // Head folded in, shoulders up, a shake through the chest. Not a cartoon
    // fountain — a person trying not to, and failing a little.
    cry: (t) => {
      const sob = Math.abs(Math.sin(t * TAU * 2));
      const shake = Math.sin(t * TAU * 7) * 0.014;
      return {
        yaw: shake,
        pitch: 0.22 + sob * 0.05,
        roll: shake * 1.6,
        bob: sob * 0.035,
        sway: shake * 0.4,
        sh: -0.22 - sob * 0.1,
        arm: [
          { ex: -0.1, ey: -0.22, hx: -0.06, hy: -0.18 },
          { ex: 0.08, ey: 0.05, hx: 0.05, hy: 0.08 },
        ],
        leg: [
          { kx: 0.02, ky: 0.04, fx: 0.03, fy: 0 },
          { kx: -0.02, ky: 0.02, fx: -0.03, fy: 0 },
        ],
      };
    },

    // A yes. The head goes down and comes back; the body barely notices.
    nod: (t) => {
      const n = Math.sin(t * TAU * 2);
      const dip = Math.max(0, n);
      return {
        pitch: dip * 0.28,
        bob: dip * 0.03,
        arm: [
          { ex: 0, ey: 0, hx: 0, hy: dip * 0.03 },
          { ex: 0, ey: 0, hx: 0, hy: dip * 0.03 },
        ],
        leg: [{ kx: 0, ky: 0, fx: 0, fy: 0 }, { kx: 0, ky: 0, fx: 0, fy: 0 }],
      };
    },

    // One arm out, finger first. The rest of him turns to back the point.
    point: (t) => {
      const hold = t < 0.15 ? t / 0.15 : t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2);
      const e = hold * hold * (3 - 2 * hold);
      return {
        yaw: e * 0.22,
        roll: -e * 0.05,
        lean: e * 0.08,
        arm: [
          { ex: -0.04, ey: 0.04, hx: -0.08, hy: 0.06 },
          { ex: e * 0.55, ey: -e * 0.35, hx: e * 1.15, hy: -e * 0.55 },
        ],
        leg: [
          { kx: 0.02, ky: 0, fx: 0.04, fy: 0 },
          { kx: -0.02, ky: 0, fx: -0.03, fy: 0 },
        ],
      };
    },

    // Both hands find each other in front of the chest and meet, twice.
    clap: (t) => {
      const meet = Math.max(0, Math.sin(t * TAU * 2));
      const k = meet * meet;
      return {
        pitch: -k * 0.04,
        bob: -k * 0.02,
        arm: [
          { ex: k * 0.22, ey: -k * 0.35, hx: k * 0.55, hy: -k * 0.72 },
          { ex: -k * 0.22, ey: -k * 0.35, hx: -k * 0.55, hy: -k * 0.72 },
        ],
        leg: [{ kx: 0, ky: 0, fx: 0, fy: 0 }, { kx: 0, ky: 0, fx: 0, fy: 0 }],
      };
    },

    // A hand goes up to the crown and works a spot. The head tips into it.
    scratch: (t) => {
      const up = t < 0.2 ? t / 0.2 : t < 0.85 ? 1 : Math.max(0, 1 - (t - 0.85) / 0.15);
      const itch = Math.sin(t * TAU * 4);
      return {
        yaw: 0.12 + itch * 0.04,
        roll: -0.1,
        pitch: 0.1,
        arm: [
          { ex: -0.04, ey: 0.05, hx: -0.06, hy: 0.06 },
          { ex: 0.18 * up, ey: -1.15 * up, hx: 0.22 * up + itch * 0.08, hy: -1.85 * up },
        ],
        leg: [{ kx: 0.02, ky: 0, fx: 0.02, fy: 0 }, { kx: 0, ky: 0, fx: 0, fy: 0 }],
      };
    },

    // Knees bend, seat drops, he stays there a beat, then stands.
    crouch: (t) => {
      const k = t < 0.2 ? t / 0.2 : t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.28);
      const e = k * k * (3 - 2 * k);
      return {
        pitch: e * 0.14,
        bob: e * 0.38,
        arm: [
          { ex: -e * 0.08, ey: e * 0.12, hx: -e * 0.12, hy: e * 0.18 },
          { ex: e * 0.08, ey: e * 0.12, hx: e * 0.12, hy: e * 0.18 },
        ],
        leg: [
          { kx: -e * 0.06, ky: e * 0.18, fx: -e * 0.04, fy: -e * 0.08 },
          { kx: e * 0.06, ky: e * 0.18, fx: e * 0.04, fy: -e * 0.08 },
        ],
      };
    },

    // One leg flicks out and comes home. The arms go out for the balance.
    kick: (t) => {
      const k = lift(t);
      return {
        yaw: -k * 0.08,
        lean: -k * 0.1,
        arm: [
          { ex: -k * 0.16, ey: -k * 0.12, hx: -k * 0.22, hy: -k * 0.18 },
          { ex: k * 0.12, ey: k * 0.06, hx: k * 0.16, hy: k * 0.08 },
        ],
        leg: [
          { kx: 0.03, ky: 0.04, fx: 0.04, fy: 0 },
          { kx: k * 0.12, ky: -k * 0.18, fx: k * 0.35, fy: -k * 0.42 },
        ],
      };
    },

    // Both arms go up and a little back. A morning thing.
    stretch: (t) => {
      const k = t < 0.22 ? t / 0.22 : t < 0.68 ? 1 : Math.max(0, 1 - (t - 0.68) / 0.32);
      const e = k * k * (3 - 2 * k);
      return {
        pitch: -e * 0.16,
        bob: -e * 0.04,
        sh: -e * 0.12,
        arm: [
          { ex: -e * 0.22, ey: -e * 1.15, hx: -e * 0.18, hy: -e * 2.15 },
          { ex: e * 0.22, ey: -e * 1.15, hx: e * 0.18, hy: -e * 2.15 },
        ],
        leg: [
          { kx: -0.02, ky: 0, fx: -0.03, fy: 0 },
          { kx: 0.02, ky: 0, fx: 0.03, fy: 0 },
        ],
      };
    },

    // From the waist. The head arrives last and stays down a moment.
    bow: (t) => {
      const k = t < 0.25 ? t / 0.25 : t < 0.62 ? 1 : Math.max(0, 1 - (t - 0.62) / 0.38);
      const e = k * k * (3 - 2 * k);
      return {
        pitch: e * 0.42,
        bob: e * 0.12,
        lean: 0,
        arm: [
          { ex: e * 0.06, ey: e * 0.16, hx: e * 0.04, hy: e * 0.22 },
          { ex: -e * 0.06, ey: e * 0.16, hx: -e * 0.04, hy: e * 0.22 },
        ],
        leg: [
          { kx: 0.02, ky: e * 0.04, fx: 0.03, fy: 0 },
          { kx: -0.02, ky: e * 0.04, fx: -0.03, fy: 0 },
        ],
      };
    },

    // Hand to the chin, head a little off. He is pretending to consider.
    think: (t) => {
      const k = t < 0.2 ? t / 0.2 : t < 0.82 ? 1 : Math.max(0, 1 - (t - 0.82) / 0.18);
      const e = k * k * (3 - 2 * k);
      const tap = Math.sin(t * TAU * 3) * e;
      return {
        yaw: e * 0.14,
        pitch: e * 0.08,
        roll: -e * 0.06,
        arm: [
          { ex: -0.03, ey: 0.04, hx: -0.06, hy: 0.05 },
          { ex: e * 0.16, ey: -e * 0.55, hx: e * 0.12 + tap * 0.04, hy: -e * 0.85 },
        ],
        leg: [
          { kx: 0.03, ky: 0.02, fx: 0.04, fy: 0 },
          { kx: 0, ky: 0, fx: 0, fy: 0 },
        ],
      };
    },

    // Both arms up, a greeting, not a stretch — they bounce at the top.
    hail: (t) => {
      const k = t < 0.16 ? t / 0.16 : 1;
      const e = k * k * (3 - 2 * k);
      const w = Math.sin(t * TAU * 2) * e;
      return {
        pitch: -e * 0.05,
        bob: -Math.abs(w) * 0.02,
        arm: [
          { ex: -e * 0.28, ey: -e * 0.95, hx: -e * 0.45 + w * 0.12, hy: -e * 1.85 },
          { ex: e * 0.28, ey: -e * 0.95, hx: e * 0.45 + w * 0.12, hy: -e * 1.85 },
        ],
        leg: [{ kx: 0, ky: 0, fx: 0, fy: 0 }, { kx: 0, ky: 0, fx: 0, fy: 0 }],
      };
    },

    // Weight late, a step that does not quite land where he meant.
    stagger: (t) => {
      const w = holdSin(t, 0.35);
      const hitch = Math.sin(t * TAU * 3);
      return {
        yaw: w * 0.12,
        roll: -w * 0.14,
        pitch: Math.abs(w) * 0.06,
        bob: Math.abs(w) * 0.05,
        sway: w * 0.22,
        lean: w * 0.18,
        arm: [
          { ex: -w * 0.14, ey: -Math.abs(w) * 0.12, hx: -w * 0.22 + hitch * 0.05, hy: -Math.abs(w) * 0.18 },
          { ex: w * 0.14, ey: -Math.abs(w) * 0.12, hx: w * 0.22 + hitch * 0.05, hy: -Math.abs(w) * 0.18 },
        ],
        leg: [
          { kx: w * 0.05, ky: Math.max(0, w) * 0.08, fx: w * 0.1, fy: -Math.max(0, w) * 0.1 },
          { kx: w * 0.05, ky: Math.max(0, -w) * 0.08, fx: w * 0.1, fy: -Math.max(0, -w) * 0.1 },
        ],
      };
    },

    // A small jump on the spot, twice, not the big leave-the-ground one.
    hop: (t) => {
      const h = lift(t * 2);
      const hang = Math.pow(h, 0.6);
      return {
        ground: 1 - hang,
        pitch: -hang * 0.06,
        bob: -hang * 0.42,
        arm: [
          { ex: -hang * 0.08, ey: -hang * 0.22, hx: -hang * 0.1, hy: -hang * 0.45 },
          { ex: hang * 0.08, ey: -hang * 0.22, hx: hang * 0.1, hy: -hang * 0.45 },
        ],
        leg: [
          { kx: -hang * 0.02, ky: -hang * 0.08, fx: 0, fy: -hang * 0.12 },
          { kx: hang * 0.02, ky: -hang * 0.08, fx: 0, fy: -hang * 0.12 },
        ],
      };
    },

    // He leans out from behind something that is not there.
    peek: (t) => {
      const k = holdSin(t, 0.4);
      const e = Math.abs(k);
      return {
        yaw: k * 0.42,
        roll: k * 0.08,
        pitch: -e * 0.04,
        sway: k * 0.14,
        lean: k * 0.22,
        arm: [
          { ex: k * 0.06, ey: 0, hx: k * 0.1, hy: e * 0.04 },
          { ex: k * 0.06, ey: 0, hx: k * 0.1, hy: e * 0.04 },
        ],
        leg: [
          { kx: 0, ky: 0, fx: -k * 0.05, fy: 0 },
          { kx: 0, ky: 0, fx: k * 0.05, fy: 0 },
        ],
      };
    },

    // A walk that has decided not to be seen. Knees more, arms less, head in.
    sneak: (t) => {
      const a = lift(t);
      const b = lift(t + 0.5);
      const w = swing(t);
      return {
        yaw: w * 0.04,
        pitch: 0.12,
        bob: 0.16 - Math.abs(Math.sin(t * TAU)) * 0.04,
        sway: w * 0.06,
        lean: w * 0.04,
        arm: [
          { ex: -w * 0.03, ey: 0.08, hx: -w * 0.06, hy: 0.1 },
          { ex: w * 0.03, ey: 0.08, hx: w * 0.06, hy: 0.1 },
        ],
        leg: [
          { kx: -a * 0.04, ky: -a * 0.18 + b * 0.03, fx: -a * 0.03, fy: -a * 0.16 },
          { kx: b * 0.04, ky: -b * 0.18 + a * 0.03, fx: b * 0.03, fy: -b * 0.16 },
        ],
      };
    },

    // Mouth open is the face's job. The body just reaches and tips back.
    yawn: (t) => {
      const k = t < 0.25 ? t / 0.25 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
      const e = k * k * (3 - 2 * k);
      return {
        pitch: -e * 0.22,
        sh: -e * 0.18,
        bob: -e * 0.03,
        arm: [
          { ex: -e * 0.2, ey: -e * 0.85, hx: -e * 0.16, hy: -e * 1.55 },
          { ex: e * 0.08, ey: e * 0.06, hx: e * 0.05, hy: e * 0.08 },
        ],
        leg: [
          { kx: 0, ky: 0, fx: 0, fy: 0 },
          { kx: 0, ky: 0, fx: 0, fy: 0 },
        ],
      };
    },

    // Arms up, a bounce on the balls of the feet. He has decided this is good.
    cheer: (t) => {
      const b = Math.abs(Math.sin(t * TAU * 2));
      return {
        pitch: -0.08 - b * 0.04,
        bob: -b * 0.1,
        arm: [
          { ex: -0.32, ey: -1.05 - b * 0.08, hx: -0.4, hy: -2.05 - b * 0.12 },
          { ex: 0.32, ey: -1.05 - b * 0.08, hx: 0.4, hy: -2.05 - b * 0.12 },
        ],
        leg: [
          { kx: -0.02, ky: -b * 0.03, fx: 0, fy: -b * 0.06 },
          { kx: 0.02, ky: -b * 0.03, fx: 0, fy: -b * 0.06 },
        ],
      };
    },

    // He cannot stand still. Weight shifts, a hand finds a pocket, the head ticks.
    fidget: (t) => {
      const w = holdSin(t, 0.5);
      const tick = Math.sin(t * TAU * 5);
      return {
        yaw: w * 0.08 + tick * 0.02,
        roll: -w * 0.05,
        bob: Math.abs(w) * 0.02,
        sway: w * 0.07,
        lean: w * 0.05,
        arm: [
          { ex: -0.04 + w * 0.03, ey: 0.06, hx: -0.08, hy: 0.08 + Math.abs(tick) * 0.03 },
          { ex: 0.05, ey: -0.08 + w * 0.04, hx: 0.06, hy: -0.12 },
        ],
        leg: [
          { kx: w * 0.02, ky: 0.02, fx: w * 0.03, fy: 0 },
          { kx: w * 0.02, ky: 0, fx: w * 0.03, fy: 0 },
        ],
      };
    },
  };

  const MOTION_NAMES = Object.keys(MOTIONS);

  // How long one cycle takes, in seconds. A walk is a stroll, a look is a linger.
  const MOTION_PERIOD = {
    walk: 1.18, wave: 1.85, jump: 1.7, look: 5.0, dance: 1.7, shrug: 2.8,
    smile: 2.4, cry: 1.9, nod: 1.5, point: 2.2, clap: 1.15, scratch: 2.0,
    crouch: 2.4, kick: 1.15, stretch: 2.6, bow: 2.3, think: 3.2, hail: 1.8,
    stagger: 2.1, hop: 0.95, peek: 2.8, sneak: 1.5, yawn: 2.7, cheer: 1.4,
    fidget: 2.0,
  };

  function motionAt(kind, t) {
    const f = MOTIONS[kind];
    if (!f) return REST;
    return { ...REST, ...f(((t % 1) + 1) % 1), on: true };
  }

  // ---------- muscles + will ----------
  //
  // algovivo (Rojas, Sifakis, Kavan) does not push vertices with a force
  // function. A muscle is a spring whose rest length the creature is allowed
  // to change: a = 1 is slack, a < 1 is "I want this shorter", and the body
  // is whatever configuration makes the energy
  //
  //   E = k/2 * (l / (a * l0) - 1)^2
  //
  // sit as low as it can. The interesting part is not the FEM — it is that
  // locomotion is a stream of a[] commands, not a clip.
  //
  // We already have a 3D stick and a silhouette grown around it. Replacing
  // that with neo-Hookean triangles would throw away the drawing. So the
  // muscles live ON the stick. Each one pulls a named joint. The will
  // writes a[]. The pose is the damped answer to those commands — one
  // implicit step, the way their integrator takes one. He decides what
  // to do; the muscles are how he does it.
  const MUSCLE_NAMES = [
    "lRaise", "rRaise",
    "lElbow", "rElbow",
    "lReach", "rReach",
    "lKnee", "rKnee",
    "lStep", "rStep",
    "shrug",
    "leanL", "leanR",
    "lookL", "lookR",
    "lookDown", "lookUp",
    "bobUp",
  ];

  function slackA() {
    const a = {};
    MUSCLE_NAMES.forEach((n) => { a[n] = 1; });
    return a;
  }

  // How hard a full contraction pulls, in the same units MOTION already uses.
  function poseFromA(a, gain) {
    const p = (name, amt) => {
      const u = 1 - (a[name] == null ? 1 : a[name]);
      return amt * u * (gain[name] == null ? 1 : gain[name]);
    };
    return {
      on: true,
      yaw: p("lookR", 0.52) - p("lookL", 0.52),
      pitch: p("lookDown", 0.26) - p("lookUp", 0.12),
      roll: (p("leanR", 0.08) - p("leanL", 0.08)),
      bob: p("bobUp", 0.22) - p("lKnee", 0.04) - p("rKnee", 0.04),
      sway: p("leanR", 0.16) - p("leanL", 0.16),
      lean: p("leanR", 0.14) - p("leanL", 0.14),
      sh: -p("shrug", 0.42),
      ground: 1 - p("bobUp", 0.85),
      arm: [
        {
          ex: -p("lReach", 0.12) - p("lRaise", 0.16),
          ey: -p("lRaise", 0.95) - p("lElbow", 0.22),
          hx: -p("lReach", 0.28) - p("lRaise", 0.32),
          hy: -p("lRaise", 1.7) - p("lElbow", 0.55),
        },
        {
          ex: p("rReach", 0.12) + p("rRaise", 0.16),
          ey: -p("rRaise", 0.95) - p("rElbow", 0.22),
          hx: p("rReach", 0.28) + p("rRaise", 0.32),
          hy: -p("rRaise", 1.7) - p("rElbow", 0.55),
        },
      ],
      leg: [
        {
          kx: -p("lStep", 0.04) + p("rStep", 0.03),
          ky: -p("lKnee", 0.14) + p("rKnee", 0.03),
          fx: -p("lStep", 0.03) + p("rStep", 0.04),
          fy: -p("lKnee", 0.22),
        },
        {
          kx: p("rStep", 0.04) - p("lStep", 0.03),
          ky: -p("rKnee", 0.14) + p("lKnee", 0.03),
          fx: p("rStep", 0.03) - p("lStep", 0.04),
          fy: -p("rKnee", 0.22),
        },
      ],
    };
  }

  // Intentions are recipes of a(t). 1 is slack. Smaller is a pull.
  function recipeA(intent, t, n) {
    const a = slackA();
    const g = Math.sin((t + n.phase) * TAU * n.tempo);
    const L = Math.max(0, Math.sin((t + n.phase) * TAU * n.tempo));
    const R = Math.max(0, Math.sin((t + n.phase + 0.5) * TAU * n.tempo));
    const hold = holdSin(t * n.tempo * 0.35 + n.phase, 0.45);
    if (intent === "walk") {
      a.lKnee = 1 - L * 0.62;
      a.rKnee = 1 - R * 0.62;
      a.lStep = 1 - L * 0.35;
      a.rStep = 1 - R * 0.35;
      a.lRaise = 1 - R * 0.28;
      a.rRaise = 1 - L * 0.28;
      a.leanL = 1 - R * 0.22;
      a.leanR = 1 - L * 0.22;
      a.bobUp = 1 - Math.abs(Math.sin((t + n.phase) * TAU * n.tempo * 2)) * 0.18;
    } else if (intent === "wave") {
      const f = Math.sin((t + n.phase) * TAU * n.tempo * 1.6);
      a.rRaise = 0.22;
      a.rElbow = 0.45 + f * 0.2;
      a.rReach = 0.4 - Math.abs(f) * 0.15;
      a.leanR = 0.78;
      a.lookR = 0.72;
    } else if (intent === "jump") {
      const u = ((t * n.tempo * 0.55) % 1 + 1) % 1;
      let crouch = 0;
      let air = 0;
      if (u < 0.18) crouch = u / 0.18;
      else if (u < 0.28) crouch = 1;
      else air = Math.sin(((u - 0.28) / 0.55) * Math.PI);
      const hang = Math.max(0, Math.pow(air, 0.55));
      a.lKnee = a.rKnee = 1 - crouch * 0.55 - hang * 0.2;
      a.lRaise = a.rRaise = 1 - crouch * 0.2 - hang * 0.7;
      a.bobUp = 1 - hang * 0.95;
      a.lookDown = 1 - crouch * 0.4;
    } else if (intent === "look") {
      a.lookL = 1 - Math.max(0, -hold) * 0.85;
      a.lookR = 1 - Math.max(0, hold) * 0.85;
      a.leanL = 1 - Math.max(0, -hold) * 0.2;
      a.leanR = 1 - Math.max(0, hold) * 0.2;
    } else if (intent === "dance") {
      a.leanL = 1 - Math.max(0, -hold) * 0.7;
      a.leanR = 1 - Math.max(0, hold) * 0.7;
      a.lRaise = 1 - Math.max(0, -hold) * 0.55 - Math.abs(g) * 0.1;
      a.rRaise = 1 - Math.max(0, hold) * 0.55 - Math.abs(g) * 0.1;
      a.bobUp = 1 - Math.abs(Math.sin((t + n.phase) * TAU * n.tempo * 2)) * 0.22;
    } else if (intent === "shrug") {
      a.shrug = 0.25;
      a.lRaise = a.rRaise = 0.55;
      a.lookDown = 0.55;
    } else if (intent === "smile") {
      a.lookUp = 0.72;
      a.bobUp = 1 - Math.abs(g) * 0.08;
      a.leanL = 1 - Math.max(0, -hold) * 0.12;
      a.leanR = 1 - Math.max(0, hold) * 0.12;
    } else if (intent === "cry") {
      a.lookDown = 0.35;
      a.shrug = 0.45;
      a.lElbow = 0.55;
      a.lRaise = 0.7;
    }
    return a;
  }

  function makeNerves(rng, person) {
    const bag = [];
    const add = (k, n) => {
      for (let i = 0; i < n; i++) bag.push(k);
    };
    add("walk", 3);
    add("look", 3);
    add("rest", 2);
    if (person.mood === "dour") {
      add("shrug", 2);
      add("cry", 2);
      add("look", 2);
    } else if (person.mood === "pleased") {
      add("smile", 3);
      add("wave", 2);
      add("walk", 1);
    } else if (person.mood === "amused") {
      add("dance", 3);
      add("wave", 2);
      add("jump", 1);
      add("smile", 2);
    } else if (person.mood === "wary") {
      add("look", 3);
      add("shrug", 2);
      add("rest", 2);
    } else {
      add("wave", 1);
      add("smile", 1);
    }
    if (person.bearing === "cocky") {
      add("dance", 2);
      add("wave", 2);
      add("jump", 1);
    } else if (person.bearing === "slumped") {
      add("rest", 2);
      add("shrug", 2);
    }
    if (person.age === "old") {
      add("look", 2);
      add("walk", 1);
    } else if (person.age === "young") {
      add("jump", 2);
      add("dance", 2);
      add("wave", 1);
    }
    const gain = {};
    MUSCLE_NAMES.forEach((n) => {
      gain[n] = rng.f(0.62, 1.28);
    });
    // one side a bit weaker — nobody is even
    if (rng.chance(0.7)) {
      const side = rng.chance(0.5) ? "l" : "r";
      ["Raise", "Elbow", "Knee"].forEach((part) => {
        gain[side + part] *= rng.f(0.55, 0.85);
      });
    }
    return {
      seed: rng.seed,
      bag,
      tempo: rng.f(0.82, 1.22),
      hold: rng.f(1.35, 3.4),
      blend: rng.f(0.16, 0.38),
      gain,
      phase: rng.f(0, 1),
    };
  }

  function makeWill(nerves) {
    let clock = 0;
    let intent = "rest";
    let holdFor = nerves.hold;
    let since = 0;
    let pickN = 0;
    const a = slackA();

    const pick = (avoid) => {
      pickN += 1;
      const r = new Rng(hash32(nerves.seed, "will", pickN));
      let choice = r.pick(nerves.bag);
      if (avoid && nerves.bag.length > 1) {
        let guard = 0;
        while (choice === avoid && guard < 8) {
          choice = r.pick(nerves.bag);
          guard += 1;
        }
      }
      return choice;
    };

    intent = pick();
    if (intent === "rest") holdFor = nerves.hold * 0.7;

    return {
      intent() {
        return intent;
      },
      nudge() {
        intent = pick(intent);
        since = 0;
        holdFor = intent === "jump" ? 1.7 / nerves.tempo : nerves.hold * (intent === "rest" ? 0.7 : 1);
      },
      step(dt) {
        clock += dt;
        since += dt;
        if (since >= holdFor) {
          since = 0;
          intent = pick(intent);
          holdFor = intent === "jump" ? 1.7 / Math.max(0.5, nerves.tempo) : nerves.hold * (0.75 + (pickN % 5) * 0.08);
          if (intent === "rest") holdFor *= 0.8;
        }
        const target = intent === "rest" ? slackA() : recipeA(intent, clock, nerves);
        const k = 1 - Math.exp(-dt / Math.max(0.06, nerves.blend));
        MUSCLE_NAMES.forEach((n) => {
          a[n] += ((target[n] == null ? 1 : target[n]) - a[n]) * k;
        });
      },
      pose() {
        return poseFromA(a, nerves.gain);
      },
    };
  }

  let WILL = null;

  // ---------- seeded rng ----------
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Rng {
    constructor(seed) {
      this.seed = seed >>> 0;
      this._n = mulberry32(this.seed);
    }
    f(a = 0, b = 1) {
      return a + (b - a) * this._n();
    }
    i(a, b) {
      return Math.floor(this.f(a, b + 1));
    }
    chance(p) {
      return this._n() < p;
    }
    pick(arr) {
      return arr[this.i(0, arr.length - 1)];
    }
    sign() {
      return this.chance(0.5) ? 1 : -1;
    }
  }

  // Named substreams, hashed from the root seed.
  //
  // Everything used to draw from one mutable stream in draw order, so paper()
  // consuming a few thousand values before the figure meant that changing the
  // fibre count changed the anatomy, the pose and the face. Nothing could be
  // A/B tested in isolation. Each stage now gets its own stream, and
  // correlations are passed explicitly rather than arising from adjacency.
  function hash32(seed, label, idx) {
    let h = (seed ^ 0x9e3779b9) >>> 0;
    for (let i = 0; i < label.length; i++) {
      h = Math.imul(h ^ label.charCodeAt(i), 2654435761);
      h ^= h >>> 15;
    }
    h = Math.imul(h ^ ((idx | 0) + 0x85ebca6b), 2246822519);
    return (h ^ (h >>> 13)) >>> 0;
  }

  function rngFor(seed, label, idx) {
    return new Rng(hash32(seed, label, idx || 0));
  }

  // A stream keyed off the seed, not off how far the pen has got. Identity
  // picks (a lid, a nostril, a parting, how wide the mouth is) have to come
  // from here. The drawing stream is spent on the stroke, and a turn that
  // shortens a line spends fewer rolls, which used to re-roll the face.
  function lockRng(rng, label) {
    return new Rng(hash32(rng.seed, label, 0));
  }

  function parseSeed() {
    const q = new URLSearchParams(location.search).get("s");
    if (q && /^\d+$/.test(q)) return Number(q) >>> 0;
    return (Math.random() * 0xffffffff) >>> 0;
  }

  // ---------- dry nib ----------
  // A stroke is a variable-width ribbon FILLED as one path at full opacity.
  // Width is pressure noise; the nib lifts where the paper tooth is high;
  // ink pools at starts, stops and hard direction changes. No alpha seams.
  function hash2(ix, iy, seed) {
    let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function valueNoise(x, y, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0, y0, seed);
    const b = hash2(x0 + 1, y0, seed);
    const c = hash2(x0, y0 + 1, seed);
    const d = hash2(x0 + 1, y0 + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  function fbm2(x, y, seed) {
    return valueNoise(x, y, seed) * 0.66 + valueNoise(x * 2.13, y * 2.13, seed + 17) * 0.34;
  }

  function polyLen(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return L;
  }

  function resample(pts, step) {
    const out = [{ x: pts[0].x, y: pts[0].y }];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 1e-6) continue;
      let t = step - carry;
      while (t <= d) {
        out.push({ x: a.x + (b.x - a.x) * (t / d), y: a.y + (b.y - a.y) * (t / d) });
        t += step;
      }
      carry = d - (t - step);
    }
    const last = pts[pts.length - 1];
    const tail = out[out.length - 1];
    if (Math.hypot(last.x - tail.x, last.y - tail.y) > step * 0.35) out.push({ x: last.x, y: last.y });
    return out;
  }

  function normals(P) {
    const n = P.length;
    const N = [];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)];
      const b = P[Math.min(n - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      N.push({ x: -dy / d, y: dx / d });
    }
    return N;
  }

  const NIB_STEP = 1.1;

  // One dry-nib stroke through a polyline.
  function nib(c, rng, path, opt = {}) {
    if (!path || path.length < 2) return;
    const w = (opt.w ?? 1.8) * PEN.w;
    let pts = path.slice();
    if (opt.closed) pts = pts.concat([pts[0], pts[1], pts[2] || pts[0]]); // overshoot past the join
    const L = polyLen(pts);
    if (L < 0.7) return;
    const sd = (opt.seed ?? rng.i(1, 99999999)) >>> 0;
    const S = resample(pts, NIB_STEP);
    const n = S.length;
    if (n < 2) return;

    // hand wobble, applied along the path normal so corners survive
    const amp = (opt.wobble ?? Math.min(2.0, 0.26 + L * 0.011)) * PEN.wobble;
    const N0 = normals(S);
    const P = new Array(n);
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * L;
      const wob =
        (fbm2(u * 0.019, sd * 0.013 + BOIL, sd) - 0.5) * 2 * amp +
        (fbm2(u * 0.105, sd * 0.007 + BOIL * 1.7, sd + 31) - 0.5) * 2 * amp * 0.3;
      P[i] = { x: S[i].x + N0[i].x * wob, y: S[i].y + N0[i].y * wob };
    }
    const NN = normals(P);

    const dryK = opt.dry ?? 1;
    const W = new Array(n);
    const live = new Array(n);
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * L;
      // A real nib runs thin through a straight, presses hard through a turn
      // and lifts off at the exit. One width from start to stop is the single
      // loudest tell that a contour was plotted rather than drawn.
      // Scale the pressure wave to the STROKE, not to the page. Noise with a
      // wavelength longer than the line gives every line one constant width,
      // which is the thing every critic spots first.
      const t01 = i / (n - 1);
      const cyc = 1.3 + ((sd >>> 3) % 9) * 0.42;
      const slow = fbm2(t01 * cyc * 2 + 7, sd * 0.011 + BOIL * 0.6, sd + 5) - 0.5;
      const slow2 = fbm2(t01 * cyc * 5.5 + 3, sd * 0.017 + BOIL * 0.9, sd + 211) - 0.5;
      const fast = fbm2(u * 0.185, sd * 0.005, sd + 61) - 0.5;
      // How much the width breathes is the pen's, not the line's. A fineliner
      // holds one width from start to stop; a wet nib swells through every
      // turn. pk = 0 collapses the whole wave to a constant.
      const pk = PEN.press;
      let press = 1 + (slow * 1.7 + slow2 * 0.62 + fast * 0.26) * pk;
      if (i < 3) press *= 1 + (0.3 - i * 0.09) * pk; // the nib sits down where it lands
      const tail = n - 1 - i;
      if (tail < 6) press *= 1 - (0.48 - (tail / 6) * 0.48) * pk; // and lifts on the way out
      // Measure the turn over a real span. At 1px resampling, a hair of
      // wobble looks like a hairpin, and the corner-pooling fires on every
      // straight in the drawing.
      const span = 5;
      const a = P[Math.max(0, i - span)];
      const b = P[Math.min(n - 1, i + span)];
      const m = P[i];
      let ang = Math.atan2(b.y - m.y, b.x - m.x) - Math.atan2(m.y - a.y, m.x - a.x);
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      const turn = Math.abs(ang);
      // ink pools in a corner, but only a real corner: past about 1.2 rad the
      // pen is travelling round an end, not stopping into a join, and a blob
      // there reads as an armature pivot bolted to the drawing
      if (turn > 0.35 && turn < 1.25) press *= 1 + Math.min(0.55, (turn - 0.35) * 0.95) * PEN.pool;
      if (opt.taper !== undefined) press *= 1 + (opt.taper - 1) * Math.pow(t01, opt.taperPow ?? 1.4);
      W[i] = Math.max(0.26, w * Math.min(2.6, Math.max(0.08, press)));
      // the nib lifts rarely and briefly; a dashed line is a broken pen,
      // not a dry one. Thin strokes skip more than fat ones.
      const dry = fbm2(u * 0.19 + 11, sd * 0.02, sd + 137);
      const thr = 0.125 * dryK * PEN.dry * (w < 1.3 ? 1.4 : w > 2.6 ? 0.5 : 1);
      live[i] = !(dryK > 0 && dry < thr && i > 1 && i < n - 2);
    }

    c.save();
    c.fillStyle = opt.color ?? INK;
    c.globalAlpha = opt.alpha ?? 1;

    // Lay the stroke down as a solid core plus loose filaments along each
    // edge. A real nib splits: the middle is wet and the flanks are hairs
    // that catch and drop out on their own. One clean ribbon reads as vector.
    const band = (off, wk, dseed, dthr) => {
      let i = 0;
      while (i < n) {
        const okAt = (k) =>
          live[k] && (dthr <= 0 || fbm2((k * NIB_STEP) * 0.26 + 3, dseed * 0.02, dseed) > dthr);
        if (!okAt(i)) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < n && okAt(j + 1)) j++;
        if (j > i) {
          c.beginPath();
          for (let k = i; k <= j; k++) {
            const o = off * W[k];
            const hw = Math.max(0.16, wk * W[k]) * 0.5;
            const x = P[k].x + NN[k].x * (o + hw);
            const y = P[k].y + NN[k].y * (o + hw);
            if (k === i) c.moveTo(x, y);
            else c.lineTo(x, y);
          }
          for (let k = j; k >= i; k--) {
            const o = off * W[k];
            const hw = Math.max(0.16, wk * W[k]) * 0.5;
            c.lineTo(P[k].x + NN[k].x * (o - hw), P[k].y + NN[k].y * (o - hw));
          }
          c.closePath();
          c.fill();
        } else if (dthr <= 0) {
          c.beginPath();
          c.arc(P[i].x + NN[i].x * off * W[i], P[i].y + NN[i].y * off * W[i], Math.max(0.2, wk * W[i] * 0.4), 0, Math.PI * 2);
          c.fill();
        }
        i = j + 1;
      }
    };

    band(0, 0.82, sd, 0);
    // A ballpoint does not split and a fineliner has nothing to split with.
    // A soft broad pen splits almost from the first hair of width.
    if (w * PEN.split > 1.7) {
      band(-0.32, 0.3 * PEN.split, sd + 401, 0.45);
      band(0.32, 0.3 * PEN.split, sd + 733, 0.47);
    }
    // the odd blot where the nib sat down too long
    if (w > 1.4 && rng.chance(0.1 * PEN.pool)) {
      const k = Math.min(n - 1, Math.max(0, rng.i(2, Math.max(3, n - 3))));
      const q = P[k];
      c.beginPath();
      c.ellipse(q.x + rng.f(-1, 1), q.y + rng.f(-1, 1), W[k] * rng.f(0.8, 1.5), W[k] * rng.f(0.7, 1.2), rng.f(0, 3), 0, Math.PI * 2);
      c.fill();
    }
    // The sheet bites back into the mark itself, not only in a pass over the
    // whole page afterwards. Localising it per stroke is the difference
    // between ink on paper and a filled vector shape.
    if (w > 1.1 && PEN.bite > 0) {
      for (let k = 1; k < n - 1; k += 2) {
        if (!live[k] || !rng.chance(Math.min(0.75, 0.3 * PEN.bite))) continue;
        const hw = W[k] * 0.5;
        const u = (rng.chance(0.5) ? 1 : -1) * rng.f(0.72, 1.12);
        const sz = W[k] * rng.f(0.18, 0.42) * Math.min(1.6, PEN.bite);
        c.fillStyle = PAPER;
        c.globalAlpha = rng.f(0.35, 0.8);
        c.fillRect(P[k].x + NN[k].x * hw * u - sz / 2, P[k].y + NN[k].y * hw * u - sz / 2, sz, sz);
      }
      c.fillStyle = opt.color ?? INK;
      c.globalAlpha = opt.alpha ?? 1;
    }
    // pools where the nib lingered
    for (let k = 3; k < n - 3; k += 2) {
      if (!live[k] || W[k] < w * 1.3) continue;
      if (!rng.chance(0.14 * PEN.pool)) continue;
      c.beginPath();
      c.ellipse(P[k].x, P[k].y, W[k] * 0.58, W[k] * 0.46, k * 0.3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // A stroke plus optional restatement — the line the hand went back over.
  function stroke(c, rng, path, opt = {}) {
    const passes = opt.passes ?? 1;
    // A long contour is not one pull. It arrives in two or three goes that
    // overlap at the joins, each at its own weight — which is why his
    // outlines fray rather than close.
    if (opt.broken !== false && !opt.closed && path.length >= 10 && rng.chance(0.42)) {
      const segs = rng.i(2, 3);
      const n = path.length;
      for (let i = 0; i < segs; i++) {
        const a = Math.max(0, Math.floor((n * i) / segs - n * 0.05));
        const b = Math.min(n, Math.floor((n * (i + 1)) / segs + n * 0.09));
        const part = path.slice(a, b);
        if (part.length < 2) continue;
        nib(c, rng, part, {
          ...opt,
          w: (opt.w ?? 1.8) * rng.f(0.72, 1.22),
          dry: (opt.dry ?? 1) * rng.f(0.8, 1.25),
        });
      }
      return;
    }
    nib(c, rng, path, opt);
    // A contour the hand traced twice all the way round. Every head in the
    // reference plates is two lines that touch and part, not one.
    if (opt.doubled && rng.chance(0.4)) {
      const dn = normals(path);
      const off = rng.f(1.0, 2.1) * (rng.chance(0.5) ? 1 : -1);
      const moved = path.map((q, i) => {
        const t = i / (path.length - 1 || 1);
        const g = off * (0.45 + 0.55 * fbm2(t * 5.5, rng.seed * 0.01, rng.seed + 9) * 2);
        return { x: q.x + dn[i].x * g, y: q.y + dn[i].y * g };
      });
      nib(c, rng, moved, {
        closed: opt.closed,
        w: (opt.w ?? 1.8) * rng.f(0.6, 0.82),
        dry: (opt.dry ?? 1) * 1.9,
        color: opt.color,
      });
    }
    // the pen runs past the corner instead of stopping on it
    if (opt.overshoot !== false && !opt.closed && path.length >= 2 && rng.chance(0.42)) {
      const a = path[path.length - 2];
      const b = path[path.length - 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const g = (opt.w ?? 1.8) * rng.f(1.2, 4.5);
      // A flick of the wrist curves. Running the overshoot straight along the
      // tangent is what made ours read as a plotted extension.
      const vx = (b.x - a.x) / d;
      const vy = (b.y - a.y) / d;
      const f = g * rng.f(-0.55, 0.55);
      nib(c, rng, [b, { x: b.x + vx * g - vy * f, y: b.y + vy * g + vx * f }], {
        w: (opt.w ?? 1.8) * rng.f(0.4, 0.75),
        color: opt.color,
        dry: 1.4,
        wobble: 0.4,
      });
    }
    if (passes < 2 || path.length < 2) return;
    const w = opt.w ?? 1.8;
    for (let p = 1; p < passes; p++) {
      const n = path.length;
      const a = Math.floor(rng.f(0, Math.max(1, n * 0.5)));
      const b = Math.min(n, a + Math.max(2, Math.round(n * rng.f(0.35, 0.75))));
      const sub = path.slice(a, b);
      if (sub.length < 2) continue;
      const off = rng.f(0.55, 1.6) * rng.sign();
      const sn = normals(sub);
      const moved = sub.map((q, i) => ({ x: q.x + sn[i].x * off, y: q.y + sn[i].y * off }));
      nib(c, rng, moved, {
        w: w * rng.f(0.5, 0.78),
        taper: opt.taper,
        color: opt.color,
        alpha: opt.alpha,
        dry: (opt.dry ?? 1) * 1.6,
        wobble: (opt.wobble ?? undefined) === undefined ? undefined : opt.wobble * 0.6,
      });
    }
  }

  function inkLine(c, rng, x1, y1, x2, y2, w = 1.7, passes = 1) {
    stroke(c, rng, [{ x: x1, y: y1 }, { x: x2, y: y2 }], { w, passes });
  }

  function inkPoly(c, rng, pts, opt = {}) {
    if (!pts || pts.length < 2) return;
    stroke(c, rng, pts, {
      closed: !!opt.closed,
      doubled: !!opt.doubled,
      taper: opt.taper,
      overshoot: opt.overshoot,
      broken: opt.broken,
      w: opt.w ?? 1.8,
      passes: opt.passes ?? 1,
      dry: opt.dry,
      wobble: opt.wobble,
      color: opt.color,
      alpha: opt.alpha,
    });
  }

  // A black mass built the way a pen builds one: a loaded core, then strokes
  // dragged outward across the boundary so their ends form the edge. Filling
  // a closed outline flat leaves a vector edge, which no amount of speckle
  // noise on top will disguise.
  function inkMassFill(c, rng, pts, color, opt = {}) {
    if (!pts || pts.length < 3) return;
    const n = pts.length;
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= n;
    cy /= n;
    const bite = opt.bite ?? 4.5; // how far the edge strokes reach past the boundary
    const inset = pts.map((p) => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.max(0, d - bite * 0.85) / d;
      return { x: cx + dx * k, y: cy + dy * k };
    });
    c.save();
    c.fillStyle = color;
    c.globalAlpha = opt.alpha ?? 1;
    c.beginPath();
    inset.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fill();
    c.restore();

    // A mass a pen laid down has strokes in it. Filling a polygon and
    // roughening the boundary leaves a smooth slab with a ragged edge, which
    // is not the same thing at all.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const q of pts) {
      if (q.x < x0) x0 = q.x;
      if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y;
      if (q.y > y1) y1 = q.y;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (area > 900) {
      c.save();
      c.beginPath();
      inset.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.closePath();
      c.clip();
      const ang = rng.f(0, Math.PI);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const span = Math.hypot(x1 - x0, y1 - y0);
      const lines = Math.max(4, Math.round(span / (bite * rng.f(1.1, 2.2))));
      for (let i = 0; i < lines; i++) {
        const t = (i / (lines - 1 || 1) - 0.5) * span;
        const mx = (x0 + x1) / 2 - dy * t;
        const my = (y0 + y1) / 2 + dx * t;
        const half = span * rng.f(0.3, 0.6);
        nib(c, rng, [
          { x: mx - dx * half, y: my - dy * half },
          { x: mx + dx * half * rng.f(0.6, 1.0), y: my + dy * half * rng.f(0.6, 1.0) },
        ], { w: bite * rng.f(0.5, 1.1), color, dry: 0.7, wobble: bite * 0.5, alpha: opt.alpha ?? 1 });
      }
      c.restore();
    }

    loadMass(c, rng, inset, bite, opt.load ?? rng.f(0.72, 0.9));

    const step = Math.max(1.6, bite * 0.55);
    const walk = resample(pts.concat([pts[0]]), step);
    for (let i = 0; i < walk.length; i++) {
      const q = walk[i];
      const dx = q.x - cx;
      const dy = q.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const reach = bite * (0.35 + fbm2(i * 0.32, rng.seed * 0.01, rng.seed + 77) * 1.5);
      const back = bite * rng.f(1.4, 2.6);
      const a = { x: cx + (dx / d) * (d - back), y: cy + (dy / d) * (d - back) };
      const b = { x: cx + (dx / d) * (d + reach - bite * 0.85), y: cy + (dy / d) * (d + reach - bite * 0.85) };
      nib(c, rng, [a, b], { w: bite * rng.f(0.34, 0.68), color, dry: 0.9, wobble: 0.5, alpha: opt.alpha ?? 1 });
    }
  }

  // Anywhere we paint paper over the drawing to occlude it, the fibre has to
  // go back on top, or the figure reads as a cut-out pasted on the sheet.
  function refibre(c, rng, poly) {
    if (!poly || poly.length < 3) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of poly) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (!isFinite(area) || area <= 0) return;
    c.save();
    c.beginPath();
    poly.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.clip();
    // match the density of the paper pass exactly, or the patch reads darker
    const n = Math.min(1500, Math.round(area / 405));
    for (let i = 0; i < n; i++) {
      const a = rng.f(0, Math.PI * 2);
      const len = rng.f(3, 20);
      c.strokeStyle = rng.chance(0.55) ? "rgba(74,60,40,0.075)" : "rgba(255,253,246,0.11)";
      c.lineWidth = rng.f(0.4, 1.0);
      const x = rng.f(x0, x1);
      const y = rng.f(y0, y1);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      c.stroke();
    }
    for (let i = 0; i < Math.round(area / 145); i++) {
      c.fillStyle = rng.chance(0.6) ? "rgba(48,36,22,0.06)" : "rgba(255,255,255,0.07)";
      c.fillRect(rng.f(x0, x1), rng.f(y0, y1), rng.f(0.3, 1.2), rng.f(0.25, 0.8));
    }
    c.restore();
  }

  // Paper showing through a laid-down mass. Held next to the reference, the
  // same black cap is a dense stipple at roughly 70-85% loading, not a flat
  // fill — and a flat fill is what made our darkest faces twice as inky.
  function loadMass(c, rng, pts, bite, load) {
    if (!pts || pts.length < 3) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const q of pts) {
      if (q.x < x0) x0 = q.x;
      if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y;
      if (q.y > y1) y1 = q.y;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (!isFinite(area) || area < 400) return;
    c.save();
    c.beginPath();
    pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.closePath();
    c.clip();
    const holes = Math.round((area * (1 - load)) / Math.max(1.2, bite * 0.5));
    for (let i = 0; i < holes; i++) {
      c.fillStyle = PAPER;
      c.globalAlpha = rng.f(0.45, 0.92);
      c.beginPath();
      c.ellipse(rng.f(x0, x1), rng.f(y0, y1), bite * rng.f(0.12, 0.4), bite * rng.f(0.1, 0.32), rng.f(0, 3), 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // Solid mass with a ragged, hand-cut edge.
  function inkFill(c, rng, pts, color, alpha = 1, rag = 1.9) {
    if (pts.length < 3) return;
    const n = pts.length;
    c.save();
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[(i - 1 + n) % n];
      const b = pts[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const j = (fbm2(p.x * 0.14, p.y * 0.14, rng.seed) - 0.5) * 2 * rag;
      const x = p.x + (-dy / d) * j;
      const y = p.y + (dx / d) * j;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fillStyle = color;
    c.globalAlpha = alpha;
    c.fill();
    c.restore();
  }

  function inkCirc(c, rng, x, y, r, w = 1.5, fill = false) {
    const n = 16 + rng.i(0, 6);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 + (fbm2(Math.cos(a) * 2.2 + x * 0.02, Math.sin(a) * 2.2 + y * 0.02, rng.seed) - 0.5) * 0.18);
      pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
    }
    inkFill(c, rng, pts, PAPER, 1, Math.max(0.35, r * 0.08));
    if (fill) inkFill(c, rng, pts, INK, 1, Math.max(0.5, r * 0.09));
    inkPoly(c, rng, pts, { closed: true, w, dry: r < 6 ? 0.35 : 1 });
  }

  function inkArc(c, rng, x, y, r, a0, a1, w = 1.55) {
    const n = Math.max(6, Math.round((r * Math.abs(a1 - a0)) / 3.4));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    inkPoly(c, rng, pts, { w });
  }



  // ---------- paper + grain pass over ink ----------
  function paper(c, w, h, rng) {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
    c.fillStyle = PAPER;
    c.fillRect(0, 0, w, h);
    // Cartridge paper is not a flat tone. Big soft blooms, then fibre lying
    // in the sheet, then tooth. A flat field with speckle on it is the
    // easiest thing in the whole drawing to spot as printed.
    for (let i = 0; i < 16; i++) {
      c.fillStyle = rng.chance(0.5) ? "rgba(92,78,52,0.006)" : "rgba(255,252,244,0.01)";
      c.beginPath();
      c.ellipse(rng.f(-40, w + 40), rng.f(-40, h + 40), rng.f(40, 190), rng.f(28, 130), rng.f(0, 6), 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 1500; i++) {
      const a = rng.f(0, Math.PI * 2);
      const len = rng.f(3, 22);
      const dark = rng.chance(0.55);
      c.strokeStyle = dark ? "rgba(74,60,40,0.075)" : "rgba(255,253,246,0.11)";
      c.lineWidth = rng.f(0.4, 1.0);
      const x = rng.f(0, w);
      const y = rng.f(0, h);
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(
        x + Math.cos(a) * len * 0.5 + rng.f(-2, 2),
        y + Math.sin(a) * len * 0.5 + rng.f(-2, 2),
        x + Math.cos(a) * len,
        y + Math.sin(a) * len
      );
      c.stroke();
    }
    for (let i = 0; i < 4200; i++) {
      c.fillStyle = rng.chance(0.6) ? "rgba(48,36,22,0.06)" : "rgba(255,255,255,0.07)";
      c.fillRect(rng.f(0, w), rng.f(0, h), rng.f(0.3, 1.2), rng.f(0.25, 0.8));
    }
    for (let i = 0; i < 40; i++) {
      // the odd fleck of pulp
      c.fillStyle = "rgba(58,44,28,0.1)";
      c.beginPath();
      c.ellipse(rng.f(0, w), rng.f(0, h), rng.f(0.5, 1.7), rng.f(0.4, 1.1), rng.f(0, 6), 0, Math.PI * 2);
      c.fill();
    }
  }

  function grainPass(c, dpr) {
    // The noise was indexed in physical pixels while everything else is drawn
    // in CSS coordinates, so the same seed produced a different sheet on a
    // retina screen. Divide back out so the grain has a fixed size on the page.
    const k = dpr || 1;
    const iw = c.canvas.width;
    const ih = c.canvas.height;
    let img;
    try {
      img = c.getImageData(0, 0, iw, ih);
    } catch (e) {
      return;
    }
    const d = img.data;
    const [pr, pg, pb] = PAPER_RGB;
    for (let y = 0, p = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++, p += 4) {
        const r = d[p];
        const g = d[p + 1];
        const b = d[p + 2];
        const lum = r * 0.3 + g * 0.5 + b * 0.2;
        const gx = Math.round(x / k);
        const gy = Math.round(y / k);
        let n = Math.imul(Math.imul(gx + 1, 374761393) ^ Math.imul(gy + 3, 668265263), 2246822519);
        n = Math.imul(n ^ (n >>> 15), 3266489917);
        const u = ((n ^ (n >>> 13)) >>> 0) / 4294967296;
        if (lum > 214) {
          // Paper is never one value. Two octaves of slow mottle plus a fine
          // tooth: without this the ground reads as a flat digital field, and
          // that alone gives the sheet away next to a photographed one.
          const m =
            (valueNoise(gx * 0.011, gy * 0.011, 9001) - 0.5) * 1.15 +
            (valueNoise(gx * 0.037, gy * 0.037, 9109) - 0.5) * 1.2 +
            (valueNoise(gx * 0.13, gy * 0.13, 9227) - 0.5) * 1.05;
          const v = m * 9.2 + (u - 0.5) * 5.2;
          d[p] = Math.max(0, Math.min(255, r + v));
          d[p + 1] = Math.max(0, Math.min(255, g + v * 0.94));
          d[p + 2] = Math.max(0, Math.min(255, b + v * 0.82));
          continue;
        }
        // paper tooth: the sheet is not flat, so the nib misses a little of it
        const edge = lum > 70 && lum < 190;
        if (edge && u < 0.11) {
          const fade = (0.11 - u) * 2.2;
          d[p] = r + (pr - r) * fade;
          d[p + 1] = g + (pg - g) * fade;
          d[p + 2] = b + (pb - b) * fade;
        } else if (!edge) {
          // Tooth shows through a mass in PATCHES, where the sheet rides high
          // under the nib — never as an even sprinkle across the whole black.
          // Kept light: the erosion that reads as ink belongs in the mass
          // itself, at the scale of the mark, not in a screen-space filter.
          const t = valueNoise(gx * 0.045, gy * 0.045, 5501);
          if (t > 0.72 && u < (t - 0.72) * 0.3) {
            const fade = 0.2 + u * 6;
            d[p] = r + (pr - r) * fade;
            d[p + 1] = g + (pg - g) * fade;
            d[p + 2] = b + (pb - b) * fade;
          }
        }
      }
    }
    c.putImageData(img, 0, 0);
  }

  // ---------- 3d skull: features are pinned to a rough 3D head ----------
  // Unit sphere → rotate yaw/pitch/roll → project → scale by ellipsoid radii.
  // Outline is the convex hull of the projected skull, so it stays an oval
  // when the head turns instead of collapsing into a sausage.
  function rotY(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.z * s, y: p.y, z: p.x * s + p.z * c };
  }
  function rotX(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
  }
  function rotZ(p, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
  }

  function sphere(u, v) {
    return {
      x: Math.cos(v) * Math.sin(u),
      y: Math.sin(v),
      z: Math.cos(v) * Math.cos(u),
    };
  }

  class Skull {
    constructor(cx, cy, s, yaw, pitch, roll, ratio, depth, shape = {}) {
      this.cx = cx;
      this.cy = cy;
      this.s = s;
      this.yaw = yaw;
      this.pitch = pitch;
      this.roll = roll;
      this.rx = s * ratio;
      this.ry = s;
      this.depth = depth;
      this.jaw = shape.jaw ?? 1;
      this.chin = shape.chin ?? 0;
      this.crown = shape.crown ?? 1;
      this.cheek = shape.cheek ?? 1;
      // per-seed lumps: this is what makes a potato instead of an ellipsoid
      this.lobeA = shape.lobeA ?? 3;
      this.lobeB = shape.lobeB ?? 7;
      this.lobeAmp = shape.lobeAmp ?? 0.06;
      this.lobePh = shape.lobePh ?? 0;
      this.flat = shape.flat ?? 0;
      this.flatA = shape.flatA ?? 0;
      // Where the head is WIDEST, and how hard it pinches away from there.
      // Every skull being widest at the same height is what makes forty
      // heads read as one head rotated forty times.
      this.wide = shape.wide ?? 0;
      this.pinch = shape.pinch ?? 0.3;
      this.skewW = shape.skewW ?? 0;
      this.brow = shape.brow ?? 0;
      this.jawAngle = shape.jawAngle ?? 0;
      this.jawHigh = shape.jawHigh ?? 0;
      this.jawTaper = shape.jawTaper ?? 0.8;
      this.chinX = shape.chinX ?? 0;
      this.chinW = shape.chinW ?? 0.14;
    }

    warp(local) {
      const p = { x: local.x, y: local.y, z: local.z };
      // one continuous width profile, peaking at this.wide
      const d = p.y - this.wide;
      const k = Math.max(0.42, 1 - this.pinch * d * d - this.skewW * d);
      p.x *= k * this.cheek;
      p.z *= 0.5 + 0.5 * k;
      // The face lives in front of the ball. Without that, a side view is a
      // lollipop: features pasted on the rim of a circle, no jaw, no occiput.
      if (p.z > 0.02) {
        const face = Math.max(0, p.z);
        p.z += 0.22 * face;
        if (p.y > 0.12) p.z += 0.16 * ((p.y - 0.12) / 0.88);
      } else if (p.z < -0.05 && p.y < -0.1) {
        p.z -= 0.12 * (-p.z);
      }
      if (p.y > 0.22) {
        const t = (p.y - 0.22) / 0.78;
        p.x *= 1 + (this.jaw - 1) * t;
        p.y += this.chin * t;
        p.z += this.chin * 0.45 * t;
      } else if (p.y < -0.35) {
        const t = (-0.35 - p.y) / 0.65;
        p.y *= 1 + (this.crown - 1) * t * 0.55;
      }
      return p;
    }

    rotate(p) {
      p = rotY(p, this.yaw);
      p = rotX(p, this.pitch);
      p = rotZ(p, this.roll);
      return p;
    }

    project(local) {
      const p = this.rotate(this.warp(local));
      const k = 1 + p.z * 0.22 * this.depth;
      return {
        x: this.cx + p.x * this.rx * k,
        y: this.cy + p.y * this.ry * k,
        z: p.z,
        front: p.z > -0.08,
      };
    }

    // Outline = radial extent of the projected skull, then lumped.
    // Not a convex hull: the lump profile can dent inward, which is the
    // difference between a potato and an egg.
    silhouette() {
      const cloud = [];
      const nu = 30;
      const nv = 18;
      for (let i = 0; i < nu; i++) {
        const u = (i / nu) * Math.PI * 2;
        for (let j = 0; j < nv; j++) {
          const v = -Math.PI / 2 + (j / (nv - 1)) * Math.PI;
          const pr = this.project(sphere(u, v));
          cloud.push(pr);
        }
      }
      const extras = [
        { x: 0, y: 0.98 + this.chin, z: 0.22 },
        { x: 0, y: 0.82 + this.chin, z: 0.58 },
        { x: 0, y: -0.12, z: 0.68 },
        { x: 0, y: -0.72, z: -0.52 },
        { x: -0.58 * this.jaw, y: 0.74, z: 0.12 },
        { x: 0.58 * this.jaw, y: 0.74, z: 0.12 },
        { x: -0.72 * this.cheek, y: 0.08, z: 0.18 },
        { x: 0.72 * this.cheek, y: 0.08, z: 0.18 },
      ];
      for (const e of extras) cloud.push(this.project(e));

      const NA = 76;
      const rad = new Array(NA).fill(0);
      for (const p of cloud) {
        const dx = p.x - this.cx;
        const dy = p.y - this.cy;
        const r = Math.hypot(dx, dy);
        const k = ((Math.round(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * NA) % NA) + NA) % NA;
        if (r > rad[k]) rad[k] = r;
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < NA; i++) {
          if (rad[i] > 0) continue;
          rad[i] = Math.max(rad[(i - 1 + NA) % NA], rad[(i + 1) % NA]);
        }
      }
      const sm = rad.map((_, i) =>
        (rad[(i - 2 + NA) % NA] + rad[(i - 1 + NA) % NA] * 2 + rad[i] * 3 + rad[(i + 1) % NA] * 2 + rad[(i + 2) % NA]) / 9
      );

      this._rad0 = sm.slice();
      const out = [];
      const rr = new Array(NA);
      for (let i = 0; i < NA; i++) {
        const a = -Math.PI + (i / NA) * Math.PI * 2;
        // integer harmonics keep the profile periodic, so there is no seam
        let k =
          1 +
          Math.sin(a * this.lobeA + this.lobePh) * this.lobeAmp +
          Math.sin(a * this.lobeB + this.lobePh * 1.7) * this.lobeAmp * 0.55 +
          Math.sin(a * 2 + this.lobePh * 0.4) * this.lobeAmp * 0.4;
        // one flattened facet — a squared-off temple or a cut-off jaw
        // a brow ridge pushing out over the eye socket
        if (this.brow > 0) {
          const up = Math.abs(a + Math.PI / 2);
          if (up < 1.15) k += this.brow * Math.cos((up / 1.15) * Math.PI * 0.5) * 0.9;
        }
        if (this.flat > 0) {
          // dA is the angular distance from flatA, so the facet belongs where
          // dA is SMALL. Testing dA > PI - 0.62 put it on the far side of the
          // head from the angle that was asked for.
          const dA = Math.abs(((a - this.flatA + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (dA < 0.62) k -= this.flat * (1 - dA / 0.62);
        }
        const r = sm[i] * k;
        rr[i] = r;
        out.push({ x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r });
      }
      const rs = rr.map((_, i) => (rr[(i - 1 + NA) % NA] + rr[i] * 2.4 + rr[(i + 1) % NA]) / 4.4);

      // A skull is not one convexity all the way round. It is a cranial ball
      // with a jaw hung off it, and the jaw BREAKS the curve at two corners
      // before running down to a chin. Without those breaks the outline is an
      // egg and every feature floats on it, because there is no volume for
      // them to sit on.
      if (this.jawAngle > 0.02) {
        const P3 = (x, y, z) => this.project({ x, y, z });
        const cornerL = P3(-0.92 * this.jaw, 0.34 + this.jawHigh, 0.06);
        const cornerR = P3(0.92 * this.jaw, 0.34 + this.jawHigh, 0.06);
        const cw = this.chinW;
        const chinL = P3(this.chinX - cw, 1.0 + this.chin, 0.3);
        const chinR = P3(this.chinX + cw, 1.0 + this.chin, 0.3);
        const midL = P3(-0.62 * this.jaw * this.jawTaper, 0.84 + this.chin * 0.6, 0.24);
        const midR = P3(0.62 * this.jaw * this.jawTaper, 0.84 + this.chin * 0.6, 0.24);
        const chain = [cornerL, midL, chinL, chinR, midR, cornerR];
        const ang = (p) => Math.atan2(p.y - this.cy, p.x - this.cx);
        // ray from the centre against each segment of the jaw chain
        for (let i = 0; i < NA; i++) {
          const a = -Math.PI + (i / NA) * Math.PI * 2;
          if (Math.sin(a) <= 0) continue; // lower half of the head only
          const dx = Math.cos(a);
          const dy = Math.sin(a);
          let hit = 0;
          for (let k = 0; k + 1 < chain.length; k++) {
            const p = chain[k];
            const q = chain[k + 1];
            const ex = q.x - p.x;
            const ey = q.y - p.y;
            const den = dx * ey - dy * ex;
            if (Math.abs(den) < 1e-9) continue;
            const px = p.x - this.cx;
            const py = p.y - this.cy;
            const t = (px * ey - py * ex) / den; // distance along the ray
            const u = (px * dy - py * dx) / den; // position along the segment
            if (t > 0 && u >= 0 && u <= 1 && t > hit) hit = t;
          }
          if (hit > 0) {
            // how hard the jaw asserts itself over the smooth profile
            const k = this.jawAngle * Math.min(1, Math.sin(a) * 1.6);
            rs[i] = rs[i] * (1 - k) + hit * k;
          }
        }
        // one light smoothing pass, so the corners stay corners but the runs
        // between them do not shimmer
        const sm = rs.slice();
        for (let i = 0; i < NA; i++) {
          const a = -Math.PI + (i / NA) * Math.PI * 2;
          if (Math.sin(a) <= 0.1) continue;
          rs[i] = (sm[(i - 1 + NA) % NA] + sm[i] * 4 + sm[(i + 1) % NA]) / 6;
        }
      }

      this._rad = rs;
      for (let i = 0; i < NA; i++) {
        const a = -Math.PI + (i / NA) * Math.PI * 2;
        out[i] = { x: this.cx + Math.cos(a) * rs[i], y: this.cy + Math.sin(a) * rs[i] };
      }
      return out;
    }

    // The smooth ellipsoid radius, before lumps and jaw.
    rad0At(a) {
      const rr = this._rad0;
      if (!rr) return Infinity;
      const NA = rr.length;
      const f = (((a + Math.PI) / (Math.PI * 2)) * NA + NA) % NA;
      const i = Math.floor(f);
      const t = f - i;
      return rr[i % NA] * (1 - t) + rr[(i + 1) % NA] * t;
    }

    // Carry a point on the SAME deformation the outline got.
    //
    // The lumps and the jaw were only ever applied to the silhouette, in 2D,
    // after the fact. Features were still pinned to the smooth ellipsoid
    // underneath, so a lopsided potato got its eyes placed as though it were
    // an egg, and anything that overshot was simply clamped back inside. That
    // is why odd heads looked like odd heads with a standard face laid on
    // them. The deformation is now a field over the whole head: full strength
    // at the silhouette, falling off to nothing at the centre, so a bulge
    // carries the eye that sits on it and a square jaw carries the mouth.
    deform(p) {
      if (!this._rad || !this._rad0) return p;
      const dx = p.x - this.cx;
      const dy = p.y - this.cy;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) return p;
      const a = Math.atan2(dy, dx);
      const base = this.rad0At(a);
      if (!isFinite(base) || base < 1e-6) return p;
      const k = 1 + (this.radAt(a) / base - 1) * Math.min(1, d / base);
      return { x: this.cx + dx * k, y: this.cy + dy * k, z: p.z, front: p.front };
    }

    // Area enclosed by the outline, for measuring what sits on top of it.
    hullArea() {
      const rr = this._rad;
      if (!rr) return 0;
      const n = rr.length;
      const d = (Math.PI * 2) / n;
      let A = 0;
      for (let i = 0; i < n; i++) A += 0.5 * rr[i] * rr[i] * d;
      return A;
    }

    // Radius of the outline at a given screen angle.
    radAt(a) {
      const rr = this._rad;
      if (!rr) return Infinity;
      const NA = rr.length;
      const f = (((a + Math.PI) / (Math.PI * 2)) * NA + NA) % NA;
      const i = Math.floor(f);
      const t = f - i;
      return rr[i % NA] * (1 - t) + rr[(i + 1) % NA] * t;
    }

    // Pull a point back inside the outline. Features that slide off the
    // silhouette on a hard turn are the single loudest tell that a face was
    // assembled rather than drawn.
    // Cap how far outside the outline a point may sit. Hats are allowed to
    // leave the skull; they are not allowed to swing across the face when the
    // head turns, which is what a raw z=1.3 pin does under yaw.
    capOut(p, mult) {
      if (!this._rad) return p;
      const dx = p.x - this.cx;
      const dy = p.y - this.cy;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) return p;
      const max = this.radAt(Math.atan2(dy, dx)) * mult;
      if (d <= max) return p;
      const k = max / d;
      return { x: this.cx + dx * k, y: this.cy + dy * k, z: p.z, front: p.front };
    }

    limit(p, margin) {
      if (!this._rad) return p;
      const dx = p.x - this.cx;
      const dy = p.y - this.cy;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) return p;
      const max = this.radAt(Math.atan2(dy, dx)) - margin;
      if (d <= max) return p;
      const k = Math.max(0, max) / d;
      return { x: this.cx + dx * k, y: this.cy + dy * k, z: p.z, front: p.front };
    }

  }


  // Features stay on the head. Hats and hair are allowed to leave it.
  // ---------- landmarks ----------
  // A landmark is not a point. It is a position, a depth, and a local frame
  // on the surface — and the frame is what a feature should be drawn in.
  //
  // Everything used to be a screen-upright primitive: horizontal almond eyes,
  // screen-horizontal brows, horizontal mouth arcs, fixed vertical ears. Roll
  // and surface curvature moved their centres and left their geometry alone,
  // so a tilted head wore a level face.
  //
  // The frame is built by pushing the point a little way along each surface
  // tangent and projecting those too, through the SAME pipeline — so it
  // carries the rotation, the perspective foreshortening and the lump
  // deformation without any of that having to be reasoned about again.
  // Its length is the foreshortening: a feature near the limb of the head
  // squashes because its frame does.
  function frameVectors(skull, local) {
    const r = Math.hypot(local.x, local.y, local.z) || 1;
    const u = Math.atan2(local.x, local.z);
    const v = Math.asin(Math.max(-1, Math.min(1, local.y / r)));
    const e = 0.06;
    const at = (du, dv) => {
      const cv = Math.cos(v + dv);
      return { x: cv * Math.sin(u + du) * r, y: Math.sin(v + dv) * r, z: cv * Math.cos(u + du) * r };
    };
    const p = pin(skull, local);
    const pu = pin(skull, at(e, 0));
    const pv = pin(skull, at(0, e));
    return {
      p,
      ax: (pu.x - p.x) / e,
      ay: (pu.y - p.y) / e,
      bx: (pv.x - p.x) / e,
      by: (pv.y - p.y) / e,
    };
  }

  function landmark(skull, local) {
    const f = frameVectors(skull, local);
    // Reference tangent lengths, taken once per skull at the point facing the
    // viewer. Foreshortening is then each axis measured against its own
    // reference — NOT against the other axis, which is what made a feature on
    // the limb of the head fling its geometry across the page.
    if (skull._refA === undefined) {
      skull._refA = 1;
      skull._refB = 1;
      const f0 = frameVectors(skull, { x: 0, y: 0, z: 1 });
      skull._refA = Math.max(1e-3, Math.hypot(f0.ax, f0.ay));
      skull._refB = Math.max(1e-3, Math.hypot(f0.bx, f0.by));
    }
    let { ax, ay, bx, by } = f;
    if (!isFinite(ax) || Math.hypot(ax, ay) < 1e-3) {
      ax = skull._refA;
      ay = 0;
    }
    if (!isFinite(bx) || Math.hypot(bx, by) < 1e-3) {
      bx = 0;
      by = skull._refB;
    }
    const r = Math.hypot(local.x, local.y, local.z) || 1;
    const n = skull.rotate({ x: local.x / r, y: local.y / r, z: local.z / r });
    return { x: f.p.x, y: f.p.y, z: f.p.z, nz: n.z, ax, ay, bx, by, ra: skull._refA, rb: skull._refB };
  }

  // Place a point in a landmark's frame. Each axis contributes its own unit
  // direction, scaled by how foreshortened that axis is.
  function onSurface(L, a, b) {
    const ka = Math.hypot(L.ax, L.ay) || 1;
    const kb = Math.hypot(L.bx, L.by) || 1;
    const sa = Math.max(0.12, Math.min(1.6, ka / (L.ra || ka)));
    const sb = Math.max(0.12, Math.min(1.6, kb / (L.rb || kb)));
    return {
      x: L.x + (L.ax / ka) * a * sa + (L.bx / kb) * b * sb,
      y: L.y + (L.ay / ka) * a * sa + (L.by / kb) * b * sb,
    };
  }

  function inFrame(L, a, b) {
    return onSurface(L, a, b);
  }

  function pin(skull, local) {
    return skull.limit(skull.deform(skull.project(local)), skull.s * 0.045);
  }


  // ---------- head ----------
  // His commonest nose is not a mark on the face at all: in three-quarter
  // views the head's own contour runs down from the temple, bulges out a
  // knuckle where the tip is, tucks back under, and carries on as the jaw.
  // One unbroken stroke, nothing laid on top. This bends the hull to do it.
  function noseBump(skull, hull, rng, out) {
    const n = hull.length;
    const s = skull.s;
    const mag = Math.hypot(out.x, out.y);
    if (mag < s * 0.06) return null; // too frontal for a profile nose
    const ux = out.x / mag;
    const uy = out.y / mag;
    const t = out.tip;
    const ax = out.ax ?? 0;
    const ay = out.ay ?? 1;

    // The knuckle belongs on whichever contour point sits furthest FORWARD at
    // nose height. Taking the hull index from the angle between the head's
    // centre and the tip put it wherever that interior point happened to lie —
    // at the eye on one face, on the jaw on the next.
    const band = s * 0.34;
    let i0 = -1;
    let best = -Infinity;
    for (let i = 0; i < n; i++) {
      const dx = hull[i].x - t.x;
      const dy = hull[i].y - t.y;
      const along = dx * ax + dy * ay;
      if (Math.abs(along) > band) continue;
      const sc = dx * ux + dy * uy - Math.abs(along) * 0.85;
      if (sc > best) {
        best = sc;
        i0 = i;
      }
    }
    if (i0 < 0) return null;

    // Walking the hull forwards runs chinward on a right-facing head and
    // browward on a left-facing one. Without this the undercut landed ABOVE
    // the tip on half the heads and the knuckle read as two lumps.
    const nx = hull[(i0 + 1) % n].x - hull[(i0 - 1 + n) % n].x;
    const ny = hull[(i0 + 1) % n].y - hull[(i0 - 1 + n) % n].y;
    const dir = nx * ax + ny * ay >= 0 ? 1 : -1;

    const bumpLock = lockRng(rng, "bump");
    const half = Math.max(2, Math.round(n * bumpLock.f(0.04, 0.065)));
    const reach = Math.max(s * 0.09, Math.min(s * 0.3, mag * bumpLock.f(0.55, 1.0)));
    const lean = bumpLock.f(-0.4, 0.4);
    for (let k = -half; k <= half; k++) {
      const j = (((i0 + k) % n) + n) % n;
      const u = (k / half) * dir; // +1 is chinward, whichever way the head faces
      // a knuckle, not a cone: full at the tip, cut back hard just under it
      const g = Math.exp(-u * u * 3.0) * (1 + lean * u);
      const notch = u > 0.3 && u < 0.9 ? -0.34 * Math.sin(((u - 0.3) / 0.6) * Math.PI) : 0;
      const e = reach * (g + notch);
      hull[j] = { x: hull[j].x + ux * e, y: hull[j].y + uy * e };
    }
    return { i0, half, reach, dir, ux, uy };
  }

  // which way, and how far, this face's nose points in screen space
  function noseProfile(skull, d) {
    const fy = d.faceY || 0;
    const q0 = skull.project({ x: 0, y: -0.02 + fy, z: 0.72 });
    const q1 = skull.project({ x: 0, y: -0.02 + fy, z: 1.34 });
    // where the tip actually lands, not merely which way the face points
    const browP = skull.project({ x: 0, y: -0.22 + fy, z: 0.72 });
    const chinP = skull.project({ x: 0, y: 0.95, z: 0.4 });
    const L = Math.hypot(chinP.x - browP.x, chinP.y - browP.y) || 1;
    const ax = (chinP.x - browP.x) / L;
    const ay = (chinP.y - browP.y) / L;
    const drop = L * 0.6;
    return {
      x: q1.x - q0.x,
      y: q1.y - q0.y,
      ax,
      ay,
      len: L,
      browP,
      tip: {
        x: browP.x + ax * drop + (q1.x - q0.x) * 0.7,
        y: browP.y + ay * drop + (q1.y - q0.y) * 0.7,
      },
    };
  }

  // A contour nose needs no bridge — only the small marks that say it is a
  // nose and not a lump: an under-notch and a nostril, tucked back into the
  // face from the tip.
  function silhouetteNose(c, rng, skull, hull, bump, prof) {
    const lock = lockRng(rng, "silnose");
    const s = skull.s;
    const n = hull.length;
    const tip = hull[((bump.i0 % n) + n) % n];
    const ux = bump.ux;
    const uy = bump.uy;
    const ax = prof.ax;
    const ay = prof.ay;
    const w = s * 0.023;

    // The contour has already said everything but the underside. One crease
    // running back from under the tip, and a nostril where it stops.
    // Same plug as a drawn nose: paper over the knuckle so a wash behind
    // cannot show through the tip.
    inkFill(c, rng, [
      { x: skull.cx * 0.55 + tip.x * 0.45, y: skull.cy * 0.35 + tip.y * 0.65 },
      { x: tip.x + ux * s * 0.02, y: tip.y + uy * s * 0.02 },
      { x: tip.x - ax * s * 0.12 + ux * s * 0.04, y: tip.y - ay * s * 0.12 + uy * s * 0.04 },
      { x: tip.x - ax * s * 0.22, y: tip.y - ay * s * 0.22 },
    ], PAPER, 1, 0.4);

    const a = {
      x: tip.x - ux * s * lock.f(0.02, 0.06) + ax * s * lock.f(0.03, 0.07),
      y: tip.y - uy * s * lock.f(0.02, 0.06) + ay * s * lock.f(0.03, 0.07),
    };
    const back = s * lock.f(0.08, 0.17);
    const b = { x: a.x - ux * back + ax * s * lock.f(0.0, 0.04), y: a.y - uy * back + ay * s * lock.f(0.0, 0.04) };
    inkPoly(c, rng, [a, { x: (a.x + b.x) / 2 - ax * s * 0.012, y: (a.y + b.y) / 2 - ay * s * 0.012 }, b], {
      w: w * lock.f(0.8, 1.1),
      dry: 0.6,
    });
    if (lock.chance(0.6)) inkCirc(c, rng, b.x, b.y, s * lock.f(0.013, 0.024), w * 0.5, lock.chance(0.4));
    // sometimes the bridge is carried back up the inside of the contour
    if (lock.chance(0.3)) {
      const u0 = { x: tip.x - ux * s * lock.f(0.01, 0.04), y: tip.y - uy * s * lock.f(0.01, 0.04) };
      const u1 = {
        x: u0.x - ax * s * lock.f(0.22, 0.4) - ux * s * lock.f(0.02, 0.08),
        y: u0.y - ay * s * lock.f(0.22, 0.4) - uy * s * lock.f(0.02, 0.08),
      };
      inkPoly(c, rng, [u1, u0], { w: w * lock.f(0.5, 0.75), dry: 0.9 });
    }

    const bp = prof.browP;
    const drop = Math.max(s * 0.4, (tip.x - bp.x) * ax + (tip.y - bp.y) * ay);
    return { ax, ay, browP: bp, base: drop + s * 0.05, outer: null, bump };
  }

  // The flesh of the nose, closed toward the face — not toward the skull
  // centre, which would wipe the cheek. Used to hide the hoop and the mouth
  // that were drawn after the nose and used to show through it.
  function noseFlesh(skull, nose, hull) {
    if (nose && nose.outer && nose.outer.length >= 3) {
      const a = nose.outer[0];
      const b = nose.outer[nose.outer.length - 1];
      const bp = nose.browP || { x: skull.cx, y: skull.cy };
      // Close at the nose's own base, not down toward the mouth.
      const base = {
        x: bp.x + (nose.ax || 0) * Math.min(nose.base || 0, skull.s * 0.35) * 0.55,
        y: bp.y + (nose.ay || 0) * Math.min(nose.base || 0, skull.s * 0.35) * 0.55,
      };
      return [{ x: (a.x + b.x) * 0.35 + base.x * 0.3, y: (a.y + b.y) * 0.35 + base.y * 0.3 }].concat(nose.outer);
    }
    const bump = nose && nose.bump;
    if (bump && hull && hull.length > 4) {
      const n = hull.length;
      const pts = [];
      for (let k = -bump.half; k <= bump.half; k++) {
        pts.push(hull[(((bump.i0 + k) % n) + n) % n]);
      }
      if (pts.length < 3) return null;
      const tip = hull[(((bump.i0 % n) + n) % n)];
      return [{ x: tip.x - bump.ux * skull.s * 0.2, y: tip.y - bump.uy * skull.s * 0.2 }].concat(pts);
    }
    return null;
  }

  function nearPath(p, path, rad) {
    const r2 = rad * rad;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const ab2 = abx * abx + aby * aby || 1;
      let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const dx = p.x - (a.x + abx * t);
      const dy = p.y - (a.y + aby * t);
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  function coverNose(c, rng, skull, nose, hull) {
    const flesh = noseFlesh(skull, nose, hull);
    if (!flesh) return;
    inkFill(c, rng, flesh, PAPER, 1, 0.35);
    refibre(c, rng, flesh);
    if (nose.outer && nose.outer.length > 1) {
      inkPoly(c, rng, nose.outer, { w: skull.s * 0.026, dry: 0.12, overshoot: false });
    }
  }

  function headFill(c, rng, skull, hull, skinWash) {
    inkFill(c, rng, hull, PAPER, 1, 0.6);
    refibre(c, rng, hull);
    if (skinWash) inkFill(c, rng, hull, skinWash, 0.16, 0.6);
  }

  // Which stretches of the outline are taken over by something in front of
  // it. A nose that reaches past the silhouette IS the silhouette there, and
  // the skull line has to stop — seeing the head's own edge continue behind a
  // protruding nose is what makes a drawing read flat.
  function outlineGaps(skull, hull, paths) {
    const n = hull.length;
    const covered = new Array(n).fill(false);
    // Only where the thing is GENUINELY past the outline, and only for the
    // width it actually occupies. Gapping wherever a path merely reached the
    // edge opened the head up like a broken egg.
    const out = skull.s * 0.012;
    let hits = 0;
    for (const path of paths) {
      if (!path) continue;
      for (const p of path) {
        const dx = p.x - skull.cx;
        const dy = p.y - skull.cy;
        const d = Math.hypot(dx, dy);
        if (d < 1e-6) continue;
        const a = Math.atan2(dy, dx);
        if (d < skull.radAt(a) + out) continue;
        const i = Math.round(((a + Math.PI) / (Math.PI * 2)) * n);
        for (let k = -1; k <= 1; k++) {
          const j = (((i + k) % n) + n) % n;
          if (!covered[j]) hits++;
          covered[j] = true;
        }
      }
    }
    // a nose and two ears cannot account for a third of a head
    if (hits > n * 0.3) return new Array(n).fill(false);
    return covered;
  }

  function headOutline(c, rng, skull, hull, covered) {
    const lock = lockRng(rng, "outline");
    const n = hull.length;
    const w0 = skull.s * 0.03 * (skull.pen || 1);
    const ov = Math.round(n * lock.f(0.05, 0.11));
    // A head is not one closed loop. It is a cranium drawn over and a jaw
    // drawn under, which overshoot and cross where they meet.
    const arc = (a, b) => {
      const out = [];
      for (let i = a; i <= b; i++) {
        const k = ((i % n) + n) % n;
        if (covered && covered[k]) {
          if (out.length > 1) {
            const mid = out[Math.floor(out.length / 2)];
            const low = mid.y > skull.cy;
            inkPoly(c, rng, out.slice(), {
              w: w0 * (low ? lock.f(1.2, 1.55) : lock.f(0.8, 0.95)),
              dry: low ? 0.25 : 0.35,
              doubled: lock.chance(0.24),
            });
          }
          out.length = 0;
          continue;
        }
        out.push(hull[k]);
      }
      if (out.length > 1) {
        const mid = out[Math.floor(out.length / 2)];
        const low = mid.y > skull.cy;
        inkPoly(c, rng, out, {
          w: w0 * (low ? lock.f(1.2, 1.55) : lock.f(0.8, 0.95)),
          dry: low ? 0.25 : 0.35,
          doubled: lock.chance(0.24),
        });
      }
    };
    arc(-ov, Math.round(n * 0.5) + ov);
    arc(Math.round(n * 0.5) - ov, n + ov);
    if (lock.chance(0.12)) {
      const a0 = Math.round(n * lock.f(0.02, 0.12));
      arc(a0, a0 + Math.round(n * lock.f(0.12, 0.26)));
    }
  }

  function drawEars(c, rng, skull) {
    const lock = lockRng(rng, "ears");
    const inkL = lockRng(rng, "earInkL");
    const inkR = lockRng(rng, "earInkR");
    const yL = lock.f(-0.12, 0.12);
    const yR = lock.f(-0.12, 0.12);
    const er = skull.s * lock.f(0.1, 0.17);
    const kL = lock.f(0.85, 1.15);
    const kR = lock.f(0.85, 1.15);
    const earL = landmark(skull, { x: -0.88, y: 0.02 + yL, z: 0.05 });
    const earR = landmark(skull, { x: 0.88, y: 0.02 + yR, z: 0.05 });
    // Like the nose: a mark on the potato when that side faces us, gone
    // when it turns away. Not a separate lump bolted to the outline.
    const yaw = skull.yaw || 0;
    const facing = Math.abs(yaw) < 0.2;
    const show = (p) => (facing ? p.nz > -0.18 : p.nz > 0.1);
    const out = [];
    if (show(earL)) out.push(drawEar(c, inkL, earL, er * kL, -1));
    if (show(earR)) out.push(drawEar(c, inkR, earR, er * kR, 1));
    return out;
  }

  // A little neck and collar under the chin. Every head on the reference
  // plates has one; a head floating alone on the paper does not read.
  function drawNeck(c, rng, skull) {
    const s = skull.s;
    const drop = s * rng.f(0.12, 0.34);
    const lean = rng.f(-0.28, 0.28);
    // both sides start ON the jaw, found by walking the outline, so the neck
    // is never a pair of ticks floating clear of the chin
    const onJaw = (ang) => {
      const r = skull.radAt(ang);
      return { x: skull.cx + Math.cos(ang) * r, y: skull.cy + Math.sin(ang) * r };
    };
    const aL = Math.PI / 2 + rng.f(0.34, 0.7);
    const aR = Math.PI / 2 - rng.f(0.34, 0.7);
    const l = onJaw(aL);
    const r = onJaw(aR);
    const lb = { x: l.x + drop * lean + rng.f(-3, 3), y: l.y + drop };
    const rb = { x: r.x + drop * lean + rng.f(-3, 3), y: r.y + drop * rng.f(0.82, 1.18) };
    inkPoly(c, rng, [l, lb], { w: s * rng.f(0.016, 0.026), dry: 0.5, wobble: s * 0.02 });
    if (rng.chance(0.88)) {
      inkPoly(c, rng, [r, rb], { w: s * rng.f(0.016, 0.026), dry: 0.5, wobble: s * 0.02 });
    }
    if (rng.chance(0.5)) {
      const mid = { x: (lb.x + rb.x) / 2, y: (lb.y + rb.y) / 2 };
      const kind = rng.pick(["collar", "collar", "bow", "shoulders"]);
      if (kind === "shoulders") {
        inkPoly(c, rng, [
          { x: lb.x - s * rng.f(0.2, 0.45), y: lb.y + s * rng.f(0.04, 0.12) },
          { x: lb.x, y: lb.y },
          { x: rb.x, y: rb.y },
          { x: rb.x + s * rng.f(0.2, 0.45), y: rb.y + s * rng.f(0.04, 0.12) },
        ], { w: s * 0.018, dry: 0.6, wobble: s * 0.03 });
      } else if (kind === "bow") {
        inkPoly(c, rng, [
          { x: mid.x - s * rng.f(0.06, 0.12), y: mid.y - s * 0.03 },
          { x: mid.x, y: mid.y + s * 0.04 },
          { x: mid.x + s * rng.f(0.06, 0.12), y: mid.y - s * 0.03 },
          { x: mid.x, y: mid.y + s * 0.04 },
        ], { w: s * 0.017, dry: 0.7 });
      } else {
        inkPoly(c, rng, [
          { x: lb.x - s * rng.f(0.06, 0.16), y: lb.y - s * 0.02 },
          { x: mid.x, y: mid.y + s * rng.f(0.03, 0.1) },
          { x: rb.x + s * rng.f(0.06, 0.16), y: rb.y - s * 0.02 },
        ], { w: s * 0.019, dry: 0.6, wobble: s * 0.03 });
      }
    }
  }

  function drawEar(c, rng, L, r, side) {
    // A C on the surface, the same as a nose is a mark on the face.
    // No fill — a filled lobe is what made it a separate potato.
    const F = (a, b) => onSurface(L, a, b);
    const pts = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = -Math.PI * 0.45 + t * Math.PI * 0.95;
      pts.push(F(Math.cos(a) * r * side * 0.72, Math.sin(a) * r * 0.95));
    }
    inkPoly(c, rng, pts, { w: r * 0.12, dry: 0.7 });
    if (lockRng(rng, "inner").chance(0.55)) {
      const q0 = F(side * r * 0.12, -r * 0.12);
      const q1 = F(side * r * 0.22, r * 0.16);
      inkLine(c, rng, q0.x, q0.y, q1.x, q1.y, r * 0.08);
    }
    return pts;
  }

  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }

  // ---------- hair as a mass that owns the crown ----------
  // The rule: hair is not a shape parked on top of a head. It REPLACES the
  // top of the skull. So every mass is built from two edges — a hairline
  // drawn across the face, and the skull's own silhouette above it, pushed
  // out by the thickness of the hair. The head outline never shows through.

  // Ordered hairline, left temple to right temple, pinned to the skull.
  function hairline(skull, rng, opt = {}) {
    const lineY = opt.lineY ?? -0.4;
    const recede = opt.recede ?? 0;
    const bangs = opt.bangs ?? 0;
    const sideBias = opt.sideBias ?? 0;
    const wrap = opt.wrap ?? 1.02;
    const wob = opt.wob ?? 0.05;
    const pts = [];
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = (t - 0.5) * Math.PI * wrap * 1.9;
      const temple = Math.pow(Math.abs(Math.sin(u)), 1.4);
      const center = Math.max(0, Math.cos(u));
      let y = lineY - recede * temple + bangs * center + sideBias * Math.sin(u);
      // A hairline has a shape of its own — a peak, a sweep, a jagged cut —
      // otherwise every black mass on the sheet is the same crescent.
      const sh = opt.shape;
      if (sh === "peak") y += Math.pow(center, 2.2) * 0.16 - temple * 0.05;
      else if (sh === "round") y -= center * 0.11;
      else if (sh === "sweep") y += Math.sin(u) * 0.19 + center * 0.04;
      else if (sh === "receded") y += Math.pow(center, 1.6) * 0.1 - temple * 0.16;
      else if (sh === "jagged") y += (Math.round(Math.sin(u * 4.7 + 1.3) * 2) / 2) * 0.07;
      else if (sh === "low") y += 0.07 - temple * 0.03;
      y += (fbm2(u * 1.6 + 4, (rng.seed % 53) * 0.07, rng.seed) - 0.5) * wob * 2;
      // Hair may sit low on the brow; it may not cross the eyes. A side sweep
      // plus a side bias could put the hairline at eye level on one side, and
      // the mass then read as a black bar laid across the face.
      y = clamp(y, -0.95, -0.2 + (skull.faceY || 0));
      const p = pin(skull, sphere(u, Math.asin(clamp(y, -0.995, 0.995))));
      pts.push(p);
    }
    return pts;
  }

  // The stretch of skull silhouette between the two temples, walked over the
  // top and pushed outward.
  //
  // This used to select hull points lying above the chord from one temple to
  // the other. That works head-on, but on a hard turn the two temples end up
  // on the same side of the skull, the chord goes near-vertical, and "above
  // it" is half the head — which the hair then fills in solid.
  // Walking round by angle instead is indifferent to the pose.
  function crownArc(skull, hull, a, b, puff, rng) {
    const n = hull.length;
    if (n < 6) return [];
    const idx = (p) => {
      const ang = Math.atan2(p.y - skull.cy, p.x - skull.cx);
      return ((Math.round(((ang + Math.PI) / (Math.PI * 2)) * n) % n) + n) % n;
    };
    const ia = idx(a);
    const ib = idx(b);
    const walk = (from, to, step) => {
      const out = [];
      let i = from;
      for (let k = 0; k <= n; k++) {
        out.push(i);
        if (i === to) break;
        i = (i + step + n) % n;
      }
      return out;
    };
    const topIdx = Math.round(n * 0.25) % n; // angle -PI/2 is straight up
    const up = walk(ib, ia, -1);
    const down = walk(ib, ia, 1);
    let chosen = up.includes(topIdx) ? up : down;
    // a crown arc never needs more than about half the outline
    if (chosen.length > n * 0.72) chosen = chosen.length === up.length ? down : up;
    return chosen.map((hi, i) => {
      const q = hull[hi];
      const ox = q.x - skull.cx;
      const oy = q.y - skull.cy;
      const len = Math.hypot(ox, oy) || 1;
      const lump = 0.5 + fbm2(i * 0.22, (rng.seed % 89) * 0.11, rng.seed + 7) * 1.5 + fbm2(i * 0.9, 3.3, rng.seed + 19) * 0.25;
      const k = (len + puff * lump) / len;
      return { x: skull.cx + ox * k, y: skull.cy + oy * k };
    });
  }

  // Keep only the stretch of hairline that is actually on the front of the
  // skull. The ends of the full sweep have wrapped round the back, where they
  // project INWARD — so using them as the temples put both "temples" near the
  // crown and left the crown arc a seven-point sliver.
  function frontRun(pts) {
    let best = null;
    let run = null;
    for (const p of pts) {
      if (p.z === undefined || p.z > -0.02) {
        if (!run) run = [p];
        else run.push(p);
        if (!best || run.length > best.length) best = run;
      } else {
        run = null;
      }
    }
    // No fallback to `pts`: returning the whole sweep hands back the
    // back-facing points this function exists to remove, and the caller then
    // builds a mass from temples that are round the back of the skull.
    return best && best.length >= 3 ? best : null;
  }

  function hairMass(skull, hull, rng, opt = {}) {
    // per-seed volume and reach, on top of whatever the style asked for, so
    // the same cap does not come out at forty scales and rotations
    const cut = lockRng(rng, "mass");
    opt = Object.assign({}, opt, {
      puff: (opt.puff ?? 0.05) * cut.f(0.7, 1.25),
      // u spans (t-0.5)*PI*wrap*1.9, so wrap above ~1.05 sends the hairline
      // round the back of the skull and the mass swallows the whole face
      wrap: Math.min(1.05, (opt.wrap ?? 1.02) * cut.f(0.84, 1.08)),
      sideBias: (opt.sideBias ?? 0) + cut.f(-0.1, 0.1),
    });
    const front = frontRun(hairline(skull, rng, opt));
    if (!front || front.length < 3) return null;
    const a = front[0];
    const b = front[front.length - 1];
    const puff = (opt.puff ?? 0.05) * skull.s;
    let top = crownArc(skull, hull, a, b, puff, rng);
    if (top.length < 2) return null;
    top = outerProfile(top, skull, rng, opt);

    // Cap the mass against the head it sits on. Measured against the
    // reference, our blackest faces carried nearly twice his ink — his
    // darkest is 22% of its cell, ours reached 43%. The cause was not the
    // number of marks but a black cap covering half a skull. If the mass is
    // too big a share of the head, the crown edge is pulled back toward the
    // hairline until it is not.
    const cap = opt.areaCap ?? 0.5;
    const headA = skull.hullArea();
    if (headA > 0) {
        for (let pass = 0; pass < 6; pass++) {
        const m = front.concat(top);
        let A = 0;
        for (let i = 0; i < m.length; i++) {
          const q = m[i];
          const r = m[(i + 1) % m.length];
          A += q.x * r.y - r.x * q.y;
        }
        A = Math.abs(A) / 2;
        if (A <= headA * cap) break;
        const k = Math.sqrt((headA * cap) / A);
        top = top.map((q, i) => {
          const f = front[Math.min(front.length - 1, Math.round((1 - i / (top.length - 1 || 1)) * (front.length - 1)))];
          return { x: f.x + (q.x - f.x) * k, y: f.y + (q.y - f.y) * k };
        });
      }
    }
    return { front, top, mass: front.concat(top) };
  }

  // Two rings round the skull at different heights, kept to the longest span
  // where BOTH are on the visible side, returned as a closed ribbon.
  function ribbonBetween(skull, yHi, yLo, wrap = 0.92) {
    const n = 40;
    const vHi = Math.asin(Math.max(-0.95, Math.min(0.15, yHi)));
    const vLo = Math.asin(Math.max(-0.95, Math.min(0.15, yLo)));
    let best = null;
    let run = null;
    for (let i = 0; i <= n; i++) {
      const u = (i / n - 0.5) * Math.PI * 2 * wrap;
      const a = pin(skull, sphere(u, vHi));
      const b = pin(skull, sphere(u, vLo));
      if (a.z > -0.25 && b.z > -0.25) {
        if (!run) run = { a: [a], b: [b] };
        else {
          run.a.push(a);
          run.b.push(b);
        }
        if (!best || run.a.length > best.a.length) best = run;
      } else {
        run = null;
      }
    }
    if (!best || best.a.length < 3) return null;
    return { hi: best.a, lo: best.b, poly: best.a.concat(best.b.slice().reverse()) };
  }

  // Every mass so far was a hairline plus the skull arc pushed outward — one
  // topology, so the outer edge was always a scaled copy of the cranium and
  // the caps read as one shape however the parameters moved. These reshape
  // the outer edge itself, which is the part that reads at grid scale.
  function outerProfile(top, skull, rng, opt) {
    const lock = lockRng(rng, "outer");
    const kind = opt.outer ?? lock.pick(["skull", "skull", "quiff", "flattop", "dome", "wedge", "wedge", "sweep"]);
    if (kind === "skull") return top;
    const n = top.length;
    const s = skull.s;
    const push = (p, amt) => {
      const ox = p.x - skull.cx;
      const oy = p.y - skull.cy;
      const d = Math.hypot(ox, oy) || 1;
      return { x: skull.cx + (ox / d) * (d + amt), y: skull.cy + (oy / d) * (d + amt) };
    };
    if (kind === "quiff") {
      // piled up over one temple and falling away
      const at = lock.f(0.12, 0.42);
      const w = lock.f(0.1, 0.3);
      const h = s * lock.f(0.1, 0.26);
      return top.map((p, i) => {
        const t = i / (n - 1 || 1);
        const g = Math.exp(-Math.pow((t - at) / w, 2));
        return push(p, h * g);
      });
    }
    if (kind === "wedge") {
      // Rising steadily from one temple to the other. The displacement is
      // always outward — a negative height used to push that side inside the
      // skull and could fold the hair polygon over itself. Direction is a
      // choice of which temple is high, not a sign flip.
      const h = s * lock.f(0.07, 0.2);
      const flip = lock.chance(0.5);
      return top.map((p, i) => {
        const t = i / (n - 1 || 1);
        const u = flip ? 1 - t : t;
        return push(p, h * u);
      });
    }
    if (kind === "dome") {
      // volume all round, falling off at the temples
      const h = s * lock.f(0.09, 0.25);
      return top.map((p, i) => {
        const t = i / (n - 1 || 1);
        return push(p, h * Math.sin(t * Math.PI));
      });
    }
    if (kind === "sweep") {
      // combed hard to one side: long over one temple, cropped at the other
      const dir = lock.chance(0.5) ? 1 : -1;
      const h = s * lock.f(0.08, 0.22);
      return top.map((p, i) => {
        const t = i / (n - 1 || 1);
        const u = dir > 0 ? t : 1 - t;
        return push(p, h * Math.pow(u, 1.8));
      });
    }
    // flattop: cut off square across the crown
    let minY = Infinity;
    for (const p of top) if (p.y < minY) minY = p.y;
    const cut = minY + s * lock.f(-0.12, 0.06);
    const tilt = lock.f(-0.12, 0.12);
    return top.map((p, i) => {
      const t = i / (n - 1 || 1);
      const line = cut + (t - 0.5) * s * tilt;
      return p.y > line ? p : { x: p.x, y: line + rng.f(-1, 1) };
    });
  }


  // Fill it black, cut the hairline in hard, let a few hairs escape the top.
  // Dark does not have to mean filled. Two or three passes of parallel lines
  // at different angles build a tone that still reads as drawn — and a sheet
  // where every dark mass is solid black goes heavy and flat very quickly.
  function crossHatch(c, rng, pts, color, s, opt = {}) {
    if (!pts || pts.length < 3) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const q of pts) {
      if (q.x < x0) x0 = q.x;
      if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y;
      if (q.y > y1) y1 = q.y;
    }
    const span = Math.hypot(x1 - x0, y1 - y0) || 1;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    c.save();
    c.beginPath();
    pts.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
    c.closePath();
    c.clip();
    const passes = opt.passes ?? rng.i(2, 3);
    let ang = rng.f(-1.3, -0.3);
    for (let p = 0; p < passes; p++) {
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const pitch = s * rng.f(0.028, 0.055);
      for (let k = -span * 0.6; k < span * 0.6; k += pitch * rng.f(0.8, 1.25)) {
        const mx = cx - dy * k;
        const my = cy + dx * k;
        const reach = span * rng.f(0.34, 0.6);
        nib(c, rng, [
          { x: mx - dx * reach, y: my - dy * reach },
          { x: mx + dx * reach * rng.f(0.8, 1.05), y: my + dy * reach * rng.f(0.8, 1.05) },
        ], { w: s * rng.f(0.012, 0.024), color, dry: 0.8, wobble: s * 0.012 });
      }
      // the next pass crosses the last at a real angle, not a nudge
      ang += rng.f(0.7, 1.35) * (rng.chance(0.5) ? 1 : -1);
    }
    c.restore();
  }

  // Shading down the shadow side of a face: strokes running in from the
  // contour, crossed by a second pass, thinning as they go inward and
  // overrunning the outline where they start. Not a filled band — the tone
  // comes from how densely the lines pile up near the edge.
  function cheekHatch(c, rng, skull, hull, side) {
    const n = hull.length;
    const s = skull.s;
    // the jaw/cheek quadrant on one side: index 0 is left, n/4 is up,
    // n/2 is right, 3n/4 is down
    const centre = side < 0 ? n * 0.86 : n * 0.64;
    const half = n * rng.f(0.07, 0.13);
    const i0 = Math.round(centre - half);
    const i1 = Math.round(centre + half);
    const depth = s * rng.f(0.3, 0.62);
    const passes = rng.chance(0.3) ? 3 : 2;
    for (let pass = 0; pass < passes; pass++) {
      const skew = (pass === 0 ? 1 : pass === 1 ? -1 : 0.2) * rng.f(0.35, 0.75);
      const step = Math.max(1, Math.round((i1 - i0) / rng.i(9, 16)));
      for (let i = i0; i <= i1; i += step) {
        const p = hull[((Math.round(i) % n) + n) % n];
        if (!p) continue;
        const dx = p.x - skull.cx;
        const dy = p.y - skull.cy;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d;
        const ny = dy / d;
        // rotate the inward normal to get the hatching angle
        const cs = Math.cos(skew);
        const sn = Math.sin(skew);
        const hx = -nx * cs - ny * sn;
        const hy = -ny * cs + nx * sn;
        const out = s * rng.f(0.02, 0.07); // it starts outside the line
        const len = depth * rng.f(0.55, 1.15);
        nib(c, rng, [
          { x: p.x - hx * out, y: p.y - hy * out },
          { x: p.x + hx * len, y: p.y + hy * len },
        ], { w: s * rng.f(0.015, 0.028), dry: 0.55, wobble: s * 0.012, taper: rng.f(0.15, 0.45) });
      }
    }
  }

  function inkMass(c, rng, h, color, opt = {}) {
    if (!h) return;
    const { front, top, mass } = h;
    const k = h._s / 100;
    const tone = opt.tone || "solid";
    // The hairline is a decision — a clean, committed cut across the face.
    // Only the outer edge is ragged, and only where the hair ends.
    if (tone === "cross") {
      crossHatch(c, rng, mass, color, h._s, {});
    } else if (tone === "half") {
      inkFill(c, rng, mass, color, 0.42, (opt.rag ?? 2.0) * k * 0.7);
      crossHatch(c, rng, mass, color, h._s, { passes: 2 });
    } else {
      inkFill(c, rng, mass, color, 1, (opt.rag ?? 2.0) * k * 0.7);
      loadMass(c, rng, mass, (opt.rag ?? 2.0) * k * 1.6, opt.load ?? lockRng(rng, "load").f(0.7, 0.88));
    }
    if (tone === "solid") ragEdge(c, rng, top, h._cx, h._cy, (opt.rag ?? 2.0) * k * 1.5, color);
    else inkPoly(c, rng, top, { w: 1.4 * k, dry: 1.3 });
    inkPoly(c, rng, front, { w: (opt.edge ?? 2.5) * k, dry: 0.5 });
    capBreaks(c, rng, h, color, opt);
    strayHairs(c, rng, h, opt);
  }

  // One cap topology — a hairline with the crown offset outward — gives the
  // same three or four silhouettes at forty scales and rotations, and a
  // hairline that never once spills onto the face. These break it: a parting
  // cut back to the skin, locks hanging past the brow, a sideburn running
  // down past the ear.
  function capBreaks(c, rng, h, color, opt = {}) {
    const { front, top } = h;
    const k = h._s / 100;
    if (front.length < 4 || top.length < 3) return;
    const lock = lockRng(rng, "breaks");

    if (lock.chance(0.2)) {
      // a parting cut back to the skin
      const ti = lock.i(1, top.length - 2);
      const fi = Math.max(1, Math.min(front.length - 2, Math.round((1 - ti / (top.length - 1)) * (front.length - 1))));
      const a = top[ti];
      const b = front[fi];
      const wdt = h._s * lock.f(0.03, 0.075);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d;
      const ny = dx / d;
      const deep = lock.f(0.55, 1.0);
      const gap = [];
      for (let i = 0; i <= 6; i++) {
        const t = (i / 6) * deep;
        const wob = Math.sin(t * Math.PI) * wdt;
        gap.push({ x: a.x + dx * t + nx * (wdt * 0.35 + wob), y: a.y + dy * t + ny * (wdt * 0.35 + wob) });
      }
      for (let i = 6; i >= 0; i--) {
        const t = (i / 6) * deep;
        const wob = Math.sin(t * Math.PI) * wdt;
        gap.push({ x: a.x + dx * t - nx * (wdt * 0.35 + wob), y: a.y + dy * t - ny * (wdt * 0.35 + wob) });
      }
      inkFill(c, rng, gap, PAPER, 1, 1.1 * k);
      refibre(c, rng, gap);
      inkPoly(c, rng, gap.slice(0, 7), { w: 1.1 * k, dry: 1.2 });
    }

    // locks hanging past the hairline onto the forehead — these sit in front
    const locks = lock.chance(0.3) ? lock.i(1, 2) : 0;
    for (let i = 0; i < locks; i++) {
      const fi = lock.i(1, front.length - 2);
      const p = front[fi];
      if (p.z !== undefined && p.z < 0.05) continue;
      const drop = h._s * lock.f(0.08, 0.24);
      const wdt = h._s * lock.f(0.022, 0.05);
      const lean = lock.f(-0.5, 0.5);
      const tip = { x: p.x + drop * lean, y: p.y + drop };
      inkFill(c, rng, [
        { x: p.x - wdt, y: p.y - wdt * 0.4 },
        { x: p.x + wdt, y: p.y - wdt * 0.6 },
        { x: tip.x + wdt * 0.18, y: tip.y },
        { x: tip.x - wdt * 0.1, y: tip.y + wdt * 0.2 },
      ], color, 1, 1.3 * k);
    }

    // a sideburn running down past the ear
    if (lock.chance(0.16)) {
      const end = lock.chance(0.5) ? front[0] : front[front.length - 1];
      const drop = h._s * lock.f(0.16, 0.42);
      const wdt = h._s * lock.f(0.05, 0.1);
      inkFill(c, rng, [
        { x: end.x - wdt, y: end.y },
        { x: end.x + wdt, y: end.y },
        { x: end.x + wdt * lock.f(0.2, 0.7), y: end.y + drop },
        { x: end.x - wdt * lock.f(0.5, 1.0), y: end.y + drop * lock.f(0.8, 1.0) },
      ], color, 1, 1.4 * k);
    }
  }

  // Break one edge of a mass with outward stroke-ends, leaving the rest clean.
  function ragEdge(c, rng, edge, cx, cy, bite, color) {
    if (!edge || edge.length < 2) return;
    const walk = resample(edge, Math.max(1.8, bite * 0.8));
    for (let i = 0; i < walk.length; i++) {
      const q = walk[i];
      const dx = q.x - cx;
      const dy = q.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const out = bite * (fbm2(i * 0.34, cx * 0.01, rng.seed + 77) * 2.3 - 0.5);
      if (out < 0.3) continue;
      const a = { x: cx + (dx / d) * (d - bite * rng.f(1.2, 2.4)), y: cy + (dy / d) * (d - bite * rng.f(1.2, 2.4)) };
      const b = { x: cx + (dx / d) * (d + out), y: cy + (dy / d) * (d + out) };
      nib(c, rng, [a, b], { w: bite * rng.f(0.3, 0.65), color, dry: 0.8, wobble: 0.4 });
    }
  }

  // Loose hairs come in tufts, from where hair actually grows, at wildly
  // different lengths. An even fringe of identical bristles round the whole
  // outline is the single clearest sign nobody drew this.
  function strayHairs(c, rng, h, opt = {}) {
    const budget = Math.round((opt.strays ?? 6) * 0.6);
    if (budget <= 0 || !h.top.length) return;
    const k = h._s / 100;
    const lock = lockRng(rng, "stray");
    const tufts = lock.i(1, 3);
    for (let t = 0; t < tufts; t++) {
      const at = lock.i(0, h.top.length - 1);
      const spread = lock.i(1, 4);
      const count = Math.max(1, Math.round(budget / tufts));
      for (let i = 0; i < count; i++) {
        const q = h.top[Math.max(0, Math.min(h.top.length - 1, at + lock.i(-spread, spread)))];
        if (!q) continue;
        const ox = q.x - h._cx;
        const oy = q.y - h._cy;
        const len = Math.hypot(ox, oy) || 1;
        const g = (lock.chance(0.35) ? lock.f(9, 22) : lock.f(2, 8)) * (opt.strayLen ?? 1) * k;
        const curl = lock.f(-0.5, 0.5);
        inkPoly(c, rng, [
          q,
          { x: q.x + (ox / len) * g * 0.55 - (oy / len) * g * curl * 0.3, y: q.y + (oy / len) * g * 0.55 + (ox / len) * g * curl * 0.3 },
          { x: q.x + (ox / len) * g - (oy / len) * g * curl, y: q.y + (oy / len) * g + (ox / len) * g * curl },
        ], { w: lock.f(0.6, 1.8) * k, dry: 0.8 });
      }
    }
  }

  // Hair drawn as strokes instead of a solid: combed, ribbed, hatched.
  // Each stroke runs from the outer edge down to the hairline, bowed the way
  // hair falls. They never cross each other.
  function combMass(c, rng, h, opt = {}) {
    if (!h) return;
    const { front, top } = h;
    const k = h._s / 100;
    const lock = lockRng(rng, "comb");
    // A solid cap hides the cranium under its own fill. Hair laid as strokes
    // has no fill, so the closed skull loop shows straight through it and the
    // strokes read as a fringe hung on a bald egg. Take the head line out
    // first: where hair sits, the hair's outer edge IS the silhouette.
    if (opt.wipe) {
      inkFill(c, rng, h.mass, PAPER, 1, 1.4 * k);
      refibre(c, rng, h.mass);
    }
    const lines = opt.lines ?? 30;
    const bow = opt.bow ?? 0.2;
    // one parting, and everything sweeps away from it
    const part = lock.f(0.2, 0.8);
    const sweep = lock.f(-0.35, 0.35);
    for (let i = 0; i < lines; i++) {
      // clump: strokes gather and leave gaps instead of marching evenly
      const base = i / (lines - 1 || 1);
      const t = Math.max(0, Math.min(1, base + (fbm2(base * 6.4 + lock.seed * 0.01, 2.7, lock.seed + 5) - 0.5) * 0.18 + lock.f(-0.02, 0.02)));
      const f = front[Math.min(front.length - 1, Math.round(t * (front.length - 1)))];
      const g = top[Math.min(top.length - 1, Math.round((1 - t) * (top.length - 1)))];
      const swingK = lock.f(0.5, 1.3);
      const stop = lock.f(0.55, 1.05); // tips end at different depths
      const out = lock.f(-1, 3.5) * k;
      const ww = lock.f(1.9, 4.0) * k;
      const taper = lock.f(0.08, 0.3);
      if (!f || !g) continue;
      const dx = f.x - g.x;
      const dy = f.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      const swing = (bow + sweep * (t - part)) * d * swingK;
      const ox = g.x - h._cx;
      const oy = g.y - h._cy;
      const ol = Math.hypot(ox, oy) || 1;
      const g0 = { x: g.x + (ox / ol) * out, y: g.y + (oy / ol) * out };
      const path = [];
      for (let j = 0; j <= 5; j++) {
        const u = (j / 5) * stop;
        path.push({
          x: g0.x + dx * u + (-dy / d) * swing * Math.sin(u * Math.PI),
          y: g0.y + dy * u + (dx / d) * swing * Math.sin(u * Math.PI),
        });
      }
      // thick where it leaves the scalp, gone by the tip
      inkPoly(c, rng, path, { w: ww, taper, dry: 0.5, overshoot: false });
    }
    // Even stroke-laid hair needs a hairline. Without one the strokes read as
    // a fringe radiating off the top contour rather than hair growing out of a
    // scalp — and the hairline is what tells you the shape of the head.
    if (opt.hairline !== false && front.length > 3) {
      const a = lock.i(0, Math.max(0, front.length - 4));
      const b = Math.min(front.length - 1, a + Math.round(front.length * lock.f(0.35, 0.8)));
      const run = front.slice(a, b + 1);
      if (run.length > 2) inkPoly(c, rng, run, { w: lock.f(1.2, 2.1) * k, dry: 1.2 });
    }
  }

  function shortTicks(c, rng, skull, lineY, count, len) {
    const lock = lockRng(rng, "ticks");
    for (let i = 0; i < count; i++) {
      const u = lock.f(-1.2, 1.2);
      const y = lineY + lock.f(-0.18, 0.06);
      const drop = lock.f(0.08, len);
      const w = skull.s * lock.f(0.0085, 0.0135);
      const p = pin(skull, sphere(u, Math.asin(clamp(y, -0.95, 0.2))));
      if (p.z < -0.35) continue;
      const tip = pin(skull, {
        x: Math.sin(u) * 0.55,
        y: y - drop,
        z: Math.cos(u) * 0.45,
      });
      inkLine(c, rng, p.x, p.y, tip.x, tip.y, w);
    }
  }

  // A peak pinned at raw 3D coordinates swings sideways under yaw and lays a
  // black wedge across the face. Built off the face-forward vector in screen
  // space it foreshortens instead, the way a brim seen from the side does.
  function brimPts(skull, h, reach, rng) {
    if (!h || h.front.length < 3) return null;
    const c0 = skull.project({ x: 0, y: -0.2, z: 0 });
    const c1 = skull.project({ x: 0, y: -0.2, z: 1 });
    const fx = c1.x - c0.x;
    const fy = c1.y - c0.y;
    const f = h.front;
    const n = f.length;
    const pick = [f[0], f[Math.round(n * 0.25)], f[Math.round(n * 0.5)], f[Math.round(n * 0.75)], f[n - 1]];
    const out = pick.map((p, i) => {
      const t = i / (pick.length - 1);
      const k = reach * Math.sin(t * Math.PI) * rng.f(0.85, 1.15);
      return { x: p.x + fx * k, y: p.y + fy * k };
    });
    return pick.concat(out.reverse());
  }

  // A miniature of the deferred command buffer Codex asked for. Hair is drawn
  // before the face because the mass belongs behind it — but a hat brim or a
  // lock hanging over the brow belongs in FRONT, and was being overpainted by
  // the eyes and brows that came after it. Those go into `defer` and are
  // flushed once the face is done.
  function drawHair(c, rng, skull, hull, style, color, defer, tone, lock = {}) {
    const front = defer || [];
    let lastMass = null;
    const s = skull.s;
    const shape = lock.shape || rng.pick(["flat", "peak", "peak", "round", "sweep", "receded", "jagged", "low"]);
    const mk = (opt) => {
      const h = hairMass(skull, hull, rng, Object.assign({ shape, outer: lock.outer }, opt));
      if (h) {
        h._cx = skull.cx;
        h._cy = skull.cy;
        h._s = skull.s;
        lastMass = h.mass;
      }
      return h;
    };

    if (style === "bald") {
      if (rng.chance(0.6)) {
        const a = pin(skull, { x: -0.22, y: -0.86, z: 0.3 });
        const b = pin(skull, { x: 0.24, y: -0.88, z: 0.28 });
        inkLine(c, rng, a.x, a.y, b.x, b.y, s * 0.011);
      }
      return lastMass;
    }

    if (style === "recede") {
      // hair only survives at the temples and around the back
      const h = mk({ lineY: -0.56, recede: -0.3, bangs: -0.28, puff: 0.055, wob: 0.03 });
      if (h) inkMass(c, rng, h, color, { tone, strays: rng.chance(0.5) ? 6 : 0, edge: 2.3 });
      return lastMass;
    }

    if (style === "buzz") {
      const h = mk({ lineY: -0.5, recede: 0.05, puff: 0.03, wob: 0.03 });
      if (h) {
        inkFill(c, rng, h.mass, PAPER, 1, s * 0.014);
        refibre(c, rng, h.mass);
        inkFill(c, rng, h.mass, color, 0.62, s * 0.014);
        inkPoly(c, rng, h.front, { w: s * 0.019, dry: 0.6 });
        inkPoly(c, rng, h.top, { w: s * 0.014, dry: 1.4 });
      }
      shortTicks(c, rng, skull, -0.5, 44, 0.09);
      return lastMass;
    }

    if (style === "messy") {
      const h = mk({ lineY: -0.5, bangs: 0.06, puff: 0.15, wob: 0.07 });
      if (h) inkMass(c, rng, h, color, { tone, strays: 14, strayLen: 1.5, rag: 3.2 });
      return lastMass;
    }

    if (style === "bowl") {
      const h = mk({ lineY: -0.42, bangs: 0.1, puff: 0.075, wob: 0.025 });
      if (h) {
        inkMass(c, rng, h, color, { tone, strays: 5, rag: 1.4, edge: 2.8 });
        // the fringe hangs in points off the cut line
        for (let i = 2; i < h.front.length - 2; i += 2) {
          const p = h.front[i];
          if (p.z < 0.1 || rng.chance(0.35)) continue;
          inkLine(c, rng, p.x, p.y, p.x + rng.f(-2, 2), p.y + rng.f(s * 0.04, s * 0.1), s * 0.013);
        }
      }
      return lastMass;
    }

    if (style === "spiky") {
      const h = mk({ lineY: -0.5, puff: 0.04, wob: 0.04 });
      if (h) {
        inkMass(c, rng, h, color, { tone, strays: 0 });
        for (let i = 0; i < h.top.length; i += 1) {
          const q = h.top[i];
          const ox = q.x - skull.cx;
          const oy = q.y - skull.cy;
          const len = Math.hypot(ox, oy) || 1;
          const g = rng.f(s * 0.12, s * 0.3);
          inkLine(c, rng, q.x, q.y, q.x + (ox / len) * g + rng.f(-6, 6), q.y + (oy / len) * g, s * rng.f(0.016, 0.026), 2);
        }
      }
      return lastMass;
    }

    if (style === "curly") {
      const h = mk({ lineY: -0.5, bangs: 0.03, puff: 0.09, wob: 0.05 });
      if (h) {
        inkFill(c, rng, h.mass, PAPER, 1, s * 0.012);
        refibre(c, rng, h.mass);
        // a wreath of loops, clipped so it never floats off the head
        c.save();
        c.beginPath();
        h.mass.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.clip();
        const bx = h.mass.map((p) => p.x);
        const by = h.mass.map((p) => p.y);
        const x0 = Math.min(...bx);
        const x1 = Math.max(...bx);
        const y0 = Math.min(...by);
        const y1 = Math.max(...by);
        for (let i = 0; i < 60; i++) {
          inkCirc(c, rng, rng.f(x0, x1), rng.f(y0, y1 + 4), rng.f(s * 0.05, s * 0.11), s * 0.015, rng.chance(0.4));
        }
        c.restore();
        inkPoly(c, rng, h.front, { w: s * 0.022, dry: 0.7 });
        for (let i = 0; i < h.top.length; i += 2) {
          const q = h.top[i];
          inkCirc(c, rng, q.x, q.y, rng.f(s * 0.05, s * 0.1), s * 0.015, rng.chance(0.35));
        }
      }
      return lastMass;
    }

    if (style === "thatch") {
      // no black at all: hair as laid strokes over an open crown
      const h = mk({ lineY: -0.46, recede: rng.f(-0.04, 0.14), sideBias: rng.f(-0.2, 0.2), puff: 0.05, wob: 0.05 });
      if (h) combMass(c, rng, h, { lines: rng.i(30, 54), bow: rng.f(0.06, 0.3), wipe: true });
      return lastMass;
    }

    if (style === "comb") {
      const h = mk({ lineY: -0.5, recede: 0.13, sideBias: rng.sign() * 0.14, puff: 0.065, wob: 0.04 });
      if (h) combMass(c, rng, h, { lines: rng.i(30, 48), bow: rng.f(0.1, 0.34), wipe: true });
      return lastMass;
    }

    if (style === "side") {
      const dir = rng.sign();
      const h = mk({ lineY: -0.5, recede: 0.11, bangs: 0.04, sideBias: dir * 0.26, puff: 0.1, wob: 0.05 });
      if (h) inkMass(c, rng, h, color, { tone, strays: rng.chance(0.55) ? 8 : 0, strayLen: 1.2 });
      return lastMass;
    }

    if (style === "beanie") {
      const h = mk({ lineY: -0.44, bangs: 0.03, puff: 0.2, wob: 0.015, outer: "dome", areaCap: 0.62 });
      if (h) {
        inkMassFill(c, rng, h.mass, color, { bite: s * 0.028 });
        // knit ribbing runs with the dome, not straight down
        c.save();
        c.beginPath();
        h.mass.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.clip();
        combMass(c, rng, h, { lines: 26, bow: 0.1 });
        c.restore();
        inkPoly(c, rng, h.front, { w: s * 0.032, dry: 0.35, passes: 2 });
        inkPoly(c, rng, h.top, { w: s * 0.02, dry: 0.8 });
        if (rng.chance(0.45)) {
          const mid = h.top[Math.floor(h.top.length / 2)];
          if (mid) inkCirc(c, rng, mid.x, mid.y - s * 0.06, s * 0.09, s * 0.016, true);
        }
      }
      return lastMass;
    }

    if (style === "flat") {
      const h = mk({ lineY: -0.46, bangs: 0.02, puff: 0.09, wob: 0.02, outer: "flattop", areaCap: 0.58 });
      if (h) {
        inkMass(c, rng, h, color, { tone, strays: 0, rag: 1.1, edge: 3.2 });
        const brim = brimPts(skull, h, rng.f(0.3, 0.62), rng);
        if (brim) {
          front.push(() => {
            inkMassFill(c, rng, brim, color, { bite: s * 0.026 });
            inkPoly(c, rng, brim, { closed: true, w: s * 0.023, dry: 0.5 });
          });
        }
      }
      return lastMass;
    }

    if (style === "baseball") {
      const h = mk({ lineY: -0.44, puff: 0.15, wob: 0.015, outer: "dome", areaCap: 0.62 });
      if (h) {
        // wipe first: a fill at a third opacity leaves the skull line showing
        // straight through the hat
        inkFill(c, rng, h.mass, PAPER, 1, s * 0.01);
        refibre(c, rng, h.mass);
        inkFill(c, rng, h.mass, color, 0.34, s * 0.01);
        c.save();
        c.beginPath();
        h.mass.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.clip();
        combMass(c, rng, h, { lines: 30, bow: 0.14 });
        c.restore();
        inkPoly(c, rng, h.top, { w: s * 0.019, dry: 0.7 });
        inkPoly(c, rng, h.front, { w: s * 0.03, dry: 0.35, passes: 2 });
        const brim = brimPts(skull, h, rng.f(0.34, 0.7), rng);
        if (brim) {
          front.push(() => {
            inkPoly(c, rng, brim, { closed: true, w: s * 0.026, dry: 0.5 });
            const half = brim.slice(Math.floor(brim.length / 2));
            inkPoly(c, rng, half, { w: s * 0.014, dry: 0.9 });
          });
        }
      }
      return lastMass;
    }

    if (style === "band") {
      // hair first, then a band cutting across it
      const h = mk({ lineY: -0.5, puff: 0.09, wob: 0.05 });
      if (h) inkMass(c, rng, h, color, { tone, strays: rng.chance(0.5) ? 7 : 0, strayLen: 1.3 });
      // Both edges must be sampled over the SAME visible span. Culling each
      // ring independently by depth leaves them ending at different places,
      // and the polygon built from the two crosses itself and floods the face.
      const band = ribbonBetween(skull, -0.5, -0.34, 0.92);
      if (band) {
        inkMassFill(c, rng, band.poly, color, { bite: s * 0.022 });
        inkPoly(c, rng, band.hi, { w: s * 0.02, dry: 0.5 });
        inkPoly(c, rng, band.lo, { w: s * 0.024, dry: 0.4 });
      }
      return lastMass;
    }

    const h = mk({ lineY: -0.5, puff: 0.095, wob: 0.05 });
    if (h) inkMass(c, rng, h, color, { tone, strays: rng.chance(0.5) ? 6 : 0 });
    return lastMass;
  }

  // ---------- features ----------
  function arcInFrame(c, rng, F, ca, cb, ra, rb, a0, a1, w) {
    const n = Math.max(6, Math.round((Math.max(ra, rb) * Math.abs(a1 - a0)) / 3.4));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push(F(ca + Math.cos(a) * ra, cb + Math.sin(a) * rb));
    }
    inkPoly(c, rng, pts, { w });
  }

  function almond(c, rng, p, rx, ry, fill) {
    const n = 12;
    const pts = [];
    // Drawn in the surface frame. The old version squashed by a hand-rolled
    // function of z and stayed screen-horizontal, so an eye on a rolled head
    // sat level while the head leaned.
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 - 0.2 * Math.cos(2 * a);
      const ea = Math.cos(a) * rx * k;
      const eb = Math.sin(a) * ry * k;
      pts.push(p.ax !== undefined ? onSurface(p, ea, eb) : { x: p.x + ea, y: p.y + eb });
    }
    // Paper first, always: the head hoop is already down, and an unfilled
    // almond lets it show through the eye.
    const wipe = pts.map((q) => ({
      x: p.x + (q.x - p.x) * 1.22,
      y: p.y + (q.y - p.y) * 1.22,
    }));
    inkFill(c, rng, wipe, PAPER, 1, 0.25);
    inkFill(c, rng, pts, PAPER, 1, Math.max(0.3, ry * 0.1));
    if (fill) inkFill(c, rng, pts, INK, 1, Math.max(0.5, ry * 0.16));
    inkPoly(c, rng, pts, { closed: true, w: Math.max(0.8, ry * 0.2) });
  }

  function drawEyes(c, rng, skull, type) {
    const lock = lockRng(rng, "eyes");
    const inkL = lockRng(rng, "eyeInkL");
    const inkR = lockRng(rng, "eyeInkR");
    const s = skull.s;
    const fy = skull.faceY || 0;
    const gap = skull.eyeGap ?? 0.36;
    // a pair of eyes is never a pair: different sizes, different heights
    const kL = lock.f(0.62, 1.3);
    const kR = lock.f(0.62, 1.3) * (lock.chance(0.28) ? 1.2 : 1);
    const L = landmark(skull, { x: -gap, y: -0.12 + fy + lock.f(-0.05, 0.03), z: 0.88 });
    const R = landmark(skull, { x: gap, y: -0.12 + fy + lock.f(-0.03, 0.05), z: 0.88 });
    // one rule, everywhere: is this bit of surface facing the viewer
    const showL = L.nz > 0.06;
    const showR = R.nz > 0.06;
    const rx = s * lock.f(0.15, 0.21);
    const ry = s * lock.f(0.085, 0.13);
    const gz = skull.gaze ?? 0;
    const kinds = ["open", "open", "half", "half", "squint", "squint", "closed", "bare", "bare", "dot", "x", "slit", "angry"];
    const k = type === "mix" ? lock.pick(kinds) : type === "wink" ? "open" : type;
    const k2 = type === "wink" ? "slit" : lock.chance(0.3) ? lock.pick(kinds) : k;
    const spec = () => ({
      pupilY: lock.f(-0.06, 0.1),
      lid: lock.chance(0.5),
      lash: lock.chance(0.5),
      closedA0: lock.f(0.15, 0.45),
      closedA1: lock.f(-0.45, -0.15),
      squintR: lock.f(0.022, 0.036),
      halfArch: lock.f(-0.2, 0.2),
      halfW: lock.f(0.022, 0.032),
      bareR: lock.f(0.03, 0.055),
      bareArc: lock.chance(0.6),
    });
    const specL = spec();
    const specR = spec();
    const mole = lock.chance(0.12);

    const eye = (p, kind, kk, sc, ink) => {
      const x = p.x;
      const y = p.y;
      const F = (a, b) => onSurface(p, a, b);
      if (kind === "dot") inkCirc(c, ink, x, y, s * 0.062 * kk, s * 0.018, true);
      else if (kind === "open") {
        almond(c, ink, p, rx * kk, ry * kk, false);
        const pu = F(gz * rx * kk * 0.42, sc.pupilY * ry);
        inkCirc(c, ink, pu.x, pu.y, s * 0.042 * kk, s * 0.013, true);
        if (sc.lid) {
          arcInFrame(c, ink, F, 0, -ry * kk * 0.25, rx * kk * 0.9, ry * kk * 0.9, Math.PI + 0.35, -0.35, s * 0.016);
        }
      } else if (kind === "closed") {
        arcInFrame(c, ink, F, 0, 0, rx * kk * 0.9, ry * kk * 1.1, Math.PI + sc.closedA0, sc.closedA1, s * 0.019);
        if (sc.lash) { const q0 = F(-rx * kk * 0.5, s * 0.02), q1 = F(-rx * kk * 0.75, s * 0.05); inkLine(c, ink, q0.x, q0.y, q1.x, q1.y, s * 0.012); }
      } else if (kind === "squint") {
        arcInFrame(c, ink, F, 0, ry * kk * 0.5, rx * kk, ry * kk, Math.PI + 0.4, -0.4, s * 0.02);
        arcInFrame(c, ink, F, 0, -ry * kk * 0.5, rx * kk, ry * kk, 0.45, Math.PI - 0.45, s * 0.017);
        const pq = F(gz * rx * kk * 0.3, 0);
        inkCirc(c, ink, pq.x, pq.y, s * sc.squintR * kk, s * 0.012, true);
      } else if (kind === "half") {
        almond(c, ink, p, rx * kk, ry * kk, false);
        const ph = F(gz * rx * kk * 0.4, ry * kk * 0.2);
        inkCirc(c, ink, ph.x, ph.y, s * 0.04 * kk, s * 0.013, true);
        inkPoly(c, ink, [
          F(-rx * kk * 1.05, -ry * kk * 0.5),
          F(0, -ry * kk * (0.95 + sc.halfArch)),
          F(rx * kk * 1.05, -ry * kk * 0.45),
        ], { w: s * sc.halfW, dry: 0.35 });
      } else if (kind === "bare") {
        inkCirc(c, ink, x, y, s * sc.bareR * kk, s * 0.016, true);
        if (sc.bareArc) inkArc(c, ink, x, y - ry * kk * 0.4, rx * kk * 0.8, Math.PI + 0.5, -0.5, s * 0.016);
      } else if (kind === "x") {
        const r = s * 0.1;
        { const q0 = F(-r, -r), q1 = F(r, r); inkLine(c, ink, q0.x, q0.y, q1.x, q1.y, s * 0.017); }
        { const q0 = F(-r, r), q1 = F(r, -r); inkLine(c, ink, q0.x, q0.y, q1.x, q1.y, s * 0.017); }
      } else if (kind === "slit") {
        { const q0 = F(-s * 0.15, 0), q1 = F(s * 0.15, 0); inkLine(c, ink, q0.x, q0.y, q1.x, q1.y, s * 0.018); }
      } else if (kind === "angry") {
        { const q0 = F(-s * 0.16, -s * 0.09), q1 = F(s * 0.12, -s * 0.02); inkLine(c, ink, q0.x, q0.y, q1.x, q1.y, s * 0.018); }
        { const q0 = F(-s * 0.1, s * 0.05), q1 = F(s * 0.1, s * 0.05); inkLine(c, ink, q0.x, q0.y, q1.x, q1.y, s * 0.014); }
      }
    };

    if (type === "glasses") {
      if (showL) inkCirc(c, inkL, L.x, L.y, s * 0.2 * kL, s * 0.017);
      if (showR) inkCirc(c, inkR, R.x, R.y, s * 0.2 * kR, s * 0.017);
      if (showL && showR) inkLine(c, inkL, L.x + s * 0.2, L.y, R.x - s * 0.2, R.y, s * 0.014);
      if (showL) inkLine(c, inkL, L.x - s * 0.2, L.y, L.x - s * 0.34, L.y - s * 0.05, s * 0.013);
      if (showR) inkLine(c, inkR, R.x + s * 0.2, R.y, R.x + s * 0.34, R.y - s * 0.05, s * 0.013);
      if (showL) inkCirc(c, inkL, L.x, L.y, s * 0.048, s * 0.012, true);
      if (showR) inkCirc(c, inkR, R.x, R.y, s * 0.048, s * 0.012, true);
      return;
    }

    if (type === "shades") {
      if (showL) almond(c, inkL, L, s * 0.17, s * 0.1, true);
      if (showR) almond(c, inkR, R, s * 0.17, s * 0.1, true);
      if (showL && showR) inkLine(c, inkL, L.x + s * 0.16, L.y, R.x - s * 0.16, R.y, s * 0.015);
      return;
    }

    if (type === "patch") {
      const near = L.z >= R.z ? L : R;
      const far = L.z >= R.z ? R : L;
      const farInk = far === L ? inkL : inkR;
      const nearInk = near === L ? inkL : inkR;
      if (far.z > 0.02) eye(far, "open", 1, far === L ? specL : specR, farInk);
      if (near.z > -0.05) {
        almond(c, nearInk, near, s * 0.18, s * 0.12, true);
        const strap = pin(skull, { x: near === R ? 0.78 : -0.78, y: -0.24, z: 0.28 });
        inkLine(c, nearInk, near.x, near.y, strap.x, strap.y, s * 0.016);
      }
      return;
    }

    if (showL) eye(L, k, kL, specL, inkL);
    if (showR) eye(R, k2, kR, specR, inkR);

    if (mole) {
      const p = showL ? L : R;
      const ink = showL ? inkL : inkR;
      inkCirc(c, ink, p.x + s * 0.02, p.y + s * 0.2, s * 0.014, s * 0.01, true);
      inkCirc(c, ink, p.x + s * 0.01, p.y + s * 0.32, s * 0.012, s * 0.01, true);
    }
  }

  function drawBrows(c, rng, skull, style) {
    if (style === "none") return;
    const lock = lockRng(rng, "brows");
    const inkL = lockRng(rng, "browInkL");
    const inkR = lockRng(rng, "browInkR");
    const s = skull.s;
    const hL = lock.f(-0.06, 0.02);
    const hR = lock.f(-0.02, 0.07);
    const wL = s * lock.f(0.028, 0.042);
    const wR = s * lock.f(0.028, 0.042);
    const brow = (side, h, w, ink) => {
      const p = landmark(skull, { x: (skull.eyeGap ?? 0.36) * side, y: -0.3 + (skull.faceY || 0) + h, z: 0.86 });
      if (p.nz < 0.06) return;
      const lift = style === "angry" ? s * 0.08 * side : style === "arch" ? -s * 0.06 : 0;
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const arch = style === "arch" ? -Math.sin(t * Math.PI) * s * 0.05 : 0;
        pts.push(onSurface(p, (t - 0.5) * s * 0.32, lift * (1 - t * 1.4) + arch));
      }
      inkPoly(c, ink, pts, { w, dry: 0.4 });
    };
    brow(-1, hL, wL, inkL);
    brow(1, hR, wR, inkR);
  }

  // ---------- the nose ----------
  // One heavy gesture from the brow to the tip. This is the mark that owns
  // the face: longer, blacker and more committed than anything else on it.
  // Everything else is a bystander.
  // ---------- the nose ----------
  // Catalogued off every reference plate. What was wrong before:
  //
  //   * it was one line. His are usually TWO — a wedge or a narrow column —
  //     with the base a separate mark across the bottom.
  //   * it started at the brow. His often start at the hairline and run
  //     45-70% of the way to the chin.
  //   * the base hooked to a random side. In every turned head the tip
  //     protrudes toward the near side and the nostril hooks BACK INTO the
  //     face. Getting that backwards is what made ours feel inside out.
  function drawNose(c, rng, skull, style, heavy, hold) {
    const lock = lockRng(rng, "nose");
    const s = skull.s;
    // The nose is never the darkest mark on the face. The head outline runs
    // s*0.03; this stays under it, and takes one pass, not two.
    const w = s * 0.026 * Math.min(1.2, heavy ?? 1);
    const fy = skull.faceY || 0;

    // Where a nose starts is not a fact about the skull, it is a fact about
    // this face: it has to begin between the eyes that were actually drawn.
    // Anchored to its own point on the skull — y -0.22, half a brow above the
    // eye line at y -0.12, and a good deal deeper at z 0.72 — it began above
    // the eyes as often as below them, and it swung by a different amount to
    // them on a turned head because it was pinned further back. On a face
    // under a low brim that put the top of the bridge in the hat, with the one
    // visible eye stranded out to the side of it.
    //
    // So it is pinned to the eye landmarks themselves, at the same depth they
    // are, computed the same way they are and without touching the random
    // stream — the same dude comes out, with his nose on his face.
    const egap = skull.eyeGap ?? 0.36;
    const eL = landmark(skull, { x: -egap, y: -0.12 + fy, z: 0.88 });
    const eR = landmark(skull, { x: egap, y: -0.12 + fy, z: 0.88 });
    const browRef = { x: (eL.x + eR.x) * 0.5, y: (eL.y + eR.y) * 0.5 };
    const chinP = skull.project({ x: 0, y: 0.95, z: 0.4 });
    let ax = chinP.x - browRef.x;
    let ay = chinP.y - browRef.y;
    const faceLen = Math.hypot(ax, ay) || 1;
    ax /= faceLen;
    ay /= faceLen;

    const tilt = lock.f(0.05, 0.2) * lock.sign();
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const tx = ax * ct - ay * st;
    ay = ax * st + ay * ct;
    ax = tx;

    // He starts the nose at the brow or just under it — never up the
    // forehead — and stops it well clear of the chin.
    const head = faceLen * lock.f(0.0, 0.13);
    const browP = { x: browRef.x + ax * head, y: browRef.y + ay * head };
    // 50-80% of brow-to-chin, two draws averaged so it piles up near 65%
    let drop = faceLen * (lock.f(0.5, 0.8) + lock.f(0.56, 0.74)) * 0.5;
    drop = Math.max(faceLen * 0.34, Math.min(drop, faceLen * 0.86 - head));
    const proj = lock.f(0.35, 0.95);

    const q0 = skull.project({ x: 0, y: -0.02 + fy, z: 0.72 });
    const q1 = skull.project({ x: 0, y: -0.02 + fy, z: 1.34 });
    const outX = q1.x - q0.x;
    const outY = q1.y - q0.y;
    // lat is measured in the face's own left, not in screen-x. The long
    // edge is the OUTSIDE of the turn — the contour the face is pointing
    // at — so "near" is whichever lat points the same way the tip does.
    const px0 = -ay;
    const py0 = ax;
    const latDot = outX * px0 + outY * py0;
    // The long edge is the outside of the turn. A tiny threshold made
    // `near` flip every time a walk or a look ticked the head through
    // face-on, so the hook jumped sides — or collapsed into a crack and
    // the paper cover wiped it. Hold the last side until the tip is
    // clearly the other way.
    const outLen = Math.hypot(outX, outY);
    const flip = s * 0.07;
    if (hold && hold._noseNear == null) {
      hold._noseNear = Math.abs(latDot) > s * 0.02
        ? Math.sign(latDot)
        : (Math.abs(skull.yaw) > 0.08 ? Math.sign(skull.yaw) : lock.sign());
    } else if (hold && Math.abs(latDot) > flip && Math.sign(latDot) !== hold._noseNear) {
      hold._noseNear = Math.sign(latDot);
    }
    const near = (hold && hold._noseNear) || (Math.abs(latDot) > s * 0.02 ? Math.sign(latDot) : lock.sign());
    const back = -near;
    const off = lock.f(-0.035, 0.035) * s + near * s * lock.f(0.02, 0.12);

    const A = (t, lat) => {
      const px = px0;
      const py = py0;
      const g = Math.max(0, Math.min(1, t / (drop || 1)));
      const pr = Math.pow(g, 1.7) * proj;
      return {
        x: browP.x + ax * t + px * (lat + off) + outX * pr,
        y: browP.y + ay * t + py * (lat + off) + outY * pr,
      };
    };

    if (style === "none") return { ax, ay, browP, base: drop, outer: null };

    // Face-on, the tip has nothing to project: a profile hook becomes a
    // crack, and the cover pass wipes it. Draw the knuckle instead.
    const drawStyle = (outLen < s * 0.055 && style !== "nostrils") ? "silhouette" : style;

    let outer = null;
    let bottom = drop;
    const nostril = (p, r) => inkCirc(c, rng, p.x, p.y, s * r, w * 0.45, lock.chance(0.45));
    // A wash behind the head shows through a nose that is only a stroke.
    // Plug the volume with paper first — same flesh as the rest of the potato —
    // then the ink sits on top.
    let plugged = false;
    const plug = (run) => {
      if (plugged || !run || run.length < 2) return;
      const face = { x: browP.x * 0.4 + skull.cx * 0.6, y: browP.y * 0.75 + skull.cy * 0.25 };
      inkFill(c, rng, [face].concat(run), PAPER, 1, 0.45);
      refibre(c, rng, [face].concat(run));
      plugged = true;
    };
    const paint = (run, opt) => {
      plug(run);
      inkPoly(c, rng, run, opt);
    };

    // The move that makes a nose out of a stick: a hard corner at the tip and
    // a real run back into the face, a third to a half of the bridge length,
    // finished with an event. His base is never a token flick.
    const baseRun = drop * lock.f(0.34, 0.58);
    const foot = (lead, run) => {
      const pts = [
        A(drop + s * lock.f(0.0, 0.035), lead + back * run * 0.5),
        A(drop + s * lock.f(-0.01, 0.02), lead + back * run),
      ];
      const end = lock.f(0, 1);
      if (end < 0.45) {
        pts.push(A(drop - s * lock.f(0.05, 0.11), lead + back * run * lock.f(0.85, 1.05))); // far wing flicks up
      } else if (end < 0.75) {
        pts.push(A(drop + s * lock.f(0.03, 0.07), lead + back * run * 0.72)); // or curls into a bulb
        pts.push(A(drop - s * lock.f(0.0, 0.03), lead + back * run * 0.5));
      }
      return pts;
    };

    if (drawStyle === "wedge") {
      // narrow at the top, WIDE at the base — the base is most of the shape
      const top = A(0, back * s * lock.f(0.0, 0.035));
      const wideB = Math.max(baseRun, drop * lock.f(0.4, 0.62));
      const leadRun = [top, A(drop * 0.55, near * wideB * lock.f(0.12, 0.3)), A(drop, near * wideB * lock.f(0.35, 0.5))];
      leadRun.push(A(drop + s * lock.f(0.0, 0.04), near * wideB * 0.1));
      leadRun.push(A(drop + s * lock.f(-0.01, 0.02), back * wideB * lock.f(0.45, 0.7)));
      if (lock.chance(0.55)) leadRun.push(A(drop - s * lock.f(0.05, 0.1), back * wideB * lock.f(0.5, 0.7)));
      paint(leadRun, { w, dry: 0.3, doubled: lock.chance(0.25) });
      // the far edge exists only in the lower half, never as a mirrored leg
      if (lock.chance(0.6)) {
        inkPoly(c, rng, [A(drop * lock.f(0.3, 0.5), back * wideB * lock.f(0.1, 0.25)), A(drop * lock.f(0.88, 1.0), back * wideB * lock.f(0.4, 0.62))], {
          w: w * lock.f(0.55, 0.8),
          dry: 0.65,
        });
      }
      if (lock.chance(0.5)) nostril(A(drop - s * 0.02, back * wideB * 0.45), lock.f(0.015, 0.026));
      outer = leadRun;
    } else if (drawStyle === "column") {
      // a squared U with unequal legs: a long near side, a base, and a far
      // side that only exists in the bottom third
      const gap = s * lock.f(0.045, 0.085);
      const run = [A(0, near * gap * 0.4), A(drop * 0.5, near * gap * lock.f(0.8, 1.15)), A(drop, near * gap)];
      const runB = baseRun * lock.f(0.9, 1.2) + gap;
      run.push(A(drop + s * lock.f(0.0, 0.03), near * gap + back * runB * 0.55));
      run.push(A(drop + s * lock.f(-0.01, 0.02), near * gap + back * runB));
      run.push(A(drop * lock.f(0.6, 0.78), near * gap + back * runB * lock.f(0.9, 1.05)));
      paint(run, { w, dry: 0.3, doubled: lock.chance(0.2) });
      if (lock.chance(0.5)) nostril(A(drop - s * 0.02, near * gap + back * runB * 0.75), lock.f(0.014, 0.026));
      outer = run;
    } else if (drawStyle === "hook") {
      const bend = lock.f(0.03, 0.09) * s * near;
      const run = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        run.push(A(drop * u, bend * Math.sin(u * Math.PI * 0.75)));
      }
      // the beak drops past the base line and curls back under itself
      run.push(A(drop + s * lock.f(0.05, 0.1), bend + near * s * lock.f(0.0, 0.03)));
      run.push(A(drop + s * lock.f(0.03, 0.08), bend + back * baseRun * 0.6));
      run.push(A(drop - s * lock.f(0.0, 0.04), bend + back * baseRun * lock.f(0.9, 1.15)));
      paint(run, { w, dry: 0.25, doubled: lock.chance(0.25) });
      if (lock.chance(0.6)) nostril(run[run.length - 1], lock.f(0.015, 0.028));
      bottom = drop + s * 0.1;
      outer = run;
    } else if (drawStyle === "snub") {
      // a tip that is drawn round, not a stick with a dot under it
      const d2 = drop * lock.f(0.72, 0.88);
      const r = Math.max(s * 0.085, d2 * lock.f(0.3, 0.42));
      const run = [A(0, 0), A(d2 * 0.6, near * s * 0.02), A(d2, near * s * lock.f(0.02, 0.06))];
      run.push(A(d2 + r * 0.55, near * s * 0.02));
      run.push(A(d2 + r * 0.62, back * r * 0.55));
      run.push(A(d2 + r * 0.2, back * r * lock.f(0.85, 1.05)));
      if (lock.chance(0.5)) run.push(A(d2 - r * 0.15, back * r * lock.f(0.8, 1.0)));
      paint(run, { w: w * lock.f(0.85, 1.05), dry: 0.35, doubled: lock.chance(0.2) });
      if (lock.chance(0.45)) nostril(A(d2 + r * 0.3, back * r * 0.45), lock.f(0.013, 0.022));
      bottom = d2 + r * 0.7;
      outer = run;
    } else if (drawStyle === "nostrils") {
      // barely a nose: a hint of bridge and two unmatched marks
      if (lock.chance(0.7)) inkPoly(c, rng, [A(drop * 0.35, 0), A(drop * 0.9, near * s * 0.02)], { w: w * 0.5, dry: 0.9 });
      nostril(A(drop, near * s * lock.f(0.05, 0.1)), lock.f(0.022, 0.036));
      if (lock.chance(0.7)) nostril(A(drop - s * lock.f(0.02, 0.06), back * s * lock.f(0.02, 0.05)), lock.f(0.012, 0.022));
      // always a mark under them: two dots alone read as a pair of holes
      inkPoly(c, rng, [A(drop + s * 0.015, near * s * 0.04), A(drop + s * lock.f(0.0, 0.03), back * baseRun * lock.f(0.4, 0.7))], { w: w * 0.6, dry: 0.75 });
      outer = null;
    } else if (drawStyle === "silhouette") {
      // Too frontal for the contour to carry it, so he draws the knuckle
      // head-on: a short bridge and a broad blunt base.
      const d2 = drop * lock.f(0.62, 0.8);
      const bend = lock.f(0.0, 0.04) * s * near;
      const wideB = d2 * lock.f(0.45, 0.7);
      const run = [A(0, bend * 0.3), A(d2 * 0.55, bend), A(d2, bend + near * s * lock.f(0.01, 0.04))];
      run.push(A(d2 + s * lock.f(0.02, 0.055), bend + near * s * 0.01));
      run.push(A(d2 + s * lock.f(0.01, 0.04), bend + back * wideB * 0.6));
      run.push(A(d2 - s * lock.f(0.0, 0.05), bend + back * wideB * lock.f(0.9, 1.1)));
      paint(run, { w, dry: 0.3, doubled: lock.chance(0.3) });
      if (lock.chance(0.55)) nostril(A(d2 + s * 0.01, bend + back * wideB * 0.55), lock.f(0.016, 0.03));
      bottom = d2 + s * 0.06;
      outer = run;
    } else {
      // the plain one, and still one stroke: down, hard corner, back into the
      // face, out. A bare vertical with a token foot is the thing that reads
      // as a crack in the paper rather than a nose.
      const bend = lock.f(0.01, 0.055) * s * near;
      const run = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        run.push(A(drop * u, bend * Math.sin(u * Math.PI * 0.85)));
      }
      for (const p of foot(bend, baseRun)) run.push(p);
      paint(run, { w, dry: 0.28, doubled: lock.chance(0.22) });
      if (lock.chance(0.45)) nostril(A(drop - s * 0.01, bend + back * baseRun * lock.f(0.55, 0.9)), lock.f(0.015, 0.028));
      // the near wing: a short tick, never a mirror of the base
      if (lock.chance(0.3)) {
        inkPoly(c, rng, [A(drop - s * lock.f(0.04, 0.09), bend + near * s * lock.f(0.02, 0.05)), A(drop + s * 0.01, bend)], { w: w * 0.6, dry: 0.8 });
      }
      outer = run;
    }

    return { ax, ay, browP, base: bottom + s * 0.05, outer, bump: null };
  }

  function drawMouth(c, rng, skull, style, nose) {
    const lock = lockRng(rng, "mouth");
    const s = skull.s;
    const fy = (skull.faceY || 0) * 0.5;
    // The mouth gets a real surface frame, then keeps it while its POSITION
    // is moved to sit under whatever nose this face got. Before, it was a
    // set of screen-horizontal arcs that stayed level on a rolled head.
    const ML = landmark(skull, { x: lock.f(-0.06, 0.06), y: lock.f(0.54, 0.68) + fy, z: 0.78 });
    if (nose) {
      // Sit clearly under the nose, not on it — coverNose used to swallow
      // a mouth that shared the nose's base and leave a vertical stroke.
      const gap = s * lock.f(0.28, 0.52);
      const off = s * lock.f(-0.06, 0.06);
      const q = skull.limit(
        skull.deform({
          x: nose.browP.x + nose.ax * (nose.base + gap) - nose.ay * off,
          y: nose.browP.y + nose.ay * (nose.base + gap) + nose.ax * off,
        }),
        s * 0.14
      );
      ML.x = q.x;
      ML.y = q.y;
      // Width runs across the face (perp. to the nose), never along it.
      // Using the skull's u-axis here is what turned profile mouths into
      // vertical lines when that axis lined up with the nose.
      const dx = nose.ax;
      const dy = nose.ay;
      const dl = Math.hypot(dx, dy) || 1;
      ML.bx = dx / dl;
      ML.by = dy / dl;
      ML.ax = -ML.by;
      ML.ay = ML.bx;
      ML.ra = 1;
      ML.rb = 1;
    }
    const w = s * lock.f(0.03, 0.048);
    // In profile the mouth is a short lip, not a full-width smile flung
    // into depth. Foreshorten by how much the face still faces us.
    const faceOn = Math.max(0.28, Math.min(1, Math.abs(ML.nz) * 1.05 + 0.12));
    const wide = s * lock.f(0.16, 0.28) * faceOn;
    const openH = [];
    for (let i = 0; i <= 12; i++) openH.push(lock.f(0.1, 0.15));
    const hasTeeth = lock.chance(0.55);
    const toothN = lock.i(2, 4);
    const toothH = [];
    for (let i = 0; i < 6; i++) toothH.push(lock.f(0.02, 0.05));
    const fillOpen = lock.chance(0.5);
    const teethN = lock.i(3, 6);
    const lineA = lock.f(-2, 2);
    const lineB = lock.f(0.0, 0.05);
    const lineC = lock.f(-2, 3);
    const teethH = lock.f(0.1, 0.16);
    const puckerR = lock.f(0.05, 0.085);
    const plain = [lock.f(0.7, 1.0), lock.f(-1, 2), lock.f(-0.03, 0.05), lock.f(-2, 2), lock.f(0.6, 1.0), lock.f(-3, 2)];
    const corner = lock.chance(0.3);
    const cornerSide = lock.sign();
    const cornerA = lock.f(0.11, 0.19);
    const cornerY0 = lock.f(-2, 1);
    const cornerY1 = lock.f(0.03, 0.08);
    if (ML.nz < -0.1) return;
    const F = (a, b) => onSurface(ML, a, b);
    const x = ML.x;
    const y = ML.y;
    if (style === "smile") {
      arcInFrame(c, rng, F, 0, -s * 0.05, wide, wide * 0.8, 0.3, Math.PI - 0.3, w);
    } else if (style === "frown") {
      arcInFrame(c, rng, F, 0, s * 0.2, wide * 0.9, wide * 0.75, Math.PI + 0.3, -0.3, w);
    } else if (style === "open") {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        pts.push(F(Math.cos(a) * wide * 0.62, Math.sin(a) * s * openH[i]));
      }
      inkPoly(c, rng, pts, { closed: true, w, dry: 0.4 });
      if (hasTeeth) {
        for (let i = 1; i < toothN; i++) {
          const tx = x - wide * 0.5 + (i / toothN) * wide;
          const t0 = F(tx - x, -s * 0.09), t1 = F(tx - x, -s * toothH[i]);
          inkLine(c, rng, t0.x, t0.y, t1.x, t1.y, w * 0.6);
        }
      } else if (fillOpen) {
        inkMassFill(c, rng, pts, INK, { bite: s * 0.02 });
      }
    } else if (style === "teeth") {
      inkPoly(c, rng, [F(-wide, lineA), F(0, -s * lineB), F(wide, lineC)], { w, dry: 0.4 });
      for (let i = 1; i < teethN; i++) {
        const tx = x - wide * 0.8 + (i / teethN) * wide * 1.6;
        const u0 = F(tx - x, s * 0.01), u1 = F(tx - x + (toothH[i] - 0.035) * 40, s * (0.06 + toothH[i]));
        inkLine(c, rng, u0.x, u0.y, u1.x, u1.y, w * 0.55);
      }
      inkPoly(c, rng, [F(-wide * 0.85, s * 0.02), F(0, s * teethH), F(wide * 0.85, s * 0.03)], { w: w * 0.8, dry: 0.5 });
    } else if (style === "smirk") {
      inkPoly(c, rng, [F(-wide * 0.85, s * 0.05), F(s * 0.04, -s * 0.01), F(wide * 0.9, -s * 0.09)], { w, dry: 0.4 });
    } else if (style === "lips") {
      inkPoly(c, rng, [F(-wide * 0.9, 0), F(-wide * 0.28, -s * 0.045), F(wide * 0.2, -s * 0.03), F(wide * 0.9, s * 0.01)], { w: w * 1.25, dry: 0.35 });
      arcInFrame(c, rng, F, 0, s * 0.01, wide * 0.8, wide * 0.6, 0.3, Math.PI - 0.3, w * 0.75);
    } else if (style === "pucker") {
      inkCirc(c, rng, x, y, s * puckerR, w, false);
      { const a0 = F(-s * 0.14, -s * 0.02), a1 = F(-s * 0.06, 0); inkLine(c, rng, a0.x, a0.y, a1.x, a1.y, w * 0.6); }
      { const b0 = F(s * 0.06, 0), b1 = F(s * 0.14, -s * 0.03); inkLine(c, rng, b0.x, b0.y, b1.x, b1.y, w * 0.6); }
    } else {
      inkPoly(c, rng, [F(-wide * plain[0], plain[1]), F(s * plain[2], plain[3]), F(wide * plain[4], plain[5])], { w, dry: 0.4 });
    }
    if (corner) {
      const ca = cornerSide * s * cornerA;
      const c0 = onSurface(ML, ca, cornerY0);
      const c1 = onSurface(ML, ca + cornerSide * s * 0.04, s * cornerY1);
      inkLine(c, rng, c0.x, c0.y, c1.x, c1.y, w * 0.7);
    }
  }

  function drawFacialHair(c, rng, skull, style) {
    if (style === "none") return;
    const lock = lockRng(rng, "beard");
    const s = skull.s;
    if (style === "stache") {
      const L = pin(skull, { x: -0.28, y: 0.46, z: 0.88 });
      const R = pin(skull, { x: 0.28, y: 0.46, z: 0.88 });
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const x = L.x + (R.x - L.x) * t;
        const y = L.y + (R.y - L.y) * t + Math.sin(t * Math.PI) * s * 0.035;
        const dx = lock.f(s * 0.03, s * 0.09);
        const dy = lock.f(-2, 3);
        const ww = s * lock.f(0.015, 0.023);
        inkLine(c, rng, x - s * 0.02, y, x + dx, y + dy, ww);
      }
    } else if (style === "goatee") {
      const a = pin(skull, { x: -0.13, y: 0.66, z: 0.74 });
      const b = pin(skull, { x: 0.13, y: 0.66, z: 0.74 });
      const d = pin(skull, { x: 0, y: 1.02, z: 0.5 });
      inkMassFill(c, rng, [a, b, d], INK, { bite: s * 0.035 });
      inkPoly(c, rng, [a, b, d], { closed: true, w: s * 0.016, dry: 1.3 });
    } else if (style === "beard") {
      const mass = [];
      for (let i = 0; i < 16; i++) {
        const a = -1.2 + (i / 15) * 2.4;
        const p = pin(skull, { x: Math.sin(a) * 0.62, y: 0.52 + Math.cos(a) * 0.22, z: 0.5 });
        if (p.z > -0.3) mass.push(p);
      }
      const chin = pin(skull, { x: 0, y: 1.08, z: 0.32 });
      mass.push(chin);
      if (mass.length > 3) {
        inkMassFill(c, rng, mass, INK, { bite: s * 0.04 });
        inkPoly(c, rng, mass, { closed: true, w: s * 0.016, dry: 1.4 });
      }
    } else if (style === "stubble") {
      for (let i = 0; i < 34; i++) {
        const px = lock.f(-0.48, 0.48);
        const py = lock.f(0.4, 0.9);
        const dx = lock.f(-1.6, 1.6);
        const dy = lock.f(1, 3.5);
        const p = pin(skull, { x: px, y: py, z: 0.58 });
        if (p.z > 0) inkLine(c, rng, p.x, p.y, p.x + dx, p.y + dy, s * 0.009);
      }
    }
  }

  // ---------- body ----------
  // Drawn the way a person draws a person: one outline round the whole
  // figure — neck, shoulder, down the arm, round the hand, back up, down the
  // side, down the leg, round the shoe and back — then clothes cut into it.
  // A torso box with tube limbs stuck on is the thing that reads as assembly.

  // Two lines drawn down a limb by hand never stay parallel. Offsetting one
  // centreline gives a machine-perfect constant gap, which is the thing that
  // makes an arm read as a stroked path instead of a drawing.
  function edgeOf(pts, r, side, seed = 0) {
    const N = normals(pts);
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1 || 1);
      const j = fbm2(t * 3.6 + seed * 0.7, seed * 1.3 + 4, 3301 + ((seed * 37) | 0)) - 0.5;
      const j2 = fbm2(t * 9.1 + seed, seed * 0.4 + 9, 5507 + ((seed * 11) | 0)) - 0.5;
      const rr = (typeof r === "function" ? r(t) : r) * (1 + j * 0.44 + j2 * 0.16);
      out.push({ x: pts[i].x + N[i].x * rr * side, y: pts[i].y + N[i].y * rr * side });
    }
    return out;
  }

  // an arc with a hand's radius, not a compass's
  function arcPts(x, y, r, a0, a1, rng) {
    const n = Math.max(6, Math.round((r * Math.abs(a1 - a0)) / 4));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      const rr = r * (1 + (fbm2(i * 0.4, r * 0.03, rng.seed + 13) - 0.5) * 0.22);
      out.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * rng.f(0.95, 1.05) });
    }
    return out;
  }

  function bezier(a, b, cpts, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      out.push({
        x: u * u * a.x + 2 * u * t * cpts.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * cpts.y + t * t * b.y,
      });
    }
    return out;
  }

  // Even a bad doodle has hands. An arm that just stops is the loudest
  // omission on the figure.
  function hand(c, rng, S, r, side, s) {
    const tip = S[S.length - 1];
    const prev = S[Math.max(0, S.length - 3)];
    let dx = tip.x - prev.x;
    let dy = tip.y - prev.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const nx = -dy;
    const ny = dx;
    const pr = r * rng.f(1.7, 2.4);
    const c0 = { x: tip.x + dx * pr * 0.5, y: tip.y + dy * pr * 0.5 };
    const pts = [];
    const nF = rng.i(2, 3);
    for (let i = 0; i <= nF; i++) {
      const t = i / nF;
      const a = -Math.PI * 0.52 + t * Math.PI * 1.04;
      const rr = pr * (1 + Math.sin(t * Math.PI * nF) * 0.12);
      pts.push({
        x: c0.x + (nx * Math.cos(a) + dx * Math.sin(a)) * rr * side,
        y: c0.y + (ny * Math.cos(a) + dy * Math.sin(a)) * rr,
      });
    }
    inkPoly(c, rng, [{ x: tip.x - nx * r * side, y: tip.y - ny * r }].concat(pts).concat([
      { x: tip.x + nx * r * side, y: tip.y + ny * r },
    ]), { w: s * 0.026, dry: 0.9, wobble: s * 0.025 });
    // At most one knuckle tick. Several of them, on a hand this size, bunch
    // into a solid knot that reads as a ball joint rather than a hand.
    if (rng.chance(0.55)) {
      const q = pts[rng.i(1, Math.max(1, nF - 1))];
      inkLine(c, rng, q.x, q.y, c0.x + (q.x - c0.x) * 0.3, c0.y + (q.y - c0.y) * 0.3, s * 0.016);
    }
  }

  // Fat, leg length and muscle are the person's, the way the haircut is.
  // They are picked once when he is made. Drawing them off the body stream
  // meant a still spin that reused a spent generator rolled a new man every
  // frame — fat, then thin, then long-legged — which is the opposite of a
  // body.
  function makeBodyPlan(rng, person) {
    const fatKind = person && person.build === "heavy"
      ? rng.pick(["ordinary", "fat", "fat", "fat"])
      : person && person.build === "slight"
        ? rng.pick(["thin", "thin", "thin", "ordinary"])
        : rng.pick(["thin", "ordinary", "ordinary", "ordinary", "fat"]);
    const legsKind = rng.pick(["short", "short", "ordinary", "ordinary", "long", "long"]);
    const muscleKind = person && person.build === "heavy"
      ? rng.pick(["ordinary", "big", "big"])
      : person && person.build === "slight"
        ? rng.pick(["skinny", "skinny", "ordinary"])
        : rng.pick(["skinny", "ordinary", "ordinary", "big"]);

    const fat = fatKind === "thin" ? rng.f(0.02, 0.22)
      : fatKind === "fat" ? rng.f(0.78, 1)
      : rng.f(0.38, 0.6);
    const muscle = muscleKind === "skinny" ? rng.f(0.02, 0.22)
      : muscleKind === "big" ? rng.f(0.78, 1)
      : rng.f(0.38, 0.6);
    const legAmt = legsKind === "short" ? rng.f(0.02, 0.22)
      : legsKind === "long" ? rng.f(0.78, 1)
      : rng.f(0.38, 0.6);

    const shW = 0.7 + muscle * 0.62 + fat * 0.16;
    const hipW = 0.5 + fat * 0.78 + muscle * 0.06;
    const waist = 0.58 + fat * 0.92 - muscle * 0.1;
    const torso = (person && person.age === "old" ? 1.62 : 1.72) + fat * 0.28;
    const legs = 1.22 + legAmt * 1.32;
    const armW = 0.125 + muscle * 0.175 + fat * 0.03;
    const chestZ = 0.2 + fat * 0.32 + muscle * 0.18;
    const belly = fat * 0.38;
    const shY = rng.f(0.34, 0.5);
    const hipY = torso;
    const kneeT = rng.f(0.48, 0.55);
    const midW = (shW + hipW) * 0.5 * waist;
    const neckW = rng.f(0.15, 0.21);
    const old = person && person.age === "old";

    return {
      fatKind,
      legsKind,
      muscleKind,
      fat,
      muscle,
      shW,
      hipW,
      waist,
      midW,
      torso,
      legs,
      armW,
      chestZ,
      belly,
      shY,
      hipY,
      kneeY: hipY + legs * kneeT,
      footY: hipY + legs,
      neckW,
      shrug: rng.f(-0.1, 0.14),
      slope: rng.f(-0.12, 0.22),
      asymL: rng.f(0.9, 1.1),
      asymR: rng.f(0.9, 1.1),
      tilt: rng.f(-0.08, 0.08) + (old ? rng.f(0.02, 0.08) : 0),
      stance: rng.f(-0.18, 0.22),
      spread: rng.f(0.82, 1.28),
      waistT: rng.f(0.44, 0.64),
      waistJL: rng.f(0.96, 1.04),
      waistJR: rng.f(0.96, 1.04),
      shoeKind: rng.pick(["wedge", "round", "boot", "square", "round"]),
      toe: rng.f(0.22, 0.36),
      heel: rng.f(0.07, 0.11),
      shoeH: rng.f(0.08, 0.13),
      swingL: rng.f(-0.14, 0.2),
      swingR: rng.f(-0.14, 0.2),
      elbowOutL: rng.f(0.02, 0.12),
      elbowOutR: rng.f(0.02, 0.12),
      elbowYL: rng.f(0.68, 0.92),
      elbowYR: rng.f(0.68, 0.92),
      handOutL: rng.f(-0.02, 0.18),
      handOutR: rng.f(-0.02, 0.18),
      handYL: rng.f(1.44, 1.82),
      handYR: rng.f(1.44, 1.82),
      hipKL: rng.f(0.5, 0.6),
      hipKR: rng.f(0.5, 0.6),
      kneeJL: rng.f(-0.06, 0.06),
      kneeJR: rng.f(-0.06, 0.06),
      kneeYL: rng.f(-0.08, 0.08),
      kneeYR: rng.f(-0.08, 0.08),
      footJL: rng.f(-0.1, 0.1),
      footJR: rng.f(-0.1, 0.1),
      footDropL: rng.f(-0.07, 0.07),
      footDropR: rng.f(-0.07, 0.07),
    };
  }

  // Rings of a tapered capsule in local 3D — the same idea as the skull's
  // unit sphere, for a limb that has thickness from every angle.
  function capsuleRings(a, b, ra, rb, nu = 10, nv = 5) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;
    let px = 0;
    let py = 1;
    let pz = 0;
    if (Math.abs(uy) > 0.92) {
      px = 1;
      py = 0;
    }
    let qx = uy * pz - uz * py;
    let qy = uz * px - ux * pz;
    let qz = ux * py - uy * px;
    const ql = Math.hypot(qx, qy, qz) || 1;
    qx /= ql;
    qy /= ql;
    qz /= ql;
    px = qy * uz - qz * uy;
    py = qz * ux - qx * uz;
    pz = qx * uy - qy * ux;
    const rings = [];
    for (let i = 0; i <= nv; i++) {
      const t = i / nv;
      const r = ra + (rb - ra) * t;
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      const cz = a.z + dz * t;
      const ring = [];
      for (let j = 0; j < nu; j++) {
        const ang = (j / nu) * TAU;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        ring.push({
          x: cx + (px * ca + qx * sa) * r,
          y: cy + (py * ca + qy * sa) * r,
          z: cz + (pz * ca + qz * sa) * r,
        });
      }
      rings.push(ring);
    }
    return rings;
  }

  function chainRings(joints, r0, r1, nu = 10, nv = 4) {
    const rings = [];
    const bones = Math.max(1, joints.length - 1);
    for (let i = 0; i < bones; i++) {
      const t0 = i / bones;
      const t1 = (i + 1) / bones;
      const part = capsuleRings(
        joints[i],
        joints[i + 1],
        r0 + (r1 - r0) * t0,
        r0 + (r1 - r0) * t1,
        nu,
        nv
      );
      for (let k = i === 0 ? 0 : 1; k < part.length; k++) rings.push(part[k]);
    }
    return rings;
  }

  // One left and one right from each anatomical ring, then stitch. A 2D
  // y-bin or radial hull hops when a turn empties a bin, which read as a
  // different body every frame of a still spin. mode "bone" takes extrema
  // across the projected bone, so a hanging arm is a sausage and not a box.
  function stitchRings(rings, project, mode) {
    if (!rings || rings.length < 2) return [];
    const proj = rings.map((ring) => ring.map(project));
    let nx = 1;
    let ny = 0;
    if (mode === "bone") {
      const a = proj[0];
      const b = proj[proj.length - 1];
      const ax = a.reduce((s, p) => s + p.x, 0) / a.length;
      const ay = a.reduce((s, p) => s + p.y, 0) / a.length;
      const bx = b.reduce((s, p) => s + p.x, 0) / b.length;
      const by = b.reduce((s, p) => s + p.y, 0) / b.length;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    }
    const left = [];
    const right = [];
    for (const ring of proj) {
      let lo = null;
      let hi = null;
      let loD = Infinity;
      let hiD = -Infinity;
      for (const q of ring) {
        const d = q.x * nx + q.y * ny;
        if (d < loD) {
          loD = d;
          lo = q;
        }
        if (d > hiD) {
          hiD = d;
          hi = q;
        }
      }
      if (lo && hi) {
        left.push(lo);
        right.push(hi);
      }
    }
    if (left.length < 2) return [];
    return left.concat(right.reverse());
  }

  function softenPoly(pts) {
    if (!pts || pts.length < 4) return pts || [];
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      out.push({
        x: a.x * 0.75 + b.x * 0.25,
        y: a.y * 0.75 + b.y * 0.25,
        z: ((a.z || 0) * 0.75 + (b.z || 0) * 0.25),
      });
      out.push({
        x: a.x * 0.25 + b.x * 0.75,
        y: a.y * 0.25 + b.y * 0.75,
        z: ((a.z || 0) * 0.25 + (b.z || 0) * 0.75),
      });
    }
    return out;
  }

  function drawBody(c, rng, cx, neckY, s, lean, clothes, person, space) {
    // Same idea as the skull. Joints live in 3D — x right, y down from the
    // neck, z forward — then they take the same yaw/pitch/roll and project.
    // Clothes and the silhouette still grow around the 2D result, so a spin
    // shows a side and a back instead of a flat cutout that refuses to turn.
    const yaw = (space && space.yaw) || 0;
    const pitch = (space && space.pitch) || 0;
    const roll = (space && space.roll) || 0;
    const depth = (space && space.depth) || 1.2;
    const B = (space && space.body) || makeBodyPlan(lockRng(rng, "build"), person);
    const shW = B.shW;
    const hipW = B.hipW;
    const shY = B.shY;
    const hipY = B.hipY;
    const kneeY = B.kneeY;
    const footY = B.footY;
    const aw0 = B.armW;
    const armR = (t) => s * (aw0 - (aw0 - 0.082) * Math.pow(t, 0.75)) * (0.94 + 0.12 * fbm2(t * 3.4, aw0 * 90, 991));
    const lw0 = Math.max(0.14, B.armW * (1.05 + B.muscle * 0.28 + B.fat * 0.12));
    const pose = clothes.pose;
    const shrug = B.shrug;
    const slope = B.slope;
    const asymL = B.asymL;
    const asymR = B.asymR;
    const asym = (side) => (side < 0 ? asymL : asymR);

    // the torso leans a few degrees off the head's axis
    const tilt = B.tilt;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const leanAmt = lean + MOTION.lean;
    // A body in motion does not travel as one block. The torso rises and
    // sways while the feet stay where they were put — so the displacement is
    // full strength from the hips up and fades to nothing at the floor, which
    // is what makes the knees take the bob instead of the shoes sliding about.
    // A jump is the exception: there the ground lets go, and MOTION.ground
    // carries the feet up with everything else.
    const groundK = 1 - (MOTION.ground ?? 1);
    const planted = (ly) => {
      if (!MOTION.on) return 0;
      const k = Math.max(0, Math.min(1, (ly - hipY) / Math.max(1e-6, footY - hipY)));
      return 1 - k * (1 - groundK);
    };
    // Local point, then the same rotate/project the skull uses.
    const loc = (x, y, z) => {
      const dx = x + leanAmt * y * 0.13;
      return { x: dx * ct - y * st, y: dx * st + y * ct, z: z };
    };
    const project = (p) => {
      let q = rotY(p, yaw);
      q = rotX(q, pitch);
      q = rotZ(q, roll);
      const k = 1 + q.z * 0.22 * depth;
      const g = planted(p.y);
      return {
        x: cx + q.x * s * k + MOTION.sway * s * g,
        y: neckY + q.y * s * k + MOTION.bob * s * g,
        z: q.z,
      };
    };

    // Move a joint the rig already worked out. Offsets are added, never
    // substituted, so the swing his arms happen to hang at is still his.
    const J = (p, dx, dy) => (MOTION.on ? { x: p.x + dx, y: p.y + dy, z: p.z } : p);

    // ---- skeleton lines the outline is grown around ----
    const arm = (side) => {
      const m = MOTION.arm[side < 0 ? 0 : 1];
      const sh = loc(side * shW * 0.82, shY + shrug * side + MOTION.sh, 0.1);
      const E = (p) => J(p, m.ex, m.ey);
      const H = (p) => J(p, m.hx, m.hy);
      if (pose === "pockets") {
        return [sh, E(loc(side * (shW + 0.16), shY + 0.78, 0.18)), H(loc(side * (hipW + 0.1), hipY - 0.16, 0.2))];
      }
      if (pose === "hips") {
        return [sh, E(loc(side * (shW + 0.42), shY + 0.74, 0.15)), H(loc(side * (hipW + 0.06), hipY - 0.08, 0.22))];
      }
      if (pose === "folded") {
        return [sh, E(loc(side * (shW + 0.14), shY + 0.62, 0.28)), H(loc(-side * 0.16, shY + 0.95, 0.35))];
      }
      // hanging
      // the hang is not vertical on everyone: some swing out, some tuck in
      const a = asym(side);
      const left = side < 0;
      const swing = left ? B.swingL : B.swingR;
      const elbowOut = left ? B.elbowOutL : B.elbowOutR;
      const elbowY = left ? B.elbowYL : B.elbowYR;
      const handOut = left ? B.handOutL : B.handOutR;
      const handY = left ? B.handYL : B.handYR;
      return [
        sh,
        E(loc(side * (shW + elbowOut + swing * 0.4) * a, shY + elbowY * a, 0.06)),
        H(loc(side * (shW + handOut + swing) * a, shY + handY * a, 0.04)),
      ];
    };

    // stance: bowed, knock-kneed, wide, or planted
    const stance = B.stance;
    const spread = B.spread;
    const leg = (side) => {
      const left = side < 0;
      const drop = footY + (left ? B.footDropL : B.footDropR);
      const m = MOTION.leg[side < 0 ? 0 : 1];
      const hipK = left ? B.hipKL : B.hipKR;
      const kneeJ = left ? B.kneeJL : B.kneeJR;
      const kneeOffY = left ? B.kneeYL : B.kneeYR;
      const footJ = left ? B.footJL : B.footJR;
      return [
        loc(side * hipW * hipK * asym(side), hipY - 0.05, 0.06),
        J(loc(side * (hipW * 0.5 * spread + (stance + kneeJ)), kneeY + kneeOffY, 0.08), m.kx, m.ky),
        J(loc(side * (hipW * 0.46 * spread + (-stance * 1.6 + footJ)), drop, 0.02), m.fx, m.fy),
      ];
    };

    const LaL = arm(-1);
    const RaL = arm(1);
    const LlL = leg(-1);
    const RlL = leg(1);
    // A jump (or a knock-kneed stance plus motion) can send the knees
    // through each other. The core outline is one polygon, so crossing
    // legs fold it into a bowtie and the clothing clip dies.
    {
      const minGap = Math.max(0.22, lw0 * 1.2);
      for (let i = 0; i < 3; i++) {
        const gap = RlL[i].x - LlL[i].x;
        if (gap < minGap) {
          const mid = (LlL[i].x + RlL[i].x) / 2;
          LlL[i] = { x: mid - minGap / 2, y: LlL[i].y, z: LlL[i].z };
          RlL[i] = { x: mid + minGap / 2, y: RlL[i].y, z: RlL[i].z };
        }
      }
    }
    const La = LaL.map(project);
    const Ra = RaL.map(project);
    const Ll = LlL.map(project);
    const Rl = RlL.map(project);

    const smooth = (pts, n) => {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const mid = { x: (a.x + b.x) / 2 + rng.f(-2, 2), y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 };
        const run = bezier(a, b, mid, n).slice(1);
        run.forEach((q, k) => {
          const t = (k + 1) / n;
          q.z = (a.z || 0) * (1 - t) + (b.z || 0) * t;
        });
        out.push(...run);
      }
      return out;
    };
    const LaS = smooth(La, 9);
    const RaS = smooth(Ra, 9);
    const LlS = smooth(Ll, 9);
    const RlS = smooth(Rl, 9);

    // ---- one continuous silhouette ----
    const neckL = project(loc(-B.neckW, -0.42, 0.14));
    const neckR = project(loc(B.neckW, -0.42, 0.14));
    const shoulderL = project(loc(-shW * asymL, shY + slope - shrug + MOTION.sh, 0.1));
    const shoulderR = project(loc(shW * asymR, shY + slope + shrug + MOTION.sh, 0.1));
    // a belly, or a pinch, or neither — and it is not at the same height twice
    const waistY = shY + (hipY - shY) * B.waistT;
    const midW = B.midW;
    const waistL = project(loc(-midW * B.waistJL, waistY, 0.18 + B.belly));
    const waistR = project(loc(midW * B.waistJR, waistY, 0.18 + B.belly));
    const hipL = project(loc(-hipW, hipY, 0.06));
    const hipR = project(loc(hipW, hipY, 0.06));
    const crotch = project(loc(0, Math.max(LlL[0].y, RlL[0].y) + 0.14, 0.06));

    const round = (pts, r) => {
      const out = [];
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2] || pts[0];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const d = Math.hypot(dx, dy) || 1;
      for (let i = 0; i <= 5; i++) {
        const a = (i / 5) * Math.PI;
        const nx = -dy / d;
        const ny = dx / d;
        out.push({
          x: last.x + (nx * Math.cos(a) + (dx / d) * Math.sin(a)) * r,
          y: last.y + (ny * Math.cos(a) + (dy / d) * Math.sin(a)) * r,
        });
      }
      return out;
    };

    const shoe3 = (ankle, side) => {
      const boot = B.shoeKind === "boot";
      const up = boot ? 0.18 : 0.03;
      return [
        project({ x: ankle.x - side * B.heel, y: ankle.y - up, z: ankle.z - 0.06 }),
        project({ x: ankle.x + side * 0.04, y: ankle.y - 0.02, z: ankle.z + B.toe }),
        project({ x: ankle.x + side * 0.03, y: ankle.y + B.shoeH, z: ankle.z + B.toe * 0.9 }),
        project({ x: ankle.x - side * B.heel * 1.15, y: ankle.y + B.shoeH, z: ankle.z - 0.08 }),
      ];
    };
    const Lfoot = shoe3(LlL[2], -1);
    const Rfoot = shoe3(RlL[2], 1);

    // Core figure: neck, shoulders, sides, legs, feet. Arms go on top as
    // their own shapes, the way an arm crossing a body is actually drawn.
    // Subdivide the straight runs so the pen has somewhere to wander. A
    // shoulder that travels 100px without a bulge or a dent is a ruled line,
    // and the head above it never is.
    const span = (a, b, n) => {
      const out = [];
      for (let i = 1; i < n; i++) {
        const t = i / n;
        out.push({
          x: a.x + (b.x - a.x) * t + rng.f(-1, 1) * s * 0.035,
          y: a.y + (b.y - b.y) * t + rng.f(-1, 1) * s * 0.03,
        });
      }
      return out;
    };
    // Spend the same wander the old stick-core used, so the clothes stream
    // does not shift. The drawn body is the volume, not this.
    span(neckL, shoulderL, 3);
    span(shoulderL, waistL, 4);
    span(waistL, hipL, 3);
    span(hipR, waistR, 3);
    span(waistR, shoulderR, 4);
    span(shoulderR, neckR, 3);

    const torsoRings = [];
    {
      const n = 14;
      const around = 14;
      const keys = [
        { t: 0, rx: B.neckW * 0.9, rz: B.chestZ * 0.32, z: 0.1 },
        { t: 0.16, rx: shW * 0.84, rz: B.chestZ, z: 0.1 },
        { t: 0.38, rx: shW * 0.72 + midW * 0.18, rz: B.chestZ * 0.88, z: 0.12 + B.belly * 0.25 },
        { t: 0.58, rx: midW, rz: B.chestZ * 0.52 + B.belly * 0.42, z: 0.1 + B.belly * 0.95 },
        { t: 0.8, rx: hipW * 0.86 + midW * 0.1, rz: B.chestZ * 0.5, z: 0.04 - B.fat * 0.05 },
        { t: 1, rx: hipW * 0.9, rz: B.chestZ * 0.48, z: 0.03 },
      ];
      const mix = (t) => {
        let i = 0;
        while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
        const a = keys[i];
        const b = keys[i + 1];
        const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
        const s = u * u * (3 - 2 * u);
        return {
          rx: a.rx + (b.rx - a.rx) * s,
          rz: a.rz + (b.rz - a.rz) * s,
          z: a.z + (b.z - a.z) * s,
        };
      };
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const y = -0.42 + (hipY + 0.16) * t;
        const k = mix(t);
        const ring = [];
        for (let j = 0; j < around; j++) {
          const a = (j / around) * TAU;
          ring.push(loc(Math.cos(a) * k.rx, y, Math.sin(a) * k.rz + k.z));
        }
        torsoRings.push(ring);
      }
    }
    let core = softenPoly(stitchRings(torsoRings, project));
    if (core.length < 6) {
      core = [neckL, shoulderL, waistL, hipL, hipR, waistR, shoulderR, neckR];
    }

    const limbPoly = (spine, r0, r1) => {
      const poly = softenPoly(stitchRings(chainRings(spine, r0, r1, 12, 5), project, "bone"));
      return poly.length >= 6 ? poly : [];
    };
    const armRad0 = aw0 * 0.95;
    const armRad1 = Math.max(0.085, aw0 * 0.4);
    let Larm = limbPoly(LaL, armRad0, armRad1);
    let Rarm = limbPoly(RaL, armRad0, armRad1);
    const Lleg = limbPoly(LlL, lw0 * 1.08, lw0 * 0.52);
    const Rleg = limbPoly(RlL, lw0 * 1.08, lw0 * 0.52);
    if (Larm.length < 6) Larm = edgeOf(LaS, armR, -1, 11).concat(edgeOf(LaS, armR, 1, 24).reverse());
    if (Rarm.length < 6) Rarm = edgeOf(RaS, armR, -1, 83).concat(edgeOf(RaS, armR, 1, 96).reverse());

    if (clothes.wash) {
      inkFill(c, rng, core, clothes.wash, 0.22, 0.8);
      inkFill(c, rng, Larm, clothes.wash, 0.22, 0.8);
      inkFill(c, rng, Rarm, clothes.wash, 0.22, 0.8);
    }
    // Same weight and same wobble as the head. A thin, clean, ruled body
    // under a heavy, dirty head is two different hands on one page.
    const bw = s * 0.034 * rng.f(0.92, 1.12);
    const wob = s * rng.f(0.035, 0.06);
    const leftZ = (La[1].z || 0) + (La[2].z || 0);
    const rightZ = (Ra[1].z || 0) + (Ra[2].z || 0);
    const farIsLeft = leftZ < rightZ;
    let wantCuffs = false;
    // Far arm first, then a paper fill over the chest so it cannot
    // show through, then the near arm after the garment.
    const drawOneArm = (armPts, S, side) => {
      inkFill(c, rng, armPts, PAPER, 1, 0.8);
      refibre(c, rng, armPts);
      inkPoly(c, rng, armPts, { closed: true, w: bw * 0.92, dry: 0.7, wobble: wob * 0.8 });
      if (wantCuffs) cuff(S, side);
      if (pose !== "folded" && pose !== "pockets") {
        hand(c, rng, S, armR(1), side, s);
      } else if (pose === "pockets") {
        const t = S[S.length - 1];
        inkPoly(c, rng, [
          { x: t.x - side * s * 0.22, y: t.y - s * rng.f(0.16, 0.26) },
          { x: t.x - side * s * 0.06, y: t.y - s * 0.04 },
          { x: t.x + side * s * rng.f(0.08, 0.16), y: t.y + s * rng.f(0.0, 0.06) },
        ], { w: s * 0.017, dry: 0.7 });
      }
    };
    const leftLegZ = (Ll[0].z || 0) + (Ll[2].z || 0);
    const rightLegZ = (Rl[0].z || 0) + (Rl[2].z || 0);
    const farLeftLeg = leftLegZ < rightLegZ;
    const drawLeg = (poly) => {
      if (!poly || poly.length < 6) return;
      inkFill(c, rng, poly, PAPER, 1, 0.7);
      inkPoly(c, rng, poly, { closed: true, w: bw * 0.9, dry: 0.65, wobble: wob * 0.8 });
    };
    if (farLeftLeg) drawLeg(Lleg);
    else drawLeg(Rleg);
    if (farIsLeft) drawOneArm(Larm, LaS, -1);
    else drawOneArm(Rarm, RaS, 1);
    inkFill(c, rng, core, PAPER, 1, 0.7);
    inkPoly(c, rng, core, { closed: true, w: bw, doubled: true, dry: 0.6, wobble: wob });
    if (farLeftLeg) drawLeg(Rleg);
    else drawLeg(Lleg);
    const drawArms = () => {
      if (farIsLeft) drawOneArm(Rarm, RaS, 1);
      else drawOneArm(Larm, LaS, -1);
    };
    const outline = core;

    // ---- clothes cut into the figure ----
    // Pinned to the shoulders, the hem landed at the same height whatever the
    // build — measured across seven figures it moved 1.25x while the torso
    // moved 1.56x and the legs 1.85x. A garment belongs to its torso.
    //
    // The fit is its own stream. The body stream is spent drawing the
    // silhouette, and a raised arm or a lifted knee changes how long that
    // outline is, which changes how many times the nib rolls the dice. If
    // the hem and the stripes come off that stream they are a different
    // garment every frame.
    const fit = new Rng(hash32(rng.seed, "fit", 1));
    // Hem and stripe Y must be on the moving body. shY/hipY are rest
    // layout; during a jump they stay on the ground and the garment
    // tears off him.
    const shScreenY = (shoulderL.y + shoulderR.y) / 2;
    const hipScreenY = (hipL.y + hipR.y) / 2;
    const hemY = shScreenY + (hipScreenY - shScreenY) * fit.f(0.82, 1.34);
    const sleeveT = fit.f(0.36, 0.66);
    const neckR0 = fit.f(0.24, 0.32);
    const zip = [fit.f(-3, 3), fit.f(-4, 6), fit.f(-6, 8)];
    const ribY = [fit.f(-2, 2), fit.f(-2, 2), fit.f(-2, 2), fit.f(-2, 2)];
    // A straight rule across the arm at the same place on both sides reads as
    // the seam where two tubes were butted together, not as a sleeve.
    // a hem is not a rule: it wanders, and it stops short of the silhouette
    const hemPts = () => {
      const x0 = waistL.x + s * fit.f(0.04, 0.16);
      const x1 = waistR.x - s * fit.f(0.04, 0.16);
      const wave = fit.f(0.7, 1.6);
      const amp = fit.f(-0.05, 0.05);
      const pts = [];
      const n = 5;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push({
          x: x0 + (x1 - x0) * t,
          y: hemY + Math.sin(t * Math.PI * wave) * s * amp + fit.f(-2, 2),
        });
      }
      return pts;
    };

    const cuffSkip = [fit.chance(0.22), fit.chance(0.22)];
    const cuffT = [sleeveT + fit.f(-0.12, 0.12), sleeveT + fit.f(-0.12, 0.12)];
    const cuffFrom = [fit.chance(0.5) ? 0 : 1, fit.chance(0.5) ? 0 : 1];
    const cuffReach = [fit.f(0.3, 0.7), fit.f(0.3, 0.7)];
    const cuffBend = [fit.f(-0.2, 0.2), fit.f(-0.2, 0.2)];
    const cuffW = [fit.f(0.011, 0.018), fit.f(0.011, 0.018)];
    const cuff = (S, side) => {
      const si = side < 0 ? 0 : 1;
      if (cuffSkip[si]) return; // not every sleeve gets marked
      const t = cuffT[si];
      const i = Math.max(1, Math.min(S.length - 2, Math.round(t * (S.length - 1))));
      const a = edgeOf(S, armR, -1, side < 0 ? 11 : 83)[i];
      const b = edgeOf(S, armR, 1, side < 0 ? 24 : 96)[i];
      if (!a || !b) return;
      // A mark spanning the arm reads as the seam between two tubes. A cuff
      // is a tick biting in from one edge and stopping.
      const from = cuffFrom[si];
      const p0 = from ? b : a;
      const p1 = from ? a : b;
      const reach = cuffReach[si];
      const bn = cuffBend[si];
      inkPoly(c, rng, [
        { x: p0.x, y: p0.y },
        {
          x: p0.x + (p1.x - p0.x) * reach * 0.55 + (p1.y - p0.y) * bn,
          y: p0.y + (p1.y - p0.y) * reach * 0.55 - (p1.x - p0.x) * bn,
        },
        { x: p0.x + (p1.x - p0.x) * reach, y: p0.y + (p1.y - p0.y) * reach },
      ], { w: s * cuffW[si], dry: 0.9, wobble: s * 0.018 });
    };

    if (clothes.kind === "tee") {
      wantCuffs = true;
      inkPoly(c, rng, arcPts((neckL.x + neckR.x) / 2, neckL.y + s * 0.06, s * neckR0, 0.42, Math.PI - 0.42, fit), { w: s * 0.017, dry: 0.6, wobble: s * 0.035 });
      inkPoly(c, rng, hemPts(), { w: s * 0.018, dry: 0.6, wobble: s * 0.05 });
    } else if (clothes.kind === "hoodie") {
      inkPoly(c, rng, arcPts((neckL.x + neckR.x) / 2, neckL.y + s * 0.36, s * 0.42, 0.35, Math.PI - 0.35, fit), { w: s * 0.019, dry: 0.6, wobble: s * 0.035 });
      inkPoly(c, rng, hemPts(), { w: s * 0.021, dry: 0.6, wobble: s * 0.05 });
      const pk = (neckL.x + neckR.x) / 2;
      inkPoly(c, rng, [
        { x: pk - s * 0.34, y: hemY - s * 0.42 },
        { x: pk - s * 0.3, y: hemY - s * 0.06 },
        { x: pk + s * 0.3, y: hemY - s * 0.06 },
        { x: pk + s * 0.34, y: hemY - s * 0.44 },
      ], { w: s * 0.016 });
      inkLine(c, rng, pk - s * 0.06, neckL.y + s * 0.42, pk - s * 0.1, neckL.y + s * 0.78, s * 0.013);
      inkLine(c, rng, pk + s * 0.06, neckL.y + s * 0.42, pk + s * 0.12, neckL.y + s * 0.8, s * 0.013);
    } else if (clothes.kind === "jacket") {
      const mid = (neckL.x + neckR.x) / 2;
      inkPoly(c, rng, [
        { x: mid + zip[0], y: shScreenY - s * 0.02 },
        { x: mid + zip[1], y: (shScreenY + hemY) / 2 },
        { x: mid + zip[2], y: hemY },
      ], { w: s * 0.019, passes: 2 });
      inkPoly(c, rng, [
        { x: mid - s * 0.3, y: shScreenY - s * 0.04 },
        { x: mid - s * 0.06, y: shScreenY + s * 0.36 },
        { x: mid - s * 0.34, y: shScreenY + s * 0.44 },
      ], { w: s * 0.016 });
      inkPoly(c, rng, [
        { x: mid + s * 0.3, y: shScreenY - s * 0.04 },
        { x: mid + s * 0.06, y: shScreenY + s * 0.36 },
        { x: mid + s * 0.34, y: shScreenY + s * 0.44 },
      ], { w: s * 0.016 });
      inkPoly(c, rng, hemPts(), { w: s * 0.02, dry: 0.6, wobble: s * 0.05 });
      wantCuffs = true;
    } else if (clothes.kind === "sweater") {
      inkPoly(c, rng, arcPts((neckL.x + neckR.x) / 2, neckL.y + s * 0.16, s * 0.3, 0.3, Math.PI - 0.3, fit), { w: s * 0.019, dry: 0.6, wobble: s * 0.035 });
      for (let i = 0; i < 4; i++) {
        const y = hemY - s * 0.16 + i * s * 0.055;
        inkLine(c, rng, waistL.x + s * 0.08, y, waistR.x - s * 0.08, y + ribY[i], s * 0.012);
      }
      wantCuffs = true;
    }

    // Cloth has folds. A flat fill inside a clean outline is the difference
    // between a garment and a silhouette.
    const fold = (x0, y0, x1, y1, wk, mx, my) =>
      inkPoly(c, rng, [
        { x: x0, y: y0 },
        { x: (x0 + x1) / 2 + mx, y: (y0 + y1) / 2 + my },
        { x: x1, y: y1 },
      ], { w: s * (wk ?? 0.014), dry: 0.9, wobble: s * 0.02 });

    for (let side = -1; side <= 1; side += 2) {
      if (fit.chance(0.4)) continue; // not every shoulder gets one
      const sx0 = side < 0 ? shoulderL : shoulderR;
      const n = fit.i(1, 2);
      for (let i = 0; i < n; i++) {
        fold(
          sx0.x - side * s * fit.f(0.1, 0.28),
          sx0.y + s * fit.f(0.16, 0.4),
          sx0.x - side * s * fit.f(0.34, 0.7),
          sx0.y + s * fit.f(0.5, 1.0),
          0.014,
          fit.f(-4, 4),
          fit.f(-3, 3)
        );
      }
    }
    if (fit.chance(0.82)) {
      const n = fit.i(2, 5);
      for (let i = 0; i < n; i++) {
        const x0 = waistL.x + ((waistR.x - waistL.x) * (i + 0.6)) / n;
        fold(x0, hemY - s * fit.f(0.2, 0.42), x0 + fit.f(-5, 5), hemY - s * fit.f(0.01, 0.08), 0.011, fit.f(-4, 4), fit.f(-3, 3));
      }
    }
    if (fit.chance(0.6)) {
      // shadow under the hem
      const n = fit.i(4, 9);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const x0 = waistL.x + (waistR.x - waistL.x) * t;
        inkLine(c, rng, x0, hemY - s * fit.f(0.02, 0.1), x0 + s * fit.f(0.04, 0.1), hemY + fit.f(-2, 2), s * 0.01);
      }
    }

    if (clothes.pattern) {
      c.save();
      c.beginPath();
      outline.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.clip();
      const pitch = s * fit.f(0.11, 0.3);
      const heavy = s * fit.f(0.022, 0.07);
      if (clothes.pattern === "stripe") {
        // skewed independently, gaps varying, a third running past the edge
        const span = s * shW;
        for (let y = shScreenY + s * fit.f(0.04, 0.2); y < hemY; y += pitch * fit.f(0.6, 1.4)) {
          const skew = fit.f(-0.14, 0.14) * span;
          const over = fit.chance(0.34) ? fit.f(0.1, 0.45) : 0;
          inkPoly(c, rng, [
            { x: cx - span * (1.2 + over), y: y - skew },
            { x: cx + fit.f(-6, 6), y: y + fit.f(-3, 4) },
            { x: cx + span * (1.2 + over), y: y + skew + fit.f(-4, 4) },
          ], { w: heavy * fit.f(0.7, 1.3), dry: 0.5, wobble: s * 0.035 });
        }
      } else if (clothes.pattern === "vstripe") {
        const span = s * shW;
        for (let x = cx - span * 1.3; x < cx + span * 1.3; x += pitch * fit.f(0.75, 1.3)) {
          inkPoly(c, rng, [
            { x, y: shScreenY + s * fit.f(-0.1, 0.15) },
            { x: x + fit.f(-4, 4), y: (shScreenY + hemY) / 2 },
            { x: x + fit.f(-5, 5), y: hemY - s * fit.f(-0.1, 0.2) },
          ], { w: heavy * 0.42, dry: 0.9, wobble: s * 0.03 });
        }
      } else if (clothes.pattern === "dark") {
        // a black garment — the garment, not the whole figure. The core
        // outline runs all the way to the shoes.
        c.beginPath();
        c.rect(cx - s * 4, shScreenY - s * 0.9, s * 8, hemY - shScreenY + s * 0.9);
        c.clip();
        inkMassFill(c, rng, core, INK, { bite: s * 0.06 });
      }
      c.restore();
    }

    drawArms();

    if (clothes.darkLegs && clothes.pattern !== "dark") {
      if (Lleg.length > 5) inkMassFill(c, rng, Lleg, INK, { bite: s * 0.055 });
      if (Rleg.length > 5) inkMassFill(c, rng, Rleg, INK, { bite: s * 0.055 });
    }
    // shoes read as weight on the ground
    inkMassFill(c, rng, Lfoot, INK, { bite: s * 0.04 });
    inkMassFill(c, rng, Rfoot, INK, { bite: s * 0.04 });

    let maxX = -Infinity;
    for (const q of core.concat(Larm, Rarm, Lleg, Rleg)) {
      if (q && q.x > maxX) maxX = q.x;
    }
    return {
      hipY: (hipL.y + hipR.y) / 2,
      footY: Math.max(Ll[2].y, Rl[2].y),
      maxX,
      core,
    };
  }

  // ---------- handwritten name ----------
  const GLYPHS = {
    a: ["M .15 .42 C .2 .18 .8 .18 .82 .48 L .82 .9 M .82 .48 C .8 .78 .2 .82 .18 .55"],
    b: ["M .18 .08 L .18 .92 M .18 .38 C .55 .22 .9 .38 .82 .58 C .9 .82 .4 .96 .18 .78"],
    c: ["M .82 .32 C .7 .14 .18 .18 .2 .55 C .18 .88 .72 .92 .84 .72"],
    d: ["M .82 .08 L .82 .92 M .82 .4 C .6 .2 .12 .28 .18 .58 C .16 .88 .55 .96 .82 .78"],
    e: ["M .18 .55 L .84 .5 C .82 .18 .25 .16 .2 .48 C .18 .86 .72 .94 .84 .74"],
    f: ["M .72 .12 C .5 .02 .28 .18 .32 .92 M .18 .42 L .68 .4"],
    g: ["M .8 .38 C .72 .16 .2 .18 .22 .48 C .2 .72 .7 .74 .8 .52 L .8 .88 C .78 1.12 .28 1.1 .22 .92"],
    h: ["M .18 .08 L .18 .92 M .18 .46 C .4 .28 .78 .32 .8 .92"],
    i: ["M .48 .38 L .48 .9 M .48 .16 L .5 .2"],
    j: ["M .62 .38 L .62 .92 C .6 1.14 .22 1.12 .22 .94 M .62 .16 L .64 .2"],
    k: ["M .2 .08 L .2 .92 M .78 .32 L .22 .58 L .8 .92"],
    l: ["M .42 .08 L .42 .9"],
    m: ["M .12 .9 L .12 .42 C .14 .28 .32 .28 .38 .5 L .4 .9 M .38 .5 C .48 .24 .7 .26 .74 .52 L .78 .9"],
    n: ["M .18 .9 L .18 .4 C .22 .26 .7 .26 .78 .48 L .8 .9"],
    o: ["M .5 .22 C .18 .22 .14 .88 .5 .9 C .86 .88 .82 .22 .5 .22"],
    p: ["M .2 .38 L .2 1.12 M .2 .42 C .55 .22 .9 .38 .78 .58 C .9 .8 .4 .82 .2 .68"],
    q: ["M .78 .38 L .78 1.12 M .78 .42 C .55 .2 .14 .32 .2 .58 C .16 .84 .55 .9 .78 .7"],
    r: ["M .22 .9 L .22 .42 C .3 .26 .72 .24 .78 .4"],
    s: ["M .76 .32 C .7 .16 .22 .18 .24 .4 C .26 .58 .74 .58 .74 .78 C .74 .98 .24 1 .22 .82"],
    t: ["M .42 .12 L .42 .82 C .44 .96 .7 .94 .74 .82 M .22 .38 L .68 .36"],
    u: ["M .18 .38 L .2 .78 C .22 .94 .78 .94 .8 .72 L .82 .38 M .82 .38 L .82 .9"],
    v: ["M .14 .38 L .48 .9 L .86 .38"],
    w: ["M .08 .38 L .28 .9 L .5 .5 L .72 .9 L .92 .38"],
    x: ["M .18 .38 L .8 .9 M .8 .38 L .18 .9"],
    y: ["M .16 .38 L .48 .78 M .84 .38 L .42 1.12"],
    z: ["M .18 .38 L .8 .38 L .2 .9 L .82 .9"],
    A: ["M .1 .92 L .5 .1 L .9 .92 M .28 .62 L .72 .62"],
    B: ["M .18 .1 L .18 .9 M .18 .1 L .68 .18 C .9 .28 .68 .48 .18 .48 C .9 .5 .92 .82 .18 .9"],
    C: ["M .84 .28 C .7 .08 .16 .16 .2 .5 C .18 .88 .72 .96 .86 .74"],
    D: ["M .18 .1 L .18 .9 L .18 .1 C .86 .16 .9 .84 .18 .9"],
    E: ["M .78 .12 L .22 .12 L .22 .9 L .8 .9 M .22 .5 L .64 .5"],
    F: ["M .78 .12 L .22 .12 L .22 .9 M .22 .5 L .62 .5"],
    G: ["M .84 .28 C .7 .08 .16 .18 .2 .52 C .22 .9 .78 .96 .84 .68 L .56 .68"],
    H: ["M .2 .1 L .2 .9 M .8 .1 L .8 .9 M .2 .5 L .8 .5"],
    I: ["M .28 .12 L .72 .12 M .5 .12 L .5 .88 M .28 .9 L .72 .9"],
    J: ["M .22 .12 L .8 .12 M .62 .12 L .6 .78 C .58 .98 .2 .96 .2 .78"],
    K: ["M .22 .1 L .22 .9 M .82 .12 L .22 .5 L .84 .9"],
    L: ["M .24 .1 L .24 .9 L .82 .9"],
    M: ["M .12 .9 L .12 .12 L .5 .62 L .88 .12 L .88 .9"],
    N: ["M .18 .9 L .18 .12 L .82 .9 L .82 .12"],
    O: ["M .5 .1 C .12 .12 .12 .9 .5 .92 C .88 .9 .88 .12 .5 .1"],
    P: ["M .22 .9 L .22 .12 L .72 .16 C .92 .3 .72 .5 .22 .5"],
    Q: ["M .5 .1 C .12 .12 .12 .88 .5 .92 C .88 .88 .88 .12 .5 .1 M .58 .68 L .86 .96"],
    R: ["M .22 .9 L .22 .12 L .7 .16 C .9 .3 .7 .5 .22 .5 L .82 .9"],
    S: ["M .78 .24 C .7 .08 .2 .1 .22 .36 C .24 .54 .78 .54 .78 .76 C .78 .96 .2 1 .22 .8"],
    T: ["M .12 .14 L .88 .14 M .5 .14 L .5 .9"],
    U: ["M .18 .12 L .2 .7 C .22 .94 .78 .94 .8 .7 L .82 .12"],
    V: ["M .1 .12 L .5 .9 L .9 .12"],
    W: ["M .06 .12 L .26 .9 L .5 .36 L .74 .9 L .94 .12"],
    X: ["M .16 .12 L .84 .9 M .84 .12 L .16 .9"],
    Y: ["M .14 .12 L .5 .5 L .86 .12 M .5 .5 L .5 .92"],
    Z: ["M .16 .14 L .84 .14 L .16 .9 L .86 .9"],
    " ": [],
    "-": ["M .18 .55 L .82 .55"],
    "0": ["M .5 .12 C .16 .14 .16 .9 .5 .92 C .84 .9 .84 .14 .5 .12"],
    "@": [
      "M .66 .74 C .4 .86 .2 .7 .26 .5 C .32 .3 .62 .28 .64 .5 C .64 .68 .5 .72 .46 .6 C .44 .48 .6 .44 .66 .56 L .68 .72 C .72 .82 .88 .74 .86 .52 C .84 .2 .44 .06 .24 .28 C .04 .5 .16 .92 .5 .96",
    ],
    "'": ["M .5 .12 L .42 .3"],
  };

  function parsePath(d) {
    const cmds = [];
    const re = /([MCL])|(-?\d*\.?\d+)/g;
    let m;
    let cur = "M";
    const nums = [];
    const flush = () => {
      if (cur === "M" && nums.length >= 2) cmds.push({ t: "M", p: nums.splice(0, 2) });
      else if (cur === "L" && nums.length >= 2) cmds.push({ t: "L", p: nums.splice(0, 2) });
      else if (cur === "C" && nums.length >= 6) cmds.push({ t: "C", p: nums.splice(0, 6) });
    };
    while ((m = re.exec(d))) {
      if (m[1]) {
        flush();
        cur = m[1];
      } else nums.push(Number(m[2]));
    }
    flush();
    return cmds;
  }

  function drawGlyph(c, rng, ch, x, y, size, wk) {
    const d = GLYPHS[ch];
    if (!d) return size * 0.55;
    const sx = size * rng.f(0.86, 1.14);
    const sy = size * rng.f(0.88, 1.14);
    const rot = rng.f(-0.06, 0.06);
    // A hand cannot repeat a letterform. Shear it, squash it unevenly, and
    // push every control point — otherwise the two O's in a word superimpose
    // and the whole thing reads as a distressed typeface.
    const shear = rng.f(-0.13, 0.13);
    const bulge = rng.f(-0.09, 0.09);
    const gseed = rng.i(1, 99999);
    const w = size * (ch === " " ? 0.55 : ch === "i" || ch === "l" || ch === "I" || ch === "'" ? 0.42 : rng.f(0.74, 0.88));
    d.forEach((stroke) => {
      const cmds = parsePath(stroke);
      const pts = [];
      let px = 0;
      let py = 0;
      const xf = (u, v) => {
        const jx = (fbm2(u * 3.1 + gseed * 0.01, v * 3.1, gseed) - 0.5) * size * 0.055;
        const jy = (fbm2(v * 3.7 + gseed * 0.01, u * 3.7, gseed + 41) - 0.5) * size * 0.055;
        const rx = (u - 0.5 + bulge * v * (1 - v) * 2) * sx - v * shear * sx;
        const ry = v * sy;
        return {
          x: x + rx * Math.cos(rot) - ry * Math.sin(rot) + jx,
          y: y + rx * Math.sin(rot) + ry * Math.cos(rot) + jy,
        };
      };
      const runs = [];
      cmds.forEach((cmd) => {
        if (cmd.t === "M") {
          // a move is the pen leaving the paper. Treating it as a line drew a
          // connector across every glyph built from two separate strokes.
          const q = xf(cmd.p[0], cmd.p[1]);
          px = q.x;
          py = q.y;
          if (pts.length > 1) runs.push(pts.slice());
          pts.length = 0;
          pts.push(q);
        } else if (cmd.t === "L") {
          const q = xf(cmd.p[0], cmd.p[1]);
          px = q.x;
          py = q.y;
          pts.push(q);
        } else if (cmd.t === "C") {
          const a = xf(cmd.p[0], cmd.p[1]);
          const b = xf(cmd.p[2], cmd.p[3]);
          const dlt = xf(cmd.p[4], cmd.p[5]);
          for (let i = 1; i <= 6; i++) {
            const t = i / 6;
            const u = 1 - t;
            pts.push({
              x: u * u * u * px + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * dlt.x,
              y: u * u * u * py + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t * t * t * dlt.y,
            });
          }
          px = dlt.x;
          py = dlt.y;
        }
      });
      // the pen runs past the join instead of stopping on it
      if (pts.length > 1 && rng.chance(0.4)) {
        const a = pts[pts.length - 2];
        const b = pts[pts.length - 1];
        const k = rng.f(0.04, 0.14);
        pts.push({ x: b.x + (b.x - a.x) * k * 3, y: b.y + (b.y - a.y) * k * 3 });
      }
      if (pts.length > 1) runs.push(pts.slice());
      const rw = size * (wk ?? rng.f(0.075, 0.125));
      const rwob = size * rng.f(0.03, 0.055);
      runs.forEach((run) => {
        inkPoly(c, rng, run, { w: rw, passes: 1, dry: 0.55, wobble: rwob });
      });
    });
    return w;
  }

  function drawName(c, rng, name, x, y, size, opt = {}) {
    const raw = String(name);
    const text =
      opt.caps === false
        ? raw
        : rng.chance(0.45)
        ? raw.toUpperCase()
        : rng.chance(0.5)
        ? raw
        : raw.replace(/\b(\w)(\w*)/g, (m, a, b) => a.toUpperCase() + (rng.chance(0.3) ? b.toUpperCase() : b));
    c.save();
    c.translate(x, y);
    c.rotate(rng.f(-0.045, 0.035));
    let px = 0;
    let drift = 0;
    const slope = rng.f(-0.035, 0.03); // the whole line runs slightly downhill
    const round = "ocesgqOCGQS";
    let prev = "";
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      // the baseline wanders and does not come back
      drift += rng.f(-0.055, 0.055) * size;
      drift = Math.max(-size * 0.16, Math.min(size * 0.16, drift));
      // and the end of a word gets cramped and drops
      const late = i > chars.length - 3 ? (i - (chars.length - 3)) * rng.f(0.02, 0.07) * size : 0;
      const cs = size * rng.f(0.85, 1.15);
      const dy = drift + px * slope + late;
      const adv = drawGlyph(c, rng, ch, px, dy, cs, opt.w);
      // hand lettering closes up after a round letter
      const tuck = ch === " " || prev === " " ? size * rng.f(0.02, 0.09) : round.includes(prev) || round.includes(ch) ? -size * rng.f(0.01, 0.045) : 0;
      px += adv + size * rng.f(0.03, 0.11) + tuck;
      prev = ch;
    }
    if ((opt.rule === false ? false : opt.rule ? true : rng.chance(0.66)) && px > size * 0.8) {
      const y0 = size * rng.f(1.06, 1.24) + drift * 0.6;
      const cuts = rng.i(1, 3);
      let x0 = size * rng.f(-0.02, 0.08);
      for (let i = 0; i < cuts; i++) {
        const x1 = x0 + (px - size * 0.08) / cuts + rng.f(-5, 7);
        if (!rng.chance(0.18)) {
          inkPoly(c, rng, [
            { x: x0, y: y0 + rng.f(-2, 2) },
            { x: (x0 + x1) / 2, y: y0 + rng.f(-2.5, 2.5) },
            { x: Math.min(px - 2, x1), y: y0 + rng.f(-2.5, 3) },
          ], { w: size * rng.f(0.035, 0.07), dry: 0.6, wobble: size * 0.05 });
        }
        x0 = x1 + rng.f(1, 7);
      }
    }
    c.restore();
    return px;
  }

  // ---------- names ----------
  // Names are assembled, not looked up. A wide curated pool of real given names
  // is crossed with English surname morphology — toponymic (-ley -ford -worth),
  // patronymic (-son -kins), Gaelic Mc/O' — so the surname supply is in the
  // thousands rather than the dozens. Only glyphs the stroke font has are used
  // (A-Z a-z space apostrophe hyphen) and every result is length-capped.

  // Given names, used bare and as the left half of a full name. Ordinary,
  // short, mostly pre-1960: the sort of person in the drawings.
  const FIRST_PLAIN = [
    // English, male
    "Alf", "Arthur", "Basil", "Bert", "Bill", "Bram", "Brian", "Cecil", "Clem", "Cliff",
    "Clive", "Colin", "Cyril", "Denis", "Derek", "Des", "Don", "Doug", "Duncan", "Eric",
    "Ernest", "Ernie", "Frank", "Fred", "Geoff", "George", "Gordon", "Graham", "Guy", "Hal",
    "Harold", "Henry", "Herb", "Horace", "Hugh", "Ian", "Ivor", "Jeff", "Jim", "Joe",
    "Keith", "Ken", "Kev", "Len", "Leslie", "Lionel", "Malc", "Max", "Mervyn", "Mick",
    "Miles", "Monty", "Morris", "Nat", "Ned", "Neil", "Nev", "Nigel", "Noel", "Norman",
    "Ossie", "Perce", "Percy", "Peter", "Phil", "Piers", "Rafe", "Ralph", "Ray", "Reg",
    "Rex", "Rob", "Rod", "Ron", "Roy", "Rufus", "Russ", "Sam", "Seth", "Sid",
    "Stan", "Stuart", "Ted", "Terry", "Toby", "Tom", "Trevor", "Vaughn", "Vernon", "Vic",
    "Vince", "Walt", "Wes", "Wilf", "Will",
    // English, female
    "Ada", "Agnes", "Alma", "Audrey", "Beryl", "Bess", "Brenda", "Bridget", "Cara", "Carol",
    "Cissy", "Clara", "Cora", "Daphne", "Dinah", "Dora", "Doris", "Dot", "Edith", "Edna",
    "Eileen", "Elsa", "Ena", "Enid", "Etta", "Ethel", "Eunice", "Faye", "Flora", "Freda",
    "Gladys", "Glenda", "Grace", "Greta", "Hazel", "Hilda", "Ida", "Ina", "Irene", "Iris",
    "Ivy", "Jean", "Jess", "Joan", "Joyce", "June", "Kath", "Lena", "Lilian", "Lois",
    "Lorna", "Lynn", "Mabel", "Madge", "Marge", "Marion", "Marj", "Mary", "Maud", "Mavis",
    "May", "Mona", "Muriel", "Myra", "Nancy", "Nell", "Nesta", "Nita", "Nora", "Norma",
    "Olive", "Opal", "Pam", "Pat", "Pearl", "Peg", "Phyl", "Rae", "Rhona", "Rita",
    "Rose", "Ruby", "Ruth", "Sadie", "Sheila", "Stella", "Sybil", "Sylvia", "Tess", "Thea",
    "Thelma", "Vera", "Vi", "Vida", "Viola", "Vivien", "Wanda", "Yvonne",
    // old compounds, vetted rather than generated
    "Albert", "Aldred", "Aldric", "Aldwin", "Alfred", "Alric", "Alwyn", "Aylmer", "Aylward", "Baldric",
    "Baldwin", "Barnard", "Bernard", "Bertram", "Cedric", "Cuthbert", "Delmer", "Delwyn", "Denzil", "Edgar",
    "Edmund", "Edred", "Edsel", "Edward", "Edwin", "Egbert", "Elmer", "Everard", "Garwin", "Gerald",
    "Gerard", "Gilbert", "Godard", "Godfrey", "Godric", "Godwin", "Herbert", "Hildred", "Howard", "Hubert",
    "Humbert", "Jethro", "Kendrick", "Kenelm", "Lambert", "Leonard", "Mortimer", "Norbert", "Norvel", "Orson",
    "Osbert", "Osgood", "Osmund", "Osric", "Oswald", "Oswin", "Quenton", "Randal", "Randolf", "Raymund",
    "Reynard", "Rodric", "Rowland", "Rudolf", "Selwyn", "Sherwin", "Sigmund", "Theobald", "Thurston", "Ulric",
    "Wendell", "Wilbert", "Wilfred", "Willard", "Wilmer", "Wilmot", "Winfred", "Winston", "Wulfric", "Wyndham",
    // Irish
    "Aidan", "Aine", "Aoife", "Brendan", "Bridie", "Cathal", "Ciara", "Colm", "Colum", "Conor",
    "Cormac", "Dara", "Declan", "Deirdre", "Donal", "Eamon", "Enda", "Eoin", "Fergal", "Fergus",
    "Finn", "Fiona", "Gerry", "Grainne", "Kieran", "Liam", "Maeve", "Mairead", "Malachy", "Neasa",
    "Niall", "Niamh", "Nuala", "Oisin", "Orla", "Padraig", "Paidi", "Peig", "Riona", "Roisin",
    "Ronan", "Rory", "Seamus", "Sean", "Shane", "Sinead", "Siobhan", "Sorcha", "Tadhg", "Una",
    // Welsh
    "Aled", "Alun", "Bryn", "Carys", "Ceri", "Dai", "Dilys", "Elin", "Emlyn", "Emrys",
    "Enfys", "Ffion", "Geraint", "Glenys", "Gwen", "Gwilym", "Gwyn", "Huw", "Idris", "Ieuan",
    "Ifor", "Iolo", "Llew", "Lowri", "Mair", "Megan", "Meirion", "Myfanwy", "Nerys", "Olwen",
    "Owain", "Owen", "Rhian", "Rhodri", "Rhys", "Sian", "Tegwen", "Tudor", "Wyn",
    // continental
    "Anders", "Anka", "Bela", "Bodil", "Bruno", "Dino", "Elke", "Emil", "Franz", "Fritz",
    "Gerd", "Gitta", "Gustav", "Hans", "Heike", "Hilde", "Horst", "Ilse", "Ingrid", "Ivan",
    "Janos", "Jan", "Kata", "Karl", "Klaus", "Kurt", "Lars", "Lotte", "Magda", "Mila",
    "Nadia", "Nils", "Olav", "Oskar", "Otto", "Petra", "Piet", "Radek", "Rudi", "Sigrid",
    "Stig", "Sven", "Tibor", "Tomas", "Ulf", "Ulla", "Vilma", "Yves", "Zofia", "Zoltan",
    // American, old
    "Abe", "Bud", "Cal", "Chip", "Curt", "Del", "Dutch", "Earl", "Eli", "Elmo",
    "Ezra", "Floyd", "Gene", "Gus", "Hank", "Hoyt", "Ike", "Jed", "Kip", "Lew",
    "Lyle", "Marv", "Merle", "Milt", "Moss", "Otis", "Red", "Roscoe", "Sol", "Vern",
    "Wade", "Wilbur", "Zane", "Zeb", "Zed", "Zeke",
  ];

  // Stems that take a diminutive tail. Doubled consonants are baked in, so the
  // suffix just concatenates: Robb + ie, Robb + o, Tomm + y.
  const DIM_STEM_M = [
    "Bill", "Bobb", "Barn", "Cliff", "Coll", "Conn", "Crabb", "Dav", "Dodd", "Donn",
    "Duff", "Dunn", "Edd", "Frank", "Gibb", "Gord", "Gunn", "Hall", "Harr", "Hobb",
    "Hodd", "Hugg", "Jack", "Jagg", "Jeff", "Jimm", "Jock", "Kenn", "Kipp", "Lenn",
    "Matt", "Mick", "Mogg", "Morr", "Mudd", "Nedd", "Norr", "Patt", "Perc", "Phill",
    "Podd", "Quigg", "Ripp", "Robb", "Ronn", "Rudd", "Samm", "Sepp", "Skinn", "Snodd",
    "Sonn", "Spragg", "Stagg", "Stubb", "Tapp", "Tedd", "Tibb", "Timm", "Todd", "Tomm",
    "Trigg", "Tubb", "Sidd", "Vinn", "Wagg", "Walt", "Widd", "Wilf", "Wint", "Winn",
    "Zebb", "Bunn", "Lugg", "Redd", "Gaff", "Marn", "Hopp", "Larr", "Sull", "Pratt",
  ];
  const DIM_STEM_F = [
    "Ann", "Bett", "Cass", "Dinn", "Doll", "Dott", "Edd", "Ell", "Ess", "Ett",
    "Flor", "Gill", "Hett", "Jenn", "Jess", "Kath", "Kell", "Lett", "Libb", "Lott",
    "Madd", "Magg", "Marg", "Maur", "Moll", "Nan", "Nell", "Nett", "Norr", "Patt",
    "Pegg", "Poll", "Prud", "Sall", "Sherr", "Stell", "Sull", "Tess", "Till", "Trud",
    "Wend", "Winn", "Bess", "Effi", "Hess", "Minn", "Ros", "Susi", "Vinn", "Rill",
  ];
  const DIM_SUF_M = ["ie", "y", "o"];   // -o is the rarest of the three
  const DIM_SUF_F = ["ie", "y"];

  // Plain surnames, used bare. Deliberately unshowy.
  const SUR_PLAIN = [
    "Voss", "Hart", "Bell", "Crowe", "Nash", "Wade", "Cole", "Frost", "Reed", "Lane",
    "Shaw", "Kane", "Drew", "Poe", "Brand", "Cobb", "Dodd", "Doyle", "Dunn", "Flynn",
    "Gale", "Gill", "Glass", "Grimes", "Grubb", "Hale", "Hobbs", "Hogg", "Holt", "Hook",
    "Hoyle", "Judd", "Kemp", "Kerr", "Kidd", "Lamb", "Leach", "Lock", "Marsh", "Mead",
    "Mold", "Mott", "Munn", "Nunn", "Oakes", "Pace", "Peck", "Pratt", "Quill", "Rand",
    "Rowe", "Rudd", "Sands", "Sharp", "Slade", "Snell", "Speed", "Stagg", "Steed", "Stout",
    "Swann", "Tapp", "Tate", "Thorn", "Todd", "Trask", "Trigg", "Vale", "Veale", "Vine",
    "Ward", "Weir", "Welch", "West", "Wren", "Yates", "Young", "Bourne", "Brill", "Bunce",
    "Burr", "Chubb", "Clout", "Craik", "Crisp", "Croom", "Dark", "Deane", "Dench", "Dent",
    "Dray", "Eames", "Earp", "Elms", "Fane", "Fell", "Fenn", "Fisk", "Gann", "Garth",
    "Gaunt", "Gedge", "Glew", "Gore", "Gough", "Grange", "Greer", "Gull", "Hague", "Ham",
    "Haw", "Heald", "Heap", "Hearn", "Heath", "Hine", "Hoad", "Hone", "Horn", "Howe",
    "Hulme", "Hurd", "Hyde", "Keen", "Kell", "Knapp", "Knight", "Lash", "Lees", "Lisle",
    "Loach", "Lowe", "Mace", "Mann", "Mapp", "Mears", "Milne", "Moon", "Mudd", "Nye",
    "Orme", "Paine", "Pask", "Pell", "Penn", "Plum", "Pring", "Prowse", "Raven", "Rew",
    "Rigg", "Rook", "Roper", "Rush", "Sale", "Salt", "Seed", "Sell", "Sloan", "Smart",
    "Snape", "Spry", "Stack", "Stark", "Steer", "Stone", "Storr", "Straw", "Swain", "Tarr",
    "Teale", "Thew", "Toft", "Trout", "Tuck", "Twist", "Vann", "Vick", "Vye", "Wain",
    "Wake", "Wall", "Warr", "Watt", "Webb", "Weld", "Wheat", "Whyte", "Wick", "Wild",
    "Winn", "Wise", "Wolfe", "Wood", "Wyke", "Yeo", "Ault", "Blyth", "Boak", "Braid",
    "Brisk", "Cade", "Chalk", "Clegg", "Coy", "Crake", "Creed", "Dace", "Doust", "Drage",
    "Dyer", "Egg", "Fairs", "Flack", "Foulds", "Frame", "Frisby", "Gadd", "Gaze", "Gimson",
    "Glaze", "Goss", "Gray", "Groat", "Hames", "Hance", "Hasker", "Heron", "Hitch", "Hoare",
    "Ives", "Jay", "Keast", "Kite", "Lack", "Larch", "Loft", "Lunn", "Mabb", "Meek",
    "Mist", "Nock", "Noon", "Nunns", "Oats", "Peat", "Pinch", "Plaice", "Quick", "Race",
    "Rake", "Rime", "Roach", "Rope", "Sage", "Scales", "Shanks", "Sheer", "Shrimp", "Silk",
    "Skeggs", "Sleep", "Smee", "Snook", "Spurr", "Stang", "Stew", "Stray", "Stubbs", "Swale",
    "Tame", "Tench", "Thrupp", "Tozer", "Trill", "Trunk", "Vaisey", "Verne", "Vokes", "Wace",
    "Wanless", "Whin", "Whisk", "Wort", "Yale", "Yorke", "Zeal", "Bloor", "Cusk", "Dowse",
    "Ash", "Bray", "Bunt", "Chant", "Clough", "Corke", "Dagg", "Dunk", "Fudge", "Grist",
    "Hail", "Hind", "Jeeves", "Kench", "Loveys", "Mew", "Nib", "Pank", "Quirk", "Rains",
    "Sculp", "Skene", "Sprat", "Tapley", "Uren", "Verrall", "Wicks", "Yell", "Zouch", "Prince",
  ];

  // Patronymic stems: personal names that take -son, -kins and friends.
  const PAT_STEM = [
    "Hod", "Daw", "Jack", "Wilk", "Wat", "Wil", "Rob", "Tom", "Hark", "Pear",
    "Ad", "At", "Ell", "Gib", "Har", "Hew", "Hig", "Hob", "Hodg", "Hop",
    "Hut", "Jeff", "Job", "Lam", "Law", "Mad", "Mat", "Nick", "Pat", "Paul",
    "Rich", "Sam", "Sand", "Sim", "Sut", "Ted", "Wad", "Ben", "Cul", "Dib",
    "Dob", "Duck", "Emm", "Gil", "Hank", "Jenk", "Jud", "Kit", "Lark", "Lud",
    "Marr", "Nap", "Nix", "Perr", "Rank", "Roll", "Sib", "Stub", "Tib", "Tup",
    "Wick", "Wyn", "Bat", "Codd", "Dann", "Gam", "Hann", "Ib", "Nan", "Wolf",
    "Fitch", "Gunn", "Hallam", "Jenn", "Kend", "Malc", "Nell", "Ott", "Pack", "Rand",
    "Sear", "Tolm", "Vin", "Watt", "Wray", "Bark", "Cross", "Dear", "Grig", "Kemp",
  ];
  const PAT_SUF = ["son", "kins", "kin", "ett", "man"];

  // Toponymic stems: the -ley/-ford/-worth machine, which is where most real
  // English surnames actually come from.
  const TOP_STEM = [
    "Ash", "Bark", "Bick", "Black", "Bram", "Brad", "Brant", "Buck", "Cal", "Cam",
    "Car", "Chad", "Chal", "Chip", "Clax", "Clay", "Cod", "Comp", "Cor", "Cott",
    "Cran", "Crow", "Dan", "Dar", "Daw", "Den", "Dod", "Dor", "Duck", "Dun",
    "Ead", "Elm", "Fair", "Far", "Fern", "Fos", "Gad", "Gar", "Glad", "Gos",
    "Grim", "Had", "Hal", "Ham", "Har", "Hark", "Hath", "Haw", "Hay", "Hed",
    "Hem", "Hen", "Hep", "Hig", "Hil", "Hind", "Hob", "Hock", "Hod", "Hol",
    "Hop", "Hor", "Hunt", "Ken", "Kim", "Kirk", "Lam", "Lang", "Lark", "Lath",
    "Led", "Lil", "Lind", "Ling", "Lock", "Long", "Lud", "Mal", "Man", "Mar",
    "Mars", "Med", "Mel", "Mer", "Mid", "Mil", "Mor", "Mos", "Nan", "Nap",
    "Neth", "Nor", "Oak", "Ock", "Ot", "Pack", "Pad", "Pan", "Par", "Pat",
    "Peck", "Pel", "Pem", "Pen", "Pep", "Pick", "Pil", "Pit", "Pol", "Pot",
    "Rad", "Rand", "Ratt", "Raw", "Red", "Rid", "Rig", "Ring", "Rip", "Rock",
    "Rod", "Rom", "Ros", "Roth", "Row", "Rud", "Rush", "Rye", "Sal", "Sand",
    "Sax", "Scar", "Sed", "Sel", "Ship", "Shir", "Shot", "Sil", "Skel", "Slack",
    "Small", "Smed", "South", "Spal", "Spen", "Stan", "Stap", "Stock", "Stor", "Straw",
    "Stud", "Sut", "Swan", "Tad", "Tal", "Tan", "Tarl", "Tat", "Thack", "Thir",
    "Thorn", "Til", "Tod", "Tol", "Top", "Tor", "Trem", "Trot", "Tun", "Turn",
    "Up", "Wad", "Wal", "War", "Wat", "Wed", "Wen", "West", "Whar", "Whit",
    "Wid", "Wil", "Win", "Wis", "With", "Wol", "Wood", "Wool", "Wor", "Wyn",
    "Yar", "Ab", "Bag", "Bal", "Bes", "Bod", "Bol", "Brig", "Bur", "Cad",
    "Chat", "Cul", "Dam", "Dep", "Dray", "Eas", "Fal", "Fin", "Gaw", "Gid",
    "Hain", "Hask", "Hox", "Ick", "Kel", "Lack", "Mad", "Nal", "Oke", "Pens",
    "Quar", "Ram", "Sap", "Shel", "Sib", "Tap", "Ulve", "Vel", "Wark", "Yat",
  ];
  const TOP_SUF = [
    "ley", "ton", "ford", "worth", "wick", "combe", "shaw", "field", "well", "brook",
    "ridge", "by", "thorpe", "dale", "croft", "ham", "stead", "don", "den", "low",
    "mere", "gate", "land", "bury", "wood", "beck", "cott", "hurst", "burn", "grave",
    "wray", "stone", "marsh", "moor", "leigh", "bourne",
  ];

  // Gaelic prefixes, and the roots that carry them.
  const MAC_ROOT = [
    "Bride", "Cabe", "Grath", "Kenna", "Nulty", "Ardle", "Coy", "Neice", "Vay", "Loon",
    "Kie", "Quaid", "Vey", "Ilroy", "Ateer", "Guire", "Hale", "Cann", "Bain", "Kew",
    "Auley", "Bean", "Crea", "Dade", "Elroy", "Fall", "Gill", "Hugh", "Innes", "Kell",
    "Laine", "Manus", "Neill", "Nab", "Phee", "Quarrie", "Rae", "Sorley", "Teer", "Ward",
  ];
  const O_ROOT = [
    "Dea", "Hare", "Loan", "Keefe", "Shea", "Gara", "Hanlon", "Neill", "Rourke", "Meara",
    "Toole", "Byrne", "Dowd", "Leary", "Hagan", "Grady", "Mahon", "Riada", "Hea", "Neil",
    "Beirne", "Carroll", "Coyne", "Devlin", "Fee", "Flynn", "Gorman", "Halloran", "Kane", "Lehane",
    "Malley", "Nolan", "Quinn", "Reilly", "Shaughn", "Sullivan", "Tierney", "Vaughan", "Hora", "Duffy",
  ];

  // Period abbreviations, the way a signwriter would shorten a first name.
  const ABBREV = ["Wm", "Jas", "Thos", "Geo", "Chas", "Robt", "Edwd", "Alfd", "Danl", "Saml", "Jno", "Josh", "Benj", "Fredk", "Richd", "Matt", "Nathl", "Chris"];

  const BAD = /cock|fuck|shit|cunt|wank|piss|turd|slut|twat|nigg|rape|penis|anus|arse|boob|poop|fart|spunk|whore|queer|retard|semen|jizz|hooker/i;

  // Biased pick: index pulled toward the front of the array, so the plain
  // suffixes (-ley, -ton, -son) turn up far more often than the odd ones. A real
  // set of names is lopsided; a flat one reads as machine output.
  function lean(rng, arr, bias) {
    let i = Math.floor(Math.pow(rng.f(0, 1), bias) * arr.length);
    if (i >= arr.length) i = arr.length - 1;
    if (i < 0) i = 0;
    return arr[i];
  }

  // Reject seams that no English name has: doubled letter across the join,
  // vowel meeting vowel, sibilant meeting sibilant.
  function joins(stem, suf) {
    const a = stem[stem.length - 1].toLowerCase(), b = suf[0];
    if (a === b) return false;
    if ("aeiou".includes(a) && "aeiou".includes(b)) return false;
    if ("sz".includes(a) && "sz".includes(b)) return false;
    return true;
  }

  function stemSuf(rng, stems, sufs, sBias, fBias) {
    for (let k = 0; k < 4; k++) {
      const s = lean(rng, stems, sBias), f = lean(rng, sufs, fBias);
      if (joins(s, f)) return s + f;
    }
    return null;
  }

  function givenName(rng) {
    const r = rng.f(0, 1);
    if (r < 0.62) return rng.pick(FIRST_PLAIN);
    if (r < 0.84) return rng.pick(DIM_STEM_M) + lean(rng, DIM_SUF_M, 1.8);
    return rng.pick(DIM_STEM_F) + rng.pick(DIM_SUF_F);
  }

  function surname(rng) {
    const r = rng.f(0, 1);
    let out = null;
    if (r < 0.16) out = rng.pick(SUR_PLAIN);
    else if (r < 0.62) out = stemSuf(rng, TOP_STEM, TOP_SUF, 1.1, 1.25);
    else if (r < 0.80) out = stemSuf(rng, PAT_STEM, PAT_SUF, 1.1, 1.45);
    else if (r < 0.86) out = "Mc" + rng.pick(MAC_ROOT);
    else if (r < 0.92) out = "O'" + rng.pick(O_ROOT);
    else if (r < 0.95) {
      // double-barrelled, two short bare surnames only
      const a = rng.pick(SUR_PLAIN), b = rng.pick(SUR_PLAIN);
      if (a !== b && a.length + b.length <= 9) out = a + "-" + b;
    } else out = stemSuf(rng, TOP_STEM, TOP_SUF, 1.1, 1.25);
    return out || rng.pick(SUR_PLAIN);
  }

  function makeName(rng) {
    const form = rng.f(0, 1);            // decided once, so a long re-roll
    for (let attempt = 0; attempt < 8; attempt++) {   // cannot turn a full name
      let out;                                        // into a bare one
      if (form < 0.15) out = givenName(rng);                          // bare first name
      else if (form < 0.19) out = rng.pick(ABBREV) + " " + surname(rng);   // Wm Hodkins
      else if (form < 0.22) out = givenName(rng)[0] + " " + surname(rng);  // H Blakeley
      else out = givenName(rng) + " " + surname(rng);
      const p = out.split(" ");
      if (p.length === 2 && p[0] === p[1]) continue;
      if (out.length > 15 || BAD.test(out)) continue;
      // most names want to sit under twelve characters for the lettering
      if (out.length > 12 && attempt < 5 && rng.chance(0.55)) continue;
      return out;
    }
    return rng.pick(FIRST_PLAIN) + " " + rng.pick(SUR_PLAIN);
  }

  // ---------- compose ----------
  // Silhouette is the only thing readable at grid scale, so skulls come in
  // kinds — a long square jaw, a tall narrow cranium, a wide flat block —
  // rather than one oval with every dial nudged a few percent.
  function skullKind(rng) {
    const kinds = [
      // round: wide at the cheek, short, soft
      () => ({ ratio: rng.f(1.02, 1.3), jaw: rng.f(0.95, 1.15), chin: rng.f(-0.06, 0.02),
               crown: rng.f(0.86, 1.0), cheek: rng.f(1.0, 1.18), wide: rng.f(-0.1, 0.15),
               pinch: rng.f(0.1, 0.24), skewW: rng.f(-0.08, 0.08) }),
      // long jaw: narrow, deep, widest low down
      () => ({ ratio: rng.f(0.78, 0.95), jaw: rng.f(1.15, 1.5), chin: rng.f(0.08, 0.26),
               crown: rng.f(0.82, 0.98), cheek: rng.f(0.82, 0.95), wide: rng.f(0.3, 0.6),
               pinch: rng.f(0.3, 0.55), skewW: rng.f(-0.16, 0.16) }),
      // tall cranium: high dome, small face
      () => ({ ratio: rng.f(0.8, 0.98), jaw: rng.f(0.78, 0.98), chin: rng.f(-0.02, 0.1),
               crown: rng.f(1.16, 1.42), cheek: rng.f(0.86, 1.0), wide: rng.f(-0.5, -0.15),
               pinch: rng.f(0.22, 0.44), skewW: rng.f(-0.1, 0.1) }),
      // block: flat top, square, wide at the temple
      () => ({ ratio: rng.f(1.05, 1.32), jaw: rng.f(1.05, 1.28), chin: rng.f(-0.08, 0.04),
               crown: rng.f(0.76, 0.9), cheek: rng.f(1.0, 1.2), wide: rng.f(-0.4, -0.05),
               pinch: rng.f(0.08, 0.2), skewW: rng.f(-0.06, 0.06) }),
      // pear: narrow crown, heavy jowl
      () => ({ ratio: rng.f(0.92, 1.14), jaw: rng.f(1.2, 1.48), chin: rng.f(0.0, 0.14),
               crown: rng.f(0.8, 0.96), cheek: rng.f(0.9, 1.05), wide: rng.f(0.35, 0.65),
               pinch: rng.f(0.32, 0.58), skewW: rng.f(-0.18, 0.18) }),
      // egg: the ordinary one, so the sheet has a baseline
      () => ({ ratio: rng.f(0.9, 1.08), jaw: rng.f(0.9, 1.15), chin: rng.f(-0.04, 0.1),
               crown: rng.f(0.94, 1.12), cheek: rng.f(0.94, 1.08), wide: rng.f(-0.2, 0.25),
               pinch: rng.f(0.14, 0.34), skewW: rng.f(-0.12, 0.12) }),
    ];
    return rng.pick(kinds)();
  }


  // A face is not a bag of independent traits. Pick ONE decision per head and
  // let it distort everything else — that is the difference between forty
  // people and one template sampled forty times.
  function applyQuirk(d, rng) {
    const q = rng.pick([
      "none", "none",
      "closeSet", "wideSet", "longFace", "browHeavy", "jawHeavy", "tiny", "topHeavy",
    ]);
    d.quirk = q;
    if (q === "closeSet") {
      d.eyeGap *= rng.f(0.5, 0.68);
      d.noseHeavy *= rng.f(0.75, 0.9);
      d.faceY += 0.04;
      d.pinch = Math.min(0.6, d.pinch * 1.25);
    } else if (q === "wideSet") {
      d.eyeGap = Math.min(0.6, d.eyeGap * rng.f(1.3, 1.55));
      d.noseHeavy *= rng.f(1.05, 1.25);
      d.ratio *= rng.f(1.06, 1.16);
      d.cheek *= 1.08;
    } else if (q === "longFace") {
      d.ratio *= rng.f(0.76, 0.88);
      d.chin += rng.f(0.08, 0.18);
      d.faceY -= rng.f(0.04, 0.1);
      d.jawTaper *= 0.82;
      d.noseHeavy *= rng.f(1.1, 1.3);
    } else if (q === "browHeavy") {
      d.brow = rng.f(0.1, 0.17);
      d.brows = "angry";
      d.eyes = rng.pick(["half", "squint", "half"]);
      d.faceY += rng.f(0.03, 0.08);
    } else if (q === "jawHeavy") {
      d.jaw *= rng.f(1.15, 1.32);
      d.jawAngle = rng.f(0.6, 0.85);
      d.jawTaper = rng.f(0.85, 1.05);
      d.wide = Math.min(0.6, d.wide + 0.25);
      d.faceY -= 0.05;
    } else if (q === "tiny") {
      d.eyeGap *= 0.78;
      d.noseHeavy *= 0.7;
      d.faceY += rng.f(0.06, 0.13);
      d.crown *= rng.f(1.08, 1.2);
    } else if (q === "topHeavy") {
      d.crown *= rng.f(1.12, 1.28);
      d.faceY += rng.f(0.05, 0.12);
      d.jaw *= 0.88;
      d.chin -= 0.04;
    }
    return d;
  }

  // ---------- the person ----------
  // Everything below used to be forty independent knobs, sampled. That is why
  // forty faces kept reading as one template however wide the ranges got: a
  // distribution sampled forty times has a texture, and a person deciding
  // forty times does not.
  //
  // So a character is decided FIRST — how old, how heavy, how they carry
  // themselves, what mood they are in, how much they care — and every trait
  // is derived from that. Age reaches the skull, the brow, the hairline, the
  // mouth, the stoop and the coat all at once, which is what makes a face
  // read as belonging to somebody.
  function makePerson(rng) {
    return {
      age: rng.pick(["young", "young", "mid", "mid", "mid", "old", "old"]),
      build: rng.pick(["slight", "ordinary", "ordinary", "heavy", "heavy"]),
      bearing: rng.pick(["slumped", "neutral", "neutral", "upright", "cocky"]),
      mood: rng.pick(["dour", "blank", "blank", "wary", "pleased", "amused"]),
      care: rng.pick(["unkempt", "unkempt", "plain", "plain", "groomed"]),
    };
  }

  // ---------- house style ----------
  // A plate is one person sitting down forty-eight times, not forty-eight
  // auditions. Every previous round answered "it reads as a template" by
  // adding another axis of variation; this does the opposite.
  //
  // One hero per face. Everything else drops to a default. The sheet gets
  // quieter and more the same, which is the point — a slightly dull face is
  // rest, and rest is what lets the eye move across a sheet.
  function applyHouseStyle(d, rng) {
    const hero = rng.pick([
      "hair", "hair", "hair",
      "hat", "hat",
      "glasses", "patch", "beard", "bald", "turn", "nose",
    ]);
    d.hero = hero;

    // --- defaults: dumb, small, and out of the way ---
    d.eyes = rng.pick(["open", "open", "dot", "bare"]);
    d.mouth = rng.pick(["line", "line", "smile", "smirk"]);
    d.beard = "none";
    d.colour = null;
    d.nose = rng.pick(["silhouette", "line", "wedge", "column", "hook"]);
    d.noseHeavy = rng.f(0.85, 1.1);
    d.hair = rng.pick(["thatch", "thatch", "comb", "comb", "buzz", "recede"]);
    d.brows = rng.pick(["flat", "none", "flat"]);
    d.yaw *= 0.7;

    // --- then turn exactly one thing up ---
    if (hero === "hair") {
      d.hair = rng.pick(["messy", "spiky", "curly", "side", "bowl", "thatch", "comb"]);
    } else if (hero === "hat") {
      d.hair = rng.pick(["beanie", "flat", "baseball", "band"]);
    } else if (hero === "glasses") {
      d.eyes = "glasses";
      d.hair = rng.pick(["comb", "buzz", "recede", "bowl"]);
    } else if (hero === "patch") {
      d.eyes = rng.pick(["patch", "shades", "wink"]);
      d.hair = rng.pick(["comb", "buzz", "bowl"]);
    } else if (hero === "beard") {
      d.beard = rng.pick(["beard", "stache", "goatee"]);
      d.hair = rng.pick(["recede", "buzz", "comb", "bald"]);
    } else if (hero === "bald") {
      d.hair = rng.pick(["bald", "bald", "recede"]);
      d.brows = rng.pick(["angry", "arch", "flat"]);
    } else if (hero === "turn") {
      d.yaw = rng.f(0.5, 0.78) * rng.sign();
      d.hair = rng.pick(["buzz", "comb", "bowl", "flat"]);
    } else if (hero === "nose") {
      d.nose = rng.pick(["silhouette", "wedge", "hook", "column", "snub"]);
      d.noseHeavy = rng.f(1.05, 1.35);
      d.hair = rng.pick(["buzz", "comb", "recede", "bowl"]);
    }

    // colour is a decision too, and rarely: his sheet is one face in five
    if (rng.chance(0.46)) d.colour = rng.pick(["head", "head", "head", "hat", "behind"]);

    // --- clamp the ensemble. Per-face ink variance is the generator look:
    // his sd is about 5, ours ran 8-9 by letting scale be a personality trait.
    d.size = 112 * rng.f(0.93, 1.07);
    d.ratio = Math.max(0.9, Math.min(1.16, d.ratio));
    d.crown = Math.max(0.88, Math.min(1.14, d.crown));
    d.jaw = Math.max(0.88, Math.min(1.22, d.jaw));
    d.chin = Math.max(-0.04, Math.min(0.14, d.chin));
    d.lobeAmp = Math.min(d.lobeAmp, 0.055);
    d.jawTaper = Math.max(0.72, Math.min(1.0, d.jawTaper));
    d.pinch = Math.max(0.12, Math.min(0.34, d.pinch));
    d.pen = rng.f(0.98, 1.12);
    // and which pen was on the desk. On a plate this varies face to face,
    // the way a sheet filled over a week does.
    d.penKind = rng.pick(PEN_BAG);
    return d;
  }

  function makeDude(rng) {
    const P = makePerson(rng);
    const old = P.age === "old";
    const young = P.age === "young";
    const heavy = P.build === "heavy";
    const slight = P.build === "slight";

    // --- the skull answers to age and build ---
    const skull = skullKind(rng);
    if (heavy) {
      skull.ratio *= rng.f(1.08, 1.2);
      skull.cheek *= rng.f(1.08, 1.18);
      skull.jaw *= rng.f(1.05, 1.18);
      skull.wide = Math.min(0.6, skull.wide + 0.2); // widest low down: jowls
      skull.pinch *= 0.8;
    } else if (slight) {
      skull.ratio *= rng.f(0.84, 0.94);
      skull.cheek *= rng.f(0.86, 0.96);
      skull.pinch *= 1.2;
    }
    if (old) {
      skull.chin += rng.f(0.04, 0.12); // the face lengthens
      skull.jaw *= rng.f(0.9, 1.0); // and the jaw softens
    } else if (young) {
      skull.crown *= rng.f(1.04, 1.14); // bigger cranium over a smaller face
      skull.chin -= rng.f(0.0, 0.06);
    }

    // keep the compounding in bounds: a heavy multiplier on top of an already
    // wide archetype was producing pancakes
    skull.ratio = Math.max(0.72, Math.min(1.34, skull.ratio));
    skull.cheek = Math.max(0.8, Math.min(1.24, skull.cheek));
    skull.jaw = Math.max(0.78, Math.min(1.5, skull.jaw));
    skull.crown = Math.max(0.74, Math.min(1.4, skull.crown));

    // --- how they hold their head ---
    const pitch =
      P.bearing === "slumped" ? rng.f(0.06, 0.28)
      : P.bearing === "cocky" ? rng.f(-0.3, -0.08)
      : P.bearing === "upright" ? rng.f(-0.16, 0.04)
      : rng.f(-0.2, 0.2);
    const roll = P.bearing === "cocky" ? rng.f(-0.18, 0.18) * rng.sign() : rng.f(-0.1, 0.1);
    const lean =
      P.bearing === "cocky" ? rng.f(0.16, 0.4) * rng.sign()
      : P.bearing === "slumped" ? rng.f(-0.12, 0.12)
      : rng.f(-0.28, 0.28);

    // --- mood reaches the mouth, the brows and the eyes together ---
    const mouth =
      P.mood === "dour" ? rng.pick(["frown", "line", "line", "lips"])
      : P.mood === "pleased" ? rng.pick(["smile", "smile", "teeth"])
      : P.mood === "amused" ? rng.pick(["smirk", "smile", "teeth", "open"])
      : P.mood === "wary" ? rng.pick(["line", "pucker", "smirk"])
      : rng.pick(["line", "open", "pucker", "smile"]);
    const brows =
      P.mood === "dour" ? rng.pick(["angry", "angry", "flat"])
      : P.mood === "wary" ? rng.pick(["angry", "arch"])
      : P.mood === "amused" ? rng.pick(["arch", "arch", "flat"])
      : rng.pick(["flat", "arch", "none", "flat"]);
    let eyes =
      P.mood === "dour" ? rng.pick(["half", "squint", "mix"])
      : P.mood === "amused" ? rng.pick(["mix", "wink", "closed", "open"])
      : P.mood === "wary" ? rng.pick(["squint", "half", "mix"])
      : rng.pick(["mix", "mix", "open", "bare", "dot"]);
    if (rng.chance(old ? 0.3 : 0.16)) eyes = "glasses";
    else if (rng.chance(0.07)) eyes = rng.pick(["shades", "patch"]);

    // --- age and care decide the hair, together ---
    let hair;
    if (old) {
      hair = rng.pick(["recede", "recede", "bald", "bald", "comb", "flat", "band", "buzz"]);
    } else if (young) {
      hair = rng.pick(["spiky", "messy", "thatch", "thatch", "bowl", "curly", "beanie", "baseball", "comb"]);
    } else {
      hair = rng.pick(["comb", "comb", "thatch", "side", "buzz", "bowl", "flat", "baseball", "beanie", "curly"]);
    }
    if (P.care === "groomed" && (hair === "messy" || hair === "thatch")) hair = rng.pick(["comb", "side", "flat"]);
    if (P.care === "unkempt" && (hair === "comb" || hair === "flat")) hair = rng.pick(["messy", "thatch", "spiky"]);

    const beard =
      P.care === "unkempt" ? rng.pick(["stubble", "beard", "beard", "stache", "none"])
      : P.care === "groomed" ? rng.pick(["none", "none", "none", "stache", "goatee"])
      : rng.pick(["none", "none", "stubble", "stache", "goatee", "beard"]);

    // --- and what they are wearing ---
    const kind =
      old ? rng.pick(["jacket", "jacket", "sweater", "sweater", "tee"])
      : young ? rng.pick(["tee", "tee", "hoodie", "hoodie", "jacket"])
      : rng.pick(["tee", "hoodie", "jacket", "sweater"]);
    const pose =
      P.bearing === "cocky" ? rng.pick(["hips", "hips", "pockets"])
      : P.bearing === "slumped" ? rng.pick(["pockets", "down", "folded"])
      : rng.pick(["down", "down", "pockets", "hips", "folded"]);

    const d = applyHouseStyle(applyQuirk({
      person: P,
      name: makeName(rng),
      yaw: rng.f(-0.75, 0.75),
      pitch,
      roll,
      lean,
      depth: rng.f(1.05, 1.5),
      size: rng.f(102, 122) * (slight ? 0.96 : heavy ? 1.03 : 1),
      hair,
      hairTone: rng.pick(["solid", "solid", "cross", "cross", "half"]),
      shade: rng.chance(0.26),
      hairColor: rng.pick(["#1a1712", "#211c16", "#181614", "#2a2218", "#1c1a16"]),
      eyes,
      nose: rng.pick(
        old ? ["wedge", "hook", "hook", "column", "line"]
        : young ? ["snub", "snub", "nostrils", "line", "column"]
        : ["line", "wedge", "hook", "column", "wedge", "snub"]
      ),
      noseHeavy: rng.f(0.85, 1.18) * (old ? rng.f(1.05, 1.15) : young ? rng.f(0.88, 1.0) : 1),
      mouth,
      beard,
      colour: rng.chance(0.4) ? rng.pick(["head", "head", "head", "body", "body", "behind"]) : null,
      skin: null,
      clothes: {
        kind,
        pose,
        wash: null,
        pattern: rng.pick(
          P.care === "groomed" ? [null, null, "stripe", "dark"]
          : [null, null, null, "stripe", "stripe", "vstripe", "dark"]
        ),
        darkLegs: rng.chance(0.3),
      },
      ...skull,
      // the feature band rides low on a long old face, high on a young one
      faceY: rng.f(-0.05, 0.17) + (old ? rng.f(0.0, 0.06) : young ? rng.f(-0.06, 0.0) : 0),
      gaze: rng.f(-1, 1),
      eyeGap: rng.f(0.27, 0.46) * (heavy ? rng.f(1.0, 1.12) : 1),
      lobeA: rng.pick([2, 3, 3, 4, 5]),
      lobeB: rng.pick([5, 6, 7, 8, 9]),
      lobeAmp: rng.f(0.03, 0.085) * (old ? 1.25 : 1), // an older head is lumpier
      brow: (old || P.mood === "dour") && rng.chance(0.6) ? rng.f(0.07, 0.16) : rng.chance(0.3) ? rng.f(0.05, 0.11) : 0,
      jawAngle: rng.chance(0.86) ? rng.f(0.26, 0.82) * (heavy ? 1.15 : 1) : 0,
      jawHigh: rng.f(-0.16, 0.2),
      jawTaper: rng.f(0.58, 1.05) * (heavy ? rng.f(1.05, 1.2) : slight ? rng.f(0.85, 0.95) : 1),
      chinX: rng.f(-0.16, 0.16),
      chinW: rng.f(0.06, 0.34),
      lobePh: rng.f(0, Math.PI * 2),
      flat: rng.chance(0.55) ? rng.f(0.05, 0.14) : 0,
      flatA: rng.f(-Math.PI, Math.PI),
      pen: rng.f(0.9, 1.22),
      brows,
    }, rng), rng);
    // The cut of the hair is the person's, not a roll the pen takes while
    // drawing the face. If it is picked from the mark stream after the ears
    // and the outline, a turn that hides an ear re-rolls the hairline and
    // he is wearing a different head every frame.
    d.hairShape = rng.pick(["flat", "peak", "peak", "round", "sweep", "receded", "jagged", "low"]);
    d.hairOuter = rng.pick(["skull", "skull", "quiff", "flattop", "dome", "wedge", "wedge", "sweep"]);
    // How he moves is as much his as the haircut. Same seed, same nerves.
    d.nerves = makeNerves(lockRng(rng, "nerves"), P);
    // Fat, legs and muscle are the body's haircut — once, on load.
    d.body = makeBodyPlan(lockRng(rng, "build"), P);
    return d;
  }

  // The marks that make one dude, drawn about (cx, cy) at size s. Split out of
  // drawDude so the identical strokes can be laid down twice: once into a
  // throwaway bitmap, to find out how much room this particular dude needs —
  // his hat, his swung arm, his shoes — and once for real. Nothing in here
  // knows about the page, so the caller is free to put him where he fits.
  function figureInk(c, R, dude, cx, cy, s, opt) {
    const rng = R.mark;
    const headOnly = !!(opt && opt.headOnly);
    setPen(dude.penKind);

    // The head rides the torso, so it takes the whole bob and sway — the body
    // fades its displacement out towards the floor, the head never does. And
    // the pose deltas go into the skull itself rather than onto the finished
    // drawing, which is the entire point of there being a skull: the ears, the
    // hair, the hat and the far eye turn with it instead of sliding across it.
    const bodyS = s * 0.9;
    const hx = cx + MOTION.sway * bodyS;
    const hy = cy + MOTION.bob * bodyS;
    const yaw = dude.yaw + MOTION.yaw + VIEW_YAW;
    const pitch = Math.max(-0.6, Math.min(0.6, dude.pitch + MOTION.pitch));
    const roll = dude.roll + MOTION.roll;

    const skull = new Skull(hx, hy, s, yaw, pitch, roll, dude.ratio, dude.depth, {
      jaw: dude.jaw,
      chin: dude.chin,
      crown: dude.crown,
      cheek: dude.cheek,
      lobeA: dude.lobeA,
      lobeB: dude.lobeB,
      lobeAmp: dude.lobeAmp,
      lobePh: dude.lobePh,
      flat: dude.flat,
      flatA: dude.flatA,
      wide: dude.wide,
      pinch: dude.pinch,
      skewW: dude.skewW,
      brow: dude.brow,
      jawAngle: dude.jawAngle,
      jawHigh: dude.jawHigh,
      jawTaper: dude.jawTaper,
      chinX: dude.chinX,
      chinW: dude.chinW,
    });
    skull.pen = dude.pen;
    skull.faceY = dude.faceY;
    skull.gaze = dude.gaze;
    skull.eyeGap = dude.eyeGap;
    if (dude.colour === "behind") {
      // A wash "behind" the figure that is composited last is not behind
      // anything. It goes down on the paper first, before a single mark.
      const rr = s * R.colour.f(0.95, 1.25);
      const blob = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const k = rr * (1 + (fbm2(i * 0.5, 3, R.colour.seed) - 0.5) * 0.3);
        blob.push({ x: hx + Math.cos(a) * k, y: hy + Math.sin(a) * k * 1.08 });
      }
      colourPass(c, R.colour, s, [{ pts: blob }]);
    }

    const body = headOnly
      ? { footY: hy, maxX: hx, core: null }
      : drawBody(c, R.body, cx, cy + s * 1.18, bodyS, dude.lean, dude.clothes, dude.person, {
          yaw,
          pitch,
          roll,
          depth: dude.depth,
          body: dude.body,
        });
    const hull = skull.silhouette();
    const prof = noseProfile(skull, dude);
    // His commonest nose is the contour itself, so bend the hull before it is
    // filled or stroked and then draw no bridge at all.
    const bump = dude.nose === "silhouette" ? noseBump(skull, hull, rng, prof) : null;
    headFill(c, rng, skull, hull, dude.skin);
    const nose = bump ? silhouetteNose(c, rng, skull, hull, bump, prof) : drawNose(c, rng, skull, dude.nose, dude.noseHeavy, dude);
    if (nose && bump) nose.bump = bump;
    // The hoop stops where the nose is. A chance of leaving it closed is
    // how the face outline used to show through the nose.
    let gaps = outlineGaps(skull, hull, [nose && nose.outer]);
    if (nose && nose.outer) {
      const rad = skull.s * 0.06;
      for (let i = 0; i < hull.length; i++) {
        if (nearPath(hull[i], nose.outer, rad)) gaps[i] = true;
      }
    }
    // Eyes sit on the hoop. If the hoop is left intact, it reads through
    // the white no matter how we fill the almond afterwards.
    {
      const eg = skull.eyeGap ?? 0.36;
      const fy = skull.faceY || 0;
      const eL = landmark(skull, { x: -eg, y: -0.12 + fy, z: 0.88 });
      const eR = landmark(skull, { x: eg, y: -0.12 + fy, z: 0.88 });
      const er = skull.s * 0.15;
      for (let i = 0; i < hull.length; i++) {
        if (eL.nz > 0.04 && Math.hypot(hull[i].x - eL.x, hull[i].y - eL.y) < er) gaps[i] = true;
        if (eR.nz > 0.04 && Math.hypot(hull[i].x - eR.x, hull[i].y - eR.y) < er) gaps[i] = true;
      }
    }
    if (bump) {
      // keep the knuckle, but still allow the eye gaps we just marked
    }
    headOutline(c, rng, skull, hull, gaps);
    // the shadow falls away from the turn
    if (dude.shade) cheekHatch(c, rng, skull, hull, -(Math.sign(prof.x) || 1));
    const inFront = [];
    const hairMassPts = drawHair(c, R.hair || rng, skull, hull, dude.hair, penShade(dude.hairColor), inFront, dude.hairTone, {
      shape: dude.hairShape,
      outer: dude.hairOuter,
    });
    drawBrows(c, rng, skull, dude.brows);
    drawEyes(c, rng, skull, dude.eyes);
    // beard first: a filled mass drawn after the mouth swallows it
    drawFacialHair(c, rng, skull, dude.beard);
    drawMouth(c, rng, skull, dude.mouth, nose);
    // Mouth and hoop were drawn after the nose, so they sat on top of it.
    // Cover them: the nose is in front of the face.
    coverNose(c, rng, skull, nose, hull);
    drawEars(c, rng, skull); // after the hoop, so it cannot show through the head
    inFront.forEach((f) => f()); // brims and locks sit over the face, not under it
    // A plate of heads needs a neck. Every reference sheet has one; a head
    // floating alone on the paper does not read. The caller decides, once,
    // so a turn cannot spend the rng differently and make it flicker off.
    if (headOnly && opt.neck) drawNeck(c, rng, skull);

    if (dude.colour && dude.colour !== "behind") {
      const targets = [];
      if (dude.colour === "head") targets.push({ pts: hull });
      if (dude.colour === "hat" && hairMassPts) targets.push({ pts: hairMassPts });
      if (dude.colour === "body" && body.core) targets.push({ pts: body.core });
      if (!targets.length) targets.push({ pts: hull });
      colourPass(c, R.colour, s, targets);
    }

    let inkRight = body.maxX;
    for (const q of hull) if (q.x > inkRight) inkRight = q.x;
    return { footY: body.footY, inkRight };
  }

  // ---------- the words on the paper ----------
  //
  // The button and the credit are written on the sheet in the same ink as the
  // drawing, at a size you can actually read. They used to be separate little
  // canvases sitting below the paper, which read as a web page with a picture
  // on it rather than as one drawn page.
  //
  // Widths are estimated rather than measured: a glyph advances about 0.9 of
  // its size and drawName adds a gap, so 0.95 per character with a little at
  // the ends is close and always a shade generous.
  const BTN_TEXT = "another dude";
  const CREDITS = ["inspired by mannay", "ruined by @johnbr0"];
  // The keys, written on the paper like everything else — and pressable, so
  // the thing works on a phone, where there is no A to press. The first line
  // says what pressing it will do, not what state he is in.
  const LEGEND_MOVE = ["a  animate", "a  let him rest"];
  const LEGEND_MOTION = "animate";

  function inkWidth(text, size) {
    return size * (text.length * 0.95 + 0.9);
  }

  // A phone parks its home indicator over the bottom of the sheet. The CSS
  // holds the inset; this reads it back rather than guessing at a number.
  const safeEl = document.getElementById("safe");
  function safeBottom() {
    return safeEl ? Math.min(48, safeEl.offsetHeight || 0) : 0;
  }

  // Worked out before anything is drawn, because the figure has to be fitted
  // into whatever is left above it.
  function footerLayout(w, h, moving) {
    const pad = Math.max(14, Math.min(w * 0.055, 34));
    const inner = w - pad * 2;
    // big enough to read on a phone, held back from shouting on a desktop,
    // and never taller than the sheet can spare
    const btn = Math.max(16, Math.min(30, inner / 13.2, h * 0.038));
    const cred = Math.max(11.5, Math.min(btn * 0.72, inner / 19.6));
    const credW = Math.max(inkWidth(CREDITS[0], cred), inkWidth(CREDITS[1], cred));
    const btnW = inkWidth(BTN_TEXT, btn);
    const legend = [moving ? LEGEND_MOVE[1] : LEGEND_MOVE[0], LEGEND_MOTION];
    // "something" has a descender; the label above it does not
    const legLead = cred * 1.7;
    const legW = Math.max(inkWidth(legend[0], cred), inkWidth(legend[1], cred));
    // the label and the keys under it are one column now
    const leftW = Math.max(btnW, legW);
    const leftH = btn * 1.95 + legLead * legend.length;
    // side by side when the two columns fit with a gap worth the name, and
    // stacked when they do not — a phone gets the label over the credit
    const cols = leftW + credW + pad * 3 <= w;
    // enough to clear the descenders on "inspired by" and "@johnbr0"
    const credLead = cred * 1.95;
    const bandH = cols
      ? Math.max(leftH, credLead + cred * 1.45) + pad * 0.7
      : btn * 1.95 + legLead * legend.length + credLead + cred * 1.9 + pad * 0.4;
    const bottom = h - Math.max(14, pad * 0.8) - safeBottom();
    return { pad, btn, cred, btnW, credW, credLead, legend, legLead, legW, leftW, leftH, cols, bottom, top: bottom - bandH };
  }

  function drawFooter(c, seed, w, F) {
    const hits = {};
    const box = (x, y, adv, size, minH) => {
      const bx = x - size * 0.6;
      const by = y - size * 0.32;
      const bw = adv + size * 1.2;
      const bh = size * 1.75;
      if (minH && bh < minH) {
        return { x: bx, y: by - (minH - bh) / 2, w: bw, h: minH };
      }
      return { x: bx, y: by, w: bw, h: bh };
    };

    // x is the glyph's centre line, so half a letter is added to make the
    // left margin on the page actually equal to the padding
    // the keys, written under the label they belong with
    const legendAt = (x, y0) => {
      F.legend.forEach((t, i) => {
        const y = y0 + i * F.legLead;
        const a = drawName(c, rngFor(seed, "footer", 3 + i), t, x, y, F.cred, { caps: false, rule: false, w: 0.07 });
        hits[i ? "motion" : "move"] = box(x, y, a, F.cred, Math.max(F.legLead, 34));
      });
    };

    if (F.cols) {
      const bx = F.pad + F.btn * 0.5;
      const by = F.top + (F.bottom - F.top - F.leftH) * 0.5 + F.btn * 0.1;
      const adv = drawName(c, rngFor(seed, "footer", 0), BTN_TEXT, bx, by, F.btn, { caps: false, rule: true, w: 0.075 });
      hits.another = box(bx, by, adv, F.btn, 44);
      legendAt(F.pad + F.cred * 0.5, by + F.btn * 1.85);
      const rx = w - F.pad - F.credW + F.cred * 0.5;
      const ry = F.top + (F.bottom - F.top - (F.credLead + F.cred * 1.45)) * 0.5 + F.cred * 0.1;
      CREDITS.forEach((t, i) => {
        const y = ry + i * F.credLead;
        const a = drawName(c, rngFor(seed, "footer", i + 1), t, rx, y, F.cred, { caps: false, rule: false, w: 0.07 });
        hits[i ? "b" : "a"] = box(rx, y, a, F.cred, F.credLead);
      });
    } else {
      const bx = F.pad + F.cred * 0.5;
      const by = F.top + F.btn * 0.25;
      const adv = drawName(c, rngFor(seed, "footer", 0), BTN_TEXT, bx, by, F.btn, { caps: false, rule: true, w: 0.075 });
      hits.another = box(bx, by, adv, F.btn, 44);
      const ly = by + F.btn * 1.85;
      legendAt(bx, ly);
      const ry = ly + F.legLead * F.legend.length + F.cred * 0.25;
      CREDITS.forEach((t, i) => {
        const y = ry + i * F.credLead;
        const a = drawName(c, rngFor(seed, "footer", i + 1), t, bx, y, F.cred, { caps: false, rule: false, w: 0.07 });
        hits[i ? "b" : "a"] = box(bx, y, a, F.cred, F.credLead);
      });
    }
    return hits;
  }

  // ---------- fitting him on the page ----------
  //
  // How tall a dude comes out is not a constant. A hat, a swung arm and a
  // long pair of legs between them move the top and the bottom by most of a
  // head, so a fixed size either clips someone on a phone or leaves half the
  // sheet empty on a desktop. He is therefore drawn once, at a canonical
  // size, into an offscreen bitmap that is never shown, and his ink is
  // measured. The page then scales that measurement to whatever room it has.
  //
  // He is always drawn at CANON and scaled by the canvas transform, never by
  // passing a different s. The nib resamples in user units, so changing s
  // changes how many random numbers a stroke consumes, and the measured dude
  // would no longer be the dude that got drawn. Under a transform the stream
  // is identical, so the measurement is exact rather than approximate.
  const CANON = 110;
  let measCv = null;
  const extentCache = new Map();

  function figureExtent(seed, dude, tag) {
    const key = `${seed >>> 0}:${tag || ""}`;
    const hit = extentCache.get(key);
    if (hit) return hit;
    // generous enough that nothing can run off the edge of the measuring
    // sheet and be measured short
    const mw = CANON * 11;
    const mh = CANON * 13;
    const ox = mw * 0.5;
    const oy = CANON * 3;
    // if the pixels cannot be read back, assume a big dude rather than a
    // clipped one
    let ext = { up: CANON * 1.35, down: CANON * 6.3, left: CANON * 2.1, right: CANON * 2.1 };
    try {
      if (!measCv) measCv = document.createElement("canvas");
      measCv.width = mw;
      measCv.height = mh;
      const mc = measCv.getContext("2d", { willReadFrequently: true });
      mc.setTransform(1, 0, 0, 1, 0, 0);
      mc.clearRect(0, 0, mw, mh);
      // Both passes must draw about the SAME origin, not merely at the same
      // size. The nib skips a stroke where the paper tooth is high, and the
      // tooth is sampled in user coordinates — draw him somewhere else on the
      // sheet and a different set of marks survives, which consumes a
      // different number of random numbers and hands back a different dude.
      // So the offset goes in the transform and he is always drawn at 0, 0.
      mc.setTransform(1, 0, 0, 1, ox, oy);
      const MR = { mark: rngFor(seed, "mark"), body: rngFor(seed, "body"), colour: rngFor(seed, "colour"), hair: rngFor(seed, "hair") };
      figureInk(mc, MR, dude, 0, 0, CANON);
      const d = mc.getImageData(0, 0, mw, mh).data;
      let x0 = mw;
      let y0 = mh;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0, p = 3; y < mh; y++) {
        for (let x = 0; x < mw; x++, p += 4) {
          if (d[p] > 12) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 > x0 && y1 > y0) {
        const m = { up: oy - y0, down: y1 - oy, left: ox - x0, right: x1 - ox };
        // if his ink reached the edge of the measuring sheet he is bigger
        // than what was measured, so that side falls back to the safe guess
        if (y0 <= 0) m.up = Math.max(m.up, ext.up);
        if (y1 >= mh - 1) m.down = Math.max(m.down, ext.down);
        if (x0 <= 0) m.left = Math.max(m.left, ext.left);
        if (x1 >= mw - 1) m.right = Math.max(m.right, ext.right);
        ext = m;
      }
    } catch (e) {
      /* keep the conservative fallback */
    }
    if (extentCache.size > 48) extentCache.clear();
    extentCache.set(key, ext);
    return ext;
  }

  // A moving dude needs room for the tallest thing he does, not for the pose
  // he happens to be in when the page loads. So he is measured at several
  // points around his cycle and given the union — otherwise the frame he
  // waves in is the frame his hand goes off the top of the sheet.
  function motionExtent(seed, dude, kind) {
    const was = MOTION;
    const ext = { up: 0, down: 0, left: 0, right: 0 };
    try {
      // Ten points round the cycle, not six: the frames between the samples
      // are real frames, and a hand that reaches furthest between two of them
      // would be clipped by the band that gets repainted.
      const N = 10;
      for (let i = 0; i < N; i++) {
        MOTION = motionAt(kind, i / N);
        const e = figureExtent(seed, dude, `${kind}${i}`);
        ext.up = Math.max(ext.up, e.up);
        ext.down = Math.max(ext.down, e.down);
        ext.left = Math.max(ext.left, e.left);
        ext.right = Math.max(ext.right, e.right);
      }
    } finally {
      MOTION = was;
    }
    return ext;
  }

  function drawDude(c, R, dude, w, h, seed, opt = {}) {
    paper(c, w, h, R.paper);
    const foot = footerLayout(w, h, false);
    // Placement draws from its own stream. It used to come off "mark", which
    // meant the measuring pass and the real pass were no longer the same dude
    // — and it is the wrong stream anyway: where he stands on the sheet is
    // not one of his marks.
    const rng = R.place;
    const ext = figureExtent(seed, dude);

    // room kept under the feet for a name written down there, so the fit is
    // the same whichever gap the hand picks later
    const nameRoom = CANON * 0.62;
    const mx = Math.max(12, Math.min(w * 0.05, 40));
    const top = Math.max(10, Math.min(h * 0.035, 34));
    const availH = Math.max(80, foot.top - top);
    const availW = Math.max(80, w - mx * 2);
    // a slight person is still drawn a little smaller than a heavy one — the
    // old absolute sizes, kept as a proportion of whatever the sheet allows
    const rel = 0.88 + 0.12 * Math.max(0, Math.min(1, (dude.size - 98) / 28));
    const k = Math.min(availH / (ext.up + ext.down + nameRoom), availW / (ext.left + ext.right), 1.5) * rel;
    const s = CANON * k;

    // he sits left of centre, the way a hand starts a figure with the margin
    // for a name still in mind — but only as far as there is room for
    const loX = mx + ext.left * k;
    const hiX = w - mx - ext.right * k;
    let cx = w * rng.f(0.38, 0.48) + rng.f(-8, 8);
    cx = hiX < loX ? (loX + hiX) / 2 : Math.max(loX, Math.min(hiX, cx));
    let cy = top + ext.up * k + rng.f(0, Math.max(0, availH - (ext.up + ext.down + nameRoom) * k));

    let fig;
    if (opt.skipFigure) {
      fig = { footY: ext.down, inkRight: ext.right };
    } else {
      c.save();
      c.translate(cx, cy);
      c.scale(k, k);
      fig = figureInk(c, R, dude, 0, 0, CANON);
      c.restore();
    }

    const footY = cy + fig.footY * k;
    const inkRight = cx + fig.inkRight * k;
    const bodyMaxX = inkRight;

    // The name goes where there is room, the way a hand writes it in the gap
    // it finds — not pinned at the same offset off the jaw every time.
    let size = s * rng.f(0.19, 0.29);
    const nameLen = String(dude.name).length;
    // and it never grows wider than the sheet, however small the sheet is
    size = Math.min(size, (w - mx * 2) / (nameLen * 0.95 + 0.8));
    // keep it clear of the silhouette — a name cutting through a shoulder
    // is the one thing a person writing it would never do
    const spot = rng.pick(["jaw", "jaw", "shoulder", "feet", "feet"]);
    // the lowest a baseline can go and still leave the descenders clear of the
    // footer band
    const lowY = foot.top - size * 1.95;
    let nameX;
    let nameY;
    if (spot === "feet") {
      nameX = cx + s * rng.f(-1.4, 0.5);
      nameY = Math.min(lowY, footY + s * rng.f(0.28, 0.7));
    } else if (spot === "shoulder") {
      nameX = Math.max(bodyMaxX + s * rng.f(0.14, 0.4), cx + s * 1.35);
      nameY = cy + s * rng.f(1.6, 2.4);
    } else {
      nameX = Math.max(bodyMaxX + s * rng.f(0.1, 0.32), cx + s * 1.15);
      nameY = cy + s * rng.f(0.0, 0.55);
    }
    if (spot !== "feet") nameX = Math.max(nameX, inkRight + s * rng.f(0.12, 0.34));
    const nameW = size * (nameLen * 0.95 + 0.8);
    if (spot !== "feet" && nameX + nameW > w - mx) {
      // no room in the margin, so it goes under the feet
      nameX = Math.max(mx, cx + s * rng.f(-1.4, 0.3));
      nameY = Math.min(lowY, footY + s * rng.f(0.28, 0.7));
    }
    nameX = Math.max(mx * 0.6 + size * 0.6, Math.min(w - nameW - mx * 0.5, nameX));
    nameY = Math.max(size * 0.9, Math.min(lowY, nameY));
    drawName(c, R.name, dude.name, nameX, nameY, size);

    // The furniture at the foot of the page is not part of the drawing, so it
    // is not written with whatever pen the drawing happened to use.
    setPen("nib");
    const hits = drawFooter(c, seed, w, foot);
    grainPass(c, c.__dpr);
    return { hits, cx, cy, k };
  }

  // ---------- colour ----------
  // Measured off the reference rather than guessed: 8.2% of the sheet carries
  // colour, on 40% of the faces, at hue 30 (warm tan) for four fifths of it,
  // with olive and a cold blue-grey behind, saturation 0.2 and value 0.6-0.8.
  // It goes down as a flat patch that does NOT line up with the ink — the
  // off-register is the whole character of it, like a second pass on a press.
  // Measured off images/IMG_5229: 19 of 48 faces carry colour, the median
  // patch is 22% of its cell, and the palette is warmer and PALER than the
  // one taken off the other sheet — hue 15-45, saturation 0.12-0.25, value
  // 0.75-0.88. Everything I had was a stop or two too dark.
  const WASHES = [
    "#dfd1c3", "#dfc3a7", "#dfc3a7", "#dfcac3", "#dfb5a7",
    "#bfb3a7", "#dfd8c3", "#dfd1a7", "#bfa78f", "#c8b49c",
    "#b9c0c9", "#c2c4a8",
  ];

  function offRegister(pts, rng, k) {
    const dx = rng.f(-1, 1) * k;
    const dy = rng.f(-1, 1) * k;
    const g = rng.f(0.78, 1.04);
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
    return pts.map((p) => ({ x: cx + (p.x - cx) * g + dx, y: cy + (p.y - cy) * g + dy }));
  }

  // How it goes down matters more than which colour it is. Zoomed in, his
  // fills are not flat and they are not neat hatching: they are short strokes
  // of VARYING length, laid at a slant, overlapping unevenly, with the colour
  // building where they cross and paper showing between them. The pencil
  // starts and stops inside the shape and runs past its edge in places.
  function colourPass(c, rng, s, targets) {
    if (!targets.length) return;
    const n = rng.chance(0.22) ? 2 : 1;
    const used = [];
    for (let i = 0; i < n; i++) {
      const t = rng.pick(targets);
      if (!t || !t.pts || t.pts.length < 3 || used.indexOf(t) >= 0) continue;
      used.push(t);
      const pts = offRegister(t.pts, rng, s * rng.f(0.05, 0.16));
      const col = t.color || rng.pick(WASHES);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const span = Math.hypot(x1 - x0, y1 - y0);
      const mode = rng.pick(["scribble", "scribble", "scribble", "zigzag", "flat", "flat"]);

      c.save();
      c.globalCompositeOperation = "multiply";
      // clip to a slightly enlarged shape, so the pencil can run past the ink
      c.beginPath();
      pts.forEach((p, j) => {
        const q = { x: cx + (p.x - cx) * 1.12, y: cy + (p.y - cy) * 1.12 };
        return j ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y);
      });
      c.closePath();
      c.clip();

      if (mode === "flat") {
        c.globalAlpha = rng.f(0.55, 0.9);
        c.fillStyle = col;
        c.beginPath();
        pts.forEach((p, j) => (j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.fill();
      } else {
        const ang = rng.f(-1.2, -0.4);
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const pitch = s * rng.f(0.05, 0.11);
        c.strokeStyle = col;
        c.lineCap = "round";
        if (mode === "zigzag") {
          // one continuous back-and-forth, the turns left visible
          c.globalAlpha = rng.f(0.4, 0.7);
          c.lineWidth = pitch * rng.f(0.6, 1.0);
          c.beginPath();
          let k = -span * 0.55;
          let side = 1;
          let first = true;
          while (k < span * 0.55) {
            const reach = span * rng.f(0.28, 0.5);
            const mx = cx - dy * k;
            const my = cy + dx * k;
            const px = mx + dx * reach * side;
            const py = my + dy * reach * side;
            if (first) {
              c.moveTo(mx - dx * reach * side, my - dy * reach * side);
              first = false;
            }
            c.lineTo(px, py);
            k += pitch * rng.f(0.7, 1.3);
            side *= -1;
          }
          c.stroke();
        } else {
          // short strokes, uneven, overlapping — the colour builds where they cross
          const count = Math.round((span * 2.2) / pitch);
          for (let j = 0; j < count; j++) {
            c.globalAlpha = rng.f(0.3, 0.62);
            c.lineWidth = pitch * rng.f(0.42, 0.95);
            const k = rng.f(-span * 0.6, span * 0.6);
            const along = rng.f(-span * 0.45, span * 0.45);
            const len = span * rng.f(0.16, 0.55);
            const wob = rng.f(-0.14, 0.14);
            const ex = Math.cos(ang + wob);
            const ey = Math.sin(ang + wob);
            const mx = cx - dy * k + dx * along;
            const my = cy + dx * k + dy * along;
            c.beginPath();
            c.moveTo(mx - ex * len * 0.5, my - ey * len * 0.5);
            c.lineTo(mx + ex * len * 0.5, my + ey * len * 0.5);
            c.stroke();
          }
        }
      }
      c.restore();
    }
  }

  // ---------- plate mode (?plate=1): a sheet of heads, for judging
  // against the reference plates on the same terms ----------
  function drawPlate(c, w, h, seed0) {
    const rng0 = rngFor(seed0, "paper");
    paper(c, w, h, rng0);
    const cols = 6;
    const rows = 8;
    const cw = w / cols;
    const ch = (h - 24) / rows;
    for (let r = 0; r < rows; r++) {
      // rows drift and crowd the way a hand fills a page
      const rowDx = rng0.f(-10, 10);
      const rowDy = rng0.f(-7, 7);
      const rowS = rng0.f(0.96, 1.04);
      for (let col = 0; col < cols; col++) {
        const idx = r * cols + col;
        const d = makeDude(rngFor(seed0, "person", idx));
        const rng = rngFor(seed0, "mark", idx);
        const s = Math.min(cw, ch) * rng.f(0.305, 0.345) * rowS;
        const cx = Math.max(s * 1.15, Math.min(w - s * 1.15, cw * (col + 0.5) + rowDx + rng.f(-7, 7)));
        const cy = Math.max(s * 1.2, Math.min(h - s * 1.3, 18 + ch * (r + 0.5) + rowDy + rng.f(-8, 8)));
        const skull = new Skull(cx, cy, s, d.yaw, d.pitch, d.roll, d.ratio, d.depth, {
          jaw: d.jaw, chin: d.chin, crown: d.crown, cheek: d.cheek,
          lobeA: d.lobeA, lobeB: d.lobeB, lobeAmp: d.lobeAmp, lobePh: d.lobePh,
          flat: d.flat, flatA: d.flatA,
          wide: d.wide, pinch: d.pinch, skewW: d.skewW, brow: d.brow,
          jawAngle: d.jawAngle, jawHigh: d.jawHigh, jawTaper: d.jawTaper, chinX: d.chinX, chinW: d.chinW,
        });
        skull.pen = d.pen;
        skull.faceY = d.faceY;
        skull.gaze = d.gaze;
        skull.eyeGap = d.eyeGap;
        setPen(d.penKind);
        const hull = skull.silhouette();
        const prof = noseProfile(skull, d);
        const bump = d.nose === "silhouette" ? noseBump(skull, hull, rng, prof) : null;
        headFill(c, rng, skull, hull, d.skin);
        const nose = bump ? silhouetteNose(c, rng, skull, hull, bump, prof) : drawNose(c, rng, skull, d.nose, d.noseHeavy, d);
        if (nose && bump) nose.bump = bump;
        let gaps = outlineGaps(skull, hull, [nose && nose.outer]);
        if (nose && nose.outer) {
          const rad = s * 0.06;
          for (let i = 0; i < hull.length; i++) {
            if (nearPath(hull[i], nose.outer, rad)) gaps[i] = true;
          }
        }
        {
          const eg = skull.eyeGap ?? 0.36;
          const fy = skull.faceY || 0;
          const eL = landmark(skull, { x: -eg, y: -0.12 + fy, z: 0.88 });
          const eR = landmark(skull, { x: eg, y: -0.12 + fy, z: 0.88 });
          const er = s * 0.15;
          for (let i = 0; i < hull.length; i++) {
            if (eL.nz > 0.04 && Math.hypot(hull[i].x - eL.x, hull[i].y - eL.y) < er) gaps[i] = true;
            if (eR.nz > 0.04 && Math.hypot(hull[i].x - eR.x, hull[i].y - eR.y) < er) gaps[i] = true;
          }
        }
        headOutline(c, rng, skull, hull, gaps);
        if (d.shade) cheekHatch(c, rng, skull, hull, -(Math.sign(prof.x) || 1));
        const inFront = [];
        const hairMassPts = drawHair(c, rngFor(seed0, "hair", idx), skull, hull, d.hair, penShade(d.hairColor), inFront, d.hairTone, {
          shape: d.hairShape,
          outer: d.hairOuter,
        });
        drawBrows(c, rng, skull, d.brows);
        drawEyes(c, rng, skull, d.eyes);
        drawFacialHair(c, rng, skull, d.beard);
        drawMouth(c, rng, skull, d.mouth, nose);
        coverNose(c, rng, skull, nose, hull);
        drawEars(c, rng, skull);
        inFront.forEach((f) => f());
        if (rng.chance(0.3)) drawNeck(c, rng, skull);
        if (d.colour) {
          if (d.colour === "hat" && hairMassPts) {
            colourPass(c, rngFor(seed0, "colour", idx), s, [{ pts: hairMassPts }]);
          } else if (d.colour === "behind") {
            const blob = [];
            const rr = s * rng.f(0.92, 1.2);
            for (let i = 0; i < 14; i++) {
              const a = (i / 14) * Math.PI * 2;
              const k = rr * (1 + (fbm2(i * 0.5, 3, rng.seed) - 0.5) * 0.3);
              blob.push({ x: cx + Math.cos(a) * k, y: cy + Math.sin(a) * k * 1.08 });
            }
            colourPass(c, rngFor(seed0, "colour", idx), s, [{ pts: blob }]);
          } else {
            colourPass(c, rngFor(seed0, "colour", idx), s, [{ pts: hull }]);
          }
        }
      }
    }
    grainPass(c, c.__dpr);
  }

  // ---------- moving pictures ----------
  //
  // A flipbook, not a film. The sheet — paper, grain, the name, the words at
  // the foot of the page — is drawn once into a bitmap, because none of it
  // moves and the grain pass alone costs three times what the whole figure
  // does. Every frame is then that bitmap blitted, and the dude drawn over it
  // from scratch: same seed, same decisions, same person, different pose.
  //
  // Drawn from scratch is the important part. He is not a picture being
  // transformed. The rig moves and the pen goes over him again, so the line
  // boils the way a line does when a hand draws it twice, and the head turns
  // in space rather than skewing on the page.
  function makeAnimation(canvasEl, seed, dude, w, h, dpr, kind) {
    const foot = footerLayout(w, h, true);
    const ext = (() => {
      if (kind !== "live") return motionExtent(seed, dude, kind);
      const jump = motionExtent(seed, dude, "jump");
      const wave = motionExtent(seed, dude, "wave");
      return {
        up: Math.max(jump.up, wave.up),
        down: Math.max(jump.down, wave.down),
        left: Math.max(jump.left, wave.left),
        right: Math.max(jump.right, wave.right),
      };
    })();
    const place = rngFor(seed, "place");

    const mx = Math.max(12, Math.min(w * 0.05, 40));
    const top = Math.max(10, Math.min(h * 0.035, 34));
    const availH = Math.max(80, foot.top - top);
    const availW = Math.max(80, w - mx * 2);
    const nameRoom = CANON * 0.62;
    const rel = 0.88 + 0.12 * Math.max(0, Math.min(1, (dude.size - 98) / 28));
    const k = Math.min(availH / (ext.up + ext.down + nameRoom), availW / (ext.left + ext.right), 1.5) * rel;
    const s = CANON * k;
    const cx = Math.max(mx + ext.left * k, Math.min(w - mx - ext.right * k, w * 0.5));
    const cy = top + ext.up * k + Math.max(0, availH - (ext.up + ext.down + nameRoom) * k) * 0.5;

    // The strip of sheet the figure can reach, so only that gets repainted.
    // Snapped to whole DEVICE pixels: a source rectangle landing on a half
    // pixel makes drawImage resample, and the resampled edge shows up as a
    // seam down the paper exactly where the band stops.
    const pad = 14;
    const snap = (v, up) => (up ? Math.ceil(v * dpr) : Math.floor(v * dpr)) / dpr;
    const box = {
      x: Math.max(0, snap(cx - ext.left * k - pad, false)),
      y: Math.max(0, snap(cy - ext.up * k - pad, false)),
      w: 0,
      h: 0,
    };
    box.w = Math.min(w, snap(cx + ext.right * k + pad, true)) - box.x;
    box.h = Math.min(h, snap(cy + ext.down * k + pad, true)) - box.y;

    // ---- the sheet, once ----
    const bd = document.createElement("canvas");
    bd.width = Math.round(w * dpr);
    bd.height = Math.round(h * dpr);
    const bc = bd.getContext("2d", { willReadFrequently: true });
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.__dpr = dpr;
    paper(bc, w, h, rngFor(seed, "paper"));
    setPen(dude.penKind);
    const nameSize = Math.min(s * place.f(0.19, 0.26), (w - mx * 2) / (String(dude.name).length * 0.95 + 0.8));
    const nameW = nameSize * (String(dude.name).length * 0.95 + 0.8);
    const nameX = Math.max(mx, Math.min(w - nameW - mx, cx - nameW * 0.5 + place.f(-s * 0.3, s * 0.3)));
    const nameY = Math.min(foot.top - nameSize * 1.95, cy + ext.down * k + s * place.f(0.16, 0.4));
    drawName(bc, rngFor(seed, "name"), dude.name, nameX, nameY, nameSize);
    setPen("nib");
    const hits = drawFooter(bc, seed, w, foot);
    grainPass(bc, dpr);

    const c = canvasEl.getContext("2d");
    let last = -1;
    let lastYaw = null;

    return {
      hits,
      // t is the phase of the cycle, 0..1. frameNo only drives the boil, so
      // holding on a phase still redraws rather than freezing.
      draw(t, frameNo) {
        if (frameNo === last && lastYaw === VIEW_YAW) return;
        last = frameNo;
        lastYaw = VIEW_YAW;
        MOTION = kind === "live" && WILL ? WILL.pose() : motionAt(kind, t);
        BOIL = frameNo * 0.41;
        const R = {
          mark: rngFor(seed, "mark"),
          body: rngFor(seed, "body"),
          colour: rngFor(seed, "colour"),
          hair: rngFor(seed, "hair"),
        };
        c.save();
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Only the band he can reach is repainted. Blitting the whole sheet
        // every frame is most of the cost of a frame on a big window.
        c.drawImage(
          bd,
          Math.round(box.x * dpr), Math.round(box.y * dpr),
          Math.round(box.w * dpr), Math.round(box.h * dpr),
          box.x, box.y, box.w, box.h
        );
        c.beginPath();
        c.rect(box.x, box.y, box.w, box.h);
        c.clip();
        c.translate(cx, cy);
        c.scale(k, k);
        figureInk(c, R, dude, 0, 0, CANON);
        c.restore();
        MOTION = REST;
        BOIL = 0;
      },
      // the whole sheet, for the first frame and after a resize
      blit() {
        c.save();
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.drawImage(bd, 0, 0, bd.width, bd.height, 0, 0, w, h);
        c.restore();
        last = -1;
      },
    };
  }

  // ---------- public drawing (the scene page uses this; the single-dude
  // page keeps running the app below) ----------
  window.Dude = {
    PAPER,
    CANON,
    MOTION_NAMES,
    MOTION_PERIOD,
    paper,
    grainPass,
    makeDude,
    rngFor,
    figureInk,
    figureExtent,
    motionExtent,
    motionAt,
    setPen,
    inkLine,
    inkPoly,
    inkFill,
    inkMassFill,
    inkCirc,
    inkArc,
    stroke,
    drawName,
    parseSeed,
    pose(kind, t) {
      MOTION = motionAt(kind, t);
    },
    boil(n) {
      BOIL = n || 0;
    },
    rest() {
      MOTION = REST;
      BOIL = 0;
    },
  };

  // ---------- app ----------
  if (!canvas || !ctx) return;

  const Q = new URLSearchParams(location.search);
  const PLATE = !!Q.get("plate");
  if (PLATE) document.body.classList.add("plate");
  // He moves unless you ask him not to. ?anim=0 holds him still. ?m=wave
  // insists on one thing; without ?m his seed picks.
  let animOn = Q.get("anim") !== "0" && Q.get("anim") !== "false";
  const forcedMotion = MOTIONS[Q.get("m")] ? Q.get("m") : null;
  // ?ph=0.25 freezes the cycle at one phase, so a frame can be looked at
  // properly instead of being caught in passing
  const forcedPhase = Q.get("ph") !== null && !isNaN(parseFloat(Q.get("ph"))) ? parseFloat(Q.get("ph")) : null;

  const links = {
    another: btn,
    a: document.getElementById("link-a"),
    b: document.getElementById("link-b"),
    move: document.getElementById("move"),
    motion: document.getElementById("motion"),
  };
  // The orbit lives on the v2 preview only. This page has no slider, so
  // he keeps the yaw he already had — arrows and ?yaw= do not turn him.
  const spinEl = document.getElementById("spin");
  if (spinEl) {
    const qYaw = parseFloat(Q.get("yaw"));
    if (!isNaN(qYaw)) VIEW_YAW = (((qYaw % 360) + 360) % 360 / 360) * TAU;
  }

  // The words are ink on the paper, so the button and the links are invisible
  // boxes laid over exactly where that ink landed — the page stays one
  // drawing and the thing is still clickable and reachable by keyboard.
  function placeHits(hits) {
    Object.keys(links).forEach((id) => {
      const el = links[id];
      const b = hits && hits[id];
      if (!el) return;
      if (!b) {
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      el.style.left = `${Math.round(b.x)}px`;
      el.style.top = `${Math.round(b.y)}px`;
      el.style.width = `${Math.round(b.w)}px`;
      el.style.height = `${Math.round(b.h)}px`;
    });
  }

  let count = 0;
  let seed = parseSeed();
  let anim = null;
  let nextKind = null;
  let lastDude = null;
  let lastR = null;
  let lastPlace = null;
  let stillSheet = null;
  let lastCssW = 0;
  let lastCssH = 0;
  let lastDpr = 1;
  let raf = 0;
  let startedAt = 0;
  let frameNo = 0;

  function stopAnim() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    anim = null;
  }

  // Twelve drawings a second. Not a frame rate chosen to be cheap — a hand
  // does not redraw a figure sixty times a second, and at sixty the boil
  // turns into a shimmer and the whole thing stops looking drawn. Twelve is
  // where it reads as a flipbook, and it is also two frames on ones for every
  // frame a screen shows, which is exactly how this has always been done.
  const FPS = 12;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!anim) return;
    if (!startedAt) startedAt = now;
    const el = (now - startedAt) / 1000;
    const f = Math.floor(el * FPS);
    if (f === frameNo) return;
    frameNo = f;
    if (anim.kind === "live" && WILL) WILL.step(1 / FPS);
    const period = MOTION_PERIOD[anim.kind] || 1.4;
    anim.book.draw((el / period) % 1, f);
  }

  function paintStillFigure() {
    if (!stillSheet || !lastPlace || !lastDude || !lastR) return;
    ctx.save();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    ctx.drawImage(stillSheet, 0, 0, stillSheet.width, stillSheet.height, 0, 0, lastCssW, lastCssH);
    ctx.translate(lastPlace.cx, lastPlace.cy);
    ctx.scale(lastPlace.k, lastPlace.k);
    figureInk(ctx, {
      mark: rngFor(seed, "mark"),
      body: rngFor(seed, "body"),
      colour: rngFor(seed, "colour"),
      hair: rngFor(seed, "hair"),
    }, lastDude, 0, 0, CANON);
    ctx.restore();
    MOTION = REST;
    BOIL = 0;
  }

  function applySpin() {
    if (anim) {
      const period = MOTION_PERIOD[anim.kind] || 1.4;
      const el = startedAt ? (performance.now() - startedAt) / 1000 : 0;
      anim.book.draw((el / period) % 1, frameNo);
    } else {
      paintStillFigure();
    }
  }

  function render(nextSeed) {
    seed = nextSeed >>> 0;
    const R = {
      person: rngFor(seed, "person"),
      paper: rngFor(seed, "paper"),
      mark: rngFor(seed, "mark"),
      body: rngFor(seed, "body"),
      name: rngFor(seed, "name"),
      colour: rngFor(seed, "colour"),
      place: rngFor(seed, "place"),
      hair: rngFor(seed, "hair"),
    };
    const dude = makeDude(R.person);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // the real CSS box, so the sheet is the window and nothing is drawn off it
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(240, Math.round(rect.width || canvas.clientWidth || 720));
    const cssH = Math.max(320, Math.round(rect.height || canvas.clientHeight || 920));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr;
    stopAnim();
    lastDude = dude;
    lastR = R;
    lastCssW = cssW;
    lastCssH = cssH;
    lastDpr = dpr;
    stillSheet = null;
    lastPlace = null;
    if (spinEl) {
      const deg = Math.round((((VIEW_YAW / TAU) % 1) + 1) % 1 * 360);
      spinEl.value = String(deg);
      spinEl.style.display = PLATE ? "none" : "block";
    }
    if (PLATE) {
      drawPlate(ctx, cssW, cssH, seed);
      placeHits(null);
    } else if (animOn) {
      const kind = nextKind || forcedMotion || MOTION_NAMES[rngFor(seed, "motion").i(0, MOTION_NAMES.length - 1)];
      nextKind = null;
      WILL = kind === "live" && dude.nerves ? makeWill(dude.nerves) : null;
      const book = makeAnimation(canvas, seed, dude, cssW, cssH, dpr, kind);
      anim = { book, kind };
      placeHits(book.hits);
      book.blit();
      startedAt = 0;
      frameNo = -1;
      book.draw(forcedPhase ?? 0, 0);
      if (forcedPhase === null && !raf) raf = requestAnimationFrame(tick);
    } else {
      const bd = document.createElement("canvas");
      bd.width = canvas.width;
      bd.height = canvas.height;
      const bc = bd.getContext("2d", { willReadFrequently: true });
      bc.setTransform(dpr, 0, 0, dpr, 0, 0);
      bc.__dpr = dpr;
      const laid = drawDude(bc, R, dude, cssW, cssH, seed, { skipFigure: true });
      stillSheet = bd;
      lastPlace = { cx: laid.cx, cy: laid.cy, k: laid.k };
      placeHits(laid.hits);
      paintStillFigure();
    }
    count += 1;
    tallyEl.textContent = `dude nº ${count}`;
    const url = new URL(location.href);
    url.searchParams.set("s", String(seed));
    history.replaceState(null, "", url);
  }

  function another() {
    render((Math.random() * 0xffffffff) >>> 0);
  }

  // The words on the paper and the keys do the same two things, so both go
  // through here. A phone has no A to press.
  function toggleMove() {
    if (PLATE) return;
    animOn = !animOn;
    const url = new URL(location.href);
    if (animOn) url.searchParams.set("anim", "1");
    else url.searchParams.set("anim", "0");
    history.replaceState(null, "", url);
    count -= 1;
    render(seed);
  }

  // Something else to do. If he is standing still, this starts him — a label
  // that does nothing until you have found the other label first is not a
  // label, it is a puzzle.
  function nextMotion() {
    if (PLATE) return;
    const cur = (anim && anim.kind) || nextKind || forcedMotion || MOTION_NAMES[0];
    const i = MOTION_NAMES.indexOf(cur);
    const kind = MOTION_NAMES[(i < 0 ? 0 : i + 1) % MOTION_NAMES.length];
    if (!animOn || !anim) {
      nextKind = kind;
      if (!animOn) return toggleMove();
    }
    WILL = null;
    const book = makeAnimation(canvas, seed, lastDude, lastCssW, lastCssH, lastDpr, kind);
    anim = { book, kind };
    const url = new URL(location.href);
    url.searchParams.set("m", kind);
    history.replaceState(null, "", url);
    placeHits(book.hits);
    book.blit();
    startedAt = 0;
    frameNo = -1;
    book.draw(0, 0);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  btn.addEventListener("click", another);
  if (links.move) links.move.addEventListener("click", toggleMove);
  if (links.motion) links.motion.addEventListener("click", nextMotion);
  if (spinEl) {
    spinEl.addEventListener("input", () => {
      VIEW_YAW = (Number(spinEl.value) / 360) * TAU;
      applySpin();
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.target !== document.body) return;
    if (e.code === "Space") {
      e.preventDefault();
      another();
      return;
    }
    if (PLATE) return;
    // A: make him move, or let him rest. M: give him something else to do.
    if (e.key === "a" || e.key === "A") {
      e.preventDefault();
      toggleMove();
      return;
    }
    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      nextMotion();
      return;
    }
    if (spinEl && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const step = e.key === "ArrowLeft" ? -8 : 8;
      const deg = (((VIEW_YAW / TAU) * 360 + step) % 360 + 360) % 360;
      VIEW_YAW = (deg / 360) * TAU;
      spinEl.value = String(Math.round(deg));
      applySpin();
    }
  });
  // A phone fires resize for the address bar sliding away. Redrawing the whole
  // sheet for a few pixels of height is both slow and visibly wrong, so only a
  // real change in the box counts, and only once it has settled.
  let resizeTimer;
  let lastW = 0;
  let lastH = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const r = canvas.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 24) return;
      lastW = w;
      lastH = h;
      count -= 1;
      render(seed);
    }, 120);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  {
    const r = canvas.getBoundingClientRect();
    lastW = Math.round(r.width);
    lastH = Math.round(r.height);
  }
  render(seed);
})();

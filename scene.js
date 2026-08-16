(() => {
  // A second page. Same paper, same pen, same people — now standing in a
  // place. The place is always the weekly shop: one aisle, receding, the
  // most ordinary room in the world, drawn so the floor and the shelves
  // agree on a vanishing point. Refresh the page and the aisle is a
  // different aisle, the people are different people, and they are in the
  // middle of doing something else.
  const D = window.Dude;
  const canvas = document.getElementById("scene");
  if (!D || !canvas) return;

  const ctx = canvas.getContext("2d");
  const tallyEl = document.getElementById("tally");
  const links = {
    drop: document.getElementById("drop"),
    count: document.getElementById("count"),
    aisle: document.getElementById("aisle"),
    home: document.getElementById("home"),
  };

  const FPS = 12;
  const COUNTS = [2, 3, 4, 5, 6, 7, 8];
  const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];
  // What a person does in an aisle. Looking and walking are the job.
  // Dancing and jumping are what happens when you drop them in anyway.
  const BAG = [
    "look", "look", "look", "walk", "walk",
    "smile", "smile", "wave",
    "shrug", "dance", "jump", "cry",
  ];
  const TITLES = [
    "the weekly shop",
    "just getting milk",
    "aisle four, tuesday",
    "ten items or fewer",
    "back for batteries",
    "something for dinner",
    "don't forget onions",
    "the long way round",
  ];

  let seed = D.parseSeed();
  let dropGen = 0;
  let wantN = null; // null = any number
  let cam = null;
  let cast = [];
  let sheet = null;
  let lastCssW = 0;
  let lastCssH = 0;
  let lastDpr = 1;
  let raf = 0;
  let startedAt = 0;
  let frameNo = -1;

  function countLabel() {
    if (wantN == null) return "any number of them";
    if (wantN === 1) return "just one of them";
    return WORDS[wantN] + " of them";
  }

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

  // y is height off the linoleum. The camera stands at eye, so the floor
  // falls away below the vanishing point and the ceiling climbs above it —
  // without that, every tile sat on the horizon and the aisle collapsed
  // into a strip across the top of the page.
  function proj(c, x, y, z) {
    const zz = Math.max(0.4, z);
    const s = c.f / zz;
    return { x: c.vpX + x * s, y: c.vpY - (y - c.eye) * s, s };
  }

  function makeCam(w, h, rng) {
    const chrome = Math.max(250, Math.min(h * 0.42, 340));
    const floorStop = h - chrome;
    const vpY = h * rng.f(0.28, 0.33);
    const eye = rng.f(1.52, 1.66);
    const near = rng.f(2.05, 2.35);
    // pick a focal length so the nearest floor lands just above the words
    const f = ((floorStop - vpY) * near) / eye;
    return {
      w,
      h,
      vpX: w * rng.f(0.47, 0.53),
      vpY,
      f,
      eye,
      aisle: rng.f(1.18, 1.4),
      depth: rng.f(0.72, 0.92),
      far: rng.f(9.2, 11.5),
      near,
      ceil: rng.f(2.55, 2.78),
      bays: rng.i(5, 7),
      lights: rng.i(4, 5),
      cartZ: rng.f(3.1, 5.2),
      cartSide: rng.sign(),
      hasCart: rng.chance(0.65),
      title: rng.pick(TITLES),
      chrome,
    };
  }

  function inkQuad(c, rng, a, b, d, e, opt) {
    D.inkPoly(c, rng, [a, b, d, e], opt);
  }

  function drawFarWall(c, rng, cam) {
    const xL = -(cam.aisle + cam.depth);
    const xR = cam.aisle + cam.depth;
    const a = proj(cam, xL, 0, cam.far);
    const b = proj(cam, xR, 0, cam.far);
    const d = proj(cam, xR, cam.ceil, cam.far);
    const e = proj(cam, xL, cam.ceil, cam.far);
    inkQuad(c, rng, a, b, d, e, { closed: true, w: 1.35, broken: true });
    // freezer doors — vertical panes that confirm the wall is a wall
    const n = 4;
    for (let i = 0; i < n; i++) {
      const u0 = (i + 0.12) / n;
      const u1 = (i + 0.88) / n;
      const x0 = xL + (xR - xL) * u0;
      const x1 = xL + (xR - xL) * u1;
      const p0 = proj(cam, x0, 0.18, cam.far);
      const p1 = proj(cam, x1, 0.18, cam.far);
      const p2 = proj(cam, x1, cam.ceil - 0.22, cam.far);
      const p3 = proj(cam, x0, cam.ceil - 0.22, cam.far);
      inkQuad(c, rng, p0, p1, p2, p3, { closed: true, w: 1.05 });
      if (rng.chance(0.7)) {
        D.inkLine(c, rng, p3.x, p3.y, p1.x, p1.y, 0.8);
      }
    }
  }

  function drawFloor(c, rng, cam) {
    const tile = 0.78;
    const x0 = -(cam.aisle + cam.depth + 0.05);
    const x1 = cam.aisle + cam.depth + 0.05;
    for (let iz = 0; iz < 12; iz++) {
      const z0 = cam.near + iz * tile;
      const z1 = z0 + tile;
      if (z0 > cam.far - 0.15) break;
      for (let x = x0; x < x1 - 0.04; x += tile) {
        const a = proj(cam, x, 0, z0);
        const b = proj(cam, Math.min(x + tile, x1), 0, z0);
        const d = proj(cam, Math.min(x + tile, x1), 0, Math.min(z1, cam.far));
        const e = proj(cam, x, 0, Math.min(z1, cam.far));
        if (Math.hypot(a.x - e.x, a.y - e.y) < 6) continue;
        inkQuad(c, rng, a, b, d, e, { closed: true, w: 0.8, broken: true });
      }
    }
    const walkL = [proj(cam, -cam.aisle, 0, cam.near), proj(cam, -cam.aisle, 0, cam.far)];
    const walkR = [proj(cam, cam.aisle, 0, cam.near), proj(cam, cam.aisle, 0, cam.far)];
    D.inkLine(c, rng, walkL[0].x, walkL[0].y, walkL[1].x, walkL[1].y, 1.85);
    D.inkLine(c, rng, walkR[0].x, walkR[0].y, walkR[1].x, walkR[1].y, 1.85);
  }

  function drawCeiling(c, rng, cam) {
    const xL = -(cam.aisle + cam.depth);
    const xR = cam.aisle + cam.depth;
    const a = proj(cam, xL, cam.ceil, cam.near);
    const b = proj(cam, xR, cam.ceil, cam.near);
    const d = proj(cam, xR, cam.ceil, cam.far);
    const e = proj(cam, xL, cam.ceil, cam.far);
    inkQuad(c, rng, a, b, d, e, { closed: true, w: 1.15, broken: true });
    // fluorescent trays marching away
    for (let i = 0; i < cam.lights; i++) {
      const z = cam.near + 0.55 + (i / cam.lights) * (cam.far - cam.near - 1.1);
      const hw = 0.42;
      const p0 = proj(cam, -hw, cam.ceil, z);
      const p1 = proj(cam, hw, cam.ceil, z);
      const p2 = proj(cam, hw, cam.ceil, z + 0.85);
      const p3 = proj(cam, -hw, cam.ceil, z + 0.85);
      inkQuad(c, rng, p0, p1, p2, p3, { closed: true, w: 1.05 });
      D.inkLine(c, rng, p0.x, p0.y, p2.x, p2.y, 0.7);
    }
  }

  function drawShelves(c, rng, cam, side) {
    const face = side * cam.aisle;
    const back = side * (cam.aisle + cam.depth);
    const zs = [];
    for (let i = 0; i <= cam.bays; i++) {
      zs.push(cam.near + (cam.far - cam.near) * (i / cam.bays));
    }
    const boards = [0.18, 0.78, 1.38, 1.98];
    zs.forEach((z, i) => {
      const a = proj(cam, face, 0, z);
      const b = proj(cam, face, 2.22, z);
      const d = proj(cam, back, 0, z);
      const e = proj(cam, back, 2.22, z);
      D.inkLine(c, rng, a.x, a.y, b.x, b.y, i === 0 || i === zs.length - 1 ? 1.8 : 1.15);
      D.inkLine(c, rng, d.x, d.y, e.x, e.y, 1.0);
    });
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i];
      const z1 = zs[i + 1];
      const midZ = (z0 + z1) / 2;
      boards.forEach((y) => {
        const a = proj(cam, face, y, z0);
        const b = proj(cam, face, y, z1);
        const d = proj(cam, back, y, z1);
        const e = proj(cam, back, y, z0);
        inkQuad(c, rng, a, b, d, e, { closed: true, w: 1.0 });
        const lip = 0.06;
        const f0 = proj(cam, face, y - lip, z0);
        const f1 = proj(cam, face, y - lip, z1);
        D.inkLine(c, rng, a.x, a.y, f0.x, f0.y, 0.8);
        D.inkLine(c, rng, f0.x, f0.y, f1.x, f1.y, 0.8);
        // one or two packets, and only while they still read as packets
        if (midZ > cam.far * 0.72) return;
        const boxes = midZ < cam.near + 2.2 ? 2 : 1;
        for (let k = 0; k < boxes; k++) {
          const u = (k + 0.35 + rng.f(0, 0.25)) / boxes;
          const z = z0 + (z1 - z0) * u;
          const x = face + side * rng.f(0.12, cam.depth * 0.45);
          const bw = rng.f(0.14, 0.22);
          const bh = rng.f(0.18, 0.36);
          const p0 = proj(cam, x - bw * 0.5, y, z);
          const p1 = proj(cam, x + bw * 0.5, y, z);
          const p2 = proj(cam, x + bw * 0.5, y + bh, z);
          const p3 = proj(cam, x - bw * 0.5, y + bh, z);
          if (Math.hypot(p0.x - p1.x, p0.y - p1.y) < 7) continue;
          inkQuad(c, rng, p0, p1, p2, p3, { closed: true, w: 0.9 });
          if (rng.chance(0.45)) D.inkLine(c, rng, p0.x, p0.y, p2.x, p2.y, 0.65);
        }
      });
    }
  }

  function drawCart(c, rng, cam) {
    if (!cam.hasCart) return;
    const side = cam.cartSide;
    const x = side * (cam.aisle * 0.62);
    const z = cam.cartZ;
    const y0 = 0;
    const y1 = 0.62;
    const hw = 0.22;
    const rec = 0.38;
    const corners = [
      [x - hw, z],
      [x + hw, z],
      [x + hw, z + rec],
      [x - hw, z + rec],
    ];
    const bot = corners.map(([xx, zz]) => proj(cam, xx, y0 + 0.08, zz));
    const top = corners.map(([xx, zz]) => proj(cam, xx, y1, zz));
    D.inkPoly(c, rng, bot, { closed: true, w: 1.2 });
    D.inkPoly(c, rng, top, { closed: true, w: 1.2 });
    for (let i = 0; i < 4; i++) D.inkLine(c, rng, bot[i].x, bot[i].y, top[i].x, top[i].y, 1.05);
    // a couple of wires
    D.inkLine(c, rng, top[0].x, top[0].y, top[2].x, top[2].y, 0.75);
    D.inkLine(c, rng, top[1].x, top[1].y, top[3].x, top[3].y, 0.75);
    // handle
    const hx = x - side * 0.02;
    const h0 = proj(cam, hx - hw * 0.2, y1 + 0.28, z - 0.08);
    const h1 = proj(cam, hx + hw * 0.2, y1 + 0.28, z - 0.08);
    D.inkLine(c, rng, top[0].x, top[0].y, h0.x, h0.y, 1.2);
    D.inkLine(c, rng, top[1].x, top[1].y, h1.x, h1.y, 1.2);
    D.inkLine(c, rng, h0.x, h0.y, h1.x, h1.y, 1.35);
  }

  function drawSign(c, rng, cam) {
    const z = cam.near + 1.15;
    const y0 = cam.ceil - 0.12;
    const y1 = y0 - 0.34;
    const hw = 0.78;
    const p0 = proj(cam, -hw, y0, z);
    const p1 = proj(cam, hw, y0, z);
    const p2 = proj(cam, hw, y1, z);
    const p3 = proj(cam, -hw, y1, z);
    inkQuad(c, rng, p0, p1, p2, p3, { closed: true, w: 1.25 });
    const up = proj(cam, 0, cam.ceil, z);
    D.inkLine(c, rng, p0.x, p0.y, up.x - 10, up.y, 0.8);
    D.inkLine(c, rng, p1.x, p1.y, up.x + 10, up.y, 0.8);
    // a couple of ruled lines on the board, not words — type sitting in
    // screen space on a perspective rectangle never quite lands
    const mid = proj(cam, 0, (y0 + y1) / 2, z);
    D.inkLine(c, rng, p3.x + 8, mid.y - 4, p2.x - 8, mid.y - 3, 0.85);
    D.inkLine(c, rng, p3.x + 10, mid.y + 5, p2.x - 6, mid.y + 4, 0.75);
  }

  function drawChrome(c, w, h, sceneSeed) {
    D.setPen("nib");
    const pad = Math.max(14, Math.min(w * 0.04, 28));
    const safeEl = document.getElementById("safe");
    const safe = safeEl ? safeEl.getBoundingClientRect().height : 0;
    const size = Math.max(14, Math.min(20, w * 0.026));
    const lead = size * 1.85;
    const lines = w < 560 ? 4 : 3;
    const y0 = h - Math.max(16, safe + 14) - lead * (lines - 0.15);
    const x = pad + size * 0.45;
    const hits = {};
    const write = (id, text, y, rule) => {
      const adv = D.drawName(c, D.rngFor(sceneSeed, "chrome", id.length + 3), text, x, y, id === "drop" ? size : size * 0.92, {
        caps: false,
        rule: !!rule,
        w: 0.07,
      });
      hits[id] = {
        x: x - size * 0.55,
        y: y - size * 0.38,
        w: adv + size * 1.15,
        h: Math.max(lead, 34),
      };
    };
    write("drop", "drop them into a scene", y0, true);
    write("count", countLabel(), y0 + lead, false);
    write("aisle", "another aisle", y0 + lead * 2, false);
    const home = "one dude";
    if (w < 560) {
      write("home", home, y0 + lead * 3, false);
    } else {
      const hs = size * 0.88;
      const hx = w - pad - home.length * hs * 0.95;
      const hy = y0;
      D.drawName(c, D.rngFor(sceneSeed, "chrome", 11), home, hx, hy, hs, { caps: false, rule: false, w: 0.07 });
      hits.home = { x: hx - hs * 0.5, y: hy - hs * 0.38, w: home.length * hs * 0.95 + hs, h: 36 };
    }
    return hits;
  }

  function drawAisle(c, w, h, sceneSeed) {
    const rng = D.rngFor(sceneSeed, "aisle");
    D.setPen("nib");
    D.paper(c, w, h, D.rngFor(sceneSeed, "paper"));
    cam = makeCam(w, h, rng);
    drawFarWall(c, D.rngFor(sceneSeed, "wall"), cam);
    drawCeiling(c, D.rngFor(sceneSeed, "ceil"), cam);
    drawFloor(c, D.rngFor(sceneSeed, "floor"), cam);
    drawShelves(c, D.rngFor(sceneSeed, "shelfL"), cam, -1);
    drawShelves(c, D.rngFor(sceneSeed, "shelfR"), cam, 1);
    drawSign(c, D.rngFor(sceneSeed, "sign"), cam);
    drawCart(c, D.rngFor(sceneSeed, "cart"), cam);
    const hits = drawChrome(c, w, h, sceneSeed);
    D.grainPass(c, c.__dpr);
    return hits;
  }

  function who(p) {
    const parts = String(p.dude.name).trim().split(/\s+/);
    if (!parts[0]) return "someone";
    if (parts.length === 1 || parts[0].length <= 2) return String(p.dude.name).toLowerCase();
    return parts[0].toLowerCase();
  }

  function wrapLine(text, maxChars) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let cur = "";
    words.forEach((w) => {
      const next = cur ? cur + " " + w : w;
      if (next.length > maxChars && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function settingLine(title, rng) {
    const lines = {
      "the weekly shop": [
        "the weekly shop - same hour as last week",
        "tuesday again and the list is already a rumour",
        "the weekly shop - nobody is here on purpose",
      ],
      "just getting milk": [
        "they only came in for milk",
        "it was meant to be milk and out",
        "just the milk - that was the deal",
      ],
      "aisle four, tuesday": [
        "aisle four on a tuesday - the lights are too loud",
        "tuesday in aisle four and the tannoy is doing its worst",
      ],
      "ten items or fewer": [
        "ten items or fewer - nobody here is counting",
        "the basket says ten - the face says otherwise",
      ],
      "back for batteries": [
        "someone at home is waiting on batteries",
        "back for batteries - the rest is drift",
      ],
      "something for dinner": [
        "dinner is still a rumour at this point",
        "something for dinner - they have not decided what that is",
      ],
      "don't forget onions": [
        "onions were on the list - the list is in the car",
        "don't forget onions - they have forgotten onions",
      ],
      "the long way round": [
        "they all took the long way round and arrived here anyway",
        "the long way round - this is where it emptied out",
      ],
    };
    return rng.pick(lines[title] || ["the shop - in the middle of an ordinary day"]);
  }

  function cryLine(p, rng) {
    const n = who(p);
    const why = rng.pick([
      n + " is crying because the biscuits their mum bought are gone",
      n + " is sad - they saw the price of the usual thing",
      n + " is crying over a text they read in the car park",
      n + " is sad because the one thing they came for is gone",
      n + " is crying - they remembered a birthday empty-handed",
      n + " is sad because they put something back and it felt like giving up",
      n + " is crying - they thought they saw someone they used to know",
      n + " is sad - the song on the tannoy finished them off",
      n + " is crying because they have been at this shelf too long",
      n + " is sad - they walked in angry and the shop did the rest",
    ]);
    return why;
  }

  function doLine(p, rng, cast) {
    const n = who(p);
    const other = cast.find((q) => q !== p);
    const them = other ? who(other) : null;
    const age = p.dude.person && p.dude.person.age;
    const mood = p.dude.person && p.dude.person.mood;
    const bag = {
      look: [
        n + " is reading a tin they will not buy",
        n + " is looking at the shelf like it might apologise",
        n + " is looking for a brand that moved",
        n + " is pretending the soup is interesting",
      ],
      walk: [
        n + " is walking like the door is a promise",
        n + " is leaving without what they came for",
        n + " is late and walking as if that will help",
        n + " came in the wrong end and is committing to it",
      ],
      smile: [
        n + " is smiling at a reduced sticker",
        n + " is smiling because they are not at work",
        n + " found the brand they grew up with",
        n + " is smiling at nothing in particular",
      ],
      wave: them
        ? [
            n + " is waving at " + them + " - or at someone who looks like them",
            n + " is waving - " + them + " has not decided whether to wave back",
            n + " thinks they know " + them + " from somewhere else",
          ]
        : [
            n + " is waving at the far end of the aisle",
            n + " is waving at nobody in particular",
          ],
      jump: [
        n + " is jumping because the tannoy did that",
        n + " just got a yes and the body found out first",
        n + " is the sort of person who jumps in a shop",
        age === "old" ? n + " is jumping anyway" : n + " is jumping because they still can",
      ],
      dance: [
        n + " is dancing and does not care who is looking",
        n + " decided this song is theirs",
        n + " is dancing like the aisle asked them to",
        mood === "dour" ? n + " is dancing against their own face" : n + " is dancing because the shop cannot stop them",
      ],
      shrug: [
        n + " asked someone in a shirt and nobody knew",
        n + " is shrugging - both brands are the same and they know it",
        n + " has given the shelf a chance and the shelf declined",
      ],
    };
    const opts = (bag[p.action] || [n + " is just here"]).filter(Boolean);
    return rng.pick(opts);
  }

  function pairLine(a, b, rng) {
    const x = who(a);
    const y = who(b);
    return rng.pick([
      x + " and " + y + " came in one car and are pretending they didn't",
      x + " and " + y + " have not spoken since the cereal aisle",
      x + " is hiding from " + y + " behind nothing at all",
      x + " and " + y + " said they would split up - it is going badly",
      y + " is pretending not to know " + x,
    ]);
  }

  function storyLines(people, cam, rng) {
    const max = cam && cam.w < 560 ? 6 : 7;
    const lines = [settingLine(cam.title, rng)];
    const cry = people.filter((p) => p.action === "cry");
    const rest = people.filter((p) => p.action !== "cry");
    const covered = new Set();
    cry.forEach((p) => {
      lines.push(cryLine(p, rng));
      covered.add(p);
    });
    // a pair line only when the cast is small - otherwise it steals
    // the line that would have said what the others are doing
    if (people.length >= 2 && people.length <= 3 && rng.chance(0.55) && lines.length < max) {
      const a = people[0];
      const b = people[1];
      lines.push(pairLine(a, b, rng));
      covered.add(a);
      covered.add(b);
    }
    rest.forEach((p) => {
      if (lines.length >= max) return;
      if (covered.has(p)) return;
      lines.push(doLine(p, rng, people));
    });
    return lines.slice(0, max);
  }

  function drawStory(c, w, h, sceneSeed, people) {
    if (!people || !people.length || !cam) return "";
    const storySeed = people.reduce((acc, p) => (acc ^ p.seed) >>> 0, sceneSeed);
    const rng = D.rngFor(storySeed, "story");
    let raw = storyLines(people, cam, rng);
    const pad = Math.max(14, Math.min(w * 0.04, 28));
    const size = Math.max(12, Math.min(15, w * 0.018));
    const lead = size * 1.62;
    // the nib is wider than a typeset em - keep lines short so they
    // do not run through the buttons
    const maxChars = w < 560 ? 28 : 42;
    const flatten = (beats) => {
      const out = [];
      beats.forEach((ln) => wrapLine(ln, maxChars).forEach((bit) => out.push(bit)));
      return out;
    };
    const safeEl = document.getElementById("safe");
    const safe = safeEl ? safeEl.getBoundingClientRect().height : 0;
    const btnSize = Math.max(14, Math.min(20, w * 0.026));
    const btnLead = btnSize * 1.85;
    const btnLines = w < 560 ? 4 : 3;
    const btnTop = h - Math.max(16, safe + 14) - btnLead * (btnLines - 0.15);
    const floorY = proj(cam, 0, 0, cam.near).y;
    const avail = Math.max(lead * 3, btnTop - floorY - size * 1.2);
    let lines = flatten(raw);
    while (raw.length > 2 && lines.length * lead > avail) {
      raw = raw.slice(0, -1);
      lines = flatten(raw);
    }
    const y = btnTop - lead * (lines.length + 0.7);
    D.setPen("nib");
    for (let i = 0; i < lines.length; i++) {
      D.drawName(c, D.rngFor(storySeed, "line", i + 1), lines[i], pad + size * 0.35, y + i * lead, size, {
        caps: false,
        rule: false,
        w: 0.06,
      });
    }
    return raw.join(" — ");
  }

  function paintStory() {
    if (!sheet || !cast.length) return "";
    const sc = sheet.getContext("2d");
    sc.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    sc.__dpr = lastDpr;
    return drawStory(sc, lastCssW, lastCssH, seed, cast);
  }

  function wearAction(dude, action, rng) {
    if (action === "smile") {
      dude.mouth = rng.pick(["smile", "smile", "teeth"]);
      dude.brows = rng.pick(["arch", "flat", "none"]);
      if (dude.eyes === "squint" || dude.eyes === "half") dude.eyes = rng.pick(["open", "mix"]);
    } else if (action === "cry") {
      dude.mouth = rng.pick(["frown", "frown", "line"]);
      dude.eyes = rng.pick(["squint", "half", "closed"]);
      dude.brows = rng.pick(["arch", "angry"]);
      dude.pitch = Math.max(dude.pitch, 0.1);
    } else if (action === "dance" && rng.chance(0.65)) {
      dude.mouth = rng.pick(["smile", "open", "teeth"]);
    } else if (action === "jump" && rng.chance(0.55)) {
      dude.mouth = rng.pick(["open", "smile"]);
    }
    return dude;
  }

  function pickSlots(n, rng) {
    // A shallow cluster across the front of the aisle. The shop recedes
    // behind them; sending people down the vanishing point either loses
    // the nib or stacks their heads into the ceiling sign.
    const slots = [];
    const span = cam.aisle * (n <= 2 ? 0.7 : n <= 4 ? 1.05 : 1.2);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = (t - 0.5) * span + rng.f(-0.05, 0.05);
      const z = cam.near + 0.4 + (i % 2) * 0.22 + rng.f(0, 0.12);
      slots.push({
        x: Math.max(-cam.aisle * 0.62, Math.min(cam.aisle * 0.62, x)),
        z,
      });
    }
    slots.sort((a, b) => b.z - a.z);
    return slots;
  }

  function rollCast(n) {
    const rng = D.rngFor(seed, "cast", dropGen);
    const count = n != null ? n : rng.i(3, 7);
    const slots = pickSlots(count, rng);
    return slots.map((slot, i) => {
      const pSeed = (rng.i(1, 0x7fffffff) ^ (i * 2654435761)) >>> 0;
      const actRng = D.rngFor(pSeed, "action");
      const action = actRng.pick(BAG);
      const dude = wearAction(D.makeDude(D.rngFor(pSeed, "person")), action, actRng);
      if (action === "look") {
        const toward = Math.sign(slot.x) || actRng.sign();
        dude.yaw = toward * actRng.f(0.32, 0.7);
      } else if (action === "walk") {
        dude.yaw = actRng.f(-0.18, 0.18);
      }
      // A canonical stand-in, not a measured silhouette. Measuring each
      // person means drawing them once into a huge offscreen sheet, and
      // five of those on load is a long blank pause. The estimate is a
      // hair generous, which only leaves a little air under the shoes.
      const ext = { up: D.CANON * 1.35, down: D.CANON * 6.15, left: D.CANON * 2.1, right: D.CANON * 2.1 };
      return {
        seed: pSeed,
        dude,
        action,
        phase: actRng.f(0, 1),
        x: slot.x,
        z: slot.z,
        ext,
        i,
        named: false,
      };
    }).map((p, _, all) => {
      const near = all.slice().sort((a, b) => a.z - b.z).slice(0, 2);
      p.named = near.includes(p) || all.length <= 3;
      return p;
    });
  }

  function drawPerson(c, person, tSec, frame) {
    const period = D.MOTION_PERIOD[person.action] || 1.6;
    const t = (tSec / period + person.phase) % 1;
    D.pose(person.action, t);
    D.boil(frame * 0.41 + person.i * 1.73);
    const foot = proj(cam, person.x, 0, person.z);
    const worldH = 1.58 + (person.dude.size - 110) * 0.004;
    const screenH = worldH * (cam.f / Math.max(0.45, person.z));
    // The nib is in user units. Scale him down the way true perspective
    // asks and a line-only person becomes a 0.3px ghost. Keep the scale
    // in the range the pen still reads, and let depth do the rest with
    // where the feet sit.
    let k = screenH / Math.max(40, person.ext.up + person.ext.down);
    const narrow = cam.w < 560;
    k = Math.max(narrow ? 0.3 : 0.4, Math.min(narrow ? 0.46 : 0.66, k));
    const cx = foot.x;
    const cy = foot.y - person.ext.down * k;
    const R = {
      mark: D.rngFor(person.seed, "mark"),
      body: D.rngFor(person.seed, "body"),
      colour: D.rngFor(person.seed, "colour"),
      hair: D.rngFor(person.seed, "hair"),
    };
    c.save();
    c.translate(cx, cy);
    c.scale(k, k);
    D.figureInk(c, R, person.dude, 0, 0, D.CANON);
    c.restore();
    if (person.named) {
      D.setPen(person.dude.penKind);
      const ns = Math.max(8, Math.min(13, k * 16));
      const name = String(person.dude.name);
      D.drawName(c, D.rngFor(person.seed, "name"), name, cx - ns * name.length * 0.42, foot.y + ns * 0.9, ns, {
        caps: false,
        rule: false,
        w: 0.07,
      });
    }
    D.rest();
  }

  function blitSheet() {
    ctx.save();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    ctx.drawImage(sheet, 0, 0, sheet.width, sheet.height, 0, 0, lastCssW, lastCssH);
    ctx.restore();
  }

  function paintFrame(tSec, frame) {
    blitSheet();
    ctx.save();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    cast.forEach((p) => drawPerson(ctx, p, tSec, frame));
    ctx.restore();
    D.rest();
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!startedAt) startedAt = now;
    const el = (now - startedAt) / 1000;
    const f = Math.floor(el * FPS);
    if (f === frameNo) return;
    frameNo = f;
    paintFrame(el, f);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function buildSheet() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(280, Math.round(rect.width || canvas.clientWidth || 720));
    const cssH = Math.max(320, Math.round(rect.height || canvas.clientHeight || 920));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    lastCssW = cssW;
    lastCssH = cssH;
    lastDpr = dpr;
    const bd = document.createElement("canvas");
    bd.width = canvas.width;
    bd.height = canvas.height;
    const bc = bd.getContext("2d", { willReadFrequently: true });
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.__dpr = dpr;
    const hits = drawAisle(bc, cssW, cssH, seed);
    sheet = bd;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr;
    return hits;
  }

  function remember() {
    const url = new URL(location.href);
    url.searchParams.set("s", String(seed));
    if (wantN != null) url.searchParams.set("n", String(wantN));
    else url.searchParams.delete("n");
    history.replaceState(null, "", url);
  }

  function render(opts = {}) {
    stop();
    if (opts.newScene) seed = (Math.random() * 0xffffffff) >>> 0;
    if (opts.drop) dropGen += 1;
    const hits = buildSheet();
    const n = opts.n != null ? opts.n : wantN;
    cast = rollCast(n);
    const told = paintStory();
    placeHits(hits);
    remember();
    if (tallyEl) {
      tallyEl.textContent = told || cam.title;
    }
    startedAt = 0;
    frameNo = -1;
    paintFrame(0, 0);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function drop(n) {
    render({ drop: true, n: n != null ? n : wantN });
  }

  function anotherAisle() {
    dropGen = 0;
    render({ newScene: true });
  }

  function cycleCount() {
    if (wantN == null) wantN = COUNTS[0];
    else {
      const i = COUNTS.indexOf(wantN);
      wantN = i < 0 || i === COUNTS.length - 1 ? null : COUNTS[i + 1];
    }
    // rewrite the count label on the sheet without throwing the aisle away
    const hits = buildSheet();
    paintStory();
    placeHits(hits);
    remember();
    paintFrame(startedAt ? (performance.now() - startedAt) / 1000 : 0, Math.max(0, frameNo));
  }

  links.drop.addEventListener("click", () => drop());
  links.count.addEventListener("click", cycleCount);
  links.aisle.addEventListener("click", anotherAisle);
  window.addEventListener("keydown", (e) => {
    if (e.target !== document.body) return;
    if (e.code === "Space") {
      e.preventDefault();
      anotherAisle();
      return;
    }
    if (e.key === "d" || e.key === "D") {
      e.preventDefault();
      drop();
      return;
    }
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      cycleCount();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      wantN = Number(e.key);
      drop(wantN);
    }
  });

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
      const keep = cast.slice();
      const hits = buildSheet();
      cast = keep;
      paintStory();
      placeHits(hits);
      paintFrame(startedAt ? (performance.now() - startedAt) / 1000 : 0, Math.max(0, frameNo));
    }, 120);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  {
    const r = canvas.getBoundingClientRect();
    lastW = Math.round(r.width);
    lastH = Math.round(r.height);
    const qn = new URLSearchParams(location.search).get("n");
    if (qn && /^\d+$/.test(qn)) wantN = Math.max(1, Math.min(9, Number(qn)));
    render();
  }
})();

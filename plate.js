(() => {
  // A sheet of heads, the same 6×8 as the judging plate. Click one and
  // the skull turns — they look left, hold it, look right, come back.
  // The sheet is drawn once; only the head that turned is inked again.
  const D = window.Dude;
  const canvas = document.getElementById("plate");
  if (!D || !canvas) return;

  const ctx = canvas.getContext("2d");
  const tallyEl = document.getElementById("tally");
  const links = {
    another: document.getElementById("another"),
    home: document.getElementById("home"),
  };

  const FPS = 12;
  let COLS = 6;
  let ROWS = 8;
  const LOOK = "look";
  const PERIOD = D.MOTION_PERIOD[LOOK] || 5;

  let seed = D.parseSeed();
  let faces = [];
  let sheet = null;
  let blank = null;
  let lastCssW = 0;
  let lastCssH = 0;
  let lastDpr = 1;
  let raf = 0;
  let frameNo = -1;
  let buildId = 0;
  let ready = false;

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

  function chromeLayout(w, h) {
    const pad = Math.max(14, Math.min(w * 0.04, 28));
    const safeEl = document.getElementById("safe");
    const safe = safeEl ? safeEl.getBoundingClientRect().height : 0;
    const size = Math.max(14, Math.min(20, w * 0.026));
    const lead = size * 1.85;
    const lines = w < 560 ? 2 : 1;
    const top = h - Math.max(16, safe + 14) - lead * (lines - 0.15);
    return { pad, size, lead, lines, top, h };
  }

  function drawChrome(c, w, h, plateSeed) {
    D.setPen("nib");
    const F = chromeLayout(w, h);
    const hits = {};
    const write = (id, text, x, y, size, rule) => {
      const adv = D.drawName(c, D.rngFor(plateSeed, "chrome", id.length + 3), text, x, y, size, {
        caps: false,
        rule: !!rule,
        w: 0.07,
      });
      hits[id] = {
        x: x - size * 0.55,
        y: y - size * 0.38,
        w: adv + size * 1.15,
        h: Math.max(F.lead, 34),
      };
    };
    const x = F.pad + F.size * 0.45;
    write("another", "another plate", x, F.top, F.size, true);
    const home = "one dude";
    if (F.lines > 1) {
      write("home", home, x, F.top + F.lead, F.size * 0.92, false);
    } else {
      const hs = F.size * 0.88;
      const hx = w - F.pad - home.length * hs * 0.95;
      write("home", home, hx, F.top, hs, false);
    }
    return hits;
  }

  function faceRng(face, tag) {
    return D.rngFor(seed, tag, face.idx);
  }

  function inkHead(c, face, t, frame) {
    if (t != null) D.pose(LOOK, t);
    else D.rest();
    D.boil(frame ? frame * 0.41 + face.idx * 1.73 : 0);
    const R = {
      mark: faceRng(face, "mark"),
      body: faceRng(face, "body"),
      colour: faceRng(face, "colour"),
      hair: faceRng(face, "hair"),
    };
    D.figureInk(c, R, face.dude, face.cx, face.cy, face.s, {
      headOnly: true,
      neck: face.neck,
    });
    D.rest();
  }

  function dirtyBox(face) {
    const pad = face.s * 2.05;
    const x = Math.max(0, face.cx - pad);
    const y = Math.max(0, face.cy - pad);
    return {
      x,
      y,
      w: Math.min(lastCssW, face.cx + pad) - x,
      h: Math.min(lastCssH, face.cy + pad) - y,
    };
  }

  function blitBox(src, box) {
    if (!src) return;
    const dpr = lastDpr;
    ctx.drawImage(
      src,
      Math.round(box.x * dpr), Math.round(box.y * dpr),
      Math.round(box.w * dpr), Math.round(box.h * dpr),
      box.x, box.y, box.w, box.h
    );
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function paintLooking(now) {
    const active = faces.filter((f) => f.looking);
    if (!active.length) return;
    ctx.save();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    const dirty = active.map(dirtyBox);
    // Paper only — the still sheet still has the old hoop, and inking a
    // new yaw on top of it is how you get a double outline.
    dirty.forEach((box) => blitBox(blank, box));
    faces.forEach((face) => {
      const box = dirtyBox(face);
      if (!dirty.some((d) => boxesOverlap(d, box))) return;
      const el = (now - face.startedAt) / 1000;
      const turning = face.looking && el < PERIOD;
      ctx.save();
      ctx.beginPath();
      dirty.forEach((d) => ctx.rect(d.x, d.y, d.w, d.h));
      ctx.clip();
      inkHead(ctx, face, turning ? el / PERIOD : null, turning ? face.frame : 0);
      ctx.restore();
    });
    ctx.restore();
    active.forEach((face) => {
      if ((now - face.startedAt) / 1000 >= PERIOD) face.looking = false;
    });
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (!faces.some((f) => f.looking)) {
      raf = 0;
      return;
    }
    const f = Math.floor(now / (1000 / FPS));
    if (f === frameNo) return;
    frameNo = f;
    faces.forEach((face) => {
      if (face.looking) face.frame += 1;
    });
    paintLooking(now);
    if (!faces.some((f) => f.looking)) raf = 0;
  }

  function startTick() {
    if (!raf) {
      frameNo = -1;
      raf = requestAnimationFrame(tick);
    }
  }

  function stopTick() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function sheetSize() {
    const vv = window.visualViewport;
    const w = Math.round((vv && vv.width) || window.innerWidth || document.documentElement.clientWidth || 720);
    const h = Math.round((vv && vv.height) || window.innerHeight || document.documentElement.clientHeight || 920);
    return { w: Math.max(280, w), h: Math.max(320, h) };
  }

  function chooseGrid(w, availH) {
    const aspect = w / Math.max(160, availH);
    let cols = Math.round(Math.sqrt(48 * aspect));
    cols = Math.max(4, Math.min(14, cols));
    let rows = Math.max(4, Math.round(48 / cols));
    if (cols * rows > 56) rows = Math.max(4, rows - 1);
    COLS = cols;
    ROWS = rows;
  }

  function layFaces(w, h) {
    const rng0 = D.rngFor(seed, "paper");
    const foot = chromeLayout(w, h);
    const band = Math.max(36, h - foot.top + 8);
    chooseGrid(w, h - band);
    const insetX = Math.max(28, w * 0.03);
    const insetY = Math.max(22, (h - band) * 0.04);
    const gridW = w - insetX * 2;
    const gridH = h - band - insetY * 2;
    const cw = gridW / COLS;
    const ch = gridH / ROWS;
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      const rowDx = rng0.f(-cw * 0.015, cw * 0.015);
      const rowDy = rng0.f(-ch * 0.015, ch * 0.015);
      const rowS = rng0.f(0.97, 1.03);
      for (let col = 0; col < COLS; col++) {
        const idx = r * COLS + col;
        const dude = D.makeDude(D.rngFor(seed, "person", idx));
        const rng = D.rngFor(seed, "mark", idx);
        const s = Math.min(cw, ch) * rng.f(0.20, 0.24) * rowS;
        const cx = Math.max(
          insetX + s * 1.35,
          Math.min(w - insetX - s * 1.35, insetX + cw * (col + 0.5) + rowDx + rng.f(-cw * 0.015, cw * 0.015))
        );
        const cy = Math.max(
          insetY + s * 1.4,
          Math.min(h - band - s * 0.55, insetY + ch * (r + 0.5) + rowDy + rng.f(-ch * 0.015, ch * 0.015))
        );
        out.push({
          idx,
          dude,
          cx,
          cy,
          s,
          neck: D.rngFor(seed, "neck", idx).chance(0.3),
          looking: false,
          startedAt: 0,
          frame: 0,
        });
      }
    }
    return out;
  }

  function blitSheet() {
    if (!sheet) return;
    ctx.save();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    ctx.drawImage(sheet, 0, 0, sheet.width, sheet.height, 0, 0, lastCssW, lastCssH);
    ctx.restore();
  }

  function waitFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function buildSheet(id) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { w: cssW, h: cssH } = sheetSize();
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    lastCssW = cssW;
    lastCssH = cssH;
    lastDpr = dpr;
    faces = layFaces(cssW, cssH);
    ready = false;
    sheet = null;
    blank = null;

    const bd = document.createElement("canvas");
    bd.width = canvas.width;
    bd.height = canvas.height;
    const bc = bd.getContext("2d", { willReadFrequently: true });
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.__dpr = dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr;
    D.paper(bc, cssW, cssH, D.rngFor(seed, "paper"));
    const hits = drawChrome(bc, cssW, cssH, seed);
    const ground = document.createElement("canvas");
    ground.width = bd.width;
    ground.height = bd.height;
    ground.getContext("2d").drawImage(bd, 0, 0);
    blank = ground;
    sheet = bd;
    blitSheet();
    if (id !== buildId) return null;

    for (let i = 0; i < faces.length; i++) {
      if (id !== buildId) return null;
      inkHead(bc, faces[i], null, 0);
      blitSheet();
      await waitFrame();
    }
    if (id !== buildId) return null;
    D.grainPass(bc, dpr);
    D.grainPass(blank.getContext("2d"), dpr);
    blitSheet();
    ready = true;
    return hits;
  }

  function remember() {
    const url = new URL(location.href);
    url.searchParams.set("s", String(seed));
    history.replaceState(null, "", url);
  }

  async function render(nextSeed) {
    stopTick();
    seed = nextSeed >>> 0;
    const id = ++buildId;
    remember();
    if (tallyEl) tallyEl.textContent = "a plate of heads";
    const hits = await buildSheet(id);
    if (id !== buildId || !hits) return;
    placeHits(hits);
  }

  function another() {
    render((Math.random() * 0xffffffff) >>> 0);
  }

  function hitFace(x, y) {
    let best = null;
    let bestD = Infinity;
    const cell = Math.min(lastCssW / COLS, lastCssH / ROWS);
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      const d = Math.hypot(x - f.cx, y - f.cy);
      const reach = Math.max(f.s * 1.45, cell * 0.52);
      if (d < reach && d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  function stopLooking(face) {
    if (!face.looking) return;
    face.looking = false;
    ctx.save();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    blitBox(sheet, dirtyBox(face));
    ctx.restore();
  }

  function lookAt(face) {
    if (!face || !ready) return;
    faces.forEach((f) => {
      if (f !== face) stopLooking(f);
    });
    face.looking = true;
    face.startedAt = performance.now();
    face.frame = 0;
    paintLooking(face.startedAt);
    startTick();
  }

  function onPointer(e) {
    if (e.target !== canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const face = hitFace(x, y);
    if (face) {
      e.preventDefault();
      lookAt(face);
    }
  }

  canvas.addEventListener("click", onPointer);
  if (links.another) links.another.addEventListener("click", another);
  window.addEventListener("keydown", (e) => {
    if (e.target !== document.body) return;
    if (e.code === "Space") {
      e.preventDefault();
      another();
    }
  });

  let resizeTimer;
  let lastW = 0;
  let lastH = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const { w, h } = sheetSize();
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 24) return;
      lastW = w;
      lastH = h;
      render(seed);
    }, 120);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  {
    const { w, h } = sheetSize();
    lastW = w;
    lastH = h;
  }
  render(seed);
})();

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
    const pad = face.s * 1.75;
    const x = Math.max(0, face.cx - pad);
    const y = Math.max(0, face.cy - pad);
    return {
      x,
      y,
      w: Math.min(lastCssW, face.cx + pad) - x,
      h: Math.min(lastCssH, face.cy + pad) - y,
    };
  }

  function blitBox(box) {
    if (!sheet) return;
    const dpr = lastDpr;
    ctx.drawImage(
      sheet,
      Math.round(box.x * dpr), Math.round(box.y * dpr),
      Math.round(box.w * dpr), Math.round(box.h * dpr),
      box.x, box.y, box.w, box.h
    );
  }

  function paintLooking(now) {
    const looking = faces.filter((f) => f.looking);
    ctx.save();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    looking.forEach((face) => blitBox(dirtyBox(face)));
    looking.forEach((face) => {
      const el = (now - face.startedAt) / 1000;
      if (el >= PERIOD) {
        face.looking = false;
        return;
      }
      const box = dirtyBox(face);
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x, box.y, box.w, box.h);
      ctx.clip();
      inkHead(ctx, face, el / PERIOD, face.frame);
      ctx.restore();
    });
    ctx.restore();
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
    const cw = w / COLS;
    const ch = (h - band) / ROWS;
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      const rowDx = rng0.f(-cw * 0.04, cw * 0.04);
      const rowDy = rng0.f(-ch * 0.04, ch * 0.04);
      const rowS = rng0.f(0.96, 1.04);
      for (let col = 0; col < COLS; col++) {
        const idx = r * COLS + col;
        const dude = D.makeDude(D.rngFor(seed, "person", idx));
        const rng = D.rngFor(seed, "mark", idx);
        // Fill the cell with a head. The body is not drawn.
        const s = Math.min(cw, ch) * rng.f(0.38, 0.44) * rowS;
        const cx = Math.max(s * 1.15, Math.min(w - s * 1.15, cw * (col + 0.5) + rowDx + rng.f(-cw * 0.03, cw * 0.03)));
        const cy = Math.max(s * 1.2, Math.min(h - band - s * 0.4, 12 + ch * (r + 0.5) + rowDy + rng.f(-ch * 0.03, ch * 0.03)));
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

    const bd = document.createElement("canvas");
    bd.width = canvas.width;
    bd.height = canvas.height;
    const bc = bd.getContext("2d", { willReadFrequently: true });
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.__dpr = dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr;
    D.paper(bc, cssW, cssH, D.rngFor(seed, "paper"));
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
    const hits = drawChrome(bc, cssW, cssH, seed);
    D.grainPass(bc, dpr);
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

  function lookAt(face) {
    if (!face || !ready) return;
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

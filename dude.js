(() => {
  const canvas = document.getElementById("page");
  const ctx = canvas.getContext("2d");
  const tallyEl = document.getElementById("tally");
  const btn = document.getElementById("another");

  const INK = "#232019";
  const PAPER = "#dfdacf";
  const PAPER_RGB = [223, 218, 207];

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
    const w = opt.w ?? 1.8;
    let pts = path.slice();
    if (opt.closed) pts = pts.concat([pts[0], pts[1], pts[2] || pts[0]]); // overshoot past the join
    const L = polyLen(pts);
    if (L < 0.7) return;
    const sd = (opt.seed ?? rng.i(1, 99999999)) >>> 0;
    const S = resample(pts, NIB_STEP);
    const n = S.length;
    if (n < 2) return;

    // hand wobble, applied along the path normal so corners survive
    const amp = opt.wobble ?? Math.min(2.0, 0.26 + L * 0.011);
    const N0 = normals(S);
    const P = new Array(n);
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * L;
      const wob =
        (fbm2(u * 0.019, sd * 0.013, sd) - 0.5) * 2 * amp +
        (fbm2(u * 0.105, sd * 0.007, sd + 31) - 0.5) * 2 * amp * 0.3;
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
      const slow = fbm2(t01 * cyc * 2 + 7, sd * 0.011, sd + 5) - 0.5;
      const slow2 = fbm2(t01 * cyc * 5.5 + 3, sd * 0.017, sd + 211) - 0.5;
      const fast = fbm2(u * 0.185, sd * 0.005, sd + 61) - 0.5;
      let press = 1 + slow * 1.7 + slow2 * 0.62 + fast * 0.26;
      if (i < 3) press *= 1.3 - i * 0.09; // the nib sits down where it lands
      const tail = n - 1 - i;
      if (tail < 6) press *= 0.52 + (tail / 6) * 0.48; // and lifts on the way out
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
      if (turn > 0.35 && turn < 1.25) press *= 1 + Math.min(0.55, (turn - 0.35) * 0.95);
      if (opt.taper !== undefined) press *= 1 + (opt.taper - 1) * Math.pow(t01, opt.taperPow ?? 1.4);
      W[i] = Math.max(0.26, w * Math.min(2.6, Math.max(0.08, press)));
      // the nib lifts rarely and briefly; a dashed line is a broken pen,
      // not a dry one. Thin strokes skip more than fat ones.
      const dry = fbm2(u * 0.19 + 11, sd * 0.02, sd + 137);
      const thr = 0.125 * dryK * (w < 1.3 ? 1.4 : w > 2.6 ? 0.5 : 1);
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
    if (w > 1.7) {
      band(-0.32, 0.3, sd + 401, 0.45);
      band(0.32, 0.3, sd + 733, 0.47);
    }
    // the odd blot where the nib sat down too long
    if (w > 1.4 && rng.chance(0.1)) {
      const k = Math.min(n - 1, Math.max(0, rng.i(2, Math.max(3, n - 3))));
      const q = P[k];
      c.beginPath();
      c.ellipse(q.x + rng.f(-1, 1), q.y + rng.f(-1, 1), W[k] * rng.f(0.8, 1.5), W[k] * rng.f(0.7, 1.2), rng.f(0, 3), 0, Math.PI * 2);
      c.fill();
    }
    // pools where the nib lingered
    for (let k = 3; k < n - 3; k += 2) {
      if (!live[k] || W[k] < w * 1.3) continue;
      if (!rng.chance(0.14)) continue;
      c.beginPath();
      c.ellipse(P[k].x, P[k].y, W[k] * 0.58, W[k] * 0.46, k * 0.3, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  // A stroke plus optional restatement — the line the hand went back over.
  function stroke(c, rng, path, opt = {}) {
    const passes = opt.passes ?? 1;
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
      nib(c, rng, [b, { x: b.x + ((b.x - a.x) / d) * g, y: b.y + ((b.y - a.y) / d) * g }], {
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
      if (p.y > 0.22) {
        const t = (p.y - 0.22) / 0.78;
        p.x *= 1 + (this.jaw - 1) * t;
        p.y += this.chin * t;
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
  function drawHead(c, rng, skull, skinWash) {
    const hull = skull.silhouette();
    inkFill(c, rng, hull, PAPER, 1, 0.6);
    refibre(c, rng, hull);
    if (skinWash) inkFill(c, rng, hull, skinWash, 0.16, 0.6);
    // A head is not one closed loop. It is a cranium drawn over, then a jaw
    // drawn under, and they overshoot and cross where they meet — which is
    // also where the pen bears down. One continuous perturbed circle is what
    // makes a face read as a sticker instead of a skull.
    const n = hull.length;
    const arc = (a, b) => {
      const out = [];
      for (let i = a; i <= b; i++) out.push(hull[((i % n) + n) % n]);
      return out;
    };
    const ov = Math.round(n * rng.f(0.05, 0.11));
    const w0 = skull.s * 0.03 * (skull.pen || 1);
    const cranium = arc(-ov, Math.round(n * 0.5) + ov);
    const jaw = arc(Math.round(n * 0.5) - ov, n + ov);
    inkPoly(c, rng, cranium, { w: w0 * rng.f(0.82, 1.0), dry: 0.3, doubled: rng.chance(0.35) });
    inkPoly(c, rng, jaw, { w: w0 * rng.f(1.45, 1.95), dry: 0.2, doubled: rng.chance(0.45) });
    if (rng.chance(0.35)) {
      // a cheek restated on one side only
      const a0 = Math.round(n * rng.f(0.02, 0.12));
      inkPoly(c, rng, arc(a0, a0 + Math.round(n * rng.f(0.12, 0.26))), { w: w0 * 0.7, dry: 0.9 });
    }

    const earL = landmark(skull, { x: -0.88, y: 0.02 + rng.f(-0.12, 0.12), z: 0.05 });
    const earR = landmark(skull, { x: 0.88, y: 0.02 + rng.f(-0.12, 0.12), z: 0.05 });
    const er = skull.s * rng.f(0.14, 0.25);
    // an ear sits on the limb of the head, so its normal barely faces us —
    // it is visible while the surface has not turned right away
    if (earL.nz > -0.3) drawEar(c, rng, earL, er * rng.f(0.85, 1.15), -1);
    if (earR.nz > -0.3) drawEar(c, rng, earR, er * rng.f(0.85, 1.15), 1);
    return hull;
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
    // drawn in the ear's own frame, so it leans with the head rather than
    // staying a fixed vertical C bolted to the silhouette
    const F = (a, b) => onSurface(L, a, b);
    const pts = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = -Math.PI * 0.55 + t * Math.PI * 1.15;
      pts.push(F(Math.cos(a) * r * side, Math.sin(a) * r * 1.15));
    }
    inkPoly(c, rng, pts, { w: r * 0.14 });
    if (rng.chance(0.6)) {
      const q0 = F(side * r * 0.15, -r * 0.2);
      const q1 = F(side * r * 0.35, r * 0.25);
      inkLine(c, rng, q0.x, q0.y, q1.x, q1.y, r * 0.1);
    }
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
      y += (fbm2(u * 1.6 + 4, skull.yaw * 2 + (rng.seed % 53) * 0.07, rng.seed) - 0.5) * wob * 2;
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
    opt = Object.assign({}, opt, {
      puff: (opt.puff ?? 0.05) * rng.f(1.05, 2.4),
      // u spans (t-0.5)*PI*wrap*1.9, so wrap above ~1.05 sends the hairline
      // round the back of the skull and the mass swallows the whole face
      wrap: Math.min(1.05, (opt.wrap ?? 1.02) * rng.f(0.84, 1.08)),
      sideBias: (opt.sideBias ?? 0) + rng.f(-0.1, 0.1),
    });
    const front = frontRun(hairline(skull, rng, opt));
    if (!front || front.length < 3) return null;
    const a = front[0];
    const b = front[front.length - 1];
    const puff = (opt.puff ?? 0.05) * skull.s;
    let top = crownArc(skull, hull, a, b, puff, rng);
    if (top.length < 2) return null;
    top = outerProfile(top, skull, rng, opt);
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
    const kind = opt.outer ?? rng.pick(["skull", "skull", "quiff", "flattop", "dome", "wedge", "wedge", "sweep"]);
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
      const at = rng.f(0.12, 0.42);
      const w = rng.f(0.1, 0.3);
      const h = s * rng.f(0.16, 0.42);
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
      const h = s * rng.f(0.1, 0.32);
      const flip = rng.chance(0.5);
      return top.map((p, i) => {
        const t = i / (n - 1 || 1);
        const u = flip ? 1 - t : t;
        return push(p, h * u);
      });
    }
    if (kind === "dome") {
      // volume all round, falling off at the temples
      const h = s * rng.f(0.14, 0.4);
      return top.map((p, i) => {
        const t = i / (n - 1 || 1);
        return push(p, h * Math.sin(t * Math.PI));
      });
    }
    if (kind === "sweep") {
      // combed hard to one side: long over one temple, cropped at the other
      const dir = rng.chance(0.5) ? 1 : -1;
      const h = s * rng.f(0.12, 0.34);
      return top.map((p, i) => {
        const t = i / (n - 1 || 1);
        const u = dir > 0 ? t : 1 - t;
        return push(p, h * Math.pow(u, 1.8));
      });
    }
    // flattop: cut off square across the crown
    let minY = Infinity;
    for (const p of top) if (p.y < minY) minY = p.y;
    const cut = minY + s * rng.f(-0.12, 0.06);
    const tilt = rng.f(-0.12, 0.12);
    return top.map((p, i) => {
      const t = i / (n - 1 || 1);
      const line = cut + (t - 0.5) * s * tilt;
      return p.y > line ? p : { x: p.x, y: line + rng.f(-1, 1) };
    });
  }


  // Fill it black, cut the hairline in hard, let a few hairs escape the top.
  function inkMass(c, rng, h, color, opt = {}) {
    if (!h) return;
    const { front, top, mass } = h;
    const k = h._s / 100;
    // The hairline is a decision — a clean, committed cut across the face.
    // Only the outer edge is ragged, and only where the hair ends.
    inkFill(c, rng, mass, color, 1, (opt.rag ?? 2.0) * k * 0.7);
    ragEdge(c, rng, top, h._cx, h._cy, (opt.rag ?? 2.0) * k * 1.5, color);
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

    if (rng.chance(0.32)) {
      // a parting cut back to the skin
      const ti = rng.i(1, top.length - 2);
      const fi = Math.max(1, Math.min(front.length - 2, Math.round((1 - ti / (top.length - 1)) * (front.length - 1))));
      const a = top[ti];
      const b = front[fi];
      const wdt = h._s * rng.f(0.03, 0.075);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d;
      const ny = dx / d;
      const deep = rng.f(0.55, 1.0);
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
    const locks = rng.chance(0.55) ? rng.i(1, 3) : 0;
    for (let i = 0; i < locks; i++) {
      const fi = rng.i(1, front.length - 2);
      const p = front[fi];
      if (p.z !== undefined && p.z < 0.05) continue;
      const drop = h._s * rng.f(0.08, 0.24);
      const wdt = h._s * rng.f(0.022, 0.05);
      const lean = rng.f(-0.5, 0.5);
      const tip = { x: p.x + drop * lean, y: p.y + drop };
      inkFill(c, rng, [
        { x: p.x - wdt, y: p.y - wdt * 0.4 },
        { x: p.x + wdt, y: p.y - wdt * 0.6 },
        { x: tip.x + wdt * 0.18, y: tip.y },
        { x: tip.x - wdt * 0.1, y: tip.y + wdt * 0.2 },
      ], color, 1, 1.3 * k);
    }

    // a sideburn running down past the ear
    if (rng.chance(0.3)) {
      const end = rng.chance(0.5) ? front[0] : front[front.length - 1];
      const drop = h._s * rng.f(0.16, 0.42);
      const wdt = h._s * rng.f(0.05, 0.1);
      inkFill(c, rng, [
        { x: end.x - wdt, y: end.y },
        { x: end.x + wdt, y: end.y },
        { x: end.x + wdt * rng.f(0.2, 0.7), y: end.y + drop },
        { x: end.x - wdt * rng.f(0.5, 1.0), y: end.y + drop * rng.f(0.8, 1.0) },
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
    const budget = opt.strays ?? 6;
    if (budget <= 0 || !h.top.length) return;
    const k = h._s / 100;
    const tufts = rng.i(1, 3);
    for (let t = 0; t < tufts; t++) {
      const at = rng.i(0, h.top.length - 1);
      const spread = rng.i(1, 4);
      const count = Math.max(1, Math.round(budget / tufts));
      for (let i = 0; i < count; i++) {
        const q = h.top[Math.max(0, Math.min(h.top.length - 1, at + rng.i(-spread, spread)))];
        if (!q) continue;
        const ox = q.x - h._cx;
        const oy = q.y - h._cy;
        const len = Math.hypot(ox, oy) || 1;
        const g = (rng.chance(0.35) ? rng.f(9, 22) : rng.f(2, 8)) * (opt.strayLen ?? 1) * k;
        const curl = rng.f(-0.5, 0.5);
        inkPoly(c, rng, [
          q,
          { x: q.x + (ox / len) * g * 0.55 - (oy / len) * g * curl * 0.3, y: q.y + (oy / len) * g * 0.55 + (ox / len) * g * curl * 0.3 },
          { x: q.x + (ox / len) * g - (oy / len) * g * curl, y: q.y + (oy / len) * g + (ox / len) * g * curl },
        ], { w: rng.f(0.6, 1.8) * k, dry: 0.8 });
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
    const part = rng.f(0.2, 0.8);
    const sweep = rng.f(-0.35, 0.35);
    for (let i = 0; i < lines; i++) {
      // clump: strokes gather and leave gaps instead of marching evenly
      const base = i / (lines - 1 || 1);
      const t = Math.max(0, Math.min(1, base + (fbm2(base * 6.4 + rng.seed * 0.01, 2.7, rng.seed + 5) - 0.5) * 0.18 + rng.f(-0.02, 0.02)));
      const f = front[Math.min(front.length - 1, Math.round(t * (front.length - 1)))];
      const g = top[Math.min(top.length - 1, Math.round((1 - t) * (top.length - 1)))];
      if (!f || !g) continue;
      const dx = f.x - g.x;
      const dy = f.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      const swing = (bow + sweep * (t - part)) * d * rng.f(0.5, 1.3);
      const stop = rng.f(0.55, 1.05); // tips end at different depths
      // start a little past the outer edge so the strokes break the silhouette
      const out = rng.f(-1, 3.5) * k;
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
      inkPoly(c, rng, path, { w: rng.f(1.9, 4.0) * k, taper: rng.f(0.08, 0.3), dry: 0.5, overshoot: false });
    }
    // Even stroke-laid hair needs a hairline. Without one the strokes read as
    // a fringe radiating off the top contour rather than hair growing out of a
    // scalp — and the hairline is what tells you the shape of the head.
    if (opt.hairline !== false && front.length > 3) {
      const a = rng.i(0, Math.max(0, front.length - 4));
      const b = Math.min(front.length - 1, a + Math.round(front.length * rng.f(0.35, 0.8)));
      const run = front.slice(a, b + 1);
      if (run.length > 2) inkPoly(c, rng, run, { w: rng.f(1.2, 2.1) * k, dry: 1.2 });
    }
  }

  function shortTicks(c, rng, skull, lineY, count, len) {
    for (let i = 0; i < count; i++) {
      const u = rng.f(-1.2, 1.2);
      const y = lineY + rng.f(-0.18, 0.06);
      const p = pin(skull, sphere(u, Math.asin(clamp(y, -0.95, 0.2))));
      if (p.z < -0.35) continue;
      const tip = pin(skull, {
        x: Math.sin(u) * 0.55,
        y: y - rng.f(0.08, len),
        z: Math.cos(u) * 0.45,
      });
      inkLine(c, rng, p.x, p.y, tip.x, tip.y, skull.s * rng.f(0.0085, 0.0135));
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
  function drawHair(c, rng, skull, hull, style, color, defer) {
    const front = defer || [];
    const s = skull.s;
    const shape = rng.pick(["flat", "peak", "peak", "round", "sweep", "receded", "jagged", "low"]);
    const mk = (opt) => {
      const h = hairMass(skull, hull, rng, Object.assign({ shape }, opt));
      if (h) {
        h._cx = skull.cx;
        h._cy = skull.cy;
        h._s = skull.s;
      }
      return h;
    };

    if (style === "bald") {
      if (rng.chance(0.6)) {
        const a = pin(skull, { x: -0.22, y: -0.86, z: 0.3 });
        const b = pin(skull, { x: 0.24, y: -0.88, z: 0.28 });
        inkLine(c, rng, a.x, a.y, b.x, b.y, s * 0.011);
      }
      return;
    }

    if (style === "recede") {
      // hair only survives at the temples and around the back
      const h = mk({ lineY: -0.56, recede: -0.3, bangs: -0.28, puff: 0.055, wob: 0.03 });
      if (h) inkMass(c, rng, h, color, { strays: rng.chance(0.5) ? 6 : 0, edge: 2.3 });
      return;
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
      return;
    }

    if (style === "messy") {
      const h = mk({ lineY: -0.5, bangs: 0.06, puff: 0.15, wob: 0.07 });
      if (h) inkMass(c, rng, h, color, { strays: 14, strayLen: 1.5, rag: 3.2 });
      return;
    }

    if (style === "bowl") {
      const h = mk({ lineY: -0.42, bangs: 0.1, puff: 0.075, wob: 0.025 });
      if (h) {
        inkMass(c, rng, h, color, { strays: 5, rag: 1.4, edge: 2.8 });
        // the fringe hangs in points off the cut line
        for (let i = 2; i < h.front.length - 2; i += 2) {
          const p = h.front[i];
          if (p.z < 0.1 || rng.chance(0.35)) continue;
          inkLine(c, rng, p.x, p.y, p.x + rng.f(-2, 2), p.y + rng.f(s * 0.04, s * 0.1), s * 0.013);
        }
      }
      return;
    }

    if (style === "spiky") {
      const h = mk({ lineY: -0.5, puff: 0.04, wob: 0.04 });
      if (h) {
        inkMass(c, rng, h, color, { strays: 0 });
        for (let i = 0; i < h.top.length; i += 1) {
          const q = h.top[i];
          const ox = q.x - skull.cx;
          const oy = q.y - skull.cy;
          const len = Math.hypot(ox, oy) || 1;
          const g = rng.f(s * 0.12, s * 0.3);
          inkLine(c, rng, q.x, q.y, q.x + (ox / len) * g + rng.f(-6, 6), q.y + (oy / len) * g, s * rng.f(0.016, 0.026), 2);
        }
      }
      return;
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
      return;
    }

    if (style === "thatch") {
      // no black at all: hair as laid strokes over an open crown
      const h = mk({ lineY: -0.46, recede: rng.f(-0.04, 0.14), sideBias: rng.f(-0.2, 0.2), puff: 0.05, wob: 0.05 });
      if (h) combMass(c, rng, h, { lines: rng.i(30, 54), bow: rng.f(0.06, 0.3), wipe: true });
      return;
    }

    if (style === "comb") {
      const h = mk({ lineY: -0.5, recede: 0.13, sideBias: rng.sign() * 0.14, puff: 0.065, wob: 0.04 });
      if (h) combMass(c, rng, h, { lines: rng.i(30, 48), bow: rng.f(0.1, 0.34), wipe: true });
      return;
    }

    if (style === "side") {
      const dir = rng.sign();
      const h = mk({ lineY: -0.5, recede: 0.11, bangs: 0.04, sideBias: dir * 0.26, puff: 0.1, wob: 0.05 });
      if (h) inkMass(c, rng, h, color, { strays: rng.chance(0.55) ? 8 : 0, strayLen: 1.2 });
      return;
    }

    if (style === "beanie") {
      const h = mk({ lineY: -0.44, bangs: 0.03, puff: 0.2, wob: 0.015, outer: "dome" });
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
      return;
    }

    if (style === "flat") {
      const h = mk({ lineY: -0.46, bangs: 0.02, puff: 0.09, wob: 0.02, outer: "flattop" });
      if (h) {
        inkMass(c, rng, h, color, { strays: 0, rag: 1.1, edge: 3.2 });
        const brim = brimPts(skull, h, rng.f(0.3, 0.62), rng);
        if (brim) {
          front.push(() => {
            inkMassFill(c, rng, brim, color, { bite: s * 0.026 });
            inkPoly(c, rng, brim, { closed: true, w: s * 0.023, dry: 0.5 });
          });
        }
      }
      return;
    }

    if (style === "baseball") {
      const h = mk({ lineY: -0.44, puff: 0.15, wob: 0.015, outer: "dome" });
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
      return;
    }

    if (style === "band") {
      // hair first, then a band cutting across it
      const h = mk({ lineY: -0.5, puff: 0.09, wob: 0.05 });
      if (h) inkMass(c, rng, h, color, { strays: rng.chance(0.5) ? 7 : 0, strayLen: 1.3 });
      // Both edges must be sampled over the SAME visible span. Culling each
      // ring independently by depth leaves them ending at different places,
      // and the polygon built from the two crosses itself and floods the face.
      const band = ribbonBetween(skull, -0.5, -0.34, 0.92);
      if (band) {
        inkMassFill(c, rng, band.poly, color, { bite: s * 0.022 });
        inkPoly(c, rng, band.hi, { w: s * 0.02, dry: 0.5 });
        inkPoly(c, rng, band.lo, { w: s * 0.024, dry: 0.4 });
      }
      return;
    }

    const h = mk({ lineY: -0.5, puff: 0.095, wob: 0.05 });
    if (h) inkMass(c, rng, h, color, { strays: rng.chance(0.5) ? 6 : 0 });
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
    if (fill) inkFill(c, rng, pts, INK, 1, Math.max(0.5, ry * 0.16));
    inkPoly(c, rng, pts, { closed: true, w: Math.max(0.8, ry * 0.2) });
  }

  function drawEyes(c, rng, skull, type) {
    const s = skull.s;
    const fy = skull.faceY || 0;
    const gap = skull.eyeGap ?? 0.36;
    // a pair of eyes is never a pair: different sizes, different heights
    const kL = rng.f(0.62, 1.3);
    const kR = rng.f(0.62, 1.3) * (rng.chance(0.28) ? 1.2 : 1);
    const L = landmark(skull, { x: -gap, y: -0.12 + fy + rng.f(-0.05, 0.03), z: 0.88 });
    const R = landmark(skull, { x: gap, y: -0.12 + fy + rng.f(-0.03, 0.05), z: 0.88 });
    // one rule, everywhere: is this bit of surface facing the viewer
    const showL = L.nz > 0.06;
    const showR = R.nz > 0.06;
    const rx0 = s * rng.f(0.15, 0.21);
    const ry0 = s * rng.f(0.085, 0.13);
    const rx = rx0;
    const ry = ry0;
    const gz = skull.gaze ?? 0;

    const eye = (p, kind, k) => {
      const x = p.x;
      const y = p.y;
      const F = (a, b) => onSurface(p, a, b);
      const sq = 1;
      if (kind === "dot") inkCirc(c, rng, x, y, s * 0.062 * k, s * 0.018, true);
      else if (kind === "open") {
        almond(c, rng, p, rx * k, ry * k, false);
        // the pupils go the same way — that is what makes it a gaze
        const pu = F(gz * rx * k * 0.42, rng.f(-0.06, 0.1) * ry);
        inkCirc(c, rng, pu.x, pu.y, s * 0.042 * k, s * 0.013, true);
        if (rng.chance(0.5)) {
          // a lid cutting the top of the iris
          arcInFrame(c, rng, F, 0, -ry * k * 0.25, rx * k * 0.9, ry * k * 0.9, Math.PI + 0.35, -0.35, s * 0.016);
        }
      } else if (kind === "closed") {
        // shut: one curve and a lash or two
        arcInFrame(c, rng, F, 0, 0, rx * k * 0.9, ry * k * 1.1, Math.PI + rng.f(0.15, 0.45), rng.f(-0.45, -0.15), s * 0.019);
        if (rng.chance(0.5)) { const q0 = F(-rx * k * 0.5, s * 0.02), q1 = F(-rx * k * 0.75, s * 0.05); inkLine(c, rng, q0.x, q0.y, q1.x, q1.y, s * 0.012); }
      } else if (kind === "squint") {
        // pinched between two lids, no ring at all
        arcInFrame(c, rng, F, 0, ry * k * 0.5, rx * k, ry * k, Math.PI + 0.4, -0.4, s * 0.02);
        arcInFrame(c, rng, F, 0, -ry * k * 0.5, rx * k, ry * k, 0.45, Math.PI - 0.45, s * 0.017);
        const pq = F(gz * rx * k * 0.3, 0);
        inkCirc(c, rng, pq.x, pq.y, s * rng.f(0.022, 0.036) * k, s * 0.012, true);
      } else if (kind === "half") {
        // a heavy lid cutting the top third off the eye
        almond(c, rng, p, rx * k, ry * k, false);
        const ph = F(gz * rx * k * 0.4, ry * k * 0.2);
        inkCirc(c, rng, ph.x, ph.y, s * 0.04 * k, s * 0.013, true);
        inkPoly(c, rng, [
          F(-rx * k * 1.05, -ry * k * 0.5),
          F(0, -ry * k * (0.95 + rng.f(-0.2, 0.2))),
          F(rx * k * 1.05, -ry * k * 0.45),
        ], { w: s * rng.f(0.022, 0.032), dry: 0.35 });
      } else if (kind === "bare") {
        // no lid drawn at all: a pupil sitting on the face
        inkCirc(c, rng, x, y, s * rng.f(0.03, 0.055) * k, s * 0.016, true);
        if (rng.chance(0.6)) inkArc(c, rng, x, y - ry * k * 0.4, rx * k * 0.8 * sq, Math.PI + 0.5, -0.5, s * 0.016);
      } else if (kind === "x") {
        const r = s * 0.1;
        { const q0 = F(-r, -r), q1 = F(r, r); inkLine(c, rng, q0.x, q0.y, q1.x, q1.y, s * 0.017); }
        { const q0 = F(-r, r), q1 = F(r, -r); inkLine(c, rng, q0.x, q0.y, q1.x, q1.y, s * 0.017); }
      } else if (kind === "slit") {
        { const q0 = F(-s * 0.15, 0), q1 = F(s * 0.15, 0); inkLine(c, rng, q0.x, q0.y, q1.x, q1.y, s * 0.018); }
      } else if (kind === "angry") {
        { const q0 = F(-s * 0.16, -s * 0.09), q1 = F(s * 0.12, -s * 0.02); inkLine(c, rng, q0.x, q0.y, q1.x, q1.y, s * 0.018); }
        { const q0 = F(-s * 0.1, s * 0.05), q1 = F(s * 0.1, s * 0.05); inkLine(c, rng, q0.x, q0.y, q1.x, q1.y, s * 0.014); }
      }
    };

    if (type === "glasses") {
      if (showL) inkCirc(c, rng, L.x, L.y, s * 0.2 * kL, s * 0.017);
      if (showR) inkCirc(c, rng, R.x, R.y, s * 0.2 * kR, s * 0.017);
      if (showL && showR) inkLine(c, rng, L.x + s * 0.2, L.y, R.x - s * 0.2, R.y, s * 0.014);
      if (showL) inkLine(c, rng, L.x - s * 0.2, L.y, L.x - s * 0.34, L.y - s * 0.05, s * 0.013);
      if (showR) inkLine(c, rng, R.x + s * 0.2, R.y, R.x + s * 0.34, R.y - s * 0.05, s * 0.013);
      if (showL) inkCirc(c, rng, L.x, L.y, s * 0.048, s * 0.012, true);
      if (showR) inkCirc(c, rng, R.x, R.y, s * 0.048, s * 0.012, true);
      return;
    }

    if (type === "shades") {
      if (showL) almond(c, rng, L, s * 0.17, s * 0.1, true);
      if (showR) almond(c, rng, R, s * 0.17, s * 0.1, true);
      if (showL && showR) inkLine(c, rng, L.x + s * 0.16, L.y, R.x - s * 0.16, R.y, s * 0.015);
      return;
    }

    if (type === "patch") {
      const near = L.z >= R.z ? L : R;
      const far = L.z >= R.z ? R : L;
      if (far.z > 0.02) eye(far, "open", 1);
      if (near.z > -0.05) {
        almond(c, rng, near, s * 0.18, s * 0.12, true);
        const strap = pin(skull, { x: near === R ? 0.78 : -0.78, y: -0.24, z: 0.28 });
        inkLine(c, rng, near.x, near.y, strap.x, strap.y, s * 0.016);
      }
      return;
    }

    if (type === "wink") {
      if (showL) eye(L, "open", kL);
      if (showR) eye(R, "slit", kR);
      return;
    }

    const kinds = ["open", "open", "half", "half", "squint", "squint", "closed", "bare", "bare", "dot", "x", "slit", "angry"];
    const k = type === "mix" ? rng.pick(kinds) : type;
    // one eye is occasionally a different animal from the other
    const k2 = rng.chance(0.3) ? rng.pick(kinds) : k;
    if (showL) eye(L, k, kL);
    if (showR) eye(R, k2, kR);

    if (rng.chance(0.12)) {
      const p = showL ? L : R;
      inkCirc(c, rng, p.x + s * 0.02, p.y + s * 0.2, s * 0.014, s * 0.01, true);
      inkCirc(c, rng, p.x + s * 0.01, p.y + s * 0.32, s * 0.012, s * 0.01, true);
    }
  }

  function drawBrows(c, rng, skull, style) {
    if (style === "none") return;
    const s = skull.s;
    const hL = rng.f(-0.06, 0.02);
    const hR = rng.f(-0.02, 0.07);
    const brow = (side, h) => {
      const p = landmark(skull, { x: (skull.eyeGap ?? 0.36) * side, y: -0.3 + (skull.faceY || 0) + h, z: 0.86 });
      if (p.nz < 0.06) return;
      const lift = style === "angry" ? s * 0.08 * side : style === "arch" ? -s * 0.06 : 0;
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const arch = style === "arch" ? -Math.sin(t * Math.PI) * s * 0.05 : 0;
        pts.push(onSurface(p, (t - 0.5) * s * 0.32, lift * (1 - t * 1.4) + arch));
      }
      inkPoly(c, rng, pts, { w: s * rng.f(0.028, 0.042), dry: 0.4 });
    };
    brow(-1, hL);
    brow(1, hR);
  }

  // ---------- the nose ----------
  // One heavy gesture from the brow to the tip. This is the mark that owns
  // the face: longer, blacker and more committed than anything else on it.
  // Everything else is a bystander.
  function drawNose(c, rng, skull, style, heavy) {
    const s = skull.s;
    const w = s * 0.038 * (heavy ?? 1);

    // Build the nose on the face's own vertical axis in screen space. Pinning
    // raw 3D points works until the head turns, and then the nose walks off
    // across the cheek. The axis turns with the skull; the nose rides it.
    const fy = skull.faceY || 0;
    const browP = skull.project({ x: rng.f(-0.05, 0.05), y: -0.24 + fy + rng.f(-0.05, 0.06), z: 0.72 });
    const chinP = skull.project({ x: 0, y: 0.95, z: 0.4 });
    let ax = chinP.x - browP.x;
    let ay = chinP.y - browP.y;
    const faceLen = Math.hypot(ax, ay) || 1;
    ax /= faceLen;
    ay /= faceLen;

    const lean = rng.sign();
    // The nose is never plumb with the head axis. Tilting it a few degrees is
    // most of what sells a turn.
    const tilt = rng.f(0.08, 0.3) * lean;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const tx = ax * ct - ay * st;
    const ty = ax * st + ay * ct;
    ax = tx;
    ay = ty;
    const off = rng.f(-0.1, 0.03) * s * lean - s * rng.f(0.02, 0.09) * lean;
    const drop = faceLen * rng.f(0.34, 0.78);

    const A = (t, lat) => {
      const px = -ay;
      const py = ax;
      const p = {
        x: browP.x + ax * t + px * (lat + off),
        y: browP.y + ay * t + py * (lat + off),
      };
      return skull.limit(skull.deform(p), s * 0.16);
    };

    if (style === "tri") {
      // a wedge, drawn in two goes, never the same triangle twice
      const apex = A(rng.f(-0.04, 0.06) * s, rng.f(-4, 4));
      const wL = A(drop * rng.f(0.86, 1.0), -s * rng.f(0.12, 0.24) * lean);
      const wR = A(drop * rng.f(0.9, 1.06), s * rng.f(0.14, 0.26) * lean);
      inkPoly(c, rng, [apex, wL], { w: w * rng.f(0.8, 1.05), dry: 0.35 });
      inkPoly(c, rng, [apex, wR], { w: w * rng.f(0.7, 0.95), dry: 0.4 });
      if (rng.chance(0.78)) {
        inkPoly(c, rng, [wL, A(drop * 1.02, rng.f(-3, 3)), wR], { w: w * rng.f(0.6, 0.9), dry: 0.5 });
      }
      if (rng.chance(0.4)) inkCirc(c, rng, wR.x, wR.y, s * 0.02, w * 0.45, true);
      return { ax, ay, browP, base: drop };
    }

    if (style === "blob") {
      // no bridge at all: a lump and two nostrils
      const t = A(drop * rng.f(0.7, 0.95), rng.f(-3, 3));
      inkArc(c, rng, t.x, t.y, s * rng.f(0.09, 0.15), Math.PI + rng.f(0.1, 0.5), rng.f(-0.5, -0.1), w * 0.9);
      inkCirc(c, rng, t.x - s * 0.06 * lean, t.y + s * 0.03, s * rng.f(0.018, 0.03), w * 0.5, true);
      if (rng.chance(0.7)) inkCirc(c, rng, t.x + s * 0.07 * lean, t.y + s * 0.02, s * rng.f(0.015, 0.026), w * 0.45, true);
      if (rng.chance(0.5)) inkPoly(c, rng, [A(0, rng.f(-3, 3)), A(drop * 0.45, rng.f(-4, 4))], { w: w * 0.5, dry: 0.9 });
      return { ax, ay, browP, base: drop };
    }

    if (style === "button") {
      inkPoly(c, rng, [A(0, 0), A(drop * 0.55, rng.f(-2, 3))], { w: w * 0.75, dry: 0.6 });
      const t = A(drop, 0);
      inkCirc(c, rng, t.x, t.y, s * 0.085, w * 0.8);
      return { ax, ay, browP, base: drop + s * 0.085 };
    }

    // The long one: brow to tip in one run, but it BREAKS direction once at
    // the bridge — a straight column reads as a glyph, not a nose.
    const bend = rng.f(0.03, 0.11) * s * lean;
    const brk = rng.f(0.3, 0.5); // where the dorsal break happens
    const brkAmt = rng.f(0.35, 1.1) * s * 0.07 * -lean;
    const run = [];
    const nSeg = 9;
    for (let i = 0; i <= nSeg; i++) {
      const u = i / nSeg;
      const kink = u < brk ? (u / brk) * brkAmt : brkAmt * (1 - (u - brk) / (1 - brk)) * 0.15;
      run.push(A(drop * u, bend * Math.sin(u * Math.PI * 0.85) + kink));
    }
    // the tip turns under into the nostril — an arc, not a T-bar
    const hookOut = (style === "hook" ? 0.3 : 0.2) * s;
    const hookDrop = s * (style === "hook" ? 0.13 : 0.07);
    const nH = 5;
    for (let i = 1; i <= nH; i++) {
      const u = i / nH;
      run.push(A(drop + hookDrop * Math.sin(u * Math.PI * 0.9), bend + hookOut * lean * Math.sin(u * Math.PI * 0.62)));
    }
    inkPoly(c, rng, run, { w, passes: 2, dry: 0.25 });

    // the bottom has to have mass: the far wing, then a nostril
    if (rng.chance(0.72)) {
      const t0 = A(drop + s * 0.012, bend);
      const t1 = A(drop - s * rng.f(0.02, 0.06), bend - s * rng.f(0.12, 0.2) * lean);
      inkPoly(c, rng, [t0, A(drop + s * 0.002, bend - s * 0.07 * lean), t1], { w: w * 0.55, dry: 0.4 });
    }
    const nostril = A(drop - s * 0.008, bend + hookOut * 0.5 * lean);
    inkCirc(c, rng, nostril.x, nostril.y, s * rng.f(0.018, 0.032), w * 0.5, true);
    if (rng.chance(0.3)) {
      const far = A(drop - s * 0.008, bend - s * 0.1 * lean);
      inkCirc(c, rng, far.x, far.y, s * rng.f(0.012, 0.022), w * 0.4, true);
    }
    return { ax, ay, browP, base: drop + hookDrop };
  }

  function drawMouth(c, rng, skull, style, nose) {
    const s = skull.s;
    const fy = (skull.faceY || 0) * 0.5;
    // The mouth gets a real surface frame, then keeps it while its POSITION
    // is moved to sit under whatever nose this face got. Before, it was a
    // set of screen-horizontal arcs that stayed level on a rolled head.
    const ML = landmark(skull, { x: rng.f(-0.06, 0.06) + Math.sin(skull.yaw) * 0.08, y: rng.f(0.54, 0.68) + fy, z: 0.78 });
    if (nose) {
      const gap = s * rng.f(0.16, 0.42);
      const off = s * rng.f(-0.09, 0.09);
      const q = skull.limit(
        skull.deform({
          x: nose.browP.x + nose.ax * (nose.base + gap) - nose.ay * off,
          y: nose.browP.y + nose.ay * (nose.base + gap) + nose.ax * off,
        }),
        s * 0.14
      );
      ML.x = q.x;
      ML.y = q.y;
    }
    if (ML.nz < -0.1) return;
    const F = (a, b) => onSurface(ML, a, b);
    const x = ML.x;
    const y = ML.y;
    const w = s * rng.f(0.03, 0.048);
    const wide = s * rng.f(0.16, 0.28);
    if (style === "smile") {
      arcInFrame(c, rng, F, 0, -s * 0.05, wide, wide * 0.8, 0.3, Math.PI - 0.3, w);
    } else if (style === "frown") {
      arcInFrame(c, rng, F, 0, s * 0.2, wide * 0.9, wide * 0.75, Math.PI + 0.3, -0.3, w);
    } else if (style === "open") {
      // an open jaw with something inside it
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        pts.push(F(Math.cos(a) * wide * 0.62, Math.sin(a) * s * rng.f(0.1, 0.15)));
      }
      inkPoly(c, rng, pts, { closed: true, w, dry: 0.4 });
      if (rng.chance(0.55)) {
        const n = rng.i(2, 4);
        for (let i = 1; i < n; i++) {
          const tx = x - wide * 0.5 + (i / n) * wide;
          const t0 = F(tx - x, -s * 0.09), t1 = F(tx - x, -s * rng.f(0.02, 0.05));
          inkLine(c, rng, t0.x, t0.y, t1.x, t1.y, w * 0.6);
        }
      } else if (rng.chance(0.5)) {
        inkMassFill(c, rng, pts, INK, { bite: s * 0.02 });
      }
    } else if (style === "teeth") {
      // a row of teeth showing under a lip
      inkPoly(c, rng, [F(-wide, rng.f(-2, 2)), F(0, -s * rng.f(0.0, 0.05)), F(wide, rng.f(-2, 3))], { w, dry: 0.4 });
      const n = rng.i(3, 6);
      for (let i = 1; i < n; i++) {
        const tx = x - wide * 0.8 + (i / n) * wide * 1.6;
        const u0 = F(tx - x, s * 0.01), u1 = F(tx - x + rng.f(-1, 1), s * rng.f(0.06, 0.11));
        inkLine(c, rng, u0.x, u0.y, u1.x, u1.y, w * 0.55);
      }
      inkPoly(c, rng, [F(-wide * 0.85, s * 0.02), F(0, s * rng.f(0.1, 0.16)), F(wide * 0.85, s * 0.03)], { w: w * 0.8, dry: 0.5 });
    } else if (style === "smirk") {
      inkPoly(c, rng, [F(-wide * 0.85, s * 0.05), F(s * 0.04, -s * 0.01), F(wide * 0.9, -s * 0.09)], { w, dry: 0.4 });
    } else if (style === "lips") {
      // an overhanging upper lip
      inkPoly(c, rng, [F(-wide * 0.9, 0), F(-wide * 0.28, -s * 0.045), F(wide * 0.2, -s * 0.03), F(wide * 0.9, s * 0.01)], { w: w * 1.25, dry: 0.35 });
      arcInFrame(c, rng, F, 0, s * 0.01, wide * 0.8, wide * 0.6, 0.3, Math.PI - 0.3, w * 0.75);
    } else if (style === "pucker") {
      inkCirc(c, rng, x, y, s * rng.f(0.05, 0.085), w, false);
      { const a0 = F(-s * 0.14, -s * 0.02), a1 = F(-s * 0.06, 0); inkLine(c, rng, a0.x, a0.y, a1.x, a1.y, w * 0.6); }
      { const b0 = F(s * 0.06, 0), b1 = F(s * 0.14, -s * 0.03); inkLine(c, rng, b0.x, b0.y, b1.x, b1.y, w * 0.6); }
    } else {
      inkPoly(c, rng, [F(-wide * rng.f(0.7, 1.0), rng.f(-1, 2)), F(s * rng.f(-0.03, 0.05), rng.f(-2, 2)), F(wide * rng.f(0.6, 1.0), rng.f(-3, 2))], { w, dry: 0.4 });
    }
    // corner marks — a mouth ends somewhere, it does not just stop
    if (rng.chance(0.6)) {
      const side = rng.sign();
      const ca = side * s * rng.f(0.11, 0.19);
      const c0 = onSurface(ML, ca, rng.f(-2, 1));
      const c1 = onSurface(ML, ca + side * s * 0.04, s * rng.f(0.03, 0.08));
      inkLine(c, rng, c0.x, c0.y, c1.x, c1.y, w * 0.7);
    }
  }

  function drawFacialHair(c, rng, skull, style) {
    if (style === "none") return;
    const s = skull.s;
    if (style === "stache") {
      const L = pin(skull, { x: -0.28, y: 0.46, z: 0.88 });
      const R = pin(skull, { x: 0.28, y: 0.46, z: 0.88 });
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const x = L.x + (R.x - L.x) * t;
        const y = L.y + (R.y - L.y) * t + Math.sin(t * Math.PI) * s * 0.035;
        inkLine(c, rng, x - s * 0.02, y, x + rng.f(s * 0.03, s * 0.09), y + rng.f(-2, 3), s * rng.f(0.015, 0.023));
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
        const p = pin(skull, { x: rng.f(-0.48, 0.48), y: rng.f(0.4, 0.9), z: 0.58 });
        if (p.z > 0) inkLine(c, rng, p.x, p.y, p.x + rng.f(-1.6, 1.6), p.y + rng.f(1, 3.5), s * 0.009);
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

  // Heads come in kinds; bodies were one trapezoid with the dials nudged, so
  // six different men wore the identical mannequin. Same treatment: shoulder
  // and hip width, torso and leg length, and the waist profile all move
  // together, because a barrel-chested man is not a lanky one with wider
  // shoulders.
  function bodyKind(rng, person) {
    const kinds = [
      // stocky: wide, short, thick through the middle
      () => ({ shW: rng.f(1.14, 1.42), hipW: rng.f(0.92, 1.18), torso: rng.f(1.6, 1.9),
               legs: rng.f(1.3, 1.62), waist: rng.f(1.06, 1.26), armW: rng.f(0.2, 0.25) }),
      // lanky: narrow, long, straight
      () => ({ shW: rng.f(0.7, 0.9), hipW: rng.f(0.48, 0.66), torso: rng.f(2.2, 2.6),
               legs: rng.f(2.1, 2.55), waist: rng.f(0.74, 0.92), armW: rng.f(0.15, 0.19) }),
      // pot: narrow up top, heavy low down
      () => ({ shW: rng.f(0.8, 1.0), hipW: rng.f(1.0, 1.3), torso: rng.f(1.85, 2.15),
               legs: rng.f(1.5, 1.85), waist: rng.f(1.2, 1.5), armW: rng.f(0.17, 0.22) }),
      // taper: broad shoulders down to nothing
      () => ({ shW: rng.f(1.2, 1.5), hipW: rng.f(0.52, 0.72), torso: rng.f(1.95, 2.3),
               legs: rng.f(1.85, 2.2), waist: rng.f(0.66, 0.86), armW: rng.f(0.18, 0.23) }),
      // slight: small all over, short limbs
      () => ({ shW: rng.f(0.72, 0.92), hipW: rng.f(0.56, 0.76), torso: rng.f(1.55, 1.85),
               legs: rng.f(1.35, 1.7), waist: rng.f(0.86, 1.1), armW: rng.f(0.15, 0.19) }),
      // ordinary, so the sheet has a baseline
      () => ({ shW: rng.f(0.92, 1.14), hipW: rng.f(0.66, 0.88), torso: rng.f(1.9, 2.25),
               legs: rng.f(1.7, 2.05), waist: rng.f(0.84, 1.16), armW: rng.f(0.16, 0.21) }),
    ];
    // The build decided for the person has to pick the body, or a heavy
    // character gets a lanky torso and the character layer means nothing
    // below the neck.
    const byBuild = { heavy: [0, 0, 2, 2, 5], slight: [1, 1, 4, 4, 5], ordinary: [5, 5, 3, 1, 0, 2] };
    const pool = (person && byBuild[person.build]) || [0, 1, 2, 3, 4, 5, 5];
    let i = rng.pick(pool);
    // an old frame narrows and stoops whatever it started as
    if (person && person.age === "old" && rng.chance(0.4)) i = rng.pick([1, 4, 2]);
    return kinds[i]();
  }

  function drawBody(c, rng, cx, neckY, s, lean, clothes, person) {
    const lx = lean * s * 0.26;
    const B = bodyKind(rng, person);
    const shW = s * B.shW;
    const hipW = s * B.hipW;
    const shY = neckY + s * rng.f(0.32, 0.54);
    const hipY = neckY + s * B.torso;
    const kneeY = hipY + s * B.legs * rng.f(0.46, 0.56);
    const footY = hipY + s * B.legs;
    const aw0 = B.armW;
    const armR = (t) => s * (aw0 - (aw0 - 0.082) * Math.pow(t, 0.75)) * (0.94 + 0.12 * fbm2(t * 3.4, aw0 * 90, 991));
    const lw0 = Math.max(0.15, B.armW * rng.f(1.08, 1.3));
    const legR = (t) => s * (lw0 - lw0 * 0.34 * t);
    const pose = clothes.pose;
    const shrug = rng.f(-0.12, 0.16);
    const slope = rng.f(-0.14, 0.26); // square shoulders through to sloping
    // no two sides of a drawn person agree
    const asymL = rng.f(0.86, 1.14);
    const asymR = rng.f(0.86, 1.14);
    const asym = (side) => (side < 0 ? asymL : asymR);

    // the torso leans a few degrees off the head's axis
    const tilt = rng.f(-0.1, 0.1);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const P = (x, y) => {
      const dy = y - neckY;
      const dx = x + (lx * dy) / (s * 2);
      return { x: cx + dx * ct - dy * st, y: neckY + dx * st + dy * ct };
    };

    // ---- skeleton lines the outline is grown around ----
    const arm = (side) => {
      const sh = P(side * shW * 0.82, shY + s * shrug * side);
      if (pose === "pockets") {
        return [sh, P(side * (shW + s * 0.16), shY + s * 0.78), P(side * (hipW + s * 0.1), hipY - s * 0.16)];
      }
      if (pose === "hips") {
        return [sh, P(side * (shW + s * 0.42), shY + s * 0.74), P(side * (hipW + s * 0.06), hipY - s * 0.08)];
      }
      if (pose === "folded") {
        return [sh, P(side * (shW + s * 0.14), shY + s * 0.62), P(-side * s * 0.16, shY + s * 0.95)];
      }
      // hanging
      // the hang is not vertical on everyone: some swing out, some tuck in
      const a = asym(side);
      const swing = rng.f(-0.16, 0.24);
      return [
        sh,
        P(side * (shW + s * (rng.f(0.02, 0.13) + swing * 0.4)) * a, shY + s * rng.f(0.66, 0.96) * a),
        P(side * (shW + s * (rng.f(-0.02, 0.2) + swing)) * a, shY + s * rng.f(1.42, 1.86) * a),
      ];
    };

    // stance: bowed, knock-kneed, wide, or planted
    const stance = rng.f(-0.22, 0.26);
    const spread = rng.f(0.78, 1.35);
    const leg = (side) => {
      const drop = footY + s * rng.f(-0.09, 0.09);
      return [
        P(side * hipW * rng.f(0.48, 0.62) * asym(side), hipY - s * 0.05),
        P(side * (hipW * 0.5 * spread + s * (stance + rng.f(-0.08, 0.08))), kneeY + s * rng.f(-0.1, 0.1)),
        P(side * (hipW * 0.46 * spread + s * (-stance * 1.6 + rng.f(-0.12, 0.12))), drop),
      ];
    };

    const La = arm(-1);
    const Ra = arm(1);
    const Ll = leg(-1);
    const Rl = leg(1);

    const smooth = (pts, n) => {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const mid = { x: (a.x + b.x) / 2 + rng.f(-2, 2), y: (a.y + b.y) / 2 };
        out.push(...bezier(a, b, mid, n).slice(1));
      }
      return out;
    };
    const LaS = smooth(La, 9);
    const RaS = smooth(Ra, 9);
    const LlS = smooth(Ll, 9);
    const RlS = smooth(Rl, 9);

    // ---- one continuous silhouette ----
    const neckL = P(-s * rng.f(0.15, 0.21), neckY - s * 0.42);
    const neckR = P(s * rng.f(0.15, 0.21), neckY - s * 0.42);
    const shoulderL = P(-shW * asymL, shY + s * (slope - shrug));
    const shoulderR = P(shW * asymR, shY + s * (slope + shrug) + s * rng.f(-0.06, 0.06));
    // a belly, or a pinch, or neither — and it is not at the same height twice
    const waistY = shY + (hipY - shY) * rng.f(0.42, 0.68);
    const midW = (shW + hipW) * 0.5 * B.waist;
    const waistL = P(-midW * rng.f(0.94, 1.06), waistY);
    const waistR = P(midW * rng.f(0.94, 1.06), waistY + s * rng.f(-0.06, 0.06));
    const hipL = P(-hipW, hipY);
    const hipR = P(hipW, hipY);
    const crotch = P(rng.f(-4, 4), hipY + s * rng.f(0.1, 0.3));

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

    const shoeKind = rng.pick(["wedge", "round", "boot", "square", "round"]);
    const footPts = (ankle, side) => {
      const toe = side * s * rng.f(0.24, 0.44);
      const h = s * rng.f(0.09, 0.15);
      if (shoeKind === "round") {
        const pts = [];
        for (let i = 0; i <= 9; i++) {
          const a = -Math.PI * 0.5 + (i / 9) * Math.PI;
          pts.push({
            x: ankle.x + Math.sin(a) * toe * (a > 0 ? 1 : 0.5),
            y: ankle.y - s * 0.02 + (1 - Math.cos(a)) * h * 0.6,
          });
        }
        pts.push({ x: ankle.x - side * s * 0.15, y: ankle.y + h });
        return pts;
      }
      if (shoeKind === "boot") {
        return [
          { x: ankle.x - side * s * 0.16, y: ankle.y - s * rng.f(0.12, 0.26) },
          { x: ankle.x + side * s * 0.15, y: ankle.y - s * rng.f(0.1, 0.22) },
          { x: ankle.x + toe * 0.8, y: ankle.y + s * 0.02 },
          { x: ankle.x + toe * 0.72, y: ankle.y + h },
          { x: ankle.x - side * s * 0.18, y: ankle.y + h },
        ];
      }
      if (shoeKind === "square") {
        return [
          { x: ankle.x - side * s * 0.13, y: ankle.y - s * 0.02 },
          { x: ankle.x + toe * 0.85, y: ankle.y - s * 0.03 },
          { x: ankle.x + toe * 0.85, y: ankle.y + h },
          { x: ankle.x - side * s * 0.15, y: ankle.y + h },
        ];
      }
      return [
        { x: ankle.x + side * s * 0.13, y: ankle.y - s * 0.02 },
        { x: ankle.x + toe, y: ankle.y + s * 0.04 },
        { x: ankle.x + toe * 0.92, y: ankle.y + h },
        { x: ankle.x - side * s * 0.14, y: ankle.y + h * 0.9 },
      ];
    };
    const Lfoot = footPts(LlS[LlS.length - 1], -1);
    const Rfoot = footPts(RlS[RlS.length - 1], 1);

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
          y: a.y + (b.y - a.y) * t + rng.f(-1, 1) * s * 0.03,
        });
      }
      return out;
    };
    const core = []
      .concat([neckL])
      .concat(span(neckL, shoulderL, 3))
      .concat([shoulderL])
      .concat(span(shoulderL, waistL, 4))
      .concat([waistL])
      .concat(span(waistL, hipL, 3))
      .concat([hipL])
      .concat(edgeOf(LlS, legR, -1, 31).slice(1))
      .concat(Lfoot)
      .concat(edgeOf(LlS, legR, 1, 43).reverse().slice(1, -1))
      .concat([crotch])
      .concat(edgeOf(RlS, legR, -1, 57).slice(1))
      .concat(Rfoot.slice().reverse())
      .concat(edgeOf(RlS, legR, 1, 71).reverse().slice(1, -1))
      .concat([hipR])
      .concat(span(hipR, waistR, 3))
      .concat([waistR])
      .concat(span(waistR, shoulderR, 4))
      .concat([shoulderR])
      .concat(span(shoulderR, neckR, 3))
      .concat([neckR]);

    const armShape = (S, sd) => {
      const a = edgeOf(S, armR, -1, sd);
      const b = edgeOf(S, armR, 1, sd + 13);
      // round both ends: an arm that closes on a hard reversal at the
      // shoulder gets a blot there every time
      const shoulderCap = round(S.slice().reverse(), armR(0)).reverse();
      return a.concat(round(S, armR(1))).concat(b.reverse()).concat(shoulderCap);
    };
    const Larm = armShape(LaS, 11);
    const Rarm = armShape(RaS, 83);

    if (clothes.wash) {
      inkFill(c, rng, core, clothes.wash, 0.22, 0.8);
      inkFill(c, rng, Larm, clothes.wash, 0.22, 0.8);
      inkFill(c, rng, Rarm, clothes.wash, 0.22, 0.8);
    }
    // Same weight and same wobble as the head. A thin, clean, ruled body
    // under a heavy, dirty head is two different hands on one page.
    const bw = s * 0.034 * rng.f(0.92, 1.12);
    const wob = s * rng.f(0.035, 0.06);
    inkPoly(c, rng, core, { closed: true, w: bw, doubled: true, dry: 0.6, wobble: wob });
    // Arms are drawn LAST, over the finished garment. Drawn before it, every
    // hem and stripe ran straight across them and the arms read transparent.
    const drawArms = () => {
      // Sleeve marks used to be drawn with the rest of the clothes, before
      // this fill, so the fill erased them and the garment lost its cuffs.
      inkFill(c, rng, Larm, PAPER, 1, 0.8);
      inkFill(c, rng, Rarm, PAPER, 1, 0.8);
      refibre(c, rng, Larm);
      refibre(c, rng, Rarm);
      inkPoly(c, rng, Larm, { closed: true, w: bw * 0.92, dry: 0.7, wobble: wob * 0.8 });
      inkPoly(c, rng, Rarm, { closed: true, w: bw * 0.92, dry: 0.7, wobble: wob * 0.8 });
      if (wantCuffs) {
        cuff(LaS, -1);
        cuff(RaS, 1);
      }
      if (pose !== "folded" && pose !== "pockets") {
        hand(c, rng, LaS, armR(1), -1, s);
        hand(c, rng, RaS, armR(1), 1, s);
      } else if (pose === "pockets") {
        for (let side = -1; side <= 1; side += 2) {
          const t = side < 0 ? LaS[LaS.length - 1] : RaS[RaS.length - 1];
          inkPoly(c, rng, [
            { x: t.x - side * s * 0.22, y: t.y - s * rng.f(0.16, 0.26) },
            { x: t.x - side * s * 0.06, y: t.y - s * 0.04 },
            { x: t.x + side * s * rng.f(0.08, 0.16), y: t.y + s * rng.f(0.0, 0.06) },
          ], { w: s * 0.017, dry: 0.7 });
        }
      }
    };
    const outline = core;

    // ---- clothes cut into the figure ----
    // Pinned to the shoulders, the hem landed at the same height whatever the
    // build — measured across seven figures it moved 1.25x while the torso
    // moved 1.56x and the legs 1.85x. A garment belongs to its torso.
    const hemY = shY + (hipY - shY) * rng.f(0.82, 1.34);
    const sleeveT = rng.f(0.36, 0.66);
    // A straight rule across the arm at the same place on both sides reads as
    // the seam where two tubes were butted together, not as a sleeve.
    // a hem is not a rule: it wanders, and it stops short of the silhouette
    const hemPts = () => {
      const x0 = waistL.x + s * rng.f(0.04, 0.16);
      const x1 = waistR.x - s * rng.f(0.04, 0.16);
      const pts = [];
      const n = 5;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push({
          x: x0 + (x1 - x0) * t,
          y: hemY + Math.sin(t * Math.PI * rng.f(0.7, 1.6)) * s * rng.f(-0.05, 0.05) + rng.f(-2, 2),
        });
      }
      return pts;
    };

    let wantCuffs = false;
    const cuff = (S, side) => {
      if (rng.chance(0.22)) return; // not every sleeve gets marked
      const t = sleeveT + rng.f(-0.12, 0.12);
      const i = Math.max(1, Math.min(S.length - 2, Math.round(t * (S.length - 1))));
      const a = edgeOf(S, armR, -1, side < 0 ? 11 : 83)[i];
      const b = edgeOf(S, armR, 1, side < 0 ? 24 : 96)[i];
      if (!a || !b) return;
      // A mark spanning the arm reads as the seam between two tubes. A cuff
      // is a tick biting in from one edge and stopping.
      const from = rng.chance(0.5) ? 0 : 1;
      const p0 = from ? b : a;
      const p1 = from ? a : b;
      const reach = rng.f(0.3, 0.7);
      inkPoly(c, rng, [
        { x: p0.x, y: p0.y },
        {
          x: p0.x + (p1.x - p0.x) * reach * 0.55 + (p1.y - p0.y) * rng.f(-0.2, 0.2),
          y: p0.y + (p1.y - p0.y) * reach * 0.55 - (p1.x - p0.x) * rng.f(-0.2, 0.2),
        },
        { x: p0.x + (p1.x - p0.x) * reach, y: p0.y + (p1.y - p0.y) * reach },
      ], { w: s * rng.f(0.011, 0.018), dry: 0.9, wobble: s * 0.018 });
    };

    if (clothes.kind === "tee") {
      wantCuffs = true;
      inkPoly(c, rng, arcPts((neckL.x + neckR.x) / 2, neckL.y + s * 0.06, s * rng.f(0.24, 0.32), 0.42, Math.PI - 0.42, rng), { w: s * 0.017, dry: 0.6, wobble: s * 0.035 });
      inkPoly(c, rng, hemPts(), { w: s * 0.018, dry: 0.6, wobble: s * 0.05 });
    } else if (clothes.kind === "hoodie") {
      inkPoly(c, rng, arcPts((neckL.x + neckR.x) / 2, neckY + s * 0.36, s * 0.42, 0.35, Math.PI - 0.35, rng), { w: s * 0.019, dry: 0.6, wobble: s * 0.035 });
      inkPoly(c, rng, hemPts(), { w: s * 0.021, dry: 0.6, wobble: s * 0.05 });
      const pk = (neckL.x + neckR.x) / 2;
      inkPoly(c, rng, [
        { x: pk - s * 0.34, y: hemY - s * 0.42 },
        { x: pk - s * 0.3, y: hemY - s * 0.06 },
        { x: pk + s * 0.3, y: hemY - s * 0.06 },
        { x: pk + s * 0.34, y: hemY - s * 0.44 },
      ], { w: s * 0.016 });
      inkLine(c, rng, pk - s * 0.06, neckY + s * 0.42, pk - s * 0.1, neckY + s * 0.78, s * 0.013);
      inkLine(c, rng, pk + s * 0.06, neckY + s * 0.42, pk + s * 0.12, neckY + s * 0.8, s * 0.013);
    } else if (clothes.kind === "jacket") {
      const mid = (neckL.x + neckR.x) / 2;
      inkPoly(c, rng, [
        { x: mid + rng.f(-3, 3), y: shY - s * 0.02 },
        { x: mid + rng.f(-4, 6), y: (shY + hemY) / 2 },
        { x: mid + rng.f(-6, 8), y: hemY },
      ], { w: s * 0.019, passes: 2 });
      inkPoly(c, rng, [
        { x: mid - s * 0.3, y: shY - s * 0.04 },
        { x: mid - s * 0.06, y: shY + s * 0.36 },
        { x: mid - s * 0.34, y: shY + s * 0.44 },
      ], { w: s * 0.016 });
      inkPoly(c, rng, [
        { x: mid + s * 0.3, y: shY - s * 0.04 },
        { x: mid + s * 0.06, y: shY + s * 0.36 },
        { x: mid + s * 0.34, y: shY + s * 0.44 },
      ], { w: s * 0.016 });
      inkPoly(c, rng, hemPts(), { w: s * 0.02, dry: 0.6, wobble: s * 0.05 });
      wantCuffs = true;
    } else if (clothes.kind === "sweater") {
      inkPoly(c, rng, arcPts((neckL.x + neckR.x) / 2, neckY + s * 0.16, s * 0.3, 0.3, Math.PI - 0.3, rng), { w: s * 0.019, dry: 0.6, wobble: s * 0.035 });
      for (let i = 0; i < 4; i++) {
        const y = hemY - s * 0.16 + i * s * 0.055;
        inkLine(c, rng, waistL.x + s * 0.08, y, waistR.x - s * 0.08, y + rng.f(-2, 2), s * 0.012);
      }
      wantCuffs = true;
    }

    // Cloth has folds. A flat fill inside a clean outline is the difference
    // between a garment and a silhouette.
    const fold = (x0, y0, x1, y1, wk) =>
      inkPoly(c, rng, [
        { x: x0, y: y0 },
        { x: (x0 + x1) / 2 + rng.f(-4, 4), y: (y0 + y1) / 2 + rng.f(-3, 3) },
        { x: x1, y: y1 },
      ], { w: s * (wk ?? 0.014), dry: 0.9, wobble: s * 0.02 });

    for (let side = -1; side <= 1; side += 2) {
      if (rng.chance(0.4)) continue; // not every shoulder gets one
      const sx0 = side < 0 ? shoulderL : shoulderR;
      const n = rng.i(1, 2);
      for (let i = 0; i < n; i++) {
        fold(
          sx0.x - side * s * rng.f(0.1, 0.28),
          sx0.y + s * rng.f(0.16, 0.4),
          sx0.x - side * s * rng.f(0.34, 0.7),
          sx0.y + s * rng.f(0.5, 1.0)
        );
      }
    }
    if (rng.chance(0.82)) {
      const n = rng.i(2, 5);
      for (let i = 0; i < n; i++) {
        const x0 = waistL.x + ((waistR.x - waistL.x) * (i + 0.6)) / n;
        fold(x0, hemY - s * rng.f(0.2, 0.42), x0 + rng.f(-5, 5), hemY - s * rng.f(0.01, 0.08), 0.011);
      }
    }
    if (rng.chance(0.6)) {
      // shadow under the hem
      const n = rng.i(4, 9);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const x0 = waistL.x + (waistR.x - waistL.x) * t;
        inkLine(c, rng, x0, hemY - s * rng.f(0.02, 0.1), x0 + s * rng.f(0.04, 0.1), hemY + rng.f(-2, 2), s * 0.01);
      }
    }

    if (clothes.pattern) {
      c.save();
      c.beginPath();
      outline.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.clip();
      const pitch = s * rng.f(0.11, 0.3);
      const heavy = s * rng.f(0.022, 0.07);
      if (clothes.pattern === "stripe") {
        // skewed independently, gaps varying, a third running past the edge
        for (let y = shY + s * rng.f(0.04, 0.2); y < hemY; y += pitch * rng.f(0.6, 1.4)) {
          const skew = rng.f(-0.14, 0.14) * shW;
          const over = rng.chance(0.34) ? rng.f(0.1, 0.45) : 0;
          inkPoly(c, rng, [
            { x: cx - shW * (1.2 + over), y: y - skew },
            { x: cx + rng.f(-6, 6), y: y + rng.f(-3, 4) },
            { x: cx + shW * (1.2 + over), y: y + skew + rng.f(-4, 4) },
          ], { w: heavy * rng.f(0.7, 1.3), dry: 0.5, wobble: s * 0.035 });
        }
      } else if (clothes.pattern === "vstripe") {
        for (let x = cx - shW * 1.3; x < cx + shW * 1.3; x += pitch * rng.f(0.75, 1.3)) {
          inkPoly(c, rng, [
            { x, y: shY + s * rng.f(-0.1, 0.15) },
            { x: x + rng.f(-4, 4), y: (shY + hemY) / 2 },
            { x: x + rng.f(-5, 5), y: hemY - s * rng.f(-0.1, 0.2) },
          ], { w: heavy * 0.42, dry: 0.9, wobble: s * 0.03 });
        }
      } else if (clothes.pattern === "dark") {
        // a black garment — the garment, not the whole figure. The core
        // outline runs all the way to the shoes.
        c.beginPath();
        c.rect(cx - s * 4, shY - s * 0.9, s * 8, hemY - shY + s * 0.9);
        c.clip();
        inkMassFill(c, rng, core, INK, { bite: s * 0.06 });
      }
      c.restore();
    }

    drawArms();

    if (clothes.darkLegs && clothes.pattern !== "dark") {
      c.save();
      c.beginPath();
      core.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.clip();
      c.beginPath();
      c.rect(cx - s * 4, hipY - s * 0.05, s * 8, s * 4);
      c.clip();
      inkMassFill(c, rng, core, INK, { bite: s * 0.055 });
      c.restore();
    }
    // shoes read as weight on the ground
    inkMassFill(c, rng, Lfoot, INK, { bite: s * 0.04 });
    inkMassFill(c, rng, Rfoot, INK, { bite: s * 0.04 });

    let maxX = -Infinity;
    for (const q of core.concat(Larm, Rarm)) {
      if (q.x > maxX) maxX = q.x;
    }
    return { hipY, footY, maxX, core };
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
    if ((opt.rule ? true : rng.chance(0.66)) && px > size * 0.8) {
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

  const FIRST = [
    "Lenny", "Gus", "Margo", "Pike", "Nell", "Horst", "Bea", "Cal", "Dino", "Edie",
    "Finn", "Gert", "Hal", "Ike", "June", "Kip", "Lars", "Mo", "Ned", "Ora",
    "Paz", "Quin", "Red", "Sol", "Tess", "Ulf", "Val", "Wes", "Yves", "Zed",
    "Archie", "Bruno", "Clem", "Dutch", "Ellis", "Floyd", "Greta", "Hank", "Iris",
    "Jules", "Klaus", "Lila", "Moss", "Nora", "Otto", "Pearl", "Ruth", "Stan",
    "Thea", "Vera", "Walt", "Ada", "Bert", "Cora", "Del", "Ezra", "Faye",
  ];

  const LAST = [
    "Pike", "Voss", "Quinn", "Moss", "Hart", "Bell", "Crowe", "Nash", "Wade",
    "Cole", "Frost", "Reed", "Lane", "Brooks", "Shaw", "Kane", "Drew", "Poe",
  ];

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

    return applyQuirk({
      person: P,
      name: rng.chance(0.55) ? rng.pick(FIRST) : `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
      yaw: rng.f(-0.75, 0.75),
      pitch,
      roll,
      lean,
      depth: rng.f(1.05, 1.5),
      size: rng.f(102, 122) * (slight ? 0.96 : heavy ? 1.03 : 1),
      hair,
      hairColor: rng.pick(["#1a1712", "#211c16", "#181614", "#2a2218", "#1c1a16"]),
      eyes,
      nose: rng.pick(
        old ? ["long", "hook", "hook", "blob", "blob", "tri"]
        : young ? ["button", "button", "tri", "long", "blob"]
        : ["long", "long", "hook", "hook", "tri", "tri", "button", "blob"]
      ),
      noseHeavy: rng.f(1.15, 1.9) * (old ? rng.f(1.08, 1.25) : young ? rng.f(0.85, 0.98) : 1),
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
    }, rng);
  }

  function drawDude(c, R, dude, w, h) {
    const rng = R.mark;
    paper(c, w, h, R.paper);
    const s = dude.size;
    const cx = w * rng.f(0.38, 0.48) + rng.f(-8, 8);
    const cy = h * 0.225 + rng.f(-10, 10);

    const skull = new Skull(cx, cy, s, dude.yaw, dude.pitch, dude.roll, dude.ratio, dude.depth, {
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
        blob.push({ x: cx + Math.cos(a) * k, y: cy + Math.sin(a) * k * 1.08 });
      }
      colourPass(c, R.colour, s, [{ pts: blob }]);
    }

    const body = drawBody(c, R.body, cx, cy + s * 1.18, s * 0.9, dude.lean + dude.yaw * 0.25, dude.clothes, dude.person);
    const hull = drawHead(c, rng, skull, dude.skin);
    const inFront = [];
    drawHair(c, rng, skull, hull, dude.hair, dude.hairColor, inFront);
    drawBrows(c, rng, skull, dude.brows);
    drawEyes(c, rng, skull, dude.eyes);
    const nose = drawNose(c, rng, skull, dude.nose, dude.noseHeavy);
    // beard first: a filled mass drawn after the mouth swallows it
    drawFacialHair(c, rng, skull, dude.beard);
    drawMouth(c, rng, skull, dude.mouth, nose);
    inFront.forEach((f) => f()); // brims and locks sit over the face, not under it

    if (dude.colour && dude.colour !== "behind") {
      const targets = [];
      if (dude.colour === "head") targets.push({ pts: hull });
      if (dude.colour === "body" && body.core) targets.push({ pts: body.core });
      if (!targets.length) targets.push({ pts: hull });
      colourPass(c, R.colour, s, targets);
    }

    // The name goes where there is room, the way a hand writes it in the gap
    // it finds — not pinned at the same offset off the jaw every time.
    const size = rng.f(21, 32);
    // keep it clear of the silhouette — a name cutting through a shoulder
    // is the one thing a person writing it would never do
    const spot = rng.pick(["jaw", "jaw", "shoulder", "feet", "feet"]);
    let nameX;
    let nameY;
    if (spot === "feet") {
      nameX = cx + s * rng.f(-1.4, 0.5);
      nameY = Math.min(h - size * 2.1, body.footY + s * rng.f(0.28, 0.7));
    } else if (spot === "shoulder") {
      nameX = Math.max(body.maxX + s * rng.f(0.14, 0.4), cx + s * 1.35);
      nameY = cy + s * rng.f(1.6, 2.4);
    } else {
      nameX = Math.max(body.maxX + s * rng.f(0.1, 0.32), cx + s * 1.15);
      nameY = cy + s * rng.f(0.0, 0.55);
    }
    // clear the whole drawing. Measuring against the body alone let the name
    // start inside an ear on a wide head.
    let inkRight = body.maxX;
    for (const q of hull) if (q.x > inkRight) inkRight = q.x;
    if (spot !== "feet") nameX = Math.max(nameX, inkRight + s * rng.f(0.12, 0.34));
    const nameW = size * (String(dude.name).length * 0.92 + 0.6);
    if (spot !== "feet" && nameX + nameW > w - 12) {
      // no room in the margin, so it goes under the feet
      nameX = Math.max(16, cx + s * rng.f(-1.4, 0.3));
      nameY = Math.min(h - size * 2.1, body.footY + s * rng.f(0.28, 0.7));
    }
    nameX = Math.max(16, Math.min(w - nameW - 12, nameX));
    nameY = Math.max(size * 1.2, Math.min(h - size * 1.6, nameY));
    drawName(c, R.name, dude.name, nameX, nameY, size);
    grainPass(c, c.__dpr);
  }

  // ---------- colour ----------
  // Measured off the reference rather than guessed: 8.2% of the sheet carries
  // colour, on 40% of the faces, at hue 30 (warm tan) for four fifths of it,
  // with olive and a cold blue-grey behind, saturation 0.2 and value 0.6-0.8.
  // It goes down as a flat patch that does NOT line up with the ink — the
  // off-register is the whole character of it, like a second pass on a press.
  const WASHES = [
    "#ccb7a3", "#ccb7a3", "#ccb7a3", "#c4a88f", "#d8c4ae",
    "#99897a", "#a8a882", "#cccca3", "#97a6b5", "#b59a86", "#c9a68f",
  ];

  function offRegister(pts, rng, k) {
    const dx = rng.f(-1, 1) * k;
    const dy = rng.f(-1, 1) * k;
    const g = rng.f(0.74, 1.02); // his patches often fall short of the shape
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

  function colourPass(c, rng, s, targets) {
    if (!targets.length) return;
    const n = rng.chance(0.26) ? 2 : 1;
    const used = [];
    for (let i = 0; i < n; i++) {
      const t = rng.pick(targets);
      if (!t || !t.pts || t.pts.length < 3 || used.includes(t)) continue;
      used.push(t);
      c.save();
      c.globalCompositeOperation = "multiply";
      c.globalAlpha = rng.f(0.55, 0.92);
      const pts = offRegister(t.pts, rng, s * rng.f(0.04, 0.13));
      c.beginPath();
      pts.forEach((p, j) => (j ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.fillStyle = t.color || rng.pick(WASHES);
      c.fill();
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
      const rowS = rng0.f(0.9, 1.1);
      for (let col = 0; col < cols; col++) {
        const idx = r * cols + col;
        const d = makeDude(rngFor(seed0, "person", idx));
        const rng = rngFor(seed0, "mark", idx);
        const s = Math.min(cw, ch) * rng.f(0.27, 0.37) * rowS;
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
        const hull = drawHead(c, rng, skull, d.skin);
        const inFront = [];
        drawHair(c, rng, skull, hull, d.hair, d.hairColor, inFront);
        drawBrows(c, rng, skull, d.brows);
        drawEyes(c, rng, skull, d.eyes);
        const nose = drawNose(c, rng, skull, d.nose, d.noseHeavy);
        drawFacialHair(c, rng, skull, d.beard);
        drawMouth(c, rng, skull, d.mouth, nose);
        inFront.forEach((f) => f());
        if (rng.chance(0.5)) drawNeck(c, rng, skull);
        if (d.colour) {
          if (d.colour === "behind") {
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

  // ---------- app ----------
  // The button is written in the same ink as the drawing. Typeset Georgia
  // next to a pen drawing gives the whole page away.
  const btnCanvas = document.getElementById("btnink");

  function drawButton(seed) {
    if (!btnCanvas) return;
    const bc = btnCanvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 300;
    const h = 48;
    btnCanvas.width = Math.round(w * dpr);
    btnCanvas.height = Math.round(h * dpr);
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.clearRect(0, 0, w, h);
    const rng = new Rng(seed >>> 0);
    drawName(bc, rng, "another dude", 8, 7, 25, { caps: false, rule: true, w: 0.05 });
  }

  const PLATE = !!new URLSearchParams(location.search).get("plate");
  if (PLATE) document.body.classList.add("plate");
  let count = 0;
  let seed = parseSeed();

  function render(nextSeed) {
    seed = nextSeed >>> 0;
    const R = {
      person: rngFor(seed, "person"),
      paper: rngFor(seed, "paper"),
      mark: rngFor(seed, "mark"),
      body: rngFor(seed, "body"),
      name: rngFor(seed, "name"),
      colour: rngFor(seed, "colour"),
    };
    const dude = makeDude(R.person);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 720;
    const cssH = canvas.clientHeight || 920;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr;
    if (PLATE) drawPlate(ctx, cssW, cssH, seed);
    else drawDude(ctx, R, dude, cssW, cssH);
    count += 1;
    drawButton(seed ^ 0x9e3779b9);
    tallyEl.textContent = `dude nº ${count}`;
    const url = new URL(location.href);
    url.searchParams.set("s", String(seed));
    history.replaceState(null, "", url);
  }

  function another() {
    render((Math.random() * 0xffffffff) >>> 0);
  }

  btn.addEventListener("click", another);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      another();
    }
  });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      count -= 1;
      render(seed);
    }, 80);
  });
  render(seed);
})();

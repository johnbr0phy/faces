(() => {
  const canvas = document.getElementById("page");
  const ctx = canvas.getContext("2d");
  const tallyEl = document.getElementById("tally");
  const btn = document.getElementById("another");

  const INK = "#1b1712";
  const PAPER = "#ebe3d2";

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

  function parseSeed() {
    const q = new URLSearchParams(location.search).get("s");
    if (q && /^\d+$/.test(q)) return Number(q) >>> 0;
    return (Math.random() * 0xffffffff) >>> 0;
  }

  // ---------- ink ----------
  function tremor(rng, amt) {
    return rng.f(-amt, amt);
  }

  function inkLine(c, rng, x1, y1, x2, y2, w = 1.7, passes = 1) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const steps = Math.max(4, Math.round(len / 7));
    for (let p = 0; p < passes; p++) {
      c.save();
      c.strokeStyle = INK;
      c.globalAlpha = 0.78 + rng.f(0, 0.22);
      c.lineWidth = w * rng.f(0.86, 1.16);
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const j = 0.35 + w * 0.12;
        const x = x1 + dx * t + tremor(rng, j);
        const y = y1 + dy * t + tremor(rng, j);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.restore();
    }
  }

  function inkPoly(c, rng, pts, { closed = false, w = 1.8, passes = 1 } = {}) {
    if (pts.length < 2) return;
    for (let p = 0; p < passes; p++) {
      c.save();
      c.strokeStyle = INK;
      c.globalAlpha = 0.8 + rng.f(0, 0.2);
      c.lineWidth = w * rng.f(0.88, 1.12);
      c.lineCap = "round";
      c.lineJoin = "round";
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const j = 0.4;
        const x = pts[i].x + tremor(rng, j);
        const y = pts[i].y + tremor(rng, j);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      if (closed) c.closePath();
      c.stroke();
      c.restore();
    }
  }

  function inkFill(c, rng, pts, color, alpha = 0.92) {
    if (pts.length < 3) return;
    c.save();
    c.beginPath();
    pts.forEach((p, i) => {
      const x = p.x + tremor(rng, 0.35);
      const y = p.y + tremor(rng, 0.35);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.closePath();
    c.fillStyle = color;
    c.globalAlpha = alpha;
    c.fill();
    c.restore();
  }

  function inkCirc(c, rng, x, y, r, w = 1.5, fill = false) {
    const n = 14 + rng.i(0, 6);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 + rng.f(-0.06, 0.06));
      pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
    }
    if (fill) inkFill(c, rng, pts, INK, 0.88);
    inkPoly(c, rng, pts, { closed: true, w });
  }

  function hatch(c, rng, x, y, w, h, dir = 1, density = 8) {
    c.save();
    c.strokeStyle = INK;
    c.globalAlpha = 0.22;
    c.lineWidth = 0.8;
    const n = Math.max(3, Math.round(density));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1 || 1);
      if (dir > 0) {
        inkLine(c, rng, x + t * w, y, x + t * w - h * 0.15, y + h, 0.7, 1);
      } else {
        inkLine(c, rng, x, y + t * h, x + w, y + t * h + w * 0.08, 0.7, 1);
      }
    }
    c.restore();
  }

  function wash(c, rng, x, y, rx, ry, color, alpha = 0.22) {
    c.save();
    c.fillStyle = color;
    c.globalAlpha = alpha * rng.f(0.75, 1);
    c.beginPath();
    c.ellipse(
      x + tremor(rng, 2),
      y + tremor(rng, 2),
      rx * rng.f(0.9, 1.1),
      ry * rng.f(0.9, 1.1),
      rng.f(-0.2, 0.2),
      0,
      Math.PI * 2
    );
    c.fill();
    c.restore();
  }

  // ---------- paper ----------
  function paper(c, w, h, rng) {
    c.clearRect(0, 0, w, h);
    c.save();
    for (let i = 0; i < 900; i++) {
      const x = rng.f(0, w);
      const y = rng.f(0, h);
      c.fillStyle = rng.chance(0.5) ? "rgba(40,30,20,0.035)" : "rgba(255,255,255,0.04)";
      c.fillRect(x, y, rng.f(0.6, 1.6), rng.f(0.6, 1.6));
    }
    c.restore();
  }

  // ---------- 3d skull (Mannay: pin features to a rough 3D head) ----------
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
    constructor(cx, cy, s, yaw, pitch, roll, ratio, depth) {
      this.cx = cx;
      this.cy = cy;
      this.s = s;
      this.yaw = yaw;
      this.pitch = pitch;
      this.roll = roll;
      this.rx = s * ratio;
      this.ry = s;
      this.depth = depth;
    }

    rotate(p) {
      p = rotY(p, this.yaw);
      p = rotX(p, this.pitch);
      p = rotZ(p, this.roll);
      return p;
    }

    // local = point on unit sphere (or slightly off-surface)
    project(local) {
      const p = this.rotate(local);
      const k = 1 + p.z * 0.16 * this.depth;
      return {
        x: this.cx + p.x * this.rx * k,
        y: this.cy + p.y * this.ry * k,
        z: p.z,
        front: p.z > -0.12,
      };
    }

    // convex hull of the projected ellipsoid = silhouette
    silhouette(rng) {
      const pts = [];
      const nu = 28;
      const nv = 16;
      for (let i = 0; i < nu; i++) {
        const u = (i / nu) * Math.PI * 2;
        for (let j = 0; j < nv; j++) {
          const v = -Math.PI / 2 + (j / (nv - 1)) * Math.PI;
          const pr = this.project(sphere(u, v));
          pts.push({ x: pr.x + (rng ? rng.f(-0.6, 0.6) : 0), y: pr.y });
        }
      }
      return convexHull(pts);
    }
  }

  function convexHull(points) {
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function pin(skull, local) {
    return skull.project(local);
  }

  // ---------- head ----------
  function drawHead(c, rng, skull, skinWash) {
    const hull = skull.silhouette(rng);
    if (skinWash) {
      inkFill(c, rng, hull, skinWash, 0.2);
    }
    inkPoly(c, rng, hull, { closed: true, w: 2.05, passes: 1 });

    const earL = pin(skull, { x: -0.92, y: 0.02, z: 0.05 });
    const earR = pin(skull, { x: 0.92, y: 0.02, z: 0.05 });
    const er = skull.s * rng.f(0.13, 0.18);
    if (earL.front) drawEar(c, rng, earL.x, earL.y, er, skull.yaw > 0.15 ? -1 : -1);
    if (earR.front) drawEar(c, rng, earR.x, earR.y, er, 1);

    if (rng.chance(0.35)) {
      const side = skull.yaw > 0 ? -1 : 1;
      hatch(c, rng, skull.cx + side * skull.rx * 0.15, skull.cy - skull.ry * 0.15, skull.rx * 0.55, skull.ry * 0.7, 1, 7);
    }
    return hull;
  }

  function drawEar(c, rng, x, y, r, side) {
    const pts = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = -Math.PI * 0.55 + t * Math.PI * 1.15;
      pts.push({
        x: x + Math.cos(a) * r * side,
        y: y + Math.sin(a) * r * 1.15,
      });
    }
    inkPoly(c, rng, pts, { w: 1.45 });
    if (rng.chance(0.6)) {
      inkLine(c, rng, x + side * r * 0.15, y - r * 0.2, x + side * r * 0.35, y + r * 0.25, 1.05);
    }
  }

  // ---------- hair / hats (pinned to the 3D skull) ----------
  function hairCapPts(skull, rng, lift) {
    const pts = [];
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = -Math.PI * 0.95 + t * Math.PI * 1.9;
      const v = -0.95 + Math.sin(t * Math.PI) * -0.15;
      const p = pin(skull, {
        x: Math.sin(u) * 0.92,
        y: v - lift,
        z: Math.cos(u) * 0.55,
      });
      if (p.z > -0.55) pts.push(p);
    }
    return pts;
  }

  function fillCap(c, rng, pts, color) {
    inkFill(c, rng, pts, color, 0.9);
    // grain inside the mass
    c.save();
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.clip();
    c.globalAlpha = 0.18;
    for (let i = 0; i < 40; i++) {
      const a = pts[rng.i(0, pts.length - 1)];
      const b = pts[rng.i(0, pts.length - 1)];
      inkLine(c, rng, a.x, a.y, b.x, b.y, 0.7, 1);
    }
    c.restore();
    inkPoly(c, rng, pts, { closed: true, w: 1.55 });
  }

  function drawHair(c, rng, skull, style, color) {
    const s = skull.s;
    if (style === "bald") {
      if (rng.chance(0.7)) {
        const a = pin(skull, { x: -0.22, y: -0.88, z: 0.25 });
        const b = pin(skull, { x: 0.22, y: -0.88, z: 0.25 });
        inkLine(c, rng, a.x, a.y, b.x, b.y, 1.15);
      }
      return;
    }

    if (style === "recede") {
      for (let i = 0; i < 18; i++) {
        const u = rng.f(-0.7, 0.7);
        const p = pin(skull, { x: u, y: -0.78 + rng.f(-0.08, 0.05), z: 0.55 });
        if (!p.front) continue;
        inkLine(c, rng, p.x, p.y, p.x + rng.f(-3, 3), p.y - rng.f(4, 10), 1.05);
      }
      return;
    }

    if (style === "buzz" || style === "messy") {
      const cap = hairCapPts(skull, rng, style === "messy" ? 0.22 : 0.08);
      if (cap.length > 3) fillCap(c, rng, convexHull(cap), color);
      return;
    }

    if (style === "bowl") {
      const cap = hairCapPts(skull, rng, 0.18);
      if (cap.length > 3) fillCap(c, rng, convexHull(cap), color);
      for (let i = -6; i <= 6; i++) {
        const p = pin(skull, { x: i * 0.12, y: -0.42, z: 0.72 });
        if (p.front) inkLine(c, rng, p.x, p.y, p.x + rng.f(-2, 2), p.y + rng.f(6, 14), 1.25);
      }
      return;
    }

    if (style === "spiky") {
      for (let i = -6; i <= 6; i++) {
        const u = i * 0.16;
        const base = pin(skull, { x: Math.sin(u) * 0.7, y: -0.68, z: Math.cos(u) * 0.4 });
        const tip = pin(skull, {
          x: Math.sin(u) * 0.78,
          y: -1.22 - rng.f(0, 0.22),
          z: Math.cos(u) * 0.28,
        });
        if (base.z > -0.4) inkLine(c, rng, base.x, base.y, tip.x, tip.y, 1.7, 2);
      }
      return;
    }

    if (style === "curly") {
      for (let i = 0; i < 26; i++) {
        const a = rng.f(-Math.PI * 0.15, Math.PI * 1.15);
        const rr = rng.f(0.45, 1.02);
        const p = pin(skull, {
          x: Math.cos(a) * rr * 0.78,
          y: -0.55 + Math.sin(a) * rr * 0.32,
          z: 0.28,
        });
        if (p.z > -0.45) inkCirc(c, rng, p.x, p.y, rng.f(s * 0.06, s * 0.11), 1.15, rng.chance(0.35));
      }
      return;
    }

    if (style === "side") {
      for (let i = -2; i <= 8; i++) {
        const u = i * 0.12;
        const base = pin(skull, { x: Math.sin(u) * 0.62, y: -0.7, z: Math.cos(u) * 0.4 });
        const tip = pin(skull, { x: Math.sin(u) * 0.7 + 0.22, y: -1.08, z: Math.cos(u) * 0.32 });
        if (base.z > -0.4) inkLine(c, rng, base.x, base.y, tip.x, tip.y, 1.45);
      }
      return;
    }

    if (style === "beanie") {
      const L = pin(skull, { x: -0.88, y: -0.38, z: 0.12 });
      const R = pin(skull, { x: 0.88, y: -0.38, z: 0.12 });
      const TL = pin(skull, { x: -0.58, y: -1.12, z: 0.08 });
      const TR = pin(skull, { x: 0.58, y: -1.12, z: 0.08 });
      fillCap(c, rng, [L, TL, TR, R], color);
      inkLine(c, rng, L.x, L.y, R.x, R.y, 1.7, 2);
      if (rng.chance(0.4)) {
        const pom = pin(skull, { x: 0, y: -1.28, z: 0.05 });
        inkCirc(c, rng, pom.x, pom.y, s * 0.07, 1.3, true);
      }
      return;
    }

    if (style === "flat") {
      const L = pin(skull, { x: -0.86, y: -0.48, z: 0.16 });
      const R = pin(skull, { x: 0.86, y: -0.48, z: 0.16 });
      const T = pin(skull, { x: 0, y: -1.02, z: 0.1 });
      fillCap(c, rng, [L, { x: T.x - s * 0.22, y: T.y }, { x: T.x + s * 0.22, y: T.y }, R], color);
      inkLine(c, rng, L.x - 4, L.y + 2, R.x + 6, R.y + 3, 1.8, 2);
      return;
    }

    if (style === "baseball") {
      const L = pin(skull, { x: -0.78, y: -0.42, z: 0.14 });
      const R = pin(skull, { x: 0.55, y: -0.42, z: 0.14 });
      const TL = pin(skull, { x: -0.5, y: -1.0, z: 0.1 });
      const TR = pin(skull, { x: 0.36, y: -1.0, z: 0.1 });
      fillCap(c, rng, [L, TL, TR, R], color);
      inkLine(c, rng, L.x - 6, L.y + 4, R.x + 22, R.y + 10, 2.1, 2);
      return;
    }

    if (style === "band") {
      const L = pin(skull, { x: -0.86, y: -0.52, z: 0.2 });
      const R = pin(skull, { x: 0.86, y: -0.52, z: 0.2 });
      inkLine(c, rng, L.x, L.y, R.x, R.y, 3.4, 2);
      for (let i = -5; i <= 5; i++) {
        const p = pin(skull, { x: i * 0.12, y: -0.82, z: 0.35 });
        if (p.front) inkLine(c, rng, p.x, p.y, p.x + rng.f(-2, 2), p.y - rng.f(4, 10), 1.2);
      }
      return;
    }

    const cap = hairCapPts(skull, rng, 0.16);
    if (cap.length > 3) fillCap(c, rng, convexHull(cap), color);
  }

  // ---------- features ----------
  function drawEyes(c, rng, skull, type) {
    const s = skull.s;
    const L = pin(skull, { x: -0.34, y: -0.14, z: 0.84 });
    const R = pin(skull, { x: 0.34, y: -0.14, z: 0.84 });
    const showL = L.front;
    const showR = R.front;

    const eye = (p, kind) => {
      const x = p.x;
      const y = p.y;
      if (kind === "dot") inkCirc(c, rng, x, y, s * 0.045, 1.7, true);
      else if (kind === "open") {
        inkCirc(c, rng, x, y, s * 0.1, 1.45);
        inkCirc(c, rng, x + s * 0.02, y, s * 0.032, 1.3, true);
      } else if (kind === "x") {
        const r = s * 0.08;
        inkLine(c, rng, x - r, y - r, x + r, y + r, 1.5);
        inkLine(c, rng, x - r, y + r, x + r, y - r, 1.5);
      } else if (kind === "slit") {
        inkLine(c, rng, x - s * 0.1, y, x + s * 0.1, y, 1.55);
      } else if (kind === "angry") {
        inkLine(c, rng, x - s * 0.12, y - s * 0.08, x + s * 0.1, y - s * 0.02, 1.6);
        inkLine(c, rng, x - s * 0.08, y + s * 0.04, x + s * 0.08, y + s * 0.04, 1.3);
      }
    };

    if (type === "glasses") {
      if (showL) inkCirc(c, rng, L.x, L.y, s * 0.16, 1.55);
      if (showR) inkCirc(c, rng, R.x, R.y, s * 0.16, 1.55);
      if (showL && showR) inkLine(c, rng, L.x + s * 0.16, L.y, R.x - s * 0.16, R.y, 1.25);
      if (showL) inkLine(c, rng, L.x - s * 0.16, L.y, L.x - s * 0.28, L.y - s * 0.04, 1.15);
      if (showR) inkLine(c, rng, R.x + s * 0.16, R.y, R.x + s * 0.28, R.y - s * 0.04, 1.15);
      if (showL) inkCirc(c, rng, L.x, L.y, s * 0.04, 1.2, true);
      if (showR) inkCirc(c, rng, R.x, R.y, s * 0.04, 1.2, true);
      return;
    }

    if (type === "shades") {
      if (showL) inkCirc(c, rng, L.x, L.y, s * 0.14, 1.4, true);
      if (showR) inkCirc(c, rng, R.x, R.y, s * 0.14, 1.4, true);
      if (showL && showR) inkLine(c, rng, L.x + s * 0.14, L.y, R.x - s * 0.14, R.y, 1.3);
      return;
    }

    if (type === "patch") {
      if (showL) eye(L, "open");
      if (showR) {
        inkCirc(c, rng, R.x, R.y, s * 0.15, 1.5, true);
        const strap = pin(skull, { x: 0.7, y: -0.22, z: 0.4 });
        inkLine(c, rng, R.x, R.y, strap.x, strap.y, 1.3);
      }
      return;
    }

    if (type === "wink") {
      if (showL) eye(L, "open");
      if (showR) eye(R, "slit");
      return;
    }

    const kinds = ["dot", "open", "x", "slit", "angry"];
    const k = type === "mix" ? rng.pick(kinds) : type;
    if (showL) eye(L, k);
    if (showR) eye(R, k);

    if (rng.chance(0.12)) {
      const p = showL ? L : R;
      inkCirc(c, rng, p.x + s * 0.02, p.y + s * 0.18, 1.4, 1, true);
      inkCirc(c, rng, p.x + s * 0.01, p.y + s * 0.28, 1.2, 1, true);
    }
  }

  function drawNose(c, rng, skull, style) {
    const s = skull.s;
    const tip = pin(skull, { x: 0, y: 0.14, z: 0.96 });
    const bridge = pin(skull, { x: 0, y: -0.12, z: 0.78 });
    const x = tip.x;
    const y = tip.y;
    if (style === "long") {
      inkLine(c, rng, bridge.x, bridge.y, x + s * 0.02, y, 1.7, 2);
      inkLine(c, rng, x + s * 0.02, y, x - s * 0.12, y + s * 0.04, 1.55);
    } else if (style === "hook") {
      inkLine(c, rng, x, y - s * 0.22, x + s * 0.04, y + s * 0.04, 1.65);
      inkLine(c, rng, x + s * 0.04, y + s * 0.04, x - s * 0.1, y + s * 0.02, 1.5);
    } else if (style === "tri") {
      inkLine(c, rng, x - s * 0.08, y + s * 0.06, bridge.x, bridge.y, 1.5);
      inkLine(c, rng, bridge.x, bridge.y, x + s * 0.1, y + s * 0.04, 1.5);
    } else {
      inkCirc(c, rng, x, y + s * 0.02, s * 0.055, 1.4);
    }
  }

  function drawMouth(c, rng, skull, style) {
    const s = skull.s;
    const m = pin(skull, { x: 0, y: 0.46, z: 0.74 });
    const x = m.x;
    const y = m.y;
    if (style === "smile") {
      c.save();
      c.strokeStyle = INK;
      c.lineWidth = 1.6;
      c.beginPath();
      c.arc(x, y - s * 0.04, s * 0.16, 0.15, Math.PI - 0.15);
      c.stroke();
      c.restore();
    } else if (style === "frown") {
      c.save();
      c.strokeStyle = INK;
      c.lineWidth = 1.55;
      c.beginPath();
      c.arc(x, y + s * 0.12, s * 0.14, Math.PI + 0.2, -0.2);
      c.stroke();
      c.restore();
    } else if (style === "open") {
      inkCirc(c, rng, x, y, s * 0.08, 1.45);
    } else if (style === "smirk") {
      inkLine(c, rng, x - s * 0.16, y + s * 0.02, x + s * 0.14, y - s * 0.06, 1.6);
    } else if (style === "lips") {
      wash(c, rng, x, y, s * 0.12, s * 0.05, "#c98980", 0.35);
      inkLine(c, rng, x - s * 0.14, y, x + s * 0.14, y, 1.35);
      inkLine(c, rng, x - s * 0.12, y + s * 0.05, x + s * 0.12, y + s * 0.04, 1.2);
    } else {
      inkLine(c, rng, x - s * 0.14, y, x + s * 0.14, y, 1.5);
    }
  }

  function drawFacialHair(c, rng, skull, style) {
    if (style === "none") return;
    const s = skull.s;
    if (style === "stache") {
      const L = pin(skull, { x: -0.22, y: 0.34, z: 0.82 });
      const R = pin(skull, { x: 0.22, y: 0.34, z: 0.82 });
      inkLine(c, rng, L.x, L.y, R.x, R.y, 2.15, 2);
    } else if (style === "goatee") {
      const p = pin(skull, { x: 0, y: 0.62, z: 0.68 });
      inkLine(c, rng, p.x - s * 0.08, p.y, p.x + s * 0.08, p.y + s * 0.18, 1.55, 2);
    } else if (style === "beard") {
      for (let i = 0; i < 16; i++) {
        const a = rng.f(-1.1, 1.1);
        const p = pin(skull, { x: Math.sin(a) * 0.5, y: 0.58 + Math.cos(a) * 0.16, z: 0.5 });
        if (p.front) inkLine(c, rng, p.x, p.y, p.x + rng.f(-3, 3), p.y + rng.f(6, 16), 1.15);
      }
    } else if (style === "stubble") {
      for (let i = 0; i < 22; i++) {
        const p = pin(skull, { x: rng.f(-0.42, 0.42), y: rng.f(0.42, 0.82), z: 0.55 });
        if (p.front) inkLine(c, rng, p.x, p.y, p.x + rng.f(-1.5, 1.5), p.y + rng.f(1, 3), 0.8);
      }
    }
  }

  // ---------- body ----------
  function drawBody(c, rng, cx, neckY, s, lean, clothes) {
    const hipY = neckY + s * 2.35;
    const footY = hipY + s * 2.25;
    const shW = s * 1.05;
    const hipW = s * 0.72;
    const lx = lean * s * 0.35;

    // neck
    inkLine(c, rng, cx - s * 0.16 + lx * 0.2, neckY, cx - s * 0.2 + lx, neckY + s * 0.42, 1.7);
    inkLine(c, rng, cx + s * 0.16 + lx * 0.2, neckY, cx + s * 0.2 + lx, neckY + s * 0.42, 1.7);

    const Lsh = { x: cx - shW + lx, y: neckY + s * 0.45 };
    const Rsh = { x: cx + shW + lx, y: neckY + s * 0.48 };
    const Lhp = { x: cx - hipW + lx * 1.2, y: hipY };
    const Rhp = { x: cx + hipW + lx * 1.2, y: hipY };

    const washCol = clothes.wash;
    if (washCol) {
      wash(c, rng, cx + lx, (Lsh.y + hipY) / 2, shW * 0.85, (hipY - Lsh.y) * 0.48, washCol, 0.18);
    }

    // torso
    inkLine(c, rng, Lsh.x, Lsh.y, Rsh.x, Rsh.y, 1.85);
    inkLine(c, rng, Lsh.x, Lsh.y, Lhp.x, Lhp.y, 1.75);
    inkLine(c, rng, Rsh.x, Rsh.y, Rhp.x, Rhp.y, 1.75);
    inkLine(c, rng, Lhp.x, Lhp.y, Rhp.x, Rhp.y, 1.65);

    if (clothes.kind === "hoodie") {
      inkLine(c, rng, Lsh.x + s * 0.15, Lsh.y + s * 0.05, cx + lx, Lsh.y - s * 0.12, 1.4);
      inkLine(c, rng, Rsh.x - s * 0.15, Rsh.y + s * 0.05, cx + lx, Rsh.y - s * 0.12, 1.4);
      inkPoly(
        c,
        rng,
        [
          { x: cx - s * 0.28 + lx, y: Lsh.y + s * 0.7 },
          { x: cx + s * 0.28 + lx, y: Lsh.y + s * 0.7 },
          { x: cx + s * 0.22 + lx, y: Lsh.y + s * 1.15 },
          { x: cx - s * 0.22 + lx, y: Lsh.y + s * 1.15 },
        ],
        { closed: true, w: 1.3 }
      );
    } else if (clothes.kind === "jacket") {
      inkLine(c, rng, cx + lx, Lsh.y + s * 0.08, cx - s * 0.08 + lx, hipY - s * 0.1, 1.4);
      inkLine(c, rng, cx + lx, Rsh.y + s * 0.08, cx + s * 0.1 + lx, hipY - s * 0.1, 1.4);
    } else if (clothes.kind === "tee") {
      if (rng.chance(0.5)) {
        inkCirc(c, rng, cx + lx, Lsh.y + s * 0.85, s * 0.08, 1.2);
      }
    }

    // arms
    const pose = clothes.pose;
    function arm(sh, side) {
      if (pose === "pockets" && rng.chance(0.7)) {
        const hand = { x: sh.x + side * s * 0.15, y: hipY - s * 0.15 };
        inkLine(c, rng, sh.x, sh.y, sh.x + side * s * 0.22, sh.y + s * 0.7, 1.6);
        inkLine(c, rng, sh.x + side * s * 0.22, sh.y + s * 0.7, hand.x, hand.y, 1.55);
        return;
      }
      if (pose === "hips") {
        const elbow = { x: sh.x + side * s * 0.55, y: sh.y + s * 0.55 };
        const hand = { x: sh.x + side * s * 0.12, y: hipY - s * 0.05 };
        inkLine(c, rng, sh.x, sh.y, elbow.x, elbow.y, 1.6);
        inkLine(c, rng, elbow.x, elbow.y, hand.x, hand.y, 1.55);
        return;
      }
      const elbow = { x: sh.x + side * s * 0.18 + lx * 0.2, y: sh.y + s * 0.85 };
      const hand = { x: elbow.x + side * s * 0.08, y: elbow.y + s * 0.75 };
      inkLine(c, rng, sh.x, sh.y, elbow.x, elbow.y, 1.65);
      inkLine(c, rng, elbow.x, elbow.y, hand.x, hand.y, 1.55);
      inkCirc(c, rng, hand.x, hand.y, s * 0.07, 1.2);
    }
    arm(Lsh, -1);
    arm(Rsh, 1);

    // legs
    const gap = s * 0.18;
    inkLine(c, rng, cx - gap + lx * 1.2, hipY, cx - gap * 1.2 + lx * 1.4, footY, 1.75);
    inkLine(c, rng, cx + gap + lx * 1.2, hipY, cx + gap * 1.2 + lx * 1.4, footY, 1.75);
    // shoes
    inkLine(c, rng, cx - gap * 1.2 + lx * 1.4 - s * 0.22, footY, cx - gap * 1.2 + lx * 1.4 + s * 0.18, footY, 2.1, 2);
    inkLine(c, rng, cx + gap * 1.2 + lx * 1.4 - s * 0.12, footY, cx + gap * 1.2 + lx * 1.4 + s * 0.28, footY, 2.1, 2);

    return { hipY, footY, Lsh, Rsh };
  }

  // ---------- handwritten name ----------
  // unit-box polylines for a print-hand letter
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

  function drawGlyph(c, rng, ch, x, y, size) {
    const d = GLYPHS[ch];
    if (!d) return size * 0.55;
    const w = size * (ch === " " ? 0.38 : ch === "i" || ch === "l" || ch === "'" ? 0.38 : 0.62);
    d.forEach((stroke) => {
      const cmds = parsePath(stroke);
      const pts = [];
      let px = 0;
      let py = 0;
      cmds.forEach((cmd) => {
        if (cmd.t === "M") {
          px = x + cmd.p[0] * size;
          py = y + cmd.p[1] * size;
          pts.push({ x: px, y: py });
        } else if (cmd.t === "L") {
          px = x + cmd.p[0] * size;
          py = y + cmd.p[1] * size;
          pts.push({ x: px, y: py });
        } else if (cmd.t === "C") {
          const [x1, y1, x2, y2, x3, y3] = cmd.p;
          const ax = x + x1 * size;
          const ay = y + y1 * size;
          const bx = x + x2 * size;
          const by = y + y2 * size;
          const dx = x + x3 * size;
          const dy = y + y3 * size;
          for (let i = 1; i <= 6; i++) {
            const t = i / 6;
            const u = 1 - t;
            const qx =
              u * u * u * px + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * dx;
            const qy =
              u * u * u * py + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * dy;
            pts.push({ x: qx, y: qy });
          }
          px = dx;
          py = dy;
        }
      });
      inkPoly(c, rng, pts, { w: size * 0.055, passes: 1 });
    });
    return w;
  }

  function drawName(c, rng, name, x, y, size, rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    let px = 0;
    for (const ch of name) {
      px += drawGlyph(c, rng, ch, px, 0, size) + size * 0.06;
    }
    // underline scribble
    inkLine(c, rng, size * 0.05, size * 1.12, px - size * 0.05, size * 1.18, 1.15);
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
  function makeDude(rng) {
    const hairStyles = [
      "buzz", "bowl", "spiky", "curly", "side", "beanie", "flat", "baseball",
      "band", "messy", "bald", "recede",
    ];
    const eyeStyles = ["dot", "open", "x", "slit", "angry", "glasses", "shades", "patch", "wink"];
    const noseStyles = ["long", "hook", "tri", "button"];
    const mouthStyles = ["smile", "frown", "open", "smirk", "lips", "line"];
    const beardStyles = ["none", "none", "none", "stache", "goatee", "beard", "stubble"];
    const clothesKinds = ["tee", "hoodie", "jacket", "sweater"];
    const poses = ["down", "pockets", "hips"];
    const washes = [null, "#e8c4a8", "#c4a07a", "#9aa87a", "#b9c4c8", "#d8b090"];
    const hairColors = ["#1a1814", "#2a2218", "#1c2430", "#3a2a1c", "#242018"];
    const skins = [null, "#e8d2bc", "#d8c0a4", "#c9a888", null];

    return {
      name: rng.chance(0.55) ? rng.pick(FIRST) : `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
      yaw: rng.f(-0.75, 0.75),
      pitch: rng.f(-0.28, 0.28),
      roll: rng.f(-0.12, 0.12),
      ratio: rng.f(0.82, 1.02),
      depth: rng.f(0.95, 1.35),
      lean: rng.f(-0.35, 0.35),
      size: rng.f(62, 78),
      hair: rng.pick(hairStyles),
      hairColor: rng.pick(hairColors),
      eyes: rng.pick(eyeStyles),
      nose: rng.pick(noseStyles),
      mouth: rng.pick(mouthStyles),
      beard: rng.pick(beardStyles),
      skin: rng.pick(skins),
      clothes: {
        kind: rng.pick(clothesKinds),
        pose: rng.pick(poses),
        wash: rng.pick(washes),
      },
    };
  }

  function drawDude(c, rng, dude, w, h) {
    paper(c, w, h, rng);
    const s = dude.size;
    const cx = w * 0.42 + rng.f(-8, 8);
    const cy = h * 0.28 + rng.f(-6, 10);

    const skull = new Skull(cx, cy, s, dude.yaw, dude.pitch, dude.roll, dude.ratio, dude.depth);
    drawBody(c, rng, cx, cy + s * 0.95, s * 0.92, dude.lean + dude.yaw * 0.25, dude.clothes);
    drawHead(c, rng, skull, dude.skin);
    drawHair(c, rng, skull, dude.hair, dude.hairColor);
    drawEyes(c, rng, skull, dude.eyes);
    drawNose(c, rng, skull, dude.nose);
    drawMouth(c, rng, skull, dude.mouth);
    drawFacialHair(c, rng, skull, dude.beard);

    const nameX = cx + s * 1.15;
    const nameY = cy + s * 0.55;
    drawName(c, rng, dude.name, nameX, nameY, rng.f(28, 36), rng.f(-0.18, 0.14));
  }

  // ---------- app ----------
  let count = 0;
  let seed = parseSeed();

  function render(nextSeed) {
    seed = nextSeed >>> 0;
    const rng = new Rng(seed);
    const dude = makeDude(rng);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 720;
    const cssH = canvas.clientHeight || 920;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDude(ctx, rng, dude, cssW, cssH);
    count += 1;
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

(() => {
  const canvas = document.getElementById("page");
  const ctx = canvas.getContext("2d");
  const tallyEl = document.getElementById("tally");
  const btn = document.getElementById("another");

  const INK = "#1b1712";
  const PAPER = "#ebe3d2";
  const PAPER_RGB = [235, 227, 210];

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

  // ---------- dry nib (stroke-width segments, 2-octave fBm, pressure) ----------
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

  function inkLine(c, rng, x1, y1, x2, y2, w = 1.7, passes = 1) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const seed = (Math.round(x1 * 13 + y1 * 17) ^ rng.i(1, 1e8)) >>> 0;
    const seg = Math.max(1.35, w * 0.95);
    const steps = Math.max(4, Math.round(len / seg));
    for (let p = 0; p < passes; p++) {
      const pseed = seed + p * 97;
      let px = x1 + nx * p * 0.18;
      let py = y1 + ny * p * 0.18;
      let down = true;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const n = fbm2(t * 3.1 + pseed * 0.001, pseed * 0.002, pseed) - 0.5;
        const n2 = fbm2(t * 13.4, pseed * 0.003, pseed + 3) - 0.5;
        const j = n * 0.22 + n2 * 0.1;
        const x = x1 + dx * t + nx * j + nx * p * 0.18;
        const y = y1 + dy * t + ny * j + ny * p * 0.18;
        const press = 0.78 + n * 0.34 + n2 * 0.1;
        const skip = n2 < -0.41 && w < 3.4 && i > 1 && i < steps;
        if (!skip && down) {
          c.save();
          c.strokeStyle = INK;
          c.globalAlpha = 0.82 + Math.max(0, press) * 0.18;
          c.lineWidth = Math.max(0.5, w * Math.max(0.52, press));
          c.lineCap = "butt";
          c.lineJoin = "miter";
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(x, y);
          c.stroke();
          c.restore();
          if (n > 0.3 && n2 > 0.12) {
            c.save();
            c.strokeStyle = INK;
            c.globalAlpha = 0.22;
            c.lineWidth = Math.max(0.3, w * 0.32);
            c.lineCap = "butt";
            c.beginPath();
            c.moveTo(px + nx * 0.55, py + ny * 0.55);
            c.lineTo(x + nx * 0.55, y + ny * 0.55);
            c.stroke();
            c.restore();
          }
        }
        down = !skip;
        px = x;
        py = y;
      }
    }
  }

  function inkPoly(c, rng, pts, { closed = false, w = 1.8, passes = 1 } = {}) {
    if (pts.length < 2) return;
    const n = pts.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      inkLine(c, rng, a.x, a.y, b.x, b.y, w, passes);
    }
  }

  function inkFill(c, rng, pts, color, alpha = 0.92) {
    if (pts.length < 3) return;
    c.save();
    c.beginPath();
    pts.forEach((p, i) => {
      const x = p.x + (fbm2(p.x * 0.05, p.y * 0.05, rng.seed) - 0.5) * 0.28;
      const y = p.y + (fbm2(p.y * 0.05, p.x * 0.05, rng.seed + 4) - 0.5) * 0.28;
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
      const rr = r * (1 + (fbm2(Math.cos(a) * 2.2, Math.sin(a) * 2.2, rng.seed) - 0.5) * 0.14);
      pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
    }
    if (fill) inkFill(c, rng, pts, INK, 0.9);
    inkPoly(c, rng, pts, { closed: true, w });
  }

  function inkArc(c, rng, x, y, r, a0, a1, w = 1.55) {
    const n = Math.max(6, Math.round(r * Math.abs(a1 - a0) / 3.4));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    inkPoly(c, rng, pts, { w });
  }

  function hatch(c, rng, x, y, w, h, dir = 1, density = 8) {
    const n = Math.max(3, Math.round(density));
    for (let i = 0; i < n; i++) {
      if (rng.chance(0.16)) continue;
      const t = i / (n - 1 || 1);
      if (dir > 0) {
        inkLine(c, rng, x + t * w, y, x + t * w - h * 0.15, y + h, 0.75, 1);
      } else {
        inkLine(c, rng, x, y + t * h, x + w, y + t * h + w * 0.08, 0.75, 1);
      }
    }
  }

  function wash(c, rng, x, y, rx, ry, color, alpha = 0.22) {
    c.save();
    c.fillStyle = color;
    c.globalAlpha = alpha * rng.f(0.7, 1);
    c.beginPath();
    c.ellipse(
      x + rng.f(-2, 2),
      y + rng.f(-2, 2),
      rx * rng.f(0.88, 1.12),
      ry * rng.f(0.88, 1.12),
      rng.f(-0.25, 0.25),
      0,
      Math.PI * 2
    );
    c.fill();
    c.restore();
  }

  // ---------- paper + grain pass over ink ----------
  function paper(c, w, h, rng) {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
    c.fillStyle = PAPER;
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      c.fillStyle = rng.chance(0.5) ? "rgba(92,70,42,0.008)" : "rgba(255,250,238,0.012)";
      c.beginPath();
      c.ellipse(rng.f(0, w), rng.f(0, h), rng.f(8, 28), rng.f(5, 16), rng.f(0, 6), 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 3400; i++) {
      c.fillStyle = rng.chance(0.62) ? "rgba(48,36,22,0.035)" : "rgba(255,255,255,0.03)";
      c.fillRect(rng.f(0, w), rng.f(0, h), rng.f(0.3, 1.1), rng.f(0.25, 0.7));
    }
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = "rgba(70,52,32,0.022)";
      c.lineWidth = rng.f(0.25, 0.5);
      c.beginPath();
      const x = rng.f(0, w);
      const y = rng.f(0, h);
      c.moveTo(x, y);
      c.lineTo(x + rng.f(-14, 14), y + rng.f(-1.6, 1.6));
      c.stroke();
    }
  }

  function grainPass(c) {
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
        let n = Math.imul(Math.imul(x + 1, 374761393) ^ Math.imul(y + 3, 668265263), 2246822519);
        n = Math.imul(n ^ (n >>> 15), 3266489917);
        const u = ((n ^ (n >>> 13)) >>> 0) / 4294967296;
        if (lum > 214) {
          if (u < 0.035) {
            const k = 0.03 + u * 0.4;
            d[p] = r - (r - 48) * k * 0.12;
            d[p + 1] = g - (g - 36) * k * 0.12;
            d[p + 2] = b - (b - 22) * k * 0.12;
          }
          continue;
        }
        const edge = lum > 70 && lum < 190;
        if (edge && u < 0.28) {
          const fade = (0.28 - u) * 1.6;
          d[p] = r + (pr - r) * fade;
          d[p + 1] = g + (pg - g) * fade;
          d[p + 2] = b + (pb - b) * fade;
        } else if (!edge && u < 0.008) {
          d[p] = r + (pr - r) * 0.35;
          d[p + 1] = g + (pg - g) * 0.35;
          d[p + 2] = b + (pb - b) * 0.35;
        } else if (u > 0.985 && lum < 80) {
          d[p] = Math.max(0, r - 10);
          d[p + 1] = Math.max(0, g - 8);
          d[p + 2] = Math.max(0, b - 6);
        }
      }
    }
    c.putImageData(img, 0, 0);
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
    }

    warp(local) {
      const p = { x: local.x, y: local.y, z: local.z };
      if (p.y > 0.22) {
        const t = (p.y - 0.22) / 0.78;
        p.x *= 1 + (this.jaw - 1) * t;
        p.y += this.chin * t;
      } else if (p.y < -0.35) {
        const t = (-0.35 - p.y) / 0.65;
        p.y *= 1 + (this.crown - 1) * t * 0.55;
      } else {
        p.x *= this.cheek;
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

    silhouette(rng) {
      const pts = [];
      const nu = 30;
      const nv = 18;
      for (let i = 0; i < nu; i++) {
        const u = (i / nu) * Math.PI * 2;
        for (let j = 0; j < nv; j++) {
          const v = -Math.PI / 2 + (j / (nv - 1)) * Math.PI;
          const pr = this.project(sphere(u, v));
          pts.push({ x: pr.x, y: pr.y });
        }
      }
      const extras = [
        { x: 0, y: 0.98 + this.chin, z: 0.22 },
        { x: -0.58 * this.jaw, y: 0.74, z: 0.12 },
        { x: 0.58 * this.jaw, y: 0.74, z: 0.12 },
        { x: -0.72 * this.cheek, y: 0.08, z: 0.18 },
        { x: 0.72 * this.cheek, y: 0.08, z: 0.18 },
      ];
      for (const e of extras) {
        const pr = this.project(e);
        pts.push({ x: pr.x, y: pr.y });
      }
      const hull = convexHull(pts);
      return hull.map((p, i) => {
        const n = fbm2(i * 0.11, this.yaw * 1.1 + this.seedJit(rng), rng.seed);
        const dx = p.x - this.cx;
        const dy = p.y - this.cy;
        const k = 1 + (n - 0.5) * 0.07;
        return { x: this.cx + dx * k, y: this.cy + dy * k };
      });
    }

    seedJit(rng) {
      return (rng.seed % 97) * 0.02;
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
      wash(c, rng, skull.cx - skull.rx * 0.15, skull.cy + skull.ry * 0.05, skull.rx * 0.42, skull.ry * 0.38, skinWash, 0.1);
    }
    inkPoly(c, rng, hull, { closed: true, w: 2.35, passes: 2 });

    const earL = pin(skull, { x: -0.92, y: 0.02, z: 0.05 });
    const earR = pin(skull, { x: 0.92, y: 0.02, z: 0.05 });
    const er = skull.s * rng.f(0.14, 0.2);
    if (earL.z > -0.05) drawEar(c, rng, earL.x, earL.y, er, -1);
    if (earR.z > -0.05) drawEar(c, rng, earR.x, earR.y, er, 1);
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
    inkPoly(c, rng, pts, { w: 1.5 });
    if (rng.chance(0.6)) {
      inkLine(c, rng, x + side * r * 0.15, y - r * 0.2, x + side * r * 0.35, y + r * 0.25, 1.1);
    }
  }

  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }

  // Ordered (non-convex) hair cap: wavy hairline + crown, no hull.
  function hairCap(skull, rng, opt = {}) {
    const lineY = opt.lineY ?? -0.4;
    const recede = opt.recede ?? 0;
    const bangs = opt.bangs ?? 0;
    const sideBias = opt.sideBias ?? 0;
    const lift = opt.lift ?? 0.07;
    const wrap = opt.wrap ?? 0.9;
    const zMin = opt.zMin ?? -0.42;
    const front = [];
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = (t - 0.5) * Math.PI * wrap * 1.82;
      const temple = Math.pow(Math.abs(Math.sin(u)), 1.3);
      const center = Math.max(0, Math.cos(u));
      let y = lineY - recede * temple + bangs * center + sideBias * Math.sin(u);
      y += (fbm2(u * 1.4, skull.yaw, rng.seed) - 0.5) * 0.045;
      y = clamp(y, -0.88, 0.18);
      const p = pin(skull, sphere(u, Math.asin(clamp(y, -0.99, 0.99))));
      if (p.z > zMin) front.push({ x: p.x, y: p.y, z: p.z });
    }
    const crown = [];
    const nc = 16;
    for (let i = 0; i <= nc; i++) {
      const t = i / nc;
      const u = (t - 0.5) * Math.PI * wrap * 1.7;
      const loc = sphere(u, -1.12);
      loc.y -= lift;
      loc.x += sideBias * 0.14;
      const p = pin(skull, loc);
      if (p.z > zMin - 0.12) crown.push({ x: p.x, y: p.y, z: p.z });
    }
    return front.concat(crown.reverse());
  }

  function hairlineRing(skull, hairline, wrap = 0.92) {
    const pts = [];
    const v = Math.asin(Math.max(-0.95, Math.min(0.15, hairline)));
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const u = (i / n - 0.5) * Math.PI * 2 * wrap;
      const p = pin(skull, sphere(u, v));
      if (p.z > -0.5) pts.push(p);
    }
    return pts;
  }

  function fillMass(c, rng, pts, color, hatchy = false) {
    if (pts.length < 3) return;
    inkFill(c, rng, pts, color, 0.96);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minx = Math.min(...xs);
    const maxx = Math.max(...xs);
    const miny = Math.min(...ys);
    const maxy = Math.max(...ys);
    c.save();
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.clip();
    const span = maxx - minx || 1;
    const n = Math.max(hatchy ? 10 : 5, Math.round(span / (hatchy ? 5.5 : 9)));
    for (let i = 0; i < n; i++) {
      if (rng.chance(hatchy ? 0.12 : 0.38)) continue;
      const x = minx + (i / (n - 1 || 1)) * span + rng.f(-2, 2);
      inkLine(c, rng, x, miny + rng.f(1, 8), x + rng.f(-5, 5), maxy - rng.f(1, 6), rng.f(0.7, hatchy ? 1.35 : 1.05), 1);
    }
    c.restore();
    inkPoly(c, rng, pts, { closed: true, w: 1.85 });
    for (const p of pts) {
      if (p.y > (miny + maxy) * 0.55 || rng.chance(0.55)) continue;
      const ox = p.x - (minx + maxx) / 2;
      const oy = p.y - (miny + maxy) / 2;
      const len = Math.hypot(ox, oy) || 1;
      if (rng.chance(0.55)) {
        inkLine(c, rng, p.x, p.y, p.x + (ox / len) * rng.f(2, 7), p.y + (oy / len) * rng.f(1, 5), 0.95);
      }
    }
  }

  function shortTicks(c, rng, skull, lineY, count, len) {
    const s = skull.s;
    for (let i = 0; i < count; i++) {
      const u = rng.f(-1.15, 1.15);
      const y = lineY + rng.f(-0.18, 0.06);
      const p = pin(skull, sphere(u, Math.asin(clamp(y, -0.95, 0.2))));
      if (p.z < -0.35) continue;
      const tip = pin(skull, {
        x: Math.sin(u) * 0.55,
        y: y - rng.f(0.08, len),
        z: Math.cos(u) * 0.45,
      });
      inkLine(c, rng, p.x, p.y, tip.x, tip.y, rng.f(0.85, 1.35));
    }
  }

  function drawHair(c, rng, skull, style, color) {
    const s = skull.s;
    if (style === "bald") {
      if (rng.chance(0.75)) {
        const a = pin(skull, { x: -0.2, y: -0.9, z: 0.22 });
        const b = pin(skull, { x: 0.22, y: -0.9, z: 0.22 });
        inkLine(c, rng, a.x, a.y, b.x, b.y, 1.2);
      }
      return;
    }

    if (style === "recede") {
      const sidePatch = (side) => {
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const u = side * (0.72 + t * 0.7);
          const y = -0.42 - t * 0.18;
          const p = pin(skull, sphere(u, Math.asin(clamp(y, -0.95, 0.12))));
          if (p.z > -0.22) pts.push({ x: p.x, y: p.y });
        }
        for (let i = 10; i >= 0; i--) {
          const t = i / 10;
          const u = side * (0.65 + t * 0.75);
          const loc = sphere(u, -0.95 - t * 0.12);
          loc.y -= 0.02;
          const p = pin(skull, loc);
          if (p.z > -0.35) pts.push({ x: p.x, y: p.y });
        }
        return pts;
      };
      const L = sidePatch(-1);
      const R = sidePatch(1);
      if (L.length > 3) fillMass(c, rng, L, color);
      if (R.length > 3) fillMass(c, rng, R, color);
      shortTicks(c, rng, skull, -0.82, 5, 0.08);
      return;
    }

    if (style === "buzz") {
      const mass = hairCap(skull, rng, { lineY: -0.48, recede: 0.06, lift: 0.02, wrap: 0.96, zMin: -0.4 });
      if (mass.length > 3) {
        inkFill(c, rng, mass, color, 0.55);
        inkPoly(c, rng, mass, { closed: true, w: 1.2 });
      }
      shortTicks(c, rng, skull, -0.46, 38, 0.1);
      return;
    }

    if (style === "messy") {
      const mass = hairCap(skull, rng, { lineY: -0.34, bangs: 0.08, lift: 0.14, wrap: 0.88 });
      if (mass.length > 3) fillMass(c, rng, mass, color);
      shortTicks(c, rng, skull, -0.55, 16, 0.22);
      return;
    }

    if (style === "bowl") {
      const mass = hairCap(skull, rng, { lineY: -0.32, bangs: 0.1, lift: 0.05, wrap: 0.94 });
      if (mass.length > 3) fillMass(c, rng, mass, color);
      const brim = hairlineRing(skull, -0.28, 0.7);
      for (const p of brim) {
        if (p.z < 0.08 || rng.chance(0.22)) continue;
        inkLine(c, rng, p.x, p.y, p.x + rng.f(-2, 2), p.y + rng.f(5, 12), 1.25);
      }
      return;
    }

    if (style === "spiky") {
      const mass = hairCap(skull, rng, { lineY: -0.5, lift: 0.18, wrap: 0.7 });
      if (mass.length > 3) fillMass(c, rng, mass, color);
      for (let i = -5; i <= 5; i++) {
        const u = i * 0.14;
        const base = pin(skull, sphere(u, -0.85));
        const tip = pin(skull, { x: Math.sin(u) * 0.42, y: -1.32 - rng.f(0, 0.18), z: Math.cos(u) * 0.28 });
        if (base.z > -0.45) inkLine(c, rng, base.x, base.y, tip.x, tip.y, 1.9, 2);
      }
      return;
    }

    if (style === "curly") {
      wash(c, rng, skull.cx, skull.cy - s * 0.45, s * 0.62, s * 0.38, color, 0.28);
      for (let i = 0; i < 34; i++) {
        const u = rng.f(-1.2, 1.2);
        const y = rng.f(-0.95, -0.22);
        const p = pin(skull, sphere(u, Math.asin(clamp(y, -0.98, 0.2))));
        if (p.z < -0.35) continue;
        inkCirc(c, rng, p.x, p.y, rng.f(s * 0.045, s * 0.1), 1.2, rng.chance(0.35));
      }
      return;
    }

    if (style === "side") {
      const dir = rng.sign();
      const mass = hairCap(skull, rng, {
        lineY: -0.38,
        recede: 0.12,
        bangs: 0.06,
        lift: 0.09,
        wrap: 0.86,
        sideBias: dir * 0.28,
      });
      if (mass.length > 3) fillMass(c, rng, mass, color);
      return;
    }

    if (style === "beanie") {
      const cuffY = -0.36;
      const cuffLo = hairlineRing(skull, cuffY + 0.07, 0.86);
      const cuffHi = hairlineRing(skull, cuffY - 0.08, 0.84);
      const cuff = cuffLo.concat(cuffHi.slice().reverse());
      if (cuff.length > 4) fillMass(c, rng, cuff, color, true);
      const dome = hairCap(skull, rng, { lineY: cuffY - 0.1, lift: 0.18, wrap: 0.86 });
      if (dome.length > 3) fillMass(c, rng, dome, color, true);
      if (cuffLo.length > 1) inkPoly(c, rng, cuffLo, { w: 2.6, passes: 2 });
      if (rng.chance(0.42)) {
        const pom = pin(skull, { x: 0, y: -1.22, z: 0.04 });
        inkCirc(c, rng, pom.x, pom.y, s * 0.08, 1.35, true);
      }
      return;
    }

    if (style === "flat") {
      const dome = hairCap(skull, rng, { lineY: -0.4, lift: 0.04, wrap: 0.9 });
      if (dome.length > 3) fillMass(c, rng, dome, color, true);
      const band = hairlineRing(skull, -0.4, 0.9);
      if (band.length > 1) inkPoly(c, rng, band, { w: 3.2, passes: 2 });
      const bL = pin(skull, { x: -0.42, y: -0.32, z: 0.82 });
      const bR = pin(skull, { x: 0.42, y: -0.32, z: 0.82 });
      const bC = pin(skull, { x: 0.02, y: -0.16, z: 1.18 });
      if (bC.z > -0.1) {
        inkFill(c, rng, [bL, bC, bR], color, 0.88);
        inkPoly(c, rng, [bL, bC, bR], { w: 2.1, passes: 2 });
      }
      return;
    }

    if (style === "baseball") {
      const dome = hairCap(skull, rng, { lineY: -0.34, lift: 0.16, wrap: 0.86 });
      if (dome.length > 3) {
        inkFill(c, rng, dome, color, 0.28);
        c.save();
        c.beginPath();
        dome.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
        c.clip();
        const xs = dome.map((p) => p.x);
        const ys = dome.map((p) => p.y);
        const minx = Math.min(...xs);
        const maxx = Math.max(...xs);
        const miny = Math.min(...ys);
        const maxy = Math.max(...ys);
        const nh = Math.max(12, Math.round((maxx - minx) / 4.2));
        for (let i = 0; i < nh; i++) {
          if (rng.chance(0.1)) continue;
          const x = minx + (i / (nh - 1 || 1)) * (maxx - minx) + rng.f(-1.5, 1.5);
          inkLine(c, rng, x, miny + 2, x + rng.f(-3, 3), maxy - 2, rng.f(0.85, 1.3));
        }
        c.restore();
        inkPoly(c, rng, dome, { closed: true, w: 1.8 });
      }
      const band = hairlineRing(skull, -0.32, 0.84);
      if (band.length > 1) inkPoly(c, rng, band, { w: 3.4, passes: 2 });
      const bL = pin(skull, { x: -0.36, y: -0.26, z: 0.92 });
      const bR = pin(skull, { x: 0.36, y: -0.26, z: 0.92 });
      const bC = pin(skull, { x: 0.0, y: -0.14, z: 1.28 });
      const bL2 = pin(skull, { x: -0.28, y: -0.2, z: 1.02 });
      const bR2 = pin(skull, { x: 0.28, y: -0.2, z: 1.02 });
      inkPoly(c, rng, [bL, bC, bR], { w: 2.8, passes: 2 });
      inkPoly(c, rng, [bL2, bC, bR2], { w: 1.6 });
      const btn = pin(skull, { x: 0, y: -1.2, z: 0.06 });
      inkCirc(c, rng, btn.x, btn.y, s * 0.05, 1.2, true);
      return;
    }

    if (style === "band") {
      shortTicks(c, rng, skull, -0.62, 22, 0.12);
      const hi = hairlineRing(skull, -0.46, 0.9);
      const lo = hairlineRing(skull, -0.34, 0.9);
      const band = hi.concat(lo.slice().reverse());
      if (band.length > 4) fillMass(c, rng, band, color, true);
      if (hi.length > 1) inkPoly(c, rng, hi, { w: 2.2 });
      if (lo.length > 1) inkPoly(c, rng, lo, { w: 2.2 });
      return;
    }

    const mass = hairCap(skull, rng, { lineY: -0.38, lift: 0.07, wrap: 0.94 });
    if (mass.length > 3) fillMass(c, rng, mass, color);
  }

  // ---------- features ----------
  function almond(c, rng, p, rx, ry, fill) {
    const n = 12;
    const pts = [];
    const squash = 0.58 + 0.42 * Math.max(0, p.z);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 - 0.2 * Math.cos(2 * a);
      pts.push({
        x: p.x + Math.cos(a) * rx * squash * k,
        y: p.y + Math.sin(a) * ry * k,
      });
    }
    if (fill) inkFill(c, rng, pts, INK, 0.94);
    inkPoly(c, rng, pts, { closed: true, w: 1.55 });
  }

  function drawEyes(c, rng, skull, type) {
    const s = skull.s;
    const L = pin(skull, { x: -0.36, y: -0.12, z: 0.88 });
    const R = pin(skull, { x: 0.36, y: -0.12, z: 0.88 });
    const showL = L.z > 0.02;
    const showR = R.z > 0.02;
    const rx = s * 0.145;
    const ry = s * 0.072;

    const eye = (p, kind) => {
      const x = p.x;
      const y = p.y;
      const sq = 0.58 + 0.42 * Math.max(0, p.z);
      if (kind === "dot") inkCirc(c, rng, x, y, s * 0.062, 1.8, true);
      else if (kind === "open") {
        almond(c, rng, p, rx, ry, false);
        inkCirc(c, rng, x + s * 0.015 * sq, y, s * 0.042, 1.35, true);
      } else if (kind === "x") {
        const r = s * 0.1;
        inkLine(c, rng, x - r * sq, y - r, x + r * sq, y + r, 1.7);
        inkLine(c, rng, x - r * sq, y + r, x + r * sq, y - r, 1.7);
      } else if (kind === "slit") {
        inkLine(c, rng, x - s * 0.15 * sq, y, x + s * 0.15 * sq, y, 1.75);
      } else if (kind === "angry") {
        inkLine(c, rng, x - s * 0.16 * sq, y - s * 0.09, x + s * 0.12 * sq, y - s * 0.02, 1.8);
        inkLine(c, rng, x - s * 0.1 * sq, y + s * 0.05, x + s * 0.1 * sq, y + s * 0.05, 1.4);
      }
    };

    if (type === "glasses") {
      if (showL) inkCirc(c, rng, L.x, L.y, s * 0.2, 1.75);
      if (showR) inkCirc(c, rng, R.x, R.y, s * 0.2, 1.75);
      if (showL && showR) inkLine(c, rng, L.x + s * 0.2, L.y, R.x - s * 0.2, R.y, 1.45);
      if (showL) inkLine(c, rng, L.x - s * 0.2, L.y, L.x - s * 0.34, L.y - s * 0.05, 1.3);
      if (showR) inkLine(c, rng, R.x + s * 0.2, R.y, R.x + s * 0.34, R.y - s * 0.05, 1.3);
      if (showL) inkCirc(c, rng, L.x, L.y, s * 0.048, 1.25, true);
      if (showR) inkCirc(c, rng, R.x, R.y, s * 0.048, 1.25, true);
      return;
    }

    if (type === "shades") {
      if (showL) almond(c, rng, L, s * 0.17, s * 0.1, true);
      if (showR) almond(c, rng, R, s * 0.17, s * 0.1, true);
      if (showL && showR) inkLine(c, rng, L.x + s * 0.16, L.y, R.x - s * 0.16, R.y, 1.5);
      return;
    }

    if (type === "patch") {
      const near = L.z >= R.z ? L : R;
      const far = L.z >= R.z ? R : L;
      if (far.z > 0.02) eye(far, "open");
      if (near.z > -0.05) {
        almond(c, rng, near, s * 0.18, s * 0.12, true);
        const strap = pin(skull, { x: near === R ? 0.78 : -0.78, y: -0.24, z: 0.28 });
        inkLine(c, rng, near.x, near.y, strap.x, strap.y, 1.55);
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
      inkCirc(c, rng, p.x + s * 0.02, p.y + s * 0.2, 1.4, 1, true);
      inkCirc(c, rng, p.x + s * 0.01, p.y + s * 0.32, 1.2, 1, true);
    }
  }

  function drawBrows(c, rng, skull, style) {
    if (style === "none") return;
    const s = skull.s;
    const L = pin(skull, { x: -0.36, y: -0.3, z: 0.86 });
    const R = pin(skull, { x: 0.36, y: -0.3, z: 0.86 });
    const brow = (p, side) => {
      if (p.z < 0.02) return;
      const sq = 0.6 + 0.4 * Math.max(0, p.z);
      const lift = style === "angry" ? s * 0.07 * side : style === "arch" ? -s * 0.05 : 0;
      inkLine(c, rng, p.x - s * 0.15 * sq, p.y + lift, p.x + s * 0.14 * sq, p.y - lift * 0.4, 1.85);
    };
    brow(L, -1);
    brow(R, 1);
  }

  function drawNose(c, rng, skull, style) {
    const s = skull.s;
    const brow = pin(skull, { x: 0.0, y: -0.3, z: 0.9 });
    const bridge = pin(skull, { x: 0.03, y: 0.04, z: 1.08 });
    const tip = pin(skull, { x: 0.05, y: 0.42, z: 1.22 });
    const wingL = pin(skull, { x: -0.24, y: 0.4, z: 0.94 });
    const wingR = pin(skull, { x: 0.26, y: 0.4, z: 0.94 });
    const nearWing = wingL.z > wingR.z ? wingL : wingR;
    if (style === "long") {
      inkPoly(c, rng, [brow, bridge, tip], { w: 2.25, passes: 2 });
      inkLine(c, rng, tip.x, tip.y, nearWing.x, nearWing.y, 1.9);
    } else if (style === "hook") {
      const hook = pin(skull, { x: 0.12, y: 0.5, z: 1.16 });
      inkPoly(c, rng, [brow, bridge, hook], { w: 2.2, passes: 2 });
      inkLine(c, rng, hook.x, hook.y, nearWing.x, nearWing.y + s * 0.02, 1.85);
    } else if (style === "tri") {
      inkPoly(c, rng, [brow, wingL, wingR], { closed: true, w: 1.9, passes: 2 });
    } else {
      inkPoly(c, rng, [brow, bridge, tip], { w: 2.0, passes: 1 });
      inkCirc(c, rng, tip.x, tip.y + s * 0.02, s * 0.085, 1.55);
    }
  }

  function drawMouth(c, rng, skull, style) {
    const s = skull.s;
    const m = pin(skull, { x: 0, y: 0.58, z: 0.78 });
    if (m.z < -0.05) return;
    const x = m.x;
    const y = m.y;
    if (style === "smile") {
      inkArc(c, rng, x, y - s * 0.02, s * 0.2, 0.18, Math.PI - 0.18, 1.75);
    } else if (style === "frown") {
      inkArc(c, rng, x, y + s * 0.16, s * 0.18, Math.PI + 0.22, -0.22, 1.7);
    } else if (style === "open") {
      inkCirc(c, rng, x, y, s * 0.1, 1.55);
    } else if (style === "smirk") {
      inkLine(c, rng, x - s * 0.2, y + s * 0.03, x + s * 0.2, y - s * 0.08, 1.75);
    } else if (style === "lips") {
      wash(c, rng, x, y, s * 0.16, s * 0.065, "#c98980", 0.35);
      inkLine(c, rng, x - s * 0.18, y, x + s * 0.18, y, 1.5);
      inkLine(c, rng, x - s * 0.16, y + s * 0.06, x + s * 0.16, y + s * 0.05, 1.35);
    } else {
      inkLine(c, rng, x - s * 0.18, y, x + s * 0.18, y, 1.7);
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
        inkLine(c, rng, x - 2, y, x + rng.f(3, 9), y + rng.f(-2, 3), rng.f(1.45, 2.2));
      }
    } else if (style === "goatee") {
      const a = pin(skull, { x: -0.1, y: 0.68, z: 0.72 });
      const b = pin(skull, { x: 0.1, y: 0.68, z: 0.72 });
      const d = pin(skull, { x: 0, y: 0.98, z: 0.52 });
      fillMass(c, rng, [a, b, d], "#1a1712");
    } else if (style === "beard") {
      const mass = [];
      for (let i = 0; i < 16; i++) {
        const a = -1.2 + (i / 15) * 2.4;
        const p = pin(skull, { x: Math.sin(a) * 0.62, y: 0.52 + Math.cos(a) * 0.22, z: 0.5 });
        if (p.z > -0.3) mass.push(p);
      }
      const chin = pin(skull, { x: 0, y: 1.08, z: 0.32 });
      mass.push(chin);
      if (mass.length > 3) fillMass(c, rng, mass, "#1a1712");
    } else if (style === "stubble") {
      for (let i = 0; i < 34; i++) {
        const p = pin(skull, { x: rng.f(-0.48, 0.48), y: rng.f(0.4, 0.9), z: 0.58 });
        if (p.z > 0) inkLine(c, rng, p.x, p.y, p.x + rng.f(-1.6, 1.6), p.y + rng.f(1, 3.5), 0.9);
      }
    }
  }

  function ribbon(c, rng, pts, r0, r1, washCol) {
    if (pts.length < 2) return;
    const left = [];
    const right = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const r = r0 + (r1 - r0) * (i / (pts.length - 1 || 1));
      left.push({ x: p.x + nx * r, y: p.y + ny * r });
      right.push({ x: p.x - nx * r, y: p.y - ny * r });
    }
    if (washCol) inkFill(c, rng, left.concat(right.slice().reverse()), washCol, 0.16);
    inkPoly(c, rng, left, { w: 1.75 });
    inkPoly(c, rng, right, { w: 1.75 });
    const last = pts[pts.length - 1];
    const a = left[left.length - 1];
    const b = right[right.length - 1];
    if (a && b) inkLine(c, rng, a.x, a.y, b.x, b.y, 1.4);
  }

  function mitt(c, rng, p, s, dir) {
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const a = -0.7 + (i / 7) * 2.2;
      pts.push({
        x: p.x + Math.cos(a) * s * 0.11 * dir,
        y: p.y + Math.sin(a) * s * 0.09 + s * 0.02,
      });
    }
    inkPoly(c, rng, pts, { w: 1.4 });
  }

  // ---------- body (coat/sweater with mass, not a box plus sticks) ----------
  function drawBody(c, rng, cx, neckY, s, lean, clothes) {
    const hipY = neckY + s * rng.f(1.85, 2.2);
    const footY = hipY + s * rng.f(1.55, 1.95);
    const lx = lean * s * 0.3;
    const shW = s * rng.f(0.92, 1.14);
    const hipW = s * rng.f(0.62, 0.86);

    inkLine(c, rng, cx - s * 0.13 + lx * 0.2, neckY, cx - s * 0.18 + lx * 0.45, neckY + s * 0.32, 1.8);
    inkLine(c, rng, cx + s * 0.13 + lx * 0.2, neckY, cx + s * 0.18 + lx * 0.45, neckY + s * 0.32, 1.8);

    const Lsh = { x: cx - shW + lx, y: neckY + s * rng.f(0.34, 0.46) };
    const Rsh = { x: cx + shW + lx, y: neckY + s * rng.f(0.34, 0.48) };
    const Lhp = { x: cx - hipW + lx * 1.15, y: hipY + rng.f(-3, 6) };
    const Rhp = { x: cx + hipW + lx * 1.15, y: hipY + rng.f(-3, 6) };
    const collar = { x: cx + lx * 0.28, y: (Lsh.y + Rsh.y) / 2 - s * 0.08 };
    const Ldel = { x: Lsh.x - s * 0.02, y: Lsh.y + s * 0.38 + rng.f(-3, 3) };
    const Rdel = { x: Rsh.x + s * 0.02, y: Rsh.y + s * 0.38 + rng.f(-3, 3) };
    const Lwa = { x: cx - hipW * 0.98 + lx, y: Lsh.y + s * 1.02 + rng.f(-4, 4) };
    const Rwa = { x: cx + hipW * 0.98 + lx, y: Rsh.y + s * 1.02 + rng.f(-4, 4) };
    const crotch = { x: cx + lx * 0.45, y: hipY + s * 0.06 };

    const torso = [Lsh, Ldel, Lwa, Lhp, crotch, Rhp, Rwa, Rdel, Rsh, collar];
    if (clothes.wash) {
      inkFill(c, rng, torso, clothes.wash, 0.16);
      wash(c, rng, cx + lx * 0.4, (Lsh.y + hipY) / 2, shW * 0.48, (hipY - Lsh.y) * 0.32, clothes.wash, 0.1);
    }
    inkPoly(c, rng, [Lsh, collar, Rsh], { w: 1.85 });
    inkPoly(c, rng, [Lsh, Ldel, Lwa, Lhp], { w: 1.8 });
    inkPoly(c, rng, [Rsh, Rdel, Rwa, Rhp], { w: 1.8 });
    inkPoly(c, rng, [Lhp, crotch, Rhp], { w: 1.7 });

    if (clothes.kind === "hoodie") {
      inkLine(c, rng, Lsh.x + s * 0.16, Lsh.y + s * 0.02, collar.x, collar.y - s * 0.14, 1.5);
      inkLine(c, rng, Rsh.x - s * 0.16, Rsh.y + s * 0.02, collar.x, collar.y - s * 0.14, 1.5);
      inkArc(c, rng, cx + lx, Lsh.y + s * 1.02, s * 0.3, 0.25, Math.PI - 0.25, 1.35);
    } else if (clothes.kind === "jacket") {
      inkLine(c, rng, collar.x, Lsh.y + s * 0.04, cx - s * 0.04 + lx, hipY - s * 0.08, 1.5);
      inkLine(c, rng, collar.x, Rsh.y + s * 0.04, cx + s * 0.08 + lx, hipY - s * 0.08, 1.5);
      inkLine(c, rng, Lsh.x + s * 0.12, Lsh.y + s * 0.08, Lhp.x + s * 0.16, hipY - s * 0.06, 1.2);
      inkLine(c, rng, Rsh.x - s * 0.12, Rsh.y + s * 0.08, Rhp.x - s * 0.16, hipY - s * 0.06, 1.2);
    } else if (clothes.kind === "sweater") {
      for (let i = 0; i < 5; i++) {
        const y = hipY - s * 0.18 + i * s * 0.045;
        inkLine(c, rng, Lhp.x + s * 0.08, y, Rhp.x - s * 0.08, y + rng.f(-1, 1), 0.95);
      }
    } else if (clothes.kind === "tee" && rng.chance(0.45)) {
      inkCirc(c, rng, cx + lx, Lsh.y + s * 0.82, s * 0.08, 1.2);
    }

    const pose = clothes.pose;
    let Lel = { x: Lsh.x - s * rng.f(0.06, 0.16), y: Lsh.y + s * rng.f(0.62, 0.85) };
    let Rel = { x: Rsh.x + s * rng.f(0.06, 0.16), y: Rsh.y + s * rng.f(0.62, 0.85) };
    let Lh = { x: Lel.x + rng.f(-s * 0.04, s * 0.08), y: Lel.y + s * rng.f(0.55, 0.78) };
    let Rh = { x: Rel.x + rng.f(-s * 0.08, s * 0.04), y: Rel.y + s * rng.f(0.55, 0.78) };
    if (pose === "pockets") {
      Lh = { x: Lhp.x + s * 0.14, y: hipY - s * 0.1 };
      Rh = { x: Rhp.x - s * 0.14, y: hipY - s * 0.1 };
      Lel = { x: Lsh.x - s * 0.22, y: Lsh.y + s * 0.7 };
      Rel = { x: Rsh.x + s * 0.22, y: Rsh.y + s * 0.7 };
    } else if (pose === "hips") {
      Lel = { x: Lsh.x - s * 0.38, y: Lsh.y + s * 0.55 };
      Rel = { x: Rsh.x + s * 0.38, y: Rsh.y + s * 0.55 };
      Lh = { x: Lhp.x + s * 0.02, y: hipY - s * 0.04 };
      Rh = { x: Rhp.x - s * 0.02, y: hipY - s * 0.04 };
    }
    const armWash = clothes.wash;
    ribbon(c, rng, [Lsh, Lel, Lh], s * 0.13, s * 0.07, armWash);
    ribbon(c, rng, [Rsh, Rel, Rh], s * 0.13, s * 0.07, armWash);
    if (pose === "down") {
      mitt(c, rng, Lh, s, -1);
      mitt(c, rng, Rh, s, 1);
    } else if (pose === "pockets") {
      inkLine(c, rng, Lhp.x + s * 0.04, hipY - s * 0.16, Lhp.x + s * 0.22, hipY - s * 0.02, 1.2);
      inkLine(c, rng, Rhp.x - s * 0.04, hipY - s * 0.16, Rhp.x - s * 0.22, hipY - s * 0.02, 1.2);
    }

    const kneeL = { x: cx - s * 0.2 + lx * 1.2 + rng.f(-s * 0.08, s * 0.04), y: (hipY + footY) / 2 + rng.f(-4, 8) };
    const kneeR = { x: cx + s * 0.2 + lx * 1.2 + rng.f(-s * 0.04, s * 0.08), y: (hipY + footY) / 2 + rng.f(-4, 8) };
    const ankleL = { x: kneeL.x + rng.f(-s * 0.06, s * 0.08), y: footY };
    const ankleR = { x: kneeR.x + rng.f(-s * 0.06, s * 0.09), y: footY };
    ribbon(c, rng, [Lhp, kneeL, ankleL], s * 0.15, s * 0.08, armWash);
    ribbon(c, rng, [Rhp, kneeR, ankleR], s * 0.15, s * 0.08, armWash);
    const shoe = (p) => {
      const pts = [
        { x: p.x - s * 0.06, y: p.y - s * 0.03 },
        { x: p.x + s * 0.22, y: p.y - s * 0.01 },
        { x: p.x + s * 0.2, y: p.y + s * 0.05 },
        { x: p.x - s * 0.08, y: p.y + s * 0.04 },
      ];
      inkFill(c, rng, pts, INK, 0.55);
      inkPoly(c, rng, pts, { closed: true, w: 1.6 });
    };
    shoe(ankleL);
    shoe(ankleR);

    return { hipY, footY, Lsh, Rsh };
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

  function drawGlyph(c, rng, ch, x, y, size) {
    const d = GLYPHS[ch];
    if (!d) return size * 0.55;
    const sx = size * rng.f(0.94, 1.06);
    const sy = size * rng.f(0.96, 1.06);
    const rot = rng.f(-0.028, 0.028);
    const w = size * (ch === " " ? 0.34 : ch === "i" || ch === "l" || ch === "I" || ch === "'" ? 0.36 : rng.f(0.58, 0.7));
    d.forEach((stroke) => {
      const cmds = parsePath(stroke);
      const pts = [];
      let px = 0;
      let py = 0;
      const xf = (u, v) => {
        const rx = (u - 0.5) * sx;
        const ry = v * sy;
        return {
          x: x + rx * Math.cos(rot) - ry * Math.sin(rot),
          y: y + rx * Math.sin(rot) + ry * Math.cos(rot) + rng.f(-0.2, 0.2),
        };
      };
      cmds.forEach((cmd) => {
        if (cmd.t === "M" || cmd.t === "L") {
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
      inkPoly(c, rng, pts, { w: size * rng.f(0.1, 0.14), passes: 1 });
    });
    return w;
  }

  function drawName(c, rng, name, x, y, size) {
    const text = String(name).toUpperCase();
    c.save();
    c.translate(x, y);
    c.rotate(rng.f(-0.035, 0.03));
    let px = 0;
    const bases = [];
    for (const ch of text) {
      const dy = rng.f(-size * 0.03, size * 0.04);
      const cs = size * rng.f(0.96, 1.05);
      bases.push({ x: px, y: dy + cs });
      px += drawGlyph(c, rng, ch, px, dy, cs) + size * rng.f(0.04, 0.09);
    }
    if (rng.chance(0.72) && px > size * 0.8) {
      const y0 = size * rng.f(1.08, 1.22);
      const cuts = rng.i(1, 3);
      let x0 = size * 0.04;
      for (let i = 0; i < cuts; i++) {
        const x1 = x0 + (px - size * 0.08) / cuts + rng.f(-4, 6);
        if (!rng.chance(0.18)) {
          inkLine(c, rng, x0, y0 + rng.f(-1.5, 1.5), Math.min(px - 2, x1), y0 + rng.f(-2, 2.5), 1.2);
        }
        x0 = x1 + rng.f(1, 6);
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
  function makeDude(rng) {
    const hairStyles = [
      "buzz", "buzz", "bowl", "bowl", "bowl",
      "spiky", "curly", "side",
      "beanie", "beanie", "flat", "baseball",
      "band", "messy", "messy",
      "recede", "bald",
    ];
    const eyeStyles = ["dot", "open", "x", "slit", "angry", "glasses", "shades", "patch", "wink"];
    const noseStyles = ["long", "long", "long", "hook", "hook", "tri", "tri", "button"];
    const mouthStyles = ["smile", "frown", "open", "smirk", "lips", "line"];
    const beardStyles = ["none", "none", "none", "stache", "goatee", "beard", "stubble"];
    const clothesKinds = ["tee", "hoodie", "jacket", "sweater"];
    const poses = ["down", "pockets", "hips"];
    const washes = [null, "#e8c4a8", "#c4a07a", "#9aa87a", "#b9c4c8", "#d8b090"];
    const hairColors = ["#1a1712", "#211c16", "#181614", "#2a2218", "#1c1a16"];
    const skins = [null, "#e8d2bc", "#d8c0a4", "#c9a888", null];

    return {
      name: rng.chance(0.55) ? rng.pick(FIRST) : `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
      yaw: rng.f(-0.75, 0.75),
      pitch: rng.f(-0.28, 0.28),
      roll: rng.f(-0.12, 0.12),
      ratio: rng.f(0.74, 1.12),
      depth: rng.f(1.05, 1.5),
      lean: rng.f(-0.35, 0.35),
      size: rng.f(86, 104),
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
      jaw: rng.f(0.84, 1.22),
      chin: rng.f(-0.02, 0.16),
      crown: rng.f(0.9, 1.14),
      cheek: rng.f(0.92, 1.1),
      brows: rng.pick(["flat", "arch", "angry", "flat", "none", "arch"]),
    };
  }

  function drawDude(c, rng, dude, w, h) {
    paper(c, w, h, rng);
    const s = dude.size;
    const cx = w * 0.4 + rng.f(-10, 8);
    const cy = h * 0.26 + rng.f(-8, 8);

    const skull = new Skull(cx, cy, s, dude.yaw, dude.pitch, dude.roll, dude.ratio, dude.depth, {
      jaw: dude.jaw,
      chin: dude.chin,
      crown: dude.crown,
      cheek: dude.cheek,
    });
    drawBody(c, rng, cx, cy + s * 0.98, s * 0.92, dude.lean + dude.yaw * 0.25, dude.clothes);
    drawHead(c, rng, skull, dude.skin);
    drawHair(c, rng, skull, dude.hair, dude.hairColor);
    drawBrows(c, rng, skull, dude.brows);
    drawEyes(c, rng, skull, dude.eyes);
    drawNose(c, rng, skull, dude.nose);
    drawMouth(c, rng, skull, dude.mouth);
    drawFacialHair(c, rng, skull, dude.beard);

    const nameX = cx + s * 1.18;
    const nameY = cy + s * 0.35;
    drawName(c, rng, dude.name, nameX, nameY, rng.f(22, 30));
    grainPass(c);
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

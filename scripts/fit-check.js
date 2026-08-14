(function () {
  var q = new URLSearchParams(location.search);
  var N = Number(q.get("n") || 12);
  var W = Number(q.get("w") || 390);
  var H = Number(q.get("h") || 844);
  var cv = document.getElementById("page");
  var out = document.createElement("pre");
  out.id = "out";
  out.style.cssText = "position:absolute;left:0;top:" + (H + 10) + "px;font:14px monospace;white-space:pre";
  document.body.appendChild(out);
  var bad = [];
  var worst = { l: 1e9, r: 1e9, t: 1e9, b: 1e9 };

  function check(i) {
    var c = cv.getContext("2d");
    var dpr = cv.width / W;
    var d = c.getImageData(0, 0, cv.width, cv.height).data;
    var x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
    for (var y = 0, p = 0; y < cv.height; y++) {
      for (var x = 0; x < cv.width; x++, p += 4) {
        var lum = d[p] * 0.3 + d[p + 1] * 0.5 + d[p + 2] * 0.2;
        if (lum < 130) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    var L = x0 / dpr, R = W - x1 / dpr, T = y0 / dpr, B = H - y1 / dpr;
    worst.l = Math.min(worst.l, L); worst.r = Math.min(worst.r, R);
    worst.t = Math.min(worst.t, T); worst.b = Math.min(worst.b, B);
    var ids = ["another", "link-a", "link-b"], off = [];
    ids.forEach(function (id) {
      var e = document.getElementById(id);
      var r = e.getBoundingClientRect();
      if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) off.push(id);
      if (r.width < 40 || r.height < 20) off.push(id + "-small");
    });
    var seed = new URL(location.href).searchParams.get("s");
    if (L < 1 || R < 1 || T < 1 || B < 1 || off.length) {
      bad.push("#" + i + " seed=" + seed + " L" + L.toFixed(1) + " R" + R.toFixed(1) + " T" + T.toFixed(1) + " B" + B.toFixed(1) + " " + off.join(","));
    }
  }

  var i = 0;
  function step() {
    check(i);
    i++;
    if (i >= N) {
      out.textContent = "RESULT " + W + "x" + H + " n=" + N +
        " minGap L" + worst.l.toFixed(1) + " R" + worst.r.toFixed(1) +
        " T" + worst.t.toFixed(1) + " B" + worst.b.toFixed(1) +
        (bad.length ? "\nFAIL\n" + bad.join("\n") : "\nPASS");
      document.title = bad.length ? "FAIL" : "PASS";
      return;
    }
    document.getElementById("another").click();
    setTimeout(step, 30);
  }
  setTimeout(step, 60);
})();

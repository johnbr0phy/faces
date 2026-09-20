(() => {
  'use strict';
  const PHONES = window.PHONES || [];
  const N = PHONES.length;
  const LAST = N - 1;
  const $ = id => document.getElementById(id);

  const ruler = $('ruler'), playhead = $('playhead'), announcement = $('announcement');
  const play = $('play'), heroStack = $('hero-stack'), ticksBox = $('ticks'), decadesBox = $('decades');
  const yearEl = $('year'), nameEl = $('name'), labelEl = $('label'), specsEl = $('specs');
  const materialsEl = $('materials'), demoEl = $('demo'), demoNameEl = $('demo-name'), counterEl = $('counter');

  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  const clamp = v => Math.max(0, Math.min(LAST, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = t => t * t * (3 - 2 * t);

  let position = 0, target = 0, playing = false, current = -1;
  let raf = 0, lastTime = 0, holdUntil = 0, direction = 1;
  let drag = null, rulerWidth = 900, trackInset = 0, trackWidth = 900, tickSpacing = 18;
  let announceTimer = 0, wheelTimer = 0, wheelStart = null, demoTimer = 0;

  /* ---------- Build hero image layers ---------- */
  const imgs = PHONES.map((p, i) => {
    const img = document.createElement('img');
    img.src = `phones/${p.id}.png`;
    img.alt = `${p.name} (${p.year})`;
    img.decoding = 'async';
    img.loading = i < 4 ? 'eager' : 'lazy';
    img.draggable = false;
    return img;
  });
  heroStack.append(...imgs);
  const imgOpacity = new Array(N).fill(-1);

  /* ---------- Ticks + decade labels ---------- */
  const ticks = PHONES.map((p, i) => {
    const t = document.createElement('div');
    const prevEra = i > 0 ? PHONES[i - 1].era : null;
    t.className = 'tick' + (p.era !== prevEra ? ' era' : '');
    ticksBox.append(t);
    return t;
  });

  // Map an arbitrary year onto the (uneven) index axis via interpolation.
  const years = PHONES.map(p => p.year);
  function yearToIndex(y) {
    if (y <= years[0]) return 0;
    if (y >= years[LAST]) return LAST;
    for (let i = 0; i < LAST; i++) {
      if (y >= years[i] && y <= years[i + 1]) {
        const span = years[i + 1] - years[i];
        return span ? i + (y - years[i]) / span : i;
      }
    }
    return LAST;
  }
  const decadeYears = [1995, 2000, 2005, 2010, 2015, 2020, 2025];
  const decadeEls = decadeYears.map(y => {
    const s = document.createElement('span');
    s.textContent = y;
    s.dataset.index = yearToIndex(y);
    decadesBox.append(s);
    return s;
  });

  /* ---------- Panel + demo ---------- */
  let demoCleanup = null;
  function teardownDemo() {
    if (demoCleanup) { try { demoCleanup(); } catch (e) {} demoCleanup = null; }
    demoEl.replaceChildren();
  }
  function buildDemo(phone) {
    teardownDemo();
    demoNameEl.textContent = (phone.label || phone.feature || 'feature').toLowerCase();
    if (window.DEMOS && typeof window.DEMOS.build === 'function') {
      try { demoCleanup = window.DEMOS.build(phone.demo || phone.feature, demoEl, phone) || null; }
      catch (e) { demoEl.textContent = 'Demo unavailable.'; }
    }
  }
  function scheduleDemo(phone) {
    clearTimeout(demoTimer);
    // Only spin up the (sometimes heavy) live demo once we've settled on a phone.
    demoTimer = setTimeout(() => {
      if (!playing) buildDemo(phone);
    }, 130);
  }

  function updatePanel(index) {
    const p = PHONES[index];
    yearEl.textContent = p.year;
    nameEl.textContent = p.name;
    labelEl.textContent = p.label || '';
    counterEl.textContent = `${String(index + 1).padStart(2, '0')} / ${N}`;
    specsEl.replaceChildren(...(p.specs || []).map(s => {
      const li = document.createElement('li'); li.textContent = s; return li;
    }));
    materialsEl.textContent = p.materials || '';
    ruler.setAttribute('aria-valuenow', String(index));
    ruler.setAttribute('aria-valuetext', `${p.name}, ${p.year}, ${index + 1} of ${N}`);
    scheduleDemo(p);
  }

  /* ---------- Render loop ---------- */
  function render() {
    const p = reduced ? Math.round(position) : position;
    // Cross-fade neighbouring hero frames (fixed frame → zero layout shift).
    for (let i = 0; i < N; i++) {
      const o = Math.max(0, 1 - Math.abs(p - i));
      const v = o < 0.001 ? 0 : o;
      if (imgOpacity[i] !== v) { imgs[i].style.opacity = v; imgOpacity[i] = v; }
    }
    const markerX = trackInset + position / LAST * trackWidth;
    playhead.style.transform = `translateX(${(markerX - 1.5).toFixed(2)}px)`;
    ticks.forEach((tick, i) => {
      const x = trackInset + i * tickSpacing;
      const d = (x - markerX) / (trackWidth * 0.16);
      const proximity = Math.exp(-0.5 * d * d);
      const h = 8 + proximity * 46;
      tick.style.transform = `translateX(${x.toFixed(2)}px) scaleY(${(h / 44).toFixed(4)})`;
      tick.style.opacity = (0.35 + proximity * 0.5).toFixed(3);
    });
    decadeEls.forEach(el => {
      const x = trackInset + (+el.dataset.index) / LAST * trackWidth;
      el.style.left = `${x.toFixed(1)}px`;
    });

    const nearest = Math.round(position);
    if (nearest !== current) {
      current = nearest;
      updatePanel(current);
    }
  }

  function requestFrame() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = lastTime ? Math.min(40, now - lastTime) : 16.67;
    lastTime = now;
    if (playing && now >= holdUntil) {
      if (reduced) { target = clamp(Math.round(target) + direction); holdUntil = now + 1400; }
      else target = clamp(target + direction * dt / 900);
      if (target === LAST || target === 0) { direction = target === LAST ? -1 : 1; holdUntil = now + 900; }
    }
    position = reduced ? target : lerp(position, target, 1 - Math.exp(-dt / (drag ? 42 : 82)));
    if (Math.abs(target - position) < 0.0004) position = target;
    render();
    if (playing || position !== target) requestFrame(); else lastTime = 0;
  }

  /* ---------- Play / pause ---------- */
  function setPlaying(v) {
    playing = v;
    play.setAttribute('aria-pressed', String(v));
    play.setAttribute('aria-label', v ? 'Pause the timeline' : 'Play through the timeline');
    if (v) {
      teardownDemo();
      clearTimeout(announceTimer);
      direction = target >= LAST - 0.001 ? -1 : 1;
      holdUntil = performance.now() + 250;
      requestFrame();
    } else {
      // Rebuild the demo for whatever we landed on.
      scheduleDemo(PHONES[clamp(Math.round(target))]);
    }
  }
  play.addEventListener('click', () => setPlaying(!playing));

  function announceSettled() {
    clearTimeout(announceTimer);
    if (playing) return;
    announceTimer = setTimeout(() => {
      const p = PHONES[Math.round(target)];
      announcement.textContent = `${p.name}, ${p.year}. ${Math.round(target) + 1} of ${N}.`;
    }, 320);
  }

  function goTo(value, opts = {}) {
    if (!opts.keepPlaying) setPlaying(false);
    target = clamp(value);
    requestFrame();
    announceSettled();
  }

  /* ---------- Pointer drag on ruler ---------- */
  function pointerDown(event) {
    if (event.button !== 0 || !event.isPrimary) return;
    setPlaying(false);
    const rect = ruler.getBoundingClientRect();
    const startPosition = (event.clientX - rect.left - trackInset) / trackWidth * LAST;
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY,
      startPosition, moved: false, axis: event.pointerType === 'touch' ? null : 'x' };
    ruler.setPointerCapture(event.pointerId);
    ruler.classList.add('dragging');
    if (event.pointerType !== 'touch') { ruler.focus({ preventScroll: true }); target = clamp(startPosition); requestFrame(); }
  }
  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (drag.axis === null && Math.hypot(dx, dy) > 5) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (drag.axis !== 'x') return;
    if (Math.abs(dx) > 3) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    target = clamp(drag.startPosition + dx / trackWidth * LAST);
    requestFrame();
  }
  function endDrag(event, canceled) {
    if (!drag || event.pointerId !== drag.id) return;
    const state = drag; drag = null;
    ruler.classList.remove('dragging');
    if (ruler.hasPointerCapture(event.pointerId)) ruler.releasePointerCapture(event.pointerId);
    if (canceled || state.axis === 'y') return;
    goTo(Math.round(clamp(target)));
  }
  ruler.addEventListener('pointerdown', pointerDown);
  ruler.addEventListener('pointermove', pointerMove);
  ruler.addEventListener('pointerup', e => endDrag(e, false));
  ruler.addEventListener('pointercancel', e => endDrag(e, true));
  ruler.addEventListener('lostpointercapture', e => endDrag(e, true));
  ruler.addEventListener('dragstart', e => e.preventDefault());
  ruler.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey || drag) return;
    const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const delta = raw * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rulerWidth : 1);
    if (!delta || (target <= 0 && delta < 0) || (target >= LAST && delta > 0)) return;
    event.preventDefault();
    setPlaying(false);
    if (wheelStart === null) wheelStart = target;
    target = clamp(target + delta / 260); requestFrame();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      let end = Math.round(target);
      if (end === Math.round(wheelStart) && Math.abs(target - wheelStart) > 0.02) end = Math.round(wheelStart) + Math.sign(target - wheelStart);
      wheelStart = null; goTo(end);
    }, 170);
  }, { passive: false });

  /* ---------- Keyboard ---------- */
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const el = event.target;
    if (el instanceof Element && (el.isContentEditable || el.closest('input, textarea, select, [role="textbox"], [data-demo-interactive]'))) {
      // Let the focused demo handle its own keys, except global arrows on the ruler.
      if (el !== ruler) return;
    }
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if (!horizontal && el !== ruler && el !== document.body) return;
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = event.shiftKey ? target + 0.1 : Math.floor(target + 0.001) + 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = event.shiftKey ? target - 0.1 : Math.ceil(target - 0.001) - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = LAST;
    if (next !== undefined) { event.preventDefault(); clearTimeout(wheelTimer); goTo(next); }
    if (event.key === ' ' && (el === ruler || el === document.body)) { event.preventDefault(); setPlaying(!playing); }
  });

  /* ---------- Resize ---------- */
  function resize() {
    rulerWidth = ruler.getBoundingClientRect().width;
    trackInset = rulerWidth / (N * 2);
    trackWidth = rulerWidth - trackInset * 2;
    tickSpacing = trackWidth / LAST;
    render();
  }
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { setPlaying(false); lastTime = 0; } });
  reducedQuery.addEventListener?.('change', e => { reduced = e.matches; requestFrame(); });

  /* ---------- Deep link via hash ---------- */
  const hashIndex = () => PHONES.findIndex(p => p.id === decodeURIComponent(location.hash.slice(1)));
  const initial = hashIndex();
  if (initial >= 0) { position = target = initial; }
  window.addEventListener('hashchange', () => { const i = hashIndex(); if (i >= 0) goTo(i); });

  resize();
  updatePanel(Math.round(position));
  buildDemo(PHONES[Math.round(position)]);
  requestFrame();
})();

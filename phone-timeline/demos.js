/* Live, interactive "signature feature" mocks for every phone in the timeline.
   Each builder receives (ctx, phone) and may register disposers via ctx; the
   returned cleanup tears everything down before the next stop is built. */
(() => {
  'use strict';

  /* ---------- tiny helpers ---------- */
  function h(tag, props, children) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'style') Object.assign(el.style, props[k]);
      else if (k === 'class') el.className = props[k];
      else if (k === 'html') el.innerHTML = props[k];
      else if (k === 'text') el.textContent = props[k];
      else if (k.startsWith('aria') || k === 'role' || k === 'tabindex' || k.startsWith('data'))
        el.setAttribute(k === 'tabindex' ? 'tabindex' : k, props[k]);
      else el[k] = props[k];
    }
    if (children != null) (Array.isArray(children) ? children : [children]).forEach(c =>
      el.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return el;
  }

  function makeCtx(root) {
    root.setAttribute('data-demo-interactive', '');
    const disposers = [];
    return {
      root,
      add: el => { root.append(el); return el; },
      on(t, ev, fn, opts) { t.addEventListener(ev, fn, opts); disposers.push(() => t.removeEventListener(ev, fn, opts)); },
      interval(fn, ms) { const id = setInterval(fn, ms); disposers.push(() => clearInterval(id)); return id; },
      timeout(fn, ms) { const id = setTimeout(fn, ms); disposers.push(() => clearTimeout(id)); return id; },
      raf(loop) {
        let id, stopped = false;
        const tick = t => { if (stopped) return; loop(t); id = requestAnimationFrame(tick); };
        id = requestAnimationFrame(tick);
        disposers.push(() => { stopped = true; cancelAnimationFrame(id); });
      },
      dispose() { disposers.forEach(d => { try { d(); } catch (e) {} }); }
    };
  }

  const btn = (text, on, cls) => { const b = h('button', { class: 'd-btn ' + (cls || ''), type: 'button', text }); if (on) b.addEventListener('click', on); return b; };
  const hint = t => h('div', { class: 'd-hint', text: t });
  const wrap = (...kids) => h('div', { class: 'd-col' }, kids);

  /* =====================================================================
     SNAKE — Nokia 3310
  ===================================================================== */
  function snake(ctx) {
    const S = 12, cell = 12, W = S * cell;
    const cv = h('canvas', { class: 'd-snake', width: W, height: W, tabindex: '0', role: 'application', 'aria-label': 'Snake game. Arrow keys or swipe to steer.' });
    const g = cv.getContext('2d');
    const scoreEl = h('span', { class: 'd-score', text: '0' });
    let snakeArr, dir, food, dead, tickAcc = 0, last = 0, started = false, pending;
    function reset() {
      snakeArr = [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }];
      dir = { x: 1, y: 0 }; pending = dir; dead = false; placeFood(); scoreEl.textContent = '0';
    }
    function placeFood() {
      do { food = { x: (Math.random() * S) | 0, y: (Math.random() * S) | 0 }; }
      while (snakeArr.some(s => s.x === food.x && s.y === food.y));
    }
    function step() {
      dir = pending;
      const head = { x: (snakeArr[0].x + dir.x + S) % S, y: (snakeArr[0].y + dir.y + S) % S };
      if (snakeArr.some(s => s.x === head.x && s.y === head.y)) { dead = true; return; }
      snakeArr.unshift(head);
      if (head.x === food.x && head.y === food.y) { scoreEl.textContent = String(+scoreEl.textContent + 1); placeFood(); }
      else snakeArr.pop();
    }
    function draw() {
      g.fillStyle = '#9ea87d'; g.fillRect(0, 0, W, W);
      g.fillStyle = '#26301a';
      snakeArr.forEach(s => g.fillRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2));
      g.fillRect(food.x * cell + 2, food.y * cell + 2, cell - 4, cell - 4);
      if (!started || dead) {
        g.fillStyle = 'rgba(20,26,12,.72)'; g.fillRect(0, 0, W, W);
        g.fillStyle = '#e9edd8'; g.font = 'bold 11px monospace'; g.textAlign = 'center';
        g.fillText(dead ? 'GAME OVER' : 'PRESS PLAY', W / 2, W / 2 - 4);
        g.fillText(dead ? 'tap to retry' : '\u25B6', W / 2, W / 2 + 12);
      }
    }
    function turn(x, y) { if (x === -dir.x && y === -dir.y) return; pending = { x, y }; }
    ctx.on(cv, 'keydown', e => {
      const k = e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'].includes(k)) e.preventDefault();
      if (k === 'ArrowUp' || k === 'w') turn(0, -1);
      else if (k === 'ArrowDown' || k === 's') turn(0, 1);
      else if (k === 'ArrowLeft' || k === 'a') turn(-1, 0);
      else if (k === 'ArrowRight' || k === 'd') turn(1, 0);
      else if (k === ' ') go();
    });
    let sx, sy;
    ctx.on(cv, 'touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    ctx.on(cv, 'touchmove', e => {
      if (sx == null) return; const t = e.touches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.hypot(dx, dy) > 18) { if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0); else turn(0, Math.sign(dy)); sx = null; e.preventDefault(); }
    }, { passive: false });
    function go() { if (dead || !started) { reset(); started = true; cv.focus(); } }
    ctx.on(cv, 'click', go);
    reset();
    ctx.raf(t => {
      if (!last) last = t; const dt = t - last; last = t;
      if (started && !dead) { tickAcc += dt; if (tickAcc > 150) { tickAcc = 0; step(); } }
      draw();
    });
    ctx.add(wrap(
      h('div', { class: 'd-row' }, [h('span', { class: 'd-tag', text: 'SNAKE II' }), h('span', { class: 'd-score-wrap', html: 'score&nbsp;' }, )]),
      cv,
      h('div', { class: 'dpad' }, [
        btn('\u25B2', () => turn(0, -1), 'dp up'), btn('\u25C0', () => turn(-1, 0), 'dp left'),
        btn('\u25B6', () => turn(1, 0), 'dp right'), btn('\u25BC', () => turn(0, 1), 'dp down')
      ]),
      hint('Arrow keys / swipe / D-pad. Tap grid to start.')
    ));
    ctx.root.querySelector('.d-score-wrap').append(scoreEl);
  }

  /* =====================================================================
     FLIP phones — MicroTAC / StarTAC / RAZR
  ===================================================================== */
  function flip(variant) {
    return ctx => {
      const isMouth = variant === 'mouthpiece';
      const razr = variant === 'razr';
      let open = false;
      const flap = h('div', { class: 'flip-flap ' + variant }, h('div', { class: 'flip-screen', text: razr ? 'MOTO' : (variant === 'clamshell' ? 'StarTAC' : '') }));
      const base = h('div', { class: 'flip-base ' + variant }, h('div', { class: 'flip-keys' }, Array.from({ length: 12 }, (_, i) =>
        h('span', { class: 'flip-key', text: '1234567890*#'[i] }))));
      const device = h('div', { class: 'flip-device ' + variant, 'data-open': 'false' }, isMouth ? [base, flap] : [flap, base]);
      const toggle = () => { open = !open; device.setAttribute('data-open', String(open)); label.textContent = open ? 'Open' : (isMouth ? 'Mouthpiece up' : 'Closed'); };
      const label = h('span', { class: 'd-tag', text: 'Closed' });
      ctx.on(device, 'click', toggle);
      ctx.add(wrap(device, h('div', { class: 'd-row' }, [label, btn(isMouth ? 'Flip mouthpiece' : 'Open / close', toggle)]),
        hint(isMouth ? 'Tap to flip the mouthpiece down.' : 'Tap the phone to flip it open.')));
    };
  }

  /* =====================================================================
     SLIDERS — Chocolate / N95 / G1 / Droid
  ===================================================================== */
  function slide(variant) {
    return ctx => {
      const qwerty = variant === 'qwerty';
      let open = false;
      const rows = qwerty ? ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'] : ['123', '456', '789', '*0#'];
      const keys = h('div', { class: 'slide-keys ' + (qwerty ? 'qwe' : 'pad') },
        rows.flatMap(r => [...r].map(c => h('span', { class: 'slide-key', text: c }))));
      const screen = h('div', { class: 'slide-screen' }, h('div', { class: 'slide-glow', text: variant === 'twoway' ? 'N95' : (qwerty ? 'ANDROID' : 'LG') }));
      const device = h('div', { class: 'slide-device ' + variant, 'data-open': 'false' }, [keys, screen]);
      const toggle = () => { open = !open; device.setAttribute('data-open', String(open)); tag.textContent = open ? 'Open' : 'Closed'; };
      const tag = h('span', { class: 'd-tag', text: 'Closed' });
      ctx.on(screen, 'click', toggle);
      ctx.add(wrap(device, h('div', { class: 'd-row' }, [tag, btn(variant === 'twoway' ? 'Two-way slide' : (qwerty ? 'Slide keyboard' : 'Slide up'), toggle)]),
        hint('Tap the screen to slide it ' + (qwerty ? 'sideways.' : 'open.'))));
    };
  }

  /* =====================================================================
     SWING SCREEN — Sidekick
  ===================================================================== */
  function swing(ctx) {
    let open = false;
    const kb = h('div', { class: 'swing-kb' }, Array.from({ length: 30 }, () => h('span')));
    const screen = h('div', { class: 'swing-screen', text: 'SIDEKICK' });
    const device = h('div', { class: 'swing-device', 'data-open': 'false' }, [kb, screen]);
    const toggle = () => { open = !open; device.setAttribute('data-open', String(open)); };
    ctx.on(screen, 'click', toggle);
    ctx.add(wrap(device, btn('Swing the screen', toggle), hint('Tap the screen — it swivels out to reveal the keyboard.')));
  }

  /* =====================================================================
     SPRINGBOARD — iPhone homescreen
  ===================================================================== */
  function springboard(ctx, phone) {
    const apps = [['#34c759', 'Phone'], ['#0a84ff', 'Safari'], ['#30d158', 'Msgs'], ['#ff9f0a', 'Mail'],
      ['#ff375f', 'Music'], ['#5e5ce6', 'Photos'], ['#64d2ff', 'Weather'], ['#ffd60a', 'Notes'],
      ['#bf5af2', 'Maps']];
    const screen = h('div', { class: 'screen tall ios' });
    const status = h('div', { class: 'ios-status' }, [h('span', { text: '9:41' }), h('span', { text: '\u25CF\u25CF\u25CF \uD83D\uDCF6 \uD83D\uDD0B' })]);
    const grid = h('div', { class: 'ios-grid' });
    const overlay = h('div', { class: 'ios-app' }, [h('div', { class: 'ios-app-name' }), btn('\u2039 Home', () => overlay.classList.remove('open'), 'ios-home')]);
    apps.forEach(([c, name]) => {
      const ic = h('button', { class: 'ios-icon', type: 'button', 'aria-label': name },
        [h('span', { class: 'ios-ic-face', style: { background: c } }), h('span', { class: 'ios-ic-label', text: name })]);
      ic.addEventListener('click', () => { overlay.querySelector('.ios-app-name').textContent = name; overlay.style.setProperty('--tint', c); overlay.classList.add('open'); });
      grid.append(ic);
    });
    screen.append(status, grid, overlay);
    const dot = h('div', { class: 'ios-dock' }, [h('span'), h('span'), h('span'), h('span')]);
    ctx.add(wrap(screen, dot, hint('Tap an app icon to open it. Press Home to go back.')));
  }

  /* =====================================================================
     BBM — BlackBerry messaging
  ===================================================================== */
  function bbm(ctx) {
    const lines = ['hey, you around?', 'in a meeting \uD83D\uDE11', 'ping me after?', 'will do \uD83D\uDC4D'];
    let i = 0;
    const feed = h('div', { class: 'bbm-feed' });
    const screen = h('div', { class: 'screen tall bbm' }, [h('div', { class: 'bbm-top', text: 'BBM \u00B7 Alex' }), feed]);
    function bubble(text, me) {
      const status = h('span', { class: 'bbm-status', text: me ? 'D' : '' });
      const b = h('div', { class: 'bbm-msg ' + (me ? 'me' : 'them') }, [h('span', { text }), me ? status : null].filter(Boolean));
      feed.append(b); feed.scrollTop = feed.scrollHeight;
      if (me) { ctx.timeout(() => status.textContent = 'R', 700); }
      return b;
    }
    function send() {
      if (i >= lines.length) i = 0;
      const mine = i % 2 === 0;
      bubble(lines[i], mine); i++;
      if (mine) { const typing = h('div', { class: 'bbm-msg them typing', html: '<span></span><span></span><span></span>' }); feed.append(typing);
        ctx.timeout(() => { typing.remove(); if (i < lines.length) bubble(lines[i], false), i++; }, 1100); }
    }
    ctx.add(wrap(screen, h('div', { class: 'd-row' }, [btn('Send BBM', send), hint('D = delivered \u2192 R = read')])));
    send();
  }

  /* =====================================================================
     webOS cards — Palm Pre
  ===================================================================== */
  function webosCards(ctx) {
    const names = [['#0a84ff', 'Email'], ['#ff375f', 'Browser'], ['#30d158', 'Maps'], ['#ff9f0a', 'Photos']];
    const deck = h('div', { class: 'cards-deck' });
    function fill() {
      deck.replaceChildren();
      names.forEach(([c, n]) => {
        const card = h('div', { class: 'webos-card', style: { background: c } }, h('span', { text: n }));
        let sy, dy = 0;
        card.addEventListener('pointerdown', e => { sy = e.clientY; card.setPointerCapture(e.pointerId); });
        card.addEventListener('pointermove', e => { if (sy == null) return; dy = e.clientY - sy; if (dy < 0) card.style.transform = `translateY(${dy}px)`; });
        card.addEventListener('pointerup', () => { if (dy < -60) { card.classList.add('flung'); ctx.timeout(() => card.remove(), 220); } else card.style.transform = ''; sy = null; dy = 0; });
        deck.append(card);
      });
    }
    fill();
    ctx.add(wrap(h('div', { class: 'cards-stage' }, deck), h('div', { class: 'd-row' }, [btn('Reset cards', fill), hint('Flick a card up to close it.')])));
  }

  /* =====================================================================
     CAMERA — lenses / shutter / control slider / xenon
  ===================================================================== */
  function camera(variant) {
    return (ctx, phone) => {
      const lensSets = { lenses: ['.5\u00D7', '1\u00D7', '2\u00D7', '3\u00D7'], shutter: ['1\u00D7'], control: ['1\u00D7', '2\u00D7', '5\u00D7'] };
      const lenses = lensSets[variant] || ['1\u00D7'];
      let zoom = lenses.indexOf('1\u00D7') < 0 ? 0 : lenses.indexOf('1\u00D7');
      const scene = h('div', { class: 'cam-scene' }, [h('div', { class: 'cam-sky' }), h('div', { class: 'cam-sun' }), h('div', { class: 'cam-hill' }), h('div', { class: 'cam-hill h2' })]);
      const view = h('div', { class: 'screen cam-view' }, scene);
      const flash = h('div', { class: 'cam-flash' });
      view.append(flash);
      function applyZoom() { scene.style.transform = `scale(${1 + zoom * 0.6})`; lensRow && [...lensRow.children].forEach((b, i) => b.classList.toggle('on', i === zoom)); }
      const shot = () => { flash.classList.add('fire'); ctx.timeout(() => flash.classList.remove('fire'), 260);
        const th = view.querySelector('.cam-thumb') || h('div', { class: 'cam-thumb' }); view.append(th); th.classList.remove('pop'); void th.offsetWidth; th.classList.add('pop'); };
      let lensRow;
      const controls = [];
      if (variant === 'control') {
        const slider = h('input', { class: 'cam-control', type: 'range', min: '0', max: String(lenses.length - 1), value: String(zoom), step: '0.01', 'aria-label': 'Camera Control zoom' });
        slider.addEventListener('input', () => { zoom = Math.round(+slider.value); scene.style.transform = `scale(${1 + (+slider.value) * 0.6})`; tag.textContent = lenses[zoom]; });
        const tag = h('span', { class: 'd-tag', text: lenses[zoom] });
        controls.push(h('div', { class: 'cam-control-wrap' }, [h('span', { class: 'd-tag', text: 'slide \u2192' }), slider, tag]));
        controls.push(btn('Shutter', shot, 'shutter'));
        controls.push(hint('Slide the capacitive Camera Control to zoom.'));
      } else {
        lensRow = h('div', { class: 'cam-lenses' }, lenses.map((l, i) => btn(l, () => { zoom = i; applyZoom(); }, 'lens')));
        controls.push(lensRow, btn('', shot, 'shutter big'), hint(variant === 'shutter' ? 'Tap the shutter — watch the Xenon flash.' : 'Switch lenses, then tap the shutter.'));
      }
      applyZoom();
      ctx.add(wrap(view, ...controls));
    };
  }

  /* =====================================================================
     ASSISTANT — Siri waveform / Assistant orb
  ===================================================================== */
  function assistant(variant) {
    return (ctx, phone) => {
      const siri = variant === 'siri';
      const canvas = h('canvas', { class: 'assist-wave', width: 200, height: 60 });
      const g = canvas.getContext('2d');
      const reply = h('div', { class: 'assist-reply' });
      const qa = siri ? ["What's the weather?", 'Set a 5 minute timer', 'Play some music'] : ['Summarize my day', "What's on my calendar?", 'Draft a reply'];
      const ans = siri ? ['It\u2019s 21\u00B0 and clear.', 'Timer set for 5:00.', 'Now playing \u266A'] : ['You have 3 meetings.', 'Standup at 10, review at 2.', 'Draft ready to send.'];
      let listening = false, phase = 0, amp = 0;
      ctx.raf(() => {
        phase += 0.22; amp += ((listening ? 1 : 0) - amp) * 0.08;
        g.clearRect(0, 0, 200, 60);
        const grad = g.createLinearGradient(0, 0, 200, 0); grad.addColorStop(0, '#4da3ff'); grad.addColorStop(1, '#7cf0c8');
        g.strokeStyle = grad; g.lineWidth = 2; g.beginPath();
        for (let x = 0; x <= 200; x += 4) {
          const env = Math.sin((x / 200) * Math.PI);
          const y = 30 + Math.sin(x * 0.14 + phase) * 16 * amp * env + Math.sin(x * 0.05 - phase) * 6 * amp * env;
          x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      });
      let n = 0;
      const ask = () => { listening = true; reply.textContent = qa[n % qa.length]; reply.classList.remove('answer');
        ctx.timeout(() => { listening = false; reply.textContent = ans[n % ans.length]; reply.classList.add('answer'); n++; }, 1200); };
      ctx.add(wrap(
        h('div', { class: 'assist-orb' + (siri ? ' siri' : '') }, canvas),
        reply,
        h('div', { class: 'd-row' }, [btn(siri ? '\uD83C\uDF99 Hey Siri' : '\u2728 Ask ' + (phone.name.includes('Pixel') ? 'Gemini' : 'Assistant'), ask), hint('Tap to talk.')])
      ));
    };
  }

  /* =====================================================================
     LIVE TILES — Lumia / Windows Phone
  ===================================================================== */
  function liveTiles(ctx) {
    const defs = [['#e81123', 'Mail', '3'], ['#0078d7', 'Calendar', 'Tue'], ['#7fba00', 'Messages', '\uD83D\uDCAC'],
      ['#ff8c00', 'Photos', '\uD83D\uDDBC'], ['#8e44ad', 'Store', '\u2193'], ['#00b294', 'Weather', '21\u00B0'],
      ['#d80073', 'Music', '\u266A'], ['#00a4ef', 'People', '\uD83D\uDC65']];
    const grid = h('div', { class: 'tiles-grid' });
    const tiles = defs.map(([c, name, badge]) => {
      const front = h('div', { class: 'tile-face front', style: { background: c } }, h('span', { class: 'tile-badge', text: badge }));
      const back = h('div', { class: 'tile-face back', style: { background: c } }, h('span', { class: 'tile-name', text: name }));
      const tile = h('button', { class: 'tile', type: 'button', 'aria-label': name }, h('div', { class: 'tile-inner' }, [front, back]));
      tile.addEventListener('click', () => tile.classList.toggle('flipped'));
      grid.append(tile); return tile;
    });
    ctx.interval(() => { const t = tiles[(Math.random() * tiles.length) | 0]; t.classList.toggle('flipped'); }, 1100);
    ctx.add(wrap(grid, hint('Tiles flip on their own \u2014 tap any to flip it now.')));
  }

  /* =====================================================================
     UNLOCK — Face ID / Touch ID / under-display fingerprint
  ===================================================================== */
  function unlock(variant) {
    return (ctx, phone) => {
      const face = variant === 'face', touch = variant === 'touch';
      const screen = h('div', { class: 'screen tall lock' + (phone && phone.feature === 'face_id_notch' ? ' notch' : '') });
      if (face) screen.append(h('div', { class: 'lock-notch' }));
      const lockIcon = h('div', { class: 'lock-icon', html: '\uD83D\uDD12' });
      const time = h('div', { class: 'lock-time', text: '9:41' });
      const home = h('div', { class: 'home-btn' }, h('div', { class: 'fp-ring' }));
      const fpScreen = h('div', { class: 'fp-onscreen', html: '\uD83D\uDC46' });
      screen.append(time, lockIcon);
      if (variant === 'underdisplay') screen.append(fpScreen);
      const desk = h('div', { class: 'lock-desktop', html: '\uD83D\uDCF1' });
      screen.append(desk);
      let busy = false;
      function doUnlock() {
        if (busy) return; busy = true; screen.classList.add('scanning');
        ctx.timeout(() => { screen.classList.remove('scanning'); screen.classList.add('unlocked'); lockIcon.innerHTML = '\uD83D\uDD13'; tag.textContent = 'Unlocked'; }, face ? 900 : 700);
        ctx.timeout(() => { screen.classList.remove('unlocked'); lockIcon.innerHTML = '\uD83D\uDD12'; tag.textContent = 'Locked'; busy = false; }, 2400);
      }
      const tag = h('span', { class: 'd-tag', text: 'Locked' });
      const trigger = face ? btn('\uD83D\uDC40 Glance to unlock', doUnlock)
        : touch ? (ctx.on(home, 'pointerdown', doUnlock), home)
          : (ctx.on(fpScreen, 'pointerdown', doUnlock), btn('Press fingerprint', doUnlock));
      const controls = touch ? [home, h('div', { class: 'd-row' }, [tag, hint('Rest your finger on the home button.')])]
        : [h('div', { class: 'd-row' }, [tag, trigger]), hint(face ? 'Glance at the notch camera to unlock.' : 'Press the on-screen fingerprint.')];
      ctx.add(wrap(screen, ...controls));
    };
  }

  /* =====================================================================
     DYNAMIC ISLAND — iPhone 14 Pro
  ===================================================================== */
  function dynamicIsland(ctx) {
    const island = h('button', { class: 'island', type: 'button', 'aria-label': 'Dynamic Island now playing' }, [
      h('div', { class: 'island-compact' }, [h('span', { class: 'island-dot' }), h('span', { class: 'island-eq', html: '<i></i><i></i><i></i>' })]),
      h('div', { class: 'island-expanded' }, [h('div', { class: 'island-art' }), h('div', { class: 'island-meta' }, [h('b', { text: 'Now Playing' }), h('span', { text: 'Timeline FM \u00B7 \u266A' })]), h('div', { class: 'island-eq big', html: '<i></i><i></i><i></i><i></i>' })])
    ]);
    const screen = h('div', { class: 'screen tall island-screen' }, island);
    let open = false;
    const toggle = () => { open = !open; island.classList.toggle('open', open); };
    ctx.on(island, 'click', toggle);
    ctx.timeout(toggle, 500);
    ctx.add(wrap(screen, h('div', { class: 'd-row' }, [btn('Toggle Island', toggle), hint('Tap the pill to expand / collapse.')])));
  }

  /* =====================================================================
     FOLD — Galaxy Fold (book) / Z Flip (flip)
  ===================================================================== */
  function fold(variant) {
    return (ctx, phone) => {
      const flip = variant === 'flip';
      let open = false;
      const inner = h('div', { class: 'fold-inner' }, h('div', { class: 'fold-content', html: flip ? '9:41' : '\u25A0 \u25A0 \u25A0<br>\u25A0 \u25A0 \u25A0' }));
      const leaf = h('div', { class: 'fold-leaf' });
      const device = h('div', { class: 'fold-device ' + variant, 'data-open': 'false' }, [inner, leaf]);
      const toggle = () => { open = !open; device.setAttribute('data-open', String(open)); tag.textContent = open ? 'Unfolded' : 'Folded'; };
      const tag = h('span', { class: 'd-tag', text: 'Folded' });
      ctx.on(device, 'click', toggle);
      ctx.add(wrap(h('div', { class: 'fold-stage ' + variant }, device), h('div', { class: 'd-row' }, [tag, btn(flip ? 'Flip open' : 'Unfold', toggle)]),
        hint(flip ? 'Tap to flip it open.' : 'Tap to unfold into a tablet.')));
    };
  }

  /* =====================================================================
     MISC one-offs
  ===================================================================== */
  function t9(ctx) {
    const map = { 1: '.,?', 2: 'abc', 3: 'def', 4: 'ghi', 5: 'jkl', 6: 'mno', 7: 'pqrs', 8: 'tuv', 9: 'wxyz', 0: ' ' };
    const out = h('div', { class: 'screen t9-screen' }, h('div', { class: 't9-text', text: '' }));
    const txt = out.querySelector('.t9-text');
    let lastKey = null, seq = 0, timer = 0;
    function press(k) {
      const letters = map[k]; if (!letters) return;
      if (k === lastKey) { seq = (seq + 1) % letters.length; txt.textContent = txt.textContent.slice(0, -1) + letters[seq]; }
      else { seq = 0; txt.textContent += letters[0]; }
      lastKey = k; clearTimeout(timer); timer = ctx.timeout(() => { lastKey = null; }, 900);
    }
    const pad = h('div', { class: 't9-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(k =>
      h('button', { class: 't9-key', type: 'button' }, [h('b', { text: k }), h('small', { text: (map[k] || '').toUpperCase() })])));
    [...pad.children].forEach((b, i) => { const k = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'][i]; ctx.on(b, 'click', () => k === '*' ? (txt.textContent = txt.textContent.slice(0, -1)) : press(k)); });
    ctx.add(wrap(out, pad, hint('Multi-tap like it\u2019s 2000. \u2217 deletes.')));
  }

  function rotaryKeys(ctx) {
    const out = h('div', { class: 'screen rot-screen' }, h('div', { class: 'rot-text', text: '' }));
    const txt = out.querySelector('.rot-text');
    const ring = h('div', { class: 'rot-ring' });
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    digits.forEach((d, i) => {
      const a = (i / digits.length) * Math.PI * 2 - Math.PI / 2;
      const k = h('button', { class: 'rot-key', type: 'button', text: d, style: { left: `calc(50% + ${Math.cos(a) * 62}px)`, top: `calc(50% + ${Math.sin(a) * 62}px)` } });
      ctx.on(k, 'click', () => { k.classList.add('lit'); ctx.timeout(() => k.classList.remove('lit'), 180); txt.textContent = (txt.textContent + d).slice(-10); });
      ring.append(k);
    });
    ctx.add(wrap(out, ring, hint('The Nokia 3650\u2019s famous circular keypad.')));
  }

  function stylus(ctx) {
    const screen = h('div', { class: 'screen tall pda' });
    const targets = h('div', { class: 'pda-targets' });
    let score = 0; const tag = h('span', { class: 'd-tag', text: 'Tap the targets' });
    function spawn() {
      targets.replaceChildren();
      const dot = h('button', { class: 'pda-dot', type: 'button', style: { left: (10 + Math.random() * 75) + '%', top: (10 + Math.random() * 70) + '%' } });
      ctx.on(dot, 'pointerdown', () => { score++; tag.textContent = 'Tapped \u00D7 ' + score; spawn(); });
      targets.append(dot);
    }
    screen.append(h('div', { class: 'pda-title', text: 'Graffiti \u270D' }), targets); spawn();
    ctx.add(wrap(screen, h('div', { class: 'd-row' }, [tag, hint('Tap precisely \u2014 like a resistive stylus.')])));
  }

  function draw(_variant) {
    return ctx => {
      const c = h('canvas', { class: 'draw-canvas', width: 200, height: 150, 'aria-label': 'Draw with the S Pen' });
      const g = c.getContext('2d'); g.fillStyle = '#f6f7fb'; g.fillRect(0, 0, 200, 150); g.strokeStyle = '#141821'; g.lineWidth = 2.4; g.lineCap = 'round';
      let drawing = false, px, py;
      const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * 200 / r.width, (e.clientY - r.top) * 150 / r.height]; };
      ctx.on(c, 'pointerdown', e => { drawing = true; [px, py] = pos(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
      ctx.on(c, 'pointermove', e => { if (!drawing) return; const [x, y] = pos(e); g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); [px, py] = [x, y]; });
      ctx.on(c, 'pointerup', () => drawing = false);
      const clear = () => { g.fillStyle = '#f6f7fb'; g.fillRect(0, 0, 200, 150); };
      ctx.add(wrap(h('div', { class: 'pen-frame' }, c), h('div', { class: 'd-row' }, [btn('Clear', clear), hint('Scribble with the S Pen.')])));
    };
  }

  function forceTouch(ctx) {
    const icon = h('button', { class: 'ft-icon', type: 'button', 'aria-label': 'Press firmly' }, '\uD83D\uDCF7');
    const pop = h('div', { class: 'ft-pop' }, ['\uD83D\uDCF7 Camera', h('div', { class: 'ft-actions' }, [h('span', { text: 'Selfie' }), h('span', { text: 'Video' }), h('span', { text: 'Photo' })])]);
    let timer = 0;
    const start = () => { icon.classList.add('pressing'); timer = ctx.timeout(() => { icon.classList.remove('pressing'); pop.classList.add('show'); }, 450); };
    const end = () => { clearTimeout(timer); icon.classList.remove('pressing'); };
    ctx.on(icon, 'pointerdown', start); ctx.on(icon, 'pointerup', end); ctx.on(icon, 'pointerleave', end);
    ctx.on(pop, 'click', () => pop.classList.remove('show'));
    ctx.add(wrap(h('div', { class: 'ft-stage' }, [icon, pop]), hint('Press and hold firmly to \u201Cpeek\u201D (3D Touch).')));
  }

  function battery(ctx) {
    const fill = h('div', { class: 'bat-fill' });
    const pct = h('div', { class: 'bat-pct', text: '0%' });
    const bat = h('div', { class: 'bat' }, [fill, h('div', { class: 'bat-cap' })]);
    let v = 0, dir = 1;
    ctx.interval(() => { v += dir * 3; if (v >= 100) { v = 100; dir = -1; } if (v <= 8) { v = 8; dir = 1; } fill.style.width = v + '%'; fill.style.background = v < 20 ? '#ff453a' : '#30d158'; pct.textContent = v + '%'; }, 90);
    ctx.add(wrap(bat, pct, h('div', { class: 'd-tag', text: '4000 mAh \u00B7 ~2 days' }), hint('A battery built to go the distance.')));
  }

  function noJack(ctx) {
    let wired = true;
    const phone = h('div', { class: 'jack-phone' }, [h('div', { class: 'jack-hole' }), h('div', { class: 'jack-plug' })]);
    const buds = h('div', { class: 'jack-buds', html: '\uD83C\uDFA7' });
    const stage = h('div', { class: 'jack-stage' }, [phone, buds]);
    const tag = h('span', { class: 'd-tag', text: 'Wired (3.5mm)' });
    const toggle = () => { wired = !wired; stage.setAttribute('data-wired', String(wired)); tag.textContent = wired ? 'Wired (3.5mm)' : 'Wireless \uD83C\uDF19'; };
    stage.setAttribute('data-wired', 'true');
    ctx.on(stage, 'click', toggle);
    ctx.add(wrap(stage, h('div', { class: 'd-row' }, [tag, btn('Take courage', toggle)]), hint('Tap to remove the headphone jack.')));
  }

  function magsafe(ctx) {
    const back = h('div', { class: 'mag-back' }, h('div', { class: 'mag-ring' }));
    const puck = h('div', { class: 'mag-puck' });
    const stage = h('div', { class: 'mag-stage' }, [back, puck]);
    let sx, sy, ox = 70, oy = 40, snapped = false;
    function place() { puck.style.transform = `translate(${ox}px, ${oy}px)`; }
    place();
    ctx.on(puck, 'pointerdown', e => { sx = e.clientX - ox; sy = e.clientY - oy; puck.setPointerCapture(e.pointerId); snapped = false; puck.classList.remove('snapped'); });
    ctx.on(puck, 'pointermove', e => { if (sx == null) return; ox = e.clientX - sx; oy = e.clientY - sy; place(); });
    ctx.on(puck, 'pointerup', () => { if (Math.hypot(ox, oy) < 42) { ox = 0; oy = 0; place(); puck.classList.add('snapped'); snapped = true; } sx = null; });
    ctx.add(wrap(stage, h('div', { class: 'd-tag', text: 'Drag the puck to the ring' }), hint('Get close \u2014 MagSafe snaps it into place.')));
  }

  function promotion(ctx) {
    let hz = 120; const dot = h('div', { class: 'pm-dot' });
    const track = h('div', { class: 'pm-track' }, dot);
    let t = 0, drop = 0;
    ctx.raf(() => { t += 0.03; drop = (drop + 1) % Math.round(120 / hz); const skip = drop !== 0; if (!skip) { const x = (Math.sin(t) * 0.5 + 0.5) * 88; dot.style.left = x + '%'; } });
    const tag = h('span', { class: 'd-tag', text: '120 Hz ProMotion' });
    const toggle = btn('Toggle 60 / 120 Hz', () => { hz = hz === 120 ? 60 : 120; tag.textContent = hz + ' Hz' + (hz === 120 ? ' ProMotion' : ''); });
    ctx.add(wrap(track, h('div', { class: 'd-row' }, [tag, toggle]), hint('Watch the smoothness change with refresh rate.')));
  }

  function sizeGrow(ctx) {
    const phone = h('div', { class: 'grow-phone' }, h('div', { class: 'grow-screen', text: '4.7\u2033' }));
    const range = h('input', { class: 'grow-range', type: 'range', min: '35', max: '100', value: '100', 'aria-label': 'Display size' });
    range.addEventListener('input', () => { const v = +range.value; phone.style.setProperty('--s', v / 100); phone.querySelector('.grow-screen').textContent = (3.5 + (v - 35) / 65 * 1.2).toFixed(1) + '\u2033'; });
    ctx.add(wrap(h('div', { class: 'grow-stage' }, phone), range, hint('Apple finally went big \u2014 drag to resize.')));
  }

  function sidetalk(ctx) {
    let side = false;
    const taco = h('div', { class: 'ngage' }, [h('div', { class: 'ngage-screen', text: 'N-GAGE' }), h('div', { class: 'ngage-keys' }, Array.from({ length: 8 }, () => h('span')))]);
    const stage = h('div', { class: 'ngage-stage', 'data-side': 'false' }, taco);
    const toggle = () => { side = !side; stage.setAttribute('data-side', String(side)); tag.textContent = side ? 'Side-talking \uD83C\uDF2E' : 'Normal'; };
    const tag = h('span', { class: 'd-tag', text: 'Normal' });
    ctx.on(taco, 'click', toggle);
    ctx.add(wrap(stage, h('div', { class: 'd-row' }, [tag, btn('Hold sideways', toggle)]), hint('The infamous \u201Ctaco\u201D side-talking pose.')));
  }

  function actionButton(ctx) {
    const modes = ['Silent \uD83D\uDD15', 'Ring \uD83D\uDD14', 'Torch \uD83D\uDD26', 'Camera \uD83D\uDCF7', 'Focus \uD83C\uDF19'];
    let i = 0;
    const phone = h('div', { class: 'ab-phone' }, [h('div', { class: 'ab-button' }), h('div', { class: 'ab-screen' }, h('span', { class: 'ab-label', text: modes[0] }))]);
    const cycle = () => { i = (i + 1) % modes.length; phone.querySelector('.ab-label').textContent = modes[i]; phone.classList.add('press'); ctx.timeout(() => phone.classList.remove('press'), 160); };
    ctx.on(phone.querySelector('.ab-button'), 'click', cycle);
    ctx.add(wrap(phone, h('div', { class: 'd-row' }, [btn('Press Action Button', cycle), hint('Map it to anything.')])));
  }

  function appGrid(ctx, phone) {
    const era = phone.era || '';
    const palette = era === 'wp8' ? ['#e81123', '#0078d7', '#7fba00'] : ['#3ddc84', '#4285f4', '#ea4335', '#fbbc05', '#34a853', '#a142f4'];
    const os = phone.name.includes('Nokia') ? 'Symbian' : phone.name.includes('Pixel') || phone.name.includes('Nexus') ? 'Android' : phone.name.includes('HTC') ? 'Sense' : phone.name.includes('Samsung') || phone.name.includes('Galaxy') ? 'TouchWiz' : 'Home';
    const screen = h('div', { class: 'screen tall os' }, [h('div', { class: 'os-status', text: os }), h('div', { class: 'os-grid' })]);
    const grid = screen.querySelector('.os-grid');
    const names = ['Dialer', 'Msgs', 'Web', 'Camera', 'Music', 'Maps', 'Mail', 'Settings', 'Clock'];
    names.forEach((n, i) => {
      const ic = h('button', { class: 'os-app', type: 'button', 'aria-label': n }, [h('span', { class: 'os-ic', style: { background: palette[i % palette.length] } }), h('small', { text: n })]);
      ctx.on(ic, 'click', () => { ic.classList.remove('bounce'); void ic.offsetWidth; ic.classList.add('bounce'); });
      grid.append(ic);
    });
    ctx.add(wrap(screen, hint('Tap the apps \u2014 ' + os + ' on ' + phone.name.split(' ')[0] + '.')));
  }

  /* ---------- registry ---------- */
  const REG = {
    snake, t9, rotary_keys: rotaryKeys, stylus, appgrid: appGrid,
    flip_mouthpiece: flip('mouthpiece'), clamshell: flip('clamshell'), flip_animation: flip('razr'),
    sidetalk, swing_screen: swing, slider: slide('up'), twoway_slider: slide('twoway'), slide_qwerty: slide('qwerty'),
    springboard, bbm, webos_cards: webosCards, camera_shutter: camera('shutter'), camera_lenses: camera('lenses'),
    camera_control: camera('control'), siri: assistant('siri'), assistant: assistant('orb'), live_tiles: liveTiles,
    touch_id: unlock('touch'), face_id: unlock('face'), underdisplay_fp: unlock('underdisplay'),
    size_grow: sizeGrow, spen: draw('pen'), force_touch: forceTouch, battery, no_jack: noJack,
    magsafe, promotion, dynamic_island: dynamicIsland, fold: fold('book'), flip_fold: fold('flip'),
    action_button: actionButton
  };

  function _fallback(ctx, phone) { appGrid(ctx, phone); }

  window.DEMOS = {
    build(type, root, phone) {
      const ctx = makeCtx(root);
      (REG[type] || _fallback)(ctx, phone);
      return () => ctx.dispose();
    }
  };
})();

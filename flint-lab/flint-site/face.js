/* ---------- cursor-following headshot + theme toggle (John parity) ---------- */
(function(){
  var DIRS = [
    { id:'right', angle:0 }, { id:'down-right', angle:45 },
    { id:'down', angle:90 }, { id:'down-left', angle:135 },
    { id:'left', angle:180 }, { id:'up-left', angle:-135 },
    { id:'up', angle:-90 }, { id:'up-right', angle:-45 }
  ];

  var face = document.getElementById('face');
  if(!face) return;

  var root = document.documentElement;
  var imgs = Array.prototype.slice.call(face.querySelectorAll('img'));
  var theme = root.getAttribute('data-theme') || 'light';
  var currentDir = 'center';
  var hoverCenter = false;
  var funnyLock = false;
  var funnyTimer = 0;
  var underClearTimer = 0;
  var lastX = 0;
  var lastY = 0;
  var pending = false;

  // Mobile: no tracking — always look at camera.
  var isMobile = window.matchMedia('(pointer: coarse)').matches ||
    ('ontouchstart' in window && window.matchMedia('(max-width: 820px)').matches);

  imgs.forEach(function(img){
    var warm = new Image();
    warm.src = img.src;
  });

  function findFrame(dir, t){
    for(var i=0;i<imgs.length;i++){
      if(imgs[i].getAttribute('data-theme')===t && imgs[i].getAttribute('data-dir')===dir) return imgs[i];
    }
    return null;
  }

  function showFrame(dir, t){
    var next = findFrame(dir, t);
    if(!next) return;
    var prev = face.querySelector('img.on');

    if(prev === next){
      next.classList.add('on');
      next.classList.remove('under');
      return;
    }

    imgs.forEach(function(img){ img.classList.remove('on','under'); });
    if(prev) prev.classList.add('under');
    next.classList.add('on');

    if(underClearTimer) clearTimeout(underClearTimer);
    underClearTimer = setTimeout(function(){
      underClearTimer = 0;
      imgs.forEach(function(img){ if(img !== next) img.classList.remove('under'); });
    }, 120);
  }

  function nearestDir(dx, dy){
    var deg = Math.atan2(dy, dx) * 180 / Math.PI;
    var best = DIRS[0];
    var bestDelta = 999;

    for(var i=0;i<DIRS.length;i++){
      var d = Math.abs(deg - DIRS[i].angle);
      if(d > 180) d = 360 - d;
      if(d < bestDelta){ bestDelta = d; best = DIRS[i]; }
    }
    return best.id;
  }

  function setDir(dir){
    if(funnyLock) return;
    if(dir === currentDir) return;
    currentDir = dir;
    showFrame(currentDir, theme);
  }

  function updateFromPoint(x, y){
    if(isMobile) return;
    var rect = face.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height * 0.32;

    if(hoverCenter){
      setDir('center');
      return;
    }

    setDir(nearestDir(x - cx, y - cy));
  }

  function setTheme(next){
    theme = next;
    root.setAttribute('data-theme', theme);
    showFrame(currentDir, theme);
    try{ localStorage.setItem('flint-theme', theme); }catch(e){}
  }

  function toggleTheme(){
    if(funnyLock) return;
    funnyLock = true;
    if(funnyTimer) clearTimeout(funnyTimer);
    showFrame('funny', theme);

    funnyTimer = setTimeout(function(){
      funnyTimer = 0;
      if(!isMobile) currentDir = 'center';
      setTheme(theme === 'dark' ? 'light' : 'dark');
      funnyLock = false;
    }, 280);
  }

  // Flint has no nav-* pose files yet; this hook is parity-safe and no-ops.
  var NAV_FLASH = {
    builds: 'nav-builds',
    research: 'nav-research'
  };

  function holdNav(navId){
    var dir = NAV_FLASH[navId];
    if(!dir || !findFrame(dir, theme)) return;
    if(funnyTimer){ clearTimeout(funnyTimer); funnyTimer = 0; }
    funnyLock = false;
    currentDir = dir;
    showFrame(currentDir, theme);
  }

  function flashNav(navId){
    if(isMobile){ holdNav(navId); return; }
    var dir = NAV_FLASH[navId];
    if(!dir || !findFrame(dir, theme)) return;
    if(funnyTimer) clearTimeout(funnyTimer);
    funnyLock = true;
    showFrame(dir, theme);
    funnyTimer = setTimeout(function(){
      funnyTimer = 0;
      funnyLock = false;
      if(isMobile || hoverCenter) currentDir = 'center';
      showFrame(currentDir, theme);
    }, 420);
  }

  document.querySelectorAll('nav.main a[data-nav], #mobileNav a[data-nav]').forEach(function(a){
    a.addEventListener('click', function(){
      flashNav(a.getAttribute('data-nav'));
    });
  });

  window.__flintFaceSetTheme = function(t){
    if(funnyLock) return;
    setTheme(t);
  };
  window.__flintFaceToggleTheme = function(){
    toggleTheme();
  };

  showFrame(currentDir, theme);

  if(!isMobile){
    window.addEventListener('pointermove', function(e){
      lastX = e.clientX;
      lastY = e.clientY;
      if(pending) return;
      pending = true;
      requestAnimationFrame(function(){
        pending = false;
        updateFromPoint(lastX, lastY);
      });
    }, { passive:true });

    window.addEventListener('scroll', function(){
      if(lastX || lastY) updateFromPoint(lastX, lastY);
    }, { passive:true });

    window.addEventListener('resize', function(){
      if(lastX || lastY) updateFromPoint(lastX, lastY);
    });

    face.addEventListener('pointerenter', function(){
      hoverCenter = true;
      setDir('center');
    });

    face.addEventListener('pointerleave', function(e){
      hoverCenter = false;
      updateFromPoint(e.clientX, e.clientY);
    });
  }

  face.addEventListener('click', function(e){
    e.preventDefault();
    toggleTheme();
  });

  face.addEventListener('keydown', function(e){
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      toggleTheme();
    }
  });
})();

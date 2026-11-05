/* M07L3Y Media — site behaviour (no dependencies) */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Mobile nav ---- */
  var nav = document.querySelector('.nav');
  var burger = document.querySelector('.burger');
  if (nav && burger) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('.nav-links a')) {
        nav.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        burger.focus();
      }
    });
  }

  /* ---- Logo (header + footer): back to the top of the home page from anywhere ---- */
  function isHome() {
    var p = location.pathname;
    return p === '' || /\/$/.test(p) || /(^|\/)index\.html$/.test(p);
  }
  document.addEventListener('click', function (e) {
    var logo = e.target.closest('.logo, .foot-logo');
    if (!logo || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    if (nav) { nav.classList.remove('open'); if (burger) burger.setAttribute('aria-expanded', 'false'); }
    if (isHome()) {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (err) {} }
    } else {
      location.href = logo.getAttribute('href') || 'index.html';
    }
  });

  /* ---- Services dropdown ---- */
  var subs = document.querySelectorAll('.has-sub');
  var canHover = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
  function setSub(li, open) {
    li.classList.toggle('open', open);
    li.querySelector('.sub-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  subs.forEach(function (li) {
    var btn = li.querySelector('.sub-toggle');
    btn.addEventListener('click', function () { setSub(li, !li.classList.contains('open')); });
    if (canHover) {
      var timer;
      li.addEventListener('mouseenter', function () { if (window.innerWidth > 980) { clearTimeout(timer); setSub(li, true); } });
      li.addEventListener('mouseleave', function () { if (window.innerWidth > 980) { timer = setTimeout(function () { setSub(li, false); }, 180); } });
    }
  });
  document.addEventListener('click', function (e) {
    subs.forEach(function (li) { if (!li.contains(e.target) && window.innerWidth > 980) setSub(li, false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') subs.forEach(function (li) {
      if (li.classList.contains('open')) { setSub(li, false); li.querySelector('.sub-toggle').focus(); }
    });
  });
  // Mobile menu: show the services list expanded
  if (burger) burger.addEventListener('click', function () {
    if (window.innerWidth <= 980) subs.forEach(function (li) { setSub(li, nav.classList.contains('open')); });
  });

  /* ---- Footer year ---- */
  var y = document.querySelectorAll('[data-year]');
  for (var i = 0; i < y.length; i++) y[i].textContent = new Date().getFullYear();

  /* ---- Camera HUD timecodes (24 fps) ---- */
  var tcs = document.querySelectorAll('.tc');
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  if (tcs.length) {
    if (reduce) {
      for (var t = 0; t < tcs.length; t++) tcs[t].textContent = '00:00:12:08';
    } else {
      var t0 = performance.now();
      (function tick(now) {
        var s = (now - t0) / 1000, f = Math.floor((s % 1) * 24);
        var txt = '00:' + pad(Math.floor(s / 60) % 60) + ':' + pad(Math.floor(s) % 60) + ':' + pad(f);
        for (var k = 0; k < tcs.length; k++) tcs[k].textContent = txt;
        requestAnimationFrame(tick);
      })(t0);
    }
  }

  /* ---- Bubbles in underwater frames ---- */
  if (!reduce) {
    var seas = document.querySelectorAll('.sc-sea');
    for (var s = 0; s < seas.length; s++) {
      for (var b = 0; b < 10; b++) {
        var el = document.createElement('span');
        el.className = 'bub';
        var sz = 4 + Math.random() * 10;
        el.style.width = el.style.height = sz + 'px';
        el.style.left = (15 + Math.random() * 70) + '%';
        el.style.animationDuration = (3 + Math.random() * 4) + 's';
        el.style.animationDelay = (-Math.random() * 6) + 's';
        seas[s].appendChild(el);
      }
    }
  }

  /* ---- Scrolling strips: always full. The track slides left by half its width, so it is two
   * identical halves; each half must be wider than the strip or a blank gap shows when it loops. */
  var fillBands = function () {
    document.querySelectorAll('.band .track').forEach(function (track) {
      track.querySelectorAll('.mq-clone').forEach(function (n) { n.remove(); });
      var spans = track.querySelectorAll(':scope > span');
      if (!spans.length) return;
      var one = spans[0], w = one.getBoundingClientRect().width;
      if (!w) return;
      var band = track.closest('.band');
      var need = Math.max(band.offsetWidth, window.innerWidth) * 1.25 + 200;   // extra for strips you tilted or moved
      var perHalf = Math.max(1, Math.ceil(need / w)), have = spans.length;
      // same speed as before: each half was one copy, so the loop takes perHalf times longer
      if (track.__base == null) track.__base = parseFloat(getComputedStyle(track).animationDuration) || 32;
      if (perHalf > 1) track.style.animationDuration = (track.__base * perHalf) + 's'; else track.style.removeProperty('animation-duration');
      for (var i = have; i < perHalf * 2; i++) {
        var c = one.cloneNode(true);
        c.classList.add('mq-clone'); c.setAttribute('aria-hidden', 'true');
        track.appendChild(c);
      }
    });
  };
  fillBands();
  var bandTimer;
  window.addEventListener('resize', function () { clearTimeout(bandTimer); bandTimer = setTimeout(fillBands, 200); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fillBands);

  /* ---- Reveal on scroll (only for things below the fold at load) ---- */
  if (!reduce && 'IntersectionObserver' in window) {
    var items = document.querySelectorAll('.reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.remove('pre'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    for (var r = 0; r < items.length; r++) {
      var rect = items[r].getBoundingClientRect();
      if (rect.top > window.innerHeight) { items[r].classList.add('pre'); io.observe(items[r]); }
    }
  }

  /* ---- Videos placed in frames ----
   * Play only while on screen; sound button for clips with audio.
   * A frame can hold several clips (data-playlist="a.mp4|b.mp4|c.mp4"): they play back to back
   * with no gap. Two video players take turns: while one plays, the next clip is loaded and
   * sitting on its first frame underneath, and they swap in the same screen refresh.
   */
  var vids = document.querySelectorAll('video.slot-media:not(.pl-buf)');
  {
    var ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>';
    var ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
    var players = [];
    var quiet = function (pr) { if (pr && pr.catch) pr.catch(function () {}); };
    var prime = function (el) {   // get the first frame decoded (iOS won't preload without a play)
      el.muted = true;
      var done = function () { el.pause(); try { el.currentTime = 0; } catch (e) {} };
      var pr = el.play();
      if (pr && pr.then) pr.then(done, function () {}); else done();
    };
    var Player = function (v) {
      var self = this;
      this.v = v; this.box = v.parentElement; this.active = v; this.buf = null; this.muted = true; this.inView = false;
      this.list = (v.getAttribute('data-playlist') || '').split('|').filter(Boolean);
      this.i = 0;
      v.muted = true;
      if (this.list.length > 1) {
        v.loop = false; v.removeAttribute('loop');
        if (v.getAttribute('src') !== this.list[0]) v.setAttribute('src', this.list[0]);
        var b = document.createElement('video');
        b.className = 'slot-media pl-buf pl-hide';
        b.setAttribute('aria-hidden', 'true');
        b.muted = true; b.playsInline = true; b.setAttribute('playsinline', ''); b.setAttribute('muted', ''); b.preload = 'auto';
        b.src = this.list[1];
        v.parentNode.insertBefore(b, v.nextSibling);
        this.buf = b;
        prime(b);
        [v, b].forEach(function (el) { el.addEventListener('ended', function () { if (el === self.active) self.next(); }); });
      }
    };
    Player.prototype.play = function () { this.inView = true; this.active.muted = this.muted; quiet(this.active.play()); };
    Player.prototype.pause = function () { this.inView = false; this.active.pause(); };
    Player.prototype.setMuted = function (m) { this.muted = m; this.active.muted = m; if (!m) quiet(this.active.play()); };
    Player.prototype.next = function () {
      var self = this, cur = this.active, nb = this.buf;
      var go = function () {
        nb.muted = self.muted;
        if (self.inView) quiet(nb.play());
        nb.classList.remove('pl-hide');      // same frame: next clip shows, current hides
        cur.classList.add('pl-hide');
        cur.muted = true;
        self.active = nb; self.buf = cur;
        self.i = (self.i + 1) % self.list.length;
        cur.src = self.list[(self.i + 1) % self.list.length];   // load the one after, underneath
        prime(cur);
      };
      if (nb.readyState >= 2) go();
      else nb.addEventListener('loadeddata', go, { once: true });   // until it's ready the last frame stays up (never black)
    };
    var vio = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var pl = en.target.__player;
        if (!pl) return;
        if (en.isIntersecting) { if (!reduce) pl.play(); }
        else pl.pause();
      });
    }, { threshold: 0.15 }) : null;
    var setupVideo = function (v) {
      var pl = new Player(v);
      players.push(pl);
      v.__player = pl;
      if (vio) vio.observe(v); else if (!reduce) pl.play();
      if (!v.hasAttribute('data-audio')) return pl;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sound-btn'; b.setAttribute('aria-label', 'Turn sound on'); b.innerHTML = ICON_OFF;
      var custom = v.getAttribute('data-sound-style');   // where / how big it was set in the editor's Layout mode
      if (custom) b.setAttribute('style', custom);
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var on = pl.muted;
        players.forEach(function (o) {
          if (o === pl || !o.v.isConnected) return;
          o.setMuted(true);
          var ob = o.box.querySelector('.sound-btn'); if (ob) { ob.innerHTML = ICON_OFF; ob.setAttribute('aria-label', 'Turn sound on'); }
        });
        pl.setMuted(!on);
        b.innerHTML = on ? ICON_ON : ICON_OFF;
        b.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
      });
      pl.box.appendChild(b);
      return pl;
    };
    // phones play the lighter copies in assets/uploads/phone/ (when there is one); computers keep full quality
    var isPhone = window.matchMedia && matchMedia('(max-width: 700px)').matches && !document.querySelector('script[data-m07-editor]');   // never inside the editor
    if (isPhone && vids.length && window.fetch) {
      vids.forEach(function (v) { v.__src = v.getAttribute('src'); v.removeAttribute('src'); v.load(); });   // don't start the big file
      fetch('assets/uploads/phone/list.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }).then(function (list) {
        var map = {};
        (list || []).forEach(function (e) { if (e && e.src && e.phone) map[e.src] = e.phone; });
        vids.forEach(function (v) {
          var pl = v.getAttribute('data-playlist');
          if (pl) v.setAttribute('data-playlist', pl.split('|').map(function (s) { return map[s] || s; }).join('|'));
          var src = map[v.__src] || v.__src;
          v.setAttribute('src', src);
          v.addEventListener('error', function back() { if (v.getAttribute('src') !== v.__src) { v.removeEventListener('error', back); v.setAttribute('src', v.__src); v.load(); } });
          setupVideo(v);
        });
      });
    } else vids.forEach(setupVideo);
    window.__m07Players = players;
    window.__m07SetupVideo = setupVideo;   // used by the local editor after placing clips
  }

  /* ---- Stats on video frames: keep their size relative to the frame (data-ref = frame width they were placed at) ---- */
  function fitStats(f) {
    var holder = f.querySelector('div.stat-overlay[data-ref], .views-badge[data-ref]');
    var ref = holder ? parseFloat(holder.getAttribute('data-ref')) : 0;
    if (!ref || !f.offsetWidth) { f.style.removeProperty('--stat-k'); return; }
    f.style.setProperty('--stat-k', Math.max(0.5, Math.min(1.8, f.offsetWidth / ref)).toFixed(3));
  }
  function fitAllStats() { document.querySelectorAll('.frame, .portrait').forEach(fitStats); }
  fitAllStats();
  if ('ResizeObserver' in window) {
    var sro = new ResizeObserver(function (es) { es.forEach(function (e) { fitStats(e.target); }); });
    document.querySelectorAll('.frame, .portrait').forEach(function (f) { sro.observe(f); });
    window.__m07FitStats = function (f) { if (f) { sro.observe(f); fitStats(f); } else fitAllStats(); };
  } else {
    window.addEventListener('resize', fitAllStats);
    window.__m07FitStats = function (f) { if (f) fitStats(f); else fitAllStats(); };
  }

  /* ---- Touch screens: play the hover effects as things scroll through the middle of the screen ---- */
  if (!reduce && window.matchMedia && matchMedia('(hover: none)').matches && 'IntersectionObserver' in window) {
    var hio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('in-focus', en.isIntersecting); });
    }, { rootMargin: '-30% 0px -30% 0px' });
    document.querySelectorAll('.collage, .zone, .zone-card, .svc, .use, .make-item, .tile, .g-item, .rate, .join, .btn-skew, .btn-pill, .clients span, .ind')
      .forEach(function (el) { hio.observe(el); });
  }

  /* ---- Work page filters ---- */
  var filters = document.querySelector('.filters');
  if (filters) {
    var tiles = document.querySelectorAll('.tile[data-cat]');
    filters.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter');
      if (!btn) return;
      var cat = btn.getAttribute('data-filter');
      filters.querySelectorAll('.filter').forEach(function (f) { f.setAttribute('aria-pressed', f === btn ? 'true' : 'false'); });
      tiles.forEach(function (tile) {
        var cats = tile.getAttribute('data-cat').split(' ');
        tile.classList.toggle('is-hidden', cat !== 'all' && cats.indexOf(cat) === -1);
      });
    });
  }

  /* ---- Copy buttons ---- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    var old = btn.textContent;
    function done(msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = old; }, 1600); }
    try {
      navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { done('Select & copy'); });
    } catch (err) { done('Select & copy'); }
  });

  /* ---- Service cards: the whole card opens its page (not while editing) ---- */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.svc');
    if (!card || doc.classList.contains('m07-editing')) return;
    if (e.target.closest('a, button, video, .slot-link')) return;
    var go = card.querySelector('a.go');
    if (go) location.href = go.getAttribute('href');
  });

  /* ---- Pricing: custom package builder ---- */
  var builder = document.getElementById('quote-form');
  function builderSummary() {
    if (!builder) return '';
    var parts = [];
    builder.querySelectorAll('.stepper').forEach(function (st) {
      var n = parseInt(st.querySelector('output').value, 10) || 0;
      st.classList.toggle('has', n > 0);
      if (n > 0) parts.push(n + ' ' + (n === 1 ? st.getAttribute('data-one') : st.getAttribute('data-many')));
    });
    var text = parts.length ? parts.join(', ') + ' per month' : '';
    var sum = builder.querySelector('.summary');
    if (sum) sum.textContent = text || 'Add what you need above. Your picks show up here.';
    return text;
  }
  if (builder) {
    builder.addEventListener('click', function (e) {
      var b = e.target.closest('[data-step]');
      if (!b) return;
      var out = b.closest('.stepper').querySelector('output');
      var v = Math.max(0, Math.min(99, (parseInt(out.value, 10) || 0) + parseInt(b.getAttribute('data-step'), 10)));
      out.value = v; out.textContent = v;
      builderSummary();
    });
    builderSummary();
  }
  // "Customize this plan" buttons prefill the builder
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-prefill]');
    if (!b || !builder) return;
    e.preventDefault();
    var vals = JSON.parse(b.getAttribute('data-prefill'));
    builder.querySelectorAll('.stepper').forEach(function (st) {
      var v = vals[st.getAttribute('data-key')] || 0, out = st.querySelector('output');
      out.value = v; out.textContent = v;
    });
    builderSummary();
    document.getElementById('custom').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  });

  /* ---- Lead forms (contact + custom quote) ---- */
  // Preselect a service from links like contact.html?s=drone
  try {
    var pre = new URLSearchParams(location.search).get('s');
    if (pre) pre.split(',').forEach(function (k) {
      var chip = document.querySelector('.lead-form .chip[data-key="' + k.replace(/[^a-z-]/g, '') + '"]');
      if (chip) chip.setAttribute('aria-pressed', 'true');
    });
  } catch (err) {}

  document.querySelectorAll('.lead-form').forEach(function (form) {
    var status = form.querySelector('.form-status');
    var EMAIL = form.getAttribute('data-email');
    var ENDPOINT = form.getAttribute('data-endpoint');
    var KIND = form.getAttribute('data-kind') || 'Inquiry';

    form.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      var grp = chip.parentElement;
      if (grp.hasAttribute('data-multi')) {
        chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      } else {
        grp.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
      }
    });
    function picked(group) {
      return Array.prototype.map.call(form.querySelectorAll('[data-group="' + group + '"] [aria-pressed="true"]'), function (c) { return c.getAttribute('data-v'); });
    }
    function setStatus(cls, html) { status.className = 'form-status ' + cls; status.innerHTML = html; }
    function val(n) { var el = form.elements[n]; return el ? String(el.value || '').trim() : ''; }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (val('_honey')) return; // bot
      var name = val('name'), email = val('email'), phone = val('phone');
      var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), phoneOk = phone.replace(/\D/g, '').length >= 7;
      if (!name) { setStatus('err', 'Add your name.'); form.elements.name.focus(); return; }
      if (!emailOk && !phoneOk) { setStatus('err', 'Add a phone number or an email so we can reach you.'); (form.elements.phone || form.elements.email).focus(); return; }
      var consent = form.elements.consent;
      if (consent && !consent.checked) { setStatus('err', 'Check the box so we have your permission to contact you.'); consent.focus(); return; }
      var pkg = form === builder ? builderSummary() : '';
      if (form === builder && !pkg) { setStatus('err', 'Pick at least one thing for your package.'); return; }
      var data = {
        type: KIND,
        name: name, email: email, phone: phone,
        business: val('business'),
        services: picked('svc').join(', ') || '',
        package: pkg,
        timeline: picked('time')[0] || '',
        message: val('message'),
        page: location.pathname,
        consent: consent ? 'YES: ' + consent.closest('label').textContent.replace(/\s+/g, ' ').trim() : '',
        consent_time: new Date().toString(),
        _subject: KIND + ': ' + (val('business') || name),
        _template: 'table'
      };
      Object.keys(data).forEach(function (k) { if (data[k] === '') delete data[k]; });
      var body = Object.keys(data).filter(function (k) { return k.charAt(0) !== '_'; }).map(function (k) { return k + ': ' + data[k]; }).join('\n');
      var mailto = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(data._subject) + '&body=' + encodeURIComponent(body);
      var fallback = 'If that didn’t work, <a href="' + mailto + '">email us directly</a> at ' + EMAIL + '.';
      var submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      setStatus('', 'Sending…');
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(data) })
        .then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); })
        .then(function (r) {
          if (r.ok && (r.j.success === true || r.j.success === 'true')) {
            setStatus('ok', 'Sent. We’ll reach out soon' + (form === builder ? ' to talk through your package.' : '.'));
            form.reset();
            form.querySelectorAll('.chip[aria-pressed="true"]').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
          } else {
            setStatus('err', 'The form couldn’t send right now. ' + fallback);
          }
        })
        .catch(function () { setStatus('err', 'The form couldn’t send right now. ' + fallback); })
        .finally(function () { submit.disabled = false; });
    });
  });
})();

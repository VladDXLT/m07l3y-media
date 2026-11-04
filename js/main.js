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

  /* ---- Videos placed in frames: play only while on screen, sound button for clips with audio ---- */
  var vids = document.querySelectorAll('video.slot-media');
  if (vids.length) {
    var ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>';
    var ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
    vids.forEach(function (v) {
      v.muted = true;
      if (!v.hasAttribute('data-audio')) return;
      var box = v.parentElement;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sound-btn'; b.setAttribute('aria-label', 'Turn sound on'); b.innerHTML = ICON_OFF;
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var on = v.muted;
        document.querySelectorAll('video.slot-media').forEach(function (o) { if (o !== v) { o.muted = true; var ob = o.parentElement.querySelector('.sound-btn'); if (ob) { ob.innerHTML = ICON_OFF; ob.setAttribute('aria-label', 'Turn sound on'); } } });
        v.muted = !on;
        if (on) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        b.innerHTML = on ? ICON_ON : ICON_OFF;
        b.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
      });
      box.appendChild(b);
    });
    if ('IntersectionObserver' in window) {
      var vio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var v = en.target;
          if (en.isIntersecting) { if (!reduce) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } }
          else v.pause();
        });
      }, { threshold: 0.15 });
      vids.forEach(function (v) { vio.observe(v); });
    }
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

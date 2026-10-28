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

  /* ---- Contact form ---- */
  var form = document.getElementById('contact-form');
  if (form) {
    var status = document.getElementById('form-status');
    var EMAIL = form.getAttribute('data-email');
    var ENDPOINT = form.getAttribute('data-endpoint');

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

    // Preselect a service from links like contact.html?s=drone
    try {
      var pre = new URLSearchParams(location.search).get('s');
      if (pre) {
        var chip = form.querySelector('.chip[data-key="' + pre.replace(/[^a-z-]/g, '') + '"]');
        if (chip) chip.setAttribute('aria-pressed', 'true');
      }
    } catch (err) {}

    function picked(group) {
      return Array.prototype.map.call(
        form.querySelectorAll('[data-group="' + group + '"] [aria-pressed="true"]'),
        function (c) { return c.getAttribute('data-v'); }
      );
    }
    function setStatus(cls, html) { status.className = 'form-status ' + cls; status.innerHTML = html; }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.querySelector('[name="_honey"]').value) return; // bot
      var name = form.name.value.trim(), email = form.email.value.trim();
      if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setStatus('err', 'Add your name and a valid email so we can get back to you.');
        (name ? form.email : form.name).focus();
        return;
      }
      var data = {
        name: name,
        email: email,
        phone: form.phone.value.trim(),
        business: form.business.value.trim(),
        services: picked('svc').join(', ') || 'Not sure yet',
        timeline: picked('time')[0] || 'Not set',
        message: form.message.value.trim(),
        _subject: 'New shoot inquiry: ' + (form.business.value.trim() || name),
        _template: 'table'
      };
      var body = 'Name: ' + data.name + '\nEmail: ' + data.email + '\nPhone: ' + data.phone +
        '\nBusiness: ' + data.business + '\nServices: ' + data.services +
        '\nTimeline: ' + data.timeline + '\n\n' + data.message;
      var mailto = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(data._subject) + '&body=' + encodeURIComponent(body);
      var fallback = 'If that didn’t work, <a href="' + mailto + '">email us directly</a> at ' + EMAIL + '.';

      var submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      setStatus('', 'Sending…');

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (res) { return res.json().then(function (j) { return { ok: res.ok, j: j }; }); })
        .then(function (r) {
          if (r.ok && (r.j.success === true || r.j.success === 'true')) {
            setStatus('ok', 'Sent. We’ll get back to you soon at ' + email.replace(/</g, '') + '.');
            form.reset();
          } else {
            setStatus('err', 'The form couldn’t send right now. ' + fallback);
          }
        })
        .catch(function () { setStatus('err', 'The form couldn’t send right now. ' + fallback); })
        .finally(function () { submit.disabled = false; });
    });
  }
})();

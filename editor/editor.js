/*
 * M07L3Y Media — in-page editor (loaded only by editor/server.mjs, never on the public site)
 *
 * Click any text to edit it. Toolbar: bold / italic / underline / strike, size, alignment,
 * text box width (or drag the pink handle), brand colors, clear formatting.
 * Drag images or videos from Finder (or the Media drawer) onto any frame or photo spot.
 * Cmd+S saves straight into the page's .html file.
 */
(function () {
  'use strict';
  if (window.__m07Editor) return;
  window.__m07Editor = true;

  /* ------------------------------------------------------------------ setup */
  var PAGE = (function () {
    var p = decodeURIComponent(location.pathname).replace(/^\/+/, '');
    if (!p || /\/$/.test(p)) p += 'index.html';
    p = p.split('/').pop();
    if (!/\.html$/.test(p)) p += '.html';
    return p;
  })();

  // Snapshot of the untouched page structure, taken before the site's own scripts run.
  var LIVE = Array.prototype.filter.call(document.getElementsByTagName('*'), function (el) {
    return !el.hasAttribute('data-m07-editor');
  });

  var ORIGINAL = null;        // the page's HTML exactly as it is on disk
  var ready = false;
  var dirty = new Map();      // element -> Set('html' | 'style' | 'class')
  var changeCount = 0, savedCount = 0;
  var editing = true;
  var active = null;          // block currently being edited
  var selectedSlot = null;
  var blocks = [], slots = [];

  var INLINE = { A:1, ABBR:1, B:1, BR:1, CODE:1, EM:1, I:1, MARK:1, S:1, SMALL:1, SPAN:1, STRONG:1, SUB:1, SUP:1, U:1, DEL:1, INS:1, Q:1, TIME:1, FONT:1, LABEL:1, STRIKE:1 };
  var SKIP = 'script,style,noscript,svg,canvas,video,img,iframe,input,textarea,select,option,template,.hud,.scene,.logo,.foot-logo,.burger,.bands,.collage,[aria-hidden="true"],#chat-root,.m07-ui,.hp,.tc';
  var SWATCHES = [['White', 'var(--fg)'], ['Grey', 'var(--muted)'], ['Purple', 'var(--purple)'], ['Pink', 'var(--pink)'], ['Teal', 'var(--teal)'], ['Black', 'var(--ink)']];
  var WIDTHS = [['Auto', ''], ['Narrow', '24ch'], ['Medium', '40ch'], ['Wide', '60ch'], ['Full', '100%']];

  /* ------------------------------------------------------------------ find editable text + media spots */
  function hasText(el) { return /\S/.test(el.textContent); }
  function inlineOnly(el) {
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (!INLINE[c.tagName] || c.matches(SKIP) || !inlineOnly(c)) return false;
    }
    return true;
  }
  function findBlocks(root) {
    for (var i = 0; i < root.children.length; i++) {
      var el = root.children[i];
      if (el.matches(SKIP)) continue;
      if (hasText(el) && inlineOnly(el)) blocks.push(el);
      else findBlocks(el);
    }
  }
  findBlocks(document.body);
  blocks.forEach(function (b) { b.classList.add('m07-block'); });
  slots = Array.prototype.slice.call(document.querySelectorAll('.frame, .portrait'));
  slots.forEach(function (s) { s.classList.add('m07-slot'); });

  /* ------------------------------------------------------------------ load the on-disk page and line it up */
  fetch('/__editor/raw?page=' + encodeURIComponent(PAGE), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('Could not read ' + PAGE); return r.text(); })
    .then(function (raw) {
      ORIGINAL = raw;
      var pristine = new DOMParser().parseFromString(raw, 'text/html').getElementsByTagName('*');
      var j = 0;
      for (var i = 0; i < LIVE.length; i++) {
        if (j < pristine.length && LIVE[i].tagName === pristine[j].tagName) { LIVE[i].__pid = j; j++; }
      }
      if (j !== pristine.length) throw new Error('This page changed on disk. Reload it before editing.');
      ready = true;
      status('Ready. Click any text to edit.');
    })
    .catch(function (err) { status(err.message, 'err'); });

  /* ------------------------------------------------------------------ toolbar */
  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    for (var k in (attrs || {})) el.setAttribute(k, attrs[k]);
    if (html != null) el.innerHTML = html;
    return el;
  }
  var bar = h('div', { class: 'm07-ui m07-bar', role: 'toolbar', 'aria-label': 'Site editor' });
  bar.innerHTML =
    '<div class="m07-row">' +
      '<span class="m07-brand"><i class="m07-dot"></i>Editor</span>' +
      '<button type="button" data-act="mode" class="m07-mode" title="Switch between editing and previewing (links work in preview)">Editing</button>' +
      '<select class="m07-pages" title="Go to page"></select>' +
      '<span class="m07-sep"></span>' +
      '<div class="m07-text">' +
        '<button type="button" data-act="bold" title="Bold (Cmd+B)"><b>B</b></button>' +
        '<button type="button" data-act="italic" title="Italic (Cmd+I)"><i>I</i></button>' +
        '<button type="button" data-act="underline" title="Underline (Cmd+U)"><u>U</u></button>' +
        '<button type="button" data-act="strikeThrough" title="Strikethrough"><s>S</s></button>' +
        '<span class="m07-sep"></span>' +
        '<button type="button" data-act="smaller" title="Smaller">A&minus;</button>' +
        '<span class="m07-size" title="Text size">100%</span>' +
        '<button type="button" data-act="bigger" title="Bigger">A+</button>' +
        '<span class="m07-sep"></span>' +
        '<button type="button" data-act="align" data-v="left" title="Align left">' + icoAlign('l') + '</button>' +
        '<button type="button" data-act="align" data-v="center" title="Center">' + icoAlign('c') + '</button>' +
        '<button type="button" data-act="align" data-v="right" title="Align right">' + icoAlign('r') + '</button>' +
        '<button type="button" data-act="align" data-v="justify" title="Justify">' + icoAlign('j') + '</button>' +
        '<span class="m07-sep"></span>' +
        '<select class="m07-width" title="Text box width (or drag the pink handle on the box)">' +
          WIDTHS.map(function (w) { return '<option value="' + w[1] + '">Box: ' + w[0] + '</option>'; }).join('') +
        '</select>' +
        '<span class="m07-swatches">' +
          SWATCHES.map(function (s) { return '<button type="button" data-act="color" data-v="' + s[1] + '" title="' + s[0] + '" style="--sw:' + s[1] + '"></button>'; }).join('') +
        '</span>' +
        '<button type="button" data-act="clear" title="Remove all formatting from this text">Clear</button>' +
      '</div>' +
      '<span class="m07-sep"></span>' +
      '<button type="button" data-act="media" title="Upload and place images or videos">Media</button>' +
      '<button type="button" data-act="undo" title="Undo (Cmd+Z)">Undo</button>' +
      '<span class="m07-status" role="status" aria-live="polite">Loading&hellip;</span>' +
      '<button type="button" data-act="save" class="m07-save" title="Save to the website files (Cmd+S)">Save</button>' +
      '<button type="button" data-act="collapse" class="m07-collapse" title="Hide toolbar">&#8211;</button>' +
    '</div>';
  function icoAlign(k) {
    var rows = { l: [14, 9, 12, 7], c: [14, 9, 12, 7], r: [14, 9, 12, 7], j: [14, 14, 14, 14] }[k];
    return '<svg viewBox="0 0 16 14" width="16" height="14" aria-hidden="true">' + rows.map(function (w, i) {
      var x = k === 'c' ? (16 - w) / 2 : k === 'r' ? 16 - w : 1;
      return '<rect x="' + x + '" y="' + (1 + i * 3.4) + '" width="' + w + '" height="1.8" rx=".9" fill="currentColor"/>';
    }).join('') + '</svg>';
  }

  var drawer = h('div', { class: 'm07-ui m07-drawer', hidden: '' });
  drawer.innerHTML =
    '<div class="m07-drawer-head"><b>Your media</b>' +
    '<span>Drag onto any frame or photo spot, or click a frame and then a file.</span>' +
    '<label class="m07-upload">Upload<input type="file" accept="image/*,video/*" multiple hidden></label></div>' +
    '<div class="m07-grid"><p class="m07-empty">No uploads yet. Click Upload or drop files here.</p></div>';

  var handle = h('div', { class: 'm07-ui m07-handle', hidden: '', title: 'Drag to resize this text box' }, '<span></span>');
  var slotBar = h('div', { class: 'm07-ui m07-slotbar', hidden: '' },
    '<button type="button" data-slot="replace">Replace</button><button type="button" data-slot="hud">HUD</button><button type="button" data-slot="remove">Remove</button>');
  var pill = h('button', { class: 'm07-ui m07-pill', type: 'button', hidden: '' }, '<i class="m07-dot"></i>Editor');
  var picker = h('input', { type: 'file', accept: 'image/*,video/*', hidden: '' });
  picker.className = 'm07-ui';

  function mountUI() {
    [bar, drawer, handle, slotBar, pill, picker].forEach(function (el) { document.body.appendChild(el); });
    document.documentElement.classList.add('m07-on');
    // pages list
    fetch('/__editor/pages').then(function (r) { return r.json(); }).then(function (d) {
      var sel = bar.querySelector('.m07-pages');
      sel.innerHTML = d.pages.map(function (p) { return '<option' + (p === PAGE ? ' selected' : '') + '>' + p + '</option>'; }).join('');
    });
    setEditing(readPref('mode') !== 'preview');
    if (readPref('collapsed') === '1') collapse(true);
    updateTools();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountUI); else mountUI();

  function readPref(k) { try { return localStorage.getItem('m07ed-' + k); } catch (e) { return null; } }
  function writePref(k, v) { try { localStorage.setItem('m07ed-' + k, v); } catch (e) {} }

  /* ------------------------------------------------------------------ status + dirty tracking */
  var statusTimer;
  function status(msg, kind) {
    var el = bar.querySelector('.m07-status');
    el.textContent = msg;
    el.className = 'm07-status' + (kind ? ' ' + kind : '');
    clearTimeout(statusTimer);
    pill.classList.toggle('unsaved', changeCount !== savedCount);
  }
  function refreshStatus() {
    var n = changeCount - savedCount;
    if (!ready) return;
    status(n ? 'Unsaved changes' : 'All changes saved', n ? 'warn' : '');
    bar.querySelector('.m07-save').classList.toggle('hot', !!n);
  }
  function markDirty(el, kind) {
    if (el.__pid == null) { status('This spot was added by a script and cannot be saved.', 'err'); return; }
    if (!dirty.has(el)) dirty.set(el, new Set());
    dirty.get(el).add(kind);
    changeCount++;
    refreshStatus();
  }

  /* ------------------------------------------------------------------ edit / preview mode */
  function setEditing(on) {
    editing = on;
    document.documentElement.classList.toggle('m07-editing', on);
    var btn = bar.querySelector('.m07-mode');
    btn.textContent = on ? 'Editing' : 'Preview';
    btn.classList.toggle('on', on);
    if (!on) { deactivate(); selectSlot(null); hideSlotBar(); }
    // open FAQ answers so they can be edited
    document.querySelectorAll('details').forEach(function (d) { if (on) { d.__wasOpen = d.open; d.open = true; } else if (d.__wasOpen === false) d.open = false; });
    writePref('mode', on ? 'edit' : 'preview');
  }
  function collapse(yes) {
    bar.hidden = yes; pill.hidden = !yes; if (yes) drawer.hidden = true;
    writePref('collapsed', yes ? '1' : '0');
  }

  /* ------------------------------------------------------------------ activating a text block */
  function activate(block) {
    if (active === block) return;
    deactivate();
    active = block;
    block.setAttribute('contenteditable', 'true');
    block.classList.add('m07-active');
    block.__before = block.innerHTML;
    selectSlot(null);
    updateTools();
    trackHandle();
  }
  function deactivate() {
    if (!active) return;
    active.removeAttribute('contenteditable');
    active.classList.remove('m07-active');
    active = null;
    handle.hidden = true;
    updateTools();
  }
  function updateTools() {
    bar.querySelector('.m07-text').classList.toggle('off', !active);
    if (!active) { bar.querySelector('.m07-size').textContent = '100%'; return; }
    var z = parseFloat(active.style.zoom) || 1;
    bar.querySelector('.m07-size').textContent = Math.round(z * 100) + '%';
    var sel = bar.querySelector('.m07-width');
    var w = active.style.maxWidth === 'none' && active.style.width === '100%' ? '100%' : active.style.maxWidth;
    sel.value = WIDTHS.some(function (x) { return x[1] === w; }) ? w : '';
    var al = active.style.textAlign;
    bar.querySelectorAll('[data-act="align"]').forEach(function (b) { b.classList.toggle('on', b.dataset.v === al); });
  }

  // Click handling (capture phase so it runs before the site's own scripts)
  document.addEventListener('mousedown', function (e) {
    if (!editing || e.target.closest('.m07-ui')) return;
    var block = e.target.closest('.m07-block');
    if (block) { activate(block); return; }
    var slot = e.target.closest('.m07-slot');
    deactivate();
    selectSlot(slot || null);
  }, true);

  document.addEventListener('click', function (e) {
    if (!editing || e.target.closest('.m07-ui')) return;
    var link = e.target.closest('a[href]');
    if (link && !link.closest('.logo, .foot-logo') && !(e.metaKey || e.ctrlKey)) e.preventDefault();
    if (e.target.closest('summary')) e.preventDefault();
  }, true);
  document.addEventListener('submit', function (e) { if (editing) { e.preventDefault(); e.stopImmediatePropagation(); status('Forms are off while editing.'); } }, true);

  document.addEventListener('input', function (e) {
    if (active && active.contains(e.target)) markDirty(active, 'html');
  }, true);
  document.addEventListener('paste', function (e) {
    if (!active || !active.contains(e.target)) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }, true);
  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
    if (!active || !active.contains(e.target)) return;
    if (e.key === 'Escape') { deactivate(); return; }
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); markDirty(active, 'html'); return; }
    if (e.key === ' ' && active.tagName === 'BUTTON') { e.preventDefault(); document.execCommand('insertText', false, ' '); return; }
    if (mod && ['b', 'i', 'u'].indexOf(e.key.toLowerCase()) > -1) {
      e.preventDefault();
      format({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]);
    }
  }, true);

  /* ------------------------------------------------------------------ formatting */
  function selectionInActive() {
    var s = window.getSelection();
    if (!active || !s.rangeCount) return null;
    var r = s.getRangeAt(0);
    return active.contains(r.commonAncestorContainer) ? r : null;
  }
  function withWholeBlock(fn) {
    var r = selectionInActive();
    var whole = !r || r.collapsed;
    var s = window.getSelection();
    if (whole) { var all = document.createRange(); all.selectNodeContents(active); s.removeAllRanges(); s.addRange(all); }
    fn(!whole);
    if (whole) s.collapseToEnd();
  }
  function exec(cmd, val) {
    active.focus({ preventScroll: true });
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, val);
  }
  function format(cmd) {
    if (!active) return;
    withWholeBlock(function () { exec(cmd); });
    markDirty(active, 'html');
  }
  function resize(step) {
    if (!active) return;
    var r = selectionInActive();
    if (r && !r.collapsed) {
      exec('fontSize', '7');
      active.querySelectorAll('[style*="xxx-large"], font[size="7"]').forEach(function (el) {
        var span = el;
        if (el.tagName === 'FONT') { span = document.createElement('span'); span.innerHTML = el.innerHTML; el.replaceWith(span); }
        span.style.fontSize = (step > 0 ? 1.15 : 0.87) + 'em';
      });
      markDirty(active, 'html');
    } else {
      var z = Math.round(((parseFloat(active.style.zoom) || 1) + step * 0.1) * 100) / 100;
      z = Math.min(4, Math.max(0.4, z));
      active.style.zoom = z === 1 ? '' : String(z);
      markDirty(active, 'style');
    }
    updateTools(); trackHandle();
  }
  function align(v) {
    if (!active) return;
    var same = active.style.textAlign === v;
    active.style.textAlign = same ? '' : v;
    // also move the box itself when it is narrower than its column
    var cs = getComputedStyle(active), pcs = getComputedStyle(active.parentElement);
    var flowBox = (cs.display === 'block' || cs.display === 'list-item') && !/flex|grid/.test(pcs.display);
    if (flowBox) {
      active.style.marginLeft = !same && (v === 'center' || v === 'right') ? 'auto' : '';
      active.style.marginRight = !same && v === 'center' ? 'auto' : '';
    }
    markDirty(active, 'style'); updateTools();
  }
  function setWidth(v) {
    if (!active) return;
    var cs = getComputedStyle(active);
    if (cs.display === 'inline') active.style.display = 'inline-block';
    if (v === '100%') { active.style.width = '100%'; active.style.maxWidth = 'none'; }
    else { active.style.width = ''; active.style.maxWidth = v; }
    if (!v && active.style.display === 'inline-block') active.style.display = '';
    markDirty(active, 'style'); trackHandle();
  }
  function color(v) {
    if (!active) return;
    var r = selectionInActive();
    if (r && !r.collapsed) {
      exec('foreColor', '#000001');
      active.querySelectorAll('[style]').forEach(function (el) {
        if (/rgb\(0,\s*0,\s*1\)|#000001/i.test(el.getAttribute('style'))) el.style.color = v;
      });
      active.querySelectorAll('font[color]').forEach(function (f) { var s = document.createElement('span'); s.style.color = v; s.innerHTML = f.innerHTML; f.replaceWith(s); });
      markDirty(active, 'html');
    } else {
      active.style.color = active.style.color === v ? '' : v;
      markDirty(active, 'style');
    }
  }
  function clearFormatting() {
    if (!active) return;
    withWholeBlock(function () { exec('removeFormat'); });
    // unwrap plain styled spans the toolbar created (keep the site's own classed spans)
    active.querySelectorAll('span[style]:not([class]), font').forEach(function (el) {
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
      el.remove();
    });
    active.querySelectorAll('[style]').forEach(function (el) { el.removeAttribute('style'); });
    active.removeAttribute('style');
    markDirty(active, 'html'); markDirty(active, 'style');
    updateTools(); trackHandle();
  }

  // toolbar buttons keep the text selection (mousedown would steal it)
  bar.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act;
    if (act === 'bold' || act === 'italic' || act === 'underline' || act === 'strikeThrough') format(act);
    else if (act === 'smaller') resize(-1);
    else if (act === 'bigger') resize(1);
    else if (act === 'align') align(b.dataset.v);
    else if (act === 'color') color(b.dataset.v);
    else if (act === 'clear') clearFormatting();
    else if (act === 'mode') setEditing(!editing);
    else if (act === 'media') toggleDrawer();
    else if (act === 'undo') { if (active) { active.focus(); document.execCommand('undo'); markDirty(active, 'html'); } else status('Click into the text you want to undo.'); }
    else if (act === 'save') save();
    else if (act === 'collapse') collapse(true);
  });
  pill.addEventListener('click', function () { collapse(false); });
  bar.querySelector('.m07-width').addEventListener('change', function (e) { setWidth(e.target.value); });
  bar.querySelector('.m07-pages').addEventListener('change', function (e) {
    if (changeCount !== savedCount && !confirm('You have unsaved changes on this page. Leave without saving?')) { e.target.value = PAGE; return; }
    savedCount = changeCount; // skip the leave warning
    location.href = '/' + e.target.value;
  });

  /* ------------------------------------------------------------------ text box resize handle */
  var raf;
  function trackHandle() {
    cancelAnimationFrame(raf);
    if (!active || !editing) { handle.hidden = true; return; }
    var r = active.getBoundingClientRect();
    handle.hidden = false;
    handle.style.left = (r.right + 4) + 'px';
    handle.style.top = (r.top + r.height / 2 - 14) + 'px';
    raf = requestAnimationFrame(trackHandle);
  }
  handle.addEventListener('pointerdown', function (e) {
    if (!active) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    var left = active.getBoundingClientRect().left;
    if (getComputedStyle(active).display === 'inline') active.style.display = 'inline-block';
    function move(ev) {
      var w = Math.max(40, Math.round(ev.clientX - left));
      active.style.width = w + 'px';
      active.style.maxWidth = '100%';
      handle.firstChild.textContent = w + 'px';
    }
    function up() {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.firstChild.textContent = '';
      markDirty(active, 'style'); updateTools();
    }
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });

  /* ------------------------------------------------------------------ media: frames and photo spots */
  function isVideo(src) { return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(src); }
  function selectSlot(slot) {
    if (selectedSlot) selectedSlot.classList.remove('m07-slot-selected');
    selectedSlot = slot;
    if (slot) { slot.classList.add('m07-slot-selected'); showSlotBar(slot); status('Frame selected. Drop a file on it, or pick one in Media.'); }
  }
  function placeMedia(slot, src) {
    if (!slot.__orig) slot.__orig = slot.innerHTML;
    var media;
    if (isVideo(src)) {
      media = document.createElement('video');
      ['autoplay', 'muted', 'loop', 'playsinline'].forEach(function (a) { media.setAttribute(a, ''); });
      media.setAttribute('preload', 'metadata');
      media.muted = true;
    } else {
      media = document.createElement('img');
      media.setAttribute('alt', '');
      media.setAttribute('loading', 'lazy');
    }
    media.className = 'slot-media';
    media.setAttribute('src', src);
    Array.prototype.slice.call(slot.children).forEach(function (c) {
      if (!c.classList.contains('hud') && !c.classList.contains('m07-ui')) c.remove();
    });
    slot.insertBefore(media, slot.firstChild);
    if (media.play) { var p = media.play(); if (p && p.catch) p.catch(function () {}); }
    markDirty(slot, 'html');
    status('Placed ' + src.split('/').pop() + '. Save to keep it.', 'warn');
  }
  function showSlotBar(slot) {
    if (!editing) return;
    var r = slot.getBoundingClientRect();
    slotBar.hidden = false;
    slotBar.style.left = Math.max(8, r.right - slotBar.offsetWidth - 8) + 'px';
    slotBar.style.top = Math.max(8, r.top + 8) + 'px';
    slotBar.__slot = slot;
    slotBar.querySelector('[data-slot="hud"]').hidden = !slot.querySelector('.hud');
    slotBar.querySelector('[data-slot="remove"]').hidden = !slot.querySelector('.slot-media');
  }
  function hideSlotBar() { slotBar.hidden = true; slotBar.__slot = null; }
  document.addEventListener('mouseover', function (e) {
    if (!editing || e.target.closest('.m07-ui')) return;
    var slot = e.target.closest('.m07-slot');
    if (slot) showSlotBar(slot); else if (!selectedSlot) hideSlotBar();
  });
  window.addEventListener('scroll', function () { if (slotBar.__slot) showSlotBar(slotBar.__slot); }, { passive: true });
  slotBar.addEventListener('mousedown', function (e) { e.preventDefault(); });
  slotBar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-slot]'), slot = slotBar.__slot;
    if (!b || !slot) return;
    if (b.dataset.slot === 'replace') { picker.__slot = slot; picker.click(); }
    if (b.dataset.slot === 'hud') { slot.classList.toggle('no-hud'); markDirty(slot, 'class'); }
    if (b.dataset.slot === 'remove') {
      if (slot.__orig) { slot.innerHTML = slot.__orig; slot.__orig = null; }
      else { var m = slot.querySelector('.slot-media'); if (m) m.remove(); }
      markDirty(slot, 'html'); showSlotBar(slot);
    }
  });
  picker.addEventListener('change', function () {
    var f = picker.files[0], slot = picker.__slot;
    picker.value = '';
    if (f && slot) upload(f).then(function (d) { if (d) placeMedia(slot, d.src); });
  });

  function upload(file) {
    var mb = file.size / 1048576;
    if (mb > 95) { status(file.name + ' is ' + mb.toFixed(0) + ' MB. GitHub only accepts files under 100 MB, so compress it first.', 'err'); return Promise.resolve(null); }
    status('Uploading ' + file.name + '…');
    return fetch('/__editor/upload?name=' + encodeURIComponent(file.name), { method: 'POST', body: file })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'Upload failed');
        status('Uploaded ' + d.name + (mb > 40 ? ' (large file, consider compressing)' : ''), mb > 40 ? 'warn' : '');
        loadLibrary();
        return d;
      })
      .catch(function (err) { status(err.message, 'err'); return null; });
  }

  // drag & drop from Finder or the Media drawer
  var dropTarget = null;
  function setDrop(el) {
    if (dropTarget === el) return;
    if (dropTarget) dropTarget.classList.remove('m07-drop');
    dropTarget = el;
    if (el) el.classList.add('m07-drop');
  }
  document.addEventListener('dragover', function (e) {
    var types = Array.prototype.slice.call(e.dataTransfer.types || []);
    if (types.indexOf('Files') < 0 && types.indexOf('text/m07-src') < 0) return;
    var slot = e.target.closest && e.target.closest('.m07-slot');
    var inDrawer = e.target.closest && e.target.closest('.m07-drawer');
    if (slot || inDrawer) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    else e.preventDefault(); // stop the browser from opening the file
    setDrop(slot || (inDrawer ? drawer : null));
  });
  document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) setDrop(null); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    var slot = e.target.closest && e.target.closest('.m07-slot');
    var inDrawer = e.target.closest && e.target.closest('.m07-drawer');
    setDrop(null);
    var src = e.dataTransfer.getData('text/m07-src');
    var files = Array.prototype.slice.call(e.dataTransfer.files || []);
    if (slot && src) { placeMedia(slot, src); return; }
    if (slot && files.length) { upload(files[0]).then(function (d) { if (d) placeMedia(slot, d.src); }); files.slice(1).forEach(upload); return; }
    if (inDrawer && files.length) files.forEach(upload);
    else if (files.length) status('Drop files onto a frame or photo spot, or into the Media drawer.');
  });

  /* ------------------------------------------------------------------ media drawer */
  function toggleDrawer() {
    drawer.hidden = !drawer.hidden;
    if (!drawer.hidden) loadLibrary();
  }
  function loadLibrary() {
    fetch('/__editor/media', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      var grid = drawer.querySelector('.m07-grid');
      if (!d.files.length) { grid.innerHTML = '<p class="m07-empty">No uploads yet. Click Upload or drop files here.</p>'; return; }
      grid.innerHTML = d.files.map(function (f) {
        var thumb = f.video ? '<video src="/' + f.src + '#t=0.5" muted preload="metadata"></video>' : '<img src="/' + f.src + '" alt="" loading="lazy">';
        return '<button type="button" class="m07-thumb" draggable="true" data-src="' + f.src + '" title="' + f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)">' + thumb +
          '<span>' + (f.video ? 'Video' : 'Image') + '</span></button>';
      }).join('');
    });
  }
  drawer.addEventListener('dragstart', function (e) {
    var t = e.target.closest('.m07-thumb');
    if (!t) return;
    e.dataTransfer.setData('text/m07-src', t.dataset.src);
    e.dataTransfer.effectAllowed = 'copy';
  });
  drawer.addEventListener('click', function (e) {
    var t = e.target.closest('.m07-thumb');
    if (!t) return;
    if (selectedSlot) placeMedia(selectedSlot, t.dataset.src);
    else status('Click a frame on the page first, or drag this file onto one.');
  });
  drawer.querySelector('input[type=file]').addEventListener('change', function (e) {
    Array.prototype.slice.call(e.target.files).forEach(upload);
    e.target.value = '';
  });

  /* ------------------------------------------------------------------ save */
  function cleanInner(el) {
    var c = el.cloneNode(true);
    c.querySelectorAll('.m07-ui, .bub').forEach(function (n) { n.remove(); });
    c.querySelectorAll('.tc').forEach(function (n) { n.textContent = '00:00:00:00'; });
    c.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    c.querySelectorAll('[class]').forEach(function (n) {
      var keep = n.className.split(/\s+/).filter(function (t) { return t && !/^m07-/.test(t) && t !== 'pre' && t !== 'is-hidden'; });
      if (keep.length) n.className = keep.join(' '); else n.removeAttribute('class');
    });
    c.querySelectorAll('video.slot-media').forEach(function (v) { v.removeAttribute('style'); });
    return c.innerHTML;
  }
  function cleanClass(el) {
    return el.className.split(/\s+/).filter(function (t) { return t && !/^m07-/.test(t) && t !== 'pre' && t !== 'is-hidden' && t !== 'open'; }).join(' ');
  }
  var saving = false;
  function save() {
    if (!ready) { status('Still loading, try again in a second.', 'warn'); return; }
    if (changeCount === savedCount) { status('Nothing new to save.'); return; }
    if (saving) return;
    saving = true;
    status('Saving…');
    var countAtSave = changeCount;
    var doc = new DOMParser().parseFromString(ORIGINAL, 'text/html');
    var pristine = doc.getElementsByTagName('*');
    var jobs = [];
    dirty.forEach(function (kinds, el) { jobs.push({ el: el, kinds: kinds, p: pristine[el.__pid] }); });
    try {
      jobs.forEach(function (j) {
        if (!j.p || j.p.tagName !== j.el.tagName) throw new Error('Could not match an edited element. Reload the page and try again.');
      });
      jobs.forEach(function (j) {
        if (j.kinds.has('html')) j.p.innerHTML = cleanInner(j.el);
        if (j.kinds.has('style')) { var st = j.el.getAttribute('style'); if (st && st.trim()) j.p.setAttribute('style', st); else j.p.removeAttribute('style'); }
        if (j.kinds.has('class')) { var cl = cleanClass(j.el); if (cl) j.p.className = cl; else j.p.removeAttribute('class'); }
      });
    } catch (err) { saving = false; status(err.message, 'err'); return; }
    var html = '<!doctype html>\n' + doc.documentElement.outerHTML + '\n';
    fetch('/__editor/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: PAGE, html: html }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        saving = false;
        if (!d.ok) throw new Error(d.error || 'Save failed');
        savedCount = countAtSave;
        refreshStatus();
        if (changeCount === savedCount) {
          var t = new Date();
          status('Saved to ' + PAGE + ' at ' + t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
        }
      })
      .catch(function (err) { saving = false; status('Not saved: ' + err.message, 'err'); });
  }

  window.addEventListener('beforeunload', function (e) {
    if (changeCount !== savedCount) { e.preventDefault(); e.returnValue = ''; }
  });
})();

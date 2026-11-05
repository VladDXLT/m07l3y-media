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
      initHistory();
      status(layout ? 'Ready. Layout: click a box to select it.' : 'Ready. Click any text to edit.');
      afterReady();
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
      '<button type="button" data-act="layout" class="m07-layoutbtn" title="Layout: move, resize, rotate, duplicate, copy/paste and delete any box">Layout</button>' +
      '<button type="button" data-act="media" title="Upload and place images or videos">Media</button>' +
      '<button type="button" data-act="undo" title="Undo the last change, whatever it was (Cmd+Z)">Undo</button>' +
      '<button type="button" data-act="redo" title="Redo (Cmd+Shift+Z)">Redo</button>' +
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
    '<form class="m07-import" autocomplete="off">' +
      '<input type="url" name="link" placeholder="Paste an Instagram post, reel or highlight, or a TikTok / YouTube link" required>' +
      '<button type="submit">Download</button>' +
    '</form>' +
    '<p class="m07-iginfo"></p>' +
    '<p class="m07-tools" hidden></p>' +
    '<div class="m07-grid"><p class="m07-empty">No uploads yet. Click Upload or drop files here.</p></div>';

  var handle = h('div', { class: 'm07-ui m07-handle', hidden: '', title: 'Drag to resize this text box' }, '<span></span>');
  var slotBar = h('div', { class: 'm07-ui m07-slotbar', hidden: '' },
    '<span class="m07-slotinfo"></span><button type="button" data-slot="replace">Replace</button><button type="button" data-slot="add" title="Add another video that plays right after this one">+ Clip</button><button type="button" data-slot="pop" title="Remove the last clip">\u2212 Last clip</button><button type="button" data-slot="trim" title="Cut this video to the length you need">Trim</button><button type="button" data-slot="stats">Stats</button><button type="button" data-slot="hud">HUD</button><button type="button" data-slot="remove">Remove</button>');
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
    noteChange(kind);
  }


  /* ------------------------------------------------------------------ edit / preview mode */
  function setEditing(on) {
    editing = on;
    document.documentElement.classList.toggle('m07-editing', on);
    var btn = bar.querySelector('.m07-mode');
    btn.textContent = on ? 'Editing' : 'Preview';
    btn.classList.toggle('on', on);
    if (!on) { deactivate(); selectSlot(null); hideSlotBar(); if (layout) setLayout(false); }
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
    if (!editing || layout || e.target.closest('.m07-ui')) return;
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
  document.addEventListener('submit', function (e) { if (editing && !e.target.closest('.m07-ui')) { e.preventDefault(); e.stopImmediatePropagation(); status('Forms are off while editing.'); } }, true);

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
    else if (act === 'layout') setLayout(!layout);
    else if (act === 'undo') { if (active && document.queryCommandEnabled && document.queryCommandEnabled('undo')) { active.focus(); document.execCommand('undo'); markDirty(active, 'html'); } else { deactivate(); undoAll(); } }
    else if (act === 'redo') redoAll();
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
  var library = {};   // src -> media item (with .meta for files imported from a link)
  var withStats = {}; // src -> true when "Include stat overlay" is ticked
  function statsAlt(meta) {
    var st = meta.stats || {}, parts = [];
    if (st.views != null) parts.push(fmtCount(st.views) + ' views');
    if (st.likes != null) parts.push(fmtCount(st.likes) + ' likes');
    if (st.comments != null) parts.push(fmtCount(st.comments) + ' comments');
    if (st.shares != null) parts.push(fmtCount(st.shares) + ' shares');
    return parts.join(', ') + (meta.platform ? ' on ' + meta.platform : '');
  }
  var PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19.5 12 7 4.5z" fill="currentColor"/></svg>';
  function removeStats(slot) { slot.querySelectorAll('.stat-overlay, .views-badge').forEach(function (n) { n.remove(); }); }
  /* ---- stats layout per frame shape (circle / vertical / horizontal / square)
   * Learned from the frames you've arranged: every save remembers where the likes, comments,
   * shares and views sit on each shape. New videos with stats get the same layout, scaled to the frame. */
  var STAT_TPL = {};
  fetch('/__editor/stat-styles', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { STAT_TPL = d || {}; }).catch(function () {});
  function shapeOf(el) {
    var cs = getComputedStyle(el), w = el.offsetWidth || 1, hh = el.offsetHeight || 1, rad = cs.borderTopLeftRadius || '0';
    var r = /%$/.test(rad) ? parseFloat(rad) / 100 * w : parseFloat(rad) || 0;
    if (r >= Math.min(w, hh) * 0.4) return 'circle';
    return hh > w * 1.08 ? 'vertical' : w > hh * 1.08 ? 'horizontal' : 'square';
  }
  // where a piece sits inside its frame, in the frame's own (unrotated) pixels
  var PIECES = '.stat-pill[data-k], .views-badge';
  function pieceKey(n) { return n.classList.contains('views-badge') ? 'views' : n.getAttribute('data-k'); }
  function localCenter(n, frame) {
    var fr = frame.getBoundingClientRect(), t = screenXform(frame, true), r = n.getBoundingClientRect();
    var px = r.left + r.width / 2 - (fr.left + fr.width / 2), py = r.top + r.height / 2 - (fr.top + fr.height / 2);
    var c = Math.cos(-t.a), sn = Math.sin(-t.a), k = t.s || 1;
    return { x: (px * c - py * sn) / k + frame.offsetWidth / 2, y: (px * sn + py * c) / k + frame.offsetHeight / 2 };
  }
  function pieceScale(n, frame) { return (screenXform(n, true).s || 1) / (screenXform(frame, true).s || 1); }
  function exampleFrom(slot) {
    var list = slot.querySelectorAll(PIECES);
    if (!list.length) return null;
    var W = slot.offsetWidth, H = slot.offsetHeight, ex = { shape: shapeOf(slot), w: W, h: H, parts: {} };
    list.forEach(function (n) {
      if (getComputedStyle(n).display === 'none' || !n.offsetWidth) return;
      var c = localCenter(n, slot);
      ex.parts[pieceKey(n)] = { fx: c.x / W, fy: c.y / H, rw: n.offsetWidth * pieceScale(n, slot) / W, sc: pieceScale(n, slot) };
    });
    return Object.keys(ex.parts).length ? ex : null;
  }
  function applyStatLayout(slot) {
    var list = (STAT_TPL[shapeOf(slot)] || []).filter(function (e) { return e && e.parts; });
    if (!list.length) return;
    var W = slot.offsetWidth || 1, H = slot.offsetHeight || 1, best = null, bd = Infinity;
    list.forEach(function (ex) {   // the arranged frame most like this one
      var d = Math.abs(Math.log((W / H) / (ex.w / ex.h))) * 2 + Math.abs(Math.log((W * H) / (ex.w * ex.h)));
      if (d < bd) { bd = d; best = ex; }
    });
    // first take off what you removed on that shape (the group re-centres), then place the rest
    slot.querySelectorAll(PIECES).forEach(function (n) { if (!best.parts[pieceKey(n)]) n.remove(); });
    slot.querySelectorAll(PIECES).forEach(function (n) {
      var part = best.parts[pieceKey(n)];
      ['--m-x', '--m-y', '--m-s'].forEach(function (k) { n.style.removeProperty(k); });
      var outer = pieceScale(n, slot) || 1;   // e.g. the whole group was resized
      // same size relative to the frame as on the frame you arranged (numbers of any length)
      var sc = part.sc ? part.sc * Math.sqrt((W * H) / (best.w * best.h)) / outer : part.rw * W / ((n.offsetWidth || 1) * outer);
      sc = Math.max(0.3, Math.min(3, sc));
      var v = vars(n); v.s = sc; v.x = 0; v.y = 0; setVars(n, v);
      var c = localCenter(n, slot);
      var tx = part.fx * W, ty = part.fy * H;
      // keep it inside the frame (longer numbers are wider than on the frame you arranged)
      var hw = n.offsetWidth * sc * outer / 2 + 6, hh2 = n.offsetHeight * sc * outer / 2 + 6;
      if (part.fx > 0 && part.fx < 1) tx = Math.max(hw, Math.min(W - hw, tx));
      if (part.fy > 0 && part.fy < 1) ty = Math.max(hh2, Math.min(H - hh2, ty));
      v.x = (tx - c.x) / outer; v.y = (ty - c.y) / outer; setVars(n, v);
    });
    var ov = slot.querySelector('.stat-overlay');
    if (ov && !ov.querySelector('.stat-pill')) ov.remove();
  }
  window.__m07LearnStats = function () { learnStatLayouts(); };
  function learnStatLayouts() {
    var exs = [];
    document.querySelectorAll('.m07-slot').forEach(function (slot) { var ex = exampleFrom(slot); if (ex && ex.w > 20) exs.push(ex); });
    if (!exs.length) return;
    fetch('/__editor/stat-styles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examples: exs }) })
      .then(function (r) { return r.json(); }).then(function (d) { if (d && !d.error) STAT_TPL = d; }).catch(function () {});
  }
  function statsData(info) {
    var st = (info && info.stats) || {}, d = {};
    ['likes', 'comments', 'shares'].forEach(function (k) { if (st[k] != null) d[k] = st[k]; });
    if (info && info.platform) d.platform = info.platform;
    return d;
  }
  function readStats(media) { try { var d = JSON.parse(media.getAttribute('data-stats') || '{}'); return d && typeof d === 'object' ? d : {}; } catch (e) { return {}; } }
  var PILL_ICONS = {
    likes: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 56C12 42 6 31 6 22.5 6 14.5 12.4 9 19.6 9c5.2 0 9.6 3 12.4 7.4C34.8 12 39.2 9 44.4 9 51.6 9 58 14.5 58 22.5 58 31 52 42 32 56z"/></svg>',
    comments: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8C17.6 8 6 17.8 6 30c0 6.2 3 11.8 7.9 15.8L11 57l13.3-6.6c2.4.6 5 .9 7.7.9 14.4 0 26-9.8 26-21.9S46.4 8 32 8z"/></svg>',
    shares: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M58 6 6 27.5l19 7.5 7.5 19L58 6zM25 35 58 6"/></svg>'
  };
  // Likes / comments / shares as separate pieces (move them one by one in Layout), views badge bottom left
  function addStats(slot, data, alt, views) {
    if (typeof data === 'string') { try { data = JSON.parse(data || '{}'); } catch (e) { data = {}; } }
    data = data || {};
    var keep = {};   // keep where you moved things when the numbers change
    slot.querySelectorAll('.stat-overlay, .stat-pill[data-k], .views-badge').forEach(function (n) {
      var k = n.classList.contains('stat-overlay') ? 'overlay' : n.classList.contains('views-badge') ? 'views' : n.getAttribute('data-k');
      if (n.getAttribute('style')) keep[k] = n.getAttribute('style');
      if (n.getAttribute('data-ref')) keep.ref = n.getAttribute('data-ref');
    });
    // data-ref: the frame width these stats are sized for (the site scales them with the frame from there)
    var ref = keep.ref || (slot.offsetWidth ? String(Math.round(slot.offsetWidth * 32 / Math.max(22, Math.min(32, window.innerWidth * 0.025)))) : '');
    removeStats(slot);
    var before = slot.querySelector('.hud, .slot-link') || null;
    var keys = ['likes', 'comments', 'shares'].filter(function (k) { return data[k] != null; });
    if (keys.length) {
      var ov = document.createElement('div');
      ov.className = 'stat-overlay';
      ov.setAttribute('role', 'img'); ov.setAttribute('aria-label', alt || '');
      ov.innerHTML = keys.map(function (k) {
        return '<span class="stat-pill sp-' + k + '" data-k="' + k + '"' + (keep[k] ? ' style="' + esc(keep[k]) + '"' : '') + '>' + PILL_ICONS[k] + '<b>' + fmtCount(data[k]) + '</b></span>';
      }).join('') + (data.platform ? '<span class="stat-pill sp-on" data-k="on"' + (keep.on ? ' style="' + esc(keep.on) + '"' : '') + '>on ' + esc(data.platform) + '</span>' : '');
      if (keep.overlay) ov.setAttribute('style', keep.overlay);
      if (ref) ov.setAttribute('data-ref', ref);
      slot.insertBefore(ov, before);
    }
    if (views) {
      var v = document.createElement('span');
      v.className = 'views-badge'; v.innerHTML = PLAY_SVG + '<b>' + views + '</b>';
      if (keep.views) v.setAttribute('style', keep.views);
      if (ref) v.setAttribute('data-ref', ref);
      slot.insertBefore(v, before);
    }
    if (window.__m07FitStats) window.__m07FitStats(slot);
  }
  function placeMedia(slot, src) {
    if (!slot.__orig) slot.__orig = slot.innerHTML;
    var info = library[src] && library[src].meta || null;
    var media;
    if (isVideo(src)) {
      media = document.createElement('video');
      ['autoplay', 'muted', 'loop', 'playsinline'].forEach(function (a) { media.setAttribute(a, ''); });
      media.setAttribute('preload', 'metadata');
      media.muted = true;
      if (info && info.poster) media.setAttribute('poster', info.poster);
      if (!info || info.audio !== false) media.setAttribute('data-audio', '');   // your own uploads: assume they have sound
    } else {
      media = document.createElement('img');
      media.setAttribute('alt', '');
      media.setAttribute('loading', 'lazy');
    }
    media.className = 'slot-media';
    media.setAttribute('src', src);
    var oldV = slot.querySelector('video.slot-media:not(.pl-buf)');
    if (oldV && oldV.getAttribute('data-sound-style')) media.setAttribute('data-sound-style', oldV.getAttribute('data-sound-style'));
    if (media.tagName === 'VIDEO') keepSoundStyle(slot, media);
    Array.prototype.slice.call(slot.children).forEach(function (c) {
      if (!c.classList.contains('hud') && !c.classList.contains('m07-ui')) c.remove();
    });
    slot.insertBefore(media, slot.firstChild);
    if (info) {
      var vtxt = info.stats && info.stats.views != null ? fmtCount(info.stats.views) : '';
      var sd = statsData(info), hasSd = Object.keys(sd).some(function (k) { return k !== 'platform'; });
      if (hasSd || vtxt) { media.setAttribute('data-stats', JSON.stringify(sd)); media.setAttribute('data-stats-alt', statsAlt(info)); if (vtxt) media.setAttribute('data-views', vtxt); }
      if (media.tagName === 'IMG') media.setAttribute('alt', (info.title || ('Post on ' + info.platform)).slice(0, 120));
      if ((hasSd || vtxt) && withStats[src] !== false) { addStats(slot, sd, statsAlt(info), vtxt); applyStatLayout(slot); }
      if (info.link) {
        var a = document.createElement('a');
        a.className = 'slot-link'; a.setAttribute('href', info.link); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener');
        a.setAttribute('aria-label', 'Watch on ' + (info.platform || 'the original post'));
        if (slot.getAttribute('aria-hidden') === 'true') { slot.removeAttribute('aria-hidden'); markDirty(slot, 'aria'); }
        if (slot.parentElement && slot.parentElement.closest('[aria-hidden="true"]')) a.setAttribute('tabindex', '-1');
        slot.appendChild(a);
      }
    }
    if (media.tagName === 'VIDEO' && window.__m07SetupVideo) window.__m07SetupVideo(media);
    else if (media.play) { var p = media.play(); if (p && p.catch) p.catch(function () {}); }
    markDirty(slot, 'html');
    status('Placed ' + src.split('/').pop() + '. Save to keep it. To play more clips after it, click + Clip.', 'warn');
  }
  // Add another clip to a frame: the clips play one after another with no gap (js/main.js)
  function clipList(v) { return (v.getAttribute('data-playlist') || v.getAttribute('src') || '').split('|').filter(Boolean); }
  function keepSoundStyle(slot, v) {
    var b = slot.querySelector('.sound-btn'), st = b && b.getAttribute('style');
    if (st && st.trim()) v.setAttribute('data-sound-style', st);
  }
  function setClips(slot, v, list) {
    keepSoundStyle(slot, v);
    slot.querySelectorAll('.pl-buf, .sound-btn').forEach(function (n) { n.remove(); });
    var fresh = v.cloneNode(false);             // a clean player (the old one keeps its own listeners)
    fresh.className = 'slot-media';
    if (list.length > 1) { fresh.setAttribute('data-playlist', list.join('|')); fresh.removeAttribute('loop'); }
    else { fresh.removeAttribute('data-playlist'); fresh.setAttribute('loop', ''); }
    fresh.setAttribute('src', list[0]);
    var hasAudio = list.some(function (src) { var m = library[src] && library[src].meta; return !m || m.audio; });
    if (hasAudio) fresh.setAttribute('data-audio', ''); else fresh.removeAttribute('data-audio');
    v.replaceWith(fresh);
    if (window.__m07SetupVideo) window.__m07SetupVideo(fresh);
    markDirty(slot, 'html');
    showSlotBar(slot);
  }
  function appendClip(slot, src) {
    var v = slot.querySelector('video.slot-media:not(.pl-buf)');
    if (!isVideo(src)) { status('Only videos can play one after another. Use Replace for a photo.', 'err'); return; }
    if (!v) { placeMedia(slot, src); return; }
    var list = clipList(v); list.push(src);
    setClips(slot, v, list);
    status(list.length + ' clips in this frame. They play back to back with no gap. Save to keep it.', 'warn');
  }
  var addTo = null;   // frame waiting for its next clip (after + Clip)
  function frameShape(slot) {
    var r = slot.getBoundingClientRect(), q = r.width / Math.max(1, r.height);
    return Math.abs(q - 1) < 0.08 ? 'Square frame' : q < 1 ? 'Vertical frame' : 'Horizontal frame';
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
    var sm = slot.querySelector('.slot-media[data-stats]');
    var sb = slotBar.querySelector('[data-slot="stats"]');
    sb.hidden = !sm;
    sb.classList.toggle('on', !!slot.querySelector('.stat-overlay, .views-badge'));
    var vv = slot.querySelector('video.slot-media:not(.pl-buf)'), n = vv ? clipList(vv).length : 0;
    slotBar.querySelector('[data-slot="add"]').classList.toggle('on', addTo === slot);
    slotBar.querySelector('[data-slot="pop"]').hidden = n < 2;
    slotBar.querySelector('[data-slot="trim"]').hidden = n < 1;
    slotBar.querySelector('.m07-slotinfo').textContent = frameShape(slot) + (n > 1 ? ' \u00b7 ' + n + ' clips' : '');
  }
  function hideSlotBar() { slotBar.hidden = true; slotBar.__slot = null; }
  document.addEventListener('mouseover', function (e) {
    if (!editing || layout || e.target.closest('.m07-ui')) return;
    var slot = e.target.closest('.m07-slot');
    if (slot) showSlotBar(slot); else if (!selectedSlot) hideSlotBar();
  });
  window.addEventListener('scroll', function () { if (slotBar.__slot) showSlotBar(slotBar.__slot); }, { passive: true });
  slotBar.addEventListener('mousedown', function (e) { e.preventDefault(); });
  slotBar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-slot]'), slot = slotBar.__slot;
    if (!b || !slot) return;
    if (b.dataset.slot === 'replace') { addTo = null; picker.__slot = slot; picker.click(); }
    if (b.dataset.slot === 'add') {
      addTo = addTo === slot ? null : slot;
      if (addTo) { selectSlot(slot); if (drawer.hidden) toggleDrawer(); status('Click a video in Media (or drop one on this frame) to add it after the others.'); }
      showSlotBar(slot);
    }
    if (b.dataset.slot === 'trim') {
      var tvd = slot.querySelector('video.slot-media:not(.pl-buf)');
      if (!tvd) return;
      var clips = clipList(tvd);
      var pick = clips.length > 1 ? (tvd.__player && tvd.__player.list ? clips[tvd.__player.i] : clips[0]) : clips[0];
      var hadStats = !!slot.querySelector('.stat-overlay, .views-badge');
      openTrim(pick.split('/').pop(), function (d) {
        if (d.replaced) return;
        loadLibrary().then(function () {
          if (hadStats) withStats[d.src] = true;
          var v2 = slot.querySelector('video.slot-media:not(.pl-buf)');
          if (clips.length > 1 && v2) { var l2 = clipList(v2).map(function (x) { return x === pick ? d.src : x; }); setClips(slot, v2, l2); }
          else placeMedia(slot, d.src);
        });
      });
      if (clips.length > 1) status('Trimming the clip that\u2019s playing now: ' + pick.split('/').pop());
    }
    if (b.dataset.slot === 'pop') {
      var pv = slot.querySelector('video.slot-media:not(.pl-buf)');
      if (pv) { var pl = clipList(pv); pl.pop(); if (pl.length) setClips(slot, pv, pl); status(pl.length + ' clip' + (pl.length > 1 ? 's' : '') + ' left. Save to keep it.', 'warn'); }
    }
    if (b.dataset.slot === 'hud') { slot.classList.toggle('no-hud'); markDirty(slot, 'class'); }
    if (b.dataset.slot === 'stats') {
      var ov = slot.querySelector('.stat-overlay, .views-badge'), sm = slot.querySelector('.slot-media[data-stats]');
      if (ov) removeStats(slot); else if (sm) { addStats(slot, readStats(sm), sm.getAttribute('data-stats-alt'), sm.getAttribute('data-views')); applyStatLayout(slot); }
      markDirty(slot, 'html'); showSlotBar(slot);
    }
    if (b.dataset.slot === 'remove') {
      addTo = null;
      if (slot.__orig) { slot.innerHTML = slot.__orig; slot.__orig = null; }
      else { slot.querySelectorAll('.slot-media, .sound-btn').forEach(function (m) { m.remove(); }); }
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
    var append = slot && (e.shiftKey || addTo === slot);
    if (slot && src) { if (append) appendClip(slot, src); else placeMedia(slot, src); return; }
    if (slot && files.length) {
      // several videos dropped on one frame: they become one back-to-back sequence
      var chain = Promise.resolve(), first = !append;
      files.forEach(function (f) {
        chain = chain.then(function () { return upload(f); }).then(function (d) {
          if (!d) return;
          if (first) { first = false; placeMedia(slot, d.src); } else appendClip(slot, d.src);
        });
      });
      return;
    }
    if (inDrawer && files.length) files.forEach(upload);
    else if (files.length) status('Drop files onto a frame or photo spot, or into the Media drawer.');
  });

  /* ------------------------------------------------------------------ media drawer */
  function placeDrawer() { drawer.style.bottom = (window.innerHeight - bar.getBoundingClientRect().top + 10) + 'px'; }
  window.addEventListener('resize', function () { if (!drawer.hidden) placeDrawer(); });
  if (window.ResizeObserver) new ResizeObserver(function () { if (!drawer.hidden) placeDrawer(); }).observe(bar);
  function toggleDrawer() {
    drawer.hidden = !drawer.hidden;
    if (!drawer.hidden) { placeDrawer(); loadLibrary(); checkTools(); }
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loadLibrary() {
    return fetch('/__editor/media', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      var grid = drawer.querySelector('.m07-grid');
      if (!d || !Array.isArray(d.files)) { grid.innerHTML = '<p class="m07-empty">Couldn\u2019t load your media: ' + esc((d && d.error) || 'no answer from the editor') + '. Your files are safe in assets/uploads.</p>'; return; }
      library = {};
      d.files.forEach(function (f) { library[f.src] = f; });
      if (!d.files.length) { grid.innerHTML = '<p class="m07-empty">No uploads yet. Click Upload, drop files here, or paste a link above.</p>'; return; }
      grid.innerHTML = d.files.map(function (f) {
        var m = f.meta;
        var poster = m && m.poster ? ' poster="/' + esc(m.poster) + '"' : '';
        var thumb = f.video ? '<video src="/' + esc(f.src) + '#t=0.5"' + poster + ' muted preload="metadata"></video>' : '<img src="/' + esc(f.src) + '" alt="" loading="lazy">';
        var card = '<div class="m07-card"><button type="button" class="m07-del" data-del="' + esc(f.name) + '" title="Remove from Media" aria-label="Remove ' + esc(f.name) + ' from Media">\u00d7</button><button type="button" class="m07-thumb" draggable="true" data-src="' + esc(f.src) + '" title="' + esc(f.name) + ' (' + (f.size / 1048576).toFixed(1) + ' MB)">' + thumb +
          '<span>' + (f.video ? (m && m.audio ? 'Video + sound' : 'Video') : 'Image') + '</span>' + (m && m.platform ? '<em>' + esc(m.platform) + (m.parts ? ' ' + m.part + '/' + m.parts : '') + '</em>' : '') + '</button>';
        var st = (m && m.stats) || {};
        var hasStats = m && ['views', 'likes', 'comments', 'shares'].some(function (k) { return st[k] != null; });
        var stories = m && m.link && /\/(stories|s)\//.test(m.link);
        card += '<div class="m07-meta">' +
          (m ? '<small>' + esc(statsAlt(m) || 'No stats yet') + '</small>' : '') +
          (hasStats ? '<label><input type="checkbox" data-stats-for="' + esc(f.src) + '"' + (withStats[f.src] !== false ? ' checked' : '') + '> Include stat overlay</label>' : '') +
          '<span class="m07-row2">' +
            (m && m.link && !stories ? '<button type="button" data-refresh="' + esc(f.base) + '">Refresh stats</button>' : '') +
            (f.video ? '<button type="button" data-trimopen="' + esc(f.name) + '" title="Cut this video to the length you need">Trim</button>' : '') +
            '<button type="button" data-editstats="' + esc(f.name) + '">' + (st.views == null && (f.video || m) ? 'Add views' : 'Edit stats') + '</button>' +
            (m && m.link ? '<a href="' + esc(m.link) + '" target="_blank" rel="noopener">Open post</a>' : '') +
          '</span>' +
          '<form class="m07-statform" data-name="' + esc(f.name) + '" hidden>' +
            ['views', 'likes', 'comments', 'shares'].map(function (k) {
              return '<label>' + k + '<input name="' + k + '" inputmode="decimal" placeholder="e.g. 1.2M" value="' + (st[k] != null ? esc(st[k]) : '') + '"></label>';
            }).join('') +
            '<button type="submit">Save stats</button>' +
          '</form></div>';
        return card + '</div>';
      }).join('');
      grid.querySelectorAll('.m07-thumb').forEach(function (t) {
        var m = t.querySelector('img, video');
        if (!m) return;
        var mark = function () {
          var w = m.videoWidth || m.naturalWidth, hh = m.videoHeight || m.naturalHeight;
          if (!w || !hh || t.parentNode.querySelector('.m07-orient')) return;
          t.insertAdjacentHTML('afterend', '<b class="m07-orient">' + orientLabel(w, hh) + ' <small>' + w + '\u00d7' + hh + '</small></b>');
          t.classList.add(w < hh * 0.94 ? 'is-vert' : w > hh * 1.06 ? 'is-horiz' : 'is-square');
        };
        if ((m.videoWidth || m.naturalWidth)) mark();
        m.addEventListener(m.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', mark);
      });
    });
  }
  function orientLabel(w, h) {
    var q = w / h;
    if (Math.abs(q - 1) < 0.06) return '\u25a2 Square';
    var common = q < 1 ? [['9:16', 9 / 16], ['4:5', 4 / 5], ['3:4', 3 / 4], ['2:3', 2 / 3]] : [['16:9', 16 / 9], ['4:3', 4 / 3], ['3:2', 3 / 2], ['21:9', 21 / 9]];
    var best = common.reduce(function (a, c) { return Math.abs(c[1] - q) < Math.abs(a[1] - q) ? c : a; });
    var tag = Math.abs(best[1] - q) / q < 0.04 ? ' ' + best[0] : '';
    return q < 1 ? '\u2195 Vertical' + tag : '\u2194 Horizontal' + tag;
  }
  function checkTools() {
    fetch('/__editor/tools').then(function (r) { return r.json(); }).then(function (t) {
      var info = drawer.querySelector('.m07-iginfo');
      if (t.igAccount) info.textContent = 'Instagram links always use @' + t.igAccount + ' logged in on Google Chrome' + (t.igProfile ? ' (' + t.igProfile + ')' : '') + '. Never Safari or another account.';
      var el = drawer.querySelector('.m07-tools');
      if (t.ytdlp && t.ffmpeg) { el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = !t.ytdlp
        ? 'Link downloads need two free tools. In Terminal run: <code>brew install yt-dlp ffmpeg</code> then restart the editor.'
        : 'Install ffmpeg for the best quality with sound: <code>brew install ffmpeg</code> then restart the editor.';
    }).catch(function () {});
  }

  function parseCount(t) {
    t = String(t || '').trim().replace(/[,\s]/g, '').toUpperCase();
    if (!t) return null;
    var m = /^(\d+(?:\.\d+)?)([KMB]?)$/.exec(t);
    if (!m) return NaN;
    return Math.round(parseFloat(m[1]) * ({ '': 1, K: 1e3, M: 1e6, B: 1e9 })[m[2]]);
  }
  // Update frames already placed on this page with new numbers
  function updatePlaced(it) {
    var vtxt = it.stats && it.stats.views != null ? fmtCount(it.stats.views) : '';
    document.querySelectorAll('.slot-media[src="' + it.src + '"]').forEach(function (media) {
      var slot = media.closest('.m07-slot') || media.parentElement;
      media.setAttribute('data-stats', JSON.stringify(statsData(it))); media.setAttribute('data-stats-alt', statsAlt(it));
      if (vtxt) media.setAttribute('data-views', vtxt); else media.removeAttribute('data-views');
      if (slot.querySelector('.stat-overlay, .views-badge')) addStats(slot, statsData(it), statsAlt(it), vtxt);
      markDirty(slot, 'html');
    });
  }
  /* stat overlay PNG: drawn here (so it uses the site fonts), saved next to the media file */
  function fmtCount(n) {
    if (n == null) return '';
    if (n >= 1e9) return (n / 1e9).toFixed(n < 1e10 ? 1 : 0).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace(/\.0$/, '') + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, '') + 'K';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  var ICONS = {
    likes: 'M32 56C12 42 6 31 6 22.5 6 14.5 12.4 9 19.6 9c5.2 0 9.6 3 12.4 7.4C34.8 12 39.2 9 44.4 9 51.6 9 58 14.5 58 22.5 58 31 52 42 32 56z',
    comments: 'M32 8C17.6 8 6 17.8 6 30c0 6.2 3 11.8 7.9 15.8L11 57l13.3-6.6c2.4.6 5 .9 7.7.9 14.4 0 26-9.8 26-21.9S46.4 8 32 8z',
    shares: 'M58 6 6 27.5l19 7.5 7.5 19L58 6zM25 35 58 6',
    views: 'M12 7.5v49L56 32 12 7.5z'
  };
  // (older versions drew the stats as a PNG; they are live HTML pieces now, nothing to render)
  function saveStatsPng() { return Promise.resolve(null); }
  drawer.querySelector('.m07-import').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, btn = form.querySelector('button');
    var link = form.link.value.trim();
    if (!link) return;
    btn.disabled = true; btn.textContent = 'Downloading\u2026';
    status('Downloading everything in it at the highest quality with sound. Big posts and highlights can take a minute\u2026');
    fetch('/__editor/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'Download failed');
        return Promise.all(d.items.map(function (it) { return saveStatsPng(it.base, it); })).then(function () { return d; });
      })
      .then(function (d) {
        form.reset();
        var items = d.items, mb = items.reduce(function (a, it) { return a + it.size; }, 0) / 1048576;
        var vids = items.filter(function (it) { return it.video; }).length, pics = items.length - vids;
        var what = items.length === 1 ? items[0].name : [vids ? vids + ' video' + (vids > 1 ? 's' : '') : '', pics ? pics + ' image' + (pics > 1 ? 's' : '') : ''].filter(Boolean).join(' and ');
        status('Saved ' + what + ' (' + mb.toFixed(1) + ' MB) with the link' + (d.account ? ', using @' + d.account : '') + '. Drag onto a frame.');
        loadLibrary(); checkTools();
      })
      .catch(function (err) { status(err.message, 'err'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Download'; });
  });
  drawer.addEventListener('submit', function (e) {
    var form = e.target.closest('.m07-statform');
    if (!form) return;
    e.preventDefault();
    var stats = {}, bad = '';
    ['views', 'likes', 'comments', 'shares'].forEach(function (k) { var v = parseCount(form[k].value); if (v !== v) bad = k; stats[k] = v; });
    if (bad) { status('Use a number like 45200, 45.2K or 1.2M for ' + bad + '.', 'err'); return; }
    fetch('/__editor/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.getAttribute('data-name'), stats: stats }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error);
        return Promise.all(d.items.map(function (it) {
          return saveStatsPng(it.base, it).then(function (r) { if (r && r.statsPng) it.statsPng = r.statsPng; updatePlaced(it); });
        })).then(function () { status('Stats saved: ' + (statsAlt(d.items[0]) || 'none') + '. Tick Include stat overlay, or use Stats on a placed frame.' + (document.querySelector('.m07-slot .slot-media[src="' + d.items[0].src + '"]') ? ' Save the page to keep it.' : '')); });
      })
      .catch(function (err) { status(err.message, 'err'); })
      .then(loadLibrary);
  });
  drawer.addEventListener('change', function (e) {
    var t = e.target.closest('[data-stats-for]');
    if (t) withStats[t.getAttribute('data-stats-for')] = !!t.checked;
  });
  drawer.addEventListener('dragstart', function (e) {
    var t = e.target.closest('.m07-thumb');
    if (!t) return;
    e.dataTransfer.setData('text/m07-src', t.dataset.src);
    e.dataTransfer.effectAllowed = 'copy';
  });
  drawer.addEventListener('click', function (e) {
    var to = e.target.closest('[data-trimopen]');
    if (to) { openTrim(to.getAttribute('data-trimopen')); return; }
    var es = e.target.closest('[data-editstats]');
    if (es) {
      var fm = es.closest('.m07-meta').querySelector('.m07-statform');
      fm.hidden = !fm.hidden;
      if (!fm.hidden) fm.views.focus();
      return;
    }
    var del = e.target.closest('[data-del]');
    if (del) {
      var name = del.getAttribute('data-del');
      if (document.querySelector('.slot-media[src="assets/uploads/' + name + '"]')) { status('That file is in a frame on this page. Click the frame, Remove it, then try again.', 'err'); return; }
      if (!del.classList.contains('sure')) {
        del.classList.add('sure'); del.textContent = 'Delete?';
        setTimeout(function () { if (del.isConnected) { del.classList.remove('sure'); del.textContent = '\u00d7'; } }, 3000);
        return;
      }
      fetch('/__editor/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d.ok) throw new Error(d.error); status('Removed ' + name + ' from Media.'); })
        .catch(function (err) { status(err.message, 'err'); })
        .then(loadLibrary);
      return;
    }
    var rf = e.target.closest('[data-refresh]');
    if (rf) {
      rf.disabled = true; rf.textContent = 'Refreshing\u2026';
      fetch('/__editor/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: rf.getAttribute('data-refresh') }) })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d.ok) throw new Error(d.error); return Promise.all(d.items.map(function (it) { return saveStatsPng(it.base, it); })).then(function () { status('Stats updated: ' + statsAlt(d.item) + '. Save the page and push to publish them.'); }); })
        .catch(function (err) { status(err.message, 'err'); })
        .then(loadLibrary);
      return;
    }
    var t = e.target.closest('.m07-thumb');
    if (!t) return;
    if (addTo && addTo.isConnected) { appendClip(addTo, t.dataset.src); return; }
    if (selectedSlot) placeMedia(selectedSlot, t.dataset.src);
    else status('Click a frame on the page first, or drag this file onto one.');
  });
  drawer.querySelector('input[type=file]').addEventListener('change', function (e) {
    Array.prototype.slice.call(e.target.files).forEach(upload);
    e.target.value = '';
  });


  /* ------------------------------------------------------------------ LAYOUT MODE
   * Click a box to select it (the thing you see on top under the pointer). Video frames,
   * photos, buttons and scrolling strips select as one piece (no HUD / scene inside them),
   * except the likes / comments / shares / views on a video, which move on their own.
   * Cmd or Shift click adds to the selection; everything selected moves together.
   * Drag = move, corner square = size, top dot = rotate. Front / Back = layer order.
   * Saved as CSS variables (--m-x, --m-y, --m-r, --m-s, --m-z) that css/styles.css turns into
   * translate / rotate / scale / z-index, so the site's own animations keep working.
   * Duplicate / paste / delete / reorder change the page's structure: they save and reload (Undo works).
   */
  var layout = false;
  var sel = [];                   // selected elements, last one = primary
  var hoverEl = null;

  var NOT_BOX = { HTML: 1, HEAD: 1, BODY: 1, SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, TITLE: 1, BR: 1, SOURCE: 1, TRACK: 1, NOSCRIPT: 1, TEMPLATE: 1, OPTION: 1 };
  var ATOMIC = '.frame, .portrait, .band, .btn-skew, .btn-pill, .btn, .logo, .foot-logo, svg, button, select, input, textarea';
  var PARTS = '.stat-pill, .views-badge, .stat-overlay, .sound-btn';    // pieces inside a video frame that can still move
  var CLIPS_ON_PURPOSE = '.frame, .portrait, .band';       // these keep cropping their insides
  var NAMES = [
    ['.stat-pill.sp-likes', 'Likes'], ['.stat-pill.sp-comments', 'Comments'], ['.stat-pill.sp-shares', 'Shares'], ['.stat-pill.sp-on', 'Platform tag'],
    ['.stat-overlay', 'Likes / comments / shares'], ['.views-badge', 'Views'], ['.sound-btn', 'Sound button'],
    ['.bands', 'Scrolling strips'], ['.band', 'Scrolling strip'], ['.frame', 'Video box'], ['.portrait', 'Photo'],
    ['.collage', 'Video collage'], ['.gallery', 'Gallery'], ['.g-item', 'Gallery item'], ['.svc', 'Service card'], ['.svc-shot', 'Service video'], ['.tile', 'Work tile'],
    ['.rate', 'Price card'], ['.tier', 'Plan card'], ['.stat', 'Stat'], ['.stats', 'Stats row'], ['.btn-skew,.btn-pill,.btn', 'Button'],
    ['.hero', 'Hero'], ['.deco,.shape,.blob,.dots,.ring,.big-o', 'Shape'], ['header', 'Header'], ['footer', 'Footer'], ['nav', 'Menu'],
    ['section', 'Section'], ['h1,h2,h3,h4', 'Heading'], ['p', 'Text'], ['img', 'Image'], ['video', 'Video'], ['svg', 'Graphic'], ['figure', 'Figure'],
    ['figcaption', 'Caption'], ['ul,ol', 'List'], ['li', 'List item'], ['form', 'Form'], ['a', 'Link'], ['button', 'Button']
  ];
  function nameOf(el) {
    for (var i = 0; i < NAMES.length; i++) if (el.matches(NAMES[i][0])) return NAMES[i][1];
    var c = (el.getAttribute('class') || '').split(/\s+/).filter(function (t) { return t && !/^m07-|^in$|^in-focus$|^reveal$|^pre$/.test(t); })[0];
    return el.tagName.toLowerCase() + (c ? '.' + c : '');
  }
  var primary = function () { return sel[sel.length - 1] || null; };

  var tag = h('div', { class: 'm07-ui m07-seltag', hidden: '' });
  var rotH = h('i', { class: 'm07-ui m07-rot', hidden: '', title: 'Drag to rotate (snaps to 0°, 15°, 30°…, hold Option for free)' });
  // corners: resize everything (insides grow / shrink too). sides: resize only the box, insides stay the same size
  var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  var handleEls = HANDLES.map(function (k) {
    var corner = k.length === 2;
    return h('i', { class: 'm07-ui m07-hdl ' + (corner ? 'm07-corner' : 'm07-side') + ' m07-h-' + k, hidden: '', 'data-h': k,
      title: corner ? 'Corner: make the whole thing bigger or smaller (insides too)' : 'Side: change only the box (insides stay the same size)' });
  });
  var sclH = handleEls[4];
  var boxBar = h('div', { class: 'm07-ui m07-boxbar', hidden: '' },
    '<button type="button" data-lay="parent" title="Select the box around this one">&#8598; Bigger box</button>' +
    '<button type="button" data-lay="front" title="Bring to the very front (over other sections too)">Front</button>' +
    '<button type="button" data-lay="back" title="Send behind the things next to it">Back</button>' +
    '<button type="button" data-lay="up" title="Move before the previous box in the page">&#8593;</button>' +
    '<button type="button" data-lay="down" title="Move after the next box in the page">&#8595;</button>' +
    '<button type="button" data-lay="dup" title="Duplicate (Cmd+D)">Duplicate</button>' +
    '<button type="button" data-lay="copy" title="Copy (Cmd+C)">Copy</button>' +
    '<button type="button" data-lay="paste" title="Paste after this box (Cmd+V). Works across pages.">Paste</button>' +
    '<button type="button" data-lay="reset" title="Undo move, rotate, size and layer for this box">Reset</button>' +
    '<button type="button" data-lay="delete" class="m07-danger" title="Delete (Backspace)">Delete</button>' +
    '<span class="m07-fields">' +
      '<label title="Moved left / right from its normal spot (px)">X<input data-f="x" inputmode="decimal"></label>' +
      '<label title="Moved up / down from its normal spot (px)">Y<input data-f="y" inputmode="decimal"></label>' +
      '<label title="Size (100 = normal)">Size<input data-f="s" inputmode="decimal"><i>%</i></label>' +
      '<label title="Tilt in degrees (minus = left)">Tilt<input data-f="r" inputmode="decimal"><i>\u00b0</i></label>' +
      '<label title="Layer: higher = in front">Layer<input data-f="z" inputmode="numeric"></label>' +
      '<button type="button" data-lay="cx" title="Center left to right in the box around it">\u21d4 Center</button>' +
      '<button type="button" data-lay="cy" title="Center top to bottom in the box around it">\u21d5 Center</button>' +
    '</span>');
  var guideX = h('div', { class: 'm07-ui m07-guide m07-guide-x', hidden: '' }), guideY = h('div', { class: 'm07-ui m07-guide m07-guide-y', hidden: '' });

  // Pieces inside a video frame (likes, comments, shares, views, sound button) are placed in
  // frame units (cqw / cqh, % of the frame), so they stay in the same spot when the frame is
  // bigger or smaller (other screen sizes, phones). Everything else uses px.
  function cqHost(el) { return el.matches && el.matches('.stat-pill, .views-badge, .stat-overlay, .sound-btn') ? el.closest('.frame, .portrait') : null; }
  function readLen(el, k, host, dim) {
    var raw = el.style.getPropertyValue(k).trim(), n = parseFloat(raw) || 0;
    if (host && /cq[wh]$/.test(raw)) return n * (/cqw$/.test(raw) ? host.offsetWidth : host.offsetHeight) / 100;
    return n;
  }
  function vars(el) {
    var s = el.style, host = cqHost(el);
    return { x: readLen(el, '--m-x', host), y: readLen(el, '--m-y', host),
      r: parseFloat(s.getPropertyValue('--m-r')) || 0, s: parseFloat(s.getPropertyValue('--m-s')) || 1, z: parseFloat(s.getPropertyValue('--m-z')) || 0 };
  }
  function setVars(el, v) {
    var s = el.style, host = cqHost(el);
    function put(k, val, def, unit, digits) { if (Math.abs(val - def) < 1e-6) s.removeProperty(k); else s.setProperty(k, (Math.round(val * digits) / digits) + unit); }
    if (host && host.offsetWidth && host.offsetHeight) {
      put('--m-x', v.x / host.offsetWidth * 100, 0, 'cqw', 1000); put('--m-y', v.y / host.offsetHeight * 100, 0, 'cqh', 1000);
    } else { put('--m-x', v.x, 0, 'px', 100); put('--m-y', v.y, 0, 'px', 100); }
    put('--m-r', v.r, 0, 'deg', 100); put('--m-s', v.s, 1, '', 1000); put('--m-z', v.z, 0, '', 1);
    if (!el.getAttribute('style') || !el.getAttribute('style').trim()) el.removeAttribute('style');
  }
  // turn old px positions of frame pieces into frame units (keeps them where they are at this screen size)
  window.__m07NormalizeParts = function () {
    var n = 0;
    document.querySelectorAll('.stat-pill, .views-badge, .stat-overlay, .sound-btn').forEach(function (el) {
      var st = el.getAttribute('style') || '';
      if (!/--m-[xy]\s*:\s*-?[\d.]+px/.test(st) || !cqHost(el)) return;
      setVars(el, vars(el)); markStyle(el); n++;
    });
    return n;
  };
  // box size and the space inside its edges (side handles)
  var SIZE_BOX = '.frame, .portrait, img, video, iframe, svg, canvas, .deco, .big-o, .svc-shot, .stat-pill, .views-badge, .stat-overlay, .sound-btn';
  function sizeDriven(el) { return el.matches(SIZE_BOX) || /^(absolute|fixed)$/.test(getComputedStyle(el).position); }
  function setVar(el, k, val, unit) {
    if (val == null) el.style.removeProperty(k); else el.style.setProperty(k, (Math.round(val * 10) / 10) + unit);
    if (!el.getAttribute('style') || !el.getAttribute('style').trim()) el.removeAttribute('style');
  }
  // move the box so that point `key` (a corner or side) ends up back at screen spot `target`
  function pin(el, key, target) {
    var now = geom(el).pts[key], dx = target[0] - now[0], dy = target[1] - now[1];
    if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return;
    var px = screenXform(el, false), c = Math.cos(-px.a), s = Math.sin(-px.a), k = px.s || 1, v = vars(el);
    v.x += (dx * c - dy * s) / k; v.y += (dx * s + dy * c) / k; setVars(el, v);
  }
  // remember styles before a gesture (one Undo step per gesture)
  function snapshot(els) {   // styles before a gesture, so Undo can put them back instantly (no reload)
    var states = els.map(function (el) { return { el: el, style: el.getAttribute('style') }; });
    pendingLive = (pendingLive || []).concat(states);
  }
  // Save a style change. Pieces added in the editor (stats) have no spot in the file yet: save their frame instead.
  function markStyle(el) {
    if (el.__pid != null) { markDirty(el, 'style'); return; }
    for (var a = el.parentElement; a; a = a.parentElement) if (a.__pid != null) { markDirty(a, 'html'); return; }
  }

  /* ---- what's under the pointer */
  function selectable(n) {
    if (NOT_BOX[n.tagName] || n.closest('.m07-ui')) return false;
    if (n.__pid == null && !n.matches(PARTS)) return false;
    var cs = getComputedStyle(n);
    if (cs.display === 'inline' || cs.display === 'contents' || cs.visibility === 'hidden') return false;
    var r = n.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  }
  function toUnit(el) {
    if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement || el.closest('.m07-ui')) return null;
    var part = el.closest(PARTS);
    if (part) return part;
    var atom = el.closest(ATOMIC), up;
    while (atom && (up = atom.parentElement && atom.parentElement.closest(ATOMIC))) atom = up;   // the outermost piece
    for (var n = atom || el; n && n !== document.body; n = n.parentElement) if (selectable(n)) return n;
    return null;
  }
  function hitAt(x, y) {
    // the page ignores the pointer in Layout (so hover effects don't move things around); switch it on just to look
    var root = document.documentElement;
    root.classList.add('m07-probe');
    var stack = document.elementsFromPoint(x, y), first = null;
    root.classList.remove('m07-probe');
    for (var i = 0; i < stack.length; i++) { first = toUnit(stack[i]); if (first) break; }
    if (first && first.matches('.frame, .portrait')) {
      // likes / comments / views sit under the frame's click-through link: prefer them when pointing at one
      for (var j = 0; j < stack.length; j++) {
        if (!first.contains(stack[j])) continue;
        var part = stack[j].closest('.stat-pill, .views-badge, .sound-btn');
        if (part && first.contains(part)) return part;
      }
    }
    return first;
  }
  function parentUnit(el) {
    for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) if (selectable(n)) return n;
    return null;
  }

  /* ---- geometry: true center, angle and scale on screen (so handles sit on the real corners) */
  function screenXform(el, includeSelf) {
    var ang = 0, sc = 1;
    for (var n = includeSelf ? el : el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.transform && cs.transform !== 'none') {
        var m = cs.transform.match(/matrix\(([^)]+)\)/);
        if (m) { var v = m[1].split(',').map(parseFloat); ang += Math.atan2(v[1], v[0]); sc *= Math.hypot(v[0], v[1]); }
      }
      if (cs.rotate && cs.rotate !== 'none') { var d = parseFloat(cs.rotate.split(' ').pop()); if (!isNaN(d)) ang += d * Math.PI / 180; }
      if (cs.scale && cs.scale !== 'none') { var s2 = parseFloat(cs.scale); if (!isNaN(s2)) sc *= s2; }
    }
    return { a: ang, s: sc };
  }
  function geom(el) {
    var r = el.getBoundingClientRect(), t = screenXform(el, true);
    var w = (el.offsetWidth || r.width) * t.s / 2, hh = (el.offsetHeight || r.height) * t.s / 2;
    if (!el.offsetWidth) { w = r.width / 2; hh = r.height / 2; t.a = 0; }
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2, c = Math.cos(t.a), s = Math.sin(t.a);
    function pt(dx, dy) { return [cx + dx * c - dy * s, cy + dx * s + dy * c]; }
    return { cx: cx, cy: cy, a: t.a, s: t.s, r: r, w: w, h: hh, top: pt(0, -hh - 34),
      pts: { nw: pt(-w, -hh), n: pt(0, -hh), ne: pt(w, -hh), e: pt(w, 0), se: pt(w, hh), s: pt(0, hh), sw: pt(-w, hh), w: pt(-w, 0) } };
  }

  /* ---- drawing the selection (outlines live on the elements, so they follow scrolling and rotation exactly) */
  var layRaf;
  function clampPt(p) {
    var maxY = (bar.hidden ? window.innerHeight : bar.getBoundingClientRect().top) - 12;
    return [Math.max(10, Math.min(p[0], window.innerWidth - 10)), Math.max(10, Math.min(p[1], maxY))];
  }
  function trackSel() {
    cancelAnimationFrame(layRaf);
    sel = sel.filter(function (el) { return el.isConnected; });
    var p = primary();
    if (!layout || !p) { [tag, rotH, boxBar].concat(handleEls).forEach(function (n) { n.hidden = true; }); return; }
    var g = geom(p);
    var tp = clampPt(g.top), tl = clampPt([g.r.left, g.r.top - 22]);
    rotH.hidden = tag.hidden = boxBar.hidden = false;
    var small = g.w * 2 < 44 || g.h * 2 < 44;   // tiny boxes: only corners, so handles don't pile up
    handleEls.forEach(function (el) {
      var k = el.dataset.h, q = clampPt(g.pts[k]);
      el.hidden = small && k.length === 1;
      el.style.left = q[0] + 'px'; el.style.top = q[1] + 'px';
      el.style.transform = 'rotate(' + g.a + 'rad)';
    });
    rotH.style.left = tp[0] + 'px'; rotH.style.top = tp[1] + 'px';
    tag.style.left = tl[0] + 'px'; tag.style.top = Math.max(4, tl[1]) + 'px';
    tag.textContent = sel.length > 1 ? sel.length + ' selected' : nameOf(p);
    var bh = boxBar.offsetHeight || 34, top = Math.min(g.r.top, tp[1]) - bh - 18;
    if (top < 8) top = Math.min(g.r.bottom + 14, (bar.hidden ? window.innerHeight : bar.getBoundingClientRect().top) - bh - 10);
    boxBar.style.top = Math.max(8, top) + 'px';
    boxBar.style.left = Math.max(8, Math.min(g.r.left, window.innerWidth - boxBar.offsetWidth - 8)) + 'px';
    var v = vars(p), z = getComputedStyle(p).zIndex;
    var shown = { x: Math.round(v.x), y: Math.round(v.y), s: Math.round(v.s * 100), r: Math.round(v.r * 10) / 10, z: z === 'auto' ? 0 : z };
    boxBar.querySelectorAll('[data-f]').forEach(function (inp) {
      if (document.activeElement !== inp && inp.value !== String(shown[inp.dataset.f])) inp.value = shown[inp.dataset.f];
    });
    layRaf = requestAnimationFrame(trackSel);
  }
  function paintSel() {
    document.querySelectorAll('.m07-sel').forEach(function (n) { if (sel.indexOf(n) < 0) n.classList.remove('m07-sel'); });
    sel.forEach(function (n) { n.classList.add('m07-sel'); });
    setHover(null);
    trackSel();
  }
  function selectOnly(el) { sel = el ? [el] : []; paintSel(); }
  function toggleSel(el) {
    if (!el) return;
    var i = sel.indexOf(el);
    if (i > -1) sel.splice(i, 1);
    else {
      // can't hold both a box and something inside it
      sel = sel.filter(function (s) { return !s.contains(el) && !el.contains(s); });
      sel.push(el);
    }
    paintSel();
  }
  function setHover(el) {
    if (hoverEl === el) return;
    if (hoverEl) hoverEl.classList.remove('m07-hov');
    hoverEl = el && sel.indexOf(el) < 0 ? el : null;
    if (hoverEl) hoverEl.classList.add('m07-hov');
  }
  function setLayout(on) {
    layout = on;
    document.documentElement.classList.toggle('m07-layout', on);
    bar.querySelector('[data-act="layout"]').classList.toggle('on', on);
    writePref('layout', on ? '1' : '0');
    if (on) {
      if (!editing) setEditing(true);
      deactivate(); selectSlot(null); hideSlotBar();
      bar.querySelector('.m07-text').classList.add('off');
      status('Layout: click to select, Cmd or Shift click for more. Drag to move, corner to resize, top dot to rotate.');
    } else { selectOnly(null); setHover(null); updateTools(); status('Text editing. Click any text to edit.'); }
  }

  // hover outline (also refreshed while scrolling)
  var hoverRaf = 0, lastXY = null;
  function refreshHover() {
    if (hoverRaf || !lastXY) return;
    hoverRaf = requestAnimationFrame(function () {
      hoverRaf = 0;
      if (!layout || dragging || !lastXY) { setHover(null); return; }
      setHover(hitAt(lastXY[0], lastXY[1]));
    });
  }
  document.addEventListener('mousemove', function (e) { if (layout) { lastXY = [e.clientX, e.clientY]; refreshHover(); } }, true);
  window.addEventListener('scroll', function () { if (layout) refreshHover(); }, { passive: true });
  document.addEventListener('mouseleave', function () { lastXY = null; setHover(null); });

  /* ---- snapping (hold Option to move freely) */
  var SNAP = 7;
  function pageRect(el) { var r = el.getBoundingClientRect(); return { l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY, w: r.width, h: r.height }; }
  function snapTargets(lead, group) {
    var xs = [], ys = [];
    function addBox(el, kind) {
      if (!el || el === document.body || el === document.documentElement) return;
      var r = pageRect(el); if (r.w < 2 || r.h < 2) return;
      xs.push({ v: r.l, k: kind }, { v: (r.l + r.r) / 2, k: kind + '-c' }, { v: r.r, k: kind });
      ys.push({ v: r.t, k: kind }, { v: (r.t + r.b) / 2, k: kind + '-c' }, { v: r.b, k: kind });
    }
    var par = lead.parentElement;
    addBox(par, 'parent');
    var sec = par && par.closest('section, header, footer, .bands, .page-hero, .cta-band');
    if (sec && sec !== par) addBox(sec, 'section');
    if (par) Array.prototype.slice.call(par.children, 0, 60).forEach(function (c) {
      if (group.indexOf(c) < 0 && !c.classList.contains('m07-ui') && !c.contains(lead)) addBox(c, 'sib');
    });
    xs.push({ v: scrollX + innerWidth / 2, k: 'page-c' });
    // its normal spot (where it sits with no move)
    var v = vars(lead), px = screenXform(lead, false), c = Math.cos(px.a), sn = Math.sin(px.a), k = px.s || 1;
    var hx = (v.x * c - v.y * sn) * k, hy = (v.x * sn + v.y * c) * k, r0 = pageRect(lead);
    var home = { l: r0.l - hx, r: r0.r - hx, t: r0.t - hy, b: r0.b - hy };
    xs.push({ v: home.l, k: 'home' }, { v: (home.l + home.r) / 2, k: 'home-c' });
    ys.push({ v: home.t, k: 'home' }, { v: (home.t + home.b) / 2, k: 'home-c' });
    return { xs: xs, ys: ys, r0: r0 };
  }
  function bestSnap(points, targets) {
    var best = null;
    points.forEach(function (pt) {
      targets.forEach(function (t) {
        var d = t.v - pt;
        if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d) || (Math.abs(d) === Math.abs(best.d) && /-c$/.test(t.k)))) best = { d: d, at: t.v, k: t.k };
      });
    });
    return best;
  }
  function snapTo(sn, dx, dy) {
    var r = sn.r0, l = r.l + dx, t = r.t + dy;
    var bx = bestSnap([l, l + r.w / 2, l + r.w], sn.xs), by = bestSnap([t, t + r.h / 2, t + r.h], sn.ys);
    if (!bx && !by) return null;
    return { dx: bx ? bx.d : 0, dy: by ? by.d : 0, x: bx, y: by };
  }
  function showGuides(hit) {
    guideX.hidden = !(hit && hit.x); guideY.hidden = !(hit && hit.y);
    if (hit && hit.x) { guideX.style.left = (hit.x.at - scrollX) + 'px'; guideX.classList.toggle('c', /-c$/.test(hit.x.k)); }
    if (hit && hit.y) { guideY.style.top = (hit.y.at - scrollY) + 'px'; guideY.classList.toggle('c', /-c$/.test(hit.y.k)); }
  }
  // typed numbers: X / Y move the whole selection together, size / tilt / layer are set on each
  function applyField(f, raw) {
    var val = parseFloat(String(raw).replace(',', '.').replace(/[^\d.+-]/g, ''));
    var p = primary();
    if (!p || isNaN(val)) { trackSel(); return; }
    snapshot(sel.slice());
    var pv = vars(p);
    sel.forEach(function (el) {
      var v = vars(el);
      if (f === 'x') v.x += val - pv.x;
      else if (f === 'y') v.y += val - pv.y;
      else if (f === 's') v.s = Math.max(0.05, Math.min(10, val / 100));
      else if (f === 'r') v.r = ((val + 540) % 360) - 180;
      else if (f === 'z') { positioned(el); v.z = Math.round(val); }
      setVars(el, v); markStyle(el); unclip(el);
    });
  }
  function centerSel(axis) {
    var p = primary(); if (!p) return;
    var box = p.parentElement; if (!box) return;
    var pr = p.getBoundingClientRect(), br = box.getBoundingClientRect();
    // centering in the whole page (or anything taller than the screen) top-to-bottom would throw it far away
    if (axis === 'y' && (/^(MAIN|BODY|HTML)$/.test(box.tagName) || br.height > window.innerHeight * 1.5)) {
      status('The box around this one is taller than the screen, so top-to-bottom centering is off. Use Bigger box or drag it.', 'warn'); return;
    }
    var d = axis === 'x' ? (br.left + br.width / 2) - (pr.left + pr.width / 2) : (br.top + br.height / 2) - (pr.top + pr.height / 2);
    snapshot(sel.slice());
    sel.forEach(function (el) {
      var px = screenXform(el, false), c = Math.cos(-px.a), s2 = Math.sin(-px.a), k = px.s || 1, v = vars(el);
      var dx = axis === 'x' ? d : 0, dy = axis === 'y' ? d : 0;
      v.x += (dx * c - dy * s2) / k; v.y += (dx * s2 + dy * c) / k;
      setVars(el, v); markStyle(el); unclip(el);
    });
    status('Centered ' + (axis === 'x' ? 'left to right' : 'top to bottom') + ' in ' + nameOf(box) + '.');
  }
  boxBar.addEventListener('change', function (e) { var f = e.target.dataset && e.target.dataset.f; if (f) applyField(f, e.target.value); });
  boxBar.addEventListener('keydown', function (e) {
    var inp = e.target.closest('[data-f]'); if (!inp) return;
    if (e.key === 'Enter') { e.preventDefault(); applyField(inp.dataset.f, inp.value); inp.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); inp.blur(); trackSel(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      var step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      inp.value = (parseFloat(inp.value) || 0) + step; applyField(inp.dataset.f, inp.value);
    }
    e.stopPropagation();
  });
  boxBar.addEventListener('mousedown', function (e) { if (e.target.closest('[data-f]')) e.stopPropagation(); }, true);

  /* ---- move */
  var dragging = null;
  function inside(el, x, y) { var r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  function unclip(el) {
    // let a moved box overlap things around it instead of being cut off by its section
    var r = el.getBoundingClientRect();
    for (var a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (a.matches(CLIPS_ON_PURPOSE)) break;
      var cs = getComputedStyle(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') continue;
      var ar = a.getBoundingClientRect();
      if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.top < ar.top - 1 || r.bottom > ar.bottom + 1) { a.style.overflow = 'visible'; markStyle(a); }
    }
  }
  document.addEventListener('pointerdown', function (e) {
    if (!layout || e.button !== 0 || e.target.closest('.m07-ui')) return;
    e.preventDefault(); e.stopPropagation();
    var hit = hitAt(e.clientX, e.clientY);
    var multi = e.metaKey || e.ctrlKey || e.shiftKey;
    if (multi) { toggleSel(hit); if (!hit || sel.indexOf(hit) < 0) return; }
    var grab = sel.filter(function (s) { return inside(s, e.clientX, e.clientY); })[0];
    var group = grab ? sel.slice() : (hit ? [hit] : []);
    if (!group.length) { selectOnly(null); return; }
    var sx = e.clientX, sy = e.clientY, sY0 = window.scrollY, sX0 = window.scrollX, moved = false, last = e;
    var starts = group.map(function (el) { return { el: el, v: vars(el), px: screenXform(el, false) }; });
    dragging = { els: group };
    var lead = grab || hit, snap = null;
    function apply(ev) {
      last = ev;
      var dx = ev.clientX - sx + (window.scrollX - sX0), dy = ev.clientY - sy + (window.scrollY - sY0);
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      if (!moved) {
        moved = true;
        if (!grab) selectOnly(hit);
        snapshot(group); document.documentElement.classList.add('m07-dragging'); setHover(null);
      }
      if (ev.shiftKey && !multi) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      // click into place: centers and edges of the box around it, neighbours, the page center, its own normal spot
      if (!snap) snap = snapTargets(lead, group);
      var hit2 = ev.altKey ? null : snapTo(snap, dx, dy);
      if (hit2) { dx += hit2.dx; dy += hit2.dy; }
      showGuides(hit2);
      starts.forEach(function (st) {   // turn screen movement into the box's own (maybe rotated / scaled) space
        var c = Math.cos(-st.px.a), s = Math.sin(-st.px.a), k = st.px.s || 1;
        setVars(st.el, Object.assign({}, st.v, { x: st.v.x + (dx * c - dy * s) / k, y: st.v.y + (dx * s + dy * c) / k }));
      });
    }
    function onScroll() { apply(last); }
    function up() {
      document.removeEventListener('pointermove', apply, true);
      document.removeEventListener('pointerup', up, true);
      window.removeEventListener('scroll', onScroll);
      document.documentElement.classList.remove('m07-dragging');
      dragging = null; showGuides(null);
      if (moved) group.forEach(function (el) { markStyle(el); unclip(el); });
      else if (!grab || !multi) { if (!multi) selectOnly(hit); }
    }
    document.addEventListener('pointermove', apply, true);
    document.addEventListener('pointerup', up, true);
    window.addEventListener('scroll', onScroll, { passive: true });
  }, true);
  ['mousedown', 'click', 'dblclick', 'touchstart', 'contextmenu'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      if (!layout || e.target.closest('.m07-ui')) return;
      e.preventDefault(); e.stopPropagation();
    }, { capture: true, passive: false });
  });

  /* ---- rotate + resize (every selected box) */
  var OPP = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };
  var PAD = { n: 'top', s: 'bottom', e: 'right', w: 'left' };
  function handleDrag(e, kind) {
    var p = primary(); if (!p) return;
    e.preventDefault(); e.stopPropagation();
    var g = geom(p), group = sel.slice();
    var starts = group.map(function (el) {
      var gg = geom(el), cs = getComputedStyle(el), side = kind.length === 1 ? PAD[kind] : null;
      return { el: el, v: vars(el), g: gg, anchor: OPP[kind] ? gg.pts[OPP[kind]] : null, sizeBox: sizeDriven(el),
        w0: el.offsetWidth || gg.r.width, h0: el.offsetHeight || gg.r.height,
        pad0: side ? parseFloat(cs['padding' + side[0].toUpperCase() + side.slice(1)]) || 0 : 0,
        mw: el.style.getPropertyValue('--m-w'), mh: el.style.getPropertyValue('--m-h') };
    });
    var a0 = Math.atan2(e.clientY - g.cy, e.clientX - g.cx), d0 = Math.hypot(e.clientX - g.cx, e.clientY - g.cy) || 1;
    var sx = e.clientX, sy = e.clientY;
    snapshot(group); dragging = { els: group };
    document.documentElement.classList.add('m07-dragging');
    function move(ev) {
      if (kind === 'rot') {
        var delta = (Math.atan2(ev.clientY - g.cy, ev.clientX - g.cx) - a0) * 180 / Math.PI;
        starts.forEach(function (st) {
          var deg = ((st.v.r + delta + 540) % 360) - 180, snap = Math.round(deg / 15) * 15;
          if (!ev.altKey && Math.abs(deg - snap) < 3) deg = snap;
          setVars(st.el, Object.assign({}, st.v, { r: deg }));
        });
        return;
      }
      if (kind.length === 2) {   // corner: scale everything, the opposite corner stays put
        var f = Math.hypot(ev.clientX - g.cx, ev.clientY - g.cy) / d0;
        starts.forEach(function (st) {
          var sc = Math.max(0.1, Math.min(6, st.v.s * f));
          if (!ev.altKey && Math.abs(sc - 1) < 0.03) sc = 1;
          setVars(st.el, Object.assign({}, st.v, { s: sc }));
          pin(st.el, OPP[kind], st.anchor);
        });
        return;
      }
      // side: resize only the box. Movement measured along the box's own (maybe rotated) direction
      starts.forEach(function (st) {
        var c = Math.cos(-st.g.a), s2 = Math.sin(-st.g.a), k = st.g.s || 1;
        var lx = ((ev.clientX - sx) * c - (ev.clientY - sy) * s2) / k, ly = ((ev.clientX - sx) * s2 + (ev.clientY - sy) * c) / k;
        var d = kind === 'e' ? lx : kind === 'w' ? -lx : kind === 's' ? ly : -ly;   // + = bigger
        var horiz = kind === 'e' || kind === 'w';
        if (st.sizeBox) {
          // videos, photos, shapes: the box gets wider / taller, the picture fills it (cropped, never stretched)
          var nw = horiz ? Math.max(12, st.w0 + d) : st.w0, nh = horiz ? st.h0 : Math.max(12, st.h0 + d);
          setVar(st.el, '--m-w', nw, 'px'); setVar(st.el, '--m-h', nh, 'px');
          st.el.style.setProperty('--m-ar', String(Math.round(nw / nh * 1000) / 1000));
        } else {
          // sections, cards, text boxes: change the empty space on that side; past zero the box itself gets smaller
          var want = st.pad0 + d;
          setVar(st.el, '--m-p' + PAD[kind][0], Math.max(0, want), 'px');
          if (want < 0) setVar(st.el, horiz ? '--m-w' : '--m-h', Math.max(12, (horiz ? st.w0 : st.h0) - st.pad0 + want), 'px');
          else if (horiz) { if (st.mw) st.el.style.setProperty('--m-w', st.mw); else st.el.style.removeProperty('--m-w'); }
          else { if (st.mh) st.el.style.setProperty('--m-h', st.mh); else st.el.style.removeProperty('--m-h'); }
        }
        if (st.sizeBox) pin(st.el, OPP[kind], st.anchor);   // the opposite side stays where it was (in-flow boxes let the page close up instead)
      });
    }
    function up() {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.documentElement.classList.remove('m07-dragging');
      dragging = null; group.forEach(function (el) { markStyle(el); unclip(el); });
    }
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
  }
  rotH.addEventListener('pointerdown', function (e) { handleDrag(e, 'rot'); });
  handleEls.forEach(function (el) { el.addEventListener('pointerdown', function (e) { handleDrag(e, el.dataset.h); }); });

  /* ---- layer order */
  function zOf(n) { var z = parseInt(getComputedStyle(n).zIndex, 10); return isNaN(z) ? 0 : z; }
  function positioned(n) { if (getComputedStyle(n).position === 'static') n.style.position = 'relative'; }
  function setZ(n, z) { positioned(n); var v = vars(n); v.z = z; setVars(n, v); markStyle(n); }
  function bringFront(el) {
    // raise the box, and each box around it, above its neighbours, so it also covers other sections
    for (var n = el; n && n.parentElement && n !== document.body; n = n.parentElement) {
      var max = 0;
      Array.prototype.forEach.call(n.parentElement.children, function (c) {
        // the fixed site header / menu always stays on top, so don't try to beat it
        if (c === n || c.classList.contains('m07-ui') || /^(fixed|sticky)$/.test(getComputedStyle(c).position)) return;
        max = Math.max(max, zOf(c));
      });
      if (n === el || zOf(n) <= max) setZ(n, max + 1);
      if (n.matches('header') || getComputedStyle(n).position === 'fixed') break;
    }
  }
  function sendBack(el) {
    var par = el.parentElement, min = 0;
    Array.prototype.forEach.call(par.children, function (c) { if (c !== el) min = Math.min(min, zOf(c)); });
    if (getComputedStyle(par).isolation !== 'isolate') { par.style.isolation = 'isolate'; markStyle(par); }   // stays above the section's background
    setZ(el, min - 1);
  }

  /* ---- structural changes: applied to the page file, saved, then the page reloads */
  function fileOp(label, els, fn) {
    if (!ready) { status('Still loading, try again in a second.', 'warn'); return; }
    if (saving) return;
    if (histTimer) commitHist();
    var built;
    try { built = buildDoc(els.map(function (el) { return el.__pid; })); } catch (err) { status(err.message, 'err'); return; }
    var refs = built.refs;
    if (refs.some(function (p) { return !p || !built.doc.documentElement.contains(p); })) { status('Save and reload the page, then try that again.', 'err'); return; }
    var result;
    try { result = fn(built.doc, refs); } catch (err) { status(err.message, 'err'); return; }
    if (result === false) return;
    var all = built.doc.getElementsByTagName('*');
    var selIdx = (result || []).map(function (n) { return Array.prototype.indexOf.call(all, n); }).filter(function (i) { return i > -1; });
    var html = '<!doctype html>\n' + built.doc.documentElement.outerHTML + '\n';
    saving = true; status(label + '…');
    fetch('/__editor/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: PAGE, html: html }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        saving = false;
        if (!d.ok) throw new Error(d.error || 'Save failed');
        pushHist({ html: curHtml, label: label }); redoStack = []; storeStacks();
        writeSession('after', JSON.stringify({ page: PAGE, y: window.scrollY, sel: selIdx, layout: true, msg: label + '. Saved. Undo (Cmd+Z) puts it back.' }));
        savedCount = changeCount;
        location.reload();
      })
      .catch(function (err) { saving = false; status('Not saved: ' + err.message, 'err'); });
  }
  function readSession(k) { try { return sessionStorage.getItem('m07ed-' + k); } catch (e) { return null; } }
  function writeSession(k, v) { try { if (v == null) sessionStorage.removeItem('m07ed-' + k); else sessionStorage.setItem('m07ed-' + k, v); } catch (e) {} }
  function fileUndoStack() { try { return JSON.parse(readSession('undo') || '[]').filter(function (u) { return u && u.page; }); } catch (e) { return []; } }
  function stripIds(node) { node.removeAttribute('id'); node.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); }); return node; }
  function guard(p) { if (/^(HTML|HEAD|BODY)$/.test(p.tagName)) throw new Error('That one can’t be changed. Pick a box inside the page.'); }
  function docOrder(els) { return els.slice().sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; }); }
  function needSel() { if (!sel.length) { status('Click a box first.', 'warn'); return false; } return true; }
  function label(els, verb) { return verb + ' ' + (els.length > 1 ? els.length + ' boxes' : nameOf(els[0])); }
  // pieces added in the editor (stats) aren't in the file yet: change them live and save their frame
  function liveOnly(els) { return els.every(function (el) { return el.__pid == null; }); }
  function anyLive(els) { return els.some(function (el) { return el.__pid == null; }); }
  function copyBoxes() {
    if (!needSel()) return;
    var els = docOrder(sel), htmls;
    if (anyLive(els)) htmls = els.map(function (el) { var c = el.cloneNode(true); c.classList.remove('m07-sel', 'm07-hov'); return c.outerHTML; });
    else { var b = buildDoc(els.map(function (el) { return el.__pid; })); htmls = b.refs.map(function (p) { return p.outerHTML; }); }
    writePref('clip', JSON.stringify({ html: htmls, name: els.length > 1 ? els.length + ' boxes' : nameOf(els[0]) }));
    status('Copied ' + (els.length > 1 ? els.length + ' boxes' : nameOf(els[0])) + '. Select a box (on any page) and Paste to put the copy after it.');
  }
  function pasteBoxes() {
    if (!needSel()) return;
    var clip; try { clip = JSON.parse(readPref('clip') || 'null'); } catch (e) {}
    if (!clip) { status('Nothing copied yet. Select a box and press Copy first.', 'warn'); return; }
    var list = Array.isArray(clip.html) ? clip.html : [clip.html];
    var at = primary();
    if (at.__pid == null) {   // inside a frame: paste live
      var after = at;
      list.forEach(function (hh) { var t = document.createElement('template'); t.innerHTML = hh; var n = t.content.firstElementChild; if (n) { after.after(n); after = n; } });
      markStyle(at); status('Pasted. Save to keep it.', 'warn'); return;
    }
    fileOp('Pasted ' + clip.name, [at], function (doc, refs) {
      guard(refs[0]);
      var after = refs[0], out = [];
      list.forEach(function (hh) {
        var t = doc.createElement('template'); t.innerHTML = hh;
        var node = t.content.firstElementChild; if (!node) return;
        node.classList.remove('m07-sel', 'm07-hov'); if (!node.getAttribute('class')) node.removeAttribute('class');
        stripIds(node); after.after(node); after = node; out.push(node);
      });
      if (!out.length) throw new Error('The copied box was empty.');
      return out;
    });
  }
  function layoutAction(act) {
    if (act === 'copy') return copyBoxes();
    if (act === 'cx' || act === 'cy') return centerSel(act === 'cx' ? 'x' : 'y');
    if (act === 'paste') return pasteBoxes();
    if (!needSel()) return;
    var els = docOrder(sel), p = primary();
    if (act === 'parent') {
      var up = parentUnit(p);
      if (up) selectOnly(up); else status('That’s already the biggest box.');
      return;
    }
    if (act === 'reset') {
      snapshot(els);
      els.forEach(function (el) {
        ['--m-w', '--m-h', '--m-ar', '--m-pt', '--m-pr', '--m-pb', '--m-pl'].forEach(function (k) { el.style.removeProperty(k); });
        setVars(el, { x: 0, y: 0, r: 0, s: 1, z: 0 }); markStyle(el);
      });
      return;
    }
    if (act === 'front') { snapshot(els.concat(ancestorsOf(els))); els.forEach(bringFront); status('Brought to the front.'); return; }
    if (act === 'back') { snapshot(els.concat(els.map(function (e) { return e.parentElement; }))); els.forEach(sendBack); status('Sent behind its neighbours.'); return; }
    if (liveOnly(els)) {   // stats pieces
      if (act === 'delete') {
        var host = els[0].closest('.frame, .portrait') || els[0].parentElement;
        snapshot(els);
        els.forEach(function (el) { if (el.matches('.sound-btn')) el.style.display = 'none'; else el.remove(); });   // the sound button is only hidden (Undo brings it back)
        sel = []; paintSel(); markStyle(host); status('Removed. Save to keep it.', 'warn'); return;
      }
      if (act === 'dup' && els.some(function (el) { return el.matches('.sound-btn'); })) { status('A video has one sound button.'); return; }
      if (act === 'dup') { var outL = els.map(function (el) { var c = el.cloneNode(true); c.classList.remove('m07-sel'); el.after(c); return c; }); sel = outL; paintSel(); markStyle(outL[0]); status('Duplicated. Save to keep it.', 'warn'); return; }
      status('Those pieces live inside their video box. Use Bigger box to move the box.'); return;
    }
    if (anyLive(els)) { status('Pick only boxes from the page (or only the stats pieces) for that.', 'warn'); return; }
    if (act === 'dup') return fileOp(label(els, 'Duplicated'), els, function (doc, refs) {
      return refs.map(function (r) { guard(r); var c = stripIds(r.cloneNode(true)); r.after(c); return c; });
    });
    if (act === 'delete') return fileOp(label(els, 'Deleted'), els, function (doc, refs) {
      var last = refs[refs.length - 1];
      var next = last.nextElementSibling || refs[0].previousElementSibling || last.parentElement;
      refs.forEach(function (r) { guard(r); r.remove(); });
      return next && doc.documentElement.contains(next) ? [next] : [];
    });
    if (act === 'up') return fileOp(label(els, 'Moved') + ' up', els, function (doc, refs) {
      var moved = false;
      refs.forEach(function (r) { guard(r); var prev = r.previousElementSibling; if (prev && refs.indexOf(prev) < 0) { prev.before(r); moved = true; } });
      if (!moved) { status('Already first in its box. Use Bigger box to move the box around it.'); return false; }
      return refs;
    });
    if (act === 'down') return fileOp(label(els, 'Moved') + ' down', els, function (doc, refs) {
      var moved = false;
      refs.slice().reverse().forEach(function (r) { guard(r); var next = r.nextElementSibling; if (next && refs.indexOf(next) < 0) { next.after(r); moved = true; } });
      if (!moved) { status('Already last in its box. Use Bigger box to move the box around it.'); return false; }
      return refs;
    });
  }
  function ancestorsOf(els) {
    var out = [];
    els.forEach(function (el) { for (var n = el.parentElement; n && n !== document.body; n = n.parentElement) if (out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  boxBar.addEventListener('mousedown', function (e) { e.preventDefault(); });
  boxBar.addEventListener('click', function (e) { var b = e.target.closest('[data-lay]'); if (b) layoutAction(b.dataset.lay); });

  document.addEventListener('keydown', function (e) {
    if (!layout || modalOpen || e.target.closest('.m07-ui input, .m07-ui select, .m07-ui textarea')) return;
    var mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'c') { e.preventDefault(); copyBoxes(); return; }
    if (mod && k === 'v') { e.preventDefault(); pasteBoxes(); return; }
    if (mod && k === 'd') { e.preventDefault(); layoutAction('dup'); return; }
    if (!sel.length) return;
    if (k === 'escape') { e.preventDefault(); selectOnly(null); return; }
    if (k === 'backspace' || k === 'delete') { e.preventDefault(); layoutAction('delete'); return; }
    var step = e.shiftKey ? 10 : 1, d = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
    if (d) {
      e.preventDefault();
      if (!e.repeat) snapshot(sel.slice());
      sel.forEach(function (el) { var v = vars(el); setVars(el, Object.assign(v, { x: v.x + d[0], y: v.y + d[1] })); markStyle(el); });
    }
  }, true);

  function initLayout() {
    [tag, rotH, boxBar, guideX, guideY].concat(handleEls).forEach(function (el) { document.body.appendChild(el); });
    if (readPref('layout') === '1') setLayout(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLayout); else initLayout();
  function afterReady() {
    var a; try { a = JSON.parse(readSession('after') || 'null'); } catch (e) {}
    if (!a || a.page !== PAGE) return;
    writeSession('after', null);
    window.scrollTo(0, a.y || 0);
    if (a.layout && !layout) setLayout(true);
    var want = [].concat(a.sel == null ? [] : a.sel), found = [];
    for (var i = 0; i < LIVE.length; i++) if (want.indexOf(LIVE[i].__pid) > -1) found.push(LIVE[i]);
    sel = found; paintSel();
    status(a.msg);
  }

  /* ------------------------------------------------------------------ TRIM: cut a video to any length
   * Drag the pink handles on the filmstrip (or press I / O at the playhead), preview the cut,
   * then Save as new clip (keeps the original) or Replace original (old one kept in .editor-backups).
   */
  var modalOpen = false;
  var trimUI = h('div', { class: 'm07-ui m07-trim', hidden: '', role: 'dialog', 'aria-label': 'Trim video' },
    '<div class="m07-trim-box">' +
      '<div class="m07-trim-head"><b>Trim video</b><span class="m07-trim-name"></span><button type="button" data-trim="close" title="Close (Esc)">×</button></div>' +
      '<div class="m07-trim-stage"><video playsinline preload="auto"></video></div>' +
      '<div class="m07-tl"><div class="m07-tl-strip"></div><div class="m07-tl-dim l"></div><div class="m07-tl-dim r"></div><div class="m07-tl-sel"></div>' +
        '<i class="m07-tl-in" title="Drag to set the start"></i><i class="m07-tl-out" title="Drag to set the end"></i><i class="m07-tl-head"></i></div>' +
      '<div class="m07-trim-row">' +
        '<button type="button" data-trim="play" class="m07-trim-play" title="Play / pause the cut (Space)">▶ Play</button>' +
        '<span class="m07-trim-time">0:00.0</span>' +
        '<button type="button" data-trim="in" title="Start here (I)">[ Start here</button>' +
        '<button type="button" data-trim="out" title="End here (O)">End here ]</button>' +
        '<label>Start <input name="start" inputmode="decimal"></label>' +
        '<label>End <input name="end" inputmode="decimal"></label>' +
        '<span class="m07-trim-len"></span>' +
      '</div>' +
      '<div class="m07-trim-row m07-trim-actions">' +
        '<button type="button" data-trim="new" class="m07-trim-main" title="Keeps the original (Enter)">Save as new clip</button>' +
        '<button type="button" data-trim="replace" title="The original is kept in .editor-backups">Replace original</button>' +
        '<button type="button" data-trim="close">Cancel</button>' +
        '<span class="m07-trim-msg">Drag the pink handles, or play and press I / O. ← → step one frame.</span>' +
      '</div>' +
    '</div>');
  var tv = trimUI.querySelector('video'), tl = trimUI.querySelector('.m07-tl');
  var T = { name: '', src: '', dur: 0, a: 0, b: 0, done: null };
  function fmtT(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
  function parseT(v) {
    v = String(v || '').trim(); if (!v) return NaN;
    var parts = v.split(':').map(parseFloat);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0];
  }
  function trimDraw() {
    if (!T.dur) return;
    var pa = T.a / T.dur * 100, pb = T.b / T.dur * 100, ph = (tv.currentTime || 0) / T.dur * 100;
    trimUI.querySelector('.m07-tl-in').style.left = pa + '%';
    trimUI.querySelector('.m07-tl-out').style.left = pb + '%';
    trimUI.querySelector('.m07-tl-sel').style.cssText = 'left:' + pa + '%;width:' + (pb - pa) + '%';
    trimUI.querySelector('.m07-tl-dim.l').style.width = pa + '%';
    trimUI.querySelector('.m07-tl-dim.r').style.cssText = 'left:' + pb + '%;right:0';
    trimUI.querySelector('.m07-tl-head').style.left = ph + '%';
    trimUI.querySelector('.m07-trim-time').textContent = fmtT(tv.currentTime) + ' / ' + fmtT(T.dur);
    var si = trimUI.querySelector('[name=start]'), ei = trimUI.querySelector('[name=end]');
    if (document.activeElement !== si) si.value = fmtT(T.a);
    if (document.activeElement !== ei) ei.value = fmtT(T.b);
    trimUI.querySelector('.m07-trim-len').textContent = 'Length ' + fmtT(T.b - T.a) + ' (was ' + fmtT(T.dur) + ')';
    trimUI.querySelector('.m07-trim-play').textContent = tv.paused ? '▶ Play' : '❚❚ Pause';
  }
  function setRange(a, b, seekTo) {
    var min = 0.1;
    a = Math.max(0, Math.min(a, T.dur - min)); b = Math.min(T.dur, Math.max(b, a + min));
    T.a = a; T.b = b;
    if (seekTo != null) { tv.pause(); tv.currentTime = seekTo; }
    trimDraw();
  }
  var trimRaf;
  function trimLoop() {
    cancelAnimationFrame(trimRaf);
    if (!modalOpen) return;
    if (!tv.paused && tv.currentTime >= T.b - 0.02) tv.currentTime = T.a;   // loop the cut while previewing
    trimDraw();
    trimRaf = requestAnimationFrame(trimLoop);
  }
  function openTrim(name, done) {
    var ext = /\.(mp4|mov|webm|m4v)$/i.exec(name);
    if (!ext) { status('Only videos can be trimmed.', 'err'); return; }
    T = { name: name, src: 'assets/uploads/' + name, dur: 0, a: 0, b: 0, done: done || null };
    modalOpen = true; trimUI.hidden = false;
    trimUI.querySelector('.m07-trim-name').textContent = name;
    trimUI.querySelector('[data-trim="replace"]').disabled = !/\.mp4$/i.test(name);
    trimUI.querySelector('.m07-trim-msg').textContent = 'Drag the pink handles, or play and press I / O. ← → step one frame.';
    trimUI.querySelectorAll('[data-trim="new"],[data-trim="replace"]').forEach(function (b) { b.classList.remove('busy'); });
    var strip = trimUI.querySelector('.m07-tl-strip');
    strip.style.backgroundImage = 'url("/__editor/filmstrip?name=' + encodeURIComponent(name) + '")';
    tv.src = '/' + T.src; tv.muted = false;
    tv.onloadedmetadata = function () { T.dur = tv.duration || 0; setRange(0, T.dur, 0); };
    trimLoop();
  }
  function closeTrim() { modalOpen = false; trimUI.hidden = true; tv.pause(); tv.removeAttribute('src'); tv.load(); }
  function timeAt(clientX) { var r = tl.getBoundingClientRect(); return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * T.dur; }
  tl.addEventListener('pointerdown', function (e) {
    if (!T.dur) return;
    e.preventDefault();
    var which = e.target.classList.contains('m07-tl-in') ? 'in' : e.target.classList.contains('m07-tl-out') ? 'out' : 'head';
    tl.setPointerCapture(e.pointerId);
    function move(ev) {
      var t = timeAt(ev.clientX);
      if (which === 'in') setRange(t, T.b, Math.max(0, Math.min(t, T.b - 0.1)));
      else if (which === 'out') setRange(T.a, t, Math.min(T.dur, Math.max(t, T.a + 0.1)));
      else { tv.currentTime = t; trimDraw(); }
    }
    function up() { tl.removeEventListener('pointermove', move); tl.removeEventListener('pointerup', up); }
    tl.addEventListener('pointermove', move); tl.addEventListener('pointerup', up);
    move(e);
  });
  function trimPlay() {
    if (!T.dur) return;
    if (tv.paused) { if (tv.currentTime < T.a || tv.currentTime >= T.b - 0.05) tv.currentTime = T.a; var p = tv.play(); if (p && p.catch) p.catch(function () {}); }
    else tv.pause();
    trimDraw();
  }
  function trimSave(mode) {
    if (!T.dur || trimUI.querySelector('.busy')) return;
    var btn = trimUI.querySelector('[data-trim="' + mode + '"]');
    if (mode === 'replace' && btn.dataset.sure !== '1') {
      btn.dataset.sure = '1'; btn.textContent = 'Sure? Replace';
      setTimeout(function () { btn.dataset.sure = ''; btn.textContent = 'Replace original'; }, 3000);
      return;
    }
    tv.pause(); btn.classList.add('busy');
    var msg = trimUI.querySelector('.m07-trim-msg');
    msg.textContent = 'Cutting ' + fmtT(T.b - T.a) + '… (longer clips take a bit)';
    fetch('/__editor/trim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: T.name, start: T.a, end: T.b, mode: mode }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        btn.classList.remove('busy');
        if (!d.ok) throw new Error(d.error);
        var cb = T.done;
        closeTrim();
        if (d.replaced) {   // same file name: reload it everywhere on this page
          document.querySelectorAll('video.slot-media').forEach(function (v) {
            if (v.getAttribute('src') === d.src || (v.getAttribute('data-playlist') || '').split('|').indexOf(d.src) > -1) { var t = v.currentTime; v.load(); v.currentTime = 0; }
          });
        }
        status((d.replaced ? 'Replaced ' : 'Saved new clip ') + d.name + ' (' + fmtT(d.length) + ', ' + (d.size / 1048576).toFixed(1) + ' MB).' + (cb && !d.replaced ? ' Swapped into the frame. Save the page to keep it.' : ''), cb && !d.replaced ? 'warn' : '');
        if (cb) cb(d);
        loadLibrary();
      })
      .catch(function (err) { btn.classList.remove('busy'); msg.textContent = err.message; });
  }
  trimUI.addEventListener('click', function (e) {
    if (e.target === trimUI) { closeTrim(); return; }
    var b = e.target.closest('[data-trim]'); if (!b) return;
    var k = b.dataset.trim;
    if (k === 'close') closeTrim();
    else if (k === 'play') trimPlay();
    else if (k === 'in') setRange(tv.currentTime, T.b);
    else if (k === 'out') setRange(T.a, tv.currentTime);
    else if (k === 'new' || k === 'replace') trimSave(k);
  });
  trimUI.addEventListener('change', function (e) {
    var t = parseT(e.target.value);
    if (t !== t) { trimDraw(); return; }
    if (e.target.name === 'start') setRange(t, T.b, t); else if (e.target.name === 'end') setRange(T.a, t, t);
  });
  document.addEventListener('keydown', function (e) {
    if (!modalOpen) return;
    var inField = e.target.matches && e.target.matches('.m07-trim input');
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeTrim(); return; }
    if (inField) { if (k === 'Enter') e.target.blur(); return; }
    if (e.metaKey || e.ctrlKey) return;
    var step = e.shiftKey ? 1 : 1 / 30;
    var map = {
      ' ': trimPlay,
      i: function () { setRange(tv.currentTime, T.b); }, I: function () { setRange(tv.currentTime, T.b); },
      o: function () { setRange(T.a, tv.currentTime); }, O: function () { setRange(T.a, tv.currentTime); },
      ArrowLeft: function () { tv.pause(); tv.currentTime = Math.max(0, tv.currentTime - step); },
      ArrowRight: function () { tv.pause(); tv.currentTime = Math.min(T.dur, tv.currentTime + step); },
      Enter: function () { trimSave('new'); }
    };
    if (map[k]) { e.preventDefault(); e.stopImmediatePropagation(); map[k](); }
    else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.body ? document.body.appendChild(trimUI) : document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(trimUI); });

  /* ------------------------------------------------------------------ UNDO / REDO for everything
   * Every change (text, media, stats, moves, sizes, deletes, pastes...) is recorded as the whole
   * page as it would be saved. Undo goes back one step: moves / sizes / tilts snap back instantly;
   * anything else (a delete, a paste, text, media) saves the earlier version and reloads the page
   * where you were. Works after reloads too (until the tab is closed). Cmd+Shift+Z redoes.
   */
  var hist = [], redoStack = [], curHtml = null, histTimer = 0, pendingLive = null, pendingKinds = {}, quietHist = false;
  function histKey(k) { return 'm07ed-' + k + '-' + PAGE; }
  function loadStack(k) { try { var a = JSON.parse(sessionStorage.getItem(histKey(k)) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function storeStack(k, arr) {
    var plain = arr.map(function (e) { return { html: e.html, label: e.label || '' }; });
    while (true) {
      var str = JSON.stringify(plain);
      if (str.length < 1500000 || !plain.length) {
        try { sessionStorage.setItem(histKey(k), str); return; } catch (e) { if (!plain.length) return; }
      }
      plain.shift(); arr.shift();   // too big for the browser's storage: drop the oldest step
    }
  }
  function storeStacks() { storeStack('hist', hist); storeStack('redo', redoStack); }
  function pushHist(e) { hist.push(e); if (hist.length > 60) hist.shift(); }
  function snapHtml() { return '<!doctype html>\n' + buildDoc([]).doc.documentElement.outerHTML + '\n'; }
  function initHistory() {
    try { curHtml = snapHtml(); } catch (e) { curHtml = null; }
    hist = loadStack('hist'); redoStack = loadStack('redo');
  }
  function noteChange(kind) {
    if (quietHist || !ready) return;
    pendingKinds[kind] = 1;
    clearTimeout(histTimer); histTimer = setTimeout(commitHist, 400);
  }
  function commitHist() {
    clearTimeout(histTimer); histTimer = 0;
    if (!ready || curHtml == null) return;
    var now; try { now = snapHtml(); } catch (e) { return; }
    if (now !== curHtml) {
      var styleOnly = Object.keys(pendingKinds).every(function (k) { return k === 'style'; });
      pushHist({ html: curHtml, live: styleOnly ? pendingLive : null });
      redoStack = []; storeStacks();
    }
    curHtml = now; pendingLive = null; pendingKinds = {};
    // auto-save shortly after every change, so nothing is lost if the tab closes or reloads
    scheduleAutoSave();
  }
  var autoSaveTimer = 0;
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () { if (changeCount !== savedCount && !saving) save(); }, 1200);
  }
  function undoAll() {
    if (!ready) return;
    if (histTimer) commitHist();
    var e = hist.pop();
    if (!e) { status('Nothing to undo.'); return; }
    redoStack.push({ html: curHtml });
    if (e.live && e.live.length && e.live.every(function (u) { return u.el.isConnected; })) {
      quietHist = true;
      e.live.slice().reverse().forEach(function (u) {   // oldest state wins
        if (u.style == null) u.el.removeAttribute('style'); else u.el.setAttribute('style', u.style);
        markStyle(u.el);
      });
      quietHist = false;
      try { curHtml = snapHtml(); } catch (er) { curHtml = e.html; }
      storeStacks(); status('Undone. (Cmd+Shift+Z to redo)'); scheduleAutoSave(); return;
    }
    storeStacks(); jumpTo(e.html, 'Undone. (Cmd+Shift+Z to redo)');
  }
  function redoAll() {
    if (!ready) return;
    if (histTimer) commitHist();
    var e = redoStack.pop();
    if (!e) { status('Nothing to redo.'); return; }
    pushHist({ html: curHtml }); storeStacks();
    jumpTo(e.html, 'Redone.');
  }
  function jumpTo(html, msg) {
    if (saving) return;
    saving = true; status('One moment…');
    fetch('/__editor/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: PAGE, html: html }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        saving = false;
        if (!d.ok) throw new Error(d.error || 'Save failed');
        writeSession('after', JSON.stringify({ page: PAGE, y: window.scrollY, sel: [], layout: layout, msg: msg }));
        savedCount = changeCount;
        location.reload();
      })
      .catch(function (err) { saving = false; status('Couldn’t undo: ' + err.message, 'err'); });
  }
  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (!mod || (k !== 'z' && k !== 'y') || modalOpen) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;   // typing in a field: its own undo
    var redo = k === 'y' || e.shiftKey;
    // typing in a text box: undo the typing first, then everything else
    if (!redo && active && active.contains(e.target) && document.queryCommandEnabled && document.queryCommandEnabled('undo')) return;
    e.preventDefault(); e.stopPropagation();
    if (redo) redoAll(); else { deactivate(); undoAll(); }
  }, true);

  /* ------------------------------------------------------------------ save */
  function noRuntimeStyle(st) { return (st || '').replace(/(^|;)\s*--stat-k\s*:[^;]*;?/g, '$1').trim(); }
  function cleanInner(el) {
    var c = el.cloneNode(true);
    c.querySelectorAll('[style*="--stat-k"]').forEach(function (n) { var st = noRuntimeStyle(n.getAttribute('style')); if (st) n.setAttribute('style', st); else n.removeAttribute('style'); });
    // the sound button is made by the site's script: keep its Layout changes on the video instead
    c.querySelectorAll('.sound-btn').forEach(function (b) {
      var v = b.parentElement && b.parentElement.querySelector('video.slot-media:not(.pl-buf)');
      if (!v) return;
      var st = b.getAttribute('style');
      if (st && st.trim()) v.setAttribute('data-sound-style', st); else v.removeAttribute('data-sound-style');
    });
    c.querySelectorAll('.m07-ui, .bub, .sound-btn, .pl-buf, .mq-clone').forEach(function (n) { n.remove(); });
    c.querySelectorAll('.track[style]').forEach(function (n) { n.style.removeProperty('animation-duration'); if (!n.getAttribute('style').trim()) n.removeAttribute('style'); });
    c.querySelectorAll('video[data-playlist]').forEach(function (v) {
      var first = v.getAttribute('data-playlist').split('|')[0];
      if (first) v.setAttribute('src', first);
      v.removeAttribute('loop');
    });
    c.querySelectorAll('.tc').forEach(function (n) { n.textContent = '00:00:00:00'; });
    c.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    c.querySelectorAll('[class]').forEach(function (n) {
      var keep = n.className.split(/\s+/).filter(function (t) { return t && !/^m07-/.test(t) && t !== 'pre' && t !== 'is-hidden' && t !== 'pl-hide'; });
      if (keep.length) n.className = keep.join(' '); else n.removeAttribute('class');
    });
    c.querySelectorAll('video.slot-media').forEach(function (v) { v.removeAttribute('style'); });
    return c.innerHTML;
  }
  function cleanClass(el) {
    return el.className.split(/\s+/).filter(function (t) { return t && !/^m07-/.test(t) && t !== 'pre' && t !== 'is-hidden' && t !== 'open'; }).join(' ');
  }
  // The page file with every unsaved change applied. refs: file nodes for the given pids (taken before changes)
  function buildDoc(pids) {
    var doc = new DOMParser().parseFromString(ORIGINAL, 'text/html');
    var pristine = doc.getElementsByTagName('*');
    var refs = pids.map(function (pid) { return pid == null ? null : pristine[pid]; });
    var jobs = [];
    dirty.forEach(function (kinds, el) { jobs.push({ el: el, kinds: kinds, p: pristine[el.__pid] }); });
    jobs.forEach(function (j) {
      if (!j.p || j.p.tagName !== j.el.tagName) throw new Error('Could not match an edited element. Reload the page and try again.');
    });
    jobs.forEach(function (j) {
      if (j.kinds.has('html')) j.p.innerHTML = cleanInner(j.el);
      if (j.kinds.has('style')) { var st = noRuntimeStyle(j.el.getAttribute('style')); if (st && st.trim()) j.p.setAttribute('style', st); else j.p.removeAttribute('style'); }
      if (j.kinds.has('aria')) j.p.removeAttribute('aria-hidden');
      if (j.kinds.has('class')) { var cl = cleanClass(j.el); if (cl) j.p.className = cl; else j.p.removeAttribute('class'); }
    });
    return { doc: doc, refs: refs };
  }
  var saving = false;
  function save() {
    if (!ready) { status('Still loading, try again in a second.', 'warn'); return; }
    if (changeCount === savedCount) { status('Nothing new to save.'); return; }
    if (saving) return;
    saving = true;
    status('Saving…');
    var countAtSave = changeCount;
    var doc;
    try { doc = buildDoc([]).doc; } catch (err) { saving = false; status(err.message, 'err'); return; }
    var html = '<!doctype html>\n' + doc.documentElement.outerHTML + '\n';
    fetch('/__editor/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: PAGE, html: html }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        saving = false;
        if (!d.ok) throw new Error(d.error || 'Save failed');
        savedCount = countAtSave;
        refreshStatus();
        learnStatLayouts();
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

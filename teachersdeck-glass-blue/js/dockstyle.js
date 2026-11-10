/* Dock styles (Item Store, owner 10 Nov 2026): the widget launcher can look and open in five ways besides the app's
 * standard docks. Each style is a store item (kind 'dock'); this file is the app code that draws them. Same file in
 * StudentDeck and ParentDeck (tools/check_shared.py). The app tells it about its widgets with configure().
 *
 *   float    the bottom dock floats and bobs, icons only (labels on hover), up to 9 widgets + a button for the widget tray
 *   magnify  the same 9 + tray, icons grow as the pointer passes
 *   sidebar  a 52px icon rail on the left that opens to 240px: favourites on top, every widget under its category,
 *            All widgets and a pin at the bottom; the app's docks step aside
 *   circle   one round button (bottom right) opens two rings: categories inside; pointing at one opens its widgets outside
 *   radial   right-click (or long-press) on an empty part of the wall opens the same two rings at the pointer; the
 *            standard docks stay
 * Esc or a click outside closes a ring; Tab moves through every button. */
(function (root) {
  'use strict';
  var STYLES = ['standard', 'float', 'magnify', 'sidebar', 'circle', 'radial'];
  var MAX_DOCK = 9;
  var cfg = null, style = 'standard', nodes = {}, observer = null, pinned = false;
  try { pinned = localStorage.getItem('dockstyle.pinned') === '1'; } catch (e) {}

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function L(k) { return (cfg && cfg.labels && cfg.labels[k]) || k; }
  var TRAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
  var PIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z"/></svg>';

  function widgetButton(w, cls) {
    var b = el('button', cls, '<span class="dk-ic">' + w.icon + '</span><span class="dk-lb">' + esc(w.label) + '</span>');
    b.type = 'button'; b.dataset.id = w.id; b.title = w.label; b.setAttribute('aria-label', w.label);
    if (cfg.isOpen(w.id)) b.classList.add('on');
    b.addEventListener('click', function (e) { e.stopPropagation(); cfg.toggle(w.id); closeRings(); refresh(); });
    return b;
  }
  function trayButton(cls) {
    var b = el('button', cls, '<span class="dk-ic">' + TRAY_ICON + '</span><span class="dk-lb">' + esc(L('tray')) + '</span>');
    b.type = 'button'; b.title = L('tray'); b.setAttribute('aria-label', L('tray'));
    b.addEventListener('click', function (e) { e.stopPropagation(); closeRings(); cfg.openTray(); });
    return b;
  }

  /* ---------- float / magnify: the app's own bottom dock, trimmed to 9 with a tray button ---------- */
  function decorateDock() {
    var dock = document.getElementById('dock'); if (!dock) return;
    if (observer) observer.disconnect();
    var items = dock.querySelectorAll('.dock-item');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('dk-over', i >= MAX_DOCK);
    var t = dock.querySelector('.dk-tray-btn');
    if (!t) { t = trayButton('dock-item dk-tray-btn'); dock.appendChild(t); } else dock.appendChild(t);   // keep it last
    observer = new MutationObserver(function () { if (style === 'float' || style === 'magnify') decorateDock(); });
    observer.observe(dock, { childList: true });
  }
  function undecorateDock() {
    if (observer) { observer.disconnect(); observer = null; }
    var dock = document.getElementById('dock'); if (!dock) return;
    var t = dock.querySelector('.dk-tray-btn'); if (t) t.remove();
    Array.prototype.forEach.call(dock.querySelectorAll('.dk-over'), function (x) { x.classList.remove('dk-over'); });
    Array.prototype.forEach.call(dock.querySelectorAll('.dock-item'), function (x) { x.style.removeProperty('--dk-scale'); });
  }
  function onMagnify(e) {
    var dock = document.getElementById('dock'); if (!dock) return;
    Array.prototype.forEach.call(dock.querySelectorAll('.dock-item:not(.dk-over)'), function (b) {
      var r = b.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2));
      b.style.setProperty('--dk-scale', (1 + 0.55 * Math.max(0, 1 - d / 130)).toFixed(3));
    });
  }
  function offMagnify() {
    var dock = document.getElementById('dock'); if (!dock) return;
    Array.prototype.forEach.call(dock.querySelectorAll('.dock-item'), function (b) { b.style.setProperty('--dk-scale', '1'); });
  }

  /* ---------- sidebar ---------- */
  function buildSidebar() {
    var nav = nodes.sidebar || (nodes.sidebar = el('nav', 'dk-sidebar'));
    nav.setAttribute('aria-label', L('widgets'));
    nav.classList.toggle('pinned', pinned);
    nav.innerHTML = '';
    var top = el('div', 'dk-sb-scroll'), ws = cfg.widgets(), favs = cfg.favourites().slice(0, 6);
    if (favs.length) {
      top.appendChild(el('p', 'dk-sb-head', esc(L('favourites'))));
      favs.forEach(function (id) { var w = ws.filter(function (x) { return x.id === id; })[0]; if (w) top.appendChild(widgetButton(w, 'dk-sb-item')); });
    }
    cfg.categories().forEach(function (c) {
      var list = ws.filter(function (w) { return w.cat === c[0]; }); if (!list.length) return;
      top.appendChild(el('p', 'dk-sb-head', esc(c[1])));
      list.forEach(function (w) { top.appendChild(widgetButton(w, 'dk-sb-item')); });
    });
    nav.appendChild(top);
    var foot = el('div', 'dk-sb-foot');
    foot.appendChild(trayButton('dk-sb-item'));
    var pin = el('button', 'dk-sb-item dk-pin' + (pinned ? ' on' : ''), '<span class="dk-ic">' + PIN_ICON + '</span><span class="dk-lb">' + esc(L(pinned ? 'unpin' : 'pin')) + '</span>');
    pin.type = 'button'; pin.setAttribute('aria-pressed', String(pinned));
    pin.addEventListener('click', function () { pinned = !pinned; try { localStorage.setItem('dockstyle.pinned', pinned ? '1' : '0'); } catch (e) {} document.body.classList.toggle('dk-pinned', pinned); buildSidebar(); });
    foot.appendChild(pin);
    nav.appendChild(foot);
    if (!nav.parentNode) document.body.appendChild(nav);
    document.body.classList.toggle('dk-pinned', pinned);
  }

  /* ---------- circle and radial: two rings ---------- */
  function closeRings() { if (nodes.rings) { nodes.rings.remove(); nodes.rings = null; } document.removeEventListener('keydown', ringKeys, true); }
  function ringKeys(e) { if (e.key === 'Escape') { e.stopPropagation(); closeRings(); if (nodes.launcher) nodes.launcher.focus(); } }
  function place(node, cx, cy, r, a) { var rad = a * Math.PI / 180; node.style.left = (cx + r * Math.sin(rad)) + 'px'; node.style.top = (cy - r * Math.cos(rad)) + 'px'; }
  function openRings(cx, cy) {
    closeRings();
    var veil = el('div', 'dk-veil'), cats = cfg.categories().filter(function (c) { return cfg.widgets().some(function (w) { return w.cat === c[0]; }); });
    var W = window.innerWidth, H = window.innerHeight, R1 = 74, R2 = 150, pad = R2 + 40;
    cx = Math.max(pad, Math.min(W - pad, cx)); cy = Math.max(pad, Math.min(H - pad, cy));
    veil.addEventListener('click', closeRings);
    veil.addEventListener('contextmenu', function (e) { e.preventDefault(); closeRings(); });
    var ring = el('div', 'dk-rings'); ring.style.left = cx + 'px'; ring.style.top = cy + 'px';
    ring.setAttribute('role', 'menu'); ring.setAttribute('aria-label', L('widgets'));
    ring.addEventListener('click', function (e) { e.stopPropagation(); });
    veil.appendChild(ring);
    var hub = trayButton('dk-hub'); ring.appendChild(hub);
    var outer = el('div', 'dk-outer'); ring.appendChild(outer);
    function showCat(i) {
      Array.prototype.forEach.call(ring.querySelectorAll('.dk-cat'), function (b, j) { b.classList.toggle('on', j === i); b.setAttribute('aria-expanded', String(j === i)); });
      outer.innerHTML = '';
      var list = cfg.widgets().filter(function (w) { return w.cat === cats[i][0]; }), mid = i * 360 / cats.length;
      var span = Math.min(300, Math.max(90, list.length * 34)), step = list.length > 1 ? span / (list.length - 1) : 0;
      list.forEach(function (w, k) { var b = widgetButton(w, 'dk-wid'); place(b, 0, 0, R2, mid - span / 2 + k * step); b.setAttribute('role', 'menuitem'); outer.appendChild(b); });
    }
    cats.forEach(function (c, i) {
      var b = el('button', 'dk-cat', '<span>' + esc(c[1]) + '</span>'); b.type = 'button'; b.setAttribute('aria-haspopup', 'true');
      place(b, 0, 0, R1, i * 360 / cats.length);
      b.addEventListener('mouseenter', function () { showCat(i); });
      b.addEventListener('focus', function () { showCat(i); });
      b.addEventListener('click', function () { showCat(i); var f = outer.querySelector('button'); if (f) f.focus(); });
      ring.appendChild(b);
    });
    document.body.appendChild(veil); nodes.rings = veil;
    document.addEventListener('keydown', ringKeys, true);
    if (cats.length) showCat(0);
    var first = ring.querySelector('.dk-cat'); if (first) first.focus();
  }
  function buildLauncher() {
    var b = nodes.launcher || (nodes.launcher = el('button', 'dk-launcher', TRAY_ICON));
    b.type = 'button'; b.title = L('widgets'); b.setAttribute('aria-label', L('widgets')); b.setAttribute('aria-haspopup', 'menu');
    b.onclick = function () { var r = b.getBoundingClientRect(); nodes.rings ? closeRings() : openRings(r.left + r.width / 2, r.top + r.height / 2); };
    if (!b.parentNode) document.body.appendChild(b);
  }
  var press = null;
  function onContext(e) {
    if (style !== 'radial') return;
    var wall = document.getElementById('wall');
    if (!wall || !wall.contains(e.target) || e.target.closest('.widget,.panel,[data-widget],input,textarea,[contenteditable]')) return;
    e.preventDefault(); openRings(e.clientX, e.clientY);
  }
  function onDown(e) {
    if (style !== 'radial' || e.pointerType !== 'touch') return;
    var x = e.clientX, y = e.clientY, t = e.target;
    press = setTimeout(function () { onContext({ target: t, clientX: x, clientY: y, preventDefault: function () {} }); }, 550);
  }
  function onUp() { clearTimeout(press); }

  /* ---------- switching ---------- */
  function clear() {
    closeRings(); undecorateDock();
    if (nodes.sidebar) { nodes.sidebar.remove(); nodes.sidebar = null; }
    if (nodes.launcher) { nodes.launcher.remove(); nodes.launcher = null; }
    STYLES.forEach(function (s) { document.body.classList.remove('dk-' + s); });
    document.body.classList.remove('dk-pinned');
    var dock = document.getElementById('dock'); if (dock) { dock.removeEventListener('mousemove', onMagnify); dock.removeEventListener('mouseleave', offMagnify); }
    ['bg', 'line', 'ink', 'acc', 'hov'].forEach(function (k) { document.body.style.removeProperty('--dk-' + k); });
  }
  /** Shows a style. item: the dock store item (its optional colours), or null for the standard docks. */
  function apply(s, item) {
    if (!cfg) return;
    clear();
    style = STYLES.indexOf(s) >= 0 ? s : 'standard';
    if (style === 'standard') return;
    document.body.classList.add('dk-' + style);
    if (item && item.tokens) Object.keys(item.tokens).forEach(function (k) { document.body.style.setProperty('--dk-' + k, item.tokens[k]); });
    if (style === 'float' || style === 'magnify') decorateDock();
    if (style === 'magnify') { var dock = document.getElementById('dock'); dock.addEventListener('mousemove', onMagnify); dock.addEventListener('mouseleave', offMagnify); }
    if (style === 'sidebar') buildSidebar();
    if (style === 'circle') buildLauncher();
  }
  /** Re-marks open widgets (call when a widget opens or closes, or the widget list changes). */
  function refresh() {
    if (!cfg) return;
    if (style === 'sidebar') buildSidebar();
    Array.prototype.forEach.call(document.querySelectorAll('.dk-sb-item[data-id],.dk-wid[data-id]'), function (b) { b.classList.toggle('on', !!cfg.isOpen(b.dataset.id)); });
  }
  /** cfg: { widgets() -> [{ id, label, icon, cat }], categories() -> [[id, label]], favourites() -> [id], isOpen(id),
   *        toggle(id), openTray(), labels:{ tray, widgets, favourites, pin, unpin } } */
  function configure(c) {
    cfg = c;
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerdown', onDown); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  }
  root.DockStyle = { STYLES: STYLES, MAX_DOCK: MAX_DOCK, configure: configure, apply: apply, refresh: refresh, current: function () { return style; }, openRings: openRings, closeRings: closeRings };
})(typeof self !== 'undefined' ? self : this);

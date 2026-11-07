'use strict';
/* KinderDeck shell: same structure as AdminDeck (wall, floating widgets, docks, app tray, theme + settings drawers). */
const APP_VERSION = '0.10.0';
const $ = (s, r) => (r || document).querySelector(s);
const LS_KEY = 'kd_state_v1';
const DEFAULTS = {lang:'vi', theme:'sunrise', dim:true, loc:'all', active:{}, layout:{}, deactivated:{}, layoutMode:'cozy', showEmojisCustom:true,
  dockPlacement:{}, pillPlacement:{}, dockAutoHide:false, toolbarAutoHide:false, customBg:false, edgeDock:{left:{visible:true}, right:{visible:true}}, docs:[], att:{}, notes:[], seeded:false};
const state = (() => { let s = {}; try { s = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) {} const r = Object.assign({}, DEFAULTS, s); r.edgeDock = Object.assign({}, DEFAULTS.edgeDock, s.edgeDock); const ok = new Set(WIDGETS.map(w => w.id)); ['layout','active','dockPlacement','deactivated'].forEach(k => { if (r[k] && typeof r[k] === 'object') Object.keys(r[k]).forEach(id => { if (!ok.has(id)) delete r[k][id]; }); }); return r; })();
function saveState() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function toast(m, ms) { const e = $('#toast'); e.textContent = m; e.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => e.hidden = true, ms || 2200); }

/* ---------- Icons (24px, stroke style as in AdminDeck) ---------- */
const ICONS = {
  folder:'<path d="M4 4h6l2 2h8v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>',   // v0.10.0 Files
  chart:'<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7 15l4-5 3 3 5-7"/>', inbox:'<path d="M4 13l2-7h12l2 7v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
  child:'<circle cx="12" cy="7" r="3.2"/><path d="M6 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/>', people:'<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8" r="2.4"/><path d="M15.5 14a5 5 0 0 1 5.5 5"/>',
  truck:'<path d="M2 7h11v9H2z"/><path d="M13 10h4l3 3v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  coins:'<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  bowl:'<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M9 4c0 1.5 1 1.5 1 3M14 4c0 1.5 1 1.5 1 3"/>', pulse:'<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  school:'<path d="M3 10 12 4l9 6"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/><path d="M12 4V2"/>', tasks:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  calendar:'<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18"/><path d="M8 2.5v4M16 2.5v4"/><circle cx="8" cy="14" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>',
  megaphone:'<path d="M3 11v3l12 5V6L3 11Z"/><path d="M15 9a3.5 3.5 0 0 1 0 7"/><path d="M6 14.5V19"/>', list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14v3M14 19h2M19 19h2"/>',
  book:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  grip:'<circle cx="9" cy="6.5" r="1.3"/><circle cx="15" cy="6.5" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17.5" r="1.3"/><circle cx="15" cy="17.5" r="1.3"/>',
  minimize:'<path d="M5 12h14"/>', restore:'<rect x="6" y="6" width="12" height="12" rx="2"/>'
};
const iconSvg = (k, c) => `<svg class="${c || ''}" viewBox="0 0 24 24">${ICONS[k] || ''}</svg>`;

/* ---------- Theme and background ---------- */
const PRESETS = [{id:'dusk', css:'linear-gradient(180deg,#1a2740 0%,#2c3b57 38%,#3f4f68 62%,#263248 100%)'}, {id:'chalk', css:'linear-gradient(180deg,#2b2f26 0%,#3a4032 60%,#23261e 100%)'},
  {id:'ocean', css:'linear-gradient(180deg,#0e2f3f 0%,#164a5c 55%,#0c2733 100%)'}, {id:'sunrise', css:'linear-gradient(180deg,#3a2140 0%,#7a4a55 45%,#c98a5e 100%)'},
  {id:'meadow', css:'linear-gradient(180deg,#14302a 0%,#2a5a43 55%,#1b3a2c 100%)'}, {id:'slate', css:'linear-gradient(180deg,#20242c 0%,#2b3038 100%)'}, {id:'plain', css:'#12161C'}];
const bgLayer = $('#bg-layer'), bgOverlay = $('#bg-overlay');
let sessionBgUrl = null;
const idb = {
  db:null,
  open() { return this.db ? Promise.resolve(this.db) : new Promise((ok, no) => { const r = indexedDB.open('KinderDeck', 1); r.onupgradeneeded = () => r.result.createObjectStore('images', {keyPath:'id'}); r.onsuccess = () => { this.db = r.result; ok(this.db); }; r.onerror = () => no(r.error); }); },
  async tx(m, f) { const d = await this.open(); return new Promise((ok, no) => { const t = d.transaction('images', m), s = f(t.objectStore('images')); t.oncomplete = () => ok(s && s.result); t.onerror = () => no(t.error); }); },
  put(v) { return this.tx('readwrite', s => s.put(v)); }, get(k) { return this.tx('readonly', s => s.get(k)); }, del(k) { return this.tx('readwrite', s => s.delete(k)); }
};
function paintPreset() { const p = PRESETS.find(x => x.id === state.theme) || PRESETS[0]; bgLayer.style.background = p.css; bgLayer.style.backgroundSize = 'cover'; }
function applyTheme() { if (sessionBgUrl) bgLayer.style.background = `center/cover no-repeat url(${sessionBgUrl})`; else if (!state.customBg) paintPreset(); bgOverlay.classList.toggle('no-dim', !state.dim); }
async function initCustomBg() { if (!state.customBg) return; try { const r = await idb.get('background'); if (r && r.blob) bgLayer.style.background = `center/cover no-repeat url(${URL.createObjectURL(r.blob)})`; else paintPreset(); } catch (e) { paintPreset(); } }
function buildSwatches() {
  const g = $('#theme-presets'); g.innerHTML = '';
  PRESETS.forEach(p => { const b = document.createElement('button'); b.className = 'swatch' + (state.customBg || sessionBgUrl || state.theme !== p.id ? '' : ' active'); b.style.background = p.css; b.title = p.id; b.setAttribute('aria-label', p.id);
    b.onclick = () => { state.theme = p.id; state.customBg = false; sessionBgUrl = null; saveState(); applyTheme(); buildSwatches(); }; g.appendChild(b); });
  $('#bg-remove').hidden = !(state.customBg || sessionBgUrl);
}
function wireThemeDrawer() {
  const d = $('#theme-drawer');
  $('#btn-theme').onclick = () => { buildSwatches(); $('#dim-toggle').checked = !!state.dim; d.hidden = false; };
  $('#theme-close').onclick = () => d.hidden = true;
  $('#dim-toggle').onchange = e => { state.dim = e.target.checked; saveState(); applyTheme(); };
  $('#bg-upload').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    sessionBgUrl = URL.createObjectURL(f); applyTheme(); buildSwatches();
    try { await idb.put({id:'background', blob:f}); state.customBg = true; saveState(); sessionBgUrl = null; buildSwatches(); toast(t('bg_updated')); } catch (er) { toast(t('bg_not_saved'), 5000); }
  };
  $('#bg-remove').onclick = async () => { sessionBgUrl = null; state.customBg = false; saveState(); try { await idb.del('background'); } catch (e) {} applyTheme(); buildSwatches(); };
}

/* ---------- Language and location ---------- */
function buildLang() {
  const g = $('#lang-toggle'); g.innerHTML = '';
  [['en', 'English'], ['vi', 'Tiếng Việt']].forEach(([c, n]) => { const b = document.createElement('button'); b.textContent = c.toUpperCase(); b.title = n; b.className = state.lang === c ? 'active' : ''; b.onclick = () => setLanguage(c); g.appendChild(b); });
}
function buildLocSelect() {
  const s = $('#loc-select'); s.innerHTML = `<option value="all">${t('loc_all')}</option>` + KD.locs.map(l => `<option value="${l.id}">${l[state.lang]}</option>`).join(''); s.value = state.loc;
  s.onchange = () => { state.loc = s.value; saveState(); refreshAllWidgets(); };
}
function setLanguage(c) { state.lang = c; saveState(); document.documentElement.lang = c; localizeNode(document); buildLang(); buildLocSelect(); rebuildAllDocks(); refreshTitles(); refreshAllWidgets(); buildLayoutModes(); buildPlacementList(); buildPills(); }

/* ---------- Widget wall ---------- */
const wall = $('#wall'), widgetEls = {};
let topZ = 10, gesture = null;
const widgetOn = id => !state.deactivated[id];
const emojisVisible = () => state.layoutMode !== 'compact' && (state.layoutMode === 'cozy' || !!state.showEmojisCustom);
const wname = w => w[state.lang];
const widgetLabel = w => (emojisVisible() ? w.em + ' ' : '') + wname(w);
const bringToFront = el => { if (!el.classList.contains('full') && +el.style.zIndex !== topZ) el.style.zIndex = ++topZ; };
function freeBand() { const tb = $('#topbar'), dk = $('#dock-wrap'); const top = state.toolbarAutoHide ? 8 : Math.ceil(tb.getBoundingClientRect().bottom); const bot = Math.floor(dk.getBoundingClientRect().top); return {top:Math.max(0, top), bottom:bot > 0 ? Math.min(wall.clientHeight || bot, bot) : wall.clientHeight}; }
function clampToBand(el, x, y) { const b = freeBand(), h = (el.querySelector('.widget-head') || {}).offsetHeight || 44; return {x:Math.min(Math.max(0, wall.clientWidth - 150), Math.max(0, x)), y:Math.min(Math.max(b.top, b.bottom - h), Math.max(b.top, y))}; }
function rescueWidgets() { let ch = false; Object.keys(widgetEls).forEach(id => { const e = widgetEls[id].el; if (e.classList.contains('full')) return; const p = clampToBand(e, e.offsetLeft, e.offsetTop); if (p.x !== e.offsetLeft || p.y !== e.offsetTop) { e.style.left = p.x + 'px'; e.style.top = p.y + 'px'; const l = state.layout[id]; if (l) { l.x = p.x; l.y = p.y; } ch = true; } }); if (ch) saveState(); }
function startGesture(g) { if (gesture) endGesture(); gesture = g; bringToFront(g.el); if (g.kind === 'move') g.el.classList.add('dragging'); }
function moveGesture(e) { if (!gesture || e.pointerId !== gesture.pid) return; const g = gesture, dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if (g.kind === 'move') { const p = clampToBand(g.el, g.ox + dx, g.oy + dy); g.el.style.left = p.x + 'px'; g.el.style.top = p.y + 'px'; } else { g.el.style.width = Math.max(260, g.ox + dx) + 'px'; g.el.style.height = Math.max(160, g.oy + dy) + 'px'; } }
function endGesture(e) { if (!gesture || (e && e.pointerId !== undefined && e.pointerId !== gesture.pid)) return; const g = gesture; gesture = null; g.el.classList.remove('dragging'); const l = state.layout[g.id];
  if (l) { if (g.kind === 'move') { l.x = g.el.offsetLeft; l.y = g.el.offsetTop; } else { l.w = g.el.offsetWidth; l.h = g.el.offsetHeight; } saveState(); } }
function defaultLayout(w) { const n = Object.keys(state.layout).filter(id => !WIDGETS.find(x => x.id === id).full).length; return {x:24 + n % 4 * 40, y:Math.max(90, freeBand().top + 12) + n % 4 * 34, w:w.w, h:w.h}; }
function renderWidget(id) { const w = WIDGETS.find(x => x.id === id), r = widgetEls[id]; if (!w || !r) return; const b = r.el.querySelector('.widget-body'); b.innerHTML = w.html(); if (w.wire) w.wire(b, () => renderWidget(id)); }
const refreshWidget = id => renderWidget(id);
const refreshAllWidgets = () => Object.keys(widgetEls).forEach(renderWidget);
function refreshTitles() { Object.keys(widgetEls).forEach(id => { const w = WIDGETS.find(x => x.id === id), e = widgetEls[id].el.querySelector('.widget-title'); if (w && e) e.textContent = widgetLabel(w); }); }
function openWidget(id) {
  const w = WIDGETS.find(x => x.id === id); if (!w || !widgetOn(id)) return; if (widgetEls[id]) { state.active[id] = true; return; }
  if (w.full) WIDGETS.filter(x => x.full && x.id !== id && widgetEls[x.id]).forEach(x => closeWidget(x.id)); // full-screen pages replace each other
  state.active[id] = true; const l = state.layout[id] || (w.full ? {} : defaultLayout(w)); state.layout[id] = l;
  const el = document.createElement('section'); el.className = 'widget' + (w.full ? ' full' : '') + (l.minimized ? ' minimized' : '');
  if (!w.full) { el.style.left = l.x + 'px'; el.style.top = l.y + 'px'; el.style.width = l.w + 'px'; if (l.h && !l.minimized) el.style.height = l.h + 'px'; }
  el.innerHTML = `<div class="widget-head"><button class="widget-drag" aria-label="${t('move_action')}">${iconSvg('grip', 'wsvg')}</button><span class="widget-title">${esc(widgetLabel(w))}</span>
    <div class="widget-head-actions"><button class="widget-min" aria-label="${t(l.minimized ? 'restore_action' : 'minimize_action')}">${iconSvg(l.minimized ? 'restore' : 'minimize', 'wsvg')}</button><button class="widget-close" aria-label="${t('close')}">${iconSvg('close', 'wsvg')}</button></div></div>
    <div class="widget-body"></div><div class="widget-resize"><svg viewBox="0 0 14 14"><path d="M12 2L2 12M12 7L7 12M12 12h0" stroke="currentColor" stroke-width="1.4"/></svg></div>`;
  wall.appendChild(el); widgetEls[id] = {el}; bringToFront(el);
  if (!w.full) {
    const h = el.querySelector('.widget-head'), rz = el.querySelector('.widget-resize');
    h.addEventListener('pointerdown', e => { if ((e.button == null || e.button === 0) && !e.target.closest('.widget-head-actions')) { startGesture({kind:'move', el, id, pid:e.pointerId, sx:e.clientX, sy:e.clientY, ox:el.offsetLeft, oy:el.offsetTop}); try { h.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); } });
    rz.addEventListener('pointerdown', e => { if (e.button == null || e.button === 0) { startGesture({kind:'size', el, id, pid:e.pointerId, sx:e.clientX, sy:e.clientY, ox:el.offsetWidth, oy:el.offsetHeight}); try { rz.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); e.stopPropagation(); } });
    el.addEventListener('pointerdown', () => bringToFront(el));
  }
  el.querySelector('.widget-close').onclick = () => toggleWidget(id); el.querySelector('.widget-min').onclick = () => toggleMinimize(id);
  renderWidget(id);
}
function toggleMinimize(id) { const r = widgetEls[id], l = state.layout[id]; if (!r || !l) return; const b = r.el.querySelector('.widget-min');
  if (l.minimized) { l.minimized = false; r.el.classList.remove('minimized'); if (!r.el.classList.contains('full')) r.el.style.height = (l.prevH || l.h || 260) + 'px'; } else { l.prevH = r.el.offsetHeight; l.minimized = true; r.el.classList.add('minimized'); r.el.style.height = ''; }
  b.innerHTML = iconSvg(l.minimized ? 'restore' : 'minimize', 'wsvg'); b.setAttribute('aria-label', t(l.minimized ? 'restore_action' : 'minimize_action')); saveState(); }
function closeWidget(id) { state.active[id] = false; const r = widgetEls[id]; if (r) { r.el.remove(); delete widgetEls[id]; } }
function toggleWidget(id) { state.active[id] ? closeWidget(id) : openWidget(id); saveState(); syncDock(); }
function syncDock() { document.querySelectorAll('.dock-item[data-id],.dock-top-item[data-id],.app-tray-item[data-id]').forEach(e => e.classList.toggle('active', !!state.active[e.dataset.id])); }
window.addEventListener('pointermove', moveGesture); window.addEventListener('pointerup', endGesture); window.addEventListener('pointercancel', endGesture); window.addEventListener('blur', () => endGesture()); window.addEventListener('resize', rescueWidgets);

/* ---------- Docks, side drawers, top dock, app tray ---------- */
const DOCK_CAPS = {bottom:10, left:5, right:5, top:5}, LAYOUT_MODES = ['compact', 'cozy', 'custom'], PLACEMENTS = ['bottom', 'left', 'right', 'top', 'hidden'];
const DEFAULT_PLACEMENT = {dashboard:'bottom', inbox:'bottom', roster:'bottom', parents:'bottom', suppliers:'bottom', overview:'bottom', fees:'left', meals:'left', kitchen:'bottom', cashflow:'bottom', accounts:'bottom', staff:'bottom', health:'left', attendance:'right', calendar:'right', announce:'right', agenda:'right'};
const widgetsFor = side => WIDGETS.filter(w => widgetOn(w.id) && state.dockPlacement[w.id] === side).slice(0, DOCK_CAPS[side]);
const placementCount = side => widgetsFor(side).length;
function ensurePlacement() { let ch = false; WIDGETS.forEach(w => { if (!state.dockPlacement[w.id]) { state.dockPlacement[w.id] = DEFAULT_PLACEMENT[w.id] || 'hidden'; ch = true; } }); if (ch) saveState(); }
const sideVisible = s => state.layoutMode !== 'compact' && (state.layoutMode === 'cozy' || !!state.edgeDock[s].visible);
function dockBtn(w) { const b = document.createElement('button'); b.className = 'dock-item' + (state.active[w.id] ? ' active' : ''); b.dataset.id = w.id; b.title = wname(w); b.innerHTML = `<span class="dock-ic">${iconSvg(w.icon)}</span><span class="lbl">${esc(widgetLabel(w))}</span>`; b.onclick = () => toggleWidget(w.id); return b; }
function topBtn(w) { const b = document.createElement('button'); b.className = 'dock-top-item' + (state.active[w.id] ? ' active' : ''); b.dataset.id = w.id; b.title = wname(w); b.setAttribute('aria-label', wname(w)); b.innerHTML = iconSvg(w.icon); b.onclick = () => toggleWidget(w.id); return b; }
function trayBtn(w) { const b = document.createElement('button'); b.className = 'app-tray-item' + (state.active[w.id] ? ' active' : ''); b.dataset.id = w.id; b.innerHTML = `<span class="dock-ic">${iconSvg(w.icon)}</span><span>${esc(widgetLabel(w))}</span>`; b.onclick = () => toggleWidget(w.id); return b; }
function rebuildAllDocks() {
  const d = $('#dock'); d.innerHTML = ''; widgetsFor('bottom').forEach(w => d.appendChild(dockBtn(w))); $('#dock-wrap').classList.toggle('auto-hide', !!state.dockAutoHide);
  ['left', 'right'].forEach(s => { const it = $(`#dock-${s}-items`); it.innerHTML = ''; widgetsFor(s).forEach(w => it.appendChild(dockBtn(w))); $(`#dock-${s}`).hidden = !sideVisible(s) || !it.children.length; });
  const tp = $('#dock-top-widgets'); tp.innerHTML = ''; widgetsFor('top').forEach(w => tp.appendChild(topBtn(w)));
  const g = $('#app-tray-grid'); g.innerHTML = ''; WIDGETS.filter(w => widgetOn(w.id)).forEach(w => g.appendChild(trayBtn(w))); syncDock();
}
function wireAppTray() {
  const tab = $('#app-tray-tab'), bd = $('#app-tray-backdrop');
  const open = () => { bd.hidden = false; tab.classList.add('open'); tab.setAttribute('aria-expanded', 'true'); }, close = () => { bd.hidden = true; tab.classList.remove('open'); tab.setAttribute('aria-expanded', 'false'); };
  tab.onclick = () => bd.hidden ? open() : close(); $('#app-tray-handle').onclick = close; bd.onclick = e => { if (e.target === bd) close(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !bd.hidden) close(); });
}

/* ---------- Settings drawer ---------- */
function buildLayoutModes() {
  const g = $('#layout-mode-grid'); g.innerHTML = '';
  LAYOUT_MODES.forEach(m => { const b = document.createElement('button'); b.type = 'button'; b.className = 'layout-mode-opt' + (state.layoutMode === m ? ' active' : ''); b.innerHTML = `<span class="layout-mode-name">${esc(t('layout_mode_' + m))}</span><span class="layout-mode-desc">${esc(t('layout_mode_' + m + '_desc'))}</span>`;
    b.onclick = () => { if (state.layoutMode === m) return; state.layoutMode = m; saveState(); rebuildAllDocks(); buildLayoutModes(); buildDrawerSettings(); buildPlacementList(); buildEmojiToggle(); refreshTitles(); }; g.appendChild(b); });
}
function buildEmojiToggle() { const e = $('#show-emojis-toggle'), locked = state.layoutMode !== 'custom'; e.checked = emojisVisible(); e.disabled = locked; e.closest('.switch-row').classList.toggle('locked', locked); $('#emoji-lock-hint').hidden = !locked;
  e.onchange = x => { state.showEmojisCustom = x.target.checked; saveState(); rebuildAllDocks(); refreshTitles(); }; }
function buildPlacementList() {
  const list = $('#dock-vis-list'); list.innerHTML = ''; const locked = state.layoutMode !== 'custom'; $('#dock-buttons-lock-hint').hidden = !locked;
  WIDGETS.filter(w => widgetOn(w.id)).forEach(w => { const row = document.createElement('div'); row.className = 'dock-vis-row placement-row' + (locked ? ' locked' : ''); row.innerHTML = `<span>${esc(widgetLabel(w))}</span>`;
    const s = document.createElement('select'); s.disabled = locked; PLACEMENTS.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = t('placement_' + p); s.appendChild(o); }); s.value = state.dockPlacement[w.id] || 'hidden';
    s.onchange = () => { const v = s.value; if (v !== 'hidden' && placementCount(v) >= DOCK_CAPS[v]) { toast(t('drawer_full_toast', {side:t('placement_' + v), max:DOCK_CAPS[v]})); s.value = state.dockPlacement[w.id] || 'hidden'; return; } state.dockPlacement[w.id] = v; saveState(); rebuildAllDocks(); };
    row.appendChild(s); list.appendChild(row); });
  const inact = $('#inactive-widgets-list'); inact.innerHTML = '';
  WIDGETS.forEach(w => { const l = document.createElement('label'); l.className = 'switch-row'; l.innerHTML = `<span>${esc(widgetLabel(w))}</span><input type="checkbox" ${widgetOn(w.id) ? 'checked' : ''}>`; l.querySelector('input').onchange = e => setWidgetActive(w.id, e.target.checked); inact.appendChild(l); });
}
function setWidgetActive(id, on) {
  if (on) { delete state.deactivated[id]; const p = state.dockPlacement[id]; if (!p || p === 'hidden') { const d = DEFAULT_PLACEMENT[id] || 'hidden'; state.dockPlacement[id] = d !== 'hidden' && placementCount(d) >= DOCK_CAPS[d] ? 'hidden' : d; } }
  else { state.deactivated[id] = true; state.active[id] = false; if (widgetEls[id]) closeWidget(id); }
  saveState(); rebuildAllDocks(); buildPlacementList();
}
const PILLS = [{id:'loc', el:'#loc-select'}, {id:'status', el:'#status-pill'}, {id:'lang', el:'#lang-toggle'}, {id:'theme', el:'#btn-theme'}];
function applyPills() { PILLS.forEach(p => { $(p.el).style.display = (state.pillPlacement[p.id] || 'top') === 'hidden' ? 'none' : ''; }); }
function buildPills() { PILLS.forEach(p => { const s = $('#pill-place-' + p.id); s.innerHTML = `<option value="top">${t('placement_shown')}</option><option value="hidden">${t('placement_hidden')}</option>`; s.value = state.pillPlacement[p.id] || 'top'; s.onchange = () => { state.pillPlacement[p.id] = s.value; saveState(); applyPills(); }; }); }
function buildDrawerSettings() {
  const locked = state.layoutMode !== 'custom', L_ = $('#drawer-left-visible'), R_ = $('#drawer-right-visible');
  L_.checked = sideVisible('left'); R_.checked = sideVisible('right'); L_.disabled = R_.disabled = locked; [L_, R_].forEach(x => x.closest('.switch-row').classList.toggle('locked', locked)); $('#drawers-lock-hint').hidden = !locked;
  L_.onchange = e => { state.edgeDock.left.visible = e.target.checked; saveState(); rebuildAllDocks(); }; R_.onchange = e => { state.edgeDock.right.visible = e.target.checked; saveState(); rebuildAllDocks(); };
  const da = $('#dock-autohide-toggle'), ta = $('#toolbar-autohide-toggle'); da.checked = !!state.dockAutoHide; ta.checked = !!state.toolbarAutoHide;
  da.onchange = e => { state.dockAutoHide = e.target.checked; saveState(); $('#dock-wrap').classList.toggle('auto-hide', state.dockAutoHide); rescueWidgets(); };
  ta.onchange = e => { state.toolbarAutoHide = e.target.checked; saveState(); applyToolbarAutoHide(); };
  const dm = $('#demo-toggle'); dm.checked = demoOn();
  dm.onchange = e => { state.demo = e.target.checked; applyDemo(); saveState(); buildLocSelect(); refreshAllWidgets(); };
}
function applyDemo() { // Settings → Data: demo data on or off
  const p = $('#status-pill'), k = demoOn() ? 'status_demo' : 'status_live'; p.classList.toggle('ok', !demoOn()); $('#status-text').dataset.i18n = k; $('#status-text').textContent = t(k);
  if (state.loc !== 'all' && !KD.locs.some(l => l.id === state.loc)) state.loc = 'all';
}
function applyToolbarAutoHide() { $('#topbar').classList.toggle('auto-hide', !!state.toolbarAutoHide); document.body.classList.toggle('toolbar-autohide', !!state.toolbarAutoHide); rescueWidgets(); }
function wireSettings() {
  const d = $('#settings-drawer');
  $('#btn-settings').onclick = () => { buildLayoutModes(); buildEmojiToggle(); buildPlacementList(); buildDrawerSettings(); buildPills(); d.hidden = false; };
  $('#settings-close').onclick = () => d.hidden = true;
  $('#reset-layout').onclick = () => { Object.keys(widgetEls).forEach(closeWidget); state.layout = {}; state.active = {dashboard:true}; openWidget('dashboard'); saveState(); syncDock(); };
  $('#reset-all').onclick = () => { if (!confirm(t('reset_all_confirm'))) return; try { localStorage.removeItem(LS_KEY); indexedDB.deleteDatabase('KinderDeck'); } catch (e) {} location.reload(); };
  $('#app-version').textContent = 'KinderDeck ' + APP_VERSION;
}

/* ---------- Boot ---------- */
/* v0.4.16: Cash Flow and the Kitchen Cost Book now live inside Accounting. Their own widgets are switched off once per browser (kept, not deleted). */
function accMove() {
  if (state.accMoved) return;
  const was = state.active.cashflow || state.active.kitchen;
  ['cashflow', 'kitchen'].forEach(id => { state.deactivated[id] = true; state.active[id] = false; });
  if (was) state.active.accounts = true;
  state.accMoved = true; saveState();
}
/* v0.4.21: the Fees widget (demo fee table) is switched off once per browser; fees are entered and imported in Accounting. */
function feesOff() { if (state.feesOff) return; state.deactivated.fees = true; state.active.fees = false; state.feesOff = true; saveState(); }
(function init() {
  accMove(); feesOff();  // the client line (branch client/tp) also runs its first-run prefill here
  document.documentElement.lang = state.lang; applyTheme(); initCustomBg(); buildLang(); buildLocSelect(); ensurePlacement(); rebuildAllDocks(); applyPills(); applyToolbarAutoHide(); applyDemo(); buildLocSelect();
  wireAppTray(); wireSettings(); wireThemeDrawer(); localizeNode(document);
  if (!state.seeded) { state.active.dashboard = true; state.seeded = true; saveState(); }
  WIDGETS.forEach(w => { if (state.active[w.id] && widgetOn(w.id)) openWidget(w.id); });
  rescueWidgets(); syncDock();
})();

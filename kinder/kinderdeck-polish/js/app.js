'use strict';
/* KinderDeck shell: same structure as AdminDeck (wall, floating widgets, docks, app tray, theme + settings drawers). */
const APP_VERSION = '0.11.0';
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
  {id:'meadow', css:'linear-gradient(180deg,#14302a 0%,#2a5a43 55%,#1b3a2c 100%)'}, {id:'slate', css:'linear-gradient(180deg,#20242c 0%,#2b3038 100%)'}, {id:'plain', css:'#12161C'},
  // UI polish (14 Nov 2026): two more backgrounds, as in TeachersDeck; css/polish.css adds their texture
  {id:'paper', nameKey:'bg_paper', css:'linear-gradient(180deg,#2b2721 0%,#25221d 55%,#1f1c18 100%)'},
  {id:'chalkboard', nameKey:'bg_chalkboard', css:'linear-gradient(180deg,#1f3a2c 0%,#284836 55%,#1b3326 100%)'}];
const bgLayer = $('#bg-layer'), bgOverlay = $('#bg-overlay');
/* UI polish (14 Nov 2026, from TeachersDeck via AdminDeck): every background but Dusk colours the docks, windows and drawers with
   a small set of its own. css/premium.css reads the --sk-* tokens under html[data-td-skin]. */
const PRESET_SKINS = {
  chalk:     {bgs:'#2b2f26', card:'rgba(74,82,62,.55)', line:'rgba(205,215,180,.26)', ink:'#eef1e4', muted:'#c3c9b0', acc:'#d9c27a', bt:'#2a2306', dock:'rgba(36,40,31,.86)', hov:'rgba(255,255,255,.10)'},
  ocean:     {bgs:'#0e2f3f', card:'rgba(22,74,92,.48)', line:'rgba(140,220,230,.30)', ink:'#e6fbff', muted:'#a6d4dd', acc:'#5fd3d6', bt:'#032a2c', dock:'rgba(10,40,52,.86)', hov:'rgba(255,255,255,.12)'},
  sunrise:   {bgs:'#3a2140', card:'rgba(122,74,85,.42)', line:'rgba(255,200,160,.30)', ink:'#fff1e8', muted:'#e8c3b4', acc:'#ffb27a', bt:'#3a1600', dock:'rgba(58,33,64,.86)', hov:'rgba(255,255,255,.12)'},
  meadow:    {bgs:'#14302a', card:'rgba(42,90,67,.48)', line:'rgba(170,230,195,.26)', ink:'#effaf3', muted:'#b8d6c4', acc:'#7ed9a0', bt:'#08261a', dock:'rgba(20,48,42,.88)', hov:'rgba(255,255,255,.10)'},
  slate:     {bgs:'#20242c', card:'rgba(52,58,68,.62)', line:'rgba(200,210,225,.22)', ink:'#eef1f6', muted:'#b4bccb', acc:'#9fb4d6', bt:'#141a26', dock:'rgba(30,34,42,.9)', hov:'rgba(255,255,255,.10)'},
  plain:     {bgs:'#12161c', card:'rgba(32,38,47,.72)', line:'rgba(255,255,255,.12)', ink:'#eef1f6', muted:'#a7afbd', acc:'#e0a93b', bt:'#231803', dock:'rgba(20,24,31,.92)', hov:'rgba(255,255,255,.08)'},
  paper:     {bgs:'#25221d', card:'rgba(64,58,48,.6)', line:'rgba(230,215,190,.24)', ink:'#f6efe2', muted:'#cfc2aa', acc:'#e0b46a', bt:'#2b1d05', dock:'rgba(43,39,33,.9)', hov:'rgba(255,255,255,.10)'},
  chalkboard:{bgs:'#1f3a2c', card:'rgba(44,78,60,.55)', line:'rgba(200,235,210,.26)', ink:'#f2f7f1', muted:'#c0d6c8', acc:'#f2efe0', bt:'#1d2b22', dock:'rgba(26,48,37,.9)', hov:'rgba(255,255,255,.10)'},
};
function skinRgb(c, fallback) {   // '#rrggbb' | '#rgb' | 'rgba(r,g,b,a)' -> 'r,g,b'
  const s = String(c || '').trim(); let m;
  if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16)).join(',');
  if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])/i.exec(s))) return [m[1], m[2], m[3]].map(h => parseInt(h + h, 16)).join(',');
  if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s))) return [m[1], m[2], m[3]].join(',');
  return fallback || '0,0,0';
}
const SKIN_PROPS = ['--sk-ink0','--sk-ink1','--sk-ink2','--sk-ink3','--sk-card','--sk-head','--sk-hov','--sk-dock','--sk-dock-soft','--sk-drawer','--sk-pill','--sk-line','--sk-line-rgb',
  '--sk-ink','--sk-muted','--sk-acc','--sk-acc-rgb','--sk-acc-hi','--sk-acc-hi-rgb','--sk-on','--sk-on-rgb','--sk-radius','--sk-shadow-rgb','--sk-card-photo'];
function applySkin() {
  const root = document.documentElement, tk = PRESET_SKINS[state.theme] || null;
  if (!tk) { delete root.dataset.tdSkin; SKIN_PROPS.forEach(k => root.style.removeProperty(k)); return; }
  const bgs = tk.bgs, acc = tk.acc, accRgb = skinRgb(acc), mix = (rgb, w) => rgb.split(',').map(v => Math.round(+v + (255 - +v) * w)).join(',');
  const dark = skinRgb(bgs).split(',').map(v => Math.round(+v * .35)).join(',');
  const set = (k, v) => root.style.setProperty(k, v);
  set('--sk-ink0', bgs); set('--sk-ink1', `color-mix(in srgb, ${bgs} 88%, #ffffff)`); set('--sk-ink2', `color-mix(in srgb, ${bgs} 80%, #ffffff)`); set('--sk-ink3', `color-mix(in srgb, ${bgs} 70%, #ffffff)`);
  set('--sk-card', tk.card); set('--sk-head', `color-mix(in srgb, ${tk.card} 55%, transparent)`); set('--sk-hov', tk.hov);
  set('--sk-dock', tk.dock); set('--sk-dock-soft', `color-mix(in srgb, ${tk.dock} 76%, transparent)`); set('--sk-drawer', `color-mix(in srgb, ${bgs} 94%, transparent)`);
  set('--sk-pill', `color-mix(in srgb, ${tk.hov} 65%, transparent)`); set('--sk-line', tk.line); set('--sk-line-rgb', skinRgb(tk.line, '160,210,255'));
  set('--sk-ink', tk.ink); set('--sk-muted', tk.muted); set('--sk-acc', acc); set('--sk-acc-rgb', accRgb);
  set('--sk-acc-hi', `rgb(${mix(accRgb, .3)})`); set('--sk-acc-hi-rgb', mix(accRgb, .3)); set('--sk-on', tk.bt); set('--sk-on-rgb', skinRgb(tk.bt));
  set('--sk-radius', '16px'); set('--sk-shadow-rgb', dark);
  set('--sk-card-photo', `color-mix(in srgb, ${bgs} 34%, transparent)`);
  root.dataset.tdSkin = state.theme;
}
let sessionBgUrl = null;
const idb = {
  db:null,
  open() { return this.db ? Promise.resolve(this.db) : new Promise((ok, no) => { const r = indexedDB.open('KinderDeck', 1); r.onupgradeneeded = () => r.result.createObjectStore('images', {keyPath:'id'}); r.onsuccess = () => { this.db = r.result; ok(this.db); }; r.onerror = () => no(r.error); }); },
  async tx(m, f) { const d = await this.open(); return new Promise((ok, no) => { const t = d.transaction('images', m), s = f(t.objectStore('images')); t.oncomplete = () => ok(s && s.result); t.onerror = () => no(t.error); }); },
  put(v) { return this.tx('readwrite', s => s.put(v)); }, get(k) { return this.tx('readonly', s => s.get(k)); }, del(k) { return this.tx('readwrite', s => s.delete(k)); }
};
function paintPreset() { const p = PRESETS.find(x => x.id === state.theme) || PRESETS[0]; bgLayer.style.background = p.css; bgLayer.style.backgroundSize = 'cover'; }
function applyTheme() {
  const root = document.documentElement, photo = !!(sessionBgUrl || state.customBg);
  root.dataset.tdBg = photo ? 'image' : 'preset'; root.dataset.tdBgid = photo ? '' : (state.theme || 'dusk');   // css/polish.css: paper / chalkboard texture
  applySkin();
  if (sessionBgUrl) bgLayer.style.background = `center/cover no-repeat url(${sessionBgUrl})`; else if (!state.customBg) paintPreset(); bgOverlay.classList.toggle('no-dim', !state.dim); }
async function initCustomBg() { if (!state.customBg) return; try { const r = await idb.get('background'); if (r && r.blob) bgLayer.style.background = `center/cover no-repeat url(${URL.createObjectURL(r.blob)})`; else paintPreset(); } catch (e) { paintPreset(); } }
function buildSwatches() {
  buildDockSwatches();
  const g = $('#theme-presets'); g.innerHTML = '';
  PRESETS.forEach(p => { const b = document.createElement('button'); b.className = 'swatch' + (state.customBg || sessionBgUrl || state.theme !== p.id ? '' : ' active'); b.style.background = p.css; const nm = p.nameKey ? t(p.nameKey) : p.id; b.title = nm; b.setAttribute('aria-label', nm);
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
function setLanguage(c) { state.lang = c; saveState(); document.documentElement.lang = c; localizeNode(document); buildLang(); buildLocSelect(); rebuildAllDocks(); refreshTitles(); refreshAllWidgets(); buildLayoutModes(); buildPlacementList(); buildPills(); applyKdDock(); buildDockSwatches(); }

/* ---------- Widget wall ---------- */
const wall = $('#wall'), widgetEls = {};
let topZ = 10, gesture = null;
const widgetOn = id => !state.deactivated[id];
const emojisVisible = () => state.layoutMode !== 'compact' && (state.layoutMode === 'cozy' || !!state.showEmojisCustom);
const wname = w => w[state.lang];
const widgetLabel = w => (emojisVisible() ? w.em + ' ' : '') + wname(w);
const bringToFront = el => {
  if (!el.classList.contains('full')) { document.querySelectorAll('.widget.is-front').forEach(w => { if (w !== el) w.classList.remove('is-front'); }); el.classList.add('is-front'); }   // UI polish: css/polish.css
  if (!el.classList.contains('full') && +el.style.zIndex !== topZ) el.style.zIndex = ++topZ; };
function freeBand() { const tb = $('#topbar'), dk = $('#dock-wrap'); const top = toolbarTucked() ? 8 : Math.ceil(tb.getBoundingClientRect().bottom); const bot = Math.floor(dk.getBoundingClientRect().top); return {top:Math.max(0, top), bottom:bot > 0 ? Math.min(wall.clientHeight || bot, bot) : wall.clientHeight}; }
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
  el.classList.add('td-opening'); el.addEventListener('animationend', () => el.classList.remove('td-opening'), {once:true});   // UI polish: the opening animation
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
  renderWidget(id); attachAutoFit(id, el.querySelector('.widget-body'));
}
/* UI polish (from TeachersDeck via AdminDeck): a few widgets grow with their window, so they read from across the room (the
   calendar and notices on the office screen, the QR code to scan). The content is zoomed to the largest size at which it still
   fits (never below 100%, at most 300%); more content than fits scrolls as before. Tables and the full pages stay as they are.
   The content sits in one .fit-wrap inside the body; a repaint (renderWidget) is wrapped again. */
const AUTO_FIT = new Set(['calendar', 'announce', 'agenda', 'qr']);
function attachAutoFit(id, body) {
  if (!AUTO_FIT.has(id) || !body || body._autoFit) return;
  let raf = 0, busy = false;
  function wrap() {
    const kids = [...body.childNodes];
    let w = kids.find(k => k.classList && k.classList.contains('fit-wrap'));
    if (w && kids.length === 1) return w;
    if (!w) { w = document.createElement('div'); w.className = 'fit-wrap'; }
    kids.forEach(k => { if (k !== w) w.appendChild(k); });   // never a wrap inside a wrap (the zooms would multiply)
    if (w.parentNode !== body) body.appendChild(w);
    return w;
  }
  function fit() {
    busy = true;
    const w = wrap(), cs = getComputedStyle(body);
    const availH = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const availW = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (availH <= 0 || availW <= 0 || body.closest('.minimized') || innerWidth < 700) { w.style.zoom = ''; w.style.width = ''; busy = false; return; }   // phones: as before
    const fits = z => { w.style.zoom = z; w.style.width = (availW / z) + 'px'; return w.scrollHeight * z <= availH + 1 && w.scrollWidth <= availW / z + 1; };
    let lo = 1, hi = 3;
    if (!fits(1)) { fits(1); busy = false; return; }   // too much content: 100% and scroll, as before
    if (fits(hi)) lo = hi;
    else for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    fits(Math.floor(lo * 100) / 100);
    busy = false;
  }
  const schedule = () => { if (busy) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(body);
  new MutationObserver(schedule).observe(body, {childList:true, subtree:true, characterData:true});
  body.addEventListener('input', schedule);
  body._autoFit = {schedule};
  schedule();
}
function toggleMinimize(id) { const r = widgetEls[id], l = state.layout[id]; if (!r || !l) return; const b = r.el.querySelector('.widget-min');
  if (l.minimized) { l.minimized = false; r.el.classList.remove('minimized'); if (!r.el.classList.contains('full')) r.el.style.height = (l.prevH || l.h || 260) + 'px'; } else { l.prevH = r.el.offsetHeight; l.minimized = true; r.el.classList.add('minimized'); r.el.style.height = ''; }
  b.innerHTML = iconSvg(l.minimized ? 'restore' : 'minimize', 'wsvg'); b.setAttribute('aria-label', t(l.minimized ? 'restore_action' : 'minimize_action')); saveState(); }
function closeWidget(id) { state.active[id] = false; const r = widgetEls[id]; if (r) { r.el.remove(); delete widgetEls[id]; } }
function toggleWidget(id) { state.active[id] ? closeWidget(id) : openWidget(id); saveState(); syncDock(); }
function syncDock() { document.querySelectorAll('.dock-item[data-id],.dock-top-item[data-id],.app-tray-item[data-id]').forEach(e => e.classList.toggle('active', !!state.active[e.dataset.id]));
  if (typeof DockStyle !== 'undefined') DockStyle.refresh(); }   // the dock styles mark open widgets too
window.addEventListener('pointermove', moveGesture); window.addEventListener('pointerup', endGesture); window.addEventListener('pointercancel', endGesture); window.addEventListener('blur', () => endGesture()); window.addEventListener('resize', rescueWidgets);

/* ---------- Docks, side drawers, top dock, app tray ---------- */
const DOCK_CAPS = {bottom:10, left:5, right:5, top:5}, LAYOUT_MODES = ['compact', 'cozy', 'custom'], PLACEMENTS = ['bottom', 'left', 'right', 'top', 'hidden'];
const DEFAULT_PLACEMENT = {dashboard:'bottom', inbox:'bottom', roster:'bottom', parents:'bottom', suppliers:'bottom', overview:'bottom', fees:'left', meals:'left', kitchen:'bottom', cashflow:'bottom', accounts:'bottom', staff:'bottom', health:'left', attendance:'right', calendar:'right', announce:'right', agenda:'right'};
// the order the user dragged the icons into comes first (js/dockdrag.js), before the cap; the rest keep the usual order
function widgetsFor(side) { const order = (state.dockOrder || {})[side] || [], at = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  return WIDGETS.filter(w => widgetOn(w.id) && state.dockPlacement[w.id] === side).sort((a, b) => at(a.id) - at(b.id)).slice(0, DOCK_CAPS[side]); }
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
function openAppTray() { const tab = $('#app-tray-tab'); $('#app-tray-backdrop').hidden = false; tab.classList.add('open'); tab.setAttribute('aria-expanded', 'true'); }
function closeAppTray() { const tab = $('#app-tray-tab'); $('#app-tray-backdrop').hidden = true; tab.classList.remove('open'); tab.setAttribute('aria-expanded', 'false'); }
function wireAppTray() {
  const tab = $('#app-tray-tab'), bd = $('#app-tray-backdrop'), open = openAppTray, close = closeAppTray;
  tab.onclick = () => bd.hidden ? open() : close(); $('#app-tray-handle').onclick = close; bd.onclick = e => { if (e.target === bd) close(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !bd.hidden) close(); });
}
/* Dragging launchers (v0.11.0; js/dockdrag.js, the suite's file, a copy of TinyTeachersDeck's): a dock icon to another place or
   dock, a tray icon onto a dock, a dock icon onto the tray tab (off the docks). Saved once, on drop. An empty drawer is hidden,
   so while dragging, the drawers the layout mode shows come back as drop targets. Works in every layout mode. */
function wireDockDrag() {
  if (!window.DockDrag) return;
  DockDrag.init({
    zones: {bottom:'#dock', left:'#dock-left-items', right:'#dock-right-items', top:'#dock-top-widgets'},
    item: '.dock-item[data-id], .dock-top-item[data-id]', caps: DOCK_CAPS,
    tray: {grid:'#app-tray-grid', item:'.app-tray-item[data-id]', tab:'#app-tray-tab, #dock .dk-tray-btn'},   // the floating and magnifying docks hide the tab and carry a tray button
    move(id, loc, ids) {
      const from = state.dockPlacement[id], order = state.dockOrder = state.dockOrder || {};
      state.dockPlacement[id] = loc;
      if (from && from !== loc && order[from]) order[from] = order[from].filter(x => x !== id);
      if (ids) order[loc] = ids;
      saveState(); rebuildAllDocks(); if (!$('#settings-drawer').hidden) buildPlacementList();   // Settings' list follows if it is open
    },
    full: loc => toast(t('drawer_full_toast', {side:t('placement_' + loc), max:DOCK_CAPS[loc]})),
    closeTray: closeAppTray, openTray: openAppTray,
    onStart: () => ['left', 'right'].forEach(sd => { if (sideVisible(sd)) $('#dock-' + sd).hidden = false; }),
    onEnd: () => rebuildAllDocks(),
  });
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
  const list = $('#dock-vis-list'); list.innerHTML = ''; const locked = false; $('#dock-buttons-lock-hint').hidden = true;   // every layout mode (v0.11.0), as dragging
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
// UI polish: the Floating, Magnifying and Circle docks (and Radial without docks) tuck the toolbar away the same way, unless
// Theme > Dock > Top bar says "Always shown" (applyTopBarMode, below).
function toolbarTucked() { return !!state.toolbarAutoHide || tbDropOn(); }
function applyToolbarAutoHide() { $('#topbar').classList.toggle('auto-hide', toolbarTucked()); document.body.classList.toggle('toolbar-autohide', toolbarTucked()); rescueWidgets(); }
function wireSettings() {
  const d = $('#settings-drawer');
  $('#btn-settings').onclick = () => { buildLayoutModes(); buildEmojiToggle(); buildPlacementList(); buildDrawerSettings(); buildPills(); d.hidden = false; };
  $('#settings-close').onclick = () => d.hidden = true;
  $('#reset-layout').onclick = () => { Object.keys(widgetEls).forEach(closeWidget); state.layout = {}; state.active = {dashboard:true}; openWidget('dashboard'); saveState(); syncDock(); };
  $('#reset-all').onclick = () => { if (!confirm(t('reset_all_confirm'))) return; try { localStorage.removeItem(LS_KEY); indexedDB.deleteDatabase('KinderDeck'); } catch (e) {} location.reload(); };
  $('#app-version').textContent = 'KinderDeck ' + APP_VERSION;
}

/* ---------- Dock styles (UI polish 14 Nov 2026, from TeachersDeck via AdminDeck) ----------
   Theme → Dock: the standard docks or one of the five dock styles (js/dockstyle.js draws them; the packs are the suite's
   js/dock-packs.js, checked with StoreCore). KinderDeck has no store and no Pro, so every style is open to everyone and the
   Pro-only "floating icons" switch is left out. Floating, Magnifying and Circle (and Radial with its docks off) tuck the top
   bar away: it drops down at the top edge (KinderDeck's own toolbar auto-hide) unless Theme → Dock → Top bar says "Always shown". */
const KD_CAT_OF = {dashboard:'overview', overview:'overview', inbox:'overview',
  roster:'children', parents:'children', attendance:'children', health:'children', meals:'children',
  accounts:'money', cashflow:'money', fees:'money', feesdue:'money', kitchen:'money',
  staff:'staff', tclasses:'staff', suppliers:'staff',
  calendar:'tools', announce:'tools', agenda:'tools', qr:'tools', files:'tools'};
const KD_CATS = ['overview', 'children', 'money', 'staff', 'tools'];
const KD_CAT_ICON = {overview:'chart', children:'child', money:'coins', staff:'people', tools:'calendar'};
const kdCat = id => KD_CAT_OF[id] || 'tools';
function kdDockItems() {
  const out = [];
  (window.AD_DOCK_PACKS || []).forEach(r => {   // the suite's admindeck/js/dock-packs.js, unchanged (hence its AdminDeck name)
    if (!window.StoreCore || !r || r.kind !== 'dock') return;
    const v = StoreCore.validateStorePack(r); if (!v.ok) { console.warn('KinderDeck: dock pack refused', r && r.id, v.error); return; }
    v.pack.items.forEach(it => out.push(it));
  });
  return out;
}
const radialDocks = () => ['off', 'compact', 'keep'].includes(state.radialDocks) ? state.radialDocks : 'off';
function tbDropStyle() { const s = state.dockStyle || 'standard'; return ['float', 'magnify', 'circle'].includes(s) || (s === 'radial' && radialDocks() !== 'keep'); }
function tbDropOn() { return tbDropStyle() && state.topBarMode !== 'shown'; }
function applyTopBarMode() {
  const s = state.dockStyle || 'standard';
  document.body.classList.toggle('rad-off', s === 'radial' && radialDocks() === 'off');
  document.body.classList.toggle('rad-compact', s === 'radial' && radialDocks() === 'compact');
  applyToolbarAutoHide();
}
function applyKdDock() {
  if (typeof DockStyle === 'undefined') return;
  const it = kdDockItems().find(d => d.style === state.dockStyle);
  DockStyle.apply(it ? it.style : 'standard', it || null);
  applyTopBarMode();
}
function modeRow(box, opts, cur, pick) {
  box.innerHTML = '';
  opts.forEach(([k, key]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'topbar-mode-opt' + (cur === k ? ' active' : ''); b.setAttribute('aria-pressed', cur === k); b.textContent = t(key); b.onclick = () => pick(k); box.appendChild(b); });
}
function buildDockSwatches() {
  const grid = $('#dock-styles'); if (!grid) return;
  grid.innerHTML = '';
  const Lg = state.lang === 'vi' ? 'vi' : 'en';
  [{style:'standard', name:{en:t('dock_standard')}, swatch:'linear-gradient(180deg,#2a3542,#161c25)'}].concat(kdDockItems()).forEach(o => {
    const b = document.createElement('button'); b.type = 'button';
    const on = (state.dockStyle || 'standard') === o.style;
    b.className = 'dock-style-opt' + (on ? ' active' : ''); b.setAttribute('aria-pressed', on);
    b.innerHTML = '<span class="dock-style-sw"></span><span class="dock-style-name"></span>';
    b.querySelector('.dock-style-sw').style.background = o.swatch || '#1e2732';
    b.querySelector('.dock-style-name').textContent = o.name[Lg] || o.name.en;
    b.onclick = () => {
      state.dockStyle = o.style; saveState(); applyKdDock(); buildDockSwatches();
      if (o.style === 'radial' && !state.radialHintSeen) { state.radialHintSeen = true; saveState(); toast(t('dock_radial_hint'), 7000); }   // one time: how to open the rings
    };
    grid.appendChild(b);
  });
  const rm = $('#radial-mode');   // with Radial the rings hold every widget, so the docks can go
  if (rm) { rm.hidden = state.dockStyle !== 'radial'; modeRow(rm, [['off', 'dock_rad_off'], ['compact', 'dock_rad_compact'], ['keep', 'dock_rad_keep']], radialDocks(), k => { state.radialDocks = k; saveState(); applyTopBarMode(); buildDockSwatches(); }); }
  const tb = $('#topbar-mode');
  if (tb) { tb.hidden = !tbDropStyle(); modeRow(tb, [['drop', 'dock_tb_drop'], ['shown', 'dock_tb_shown']], state.topBarMode === 'shown' ? 'shown' : 'drop', k => { state.topBarMode = k; saveState(); applyTopBarMode(); buildDockSwatches(); }); }
}
function wireDockStyles() {
  if (typeof DockStyle === 'undefined') return;
  const vi = () => state.lang === 'vi';
  // Radial: a full-screen page (Owner Dashboard) fills the wall, so a right-click on its own background opens the rings there too
  document.addEventListener('contextmenu', e => {
    if (DockStyle.current() !== 'radial' || !e.target.closest) return;
    if (!e.target.closest('.widget.full') || e.target.closest('.widget-head, input, textarea, select, button, a, [contenteditable]')) return;
    e.preventDefault(); DockStyle.openRings(e.clientX, e.clientY);
  });
  const locs = () => [{id:'all', label:t('loc_all')}].concat(KD.locs.map(l => ({id:l.id, label:l[state.lang]})));
  DockStyle.configure({
    widgets: () => WIDGETS.filter(w => widgetOn(w.id)).map(w => ({id:w.id, label:wname(w), icon:iconSvg(w.icon), cat:kdCat(w.id)})),
    categories: () => KD_CATS.map(c => [c, t('cat_' + c)]),
    favourites: () => widgetsFor('bottom').map(w => w.id),
    isOpen: id => !!widgetEls[id], toggle: id => toggleWidget(id), openTray: () => openAppTray(),
    get labels() {   // read on every draw, so the dock styles follow the language
      return vi()
        ? {tray:'Tất cả widget', widgets:'Widget', favourites:'Yêu thích', pin:'Giữ mở', unpin:'Thu gọn', classes:'Cơ sở', theme:'Giao diện',
            language:'Ngôn ngữ', light:'Sáng', dark:'Tối', settings:'Cài đặt', search:'Tìm widget', searchClass:'Tìm cơ sở', searchLang:'Tìm ngôn ngữ',
            noMatch:'Không tìm thấy', noFavs:'Nhấp chuột phải vào widget để thêm vào Yêu thích', more:'Thêm', dragHint:'Kéo một biểu tượng lên vòng để đổi chỗ'}
        : {tray:'All widgets', widgets:'Widgets', favourites:'Favourites', pin:'Keep open', unpin:'Let it fold', classes:'Locations', theme:'Theme',
            language:'Language', light:'Light', dark:'Dark', settings:'Settings', search:'Search widgets', searchClass:'Search locations', searchLang:'Search languages',
            noMatch:'Nothing found', noFavs:'Right-click a widget to add it to Favourites', more:'More', dragHint:'Drag an icon onto the ring to swap it in'};
    },
    ringDefaults: {overview:['dashboard', 'overview', 'inbox'], children:['roster', 'attendance', 'parents', 'health'], money:['accounts', 'feesdue', 'kitchen']},
    nav: {   // the sidebar's own rows: the location switch (KinderDeck's "class"), language, Theme, Settings (no Light mode here)
      classLabel: () => (locs().find(l => l.id === state.loc) || locs()[0]).label,
      classes: () => locs().map(l => ({id:l.id, label:l.label, active:l.id === state.loc})),
      switchClass: id => { state.loc = id; saveState(); buildLocSelect(); refreshAllWidgets(); },
      languages: () => [['en', 'English'], ['vi', 'Tiếng Việt']].map(([code, label]) => ({code, label, active:code === state.lang})),
      langLabel: () => state.lang === 'vi' ? 'Tiếng Việt' : 'English',
      setLanguage: code => setLanguage(code),
      openTheme: () => $('#btn-theme').click(),
      openSettings: () => $('#btn-settings').click(),
      catIcon: id => iconSvg(KD_CAT_ICON[id] || 'folder'),
    },
  });
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
  wireAppTray(); wireDockDrag(); wireSettings(); wireThemeDrawer(); wireDockStyles(); applyKdDock(); localizeNode(document);   // UI polish: Theme > Dock
  if (!state.seeded) { state.active.dashboard = true; state.seeded = true; saveState(); }
  WIDGETS.forEach(w => { if (state.active[w.id] && widgetOn(w.id)) openWidget(w.id); });
  rescueWidgets(); syncDock();
})();

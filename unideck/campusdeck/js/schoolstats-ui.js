/* ============================================================
   AdminDeck — School Stats: the full-screen widget (UI)
   ------------------------------------------------------------
   Loaded AFTER schoolstats.js (pure maths) and BEFORE app.js. Everything here is declared as functions / ss-prefixed
   names and only touches app.js globals (state, saveState, t, esc, emptyState, toast, LOCALE_MAP, widgetEls, WIDGETS)
   when it is CALLED, which is after app.js has finished loading — so load order is safe.

   A single dataset (AD.getSchoolStats) is fetched once; SS turns it into rows/tiles/series; each collapsible section
   below only draws what SS returns, so the tiles, trend, bars, pie, table and CSV always agree. Read-only. No student
   names, no XP/points anywhere on this page.
   ============================================================ */
const SS_PIE_COLORS = ['#E8A33D', '#47C9B6', '#7DA2F5', '#E06565', '#B58CF0', '#6FCF97', '#F2C94C', '#8A93A6'];
const SS_SD_WIDGETS = ['timer', 'todo', 'reading', 'games', 'idiom', 'stats', 'journey', 'class'];

function ssUI(){
  state.statsUI = Object.assign({ range:'30d', term:null, classId:null, metric:'active', chart:'line', mode:'total', sort:{ key:'name', dir:1 }, collapsed:{}, demo:false, cmp:[] }, state.statsUI || {});
  if(!SS.METRICS.some(m => m.key === state.statsUI.metric)) state.statsUI.metric = 'active';
  if(!Array.isArray(state.statsUI.cmp)) state.statsUI.cmp = [];
  return state.statsUI;
}
const ssTerms = () => (Array.isArray(state.terms) ? state.terms : []);
const ssLocale = () => LOCALE_MAP[state.lang] || 'en-US';
const ssNum = v => (Math.round(v * 10) / 10).toLocaleString(ssLocale());
const ssFmtT = s => s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;
const ssDay = k => new Date(k + 'T12:00:00').toLocaleDateString(ssLocale(), { month:'short', day:'numeric' });
const ssWidgetLabel = k => SS_SD_WIDGETS.includes(k) ? t('sd_' + k) : k;

/* ---------- motion (v0.7.1) ----------
   The School Stats screen animates the way ParentDeck's Student Summary does (see "School Stats motion" at the end of css/style.css):
   tiles pop in and COUNT UP, the sections cascade in, lines draw, bars and columns grow, rows slide in; hover lifts a tile (its number counts up
   again) or replays one bar. Everything is cosmetic: the real numbers are always in the text, and nothing plays when the system asks for reduced motion. */
const ssStill = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
// A number that counts up. `txt` is what it finally reads (already formatted), so the result is always exactly what the plain build showed.
const ssCnt = (n, txt, dec) => `<span data-ss-count="${n}" data-dec="${dec || 0}" data-ss-final="${esc(txt)}">${esc(txt)}</span>`;
// Words / units inside a card value ("entries", "min", "h") are drawn smaller than the digits so a long value stays on a line and the digits stay consistent.
// v0.8.1 stoplight: SS.stoplight(kind, value) -> 'good' | 'watch' | 'bad' | null. stWrap colours one number inside a table cell (the shape in front of it —
// ● ▲ ■ in CSS — means the status isn't carried by colour alone); the tiles carry data-st on the whole card.
const stWrap = (lvl, html) => lvl ? `<span class="ss-st" data-st="${lvl}" title="${esc(t('ss_st_' + lvl))}">${html}</span>` : html;
const stAttr = (lvl, note) => lvl ? ` data-st="${lvl}" title="${esc(t('ss_st_' + lvl) + (note ? ' — ' + note : ''))}"` : '';
const stPct = (a, b) => (b > 0 ? a / b * 100 : null);
const ssUnits = html => html.split(/(<[^>]+>)/).map(x => (x.charAt(0) === '<' || !/[^\s\d.,\/·%:]/.test(x)) ? x : `<small class="ss-u">${x}</small>`).join('');
function ssCountUp(root){
  if(ssStill() || !root) return;
  root.querySelectorAll('[data-ss-count]').forEach(el => {
    const to = parseFloat(el.dataset.ssCount); if(!isFinite(to) || !to) return;
    const final = el.dataset.ssFinal || (el.dataset.ssFinal = el.textContent), dec = +el.dataset.dec || 0, t0 = performance.now(), dur = 850;
    el._ssT = t0;
    const step = now => {
      if(el._ssT !== t0) return;                                  // a newer count-up took over
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = k < 1 ? (to * (1 - Math.pow(1 - k, 3))).toLocaleString(ssLocale(), { minimumFractionDigits:dec, maximumFractionDigits:dec }) : final;
      if(k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* Make the card text fill the card, consistently: every plain number (7, 57, 74%, 172.3 …) gets ONE shared size — the largest at which the widest of them
   still fits its card on one line — and a longer value (263h 29m, 497 / 359, the two-line reading) is only ever shrunk from that size, never enlarged. The
   label size follows the number size. Measured on the real layout (the grid's card widths change with the window), so it runs after every paint and on resize. */
function ssFitTiles(root){
  if(!root.clientWidth) return;
  // balanced rows: as many columns as fit, then the fewest that still give the same number of rows (8 cards -> 4 + 4, never 7 + 1)
  root.querySelectorAll('.ss-tiles').forEach(grid => {
    const n = grid.children.length, W = grid.clientWidth; if(!n || !W) return;
    const maxCols = Math.max(1, Math.floor((W + 10) / (150 + 10))), rows = Math.ceil(n / maxCols), cols = Math.ceil(n / rows);
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  });
  const tiles = [...root.querySelectorAll('.ss-tiles .tile:not(.na)')];
  if(!tiles.length) return;
  root.querySelectorAll('.ss-tiles [data-ss-final]').forEach(el => { el.textContent = el.dataset.ssFinal; });      // measure the finished numbers, not a count-up frame
  const MAX = 60, MIN = 16;
  const fits = (b, px) => { b.style.fontSize = px + 'px'; return b.scrollWidth <= b.clientWidth + 1; };
  const fit = tile => {
    const b = tile.querySelector('b'); let lo = MIN, hi = MAX;
    if(fits(b, hi)) return hi;
    while(hi - lo > 1){ const mid = (lo + hi) >> 1; if(fits(b, mid)) lo = mid; else hi = mid; }
    return lo;
  };
  const isShort = tile => tile.querySelector('b').textContent.trim().length <= 6;
  const shorts = tiles.filter(isShort);
  const U = shorts.length ? Math.min(...shorts.map(fit)) : 36;
  tiles.forEach(tile => {
    const size = isShort(tile) ? U : Math.min(U, fit(tile));
    tile.querySelector('b').style.fontSize = '';
    tile.style.setProperty('--vs', size + 'px');
    tile.style.setProperty('--ls', Math.max(12, Math.min(18, Math.round(U * 0.36))) + 'px');
  });
}

/* ---------- charts (inline SVG / CSS, no library: Manifest V3 blocks remote scripts) ---------- */
function ssNiceMax(v){ const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
// kind 'line' | 'bar'. cur/prev = [{from,to,value}]. prev (optional) is drawn dashed (line) or as a tick on each bar.
function ssChartSvg(kind, cur, prev){
  const W = 640, H = 210, L = 42, R = 12, T = 12, B = 26, pw = W - L - R, ph = H - T - B, n = cur.length;
  const mx = ssNiceMax(Math.max(1, ...cur.map(p => p.value), ...(prev ? prev.map(p => p.value) : [0])));
  const x = i => kind === 'bar' ? L + (i + 0.5) * pw / n : (n > 1 ? L + i * pw / (n - 1) : L + pw / 2);
  const y = v => T + ph - v / mx * ph;
  const label = p => (p.from === p.to ? ssDay(p.from) : ssDay(p.from));
  let g = '';
  for(let k = 0; k <= 4; k++){ const v = mx * k / 4, yy = y(v); g += `<line class="ss-gl" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="ss-axis" x="${L - 6}" y="${yy + 3.5}" text-anchor="end">${ssNum(v)}</text>`; }
  const step = Math.max(1, Math.ceil(n / 6));
  cur.forEach((p, i) => { if(i % step === 0 || i === n - 1) g += `<text class="ss-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(label(p))}</text>`; });
  if(kind === 'line'){
    if(prev) g += `<polyline class="ss-line prev" points="${prev.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}"/>`;
    g += `<polyline class="ss-line" pathLength="1" points="${cur.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}"/>`;
    g += cur.map((p, i) => `<circle class="ss-dot" style="--i:${i}" cx="${x(i)}" cy="${y(p.value)}" r="3"><title>${esc(ssDay(p.from) + (p.from !== p.to ? ' – ' + ssDay(p.to) : ''))}: ${ssNum(p.value)}</title></circle>`).join('');
  } else {
    const bw = Math.max(3, pw / n * 0.6);
    g += cur.map((p, i) => `<rect class="ss-barfill" style="--i:${i}" x="${x(i) - bw / 2}" y="${y(p.value)}" width="${bw}" height="${Math.max(1, T + ph - y(p.value))}" rx="2"><title>${esc(ssDay(p.from) + (p.from !== p.to ? ' – ' + ssDay(p.to) : ''))}: ${ssNum(p.value)}</title></rect>`).join('');
    if(prev) g += prev.map((p, i) => `<line class="ss-prevtick" x1="${x(i) - bw / 2 - 2}" x2="${x(i) + bw / 2 + 2}" y1="${y(p.value)}" y2="${y(p.value)}"><title>${esc(t('ss_prev_line'))}: ${ssNum(p.value)}</title></line>`).join('');
  }
  return `<svg class="ss-chart" style="--n:${n}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('ss_sec_trend'))}">${g}</svg>`;
}
// One line per class across the same buckets. focusId dims every other line.
function ssMultiLineSvg(buckets, series, focusId){
  const W = 640, H = 230, L = 42, R = 12, T = 12, B = 26, pw = W - L - R, ph = H - T - B, n = buckets.length;
  const mx = ssNiceMax(Math.max(1, ...series.map(s => Math.max(...s.values))));
  const x = i => (n > 1 ? L + i * pw / (n - 1) : L + pw / 2), y = v => T + ph - v / mx * ph;
  let g = '';
  for(let k = 0; k <= 4; k++){ const v = mx * k / 4, yy = y(v); g += `<line class="ss-gl" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="ss-axis" x="${L - 6}" y="${yy + 3.5}" text-anchor="end">${ssNum(v)}</text>`; }
  const step = Math.max(1, Math.ceil(n / 6));
  buckets.forEach((b, i) => { if(i % step === 0 || i === n - 1) g += `<text class="ss-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(ssDay(b.from))}</text>`; });
  series.forEach((s, i) => {
    const dim = focusId && focusId !== s.id, col = SS_PIE_COLORS[i % SS_PIE_COLORS.length];
    g += `<polyline class="ss-mline" pathLength="1" style="--i:${i};stroke:${col};opacity:${dim ? 0.18 : 1};stroke-width:${focusId === s.id ? 3.2 : 2}" points="${s.values.map((v, j) => `${x(j)},${y(v)}`).join(' ')}"><title>${esc(s.name)}</title></polyline>`;
  });
  return `<svg class="ss-chart" style="--n:${n}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('ss_sec_classtrend'))}">${g}</svg>`;
}
function ssSpark(vals){
  if(!vals) return '';
  const W = 70, H = 22, mx = Math.max(1, ...vals), n = vals.length;
  const pts = vals.map((v, i) => `${(i / (n - 1)) * (W - 4) + 2},${H - 3 - v / mx * (H - 6)}`).join(' ');
  return `<svg class="ss-spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline pathLength="1" points="${pts}"/></svg>`;
}
function ssPieHtml(sh, focusId){
  if(!sh.total) return '';
  let acc = 0;
  const stops = sh.slices.map((s, i) => { const a = acc / sh.total * 360; acc += s.value; return `${SS_PIE_COLORS[i % SS_PIE_COLORS.length]} ${a}deg ${acc / sh.total * 360}deg`; }).join(', ');
  const legend = sh.slices.map((s, i) => {
    const name = s.other ? t('ss_other') : esc(s.label), p = Math.round(s.value / sh.total * 100);
    const inner = `<span class="ss-sw" style="background:${SS_PIE_COLORS[i % SS_PIE_COLORS.length]}"></span><span class="ss-lname">${name}</span><b>${p}%</b><span class="muted">${ssNum(s.value)}</span>`;
    return s.id ? `<button class="ss-legrow${s.id === focusId ? ' on' : ''}" style="--i:${i}" data-ss-focus="${esc(s.id)}">${inner}</button>` : `<div class="ss-legrow" style="--i:${i}">${inner}</div>`;
  }).join('');
  return `<div class="ss-piewrap"><div class="ss-pie" style="background:conic-gradient(${stops})" role="img" aria-label="${esc(t('ss_chart_pie'))}"></div><div class="ss-legend">${legend}</div></div>`;
}

/* ---------- the widget ---------- */
function renderSchoolStats(body){
  const ui = ssUI();
  const root = document.createElement('div');
  root.className = 'ss-root';
  body.innerHTML = '';
  body.appendChild(root);
  let alive = true;
  // v0.4.1: inside the app-wide demo (js/demo.js) School Stats reads the SAME demo school as every other widget through the normal path
  // (AD.getSchoolStats is replaced there), so the old stand-alone nine-class simulation only runs when you are not connected and not in the demo.
  const inDemoMode = () => typeof AD_DEMO !== 'undefined' && AD_DEMO.active;
  const isDemo = () => !inDemoMode() && (!!ui.demo || !AD.isConfigured());
  const terms = () => { const v = ssTerms(); return (isDemo() || inDemoMode()) && !SS.validTerms(v).length ? SS.demoTerms(SS.dayKey(Date.now())) : v; };
  // v0.7.1 motion: which entrance the next READY paint plays — 'in' (the whole screen cascades in), 'redraw' (a data change: tiles, charts, rows),
  // or null. Classes go on the root and come off again after they play, so nothing replays by accident (see "School Stats motion" in style.css).
  let fxMode = 'in', fxT = null;
  function playFx(){
    if(!fxMode || M.status !== 'ready' || !M.stats) return;
    const mode = fxMode; fxMode = null;
    clearTimeout(fxT); root.classList.remove('ss-in', 'ss-redraw'); void root.offsetWidth;      // restart cleanly if one is still playing
    root.classList.add(mode === 'in' ? 'ss-in' : 'ss-redraw');
    ssCountUp(root);
    fxT = setTimeout(() => root.classList.remove('ss-in', 'ss-redraw'), mode === 'in' ? 3800 : 2400);
  }
  let M = { status:'loading' };            // status: loading | ready | noconfig | error ; stats, today, details, rg, rows, scoped, tot, updatedAt, fallback

  root.innerHTML = `
    <div class="ss-head" id="ss-head"></div>
    <div id="ss-banner"></div>
    <div id="ss-legend"></div>
    <div class="tiles ss-tiles ss-overview" id="ss-overview"></div>
    <div class="tiles ss-tiles" id="ss-tiles"></div>
    <div class="ss-grid" id="ss-grid"></div>`;
  const $r = sel => root.querySelector(sel);

  const SECTIONS = [
    { key:'trend',      title:'ss_sec_trend',      wide:true,  draw:drawTrend },
    { key:'classtrend', title:'ss_sec_classtrend', wide:true,  draw:drawClassTrend },
    { key:'byclass',    title:'ss_sec_byclass',    wide:false, draw:drawByClass },
    { key:'students',   title:'ss_sec_students',   wide:false, draw:drawStudents },
    { key:'time',       title:'ss_sec_time',       wide:false, draw:drawTime },
    { key:'table',      title:'ss_sec_table',      wide:true,  draw:drawTable }
  ];
  const grid = $r('#ss-grid');
  SECTIONS.forEach((s, idx) => {
    const el = document.createElement('section');
    el.className = 'ss-sub' + (s.wide ? ' ss-wide' : '');
    el.dataset.key = s.key;
    el.style.setProperty('--i', idx);                // v0.7.1: position in the cascade
    grid.appendChild(el);
    s.el = el;
  });

  /* ----- data ----- */
  function hwByClass(rg){
    const out = {};
    if(!M.details) return out;
    (M.stats.classes || []).forEach(c => {
      const d = M.details.get && M.details.get(c.id);
      if(!d || d.error || !d.homework) return;
      let done = 0, total = 0, any = false;
      d.homework.forEach(h => {
        const k = h.dueDate ? String(h.dueDate).slice(0, 10) : '';
        if(!k || k < rg.from || k > rg.to || h.doneCount === undefined) return;
        any = true; done += h.doneCount || 0; total += h.totalStudents || 0;
      });
      if(any) out[c.id] = { done, total };
    });
    return out;
  }
  function compute(){
    if(!M.stats) return;
    M.rg = SS.rangeFor(ui, terms(), M.today);
    M.rows = SS.classRows(M.stats, M.rg, hwByClass(M.rg));
    if(ui.classId && !M.rows.some(r => r.id === ui.classId)) ui.classId = null;
    M.scoped = SS.scopeRows(M.rows, ui.classId);
    M.tot = SS.schoolTotals(M.scoped);
  }
  // Overview infos (the old School Snapshot): from the live adminListClasses/adminGetClass data, or from the demo.
  function infosFromStats(stats){
    return (stats.classes || []).map(c => ({ id:c.id, className:c.className, teacherKey:c.teacherName, teacherName:c.teacherName, students:c.students || 0,
      pointsSum:(c.avgPoints || 0) * (c.students || 0), pointsN:c.avgPoints !== undefined ? (c.students || 0) : 0, lastActiveAt:c.lastActiveAt || null, activeKnown:true }));
  }
  async function liveInfos(fallbackStats){
    try{
      const classes = await AD.getClasses(), details = await AD.getAllDetails().catch(() => null);
      return classes.map(c => {
        let pointsSum = 0, pointsN = 0; const d = details && details.get && details.get(c.id);
        if(d && !d.error && d.roster) d.roster.forEach(r => { pointsSum += r.points || 0; pointsN++; });
        return { id:c.id, className:c.className, teacherKey:c.teacherUid || c.teacherName, teacherName:c.teacherName, students:c.studentCount || 0, pointsSum, pointsN,
          lastActiveAt:c.lastActiveAt || null, activeKnown:'lastActiveAt' in c };
      });
    }catch(e){ return fallbackStats ? infosFromStats(fallbackStats) : []; }
  }
  async function load(force){
    fxMode = 'in';
    M = Object.assign({}, M, { status:'loading' }); paint();
    const today = SS.dayKey(Date.now());
    if(isDemo()){                                   // simulated 120 days — no network, nothing to configure
      const stats = SS.demoStats(today, terms());
      M = { status:'ready', demo:true, stats, today, details:null, infos:infosFromStats(stats), updatedAt:Date.now() };
      compute(); paint(); return;
    }
    const rg = SS.rangeFor(ui, terms(), today);
    try{
      const stats = await AD.getSchoolStats({ days:SS.daysNeeded(rg, today), windows:SS.windowsFor(terms(), today), today }, force);
      if(!alive) return;
      let details = null; try{ details = await AD.getAllDetails(); }catch(e){ /* assignment % is optional */ }
      const infos = await liveInfos(stats);
      if(!alive) return;
      M = { status:'ready', stats, today, details, infos, updatedAt:Date.now() };
    }catch(e){
      if(!alive) return;
      if(e && e.notDeployed){
        try{
          const classes = await AD.getClasses();
          if(!alive) return;
          const details = await AD.getAllDetails().catch(() => null), infos = await liveInfos(null);
          M = { status:'ready', fallback:true, today, details, infos, updatedAt:Date.now(), stats:{ days:0, today, fallback:true, errors:[], classes: classes.map(c => ({
            id:c.id, className:c.className, teacherName:c.teacherName, students:c.studentCount || 0, withPractice:0, avgStreak:0, streaks:null,
            lastActiveAt:c.lastActiveAt || null, active:{}, daily:[] })) } };
        }catch(e2){ M = { status:'error', error:e2.message || String(e2) }; }
      } else M = { status:'error', error:(e && e.message) || String(e) };
    }
    compute(); paint();
  }
  function needsReload(){
    if(M.status !== 'ready' || M.fallback) return false;
    const rg = SS.rangeFor(ui, terms(), M.today);
    return (M.stats.days || 0) < SS.daysNeeded(rg, M.today);
  }
  function change(fn, mode){
    fn(); saveState();
    if(needsReload()) load(false); else { fxMode = mode || 'redraw'; compute(); paint(); }      // a new range replays the whole entrance; picking a class just redraws the numbers and charts
  }

  /* ----- drawing -----
     A click on a class-focus button (table row, by-class bar, Class Trend legend chip) gives it focus as the browser's
     own default action for mousedown — and if that control sits near the edge of the scrolled panel, the browser
     scrolls it into view right then, before our own 'click' listener below (and paint()'s own scrollTop restore)
     ever run, so there was nothing honest left to restore to. The actual fix is simpler than chasing the scroll
     position around that: these buttons don't need focus-by-mouse at all (Tab still reaches them for keyboard use),
     so preventDefault() on mousedown stops the browser from focusing — and therefore scrolling to — them in the
     first place. Picking a class with the mouse never moves the viewport again. */
  root.addEventListener('mousedown', e => { if(e.target.closest('[data-ss-focus]')) e.preventDefault(); });
  function paint(){
    const sc = body.scrollTop;
    drawHead(); drawBanner(); drawOverview(); drawTiles();
    SECTIONS.forEach(s => paintSection(s));
    drawLegend();
    ssFitTiles(root);
    playFx();
    body.scrollTop = sc;   // restored last — drawLegend/ssFitTiles/playFx above still mutate the DOM and can shift scroll on their own
  }
  function paintSection(s, fx){
    const collapsed = !!ui.collapsed[s.key];
    s.el.innerHTML = `<div class="ss-subhead"><span class="ss-subtitle">${esc(t(s.title))}</span><button class="widget-min ss-subtoggle" data-ss-sub="${s.key}" aria-label="${esc(t(collapsed ? 'ss_expand' : 'ss_collapse'))} ${esc(t(s.title))}" aria-expanded="${!collapsed}">${collapsed ? '+' : '–'}</button></div>${collapsed ? '' : '<div class="ss-subbody"></div>'}`;
    if(!collapsed){
      const host = s.el.querySelector('.ss-subbody');
      if(M.status === 'loading' && !M.stats) host.innerHTML = emptyState(t('ss_loading'));
      else if(M.status === 'noconfig') host.innerHTML = emptyState(t('not_configured'));
      else if(M.status === 'error') host.innerHTML = `<p class="err-box">${esc(M.error)}</p>`;
      else if(M.stats) s.draw(host);
      if(fx && M.stats && !ssStill()){                       // a chart type / metric / mode change (or expanding a section) replays just this section's graphics
        s.el.classList.remove('ss-fx'); void s.el.offsetWidth; s.el.classList.add('ss-fx');
        clearTimeout(s.fxT); s.fxT = setTimeout(() => s.el.classList.remove('ss-fx'), 2400);
      }
    }
  }
  const chip = (attr, val, label, on) => `<button class="chip${on ? ' on' : ''}" ${attr}="${val}" aria-pressed="${on}">${esc(label)}</button>`;

  function drawHead(){
    const el = $r('#ss-head'), focus = ui.classId && M.rows ? M.rows.find(r => r.id === ui.classId) : null;
    const rg = M.rg || SS.rangeFor(ui, terms(), SS.dayKey(Date.now())), vt = SS.validTerms(terms());
    const ranges = SS.RANGES.filter(k => k !== 'term' || vt.length).map(k => chip('data-ss-range', k, t('ss_range_' + k), rg.key === k)).join('');
    const termSel = rg.key === 'term' && vt.length > 1
      ? `<select id="ss-term" aria-label="${esc(t('ss_term_pick'))}">${vt.map(x => `<option value="${x.i}" ${rg.wkey === 't' + x.i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : '';
    const crumb = focus
      ? `<button class="ss-link" data-ss-clear>${esc(t('ss_school'))}</button><span class="muted"> › </span><b>${esc(focus.name)}</b> <button class="ss-x" data-ss-clear aria-label="${esc(t('ss_clear_focus'))}" title="${esc(t('ss_clear_focus'))}">✕</button>`
      : `<b>${esc(t('ss_school'))}</b>`;
    el.innerHTML = `
      <div class="ss-crumb">${crumb}</div>
      <div class="ss-chips" role="group" aria-label="Range">${ranges}${vt.length ? '' : `<button class="ss-link" data-ss-terms>${esc(t('ss_terms_link'))}</button>`}${termSel}</div>
      <span class="muted ss-span">${M.stats && !M.fallback ? esc(ssDay(rg.from) + (rg.from !== rg.to ? ' – ' + ssDay(rg.to) : '')) : ''}</span>
      <span class="ss-grow"></span>
      ${M.updatedAt ? `<span class="muted ss-span">${esc(t('ss_updated', { time:new Date(M.updatedAt).toLocaleTimeString(ssLocale(), { hour:'2-digit', minute:'2-digit' }) }))}</span>` : ''}
      ${inDemoMode() ? '' : `<button class="chip${isDemo() ? ' on' : ''}" data-ss-demo aria-pressed="${isDemo()}" ${AD.isConfigured() ? '' : 'disabled'} title="${esc(t('ss_demo_title'))}">${esc(t('ss_demo_label'))}</button>`}
      ${state.toolbarAutoHide ? '' : `<button class="wbtn sm" data-ss-toolbar>${esc(t(document.body.classList.contains('ss-fullscreen') ? 'ss_toolbar_show' : 'ss_toolbar_hide'))}</button>`}
      <button class="wbtn sm" data-ss-refresh ${M.status === 'loading' ? 'disabled' : ''}>${iconSvg('refresh', 'wsvg')} ${esc(t('refresh'))}</button>`;
  }
  function drawBanner(){
    const el = $r('#ss-banner'), out = [];
    if(M.status === 'loading' && M.stats) out.push(`<p class="hint">${esc(t('ss_loading'))}</p>`);
    if(inDemoMode()) out.push(`<p class="ss-banner demo">${esc(t('ss_demo_school'))}</p>`);
    if(M.demo) out.push(`<p class="ss-banner demo">${esc(t(AD.isConfigured() ? 'ss_demo_banner_cfg' : 'ss_demo_banner'))}${AD.isConfigured() ? ` <button class="ss-link" data-ss-realdata>${esc(t('ss_demo_use_real'))}</button>` : ` <button class="ss-link" data-ss-settings>${esc(t('ss_demo_open_settings'))}</button>`}</p>`);
    if(M.fallback) out.push(`<p class="ss-banner warn">${esc(t('ss_banner_nobackend'))} <button class="ss-link" data-ss-demo>${esc(t('ss_demo_preview'))}</button></p>`);
    if(M.stats && M.stats.errors && M.stats.errors.length) out.push(`<p class="ss-banner warn">${esc(t('ss_banner_errors', { n:M.stats.errors.length }))}</p>`);
    if(M.tot && M.tot.activeApprox && !M.fallback) out.push(`<p class="ss-banner">${esc(t('ss_banner_approx'))}</p>`);
    el.innerHTML = out.join('');
  }
  function deltaHtml(d){
    if(d === null || d === undefined) return '';
    const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    return `<em class="ss-delta ${cls}" title="${esc(t('ss_vs_prev'))}">${d > 0 ? '▲' : d < 0 ? '▼' : '·'} ${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}%</em>`;
  }
  // the colour key, with the rules read from the same table the colours come from
  function drawLegend(){
    const el = $r('#ss-legend'); if(!el) return;
    if(M.status !== 'ready' || !M.stats){ el.innerHTML = ''; return; }
    const R = SS.STOPLIGHT;
    el.innerHTML = `<div class="ss-stlegend"><span class="ss-st ss-stkey" data-st="good">${esc(t('ss_st_good'))}</span><span class="ss-st ss-stkey" data-st="watch">${esc(t('ss_st_watch'))}</span><span class="ss-st ss-stkey" data-st="bad">${esc(t('ss_st_bad'))}</span>
      <details><summary>${esc(t('ss_st_how'))}</summary>
        <p>${esc(t('ss_st_rule_share', { g:R.share.good, w:R.share.watch }))}</p><p>${esc(t('ss_st_rule_hw', { g:R.hw.good, w:R.hw.watch }))}</p>
        <p>${esc(t('ss_st_rule_streak', { g:R.streak.good, w:R.streak.watch }))}</p><p>${esc(t('ss_st_rule_recency', { g:R.recency.good, w:R.recency.watch }))}</p>
        <p>${esc(t('ss_st_rule_empty', { w:R.empty.watch }))}</p><p>${esc(t('ss_st_rule_trend', { w:Math.abs(R.trend.watch) }))}</p><p class="muted">${esc(t('ss_st_rule_neutral', { n:SS.SMALL_CLASS }))}</p></details></div>`;
  }
  function drawOverview(){
    const el = $r('#ss-overview');
    if(!M.infos || (M.status !== 'ready' && M.status !== 'loading')){ el.innerHTML = ''; return; }
    const infos = ui.classId ? M.infos.filter(i => i.id === ui.classId) : M.infos, o = SS.overview(infos, Date.now());
    let n = 0;
    const tile = (v, label, na, title, lvl) => `<div class="tile${na ? ' na' : ''}" style="--i:${n++}"${lvl ? stAttr(lvl, title) : title ? ` title="${esc(title)}"` : ''}><b>${v && v.html !== undefined ? v.html : esc(v)}</b><span>${esc(label)}</span></div>`;
    const H = html => ({ html });
    el.innerHTML = tile(H(ssCnt(o.classes, o.classes)), t('snap_classes')) + tile(H(ssCnt(o.teachers, o.teachers)), t('snap_teachers'))
      + tile(H(ssCnt(o.students, o.students.toLocaleString(ssLocale()))), t('snap_students'))
      + (o.avgPoints === null ? tile('—', t('snap_avg_points'), true) : tile(H(ssCnt(o.avgPoints, o.avgPoints.toFixed(1), 1)), t('snap_avg_points')))
      + (o.activeKnown ? tile(H(`${ssCnt(o.activeClasses, o.activeClasses)}/${ssCnt(o.classes, o.classes)}`), t('snap_active_week'), false, t('snap_active_week_note'), SS.stoplight('share', stPct(o.activeClasses, o.classes))) : tile(t('not_available_yet'), t('snap_active_week'), true, t('snap_active_week_note')))
      + tile(H(ssCnt(o.emptyClasses, o.emptyClasses)), t('snap_empty_classes'), false, '', o.classes ? SS.stoplight('empty', stPct(o.emptyClasses, o.classes)) : null);
  }
  function drawTiles(){
    const el = $r('#ss-tiles');
    if(!M.tot || (M.status !== 'ready' && M.status !== 'loading')){ el.innerHTML = ''; return; }
    if(M.fallback){ el.innerHTML = ''; return; }          // no activity data without the v1.4.0 endpoint; the overview row above still shows
    el.innerHTML = SS.tiles(M.tot).map((x, k) => {
      let v = x.value, sub = '', vh = null;                // vh: the same value with count-up spans (null = nothing to count)
      if(x.id === 'reading'){
        const tpl = t('ss_entries', { n:ssCnt(v.entries, v.entries), m:ssCnt(v.min, ssNum(v.min), 1) });
        vh = tpl.split('·').map(part => `<span class="ss-vl">${ssUnits(part.trim())}</span>`).join('');          // "300 entries" / "5,378 min", one per line
        v = t('ss_entries', { n:v.entries, m:ssNum(v.min) });
      }
      else if(x.id === 'games'){ vh = `${ssCnt(v.started, v.started)} / ${ssCnt(v.finished, v.finished)}`; v = `${v.started} / ${v.finished}`; }
      else if(x.id === 'time'){ vh = esc(ssFmtT(v)).replace(/(\d+)([hms])/g, '$1<small class="ss-u">$2</small>'); v = ssFmtT(v); }
      else if(x.id === 'active' && x.sub){ sub = ` · ${esc(t('ss_of_students', { n:x.sub }))}`; vh = ssCnt(v, v); }
      else if(x.id === 'streak'){ vh = ssCnt(v, ssNum(v), 1); v = ssNum(v); }
      else if(typeof v === 'number'){ vh = ssCnt(v, v.toLocaleString(ssLocale())); v = v.toLocaleString(ssLocale()); }
      const na = v === null;
      let lvl = null;                                              // totals are judged by their trend against the previous period; rates by the thresholds in SS.STOPLIGHT
      if(!na){
        if(x.id === 'active') lvl = x.sub ? SS.stoplight('share', stPct(x.value, x.sub)) : null;
        else if(x.id === 'partic') lvl = SS.stoplight('share', parseInt(x.value, 10));
        else if(x.id === 'streak') lvl = M.tot.participation !== null ? SS.stoplight('streak', x.value) : null;
        else lvl = SS.stoplight('trend', x.delta);
      }
      return `<div class="tile ss-tile${na ? ' na' : ''}"${stAttr(lvl)} style="--i:${6 + k}"><b>${na ? esc(t('ss_na')) : (vh !== null ? vh : esc(v))}${x.approx ? '~' : ''}</b><span>${esc(t(x.label))}${sub}</span>${deltaHtml(x.delta)}</div>`;
    }).join('');
  }

  function drawTrend(host){
    if(M.fallback){ host.innerHTML = emptyState(t('ss_na')); return; }
    const m = SS.METRICS.find(x => x.key === ui.metric), metricName = t(m.label);
    const controls = `<div class="ss-controls">
        <select id="ss-metric" aria-label="Metric">${SS.METRICS.map(x => `<option value="${x.key}" ${x.key === ui.metric ? 'selected' : ''}>${esc(t(x.label))}</option>`).join('')}</select>
        <div class="ss-chips" role="group" aria-label="Chart type">${[['line', 'ss_chart_line'], ['bar', 'ss_chart_bar'], ['pie', 'ss_chart_pie']].map(([k, l]) => chip('data-ss-chart', k, t(l), ui.chart === k)).join('')}</div>
      </div>`;
    let out = '', sum = '';
    if(ui.chart === 'pie'){
      const sh = SS.shares(M.rows, ui.metric);
      out = sh.total ? ssPieHtml(sh, ui.classId) : emptyState(t('ss_empty_range'));
      sum = `<p class="ss-sum">${esc(t('ss_pie_share', { metric:metricName }))}</p>`;
    } else {
      const tr = SS.trend(M.stats, M.scoped, ui.metric, M.rg, M.today), s = tr.summary, unit = t(m.unit);
      const has = tr.cur.some(p => p.value) || (tr.prev && tr.prev.some(p => p.value));
      out = has ? ssChartSvg(ui.chart, tr.cur, tr.prev) + `<div class="ss-key"><span><i class="ss-k cur"></i>${esc(t('ss_this_period'))}</span>${tr.prev ? `<span><i class="ss-k prev"></i>${esc(t('ss_prev_line'))}</span>` : ''}</div>` : emptyState(t('ss_empty_range'));
      const v = { metric:metricName, cur:ssNum(s.cur), unit, prev:s.prev === null ? '' : ssNum(s.prev), pct:s.delta === null ? '' : Math.abs(s.delta) };
      const key = s.prev === null ? 'ss_sum_noprev' : s.prev === 0 && s.cur > 0 ? 'ss_sum_fromzero' : s.delta === null || s.delta === 0 ? 'ss_sum_same' : s.delta > 0 ? 'ss_sum_up' : 'ss_sum_down';
      sum = has ? `<p class="ss-sum ${s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : ''}">${esc(t(key, v))}</p>` : '';
    }
    host.innerHTML = controls + sum + out;
  }

  function drawClassTrend(host){
    if(M.fallback){ host.innerHTML = emptyState(t('ss_na')); return; }
    const m = SS.METRICS.find(x => x.key === ui.metric), ct = SS.classTrend(M.rows, ui.metric, M.rg);
    if(!ct.series.length){ host.innerHTML = emptyState(t('ss_empty_range')); return; }
    host.innerHTML = `<p class="ss-sum">${esc(t(m.label))} — ${esc(t('ss_classtrend_note'))}</p>${ssMultiLineSvg(ct.buckets, ct.series, ui.classId)}
      <div class="ss-legend inline">${ct.series.map((s, i) => `<button class="ss-legrow${s.id === ui.classId ? ' on' : ''}" style="--i:${i}" data-ss-focus="${esc(s.id)}"><span class="ss-sw" style="background:${SS_PIE_COLORS[i % SS_PIE_COLORS.length]}"></span><span class="ss-lname">${esc(s.name)}</span></button>`).join('')}</div>`;
  }
  function drawStudents(host){
    const rows = (M.infos || []).slice().sort((a, b) => (b.students || 0) - (a.students || 0)), mx = Math.max(1, ...rows.map(r => r.students || 0));
    host.innerHTML = rows.length ? rows.map((r, i) => `<button class="ss-barrow${r.id === ui.classId ? ' on' : ''}" style="--i:${i}" data-ss-focus="${esc(r.id)}" title="${esc(r.teacherName || t('td_no_teacher'))}">
        <span class="ss-bname">${esc(r.className)}</span><span class="ss-btrack"><i style="width:${Math.round((r.students || 0) / mx * 100)}%"></i></span><b>${r.students || 0}</b></button>`).join('') : emptyState(t('empty_no_classes'));
  }
  function drawByClass(host){
    if(M.fallback){ host.innerHTML = emptyState(t('ss_na')); return; }
    const rows = SS.byClass(M.rows, ui.metric, ui.mode), mx = Math.max(1, ...rows.map(r => r.value));
    const fmt = v => ui.metric === 'active' && ui.mode === 'per' ? Math.round(v * 100) + '%' : ssNum(v);
    host.innerHTML = `<div class="ss-controls"><span class="muted">${esc(t(SS.METRICS.find(x => x.key === ui.metric).label))}</span>
        <div class="ss-chips" role="group">${[['total', 'ss_mode_total'], ['per', 'ss_mode_per']].map(([k, l]) => chip('data-ss-mode', k, t(l), ui.mode === k)).join('')}</div></div>
      ${rows.length ? rows.map((r, i) => `<button class="ss-barrow${r.id === ui.classId ? ' on' : ''}" style="--i:${i}" data-ss-focus="${esc(r.id)}" title="${esc(t('ss_click_focus'))}">
          <span class="ss-bname">${esc(r.name)}</span><span class="ss-btrack"><i style="width:${Math.round(r.value / mx * 100)}%"></i></span><b>${esc(fmt(r.value))}</b></button>`).join('') : emptyState(t('empty_no_classes'))}
      <p class="hint" style="margin-top:8px">${esc(t('ss_click_focus'))}</p>`;
  }

  function drawTime(host){
    if(M.fallback){ host.innerHTML = emptyState(t('ss_na')); return; }
    const rows = SS.timeByWidget(M.scoped, M.rg), mx = Math.max(1, ...rows.map(r => r.secs));
    host.innerHTML = rows.length ? rows.map((r, i) => `<div class="ss-barrow static" style="--i:${i}"><span class="ss-bname">${esc(ssWidgetLabel(r.key))}</span><span class="ss-btrack"><i style="width:${Math.round(r.secs / mx * 100)}%"></i></span><b>${esc(ssFmtT(r.secs))}</b></div>`).join('') : emptyState(t('ss_empty_range'));
  }

  const COLS = [
    ['name', 'ss_col_class', r => `${esc(r.name)}${r.small ? ` <span class="ss-tag" title="${esc(t('ss_small_note', { n:SS.SMALL_CLASS }))}">${esc(t('ss_small_class'))}</span>` : ''}${!r.synced && !M.fallback ? ` <span class="ss-tag muted">${esc(t('ss_empty_nosync'))}</span>` : ''}`, 'txt'],
    ['teacher', 'ss_col_teacher', r => esc(r.teacher || '—'), 'txt'],
    ['students', 'ss_col_students', r => r.students, 'num'],
    ['active', 'ss_col_active', r => (r.synced ? stWrap(r.small ? null : SS.stoplight('share', stPct(r.active, r.students)), r.active + (r.activeApprox ? '~' : '')) : '—'), 'num', 1],
    ['partic', 'ss_col_partic', r => (r.participation === null || !r.synced ? '—' : stWrap(r.small ? null : SS.stoplight('share', r.participation), r.participation + '%')), 'num', 1],
    ['hw', 'ss_col_hw', r => r.cur.hw, 'num', 1],
    ['reading', 'ss_col_reading', r => ssNum(r.cur.readMin), 'num', 1],
    ['games', 'ss_col_games', r => r.cur.games, 'num', 1],
    ['focus', 'ss_col_focus', r => r.cur.focus, 'num', 1],
    ['time', 'ss_col_time', r => Math.round(r.cur.time / 60), 'num', 1],
    ['streak', 'ss_col_streak', r => (r.synced ? stWrap(r.small ? null : SS.stoplight('streak', r.avgStreak), ssNum(r.avgStreak)) : '—'), 'num', 1],
    ['hwPct', 'ss_col_hwpct', r => (r.hwPct === null ? '—' : stWrap(SS.stoplight('hw', r.hwPct), r.hwPct + '%')), 'num'],
    ['last', 'ss_col_last', r => (r.lastActiveAt ? stWrap(SS.stoplight('recency', (Date.now() - r.lastActiveAt) / 864e5), new Date(r.lastActiveAt).toLocaleDateString(ssLocale(), { month:'short', day:'numeric' })) : '—'), 'txt'],
    ['spark', 'ss_col_trend', r => (r.small || !r.synced ? '<span class="muted">—</span>' : ssSpark(r.spark)), 'spark', 1]
  ];
  const visibleCols = () => COLS.filter(c => !(M.fallback && c[4]));
  /* v0.8.0 — the old stand-alone Class Comparison widget lives here: tick 2–4 classes in the table and a side-by-side panel appears above it
     (same figures as before — students, average and total points, assignments set, calendar events, rewards — plus the activity numbers this page already has). */
  const CMP_ACTIVITY = ['active', 'participation', 'reading', 'games', 'focus', 'time', 'streak'];          // blank without StudentDeck syncs, like the table's own activity columns
  const CMP_LABEL = { students:'ss_col_students', active:'ss_col_active', participation:'ss_col_partic', avgPoints:'cmp_col_avg', totalPoints:'cmp_col_total', hwAssigned:'cmp_col_hw',
    hwPct:'ss_col_hwpct', reading:'ss_col_reading', games:'ss_col_games', focus:'ss_col_focus', time:'ss_col_time', streak:'ss_col_streak', events:'cmp_col_events', rewards:'cmp_col_rewards' };
  const CMP_STOP = { participation:'share', hwPct:'hw', streak:'streak' };           // the only comparison rows with a good / bad direction
  const cmpFmt = (key, v, small) => {
    if(v === null) return '<span class="muted">—</span>';
    const txt = (key === 'participation' || key === 'hwPct') ? v + '%' : (key === 'avgPoints' || key === 'streak' || key === 'reading') ? ssNum(v) : Number(v).toLocaleString(ssLocale());
    return CMP_STOP[key] ? stWrap(small && key !== 'hwPct' ? null : SS.stoplight(CMP_STOP[key], v), txt) : txt;
  };
  function cmpPanelHtml(){
    const n = ui.cmp.length;
    const head = `<div class="ss-cmp-head"><b>${esc(t('ss_cmp_title'))}</b><span class="muted">${esc(t(n < 2 ? 'ss_cmp_pick_more' : 'ss_cmp_best_note'))}</span><span class="ss-grow"></span>${n ? `<button class="wbtn sm" data-ss-cmp-clear>${esc(t('ss_cmp_clear'))}</button>` : ''}</div>`;
    if(n < 2) return `<div class="ss-cmp">${head}</div>`;
    const cmp = SS.compareClasses(M.rows, M.details, ui.cmp);
    const rows = cmp.rows.filter(r => !(M.fallback && CMP_ACTIVITY.includes(r.key)));
    return `<div class="ss-cmp">${head}<div class="ss-tablewrap"><table class="ss-cmptable"><thead><tr><th></th>${cmp.cols.map(c => `<th><span class="ss-cmp-name">${esc(c.name)}</span><small>${esc(c.teacher || t('td_no_teacher'))}</small></th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr style="--i:${i}"><th scope="row">${esc(t(CMP_LABEL[r.key]))}</th>${r.values.map((v, j) => `<td class="num${r.best.includes(j) ? ' best' : ''}"${r.best.includes(j) ? ` title="${esc(t('ss_cmp_best'))}"` : ''}>${cmpFmt(r.key, v, (M.rows.find(x => x.id === cmp.cols[j].id) || {}).small)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }
  function drawTable(host){
    const cols = visibleCols(), rows = SS.sortRows(M.rows, ui.sort.key, ui.sort.dir);
    ui.cmp = ui.cmp.filter(id => rows.some(r => r.id === id)).slice(0, SS.CMP_MAX);          // forget classes that are gone
    const full = ui.cmp.length >= SS.CMP_MAX;
    host.innerHTML = cmpPanelHtml() + `<div class="ss-controls"><span class="muted">${esc(t('ss_click_focus'))} ${esc(t('ss_cmp_hint', { n:SS.CMP_MAX }))}</span><span class="ss-grow"></span>
        <button class="wbtn sm" data-ss-csv ${rows.length ? '' : 'disabled'}>${iconSvg('copy', 'wsvg')} ${esc(t('ss_export_csv'))}</button></div>
      <div class="ss-tablewrap"><table class="ss-table"><thead><tr><th class="ss-pickcol" title="${esc(t('ss_cmp_title'))}">${esc(t('ss_cmp_col'))}</th>${cols.map(c => {
        const sortable = c[0] !== 'spark', on = ui.sort.key === c[0];
        return `<th class="${c[3]}" ${on ? `aria-sort="${ui.sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${sortable ? `<button data-ss-sort="${c[0]}">${esc(t(c[1]))}${on ? (ui.sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>` : esc(t(c[1]))}</th>`;
      }).join('')}</tr></thead><tbody>${rows.map((r, i) => { const picked = ui.cmp.includes(r.id);
        return `<tr class="${r.id === ui.classId ? 'on' : ''}${picked ? ' picked' : ''}" style="--i:${i}" data-ss-focus="${esc(r.id)}" tabindex="0"><td class="ss-pickcol"><input type="checkbox" data-ss-pick="${esc(r.id)}" ${picked ? 'checked' : ''} ${!picked && full ? 'disabled' : ''} title="${esc(!picked && full ? t('ss_cmp_max', { n:SS.CMP_MAX }) : t('ss_cmp_title'))}" aria-label="${esc(t('ss_cmp_title') + ': ' + r.name)}"></td>${cols.map(c => `<td class="${c[3]}">${c[2](r)}</td>`).join('')}</tr>`; }).join('') || `<tr><td colspan="${cols.length + 1}">${esc(t('empty_no_classes'))}</td></tr>`}</tbody></table></div>
      <p class="hint" style="margin-top:8px">${esc(t('ss_small_note', { n:SS.SMALL_CLASS }))}</p>`;
  }
  function downloadCsv(){
    const rg = M.rg, headers = visibleCols().filter(c => c[0] !== 'spark').map(c => t(c[1]));
    const full = SS.csvRows(SS.sortRows(M.rows, ui.sort.key, ui.sort.dir));
    const idx = visibleCols().filter(c => c[0] !== 'spark').map(c => COLS.filter(k => k[0] !== 'spark').findIndex(k => k[0] === c[0]));
    const csv = SS.toCsv(headers, full.map(r => idx.map(i => r[i])));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([(window.Watermark ? Watermark.stamp(csv) : csv)], { type:'text/csv;charset=utf-8' }));
    a.download = `school-stats_${rg.from}_${rg.to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    toast(t('ss_csv_done'));
  }

  /* ----- events (one listener on this render's own root, so re-rendering can't stack handlers) ----- */
  root.addEventListener('click', e => {
    const q = a => e.target.closest('[' + a + ']');
    let el;
    if((el = q('data-ss-sub'))){ const k = el.dataset.ssSub; ui.collapsed[k] = !ui.collapsed[k]; saveState(); paintSection(SECTIONS.find(s => s.key === k), true); return; }
    if((el = q('data-ss-range'))){ change(() => { ui.range = el.dataset.ssRange; }, 'in'); return; }
    if((el = q('data-ss-chart'))){ ui.chart = el.dataset.ssChart; saveState(); paintSection(SECTIONS[0], true); return; }
    if((el = q('data-ss-mode'))){ ui.mode = el.dataset.ssMode; saveState(); paintSection(SECTIONS[2], true); return; }
    if((el = q('data-ss-sort'))){ const k = el.dataset.ssSort; ui.sort = ui.sort.key === k ? { key:k, dir:-ui.sort.dir } : { key:k, dir:(k === 'name' || k === 'teacher') ? 1 : -1 }; saveState(); paintSection(SECTIONS[5]); return; }
    if(q('data-ss-clear')){ change(() => { ui.classId = null; }); return; }
    if(q('data-ss-cmp-clear')){ ui.cmp = []; saveState(); paintSection(SECTIONS[5]); return; }
    if((el = q('data-ss-pick'))){                       // a tick belongs to the comparison, never to the row's click-to-focus
      const id = el.dataset.ssPick;
      ui.cmp = el.checked ? (ui.cmp.includes(id) ? ui.cmp : ui.cmp.concat(id).slice(0, SS.CMP_MAX)) : ui.cmp.filter(x => x !== id);
      saveState(); paintSection(SECTIONS[5]); return;
    }
    if((el = q('data-ss-focus'))){ const id = el.dataset.ssFocus; change(() => { ui.classId = ui.classId === id ? null : id; }); return; }
    if(q('data-ss-csv')){ if(M.rows) downloadCsv(); return; }
    if(q('data-ss-demo')){ if(AD.isConfigured()){ ui.demo = M.fallback ? true : !ui.demo; saveState(); load(false); } return; }
    if(q('data-ss-realdata')){ ui.demo = false; saveState(); load(false); return; }
    if(q('data-ss-settings')){ const b = document.getElementById('btn-settings'); if(b) b.click(); return; }
    if(q('data-ss-toolbar')){ ui.showToolbar = !document.body.classList.contains('ss-fullscreen') ? false : true; saveState(); syncFullscreen(); drawHead(); return; }
    if(q('data-ss-refresh')){ AD.refreshAll(); load(true); return; }
    if(q('data-ss-terms')){ const b = document.getElementById('btn-settings'); if(b) b.click(); return; }
  });
  // hover: a tile's number counts up again (bars and columns replay in CSS)
  root.addEventListener('mouseover', e => {
    const tile = e.target.closest && e.target.closest('.tile'); if(tile && !tile.contains(e.relatedTarget)) ssCountUp(tile);
  });
  root.addEventListener('keydown', e => {
    if(e.target.closest && e.target.closest('[data-ss-pick]')) return;
    const row = e.target.closest && e.target.closest('tr[data-ss-focus]');
    if(row && (e.key === 'Enter' || e.key === ' ') && e.target === row){ e.preventDefault(); const id = row.dataset.ssFocus; change(() => { ui.classId = ui.classId === id ? null : id; }); }
  });
  root.addEventListener('change', e => {
    if(e.target.id === 'ss-metric'){ ui.metric = e.target.value; saveState(); paintSection(SECTIONS[0], true); paintSection(SECTIONS[1], true); paintSection(SECTIONS[2], true); }
    else if(e.target.id === 'ss-term'){ change(() => { ui.term = parseInt(e.target.value, 10); }, 'in'); }
  });

  // the card widths follow the window, so re-fit the card text when it changes (and once the web fonts have arrived)
  let fitRaf = 0;
  const refit = () => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => ssFitTiles(root)); };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refit) : null;
  if(ro) ro.observe(root);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  paint();
  load(false);
  return () => { alive = false; clearTimeout(fxT); cancelAnimationFrame(fitRaf); if(ro) ro.disconnect(); SECTIONS.forEach(s => clearTimeout(s.fxT)); };
}

/* ---------- Settings → Terms editor (stored on this device in state.terms; read by School Stats' "Term" range) ---------- */
function buildTermsEditor(){
  const host = document.getElementById('terms-list');
  if(!host) return;
  const terms = ssTerms();
  const bad = x => x.start && x.end && x.start > x.end;
  host.innerHTML = terms.map((x, i) => `<div class="ss-termrow" data-i="${i}">
      <input type="text" data-f="name" value="${esc(x.name || '')}" placeholder="${esc(t('ss_term_name'))}" aria-label="${esc(t('ss_term_name'))}">
      <input type="date" data-f="start" value="${esc(x.start || '')}" aria-label="${esc(t('ss_term_start'))}">
      <input type="date" data-f="end" value="${esc(x.end || '')}" aria-label="${esc(t('ss_term_end'))}">
      <button class="ghost-btn danger" data-rm="${i}" aria-label="${esc(t('ss_term_remove'))}">✕</button>
      ${bad(x) ? `<p class="hint" style="color:var(--danger);grid-column:1/-1;margin:0">${esc(t('ss_term_bad'))}</p>` : ''}</div>`).join('') || `<p class="hint">${esc(t('ss_terms_empty'))}</p>`;
  host.querySelectorAll('.ss-termrow input').forEach(inp => inp.addEventListener('change', () => {
    const i = +inp.closest('.ss-termrow').dataset.i; state.terms[i][inp.dataset.f] = inp.value.trim(); saveState(); ssRerender(); buildTermsEditor();
  }));
  host.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { state.terms.splice(+b.dataset.rm, 1); saveState(); ssRerender(); buildTermsEditor(); }));
  const add = document.getElementById('term-add');
  if(add && !add._ssWired){
    add._ssWired = true;
    add.addEventListener('click', () => {
      state.terms = ssTerms();
      state.terms.push({ name:t('ss_term_default', { n:state.terms.length + 1 }), start:'', end:'' });
      saveState(); buildTermsEditor();
    });
  }
}
// Re-render only the School Stats widget when terms change (its distinct-student windows depend on them).
function ssRerender(){
  const rec = widgetEls.schoolstats, def = WIDGETS.find(w => w.id === 'schoolstats');
  if(!rec || !def) return;
  if(typeof rec.cleanup === 'function') rec.cleanup();
  rec.cleanup = def.render(rec.el.querySelector('.widget-body'));
}

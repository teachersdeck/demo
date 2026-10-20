/* ============================================================
   AdminDeck — School Stats: calculation layer (SS)
   ------------------------------------------------------------
   Pure functions only — no DOM, no fetch, no globals from app.js — so every number on the School Stats page comes
   from ONE place and can be unit-tested (see tools/test_schoolstats.js). The page (js/schoolstats-ui.js) only draws
   what SS returns, so tiles, trend, bars, table, pie and CSV cannot disagree with each other.

   Input is the response of the backend's adminGetSchoolStats (functions/adminSchoolStats.js): one block per class with a
   sparse `daily` series (a missing day = 0), distinct-active counts per requested window, streak buckets. No student
   names and no XP/points: School Stats is about activity.
   ============================================================ */
const SS = (function(){
  const SMALL_CLASS = 3;           // classes with fewer enrolled students get no per-class trend detail (privacy)
  const MAX_DAYS = 200;            // backend cap
  const BASE_DAYS = 90;

  // key: field on a daily row (or derived), label/unit: i18n keys, avg: bucket value is a daily average, not a sum
  const METRICS = [
    { key:'active', label:'ss_m_active',  unit:'ss_u_students', avg:true },
    { key:'hw',     label:'ss_m_hw',      unit:'ss_u_done' },
    { key:'readMin',label:'ss_m_reading', unit:'ss_u_min' },
    { key:'focus',  label:'ss_m_focus',   unit:'ss_u_sessions' },
    { key:'games',  label:'ss_m_games',   unit:'ss_u_played' },
    { key:'idioms', label:'ss_m_idioms',  unit:'ss_u_learned' },
    { key:'timeMin',label:'ss_m_time',    unit:'ss_u_min' }
  ];
  const RANGES = ['1d','7d','30d','90d','term'];

  /* ---------- dates (YYYY-MM-DD strings; compared as strings) ---------- */
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function dayKey(d){ return new Date(d).toLocaleDateString('en-CA'); }
  function addDays(key, n){ const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); }
  function diffDays(a, b){ return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }   // b - a

  /* ---------- terms ---------- */
  function validTerms(terms){
    return (terms || []).map((t, i) => ({ ...t, i })).filter(t => t && t.name && DAY_RE.test(t.start || '') && DAY_RE.test(t.end || '') && t.start <= t.end);
  }
  // The term that contains today, else the most recently ended one, else the first upcoming.
  function defaultTermIndex(terms, today){
    const v = validTerms(terms); if(!v.length) return -1;
    const cur = v.find(t => t.start <= today && today <= t.end); if(cur) return cur.i;
    const past = v.filter(t => t.end < today).sort((a,b) => b.end.localeCompare(a.end)); if(past.length) return past[0].i;
    return v.sort((a,b) => a.start.localeCompare(b.start))[0].i;
  }

  /* ---------- range ---------- */
  // -> { key, from, to, len, prev:{from,to}, wkey }   (a Term that's still running ends today; prev = equal-length period just before)
  function rangeFor(ui, terms, today){
    let key = ui.range || '7d', from, to = today, wkey = null;
    if(key === '1d'){ from = today; }
    else if(key === '7d' || key === '30d' || key === '90d'){ const n = parseInt(key, 10); from = addDays(today, -(n - 1)); wkey = 'w' + n; }
    else if(key === 'term'){
      const v = validTerms(terms), idx = (ui.term != null && v.some(t => t.i === ui.term)) ? ui.term : defaultTermIndex(terms, today), term = v.find(t => t.i === idx);
      if(term){ from = term.start; to = term.end < today ? term.end : today; if(from > to) to = from; wkey = 't' + term.i; }
      else { key = '7d'; from = addDays(today, -6); wkey = 'w7'; }
    } else { key = '7d'; from = addDays(today, -6); wkey = 'w7'; }
    const len = diffDays(from, to) + 1;
    const pTo = addDays(from, -1), pFrom = addDays(pTo, -(len - 1));
    return { key, from, to, len, prev:{ from:pFrom, to:pTo }, wkey };
  }
  // The distinct-student windows the backend should compute (so a range change needs no new fetch).
  function windowsFor(terms, today){
    const w = [7, 30, 90].map(n => ({ key:'w' + n, from:addDays(today, -(n - 1)), to:today }));
    validTerms(terms).forEach(t => { w.push({ key:'t' + t.i, from:t.start, to:(t.end < today ? t.end : today) }); });
    return w.filter(x => x.from <= x.to).slice(0, 12);
  }
  // How many days of history to ask for: enough for the chosen range AND its previous period (so deltas work), 90..200.
  function daysNeeded(rg, today){ return Math.max(BASE_DAYS, Math.min(MAX_DAYS, diffDays(rg.prev.from, today) + 1)); }
  function coveredFrom(stats, today){ return addDays(today, -((stats.days || BASE_DAYS) - 1)); }

  /* ---------- sums ---------- */
  const ZERO = () => ({ hw:0, readMin:0, readEntries:0, focus:0, games:0, gamesStarted:0, idioms:0, time:0, activeDays:0 });
  function sumRange(cls, from, to){
    const s = ZERO();
    (cls.daily || []).forEach(r => {
      if(r.d < from || r.d > to) return;
      s.hw += r.hw||0; s.readMin += r.readMin||0; s.readEntries += r.readEntries||0; s.focus += r.focus||0; s.games += r.games||0;
      s.gamesStarted += r.gamesStarted||0; s.idioms += r.idioms||0; s.time += r.time||0; s.activeDays += r.active||0;
    });
    return s;
  }
  function addTotals(a, b){ const o = ZERO(); Object.keys(o).forEach(k => { o[k] = (a[k]||0) + (b[k]||0); }); return o; }
  const pct = (cur, prev) => (prev > 0 ? Math.round((cur - prev) / prev * 100) : null);

  // Distinct active students in the range for ONE class. '1d' is exact (that day's count); other ranges use the backend window.
  // If the window is missing (e.g. an older cached response), fall back to the busiest single day and say it's approximate.
  function activeStudents(cls, rg){
    if(rg.key === '1d'){ const r = (cls.daily || []).find(x => x.d === rg.to); return { n: r ? r.active : 0, approx:false }; }
    if(cls.active && cls.active[rg.wkey] !== undefined) return { n: cls.active[rg.wkey], approx:false };
    let mx = 0; (cls.daily || []).forEach(r => { if(r.d >= rg.from && r.d <= rg.to) mx = Math.max(mx, r.active||0); });
    return { n: mx, approx:true };
  }
  function sparkline(cls, to, n){
    const m = {}; (cls.daily || []).forEach(r => { m[r.d] = r.active||0; });
    return Array.from({ length:n }, (_, i) => m[addDays(to, -(n - 1 - i))] || 0);
  }

  /* ---------- per-class rows ---------- */
  // hwByClass (optional): { classId: { done, total } } assignment completion from adminGetClass, for assignments due in range.
  function classRows(stats, rg, hwByClass){
    return (stats.classes || []).map(c => {
      const cur = sumRange(c, rg.from, rg.to), prev = sumRange(c, rg.prev.from, rg.prev.to), act = activeStudents(c, rg);
      const n = c.students || 0, hw = hwByClass && hwByClass[c.id];
      return {
        id:c.id, name:c.className, teacher:c.teacherName || '', students:n, withPractice:c.withPractice||0,
        small: n < SMALL_CLASS, active:act.n, activeApprox:act.approx,
        participation: n ? Math.round(act.n / n * 100) : null,
        cur, prev, avgStreak:c.avgStreak||0, streaks:c.streaks || null, lastActiveAt:c.lastActiveAt || null,
        hwPct: hw && hw.total ? Math.round(hw.done / hw.total * 100) : null,
        spark: n < SMALL_CLASS ? null : sparkline(c, rg.to, 14),
        synced: (c.withPractice||0) > 0 || (c.daily || []).length > 0,
        raw:c
      };
    });
  }

  /* ---------- scope = school or one focused class ---------- */
  function scopeRows(rows, classId){ return classId ? rows.filter(r => r.id === classId) : rows; }

  function schoolTotals(rows){
    const cur = rows.reduce((a, r) => addTotals(a, r.cur), ZERO()), prev = rows.reduce((a, r) => addTotals(a, r.prev), ZERO());
    const students = rows.reduce((a, r) => a + r.students, 0), active = rows.reduce((a, r) => a + r.active, 0);
    const wp = rows.reduce((a, r) => a + r.withPractice, 0);
    const streakSum = rows.reduce((a, r) => a + r.avgStreak * r.withPractice, 0);
    return { cur, prev, students, active, activeApprox: rows.some(r => r.activeApprox), participation: students ? Math.round(active / students * 100) : null,
             avgStreak: wp ? Math.round(streakSum / wp * 10) / 10 : 0, classes: rows.length };
  }

  function tiles(tot){
    const c = tot.cur, p = tot.prev;
    return [
      { id:'active',  label:'ss_t_active',  value: tot.active, delta:null, approx: tot.activeApprox, sub: tot.students ? tot.students : null },
      { id:'partic',  label:'ss_t_partic',  value: tot.participation === null ? null : tot.participation + '%', delta:null },
      { id:'hw',      label:'ss_t_hw',      value: c.hw,      delta: pct(c.hw, p.hw) },
      { id:'reading', label:'ss_t_reading', value: { entries:c.readEntries, min:c.readMin }, delta: pct(c.readMin, p.readMin) },
      { id:'games',   label:'ss_t_games',   value: { started:c.gamesStarted, finished:c.games }, delta: pct(c.games, p.games) },
      { id:'focus',   label:'ss_t_focus',   value: c.focus,   delta: pct(c.focus, p.focus) },
      { id:'time',    label:'ss_t_time',    value: c.time,    delta: pct(c.time, p.time) },    // seconds; the UI formats it
      { id:'streak',  label:'ss_t_streak',  value: tot.avgStreak, delta:null }
    ];
  }

  /* ---------- trend ---------- */
  function metricOf(totalsOrRow, key){ return key === 'timeMin' ? Math.round((totalsOrRow.time||0) / 60) : (totalsOrRow[key]||0); }

  // Buckets across the range (daily up to 31 days, else weekly). A 1-day range charts the last 7 days instead, so a line has shape.
  function buckets(rg){
    const span = rg.len <= 1 ? 7 : rg.len, to = rg.to, from = addDays(to, -(span - 1)), size = span <= 31 ? 1 : 7, out = [];
    for(let s = from; s <= to; s = addDays(s, size)){ const e = addDays(s, size - 1); out.push({ from:s, to: e > to ? to : e }); }
    return { list: out, span };
  }
  function bucketValue(rows, key, b){
    const days = diffDays(b.from, b.to) + 1;
    if(key === 'active'){ let s = 0; rows.forEach(r => (r.raw.daily || []).forEach(d => { if(d.d >= b.from && d.d <= b.to) s += d.active||0; })); return Math.round(s / days * 10) / 10; }
    const t = rows.reduce((a, r) => addTotals(a, sumRange(r.raw, b.from, b.to)), ZERO());
    return metricOf(t, key);
  }
  // -> { cur:[{from,to,value}], prev:[{...}] | null, summary:{cur, prev, delta} }.  prev only when the fetched history covers it.
  function trend(stats, rows, key, rg, today){
    const bk = buckets(rg), cur = bk.list.map(b => ({ ...b, value: bucketValue(rows, key, b) }));
    const covered = coveredFrom(stats, today), shift = bk.span;
    const prevOk = addDays(bk.list[0].from, -shift) >= covered;
    const prev = prevOk ? bk.list.map(b => { const pb = { from:addDays(b.from, -shift), to:addDays(b.to, -shift) }; return { ...pb, value: bucketValue(rows, key, pb) }; }) : null;
    const tot = (arr) => arr.reduce((a, x) => a + x.value, 0);
    const avg = METRICS.find(m => m.key === key).avg;
    const curV = avg ? tot(cur) / cur.length : tot(cur), prevV = prev ? (avg ? tot(prev) / prev.length : tot(prev)) : null;
    return { cur, prev, summary:{ cur:Math.round(curV * 10) / 10, prev: prevV === null ? null : Math.round(prevV * 10) / 10, delta: prevV === null ? null : pct(curV, prevV) } };
  }

  /* ---------- by class ---------- */
  // mode 'total' | 'per' (per enrolled student). Sorted high -> low. Classes under SMALL_CLASS stay in the list (a bar is not a trend).
  function byClass(allRows, key, mode){
    return allRows.map(r => {
      let v = key === 'active' ? r.active : metricOf(r.cur, key);
      if(mode === 'per') v = r.students ? Math.round(v / r.students * 10) / 10 : 0;
      return { id:r.id, name:r.name, value:v, students:r.students };
    }).sort((a, b) => b.value - a.value);
  }
  // Pie: each class's share of the metric over the range (top 7 + "other").
  function shares(allRows, key){
    const rows = byClass(allRows, key, 'total').filter(r => r.value > 0), top = rows.slice(0, 7), rest = rows.slice(7).reduce((a, r) => a + r.value, 0);
    const total = rows.reduce((a, r) => a + r.value, 0);
    return { total, slices: top.map(r => ({ id:r.id, label:r.name, value:r.value })).concat(rest ? [{ id:null, label:null, value:rest, other:true }] : []) };
  }

  /* ---------- time per StudentDeck widget ---------- */
  function timeByWidget(rows, rg){
    const m = {};
    rows.forEach(r => (r.raw.daily || []).forEach(d => { if(d.d >= rg.from && d.d <= rg.to) Object.entries(d.timeBy || {}).forEach(([w, s]) => { m[w] = (m[w]||0) + s; }); }));
    return Object.entries(m).filter(([, v]) => v > 0).map(([k, v]) => ({ key:k, secs:v })).sort((a, b) => b.secs - a.secs);
  }

  /* ---------- table sort + CSV ---------- */
  const SORTERS = {
    name:(r) => r.name.toLowerCase(), teacher:(r) => (r.teacher || '').toLowerCase(), students:(r) => r.students, active:(r) => r.active,
    partic:(r) => r.participation === null ? -1 : r.participation, hw:(r) => r.cur.hw, reading:(r) => r.cur.readMin, games:(r) => r.cur.games,
    focus:(r) => r.cur.focus, time:(r) => r.cur.time, streak:(r) => r.avgStreak, hwPct:(r) => r.hwPct === null ? -1 : r.hwPct, last:(r) => r.lastActiveAt || 0
  };
  function sortRows(rows, key, dir){
    const f = SORTERS[key] || SORTERS.name;
    return rows.slice().sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name)) * dir; });
  }
  function csvCell(v){
    let s = v === null || v === undefined ? '' : String(v);
    if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;                      // stop a spreadsheet reading a class name as a formula
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(headers, rows){ return '\ufeff' + [headers].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n'); }
  function csvRows(rows){
    return rows.map(r => [ r.name, r.teacher, r.students, r.active, r.participation === null ? '' : r.participation, r.cur.hw, r.cur.readMin, r.cur.games,
      r.cur.focus, Math.round(r.cur.time / 60), r.avgStreak, r.hwPct === null ? '' : r.hwPct, r.lastActiveAt ? dayKey(r.lastActiveAt) : '' ]);
  }


  /* ---------- School Snapshot (merged in v0.4.0) ---------- */
  // infos: [{ id, className, teacherKey, teacherName, students, pointsSum, pointsN, lastActiveAt, activeKnown }]  (built from adminListClasses/adminGetClass, or the demo)
  function overview(infos, now){
    const teachers = new Set(infos.map(i => i.teacherKey).filter(Boolean));
    const pN = infos.reduce((a, i) => a + (i.pointsN || 0), 0), pS = infos.reduce((a, i) => a + (i.pointsSum || 0), 0);
    return {
      classes: infos.length, teachers: teachers.size, students: infos.reduce((a, i) => a + (i.students || 0), 0),
      avgPoints: pN ? pS / pN : null, emptyClasses: infos.filter(i => !i.students).length,
      activeKnown: infos.some(i => i.activeKnown),
      activeClasses: infos.filter(i => i.lastActiveAt && (now - i.lastActiveAt) <= 7 * 864e5).length
    };
  }

  /* ---------- class-by-class trend (one line per class). Small / unsynced classes are left out (privacy + nothing to draw). ---------- */
  function classTrend(rows, key, rg){
    const bk = buckets(rg).list;
    const series = rows.filter(r => !r.small && r.synced).map(r => {
      const values = bk.map(b => bucketValue([r], key, b));
      return { id:r.id, name:r.name, values, total:values.reduce((a, v) => a + v, 0) };
    }).filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 7);
    return { buckets:bk, series };
  }

  /* ---------- DEMO DATA ----------
     Deterministic simulation (seeded by class/student/day, so the same date always gives the same numbers and the series don't jump
     around when you click). 120 days ending today, so a 30-day range AND its previous 30 days (for the dashed comparison) both exist.
     Built to show off every chart: weekday/weekend sawtooth, school-wide upward drift, one class surging in the last 2 weeks, one
     declining, one quiet, one 2-student "small class", one class that never synced, one empty class, a one-day sports-day dip 9 days ago
     and a half-term dip ~6 weeks ago. Same response shape as the backend's adminGetSchoolStats (+ `avgPoints`, demo only). */
  function seeded(str){
    let h = 1779033703 ^ str.length;
    for(let i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function(){ h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  const DEMO_CLASSES = [
    { id:'demo-3a', name:'3A', teacher:'Ms Lan',  students:24, base:0.62, trend:'up' },
    { id:'demo-3b', name:'3B', teacher:'Ms Lan',  students:22, base:0.55, trend:'flat' },
    { id:'demo-4a', name:'4A', teacher:'Mr Minh', students:26, base:0.66, trend:'surge' },
    { id:'demo-4b', name:'4B', teacher:'Mr Minh', students:25, base:0.60, trend:'down' },
    { id:'demo-5a', name:'5A', teacher:'Ms Hoa',  students:28, base:0.50, trend:'up' },
    { id:'demo-5b', name:'5B', teacher:'Mr Tuan', students:23, base:0.30, trend:'flat' },
    { id:'demo-6a', name:'6A', teacher:'Mr Khoa', students:2,  base:0.80, trend:'flat' },
    { id:'demo-6b', name:'6B', teacher:'Mr Khoa', students:20, base:0,    trend:'flat', unsynced:true },
    { id:'demo-club', name:'Reading Club', teacher:'Ms Thu', students:0, base:0, trend:'flat' }
  ];
  const DEMO_DAYS = 120;
  function demoTrendFactor(kind, i){
    if(kind === 'up') return 0.75 + 0.55 * (i / (DEMO_DAYS - 1));
    if(kind === 'down') return 1.25 - 0.65 * (i / (DEMO_DAYS - 1));
    if(kind === 'surge') return i >= DEMO_DAYS - 14 ? 1.7 : 1;
    return 1;
  }
  // cfgs (optional, v0.4.1): the same shape as DEMO_CLASSES plus `stopAgo` (no activity in the last N days) and `rank` — js/demo.js passes its
  // seven-class school so School Stats and every other widget show the same classes. windows (optional): the exact windows the page asked for.
  function demoStats(today, terms, cfgs, windowsOverride){
    const keys = Array.from({ length:DEMO_DAYS }, (_, i) => addDays(today, -(DEMO_DAYS - 1 - i)));
    const windows = windowsOverride || windowsFor(terms, today), yesterday = addDays(today, -1);
    const sportsDay = addDays(today, -9), dipFrom = addDays(today, -46), dipTo = addDays(today, -40);
    const classes = (cfgs || DEMO_CLASSES).map(cfg => {
      const daily = {}, sets = [];
      let streakSum = 0, withPractice = 0;
      const streaks = { '0':0, '1-2':0, '3-6':0, '7+':0 };
      for(let s = 0; s < cfg.students; s++){
        const prop = Math.min(0.9, cfg.base * 0.75 * (0.05 + 3.5 * Math.pow(seeded(cfg.id + '|s' + s)(), 3)));
        const days = new Set();
        if(!cfg.unsynced) keys.forEach((k, i) => {
          if(cfg.stopAgo && (DEMO_DAYS - 1 - i) < cfg.stopAgo) return;      // an idle class: nothing in the last N days
          const r = seeded(cfg.id + '|' + s + '|' + k), dow = new Date(k + 'T12:00:00Z').getUTCDay();
          const dayF = dow === 0 ? 0.1 : dow === 6 ? 0.2 : 1;
          const special = k === sportsDay ? 0.45 : (k >= dipFrom && k <= dipTo ? 0.35 : 1);
          if(r() >= Math.min(0.97, prop * dayF * demoTrendFactor(cfg.trend, i) * special)) return;
          days.add(k);
          const row = daily[k] || (daily[k] = { d:k, active:0, hw:0, readMin:0, readEntries:0, focus:0, games:0, gamesStarted:0, idioms:0, time:0, timeBy:{} });
          const hw = r() < 0.55 ? 1 + Math.floor(r() * 2) : 0, readMin = r() < 0.6 ? Math.round(10 + r() * 35) : 0;
          const focus = r() < 0.4 ? 1 + Math.floor(r() * 3) : 0, games = r() < 0.5 ? 1 + Math.floor(r() * 3) : 0, idioms = r() < 0.3 ? 1 : 0;
          const tb = { reading:readMin * 55, games:games * 240, timer:focus * 1500, todo:Math.round(60 + r() * 240), idiom:idioms * 180, stats:Math.round(r() * 90) };
          row.active += 1; row.hw += hw; row.readMin += readMin; row.readEntries += readMin ? 1 + Math.floor(r() * 2) : 0; row.focus += focus;
          row.games += games; row.gamesStarted += games + (r() < 0.4 ? 1 : 0); row.idioms += idioms;
          Object.entries(tb).forEach(([w, v]) => { if(v > 0){ row.timeBy[w] = (row.timeBy[w] || 0) + v; row.time += v; } });
        });
        sets.push(days);
        if(days.size){
          withPractice++;
          // streak = consecutive school days back from today/yesterday (weekends don't break it)
          let n = 0, d = days.has(today) ? today : days.has(yesterday) ? yesterday : null;
          while(d){ const wk = [0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay()); if(days.has(d)) n++; else if(!wk) break; d = addDays(d, -1); if(n > 60) break; }
          streakSum += n; streaks[n <= 0 ? '0' : n <= 2 ? '1-2' : n <= 6 ? '3-6' : '7+']++;
        }
      }
      const active = {};
      windows.forEach(w => { active[w.key] = sets.filter(set => { for(const d of set){ if(d >= w.from && d <= w.to) return true; } return false; }).length; });
      const list = Object.values(daily).sort((a, b) => a.d.localeCompare(b.d));
      const avgPoints = cfg.students ? Math.round(40 + seeded(cfg.id + '|pts')() * 120) : 0;
      return { id:cfg.id, className:cfg.name, teacherName:cfg.teacher, rankingVisibility:cfg.rank || 'anonymized', students:cfg.students, withPractice,
        avgStreak: withPractice ? Math.round(streakSum / withPractice * 10) / 10 : 0, streaks, active, daily:list,
        lastActiveAt: list.length ? Date.parse(list[list.length - 1].d + 'T10:00:00') : null, avgPoints };
    });
    return { demo:true, generatedAt:Date.now(), days:DEMO_DAYS, today, classes, errors:[] };
  }
  // A built-in term so the Term range can be demoed when the user hasn't defined one.
  function demoTerms(today){ return [{ name:'Term 1 (demo)', start:addDays(today, -41), end:addDays(today, 49) }]; }

  /* ----- v0.8.1: stoplight status for the numbers that have a good / bad direction -----
     good = on track (green), watch = monitor (yellow), bad = needs attention (red); null = no verdict (no data, or a number with no good or bad, like a head-count).
     One table, so the page's legend and the colours cannot disagree. `dir` says which way is better. */
  const STOPLIGHT = {
    share:   { good:70, watch:40, dir:'up'   },     // % of students (or classes) active in the range
    hw:      { good:75, watch:50, dir:'up'   },     // % of assigned homework marked done
    streak:  { good:3,  watch:1,  dir:'up'   },     // average streak, days
    trend:   { good:0,  watch:-10, dir:'up'  },     // % change against the previous period (level or up is fine, down more than 10% is not)
    recency: { good:7,  watch:14, dir:'down' },     // days since a class was last active
    empty:   { good:0,  watch:20, dir:'down' }      // % of classes with no students
  };
  function stoplight(kind, v){
    const r = STOPLIGHT[kind];
    if(!r || v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return null;
    v = Number(v);
    if(r.dir === 'up') return v >= r.good ? 'good' : v >= r.watch ? 'watch' : 'bad';
    return v <= r.good ? 'good' : v <= r.watch ? 'watch' : 'bad';
  }

  /* ----- v0.8.0: side-by-side class comparison (was the stand-alone Class Comparison widget; now lives in the School Stats class table) -----
     `rows` are classRows() output, `details` the Map from AD.getAllDetails() (roster / homework / calendarEvents / rewards per class), `ids` the picked classes
     (at most CMP_MAX, in pick order). Returns the columns and one row per metric; `best` lists the column indexes holding the highest value, but only for
     metrics where "highest" means "doing best" regardless of class size (rates and averages, never raw totals) and only when the picked classes differ. */
  const CMP_MAX = 4;
  const CMP_METRICS = [
    ['students',      c => c.r.students],
    ['active',        c => (c.r.synced ? c.r.active : null)],
    ['participation', c => (c.r.synced ? c.r.participation : null), true],
    ['avgPoints',     c => c.avgPoints, true],
    ['totalPoints',   c => c.totalPoints],
    ['hwAssigned',    c => c.hwAssigned],
    ['hwPct',         c => c.r.hwPct, true],
    ['reading',       c => c.r.cur.readMin],
    ['games',         c => c.r.cur.games],
    ['focus',         c => c.r.cur.focus],
    ['time',          c => Math.round(c.r.cur.time / 60)],
    ['streak',        c => (c.r.synced ? c.r.avgStreak : null), true],
    ['events',        c => c.events],
    ['rewards',       c => c.rewards]
  ];
  function compareClasses(rows, details, ids){
    const byId = new Map((rows || []).map(r => [r.id, r]));
    const seen = new Set();
    const picked = (ids || []).filter(id => byId.has(id) && !seen.has(id) && seen.add(id)).slice(0, CMP_MAX).map(id => byId.get(id));
    const detailOf = id => (details && details.get && details.get(id)) || null;
    const cols = picked.map(r => {
      const d = detailOf(r.id), ok = d && !d.error;
      const roster = ok && Array.isArray(d.roster) ? d.roster : null;
      const total = roster ? roster.reduce((a, x) => a + (x.points || 0), 0) : null;
      return { r, id:r.id, name:r.name, teacher:r.teacher || '',
        avgPoints: roster ? (roster.length ? Math.round(total / roster.length * 10) / 10 : 0) : null, totalPoints: total,
        hwAssigned: ok && Array.isArray(d.homework) ? d.homework.length : null,
        events: ok && Array.isArray(d.calendarEvents) ? d.calendarEvents.length : null,
        rewards: ok && Array.isArray(d.rewards) ? d.rewards.length : null };
    });
    const out = CMP_METRICS.map(([key, get, rate]) => {
      const values = cols.map(c => { const v = get(c); return v === undefined || v === null || Number.isNaN(v) ? null : v; });
      let best = [];
      const known = values.filter(v => v !== null);
      if(rate && known.length >= 2 && Math.max(...known) !== Math.min(...known)){
        const mx = Math.max(...known); best = values.map((v, i) => (v === mx ? i : -1)).filter(i => i >= 0);
      }
      return { key, values, best };
    });
    return { cols: cols.map(c => ({ id:c.id, name:c.name, teacher:c.teacher })), rows: out };
  }

  return { SMALL_CLASS, MAX_DAYS, BASE_DAYS, METRICS, RANGES, dayKey, addDays, diffDays, validTerms, defaultTermIndex, rangeFor, windowsFor, daysNeeded,
           coveredFrom, overview, classTrend, demoStats, demoTerms, sumRange, activeStudents, classRows, scopeRows, schoolTotals, tiles, trend, byClass, shares, timeByWidget, sortRows, toCsv, csvRows, pct, CMP_MAX, compareClasses, STOPLIGHT, stoplight };
})();
if(typeof module !== 'undefined') module.exports = SS;

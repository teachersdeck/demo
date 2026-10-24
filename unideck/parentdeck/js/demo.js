/* ParentDeck demo mode (v0.9.3).
   Lets the whole app be shown without Firebase: sign in as a pretend parent with two linked children and a few weeks of
   realistic data (points, homework, calendar, rewards, practice history, teacher notes, progress reports), plus a small
   "Demo controls" panel that fires the real-time events (points awarded, homework finished, new note, new progress report)
   so the toasts and live updates can be shown on cue.

   How it works: when demo mode is on, this file replaces the public PD.* functions from data.js with in-memory versions
   that return snapshots in the exact same shape. Nothing else in the app knows the difference. It loads after data.js and
   before app.js, so app.js registers its listeners against the demo versions. Nothing here talks to a server, and no demo
   data is ever written anywhere but this tab's memory.

   Turn it on:  the "Try demo" button next to Sign in, or add  ?demo=1  to the page address.  Turn it off:  "Exit demo"
   in the demo panel, Sign out, or ?demo=0.
   Dates are generated relative to today, so the demo always looks current. */
const PD_DEMO = (() => {
  const KEY = 'pd_demo', realLS = window.localStorage;   // captured before demo mode swaps localStorage out (below)
  let q = null; try { q = new URLSearchParams(location.search).get('demo'); } catch (e) {}
  try { if (q === '1') realLS.setItem(KEY, '1'); else if (q === '0') realLS.removeItem(KEY); } catch (e) {}
  // ?demo=1 in the address always wins, even when the browser won't let the flag persist to localStorage
  // (e.g. storage blocked for this origin) — otherwise "Try demo" just reloads into the same dead end.
  let on = q === '1'; if (!on) { try { on = realLS.getItem(KEY) === '1'; } catch (e) {} }
  const api = {
    active: on,
    enter() { try { realLS.setItem(KEY, '1'); } catch (e) {} location.href = location.pathname + '?demo=1'; },
    exit() { try { realLS.removeItem(KEY); } catch (e) {} location.href = location.pathname; }
  };
  if (!on) return api;

  /* ---------- throw-away storage (ported from StudentDeck's demo mode, v0.9.2) ----------
     Everything app.js saves in localStorage — layout, dock placement, open widgets, theme, the goals and wishlist pins a
     parent sets, which child is selected — now goes to an in-memory copy that is dropped on reload. Before this, a demo
     wrote into the real pd_ui_v1: it moved the real widget layout, left demo child ids in the saved goals/pins, and put
     the demo child's id into currentChild. Language, quick-language pair and theme are COPIED in (read only), so a
     Vietnamese parent's demo opens in Vietnamese; changes made during the demo are never written back. */
  class Mem { constructor() { this.m = new Map(); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] || null; }
    getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; } setItem(k, v) { this.m.set(String(k), String(v)); } removeItem(k) { this.m.delete(String(k)); } clear() { this.m.clear(); } }
  const mem = new Mem();
  try {
    const real = JSON.parse(realLS.getItem('pd_ui_v1')) || {}, seed = {};   // 'pd_ui_v1' = UIKEY in app.js (loaded after this file)
    ['lang', 'langPair', 'theme'].forEach(k => { if (real[k] !== undefined) seed[k] = real[k]; });
    mem.setItem('pd_ui_v1', JSON.stringify(seed));
  } catch (e) {}
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => mem }); } catch (e) {}
  if (window.localStorage !== mem) {   // a browser that refuses the swap: do not run a demo that could touch the real settings
    try { realLS.removeItem(KEY); } catch (e) {}
    console.warn('ParentDeck demo: this browser would not let the demo use temporary storage, so it will not start.');
    api.active = false; api.blocked = true; return api;
  }

  /* ---------- helpers ---------- */
  const DAY = 864e5, now = Date.now();
  const dayKey = d => new Date(d).toLocaleDateString('en-CA');
  const ago = n => now - n * DAY;                       // n days ago (negative = in the future)
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // small seeded PRNG: same demo every time
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const ts = ms => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) });
  const uid = p => p + Math.random().toString(36).slice(2, 8);

  /* ---------- practice history (StudentDeck's numbers-only daily sync) ---------- */
  function makeDaily(activeEvery, streakNow) {
    const days = {};
    for (let i = 0; i < 35; i++) {
      const inStreak = i < streakNow;                       // the current streak: every day since today-(streakNow-1)
      const gap = i === streakNow;                          // the day that broke the streak
      const active = inStreak || (!gap && i > streakNow && rnd() < activeEvery);
      if (!active) continue;
      const readMin = ri(10, 35), focus = ri(0, 3), hw = ri(0, 2), games = ri(0, 3), idioms = ri(0, 2);
      const xpBy = { reading: Math.round(readMin * 0.8), focus: focus * 10, todo: hw * 15, game: games * 6, idiom: idioms * 8, daily: 10 };
      days[dayKey(ago(i))] = {
        xp: Object.values(xpBy).reduce((a, b) => a + b, 0), hw, readEntries: readMin ? 1 : 0, readMin, focus, games, gamesStarted: games + (rnd() < .3 ? 1 : 0), idioms,
        mood: ['happy', 'happy', 'meh', 'happy', 'sad'][ri(0, 4)], xpBy,
        timeBy: { reading: readMin * 60, timer: focus * 1500, todo: hw * 420, games: games * 300, idiom: idioms * 180, stats: ri(20, 90), journey: ri(0, 120), class: ri(0, 240) }
      };
    }
    return days;
  }

  /* ---------- the two children ---------- */
  const kids = {};
  function addKid(id, o) {
    const hw = o.homework.map((h, i) => ({ id: id + '_hw' + i, instructions: '', points: 10, ...h }));
    const calendar = [
      ...hw.map(h => ({ id: 'assign-' + h.id, title: h.title, date: h.dueDate, time: h.dueTime || '', type: 'assignment' })),
      ...o.events.map((e, i) => ({ id: id + '_ev' + i, type: 'event', time: '', ...e, date: dayKey(ago(-e.inDays)) }))
    ];
    kids[id] = {
      studentId: id, displayName: o.name, classId: o.classId, className: o.className, level: o.level, points: o.points,
      practice: { xpTotal: o.xpTotal, streak: o.streak, gameScores: o.games, recentXp: o.recent },
      practiceDaily: makeDaily(o.activeEvery, o.streak),
      homework: hw, calendar, rewards: o.rewards, ledger: o.ledger, homeworkDone: {}, notes: o.notes, reports: o.reports, rank: o.rank, classmates: o.classmates
    };
    o.done.forEach(([i, daysAgo, backfilled]) => { kids[id].homeworkDone[hw[i].id] = { done: true, doneAt: ts(ago(daysAgo)), title: hw[i].title, subject: hw[i].subject, ...(backfilled ? { backfilled: true } : {}) }; });
  }
  const due = n => dayKey(ago(-n));                         // due in n days (negative = already past)
  const recent = (arr) => arr.map(([d, s, n], i) => ({ t: ago(d) - i * 3e5, s, n }));

  addKid('demo_minh', {
    name: 'Minh Nguyen', classId: 'demo_5a', className: 'Class 5A', level: 4, points: 340, xpTotal: 520, streak: 5, activeEvery: 0.8,
    games: { word: { name: 'Word Match', plays: 14, best: 95, last: 80, label: 'pts' }, spell: { name: 'Spelling Bee', plays: 9, best: 88, last: 88, label: '%' }, quiz: { name: 'Idiom Quiz', plays: 0, best: null, last: null, label: '' } },
    recent: recent([[0, 'reading', 12], [0, 'daily', 10], [1, 'focus', 20], [1, 'todo', 15], [2, 'game', 6], [2, 'idiom', 8], [3, 'reading', 16], [4, 'journal', 5]]),
    homework: [
      { title: 'Reading log: Chapter 4', subject: 'English', dueDate: due(-3), instructions: 'Read and write three sentences about the main character.' },
      { title: 'Fractions worksheet', subject: 'Math', dueDate: due(-1), points: 15 },
      { title: 'Spelling list 12', subject: 'English', dueDate: due(0), dueTime: '17:00' },
      { title: 'Science: plant diary', subject: 'Science', dueDate: due(2), instructions: 'Draw and label your bean plant.' },
      { title: 'Book report draft', subject: 'English', dueDate: due(4), points: 20 },
      { title: 'Times tables quiz practice', subject: 'Math', dueDate: due(6) },
      { title: 'Geography map labels', subject: 'Social Studies', dueDate: due(-9) }
    ],
    done: [[0, 3], [1, 1], [6, 9, true], [2, 0]],
    events: [{ title: 'Class picnic', inDays: 3, time: '10:00' }, { title: 'Parent-teacher meetings', inDays: 5 }, { title: 'Math unit test', inDays: 8, time: '09:00' }, { title: 'School holiday', inDays: -4 }],
    rewards: [
      { id: 'r1', name: 'Sticker pack', cost: 50, description: 'Pick any sticker sheet.', active: true },
      { id: 'r2', name: 'Pick the class song', cost: 120, description: 'Choose the song for tidy-up time.', active: true },
      { id: 'r3', name: 'Homework pass', cost: 300, description: 'Skip one homework assignment.', active: true },
      { id: 'r4', name: 'Lunch with the teacher', cost: 500, description: 'Bring a friend.', active: true },
      { id: 'r5', name: 'Old reward (retired)', cost: 10, description: '', active: false }
    ],
    ledger: [[0, 10, 'Great participation'], [1, 5, 'Helped a classmate'], [2, 10, 'Homework on time'], [3, -50, 'Redeemed: Sticker pack'], [4, 15, 'Reading challenge'], [6, 10, 'Kindness award'], [8, 5, 'Tidy desk'], [10, 20, 'Science fair project']],
    notes: [
      { mood: 'smiley', text: 'Minh led his group today and encouraged the quieter students to share ideas. Wonderful teamwork!', daysAgo: 0, read: false },
      { mood: 'frowny', text: 'Minh was tired in class today and found it hard to focus on the reading task. Could you check in about sleep and bedtime reading this week? Thank you!', daysAgo: 2, read: false },
      { mood: 'smiley', text: 'Excellent effort on the spelling test, 18 out of 20.', daysAgo: 9, read: true }
    ],
    reports: [
      { daysAgo: 1, frequency: 'weekly', score: 88, skills: ['Reading fluency', 'Fractions: adding unlike denominators', 'Paragraph structure'], improve: ['Spelling of common homophones (their / there)', 'Showing working in maths'], strengths: ['Asks thoughtful questions', 'Reads aloud with expression'], nextFocus: ['Subtracting fractions', 'Writing an opening hook'] },
      { daysAgo: 8, frequency: 'weekly', score: 82, skills: ['Short vowel sounds', 'Multiplication facts to 10'], improve: ['Finishing tasks in the time given'], strengths: ['Kind and helpful in group work'], nextFocus: ['Fractions introduction'] },
      { daysAgo: 30, frequency: 'monthly', score: 'B+', skills: ['Comprehension', 'Place value to 10,000'], improve: ['Handwriting neatness'], strengths: ['Curiosity', 'Perseverance'], nextFocus: ['Book report writing'] }
    ],
    rank: 3, classmates: ['Bao', 'An', 'Minh Nguyen', 'Chi', 'Khoa', 'Linh', 'Phuc', 'Mai', 'Hieu', 'Thao', 'Duc', 'Vy']
  });
  addKid('demo_lan', {
    name: 'Lan Tran', classId: 'demo_3b', className: 'Class 3B', level: 2, points: 120, xpTotal: 180, streak: 2, activeEvery: 0.5,
    games: { word: { name: 'Word Match', plays: 5, best: 70, last: 65, label: 'pts' } },
    recent: recent([[0, 'reading', 9], [1, 'daily', 10], [3, 'game', 6], [5, 'focus', 10]]),
    homework: [
      { title: 'Alphabet tracing sheet', subject: 'English', dueDate: due(-2) },
      { title: 'Counting to 100 practice', subject: 'Math', dueDate: due(1) },
      { title: 'Show and tell: favourite toy', subject: 'English', dueDate: due(3), instructions: 'Bring a toy and say three sentences about it.' },
      { title: 'Colour the shapes', subject: 'Math', dueDate: due(5) }
    ],
    done: [[0, 2]],
    events: [{ title: 'Show and tell day', inDays: 3, time: '08:30' }, { title: 'Library visit', inDays: 6 }],
    rewards: [
      { id: 'r1', name: 'Sticker', cost: 30, description: 'One sticker of your choice.', active: true },
      { id: 'r2', name: 'Line leader', cost: 80, description: 'Lead the line for a day.', active: true },
      { id: 'r3', name: 'Story time pick', cost: 150, description: 'Choose the class story.', active: true }
    ],
    ledger: [[1, 10, 'Lovely handwriting'], [3, 5, 'Good listening'], [5, 10, 'Counting game winner'], [9, -30, 'Redeemed: Sticker'], [12, 15, 'Helped tidy up']],
    notes: [{ mood: 'smiley', text: 'Lan sang a song for the class today and everyone loved it!', daysAgo: 1, read: false }],
    reports: [{ daysAgo: 4, frequency: 'weekly', score: 79, skills: ['Letter sounds A to M', 'Counting to 50'], improve: ['Holding the pencil correctly'], strengths: ['Joyful and confident speaker'], nextFocus: ['Letter sounds N to Z', 'Counting to 100'] }],
    rank: 7, classmates: ['Ha', 'Nam', 'Quan', 'Anh', 'Tu', 'Lan Tran', 'Binh', 'Hoa', 'Son', 'Kim']
  });


  /* ---------- badges (v0.15.0): a copy of StudentDeck's 36-badge catalog, used only to make demo data and the Award badge button ---------- */
  const BADGE_CAT = [
    ...[[50, '🌱', 'First sparks', 1], [100, '💯', 'Century', 1], [250, '⭐', 'Rising star', 1], [500, '🌟', 'Shining bright', 2], [1000, '🏆', 'Thousand club', 2], [2500, '👑', 'XP champion', 3], [5000, '💎', 'XP legend', 4]]
      .map(([n, icon, name, tier]) => ({ id: 'xp_' + n, group: 'xp', tier, icon, name, desc: `Earn ${n.toLocaleString()} XP in total` })),
    ...[[3, '🚀', 'Lift-off', 1], [5, '🎯', 'On target', 1], [8, '🎓', 'Scholar', 2], [10, '🔟', 'Double digits', 3], [15, '🧠', 'Brainiac', 3], [20, '🧙', 'Grand master', 4]]
      .map(([n, icon, name, tier]) => ({ id: 'lv_' + n, group: 'level', tier, icon, name, desc: `Reach level ${n}` })),
    ...[[3, '🔥', 'On a roll', 1], [7, '🗓️', 'Week warrior', 2], [14, '🌠', 'Fortnight focus', 2], [30, '🌙', 'Month master', 3], [100, '🌋', 'Unstoppable', 4]]
      .map(([n, icon, name, tier]) => ({ id: 'st_' + n, group: 'streak', tier, icon, name, desc: `Keep a ${n}-day streak` })),
    ...[[50, '☀️', 'Good day', 1], [100, '⚡', 'Power day', 2], [150, '🌋', 'Maximum effort', 3]]
      .map(([n, icon, name, tier]) => ({ id: 'day_' + n, group: 'day', tier, icon, name, desc: `Earn ${n} XP in a single day` })),
    { id: 'mix_4', group: 'mix', tier: 2, icon: '🧩', name: 'All-rounder', desc: 'Earn XP from 4 different things in one day' },
    { id: 'mix_7', group: 'mix', tier: 3, icon: '🌈', name: 'Whole toolbox', desc: 'Earn XP from 7 different things in one day' },
    ...[['reading', '🐛', 'Bookworm', 'reading', 2], ['focus', '🔭', 'Laser focus', 'focus time', 2], ['todo', '🦸', 'Homework hero', 'homework', 2], ['game', '🎮', 'Game on', 'games', 2], ['idiom', '🗣️', 'Idiom ace', 'idioms', 1],
       ['words', '🔤', 'Word collector', 'new words', 1], ['cards', '🃏', 'Card shark', 'flashcards', 2], ['journal', '📔', 'Dear diary', 'journaling', 1], ['notes', '🗒️', 'Note taker', 'notes', 1], ['docs', '📄', 'Document diver', 'documents', 1]]
      .map(([src, icon, name, what, tier]) => ({ id: 'sk_' + src, group: 'skill', tier, icon, name, desc: `Earn XP from ${what}` })),
    ...[[7, '🌿', 'First week', 1], [30, '📅', 'Month of learning', 2], [100, '🏛️', '100 days', 3]]
      .map(([n, icon, name, tier]) => ({ id: 'hab_' + n, group: 'habit', tier, icon, name, desc: `Be active on ${n} different days` }))
  ];
  // what each demo child has already earned: [badge id, days ago, earned-before-badges-began?]
  const EARNED = {
    demo_minh: [['xp_50', 40, 1], ['xp_100', 33, 1], ['hab_7', 31, 1], ['st_3', 26], ['xp_250', 21], ['lv_3', 17], ['sk_idiom', 14], ['day_50', 11], ['sk_reading', 9], ['xp_500', 4], ['sk_todo', 2], ['st_7', 1]],
    demo_lan: [['xp_50', 20, 1], ['xp_100', 12], ['sk_journal', 3]]
  };
  Object.entries(EARNED).forEach(([kid, list]) => {
    kids[kid].badges = {};
    list.forEach(([bid, d, old]) => { kids[kid].badges[bid] = { t: ago(d), ...(old ? { old: true } : {}) }; });
  });
  const badgeRows = k => Object.entries(k.badges).map(([bid, e]) => { const b = BADGE_CAT.find(x => x.id === bid); return b ? { ...b, t: e.t, old: !!e.old } : null; }).filter(Boolean).sort((a, c) => (c.t - a.t) || (c.tier - a.tier));

  /* ---------- listener plumbing (mirrors data.js) ---------- */
  const session = { uid: 'demo-parent', displayName: 'Demo Parent', email: 'demo.parent@example.com', photoURL: null };
  const L = { auth: new Set(), links: new Set(), child: {}, points: new Set(), hw: new Set(), note: new Set(), notes: new Set(), report: new Set(), badge: new Set() };
  const fire = (set, ...args) => set.forEach(cb => { try { cb(...args); } catch (e) { if (window.console) console.warn('[demo]', e); } });

  function snapshot(id) {
    const k = kids[id]; if (!k) return null;
    const ledger = [...k.ledger].sort((a, b) => b.t - a.t);
    const weekAgo = now - 7 * DAY, last7 = Array.from({ length: 7 }, (_, i) => k.practiceDaily[dayKey(ago(i))]).filter(Boolean);
    const sum7 = f => last7.reduce((a, r) => a + (r[f] || 0), 0);
    const reports = [...k.reports].sort((a, b) => b.t - a.t);
    return {
      studentId: id, displayName: k.displayName, classId: k.classId, className: k.className, points: k.points, level: k.level,
      pointsLog: ledger.map(e => ({ t: e.t, amount: e.delta, reason: e.reason, from: e.redeemed ? 'Redeemed' : 'Teacher' })),
      demerits: [], ranking: { position: null, classSize: null },
      practice: { ...k.practice }, practiceDaily: k.practiceDaily, calendar: k.calendar, homework: k.homework,
      badges: badgeRows(k), attendance: { available: true, days: { ...k.attendance } },
      homeworkDone: { ...k.homeworkDone }, rewards: k.rewards, progressReports: reports, notes: [...k.notes].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()),
      weekly: { pointsEarned: ledger.filter(e => e.t > weekAgo && e.delta > 0).reduce((a, e) => a + e.delta, 0), homeworkDone: sum7('hw'), readingMinutes: sum7('readMin'), demerits: 0 }
    };
  }
  const notify = id => (L.child[id] ? [...L.child[id]] : []).forEach(cb => cb(snapshot(id)));

  // ledger / notes / reports above are given as compact arrays; turn them into the stored shape once
  Object.values(kids).forEach(k => {
    k.ledger = k.ledger.map(([d, delta, reason]) => ({ t: ago(d), delta, reason, redeemed: reason.startsWith('Redeemed') }));
    k.notes = k.notes.map(n => ({ id: uid('n_'), mood: n.mood, text: n.text, read: n.read, createdAt: ts(ago(n.daysAgo) - 36e5) }));
    k.reports = k.reports.map(r => ({ id: uid('p_'), raw: {}, t: ago(r.daysAgo), frequency: r.frequency, score: r.score, skills: r.skills, improve: r.improve, strengths: r.strengths, nextFocus: r.nextFocus }));
  });

  // Attendance (v0.15.0): about 8 school weeks of weekdays per child, taken AFTER everything above so the seeded numbers elsewhere do not change.
  Object.values(kids).forEach(k => {
    k.attendance = {};
    for (let i = 1; i <= 56; i++) {
      const d = new Date(ago(i)), wd = d.getDay(); if (wd === 0 || wd === 6) continue;
      const r = rnd(); k.attendance[dayKey(d)] = { status: r < 0.06 ? 'absent' : r < 0.14 ? 'late' : 'present' };
    }
    const todayD = new Date(now), wd = todayD.getDay();
    if (wd !== 0 && wd !== 6) k.attendance[dayKey(todayD)] = { status: 'present' };
  });
  // Class Pulse (v0.15.0): Minh's class is big enough to answer; Lan's is not, so both states can be shown.
  const PULSE = { demo_5a: { available: true, classSize: 24, ranges: { readMin: { low: 80, high: 180 }, focus: { low: 2, high: 7 }, hwPct: { low: 60, high: 100 } } }, demo_3b: { available: false, reason: 'class-too-small' } };

  /* ---------- replace the PD.* surface ---------- */
  const unreadCount = () => Object.values(kids).reduce((n, k) => n + k.notes.filter(x => !x.read).length, 0);
  Object.assign(PD, {
    isConfigured: () => true,
    onAuthChanged(fn) { L.auth.add(fn); fn(session); return () => L.auth.delete(fn); },
    async signInWithGoogle() { return session; },
    signOut() { api.exit(); },
    getSession: () => session,
    getPro: () => ({ active: false, info: null }),
    onProChanged: () => () => {},
    async activatePro() { throw new Error('This is demo data, so activating Pro is switched off. Exit the demo to use a real key.'); },
    getLinkedChildren: () => Object.values(kids).map(k => ({ studentId: k.studentId, displayName: k.displayName, classId: k.classId, className: k.className })),
    onLinksChanged(fn) { L.links.add(fn); return () => L.links.delete(fn); },
    async linkChild() { throw new Error('This is demo data, so linking a child is switched off. Exit the demo to link a real child.'); },
    async unlinkChild() { throw new Error('This is demo data, so unlinking is switched off.'); },
    getChildSnapshot: id => snapshot(id),
    subscribeChild(id, cb) { (L.child[id] || (L.child[id] = new Set())).add(cb); cb(snapshot(id)); return () => L.child[id] && L.child[id].delete(cb); },
    async refreshChild(id) { await new Promise(r => setTimeout(r, 500)); notify(id); },
    async getRanking(id) {
      const k = kids[id]; await new Promise(r => setTimeout(r, 300));
      const names = k.classmates.filter(n => n !== k.displayName); names.splice(k.rank - 1, 0, k.displayName);   // put the child at their rank
      return { visibility: 'full', rows: names.map((displayName, i) => ({ rank: i + 1, displayName, xp: 600 - i * 40 })) };
    },
    async getClassPulse(id) {
      const k = kids[id]; await new Promise(r => setTimeout(r, 400));
      const p = PULSE[k.classId] || { available: false, reason: 'not-ready' };
      const keys = Array.from({ length: 7 }, (_, i) => dayKey(ago(6 - i)));
      return p.available ? { ...p, weekFrom: keys[0], weekTo: keys[6] } : { ...p };
    },
    onPointsAwarded(fn) { L.points.add(fn); return () => L.points.delete(fn); },
    onHomeworkCompleted(fn) { L.hw.add(fn); return () => L.hw.delete(fn); },
    onBadgeEarned(fn) { L.badge.add(fn); return () => L.badge.delete(fn); },
    onNoteReceived(fn) { L.note.add(fn); return () => L.note.delete(fn); },
    onNotesChanged(fn) { L.notes.add(fn); return () => L.notes.delete(fn); },
    onProgressReportReceived(fn) { L.report.add(fn); return () => L.report.delete(fn); },
    getUnreadNotesCount: unreadCount,
    async markNoteRead(id, noteId) { const n = kids[id].notes.find(x => x.id === noteId); if (n) n.read = true; notify(id); fire(L.notes); }
  });

  /* ---------- demo controls: fire the real-time events on cue ---------- */
  const current = () => { try { if (ui.currentChild && kids[ui.currentChild]) return ui.currentChild; } catch (e) {} return 'demo_minh'; };
  const actions = {
    points() {
      const id = current(), k = kids[id], pool = [[10, 'Great participation'], [5, 'Helped a classmate'], [15, 'Reading challenge'], [10, 'Kindness award'], [-5, 'Talking during story time']];
      const [delta, reason] = pool[ri(0, pool.length - 1)];
      k.points = Math.max(0, k.points + delta); k.ledger.push({ t: Date.now(), delta, reason, redeemed: false });
      notify(id); fire(L.points, snapshot(id), { delta, reason });
    },
    homework() {
      const id = current(), k = kids[id], a = k.homework.find(h => !(k.homeworkDone[h.id] && k.homeworkDone[h.id].done));
      if (!a) { if (typeof toast === 'function') toast('Every demo assignment is already finished. Reload the demo to reset.'); return; }
      const rec = { done: true, doneAt: ts(Date.now()), title: a.title, subject: a.subject };
      k.homeworkDone[a.id] = rec; k.practiceDaily[dayKey(Date.now())] && (k.practiceDaily[dayKey(Date.now())].hw += 1);
      notify(id); fire(L.hw, snapshot(id), a, rec);
    },
    badge() {
      const id = current(), k = kids[id], b = BADGE_CAT.find(x => !k.badges[x.id]);
      if (!b) { if (typeof toast === 'function') toast('Every demo badge is already in the case. Reload the demo to reset.'); return; }
      k.badges[b.id] = { t: Date.now() };
      notify(id); fire(L.badge, snapshot(id), { ...b, t: Date.now(), old: false });
    },
    note(mood) {
      const id = current(), k = kids[id];
      const text = mood === 'frowny' ? k.displayName.split(' ')[0] + ' found today\u2019s lesson difficult and got frustrated. A little extra practice at home would help. Thank you!' : k.displayName.split(' ')[0] + ' answered every question with confidence today. Well done!';
      const n = { id: uid('n_'), mood, text, read: false, createdAt: ts(Date.now()) };
      k.notes.push(n); notify(id); fire(L.notes); fire(L.note, snapshot(id), n);
    },
    report() {
      const id = current(), k = kids[id];
      const r = { id: uid('p_'), raw: {}, t: Date.now(), frequency: 'weekly', score: ri(78, 96), skills: ['Reading comprehension', 'Number patterns'], improve: ['Checking work before handing it in'], strengths: ['Great attitude', 'Works well with partners'], nextFocus: ['Longer reading passages'] };
      k.reports.push(r); notify(id); fire(L.report, snapshot(id), r);
    }
  };

  function buildBar() {
    const bar = document.createElement('div'); bar.id = 'demo-bar'; bar.className = 'demobar';
    bar.innerHTML = `
      <button class="demotab" id="demo-tab" aria-expanded="false">\ud83c\udfac Demo data</button>
      <div class="demopanel" id="demo-panel" hidden>
        <p class="muted" style="margin:0 0 6px">Sample data for Minh (Class 5A) and Lan (Class 3B). These buttons act on the child selected at the top and trigger the live updates a parent would see.</p>
        <div class="row" style="flex-wrap:wrap;gap:6px">
          <button class="btn" data-demo="points">\u2b50 Award points</button>
          <button class="btn" data-demo="homework">\u2705 Homework finished</button>
          <button class="btn" data-demo="badge">\ud83c\udfc5 Award badge</button>
          <button class="btn" data-demo="note-smiley">\ud83d\ude42 Teacher note</button>
          <button class="btn" data-demo="note-frowny">\ud83d\ude41 Concern note</button>
          <button class="btn" data-demo="report">\ud83d\udcc8 Progress report</button>
        </div>
        <div class="row" style="margin-top:8px"><button class="btn" data-demo="exit">Exit demo</button></div>
      </div>`;
    document.body.appendChild(bar);
    const tab = bar.querySelector('#demo-tab'), panel = bar.querySelector('#demo-panel');
    tab.addEventListener('click', () => { panel.hidden = !panel.hidden; tab.setAttribute('aria-expanded', String(!panel.hidden)); });
    panel.addEventListener('click', e => {
      const k = e.target.closest('[data-demo]'); if (!k) return;
      const a = k.dataset.demo;
      if (a === 'exit') api.exit(); else if (a === 'points') actions.points(); else if (a === 'homework') actions.homework(); else if (a === 'badge') actions.badge();
      else if (a === 'report') actions.report(); else if (a.startsWith('note-')) actions.note(a.slice(5));
    });
  }
  document.title = ((window.DECK_EDITION && window.DECK_EDITION.name) || 'ParentDeck') + ' (demo)';   // UniDeck: this app's own name
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildBar); else buildBar();
  return api;
})();

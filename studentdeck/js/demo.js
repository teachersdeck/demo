'use strict';
/* StudentDeck demo mode (v0.9.2; merged with the parallel v0.9.3 line in v0.9.4 — see README) — the whole app with example data built in: no setup, no class code, nothing to type first.

   What you get: "Minh", a student in Class 5A with six weeks of study history (XP by source, time in every widget, reading log, homework,
   games, flashcards, journal moods, Notepad pages with timestamps), the Stats & XP page full of real-looking numbers, and a pretend class
   connection — class points, a rewards list, teacher homework with a calendar — so the Class and Homework Assignments widgets work too.
   A gold "Demo" tab (bottom left) opens a few buttons that play the teacher / make XP so you can show things happening live.

   Safe by construction: the app runs on a throw-away, in-memory copy of localStorage, so your own XP, notes, journal, settings and class
   connection are neither read nor changed; nothing is sent anywhere; reloading starts the demo over. (Files you add in the Files widget
   during the demo are the one thing stored for real, because that library lives in the browser's database, shared by every mode.)

   Load order matters: this file runs BEFORE js/cloud.js so cloud.js's own start-up (it replays a saved class login) finds the empty demo
   storage instead of your real one, and js/app.js calls SD_DEMO.install() before it reads its state. Turn on: "Try the demo" in Settings
   or add ?demo=1 to the address. Turn off: "Exit demo" in the panel or Settings, or ?demo=0. Dates are generated relative to today. */
const SD_DEMO = (() => {
  const FLAG = 'sd_demo_flag', realLS = window.localStorage;
  try { const q = new URLSearchParams(location.search).get('demo'); if (q === '1') realLS.setItem(FLAG, '1'); else if (q === '0') realLS.removeItem(FLAG); } catch (e) {}
  let on = false; try { on = realLS.getItem(FLAG) === '1'; } catch (e) {}
  const api = {
    active: on,
    enter() { try { realLS.setItem(FLAG, '1'); } catch (e) {} location.href = location.pathname + '?demo=1'; },
    exit() { try { realLS.removeItem(FLAG); } catch (e) {} location.href = location.pathname; },
    install() {}
  };
  if (!on) {
    // The parallel v0.9.3 build kept its demo in real localStorage under these two keys. They only ever held demo data; remove them so nothing stale lingers.
    try { realLS.removeItem('sd_demo_on'); realLS.removeItem('sd_demo_v1'); } catch (e) {}
    return api;
  }

  /* ---------- 1. throw-away storage ---------- */
  class Mem { constructor() { this.m = new Map(); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] || null; }
    getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; } setItem(k, v) { this.m.set(String(k), String(v)); } removeItem(k) { this.m.delete(String(k)); } clear() { this.m.clear(); } }
  const mem = new Mem();
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => mem }); } catch (e) {}
  if (window.localStorage !== mem) { try { realLS.removeItem(FLAG); } catch (e) {} console.warn('StudentDeck demo: this browser would not let the demo use temporary storage, so it will not start.'); api.active = false; api.blocked = true; return api; }
  document.title = 'StudentDeck (demo)';

  /* ---------- 2. helpers ---------- */
  const DAY = 864e5, now = Date.now(), dayKey = ms => new Date(ms).toLocaleDateString('en-CA'), ago = n => now - n * DAY;
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = a => a[ri(0, a.length - 1)];
  const uid = () => Math.random().toString(36).slice(2, 9), wait = ms => new Promise(r => setTimeout(r, ms)), lat = () => wait(180 + ri(0, 200));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const at = (daysAgo, h, m) => { const d = new Date(ago(daysAgo)); d.setHours(h, m, ri(0, 59), 0); return d.getTime(); };

  /* ---------- 3. six weeks of history ---------- */
  const daily = {}, readingEntries = [], journal = [];
  const BOOKS = ['Charlotte\u2019s Web', 'The Wild Robot', 'Science Weekly', 'Matilda', 'Diary of a Wimpy Kid'];
  const DIARY = [['happy', 'We did a science experiment with beans today and mine sprouted first!'], ['meh', 'A normal day. Maths was a bit hard but Lan helped me with fractions.'], ['happy', 'Won the word game at lunch. Reading my new book tonight.'], ['sad', 'I forgot my homework at home and felt bad. Tomorrow I will check my bag.'], ['happy', 'Our class planned a picnic. I am bringing sandwiches.']];
  for (let i = 0; i < 42; i++) {
    const active = i <= 5 || (i > 6 && rnd() < 0.78), wd = new Date(ago(i)).getDay(), school = wd >= 1 && wd <= 5;
    if (!active) continue;
    const part = i === 0 ? 0.5 : 1;                                                         // today is only half done
    const F = Math.round(ri(0, 2) * part), H = Math.round(ri(0, 3) * part), R = Math.round(ri(6, 28) * part) || 6, G = Math.round(ri(0, 2) * part), W = Math.round(ri(0, 4) * part), C = Math.round(ri(0, 9) * part), Nn = school ? Math.round(ri(1, 9) * part) : ri(0, 2), Dc = Math.round(ri(0, 2) * part), J = rnd() < 0.45 && i > 0, I = rnd() < 0.6;   // sized so a day rarely passes the app's ~150 XP soft ceiling
    const xpBy = { daily: 5 }; const put = (k, v) => { if (v > 0) xpBy[k] = v; };
    put('focus', Math.min(60, F * 25)); put('todo', Math.min(30, H * 3)); put('reading', Math.min(60, R)); put('game', Math.min(60, G * 14)); put('idiom', I ? 5 : 0); put('words', Math.min(10, W * 2)); put('cards', Math.min(30, C + (C > 5 ? 3 : 0))); put('journal', J ? 5 : 0); put('notes', Nn > 0 ? Math.min(15, 2 + Nn - 1) : 0); put('docs', Math.min(20, Dc * 4));
    const timeBy = { reading: R * 60, timer: F * 1500, todo: H * 240 + 60, games: G * 420, idiom: I ? 150 : 0, translate: W * 80, dict: ri(0, 240), cards: C * 35, stats: ri(20, 160), journey: J ? 240 : 0, notes: Nn * 70, class: ri(0, 180), files: Dc * 200, docs: Dc * 300 };
    Object.keys(timeBy).forEach(k => { if (!timeBy[k]) delete timeBy[k]; });
    daily[dayKey(ago(i))] = { xp: Object.values(xpBy).reduce((a, b) => a + b, 0), xpBy, timeBy, hw: H, readEntries: 1, readMin: R, focus: F, games: G, gamesStarted: G + (rnd() < 0.3 ? 1 : 0), idioms: I ? 1 : 0, wordsSaved: W, cardsReviewed: C, translations: W ? ri(0, W) : 0, lookups: ri(0, 6), notes: Nn };
    readingEntries.push({ id: uid(), date: dayKey(ago(i)), book: pick(BOOKS), min: R });
    if (J) { const [mood, text] = pick(DIARY); journal.push({ id: uid(), ts: at(i, 20, 10), mood, text }); }
  }
  readingEntries.reverse(); journal.sort((a, b) => b.ts - a.ts);
  const xpTotal = Object.values(daily).reduce((a, r) => a + r.xp, 0) + 180;
  const SRC = ['reading', 'reading', 'focus', 'todo', 'game', 'words', 'cards', 'notes', 'notes', 'idiom', 'daily'], xpLog = [];
  for (let k = 0; k < 70; k++) xpLog.push({ t: now - (70 - k) * 33 * 60e3, s: pick(SRC), n: ri(1, 14) });

  const WORDS = [['perimeter', 'the distance around a shape', 'Measure the perimeter of the garden.', 'dict'], ['germinate', 'to start to grow from a seed', 'Beans germinate in a few days.', 'dict'], ['fraction', 'a part of a whole number', 'Half is a fraction.', 'translate'], ['habitat', 'the natural home of an animal or plant', 'A pond is a habitat for frogs.', 'dict'], ['predict', 'to say what will happen', 'Can you predict the weather?', 'dict'], ['Piece of cake', 'something very easy', 'The quiz was a piece of cake.', 'idiom'], ['Break the ice', 'to start a friendly conversation', 'She told a joke to break the ice.', 'idiom'], ['character', 'a person in a story', 'Who is your favourite character?', 'manual'], ['evidence', 'facts that show something is true', 'Show your evidence.', 'dict'], ['equal', 'the same in amount', 'Two halves are equal.', 'translate'], ['journey', 'a long trip', 'Our journey took two hours.', 'translate'], ['curious', 'wanting to learn or know', 'Cats are curious animals.', 'dict']]
    .map(([term, meaning, example, from], i) => ({ id: uid(), term, meaning, example, from, added: ago(20 - i), box: ri(1, 4), due: dayKey(ago(i % 4 === 0 ? 1 : i % 4 === 1 ? 0 : -ri(1, 6))), seen: ri(1, 8), right: ri(0, 6) }));

  // Notepad pages, every line with a time. Lines are placed relative to now so none of them is in the future.
  const L = (min, text) => ({ id: uid(), t: now - min * 60e3, text });
  const pages = [
    { id: uid(), title: 'Science \u00b7 Plant life cycle', subject: 'Science', created: now - 95 * 60e3, updated: now - 8 * 60e3, lines: [L(95, 'Plants start as seeds. A seed needs water, warmth and air to germinate.'), L(89, 'Roots grow down first to take in water. The shoot grows up toward the light.'), L(81, 'Teacher: leaves make food using sunlight (photosynthesis).'), L(74, 'Ask about: why do some seeds need a cold winter before they grow?'), L(63, 'Experiment: bean in the dark vs bean in the window. Predict which grows taller.'), L(8, 'Homework: draw and label the plant diary for Thursday.')] },
    { id: uid(), title: 'Maths \u00b7 Adding fractions', subject: 'Maths', created: at(1, 10, 5), updated: at(1, 10, 52), lines: [{ id: uid(), t: at(1, 10, 5), text: 'Same denominator: add the tops, keep the bottom. 2/8 + 3/8 = 5/8.' }, { id: uid(), t: at(1, 10, 14), text: 'Different denominators: find a common one first. 1/2 + 1/4 = 2/4 + 1/4 = 3/4.' }, { id: uid(), t: at(1, 10, 26), text: 'Simplify at the end by dividing top and bottom by the same number.' }, { id: uid(), t: at(1, 10, 33), text: 'Mistake I made: I added the bottoms too. Remember to keep the bottom.' }, { id: uid(), t: at(1, 10, 52), text: 'Worksheet page 12, questions 1 to 8 for homework.' }] },
    { id: uid(), title: 'English \u00b7 Book report ideas', subject: 'English', created: at(3, 13, 40), updated: at(3, 14, 5), lines: [{ id: uid(), t: at(3, 13, 40), text: 'Book report needs: title, author, main character, problem, solution, my opinion.' }, { id: uid(), t: at(3, 13, 48), text: 'Use the word because in every opinion sentence.' }, { id: uid(), t: at(3, 14, 5), text: 'Draft is due next Monday. Aim for three paragraphs.' }] }
  ];

  // The class: teacher assignments (also mirrored into the calendar) + events + rewards. Ids are fixed so check-offs line up.
  const due = n => dayKey(now + n * DAY);
  const HW = [['demo_hw1', 'Reading log: Chapter 3', 'English', -6, 10], ['demo_hw2', 'Fractions worksheet', 'Math', -3, 15], ['demo_hw3', 'Spelling list 12', 'English', -1, 10], ['demo_hw4', 'Science: plant diary', 'Science', 1, 10], ['demo_hw5', 'Book report draft', 'English', 4, 20]];
  const cloud = {
    joined: { studentId: 'demo_stu', classId: 'demo_5a', displayName: 'Minh', studentJoinCode: 'DEMO-5A', pin: '4821' }, status: 'joined', points: 245, level: 3,
    rewards: [{ id: 'dr1', name: 'Sticker', cost: 30, active: true }, { id: 'dr2', name: 'Pick the class song', cost: 120, active: true }, { id: 'dr3', name: 'Homework pass', cost: 300, active: true }],
    homework: HW.map(h => ({ id: h[0], title: h[1], subject: h[2], dueDate: due(h[3]), dueTime: '', points: h[4] })),
    events: [['Class picnic', 3, '10:00'], ['Parent-teacher meetings', 6, ''], ['Unit test', 9, '09:00']].map((e, i) => ({ id: 'dev' + i, title: e[0], date: due(e[1]), time: e[2], type: 'event' })),
    done: new Map(), classmates: ['Bao', 'An', 'Minh', 'Chi', 'Khoa', 'Linh', 'Phuc', 'Mai']
  };
  [0, 1, 2].forEach(i => cloud.done.set(HW[i][0], { done: true, doneAt: ago(-HW[i][3] - 1) }));

  /* ---------- 4. seed the app's state (load() merges this over its own defaults) ---------- */
  const hwDone = {}; [0, 1, 2].forEach(i => { hwDone[HW[i][0]] = true; });
  mem.setItem('sd_state_v1', JSON.stringify({
    theme: 'ocean', active: { todo: true, notes: true, stats: true },
    layout: window.innerWidth >= 1100 ? { todo: { x: 24, y: 24, w: 330, h: 470, min: false }, notes: { x: 372, y: 24, w: 380, h: 540, min: false } } : {},
    todo: [{ id: uid(), text: 'Pack my sports bag', done: true, awarded: true }, { id: uid(), text: 'Ask Ms. Demo about the picnic', done: false, awarded: false }, { id: uid(), text: 'Finish the plant diary drawing', done: false, awarded: false }],
    hwDone, hwPending: {}, hwCache: cloud.homework.map(a => ({ id: a.id, title: a.title, dueDate: a.dueDate })),
    reading: { entries: readingEntries, startedAt: 0 }, journal: { entries: journal }, notes: { pages, current: pages[0].id, lastAward: 0 },
    // init:false -> the app quietly awards every badge this history qualifies for on first run, leaving the rest locked with progress bars
    badges: { earned: {}, init: false, bestStreak: 6 },
    games: { plays: { 'example-guess-the-number': 7, 'Classroom-Word-Wheel': 4 }, scores: { 'example-guess-the-number': { best: 5, last: 7 }, 'Classroom-Word-Wheel': { best: 85, last: 70 } } },
    idiom: { learned: ['Break the ice', 'Piece of cake', 'Hit the books'], awardDate: '' }, words: WORDS,
    docTime: { d1: { name: 'Fractions workbook.pdf', kind: 'pdf', secs: 5400, opens: 6, last: ago(1) }, d2: { name: 'Plant life cycle (Google Slides)', kind: 'link', secs: 2700, opens: 3, last: ago(0) }, d3: { name: 'Book report template', kind: 'link', secs: 1200, opens: 2, last: ago(3) } },
    xp: { total: xpTotal, streak: 6, last: dayKey(now), log: xpLog }, stats: { daily, syncedThrough: dayKey(ago(1)), syncSchema: 2 }
  }));

  /* ---------- 5. the pretend class connection ---------- */
  const statusL = new Set(), studentL = new Set(), rewardL = new Set(), hwL = new Set(), calL = new Set(), doneL = new Set(), syncL = new Set();
  let syncInfo = { at: now, ok: true, mode: 'full', error: '' };
  const fireStatus = () => statusL.forEach(fn => { try { fn(cloud.status, cloud.status === 'joined' ? cloud.joined : null); } catch (e) {} });
  const later = fn => setTimeout(fn, 0), subscribeTo = (set, cb, snap) => { const f = x => cb(x); set.add(f); later(() => cb(snap())); return () => set.delete(f); };
  const emit = (set, snap) => set.forEach(f => { try { f(snap()); } catch (e) {} });
  const stu = () => ({ id: cloud.joined.studentId, displayName: cloud.joined.displayName, xp: cloud.points, level: cloud.level });
  const hwList = () => [...cloud.homework].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const calList = () => [...cloud.events, ...cloud.homework.map(a => ({ id: 'assign-' + a.id, title: a.title, date: a.dueDate, time: '', type: 'assignment' }))].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const feed = [];   // what the teacher-side buttons did, shown in the panel
  function note(text) { feed.unshift({ t: Date.now(), text }); if (feed.length > 8) feed.pop(); if (paintFeed) paintFeed(); }
  let paintFeed = null;

  api.install = function () {
    Object.assign(SDCloud, {
      isConfigured: () => true, init: () => true, autoResume: async () => {},
      onStatusChanged(fn) { statusL.add(fn); fn(cloud.status, cloud.status === 'joined' ? cloud.joined : null); return () => statusL.delete(fn); },
      getStatus: () => cloud.status, getJoined: () => (cloud.status === 'joined' ? cloud.joined : null),
      async joinClass(code, name) { cloud.status = 'joining'; fireStatus(); await lat();
        if (String(code).trim().toUpperCase() !== 'DEMO-5A') { cloud.status = 'signedOut'; fireStatus(); throw new Error('That class code wasn\u2019t found. In the demo, use DEMO-5A.'); }
        cloud.joined = { ...cloud.joined, displayName: String(name).trim() || 'Minh' }; cloud.status = 'joined'; fireStatus(); note('You joined Class 5A with the code DEMO-5A'); return { ...cloud.joined }; },
      async resumeClass(code, name, pin) { cloud.status = 'joining'; fireStatus(); await lat();
        if (String(code).trim().toUpperCase() !== 'DEMO-5A' || String(pin) !== '4821') { cloud.status = 'signedOut'; fireStatus(); throw new Error('Code or PIN not recognised. In the demo: DEMO-5A and 4821.'); }
        cloud.status = 'joined'; fireStatus(); return { ...cloud.joined }; },
      leaveClass() { cloud.status = 'signedOut'; fireStatus(); },
      subscribeStudent: cb => subscribeTo(studentL, cb, stu), subscribeClassMeta: cb => { later(() => cb({ id: 'demo_5a', className: 'Class 5A' })); return () => {}; },
      subscribeRewards: cb => subscribeTo(rewardL, cb, () => cloud.rewards.filter(r => r.active !== false)),
      subscribeCalendar: cb => subscribeTo(calL, cb, calList), subscribeHomework: cb => subscribeTo(hwL, cb, hwList),
      subscribeHomeworkDone: cb => subscribeTo(doneL, cb, () => new Map(cloud.done)),
      async setHomeworkDone(a, done) { await lat(); if (done) cloud.done.set(a.id, { done: true, doneAt: Date.now() }); else cloud.done.delete(a.id); emit(doneL, () => new Map(cloud.done)); note(`Homework "${a.title}" marked ${done ? 'done' : 'not done'} \u2192 your parent is told in ParentDeck`); return true; },
      async redeemReward(id) { await lat(); const r = cloud.rewards.find(x => x.id === id); if (!r) throw new Error('That reward is no longer available.');
        if (cloud.points < r.cost) throw new Error(`You need ${r.cost} class points \u2014 you have ${cloud.points}.`);
        cloud.points -= r.cost; emit(studentL, stu); note(`Redeemed "${r.name}" for ${r.cost} class points`); return { ok: true }; },
      async getFamilyCode() { await lat(); return 'MINH-7F2Q'; },
      async getRanking() { await lat(); const names = cloud.classmates.filter(n => n !== 'Minh'); names.splice(2, 0, 'Minh'); return { rows: names.map((displayName, i) => ({ rank: i + 1, displayName, xp: 420 - i * 35 })) }; },
      async pushPracticeStats(payload) { await lat(); syncInfo = { at: Date.now(), ok: true, mode: 'full', error: '' }; syncL.forEach(fn => { try { fn({ ...syncInfo }); } catch (e) {} }); return true; },
      getSyncInfo: () => ({ ...syncInfo }), onSyncChanged(fn) { syncL.add(fn); return () => syncL.delete(fn); }
    });
  };

  /* ---------- 6. the demo panel: play the teacher, make XP ---------- */
  const teacher = {
    points() { const n = pick([5, 10, 15, 20]), why = pick(['Great participation', 'Helped a classmate', 'Kindness award', 'Reading challenge']); cloud.points += n; cloud.level = Math.max(cloud.level, 1 + Math.floor(cloud.points / 120)); emit(studentL, stu); toast(`\u2b50 Ms. Demo gave you +${n} class points: ${why}`, 4200); note(`Teacher awarded +${n} class points: ${why}`); },
    homework() { const i = cloud.homework.length + 1, subj = pick(['Math', 'English', 'Science']), titles = { Math: 'Times tables quiz practice', English: 'Write five sentences with new words', Science: 'Find three examples of habitats' };
      const a = { id: 'demo_hw' + i + uid().slice(0, 2), title: titles[subj], subject: subj, dueDate: due(ri(2, 7)), dueTime: '', points: 10 }; cloud.homework.push(a); emit(hwL, hwList); emit(calL, calList); toast('\ud83d\udcdd New homework from your teacher: ' + a.title, 4200); note('Teacher posted homework: ' + a.title); },
    event() { const t = pick(['Library visit', 'Sports day', 'Show and tell', 'Class photo']), e = { id: 'dev' + uid(), title: t, date: due(ri(2, 12)), time: pick(['', '09:30', '13:00']), type: 'event' }; cloud.events.push(e); emit(calL, calList); toast('\ud83d\udcc5 New on the class calendar: ' + t, 4200); note('Teacher added to the calendar: ' + t); },
    badge() {                                                       // shortcut for a live demo: earn the locked badge that is closest to done, with the real pop-up
      const C = badgeCtx(), B = state.badges, prog = x => Math.min(1, x.val(C) / x.need), next = BADGES.filter(x => !B.earned[x.id]).sort((a, c) => prog(c) - prog(a))[0];
      if (!next) { toast('Every badge is already earned.'); return; }
      grantBadge(next, false); save(); popBadge(next); updateBadgeChip(true); refreshStats(); note(`Badge unlocked (demo shortcut): ${next.name}`); },
    xp() { const before = state.xp.total; ['reading', 'focus', 'todo', 'game'].forEach(s => awardXP(s, 12, {})); note(`You earned ${state.xp.total - before} XP across reading, focus, homework and games`); }
  };
  function build() {
    const bar = document.createElement('div'); bar.className = 'demobar'; bar.id = 'demo-bar';
    bar.innerHTML = `<button class="demotab" id="demo-tab" aria-expanded="false">\ud83c\udfac Demo</button>
      <div class="demopanel" id="demo-panel" hidden>
        <p class="muted" style="margin:0 0 8px">You are Minh, in Class 5A, with six weeks of example history. Open <b>Stats &amp; XP</b> (full screen, with your badge medals), <b>Badges &amp; Rewards</b> (the full badge display) and <b>Notepad</b>, then try these:</p>
        <div class="row" style="gap:6px;margin:6px 0"><button class="btn" data-demo="xp">\ud83d\ude80 Earn some XP</button><button class="btn" data-demo="badge">\ud83c\udfc5 Unlock next badge</button><button class="btn" data-demo="points">\u2b50 Teacher gives points</button><button class="btn" data-demo="homework">\ud83d\udcdd Teacher posts homework</button><button class="btn" data-demo="event">\ud83d\udcc5 Teacher adds an event</button></div>
        <p class="muted" style="margin:10px 0 4px">What just happened</p><ol class="demo-feed" id="demo-feed"></ol>
        <p class="muted" style="margin:8px 0 2px">Class code if you leave and rejoin: <b>DEMO-5A</b> \u00b7 PIN <b>4821</b></p>
        <div class="row" style="gap:6px"><button class="btn" data-demo="reset">\u21a9 Reset demo</button><button class="btn" data-demo="exit">Exit demo</button></div>
      </div>`;
    document.body.appendChild(bar);
    const tab = bar.querySelector('#demo-tab'), panel = bar.querySelector('#demo-panel'), ol = bar.querySelector('#demo-feed');
    paintFeed = () => { ol.innerHTML = feed.length ? feed.map(f => `<li><time>${new Date(f.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time> ${esc(f.text)}</li>`).join('') : '<li class="muted">Nothing yet.</li>'; };
    tab.addEventListener('click', () => { panel.hidden = !panel.hidden; tab.setAttribute('aria-expanded', String(!panel.hidden)); });
    panel.addEventListener('click', e => { const k = e.target.closest('[data-demo]'); if (!k) return; const a = k.dataset.demo; if (a === 'exit') api.exit(); else if (a === 'reset') location.reload(); else if (teacher[a]) teacher[a](); });
    paintFeed();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  return api;
})();

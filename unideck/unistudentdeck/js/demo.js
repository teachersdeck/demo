'use strict';
/* UniStudentDeck demo mode (UniDeck v0.3.1; built on StudentDeck's demo, v0.9.2) — the whole app with example data built in: no
   setup, no course code, nothing to type first.

   What you get: "An Nguyen", a second-year student, with six weeks of study history (time in every widget, reading list,
   flashcards, journal, lecture notes with timestamps) and the Study Stats page full of real-looking numbers. The course
   widgets (Courses, Assignments, Grades) run on js/unicourses.js's own demo courses, Academic Writing and Research Methods,
   in which An is the first student. A gold "Demo" tab (bottom left) opens a few buttons that play the instructor so you can
   show things happening live.

   Safe by construction: the app runs on a throw-away, in-memory copy of localStorage, so your own notes, journal, settings and
   sign-in are neither read nor changed; nothing is sent anywhere; reloading starts the demo over. (Files you add in the Files
   widget during the demo are the one thing stored for real, because that library lives in the browser's database.)

   Load order matters: this file runs BEFORE js/cloud.js and js/unicourses.js, and js/app.js calls SD_DEMO.install() before it
   reads its state. Turn on: "Try the demo" in Settings or add ?demo=1 to the address. Turn off: "Exit demo" in the panel or
   Settings, or ?demo=0. Dates are generated relative to today. This file is UniStudentDeck's own (not shared with StudentDeck). */
const SD_DEMO = (() => {
  const FLAG = 'sd_demo_flag', realLS = window.localStorage;
  let q = null; try { q = new URLSearchParams(location.search).get('demo'); } catch (e) {}
  try { if (q === '1') realLS.setItem(FLAG, '1'); else if (q === '0') realLS.removeItem(FLAG); } catch (e) {}
  // ?demo=1 in the address always wins, even when the browser won't let the flag persist to localStorage
  // (e.g. storage blocked for this origin) — otherwise "Try the demo" just reloads into the same dead end.
  let on = q === '1'; if (!on) { try { on = realLS.getItem(FLAG) === '1'; } catch (e) {} }
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
  if (window.localStorage !== mem) { try { realLS.removeItem(FLAG); } catch (e) {} console.warn('UniStudentDeck demo: this browser would not let the demo use temporary storage, so it will not start.'); api.active = false; api.blocked = true; return api; }
  document.title = 'UniStudentDeck (demo)';   // v0.18.0: UniStudentDeck in its own name

  /* ---------- 2. helpers ---------- */
  const DAY = 864e5, now = Date.now(), dayKey = ms => new Date(ms).toLocaleDateString('en-CA'), ago = n => now - n * DAY;
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, ri = (a, b) => a + Math.floor(rnd() * (b - a + 1)), pick = a => a[ri(0, a.length - 1)];
  const uid = () => Math.random().toString(36).slice(2, 9), wait = ms => new Promise(r => setTimeout(r, ms)), lat = () => wait(180 + ri(0, 200));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const at = (daysAgo, h, m) => { const d = new Date(ago(daysAgo)); d.setHours(h, m, ri(0, 59), 0); return d.getTime(); };

  /* ---------- 3. six weeks of history ---------- */
  const daily = {}, readingEntries = [], journal = [];
  const BOOKS = ['Swales & Feak, Academic Writing for Graduate Students', 'Creswell, Research Design (ch. 4)', 'Field, Discovering Statistics', 'Journal article: Flood resilience in Ho Chi Minh City', 'Booth et al., The Craft of Research'];
  const DIARY = [['happy', 'Finally got the thesis statement for Essay 1 to say what I mean. Dr Vu\u2019s comment about narrowing the topic helped.'], ['meh', 'Long day: lecture, then three hours at the library. Read a lot, wrote very little.'], ['happy', 'Study group for Research Methods went well. We split the literature review so nobody drowns.'], ['sad', 'Missed the bus and was late for the seminar. Need to sleep earlier this week.'], ['happy', 'Statistics finally clicked: a confidence interval is about the method, not this one sample.']];
  for (let i = 0; i < 42; i++) {
    const active = i <= 5 || (i > 6 && rnd() < 0.78), wd = new Date(ago(i)).getDay(), school = wd >= 1 && wd <= 5;
    if (!active) continue;
    const part = i === 0 ? 0.5 : 1;                                                         // today is only half done
    const F = Math.round(ri(0, 2) * part), H = Math.round(ri(0, 3) * part), R = Math.round(ri(6, 28) * part) || 6, G = 0, W = Math.round(ri(0, 4) * part), C = Math.round(ri(0, 9) * part), Nn = school ? Math.round(ri(1, 9) * part) : ri(0, 2), Dc = Math.round(ri(0, 2) * part), J = rnd() < 0.45 && i > 0, I = false;   // sized so a day rarely passes the app's ~150 XP soft ceiling
    const xpBy = { daily: 5 }; const put = (k, v) => { if (v > 0) xpBy[k] = v; };
    put('focus', Math.min(60, F * 25)); put('todo', Math.min(30, H * 3)); put('reading', Math.min(60, R)); put('game', Math.min(60, G * 14)); put('idiom', I ? 5 : 0); put('words', Math.min(10, W * 2)); put('cards', Math.min(30, C + (C > 5 ? 3 : 0))); put('journal', J ? 5 : 0); put('notes', Nn > 0 ? Math.min(15, 2 + Nn - 1) : 0); put('docs', Math.min(20, Dc * 4));
    const timeBy = { reading: R * 60, timer: F * 1500, todo: H * 240 + 60, games: G * 420, idiom: I ? 150 : 0, translate: W * 80, dict: ri(0, 240), cards: C * 35, stats: ri(20, 160), journey: J ? 240 : 0, notes: Nn * 70, courses: ri(60, 600), files: Dc * 200, docs: Dc * 300 };
    Object.keys(timeBy).forEach(k => { if (!timeBy[k]) delete timeBy[k]; });
    daily[dayKey(ago(i))] = { xp: Object.values(xpBy).reduce((a, b) => a + b, 0), xpBy, timeBy, hw: H, readEntries: 1, readMin: R, focus: F, games: G, gamesStarted: G + (rnd() < 0.3 ? 1 : 0), idioms: I ? 1 : 0, wordsSaved: W, cardsReviewed: C, translations: W ? ri(0, W) : 0, lookups: ri(0, 6), notes: Nn };
    readingEntries.push({ id: uid(), date: dayKey(ago(i)), book: pick(BOOKS), min: R });
    if (J) { const [mood, text] = pick(DIARY); journal.push({ id: uid(), ts: at(i, 20, 10), mood, text }); }
  }
  readingEntries.reverse(); journal.sort((a, b) => b.ts - a.ts);
  const xpTotal = Object.values(daily).reduce((a, r) => a + r.xp, 0) + 180;
  const SRC = ['reading', 'reading', 'focus', 'todo', 'words', 'cards', 'notes', 'notes', 'docs', 'daily'], xpLog = [];
  for (let k = 0; k < 70; k++) xpLog.push({ t: now - (70 - k) * 33 * 60e3, s: pick(SRC), n: ri(1, 14) });

  const WORDS = [['hedge', 'to soften a claim so it is not stated as certain', 'The results suggest, rather than prove, a link.', 'dict'], ['synthesise', 'to combine ideas from several sources into one argument', 'Synthesise the three studies in one paragraph.', 'dict'], ['operationalise', 'to define how an abstract idea will be measured', 'We operationalise stress as cortisol level.', 'dict'], ['confound', 'a hidden variable that affects both cause and effect', 'Income may confound the link between diet and health.', 'dict'], ['sampling frame', 'the list a sample is actually drawn from', 'Our sampling frame was the student register.', 'manual'], ['tentative', 'not yet certain or final', 'These are tentative findings.', 'translate'], ['salient', 'most noticeable or important', 'The most salient theme was cost.', 'dict'], ['corroborate', 'to confirm with further evidence', 'Interviews corroborate the survey data.', 'dict'], ['p-value', 'the chance of results this extreme if there were no effect', 'A p-value is not the chance the hypothesis is true.', 'manual'], ['literature review', 'a critical summary of what is already known', 'Start the literature review early.', 'translate'], ['paraphrase', 'to restate an idea in your own words', 'Paraphrase, then cite the source.', 'dict'], ['rigorous', 'careful, thorough and exact', 'A rigorous method is easy to repeat.', 'dict']]
    .map(([term, meaning, example, from], i) => ({ id: uid(), term, meaning, example, from, added: ago(20 - i), box: ri(1, 4), due: dayKey(ago(i % 4 === 0 ? 1 : i % 4 === 1 ? 0 : -ri(1, 6))), seen: ri(1, 8), right: ri(0, 6) }));

  // Notepad pages, every line with a time. Lines are placed relative to now so none of them is in the future.
  const L = (min, text) => ({ id: uid(), t: now - min * 60e3, text });
  const pages = [
    { id: uid(), title: 'Academic Writing \u00b7 Week 6: Hedging and stance', subject: 'Academic Writing', created: now - 95 * 60e3, updated: now - 8 * 60e3, lines: [L(95, 'Hedging = showing how sure you are. Too little sounds arrogant, too much sounds unsure.'), L(89, 'Hedges: may, might, appears to, suggests, is likely to, to some extent.'), L(81, 'Boosters: clearly, demonstrates, it is evident. Use only when the evidence is strong.'), L(74, 'Dr Vu: reviewers read stance first. Is the writer committed to the claim?'), L(63, 'Exercise: rewrite 5 claims from my Essay 1 draft with the right strength.'), L(8, 'Revise Essay 1 using the rubric comments before the resubmission.')] },
    { id: uid(), title: 'Research Methods \u00b7 Sampling', subject: 'Research Methods', created: at(1, 10, 5), updated: at(1, 10, 52), lines: [{ id: uid(), t: at(1, 10, 5), text: 'Probability sampling: random, stratified, cluster. Every unit has a known chance.' }, { id: uid(), t: at(1, 10, 14), text: 'Non-probability: convenience, purposive, snowball. Fine for exploring, weak for generalising.' }, { id: uid(), t: at(1, 10, 26), text: 'Our survey: stratified by faculty, then random within each faculty.' }, { id: uid(), t: at(1, 10, 33), text: 'Response rate below 30% is a red flag for non-response bias.' }, { id: uid(), t: at(1, 10, 52), text: 'Survey design draft is due Friday. Ten questions plus the sampling plan.' }] },
    { id: uid(), title: 'Statistics \u00b7 Confidence intervals', subject: 'Statistics', created: at(3, 13, 40), updated: at(3, 14, 5), lines: [{ id: uid(), t: at(3, 13, 40), text: '95% CI: if we repeated the study many times, 95% of the intervals would contain the true mean.' }, { id: uid(), t: at(3, 13, 48), text: 'Wider interval = more uncertainty. Bigger sample = narrower interval.' }, { id: uid(), t: at(3, 14, 5), text: 'Problem set 4: questions 1 to 6, show the working.' }] }
  ];

  // The class: teacher assignments (also mirrored into the calendar) + events + rewards. Ids are fixed so check-offs line up.
  const due = n => dayKey(now + n * DAY);
  const HW = [['demo_hw1', 'Read: Swales & Feak, unit 3', 'Academic Writing', -6, 10], ['demo_hw2', 'Statistics problem set 3', 'Statistics', -3, 15], ['demo_hw3', 'Read: Creswell, chapter 4', 'Research Methods', -1, 10], ['demo_hw4', 'Bring two survey examples to the seminar', 'Research Methods', 1, 10], ['demo_hw5', 'Peer review a classmate\u2019s Essay 1', 'Academic Writing', 4, 20]];
  const cloud = {
    joined: { studentId: 'demo_stu', classId: 'demo_eng201', displayName: 'An Nguyen', studentJoinCode: 'WRIT-2026', pin: '4821' }, status: 'joined', points: 245, level: 3,
    rewards: [],
    homework: HW.map(h => ({ id: h[0], title: h[1], subject: h[2], dueDate: due(h[3]), dueTime: '', points: h[4] })),
    events: [['Seminar: peer review workshop', 3, '10:00'], ['Library session: finding academic sources', 6, '14:00'], ['Statistics midterm', 9, '09:00']].map((e, i) => ({ id: 'dev' + i, title: e[0], date: due(e[1]), time: e[2], type: 'event' })),
    done: new Map(), classmates: ['Binh Tran', 'Chi Le', 'An Nguyen', 'Duc Pham', 'Giang Vo', 'Hanh Do']
  };
  [0, 1, 2].forEach(i => cloud.done.set(HW[i][0], { done: true, doneAt: ago(-HW[i][3] - 1) }));

  /* ---------- 4. seed the app's state (load() merges this over its own defaults) ---------- */
  const hwDone = {}; [0, 1, 2].forEach(i => { hwDone[HW[i][0]] = true; });
  mem.setItem('sd_state_v1', JSON.stringify({
    theme: 'ocean', active: { courses: true, uassign: true, notes: true },   // UniDeck: the course widgets first
    layout: window.innerWidth >= 1100 ? { courses: { x: 24, y: 24, w: 340, h: 520, min: false }, uassign: { x: 384, y: 24, w: 400, h: 560, min: false }, notes: { x: 804, y: 24, w: 380, h: 540, min: false } } : {},
    todo: [{ id: uid(), text: 'Renew library books', done: true, awarded: true }, { id: uid(), text: 'Email Dr Vu about office hours', done: false, awarded: false }, { id: uid(), text: 'Book a study room for Thursday', done: false, awarded: false }],
    hwDone, hwPending: {}, hwCache: cloud.homework.map(a => ({ id: a.id, title: a.title, dueDate: a.dueDate })),
    reading: { entries: readingEntries, startedAt: 0 }, journal: { entries: journal }, notes: { pages, current: pages[0].id, lastAward: 0 },
    // init:false -> the app quietly awards every badge this history qualifies for on first run, leaving the rest locked with progress bars
    badges: { earned: {}, init: false, bestStreak: 6 },
    
    words: WORDS,
    docTime: { d1: { name: 'Essay 1 draft.docx', kind: 'pdf', secs: 5400, opens: 6, last: ago(1) }, d2: { name: 'Week 6 slides: Hedging (Google Slides)', kind: 'link', secs: 2700, opens: 3, last: ago(0) }, d3: { name: 'Survey design template', kind: 'link', secs: 1200, opens: 2, last: ago(3) } },
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
        if (String(code).trim().toUpperCase() !== 'WRIT-2026') { cloud.status = 'signedOut'; fireStatus(); throw new Error('That code wasn\u2019t found. In the demo, use WRIT-2026.'); }
        cloud.joined = { ...cloud.joined, displayName: String(name).trim() || 'An Nguyen' }; cloud.status = 'joined'; fireStatus(); note('You joined Academic Writing with the code WRIT-2026'); return { ...cloud.joined }; },
      async resumeClass(code, name, pin) { cloud.status = 'joining'; fireStatus(); await lat();
        if (String(code).trim().toUpperCase() !== 'WRIT-2026' || String(pin) !== '4821') { cloud.status = 'signedOut'; fireStatus(); throw new Error('Code or PIN not recognised. In the demo: WRIT-2026 and 4821.'); }
        cloud.status = 'joined'; fireStatus(); return { ...cloud.joined }; },
      leaveClass() { cloud.status = 'signedOut'; fireStatus(); },
      subscribeStudent: cb => subscribeTo(studentL, cb, stu), subscribeClassMeta: cb => { later(() => cb({ id: 'demo_eng201', className: 'Academic Writing' })); return () => {}; },
      subscribeRewards: cb => subscribeTo(rewardL, cb, () => cloud.rewards.filter(r => r.active !== false)),
      subscribeCalendar: cb => subscribeTo(calL, cb, calList), subscribeHomework: cb => subscribeTo(hwL, cb, hwList),
      subscribePolicy: cb => { later(() => cb(null)); return () => {}; },   // v0.13.0: no policy document = the defaults
      subscribeHomeworkDone: cb => subscribeTo(doneL, cb, () => new Map(cloud.done)),
      async setHomeworkDone(a, done) { await lat(); if (done) cloud.done.set(a.id, { done: true, doneAt: Date.now() }); else cloud.done.delete(a.id); emit(doneL, () => new Map(cloud.done)); note(`"${a.title}" marked ${done ? 'done' : 'not done'}`); return true; },
      async redeemReward(id) { await lat(); const r = cloud.rewards.find(x => x.id === id); if (!r) throw new Error('That reward is no longer available.');
        if (cloud.points < r.cost) throw new Error(`You need ${r.cost} class points \u2014 you have ${cloud.points}.`);
        cloud.points -= r.cost; emit(studentL, stu); note(`Redeemed "${r.name}" for ${r.cost} class points`); return { ok: true }; },
      async getFamilyCode() { await lat(); return ''; },
      async getRanking() { await lat(); const names = cloud.classmates.filter(n => n !== 'An Nguyen'); names.splice(2, 0, 'An Nguyen'); return { rows: names.map((displayName, i) => ({ rank: i + 1, displayName, xp: 420 - i * 35 })) }; },
      async pushPracticeStats(payload) { await lat(); syncInfo = { at: Date.now(), ok: true, mode: 'full', error: '' }; syncL.forEach(fn => { try { fn({ ...syncInfo }); } catch (e) {} }); return true; },
      getSyncInfo: () => ({ ...syncInfo }), onSyncChanged(fn) { syncL.add(fn); return () => syncL.delete(fn); }
    });
  };

  /* ---------- 6. the demo panel: play the instructor ---------- */
  const C = () => window.UniCourses;
  const teacher = {
    async assignment() {
      const x = pick([['Reading response: hedging in practice', 'Find three hedged claims in this week\u2019s article and explain why the authors hedged them (300 words).', 'text'], ['Upload your Essay 1 outline', 'One page: thesis, three main points, the sources for each. PDF or Word.', 'file'], ['Share your literature review document', 'Share a link to your working literature review (view access for Dr Vu).', 'link']]);
      try { await C().saveAssignment('c1', { title: x[0], instructions: x[1], dueAtMs: now + ri(3, 9) * DAY, points: 10, rubric: [], submitType: x[2], attempts: 2, category: 'assignments' });
        C().setCurrentCourse('c1'); toast('\ud83d\uddc2\ufe0f New assignment in Academic Writing: ' + x[0], 4200); note('Dr Vu posted an assignment: ' + x[0] + ' \u2192 open Assignments'); }
      catch (e) { toast(String(e.message || e)); } },
    async announce() {
      const x = pick([['Office hours moved to Thursday', 'This week only, office hours are Thursday 15:00 in room B204.'], ['Essay 1 grades are out', 'Grades and rubric comments for Essay 1 are released. Read them before you start the annotated bibliography.'], ['Reading for Monday', 'Please read Booth et al., chapter 6 before Monday\u2019s seminar: https://example.edu/eng201/booth-ch6']]);
      try { await C().saveAnnouncement({ courseIds: ['c1'], title: x[0], body: x[1], pinned: false }); C().setCurrentCourse('c1'); toast('\ud83d\udce3 New announcement in Academic Writing: ' + x[0], 4200); note('Dr Vu posted an announcement: ' + x[0] + ' \u2192 open Announcements'); }
      catch (e) { toast(String(e.message || e)); } },
    homework() { const i = cloud.homework.length + 1, subj = pick(['Academic Writing', 'Research Methods', 'Statistics']), titles = { 'Academic Writing': 'Read: the sample essay in unit 4', 'Research Methods': 'Read: two survey studies for Friday', Statistics: 'Watch: the lecture recording on t-tests' };
      const a = { id: 'demo_hw' + i + uid().slice(0, 2), title: titles[subj], subject: subj, dueDate: due(ri(2, 7)), dueTime: '', points: 10 }; cloud.homework.push(a); emit(hwL, hwList); emit(calL, calList); toast('\ud83d\udcda New reading from your instructor: ' + a.title, 4200); note('Instructor added to your to-do list: ' + a.title); },
    event() { const t = pick(['Office hours moved to Wednesday', 'Guest lecture: publishing your first paper', 'Exam review session', 'Thesis proposal deadline']), e = { id: 'dev' + uid(), title: t, date: due(ri(2, 12)), time: pick(['', '09:30', '15:00']), type: 'event' }; cloud.events.push(e); emit(calL, calList); toast('\ud83d\udcc5 New on your calendar: ' + t, 4200); note('Instructor added to the calendar: ' + t); },
    xp() { const before = state.xp.total; ['reading', 'focus', 'todo', 'cards'].forEach(s => awardXP(s, 12, {})); note(`An hour of study logged across reading, focus, to-do and flashcards (${state.xp.total - before} XP, counted even while XP is hidden)`); }
  };
  function build() {
    const bar = document.createElement('div'); bar.className = 'demobar'; bar.id = 'demo-bar';
    bar.innerHTML = `<button class="demotab" id="demo-tab" aria-expanded="false">\ud83c\udfac Demo</button>
      <div class="demopanel" id="demo-panel" hidden>
        <p class="muted" style="margin:0 0 8px">You are An Nguyen, a second-year student, with six weeks of example history. Open <b>Courses</b>, <b>Assignments</b> and <b>Grades</b> (sign in: no real account is used), <b>Study Stats</b> and <b>Notes</b>, then try these. An is also a TA in Research Methods: open the <b>TA desk</b> to grade and run office hours.</p>
        <div class="row" style="gap:6px;margin:6px 0"><button class="btn" data-demo="assignment">\ud83d\uddc2\ufe0f Instructor posts an assignment</button><button class="btn" data-demo="announce">\ud83d\udce3 Instructor posts an announcement</button><button class="btn" data-demo="homework">\ud83d\udcda Instructor adds a reading</button><button class="btn" data-demo="event">\ud83d\udcc5 Instructor adds an event</button><button class="btn" data-demo="xp">\u23f1\ufe0f Log an hour of study</button></div>
        <p class="muted" style="margin:10px 0 4px">What just happened</p><ol class="demo-feed" id="demo-feed"></ol>
        <p class="muted" style="margin:8px 0 2px">Course codes to try in Courses: <b>STAT-1201</b> (Statistics I), <b>WRIT-2026</b> (Academic Writing)</p>
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

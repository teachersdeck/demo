/* v0.9.3 demo: schools, notes to teachers and the school licence (backend v2.1.0), in memory. */
const AD_DEMO_SCHOOL = {
  teachers: [{ uid: 'demo_t1', name: 'Ms Hoa' }, { uid: 'demo_t2', name: 'Mr Nam' }, { uid: 'demo_t3', name: 'Mrs Linh' }],
  notes: [
    { id: 'dn0', teacherUid: 'demo_t1', teacherName: 'Ms Hoa', subject: 'Parents\u2019 evening', text: 'Thursday from 5pm in the hall.', from: 'School office', createdAtMs: Date.now() - 3 * 864e5, read: true, readAtMs: Date.now() - 2 * 864e5 },
    { id: 'dn1', teacherUid: 'demo_t2', teacherName: 'Mr Nam', subject: 'Reading week', text: 'Please log reading minutes in class this week.', from: 'School office', createdAtMs: Date.now() - 864e5, read: false, readAtMs: null }
  ]
};
function adDemoSchool(name, body) {
  const D = AD_DEMO_SCHOOL;
  if (name === 'adminWhoAmI') return { role: 'owner', all: false, schoolId: 'demo', schoolName: 'Demo School', teacherJoinCode: 'DEMO-SCHL', pro: true };
  if (name === 'adminListSchools') return { schools: [{ schoolId: 'demo', name: 'Demo School', teacherJoinCode: 'DEMO-SCHL', pro: true, classes: 9, teachers: 3 }] };
  if (name === 'adminListTeacherNotes') return { notes: D.notes.slice().sort((a, b) => b.createdAtMs - a.createdAtMs), teachers: D.teachers };
  if (name === 'adminSendTeacherNote') {
    const to = body.teacherUids === 'all' ? D.teachers.map(t => t.uid) : (body.teacherUids || []);
    to.forEach(uid => D.notes.push({ id: 'dn' + D.notes.length, teacherUid: uid, teacherName: (D.teachers.find(t => t.uid === uid) || {}).name || '', subject: body.subject || '', text: body.text || '', from: body.from || '', createdAtMs: Date.now(), read: false, readAtMs: null }));
    return { sent: to.length };
  }
  if (['adminCreateSchool', 'adminUpdateSchool', 'adminBackfillSchools', 'adminActivateSchoolLicense'].includes(name)) throw new Error('This is demo data, so managing schools and licences is switched off.');
  return undefined;
}
/* AdminDeck demo mode (v0.2.1; carried into v0.4.1, where School Stats uses it too).
   Lets every widget be shown without Firebase, a deployed backend or an admin secret: a pretend school with seven classes,
   four teachers (plus one class with no teacher account) and 57 students, with the kind of messy detail the
   widgets exist to surface (a duplicated student name, an empty class, a class with no assignments, a class nobody has
   used for over a week, one class that hides student names on the leaderboard).

   How it works: when demo mode is on, this file replaces the public AD.* functions from data.js with in-memory versions
   that return exactly what adminListClasses / adminGetClass return (same fields, same shapes, including doneCount /
   totalStudents and lastActiveAt), so no widget code knows the difference. It loads after data.js and before app.js.
   School Stats (v0.4.1) reads the same school: AD.getSchoolStats is replaced with SS.demoStats() run over these seven classes,
   so its tiles, trends and class table agree with the Snapshot, Pipeline and Roster Health. Nothing is sent anywhere, nothing is
   written anywhere except this tab's memory, and the saved connection settings (project, region, secret) are never touched.

   Turn it on: the "Try demo" button in the top bar, or add ?demo=1 to the page address.
   Turn it off: "Exit demo" (same button), or ?demo=0.
   Dates are generated relative to today, so the demo always looks current. Refreshing a widget (or "Simulate new activity")
   makes a little new activity arrive, so the numbers visibly change. */
const AD_DEMO = (() => {
  const KEY = 'ad_demo';
  try {
    const q = new URLSearchParams(location.search).get('demo');
    if (q === '1') localStorage.setItem(KEY, '1'); else if (q === '0') localStorage.removeItem(KEY);
  } catch (e) {}
  let on = false; try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}
  const api = {
    active: on,
    enter() { try { localStorage.setItem(KEY, '1'); } catch (e) {} location.href = location.pathname + '?demo=1'; },
    exit() { try { localStorage.removeItem(KEY); } catch (e) {} location.href = location.pathname; }
  };

  // The header button is always there: "Try demo" normally, "Exit demo" while the demo is on. (Its label comes from
  // STRINGS via data-i18n, so it follows the language toggle.)
  const hb = document.getElementById('btn-demo');
  if (hb) { hb.dataset.i18n = on ? 'demo_exit' : 'demo_try'; hb.addEventListener('click', () => (on ? api.exit() : api.enter())); }
  if (!on) return api;

  /* ---------- helpers ---------- */
  const DAY = 864e5, now = Date.now();
  const dayKey = ms => { const x = new Date(ms); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const inDays = n => dayKey(now + n * DAY);               // a date n days from today (negative = past)
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // seeded: the same demo every time
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pickFrom = arr => arr[ri(0, arr.length - 1)];
  const clone = o => JSON.parse(JSON.stringify(o));
  const code = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const c = n => Array.from({ length: n }, () => A[ri(0, A.length - 1)]).join(''); return c(4) + '-' + c(4); };

  /* ---------- the school ---------- */
  const TEACHERS = {
    t1: { name: 'Ms. Hanh Pham', email: 'hanh.pham@demo-school.example' },
    t2: { name: 'Mr. David Clarke', email: 'david.clarke@demo-school.example' },
    t3: { name: 'Ms. Linh Vo', email: 'linh.vo@demo-school.example' },
    t4: { name: 'Ms. Thu Tran', email: 'thu.tran@demo-school.example' }
  };
  const NAMES = ['Minh Nguyen', 'Lan Tran', 'Bao Le', 'An Pham', 'Chi Vo', 'Khoa Dang', 'Linh Do', 'Phuc Huynh', 'Mai Bui', 'Hieu Ngo', 'Thao Duong', 'Duc Ly', 'Vy Truong',
    'Nam Le', 'Quan Hoang', 'Anh Dinh', 'Tu Phan', 'Binh Mai', 'Hoa Trinh', 'Son Vu', 'Kim Lam', 'Tien Cao', 'Yen Ta', 'Long Ha', 'Nga Chau', 'Hung Ton', 'Thy Kieu',
    'Tam Quach', 'Uyen La', 'Viet Doan', 'Xuan Thach', 'Yến Luu', 'Giang Ong', 'Huong Tang', 'Khanh Sy', 'Loan Mac', 'Nhi Ung', 'Oanh Bach', 'Phat Ninh', 'Quyen Danh',
    'Rin Sato', 'Sam Lee', 'Tina Chen', 'Uma Rao', 'Victor Kim', 'Wendy Tan', 'Xavier Ng', 'Yuki Mori', 'Zoe Park', 'Amy Wu', 'Ben Ho', 'Cathy Lu', 'Dan Ko', 'Eva Lim'];
  let nameIx = 0; const nextName = () => NAMES[nameIx++ % NAMES.length];

  // homework: [title, subject, due (days from today), points, share of the class that has finished it]
  // events:   [title, days from today, time, type]
  const SPEC = [
    { id: 'demo_5a', name: 'Class 5A', teacher: 't1', n: 12, rank: 'full', active: 0.1, base: 260, part: 0.62, trend: 'up',
      hw: [['Reading log: Chapter 4', 'English', -8, 10, 1], ['Fractions worksheet', 'Math', -3, 15, 0.83], ['Spelling list 12', 'English', -1, 10, 0.75], ['Science: plant diary', 'Science', 0, 10, 0.5], ['Book report draft', 'English', 2, 20, 0.17], ['Times tables practice', 'Math', 4, 10, 0], ['Geography map labels', 'Social Studies', 9, 10, 0]],
      ev: [['Class picnic', 3, '10:00', 'event'], ['Math unit test', 6, '09:00', 'exam'], ['Parent meetings', 8, '', 'event'], ['Science fair', -6, '13:00', 'event'], ['School holiday', 15, '', 'holiday']] },
    { id: 'demo_5b', name: 'Class 5B', teacher: 't1', n: 11, rank: 'anonymized', active: 1.2, base: 230, part: 0.5, trend: 'flat',
      hw: [['Poem recital prep', 'English', -2, 10, 0.64], ['Decimals worksheet', 'Math', 1, 15, 0.27], ['Reading log: Chapter 3', 'English', 3, 10, 0], ['Water cycle poster', 'Science', 5, 20, 0]],
      ev: [['Class picnic', 3, '10:00', 'event'], ['Library visit', 4, '14:00', 'event'], ['Spelling bee', 10, '09:30', 'event']] },
    { id: 'demo_3b', name: 'Class 3B', teacher: 't2', n: 10, rank: 'full', active: 72, base: 180, part: 0.58, trend: 'surge', stopAgo: 3, dupe: true,
      hw: [['Alphabet review', 'English', -5, 10, 1], ['Counting to 100', 'Math', -1, 10, 0.7], ['Show and tell: favourite toy', 'English', 1, 10, 0.2], ['Colour the shapes', 'Math', 4, 10, 0]],
      ev: [['Show and tell day', 2, '08:30', 'event'], ['Library visit', 6, '', 'event'], ['Sports day', 12, '08:00', 'event']] },
    { id: 'demo_ielts', name: 'IELTS Prep', teacher: 't3', n: 8, rank: 'anonymized', active: 9 * 24, base: 340, part: 0.55, trend: 'down', stopAgo: 9,
      hw: [['Task 2 essay: technology', 'Writing', -9, 20, 0.5], ['Listening section 3 practice', 'Listening', -4, 15, 0.38]],
      ev: [['Mock exam', 7, '09:00', 'exam'], ['Speaking practice day', 11, '15:00', 'event']] },
    { id: 'demo_kids', name: 'Kindergarten Stars', teacher: 't4', n: 9, rank: 'full', active: 5, base: 90, part: 0.7, trend: 'flat',
      hw: [], ev: [['Teddy bear picnic', 5, '10:00', 'event'], ['Finger-painting morning', 1, '09:00', 'event']] },
    { id: 'demo_sat', name: 'Saturday Club', teacher: null, n: 7, rank: 'anonymized', active: null, base: 150, part: 0.4, trend: 'flat', unsynced: true,
      hw: [['Weekend reading', 'English', 3, 10, 0.14]], ev: [['Saturday Club open day', 7, '09:00', 'event']] },
    { id: 'demo_new', name: 'Evening Conversation (new)', teacher: 't2', n: 0, rank: 'anonymized', active: null, base: 0, part: 0, trend: 'flat', hw: [], ev: [] }
  ];

  const classes = [], details = {};
  SPEC.forEach(s => {
    const teacher = s.teacher ? TEACHERS[s.teacher] : null;
    const roster = Array.from({ length: s.n }, (_, i) => ({ id: s.id + '_s' + i, name: nextName(), points: Math.max(0, Math.round(s.base * (0.25 + rnd() * 1.1))) }));
    if (s.dupe && roster.length > 3) { roster[2].name = 'Nam Le'; roster[6].name = 'nam le '; }     // Roster Health is case- and space-insensitive
    const hw = s.hw.map((h, i) => ({ id: s.id + '_hw' + i, title: h[0], subject: h[1], dueDate: inDays(h[2]), points: h[3], instructions: '', doneCount: Math.round(h[4] * s.n), totalStudents: s.n }));
    const cal = [
      ...s.ev.map((e, i) => ({ id: s.id + '_ev' + i, title: e[0], date: inDays(e[1]), time: e[2], type: e[3] })),
      ...hw.map(h => ({ id: 'assign-' + h.id, title: h.title, date: h.dueDate, time: '', type: 'assignment' }))      // TeachersDeck mirrors each due date into the calendar
    ];
    const rewards = s.n ? [
      { id: s.id + '_r0', name: 'Sticker', cost: 30, description: 'Pick a sticker.', active: true },
      { id: s.id + '_r1', name: 'Pick the class song', cost: 120, description: '', active: true },
      { id: s.id + '_r2', name: 'Homework pass', cost: 300, description: '', active: s.id !== 'demo_ielts' }
    ] : [];
    const lastActiveAt = s.active === null ? null : now - s.active * 36e5;
    classes.push({ id: s.id, className: s.name, teacherUid: s.teacher ? 'uid_' + s.teacher : null, teacherName: teacher ? teacher.name : null, teacherEmail: teacher ? teacher.email : null, rankingVisibility: s.rank, lastActiveAt });
    details[s.id] = { studentJoinCode: code(), parentJoinCode: code(), roster, rewards, calendarEvents: cal, homework: hw };
  });

  /* ---------- the same two responses the backend gives ---------- */
  const listResponse = () => classes.map(c => ({ ...c, studentCount: details[c.id].roster.length, students: details[c.id].roster.map(s => ({ id: s.id, name: s.name })) }));
  const detailResponse = id => {
    const c = classes.find(x => x.id === id), d = details[id];
    if (!c) throw new Error('No such class');
    return { class: { id: c.id, className: c.className, teacherName: c.teacherName, teacherEmail: c.teacherEmail, studentJoinCode: d.studentJoinCode, parentJoinCode: d.parentJoinCode, rankingVisibility: c.rankingVisibility, lastActiveAt: c.lastActiveAt },
      roster: d.roster, rewards: d.rewards, calendarEvents: d.calendarEvents, homework: d.homework };
  };

  /* A little new activity: a few students earn points, a few assignments get ticked off, and a class that has been
     idle starts using StudentDeck again. Runs on every refresh, so the numbers move when you press Refresh. */
  let drifts = 0;
  function drift() {
    drifts++;
    const withStudents = classes.filter(c => details[c.id].roster.length);
    for (let i = 0; i < 4; i++) {
      const cl = pickFrom(withStudents), r = pickFrom(details[cl.id].roster), gain = ri(5, 25); r.points += gain;
      if (cl.teacherUid && cl.lastActiveAt !== null) ledger.push({ classId: cl.id, delta: gain, awardedBy: cl.teacherUid, createdAtMs: Date.now() });
    }
    classes.forEach(c => details[c.id].homework.forEach(h => { if (h.doneCount < h.totalStudents && rnd() < 0.3) h.doneCount = Math.min(h.totalStudents, h.doneCount + ri(1, 2)); }));
    const idle = classes.find(c => c.id === 'demo_ielts');
    (drifts === 1 && idle ? idle : pickFrom(withStudents)).lastActiveAt = Date.now() - ri(1, 30) * 6e4;
  }

  /* ---------- Wave 1 (v0.6.0): the same school, as the activity summary behind six widgets ----------
     Generated from the classes above and then run through the REAL aggregation (functions/schoolActivity.js, loaded by index.html as
     window.SchoolActivity) — the same code the backend runs — so every number agrees with the Snapshot, Pipeline and Roster Health, and a
     bug in the aggregation would show up here too. It uses its OWN seeded generator, so adding it changes none of the numbers the
     widgets above already showed. Practice days follow each class's participation / trend / stopped-using settings; points follow the
     roster; guardian links cover most students (none in Saturday Club, one orphan in 5A). */
  let seed2 = 7; const rnd2 = () => (seed2 = (seed2 * 16807) % 2147483647) / 2147483647;
  const ri2 = (a, b) => a + Math.floor(rnd2() * (b - a + 1));
  const MOODS = ['😊', '😊', '😊', '😐', '😐', '😢'];
  const teacherUids = {}; Object.keys(TEACHERS).forEach(k => { teacherUids['uid_' + k] = { name: TEACHERS[k].name, email: TEACHERS[k].email }; });
  const streakOf = {}, practice = [], ledger = [], links = [];
  SPEC.forEach(s => {
    const roster = details[s.id].roster, uid = s.teacher ? 'uid_' + s.teacher : null;
    roster.forEach(st => { streakOf[st.id] = ri2(0, 8); });
    // practice days (StudentDeck, written by the student's device)
    if (!s.unsynced) for (let off = 0; off < 30; off++) {
      if (s.stopAgo && off < s.stopAgo) continue;                       // the class stopped using it this many days ago
      const dow = new Date(now - off * DAY).getDay(), wk = (dow === 0 || dow === 6) ? 0.35 : 1;
      const tr = s.trend === 'up' ? 0.6 + 0.4 * (1 - off / 30) : s.trend === 'down' ? 1.2 - 0.6 * (1 - off / 30) : s.trend === 'surge' ? (off < 10 ? 1.5 : 0.6) : 1;
      roster.forEach(st => {
        if (rnd2() >= s.part * wk * tr) return;
        const readMin = ri2(0, 25);
        practice.push({ studentId: st.id, day: dayKey(now - off * DAY), readMin, readEntries: readMin ? 1 : 0, focus: ri2(0, 30), games: ri2(0, 3), idioms: rnd2() < 0.3 ? 1 : 0, hw: rnd2() < 0.35 ? 1 : 0, mood: MOODS[ri2(0, MOODS.length - 1)] });
      });
    }
    // points ledger: awards that add up to each student's points, never newer than the class's last activity; a few deductions and redemptions
    if (uid && s.active !== null && roster.length) {
      const newest = now - s.active * 36e5;
      roster.forEach(st => {
        let left = st.points; const steps = [1, 2, 2, 5, 5, 10];
        while (left > 0) { const a = Math.min(left, steps[ri2(0, steps.length - 1)]); left -= a; ledger.push({ classId: s.id, delta: a, awardedBy: uid, createdAtMs: newest - ri2(0, 40) * DAY - ri2(0, 20) * 36e5 }); }
        if (rnd2() < 0.3) ledger.push({ classId: s.id, delta: -1, awardedBy: uid, createdAtMs: newest - ri2(0, 20) * DAY });
        if (st.points > 150 && rnd2() < 0.5) ledger.push({ classId: s.id, delta: -30, awardedBy: 'self-redemption', redeemedRewardId: s.id + '_r0', createdAtMs: newest - ri2(0, 15) * DAY });
      });
    }
    // guardian links (parents link through the class's parent code)
    if (s.id !== 'demo_sat') roster.forEach((st, i) => {
      if (rnd2() < 0.65) links.push({ parentUid: 'p_' + st.id + 'a', studentId: st.id, classId: s.id, createdAtMs: now - ri2(1, 60) * DAY });
      if (i % 5 === 0 && rnd2() < 0.5) links.push({ parentUid: 'p_' + st.id + 'b', studentId: st.id, classId: s.id, createdAtMs: now - ri2(1, 60) * DAY });
    });
  });
  links.push({ parentUid: 'p_gone', studentId: 'demo_removed_student', classId: 'demo_5a', createdAtMs: now - 30 * DAY });   // a link to a student who has since been removed
  function activityInput() {
    const homework = [], homeworkDone = [];
    classes.forEach(c => details[c.id].homework.forEach(h => {
      homework.push({ id: h.id, classId: c.id, title: h.title, subject: h.subject, dueDate: h.dueDate, dueTime: null });
      const dueMs = Date.parse(h.dueDate + 'T23:59:00');
      details[c.id].roster.slice(0, h.doneCount).forEach((st, i) => {
        homeworkDone.push({ studentId: st.id, assignmentId: h.id, done: true, doneAtMs: i % 5 === 4 ? dueMs + DAY : dueMs - ((i % 3) + 1) * DAY / 2, backfilled: i % 9 === 8 });
      });
    }));
    return {
      classes: classes.map(c => ({ id: c.id, className: c.className, teacherUid: c.teacherUid, createdAtMs: now - (c.id === 'demo_new' ? 3 : 70) * DAY })),   // the '(new)' class really is new
      students: classes.flatMap(c => details[c.id].roster.map(st => ({ id: st.id, classId: c.id, displayName: st.name, xp: st.points, streak: streakOf[st.id] || 0 }))),
      homework, homeworkDone, practiceDaily: practice,
      rewards: classes.flatMap(c => details[c.id].rewards.map(r => ({ id: r.id, classId: c.id, name: r.name, cost: r.cost, active: r.active }))),
      calendarEvents: classes.flatMap(c => details[c.id].calendarEvents.map(() => ({ classId: c.id }))),
      pointsLedger: ledger, guardianLinks: links, teachers: teacherUids
    };
  }

  /* ---------- People Directory (v0.7.0): the REAL backend functions, run over an in-memory database ----------
     functions/adminDirectory.js (the same file the Cloud Functions are deployed from) is loaded by index.html as window.AdminDirectoryFns and driven here with a tiny in-memory Firestore that is pre-filled from the demo school. So the demo exercises the
     real validation, duplicate checks, CSV import planning, backfill and audit code — only the storage is pretend. It starts with staff, two
     pending invitations and one archived person already in the directory, and every teacher, parent and student of the demo school is waiting to
     be adopted ('Import existing accounts'). Nothing is stored anywhere except this tab's memory. */
  class MemDb {
    constructor() { this.cols = {}; this.n = 0; }
    col(name) { return this.cols[name] || (this.cols[name] = new Map()); }
    collection(name) {
      const self = this; let order = null, lim = null;
      return {
        select() { return this; },
        orderBy(f, dir) { order = [f, dir]; return this; },
        limit(n) { lim = n; return this; },
        async get() {
          let docs = Array.from(self.col(name).entries()).map(([id, v]) => ({ id, data: () => ({ ...v }) }));
          if (order) docs.sort((a, b) => (order[1] === 'desc' ? -1 : 1) * ((a.data()[order[0]] || 0) - (b.data()[order[0]] || 0)));
          if (lim != null) docs = docs.slice(0, lim);
          return { docs };
        },
        doc(id) {
          id = id || 'demo' + (++self.n);
          return { id,
            async get() { const v = self.col(name).get(id); return { exists: !!v, id, data: () => ({ ...v }) }; },
            async set(data, opts) { const prev = self.col(name).get(id); self.col(name).set(id, opts && opts.merge ? { ...(prev || {}), ...data } : { ...data }); } };
        }
      };
    }
    batch() { const ops = []; return { set(ref, data, opts) { ops.push([ref, data, opts]); }, async commit() { for (const [r, v, o] of ops) await r.set(v, o); } }; }
  }
  const demoDb = new MemDb();
  classes.forEach(c => demoDb.col('classes').set(c.id, { className: c.className, teacherUid: c.teacherUid }));
  classes.forEach(c => details[c.id].roster.forEach(st => demoDb.col('students').set(st.id, { classId: c.id, displayName: st.name })));
  Object.keys(TEACHERS).forEach(k => demoDb.col('users').set('uid_' + k, { role: 'teacher', displayName: TEACHERS[k].name, email: TEACHERS[k].email }));
  const nameOfStudent = {}; classes.forEach(c => details[c.id].roster.forEach(st => { nameOfStudent[st.id] = st.name; }));
  links.forEach(l => {
    if (!demoDb.col('users').has(l.parentUid)) demoDb.col('users').set(l.parentUid, { role: 'parent', displayName: 'Parent of ' + (nameOfStudent[l.studentId] || 'a former student'), email: l.parentUid.toLowerCase() + '@demo-school.example' });
    demoDb.col('guardianLinks').set(l.parentUid + '_' + l.studentId, { parentUid: l.parentUid, studentId: l.studentId });
  });
  const dirSeed = (id, type, name, o, ageDays) => {
    const at = now - ageDays * DAY;
    demoDb.col('directory').set(id, { personId: id, type, displayName: name, email: '', phone: '', status: type === 'staff' ? 'active' : 'invited', accountLink: null, schoolId: 'default', source: 'manual',
      createdAtMs: at, updatedAtMs: at, archivedAtMs: null, createdBy: 'admin-secret', ...o });
  };
  const mail = (n) => n.toLowerCase().replace(/[^a-z]+/g, '.') + '@demo-school.example';
  dirSeed('demo_f1', 'staff', 'Hoa Tran', { title: 'Office manager', department: 'Administration', email: mail('hoa tran'), phone: '0901 234 567', extension: '102', room: 'Front office', startDate: '2022-08-15', responsibilities: 'Admissions and parent enquiries' }, 90);
  dirSeed('demo_f2', 'staff', 'Duc Pham', { title: 'IT support', department: 'IT', email: mail('duc pham'), phone: '0912 345 678', extension: '140', room: 'Server room', startDate: '2023-01-09', responsibilities: 'Accounts, devices and the school network' }, 75);
  dirSeed('demo_f3', 'staff', 'Lan Nguyen', { title: 'Counsellor', department: 'Student support', email: mail('lan nguyen'), phone: '0933 456 789', extension: '118', room: 'Room 2.04', startDate: '2021-09-01', responsibilities: '' }, 60);
  dirSeed('demo_f4', 'staff', 'Tuan Vo', { title: 'School nurse', department: 'Health', email: mail('tuan vo'), phone: '0944 567 890', extension: '121', room: 'Health room', startDate: '2020-08-24', responsibilities: '' }, 60);
  dirSeed('demo_f5', 'staff', 'Mai Do', { title: 'Librarian', department: 'Library', email: mail('mai do'), phone: '' }, 45);
  dirSeed('demo_f6', 'staff', 'Binh Mai', { title: 'Receptionist', department: 'Administration', email: '', phone: '', status: 'archived', statusBeforeArchive: 'active', archivedAtMs: now - 12 * DAY }, 200);
  dirSeed('demo_t1', 'teacher', 'Ms. Quynh Ha', { subjects: 'English, Drama', employeeNumber: '', email: mail('quynh ha'), phone: '' }, 20);          // invited 20 days ago: a stale invitation
  dirSeed('demo_p1', 'parent', 'Mr. Long Bui', { relationship: 'Father', preferredContact: 'zalo', email: mail('long bui'), phone: '0977 111 222' }, 2);
  // New-intake students who have no TeachersDeck account yet (so 'Import existing accounts' will not touch them); one is already linked to a parent.
  const newClass = classes[0];
  dirSeed('demo_s1', 'student', 'Khoa Dang', { classId: newClass.id, studentNumber: 'N2601' }, 6);
  dirSeed('demo_s2', 'student', 'Linh Pham', { classId: newClass.id, studentNumber: 'N2602' }, 6);
  dirSeed('demo_s3', 'student', 'Thu Hoang', { classId: newClass.id, studentNumber: 'N2603' }, 6);
  demoDb.col('directory').set('demo_p1', { ...demoDb.col('directory').get('demo_p1'), links: [{ studentId: 'demo_s1', relationship: 'Father' }] });
  const AF = AdminDirectoryFns;
  const dirDeps = { onRequest: (o, fn) => fn, logger: { error(e) { console.error(e); }, info() {}, warn() {} }, db: demoDb, FieldValue: { serverTimestamp: () => Date.now() }, secret: {},
    auth: { async getUsers(ids) { return { users: ids.filter(i => TEACHERS[String(i.uid).replace(/^uid_/, '')]).map(i => ({ uid: i.uid, displayName: TEACHERS[String(i.uid).replace(/^uid_/, '')].name, email: TEACHERS[String(i.uid).replace(/^uid_/, '')].email })) }; } },
    handlePreflight: () => false, requireAdmin: () => true };
  const dirFns = { adminDirectoryList: AF.makeAdminDirectoryList(dirDeps), adminDirectoryBackfill: AF.makeAdminDirectoryBackfill(dirDeps), adminDirectoryUpsert: AF.makeAdminDirectoryUpsert(dirDeps),
    adminDirectoryImport: AF.makeAdminDirectoryImport(dirDeps), adminDirectoryArchive: AF.makeAdminDirectoryArchive(dirDeps) };
  // SchoolDeck (v0.8.0): the real functions again, over the same in-memory database.
  const SDF = AdminSchoolDeckFns;
  Object.assign(dirFns, { adminSchoolDeckLink: SDF.makeAdminSchoolDeckLink(dirDeps), adminSchoolDeckImportRoster: SDF.makeAdminSchoolDeckImportRoster(dirDeps), adminSchoolDeckActivity: SDF.makeAdminSchoolDeckActivity(dirDeps) });
  async function dirInvoke(name, body) {
    await new Promise(r => setTimeout(r, 220));
    let code = 200, out;
    const res = { status(c) { code = c; return res; }, json(b) { out = b; return res; }, send() { return res; }, set() { return res; } };
    await dirFns[name]({ method: 'POST', body: body || {}, query: {}, get: () => 'demo' }, res);
    if (code >= 400) { const e = new Error((out && out.error) || 'Request failed'); e.status = code; e.data = out; throw e; }
    return JSON.parse(JSON.stringify(out));
  }

  /* ---------- replace AD.* ---------- */
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let classesP = null, detailP = {}, allP = null, activityP = null;
  const getClasses = force => { if (force || !classesP) classesP = wait(350).then(() => clone(listResponse())); return classesP; };
  const getClassDetail = (id, force) => { if (force || !detailP[id]) detailP[id] = wait(250 + ri(0, 250)).then(() => clone(detailResponse(id))); return detailP[id]; };
  const getAllDetails = async force => {
    if (force) allP = null;
    if (!allP) allP = (async () => { const cs = await getClasses(force); return new Map(await Promise.all(cs.map(async c => [c.id, await getClassDetail(c.id, force)]))); })();
    return allP;
  };
  Object.assign(AD, {
    getConfig: () => ({ project: 'demo-school', region: 'demo', secret: 'demo' }),
    setConfig: () => {},                                   // never overwrite the person's real saved connection
    isConfigured: () => true,
    async callFn(name, { body } = {}) { if (name === 'adminListClasses') return { classes: await getClasses() }; if (name === 'adminGetClass') return detailResponse(body && body.classId); const ds = adDemoSchool(name, body || {}); if (ds !== undefined) return ds; throw new Error('Unknown demo function ' + name); },
    getClasses, getClassDetail, getAllDetails,
    refreshAll() { classesP = null; detailP = {}; allP = null; activityP = null; drift(); },
    // Wave 1 (v0.6.0): the activity summary, computed by the real aggregation over the demo school (see above).
    getSchoolActivity(force) {
      if (force || !activityP) activityP = wait(450).then(() => clone(SchoolActivity.computeSchoolActivity(activityInput(), { nowMs: Date.now(), tzOffsetMin: -new Date().getTimezoneOffset() })));
      return activityP;
    },
    getSchoolActivityOrNull() { return AD.getSchoolActivity().catch(() => null); },
    // People Directory (v0.7.0): the real functions over the in-memory database above.
    directoryList() { return dirInvoke('adminDirectoryList', {}); },
    directoryCall(name, body) { return dirInvoke(name, body); },
    schoolDeckCall(name, body) { return dirInvoke(name, body); },
    // Push to TeachersDeck (v0.5.0): nothing is sent in the demo — it just reports what would have happened, for the classes asked for.
    async pushTheme(classIds, theme) {
      await wait(700);
      const n = classIds === 'all' ? classes.length : classIds.filter((id) => classes.some((c) => c.id === id)).length;
      return { updated: n, missing: [], failed: [] };
    },
    // School Stats: the same seven classes, 120 simulated days of activity per class (deterministic for a given date).
    async getSchoolStats(req) {
      await wait(350);
      const cfgs = SPEC.map(s => ({ id: s.id, name: s.name, teacher: s.teacher ? TEACHERS[s.teacher].name : '', students: details[s.id].roster.length, base: s.part, trend: s.trend, unsynced: !!s.unsynced, stopAgo: s.stopAgo || 0, rank: s.rank }));
      const stats = SS.demoStats(req.today, [], cfgs, req.windows);
      stats.demo = false;                                  // it is "live" as far as the page is concerned: same path as a real backend response
      stats.classes.forEach(c => { const cl = classes.find(x => x.id === c.id); if (cl) { c.lastActiveAt = cl.lastActiveAt; c.teacherName = cl.teacherName || ''; } });
      return clone(stats);
    }
  });

  /* ---------- demo controls ---------- */
  function buildBar() {
    const bar = document.createElement('div'); bar.className = 'demobar';
    bar.innerHTML = `
      <button class="demotab" id="demo-tab" aria-expanded="false">\ud83c\udfac Demo data</button>
      <div class="demopanel" id="demo-panel" hidden>
        <p class="hint" style="margin:0 0 8px">A pretend school (also behind School Stats): 7 classes, 4 teachers, ${classes.reduce((a, c) => a + details[c.id].roster.length, 0)} students. It includes the problems the widgets look for (a repeated student name, an empty class, a class with no assignments, one idle for over a week). Pressing any widget\u2019s Refresh also brings in a little new activity.</p>
        <div class="btn-row" style="flex-wrap:wrap;gap:6px">
          <button class="wbtn sm" data-demo="activity">\ud83d\udd04 Simulate new activity</button>
          <button class="wbtn sm" data-demo="tour">\ud83d\udcca Open key widgets</button>
          <button class="wbtn sm" data-demo="stats">\ud83d\udcc8 Open School Stats</button>
          <button class="wbtn sm" data-demo="reset">\u21a9 Reset demo data</button>
        </div>
      </div>`;
    document.body.appendChild(bar);
    const tab = bar.querySelector('#demo-tab'), panel = bar.querySelector('#demo-panel');
    tab.addEventListener('click', () => { panel.hidden = !panel.hidden; tab.setAttribute('aria-expanded', String(!panel.hidden)); });
    panel.addEventListener('click', e => {
      const a = e.target.closest('[data-demo]'); if (!a) return;
      const act = a.dataset.demo;
      if (act === 'activity') { AD.refreshAll(); refreshOpenWidgets(); toast(t('demo_activity')); }
      else if (act === 'reset') location.reload();
      else if (act === 'stats') { openWidget('schoolstats'); syncDock(); saveState(); }
      else if (act === 'tour') { ['schoolstats', 'assignments', 'points', 'rosterhealth'].forEach(id => openWidget(id)); syncDock(); saveState(); }
    });
  }
  document.title = 'AdminDeck (demo)';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildBar); else buildBar();
  // First demo visit: School Stats is already open full-screen (app.js opens it by default). Put Assignments and Points & Rewards on top of it, side by side,
  // so the demo opens with windows that don't hide each other.
  setTimeout(() => { try {
    const open = Object.keys(state.active).filter(k => state.active[k]);
    if (open.length <= 1 && !state.layout.assignments) {
      if (wall.clientWidth >= 900) {
        state.layout.assignments = { x: 24, y: 110, w: 420, h: 520 };
        state.layout.points = { x: 24 + 420 + 16, y: 110, w: 420, h: 520 };
      }
      openWidget('assignments'); openWidget('points'); syncDock(); saveState();
    }
  } catch (e) {} }, 0);
  return api;
})();

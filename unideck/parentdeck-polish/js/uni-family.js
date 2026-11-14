'use strict';
/* UniDeck's ParentDeck — the family view (UniDeck phase 3, backend v2.17.0).
   ParentDeck's own file in UniDeck (not shared with the suite's ParentDeck). It lists one widget in window.UNI_WIDGETS;
   the shared js/app.js shows it in place of ParentDeck's school widgets when the edition is the university one.

   An adult student opts in from UniStudentDeck, chooses what to share, and gives their family member a one-time invite
   code. Here the family member signs in (a ParentDeck 'parent' account), enters the code, and sees only what the student
   shares: courses, deadlines with submitted / late / missing, released grades and totals, class times and exams. The
   server builds that summary (familyView); nothing here reads course data. Loaded after js/data.js and js/demo.js,
   before js/app.js. Demo (PD_DEMO): two students, one sharing everything and one not sharing right now. */
(function () {
  const h = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (m) => (typeof toast === 'function' ? toast(m, 3600) : alert(m));
  const DEMO = typeof PD_DEMO !== 'undefined' && PD_DEMO.active;
  const DAY = 864e5;
  const day = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const when = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const errText = (e) => (e && e.message ? String(e.message).replace(/^.*?:\s(?=[A-Z])/, '') : 'Something went wrong. Try again.');
  let current = null;
  try { current = localStorage.getItem('ud_family_student'); } catch (e) {}

  /* ---------- data: the real backend, or the demo ---------- */
  const call = async (name, data) => (await firebase.functions().httpsCallable(name)(data || {})).data;
  const R = {
    students: () => call('myFamilyStudents', {}).then((r) => r.students),
    join: (code) => call('joinFamily', { code }),
    view: (studentUid) => call('familyView', { studentUid }),
    leave: (studentUid) => call('removeFamilyLink', { studentUid }),
  };
  const D = (() => {
    if (!DEMO) return null;
    const now = Date.now(), at = (d, hr = 23, m = 59) => { const x = new Date(now + d * DAY); x.setHours(hr, m, 0, 0); return x.getTime(); };
    const wk = (dow, hr, m, w = 0) => { const x = new Date(now); x.setHours(hr, m, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + ((dow + 6) % 7) + w * 7); return x.getTime(); };
    let list = [{ studentUid: 'd1', studentName: 'An Nguyen', sharing: true }, { studentUid: 'd9', studentName: 'Minh Nguyen', sharing: false }];
    const an = { studentName: 'An Nguyen', sharing: true, share: { courses: true, deadlines: true, grades: true, calendar: true }, courses: [
      { title: 'Academic Writing', term: 'Fall 2026', section: 'ENG 201-02', totalPercent: 82.5,
        deadlines: [{ title: 'Essay 1: Argument', dueAtMs: at(-6), status: 'submitted' }, { title: 'Annotated bibliography', dueAtMs: at(3), status: 'todo' }, { title: 'Midterm reflection', dueAtMs: at(10), status: 'todo' }, { title: 'Group presentation: a writing myth', dueAtMs: at(12), status: 'todo' }],
        grades: [{ title: 'Diagnostic paragraph', finalScore: 8, points: 10, releasedAtMs: at(-20) }, { title: 'Essay 1: Argument', finalScore: 17, points: 20, releasedAtMs: at(-1) }],
        calendar: [{ title: 'Lecture: Academic Writing', kind: 'class', startAtMs: wk(1, 9, 0, 1), location: 'Hall B' }, { title: 'Seminar: Academic Writing', kind: 'class', startAtMs: wk(3, 10, 0, 1), location: 'Room B204' }, { title: 'Midterm: in-class writing', kind: 'exam', startAtMs: at(9, 9, 0), location: 'Hall C' }] },
      { title: 'Statistics I', term: 'Fall 2026', section: 'MATH 120', totalPercent: null,
        deadlines: [{ title: 'Problem set 3', dueAtMs: at(-2), status: 'late' }, { title: 'Problem set 4', dueAtMs: at(5), status: 'todo' }],
        grades: [], calendar: [{ title: 'Lecture: Statistics I', kind: 'class', startAtMs: wk(2, 13, 0, 1), location: 'Room M1' }] }] };
    const wait = () => new Promise((r) => setTimeout(r, 150));
    return {
      async students() { await wait(); return list.map((x) => ({ ...x })); },
      async join(code) { await wait(); throw new Error(`In the demo, no student has the code ${String(code).toUpperCase()}. A real code comes from the student’s UniStudentDeck → Family view.`); },
      async view(uid) { await wait(); if (uid === 'd1') return JSON.parse(JSON.stringify(an)); return { studentName: 'Minh Nguyen', sharing: false, share: {}, courses: [] }; },
      async leave(uid) { await wait(); list = list.filter((x) => x.studentUid !== uid); return { ok: true }; },
    };
  })();
  const B = DEMO ? D : R;
  const signedIn = () => DEMO || !!(typeof PD !== 'undefined' && PD.getSession && PD.getSession());

  /* ---------- the widget ---------- */
  const STATUS = { submitted: ['s', 'Submitted'], late: ['l', 'Submitted late'], missing: ['m', 'Missing'], todo: ['', 'To do'] };
  function renderFamily(body) {
    let seq = 0;
    async function draw() {
      const my = ++seq;
      if (!signedIn()) {
        body.innerHTML = `<div class="uf-empty"><p><b>The family view</b></p><p class="muted">An adult student can share their courses, deadlines and grades with you from UniStudentDeck. Sign in with Google, then enter the code they give you.</p>
          <div class="row" style="justify-content:center"><button class="btn primary" data-in>Sign in with Google</button><button class="btn" data-demo>Try the demo</button></div></div>`;
        body.querySelector('[data-in]').onclick = async () => { try { await PD.signInWithGoogle(); draw(); } catch (e) { say(errText(e)); } };
        body.querySelector('[data-demo]').onclick = () => PD_DEMO.enter();
        return;
      }
      body.innerHTML = '<p class="muted uf-pad">Loading…</p>';
      let list;
      try { list = await B.students(); } catch (e) { body.innerHTML = `<p class="uf-pad">${h(errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (!list.some((s) => s.studentUid === current)) current = list[0] ? list[0].studentUid : null;
      const join = `<form class="uf-join" data-join><input type="text" name="code" placeholder="Invite code, e.g. ABCD-2345" maxlength="12" autocomplete="off" aria-label="Invite code"><button class="btn primary">Add</button></form>`;
      if (!current) {
        body.innerHTML = `<div class="uf-pad"><div class="uf-empty"><p><b>No student has shared with you yet</b></p><p class="muted">Ask them to open <b>Family view</b> in UniStudentDeck, turn it on and tap <b>Invite a family member</b>. Enter the code here.</p>${join}</div></div>`;
        wireJoin(); return;
      }
      let v;
      try { v = await B.view(current); } catch (e) { body.innerHTML = `<div class="uf-pad">${tabs(list)}<p>${h(errText(e))}</p></div>`; wireTabs(); return; }
      if (my !== seq) return;
      const shares = Object.entries({ courses: 'courses', deadlines: 'deadlines', grades: 'grades', calendar: 'class times and exams' }).filter(([k]) => v.share && v.share[k]).map(([, l]) => l);
      body.innerHTML = `<div class="uf-pad">${tabs(list)}
        ${!v.sharing ? `<div class="uf-empty"><p><b>${h(v.studentName)} isn’t sharing right now</b></p><p class="muted">They turned the family view off. You’ll see what they share again when they turn it back on.</p></div>`
          : `<p class="muted">${h(v.studentName)} shares ${h(shares.join(', ') || 'nothing yet')}. They choose what you see and can stop at any time.</p>
          ${v.courses.length ? v.courses.map(course).join('') : '<p class="muted">No courses to show.</p>'}`}
        <details class="uf-more"><summary class="muted">Add another student or stop seeing ${h(v.studentName)}</summary>${join}<div class="row"><button class="btn" data-leave>Stop seeing ${h(v.studentName)}</button></div></details></div>`;
      wireTabs(); wireJoin();
      body.querySelector('[data-leave]').onclick = async () => { if (!confirm(`Stop seeing ${v.studentName}? They can invite you again later.`)) return; try { await B.leave(current); current = null; say('Done.'); draw(); } catch (e) { say(errText(e)); } };
    }
    function tabs(list) {
      return `<div class="uf-tabs">${list.map((s) => `<button class="chip ${s.studentUid === current ? 'on' : ''}" data-s="${h(s.studentUid)}">${h(s.studentName)}${s.sharing ? '' : ' · paused'}</button>`).join('')}</div>`;
    }
    function course(c) {
      const dl = c.deadlines, gr = c.grades, cal = c.calendar;
      return `<div class="uf-card"><div class="uf-split"><p class="uf-k">${h(c.title)}</p><span class="muted">${h([c.section, c.term].filter(Boolean).join(' · '))}</span></div>
        ${gr ? `<p class="uf-total">${c.totalPercent === null || c.totalPercent === undefined ? '<span class="muted">No grades released yet</span>' : `Course total so far: <b>${c.totalPercent}%</b>`}</p>` : ''}
        ${dl ? `<p class="uf-h">Deadlines</p>${dl.length ? `<ul class="uf-list">${dl.map((d) => { const [cls, label] = STATUS[d.status] || STATUS.todo; return `<li><span>${h(d.title)}<br><span class="muted">${h(day(d.dueAtMs))}</span></span><span class="uf-tag ${cls}">${label}</span></li>`; }).join('')}</ul>` : '<p class="muted">Nothing due in these five weeks.</p>'}` : ''}
        ${gr && gr.length ? `<p class="uf-h">Released grades</p><ul class="uf-list">${gr.map((g) => `<li><span>${h(g.title)}</span><b>${g.finalScore}/${g.points}</b></li>`).join('')}</ul>` : ''}
        ${cal ? `<p class="uf-h">Next two weeks</p>${cal.length ? `<ul class="uf-list">${cal.slice(0, 8).map((e) => `<li><span>${e.kind === 'exam' ? '📝 ' : '🏛️ '}${h(e.title)}<br><span class="muted">${h(when(e.startAtMs))}${e.location ? ' · ' + h(e.location) : ''}</span></span></li>`).join('')}</ul>` : '<p class="muted">No classes or exams.</p>'}` : ''}</div>`;
    }
    function wireTabs() { body.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { current = b.dataset.s; try { localStorage.setItem('ud_family_student', current); } catch (e) {} draw(); }; }); }
    function wireJoin() {
      const f = body.querySelector('[data-join]'); if (!f) return;
      f.onsubmit = async (e) => { e.preventDefault(); const code = f.code.value.trim(); if (!code) return;
        try { const r = await B.join(code); current = r.studentUid; say(`${r.studentName} is now in your family view.`); draw(); } catch (er) { say(errText(er)); } };
    }
    draw();
    const off = typeof PD !== 'undefined' && PD.onAuthChanged ? PD.onAuthChanged(() => draw()) : null;
    return () => { seq++; if (typeof off === 'function') off(); };
  }

  window.UNI_WIDGETS = [
    { id: 'unifamily', title: '👪 Family view', cat: 'overview', w: 720, h: 640, render: renderFamily,
      iconPath: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M12 20v-5"/><circle cx="12" cy="12" r="1.5"/>' },
  ];
})();

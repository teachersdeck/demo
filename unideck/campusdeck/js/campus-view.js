'use strict';
/* CampusDeck — UniDeck phase 3: Campus stats, Course health and Teaching staff (UniDeck v0.9.0, backend v2.18.0).
   CampusDeck's own file (not shared with AdminDeck). One call, adminCampusData (X-Admin-Secret + school, through
   AdminDeck's AD.callFn), feeds all three widgets:
     - Campus stats: terms, enrolments, submission and on-time rates, and ANONYMISED grade bands per course and for the
       campus. A course with fewer than 5 released course totals shows no bands or average, so no one is identifiable.
     - Course health: what needs a look (no students, no assignments, low or late submissions, students who have
       submitted nothing, a large course without a TA, quiet courses, under-18 students).
     - Teaching staff: instructors and TAs, their courses. Students are only ever counted, never named.
   Loaded after js/campus-courses.js and before js/app.js; adds to window.UNI_WIDGETS. Demo (AD_DEMO): a pretend center. */
(function () {
  const h = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const demoOn = () => typeof AD_DEMO !== 'undefined' && AD_DEMO.active;
  const DAY = 864e5;
  const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

  function demo() {
    const now = Date.now();
    const band = (a) => ['Below 60', '60–69', '70–79', '80–89', '90–100'].map((label, i) => ({ label, count: a[i] }));
    const c = (o) => ({ archived: false, tas: 0, under18: 0, groups: 0, groupAssignments: 0, dueSoFar: o.assignments, grades: { n: 0 }, ...o });
    return {
      minDist: 5,
      courses: [
        c({ courseId: 'c1', title: 'Academic Writing', term: 'Fall 2026', section: 'ENG 201-02', instructor: 'Dr Linh Vu', students: 12, tas: 1, under18: 1, assignments: 5, dueSoFar: 2, groups: 4, groupAssignments: 1,
          submissionRate: 83, onTimeRate: 90, activeShare: 100, lastSubmissionMs: now - 0.5 * DAY, grades: { n: 12, average: 76.4, bands: band([1, 2, 4, 3, 2]) } }),
        c({ courseId: 'c2', title: 'Research Methods', term: 'Fall 2026', section: 'SOC 310', instructor: 'Dr Linh Vu', students: 7, tas: 1, assignments: 2, dueSoFar: 1, groups: 2,
          submissionRate: 100, onTimeRate: 86, activeShare: 100, lastSubmissionMs: now - 2 * DAY, grades: { n: 2, hidden: true } }),
        c({ courseId: 'c6', title: 'Statistics I', term: 'Fall 2026', section: 'MATH 120', instructor: 'Dr Hoa Pham', students: 46, assignments: 6, dueSoFar: 4,
          submissionRate: 58, onTimeRate: 64, activeShare: 72, lastSubmissionMs: now - 1 * DAY, grades: { n: 41, average: 68.9, bands: band([9, 10, 11, 7, 4]) } }),
        c({ courseId: 'c3', title: 'IELTS Writing Task 2', term: 'Fall 2026', section: 'Evening B', instructor: 'Ms Thao Nguyen', students: 18, under18: 3, assignments: 6, dueSoFar: 5,
          submissionRate: 81, onTimeRate: 93, activeShare: 94, lastSubmissionMs: now - 3 * DAY, grades: { n: 18, average: 81.2, bands: band([0, 2, 4, 8, 4]) } }),
        c({ courseId: 'c4', title: 'TOEIC Listening & Reading', term: 'Fall 2026', section: 'Weekend', instructor: 'Mr Quang Ho', students: 24, assignments: 5, dueSoFar: 4,
          submissionRate: 67, onTimeRate: 88, activeShare: 79, lastSubmissionMs: now - 17 * DAY, grades: { n: 20, average: 72.5, bands: band([3, 4, 6, 5, 2]) } }),
        c({ courseId: 'c7', title: 'Academic Reading', term: 'Fall 2026', section: 'ENG 105', instructor: 'Ms Thao Nguyen', students: 0, assignments: 0, dueSoFar: 0,
          submissionRate: null, onTimeRate: null, activeShare: null, lastSubmissionMs: null }),
        c({ courseId: 'c5', title: 'Business English', term: 'Summer 2026', section: '', instructor: 'Ms Thao Nguyen', students: 15, assignments: 8, dueSoFar: 8, archived: true,
          submissionRate: 74, onTimeRate: 85, activeShare: 93, lastSubmissionMs: now - 80 * DAY, grades: { n: 15, average: 78.0, bands: band([1, 2, 5, 4, 3]) } }),
      ],
      staff: [
        { name: 'Dr Hoa Pham', email: 'hoa.pham@demo.uni.edu', courses: [{ title: 'Statistics I', term: 'Fall 2026', role: 'instructor' }] },
        { name: 'Dr Linh Vu', email: 'linh.vu@demo.uni.edu', courses: [{ title: 'Academic Writing', term: 'Fall 2026', role: 'instructor' }, { title: 'Research Methods', term: 'Fall 2026', role: 'instructor' }] },
        { name: 'An Nguyen', email: 'an.nguyen@demo.uni.edu', courses: [{ title: 'Research Methods', term: 'Fall 2026', role: 'ta' }] },
        { name: 'Bao Tran', email: 'bao.tran@demo.uni.edu', courses: [{ title: 'Academic Writing', term: 'Fall 2026', role: 'ta' }] },
        { name: 'Mr Quang Ho', email: 'quang.ho@demo.uni.edu', courses: [{ title: 'TOEIC Listening & Reading', term: 'Fall 2026', role: 'instructor' }] },
        { name: 'Ms Thao Nguyen', email: 'thao.nguyen@demo.uni.edu', courses: [{ title: 'IELTS Writing Task 2', term: 'Fall 2026', role: 'instructor' }, { title: 'Academic Reading', term: 'Fall 2026', role: 'instructor' }, { title: 'Business English', term: 'Summer 2026', role: 'instructor' }] },
      ],
    };
  }

  let cache = null;
  async function load(fresh) {
    if (demoOn()) { await new Promise((r) => setTimeout(r, 150)); return demo(); }
    if (typeof AD === 'undefined' || !AD.isConfigured || !AD.isConfigured()) { const e = new Error('Connect CampusDeck to your backend in Settings (project, region, admin key) to see your campus.'); e.setup = true; throw e; }
    if (!cache || fresh || Date.now() - cache.at > 60000) cache = { at: Date.now(), p: AD.callFn('adminCampusData') };
    try { return await cache.p; } catch (e) { cache = null; throw e; }
  }
  function failure(body, e) {
    body.innerHTML = `<div class="cc-pad"><p>${h(e.notDeployed ? 'The campus function is not deployed on this backend yet (backend v2.18.0).' : e.message)}</p>
      ${e.setup ? '<div class="btn-row"><button class="wbtn primary" data-demo>Try the demo</button></div>' : ''}</div>`;
    const d = body.querySelector('[data-demo]'); if (d) d.onclick = () => AD_DEMO.enter();
  }
  const termsOf = (courses) => [...new Set(courses.map((c) => c.term || 'No term'))];
  const termPick = (terms, cur) => `<label class="cc-check">Term <select data-term><option value="">All terms</option>${terms.map((t) => `<option ${t === cur ? 'selected' : ''}>${h(t)}</option>`).join('')}</select></label>`;
  const avg = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  function bars(bands, big) {
    const max = Math.max(1, ...bands.map((b) => b.count));
    return `<span class="cv-bands ${big ? 'big' : ''}" role="img" aria-label="${h(bands.map((b) => `${b.label}: ${b.count}`).join(', '))}">${bands.map((b) => `<span class="cv-band" title="${h(b.label)}: ${b.count}"><i style="height:${Math.round((b.count / max) * 100)}%"></i>${big ? `<em>${b.count}</em><small>${h(b.label)}</small>` : ''}</span>`).join('')}</span>`;
  }

  /* ---------------- Campus stats ---------------- */
  function renderStats(body) {
    let term = null, gone = false;
    async function draw(fresh) {
      body.innerHTML = '<p class="cc-pad cc-lo">Loading…</p>';
      let d;
      try { d = await load(fresh); } catch (e) { if (!gone) failure(body, e); return; }
      if (gone) return;
      const terms = termsOf(d.courses);
      if (term === null) term = terms.find((t) => d.courses.some((c) => (c.term || 'No term') === t && !c.archived)) || '';
      const cs = d.courses.filter((c) => !term || (c.term || 'No term') === term);
      const staffIn = (role) => new Set(d.staff.filter((p) => p.courses.some((x) => x.role === role && (!term || (x.term || 'No term') === term))).map((p) => p.email || p.name)).size;
      const withBands = cs.filter((c) => c.grades && c.grades.bands);
      const campus = withBands.length ? withBands[0].grades.bands.map((b, i) => ({ label: b.label, count: withBands.reduce((a, c) => a + c.grades.bands[i].count, 0) })) : null;
      const graded = withBands.reduce((a, c) => a + c.grades.n, 0);
      body.innerHTML = `<div class="cc-pad">
        <div class="cc-row">${termPick(terms, term)}<button class="wbtn" data-refresh>Refresh</button></div>
        <div class="cc-tiles cv-six"><div><b>${cs.length}</b><span>courses</span></div><div><b>${cs.reduce((a, c) => a + c.students, 0)}</b><span>enrolments</span></div><div><b>${staffIn('instructor')}</b><span>instructors</span></div><div><b>${staffIn('ta')}</b><span>TAs</span></div>
          <div><b>${pct(avg(cs.map((c) => c.submissionRate)))}</b><span>avg. submitted</span></div><div><b>${pct(avg(cs.map((c) => c.onTimeRate)))}</b><span>avg. on time</span></div></div>
        ${campus ? `<div class="cv-card"><p class="cc-term" style="margin-top:0">Course totals across ${withBands.length} course${withBands.length === 1 ? '' : 's'} <span class="cc-lo">· ${graded} students with released grades</span></p>${bars(campus, true)}</div>` : ''}
        <table class="cc-tbl"><thead><tr><th>Course</th><th>Students</th><th>Submitted</th><th>On time</th><th>Active</th><th>Course totals</th></tr></thead><tbody>
          ${cs.map((c) => `<tr class="${c.archived ? 'cc-ended' : ''}"><td><b>${h(c.title)}</b><br><span class="cc-lo">${h([c.section, c.instructor].filter(Boolean).join(' · '))}</span></td>
            <td>${c.students}${c.tas ? `<br><span class="cc-lo">+${c.tas} TA</span>` : ''}</td><td>${pct(c.submissionRate)}</td><td>${pct(c.onTimeRate)}</td><td>${pct(c.activeShare)}</td>
            <td>${c.grades && c.grades.bands ? `${bars(c.grades.bands)} <span class="cc-lo">avg ${c.grades.average}%</span>` : `<span class="cc-lo">${c.grades && c.grades.hidden ? `fewer than ${d.minDist} released` : 'none released'}</span>`}</td></tr>`).join('') || '<tr><td colspan="6" class="cc-lo">No courses in this term.</td></tr>'}</tbody></table>
        <p class="cc-lo">No student names. Submitted: of the work due so far. On time: of what came in. Active: students who have submitted anything. Course totals use released grades only, in five bands (below 60, 60s, 70s, 80s, 90+), and are hidden for a course with fewer than ${d.minDist} students graded.</p></div>`;
      body.querySelector('[data-term]').onchange = (e) => { term = e.target.value; draw(); };
      body.querySelector('[data-refresh]').onclick = () => draw(true);
    }
    draw();
    return () => { gone = true; };
  }

  /* ---------------- Course health ---------------- */
  function flagsOf(c, now) {
    const f = [];
    if (c.archived) return f;
    if (!c.students) f.push(['warn', 'No students yet', 'Share the course code with the class.']);
    if (!c.assignments) f.push(['warn', 'No assignments yet', '']);
    if (c.dueSoFar && c.submissionRate !== null && c.submissionRate < 60) f.push(['bad', `Low submissions: ${c.submissionRate}%`, 'Of the work due so far.']);
    if (c.onTimeRate !== null && c.onTimeRate < 70) f.push(['warn', `Many late submissions: ${100 - c.onTimeRate}% late`, '']);
    if (c.students && c.activeShare !== null && c.activeShare < 80 && c.dueSoFar) f.push(['warn', `${100 - c.activeShare}% of students have submitted nothing`, `About ${Math.round(c.students * (100 - c.activeShare) / 100)} students.`]);
    if (c.students >= 40 && !c.tas) f.push(['warn', 'Large course without a TA', `${c.students} students.`]);
    if (c.dueSoFar && c.lastSubmissionMs && now - c.lastSubmissionMs > 14 * DAY) f.push(['warn', 'Quiet: nothing submitted for two weeks', '']);
    if (c.under18) f.push(['info', `${c.under18} under-18 student${c.under18 === 1 ? '' : 's'}`, 'AI tools are off for them.']);
    return f;
  }
  function renderHealth(body) {
    let gone = false;
    async function draw(fresh) {
      body.innerHTML = '<p class="cc-pad cc-lo">Loading…</p>';
      let d;
      try { d = await load(fresh); } catch (e) { if (!gone) failure(body, e); return; }
      if (gone) return;
      const now = Date.now();
      const rows = d.courses.filter((c) => !c.archived).map((c) => ({ c, f: flagsOf(c, now) }));
      const need = rows.filter((r) => r.f.some(([k]) => k !== 'info')), ok = rows.filter((r) => !r.f.some(([k]) => k !== 'info'));
      body.innerHTML = `<div class="cc-pad"><div class="cc-row"><p class="cc-lo" style="margin:0">${need.length} of ${rows.length} active course${rows.length === 1 ? '' : 's'} need a look.</p><button class="wbtn" data-refresh>Refresh</button></div>
        ${need.map(({ c, f }) => `<div class="cv-card"><p class="cv-k">${h(c.title)} <span class="cc-lo">${h([c.section, c.term, c.instructor].filter(Boolean).join(' · '))}</span></p>
          <ul class="cv-flags">${f.map(([k, t, n]) => `<li class="${k}"><span>${k === 'bad' ? '⛔' : k === 'warn' ? '⚠️' : 'ℹ️'}</span><span>${h(t)}${n ? ` <span class="cc-lo">${h(n)}</span>` : ''}</span></li>`).join('')}</ul></div>`).join('') || '<p>All active courses look healthy.</p>'}
        ${ok.length ? `<p class="cc-term">Looking fine</p><p class="cc-lo">${ok.map(({ c, f }) => h(c.title) + (f.length ? ' (' + f.map(([, t]) => h(t)).join(', ') + ')' : '')).join(' · ')}</p>` : ''}
        <p class="cc-lo">Ended courses are left out. Counts only, no student names.</p></div>`;
      body.querySelector('[data-refresh]').onclick = () => draw(true);
    }
    draw();
    return () => { gone = true; };
  }

  /* ---------------- Teaching staff ---------------- */
  function renderStaff(body) {
    let q = '', gone = false;
    async function draw(fresh) {
      if (!body.querySelector('[data-q]')) body.innerHTML = '<p class="cc-pad cc-lo">Loading…</p>';
      let d;
      try { d = await load(fresh); } catch (e) { if (!gone) failure(body, e); return; }
      if (gone) return;
      const all = d.staff.map((p) => ({ ...p, isI: p.courses.some((x) => x.role === 'instructor'), isT: p.courses.some((x) => x.role === 'ta') }));
      const shown = all.filter((p) => !q || `${p.name} ${p.email} ${p.courses.map((x) => x.title).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
      body.innerHTML = `<div class="cc-pad"><div class="cc-row"><input type="search" class="cv-search" data-q placeholder="Search by name, email or course" value="${h(q)}" aria-label="Search staff"><button class="wbtn" data-refresh>Refresh</button></div>
        <p class="cc-lo">${all.filter((p) => p.isI).length} instructors · ${all.filter((p) => p.isT).length} TAs (students an instructor made a TA)</p>
        <table class="cc-tbl"><thead><tr><th>Name</th><th>Courses</th></tr></thead><tbody>
          ${shown.map((p) => `<tr><td><b>${h(p.name)}</b><br><span class="cc-lo">${h(p.email)}</span></td><td>${p.courses.map((x) => `${h(x.title)} <span class="cc-tag">${x.role === 'ta' ? 'TA' : 'instructor'}</span> <span class="cc-lo">${h(x.term)}</span>`).join('<br>')}</td></tr>`).join('') || '<tr><td colspan="2" class="cc-lo">Nobody matches.</td></tr>'}</tbody></table></div>`;
      const s = body.querySelector('[data-q]');
      s.oninput = () => { q = s.value; const pos = s.selectionStart; draw().then(() => { const n = body.querySelector('[data-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); };
      body.querySelector('[data-refresh]').onclick = () => draw(true);
    }
    draw();
    return () => { gone = true; };
  }

  window.UNI_WIDGETS = (window.UNI_WIDGETS || []).concat([
    { id: 'campusstats', title: '📊 Campus stats', icon: 'chart', w: 820, h: 640, render: renderStats },
    { id: 'coursehealth', title: '🩺 Course health', icon: 'pulse', w: 520, h: 600, render: renderHealth },
    { id: 'campusstaff', title: '🧑‍🏫 Teaching staff', icon: 'people', w: 560, h: 560, render: renderStaff },
  ]);
})();

'use strict';
/* CampusDeck — UniDeck phase 1: Courses (UniDeck v0.3.0). CampusDeck's own file (not shared with AdminDeck).
   Every UniDeck course in the admin's school or center, with counts only: instructor, term, students, assignments and
   the share of expected submissions that came in. No student names, as on School Stats. Data: the backend's
   adminListCourses (X-Admin-Secret + school, through AdminDeck's own AD.callFn). In the demo, a pretend language
   center. The shared js/app.js adds the widget when the edition is the university one. Loaded before js/app.js. */
(function () {
  const h = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const demoOn = () => typeof AD_DEMO !== 'undefined' && AD_DEMO.active;
  const DEMO = [
    { courseId: 'c1', title: 'Academic Writing', term: 'Fall 2026', section: 'ENG 201-02', instructor: 'Dr Linh Vu', students: 12, assignments: 4, submissionRate: 52, archived: false },
    { courseId: 'c2', title: 'Research Methods', term: 'Fall 2026', section: 'SOC 310', instructor: 'Dr Linh Vu', students: 7, assignments: 1, submissionRate: 0, archived: false },
    { courseId: 'c3', title: 'IELTS Writing Task 2', term: 'Fall 2026', section: 'Evening B', instructor: 'Ms Thao Nguyen', students: 18, assignments: 6, submissionRate: 81, archived: false },
    { courseId: 'c4', title: 'TOEIC Listening & Reading', term: 'Fall 2026', section: 'Weekend', instructor: 'Mr Quang Ho', students: 24, assignments: 5, submissionRate: 67, archived: false },
    { courseId: 'c5', title: 'Business English', term: 'Summer 2026', section: '', instructor: 'Ms Thao Nguyen', students: 15, assignments: 8, submissionRate: 74, archived: true },
  ];

  async function load() {
    if (demoOn()) { await new Promise((r) => setTimeout(r, 150)); return DEMO; }
    if (typeof AD === 'undefined' || !AD.isConfigured || !AD.isConfigured()) { const e = new Error('Connect CampusDeck to your backend in Settings (project, region, admin key) to see your courses.'); e.setup = true; throw e; }
    const r = await AD.callFn('adminListCourses');
    return (r && r.courses) || [];
  }

  function renderCourses(body) {
    let showEnded = false, gone = false;
    async function draw() {
      body.innerHTML = '<p class="cc-pad cc-lo">Loading courses…</p>';
      let list;
      try { list = await load(); }
      catch (e) {
        if (gone) return;
        body.innerHTML = `<div class="cc-pad"><p>${h(e.notDeployed ? 'The courses function is not deployed on this backend yet (backend v2.12.0).' : e.message)}</p>
          ${e.setup ? '<div class="btn-row"><button class="wbtn primary" data-demo>Try the demo</button></div>' : ''}</div>`;
        const d = body.querySelector('[data-demo]'); if (d) d.onclick = () => AD_DEMO.enter();
        return;
      }
      if (gone) return;
      const shown = list.filter((c) => showEnded || !c.archived);
      const active = list.filter((c) => !c.archived);
      const students = active.reduce((a, c) => a + (c.students || 0), 0);
      const rated = active.filter((c) => c.submissionRate !== null && c.submissionRate !== undefined && c.assignments);
      const avgRate = rated.length ? Math.round(rated.reduce((a, c) => a + c.submissionRate, 0) / rated.length) : null;
      const instructors = new Set(active.map((c) => c.instructor).filter(Boolean)).size;
      const terms = [...new Set(shown.map((c) => c.term || 'No term'))];
      body.innerHTML = `<div class="cc-pad">
        <div class="cc-tiles"><div><b>${active.length}</b><span>active courses</span></div><div><b>${students}</b><span>enrolments</span></div><div><b>${instructors}</b><span>instructors</span></div><div><b>${avgRate === null ? '—' : avgRate + '%'}</b><span>avg. submission rate</span></div></div>
        <div class="cc-row"><label class="cc-check"><input type="checkbox" data-ended ${showEnded ? 'checked' : ''}> Show ended courses</label><button class="wbtn" data-refresh>Refresh</button></div>
        ${shown.length ? terms.map((term) => `<p class="cc-term">${h(term)}</p><table class="cc-tbl"><thead><tr><th>Course</th><th>Instructor</th><th>Students</th><th>Assignments</th><th>Submitted</th></tr></thead><tbody>
          ${shown.filter((c) => (c.term || 'No term') === term).map((c) => `<tr class="${c.archived ? 'cc-ended' : ''}"><td><b>${h(c.title)}</b>${c.section ? `<br><span class="cc-lo">${h(c.section)}</span>` : ''}${c.archived ? ' <span class="cc-tag">ended</span>' : ''}</td><td>${h(c.instructor)}</td><td>${c.students}</td><td>${c.assignments}</td>
            <td>${c.submissionRate === null || c.submissionRate === undefined ? '<span class="cc-lo">—</span>' : `<span class="cc-bar"><i style="width:${Math.max(0, Math.min(100, c.submissionRate))}%"></i></span> ${c.submissionRate}%`}</td></tr>`).join('')}</tbody></table>`).join('')
          : '<p class="cc-lo">No courses yet. Lecturers create them in LectureDeck → Course builder.</p>'}
        <p class="cc-lo">Counts only, no student names. "Submitted" is submissions received out of students × assignments.</p></div>`;
      body.querySelector('[data-ended]').onchange = (e) => { showEnded = e.target.checked; draw(); };
      body.querySelector('[data-refresh]').onclick = () => draw();
    }
    draw();
    return () => { gone = true; };
  }

  window.UNI_WIDGETS = [
    { id: 'campuscourses', title: '🏛️ Courses', icon: 'school', w: 720, h: 560, render: renderCourses },
  ];
})();

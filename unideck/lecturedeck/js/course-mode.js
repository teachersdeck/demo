'use strict';
/* LectureDeck — Course mode: Course builder, Course assignments, Grader and Gradebook (phase 1, UniDeck v0.3.0), Modules and Announcements (phase 2, v0.4.0), Discussions, Course calendar and Office hours (phase 2, v0.5.0), Groups and Course stats (phase 3).
   UniDeck's own file, not shared with TeachersDeck. The same file runs in two apps (tools/sync_shared.py keeps
   unistudentdeck/js/course-mode.js identical to lecturedeck/js/course-mode.js):
   - LectureDeck: it lists the widgets in window.UNI_WIDGETS; the shared js/app.js adds them to a "Courses" category.
   - UniStudentDeck (v0.5.0, phase 3): a student the instructor made a TA uses the staff screens from TAdeck.
     Here it lists nothing; it exposes window.CourseMode, and UniStudentDeck's js/uni-courses-ui.js signs the student in. Data: js/unicourses.js (shared
   with UniStudentDeck); maths: js/coursemath.js (the same file the backend runs). Loaded before js/app.js. */
(function () {
  const C = window.UniCourses, M = window.CourseMath;
  if (!C || !M) return;
  const TA_HOST = !!window.SD_EDITION;   // UniStudentDeck (StudentDeck's code) rather than LectureDeck (TeachersDeck's)
  // The course these screens show. In TAdeck it is kept apart from the student's own current course, so grading
  // one course doesn't switch the student's Assignments or Modules to it.
  const EVT = TA_HOST ? 'ud-ta-course' : 'ud-course';
  const sel = TA_HOST
    ? { get() { try { return localStorage.getItem('ud_ta_course') || ''; } catch (e) { return ''; } },
        set(id) { try { localStorage.setItem('ud_ta_course', id || ''); } catch (e) {} window.dispatchEvent(new CustomEvent(EVT, { detail: id })); } }
    : { get: () => C.currentCourse(), set: (id) => C.setCurrentCourse(id) };
  const h = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (m) => (typeof toast === 'function' ? toast(m, 3600) : alert(m));
  const when = (ms) => (ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No due date');
  const localInput = (ms) => { if (!ms) return ''; const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const CAT_NAMES = { assignments: 'Assignments', quizzes: 'Quizzes', exams: 'Exams', participation: 'Participation' };
  /* Phase 4: published quizzes count like assignments in the Gradebook, totals and Course stats (grades/{quizId}_{uid}). */
  const quizItems = (qs) => (qs || []).filter((q) => q.published).map((q) => ({ id: q.id, title: `📝 ${q.title}`, points: q.points, category: q.category, dueAtMs: q.dueAtMs || null, kind: 'quiz' }));

  function gate(body, redraw) {
    const s = C.state();
    if (TA_HOST) {   // UniStudentDeck's TAdeck has already signed the student in; staffCourses() keeps only TA courses
      if (s.user && s.role === 'unistudent') return true;
      body.innerHTML = '<div class="cm-empty"><p>Sign in from 🏛️ Courses first.</p></div>';
      return false;
    }
    if (!C.available()) {
      body.innerHTML = `<div class="cm-empty"><p>Course mode needs the UniDeck backend, which isn’t set up in this build.</p><div class="btn-row"><button class="wbtn primary" data-demo>Try the demo</button></div></div>`;
      body.querySelector('[data-demo]').onclick = () => (typeof TD_DEMO !== 'undefined' ? TD_DEMO.enter() : (location.search = '?demo=1'));
      return false;
    }
    if (s.user && s.role && s.role !== 'teacher') {
      body.innerHTML = `<div class="cm-empty"><p>${h(s.user.email)} is a ${h(s.role)} account. Sign in with your lecturer account.</p><div class="btn-row"><button class="wbtn" data-out>Sign out</button></div></div>`;
      body.querySelector('[data-out]').onclick = () => C.signOut();
      return false;
    }
    if (!s.user || s.role !== 'teacher') {
      body.innerHTML = `<div class="cm-empty"><p><b>Sign in to run your courses</b></p><p class="cm-lo">The same Google account you use for TeachersDeck works here.${C.demo ? ' (Demo: no real account is used.)' : ''}</p>
        <div class="btn-row"><button class="wbtn primary" data-in ${s.busy ? 'disabled' : ''}>Sign in with Google</button></div></div>`;
      body.querySelector('[data-in]').onclick = async () => { try { await C.signIn('teacher'); redraw(); } catch (e) { say(C.errText(e)); } };
      return false;
    }
    return true;
  }
  async function pick(list) {
    let cur = sel.get();
    if (!list.some((c) => c.courseId === cur)) { cur = list[0] ? list[0].courseId : ''; if (cur) sel.set(cur); }
    return cur;
  }
  const picker = (list, cur) => (list.length ? `<label class="cm-pick">Course <select data-course>${list.map((c) => `<option value="${h(c.courseId)}" ${c.courseId === cur ? 'selected' : ''}>${h(c.title)}${c.section ? ' · ' + h(c.section) : ''}</option>`).join('')}</select></label>` : '');
  function wirePicker(body, extra) { const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { if (extra) extra(); sel.set(s.value); }; }
  function live(draw) {
    const off = C.onChange(() => draw());
    const on = () => draw();
    window.addEventListener(EVT, on);
    return () => { off(); window.removeEventListener(EVT, on); };
  }
  function staffCourses(list) { return list.filter((c) => c.role === 'instructor' || c.role === 'ta'); }

  /* ---------------- Course builder ---------------- */
  function renderBuilder(body) {
    let seq = 0, mode = 'view';
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (mode === 'new' || !list.length) return courseForm(null, list);
      const cid = await pick(list);
      let course, roster;
      try { [course, roster] = await Promise.all([C.course(cid), C.roster(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (mode === 'edit') return courseForm(course, list);
      const mine = list.find((c) => c.courseId === cid);
      const pol = M.cleanLatePolicy(course.latePolicy);
      const students = roster.filter((r) => r.role === 'student'), tas = roster.filter((r) => r.role === 'ta');
      body.innerHTML = `<div class="cm-pad">
        <div class="cm-row">${picker(list, cid)}<button class="wbtn" data-new>＋ New course</button></div>
        <div class="cm-card"><div class="cm-split"><div><p class="cm-k">${h(course.title)}</p><p class="cm-lo">${h([course.term, course.section].filter(Boolean).join(' · '))}${course.archived ? ' · ended' : ''}</p></div>
          ${mine.role === 'instructor' ? '<button class="wbtn" data-edit>Edit</button>' : ''}</div>
          <div class="cm-code"><span class="cm-lo">Course code</span><b data-code>${h(course.code || '—')}</b>
            <button class="wbtn" data-copy>Copy</button>${mine.role === 'instructor' ? '<button class="wbtn" data-regen title="The old code stops working">New code</button>' : ''}</div>
          <p class="cm-lo">Students join in UniStudentDeck → Courses with this code.</p>
          <p><span class="cm-lo">Grading:</span> ${Object.entries(course.weights || { assignments: 100 }).map(([k, w]) => `${CAT_NAMES[k] || h(k)} ${w}%`).join(' · ')}</p>
          <p><span class="cm-lo">Late work:</span> ${pol.mode === 'closed' ? 'not accepted' : pol.mode === 'penalty' ? `−${pol.perDayPct}% a day${pol.maxDays ? `, nothing after ${pol.maxDays} days` : ''}` : 'accepted, no penalty'}</p></div>
        <div class="cm-card"><p class="cm-k">People <span class="cm-lo">${students.length} student${students.length === 1 ? '' : 's'}${tas.length ? ` · ${tas.length} TA` : ''}</span></p>
          ${roster.length ? `<table class="cm-tbl"><tbody>${roster.map((r) => `<tr><td>${h(r.name)}<br><span class="cm-lo">${h(r.email || '')}</span></td><td>${r.under18 ? '<span class="cm-tag">under 18</span>' : ''}</td><td>${mine.role === 'instructor' && !(r.under18 && r.role !== 'ta') ? `<button class="wbtn" data-role="${h(r.uid)}" data-to="${r.role === 'ta' ? 'student' : 'ta'}">${r.role === 'ta' ? 'TA ✓' : 'Make TA'}</button>` : h(r.role)}</td></tr>`).join('')}</tbody></table>` : '<p class="cm-lo">Nobody has joined yet. Share the course code.</p>'}</div></div>`;
      wirePicker(body);
      body.querySelector('[data-new]').onclick = () => { mode = 'new'; draw(); };
      const ed = body.querySelector('[data-edit]'); if (ed) ed.onclick = () => { mode = 'edit'; draw(); };
      body.querySelector('[data-copy]').onclick = () => { try { navigator.clipboard.writeText(course.code); say('Course code copied.'); } catch (e) { say(course.code); } };
      const rg = body.querySelector('[data-regen]'); if (rg) rg.onclick = async () => { if (!confirm('Make a new course code? The old one stops working.')) return; try { const r = await C.regenerateCode(cid); say(`New code: ${r.code}`); draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelectorAll('[data-role]').forEach((b) => { b.onclick = async () => { try { await C.setMemberRole(cid, b.dataset.role, b.dataset.to); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    function courseForm(course, list) {
      const w = (course && course.weights) || { assignments: 100 };
      const pol = M.cleanLatePolicy(course && course.latePolicy);
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${course ? 'Edit course' : 'New course'}</p>
        <label class="cm-lbl">Title<input name="title" required maxlength="120" value="${h(course ? course.title : '')}" placeholder="e.g. Academic Writing"></label>
        <div class="cm-two"><label class="cm-lbl">Term<input name="term" maxlength="40" value="${h(course ? course.term : '')}" placeholder="Fall 2026"></label>
        <label class="cm-lbl">Section<input name="section" maxlength="40" value="${h(course ? course.section : '')}" placeholder="ENG 201-02"></label></div>
        <p class="cm-lo">Grading weights (must add up to 100)</p>
        <div class="cm-four">${M.CATEGORIES.map((k) => `<label class="cm-lbl">${CAT_NAMES[k]}<input type="number" min="0" max="100" step="1" name="w_${k}" value="${w[k] || 0}"></label>`).join('')}</div>
        <p class="cm-lo" data-sum></p>
        <div class="cm-two"><label class="cm-lbl">Late work<select name="mode"><option value="accept" ${pol.mode === 'accept' ? 'selected' : ''}>Accept, no penalty</option><option value="penalty" ${pol.mode === 'penalty' ? 'selected' : ''}>Accept with a penalty</option><option value="closed" ${pol.mode === 'closed' ? 'selected' : ''}>Don’t accept</option></select></label>
        <label class="cm-lbl" data-pen>Penalty per day (%)<input type="number" min="0" max="100" name="perDayPct" value="${pol.perDayPct || 10}"></label></div>
        <label class="cm-lbl" data-pen>No credit after this many days late (0 = no limit)<input type="number" min="0" max="60" name="maxDays" value="${pol.maxDays || 0}"></label>
        ${course ? `<label class="cm-check"><input type="checkbox" name="archived" ${course.archived ? 'checked' : ''}> Course has ended (no new students or submissions)</label>` : ''}
        <div class="btn-row cm-left"><button class="wbtn primary">${course ? 'Save' : 'Create course'}</button>${list.length ? '<button type="button" class="wbtn" data-cancel>Cancel</button>' : ''}</div></form>`;
      const f = body.querySelector('[data-f]');
      const sync = () => { const sum = M.CATEGORIES.reduce((a, k) => a + (Number(f['w_' + k].value) || 0), 0); f.querySelector('[data-sum]').textContent = `Total: ${sum}%${sum === 100 ? '' : ' — needs to be 100'}`;
        f.querySelectorAll('[data-pen]').forEach((el) => { el.style.display = f.mode.value === 'penalty' ? '' : 'none'; }); };
      f.oninput = sync; sync();
      const cancel = f.querySelector('[data-cancel]'); if (cancel) cancel.onclick = () => { mode = 'view'; draw(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const weights = {}; M.CATEGORIES.forEach((k) => { const v = Number(f['w_' + k].value) || 0; if (v) weights[k] = v; });
        const data = { title: f.title.value, term: f.term.value, section: f.section.value, weights, latePolicy: { mode: f.mode.value, perDayPct: Number(f.perDayPct.value), maxDays: Number(f.maxDays.value) } };
        try {
          if (course) { if (f.archived) data.archived = f.archived.checked; await C.updateCourse(course.courseId, data); say('Course saved.'); }
          else { const r = await C.createCourse(data); sel.set(r.courseId); say(`Course created. Code: ${r.code}`); }
          mode = 'view'; draw();
        } catch (er) { say(C.errText(er)); }
      };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Course assignments ---------------- */
  function renderAssignments(body) {
    let seq = 0, editing = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let course, as;
      try { [course, as] = await Promise.all([C.course(cid), C.assignments(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (editing) return form(course, editing === 'new' ? null : as.find((a) => a.id === editing), cid);
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-add>＋ New</button></div>
        <ul class="cm-list">${as.map((a) => `<li><button class="cm-linkbtn" data-ed="${h(a.id)}"><b>${h(a.title)}</b><span class="cm-lo">Due ${h(when(a.dueAtMs))} · ${a.points} pts · ${h(CAT_NAMES[a.category] || a.category)}${a.rubric && a.rubric.length ? ` · rubric (${a.rubric.length})` : ''} · ${h(a.submitType)}${a.group ? ' · 👥 group' : ''}</span></button>
          <button class="cm-x" data-del="${h(a.id)}" aria-label="Delete ${h(a.title)}" title="Delete">×</button></li>`).join('') || '<li class="cm-lo">No assignments yet.</li>'}</ul></div>`;
      wirePicker(body);
      body.querySelector('[data-add]').onclick = () => { editing = 'new'; draw(); };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Delete this assignment?')) return; try { await C.deleteAssignment(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    function form(course, a, cid) {
      const rubric = a && a.rubric ? a.rubric.map((r) => ({ ...r })) : [];
      const cats = Object.keys(course.weights || { assignments: 100 });
      const pol = a && a.latePolicy ? M.cleanLatePolicy(a.latePolicy) : null;
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${a ? 'Edit assignment' : 'New assignment'}</p>
        <label class="cm-lbl">Title<input name="title" required maxlength="120" value="${h(a ? a.title : '')}"></label>
        <label class="cm-lbl">Instructions<textarea name="instructions" rows="4" maxlength="8000">${h(a ? a.instructions : '')}</textarea></label>
        <div class="cm-two"><label class="cm-lbl">Due<input type="datetime-local" name="due" value="${localInput(a && a.dueAtMs)}"></label>
        <label class="cm-lbl">Category<select name="category">${cats.map((k) => `<option value="${k}" ${a && a.category === k ? 'selected' : ''}>${CAT_NAMES[k] || k}</option>`).join('')}</select></label></div>
        <div class="cm-two"><label class="cm-lbl">Students submit<select name="submitType">${[['any', 'Text, a link or files'], ['text', 'Text only'], ['file', 'A file'], ['link', 'A link']].map(([v, l]) => `<option value="${v}" ${(a ? a.submitType : 'any') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="cm-lbl">Submissions allowed (0 = unlimited)<input type="number" min="0" max="20" name="attempts" value="${a ? a.attempts : 1}"></label></div>
        <label class="cm-check"><input type="checkbox" name="group" ${a && a.group ? 'checked' : ''}> 👥 Group assignment: one submission per group, shared by its members (set groups in 👥 Groups)</label>
        <label class="cm-lbl">Late work<select name="late"><option value="">Course policy</option>${[['accept', 'Accept, no penalty'], ['penalty', 'Penalty: same rate as the course'], ['closed', 'Don’t accept']].map(([v, l]) => `<option value="${v}" ${pol && pol.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <p class="cm-lo">Rubric (optional — its rows add up to the points)</p><div data-rub></div>
        <div class="btn-row cm-left"><button type="button" class="wbtn" data-addrow>＋ Rubric row</button></div>
        <label class="cm-lbl" data-pts>Points<input type="number" min="0.5" step="0.5" name="points" value="${a ? a.points : 10}"></label>
        <div class="btn-row cm-left"><button class="wbtn primary">Save</button><button type="button" class="wbtn" data-cancel>Cancel</button></div></form>`;
      const f = body.querySelector('[data-f]'), box = body.querySelector('[data-rub]');
      const paint = () => {
        box.innerHTML = rubric.map((r, i) => `<div class="cm-rrow"><input aria-label="Criterion" placeholder="Criterion" maxlength="200" data-i="${i}" data-k="criterion" value="${h(r.criterion)}"><input type="number" aria-label="Points" min="0.5" step="0.5" data-i="${i}" data-k="points" value="${r.points}"><button type="button" class="cm-x" data-rm="${i}" aria-label="Remove row">×</button></div>`).join('');
        box.querySelectorAll('input').forEach((el) => { el.oninput = () => { rubric[el.dataset.i][el.dataset.k] = el.dataset.k === 'points' ? Number(el.value) : el.value; total(); }; });
        box.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { rubric.splice(Number(b.dataset.rm), 1); paint(); }; });
        total();
      };
      const total = () => { const pts = f.querySelector('[data-pts]'); pts.style.display = rubric.length ? 'none' : ''; };
      f.querySelector('[data-addrow]').onclick = () => { rubric.push({ id: 'r' + Math.random().toString(36).slice(2, 7), criterion: '', points: 5 }); paint(); };
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      paint();
      f.onsubmit = async (e) => {
        e.preventDefault();
        const late = f.late.value;
        const data = { id: a ? a.id : undefined, title: f.title.value, instructions: f.instructions.value, dueAtMs: f.due.value ? new Date(f.due.value).getTime() : null,
          category: f.category.value, submitType: f.submitType.value, attempts: Number(f.attempts.value) || 0, rubric, points: Number(f.points.value), group: f.group.checked,
          latePolicy: late ? { ...M.cleanLatePolicy(course.latePolicy), mode: late } : null };
        try { await C.saveAssignment(cid, data); say('Assignment saved.'); editing = null; draw(); } catch (er) { say(C.errText(er)); }
      };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Grader ---------------- */
  function renderGrader(body) {
    let seq = 0, aid = null, uid = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let course, as, roster, grades;
      try { [course, as, roster, grades] = await Promise.all([C.course(cid), C.assignments(cid), C.roster(cid), C.grades(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (!as.some((a) => a.id === aid)) aid = (as.filter((a) => a.dueAtMs && a.dueAtMs < Date.now()).pop() || as[0] || {}).id || null;   // the most recent one past its due date
      const subs = aid ? await C.submissions(cid, aid) : [];
      if (my !== seq) return;
      const a = as.find((x) => x.id === aid);
      const students = roster.filter((r) => r.role === 'student');
      const gOf = (u) => grades.find((g) => g.assignmentId === aid && g.uid === u), sOf = (u) => subs.find((s) => s.uid === u);
      const unreleased = students.filter((s) => { const g = gOf(s.uid); return g && !g.released; }).length;
      const stat = (u) => { const g = gOf(u), s = sOf(u); if (g && g.needsRegrade) return ['r', 'Resubmitted']; if (g) return [g.released ? 'g' : 'd', `${g.finalScore}/${a.points}${g.released ? '' : ' · draft'}`]; if (s) return [s.late ? 'l' : 's', s.late ? `Late ${s.lateDays}d` : 'Submitted']; return ['', a && a.dueAtMs && a.dueAtMs < Date.now() ? 'Missing' : '—']; };
      body.innerHTML = `<div class="cm-pad cm-grader"><div class="cm-row">${picker(list, cid)}
        ${as.length ? `<label class="cm-pick">Assignment <select data-asg>${as.map((x) => `<option value="${h(x.id)}" ${x.id === aid ? 'selected' : ''}>${h(x.title)}</option>`).join('')}</select></label>` : ''}
        ${a ? `<button class="wbtn primary" data-rel ${unreleased ? '' : 'disabled'}>Release ${unreleased || ''} grade${unreleased === 1 ? '' : 's'}</button>` : ''}</div>
        ${!a ? '<p class="cm-lo">No assignments yet.</p>' : `<div class="cm-cols"><ul class="cm-list cm-people">${students.map((s) => { const [cls, t] = stat(s.uid); return `<li class="${s.uid === uid ? 'on' : ''}"><button class="cm-linkbtn" data-u="${h(s.uid)}"><b>${h(s.name)}</b></button><span class="cm-tag ${cls}">${h(t)}</span></li>`; }).join('') || '<li class="cm-lo">No students yet.</li>'}</ul>
          <div class="cm-sub" data-sub>${uid ? '' : `<p class="cm-lo">${subs.length} of ${students.length} submitted. Pick a student.</p>`}</div></div>`}</div>`;
      wirePicker(body, () => { aid = null; uid = null; });
      const sa = body.querySelector('[data-asg]'); if (sa) sa.onchange = () => { aid = sa.value; uid = null; draw(); };
      const rel = body.querySelector('[data-rel]'); if (rel) rel.onclick = async () => { if (!confirm(`Release ${unreleased} grade${unreleased === 1 ? '' : 's'} to students?`)) return; try { const r = await C.release(cid, aid); say(`${r.released} grade${r.released === 1 ? '' : 's'} released.`); draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => { uid = b.dataset.u; draw(); }; });
      if (a && uid) paper(body.querySelector('[data-sub]'), cid, course, a, students.find((s) => s.uid === uid), sOf(uid), gOf(uid));
    }
    async function paper(el, cid, course, a, st, s, g) {
      if (!st) return;
      const pen = s ? M.latePenaltyPct(a.latePolicy || course.latePolicy, s.lateDays) : 0;
      const files = await Promise.all(((s && s.files) || []).map(async (f) => ({ ...f, url: await C.fileUrl(f.path).catch(() => null) })));
      const grp = a.group && s && s.groupId ? s : null;
      el.innerHTML = `<p class="cm-k">${h(st.name)}${grp ? ` <span class="cm-tag">👥 ${h(grp.groupName || 'group')}</span>` : ''}</p>
        ${grp ? `<p class="cm-lo">Group submission by ${h(grp.submittedByName || '')} for ${(grp.groupUids || []).length} students.</p>` : a.group ? '<p class="cm-lo">Group assignment: no submission from this student’s group yet.</p>' : ''}
        ${s ? `<p class="cm-lo">Submitted ${h(when(s.submittedAtMs))}${s.attempt > 1 ? ` · attempt ${s.attempt}` : ''}${s.late ? ` · <b class="cm-late">${s.lateDays} day${s.lateDays === 1 ? '' : 's'} late (−${pen}%)</b>` : ' · on time'}</p>
          ${s.text ? `<div class="cm-text">${h(s.text).replace(/\n/g, '<br>')}</div>` : ''}${s.link ? `<p><a href="${h(s.link)}" target="_blank" rel="noopener">${h(s.link)}</a></p>` : ''}
          ${files.map((f) => `<p>📎 ${f.url ? `<a href="${h(f.url)}" target="_blank" rel="noopener">${h(f.name)}</a>` : h(f.name)}</p>`).join('')}` : '<p class="cm-lo">No submission. You can still enter a grade.</p>'}
        <form data-g class="cm-card">${a.rubric && a.rubric.length ? `<table class="cm-tbl"><tbody>${a.rubric.map((r) => `<tr><td>${h(r.criterion)}</td><td><input type="number" min="0" max="${r.points}" step="0.5" name="r_${h(r.id)}" value="${g && g.rubricScores[r.id] !== undefined ? g.rubricScores[r.id] : ''}" aria-label="${h(r.criterion)}"> / ${r.points}</td></tr>`).join('')}</tbody></table>`
          : `<label class="cm-lbl">Score (out of ${a.points})<input type="number" min="0" max="${a.points}" step="0.5" name="score" value="${g ? g.score : ''}" required></label>`}
          <p class="cm-lo" data-calc></p>
          <label class="cm-lbl">Feedback<textarea name="feedback" rows="4" maxlength="5000">${h(g ? g.feedback : '')}</textarea></label>
          ${grp && (grp.groupUids || []).length > 1 ? `<label class="cm-check"><input type="checkbox" name="whole" checked> Give this grade to the whole group (${grp.groupUids.length} students)</label>` : ''}
          <div class="btn-row cm-left"><button class="wbtn primary">Save grade</button>${g ? `<span class="cm-lo">${g.released ? 'Released to the student' : 'Draft: not released yet'}</span>` : ''}</div></form>`;
      const f = el.querySelector('[data-g]');
      const calc = () => {
        const raw = a.rubric && a.rubric.length ? M.rubricScore(a.rubric, Object.fromEntries(a.rubric.map((r) => [r.id, Number(f['r_' + r.id].value)]))).score : Number(f.score.value) || 0;
        f.querySelector('[data-calc]').textContent = `Score ${raw} / ${a.points}${pen ? ` → ${M.finalScore(raw, pen)} after the late penalty` : ''}`;
      };
      f.oninput = calc; calc();
      f.onsubmit = async (e) => {
        e.preventDefault();
        const data = { feedback: f.feedback.value, wholeGroup: !!(f.whole && f.whole.checked) };
        if (a.rubric && a.rubric.length) data.rubricScores = Object.fromEntries(a.rubric.map((r) => [r.id, Number(f['r_' + r.id].value) || 0])); else data.score = Number(f.score.value);
        try { const r = await C.grade(cid, a.id, st.uid, data); say(`Saved: ${r.finalScore}/${a.points}${r.graded > 1 ? ` for ${r.graded} students` : ''}.`); draw(); } catch (er) { say(C.errText(er)); }
      };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Gradebook ---------------- */
  function renderGradebook(body) {
    let seq = 0;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let course, as, roster, grades, qz;
      try { [course, as, roster, grades, qz] = await Promise.all([C.course(cid), C.assignments(cid), C.roster(cid), C.grades(cid), C.quizzes(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      as = [...as, ...quizItems(qz)].sort((a, b) => (a.dueAtMs || 9e15) - (b.dueAtMs || 9e15));
      const students = roster.filter((r) => r.role === 'student');
      const cell = (a, u) => grades.find((g) => g.assignmentId === a.id && g.uid === u);
      const avg = (a) => { const gs = grades.filter((g) => g.assignmentId === a.id); return gs.length ? M.round2(gs.reduce((s, g) => s + g.finalScore, 0) / gs.length) : null; };
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-csv>Export CSV</button></div>
        <div class="cm-scroll"><table class="cm-tbl cm-book"><thead><tr><th>Student</th>${as.map((a) => `<th title="${h(a.title)}">${h(a.title.length > 18 ? a.title.slice(0, 17) + '…' : a.title)}<br><span class="cm-lo">/${a.points}</span></th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${students.map((s) => { const mine = grades.filter((g) => g.uid === s.uid); const tot = M.courseTotal(course.weights, as, mine.map((g) => ({ ...g, released: true })));
          return `<tr><td>${h(s.name)}</td>${as.map((a) => { const g = cell(a, s.uid); return `<td class="${g && !g.released ? 'cm-draft' : ''}">${g ? g.finalScore : ''}</td>`; }).join('')}<td><b>${tot.percent === null ? '' : tot.percent + '%'}</b></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td class="cm-lo">Average</td>${as.map((a) => `<td class="cm-lo">${avg(a) ?? ''}</td>`).join('')}<td></td></tr></tfoot></table></div>
        <p class="cm-lo">Shaded = graded but not released. Totals use the course weights over the categories graded so far, counting drafts. Students see only released grades.</p></div>`;
      wirePicker(body);
      body.querySelector('[data-csv]').onclick = async () => {
        try { const r = await C.exportGradebook(cid); const url = URL.createObjectURL(new Blob(['﻿' + r.csv], { type: 'text/csv;charset=utf-8' }));
          const link = document.createElement('a'); link.href = url; link.download = r.filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
        catch (e) { say(C.errText(e)); }
      };
    }
    draw();
    return live(draw);
  }

  const rich = (s) => h(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  const KIND = { page: ['📄', 'Page'], link: ['🔗', 'Link'], reading: ['📚', 'Reading'], assignment: ['🗂️', 'Assignment'] };

  /* ---------------- Modules (UniDeck phase 2) ---------------- */
  function renderModules(body) {
    let seq = 0, editing = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let mods, as, roster, prog;
      try { [mods, as, roster, prog] = await Promise.all([C.modules(cid), C.assignments(cid), C.roster(cid), C.progressAll(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (editing) return form(cid, editing === 'new' ? null : mods.find((m) => m.id === editing), as);
      const students = roster.filter((r) => r.role === 'student').length;
      const doneBy = (m) => { if (!students || !m.items.length) return null; const all = prog.filter((p) => m.items.every((i) => p.done[i.id])).length; return Math.round((all / students) * 100); };
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-add>＋ New module</button></div>
        <ul class="cm-list">${mods.map((m, k) => { const open = !m.releaseAtMs || m.releaseAtMs <= Date.now(), pct = doneBy(m);
          return `<li><div class="cm-ord"><button class="cm-x" data-up="${k}" ${k ? '' : 'disabled'} aria-label="Move up" title="Move up">↑</button><button class="cm-x" data-down="${k}" ${k < mods.length - 1 ? '' : 'disabled'} aria-label="Move down" title="Move down">↓</button></div>
            <button class="cm-linkbtn" data-ed="${h(m.id)}"><b>${h(m.title)}</b><span class="cm-lo">${m.items.length} item${m.items.length === 1 ? '' : 's'} · ${open ? 'open' : '🔒 opens ' + h(when(m.releaseAtMs))}${pct === null ? '' : ` · ${pct}% of students finished it`}</span></button>
            <button class="cm-x" data-del="${h(m.id)}" aria-label="Delete ${h(m.title)}" title="Delete">×</button></li>`; }).join('') || '<li class="cm-lo">No modules yet. A module is usually one week: a page, the readings, links and that week’s assignment.</li>'}</ul></div>`;
      wirePicker(body, () => { editing = null; });
      body.querySelector('[data-add]').onclick = () => { editing = 'new'; draw(); };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      const move = async (k, d) => { const ids = mods.map((m) => m.id); const [x] = ids.splice(k, 1); ids.splice(k + d, 0, x); try { await C.reorderModules(cid, ids); draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => move(Number(b.dataset.up), -1); });
      body.querySelectorAll('[data-down]').forEach((b) => { b.onclick = () => move(Number(b.dataset.down), 1); });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Delete this module? Its assignments, submissions and grades stay.')) return; try { await C.deleteModule(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    async function form(cid, m, as) {
      const content = m ? ((await C.moduleContent(cid, m.id)) || { items: {} }).items : {};
      const items = m ? m.items.map((i) => ({ ...i, url: (content[i.id] || {}).url || '', body: (content[i.id] || {}).body || '' })) : [];
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${m ? 'Edit module' : 'New module'}</p>
        <label class="cm-lbl">Title<input name="title" required maxlength="120" value="${h(m ? m.title : '')}" placeholder="e.g. Week 3: Sources and evidence"></label>
        <label class="cm-lbl">Opens for students (empty = straight away)<input type="datetime-local" name="release" value="${localInput(m && m.releaseAtMs)}"></label>
        <p class="cm-lo">Items, in the order students see them</p><div data-items></div>
        <div class="btn-row cm-left">${Object.entries(KIND).map(([k, [ic, l]]) => `<button type="button" class="wbtn" data-addk="${k}">${ic} ${l}</button>`).join('')}</div>
        <div class="btn-row cm-left"><button class="wbtn primary">Save module</button><button type="button" class="wbtn" data-cancel>Cancel</button></div></form>`;
      const f = body.querySelector('[data-f]'), box = f.querySelector('[data-items]');
      const paint = () => {
        box.innerHTML = items.map((i, k) => `<div class="cm-card cm-item"><div class="cm-split"><span class="cm-lo">${KIND[i.kind][0]} ${KIND[i.kind][1]}</span><span><button type="button" class="cm-x" data-iu="${k}" ${k ? '' : 'disabled'} aria-label="Move up">↑</button><button type="button" class="cm-x" data-id="${k}" ${k < items.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button type="button" class="cm-x" data-irm="${k}" aria-label="Remove item">×</button></span></div>
          ${i.kind === 'assignment' ? `<select data-k="refId" data-i="${k}" aria-label="Assignment">${as.length ? as.map((a) => `<option value="${h(a.id)}" ${a.id === i.refId ? 'selected' : ''}>${h(a.title)}</option>`).join('') : '<option value="">No assignments yet: make one in Course assignments</option>'}</select>`
            : `<input data-k="title" data-i="${k}" maxlength="120" placeholder="Title" value="${h(i.title)}" aria-label="Title">
               ${i.kind !== 'page' ? `<input data-k="url" data-i="${k}" type="url" placeholder="${i.kind === 'link' ? 'https://… (slides, video, a PDF on Drive)' : 'Link (optional)'}" value="${h(i.url)}" aria-label="Link">` : ''}
               ${i.kind === 'page' ? `<textarea data-k="body" data-i="${k}" rows="4" maxlength="20000" placeholder="The page: plain text, links are made clickable" aria-label="Page text">${h(i.body)}</textarea>` : ''}`}</div>`).join('') || '<p class="cm-lo">No items yet: add a page, link, reading or assignment below.</p>';
        box.querySelectorAll('[data-k]').forEach((el) => { el.oninput = el.onchange = () => { items[el.dataset.i][el.dataset.k] = el.value; }; });
        const mv = (k, d) => { const [x] = items.splice(k, 1); items.splice(k + d, 0, x); paint(); };
        box.querySelectorAll('[data-iu]').forEach((b) => { b.onclick = () => mv(Number(b.dataset.iu), -1); });
        box.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => mv(Number(b.dataset.id), 1); });
        box.querySelectorAll('[data-irm]').forEach((b) => { b.onclick = () => { items.splice(Number(b.dataset.irm), 1); paint(); }; });
      };
      paint();
      f.querySelectorAll('[data-addk]').forEach((b) => { b.onclick = () => { const k = b.dataset.addk; items.push({ kind: k, title: '', url: '', body: '', refId: k === 'assignment' && as[0] ? as[0].id : '' }); paint(); }; });
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const data = { id: m ? m.id : undefined, title: f.title.value, releaseAtMs: f.release.value ? new Date(f.release.value).getTime() : null,
          items: items.map((i) => (i.kind === 'assignment' ? { id: i.id, kind: i.kind, refId: i.refId } : { id: i.id, kind: i.kind, title: i.title, url: i.url, body: i.body })) };
        try { await C.saveModule(cid, data); say('Module saved.'); editing = null; draw(); } catch (er) { say(C.errText(er)); }
      };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Announcements (UniDeck phase 2) ---------------- */
  function renderAnnouncements(body) {
    let seq = 0, editing = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let anns, counts, roster;
      try { [anns, counts, roster] = await Promise.all([C.announcements(cid), C.readCounts(cid), C.roster(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const students = roster.filter((r) => r.role === 'student').length;
      const ed = editing && editing !== 'new' ? anns.find((a) => a.id === editing) : null;
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}</div>
        <form class="cm-card" data-f><p class="cm-k">${ed ? 'Edit announcement' : 'New announcement'}</p>
          <label class="cm-lbl">Title<input name="title" required maxlength="140" value="${h(ed ? ed.title : '')}"></label>
          <label class="cm-lbl">Message<textarea name="body" rows="4" maxlength="10000" required>${h(ed ? ed.body : '')}</textarea></label>
          ${ed ? '' : `<p class="cm-lo">Post to</p><div class="cm-checks">${list.map((c) => `<label class="cm-check"><input type="checkbox" name="to" value="${h(c.courseId)}" ${c.courseId === cid ? 'checked' : ''}> ${h(c.title)}${c.section ? ' · ' + h(c.section) : ''}</label>`).join('')}</div>`}
          <label class="cm-check"><input type="checkbox" name="pinned" ${ed && ed.pinned ? 'checked' : ''}> Pin to the top</label>
          <div class="btn-row cm-left"><button class="wbtn primary">${ed ? 'Save' : 'Post'}</button>${ed ? '<button type="button" class="wbtn" data-cancel>Cancel</button>' : ''}</div></form>
        ${anns.map((a) => `<div class="cm-card"><div class="cm-split"><p class="cm-k">${a.pinned ? '📌 ' : ''}${h(a.title)}</p><span><button class="wbtn" data-ed="${h(a.id)}">Edit</button> <button class="cm-x" data-del="${h(a.id)}" aria-label="Delete">×</button></span></div>
          <p class="cm-lo">${h(when(a.createdAtMs))}${a.editedAtMs ? ' · edited' : ''} · read by ${counts[a.id] || 0} of ${students} student${students === 1 ? '' : 's'}</p><div>${rich(a.body)}</div></div>`).join('') || '<p class="cm-lo">No announcements yet.</p>'}</div>`;
      wirePicker(body, () => { editing = null; });
      const f = body.querySelector('[data-f]');
      const cancel = f.querySelector('[data-cancel]'); if (cancel) cancel.onclick = () => { editing = null; draw(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const d = { title: f.title.value.trim(), body: f.body.value.trim(), pinned: f.pinned.checked };
        if (ed) { d.id = ed.id; d.courseId = cid; } else d.courseIds = [...f.querySelectorAll('[name=to]:checked')].map((x) => x.value);
        try { const r = await C.saveAnnouncement(d); say(ed ? 'Announcement saved.' : `Posted to ${r.posted.length} course${r.posted.length === 1 ? '' : 's'}.`); editing = null; draw(); } catch (er) { say(C.errText(er)); }
      };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Delete this announcement?')) return; try { await C.deleteAnnouncement(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    draw();
    return live(draw);
  }

  const hm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

  /* ---------------- Discussions (UniDeck phase 2) ---------------- */
  function renderDiscussions(body) {
    let seq = 0, openT = null, form = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let ths;
      try { ths = await C.threads(cid); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (form) return editor(cid, form === 'new' ? null : ths.find((x) => x.id === form));
      const th = openT && ths.find((x) => x.id === openT);
      if (th) return thread(cid, th, my);
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-new>＋ New discussion</button></div>
        <ul class="cm-list">${ths.map((x) => `<li><button class="cm-linkbtn" data-t="${h(x.id)}"><b>${x.pinned ? '📌 ' : ''}${h(x.title)}</b><span class="cm-lo">${x.postCount || 0} repl${x.postCount === 1 ? 'y' : 'ies'}${x.postFirst ? ' · post first' : ''}${x.locked ? ' · closed' : ''} · last ${h(when(x.lastPostAtMs || x.createdAtMs))}</span></button></li>`).join('') || '<li class="cm-lo">No discussions yet. Start one with a question for the week.</li>'}</ul></div>`;
      wirePicker(body, () => { openT = null; });
      body.querySelector('[data-new]').onclick = () => { form = 'new'; draw(); };
      body.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { openT = b.dataset.t; draw(); }; });
    }
    function editor(cid, th) {
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${th ? 'Edit discussion' : 'New discussion'}</p>
        <label class="cm-lbl">Title<input name="title" required maxlength="140" value="${h(th ? th.title : '')}"></label>
        <label class="cm-lbl">Prompt<textarea name="body" rows="5" maxlength="5000" required>${h(th ? th.body : '')}</textarea></label>
        <label class="cm-check"><input type="checkbox" name="postFirst" ${th && th.postFirst ? 'checked' : ''}> Students post before they see others' replies</label>
        <label class="cm-check"><input type="checkbox" name="pinned" ${th && th.pinned ? 'checked' : ''}> Pin to the top</label>
        ${th ? `<label class="cm-check"><input type="checkbox" name="locked" ${th.locked ? 'checked' : ''}> Closed to new replies</label>` : ''}
        <div class="btn-row cm-left"><button class="wbtn primary">${th ? 'Save' : 'Start discussion'}</button><button type="button" class="wbtn" data-cancel>Cancel</button></div></form>`;
      const f = body.querySelector('[data-f]');
      f.querySelector('[data-cancel]').onclick = () => { form = null; draw(); };
      f.onsubmit = async (e) => { e.preventDefault();
        try { const r = await C.saveThread(cid, { id: th ? th.id : undefined, title: f.title.value.trim(), body: f.body.value.trim(), postFirst: f.postFirst.checked, pinned: f.pinned.checked, locked: f.locked ? f.locked.checked : false }); say('Discussion saved.'); form = null; openT = r.threadId; draw(); } catch (er) { say(C.errText(er)); } };
    }
    async function thread(cid, th, my) {
      let res;
      try { res = await C.posts(cid, th.id); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const students = new Set(res.posts.filter((p) => p.role === 'student').map((p) => p.uid)).size;
      body.innerHTML = `<div class="cm-pad"><div class="cm-row"><button class="cm-linkbtn" data-back style="flex:0">← All discussions</button><span style="flex:1"></span><button class="wbtn" data-edit>Edit</button><button class="wbtn" data-lock>${th.locked ? 'Reopen' : 'Close'}</button><button class="cm-x" data-del aria-label="Delete discussion" title="Delete">×</button></div>
        <p class="cm-k">${th.pinned ? '📌 ' : ''}${h(th.title)}</p><p class="cm-lo">${th.postFirst ? 'Post first · ' : ''}${th.locked ? 'Closed · ' : ''}${students} student${students === 1 ? '' : 's'} replied</p>
        <div class="cm-text">${rich(th.body)}</div>
        ${res.posts.map((p) => `<div class="cm-post ${p.role !== 'student' ? 'staff' : ''}"><p class="cm-lo"><b>${h(p.name)}</b> · ${h(when(p.createdAtMs))}${p.editedAtMs && !p.removed ? ' · edited' : ''}</p>
          ${p.removed ? '<p class="cm-lo"><i>Reply removed.</i></p>' : `<div>${rich(p.body)}</div><div class="btn-row cm-left"><button class="cm-x" data-rm="${h(p.id)}" title="Remove this reply" aria-label="Remove reply">Remove</button></div>`}</div>`).join('') || '<p class="cm-lo">No replies yet.</p>'}
        ${th.locked ? '' : '<form class="cm-card" data-reply><label class="cm-lbl">Reply as course staff<textarea name="body" rows="3" maxlength="5000" required></textarea></label><div class="btn-row cm-left"><button class="wbtn primary">Post reply</button></div></form>'}</div>`;
      body.querySelector('[data-back]').onclick = () => { openT = null; draw(); };
      body.querySelector('[data-edit]').onclick = () => { form = th.id; draw(); };
      body.querySelector('[data-lock]').onclick = async () => { try { await C.saveThread(cid, { ...th, locked: !th.locked }); draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelector('[data-del]').onclick = async () => { if (!confirm('Delete this discussion and every reply in it?')) return; try { await C.deleteThread(cid, th.id); openT = null; draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => { if (!confirm('Remove this reply? The student sees "Reply removed".')) return; try { await C.removePost(cid, th.id, b.dataset.rm); draw(); } catch (e) { say(C.errText(e)); } }; });
      const f = body.querySelector('[data-reply]');
      if (f) f.onsubmit = async (e) => { e.preventDefault(); try { await C.postReply(cid, th.id, f.body.value.trim()); draw(); } catch (er) { say(C.errText(er)); } };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Course calendar: class times, exams, other events (UniDeck phase 2) ---------------- */
  function renderCourseCalendar(body) {
    let seq = 0, editing = null;
    const KINDS = { class: '🏛️ Class', exam: '📝 Exam', other: '📌 Other' };
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let evs;
      try { evs = await C.events(cid); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      evs.sort((a, b) => a.startAtMs - b.startAtMs);
      const ed = editing && editing !== 'new' ? evs.find((x) => x.id === editing) : null;
      const dur = ed ? Math.round((ed.endAtMs - ed.startAtMs) / 6e4) : 90;
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-new>＋ Add</button></div>
        ${editing ? `<form class="cm-card" data-f><p class="cm-k">${ed ? 'Edit event' : 'New event'}</p>
          <div class="cm-two"><label class="cm-lbl">Title<input name="title" required maxlength="120" value="${h(ed ? ed.title : '')}" placeholder="e.g. Lecture"></label>
          <label class="cm-lbl">Kind<select name="kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${(ed ? ed.kind : 'class') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <div class="cm-two"><label class="cm-lbl">Starts<input type="datetime-local" name="start" required value="${localInput(ed && ed.startAtMs)}"></label>
          <label class="cm-lbl">Length (minutes)<input type="number" name="minutes" min="5" max="1440" value="${dur}"></label></div>
          <div class="cm-two"><label class="cm-lbl">Room<input name="location" maxlength="120" value="${h(ed ? ed.location : '')}"></label>
          <label class="cm-lbl">Online link (optional)<input type="url" name="link" maxlength="2000" value="${h(ed ? ed.link : '')}" placeholder="https://"></label></div>
          <label class="cm-lbl">Repeats every week until (empty = once)<input type="date" name="until" value="${ed && ed.weeklyUntilMs ? new Date(ed.weeklyUntilMs - new Date(ed.weeklyUntilMs).getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : ''}"></label>
          <div class="btn-row cm-left"><button class="wbtn primary">Save</button><button type="button" class="wbtn" data-cancel>Cancel</button></div></form>` : ''}
        <ul class="cm-list">${evs.map((e) => `<li><button class="cm-linkbtn" data-ed="${h(e.id)}"><b>${KINDS[e.kind] ? KINDS[e.kind].split(' ')[0] : '📌'} ${h(e.title)}</b>
          <span class="cm-lo">${e.weeklyUntilMs ? `Every ${new Date(e.startAtMs).toLocaleDateString([], { weekday: 'long' })} ${hm(e.startAtMs)}–${hm(e.endAtMs)}, until ${new Date(e.weeklyUntilMs).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : `${h(when(e.startAtMs))}–${hm(e.endAtMs)}`}${e.location ? ' · ' + h(e.location) : ''}${e.link ? ' · online' : ''}</span></button>
          <button class="cm-x" data-del="${h(e.id)}" aria-label="Delete ${h(e.title)}" title="Delete">×</button></li>`).join('') || '<li class="cm-lo">No class times or exams yet. They appear in every student’s Calendar.</li>'}</ul>
        <p class="cm-lo">Students also see assignment due dates and module release dates in their Calendar, and can export it as .ics.</p></div>`;
      wirePicker(body, () => { editing = null; });
      body.querySelector('[data-new]').onclick = () => { editing = 'new'; draw(); };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('Delete this event?')) return; try { await C.deleteEvent(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
      const f = body.querySelector('[data-f]');
      if (f) {
        f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
        f.onsubmit = async (e) => { e.preventDefault();
          const start = new Date(f.start.value).getTime(), until = f.until.value ? new Date(f.until.value + 'T23:59').getTime() : null;
          try { await C.saveEvent(cid, { id: ed ? ed.id : undefined, title: f.title.value.trim(), kind: f.kind.value, startAtMs: start, endAtMs: start + (Number(f.minutes.value) || 60) * 6e4, location: f.location.value.trim(), link: f.link.value.trim(), weeklyUntilMs: until }); say('Saved.'); editing = null; draw(); } catch (er) { say(C.errText(er)); } };
      }
    }
    draw();
    return live(draw);
  }

  /* ---------------- Office hours (UniDeck phase 2) ---------------- */
  function renderOfficeHours(body) {
    let seq = 0, opening = false;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let slots, books;
      try { [slots, books] = await Promise.all([C.slots(cid), C.bookings(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const up = slots.filter((s) => s.endAtMs > Date.now()), days = [...new Set(up.map((s) => dayStart(s.startAtMs)))];
      const bookOf = (id) => books.find((b) => b.slotId === id);
      const taken = up.filter((s) => bookOf(s.id)).length;
      const next = new Date(Date.now() + 864e5); next.setHours(14, 0, 0, 0);
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-open>＋ Open slots</button></div>
        ${opening ? `<form class="cm-card" data-f><p class="cm-k">Open office hours</p>
          <div class="cm-two"><label class="cm-lbl">From<input type="datetime-local" name="start" required value="${localInput(next.getTime())}"></label>
          <label class="cm-lbl">To<input type="datetime-local" name="end" required value="${localInput(next.getTime() + 2 * 36e5)}"></label></div>
          <div class="cm-two"><label class="cm-lbl">Each slot (minutes)<input type="number" name="minutes" min="5" max="120" value="20"></label>
          <label class="cm-lbl">Room<input name="location" maxlength="120" placeholder="e.g. Room B204"></label></div>
          <label class="cm-lbl">Online link (optional)<input type="url" name="link" maxlength="2000" placeholder="https:// (Meet, Zoom, Teams)"></label>
          <div class="btn-row cm-left"><button class="wbtn primary">Open slots</button><button type="button" class="wbtn" data-cancel>Cancel</button></div></form>` : ''}
        <p class="cm-lo">${up.length} upcoming slot${up.length === 1 ? '' : 's'}, ${taken} booked. Students see free and taken slots, never who booked.</p>
        ${days.map((d) => `<p class="cm-k">${h(new Date(d).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }))}</p><table class="cm-tbl"><tbody>${up.filter((s) => dayStart(s.startAtMs) === d).map((s) => { const b = bookOf(s.id);
          return `<tr><td>${hm(s.startAtMs)}–${hm(s.endAtMs)}<br><span class="cm-lo">${h(s.location || '')}${s.link ? ' · online' : ''}</span></td><td>${b ? `<b>${h(b.name)}</b>${b.note ? `<br><span class="cm-lo">${h(b.note)}</span>` : ''}` : '<span class="cm-lo">Free</span>'}</td>
            <td>${b ? `<button class="wbtn" data-cancel-b="${h(s.id)}">Cancel</button>` : ''}<button class="cm-x" data-del="${h(s.id)}" aria-label="Delete slot" title="Delete slot">×</button></td></tr>`; }).join('')}</tbody></table>`).join('') || (opening ? '' : '<p class="cm-lo">No upcoming office hours. Open some: students book them from UniStudentDeck.</p>')}</div>`;
      wirePicker(body, () => { opening = false; });
      body.querySelector('[data-open]').onclick = () => { opening = true; draw(); };
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm(bookOf(b.dataset.del) ? 'Delete this booked slot? The booking is cancelled.' : 'Delete this slot?')) return; try { await C.deleteSlot(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
      body.querySelectorAll('[data-cancel-b]').forEach((b) => { b.onclick = async () => { if (!confirm('Cancel this booking? The slot becomes free again.')) return; try { await C.cancelBooking(cid, b.dataset.cancelB); draw(); } catch (e) { say(C.errText(e)); } }; });
      const f = body.querySelector('[data-f]');
      if (f) {
        f.querySelector('[data-cancel]').onclick = () => { opening = false; draw(); };
        f.onsubmit = async (e) => { e.preventDefault();
          try { const r = await C.openSlots(cid, { startAtMs: new Date(f.start.value).getTime(), endAtMs: new Date(f.end.value).getTime(), minutes: Number(f.minutes.value), location: f.location.value.trim(), link: f.link.value.trim() }); say(`${r.created} slot${r.created === 1 ? '' : 's'} opened.`); opening = false; draw(); } catch (er) { say(C.errText(er)); } };
      }
    }
    draw();
    return live(draw);
  }

  /* ---------------- Groups (phase 3) ----------------
     Course staff set the course's groups (one group per student): by hand, or "make groups of N" at random, then Save.
     Each group's shared task list shows here read-only, with a delete for anything that shouldn't be there. */
  function renderGroups(body) {
    let seq = 0, draft = null, openG = null;
    const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let roster, groups, as;
      try { [roster, groups, as] = await Promise.all([C.roster(cid), C.allGroups(cid), C.assignments(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const students = roster.filter((r) => r.role === 'student');
      const tasks = {};
      await Promise.all(groups.map(async (g) => { tasks[g.id] = await C.tasks(cid, g.id).catch(() => []); }));
      if (my !== seq) return;
      if (draft) return editor(cid, list, students);
      const grouped = new Set(groups.flatMap((g) => g.memberUids));
      const ungrouped = students.filter((s) => !grouped.has(s.uid));
      const gas = as.filter((a) => a.group);
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-edit>${groups.length ? 'Edit groups' : 'Make groups'}</button></div>
        <p class="cm-lo">${groups.length} group${groups.length === 1 ? '' : 's'} · ${students.length - ungrouped.length} of ${students.length} students in a group${gas.length ? ` · group assignments: ${gas.map((a) => h(a.title)).join(', ')}` : ' · no group assignments yet (tick “Group assignment” in Course assignments)'}</p>
        ${ungrouped.length && groups.length ? `<p class="cm-lo">Not in a group: ${ungrouped.map((s) => h(s.name)).join(', ')}</p>` : ''}
        ${groups.map((g) => { const ts = tasks[g.id] || [], dn = ts.filter((t) => t.done).length;
          return `<div class="cm-card"><div class="cm-split"><p class="cm-k">👥 ${h(g.name)}</p><button class="cm-x cm-mini" data-open="${h(g.id)}" title="Show tasks">${openG === g.id ? '▾' : '▸'} ${dn}/${ts.length} tasks</button></div>
            <p>${g.memberUids.map((u) => `<span class="cm-tag">${h(g.memberNames[u] || '')}</span>`).join(' ') || '<span class="cm-lo">Nobody yet</span>'}</p>
            ${openG === g.id ? `<ul class="cm-list">${ts.map((t) => `<li><span style="flex:1">${t.done ? '✅' : '⬜'} ${h(t.title)} <span class="cm-lo">${t.assigneeName ? '· ' + h(t.assigneeName) : ''}${t.dueAtMs ? ' · ' + h(new Date(t.dueAtMs).toLocaleDateString([], { month: 'short', day: 'numeric' })) : ''}</span></span><button class="cm-x" data-deltask="${h(g.id)}|${h(t.id)}" title="Delete task">×</button></li>`).join('') || '<li class="cm-lo">No tasks yet.</li>'}</ul>` : ''}</div>`; }).join('')
          || '<p class="cm-lo">No groups yet. Make groups to give students a shared task list and group assignments.</p>'}</div>`;
      wirePicker(body, () => { draft = null; openG = null; });
      body.querySelector('[data-edit]').onclick = () => { draft = groups.map((g) => ({ id: g.id, name: g.name, memberUids: [...g.memberUids] })); if (!draft.length) draft = [{ name: 'Group 1', memberUids: [] }, { name: 'Group 2', memberUids: [] }]; draw(); };
      body.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { openG = openG === b.dataset.open ? null : b.dataset.open; draw(); }; });
      body.querySelectorAll('[data-deltask]').forEach((b) => { b.onclick = async () => { const [g, t] = b.dataset.deltask.split('|'); if (!confirm('Delete this task from the group’s list?')) return; try { await C.deleteTask(cid, g, t); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    function editor(cid, list, students) {
      const where = (u) => draft.findIndex((g) => g.memberUids.includes(u));
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}</div>
        <div class="cm-card"><p class="cm-k">Make groups at random</p><div class="cm-row"><label class="cm-pick" style="flex:0 1 auto">Students per group <input type="number" min="2" max="20" value="3" data-size style="width:64px"></label><button class="wbtn" data-auto>Shuffle into groups</button></div><p class="cm-lo">Starts new groups (their task lists start empty); you can still move people before saving.</p></div>
        <div class="cm-card"><p class="cm-k">Groups</p>${draft.map((g, i) => `<div class="cm-row"><input class="cm-gname" data-name="${i}" value="${h(g.name)}" maxlength="60" aria-label="Group name"><span class="cm-lo">${g.memberUids.length} student${g.memberUids.length === 1 ? '' : 's'}</span><button class="cm-x" data-rm="${i}" title="Remove group">×</button></div>`).join('')}
          <div class="btn-row cm-left"><button class="wbtn" data-addg>＋ Group</button></div></div>
        <table class="cm-tbl"><thead><tr><th>Student</th><th>Group</th></tr></thead><tbody>${students.map((s) => `<tr><td>${h(s.name)}</td><td><select data-who="${h(s.uid)}"><option value="-1">No group</option>${draft.map((g, i) => `<option value="${i}" ${where(s.uid) === i ? 'selected' : ''}>${h(g.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>
        <div class="btn-row cm-left"><button class="wbtn primary" data-save>Save groups</button><button class="wbtn" data-cancel>Cancel</button></div>
        <p class="cm-lo">Removing a group deletes its task list. Students see only their own group.</p></div>`;
      const names = () => body.querySelectorAll('[data-name]').forEach((x) => { draft[Number(x.dataset.name)].name = x.value; });
      wirePicker(body, () => { draft = null; });
      body.querySelector('[data-auto]').onclick = () => { names(); const n = Math.max(2, Math.min(20, Number(body.querySelector('[data-size]').value) || 3));
        const sh = shuffle(students.map((s) => s.uid)), k = Math.max(1, Math.round(sh.length / n));
        draft = Array.from({ length: k }, (_, i) => ({ name: (draft[i] && draft[i].name) || `Group ${i + 1}`, memberUids: [] }));   // new groups: old task lists go
        sh.forEach((u, i) => draft[i % k].memberUids.push(u)); editor(cid, list, students); };
      body.querySelector('[data-addg]').onclick = () => { names(); draft.push({ name: `Group ${draft.length + 1}`, memberUids: [] }); editor(cid, list, students); };
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { names(); draft.splice(Number(b.dataset.rm), 1); editor(cid, list, students); }; });
      body.querySelectorAll('[data-who]').forEach((sel) => { sel.onchange = () => { names(); const u = sel.dataset.who; draft.forEach((g) => { g.memberUids = g.memberUids.filter((x) => x !== u); }); const i = Number(sel.value); if (i >= 0) draft[i].memberUids.push(u); editor(cid, list, students); }; });
      body.querySelector('[data-cancel]').onclick = () => { draft = null; draw(); };
      body.querySelector('[data-save]').onclick = async () => { names();
        try { const r = await C.saveGroups(cid, draft); say(`Saved ${r.groups.length} group${r.groups.length === 1 ? '' : 's'}${r.ungrouped ? ` · ${r.ungrouped} not in a group` : ''}.`); draft = null; draw(); } catch (e) { say(C.errText(e)); } };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Course stats (UniDeck phase 3) ----------------
     Read-only: the Gradebook's reads plus each assignment's submissions and the module progress. Names stay hidden until
     "Show names" is pressed, every time the screen opens, because a lecturer's screen is often on the projector.
     Behind = missing work that is past its due date, a running total under 60%, or under half of the items in modules
     open for a week or more. Ticking items done is optional, so the module rule only counts students who tick at all. */
  const LOW_TOTAL = 60, LOW_MODULES = 50, WEEK = 7 * 86400000;
  function renderStats(body) {
    let seq = 0, names = false;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let course, as, roster, grades, mods, prog, subs;
      try {
        let qz;
        [course, as, roster, grades, mods, prog, qz] = await Promise.all([C.course(cid), C.assignments(cid), C.roster(cid), C.grades(cid), C.modules(cid), C.progressAll(cid), C.quizzes(cid)]);
        subs = (await Promise.all(as.map((a) => C.submissions(cid, a.id)))).flat();
        as = [...as, ...quizItems(qz)];   // a quiz has no submissions: its grade (made when submitted) counts as handed in
      } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const now = Date.now();
      const students = roster.filter((r) => r.role === 'student'), n = students.length;
      const isStudent = new Set(students.map((s) => s.uid));
      const key = (a, u) => a + '|' + u;
      const sub = new Map(subs.filter((s) => isStudent.has(s.uid)).map((s) => [key(s.assignmentId, s.uid), s]));
      const gr = new Map(grades.filter((g) => isStudent.has(g.uid)).map((g) => [key(g.assignmentId, g.uid), g]));
      const pctOf = (g, a) => (a.points ? (g.finalScore / a.points) * 100 : null);
      const mean = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
      const rate = (k, of) => (of ? Math.round((k / of) * 100) : null);
      const show = (p) => (p === null ? '–' : p + '%');
      const due = as.filter((a) => a.dueAtMs && a.dueAtMs <= now);
      const handedIn = (a, u) => sub.has(key(a.id, u)) || gr.has(key(a.id, u));   // a grade without a submission counts (work handed in on paper)

      const rows = as.map((a) => {
        const s = students.map((st) => sub.get(key(a.id, st.uid))).filter(Boolean);
        const gs = students.map((st) => gr.get(key(a.id, st.uid))).filter(Boolean);
        return { a, past: !!(a.dueAtMs && a.dueAtMs <= now), subN: a.kind === 'quiz' ? gs.length : s.length, onTime: a.kind === 'quiz' ? null : rate(s.filter((x) => !x.late).length, s.length),
          graded: gs.length, avg: mean(gs.map((g) => pctOf(g, a)).filter((x) => x !== null)) };
      });
      let inPairs = 0, dueSubs = 0, dueLate = 0;
      due.forEach((a) => students.forEach((st) => { if (handedIn(a, st.uid)) inPairs++; const s = sub.get(key(a.id, st.uid)); if (s) { dueSubs++; if (s.late) dueLate++; } }));
      const allPct = [], byCat = {};
      as.forEach((a) => students.forEach((st) => { const g = gr.get(key(a.id, st.uid)), p = g ? pctOf(g, a) : null; if (p === null) return; allPct.push(p); (byCat[a.category || 'assignments'] = byCat[a.category || 'assignments'] || []).push(p); }));
      const cats = Object.keys(CAT_NAMES).filter((c) => byCat[c] || (course.weights && course.weights[c]));

      const openItems = mods.filter((m) => !m.releaseAtMs || m.releaseAtMs <= now - WEEK).flatMap((m) => m.items.map((i) => i.id));
      const doneMap = new Map(prog.filter((p) => Object.keys(p.done).length).map((p) => [p.uid, p.done]));
      const people = students.map((st) => {
        const missing = due.filter((a) => !handedIn(a, st.uid));
        const late = as.filter((a) => { const s = sub.get(key(a.id, st.uid)); return s && s.late; }).length;
        const mine = grades.filter((g) => g.uid === st.uid);
        const total = mine.length ? M.courseTotal(course.weights, as, mine.map((g) => ({ ...g, released: true }))).percent : null;
        const d = doneMap.get(st.uid);
        const modPct = d && openItems.length ? rate(openItems.filter((i) => d[i]).length, openItems.length) : null;
        const why = { missing: missing.length > 0, low: total !== null && total < LOW_TOTAL, mods: modPct !== null && modPct < LOW_MODULES };
        return { st, missing, late, total, modPct, why, behind: why.missing || why.low || why.mods };
      });
      const behind = people.filter((p) => p.behind).sort((x, y) => (y.missing.length - x.missing.length) || ((x.total ?? 101) - (y.total ?? 101)));
      const count = (f) => people.filter(f).length;

      const tile = (v, label) => `<div class="cm-tile"><b>${v}</b><span>${label}</span></div>`;
      const behindBody = !behind.length ? `<p class="cm-lo">Nobody is behind${due.length ? '' : ' (nothing is past its due date yet)'}.</p>`
        : names ? `<div class="cm-scroll"><table class="cm-tbl"><thead><tr><th>Student</th><th>Missing (past due)</th><th>Late</th><th>Total</th><th>Modules</th></tr></thead><tbody>${behind.map((p) =>
            `<tr><td>${h(p.st.name)}</td><td class="${p.why.missing ? 'cm-warn' : ''}" title="${h(p.missing.map((a) => a.title).join(', '))}">${p.missing.length ? `${p.missing.length}: ${h(p.missing.slice(0, 2).map((a) => a.title).join(', '))}${p.missing.length > 2 ? '…' : ''}` : '–'}</td>
              <td>${p.late || '–'}</td><td class="${p.why.low ? 'cm-warn' : ''}">${show(p.total)}</td><td class="${p.why.mods ? 'cm-warn' : ''}">${show(p.modPct)}</td></tr>`).join('')}</tbody></table></div>`
        : `<ul class="cm-facts"><li><b>${count((p) => p.missing.length >= 2)}</b> missing two or more past-due assignments</li><li><b>${count((p) => p.missing.length === 1)}</b> missing one</li>
            <li><b>${count((p) => p.why.low)}</b> with a running total under ${LOW_TOTAL}%</li>${openItems.length ? `<li><b>${count((p) => p.why.mods)}</b> who tick module items and have done under half of those open a week or more</li>` : ''}</ul>`;

      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn" data-names aria-pressed="${names}">${names ? '🙈 Hide names' : '👁 Show names'}</button></div>
        <div class="cm-tiles">${tile(n, n === 1 ? 'student' : 'students')}${tile(show(rate(inPairs, due.length * n)), 'handed in (past due)')}${tile(show(rate(dueSubs - dueLate, dueSubs)), 'on time')}${tile(show(mean(allPct)), 'average grade')}${tile(behind.length, 'behind')}</div>
        ${cats.length ? `<p class="cm-k">Averages by category</p><div class="cm-row">${cats.map((c) => `<span class="cm-tag g">${CAT_NAMES[c]}: ${show(mean(byCat[c] || []))}</span>`).join('')}</div>` : ''}
        <p class="cm-k">Who is behind</p>${behindBody}
        <p class="cm-k">Assignments</p>
        <div class="cm-scroll"><table class="cm-tbl"><thead><tr><th>Assignment</th><th>Due</th><th>Handed in</th><th>On time</th><th>Graded</th><th>Average</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${h(r.a.title)}${r.a.group ? ' <span class="cm-tag">group</span>' : ''}</td><td class="cm-lo">${h(when(r.a.dueAtMs))}</td>
          <td class="${r.past && n && r.subN < n ? 'cm-warn' : ''}">${r.subN}/${n}${n ? ` · ${rate(r.subN, n)}%` : ''}</td><td>${show(r.onTime)}</td><td>${r.graded}</td><td>${show(r.avg)}</td></tr>`).join('') || '<tr><td colspan="6" class="cm-lo">No assignments yet.</td></tr>'}</tbody></table></div>
        <p class="cm-lo">${names ? 'Names are showing: hide them before you share your screen.' : 'Names are hidden, so this is safe on a shared screen.'} Averages count graded work, released or not. Behind: missing work past its due date, a running total under ${LOW_TOTAL}%, or (for students who tick items done) under ${LOW_MODULES}% of the items in modules open a week or more.</p></div>`;
      wirePicker(body);
      body.querySelector('[data-names]').onclick = () => { names = !names; draw(); };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Quiz builder (phase 4, UniDeck v0.12.0, backend v2.19.0) ----------------
     Quizzes and question banks. The answers are saved apart from the quiz (the backend's quizKeys), which students never
     read; taking a quiz comes in UniStudentDeck next. A question is { id, type: 'mc'|'tf'|'short', text, points } plus
     options + correct (mc), answer (tf) or accept (short; none = graded by hand). Poll and Exit Ticket questions can be
     brought in, and questions copied from a bank. */
  const QTYPES = { mc: 'Multiple choice', tf: 'True / false', short: 'Short answer' };
  const rid = (p) => p + Math.random().toString(36).slice(2, 8);
  const newQ = (type) => (type === 'mc' ? { id: rid('q'), type, text: '', points: 1, options: [{ id: rid('o'), text: '' }, { id: rid('o'), text: '' }], correct: [] }
    : type === 'tf' ? { id: rid('q'), type, text: '', points: 1, answer: true } : { id: rid('q'), type, text: '', points: 1, accept: [] });
  const copyQ = (q) => ({ ...JSON.parse(JSON.stringify(q)), id: rid('q') });
  const qPoints = (qs) => M.round2(qs.reduce((a, q) => a + (Number(q.points) || 0), 0));
  /* What the open TeachersDeck widgets hold: the Poll's question and choices, the Exit Ticket's prompt (js/app.js state). */
  function fromWidgets() {
    const out = [];
    const st = typeof state !== 'undefined' ? state : null;   // js/app.js's top-level state (LectureDeck only)
    if (st && st.poll && String(st.poll.question || '').trim()) {
      const opts = (st.poll.options || []).map((o) => String(o.text || '').trim()).filter(Boolean);
      if (opts.length >= 2) out.push({ from: '📊 Poll', q: { id: rid('q'), type: 'mc', text: st.poll.question.trim(), points: 1, options: opts.map((t) => ({ id: rid('o'), text: t })), correct: [] } });
    }
    if (st && st.exitTicket && String(st.exitTicket.question || '').trim()) {
      out.push({ from: '🎟️ Exit Ticket', q: { id: rid('q'), type: 'short', text: st.exitTicket.question.trim(), points: 1, accept: [] } });
    }
    return out;
  }

  /* The question list editor, used for quizzes and banks. qs is edited in place; onChange after every edit. */
  function questionEditor(box, qs, onChange) {
    function paint() {
      box.innerHTML = qs.map((q, i) => `<div class="cm-card cm-q" data-q="${i}">
        <div class="cm-split"><span class="cm-k">${i + 1}.</span>
          <select data-k="type" aria-label="Question type">${Object.entries(QTYPES).map(([v, l]) => `<option value="${v}" ${q.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <label class="cm-qpts">Points <input type="number" min="0.5" max="100" step="0.5" data-k="points" value="${q.points}"></label>
          <span class="cm-ord"><button type="button" class="cm-x" data-mv="-1" ${i ? '' : 'disabled'} aria-label="Move up">▲</button><button type="button" class="cm-x" data-mv="1" ${i < qs.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></span>
          <button type="button" class="cm-x" data-rmq aria-label="Remove question ${i + 1}" title="Remove">×</button></div>
        <textarea data-k="text" rows="2" maxlength="2000" placeholder="The question" aria-label="Question ${i + 1}">${h(q.text)}</textarea>
        ${q.type === 'mc' ? `<p class="cm-lo">Tick the right choice${(q.correct || []).length > 1 ? 's — students select all that apply' : ' (tick more than one for “select all that apply”)'}.</p>
          ${q.options.map((o, j) => `<div class="cm-opt"><input type="checkbox" data-ok="${j}" ${q.correct.includes(o.id) ? 'checked' : ''} aria-label="Choice ${j + 1} is right"><input data-opt="${j}" maxlength="500" placeholder="Choice ${j + 1}" value="${h(o.text)}"><button type="button" class="cm-x" data-rmo="${j}" ${q.options.length > 2 ? '' : 'disabled'} aria-label="Remove choice ${j + 1}">×</button></div>`).join('')}
          ${q.options.length < 8 ? '<button type="button" class="wbtn" data-addo>＋ Choice</button>' : ''}`
        : q.type === 'tf' ? `<div class="cm-checks"><label class="cm-check"><input type="radio" name="tf${i}" data-tf="1" ${q.answer === true ? 'checked' : ''}> True</label><label class="cm-check"><input type="radio" name="tf${i}" data-tf="0" ${q.answer === false ? 'checked' : ''}> False</label></div>`
        : `<label class="cm-lbl">Accepted answers, one per line (capitals, spaces and a final full stop don’t matter; leave empty to grade by hand)<textarea data-k="accept" rows="2">${h((q.accept || []).join('\n'))}</textarea></label>`}
        </div>`).join('') || '<p class="cm-lo">No questions yet.</p>';
      box.querySelectorAll('[data-q]').forEach((card) => {
        const q = qs[Number(card.dataset.q)];
        card.querySelectorAll('[data-k]').forEach((el) => {
          el.oninput = el.onchange = () => {
            const k = el.dataset.k;
            if (k === 'type') { if (el.value === q.type) return; const n = newQ(el.value); n.id = q.id; n.text = q.text; n.points = q.points; qs[Number(card.dataset.q)] = n; paint(); return; }
            if (k === 'points') q.points = Number(el.value);
            else if (k === 'accept') q.accept = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
            else q[k] = el.value;
            onChange();
          };
        });
        card.querySelectorAll('[data-opt]').forEach((el) => { el.oninput = () => { q.options[Number(el.dataset.opt)].text = el.value; onChange(); }; });
        card.querySelectorAll('[data-ok]').forEach((el) => { el.onchange = () => { const id = q.options[Number(el.dataset.ok)].id; q.correct = el.checked ? [...q.correct, id] : q.correct.filter((x) => x !== id); paint(); }; });
        card.querySelectorAll('[data-rmo]').forEach((b) => { b.onclick = () => { const [o] = q.options.splice(Number(b.dataset.rmo), 1); q.correct = q.correct.filter((x) => x !== o.id); paint(); }; });
        const ao = card.querySelector('[data-addo]'); if (ao) ao.onclick = () => { q.options.push({ id: rid('o'), text: '' }); paint(); };
        card.querySelectorAll('[data-tf]').forEach((el) => { el.onchange = () => { q.answer = el.dataset.tf === '1'; onChange(); }; });
        card.querySelectorAll('[data-mv]').forEach((b) => { b.onclick = () => { const i = Number(card.dataset.q), j = i + Number(b.dataset.mv); [qs[i], qs[j]] = [qs[j], qs[i]]; paint(); }; });
        card.querySelector('[data-rmq]').onclick = () => { if (q.text && !confirm('Remove this question?')) return; qs.splice(Number(card.dataset.q), 1); paint(); };
      });
      onChange();
    }
    paint();
    return { paint, add(q) { qs.push(q); paint(); const last = box.querySelector('[data-q]:last-child textarea'); if (last) last.focus(); } };
  }

  function renderQuizBuilder(body) {
    let seq = 0, tab = 'quizzes', editing = null, results = null, openAtt = null;   // editing: null | 'new' | an id; results: a quiz id
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = '<p class="cm-pad cm-lo">Create a course in Course builder first.</p>'; return; }
      let course, quizzes, banks;
      try { [course, quizzes, banks] = await Promise.all([C.course(cid), C.quizzes(cid), C.banks(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const mine = list.find((c) => c.courseId === cid);
      if (results && tab === 'quizzes') {
        const q = quizzes.find((x) => x.id === results);
        if (q) {
          let res, key, roster;
          try { [res, key, roster] = await Promise.all([C.quizResults(cid, q.id), C.quizKey(cid, q.id), C.roster(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
          if (my !== seq) return;
          return resultsView(cid, q, res, key, roster.filter((r) => r.role === 'student').length);
        }
        results = null;
      }
      if (editing && tab === 'quizzes') {
        const q = editing === 'new' ? null : quizzes.find((x) => x.id === editing);
        let qs = [];
        if (q) { try { qs = await C.quizKey(cid, q.id); } catch (e) { say(C.errText(e)); } }
        if (my !== seq) return;
        return quizForm(course, cid, q, qs, banks);
      }
      if (editing && tab === 'banks') return bankForm(cid, editing === 'new' ? null : banks.find((b) => b.id === editing));
      const limits = (q) => [q.timeLimitMin ? `${q.timeLimitMin} min` : 'no time limit', q.attempts ? `${q.attempts} attempt${q.attempts === 1 ? '' : 's'}` : 'unlimited attempts'].join(' · ');
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-add>＋ New ${tab === 'quizzes' ? 'quiz' : 'bank'}</button></div>
        <div class="cm-seg" role="tablist"><button role="tab" data-tab="quizzes" aria-selected="${tab === 'quizzes'}">Quizzes (${quizzes.length})</button><button role="tab" data-tab="banks" aria-selected="${tab === 'banks'}">Question banks (${banks.length})</button></div>
        ${tab === 'quizzes' ? `<ul class="cm-list">${quizzes.map((q) => `<li><button class="cm-linkbtn" data-ed="${h(q.id)}"><b>${h(q.title)} ${q.published ? '<span class="cm-tag s">Published</span>' : '<span class="cm-tag d">Draft</span>'}</b>
            <span class="cm-lo">${q.questionCount} question${q.questionCount === 1 ? '' : 's'} · ${q.points} pt${q.points === 1 ? '' : 's'} · ${h(limits(q))} · ${q.dueAtMs ? `Due ${h(when(q.dueAtMs))}` : 'No due date'}${q.openAtMs ? ` · opens ${h(when(q.openAtMs))}` : ''}</span></button>
            ${q.published ? `<button class="wbtn" data-res="${h(q.id)}">Results</button>` : ''}${mine.role === 'instructor' ? `<button class="cm-x" data-del="${h(q.id)}" aria-label="Delete ${h(q.title)}" title="Delete">×</button>` : ''}</li>`).join('') || '<li class="cm-lo">No quizzes yet. Students see a quiz once you publish it.</li>'}</ul>`
        : `<ul class="cm-list">${banks.map((b) => `<li><button class="cm-linkbtn" data-ed="${h(b.id)}"><b>${h(b.title)}</b><span class="cm-lo">${b.count} question${b.count === 1 ? '' : 's'} · only staff see banks</span></button>
            <button class="cm-x" data-del="${h(b.id)}" aria-label="Delete ${h(b.title)}" title="Delete">×</button></li>`).join('') || '<li class="cm-lo">No question banks yet. A bank keeps questions to reuse: add them to any quiz in this course.</li>'}</ul>`}</div>`;
      wirePicker(body);
      body.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
      body.querySelectorAll('[data-res]').forEach((b) => { b.onclick = () => { results = b.dataset.res; openAtt = null; draw(); }; });
      body.querySelector('[data-add]').onclick = () => { editing = 'new'; draw(); };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm(tab === 'quizzes' ? 'Delete this quiz?' : 'Delete this question bank? Quizzes keep the questions they took from it.')) return;
          try { await (tab === 'quizzes' ? C.deleteQuiz(cid, b.dataset.del) : C.deleteBank(cid, b.dataset.del)); draw(); } catch (e) { say(C.errText(e)); }
        };
      });
    }

    /* A quiz's results (backend v2.20.0): every attempt, answers marked right or wrong, short answers to grade by hand,
       and releasing the scores to students. A student's grade is their best attempt. */
    function resultsView(cid, q, res, key, nStudents) {
      const byId = new Map(key.map((x) => [x.id, x]));
      const done = res.attempts.filter((a) => a.status === 'submitted'), open = res.attempts.filter((a) => a.status === 'open');
      const best = new Map();
      done.forEach((a) => { const b = best.get(a.uid); if (!b || a.score > b.score) best.set(a.uid, a); });
      const avg = best.size ? Math.round([...best.values()].reduce((s, a) => s + (a.points ? (a.score / a.points) * 100 : 0), 0) / best.size) : null;
      const pending = done.reduce((s, a) => s + (a.pending || 0), 0);
      const shown = (x, ans) => {
        if (x.type === 'mc') { const ids = Array.isArray(ans) ? ans : []; return ids.length ? ids.map((id) => (x.options.find((o) => o.id === id) || { text: '?' }).text).join('; ') : '—'; }
        if (x.type === 'tf') return ans === true ? 'True' : ans === false ? 'False' : '—';
        return ans ? String(ans) : '—';
      };
      const rightText = (x) => (x.type === 'mc' ? x.correct.map((id) => (x.options.find((o) => o.id === id) || { text: '?' }).text).join('; ') : x.type === 'tf' ? (x.answer ? 'True' : 'False') : (x.accept || []).join(' / ') || 'graded by hand');
      const tile = (v, label) => `<div class="cm-tile"><b>${v}</b><span>${label}</span></div>`;
      body.innerHTML = `<div class="cm-pad"><button class="cm-linkbtn" data-back>← All quizzes</button>
        <div class="cm-split"><p class="cm-k">${h(q.title)} · results</p>${res.released ? '<span class="cm-tag s">Released to students</span>' : `<button class="wbtn primary" data-release ${done.length ? '' : 'disabled'}>Release results</button>`}</div>
        <div class="cm-tiles">${tile(`${best.size}/${nStudents}`, 'students submitted')}${tile(avg === null ? '–' : avg + '%', 'average (best attempt)')}${tile(pending, 'answers to grade by hand')}${tile(open.length, 'in progress')}</div>
        ${pending ? '<p class="cm-warn">Some short answers need a grade from you. Their points count as 0 until you grade them.</p>' : ''}
        <div class="cm-scroll"><table class="cm-tbl"><thead><tr><th>Student</th><th>Attempt</th><th>Submitted</th><th>Score</th><th></th></tr></thead><tbody>
        ${res.attempts.map((a) => `<tr><td>${h(a.name)}${best.get(a.uid) === a && res.attempts.filter((x) => x.uid === a.uid).length > 1 ? ' <span class="cm-tag g">best</span>' : ''}</td><td>${a.attempt}</td>
          <td class="cm-lo">${a.status === 'open' ? 'in progress' : h(when(a.submittedAtMs))}${a.timedOut ? ' · time ran out' : ''}</td>
          <td>${a.status === 'open' ? '–' : `<b>${a.score}</b>/${a.points}${a.pending ? ` <span class="cm-tag d">${a.pending} to grade</span>` : ''}`}</td>
          <td>${a.status === 'submitted' ? `<button class="wbtn" data-att="${h(a.id)}">${openAtt === a.id ? 'Hide' : 'Answers'}</button>` : ''}</td></tr>
          ${openAtt === a.id ? `<tr><td colspan="5"><div class="cm-card">${(a.order || key.map((x) => x.id)).map((id, i) => { const x = byId.get(id); if (!x) return ''; const r = (a.results || {})[id] || { score: 0 };
            return `<div class="cm-ans"><p><b>${i + 1}. ${h(x.text)}</b> <span class="cm-lo">(${x.points} pt${x.points === 1 ? '' : 's'})</span></p>
              <p>${r.pending ? '⏳' : r.score >= x.points ? '✅' : r.score > 0 ? '◐' : '❌'} ${h(shown(x, (a.answers || {})[id]))}</p>
              <p class="cm-lo">Right answer: ${h(rightText(x))}</p>
              <label class="cm-qpts">Score <input type="number" min="0" max="${x.points}" step="0.5" value="${r.pending ? '' : r.score}" data-gq="${h(id)}" data-ga="${h(a.id)}" placeholder="–"> / ${x.points}${r.by ? ' · graded by hand' : ''}</label></div>`; }).join('')}</div></td></tr>` : ''}`).join('')
          || '<tr><td colspan="5" class="cm-lo">Nobody has taken this quiz yet.</td></tr>'}</tbody></table></div>
        <p class="cm-lo">Students see their scores, and which questions they got right, only after you release the results; they never see the right answers. Later attempts are released as they come in. Change any score above to grade by hand.</p></div>`;
      body.querySelector('[data-back]').onclick = () => { results = null; openAtt = null; draw(); };
      body.querySelectorAll('[data-att]').forEach((b) => { b.onclick = () => { openAtt = openAtt === b.dataset.att ? null : b.dataset.att; draw(); }; });
      body.querySelectorAll('[data-gq]').forEach((el) => {
        el.onchange = async () => {
          if (el.value === '') return;
          try { const r = await C.gradeQuizAnswer(cid, el.dataset.ga, el.dataset.gq, Number(el.value)); say(`Saved. Attempt score ${r.score}${r.pending ? `, ${r.pending} still to grade` : ''}.`); draw(); } catch (e) { say(C.errText(e)); }
        };
      });
      const rel = body.querySelector('[data-release]');
      if (rel) rel.onclick = async () => {
        if (!confirm(`Release the results of “${q.title}”? Students see their scores and which questions they got right (not the right answers).${pending ? `\n\n${pending} answer${pending === 1 ? ' is' : 's are'} still to grade by hand and count as 0 until you do.` : ''}`)) return;
        try { const r = await C.releaseQuizResults(cid, q.id); say(`Results released to ${r.released} student${r.released === 1 ? '' : 's'}.`); draw(); } catch (e) { say(C.errText(e)); }
      };
    }

    function quizForm(course, cid, q, qs, banks) {
      const cats = Object.keys(course.weights || { assignments: 100 });
      const cat = q ? q.category : (cats.includes('quizzes') ? 'quizzes' : cats[0]);
      const found = fromWidgets();
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${q ? 'Edit quiz' : 'New quiz'}</p>
        <label class="cm-lbl">Title<input name="title" required maxlength="120" value="${h(q ? q.title : '')}" placeholder="e.g. Week 3 check: finding sources"></label>
        <label class="cm-lbl">Instructions<textarea name="instructions" rows="2" maxlength="8000">${h(q ? q.instructions : '')}</textarea></label>
        <div class="cm-two"><label class="cm-lbl">Opens<input type="datetime-local" name="open" value="${localInput(q && q.openAtMs)}"></label>
        <label class="cm-lbl">Due<input type="datetime-local" name="due" value="${localInput(q && q.dueAtMs)}"></label></div>
        <div class="cm-two"><label class="cm-lbl">Time limit in minutes (0 = none)<input type="number" min="0" max="600" name="time" value="${q ? q.timeLimitMin : 0}"></label>
        <label class="cm-lbl">Attempts (0 = unlimited)<input type="number" min="0" max="20" name="attempts" value="${q ? q.attempts : 1}"></label></div>
        <div class="cm-two"><label class="cm-lbl">Category<select name="category">${cats.map((k) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${CAT_NAMES[k] || k}</option>`).join('')}</select></label>
        <label class="cm-check"><input type="checkbox" name="shuffle" ${q && q.shuffle ? 'checked' : ''}> Shuffle questions and choices for each student</label></div>
        <div class="cm-split"><p class="cm-k">Questions</p><span class="cm-lo" data-total></span></div>
        <div data-qs></div>
        <div class="btn-row cm-left">${Object.entries(QTYPES).map(([v, l]) => `<button type="button" class="wbtn" data-newq="${v}">＋ ${l}</button>`).join('')}</div>
        <div class="btn-row cm-left">${banks.length ? '<button type="button" class="wbtn" data-frombank>From a question bank…</button>' : ''}
          ${found.map((x, i) => `<button type="button" class="wbtn" data-import="${i}" title="${h(x.q.text)}">Bring in from ${x.from}</button>`).join('')}
          <button type="button" class="wbtn" data-tobank>Save these questions to a new bank</button></div>
        <div data-pickbank></div>
        <label class="cm-check"><input type="checkbox" name="published" ${q && q.published ? 'checked' : ''}> Published: students in the course can see it${q && q.published ? '' : ' (leave unticked to keep a draft)'}</label>
        <p class="cm-lo">Students never see the answers: they stay with course staff, and quizzes are scored on the server.</p>
        <div class="btn-row cm-left"><button class="wbtn primary">Save quiz</button><button type="button" class="wbtn" data-cancel>Cancel</button></div></form>`;
      const f = body.querySelector('[data-f]');
      const total = f.querySelector('[data-total]');
      const ed = questionEditor(f.querySelector('[data-qs]'), qs, () => { total.textContent = `${qs.length} question${qs.length === 1 ? '' : 's'} · ${qPoints(qs)} pt${qPoints(qs) === 1 ? '' : 's'}`; });
      f.querySelectorAll('[data-newq]').forEach((b) => { b.onclick = () => ed.add(newQ(b.dataset.newq)); });
      f.querySelectorAll('[data-import]').forEach((b) => { b.onclick = () => { const x = found[Number(b.dataset.import)]; ed.add(copyQ(x.q)); say(x.q.type === 'mc' ? 'Added. Tick the right choice.' : 'Added. Add accepted answers, or leave it to grade by hand.'); }; });
      const fb = f.querySelector('[data-frombank]');
      if (fb) fb.onclick = () => {
        const box = f.querySelector('[data-pickbank]');
        if (box.innerHTML) { box.innerHTML = ''; return; }
        box.innerHTML = `<div class="cm-card"><label class="cm-lbl">Question bank<select data-bank>${banks.map((b, i) => `<option value="${i}">${h(b.title)} (${b.count})</option>`).join('')}</select></label>
          <div data-bankqs class="cm-checks cm-col"></div><div class="btn-row cm-left"><button type="button" class="wbtn primary" data-addsel>Add the ticked questions</button><button type="button" class="wbtn" data-addall>Add all</button></div></div>`;
        const bsel = box.querySelector('[data-bank]'), bq = box.querySelector('[data-bankqs]');
        const show = () => { const b = banks[Number(bsel.value)]; bq.innerHTML = b.questions.map((x, i) => `<label class="cm-check"><input type="checkbox" data-bi="${i}"> <span>${h(x.text)} <span class="cm-lo">${QTYPES[x.type]} · ${x.points} pt${x.points === 1 ? '' : 's'}</span></span></label>`).join('') || '<p class="cm-lo">This bank is empty.</p>'; };
        bsel.onchange = show; show();
        const add = (all) => { const b = banks[Number(bsel.value)]; const pickd = b.questions.filter((x, i) => all || bq.querySelector(`[data-bi="${i}"]`).checked);
          if (!pickd.length) { say('Tick a question first.'); return; } pickd.forEach((x) => qs.push(copyQ(x))); ed.paint(); box.innerHTML = ''; say(`${pickd.length} question${pickd.length === 1 ? '' : 's'} added.`); };
        box.querySelector('[data-addsel]').onclick = () => add(false);
        box.querySelector('[data-addall]').onclick = () => add(true);
      };
      const tb = f.querySelector('[data-tobank]');
      if (tb) tb.onclick = async () => {
        if (!qs.length) { say('Add a question first.'); return; }
        const title = prompt('Name the new question bank:', f.title.value ? `${f.title.value} questions` : '');
        if (!title) return;
        try { const r = await C.saveBank(cid, { title, questions: qs.map(copyQ) }); say(`Saved ${r.count} question${r.count === 1 ? '' : 's'} to “${title}”.`); } catch (e) { say(C.errText(e)); }
      };
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const data = { id: q ? q.id : undefined, title: f.title.value, instructions: f.instructions.value, category: f.category.value,
          openAtMs: f.open.value ? new Date(f.open.value).getTime() : null, dueAtMs: f.due.value ? new Date(f.due.value).getTime() : null,
          timeLimitMin: Number(f.time.value) || 0, attempts: Number(f.attempts.value) || 0, shuffle: f.shuffle.checked, published: f.published.checked, questions: qs };
        try { const r = await C.saveQuiz(cid, data); say(`Quiz saved: ${r.points} pts${data.published ? ', published' : ', draft'}.`); editing = null; draw(); } catch (er) { say(C.errText(er)); }
      };
    }

    function bankForm(cid, b) {
      const qs = b ? b.questions.map((x) => JSON.parse(JSON.stringify(x))) : [];
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${b ? 'Edit question bank' : 'New question bank'}</p>
        <label class="cm-lbl">Title<input name="title" required maxlength="120" value="${h(b ? b.title : '')}" placeholder="e.g. Citations and plagiarism"></label>
        <div class="cm-split"><p class="cm-k">Questions</p><span class="cm-lo" data-total></span></div>
        <div data-qs></div>
        <div class="btn-row cm-left">${Object.entries(QTYPES).map(([v, l]) => `<button type="button" class="wbtn" data-newq="${v}">＋ ${l}</button>`).join('')}</div>
        <p class="cm-lo">Only course staff see question banks. Editing a bank doesn’t change quizzes that already took its questions.</p>
        <div class="btn-row cm-left"><button class="wbtn primary">Save bank</button><button type="button" class="wbtn" data-cancel>Cancel</button></div></form>`;
      const f = body.querySelector('[data-f]');
      const total = f.querySelector('[data-total]');
      const ed = questionEditor(f.querySelector('[data-qs]'), qs, () => { total.textContent = `${qs.length} question${qs.length === 1 ? '' : 's'}`; });
      f.querySelectorAll('[data-newq]').forEach((x) => { x.onclick = () => ed.add(newQ(x.dataset.newq)); });
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { await C.saveBank(cid, { id: b ? b.id : undefined, title: f.title.value, questions: qs }); say('Question bank saved.'); editing = null; draw(); } catch (er) { say(C.errText(er)); }
      };
    }
    draw();
    return live(draw);
  }

  window.CourseMode = { quizzes: renderQuizBuilder, grader: renderGrader, gradebook: renderGradebook, stats: renderStats, groups: renderGroups, discussions: renderDiscussions, announcements: renderAnnouncements, office: renderOfficeHours };
  if (TA_HOST) return;
  window.UNI_WIDGETS = [
    { id: 'coursebuilder', cat: 'course', title: '🏛️ Course builder', desc: 'Create a university course: code, term, grading weights, late policy, people.', icon: 'people', w: 440, h: 600, render: renderBuilder },
    { id: 'courseassign', cat: 'course', title: '🗂️ Course assignments', desc: 'Assignments with due dates, rubrics, submission types and attempts.', icon: 'clipboard', w: 440, h: 600, render: renderAssignments },
    { id: 'grader', cat: 'course', title: '✅ Grader', desc: 'Each submission beside its rubric: score, feedback, release.', icon: 'report', w: 820, h: 620, render: renderGrader },
    { id: 'coursemodules', cat: 'course', title: '🧭 Modules', desc: 'Weekly modules: pages, links, readings and assignments, with release dates.', icon: 'clipboard', w: 520, h: 640, render: renderModules },
    { id: 'courseannounce', cat: 'course', title: '📣 Announcements', desc: 'Post to one or several courses, pin, see who has read it.', icon: 'report', w: 460, h: 620, render: renderAnnouncements },
    { id: 'coursediscuss', cat: 'course', title: '💬 Discussions', desc: 'Start course discussions, post-first prompts, pin, close, moderate.', icon: 'report', w: 520, h: 640, render: renderDiscussions },
    { id: 'coursecal', cat: 'course', title: '📅 Course calendar', desc: 'Class times, exams and events for every student’s Calendar.', icon: 'clipboard', w: 480, h: 600, render: renderCourseCalendar },
    { id: 'courseoffice', cat: 'course', title: '🙋 Office hours', desc: 'Open bookable slots, see who booked and why.', icon: 'people', w: 480, h: 600, render: renderOfficeHours },
    { id: 'coursegroups', cat: 'course', title: '👥 Groups', desc: 'Put students in groups for group projects; see each group’s task list.', icon: 'people', w: 520, h: 640, render: renderGroups },
    { id: 'coursequiz', cat: 'course', title: '📝 Quiz builder', desc: 'Quizzes and question banks: multiple choice, true/false, short answer; time and attempt limits; bring in Poll and Exit Ticket questions.', icon: 'clipboard', w: 620, h: 660, render: renderQuizBuilder },
    { id: 'gradebook', cat: 'course', title: '📒 Gradebook', desc: 'Students by assignments, weighted totals, CSV export.', icon: 'stats', w: 760, h: 560, render: renderGradebook },
    { id: 'coursestats', cat: 'course', title: '📊 Course stats', desc: 'Who is behind, submission and on-time rates, averages; names hidden for shared screens.', icon: 'stats', w: 720, h: 620, render: renderStats },
  ];
})();

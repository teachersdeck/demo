'use strict';
/* LectureDeck — Course mode, UniDeck phase 1: Course builder, Course assignments, Grader and Gradebook (UniDeck v0.3.0).
   LectureDeck's own file (not shared with TeachersDeck). It only lists the widgets in window.UNI_WIDGETS; the shared
   js/app.js adds them to a "Courses" category when the edition is the university one. Data: js/unicourses.js (shared
   with UniStudentDeck); maths: js/coursemath.js (the same file the backend runs). Loaded before js/app.js. */
(function () {
  const C = window.UniCourses, M = window.CourseMath;
  if (!C || !M) return;
  const h = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (m) => (typeof toast === 'function' ? toast(m, 3600) : alert(m));
  const when = (ms) => (ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No due date');
  const localInput = (ms) => { if (!ms) return ''; const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const CAT_NAMES = { assignments: 'Assignments', quizzes: 'Quizzes', exams: 'Exams', participation: 'Participation' };

  function gate(body, redraw) {
    const s = C.state();
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
    let cur = C.currentCourse();
    if (!list.some((c) => c.courseId === cur)) { cur = list[0] ? list[0].courseId : ''; if (cur) C.setCurrentCourse(cur); }
    return cur;
  }
  const picker = (list, cur) => (list.length ? `<label class="cm-pick">Course <select data-course>${list.map((c) => `<option value="${h(c.courseId)}" ${c.courseId === cur ? 'selected' : ''}>${h(c.title)}${c.section ? ' · ' + h(c.section) : ''}</option>`).join('')}</select></label>` : '');
  function wirePicker(body, extra) { const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { if (extra) extra(); C.setCurrentCourse(s.value); }; }
  function live(draw) {
    const off = C.onChange(() => draw());
    const on = () => draw();
    window.addEventListener('ud-course', on);
    return () => { off(); window.removeEventListener('ud-course', on); };
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
          ${roster.length ? `<table class="cm-tbl"><tbody>${roster.map((r) => `<tr><td>${h(r.name)}<br><span class="cm-lo">${h(r.email || '')}</span></td><td>${r.under18 ? '<span class="cm-tag">under 18</span>' : ''}</td><td>${mine.role === 'instructor' ? `<button class="wbtn" data-role="${h(r.uid)}" data-to="${r.role === 'ta' ? 'student' : 'ta'}">${r.role === 'ta' ? 'TA ✓' : 'Make TA'}</button>` : h(r.role)}</td></tr>`).join('')}</tbody></table>` : '<p class="cm-lo">Nobody has joined yet. Share the course code.</p>'}</div></div>`;
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
          else { const r = await C.createCourse(data); C.setCurrentCourse(r.courseId); say(`Course created. Code: ${r.code}`); }
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
        <ul class="cm-list">${as.map((a) => `<li><button class="cm-linkbtn" data-ed="${h(a.id)}"><b>${h(a.title)}</b><span class="cm-lo">Due ${h(when(a.dueAtMs))} · ${a.points} pts · ${h(CAT_NAMES[a.category] || a.category)}${a.rubric && a.rubric.length ? ` · rubric (${a.rubric.length})` : ''} · ${h(a.submitType)}</span></button>
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
          category: f.category.value, submitType: f.submitType.value, attempts: Number(f.attempts.value) || 0, rubric, points: Number(f.points.value),
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
      el.innerHTML = `<p class="cm-k">${h(st.name)}</p>
        ${s ? `<p class="cm-lo">Submitted ${h(when(s.submittedAtMs))}${s.attempt > 1 ? ` · attempt ${s.attempt}` : ''}${s.late ? ` · <b class="cm-late">${s.lateDays} day${s.lateDays === 1 ? '' : 's'} late (−${pen}%)</b>` : ' · on time'}</p>
          ${s.text ? `<div class="cm-text">${h(s.text).replace(/\n/g, '<br>')}</div>` : ''}${s.link ? `<p><a href="${h(s.link)}" target="_blank" rel="noopener">${h(s.link)}</a></p>` : ''}
          ${files.map((f) => `<p>📎 ${f.url ? `<a href="${h(f.url)}" target="_blank" rel="noopener">${h(f.name)}</a>` : h(f.name)}</p>`).join('')}` : '<p class="cm-lo">No submission. You can still enter a grade.</p>'}
        <form data-g class="cm-card">${a.rubric && a.rubric.length ? `<table class="cm-tbl"><tbody>${a.rubric.map((r) => `<tr><td>${h(r.criterion)}</td><td><input type="number" min="0" max="${r.points}" step="0.5" name="r_${h(r.id)}" value="${g && g.rubricScores[r.id] !== undefined ? g.rubricScores[r.id] : ''}" aria-label="${h(r.criterion)}"> / ${r.points}</td></tr>`).join('')}</tbody></table>`
          : `<label class="cm-lbl">Score (out of ${a.points})<input type="number" min="0" max="${a.points}" step="0.5" name="score" value="${g ? g.score : ''}" required></label>`}
          <p class="cm-lo" data-calc></p>
          <label class="cm-lbl">Feedback<textarea name="feedback" rows="4" maxlength="5000">${h(g ? g.feedback : '')}</textarea></label>
          <div class="btn-row cm-left"><button class="wbtn primary">Save grade</button>${g ? `<span class="cm-lo">${g.released ? 'Released to the student' : 'Draft: not released yet'}</span>` : ''}</div></form>`;
      const f = el.querySelector('[data-g]');
      const calc = () => {
        const raw = a.rubric && a.rubric.length ? M.rubricScore(a.rubric, Object.fromEntries(a.rubric.map((r) => [r.id, Number(f['r_' + r.id].value)]))).score : Number(f.score.value) || 0;
        f.querySelector('[data-calc]').textContent = `Score ${raw} / ${a.points}${pen ? ` → ${M.finalScore(raw, pen)} after the late penalty` : ''}`;
      };
      f.oninput = calc; calc();
      f.onsubmit = async (e) => {
        e.preventDefault();
        const data = { feedback: f.feedback.value };
        if (a.rubric && a.rubric.length) data.rubricScores = Object.fromEntries(a.rubric.map((r) => [r.id, Number(f['r_' + r.id].value) || 0])); else data.score = Number(f.score.value);
        try { const r = await C.grade(cid, a.id, st.uid, data); say(`Saved: ${r.finalScore}/${a.points}.`); draw(); } catch (er) { say(C.errText(er)); }
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
      let course, as, roster, grades;
      try { [course, as, roster, grades] = await Promise.all([C.course(cid), C.assignments(cid), C.roster(cid), C.grades(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
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

  window.UNI_WIDGETS = [
    { id: 'coursebuilder', cat: 'course', title: '🏛️ Course builder', desc: 'Create a university course: code, term, grading weights, late policy, people.', icon: 'people', w: 440, h: 600, render: renderBuilder },
    { id: 'courseassign', cat: 'course', title: '🗂️ Course assignments', desc: 'Assignments with due dates, rubrics, submission types and attempts.', icon: 'clipboard', w: 440, h: 600, render: renderAssignments },
    { id: 'grader', cat: 'course', title: '✅ Grader', desc: 'Each submission beside its rubric: score, feedback, release.', icon: 'report', w: 820, h: 620, render: renderGrader },
    { id: 'gradebook', cat: 'course', title: '📒 Gradebook', desc: 'Students by assignments, weighted totals, CSV export.', icon: 'stats', w: 760, h: 560, render: renderGradebook },
  ];
})();

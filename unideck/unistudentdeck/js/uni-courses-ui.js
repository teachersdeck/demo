'use strict';
/* UniStudentDeck — UniDeck phase 1 course widgets: Courses, Assignments and Grades (UniDeck v0.3.0).
   UniStudentDeck's own file (not shared with StudentDeck). It only lists the widgets in window.UNI_WIDGETS; the shared
   js/app.js adds them to the dock when the edition is the university one. Data comes from js/unicourses.js (shared with
   LectureDeck), sums from js/coursemath.js (the same maths the backend runs). Loaded after those two, before js/app.js. */
(function () {
  const C = window.UniCourses, M = window.CourseMath;
  if (!C || !M) return;
  const h = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (m) => (typeof toast === 'function' ? toast(m, 3600) : alert(m));
  const when = (ms) => (ms ? new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No due date');
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const MAX_FILE = 25 * 1048576, TYPES = /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/(png|jpeg|gif|webp))$/;

  /* Sign-in gate shared by all three widgets: Google, then a date of birth once. Returns true when ready. */
  function gate(body, redraw) {
    const s = C.state();
    if (!C.available()) {
      body.innerHTML = `<div class="ud-empty"><p>Course sync isn’t set up in this build.</p><p class="muted">Ask your instructor or school for UniStudentDeck with courses switched on, or try the demo.</p>
        <div class="row center"><button class="btn primary" data-demo>Try the demo</button></div></div>`;
      body.querySelector('[data-demo]').onclick = () => (typeof SD_DEMO !== 'undefined' ? SD_DEMO.enter() : (location.search = '?demo=1'));
      return false;
    }
    if (!s.user || s.role !== 'unistudent' && !s.needsBirthDate) {
      if (s.user && s.role && s.role !== 'unistudent') {
        body.innerHTML = `<div class="ud-empty"><p>You’re signed in as <b>${h(s.user.email)}</b>, which is a ${h(s.role)} account.</p><p class="muted">Use a different Google account for UniStudentDeck.</p><div class="row center"><button class="btn" data-out>Sign out</button></div></div>`;
        body.querySelector('[data-out]').onclick = () => C.signOut();
        return false;
      }
      body.innerHTML = `<div class="ud-empty"><p><b>Sign in to see your courses</b></p><p class="muted">Use your Google or university Google account.${C.demo ? ' (Demo: no real account is used.)' : ''}</p>
        <div class="row center"><button class="btn primary" data-in ${s.busy ? 'disabled' : ''}>Sign in with Google</button></div></div>`;
      body.querySelector('[data-in]').onclick = async () => { try { await C.signIn('student'); redraw(); } catch (e) { say(C.errText(e)); } };
      return false;
    }
    if (s.needsBirthDate) {
      body.innerHTML = `<form class="ud-card" data-dob><p><b>One more step</b></p><p class="muted">Your date of birth, asked once. UniDeck keeps only whether you are under 18 (some tools are for adults only), never the date itself.</p>
        <label class="ud-lbl">Date of birth <input type="date" required max="${new Date().toISOString().slice(0, 10)}" name="dob"></label>
        <div class="row"><button class="btn primary">Continue</button><button type="button" class="btn" data-out>Cancel</button></div></form>`;
      const f = body.querySelector('[data-dob]');
      f.onsubmit = async (e) => { e.preventDefault(); try { await C.completeProfile(f.dob.value); redraw(); } catch (er) { say(C.errText(er)); } };
      f.querySelector('[data-out]').onclick = () => C.signOut();
      return false;
    }
    return true;
  }

  /* A course picker row; calls back with the chosen courseId. */
  function picker(list, current) {
    if (!list.length) return '';
    return `<label class="ud-pick">Course <select data-course>${list.map((c) => `<option value="${h(c.courseId)}" ${c.courseId === current ? 'selected' : ''}>${h(c.title)}${c.section ? ' · ' + h(c.section) : ''}</option>`).join('')}</select></label>`;
  }
  async function currentOf(list) {
    let cur = C.currentCourse();
    if (!list.some((c) => c.courseId === cur)) { cur = list[0] ? list[0].courseId : ''; if (cur) C.setCurrentCourse(cur); }
    return cur;
  }
  function live(body, draw) {
    const off1 = C.onChange(() => draw());
    const on = () => draw();
    window.addEventListener('ud-course', on);
    return () => { off1(); window.removeEventListener('ud-course', on); };
  }

  /* ---------------- Courses ---------------- */
  function renderCourses(body) {
    let seq = 0;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      body.innerHTML = '<p class="muted ud-pad">Loading your courses…</p>';
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const cur = await currentOf(list);
      const s = C.state();
      body.innerHTML = `<div class="ud-pad">
        <form class="row" data-join><input type="text" name="code" placeholder="Course code, e.g. ABCD-2345" maxlength="12" style="flex:1" aria-label="Course code" autocomplete="off"><button class="btn primary">Join</button></form>
        ${list.length ? '' : '<p class="muted">You haven’t joined a course yet. Your instructor gives you a course code.</p>'}
        <ul class="ud-list">${list.map((c) => `<li class="${c.courseId === cur ? 'on' : ''}"><button class="ud-linkbtn" data-open="${h(c.courseId)}"><b>${h(c.title)}</b><span class="muted">${h([c.term, c.section].filter(Boolean).join(' · '))}${c.role !== 'student' ? ' · ' + h(c.role.toUpperCase()) : ''}</span></button>
          ${c.role === 'student' ? `<button class="ud-x" title="Leave course" aria-label="Leave ${h(c.title)}" data-leave="${h(c.courseId)}">×</button>` : ''}</li>`).join('')}</ul>
        <div data-home></div>
        <p class="muted ud-foot">Signed in as ${h(s.user.email || s.user.name)}${s.under18 ? ' · under-18 account (AI tools off)' : ''} · <a href="#" data-out>Sign out</a></p></div>`;
      const f = body.querySelector('[data-join]');
      f.onsubmit = async (e) => { e.preventDefault(); const code = f.code.value.trim(); if (!code) return;
        try { const r = await C.joinCourse(code); C.setCurrentCourse(r.courseId); say(r.alreadyIn ? `You’re already in ${r.title}.` : `Joined ${r.title}.`); } catch (er) { say(C.errText(er)); } };
      body.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => C.setCurrentCourse(b.dataset.open); });
      body.querySelectorAll('[data-leave]').forEach((b) => { b.onclick = async () => {
        if (!confirm('Leave this course? Your submitted work and grades stay with your instructor.')) return;
        try { await C.leaveCourse(b.dataset.leave); C.setCurrentCourse(''); } catch (er) { say(C.errText(er)); } }; });
      body.querySelector('[data-out]').onclick = (e) => { e.preventDefault(); C.signOut(); };
      if (cur) home(body.querySelector('[data-home]'), cur, my);
    }
    async function home(el, cid, my) {
      try {
        const [course, as, subs] = await Promise.all([C.course(cid), C.assignments(cid), C.mySubmissions(cid)]);
        if (my !== seq || !course) return;
        const next = as.filter((a) => a.dueAtMs && a.dueAtMs > Date.now() && !subs[a.id])[0];
        const todo = as.filter((a) => !subs[a.id]).length;
        el.innerHTML = `<div class="ud-card"><p class="ud-k">${h(course.title)}</p><p class="muted">${h(course.ownerName || '')}${course.term ? ' · ' + h(course.term) : ''}</p>
          <div class="ud-tiles"><div><b>${as.length}</b><span>assignments</span></div><div><b>${todo}</b><span>to submit</span></div></div>
          ${next ? `<p>Next due: <b>${h(next.title)}</b><br><span class="muted">${h(when(next.dueAtMs))}</span></p>` : '<p class="muted">Nothing due right now.</p>'}
          <div class="row"><button class="btn" data-w="uassign">Assignments →</button><button class="btn" data-w="grades">Grades →</button></div></div>`;
        el.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => (typeof openWidget === 'function' ? openWidget(b.dataset.w) : null); });
      } catch (e) { el.innerHTML = `<p class="muted">${h(C.errText(e))}</p>`; }
    }
    draw();
    return live(body, draw);
  }

  /* ---------------- Assignments ---------------- */
  function renderAssign(body) {
    let seq = 0, openId = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await currentOf(list);
      if (!cid) { body.innerHTML = '<p class="ud-pad muted">Join a course in the Courses widget first.</p>'; return; }
      body.innerHTML = '<p class="muted ud-pad">Loading…</p>';
      let as, subs, grades, course;
      try { [course, as, subs, grades] = await Promise.all([C.course(cid), C.assignments(cid), C.mySubmissions(cid), C.myGrades(cid)]); }
      catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const a = openId && as.find((x) => x.id === openId);
      if (a) return detail(a, course, subs[a.id], grades[a.id], cid);
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        <ul class="ud-list">${as.map((x) => { const st = status(x, subs[x.id], grades[x.id]);
          return `<li><button class="ud-linkbtn" data-a="${h(x.id)}"><b>${h(x.title)}</b><span class="muted">${h(when(x.dueAtMs))} · ${x.points} pts</span></button><span class="ud-tag ${st.cls}">${st.label}</span></li>`; }).join('') || '<li class="muted">No assignments yet.</li>'}</ul></div>`;
      wirePicker();
      body.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => { openId = b.dataset.a; draw(); }; });
    }
    function status(a, sub, g) {
      if (g) return { cls: 'g', label: `${g.finalScore}/${a.points}` };
      if (sub) return { cls: sub.late ? 'l' : 's', label: sub.late ? 'Submitted late' : 'Submitted' };
      if (a.dueAtMs && a.dueAtMs < Date.now()) return { cls: 'm', label: 'Missing' };
      return { cls: '', label: 'To do' };
    }
    function wirePicker() { const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { openId = null; C.setCurrentCourse(s.value); }; }
    function detail(a, course, sub, g, cid) {
      const pol = M.cleanLatePolicy(a.latePolicy || course.latePolicy);
      const late = a.dueAtMs && Date.now() > a.dueAtMs;
      const closed = !M.acceptsSubmission(pol, a.dueAtMs, Date.now());
      const used = sub ? sub.attempt : 0;
      const left = a.attempts ? a.attempts - used : Infinity;
      const can = !closed && left > 0;
      const polText = pol.mode === 'closed' ? 'No late work.' : pol.mode === 'penalty' ? `Late work loses ${pol.perDayPct}% a day${pol.maxDays ? `, nothing after ${pol.maxDays} days` : ''}.` : 'Late work accepted.';
      const allowText = a.submitType === 'any' ? 'text, a link or files' : a.submitType === 'file' ? 'a file (PDF, Word or image, up to 25 MB)' : a.submitType;
      body.innerHTML = `<div class="ud-pad"><button class="ud-linkbtn ud-back" data-back>← All assignments</button>
        <h3 class="ud-h">${h(a.title)}</h3>
        <p class="muted">Due ${h(when(a.dueAtMs))} · ${a.points} points · ${h(polText)}${a.attempts ? ` · ${a.attempts} submission${a.attempts === 1 ? '' : 's'} allowed` : ''}</p>
        ${a.instructions ? `<div class="ud-instr">${h(a.instructions).replace(/\n/g, '<br>')}</div>` : ''}
        ${a.rubric && a.rubric.length ? `<table class="ud-tbl"><thead><tr><th>Rubric</th><th>Points</th>${g ? '<th>You</th>' : ''}</tr></thead><tbody>${a.rubric.map((r) => `<tr><td>${h(r.criterion)}</td><td>${r.points}</td>${g ? `<td>${g.rubricScores[r.id] ?? ''}</td>` : ''}</tr>`).join('')}</tbody></table>` : ''}
        ${g ? `<div class="ud-card ud-grade"><p class="ud-k">Grade: ${g.finalScore} / ${a.points}</p>${g.latePenaltyPct ? `<p class="muted">${g.score} before a ${g.latePenaltyPct}% late penalty.</p>` : ''}${g.feedback ? `<p>${h(g.feedback).replace(/\n/g, '<br>')}</p>` : ''}${g.needsRegrade ? '<p class="muted">You resubmitted after this grade; your instructor will look again.</p>' : ''}</div>` : ''}
        ${sub ? `<div class="ud-card"><p class="ud-k">Your submission${sub.attempt > 1 ? ` (attempt ${sub.attempt})` : ''}</p><p class="muted">${h(when(sub.submittedAtMs))}${sub.late ? ` · ${sub.lateDays} day${sub.lateDays === 1 ? '' : 's'} late` : ' · on time'}</p>
          ${sub.text ? `<div class="ud-instr">${h(sub.text).replace(/\n/g, '<br>')}</div>` : ''}${sub.link ? `<p><a href="${h(sub.link)}" target="_blank" rel="noopener">${h(sub.link)}</a></p>` : ''}
          ${(sub.files || []).map((f) => `<p>📎 ${h(f.name)} <span class="muted">${kb(f.size || 0)}</span></p>`).join('')}</div>` : ''}
        ${can ? form(a, sub, late) : `<p class="muted">${closed ? 'The due date has passed; this assignment does not take late work.' : 'You have used every submission this assignment allows.'}</p>`}</div>`;
      body.querySelector('[data-back]').onclick = () => { openId = null; draw(); };
      if (can) wireForm(a, cid);
    }
    function form(a, sub, late) {
      const t = a.submitType;
      return `<form class="ud-card" data-sub><p class="ud-k">${sub ? 'Resubmit' : 'Submit your work'}</p>${late ? '<p class="ud-warn">This will be late.</p>' : ''}
        ${t === 'text' || t === 'any' ? '<label class="ud-lbl">Written answer<textarea name="text" rows="6" maxlength="50000"></textarea></label>' : ''}
        ${t === 'link' || t === 'any' ? '<label class="ud-lbl">Link (Google Docs, a website…)<input type="url" name="link" placeholder="https://"></label>' : ''}
        ${t === 'file' || t === 'any' ? '<label class="ud-lbl">Files (PDF, Word or images, up to 25 MB each, 5 at most)<input type="file" name="files" multiple accept=".pdf,.docx,image/png,image/jpeg,image/gif,image/webp"></label><div class="ud-prog muted" data-prog></div>' : ''}
        <div class="row"><button class="btn primary" data-go>Submit</button></div></form>`;
    }
    function wireForm(a, cid) {
      const f = body.querySelector('[data-sub]');
      f.onsubmit = async (e) => {
        e.preventDefault();
        const go = f.querySelector('[data-go]'); go.disabled = true;
        try {
          const picked = f.files ? [...f.files.files] : [];
          if (picked.length > 5) throw new Error('Up to 5 files per submission.');
          for (const x of picked) { if (x.size > MAX_FILE) throw new Error(`${x.name} is over 25 MB.`); if (!TYPES.test(x.type)) throw new Error(`${x.name}: files can be PDF, Word (.docx) or images.`); }
          const prog = f.querySelector('[data-prog]'), files = [];
          for (const x of picked) files.push(await C.uploadFile(cid, a.id, x, (p) => { if (prog) prog.textContent = `Uploading ${x.name}… ${p}%`; }));
          const r = await C.submit(cid, a.id, { text: f.text ? f.text.value : '', link: f.link ? f.link.value.trim() : '', files });
          say(r.late ? `Submitted (${r.lateDays} day${r.lateDays === 1 ? '' : 's'} late).` : 'Submitted.');
          draw();
        } catch (er) { say(C.errText(er)); go.disabled = false; }
      };
    }
    draw();
    return live(body, draw);
  }

  /* ---------------- Grades ---------------- */
  function renderGrades(body) {
    let seq = 0;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await currentOf(list);
      if (!cid) { body.innerHTML = '<p class="ud-pad muted">Join a course in the Courses widget first.</p>'; return; }
      let course, as, grades;
      try { [course, as, grades] = await Promise.all([C.course(cid), C.assignments(cid), C.myGrades(cid)]); }
      catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const gl = Object.values(grades);
      const tot = M.courseTotal(course.weights, as, gl);
      const cats = Object.entries(course.weights || { assignments: 100 });
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        <div class="ud-card ud-total"><span class="muted">Course total so far</span><b>${tot.percent === null ? '—' : tot.percent + '%'}</b>
          <span class="muted">${cats.map(([k, w]) => { const c = tot.byCategory[k]; return `${h(k[0].toUpperCase() + k.slice(1))} (${w}% of the grade): ${c ? c.percent + '%' : 'nothing yet'}`; }).join(' · ')}</span></div>
        <table class="ud-tbl"><thead><tr><th>Assignment</th><th>Score</th><th></th></tr></thead><tbody>
        ${as.map((a) => { const g = grades[a.id]; return `<tr><td>${h(a.title)}<br><span class="muted">${h(a.category)}</span></td><td>${g ? `<b>${g.finalScore}</b> / ${a.points}` : `<span class="muted">– / ${a.points}</span>`}</td><td class="muted">${g && g.latePenaltyPct ? `−${g.latePenaltyPct}% late` : ''}</td></tr>`; }).join('')}
        </tbody></table><p class="muted">Only grades your instructor has released are shown and counted. The total rescales the weights of the categories graded so far.</p></div>`;
      const s = body.querySelector('[data-course]'); if (s) s.onchange = () => C.setCurrentCourse(s.value);
    }
    draw();
    return live(body, draw);
  }

  const P = { book: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v13"/>',
    task: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12l2 2 4-4"/>',
    grade: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/><path d="M14 5l2 2 4-4"/>' };
  window.UNI_WIDGETS = [
    { id: 'courses', title: '🏛️ Courses', iconPath: P.book, w: 340, h: 520, render: renderCourses, cat: 'cloud' },
    { id: 'uassign', title: '🗂️ Assignments', iconPath: P.task, w: 400, h: 560, render: renderAssign, cat: 'cloud' },
    { id: 'grades', title: '🎯 Grades', iconPath: P.grade, w: 380, h: 520, render: renderGrades, cat: 'cloud' },
  ];
})();

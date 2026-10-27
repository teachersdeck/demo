'use strict';
/* UniStudentDeck — UniDeck course widgets: Courses, Assignments and Grades (phase 1, UniDeck v0.3.0), Modules and Announcements (phase 2, v0.4.0), Discussions, Calendar and Office hours (phase 2, v0.5.0).
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
  // Plain text from a lecturer (page bodies, announcements): escaped, line breaks kept, http(s) links made clickable.
  const rich = (s) => h(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  const ago = (ms) => { const d = Math.round((Date.now() - ms) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
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

  /* A course where you are a TA (phase 3): your own Assignments, Grades and office-hour bookings don't apply there.
     Shows the picker, a pointer to the TA desk, and returns true so the widget stops. */
  function staffStop(body, list, cid, what) {
    const mine = list.find((c) => c.courseId === cid);
    if (!mine || mine.role === 'student') return false;
    body.innerHTML = `<div class="ud-pad">${picker(list, cid)}<div class="ud-card"><p class="ud-k">You’re a ${mine.role === 'ta' ? 'TA' : h(mine.role)} in ${h(mine.title)}</p>
      <p class="muted">${h(what)}</p><div class="row"><button class="btn primary" data-tadesk>Open the TA desk →</button></div></div></div>`;
    const sel = body.querySelector('[data-course]'); if (sel) sel.onchange = () => C.setCurrentCourse(sel.value);
    body.querySelector('[data-tadesk]').onclick = () => (typeof openWidget === 'function' ? openWidget('tadesk') : null);
    return true;
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
          ${c.role === 'student' || c.role === 'ta' ? `<button class="ud-x" title="Leave course" aria-label="Leave ${h(c.title)}" data-leave="${h(c.courseId)}">×</button>` : ''}</li>`).join('')}</ul>
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
      if (cur) home(body.querySelector('[data-home]'), cur, my, list);
    }
    async function home(el, cid, my, list) {
      const mine = (list || []).find((c) => c.courseId === cid);
      if (mine && mine.role === 'ta') {
        el.innerHTML = `<div class="ud-card"><p class="ud-k">${h(mine.title)} · TA</p><p class="muted">Your instructor made you a TA here: you grade, run discussions and office hours, and post announcements from the TA desk.</p>
          <div class="row"><button class="btn primary" data-w="tadesk">TA desk →</button><button class="btn" data-w="modules">Modules →</button><button class="btn" data-w="discuss">Discussions →</button></div></div>`;
        el.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => (typeof openWidget === 'function' ? openWidget(b.dataset.w) : null); });
        return;
      }
      try {
        const [course, as, subs, anns, reads, mods] = await Promise.all([C.course(cid), C.assignments(cid), C.mySubmissions(cid), C.announcements(cid), C.myReads(cid), C.modules(cid)]);
        if (my !== seq || !course) return;
        const unread = anns.filter((x) => !reads[x.id]).length, latest = anns[0];
        const open = mods.filter((m) => !m.releaseAtMs || m.releaseAtMs <= Date.now()), week = open[open.length - 1];
        const next = as.filter((a) => a.dueAtMs && a.dueAtMs > Date.now() && !subs[a.id])[0];
        const todo = as.filter((a) => !subs[a.id]).length;
        el.innerHTML = `<div class="ud-card"><p class="ud-k">${h(course.title)}</p><p class="muted">${h(course.ownerName || '')}${course.term ? ' · ' + h(course.term) : ''}</p>
          <div class="ud-tiles"><div><b>${as.length}</b><span>assignments</span></div><div><b>${todo}</b><span>to submit</span></div></div>
          ${next ? `<p>Next due: <b>${h(next.title)}</b><br><span class="muted">${h(when(next.dueAtMs))}</span></p>` : '<p class="muted">Nothing due right now.</p>'}
          ${week ? `<p>This week: <b>${h(week.title)}</b></p>` : ''}
          ${latest ? `<div class="ud-ann-mini"><span class="muted">${latest.pinned ? '📌 ' : ''}Latest announcement${unread ? ` · <b>${unread} unread</b>` : ''}</span><br><b>${h(latest.title)}</b></div>` : ''}
          <div class="row"><button class="btn" data-w="modules">Modules →</button><button class="btn" data-w="announce">Announcements →</button><button class="btn" data-w="uassign">Assignments →</button><button class="btn" data-w="grades">Grades →</button></div></div>`;
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
      if (staffStop(body, list, cid, 'Students’ work to grade is in the TA desk’s Grader.')) return;
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
      if (staffStop(body, list, cid, 'Grades for the course are in the TA desk’s Gradebook.')) return;
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

  /* ---------------- Modules (UniDeck phase 2) ---------------- */
  function renderModules(body) {
    let seq = 0, openMod = null;
    const KIND_ICON = { page: '📄', link: '🔗', reading: '📚', assignment: '🗂️' };
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await currentOf(list);
      if (!cid) { body.innerHTML = '<p class="ud-pad muted">Join a course in the Courses widget first.</p>'; return; }
      let mods, done, as;
      try { [mods, done, as] = await Promise.all([C.modules(cid), C.myProgress(cid), C.assignments(cid)]); }
      catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const now = Date.now(), isOpen = (m) => !m.releaseAtMs || m.releaseAtMs <= now;
      const opened = mods.filter(isOpen);
      if (!openMod || !mods.some((m) => m.id === openMod)) openMod = (opened[opened.length - 1] || mods[0] || {}).id || null;
      const total = opened.reduce((n, m) => n + m.items.length, 0), ticked = opened.reduce((n, m) => n + m.items.filter((i) => done[i.id]).length, 0);
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        ${mods.length ? `<p class="muted">${ticked} of ${total} items done in the modules open so far.</p>` : '<p class="muted">Your instructor hasn’t posted any modules yet.</p>'}
        <div class="ud-mods">${mods.map((m) => { const op = isOpen(m), n = m.items.filter((i) => done[i.id]).length;
          return `<div class="ud-mod ${op ? '' : 'locked'} ${m.id === openMod ? 'on' : ''}"><button class="ud-linkbtn ud-modhead" data-m="${h(m.id)}"><b>${h(m.title)}</b>
            <span class="muted">${op ? `${n}/${m.items.length} done` : `🔒 Opens ${h(when(m.releaseAtMs))}`}</span></button>
            ${m.id === openMod ? `<div data-items="${h(m.id)}">${op ? '<p class="muted">Loading…</p>' : `<ul class="ud-items">${m.items.map((i) => `<li class="muted">${KIND_ICON[i.kind] || '•'} ${h(i.title || (as.find((a) => a.id === i.refId) || {}).title || '')}</li>`).join('')}</ul><p class="muted">The content opens on the release date.</p>`}</div>` : ''}</div>`; }).join('')}</div></div>`;
      const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { openMod = null; C.setCurrentCourse(s.value); };
      body.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { openMod = openMod === b.dataset.m ? '' : b.dataset.m; draw(); }; });
      const m = mods.find((x) => x.id === openMod);
      if (m && isOpen(m)) items(body.querySelector(`[data-items="${CSS.escape(m.id)}"]`), cid, m, done, as, my);
    }
    async function items(el, cid, m, done, as, my) {
      let content = null;
      try { content = await C.moduleContent(cid, m.id); } catch (e) { content = null; }
      if (my !== seq || !el) return;
      const c = (content && content.items) || {};
      el.innerHTML = `<ul class="ud-items">${m.items.map((i) => { const x = c[i.id] || {}, a = i.kind === 'assignment' ? as.find((y) => y.id === i.refId) : null;
        const title = h(i.title || (a && a.title) || '');
        return `<li><label class="ud-tick"><input type="checkbox" data-done="${h(i.id)}" ${done[i.id] ? 'checked' : ''} aria-label="Done: ${title}"></label>
          <div class="ud-item"><span>${KIND_ICON[i.kind] || '•'} ${x.url && i.kind !== 'page' ? `<a href="${h(x.url)}" target="_blank" rel="noopener">${title}</a>` : `<b>${title}</b>`}</span>
          ${a ? `<span class="muted">Due ${h(when(a.dueAtMs))} · ${a.points} pts · <a href="#" data-asg="${h(a.id)}">open in Assignments</a></span>` : ''}
          ${i.kind === 'page' && x.body ? `<details class="ud-page"><summary>Read</summary><div class="ud-instr">${rich(x.body)}</div></details>` : ''}
          ${i.kind === 'reading' && !x.url ? '<span class="muted">Reading (no link)</span>' : ''}</div></li>`; }).join('')}</ul>`;
      el.querySelectorAll('[data-done]').forEach((cb) => { cb.onchange = async () => { try { await C.markItemDone(cid, m.id, cb.dataset.done, cb.checked); } catch (e) { cb.checked = !cb.checked; say(C.errText(e)); } }; });
      el.querySelectorAll('[data-asg]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); if (typeof openWidget === 'function') openWidget('uassign'); }; });
    }
    draw();
    return live(body, draw);
  }

  /* ---------------- Announcements (UniDeck phase 2) ---------------- */
  function renderAnnouncements(body) {
    let seq = 0;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await currentOf(list);
      if (!cid) { body.innerHTML = '<p class="ud-pad muted">Join a course in the Courses widget first.</p>'; return; }
      let anns, reads;
      try { [anns, reads] = await Promise.all([C.announcements(cid), C.myReads(cid)]); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const unread = anns.filter((a) => !reads[a.id]).map((a) => a.id);
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        ${anns.length ? '' : '<p class="muted">No announcements in this course yet.</p>'}
        ${anns.map((a) => `<article class="ud-card ud-ann ${reads[a.id] ? '' : 'unread'}"><p class="ud-k">${a.pinned ? '📌 ' : ''}${h(a.title)}${reads[a.id] ? '' : ' <span class="ud-tag l">new</span>'}</p>
          <p class="muted">${h(a.authorName || '')} · ${h(ago(a.createdAtMs))}${a.editedAtMs ? ' · edited' : ''}</p><div>${rich(a.body)}</div></article>`).join('')}</div>`;
      const s = body.querySelector('[data-course]'); if (s) s.onchange = () => C.setCurrentCourse(s.value);
      if (unread.length) C.markRead(cid, unread).catch(() => {});   // seen once the list is on screen; the "new" tags stay until the next visit
    }
    draw();
    return live(body, draw);
  }

  /* ---------------- Discussions (UniDeck phase 2) ---------------- */
  function renderDiscussions(body) {
    let seq = 0, openT = null, editing = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await currentOf(list);
      if (!cid) { body.innerHTML = '<p class="ud-pad muted">Join a course in the Courses widget first.</p>'; return; }
      let ths;
      try { ths = await C.threads(cid); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const th = openT && ths.find((x) => x.id === openT);
      if (th) return thread(cid, th, my);
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        ${ths.length ? '' : '<p class="muted">No discussions in this course yet.</p>'}
        <ul class="ud-list ud-threads">${ths.map((x) => `<li><button class="ud-linkbtn" data-t="${h(x.id)}"><b>${x.pinned ? '📌 ' : ''}${h(x.title)}</b>
          <span class="muted">${x.postCount || 0} repl${x.postCount === 1 ? 'y' : 'ies'} · ${h(ago(x.lastPostAtMs || x.createdAtMs))}${x.postFirst ? ' · post first' : ''}${x.locked ? ' · closed' : ''}</span></button></li>`).join('')}</ul></div>`;
      const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { openT = null; C.setCurrentCourse(s.value); };
      body.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { openT = b.dataset.t; editing = null; draw(); }; });
    }
    async function thread(cid, th, my) {
      let res;
      try { res = await C.posts(cid, th.id); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const me = (C.state().user || {}).uid;
      body.innerHTML = `<div class="ud-pad"><button class="ud-linkbtn ud-back" data-back>← All discussions</button>
        <h3 class="ud-h">${th.pinned ? '📌 ' : ''}${h(th.title)}</h3><p class="muted">${h(th.authorName || '')} · ${h(ago(th.createdAtMs))}${th.locked ? ' · closed to new replies' : ''}</p>
        <div class="ud-instr">${rich(th.body)}</div>
        ${res.locked ? '<p class="ud-card muted">🔒 Post your own reply first; then you will see what your classmates wrote.</p>' : res.posts.map((p) => `<div class="ud-post ${p.role !== 'student' ? 'staff' : ''}">
          <p class="muted"><b>${h(p.name)}</b>${p.role !== 'student' ? ` <span class="ud-tag">${h(p.role === 'ta' ? 'TA' : 'Instructor')}</span>` : ''} · ${h(ago(p.createdAtMs))}${p.editedAtMs && !p.removed ? ' · edited' : ''}</p>
          ${p.removed ? '<p class="muted"><i>Reply removed.</i></p>' : editing === p.id ? `<form data-edit="${h(p.id)}"><textarea name="body" rows="3" maxlength="5000">${h(p.body)}</textarea><div class="row"><button class="btn primary">Save</button><button type="button" class="btn" data-cancel>Cancel</button></div></form>` : `<div>${rich(p.body)}</div>`}
          ${p.uid === me && !p.removed && editing !== p.id && !th.locked ? `<div class="row"><a href="#" data-ed="${h(p.id)}">Edit</a><a href="#" data-rm="${h(p.id)}">Remove</a></div>` : ''}</div>`).join('') || '<p class="muted">No replies yet. Be the first.</p>'}
        ${th.locked ? '' : `<form class="ud-card" data-reply><label class="ud-lbl">Your reply<textarea name="body" rows="4" maxlength="5000" required></textarea></label><div class="row"><button class="btn primary">Post reply</button></div></form>`}</div>`;
      body.querySelector('[data-back]').onclick = () => { openT = null; draw(); };
      const f = body.querySelector('[data-reply]');
      if (f) f.onsubmit = async (e) => { e.preventDefault(); try { await C.postReply(cid, th.id, f.body.value.trim()); say('Reply posted.'); draw(); } catch (er) { say(C.errText(er)); } };
      body.querySelectorAll('[data-ed]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); editing = a.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-rm]').forEach((a) => { a.onclick = async (e) => { e.preventDefault(); if (!confirm('Remove this reply?')) return; try { await C.removePost(cid, th.id, a.dataset.rm); draw(); } catch (er) { say(C.errText(er)); } }; });
      body.querySelectorAll('[data-edit]').forEach((fm) => {
        fm.onsubmit = async (e) => { e.preventDefault(); try { await C.editPost(cid, th.id, fm.dataset.edit, fm.body.value.trim()); editing = null; draw(); } catch (er) { say(C.errText(er)); } };
        fm.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      });
    }
    draw();
    return live(body, draw);
  }

  /* ---------------- Calendar (UniDeck phase 2): every course, week or month, .ics export ---------------- */
  const DAY = 864e5;
  const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const weekStart = (ms) => { const d = new Date(dayStart(ms)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const hm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  /** Everything with a date in the student's courses: [{ start, end, title, kind, course, location, link, weekly? }] (weekly events once, with weeklyUntil). */
  async function gather(list) {
    const out = [];
    await Promise.all(list.map(async (c) => {
      const [as, subs, mods, evs, mine, slots] = await Promise.all([C.assignments(c.courseId), C.mySubmissions(c.courseId), C.modules(c.courseId), C.events(c.courseId), C.myBookings(c.courseId), C.slots(c.courseId)].map((p) => p.catch(() => [])));
      as.filter((a) => a.dueAtMs).forEach((a) => out.push({ id: 'a-' + a.id, start: a.dueAtMs, end: a.dueAtMs, title: `Due: ${a.title}`, kind: 'due', done: !!(subs && subs[a.id]), course: c.title }));
      mods.filter((m) => m.releaseAtMs).forEach((m) => out.push({ id: 'm-' + m.id, start: m.releaseAtMs, end: m.releaseAtMs, title: `Opens: ${m.title}`, kind: 'module', course: c.title }));
      evs.forEach((e) => out.push({ id: 'e-' + e.id, start: e.startAtMs, end: e.endAtMs, title: e.title, kind: e.kind, course: c.title, location: e.location, link: e.link, weeklyUntil: e.weeklyUntilMs || null }));
      (mine || []).forEach((b) => { const s = (slots || []).find((x) => x.id === b.slotId) || {}; out.push({ id: 'o-' + b.slotId, start: b.startAtMs, end: b.endAtMs, title: 'Office hours (booked)', kind: 'office', course: c.title, location: s.location, link: s.link }); });
    }));
    return out;
  }
  /** Items that fall in [from, to), weekly ones expanded. */
  function inRange(items, from, to) {
    const out = [];
    items.forEach((x) => {
      if (!x.weeklyUntil) { if (x.start >= from && x.start < to) out.push(x); return; }
      for (let s = x.start, k = 0; s <= x.weeklyUntil && s < to && k < 400; s += 7 * DAY, k++) if (s >= from) out.push({ ...x, start: s, end: s + (x.end - x.start) });
    });
    return out.sort((a, b) => a.start - b.start);
  }
  /** RFC 5545 calendar text: deadlines, module releases, events (weekly ones as RRULE) and booked office hours. */
  function ics(items) {
    const z = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const enc = new TextEncoder();
    const fold = (l) => {   // lines of at most 75 octets (RFC 5545 3.1), never splitting a character
      const out = []; let cur = '', n = 0;
      for (const ch of l) { const b = enc.encode(ch).length; if (n + b > 75) { out.push(cur); cur = ' '; n = 1; } cur += ch; n += b; }
      out.push(cur); return out.join('\r\n');
    };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniDeck//UniStudentDeck//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:UniStudentDeck'];
    const stamp = z(Date.now());
    items.forEach((x) => {
      lines.push('BEGIN:VEVENT', `UID:${x.id}@unideck`, `DTSTAMP:${stamp}`, `DTSTART:${z(x.start)}`, `DTEND:${z(Math.max(x.end || x.start, x.start + (x.kind === 'due' || x.kind === 'module' ? 15 * 6e4 : 0)))}`,
        fold(`SUMMARY:${esc(`${x.title} · ${x.course}`)}`));
      if (x.location) lines.push(fold(`LOCATION:${esc(x.location)}`));
      if (x.link) lines.push(fold(`URL:${x.link}`));
      if (x.weeklyUntil) lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${z(x.weeklyUntil)}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  function renderCalendar(body) {
    let seq = 0, view = 'week', anchor = Date.now();
    const ICON = { due: '🗂️', module: '🧭', class: '🏛️', exam: '📝', other: '📌', office: '🙋' };
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list, items;
      try { list = await C.myCourses(); items = await gather(list); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const from = view === 'week' ? weekStart(anchor) : weekStart(new Date(new Date(anchor).getFullYear(), new Date(anchor).getMonth(), 1).getTime());
      const days = view === 'week' ? 7 : 42, to = from + days * DAY + 3 * 36e5;   // + a margin for clock changes
      const shown = inRange(items, from, to);
      const byDay = (d) => shown.filter((x) => x.start >= d && x.start < d + DAY);
      const label = view === 'week' ? `${new Date(from).toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${new Date(from + 6 * DAY).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
        : new Date(anchor).toLocaleDateString([], { month: 'long', year: 'numeric' });
      const today = dayStart(Date.now()), month = new Date(anchor).getMonth();
      const line = (x) => `<li class="ud-ev k-${h(x.kind)} ${x.done ? 'done' : ''}" title="${h(x.course)}"><span class="muted">${x.kind === 'due' || x.kind === 'module' ? hm(x.start) : `${hm(x.start)}–${hm(x.end)}`}</span> ${ICON[x.kind] || '•'} ${h(x.title)}${x.done ? ' ✓' : ''}<br><span class="muted">${h(x.course)}${x.location ? ' · ' + h(x.location) : ''}</span>${x.link ? ` <a href="${h(x.link)}" target="_blank" rel="noopener">link</a>` : ''}</li>`;
      body.innerHTML = `<div class="ud-pad"><div class="row ud-calbar"><button class="btn" data-nav="-1" aria-label="Previous">‹</button><button class="btn" data-nav="0">Today</button><button class="btn" data-nav="1" aria-label="Next">›</button>
          <b class="ud-callabel">${h(label)}</b><span class="ud-grow"></span><button class="chip ${view === 'week' ? 'on' : ''}" data-view="week">Week</button><button class="chip ${view === 'month' ? 'on' : ''}" data-view="month">Month</button><button class="btn" data-ics title="For Google Calendar, Outlook or Apple Calendar">Export .ics</button></div>
        ${list.length ? '' : '<p class="muted">Join a course to see its deadlines and classes here.</p>'}
        ${view === 'week' ? `<div class="ud-week">${Array.from({ length: 7 }, (_, i) => { const d = from + i * DAY, xs = byDay(d);
            return `<section class="ud-day ${d === today ? 'today' : ''}"><p class="ud-k">${new Date(d).toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</p>${xs.length ? `<ul>${xs.map(line).join('')}</ul>` : '<p class="muted">—</p>'}</section>`; }).join('')}</div>`
          : `<div class="ud-month">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => `<b class="muted">${w}</b>`).join('')}${Array.from({ length: 42 }, (_, i) => { const d = from + i * DAY, xs = byDay(d), dt = new Date(d);
            return `<button class="ud-cell ${d === today ? 'today' : ''} ${dt.getMonth() !== month ? 'out' : ''}" data-day="${d}"><span>${dt.getDate()}</span>${xs.slice(0, 3).map((x) => `<i class="k-${h(x.kind)}" title="${h(x.title)}">${ICON[x.kind] || '•'} ${h(x.title.replace(/^(Due|Opens): /, ''))}</i>`).join('')}${xs.length > 3 ? `<i class="muted">+${xs.length - 3} more</i>` : ''}</button>`; }).join('')}</div>`}
        <p class="muted ud-foot">🗂️ due · 🧭 module opens · 🏛️ class · 📝 exam · 🙋 your office hours. Export adds them to Google Calendar, Outlook or Apple Calendar (a copy: re-export after changes).</p></div>`;
      body.querySelectorAll('[data-nav]').forEach((b) => { b.onclick = () => { const n = Number(b.dataset.nav); if (!n) anchor = Date.now(); else if (view === 'week') anchor += n * 7 * DAY; else { const d = new Date(anchor); d.setDate(1); d.setMonth(d.getMonth() + n); anchor = d.getTime(); } draw(); }; });
      body.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { view = b.dataset.view; draw(); }; });
      body.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => { anchor = Number(b.dataset.day); view = 'week'; draw(); }; });
      body.querySelector('[data-ics]').onclick = () => {
        const keep = items.filter((x) => x.weeklyUntil ? x.weeklyUntil >= Date.now() - 30 * DAY : x.start >= Date.now() - 30 * DAY);
        const url = URL.createObjectURL(new Blob([ics(keep)], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = 'unistudentdeck-calendar.ics'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        say(`Exported ${keep.length} item${keep.length === 1 ? '' : 's'}. Open the file to add them to your calendar.`);
      };
    }
    draw();
    return live(body, draw);
  }

  /* ---------------- Office hours (UniDeck phase 2) ---------------- */
  function renderOfficeHours(body) {
    let seq = 0, booking = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await currentOf(list);
      if (!cid) { body.innerHTML = '<p class="ud-pad muted">Join a course in the Courses widget first.</p>'; return; }
      if (staffStop(body, list, cid, 'You run office hours from the TA desk; booking is for students.')) return;
      let slots, mine;
      try { [slots, mine] = await Promise.all([C.slots(cid), C.myBookings(cid)]); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const now = Date.now(), mineIds = new Set(mine.map((b) => b.slotId)), up = slots.filter((s) => s.endAtMs > now);
      const days = [...new Set(up.map((s) => dayStart(s.startAtMs)))];
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        ${mine.filter((b) => b.endAtMs > now).map((b) => { const s = slots.find((x) => x.id === b.slotId) || {}; return `<div class="ud-card ud-grade"><p class="ud-k">Your booking: ${h(when(b.startAtMs))}</p>
          <p class="muted">${h(s.location || '')}${b.note ? ' · ' + h(b.note) : ''}</p>${s.link ? `<p><a href="${h(s.link)}" target="_blank" rel="noopener">Join online</a></p>` : ''}<div class="row"><button class="btn" data-cancel="${h(b.slotId)}">Cancel booking</button></div></div>`; }).join('')}
        ${up.length ? days.map((d) => `<p class="ud-k">${h(new Date(d).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }))}</p><ul class="ud-slots">${up.filter((s) => dayStart(s.startAtMs) === d).map((s) => {
            const mineS = mineIds.has(s.id);
            return `<li><span>${hm(s.startAtMs)}–${hm(s.endAtMs)} <span class="muted">${h(s.location || '')}${s.link ? ' · online' : ''}</span></span>
              ${mineS ? '<span class="ud-tag g">Yours</span>' : s.booked ? '<span class="ud-tag">Taken</span>' : booking === s.id ? `<form class="row" data-book="${h(s.id)}"><input name="note" maxlength="500" placeholder="What would you like to discuss? (optional)"><button class="btn primary">Book</button></form>` : `<button class="btn" data-pick="${h(s.id)}">Book</button>`}</li>`; }).join('')}</ul>`).join('')
          : '<p class="muted">No office hours open in this course right now.</p>'}
        <p class="muted ud-foot">Classmates see that a slot is taken, never by whom. Up to two upcoming bookings per course.</p></div>`;
      const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { booking = null; C.setCurrentCourse(s.value); };
      body.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { booking = b.dataset.pick; draw(); }; });
      body.querySelectorAll('[data-book]').forEach((f) => { f.onsubmit = async (e) => { e.preventDefault(); try { await C.bookSlot(cid, f.dataset.book, f.note.value.trim()); booking = null; say('Booked. It is in your Calendar too.'); draw(); } catch (er) { say(C.errText(er)); } }; });
      body.querySelectorAll('[data-cancel]').forEach((b) => { b.onclick = async () => { if (!confirm('Cancel this booking?')) return; try { await C.cancelBooking(cid, b.dataset.cancel); draw(); } catch (er) { say(C.errText(er)); } }; });
    }
    draw();
    return live(body, draw);
  }


  /* ---------------- TA desk (phase 3) ----------------
     For a student the instructor made a TA. The screens are LectureDeck's Course mode (js/course-mode.js, the same file),
     opened here under UniStudentDeck's sign-in; they list only the courses where you are course staff. */
  const TA_TABS = [['grader', '✅ Grader'], ['gradebook', '📒 Gradebook'], ['discussions', '💬 Discussions'], ['announcements', '📣 Announcements'], ['office', '🙋 Office hours']];
  function renderTaDesk(body) {
    let seq = 0, tab = 'grader', stop = null;
    try { tab = localStorage.getItem('ud_tadesk_tab') || 'grader'; } catch (e) {}
    const end = () => { if (stop) { try { stop(); } catch (e) {} stop = null; } };
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) { end(); return; }
      let list;
      try { list = (await C.myCourses()).filter((c) => c.role === 'ta' || c.role === 'instructor'); } catch (e) { end(); body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (!list.length) { end(); body.innerHTML = '<div class="ud-empty"><p><b>No TA courses yet</b></p><p class="muted">When an instructor makes you a TA in one of your courses, grading, discussions and office hours for it appear here.</p></div>'; return; }
      if (!window.CourseMode) { end(); body.innerHTML = '<p class="ud-pad muted">The TA desk didn’t load. Reload the page.</p>'; return; }
      if (body.querySelector('.ta-desk')) return;   // already showing; the course-mode screen redraws itself
      end();
      body.innerHTML = `<div class="ta-desk"><div class="ta-tabs" role="tablist">${TA_TABS.map(([id, label]) => `<button class="chip ${id === tab ? 'on' : ''}" role="tab" aria-selected="${id === tab}" data-tab="${id}">${label}</button>`).join('')}</div><div class="ta-body"></div></div>`;
      body.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; try { localStorage.setItem('ud_tadesk_tab', tab); } catch (e) {} end(); body.innerHTML = ''; draw(); }; });
      const pane = body.querySelector('.ta-body');
      stop = (window.CourseMode[tab] || window.CourseMode.grader)(pane) || null;
    }
    draw();
    const off = C.onChange((st) => { if (!st.user || st.role !== 'unistudent') { end(); body.innerHTML = ''; draw(); } });
    return () => { end(); off(); };
  }

  const P = { book: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v13"/>',
    task: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12l2 2 4-4"/>',
    grade: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/><path d="M14 5l2 2 4-4"/>',
    mods: '<rect x="4" y="4" width="16" height="5" rx="1.5"/><rect x="4" y="11" width="16" height="4" rx="1.5"/><rect x="4" y="17" width="16" height="4" rx="1.5"/>',
    ann: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10"/>',
    chat: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    office: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    ta: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>' };
  window.UNI_WIDGETS = [
    { id: 'courses', title: '🏛️ Courses', iconPath: P.book, w: 340, h: 520, render: renderCourses, cat: 'cloud' },
    { id: 'uassign', title: '🗂️ Assignments', iconPath: P.task, w: 400, h: 560, render: renderAssign, cat: 'cloud' },
    { id: 'grades', title: '🎯 Grades', iconPath: P.grade, w: 380, h: 520, render: renderGrades, cat: 'cloud' },
    { id: 'modules', title: '🧭 Modules', iconPath: P.mods, w: 420, h: 580, render: renderModules, cat: 'cloud' },
    { id: 'announce', title: '📣 Announcements', iconPath: P.ann, w: 380, h: 520, render: renderAnnouncements, cat: 'cloud' },
    { id: 'discuss', title: '💬 Discussions', iconPath: P.chat, w: 420, h: 580, render: renderDiscussions, cat: 'cloud' },
    { id: 'ucal', title: '📅 Calendar', iconPath: P.cal, w: 760, h: 580, render: renderCalendar, cat: 'cloud' },
    { id: 'office', title: '🙋 Office hours', iconPath: P.office, w: 400, h: 540, render: renderOfficeHours, cat: 'cloud' },
    { id: 'tadesk', title: '🧑‍🏫 TA desk', iconPath: P.ta, w: 840, h: 640, render: renderTaDesk, cat: 'cloud' },
  ];
})();

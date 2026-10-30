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
  // English or Vietnamese: <html lang> is the source (js/lang.js, Settings → Language), the same as js/bento.js.
  const VI = () => /^vi/i.test(document.documentElement.lang || '');
  const T = (en, vi) => (VI() ? vi : en);
  const LOC = () => (VI() ? 'vi-VN' : []);
  const CAT = (k) => ({ assignments: T('Assignments', 'Bài tập'), quizzes: T('Quizzes', 'Bài kiểm tra'), exams: T('Exams', 'Thi'), participation: T('Participation', 'Chuyên cần') }[k] || k);
  const plural = (n, en, ens, vi) => `${n} ${VI() ? vi : n === 1 ? en : ens}`;   // 3 assignments / 3 bài tập
  const when = (ms) => (ms ? new Date(ms).toLocaleString(LOC(), { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : T('No due date', 'Không có hạn nộp'));
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  // Plain text from a lecturer (page bodies, announcements): escaped, line breaks kept, http(s) links made clickable.
  const rich = (s) => h(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  const ago = (ms) => { const d = Math.round((Date.now() - ms) / 864e5); return d <= 0 ? T('today', 'hôm nay') : d === 1 ? T('yesterday', 'hôm qua') : T(`${d} days ago`, `${d} ngày trước`); };
  const MAX_FILE = 25 * 1048576, TYPES = /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/(png|jpeg|gif|webp))$/;

  /* Sign-in gate shared by all three widgets: Google, then a date of birth once. Returns true when ready. */
  /* Phase 5: the graduate tools switch (js/grad.js). They work without an account, so it shows signed out too. */
  const gradLink = () => (window.UDGrad ? `${T('Graduate tools', 'Công cụ sau đại học')}: <a href="#" data-grad>${window.UDGrad.on ? T('on', 'bật') : T('off', 'tắt')}</a>` : '');
  function wireGrad(body) {
    const gr = body.querySelector('[data-grad]');
    if (gr) gr.onclick = (e) => { e.preventDefault(); if (confirm(window.UDGrad.on ? T('Turn off graduate tools? Their widgets leave the dock; what you wrote stays on this device. The page reloads.', 'Tắt công cụ sau đại học? Các tiện ích này sẽ rời khỏi thanh dock; nội dung bạn đã viết vẫn ở trên thiết bị này. Trang sẽ tải lại.') : T('Turn on graduate tools: Thesis tracker, Citations, Lab log and Supervisor notes? The page reloads.', 'Bật công cụ sau đại học: Tiến độ luận văn, Trích dẫn, Nhật ký nghiên cứu và Ghi chú với người hướng dẫn? Trang sẽ tải lại.'))) window.UDGrad.set(!window.UDGrad.on); };
  }
  function gate(body, redraw) {
    const s = C.state();
    if (!C.available()) {
      body.innerHTML = `<div class="ud-empty"><p>${T('Course sync isn’t set up in this build.', 'Bản này chưa bật đồng bộ khóa học.')}</p><p class="muted">${T('Ask your instructor or school for UniStudentDeck with courses switched on, or try the demo.', 'Hãy hỏi giảng viên hoặc trường bản UniStudentDeck có bật khóa học, hoặc dùng thử bản demo.')}</p>
        <div class="row center"><button class="btn primary" data-demo>${T('Try the demo', 'Dùng thử bản demo')}</button></div></div>`;
      body.querySelector('[data-demo]').onclick = () => (typeof SD_DEMO !== 'undefined' ? SD_DEMO.enter() : (location.search = '?demo=1'));
      return false;
    }
    if (!s.user || s.role !== 'unistudent' && !s.needsBirthDate) {
      if (s.user && s.role && s.role !== 'unistudent') {
        body.innerHTML = `<div class="ud-empty"><p>${T(`You’re signed in as <b>${h(s.user.email)}</b>, which is a ${h(s.role)} account.`, `Bạn đang đăng nhập bằng <b>${h(s.user.email)}</b>, đây là tài khoản ${h(s.role)}.`)}</p><p class="muted">${T('Use a different Google account for UniStudentDeck.', 'Hãy dùng một tài khoản Google khác cho UniStudentDeck.')}</p><div class="row center"><button class="btn" data-out>${T('Sign out', 'Đăng xuất')}</button></div></div>`;
        body.querySelector('[data-out]').onclick = () => C.signOut();
        return false;
      }
      body.innerHTML = `<div class="ud-empty"><p><b>${T('Sign in to see your courses', 'Đăng nhập để xem các khóa học')}</b></p><p class="muted">${T('Use your Google or university Google account.', 'Dùng tài khoản Google hoặc tài khoản Google của trường.')}${C.demo ? T(' (Demo: no real account is used.)', ' (Demo: không dùng tài khoản thật.)') : ''}</p>
        <div class="row center"><button class="btn primary" data-in ${s.busy ? 'disabled' : ''}>${T('Sign in with Google', 'Đăng nhập bằng Google')}</button></div>${gradLink() ? `<p class="muted ud-foot">${gradLink()}</p>` : ''}</div>`;
      wireGrad(body);
      body.querySelector('[data-in]').onclick = async () => { try { await C.signIn('student'); redraw(); } catch (e) { say(C.errText(e)); } };
      return false;
    }
    if (s.needsBirthDate) {
      body.innerHTML = `<form class="ud-card" data-dob><p><b>${T('One more step', 'Thêm một bước')}</b></p><p class="muted">${T('Your date of birth, asked once. UniDeck keeps only whether you are under 18 (some tools are for adults only), never the date itself.', 'Ngày sinh của bạn, chỉ hỏi một lần. UniDeck chỉ lưu bạn có dưới 18 tuổi hay không (một số công cụ chỉ dành cho người lớn), không bao giờ lưu ngày sinh.')}</p>
        <label class="ud-lbl">${T('Date of birth', 'Ngày sinh')} <input type="date" required max="${new Date().toISOString().slice(0, 10)}" name="dob"></label>
        <div class="row"><button class="btn primary">${T('Continue', 'Tiếp tục')}</button><button type="button" class="btn" data-out>${T('Cancel', 'Hủy')}</button></div></form>`;
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
    return `<label class="ud-pick">${T('Course', 'Khóa học')} <select data-course>${list.map((c) => `<option value="${h(c.courseId)}" ${c.courseId === current ? 'selected' : ''}>${h(c.title)}${c.section ? ' · ' + h(c.section) : ''}</option>`).join('')}</select></label>`;
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
     Shows the picker, a pointer to TAdeck, and returns true so the widget stops. */
  function staffStop(body, list, cid, what) {
    const mine = list.find((c) => c.courseId === cid);
    if (!mine || mine.role === 'student') return false;
    body.innerHTML = `<div class="ud-pad">${picker(list, cid)}<div class="ud-card"><p class="ud-k">${T(`You’re a ${mine.role === 'ta' ? 'TA' : h(mine.role)} in ${h(mine.title)}`, `Bạn là ${mine.role === 'ta' ? 'trợ giảng' : h(mine.role)} trong ${h(mine.title)}`)}</p>
      <p class="muted">${h(what)}</p><div class="row"><button class="btn primary" data-tadesk>${T('Open TAdeck →', 'Mở TAdeck →')}</button></div></div></div>`;
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
      body.innerHTML = `<p class="muted ud-pad">${T('Loading your courses…', 'Đang tải các khóa học…')}</p>`;
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const cur = await currentOf(list);
      const s = C.state();
      body.innerHTML = `<div class="ud-pad">
        <form class="row" data-join><input type="text" name="code" placeholder="${T('Course code, e.g. ABCD-2345', 'Mã khóa học, ví dụ ABCD-2345')}" maxlength="12" style="flex:1" aria-label="${T('Course code', 'Mã khóa học')}" autocomplete="off"><button class="btn primary">${T('Join', 'Tham gia')}</button></form>
        ${list.length ? '' : `<p class="muted">${T('You haven’t joined a course yet. Your instructor gives you a course code.', 'Bạn chưa tham gia khóa học nào. Giảng viên sẽ cho bạn mã khóa học.')}</p>`}
        <ul class="ud-list">${list.map((c) => `<li class="${c.courseId === cur ? 'on' : ''}"><button class="ud-linkbtn" data-open="${h(c.courseId)}"><b>${h(c.title)}</b><span class="muted">${h([c.term, c.section].filter(Boolean).join(' · '))}${c.role !== 'student' ? ' · ' + h(c.role.toUpperCase()) : ''}</span></button>
          ${c.role === 'student' || c.role === 'ta' ? `<button class="ud-x" title="${T('Leave course', 'Rời khóa học')}" aria-label="${T('Leave', 'Rời')} ${h(c.title)}" data-leave="${h(c.courseId)}">×</button>` : ''}</li>`).join('')}</ul>
        <div data-home></div>
        <p class="muted ud-foot">${T('Signed in as', 'Đã đăng nhập:')} ${h(s.user.email || s.user.name)}${s.under18 ? T(' · under-18 account (AI tools off)', ' · tài khoản dưới 18 tuổi (tắt công cụ AI)') : ''} · <a href="#" data-out>${T('Sign out', 'Đăng xuất')}</a>${gradLink() ? ' · ' + gradLink() : ''}</p></div>`;
      const f = body.querySelector('[data-join]');
      f.onsubmit = async (e) => { e.preventDefault(); const code = f.code.value.trim(); if (!code) return;
        try { const r = await C.joinCourse(code); C.setCurrentCourse(r.courseId); say(r.alreadyIn ? T(`You’re already in ${r.title}.`, `Bạn đã ở trong ${r.title}.`) : T(`Joined ${r.title}.`, `Đã tham gia ${r.title}.`)); } catch (er) { say(C.errText(er)); } };
      body.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => C.setCurrentCourse(b.dataset.open); });
      body.querySelectorAll('[data-leave]').forEach((b) => { b.onclick = async () => {
        if (!confirm(T('Leave this course? Your submitted work and grades stay with your instructor.', 'Rời khóa học này? Bài đã nộp và điểm của bạn vẫn được giảng viên lưu giữ.'))) return;
        try { await C.leaveCourse(b.dataset.leave); C.setCurrentCourse(''); } catch (er) { say(C.errText(er)); } }; });
      body.querySelector('[data-out]').onclick = (e) => { e.preventDefault(); C.signOut(); };
      wireGrad(body);
      if (cur) home(body.querySelector('[data-home]'), cur, my, list);
    }
    async function home(el, cid, my, list) {
      const mine = (list || []).find((c) => c.courseId === cid);
      if (mine && mine.role === 'ta') {
        el.innerHTML = `<div class="ud-card"><p class="ud-k">${h(mine.title)} · TA</p><p class="muted">${T('Your instructor made you a TA here: you grade, write and grade quizzes, run discussions and office hours, and post announcements from TAdeck.', 'Giảng viên đã chọn bạn làm trợ giảng ở đây: từ TAdeck, bạn chấm bài, soạn và chấm bài kiểm tra, điều phối thảo luận và giờ tiếp sinh viên, và đăng thông báo.')}</p>
          <div class="row"><button class="btn primary" data-w="tadesk">TAdeck →</button><button class="btn" data-w="modules">${T('Modules →', 'Học phần →')}</button><button class="btn" data-w="discuss">${T('Discussions →', 'Thảo luận →')}</button></div></div>`;
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
          <div class="ud-tiles"><div><b>${as.length}</b><span>${T('assignments', 'bài tập')}</span></div><div><b>${todo}</b><span>${T('to submit', 'cần nộp')}</span></div></div>
          ${next ? `<p>${T('Next due:', 'Hạn gần nhất:')} <b>${h(next.title)}</b><br><span class="muted">${h(when(next.dueAtMs))}</span></p>` : `<p class="muted">${T('Nothing due right now.', 'Hiện chưa có gì đến hạn.')}</p>`}
          ${week ? `<p>${T('This week:', 'Tuần này:')} <b>${h(week.title)}</b></p>` : ''}
          ${latest ? `<div class="ud-ann-mini"><span class="muted">${latest.pinned ? '📌 ' : ''}${T('Latest announcement', 'Thông báo mới nhất')}${unread ? ` · <b>${T(`${unread} unread`, `${unread} chưa đọc`)}</b>` : ''}</span><br><b>${h(latest.title)}</b></div>` : ''}
          <div class="row"><button class="btn" data-w="modules">${T('Modules →', 'Học phần →')}</button><button class="btn" data-w="announce">${T('Announcements →', 'Thông báo →')}</button><button class="btn" data-w="uassign">${T('Assignments →', 'Bài tập →')}</button><button class="btn" data-w="uquiz">${T('Quizzes →', 'Bài kiểm tra →')}</button><button class="btn" data-w="grades">${T('Grades →', 'Điểm →')}</button></div></div>`;
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
      if (!cid) { body.innerHTML = `<p class="ud-pad muted">${T('Join a course in the Courses widget first.', 'Hãy tham gia một khóa học trong tiện ích Khóa học trước.')}</p>`; return; }
      if (staffStop(body, list, cid, T('Students’ work to grade is in TAdeck’s Grader.', 'Bài của sinh viên cần chấm nằm trong mục Chấm bài của TAdeck.'))) return;
      body.innerHTML = `<p class="muted ud-pad">${T('Loading…', 'Đang tải…')}</p>`;
      let as, subs, grades, course;
      try { [course, as, subs, grades] = await Promise.all([C.course(cid), C.assignments(cid), C.mySubmissions(cid), C.myGrades(cid)]); }
      catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const a = openId && as.find((x) => x.id === openId);
      if (a) { const grp = a.group ? await C.myGroup(cid).catch(() => null) : null; if (my !== seq) return; return detail(a, course, subs[a.id], grades[a.id], cid, grp); }
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        <ul class="ud-list">${as.map((x) => { const st = status(x, subs[x.id], grades[x.id]);
          return `<li><button class="ud-linkbtn" data-a="${h(x.id)}"><b>${h(x.title)}</b><span class="muted">${h(when(x.dueAtMs))} · ${x.points} ${T('pts', 'điểm')}${x.group ? T(' · 👥 group', ' · 👥 nhóm') : ''}</span></button><span class="ud-tag ${st.cls}">${st.label}</span></li>`; }).join('') || `<li class="muted">${T('No assignments yet.', 'Chưa có bài tập nào.')}</li>`}</ul></div>`;
      wirePicker();
      body.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => { openId = b.dataset.a; draw(); }; });
    }
    function status(a, sub, g) {
      if (g) return { cls: 'g', label: `${g.finalScore}/${a.points}` };
      if (sub) return { cls: sub.late ? 'l' : 's', label: sub.late ? T('Submitted late', 'Nộp muộn') : T('Submitted', 'Đã nộp') };
      if (a.dueAtMs && a.dueAtMs < Date.now()) return { cls: 'm', label: T('Missing', 'Chưa nộp') };
      return { cls: '', label: T('To do', 'Cần làm') };
    }
    function wirePicker() { const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { openId = null; C.setCurrentCourse(s.value); }; }
    function detail(a, course, sub, g, cid, grp) {
      const pol = M.cleanLatePolicy(a.latePolicy || course.latePolicy);
      const late = a.dueAtMs && Date.now() > a.dueAtMs;
      const closed = !M.acceptsSubmission(pol, a.dueAtMs, Date.now());
      const used = sub ? sub.attempt : 0;
      const left = a.attempts ? a.attempts - used : Infinity;
      const can = !closed && left > 0 && (!a.group || !!grp);
      const others = grp ? grp.memberUids.filter((u) => u !== C.state().user.uid).map((u) => grp.memberNames[u] || '') : [];
      const polText = pol.mode === 'closed' ? T('No late work.', 'Không nhận bài muộn.') : pol.mode === 'penalty' ? T(`Late work loses ${pol.perDayPct}% a day${pol.maxDays ? `, nothing after ${pol.maxDays} days` : ''}.`, `Bài muộn bị trừ ${pol.perDayPct}% mỗi ngày${pol.maxDays ? `, không được điểm sau ${pol.maxDays} ngày` : ''}.`) : T('Late work accepted.', 'Nhận bài muộn.');
            body.innerHTML = `<div class="ud-pad"><button class="ud-linkbtn ud-back" data-back>${T('← All assignments', '← Tất cả bài tập')}</button>
        <h3 class="ud-h">${h(a.title)}</h3>
        <p class="muted">${T('Due', 'Hạn nộp')} ${h(when(a.dueAtMs))} · ${a.points} ${T('points', 'điểm')} · ${h(polText)}${a.attempts ? ` · ${T(`${a.attempts} submission${a.attempts === 1 ? '' : 's'} allowed`, `được nộp ${a.attempts} lần`)}` : ''}</p>
        ${a.group ? `<div class="ud-card ud-groupnote"><p class="ud-k">👥 ${T('Group assignment', 'Bài tập nhóm')}${grp ? ` · ${h(grp.name)}` : ''}</p><p class="muted">${grp ? T(`With ${h(others.join(', ') || 'nobody else yet')}. One of you submits for everyone; you all see it and get the grade.`, `Cùng ${h(others.join(', ') || 'chưa có ai khác')}. Một người nộp cho cả nhóm; mọi người đều thấy bài nộp và nhận cùng điểm.`) : T('You’re not in a group in this course yet. Your instructor puts you in one.', 'Bạn chưa thuộc nhóm nào trong khóa học này. Giảng viên sẽ xếp bạn vào nhóm.')}</p>${grp ? `<div class="row"><button class="btn" data-w="ugroup">${T('Group project →', 'Dự án nhóm →')}</button></div>` : ''}</div>` : ''}
        ${a.instructions ? `<div class="ud-instr">${h(a.instructions).replace(/\n/g, '<br>')}</div>` : ''}
        ${a.rubric && a.rubric.length ? `<table class="ud-tbl"><thead><tr><th>${T('Rubric', 'Tiêu chí')}</th><th>${T('Points', 'Điểm')}</th>${g ? `<th>${T('You', 'Bạn')}</th>` : ''}</tr></thead><tbody>${a.rubric.map((r) => `<tr><td>${h(r.criterion)}</td><td>${r.points}</td>${g ? `<td>${g.rubricScores[r.id] ?? ''}</td>` : ''}</tr>`).join('')}</tbody></table>` : ''}
        ${g ? `<div class="ud-card ud-grade"><p class="ud-k">${T('Grade', 'Điểm')}: ${g.finalScore} / ${a.points}</p>${g.latePenaltyPct ? `<p class="muted">${T(`${g.score} before a ${g.latePenaltyPct}% late penalty.`, `${g.score} trước khi trừ ${g.latePenaltyPct}% do nộp muộn.`)}</p>` : ''}${g.feedback ? `<p>${h(g.feedback).replace(/\n/g, '<br>')}</p>` : ''}${g.needsRegrade ? `<p class="muted">${T('You resubmitted after this grade; your instructor will look again.', 'Bạn đã nộp lại sau khi có điểm này; giảng viên sẽ xem lại.')}</p>` : ''}</div>` : ''}
        ${sub ? `<div class="ud-card"><p class="ud-k">${sub.groupId ? T('Your group’s submission', 'Bài nộp của nhóm bạn') : T('Your submission', 'Bài nộp của bạn')}${sub.attempt > 1 ? T(` (attempt ${sub.attempt})`, ` (lần ${sub.attempt})`) : ''}</p><p class="muted">${sub.submittedByName ? `${T('By', 'Người nộp:')} ${h(sub.submittedBy === C.state().user.uid ? T('you', 'bạn') : sub.submittedByName)} · ` : ''}${h(when(sub.submittedAtMs))}${sub.late ? T(` · ${sub.lateDays} day${sub.lateDays === 1 ? '' : 's'} late`, ` · muộn ${sub.lateDays} ngày`) : T(' · on time', ' · đúng hạn')}</p>
          ${sub.text ? `<div class="ud-instr">${h(sub.text).replace(/\n/g, '<br>')}</div>` : ''}${sub.link ? `<p><a href="${h(sub.link)}" target="_blank" rel="noopener">${h(sub.link)}</a></p>` : ''}
          ${(sub.files || []).map((f) => `<p>📎 ${h(f.name)} <span class="muted">${kb(f.size || 0)}</span></p>`).join('')}</div>` : ''}
        ${can ? form(a, sub, late, grp) : a.group && !grp ? '' : `<p class="muted">${closed ? T('The due date has passed; this assignment does not take late work.', 'Đã quá hạn nộp; bài tập này không nhận bài muộn.') : T('You have used every submission this assignment allows.', 'Bạn đã dùng hết số lần nộp của bài tập này.')}</p>`}</div>`;
      body.querySelector('[data-back]').onclick = () => { openId = null; draw(); };
      body.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => (typeof openWidget === 'function' ? openWidget(b.dataset.w) : null); });
      if (can) wireForm(a, cid);
    }
    function form(a, sub, late, grp) {
      const t = a.submitType;
      return `<form class="ud-card" data-sub><p class="ud-k">${sub ? T('Resubmit', 'Nộp lại') : grp ? T(`Submit for ${h(grp.name)}`, `Nộp cho ${h(grp.name)}`) : T('Submit your work', 'Nộp bài')}</p>${late ? `<p class="ud-warn">${T('This will be late.', 'Bài này sẽ bị tính là nộp muộn.')}</p>` : ''}
        ${t === 'text' || t === 'any' ? `<label class="ud-lbl">${T('Written answer', 'Bài làm')}<textarea name="text" rows="6" maxlength="50000"></textarea></label>` : ''}
        ${t === 'link' || t === 'any' ? `<label class="ud-lbl">${T('Link (Google Docs, a website…)', 'Đường liên kết (Google Docs, trang web…)')}<input type="url" name="link" placeholder="https://"></label>` : ''}
        ${t === 'file' || t === 'any' ? `<label class="ud-lbl">${T('Files (PDF, Word or images, up to 25 MB each, 5 at most)', 'Tệp (PDF, Word hoặc ảnh, mỗi tệp tối đa 25 MB, tối đa 5 tệp)')}<input type="file" name="files" multiple accept=".pdf,.docx,image/png,image/jpeg,image/gif,image/webp"></label><div class="ud-prog muted" data-prog></div>` : ''}
        <div class="row"><button class="btn primary" data-go>${T('Submit', 'Nộp')}</button></div></form>`;
    }
    function wireForm(a, cid) {
      const f = body.querySelector('[data-sub]');
      f.onsubmit = async (e) => {
        e.preventDefault();
        const go = f.querySelector('[data-go]'); go.disabled = true;
        try {
          const picked = f.files ? [...f.files.files] : [];
          if (picked.length > 5) throw new Error(T('Up to 5 files per submission.', 'Mỗi lần nộp tối đa 5 tệp.'));
          for (const x of picked) { if (x.size > MAX_FILE) throw new Error(T(`${x.name} is over 25 MB.`, `${x.name} lớn hơn 25 MB.`)); if (!TYPES.test(x.type)) throw new Error(T(`${x.name}: files can be PDF, Word (.docx) or images.`, `${x.name}: tệp phải là PDF, Word (.docx) hoặc ảnh.`)); }
          const prog = f.querySelector('[data-prog]'), files = [];
          for (const x of picked) files.push(await C.uploadFile(cid, a.id, x, (p) => { if (prog) prog.textContent = T(`Uploading ${x.name}… ${p}%`, `Đang tải lên ${x.name}… ${p}%`); }));
          const r = await C.submit(cid, a.id, { text: f.text ? f.text.value : '', link: f.link ? f.link.value.trim() : '', files });
          say((r.members > 1 ? T(`Submitted for your group (${r.members} people)`, `Đã nộp cho nhóm (${r.members} người)`) : T('Submitted', 'Đã nộp')) + (r.late ? T(` (${r.lateDays} day${r.lateDays === 1 ? '' : 's'} late).`, ` (muộn ${r.lateDays} ngày).`) : '.'));
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
      if (!cid) { body.innerHTML = `<p class="ud-pad muted">${T('Join a course in the Courses widget first.', 'Hãy tham gia một khóa học trong tiện ích Khóa học trước.')}</p>`; return; }
      if (staffStop(body, list, cid, T('Grades for the course are in TAdeck’s Gradebook.', 'Điểm của khóa học nằm trong Sổ điểm của TAdeck.'))) return;
      let course, as, grades, quizzes;
      try { [course, as, grades, quizzes] = await Promise.all([C.course(cid), C.assignments(cid), C.myGrades(cid), C.quizzes(cid).catch(() => [])]); }
      catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      as = [...as, ...quizzes.map((q) => ({ id: q.id, title: `📝 ${q.title}`, points: q.points, category: q.category, dueAtMs: q.dueAtMs || null }))]   // phase 4: quizzes count like assignments
        .sort((a, b) => (a.dueAtMs || 9e15) - (b.dueAtMs || 9e15));
      const gl = Object.values(grades);
      const tot = M.courseTotal(course.weights, as, gl);
      const cats = Object.entries(course.weights || { assignments: 100 });
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        <div class="ud-card ud-total"><span class="muted">${T('Course total so far', 'Tổng điểm khóa học đến nay')}</span><b>${tot.percent === null ? '—' : tot.percent + '%'}</b>
          <span class="muted">${cats.map(([k, w]) => { const c = tot.byCategory[k]; return `${h(CAT(k))} (${T(`${w}% of the grade`, `${w}% tổng điểm`)}): ${c ? c.percent + '%' : T('nothing yet', 'chưa có')}`; }).join(' · ')}</span></div>
        <table class="ud-tbl"><thead><tr><th>${T('Assignment', 'Bài')}</th><th>${T('Score', 'Điểm')}</th><th></th></tr></thead><tbody>
        ${as.map((a) => { const g = grades[a.id]; return `<tr><td>${h(a.title)}<br><span class="muted">${h(CAT(a.category))}</span></td><td>${g ? `<b>${g.finalScore}</b> / ${a.points}` : `<span class="muted">– / ${a.points}</span>`}</td><td class="muted">${g && g.latePenaltyPct ? T(`−${g.latePenaltyPct}% late`, `−${g.latePenaltyPct}% nộp muộn`) : ''}</td></tr>`; }).join('')}
        </tbody></table><p class="muted">${T('Only grades your instructor has released are shown and counted. The total rescales the weights of the categories graded so far.', 'Chỉ những điểm giảng viên đã công bố mới được hiển thị và tính. Tổng điểm được tính lại theo trọng số của các nhóm đã có điểm.')}</p></div>`;
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
      if (!cid) { body.innerHTML = `<p class="ud-pad muted">${T('Join a course in the Courses widget first.', 'Hãy tham gia một khóa học trong tiện ích Khóa học trước.')}</p>`; return; }
      let mods, done, as;
      try { [mods, done, as] = await Promise.all([C.modules(cid), C.myProgress(cid), C.assignments(cid)]); }
      catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const now = Date.now(), isOpen = (m) => !m.releaseAtMs || m.releaseAtMs <= now;
      const opened = mods.filter(isOpen);
      if (!openMod || !mods.some((m) => m.id === openMod)) openMod = (opened[opened.length - 1] || mods[0] || {}).id || null;
      const total = opened.reduce((n, m) => n + m.items.length, 0), ticked = opened.reduce((n, m) => n + m.items.filter((i) => done[i.id]).length, 0);
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        ${mods.length ? `<p class="muted">${T(`${ticked} of ${total} items done in the modules open so far.`, `Đã xong ${ticked}/${total} mục trong các học phần đã mở.`)}</p>` : `<p class="muted">${T('Your instructor hasn’t posted any modules yet.', 'Giảng viên chưa đăng học phần nào.')}</p>`}
        <div class="ud-mods">${mods.map((m) => { const op = isOpen(m), n = m.items.filter((i) => done[i.id]).length;
          return `<div class="ud-mod ${op ? '' : 'locked'} ${m.id === openMod ? 'on' : ''}"><button class="ud-linkbtn ud-modhead" data-m="${h(m.id)}"><b>${h(m.title)}</b>
            <span class="muted">${op ? T(`${n}/${m.items.length} done`, `xong ${n}/${m.items.length}`) : `🔒 ${T('Opens', 'Mở lúc')} ${h(when(m.releaseAtMs))}`}</span></button>
            ${m.id === openMod ? `<div data-items="${h(m.id)}">${op ? `<p class="muted">${T('Loading…', 'Đang tải…')}</p>` : `<ul class="ud-items">${m.items.map((i) => `<li class="muted">${KIND_ICON[i.kind] || '•'} ${h(i.title || (as.find((a) => a.id === i.refId) || {}).title || '')}</li>`).join('')}</ul><p class="muted">${T('The content opens on the release date.', 'Nội dung sẽ mở vào ngày phát hành.')}</p>`}</div>` : ''}</div>`; }).join('')}</div></div>`;
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
        return `<li><label class="ud-tick"><input type="checkbox" data-done="${h(i.id)}" ${done[i.id] ? 'checked' : ''} aria-label="${T('Done', 'Đã xong')}: ${title}"></label>
          <div class="ud-item"><span>${KIND_ICON[i.kind] || '•'} ${x.url && i.kind !== 'page' ? `<a href="${h(x.url)}" target="_blank" rel="noopener">${title}</a>` : `<b>${title}</b>`}</span>
          ${a ? `<span class="muted">${T('Due', 'Hạn nộp')} ${h(when(a.dueAtMs))} · ${a.points} ${T('pts', 'điểm')} · <a href="#" data-asg="${h(a.id)}">${T('open in Assignments', 'mở trong Bài tập')}</a></span>` : ''}
          ${i.kind === 'page' && x.body ? `<details class="ud-page"><summary>${T('Read', 'Đọc')}</summary><div class="ud-instr">${rich(x.body)}</div></details>` : ''}
          ${i.kind === 'reading' && !x.url ? `<span class="muted">${T('Reading (no link)', 'Bài đọc (không có liên kết)')}</span>` : ''}</div></li>`; }).join('')}</ul>`;
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
      if (!cid) { body.innerHTML = `<p class="ud-pad muted">${T('Join a course in the Courses widget first.', 'Hãy tham gia một khóa học trong tiện ích Khóa học trước.')}</p>`; return; }
      let anns, reads;
      try { [anns, reads] = await Promise.all([C.announcements(cid), C.myReads(cid)]); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const unread = anns.filter((a) => !reads[a.id]).map((a) => a.id);
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        ${anns.length ? '' : `<p class="muted">${T('No announcements in this course yet.', 'Khóa học này chưa có thông báo nào.')}</p>`}
        ${anns.map((a) => `<article class="ud-card ud-ann ${reads[a.id] ? '' : 'unread'}"><p class="ud-k">${a.pinned ? '📌 ' : ''}${h(a.title)}${reads[a.id] ? '' : ` <span class="ud-tag l">${T('new', 'mới')}</span>`}</p>
          <p class="muted">${h(a.authorName || '')} · ${h(ago(a.createdAtMs))}${a.editedAtMs ? T(' · edited', ' · đã sửa') : ''}</p><div>${rich(a.body)}</div></article>`).join('')}</div>`;
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
      if (!cid) { body.innerHTML = `<p class="ud-pad muted">${T('Join a course in the Courses widget first.', 'Hãy tham gia một khóa học trong tiện ích Khóa học trước.')}</p>`; return; }
      let ths;
      try { ths = await C.threads(cid); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const th = openT && ths.find((x) => x.id === openT);
      if (th) return thread(cid, th, my);
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        ${ths.length ? '' : `<p class="muted">${T('No discussions in this course yet.', 'Khóa học này chưa có thảo luận nào.')}</p>`}
        <ul class="ud-list ud-threads">${ths.map((x) => `<li><button class="ud-linkbtn" data-t="${h(x.id)}"><b>${x.pinned ? '📌 ' : ''}${h(x.title)}</b>
          <span class="muted">${T(`${x.postCount || 0} repl${x.postCount === 1 ? 'y' : 'ies'}`, `${x.postCount || 0} trả lời`)} · ${h(ago(x.lastPostAtMs || x.createdAtMs))}${x.postFirst ? T(' · post first', ' · đăng trước khi xem') : ''}${x.locked ? T(' · closed', ' · đã đóng') : ''}</span></button></li>`).join('')}</ul></div>`;
      const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { openT = null; C.setCurrentCourse(s.value); };
      body.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { openT = b.dataset.t; editing = null; draw(); }; });
    }
    async function thread(cid, th, my) {
      let res;
      try { res = await C.posts(cid, th.id); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const me = (C.state().user || {}).uid;
      body.innerHTML = `<div class="ud-pad"><button class="ud-linkbtn ud-back" data-back>${T('← All discussions', '← Tất cả thảo luận')}</button>
        <h3 class="ud-h">${th.pinned ? '📌 ' : ''}${h(th.title)}</h3><p class="muted">${h(th.authorName || '')} · ${h(ago(th.createdAtMs))}${th.locked ? T(' · closed to new replies', ' · không nhận trả lời mới') : ''}</p>
        <div class="ud-instr">${rich(th.body)}</div>
        ${res.locked ? `<p class="ud-card muted">🔒 ${T('Post your own reply first; then you will see what your classmates wrote.', 'Hãy đăng câu trả lời của bạn trước; sau đó bạn sẽ thấy các bạn cùng lớp viết gì.')}</p>` : res.posts.map((p) => `<div class="ud-post ${p.role !== 'student' ? 'staff' : ''}">
          <p class="muted"><b>${h(p.name)}</b>${p.role !== 'student' ? ` <span class="ud-tag">${h(p.role === 'ta' ? T('TA', 'Trợ giảng') : T('Instructor', 'Giảng viên'))}</span>` : ''} · ${h(ago(p.createdAtMs))}${p.editedAtMs && !p.removed ? T(' · edited', ' · đã sửa') : ''}</p>
          ${p.removed ? `<p class="muted"><i>${T('Reply removed.', 'Câu trả lời đã bị gỡ.')}</i></p>` : editing === p.id ? `<form data-edit="${h(p.id)}"><textarea name="body" rows="3" maxlength="5000">${h(p.body)}</textarea><div class="row"><button class="btn primary">${T('Save', 'Lưu')}</button><button type="button" class="btn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>` : `<div>${rich(p.body)}</div>`}
          ${p.uid === me && !p.removed && editing !== p.id && !th.locked ? `<div class="row"><a href="#" data-ed="${h(p.id)}">${T('Edit', 'Sửa')}</a><a href="#" data-rm="${h(p.id)}">${T('Remove', 'Gỡ')}</a></div>` : ''}</div>`).join('') || `<p class="muted">${T('No replies yet. Be the first.', 'Chưa có trả lời nào. Hãy là người đầu tiên.')}</p>`}
        ${th.locked ? '' : `<form class="ud-card" data-reply><label class="ud-lbl">${T('Your reply', 'Câu trả lời của bạn')}<textarea name="body" rows="4" maxlength="5000" required></textarea></label><div class="row"><button class="btn primary">${T('Post reply', 'Đăng trả lời')}</button></div></form>`}</div>`;
      body.querySelector('[data-back]').onclick = () => { openT = null; draw(); };
      const f = body.querySelector('[data-reply]');
      if (f) f.onsubmit = async (e) => { e.preventDefault(); try { await C.postReply(cid, th.id, f.body.value.trim()); say(T('Reply posted.', 'Đã đăng trả lời.')); draw(); } catch (er) { say(C.errText(er)); } };
      body.querySelectorAll('[data-ed]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); editing = a.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-rm]').forEach((a) => { a.onclick = async (e) => { e.preventDefault(); if (!confirm(T('Remove this reply?', 'Gỡ câu trả lời này?'))) return; try { await C.removePost(cid, th.id, a.dataset.rm); draw(); } catch (er) { say(C.errText(er)); } }; });
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
  const hm = (ms) => new Date(ms).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
  /** Everything with a date in the student's courses: [{ start, end, title, kind, course, location, link, weekly? }] (weekly events once, with weeklyUntil). */
  async function gather(list) {
    const out = [];
    await Promise.all(list.map(async (c) => {
      const [as, subs, mods, evs, mine, slots] = await Promise.all([C.assignments(c.courseId), C.mySubmissions(c.courseId), C.modules(c.courseId), C.events(c.courseId), C.myBookings(c.courseId), C.slots(c.courseId)].map((p) => p.catch(() => [])));
      as.filter((a) => a.dueAtMs).forEach((a) => out.push({ id: 'a-' + a.id, start: a.dueAtMs, end: a.dueAtMs, title: `${T('Due', 'Hạn nộp')}: ${a.title}`, kind: 'due', done: !!(subs && subs[a.id]), course: c.title }));
      mods.filter((m) => m.releaseAtMs).forEach((m) => out.push({ id: 'm-' + m.id, start: m.releaseAtMs, end: m.releaseAtMs, title: `${T('Opens', 'Mở')}: ${m.title}`, kind: 'module', course: c.title }));
      evs.forEach((e) => out.push({ id: 'e-' + e.id, start: e.startAtMs, end: e.endAtMs, title: e.title, kind: e.kind, course: c.title, location: e.location, link: e.link, weeklyUntil: e.weeklyUntilMs || null }));
      (mine || []).forEach((b) => { const s = (slots || []).find((x) => x.id === b.slotId) || {}; out.push({ id: 'o-' + b.slotId, start: b.startAtMs, end: b.endAtMs, title: T('Office hours (booked)', 'Giờ tiếp sinh viên (đã đặt)'), kind: 'office', course: c.title, location: s.location, link: s.link }); });
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
      const label = view === 'week' ? `${new Date(from).toLocaleDateString(LOC(), { month: 'short', day: 'numeric' })} – ${new Date(from + 6 * DAY).toLocaleDateString(LOC(), { month: 'short', day: 'numeric', year: 'numeric' })}`
        : new Date(anchor).toLocaleDateString(LOC(), { month: 'long', year: 'numeric' });
      const today = dayStart(Date.now()), month = new Date(anchor).getMonth();
      const line = (x) => `<li class="ud-ev k-${h(x.kind)} ${x.done ? 'done' : ''}" title="${h(x.course)}"><span class="muted">${x.kind === 'due' || x.kind === 'module' ? hm(x.start) : `${hm(x.start)}–${hm(x.end)}`}</span> ${ICON[x.kind] || '•'} ${h(x.title)}${x.done ? ' ✓' : ''}<br><span class="muted">${h(x.course)}${x.location ? ' · ' + h(x.location) : ''}</span>${x.link ? ` <a href="${h(x.link)}" target="_blank" rel="noopener">${T('link', 'liên kết')}</a>` : ''}</li>`;
      body.innerHTML = `<div class="ud-pad"><div class="row ud-calbar"><button class="btn" data-nav="-1" aria-label="${T('Previous', 'Trước')}">‹</button><button class="btn" data-nav="0">${T('Today', 'Hôm nay')}</button><button class="btn" data-nav="1" aria-label="${T('Next', 'Sau')}">›</button>
          <b class="ud-callabel">${h(label)}</b><span class="ud-grow"></span><button class="chip ${view === 'week' ? 'on' : ''}" data-view="week">${T('Week', 'Tuần')}</button><button class="chip ${view === 'month' ? 'on' : ''}" data-view="month">${T('Month', 'Tháng')}</button><button class="btn" data-ics title="${T('For Google Calendar, Outlook or Apple Calendar', 'Cho Google Calendar, Outlook hoặc Apple Calendar')}">${T('Export .ics', 'Xuất .ics')}</button></div>
        ${list.length ? '' : `<p class="muted">${T('Join a course to see its deadlines and classes here.', 'Hãy tham gia một khóa học để thấy hạn nộp và lịch học ở đây.')}</p>`}
        ${view === 'week' ? `<div class="ud-week">${Array.from({ length: 7 }, (_, i) => { const d = from + i * DAY, xs = byDay(d);
            return `<section class="ud-day ${d === today ? 'today' : ''}"><p class="ud-k">${new Date(d).toLocaleDateString(LOC(), { weekday: 'short', day: 'numeric' })}</p>${xs.length ? `<ul>${xs.map(line).join('')}</ul>` : '<p class="muted">—</p>'}</section>`; }).join('')}</div>`
          : `<div class="ud-month">${(VI() ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((w) => `<b class="muted">${w}</b>`).join('')}${Array.from({ length: 42 }, (_, i) => { const d = from + i * DAY, xs = byDay(d), dt = new Date(d);
            return `<button class="ud-cell ${d === today ? 'today' : ''} ${dt.getMonth() !== month ? 'out' : ''}" data-day="${d}"><span>${dt.getDate()}</span>${xs.slice(0, 3).map((x) => `<i class="k-${h(x.kind)}" title="${h(x.title)}">${ICON[x.kind] || '•'} ${h(x.title.replace(/^(Due|Opens|Hạn nộp|Mở): /, ''))}</i>`).join('')}${xs.length > 3 ? `<i class="muted">${T(`+${xs.length - 3} more`, `+${xs.length - 3} mục`)}</i>` : ''}</button>`; }).join('')}</div>`}
        <p class="muted ud-foot">${T('🗂️ due · 🧭 module opens · 🏛️ class · 📝 exam · 🙋 your office hours. Export adds them to Google Calendar, Outlook or Apple Calendar (a copy: re-export after changes).', '🗂️ hạn nộp · 🧭 học phần mở · 🏛️ buổi học · 📝 thi · 🙋 giờ tiếp sinh viên của bạn. Xuất tệp để thêm vào Google Calendar, Outlook hoặc Apple Calendar (là bản sao: xuất lại sau khi có thay đổi).')}</p></div>`;
      body.querySelectorAll('[data-nav]').forEach((b) => { b.onclick = () => { const n = Number(b.dataset.nav); if (!n) anchor = Date.now(); else if (view === 'week') anchor += n * 7 * DAY; else { const d = new Date(anchor); d.setDate(1); d.setMonth(d.getMonth() + n); anchor = d.getTime(); } draw(); }; });
      body.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { view = b.dataset.view; draw(); }; });
      body.querySelectorAll('[data-day]').forEach((b) => { b.onclick = () => { anchor = Number(b.dataset.day); view = 'week'; draw(); }; });
      body.querySelector('[data-ics]').onclick = () => {
        const keep = items.filter((x) => x.weeklyUntil ? x.weeklyUntil >= Date.now() - 30 * DAY : x.start >= Date.now() - 30 * DAY);
        const url = URL.createObjectURL(new Blob([ics(keep)], { type: 'text/calendar;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = 'unistudentdeck-calendar.ics'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        say(T(`Exported ${keep.length} item${keep.length === 1 ? '' : 's'}. Open the file to add them to your calendar.`, `Đã xuất ${keep.length} mục. Mở tệp để thêm vào lịch của bạn.`));
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
      if (!cid) { body.innerHTML = `<p class="ud-pad muted">${T('Join a course in the Courses widget first.', 'Hãy tham gia một khóa học trong tiện ích Khóa học trước.')}</p>`; return; }
      if (staffStop(body, list, cid, T('You run office hours from TAdeck; booking is for students.', 'Bạn quản lý giờ tiếp sinh viên từ TAdeck; đặt lịch là dành cho sinh viên.'))) return;
      let slots, mine;
      try { [slots, mine] = await Promise.all([C.slots(cid), C.myBookings(cid)]); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const now = Date.now(), mineIds = new Set(mine.map((b) => b.slotId)), up = slots.filter((s) => s.endAtMs > now);
      const days = [...new Set(up.map((s) => dayStart(s.startAtMs)))];
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        ${mine.filter((b) => b.endAtMs > now).map((b) => { const s = slots.find((x) => x.id === b.slotId) || {}; return `<div class="ud-card ud-grade"><p class="ud-k">${T('Your booking', 'Lịch bạn đã đặt')}: ${h(when(b.startAtMs))}</p>
          <p class="muted">${h(s.location || '')}${b.note ? ' · ' + h(b.note) : ''}</p>${s.link ? `<p><a href="${h(s.link)}" target="_blank" rel="noopener">${T('Join online', 'Tham gia trực tuyến')}</a></p>` : ''}<div class="row"><button class="btn" data-cancel="${h(b.slotId)}">${T('Cancel booking', 'Hủy lịch')}</button></div></div>`; }).join('')}
        ${up.length ? days.map((d) => `<p class="ud-k">${h(new Date(d).toLocaleDateString(LOC(), { weekday: 'long', month: 'short', day: 'numeric' }))}</p><ul class="ud-slots">${up.filter((s) => dayStart(s.startAtMs) === d).map((s) => {
            const mineS = mineIds.has(s.id);
            return `<li><span>${hm(s.startAtMs)}–${hm(s.endAtMs)} <span class="muted">${h(s.location || '')}${s.link ? T(' · online', ' · trực tuyến') : ''}</span></span>
              ${mineS ? `<span class="ud-tag g">${T('Yours', 'Của bạn')}</span>` : s.booked ? `<span class="ud-tag">${T('Taken', 'Đã có người đặt')}</span>` : booking === s.id ? `<form class="row" data-book="${h(s.id)}"><input name="note" maxlength="500" placeholder="${T('What would you like to discuss? (optional)', 'Bạn muốn trao đổi về điều gì? (không bắt buộc)')}"><button class="btn primary">${T('Book', 'Đặt')}</button></form>` : `<button class="btn" data-pick="${h(s.id)}">${T('Book', 'Đặt')}</button>`}</li>`; }).join('')}</ul>`).join('')
          : `<p class="muted">${T('No office hours open in this course right now.', 'Khóa học này hiện chưa mở giờ tiếp sinh viên.')}</p>`}
        <p class="muted ud-foot">${T('Classmates see that a slot is taken, never by whom. Up to two upcoming bookings per course.', 'Các bạn cùng lớp chỉ thấy khung giờ đã có người đặt, không thấy ai đặt. Mỗi khóa học được đặt tối đa hai lịch sắp tới.')}</p></div>`;
      const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { booking = null; C.setCurrentCourse(s.value); };
      body.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { booking = b.dataset.pick; draw(); }; });
      body.querySelectorAll('[data-book]').forEach((f) => { f.onsubmit = async (e) => { e.preventDefault(); try { await C.bookSlot(cid, f.dataset.book, f.note.value.trim()); booking = null; say(T('Booked. It is in your Calendar too.', 'Đã đặt. Lịch này cũng có trong Lịch của bạn.')); draw(); } catch (er) { say(C.errText(er)); } }; });
      body.querySelectorAll('[data-cancel]').forEach((b) => { b.onclick = async () => { if (!confirm(T('Cancel this booking?', 'Hủy lịch đã đặt này?'))) return; try { await C.cancelBooking(cid, b.dataset.cancel); draw(); } catch (er) { say(C.errText(er)); } }; });
    }
    draw();
    return live(body, draw);
  }


  /* ---------------- Group project (phase 3) ----------------
     Your group in the current course, its shared task list (anyone in the group adds, assigns, ticks and deletes), and the
     course's group assignments with who submitted. Groups are set by course staff in LectureDeck or TAdeck. */
  function renderGroup(body) {
    let seq = 0;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await currentOf(list);
      if (!cid) { body.innerHTML = `<p class="ud-pad muted">${T('Join a course in the Courses widget first.', 'Hãy tham gia một khóa học trong tiện ích Khóa học trước.')}</p>`; return; }
      if (staffStop(body, list, cid, T('Groups for this course are in TAdeck’s Groups tab.', 'Các nhóm của khóa học nằm trong thẻ Nhóm của TAdeck.'))) return;
      let grp, as, subs, grades;
      try { [grp, as, subs, grades] = await Promise.all([C.myGroup(cid), C.assignments(cid), C.mySubmissions(cid), C.myGrades(cid)]); }
      catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (!grp) {
        body.innerHTML = `<div class="ud-pad">${picker(list, cid)}<div class="ud-empty"><p><b>${T('No group yet', 'Chưa có nhóm')}</b></p><p class="muted">${T('When your instructor puts you in a group for this course, your group, its task list and group assignments appear here.', 'Khi giảng viên xếp bạn vào một nhóm của khóa học này, nhóm, danh sách công việc và bài tập nhóm sẽ hiện ở đây.')}</p></div></div>`;
        const sel = body.querySelector('[data-course]'); if (sel) sel.onchange = () => C.setCurrentCourse(sel.value);
        return;
      }
      let tasks = [];
      try { tasks = await C.tasks(cid, grp.id); } catch (e) { /* shown as an empty list */ }
      if (my !== seq) return;
      const me = C.state().user.uid, now = Date.now();
      const people = grp.memberUids.map((u) => ({ uid: u, name: grp.memberNames[u] || '' }));
      const ga = as.filter((a) => a.group);
      const open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done);
      const row = (t) => `<li class="ud-task ${t.done ? 'done' : ''}"><label><input type="checkbox" data-done="${h(t.id)}" ${t.done ? 'checked' : ''}> <span>${h(t.title)}</span></label>
          <span class="muted">${t.assigneeUid ? (t.assigneeUid === me ? T('you', 'bạn') : h(t.assigneeName)) : T('anyone', 'bất kỳ ai')}${t.dueAtMs ? ` · <span class="${!t.done && t.dueAtMs < now ? 'ud-warn' : ''}">${h(new Date(t.dueAtMs).toLocaleDateString(LOC(), { month: 'short', day: 'numeric' }))}</span>` : ''}</span>
          <button class="ud-x" title="${T('Delete task', 'Xóa công việc')}" aria-label="${T('Delete', 'Xóa')} ${h(t.title)}" data-del="${h(t.id)}">×</button></li>`;
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        <div class="ud-card"><p class="ud-k">👥 ${h(grp.name)}</p><p class="ud-people">${people.map((p) => `<span class="ud-tag ${p.uid === me ? 'g' : ''}">${h(p.uid === me ? `${p.name} (${T('you', 'bạn')})` : p.name)}</span>`).join(' ')}</p></div>
        <p class="ud-k">${T('Tasks', 'Công việc')} <span class="muted">${T(`${done.length} of ${tasks.length} done`, `xong ${done.length}/${tasks.length}`)}</span></p>
        <ul class="ud-list ud-tasks">${open.map(row).join('') || `<li class="muted">${T('Nothing open. Add the next step below.', 'Không còn việc nào. Thêm bước tiếp theo bên dưới.')}</li>`}</ul>
        <form class="ud-card" data-add><div class="row"><input type="text" name="title" maxlength="200" placeholder="${T('Add a task, e.g. Find three sources', 'Thêm công việc, ví dụ Tìm ba nguồn tài liệu')}" style="flex:1" aria-label="${T('New task', 'Công việc mới')}" required></div>
          <div class="row"><label class="ud-pick">${T('For', 'Giao cho')} <select name="who"><option value="">${T('Anyone', 'Bất kỳ ai')}</option>${people.map((p) => `<option value="${h(p.uid)}">${h(p.uid === me ? T('Me', 'Tôi') : p.name)}</option>`).join('')}</select></label>
          <label class="ud-pick">${T('Due', 'Hạn')} <input type="date" name="due"></label><button class="btn primary">${T('Add', 'Thêm')}</button></div></form>
        ${done.length ? `<details class="ud-done"><summary class="muted">${T('Done', 'Đã xong')} (${done.length})</summary><ul class="ud-list ud-tasks">${done.map(row).join('')}</ul></details>` : ''}
        ${ga.length ? `<p class="ud-k">${T('Group assignments', 'Bài tập nhóm')}</p><ul class="ud-list">${ga.map((a) => { const sb = subs[a.id], g = grades[a.id];
          const st = g ? `<span class="ud-tag g">${g.finalScore}/${a.points}</span>` : sb ? `<span class="ud-tag s">${T('By', 'Nộp bởi')} ${h(sb.submittedBy === me ? T('you', 'bạn') : sb.submittedByName || T('your group', 'nhóm bạn'))}</span>` : a.dueAtMs && a.dueAtMs < now ? `<span class="ud-tag m">${T('Missing', 'Chưa nộp')}</span>` : `<span class="ud-tag">${T('To do', 'Cần làm')}</span>`;
          return `<li><button class="ud-linkbtn" data-asg="${h(a.id)}"><b>${h(a.title)}</b><span class="muted">${h(when(a.dueAtMs))}</span></button>${st}</li>`; }).join('')}</ul>` : ''}
        <p class="muted ud-foot">${T('Only your group and course staff see this list.', 'Chỉ nhóm bạn và giảng viên, trợ giảng của khóa học thấy danh sách này.')}</p></div>`;
      const sel = body.querySelector('[data-course]'); if (sel) sel.onchange = () => C.setCurrentCourse(sel.value);
      const f = body.querySelector('[data-add]');
      f.onsubmit = async (e) => { e.preventDefault();
        const due = f.due.value ? new Date(f.due.value + 'T23:59').getTime() : null;
        try { await C.saveTask(cid, grp.id, { title: f.title.value.trim(), assigneeUid: f.who.value || null, dueAtMs: due }); draw(); } catch (er) { say(C.errText(er)); } };
      body.querySelectorAll('[data-done]').forEach((b) => { b.onchange = async () => { try { await C.setTaskDone(cid, grp.id, b.dataset.done, b.checked); draw(); } catch (er) { say(C.errText(er)); b.checked = !b.checked; } }; });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm(T('Delete this task for the whole group?', 'Xóa công việc này cho cả nhóm?'))) return; try { await C.deleteTask(cid, grp.id, b.dataset.del); draw(); } catch (er) { say(C.errText(er)); } }; });
      body.querySelectorAll('[data-asg]').forEach((b) => { b.onclick = () => (typeof openWidget === 'function' ? openWidget('uassign') : null); });
    }
    draw();
    return live(body, draw);
  }

  /* ---------------- Family view (phase 3) ----------------
     Off unless you turn it on. You choose what your family sees, invite them with a one-time code (they use UniDeck's
     ParentDeck), see who is linked and when they last looked, and remove anyone at any time. */
  const FAM_ITEMS = () => [['courses', T('The courses I take', 'Các khóa học tôi đang học'), T('Course names and terms', 'Tên khóa học và học kỳ')], ['deadlines', T('Deadlines and whether I submitted', 'Hạn nộp và tôi đã nộp hay chưa'), T('Due dates for the last two weeks and the next three, marked submitted, late or missing', 'Hạn nộp trong hai tuần qua và ba tuần tới, ghi rõ đã nộp, nộp muộn hay chưa nộp')],
    ['grades', T('Released grades and course totals', 'Điểm đã công bố và tổng điểm khóa học'), T('Scores your instructors have released, not their feedback', 'Điểm giảng viên đã công bố, không gồm nhận xét')], ['calendar', T('Class times and exams', 'Lịch học và lịch thi'), T('The next two weeks', 'Hai tuần tới')]];
  function renderFamily(body) {
    let seq = 0;
    const ago = (ms) => { if (!ms) return T('not yet', 'chưa'); const d0 = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); }; const d = Math.round((d0(Date.now()) - d0(ms)) / 864e5); return d <= 0 ? T('today', 'hôm nay') : d === 1 ? T('yesterday', 'hôm qua') : T(`${d} days ago`, `${d} ngày trước`); };   // calendar days
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let st;
      try { st = await C.familyStatus(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      body.innerHTML = `<div class="ud-pad">
        <label class="ud-switch"><input type="checkbox" data-on ${st.enabled ? 'checked' : ''}> <b>${T('Share with my family', 'Chia sẻ với gia đình')}</b></label>
        <p class="muted">${st.enabled ? T('Your family sees only what is ticked below, through UniDeck’s ParentDeck.', 'Gia đình bạn chỉ thấy những mục được đánh dấu bên dưới, qua ParentDeck của UniDeck.') : T('Off: nobody in your family sees anything. Turn it on to choose what to share.', 'Đang tắt: không ai trong gia đình thấy gì. Bật lên để chọn những gì muốn chia sẻ.')}</p>
        <div class="ud-card ${st.enabled ? '' : 'ud-dim'}"><p class="ud-k">${T('What they see', 'Gia đình thấy gì')}</p>
          ${FAM_ITEMS().map(([k, label, note]) => `<label class="ud-check"><input type="checkbox" data-share="${k}" ${st.share[k] ? 'checked' : ''} ${st.enabled ? '' : 'disabled'}> <span>${h(label)}<br><span class="muted">${h(note)}</span></span></label>`).join('')}
          <p class="muted ud-foot">${T('Never shared: your work, feedback, discussions, groups, files, notes, journal and study stats.', 'Không bao giờ chia sẻ: bài làm, nhận xét, thảo luận, nhóm, tệp, ghi chú, nhật ký và thống kê học tập của bạn.')}</p></div>
        <div class="ud-card"><p class="ud-k">${T('People who can see it', 'Những người có thể xem')}</p>
          ${st.guardians.length ? `<ul class="ud-list">${st.guardians.map((g) => `<li><span style="flex:1"><b>${h(g.name)}</b> <span class="muted">${h(g.email)}</span><br><span class="muted">${T('Linked', 'Liên kết')} ${h(ago(g.linkedAtMs))} · ${T('last looked', 'xem lần cuối')} ${h(ago(g.lastViewedAtMs))}</span></span><button class="btn" data-rm="${h(g.uid)}">${T('Remove', 'Gỡ')}</button></li>`).join('')}</ul>` : `<p class="muted">${T('Nobody yet.', 'Chưa có ai.')}</p>`}
          ${st.invite ? `<div class="ud-invite"><p>${T('Invite code', 'Mã mời')}: <b class="ud-code">${h(st.invite.code)}</b></p><p class="muted">${T(`Works once, until ${h(new Date(st.invite.expiresAtMs).toLocaleDateString(LOC(), { weekday: 'short', month: 'short', day: 'numeric' }))}. Your family member installs UniDeck’s ParentDeck, signs in with Google and enters it in the family view.`, `Dùng được một lần, đến ${h(new Date(st.invite.expiresAtMs).toLocaleDateString(LOC(), { weekday: 'short', month: 'short', day: 'numeric' }))}. Người thân của bạn cài ParentDeck của UniDeck, đăng nhập bằng Google và nhập mã trong phần gia đình.`)}</p><div class="row"><button class="btn" data-copy>${T('Copy code', 'Sao chép mã')}</button><button class="btn" data-cancel>${T('Cancel invite', 'Hủy lời mời')}</button></div></div>`
            : `<div class="row"><button class="btn primary" data-invite ${st.enabled ? '' : 'disabled'}>${T('Invite a family member', 'Mời một người thân')}</button></div>`}
          <p class="muted ud-foot">${T('Up to four people. Removing someone takes effect at once.', 'Tối đa bốn người. Gỡ ai đó có hiệu lực ngay lập tức.')}</p></div></div>`;
      const on = body.querySelector('[data-on]');
      const save = async (enabled, share) => { try { await C.setFamilySharing({ enabled, share }); draw(); } catch (e) { say(C.errText(e)); draw(); } };
      on.onchange = () => save(on.checked, st.share);
      body.querySelectorAll('[data-share]').forEach((b) => { b.onchange = () => save(true, { ...st.share, [b.dataset.share]: b.checked }); });
      const inv = body.querySelector('[data-invite]'); if (inv) inv.onclick = async () => { try { await C.createFamilyInvite(); draw(); } catch (e) { say(C.errText(e)); } };
      const cancel = body.querySelector('[data-cancel]'); if (cancel) cancel.onclick = async () => { try { await C.cancelFamilyInvite(); draw(); } catch (e) { say(C.errText(e)); } };
      const copy = body.querySelector('[data-copy]'); if (copy) copy.onclick = () => { try { navigator.clipboard.writeText(st.invite.code); say(T('Code copied.', 'Đã sao chép mã.')); } catch (e) { say(st.invite.code); } };
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => { if (!confirm(T('Remove this person? They stop seeing anything at once.', 'Gỡ người này? Họ sẽ không thấy gì nữa ngay lập tức.'))) return; try { await C.removeFamilyLink(b.dataset.rm); say(T('Removed.', 'Đã gỡ.')); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    draw();
    return live(body, draw);
  }

  /* ---------------- TAdeck (phase 3) ----------------
     For a student the instructor made a TA. The screens are LectureDeck's Course mode (js/course-mode.js, the same file),
     opened here under UniStudentDeck's sign-in; they list only the courses where you are course staff. */
  const TA_TABS = () => [['grader', T('✅ Grader', '✅ Chấm bài')], ['gradebook', T('📒 Gradebook', '📒 Sổ điểm')], ['stats', T('📊 Course stats', '📊 Thống kê khóa học')], ['quizzes', T('📝 Quizzes', '📝 Bài kiểm tra')], ['groups', T('👥 Groups', '👥 Nhóm')], ['discussions', T('💬 Discussions', '💬 Thảo luận')], ['announcements', T('📣 Announcements', '📣 Thông báo')], ['office', T('🙋 Office hours', '🙋 Giờ tiếp sinh viên')]];
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
      if (!list.length) { end(); body.innerHTML = `<div class="ud-empty"><p><b>${T('No TA courses yet', 'Chưa có khóa học nào bạn làm trợ giảng')}</b></p><p class="muted">${T('When an instructor makes you a TA in one of your courses, grading, quizzes, discussions and office hours for it appear here.', 'Khi giảng viên chọn bạn làm trợ giảng trong một khóa học, việc chấm bài, bài kiểm tra, thảo luận và giờ tiếp sinh viên của khóa đó sẽ hiện ở đây.')}</p></div>`; return; }
      if (!window.CourseMode) { end(); body.innerHTML = `<p class="ud-pad muted">${T('TAdeck didn’t load. Reload the page.', 'TAdeck chưa tải được. Hãy tải lại trang.')}</p>`; return; }
      if (body.querySelector('.ta-desk')) return;   // already showing; the course-mode screen redraws itself
      end();
      body.innerHTML = `<div class="ta-desk"><div class="ta-tabs" role="tablist">${TA_TABS().map(([id, label]) => `<button class="chip ${id === tab ? 'on' : ''}" role="tab" aria-selected="${id === tab}" data-tab="${id}">${label}</button>`).join('')}</div><div class="ta-body"></div></div>`;
      body.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; try { localStorage.setItem('ud_tadesk_tab', tab); } catch (e) {} end(); body.innerHTML = ''; draw(); }; });
      const pane = body.querySelector('.ta-body');
      stop = (window.CourseMode[tab] || window.CourseMode.grader)(pane) || null;
    }
    draw();
    const off = C.onChange((st) => { if (!st.user || st.role !== 'unistudent') { end(); body.innerHTML = ''; draw(); } });
    return () => { end(); off(); };
  }

  /* ---------------- Quizzes (UniDeck phase 4, v0.11.0; backend v2.20.0) ----------------
     Published quizzes in the current course. Taking one: the questions come from the server without their answers, every
     change is saved there as you go (so a closed widget or a dropped connection loses nothing), and the attempt is
     submitted at the time limit if you haven't. Scores and which answers were right show once the instructor releases
     the results. No AI anywhere in here: UniDeck's AI tools are never available inside a quiz. */
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function renderQuizzes(body) {
    let seq = 0, taking = null, opened = null, tick = null, saveTimer = null;
    const stopTick = () => { if (tick) clearInterval(tick); tick = null; };
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      if (taking) return paintTaking();
      stopTick();
      let list;
      try { list = await C.myCourses(); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await currentOf(list);
      if (!cid) { body.innerHTML = `<p class="ud-pad muted">${T('Join a course in the Courses widget first.', 'Hãy tham gia một khóa học trong tiện ích Khóa học trước.')}</p>`; return; }
      if (staffStop(body, list, cid, T('You write quizzes, see results and grade them in TAdeck’s Quizzes tab.', 'Bạn soạn bài kiểm tra, xem kết quả và chấm điểm trong thẻ Bài kiểm tra của TAdeck.'))) return;
      body.innerHTML = `<p class="muted ud-pad">${T('Loading…', 'Đang tải…')}</p>`;
      let r;
      try { r = await C.myQuizzes(cid); } catch (e) { body.innerHTML = `<p class="ud-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq || taking) return;
      const skew = r.nowMs - Date.now();
      const now = Date.now() + skew;
      body.innerHTML = `<div class="ud-pad">${picker(list, cid)}
        <ul class="ud-list ud-quizzes">${r.quizzes.map((q) => { const st = quizState(q, now); return `<li class="ud-qcard"><div class="ud-qhead"><button class="ud-linkbtn" data-more="${h(q.id)}"><b>${h(q.title)}</b>
            <span class="muted">${T(`${q.questionCount} question${q.questionCount === 1 ? '' : 's'}`, `${q.questionCount} câu hỏi`)} · ${q.points} ${T('pts', 'điểm')} · ${q.timeLimitMin ? T(`${q.timeLimitMin} min`, `${q.timeLimitMin} phút`) : T('no time limit', 'không giới hạn thời gian')} · ${q.attempts ? T(`${q.used}/${q.attempts} attempts`, `${q.used}/${q.attempts} lần làm`) : T(`${q.used} attempt${q.used === 1 ? '' : 's'}`, `${q.used} lần làm`)}<br>${q.dueAtMs ? `${T('Due', 'Hạn')} ${h(when(q.dueAtMs))}` : T('No due date', 'Không có hạn')}${q.openAtMs && now < q.openAtMs ? ` · ${T('opens', 'mở lúc')} ${h(when(q.openAtMs))}` : ''}</span></button>
            <span class="ud-tag ${st.cls}">${h(st.label)}</span></div>
            ${opened === q.id ? more(q) : ''}
            ${st.go ? `<div class="row"><button class="btn ${q.open ? 'primary' : ''}" data-go="${h(q.id)}">${h(st.go)}</button></div>` : ''}</li>`; }).join('') || `<li class="muted">${T('No quizzes in this course yet.', 'Khóa học này chưa có bài kiểm tra nào.')}</li>`}</ul></div>`;
      const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { opened = null; C.setCurrentCourse(s.value); };
      body.querySelectorAll('[data-more]').forEach((b) => { b.onclick = () => { opened = opened === b.dataset.more ? null : b.dataset.more; draw(); }; });
      body.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => begin(cid, r.quizzes.find((q) => q.id === b.dataset.go)); });
    }
    function quizState(q, now) {
      const left = q.attempts ? q.attempts - q.used : Infinity;
      const closed = q.dueAtMs && now >= q.dueAtMs, notYet = q.openAtMs && now < q.openAtMs;
      if (q.open) return { cls: 'l', label: T('In progress', 'Đang làm'), go: T('Go back to it →', 'Quay lại làm tiếp →') };
      const go = !closed && !notYet && left > 0 ? (q.used ? T('Try again', 'Làm lại') : T('Start', 'Bắt đầu')) : '';
      if (q.released && q.best !== null) return { cls: 'g', label: `${q.best}/${q.points}`, go };
      if (q.used) return { cls: 's', label: q.released ? T('Submitted', 'Đã nộp') : T('Submitted · results not out yet', 'Đã nộp · chưa có kết quả'), go };
      if (notYet) return { cls: '', label: T('Not open yet', 'Chưa mở'), go: '' };
      if (closed) return { cls: 'm', label: T('Closed', 'Đã đóng'), go: '' };
      return { cls: '', label: T('To do', 'Cần làm'), go };
    }
    function more(q) {
      return `<div class="ud-card">${q.instructions ? `<p>${h(q.instructions).replace(/\n/g, '<br>')}</p>` : ''}
        ${q.attemptsDone.map((a) => `<p class="ud-k">${T('Attempt', 'Lần làm')} ${a.attempt}${typeof a.score === 'number' ? ` · ${a.score}/${a.points}` : ''}</p><p class="muted">${T('Submitted', 'Đã nộp')} ${h(when(a.submittedAtMs))}${a.timedOut ? T(' · time ran out', ' · hết giờ') : ''}${a.pending ? T(` · ${a.pending} answer${a.pending === 1 ? '' : 's'} still being graded`, ` · ${a.pending} câu trả lời đang được chấm`) : ''}</p>
          ${(a.questions || []).map((x, i) => `<p class="ud-qres">${x.pending ? '⏳' : x.right ? '✅' : '❌'} ${i + 1}. ${h(x.text)} <span class="muted">${x.pending ? T('being graded', 'đang chấm') : `${x.score}/${x.points}`}</span></p>`).join('')}`).join('')
        || `<p class="muted">${T('You haven’t taken this quiz yet.', 'Bạn chưa làm bài kiểm tra này.')}</p>`}
        ${q.attemptsDone.length && !q.released ? `<p class="muted">${T('Your instructor releases the results; your score shows here then.', 'Giảng viên sẽ công bố kết quả; khi đó điểm của bạn sẽ hiện ở đây.')}</p>` : ''}</div>`;
    }
    async function begin(cid, q) {
      if (!q.open) {
        const parts = [q.timeLimitMin ? T(`You have ${q.timeLimitMin} minutes once you start, and the clock keeps running if you close this.`, `Bạn có ${q.timeLimitMin} phút kể từ khi bắt đầu, và đồng hồ vẫn chạy nếu bạn đóng cửa sổ này.`) : T('There is no time limit.', 'Không giới hạn thời gian.'),
          q.attempts ? T(`This uses attempt ${q.used + 1} of ${q.attempts}.`, `Đây là lần làm thứ ${q.used + 1}/${q.attempts}.`) : '', q.dueAtMs ? T(`It closes ${when(q.dueAtMs)}.`, `Bài đóng lúc ${when(q.dueAtMs)}.`) : ''].filter(Boolean);
        if (!confirm(`${T('Start', 'Bắt đầu')} “${q.title}”?\n\n${parts.join('\n')}`)) return;
      }
      try {
        const r = await C.startQuiz(cid, q.id);
        taking = { cid, quiz: q, attemptId: r.attemptId, attempt: r.attempt, endsAtMs: r.endsAtMs, skew: r.nowMs - Date.now(), questions: r.questions, answers: r.answers || {}, dirty: false, saving: false, done: false };
        if (r.resumed) say(T('Back to your attempt: your saved answers are below.', 'Quay lại bài đang làm: các câu trả lời đã lưu ở bên dưới.'));
        draw();
      } catch (e) { say(C.errText(e)); draw(); }
    }
    function paintTaking() {
      const t = taking;
      const answered = t.questions.filter((q) => has(t.answers[q.id])).length;
      body.innerHTML = `<div class="ud-pad ud-taking"><div class="ud-qbar"><div><b>${h(t.quiz.title)}</b><br><span class="muted" data-st>${T(`${answered}/${t.questions.length} answered · saved`, `đã trả lời ${answered}/${t.questions.length} · đã lưu`)}</span></div>${t.endsAtMs ? '<span class="ud-timer" data-timer role="timer" aria-live="off"></span>' : ''}</div>
        ${t.questions.map((q, i) => `<div class="ud-card ud-q"><p class="ud-k">${i + 1}. ${h(q.text).replace(/\n/g, '<br>')} <span class="muted">(${q.points} ${T(q.points === 1 ? 'pt' : 'pts', 'điểm')})</span></p>
          ${q.type === 'mc' ? `${q.multiple ? `<p class="muted">${T('Select all that apply.', 'Chọn tất cả đáp án đúng.')}</p>` : ''}${q.options.map((o) => `<label class="ud-check"><input type="${q.multiple ? 'checkbox' : 'radio'}" name="a_${h(q.id)}" data-q="${h(q.id)}" value="${h(o.id)}" ${(t.answers[q.id] || []).includes(o.id) ? 'checked' : ''}> <span>${h(o.text)}</span></label>`).join('')}`
          : q.type === 'tf' ? ['true', 'false'].map((v) => `<label class="ud-check"><input type="radio" name="a_${h(q.id)}" data-q="${h(q.id)}" value="${v}" ${t.answers[q.id] === (v === 'true') ? 'checked' : ''}> <span>${v === 'true' ? T('True', 'Đúng') : T('False', 'Sai')}</span></label>`).join('')
          : `<input type="text" class="ud-qtext" data-q="${h(q.id)}" maxlength="2000" value="${h(t.answers[q.id] || '')}" aria-label="${T(`Your answer to question ${i + 1}`, `Câu trả lời của bạn cho câu ${i + 1}`)}" autocomplete="off" spellcheck="false">`}</div>`).join('')}
        <div class="row"><button class="btn primary" data-submit>${T('Submit', 'Nộp bài')}</button><button class="btn" data-later>${T('Save and leave', 'Lưu và rời đi')}</button></div>
        <p class="muted">${T('Answers are saved as you go.', 'Câu trả lời được lưu khi bạn làm.')}${t.endsAtMs ? T(' When the time is up, the quiz is submitted with what you’ve answered.', ' Khi hết giờ, bài sẽ được nộp với những gì bạn đã trả lời.') : ''}</p></div>`;
      body.querySelectorAll('[data-q]').forEach((el) => {
        const on = () => {
          const q = t.questions.find((x) => x.id === el.dataset.q);
          if (q.type === 'mc') t.answers[q.id] = [...body.querySelectorAll(`[data-q="${CSS.escape(q.id)}"]:checked`)].map((x) => x.value);
          else if (q.type === 'tf') t.answers[q.id] = el.value === 'true';
          else t.answers[q.id] = el.value;
          t.dirty = true; status();
          clearTimeout(saveTimer); saveTimer = setTimeout(() => save(false), q.type === 'short' ? 1500 : 300);
        };
        el.oninput = on; el.onchange = on;
      });
      body.querySelector('[data-submit]').onclick = () => {
        const blank = t.questions.length - t.questions.filter((q) => has(t.answers[q.id])).length;
        if (!confirm(blank ? T(`${blank} question${blank === 1 ? ' is' : 's are'} unanswered. Submit anyway?`, `Còn ${blank} câu chưa trả lời. Vẫn nộp bài?`) : T('Submit your answers? You can’t change them after this.', 'Nộp bài? Sau khi nộp bạn không thể sửa nữa.'))) return;
        save(true);
      };
      body.querySelector('[data-later]').onclick = async () => { await save(false); leave(T('Saved. Go back to it from the list before the time runs out.', 'Đã lưu. Hãy quay lại làm tiếp từ danh sách trước khi hết giờ.')); };
      stopTick();
      if (t.endsAtMs) { const run = () => { const left = t.endsAtMs - (Date.now() + t.skew); const el = body.querySelector('[data-timer]');
        if (el) { el.textContent = `⏱ ${mmss(left)}`; el.classList.toggle('low', left < 60000); } if (left <= 0 && !t.done) save(true, true); }; run(); tick = setInterval(run, 1000); }
    }
    const has = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '');
    function status(text) { const el = body.querySelector('[data-st]'); if (!el || !taking) return; const t = taking;
      const n = t.questions.filter((q) => has(t.answers[q.id])).length, st = text || (t.saving ? T('saving…', 'đang lưu…') : t.dirty ? T('not saved yet', 'chưa lưu') : T('saved', 'đã lưu'));
      el.textContent = T(`${n}/${t.questions.length} answered · ${st}`, `đã trả lời ${n}/${t.questions.length} · ${st}`); }
    async function save(submit, timeUp) {
      const t = taking; if (!t || t.done) return;
      clearTimeout(saveTimer);
      if (submit) t.done = true;
      t.saving = true; status();
      try {
        const r = await C.saveQuizAnswers(t.cid, t.attemptId, t.answers, submit);
        t.saving = false; t.dirty = false; status();
        if (r.submitted) leave(r.timedOut ? T('Time’s up: your quiz was submitted with the answers saved by then.', 'Hết giờ: bài của bạn đã được nộp với các câu trả lời đã lưu đến lúc đó.') : T('Submitted. Your score shows when your instructor releases the results.', 'Đã nộp. Điểm sẽ hiện khi giảng viên công bố kết quả.'));
      } catch (e) { t.saving = false; if (submit && !timeUp) t.done = false; status(T('not saved: check your connection', 'chưa lưu: hãy kiểm tra kết nối')); say(C.errText(e)); }
    }
    function leave(msg) { stopTick(); opened = taking ? taking.quiz.id : null; taking = null; if (msg) say(msg); draw(); }
    draw();
    const off = live(body, draw);
    return () => { if (taking && taking.dirty) save(false); stopTick(); clearTimeout(saveTimer); off(); };
  }

  const P = { quiz: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h5"/><path d="M13 17l2 2 4-4"/>', book: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v13"/>',
    task: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12l2 2 4-4"/>',
    grade: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/><path d="M14 5l2 2 4-4"/>',
    mods: '<rect x="4" y="4" width="16" height="5" rx="1.5"/><rect x="4" y="11" width="16" height="4" rx="1.5"/><rect x="4" y="17" width="16" height="4" rx="1.5"/>',
    ann: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10"/>',
    chat: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    office: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    family: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M12 20v-5"/><circle cx="12" cy="12" r="1.5"/>',
    group: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0"/>',
    ta: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>' };
  // Widget names follow the language too (read when the page loads; Settings → Language reloads it)
  window.UNI_WIDGETS = [
    { id: 'courses', title: T('🏛️ Courses', '🏛️ Khóa học'), iconPath: P.book, w: 340, h: 520, render: renderCourses, cat: 'cloud' },
    { id: 'uassign', title: T('🗂️ Assignments', '🗂️ Bài tập'), iconPath: P.task, w: 400, h: 560, render: renderAssign, cat: 'cloud' },
    { id: 'uquiz', title: T('📝 Quizzes', '📝 Bài kiểm tra'), iconPath: P.quiz, w: 440, h: 600, render: renderQuizzes, cat: 'cloud' },
    { id: 'grades', title: T('🎯 Grades', '🎯 Điểm'), iconPath: P.grade, w: 380, h: 520, render: renderGrades, cat: 'cloud' },
    { id: 'modules', title: T('🧭 Modules', '🧭 Học phần'), iconPath: P.mods, w: 420, h: 580, render: renderModules, cat: 'cloud' },
    { id: 'announce', title: T('📣 Announcements', '📣 Thông báo'), iconPath: P.ann, w: 380, h: 520, render: renderAnnouncements, cat: 'cloud' },
    { id: 'discuss', title: T('💬 Discussions', '💬 Thảo luận'), iconPath: P.chat, w: 420, h: 580, render: renderDiscussions, cat: 'cloud' },
    { id: 'ucal', title: T('📅 Calendar', '📅 Lịch'), iconPath: P.cal, w: 760, h: 580, render: renderCalendar, cat: 'cloud' },
    { id: 'office', title: T('🙋 Office hours', '🙋 Giờ tiếp sinh viên'), iconPath: P.office, w: 400, h: 540, render: renderOfficeHours, cat: 'cloud' },
    { id: 'ugroup', title: T('👥 Group project', '👥 Dự án nhóm'), iconPath: P.group, w: 420, h: 600, render: renderGroup, cat: 'cloud' },
    { id: 'ufamily', title: T('👪 Family view', '👪 Chia sẻ với gia đình'), iconPath: P.family, w: 420, h: 640, render: renderFamily, cat: 'me' },
    { id: 'tadesk', title: '🧑‍🏫 TAdeck', iconPath: P.ta, w: 840, h: 640, render: renderTaDesk, cat: 'cloud' },
  ];
})();

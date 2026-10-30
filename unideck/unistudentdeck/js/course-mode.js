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
  // English or Vietnamese from <html lang>: TeachersDeck's language setting in LectureDeck, Settings → Language (js/lang.js) in
  // UniStudentDeck's TAdeck. Other TeachersDeck languages fall back to English here. live() redraws when it changes.
  const VI = () => /^vi/i.test(document.documentElement.lang || '');
  const T = (en, vi) => (VI() ? vi : en);
  const LOC = () => (VI() ? 'vi-VN' : []);
  const when = (ms) => (ms ? new Date(ms).toLocaleString(LOC(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : T('No due date', 'Không có hạn'));
  const localInput = (ms) => { if (!ms) return ''; const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const CAT_EN = { assignments: 'Assignments', quizzes: 'Quizzes', exams: 'Exams', participation: 'Participation' };
  const CAT_VI = { assignments: 'Bài tập', quizzes: 'Bài kiểm tra', exams: 'Thi', participation: 'Chuyên cần' };
  const CAT_NAMES = new Proxy(CAT_EN, { get: (o, k) => (VI() ? CAT_VI : o)[k] });   // CAT_NAMES[k] in the current language
  /* Phase 4: published quizzes count like assignments in the Gradebook, totals and Course stats (grades/{quizId}_{uid}). */
  const quizItems = (qs) => (qs || []).filter((q) => q.published).map((q) => ({ id: q.id, title: `📝 ${q.title}`, points: q.points, category: q.category, dueAtMs: q.dueAtMs || null, kind: 'quiz' }));

  function gate(body, redraw) {
    const s = C.state();
    if (TA_HOST) {   // UniStudentDeck's TAdeck has already signed the student in; staffCourses() keeps only TA courses
      if (s.user && s.role === 'unistudent') return true;
      body.innerHTML = `<div class="cm-empty"><p>${T('Sign in from 🏛️ Courses first.', 'Hãy đăng nhập ở 🏛️ Khóa học trước.')}</p></div>`;
      return false;
    }
    if (!C.available()) {
      body.innerHTML = `<div class="cm-empty"><p>${T('Course mode needs the UniDeck backend, which isn’t set up in this build.', 'Chế độ khóa học cần máy chủ UniDeck, bản này chưa được cài đặt.')}</p><div class="btn-row"><button class="wbtn primary" data-demo>${T('Try the demo', 'Dùng thử bản demo')}</button></div></div>`;
      body.querySelector('[data-demo]').onclick = () => (typeof TD_DEMO !== 'undefined' ? TD_DEMO.enter() : (location.search = '?demo=1'));
      return false;
    }
    if (s.user && s.role && s.role !== 'teacher') {
      body.innerHTML = `<div class="cm-empty"><p>${T(`${h(s.user.email)} is a ${h(s.role)} account. Sign in with your lecturer account.`, `${h(s.user.email)} là tài khoản ${h(s.role)}. Hãy đăng nhập bằng tài khoản giảng viên.`)}</p><div class="btn-row"><button class="wbtn" data-out>${T('Sign out', 'Đăng xuất')}</button></div></div>`;
      body.querySelector('[data-out]').onclick = () => C.signOut();
      return false;
    }
    if (!s.user || s.role !== 'teacher') {
      body.innerHTML = `<div class="cm-empty"><p><b>${T('Sign in to run your courses', 'Đăng nhập để quản lý khóa học')}</b></p><p class="cm-lo">${T('The same Google account you use for TeachersDeck works here.', 'Dùng được chính tài khoản Google bạn dùng cho TeachersDeck.')}${C.demo ? T(' (Demo: no real account is used.)', ' (Demo: không dùng tài khoản thật.)') : ''}</p>
        <div class="btn-row"><button class="wbtn primary" data-in ${s.busy ? 'disabled' : ''}>${T('Sign in with Google', 'Đăng nhập bằng Google')}</button></div></div>`;
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
  const picker = (list, cur) => (list.length ? `<label class="cm-pick">${T('Course', 'Khóa học')} <select data-course>${list.map((c) => `<option value="${h(c.courseId)}" ${c.courseId === cur ? 'selected' : ''}>${h(c.title)}${c.section ? ' · ' + h(c.section) : ''}</option>`).join('')}</select></label>` : '');
  function wirePicker(body, extra) { const s = body.querySelector('[data-course]'); if (s) s.onchange = () => { if (extra) extra(); sel.set(s.value); }; }
  function live(draw) {
    const off = C.onChange(() => draw());
    const on = () => draw();
    window.addEventListener(EVT, on);
    const lang = new MutationObserver(() => draw());   // TeachersDeck switches language without a reload
    lang.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => { off(); window.removeEventListener(EVT, on); lang.disconnect(); };
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
        <div class="cm-row">${picker(list, cid)}<button class="wbtn" data-new>${T('＋ New course', '＋ Khóa học mới')}</button></div>
        <div class="cm-card"><div class="cm-split"><div><p class="cm-k">${h(course.title)}</p><p class="cm-lo">${h([course.term, course.section].filter(Boolean).join(' · '))}${course.archived ? T(' · ended', ' · đã kết thúc') : ''}</p></div>
          ${mine.role === 'instructor' ? `<button class="wbtn" data-edit>${T('Edit', 'Sửa')}</button>` : ''}</div>
          <div class="cm-code"><span class="cm-lo">${T('Course code', 'Mã khóa học')}</span><b data-code>${h(course.code || '—')}</b>
            <button class="wbtn" data-copy>${T('Copy', 'Sao chép')}</button>${mine.role === 'instructor' ? `<button class="wbtn" data-regen title="${T('The old code stops working', 'Mã cũ sẽ không dùng được nữa')}">${T('New code', 'Mã mới')}</button>` : ''}</div>
          <p class="cm-lo">${T('Students join in UniStudentDeck → Courses with this code.', 'Sinh viên tham gia bằng mã này trong UniStudentDeck → Khóa học.')}</p>
          <p><span class="cm-lo">${T('Grading:', 'Cách tính điểm:')}</span> ${Object.entries(course.weights || { assignments: 100 }).map(([k, w]) => `${CAT_NAMES[k] || h(k)} ${w}%`).join(' · ')}</p>
          <p><span class="cm-lo">${T('Late work:', 'Bài nộp muộn:')}</span> ${pol.mode === 'closed' ? T('not accepted', 'không nhận') : pol.mode === 'penalty' ? T(`−${pol.perDayPct}% a day${pol.maxDays ? `, nothing after ${pol.maxDays} days` : ''}`, `−${pol.perDayPct}% mỗi ngày${pol.maxDays ? `, không được điểm sau ${pol.maxDays} ngày` : ''}`) : T('accepted, no penalty', 'nhận, không trừ điểm')}</p></div>
        <div class="cm-card"><p class="cm-k">${T('People', 'Thành viên')} <span class="cm-lo">${T(`${students.length} student${students.length === 1 ? '' : 's'}`, `${students.length} sinh viên`)}${tas.length ? ` · ${tas.length} ${T('TA', 'trợ giảng')}` : ''}</span></p>
          ${roster.length ? `<table class="cm-tbl"><tbody>${roster.map((r) => `<tr><td>${h(r.name)}<br><span class="cm-lo">${h(r.email || '')}</span></td><td>${r.under18 ? `<span class="cm-tag">${T('under 18', 'dưới 18')}</span>` : ''}</td><td>${mine.role === 'instructor' && !(r.under18 && r.role !== 'ta') ? `<button class="wbtn" data-role="${h(r.uid)}" data-to="${r.role === 'ta' ? 'student' : 'ta'}">${r.role === 'ta' ? T('TA ✓', 'Trợ giảng ✓') : T('Make TA', 'Chọn làm trợ giảng')}</button>` : h(r.role === 'ta' ? T('TA', 'trợ giảng') : r.role === 'student' ? T('student', 'sinh viên') : r.role)}</td></tr>`).join('')}</tbody></table>` : `<p class="cm-lo">${T('Nobody has joined yet. Share the course code.', 'Chưa có ai tham gia. Hãy chia sẻ mã khóa học.')}</p>`}</div></div>`;
      wirePicker(body);
      body.querySelector('[data-new]').onclick = () => { mode = 'new'; draw(); };
      const ed = body.querySelector('[data-edit]'); if (ed) ed.onclick = () => { mode = 'edit'; draw(); };
      body.querySelector('[data-copy]').onclick = () => { try { navigator.clipboard.writeText(course.code); say(T('Course code copied.', 'Đã sao chép mã khóa học.')); } catch (e) { say(course.code); } };
      const rg = body.querySelector('[data-regen]'); if (rg) rg.onclick = async () => { if (!confirm(T('Make a new course code? The old one stops working.', 'Tạo mã khóa học mới? Mã cũ sẽ không dùng được nữa.'))) return; try { const r = await C.regenerateCode(cid); say(`${T('New code', 'Mã mới')}: ${r.code}`); draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelectorAll('[data-role]').forEach((b) => { b.onclick = async () => { try { await C.setMemberRole(cid, b.dataset.role, b.dataset.to); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    function courseForm(course, list) {
      const w = (course && course.weights) || { assignments: 100 };
      const pol = M.cleanLatePolicy(course && course.latePolicy);
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${course ? T('Edit course', 'Sửa khóa học') : T('New course', 'Khóa học mới')}</p>
        <label class="cm-lbl">${T('Title', 'Tên khóa học')}<input name="title" required maxlength="120" value="${h(course ? course.title : '')}" placeholder="${T('e.g. Academic Writing', 'ví dụ Viết học thuật')}"></label>
        <div class="cm-two"><label class="cm-lbl">${T('Term', 'Học kỳ')}<input name="term" maxlength="40" value="${h(course ? course.term : '')}" placeholder="${T('Fall 2026', 'HK1 2026-2027')}"></label>
        <label class="cm-lbl">${T('Section', 'Lớp')}<input name="section" maxlength="40" value="${h(course ? course.section : '')}" placeholder="ENG 201-02"></label></div>
        <p class="cm-lo">${T('Grading weights (must add up to 100)', 'Trọng số điểm (tổng phải bằng 100)')}</p>
        <div class="cm-four">${M.CATEGORIES.map((k) => `<label class="cm-lbl">${CAT_NAMES[k]}<input type="number" min="0" max="100" step="1" name="w_${k}" value="${w[k] || 0}"></label>`).join('')}</div>
        <p class="cm-lo" data-sum></p>
        <div class="cm-two"><label class="cm-lbl">${T('Late work', 'Bài nộp muộn')}<select name="mode"><option value="accept" ${pol.mode === 'accept' ? 'selected' : ''}>${T('Accept, no penalty', 'Nhận, không trừ điểm')}</option><option value="penalty" ${pol.mode === 'penalty' ? 'selected' : ''}>${T('Accept with a penalty', 'Nhận, có trừ điểm')}</option><option value="closed" ${pol.mode === 'closed' ? 'selected' : ''}>${T('Don’t accept', 'Không nhận')}</option></select></label>
        <label class="cm-lbl" data-pen>${T('Penalty per day (%)', 'Trừ mỗi ngày (%)')}<input type="number" min="0" max="100" name="perDayPct" value="${pol.perDayPct || 10}"></label></div>
        <label class="cm-lbl" data-pen>${T('No credit after this many days late (0 = no limit)', 'Không được điểm nếu muộn quá số ngày này (0 = không giới hạn)')}<input type="number" min="0" max="60" name="maxDays" value="${pol.maxDays || 0}"></label>
        ${course ? `<label class="cm-check"><input type="checkbox" name="archived" ${course.archived ? 'checked' : ''}> ${T('Course has ended (no new students or submissions)', 'Khóa học đã kết thúc (không nhận sinh viên hay bài nộp mới)')}</label>` : ''}
        <div class="btn-row cm-left"><button class="wbtn primary">${course ? T('Save', 'Lưu') : T('Create course', 'Tạo khóa học')}</button>${list.length ? `<button type="button" class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button>` : ''}</div></form>`;
      const f = body.querySelector('[data-f]');
      const sync = () => { const sum = M.CATEGORIES.reduce((a, k) => a + (Number(f['w_' + k].value) || 0), 0); f.querySelector('[data-sum]').textContent = T(`Total: ${sum}%${sum === 100 ? '' : ' — needs to be 100'}`, `Tổng: ${sum}%${sum === 100 ? '' : ' — cần bằng 100'}`);
        f.querySelectorAll('[data-pen]').forEach((el) => { el.style.display = f.mode.value === 'penalty' ? '' : 'none'; }); };
      f.oninput = sync; sync();
      const cancel = f.querySelector('[data-cancel]'); if (cancel) cancel.onclick = () => { mode = 'view'; draw(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const weights = {}; M.CATEGORIES.forEach((k) => { const v = Number(f['w_' + k].value) || 0; if (v) weights[k] = v; });
        const data = { title: f.title.value, term: f.term.value, section: f.section.value, weights, latePolicy: { mode: f.mode.value, perDayPct: Number(f.perDayPct.value), maxDays: Number(f.maxDays.value) } };
        try {
          if (course) { if (f.archived) data.archived = f.archived.checked; await C.updateCourse(course.courseId, data); say(T('Course saved.', 'Đã lưu khóa học.')); }
          else { const r = await C.createCourse(data); sel.set(r.courseId); say(T(`Course created. Code: ${r.code}`, `Đã tạo khóa học. Mã: ${r.code}`)); }
          mode = 'view'; draw();
        } catch (er) { say(C.errText(er)); }
      };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Course assignments ---------------- */
  const SUBMIT = () => ({ any: T('text, link or files', 'văn bản, liên kết hoặc tệp'), text: T('text', 'văn bản'), file: T('a file', 'một tệp'), link: T('a link', 'liên kết') });
  function renderAssignments(body) {
    let seq = 0, editing = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
      let course, as;
      try { [course, as] = await Promise.all([C.course(cid), C.assignments(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (editing) return form(course, editing === 'new' ? null : as.find((a) => a.id === editing), cid);
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-add>${T('＋ New', '＋ Mới')}</button></div>
        <ul class="cm-list">${as.map((a) => `<li><button class="cm-linkbtn" data-ed="${h(a.id)}"><b>${h(a.title)}</b><span class="cm-lo">${T('Due', 'Hạn')} ${h(when(a.dueAtMs))} · ${a.points} ${T('pts', 'điểm')} · ${h(CAT_NAMES[a.category] || a.category)}${a.rubric && a.rubric.length ? ` · ${T('rubric', 'tiêu chí')} (${a.rubric.length})` : ''} · ${h(SUBMIT()[a.submitType] || a.submitType)}${a.group ? T(' · 👥 group', ' · 👥 nhóm') : ''}</span></button>
          <button class="cm-x" data-del="${h(a.id)}" aria-label="${T('Delete', 'Xóa')} ${h(a.title)}" title="${T('Delete', 'Xóa')}">×</button></li>`).join('') || `<li class="cm-lo">${T('No assignments yet.', 'Chưa có bài tập nào.')}</li>`}</ul></div>`;
      wirePicker(body);
      body.querySelector('[data-add]').onclick = () => { editing = 'new'; draw(); };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm(T('Delete this assignment?', 'Xóa bài tập này?'))) return; try { await C.deleteAssignment(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    function form(course, a, cid) {
      const rubric = a && a.rubric ? a.rubric.map((r) => ({ ...r })) : [];
      const cats = Object.keys(course.weights || { assignments: 100 });
      const pol = a && a.latePolicy ? M.cleanLatePolicy(a.latePolicy) : null;
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${a ? T('Edit assignment', 'Sửa bài tập') : T('New assignment', 'Bài tập mới')}</p>
        <label class="cm-lbl">${T('Title', 'Tiêu đề')}<input name="title" required maxlength="120" value="${h(a ? a.title : '')}"></label>
        <label class="cm-lbl">${T('Instructions', 'Hướng dẫn')}<textarea name="instructions" rows="4" maxlength="8000">${h(a ? a.instructions : '')}</textarea></label>
        <div class="cm-two"><label class="cm-lbl">${T('Due', 'Hạn nộp')}<input type="datetime-local" name="due" value="${localInput(a && a.dueAtMs)}"></label>
        <label class="cm-lbl">${T('Category', 'Nhóm điểm')}<select name="category">${cats.map((k) => `<option value="${k}" ${a && a.category === k ? 'selected' : ''}>${CAT_NAMES[k] || k}</option>`).join('')}</select></label></div>
        <div class="cm-two"><label class="cm-lbl">${T('Students submit', 'Sinh viên nộp')}<select name="submitType">${[['any', T('Text, a link or files', 'Văn bản, liên kết hoặc tệp')], ['text', T('Text only', 'Chỉ văn bản')], ['file', T('A file', 'Một tệp')], ['link', T('A link', 'Một liên kết')]].map(([v, l]) => `<option value="${v}" ${(a ? a.submitType : 'any') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="cm-lbl">${T('Submissions allowed (0 = unlimited)', 'Số lần được nộp (0 = không giới hạn)')}<input type="number" min="0" max="20" name="attempts" value="${a ? a.attempts : 1}"></label></div>
        <label class="cm-check"><input type="checkbox" name="group" ${a && a.group ? 'checked' : ''}> ${T('👥 Group assignment: one submission per group, shared by its members (set groups in 👥 Groups)', '👥 Bài tập nhóm: mỗi nhóm nộp một bài, dùng chung cho các thành viên (chia nhóm trong 👥 Nhóm)')}</label>
        <label class="cm-lbl">${T('Late work', 'Bài nộp muộn')}<select name="late"><option value="">${T('Course policy', 'Theo quy định của khóa học')}</option>${[['accept', T('Accept, no penalty', 'Nhận, không trừ điểm')], ['penalty', T('Penalty: same rate as the course', 'Trừ điểm: cùng mức của khóa học')], ['closed', T('Don’t accept', 'Không nhận')]].map(([v, l]) => `<option value="${v}" ${pol && pol.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <p class="cm-lo">${T('Rubric (optional — its rows add up to the points)', 'Tiêu chí chấm (không bắt buộc — tổng các dòng là điểm tối đa)')}</p><div data-rub></div>
        <div class="btn-row cm-left"><button type="button" class="wbtn" data-addrow>${T('＋ Rubric row', '＋ Dòng tiêu chí')}</button></div>
        <label class="cm-lbl" data-pts>${T('Points', 'Điểm')}<input type="number" min="0.5" step="0.5" name="points" value="${a ? a.points : 10}"></label>
        <div class="btn-row cm-left"><button class="wbtn primary">${T('Save', 'Lưu')}</button><button type="button" class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>`;
      const f = body.querySelector('[data-f]'), box = body.querySelector('[data-rub]');
      const paint = () => {
        box.innerHTML = rubric.map((r, i) => `<div class="cm-rrow"><input aria-label="${T('Criterion', 'Tiêu chí')}" placeholder="${T('Criterion', 'Tiêu chí')}" maxlength="200" data-i="${i}" data-k="criterion" value="${h(r.criterion)}"><input type="number" aria-label="${T('Points', 'Điểm')}" min="0.5" step="0.5" data-i="${i}" data-k="points" value="${r.points}"><button type="button" class="cm-x" data-rm="${i}" aria-label="${T('Remove row', 'Xóa dòng')}">×</button></div>`).join('');
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
        try { await C.saveAssignment(cid, data); say(T('Assignment saved.', 'Đã lưu bài tập.')); editing = null; draw(); } catch (er) { say(C.errText(er)); }
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
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
      let course, as, roster, grades;
      try { [course, as, roster, grades] = await Promise.all([C.course(cid), C.assignments(cid), C.roster(cid), C.grades(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (!as.some((a) => a.id === aid)) aid = (as.filter((a) => a.dueAtMs && a.dueAtMs < Date.now()).pop() || as[0] || {}).id || null;   // the most recent one past its due date
      const subs = aid ? await C.submissions(cid, aid) : [];
      if (my !== seq) return;
      const a = as.find((x) => x.id === aid);
      const students = roster.filter((r) => r.role === 'student');
      const gOf = (u) => grades.find((g) => g.assignmentId === aid && g.uid === u), sOf = (u) => subs.find((s) => s.uid === u);
      const unreleased = students.filter((s) => { const g = gOf(s.uid); return g && !g.released; }).length;
      const stat = (u) => { const g = gOf(u), s = sOf(u); if (g && g.needsRegrade) return ['r', T('Resubmitted', 'Đã nộp lại')]; if (g) return [g.released ? 'g' : 'd', `${g.finalScore}/${a.points}${g.released ? '' : T(' · draft', ' · nháp')}`]; if (s) return [s.late ? 'l' : 's', s.late ? T(`Late ${s.lateDays}d`, `Muộn ${s.lateDays} ngày`) : T('Submitted', 'Đã nộp')]; return ['', a && a.dueAtMs && a.dueAtMs < Date.now() ? T('Missing', 'Chưa nộp') : '—']; };
      body.innerHTML = `<div class="cm-pad cm-grader"><div class="cm-row">${picker(list, cid)}
        ${as.length ? `<label class="cm-pick">${T('Assignment', 'Bài tập')} <select data-asg>${as.map((x) => `<option value="${h(x.id)}" ${x.id === aid ? 'selected' : ''}>${h(x.title)}</option>`).join('')}</select></label>` : ''}
        ${a ? `<button class="wbtn primary" data-rel ${unreleased ? '' : 'disabled'}>${T(`Release ${unreleased || ''} grade${unreleased === 1 ? '' : 's'}`, `Công bố ${unreleased || ''} điểm`)}</button>` : ''}</div>
        ${!a ? `<p class="cm-lo">${T('No assignments yet.', 'Chưa có bài tập nào.')}</p>` : `<div class="cm-cols"><ul class="cm-list cm-people">${students.map((s) => { const [cls, t] = stat(s.uid); return `<li class="${s.uid === uid ? 'on' : ''}"><button class="cm-linkbtn" data-u="${h(s.uid)}"><b>${h(s.name)}</b></button><span class="cm-tag ${cls}">${h(t)}</span></li>`; }).join('') || `<li class="cm-lo">${T('No students yet.', 'Chưa có sinh viên nào.')}</li>`}</ul>
          <div class="cm-sub" data-sub>${uid ? '' : `<p class="cm-lo">${T(`${subs.length} of ${students.length} submitted. Pick a student.`, `${subs.length}/${students.length} đã nộp. Chọn một sinh viên.`)}</p>`}</div></div>`}</div>`;
      wirePicker(body, () => { aid = null; uid = null; });
      const sa = body.querySelector('[data-asg]'); if (sa) sa.onchange = () => { aid = sa.value; uid = null; draw(); };
      const rel = body.querySelector('[data-rel]'); if (rel) rel.onclick = async () => { if (!confirm(T(`Release ${unreleased} grade${unreleased === 1 ? '' : 's'} to students?`, `Công bố ${unreleased} điểm cho sinh viên?`))) return; try { const r = await C.release(cid, aid); say(T(`${r.released} grade${r.released === 1 ? '' : 's'} released.`, `Đã công bố ${r.released} điểm.`)); draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => { uid = b.dataset.u; draw(); }; });
      if (a && uid) paper(body.querySelector('[data-sub]'), cid, course, a, students.find((s) => s.uid === uid), sOf(uid), gOf(uid));
    }
    async function paper(el, cid, course, a, st, s, g) {
      if (!st) return;
      const pen = s ? M.latePenaltyPct(a.latePolicy || course.latePolicy, s.lateDays) : 0;
      const files = await Promise.all(((s && s.files) || []).map(async (f) => ({ ...f, url: await C.fileUrl(f.path).catch(() => null) })));
      const grp = a.group && s && s.groupId ? s : null;
      el.innerHTML = `<p class="cm-k">${h(st.name)}${grp ? ` <span class="cm-tag">👥 ${h(grp.groupName || T('group', 'nhóm'))}</span>` : ''}</p>
        ${grp ? `<p class="cm-lo">${T(`Group submission by ${h(grp.submittedByName || '')} for ${(grp.groupUids || []).length} students.`, `Bài nhóm do ${h(grp.submittedByName || '')} nộp cho ${(grp.groupUids || []).length} sinh viên.`)}</p>` : a.group ? `<p class="cm-lo">${T('Group assignment: no submission from this student’s group yet.', 'Bài tập nhóm: nhóm của sinh viên này chưa nộp.')}</p>` : ''}
        ${s ? `<p class="cm-lo">${T('Submitted', 'Đã nộp')} ${h(when(s.submittedAtMs))}${s.attempt > 1 ? ` · ${T('attempt', 'lần')} ${s.attempt}` : ''}${s.late ? ` · <b class="cm-late">${T(`${s.lateDays} day${s.lateDays === 1 ? '' : 's'} late`, `muộn ${s.lateDays} ngày`)} (−${pen}%)</b>` : T(' · on time', ' · đúng hạn')}</p>
          ${s.text ? `<div class="cm-text">${h(s.text).replace(/\n/g, '<br>')}</div>` : ''}${s.link ? `<p><a href="${h(s.link)}" target="_blank" rel="noopener">${h(s.link)}</a></p>` : ''}
          ${files.map((f) => `<p>📎 ${f.url ? `<a href="${h(f.url)}" target="_blank" rel="noopener">${h(f.name)}</a>` : h(f.name)}</p>`).join('')}` : `<p class="cm-lo">${T('No submission. You can still enter a grade.', 'Chưa nộp bài. Bạn vẫn có thể nhập điểm.')}</p>`}
        <form data-g class="cm-card">${a.rubric && a.rubric.length ? `<table class="cm-tbl"><tbody>${a.rubric.map((r) => `<tr><td>${h(r.criterion)}</td><td><input type="number" min="0" max="${r.points}" step="0.5" name="r_${h(r.id)}" value="${g && g.rubricScores[r.id] !== undefined ? g.rubricScores[r.id] : ''}" aria-label="${h(r.criterion)}"> / ${r.points}</td></tr>`).join('')}</tbody></table>`
          : `<label class="cm-lbl">${T(`Score (out of ${a.points})`, `Điểm (trên ${a.points})`)}<input type="number" min="0" max="${a.points}" step="0.5" name="score" value="${g ? g.score : ''}" required></label>`}
          <p class="cm-lo" data-calc></p>
          <label class="cm-lbl">${T('Feedback', 'Nhận xét')}<textarea name="feedback" rows="4" maxlength="5000">${h(g ? g.feedback : '')}</textarea></label>
          ${grp && (grp.groupUids || []).length > 1 ? `<label class="cm-check"><input type="checkbox" name="whole" checked> ${T(`Give this grade to the whole group (${grp.groupUids.length} students)`, `Cho cả nhóm cùng điểm này (${grp.groupUids.length} sinh viên)`)}</label>` : ''}
          <div class="btn-row cm-left"><button class="wbtn primary">${T('Save grade', 'Lưu điểm')}</button>${g ? `<span class="cm-lo">${g.released ? T('Released to the student', 'Đã công bố cho sinh viên') : T('Draft: not released yet', 'Nháp: chưa công bố')}</span>` : ''}</div></form>`;
      const f = el.querySelector('[data-g]');
      const calc = () => {
        const raw = a.rubric && a.rubric.length ? M.rubricScore(a.rubric, Object.fromEntries(a.rubric.map((r) => [r.id, Number(f['r_' + r.id].value)]))).score : Number(f.score.value) || 0;
        f.querySelector('[data-calc]').textContent = T(`Score ${raw} / ${a.points}${pen ? ` → ${M.finalScore(raw, pen)} after the late penalty` : ''}`, `Điểm ${raw} / ${a.points}${pen ? ` → ${M.finalScore(raw, pen)} sau khi trừ điểm muộn` : ''}`);
      };
      f.oninput = calc; calc();
      f.onsubmit = async (e) => {
        e.preventDefault();
        const data = { feedback: f.feedback.value, wholeGroup: !!(f.whole && f.whole.checked) };
        if (a.rubric && a.rubric.length) data.rubricScores = Object.fromEntries(a.rubric.map((r) => [r.id, Number(f['r_' + r.id].value) || 0])); else data.score = Number(f.score.value);
        try { const r = await C.grade(cid, a.id, st.uid, data); say(T(`Saved: ${r.finalScore}/${a.points}${r.graded > 1 ? ` for ${r.graded} students` : ''}.`, `Đã lưu: ${r.finalScore}/${a.points}${r.graded > 1 ? ` cho ${r.graded} sinh viên` : ''}.`)); draw(); } catch (er) { say(C.errText(er)); }
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
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
      let course, as, roster, grades, qz;
      try { [course, as, roster, grades, qz] = await Promise.all([C.course(cid), C.assignments(cid), C.roster(cid), C.grades(cid), C.quizzes(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      as = [...as, ...quizItems(qz)].sort((a, b) => (a.dueAtMs || 9e15) - (b.dueAtMs || 9e15));
      const students = roster.filter((r) => r.role === 'student');
      const cell = (a, u) => grades.find((g) => g.assignmentId === a.id && g.uid === u);
      const avg = (a) => { const gs = grades.filter((g) => g.assignmentId === a.id); return gs.length ? M.round2(gs.reduce((s, g) => s + g.finalScore, 0) / gs.length) : null; };
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-csv>${T('Export CSV', 'Xuất CSV')}</button></div>
        <div class="cm-scroll"><table class="cm-tbl cm-book"><thead><tr><th>${T('Student', 'Sinh viên')}</th>${as.map((a) => `<th title="${h(a.title)}">${h(a.title.length > 18 ? a.title.slice(0, 17) + '…' : a.title)}<br><span class="cm-lo">/${a.points}</span></th>`).join('')}<th>${T('Total', 'Tổng')}</th></tr></thead>
        <tbody>${students.map((s) => { const mine = grades.filter((g) => g.uid === s.uid); const tot = M.courseTotal(course.weights, as, mine.map((g) => ({ ...g, released: true })));
          return `<tr><td>${h(s.name)}</td>${as.map((a) => { const g = cell(a, s.uid); return `<td class="${g && !g.released ? 'cm-draft' : ''}">${g ? g.finalScore : ''}</td>`; }).join('')}<td><b>${tot.percent === null ? '' : tot.percent + '%'}</b></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td class="cm-lo">${T('Average', 'Trung bình')}</td>${as.map((a) => `<td class="cm-lo">${avg(a) ?? ''}</td>`).join('')}<td></td></tr></tfoot></table></div>
        <p class="cm-lo">${T('Shaded = graded but not released. Totals use the course weights over the categories graded so far, counting drafts. Students see only released grades.', 'Ô tô màu = đã chấm nhưng chưa công bố. Tổng điểm dùng trọng số của khóa học cho các nhóm đã có điểm, tính cả điểm nháp. Sinh viên chỉ thấy điểm đã công bố.')}</p></div>`;
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
  const KIND_EN = { page: ['📄', 'Page'], link: ['🔗', 'Link'], reading: ['📚', 'Reading'], assignment: ['🗂️', 'Assignment'] };
  const KIND_VI = { page: ['📄', 'Trang'], link: ['🔗', 'Liên kết'], reading: ['📚', 'Bài đọc'], assignment: ['🗂️', 'Bài tập'] };
  const KIND = new Proxy(KIND_EN, { get: (o, k) => (VI() ? KIND_VI : o)[k] });

  /* ---------------- Modules (UniDeck phase 2) ---------------- */
  function renderModules(body) {
    let seq = 0, editing = null;
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
      let mods, as, roster, prog;
      try { [mods, as, roster, prog] = await Promise.all([C.modules(cid), C.assignments(cid), C.roster(cid), C.progressAll(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (editing) return form(cid, editing === 'new' ? null : mods.find((m) => m.id === editing), as);
      const students = roster.filter((r) => r.role === 'student').length;
      const doneBy = (m) => { if (!students || !m.items.length) return null; const all = prog.filter((p) => m.items.every((i) => p.done[i.id])).length; return Math.round((all / students) * 100); };
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-add>${T('＋ New module', '＋ Học phần mới')}</button></div>
        <ul class="cm-list">${mods.map((m, k) => { const open = !m.releaseAtMs || m.releaseAtMs <= Date.now(), pct = doneBy(m);
          return `<li><div class="cm-ord"><button class="cm-x" data-up="${k}" ${k ? '' : 'disabled'} aria-label="${T('Move up', 'Lên trên')}" title="${T('Move up', 'Lên trên')}">↑</button><button class="cm-x" data-down="${k}" ${k < mods.length - 1 ? '' : 'disabled'} aria-label="${T('Move down', 'Xuống dưới')}" title="${T('Move down', 'Xuống dưới')}">↓</button></div>
            <button class="cm-linkbtn" data-ed="${h(m.id)}"><b>${h(m.title)}</b><span class="cm-lo">${T(`${m.items.length} item${m.items.length === 1 ? '' : 's'}`, `${m.items.length} mục`)} · ${open ? T('open', 'đang mở') : '🔒 ' + T('opens', 'mở lúc') + ' ' + h(when(m.releaseAtMs))}${pct === null ? '' : T(` · ${pct}% of students finished it`, ` · ${pct}% sinh viên đã hoàn thành`)}</span></button>
            <button class="cm-x" data-del="${h(m.id)}" aria-label="${T('Delete', 'Xóa')} ${h(m.title)}" title="${T('Delete', 'Xóa')}">×</button></li>`; }).join('') || `<li class="cm-lo">${T('No modules yet. A module is usually one week: a page, the readings, links and that week’s assignment.', 'Chưa có học phần nào. Mỗi học phần thường là một tuần: một trang, các bài đọc, liên kết và bài tập của tuần đó.')}</li>`}</ul></div>`;
      wirePicker(body, () => { editing = null; });
      body.querySelector('[data-add]').onclick = () => { editing = 'new'; draw(); };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      const move = async (k, d) => { const ids = mods.map((m) => m.id); const [x] = ids.splice(k, 1); ids.splice(k + d, 0, x); try { await C.reorderModules(cid, ids); draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => move(Number(b.dataset.up), -1); });
      body.querySelectorAll('[data-down]').forEach((b) => { b.onclick = () => move(Number(b.dataset.down), 1); });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm(T('Delete this module? Its assignments, submissions and grades stay.', 'Xóa học phần này? Bài tập, bài nộp và điểm vẫn được giữ.'))) return; try { await C.deleteModule(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    async function form(cid, m, as) {
      const content = m ? ((await C.moduleContent(cid, m.id)) || { items: {} }).items : {};
      const items = m ? m.items.map((i) => ({ ...i, url: (content[i.id] || {}).url || '', body: (content[i.id] || {}).body || '' })) : [];
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${m ? T('Edit module', 'Sửa học phần') : T('New module', 'Học phần mới')}</p>
        <label class="cm-lbl">${T('Title', 'Tiêu đề')}<input name="title" required maxlength="120" value="${h(m ? m.title : '')}" placeholder="${T('e.g. Week 3: Sources and evidence', 'ví dụ Tuần 3: Nguồn và bằng chứng')}"></label>
        <label class="cm-lbl">${T('Opens for students (empty = straight away)', 'Mở cho sinh viên (để trống = mở ngay)')}<input type="datetime-local" name="release" value="${localInput(m && m.releaseAtMs)}"></label>
        <p class="cm-lo">${T('Items, in the order students see them', 'Các mục, theo thứ tự sinh viên thấy')}</p><div data-items></div>
        <div class="btn-row cm-left">${Object.keys(KIND_EN).map((k) => [k, KIND[k]]).map(([k, [ic, l]]) => `<button type="button" class="wbtn" data-addk="${k}">${ic} ${l}</button>`).join('')}</div>
        <div class="btn-row cm-left"><button class="wbtn primary">${T('Save module', 'Lưu học phần')}</button><button type="button" class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>`;
      const f = body.querySelector('[data-f]'), box = f.querySelector('[data-items]');
      const paint = () => {
        box.innerHTML = items.map((i, k) => `<div class="cm-card cm-item"><div class="cm-split"><span class="cm-lo">${KIND[i.kind][0]} ${KIND[i.kind][1]}</span><span><button type="button" class="cm-x" data-iu="${k}" ${k ? '' : 'disabled'} aria-label="${T('Move up', 'Lên trên')}">↑</button><button type="button" class="cm-x" data-id="${k}" ${k < items.length - 1 ? '' : 'disabled'} aria-label="${T('Move down', 'Xuống dưới')}">↓</button><button type="button" class="cm-x" data-irm="${k}" aria-label="${T('Remove item', 'Xóa mục')}">×</button></span></div>
          ${i.kind === 'assignment' ? `<select data-k="refId" data-i="${k}" aria-label="${T('Assignment', 'Bài tập')}">${as.length ? as.map((a) => `<option value="${h(a.id)}" ${a.id === i.refId ? 'selected' : ''}>${h(a.title)}</option>`).join('') : `<option value="">${T('No assignments yet: make one in Course assignments', 'Chưa có bài tập: tạo trong Bài tập khóa học')}</option>`}</select>`
            : `<input data-k="title" data-i="${k}" maxlength="120" placeholder="${T('Title', 'Tiêu đề')}" value="${h(i.title)}" aria-label="${T('Title', 'Tiêu đề')}">
               ${i.kind !== 'page' ? `<input data-k="url" data-i="${k}" type="url" placeholder="${i.kind === 'link' ? T('https://… (slides, video, a PDF on Drive)', 'https://… (slide, video, PDF trên Drive)') : T('Link (optional)', 'Liên kết (không bắt buộc)')}" value="${h(i.url)}" aria-label="${T('Link', 'Liên kết')}">` : ''}
               ${i.kind === 'page' ? `<textarea data-k="body" data-i="${k}" rows="4" maxlength="20000" placeholder="${T('The page: plain text, links are made clickable', 'Nội dung trang: văn bản thường, liên kết sẽ bấm được')}" aria-label="${T('Page text', 'Nội dung trang')}">${h(i.body)}</textarea>` : ''}`}</div>`).join('') || `<p class="cm-lo">${T('No items yet: add a page, link, reading or assignment below.', 'Chưa có mục nào: thêm trang, liên kết, bài đọc hoặc bài tập bên dưới.')}</p>`;
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
        try { await C.saveModule(cid, data); say(T('Module saved.', 'Đã lưu học phần.')); editing = null; draw(); } catch (er) { say(C.errText(er)); }
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
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
      let anns, counts, roster;
      try { [anns, counts, roster] = await Promise.all([C.announcements(cid), C.readCounts(cid), C.roster(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const students = roster.filter((r) => r.role === 'student').length;
      const ed = editing && editing !== 'new' ? anns.find((a) => a.id === editing) : null;
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}</div>
        <form class="cm-card" data-f><p class="cm-k">${ed ? T('Edit announcement', 'Sửa thông báo') : T('New announcement', 'Thông báo mới')}</p>
          <label class="cm-lbl">${T('Title', 'Tiêu đề')}<input name="title" required maxlength="140" value="${h(ed ? ed.title : '')}"></label>
          <label class="cm-lbl">${T('Message', 'Nội dung')}<textarea name="body" rows="4" maxlength="10000" required>${h(ed ? ed.body : '')}</textarea></label>
          ${ed ? '' : `<p class="cm-lo">${T('Post to', 'Đăng cho')}</p><div class="cm-checks">${list.map((c) => `<label class="cm-check"><input type="checkbox" name="to" value="${h(c.courseId)}" ${c.courseId === cid ? 'checked' : ''}> ${h(c.title)}${c.section ? ' · ' + h(c.section) : ''}</label>`).join('')}</div>`}
          <label class="cm-check"><input type="checkbox" name="pinned" ${ed && ed.pinned ? 'checked' : ''}> ${T('Pin to the top', 'Ghim lên đầu')}</label>
          <div class="btn-row cm-left"><button class="wbtn primary">${ed ? T('Save', 'Lưu') : T('Post', 'Đăng')}</button>${ed ? `<button type="button" class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button>` : ''}</div></form>
        ${anns.map((a) => `<div class="cm-card"><div class="cm-split"><p class="cm-k">${a.pinned ? '📌 ' : ''}${h(a.title)}</p><span><button class="wbtn" data-ed="${h(a.id)}">${T('Edit', 'Sửa')}</button> <button class="cm-x" data-del="${h(a.id)}" aria-label="${T('Delete', 'Xóa')}">×</button></span></div>
          <p class="cm-lo">${h(when(a.createdAtMs))}${a.editedAtMs ? T(' · edited', ' · đã sửa') : ''} · ${T(`read by ${counts[a.id] || 0} of ${students} student${students === 1 ? '' : 's'}`, `${counts[a.id] || 0}/${students} sinh viên đã đọc`)}</p><div>${rich(a.body)}</div></div>`).join('') || `<p class="cm-lo">${T('No announcements yet.', 'Chưa có thông báo nào.')}</p>`}</div>`;
      wirePicker(body, () => { editing = null; });
      const f = body.querySelector('[data-f]');
      const cancel = f.querySelector('[data-cancel]'); if (cancel) cancel.onclick = () => { editing = null; draw(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const d = { title: f.title.value.trim(), body: f.body.value.trim(), pinned: f.pinned.checked };
        if (ed) { d.id = ed.id; d.courseId = cid; } else d.courseIds = [...f.querySelectorAll('[name=to]:checked')].map((x) => x.value);
        try { const r = await C.saveAnnouncement(d); say(ed ? T('Announcement saved.', 'Đã lưu thông báo.') : T(`Posted to ${r.posted.length} course${r.posted.length === 1 ? '' : 's'}.`, `Đã đăng cho ${r.posted.length} khóa học.`)); editing = null; draw(); } catch (er) { say(C.errText(er)); }
      };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm(T('Delete this announcement?', 'Xóa thông báo này?'))) return; try { await C.deleteAnnouncement(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    draw();
    return live(draw);
  }

  const hm = (ms) => new Date(ms).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
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
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
      let ths;
      try { ths = await C.threads(cid); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (form) return editor(cid, form === 'new' ? null : ths.find((x) => x.id === form));
      const th = openT && ths.find((x) => x.id === openT);
      if (th) return thread(cid, th, my);
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-new>${T('＋ New discussion', '＋ Thảo luận mới')}</button></div>
        <ul class="cm-list">${ths.map((x) => `<li><button class="cm-linkbtn" data-t="${h(x.id)}"><b>${x.pinned ? '📌 ' : ''}${h(x.title)}</b><span class="cm-lo">${T(`${x.postCount || 0} repl${x.postCount === 1 ? 'y' : 'ies'}`, `${x.postCount || 0} trả lời`)}${x.postFirst ? T(' · post first', ' · đăng trước khi xem') : ''}${x.locked ? T(' · closed', ' · đã đóng') : ''} · ${T('last', 'mới nhất')} ${h(when(x.lastPostAtMs || x.createdAtMs))}</span></button></li>`).join('') || `<li class="cm-lo">${T('No discussions yet. Start one with a question for the week.', 'Chưa có thảo luận nào. Hãy bắt đầu bằng một câu hỏi cho tuần này.')}</li>`}</ul></div>`;
      wirePicker(body, () => { openT = null; });
      body.querySelector('[data-new]').onclick = () => { form = 'new'; draw(); };
      body.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { openT = b.dataset.t; draw(); }; });
    }
    function editor(cid, th) {
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${th ? T('Edit discussion', 'Sửa thảo luận') : T('New discussion', 'Thảo luận mới')}</p>
        <label class="cm-lbl">${T('Title', 'Tiêu đề')}<input name="title" required maxlength="140" value="${h(th ? th.title : '')}"></label>
        <label class="cm-lbl">${T('Prompt', 'Câu hỏi thảo luận')}<textarea name="body" rows="5" maxlength="5000" required>${h(th ? th.body : '')}</textarea></label>
        <label class="cm-check"><input type="checkbox" name="postFirst" ${th && th.postFirst ? 'checked' : ''}> ${T('Students post before they see others\' replies', 'Sinh viên phải đăng trước khi xem trả lời của người khác')}</label>
        <label class="cm-check"><input type="checkbox" name="pinned" ${th && th.pinned ? 'checked' : ''}> ${T('Pin to the top', 'Ghim lên đầu')}</label>
        ${th ? `<label class="cm-check"><input type="checkbox" name="locked" ${th.locked ? 'checked' : ''}> ${T('Closed to new replies', 'Không nhận trả lời mới')}</label>` : ''}
        <div class="btn-row cm-left"><button class="wbtn primary">${th ? T('Save', 'Lưu') : T('Start discussion', 'Bắt đầu thảo luận')}</button><button type="button" class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>`;
      const f = body.querySelector('[data-f]');
      f.querySelector('[data-cancel]').onclick = () => { form = null; draw(); };
      f.onsubmit = async (e) => { e.preventDefault();
        try { const r = await C.saveThread(cid, { id: th ? th.id : undefined, title: f.title.value.trim(), body: f.body.value.trim(), postFirst: f.postFirst.checked, pinned: f.pinned.checked, locked: f.locked ? f.locked.checked : false }); say(T('Discussion saved.', 'Đã lưu thảo luận.')); form = null; openT = r.threadId; draw(); } catch (er) { say(C.errText(er)); } };
    }
    async function thread(cid, th, my) {
      let res;
      try { res = await C.posts(cid, th.id); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const students = new Set(res.posts.filter((p) => p.role === 'student').map((p) => p.uid)).size;
      body.innerHTML = `<div class="cm-pad"><div class="cm-row"><button class="cm-linkbtn" data-back style="flex:0">${T('← All discussions', '← Tất cả thảo luận')}</button><span style="flex:1"></span><button class="wbtn" data-edit>${T('Edit', 'Sửa')}</button><button class="wbtn" data-lock>${th.locked ? T('Reopen', 'Mở lại') : T('Close', 'Đóng')}</button><button class="cm-x" data-del aria-label="${T('Delete discussion', 'Xóa thảo luận')}" title="${T('Delete', 'Xóa')}">×</button></div>
        <p class="cm-k">${th.pinned ? '📌 ' : ''}${h(th.title)}</p><p class="cm-lo">${th.postFirst ? T('Post first · ', 'Đăng trước khi xem · ') : ''}${th.locked ? T('Closed · ', 'Đã đóng · ') : ''}${T(`${students} student${students === 1 ? '' : 's'} replied`, `${students} sinh viên đã trả lời`)}</p>
        <div class="cm-text">${rich(th.body)}</div>
        ${res.posts.map((p) => `<div class="cm-post ${p.role !== 'student' ? 'staff' : ''}"><p class="cm-lo"><b>${h(p.name)}</b> · ${h(when(p.createdAtMs))}${p.editedAtMs && !p.removed ? T(' · edited', ' · đã sửa') : ''}</p>
          ${p.removed ? `<p class="cm-lo"><i>${T('Reply removed.', 'Câu trả lời đã bị gỡ.')}</i></p>` : `<div>${rich(p.body)}</div><div class="btn-row cm-left"><button class="cm-x" data-rm="${h(p.id)}" title="${T('Remove this reply', 'Gỡ câu trả lời này')}" aria-label="${T('Remove reply', 'Gỡ câu trả lời')}">${T('Remove', 'Gỡ')}</button></div>`}</div>`).join('') || `<p class="cm-lo">${T('No replies yet.', 'Chưa có trả lời nào.')}</p>`}
        ${th.locked ? '' : `<form class="cm-card" data-reply><label class="cm-lbl">${T('Reply as course staff', 'Trả lời với tư cách giảng viên/trợ giảng')}<textarea name="body" rows="3" maxlength="5000" required></textarea></label><div class="btn-row cm-left"><button class="wbtn primary">${T('Post reply', 'Đăng trả lời')}</button></div></form>`}</div>`;
      body.querySelector('[data-back]').onclick = () => { openT = null; draw(); };
      body.querySelector('[data-edit]').onclick = () => { form = th.id; draw(); };
      body.querySelector('[data-lock]').onclick = async () => { try { await C.saveThread(cid, { ...th, locked: !th.locked }); draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelector('[data-del]').onclick = async () => { if (!confirm(T('Delete this discussion and every reply in it?', 'Xóa thảo luận này và mọi câu trả lời trong đó?'))) return; try { await C.deleteThread(cid, th.id); openT = null; draw(); } catch (e) { say(C.errText(e)); } };
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => { if (!confirm(T('Remove this reply? The student sees "Reply removed".', 'Gỡ câu trả lời này? Sinh viên sẽ thấy "Câu trả lời đã bị gỡ".'))) return; try { await C.removePost(cid, th.id, b.dataset.rm); draw(); } catch (e) { say(C.errText(e)); } }; });
      const f = body.querySelector('[data-reply]');
      if (f) f.onsubmit = async (e) => { e.preventDefault(); try { await C.postReply(cid, th.id, f.body.value.trim()); draw(); } catch (er) { say(C.errText(er)); } };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Course calendar: class times, exams, other events (UniDeck phase 2) ---------------- */
  function renderCourseCalendar(body) {
    let seq = 0, editing = null;
    const KINDS = new Proxy({ class: '🏛️ Class', exam: '📝 Exam', other: '📌 Other' }, { get: (o, k) => (VI() ? { class: '🏛️ Buổi học', exam: '📝 Thi', other: '📌 Khác' } : o)[k] });
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = staffCourses(await C.myCourses()); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      const cid = await pick(list);
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
      let evs;
      try { evs = await C.events(cid); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      evs.sort((a, b) => a.startAtMs - b.startAtMs);
      const ed = editing && editing !== 'new' ? evs.find((x) => x.id === editing) : null;
      const dur = ed ? Math.round((ed.endAtMs - ed.startAtMs) / 6e4) : 90;
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-new>${T('＋ Add', '＋ Thêm')}</button></div>
        ${editing ? `<form class="cm-card" data-f><p class="cm-k">${ed ? T('Edit event', 'Sửa sự kiện') : T('New event', 'Sự kiện mới')}</p>
          <div class="cm-two"><label class="cm-lbl">${T('Title', 'Tiêu đề')}<input name="title" required maxlength="120" value="${h(ed ? ed.title : '')}" placeholder="${T('e.g. Lecture', 'ví dụ Bài giảng')}"></label>
          <label class="cm-lbl">${T('Kind', 'Loại')}<select name="kind">${Object.keys({ class: 1, exam: 1, other: 1 }).map((k) => [k, KINDS[k]]).map(([k, l]) => `<option value="${k}" ${(ed ? ed.kind : 'class') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
          <div class="cm-two"><label class="cm-lbl">${T('Starts', 'Bắt đầu')}<input type="datetime-local" name="start" required value="${localInput(ed && ed.startAtMs)}"></label>
          <label class="cm-lbl">${T('Length (minutes)', 'Thời lượng (phút)')}<input type="number" name="minutes" min="5" max="1440" value="${dur}"></label></div>
          <div class="cm-two"><label class="cm-lbl">${T('Room', 'Phòng')}<input name="location" maxlength="120" value="${h(ed ? ed.location : '')}"></label>
          <label class="cm-lbl">${T('Online link (optional)', 'Liên kết trực tuyến (không bắt buộc)')}<input type="url" name="link" maxlength="2000" value="${h(ed ? ed.link : '')}" placeholder="https://"></label></div>
          <label class="cm-lbl">${T('Repeats every week until (empty = once)', 'Lặp hằng tuần đến ngày (để trống = một lần)')}<input type="date" name="until" value="${ed && ed.weeklyUntilMs ? new Date(ed.weeklyUntilMs - new Date(ed.weeklyUntilMs).getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : ''}"></label>
          <div class="btn-row cm-left"><button class="wbtn primary">${T('Save', 'Lưu')}</button><button type="button" class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>` : ''}
        <ul class="cm-list">${evs.map((e) => `<li><button class="cm-linkbtn" data-ed="${h(e.id)}"><b>${KINDS[e.kind] ? KINDS[e.kind].split(' ')[0] : '📌'} ${h(e.title)}</b>
          <span class="cm-lo">${e.weeklyUntilMs ? T(`Every ${new Date(e.startAtMs).toLocaleDateString([], { weekday: 'long' })} ${hm(e.startAtMs)}–${hm(e.endAtMs)}, until ${new Date(e.weeklyUntilMs).toLocaleDateString([], { month: 'short', day: 'numeric' })}`, `Mỗi ${new Date(e.startAtMs).toLocaleDateString('vi-VN', { weekday: 'long' })} ${hm(e.startAtMs)}–${hm(e.endAtMs)}, đến ${new Date(e.weeklyUntilMs).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' })}`) : `${h(when(e.startAtMs))}–${hm(e.endAtMs)}`}${e.location ? ' · ' + h(e.location) : ''}${e.link ? T(' · online', ' · trực tuyến') : ''}</span></button>
          <button class="cm-x" data-del="${h(e.id)}" aria-label="${T('Delete', 'Xóa')} ${h(e.title)}" title="${T('Delete', 'Xóa')}">×</button></li>`).join('') || `<li class="cm-lo">${T('No class times or exams yet. They appear in every student’s Calendar.', 'Chưa có lịch học hay lịch thi. Chúng sẽ hiện trong Lịch của mọi sinh viên.')}</li>`}</ul>
        <p class="cm-lo">${T('Students also see assignment due dates and module release dates in their Calendar, and can export it as .ics.', 'Sinh viên cũng thấy hạn nộp bài tập và ngày mở học phần trong Lịch, và có thể xuất ra tệp .ics.')}</p></div>`;
      wirePicker(body, () => { editing = null; });
      body.querySelector('[data-new]').onclick = () => { editing = 'new'; draw(); };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm(T('Delete this event?', 'Xóa sự kiện này?'))) return; try { await C.deleteEvent(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
      const f = body.querySelector('[data-f]');
      if (f) {
        f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
        f.onsubmit = async (e) => { e.preventDefault();
          const start = new Date(f.start.value).getTime(), until = f.until.value ? new Date(f.until.value + 'T23:59').getTime() : null;
          try { await C.saveEvent(cid, { id: ed ? ed.id : undefined, title: f.title.value.trim(), kind: f.kind.value, startAtMs: start, endAtMs: start + (Number(f.minutes.value) || 60) * 6e4, location: f.location.value.trim(), link: f.link.value.trim(), weeklyUntilMs: until }); say(T('Saved.', 'Đã lưu.')); editing = null; draw(); } catch (er) { say(C.errText(er)); } };
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
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
      let slots, books;
      try { [slots, books] = await Promise.all([C.slots(cid), C.bookings(cid)]); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      const up = slots.filter((s) => s.endAtMs > Date.now()), days = [...new Set(up.map((s) => dayStart(s.startAtMs)))];
      const bookOf = (id) => books.find((b) => b.slotId === id);
      const taken = up.filter((s) => bookOf(s.id)).length;
      const next = new Date(Date.now() + 864e5); next.setHours(14, 0, 0, 0);
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-open>${T('＋ Open slots', '＋ Mở khung giờ')}</button></div>
        ${opening ? `<form class="cm-card" data-f><p class="cm-k">${T('Open office hours', 'Mở giờ tiếp sinh viên')}</p>
          <div class="cm-two"><label class="cm-lbl">${T('From', 'Từ')}<input type="datetime-local" name="start" required value="${localInput(next.getTime())}"></label>
          <label class="cm-lbl">${T('To', 'Đến')}<input type="datetime-local" name="end" required value="${localInput(next.getTime() + 2 * 36e5)}"></label></div>
          <div class="cm-two"><label class="cm-lbl">${T('Each slot (minutes)', 'Mỗi khung (phút)')}<input type="number" name="minutes" min="5" max="120" value="20"></label>
          <label class="cm-lbl">${T('Room', 'Phòng')}<input name="location" maxlength="120" placeholder="${T('e.g. Room B204', 'ví dụ Phòng B204')}"></label></div>
          <label class="cm-lbl">${T('Online link (optional)', 'Liên kết trực tuyến (không bắt buộc)')}<input type="url" name="link" maxlength="2000" placeholder="https:// (Meet, Zoom, Teams)"></label>
          <div class="btn-row cm-left"><button class="wbtn primary">${T('Open slots', 'Mở khung giờ')}</button><button type="button" class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>` : ''}
        <p class="cm-lo">${T(`${up.length} upcoming slot${up.length === 1 ? '' : 's'}, ${taken} booked. Students see free and taken slots, never who booked.`, `${up.length} khung giờ sắp tới, ${taken} đã được đặt. Sinh viên thấy khung trống và đã đặt, không thấy ai đặt.`)}</p>
        ${days.map((d) => `<p class="cm-k">${h(new Date(d).toLocaleDateString(LOC(), { weekday: 'long', month: 'short', day: 'numeric' }))}</p><table class="cm-tbl"><tbody>${up.filter((s) => dayStart(s.startAtMs) === d).map((s) => { const b = bookOf(s.id);
          return `<tr><td>${hm(s.startAtMs)}–${hm(s.endAtMs)}<br><span class="cm-lo">${h(s.location || '')}${s.link ? T(' · online', ' · trực tuyến') : ''}</span></td><td>${b ? `<b>${h(b.name)}</b>${b.note ? `<br><span class="cm-lo">${h(b.note)}</span>` : ''}` : `<span class="cm-lo">${T('Free', 'Còn trống')}</span>`}</td>
            <td>${b ? `<button class="wbtn" data-cancel-b="${h(s.id)}">${T('Cancel', 'Hủy')}</button>` : ''}<button class="cm-x" data-del="${h(s.id)}" aria-label="${T('Delete slot', 'Xóa khung giờ')}" title="${T('Delete slot', 'Xóa khung giờ')}">×</button></td></tr>`; }).join('')}</tbody></table>`).join('') || (opening ? '' : `<p class="cm-lo">${T('No upcoming office hours. Open some: students book them from UniStudentDeck.', 'Chưa có giờ tiếp sinh viên sắp tới. Hãy mở vài khung: sinh viên đặt lịch từ UniStudentDeck.')}</p>`)}</div>`;
      wirePicker(body, () => { opening = false; });
      body.querySelector('[data-open]').onclick = () => { opening = true; draw(); };
      body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm(bookOf(b.dataset.del) ? T('Delete this booked slot? The booking is cancelled.', 'Xóa khung giờ đã có người đặt? Lịch đặt sẽ bị hủy.') : T('Delete this slot?', 'Xóa khung giờ này?'))) return; try { await C.deleteSlot(cid, b.dataset.del); draw(); } catch (e) { say(C.errText(e)); } }; });
      body.querySelectorAll('[data-cancel-b]').forEach((b) => { b.onclick = async () => { if (!confirm(T('Cancel this booking? The slot becomes free again.', 'Hủy lịch đặt này? Khung giờ sẽ trống trở lại.'))) return; try { await C.cancelBooking(cid, b.dataset.cancelB); draw(); } catch (e) { say(C.errText(e)); } }; });
      const f = body.querySelector('[data-f]');
      if (f) {
        f.querySelector('[data-cancel]').onclick = () => { opening = false; draw(); };
        f.onsubmit = async (e) => { e.preventDefault();
          try { const r = await C.openSlots(cid, { startAtMs: new Date(f.start.value).getTime(), endAtMs: new Date(f.end.value).getTime(), minutes: Number(f.minutes.value), location: f.location.value.trim(), link: f.link.value.trim() }); say(T(`${r.created} slot${r.created === 1 ? '' : 's'} opened.`, `Đã mở ${r.created} khung giờ.`)); opening = false; draw(); } catch (er) { say(C.errText(er)); } };
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
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
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
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-edit>${groups.length ? T('Edit groups', 'Sửa nhóm') : T('Make groups', 'Chia nhóm')}</button></div>
        <p class="cm-lo">${T(`${groups.length} group${groups.length === 1 ? '' : 's'} · ${students.length - ungrouped.length} of ${students.length} students in a group`, `${groups.length} nhóm · ${students.length - ungrouped.length}/${students.length} sinh viên đã có nhóm`)}${gas.length ? ` · ${T('group assignments', 'bài tập nhóm')}: ${gas.map((a) => h(a.title)).join(', ')}` : T(' · no group assignments yet (tick “Group assignment” in Course assignments)', ' · chưa có bài tập nhóm (đánh dấu “Bài tập nhóm” trong Bài tập khóa học)')}</p>
        ${ungrouped.length && groups.length ? `<p class="cm-lo">${T('Not in a group', 'Chưa có nhóm')}: ${ungrouped.map((s) => h(s.name)).join(', ')}</p>` : ''}
        ${groups.map((g) => { const ts = tasks[g.id] || [], dn = ts.filter((t) => t.done).length;
          return `<div class="cm-card"><div class="cm-split"><p class="cm-k">👥 ${h(g.name)}</p><button class="cm-x cm-mini" data-open="${h(g.id)}" title="${T('Show tasks', 'Xem công việc')}">${openG === g.id ? '▾' : '▸'} ${dn}/${ts.length} ${T('tasks', 'việc')}</button></div>
            <p>${g.memberUids.map((u) => `<span class="cm-tag">${h(g.memberNames[u] || '')}</span>`).join(' ') || `<span class="cm-lo">${T('Nobody yet', 'Chưa có ai')}</span>`}</p>
            ${openG === g.id ? `<ul class="cm-list">${ts.map((t) => `<li><span style="flex:1">${t.done ? '✅' : '⬜'} ${h(t.title)} <span class="cm-lo">${t.assigneeName ? '· ' + h(t.assigneeName) : ''}${t.dueAtMs ? ' · ' + h(new Date(t.dueAtMs).toLocaleDateString(LOC(), { month: 'short', day: 'numeric' })) : ''}</span></span><button class="cm-x" data-deltask="${h(g.id)}|${h(t.id)}" title="${T('Delete task', 'Xóa công việc')}">×</button></li>`).join('') || `<li class="cm-lo">${T('No tasks yet.', 'Chưa có công việc nào.')}</li>`}</ul>` : ''}</div>`; }).join('')
          || `<p class="cm-lo">${T('No groups yet. Make groups to give students a shared task list and group assignments.', 'Chưa có nhóm nào. Hãy chia nhóm để sinh viên có danh sách công việc chung và bài tập nhóm.')}</p>`}</div>`;
      wirePicker(body, () => { draft = null; openG = null; });
      body.querySelector('[data-edit]').onclick = () => { draft = groups.map((g) => ({ id: g.id, name: g.name, memberUids: [...g.memberUids] })); if (!draft.length) draft = [{ name: `${T('Group', 'Nhóm')} 1`, memberUids: [] }, { name: `${T('Group', 'Nhóm')} 2`, memberUids: [] }]; draw(); };
      body.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { openG = openG === b.dataset.open ? null : b.dataset.open; draw(); }; });
      body.querySelectorAll('[data-deltask]').forEach((b) => { b.onclick = async () => { const [g, t] = b.dataset.deltask.split('|'); if (!confirm(T('Delete this task from the group’s list?', 'Xóa công việc này khỏi danh sách của nhóm?'))) return; try { await C.deleteTask(cid, g, t); draw(); } catch (e) { say(C.errText(e)); } }; });
    }
    function editor(cid, list, students) {
      const where = (u) => draft.findIndex((g) => g.memberUids.includes(u));
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}</div>
        <div class="cm-card"><p class="cm-k">${T('Make groups at random', 'Chia nhóm ngẫu nhiên')}</p><div class="cm-row"><label class="cm-pick" style="flex:0 1 auto">${T('Students per group', 'Số sinh viên mỗi nhóm')} <input type="number" min="2" max="20" value="3" data-size style="width:64px"></label><button class="wbtn" data-auto>${T('Shuffle into groups', 'Xáo vào các nhóm')}</button></div><p class="cm-lo">${T('Starts new groups (their task lists start empty); you can still move people before saving.', 'Tạo nhóm mới (danh sách công việc bắt đầu trống); bạn vẫn có thể đổi người trước khi lưu.')}</p></div>
        <div class="cm-card"><p class="cm-k">${T('Groups', 'Các nhóm')}</p>${draft.map((g, i) => `<div class="cm-row"><input class="cm-gname" data-name="${i}" value="${h(g.name)}" maxlength="60" aria-label="${T('Group name', 'Tên nhóm')}"><span class="cm-lo">${T(`${g.memberUids.length} student${g.memberUids.length === 1 ? '' : 's'}`, `${g.memberUids.length} sinh viên`)}</span><button class="cm-x" data-rm="${i}" title="${T('Remove group', 'Xóa nhóm')}">×</button></div>`).join('')}
          <div class="btn-row cm-left"><button class="wbtn" data-addg>${T('＋ Group', '＋ Nhóm')}</button></div></div>
        <table class="cm-tbl"><thead><tr><th>${T('Student', 'Sinh viên')}</th><th>${T('Group', 'Nhóm')}</th></tr></thead><tbody>${students.map((s) => `<tr><td>${h(s.name)}</td><td><select data-who="${h(s.uid)}"><option value="-1">${T('No group', 'Chưa có nhóm')}</option>${draft.map((g, i) => `<option value="${i}" ${where(s.uid) === i ? 'selected' : ''}>${h(g.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>
        <div class="btn-row cm-left"><button class="wbtn primary" data-save>${T('Save groups', 'Lưu nhóm')}</button><button class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button></div>
        <p class="cm-lo">${T('Removing a group deletes its task list. Students see only their own group.', 'Xóa một nhóm sẽ xóa danh sách công việc của nhóm đó. Sinh viên chỉ thấy nhóm của mình.')}</p></div>`;
      const names = () => body.querySelectorAll('[data-name]').forEach((x) => { draft[Number(x.dataset.name)].name = x.value; });
      wirePicker(body, () => { draft = null; });
      body.querySelector('[data-auto]').onclick = () => { names(); const n = Math.max(2, Math.min(20, Number(body.querySelector('[data-size]').value) || 3));
        const sh = shuffle(students.map((s) => s.uid)), k = Math.max(1, Math.round(sh.length / n));
        draft = Array.from({ length: k }, (_, i) => ({ name: (draft[i] && draft[i].name) || `${T('Group', 'Nhóm')} ${i + 1}`, memberUids: [] }));   // new groups: old task lists go
        sh.forEach((u, i) => draft[i % k].memberUids.push(u)); editor(cid, list, students); };
      body.querySelector('[data-addg]').onclick = () => { names(); draft.push({ name: `${T('Group', 'Nhóm')} ${draft.length + 1}`, memberUids: [] }); editor(cid, list, students); };
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { names(); draft.splice(Number(b.dataset.rm), 1); editor(cid, list, students); }; });
      body.querySelectorAll('[data-who]').forEach((sel) => { sel.onchange = () => { names(); const u = sel.dataset.who; draft.forEach((g) => { g.memberUids = g.memberUids.filter((x) => x !== u); }); const i = Number(sel.value); if (i >= 0) draft[i].memberUids.push(u); editor(cid, list, students); }; });
      body.querySelector('[data-cancel]').onclick = () => { draft = null; draw(); };
      body.querySelector('[data-save]').onclick = async () => { names();
        try { const r = await C.saveGroups(cid, draft); say(T(`Saved ${r.groups.length} group${r.groups.length === 1 ? '' : 's'}${r.ungrouped ? ` · ${r.ungrouped} not in a group` : ''}.`, `Đã lưu ${r.groups.length} nhóm${r.ungrouped ? ` · ${r.ungrouped} người chưa có nhóm` : ''}.`)); draft = null; draw(); } catch (e) { say(C.errText(e)); } };
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
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
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
      const behindBody = !behind.length ? `<p class="cm-lo">${T(`Nobody is behind${due.length ? '' : ' (nothing is past its due date yet)'}.`, `Không ai bị chậm${due.length ? '' : ' (chưa có gì quá hạn)'}.`)}</p>`
        : names ? `<div class="cm-scroll"><table class="cm-tbl"><thead><tr><th>${T('Student', 'Sinh viên')}</th><th>${T('Missing (past due)', 'Chưa nộp (quá hạn)')}</th><th>${T('Late', 'Muộn')}</th><th>${T('Total', 'Tổng')}</th><th>${T('Modules', 'Học phần')}</th></tr></thead><tbody>${behind.map((p) =>
            `<tr><td>${h(p.st.name)}</td><td class="${p.why.missing ? 'cm-warn' : ''}" title="${h(p.missing.map((a) => a.title).join(', '))}">${p.missing.length ? `${p.missing.length}: ${h(p.missing.slice(0, 2).map((a) => a.title).join(', '))}${p.missing.length > 2 ? '…' : ''}` : '–'}</td>
              <td>${p.late || '–'}</td><td class="${p.why.low ? 'cm-warn' : ''}">${show(p.total)}</td><td class="${p.why.mods ? 'cm-warn' : ''}">${show(p.modPct)}</td></tr>`).join('')}</tbody></table></div>`
        : `<ul class="cm-facts"><li><b>${count((p) => p.missing.length >= 2)}</b> ${T('missing two or more past-due assignments', 'thiếu từ hai bài quá hạn trở lên')}</li><li><b>${count((p) => p.missing.length === 1)}</b> ${T('missing one', 'thiếu một bài')}</li>
            <li><b>${count((p) => p.why.low)}</b> ${T(`with a running total under ${LOW_TOTAL}%`, `có tổng điểm hiện tại dưới ${LOW_TOTAL}%`)}</li>${openItems.length ? `<li><b>${count((p) => p.why.mods)}</b> ${T('who tick module items and have done under half of those open a week or more', 'có đánh dấu mục học phần và mới làm chưa đến một nửa số mục đã mở từ một tuần trở lên')}</li>` : ''}</ul>`;

      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn" data-names aria-pressed="${names}">${names ? T('🙈 Hide names', '🙈 Ẩn tên') : T('👁 Show names', '👁 Hiện tên')}</button></div>
        <div class="cm-tiles">${tile(n, T(n === 1 ? 'student' : 'students', 'sinh viên'))}${tile(show(rate(inPairs, due.length * n)), T('handed in (past due)', 'đã nộp (bài quá hạn)'))}${tile(show(rate(dueSubs - dueLate, dueSubs)), T('on time', 'đúng hạn'))}${tile(show(mean(allPct)), T('average grade', 'điểm trung bình'))}${tile(behind.length, T('behind', 'bị chậm'))}</div>
        ${cats.length ? `<p class="cm-k">${T('Averages by category', 'Trung bình theo nhóm điểm')}</p><div class="cm-row">${cats.map((c) => `<span class="cm-tag g">${CAT_NAMES[c]}: ${show(mean(byCat[c] || []))}</span>`).join('')}</div>` : ''}
        <p class="cm-k">${T('Who is behind', 'Ai đang bị chậm')}</p>${behindBody}
        <p class="cm-k">${T('Assignments', 'Bài tập')}</p>
        <div class="cm-scroll"><table class="cm-tbl"><thead><tr><th>${T('Assignment', 'Bài')}</th><th>${T('Due', 'Hạn')}</th><th>${T('Handed in', 'Đã nộp')}</th><th>${T('On time', 'Đúng hạn')}</th><th>${T('Graded', 'Đã chấm')}</th><th>${T('Average', 'Trung bình')}</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${h(r.a.title)}${r.a.group ? ` <span class="cm-tag">${T('group', 'nhóm')}</span>` : ''}</td><td class="cm-lo">${h(when(r.a.dueAtMs))}</td>
          <td class="${r.past && n && r.subN < n ? 'cm-warn' : ''}">${r.subN}/${n}${n ? ` · ${rate(r.subN, n)}%` : ''}</td><td>${show(r.onTime)}</td><td>${r.graded}</td><td>${show(r.avg)}</td></tr>`).join('') || `<tr><td colspan="6" class="cm-lo">${T('No assignments yet.', 'Chưa có bài tập nào.')}</td></tr>`}</tbody></table></div>
        <p class="cm-lo">${names ? T('Names are showing: hide them before you share your screen.', 'Đang hiện tên: hãy ẩn trước khi chia sẻ màn hình.') : T('Names are hidden, so this is safe on a shared screen.', 'Tên đang được ẩn, an toàn khi chiếu màn hình.')} ${T(`Averages count graded work, released or not. Behind: missing work past its due date, a running total under ${LOW_TOTAL}%, or (for students who tick items done) under ${LOW_MODULES}% of the items in modules open a week or more.`, `Điểm trung bình tính các bài đã chấm, dù đã công bố hay chưa. Bị chậm: thiếu bài đã quá hạn, tổng điểm hiện tại dưới ${LOW_TOTAL}%, hoặc (với sinh viên có đánh dấu mục đã xong) dưới ${LOW_MODULES}% số mục trong các học phần đã mở từ một tuần trở lên.`)}</p></div>`;
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
  const QTYPES = new Proxy({ mc: 'Multiple choice', tf: 'True / false', short: 'Short answer' }, { get: (o, k) => (VI() ? { mc: 'Trắc nghiệm', tf: 'Đúng / sai', short: 'Trả lời ngắn' } : o)[k] });
  const QTYPE_KEYS = ['mc', 'tf', 'short'];
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
      if (opts.length >= 2) out.push({ from: T('📊 Poll', '📊 Bình chọn'), q: { id: rid('q'), type: 'mc', text: st.poll.question.trim(), points: 1, options: opts.map((t) => ({ id: rid('o'), text: t })), correct: [] } });
    }
    if (st && st.exitTicket && String(st.exitTicket.question || '').trim()) {
      out.push({ from: T('🎟️ Exit Ticket', '🎟️ Phiếu ra cửa'), q: { id: rid('q'), type: 'short', text: st.exitTicket.question.trim(), points: 1, accept: [] } });
    }
    return out;
  }

  /* The question list editor, used for quizzes and banks. qs is edited in place; onChange after every edit. */
  function questionEditor(box, qs, onChange) {
    function paint() {
      box.innerHTML = qs.map((q, i) => `<div class="cm-card cm-q" data-q="${i}">
        <div class="cm-split"><span class="cm-k">${i + 1}.</span>
          <select data-k="type" aria-label="${T('Question type', 'Loại câu hỏi')}">${QTYPE_KEYS.map((v) => [v, QTYPES[v]]).map(([v, l]) => `<option value="${v}" ${q.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <label class="cm-qpts">${T('Points', 'Điểm')} <input type="number" min="0.5" max="100" step="0.5" data-k="points" value="${q.points}"></label>
          <span class="cm-ord"><button type="button" class="cm-x" data-mv="-1" ${i ? '' : 'disabled'} aria-label="${T('Move up', 'Lên trên')}">▲</button><button type="button" class="cm-x" data-mv="1" ${i < qs.length - 1 ? '' : 'disabled'} aria-label="${T('Move down', 'Xuống dưới')}">▼</button></span>
          <button type="button" class="cm-x" data-rmq aria-label="${T(`Remove question ${i + 1}`, `Xóa câu ${i + 1}`)}" title="${T('Remove', 'Xóa')}">×</button></div>
        <textarea data-k="text" rows="2" maxlength="2000" placeholder="${T('The question', 'Câu hỏi')}" aria-label="${T(`Question ${i + 1}`, `Câu ${i + 1}`)}">${h(q.text)}</textarea>
        ${q.type === 'mc' ? `<p class="cm-lo">${(q.correct || []).length > 1 ? T('Tick the right choices — students select all that apply.', 'Đánh dấu các đáp án đúng — sinh viên chọn tất cả đáp án đúng.') : T('Tick the right choice (tick more than one for “select all that apply”).', 'Đánh dấu đáp án đúng (đánh dấu nhiều hơn một cho dạng “chọn tất cả đáp án đúng”).')}</p>
          ${q.options.map((o, j) => `<div class="cm-opt"><input type="checkbox" data-ok="${j}" ${q.correct.includes(o.id) ? 'checked' : ''} aria-label="${T(`Choice ${j + 1} is right`, `Lựa chọn ${j + 1} đúng`)}"><input data-opt="${j}" maxlength="500" placeholder="${T(`Choice ${j + 1}`, `Lựa chọn ${j + 1}`)}" value="${h(o.text)}"><button type="button" class="cm-x" data-rmo="${j}" ${q.options.length > 2 ? '' : 'disabled'} aria-label="${T(`Remove choice ${j + 1}`, `Xóa lựa chọn ${j + 1}`)}">×</button></div>`).join('')}
          ${q.options.length < 8 ? `<button type="button" class="wbtn" data-addo>${T('＋ Choice', '＋ Lựa chọn')}</button>` : ''}`
        : q.type === 'tf' ? `<div class="cm-checks"><label class="cm-check"><input type="radio" name="tf${i}" data-tf="1" ${q.answer === true ? 'checked' : ''}> ${T('True', 'Đúng')}</label><label class="cm-check"><input type="radio" name="tf${i}" data-tf="0" ${q.answer === false ? 'checked' : ''}> ${T('False', 'Sai')}</label></div>`
        : `<label class="cm-lbl">${T('Accepted answers, one per line (capitals, spaces and a final full stop don’t matter; leave empty to grade by hand)', 'Các đáp án được chấp nhận, mỗi dòng một đáp án (không phân biệt hoa thường, khoảng trắng và dấu chấm cuối; để trống để chấm tay)')}<textarea data-k="accept" rows="2">${h((q.accept || []).join('\n'))}</textarea></label>`}
        </div>`).join('') || `<p class="cm-lo">${T('No questions yet.', 'Chưa có câu hỏi nào.')}</p>`;
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
        card.querySelector('[data-rmq]').onclick = () => { if (q.text && !confirm(T('Remove this question?', 'Xóa câu hỏi này?'))) return; qs.splice(Number(card.dataset.q), 1); paint(); };
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
      if (!cid) { body.innerHTML = `<p class="cm-pad cm-lo">${T('Create a course in Course builder first.', 'Hãy tạo khóa học trong Tạo khóa học trước.')}</p>`; return; }
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
      const limits = (q) => [q.timeLimitMin ? T(`${q.timeLimitMin} min`, `${q.timeLimitMin} phút`) : T('no time limit', 'không giới hạn thời gian'), q.attempts ? T(`${q.attempts} attempt${q.attempts === 1 ? '' : 's'}`, `${q.attempts} lần làm`) : T('unlimited attempts', 'không giới hạn lần làm')].join(' · ');
      body.innerHTML = `<div class="cm-pad"><div class="cm-row">${picker(list, cid)}<button class="wbtn primary" data-add>${tab === 'quizzes' ? T('＋ New quiz', '＋ Bài kiểm tra mới') : T('＋ New bank', '＋ Ngân hàng mới')}</button></div>
        <div class="cm-seg" role="tablist"><button role="tab" data-tab="quizzes" aria-selected="${tab === 'quizzes'}">${T('Quizzes', 'Bài kiểm tra')} (${quizzes.length})</button><button role="tab" data-tab="banks" aria-selected="${tab === 'banks'}">${T('Question banks', 'Ngân hàng câu hỏi')} (${banks.length})</button></div>
        ${tab === 'quizzes' ? `<ul class="cm-list">${quizzes.map((q) => `<li><button class="cm-linkbtn" data-ed="${h(q.id)}"><b>${h(q.title)} ${q.published ? `<span class="cm-tag s">${T('Published', 'Đã đăng')}</span>` : `<span class="cm-tag d">${T('Draft', 'Nháp')}</span>`}</b>
            <span class="cm-lo">${T(`${q.questionCount} question${q.questionCount === 1 ? '' : 's'}`, `${q.questionCount} câu hỏi`)} · ${q.points} ${T(q.points === 1 ? 'pt' : 'pts', 'điểm')} · ${h(limits(q))} · ${q.dueAtMs ? `${T('Due', 'Hạn')} ${h(when(q.dueAtMs))}` : T('No due date', 'Không có hạn')}${q.openAtMs ? ` · ${T('opens', 'mở lúc')} ${h(when(q.openAtMs))}` : ''}</span></button>
            ${q.published ? `<button class="wbtn" data-res="${h(q.id)}">${T('Results', 'Kết quả')}</button>` : ''}${mine.role === 'instructor' ? `<button class="cm-x" data-del="${h(q.id)}" aria-label="${T('Delete', 'Xóa')} ${h(q.title)}" title="${T('Delete', 'Xóa')}">×</button>` : ''}</li>`).join('') || `<li class="cm-lo">${T('No quizzes yet. Students see a quiz once you publish it.', 'Chưa có bài kiểm tra nào. Sinh viên chỉ thấy bài kiểm tra sau khi bạn đăng.')}</li>`}</ul>`
        : `<ul class="cm-list">${banks.map((b) => `<li><button class="cm-linkbtn" data-ed="${h(b.id)}"><b>${h(b.title)}</b><span class="cm-lo">${T(`${b.count} question${b.count === 1 ? '' : 's'} · only staff see banks`, `${b.count} câu hỏi · chỉ giảng viên, trợ giảng thấy`)}</span></button>
            <button class="cm-x" data-del="${h(b.id)}" aria-label="${T('Delete', 'Xóa')} ${h(b.title)}" title="${T('Delete', 'Xóa')}">×</button></li>`).join('') || `<li class="cm-lo">${T('No question banks yet. A bank keeps questions to reuse: add them to any quiz in this course.', 'Chưa có ngân hàng câu hỏi nào. Ngân hàng lưu câu hỏi để dùng lại: thêm vào bất kỳ bài kiểm tra nào của khóa học.')}</li>`}</ul>`}</div>`;
      wirePicker(body);
      body.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
      body.querySelectorAll('[data-res]').forEach((b) => { b.onclick = () => { results = b.dataset.res; openAtt = null; draw(); }; });
      body.querySelector('[data-add]').onclick = () => { editing = 'new'; draw(); };
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = b.dataset.ed; draw(); }; });
      body.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm(tab === 'quizzes' ? T('Delete this quiz?', 'Xóa bài kiểm tra này?') : T('Delete this question bank? Quizzes keep the questions they took from it.', 'Xóa ngân hàng câu hỏi này? Các bài kiểm tra vẫn giữ những câu đã lấy từ đó.'))) return;
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
        if (x.type === 'tf') return ans === true ? T('True', 'Đúng') : ans === false ? T('False', 'Sai') : '—';
        return ans ? String(ans) : '—';
      };
      const rightText = (x) => (x.type === 'mc' ? x.correct.map((id) => (x.options.find((o) => o.id === id) || { text: '?' }).text).join('; ') : x.type === 'tf' ? (x.answer ? T('True', 'Đúng') : T('False', 'Sai')) : (x.accept || []).join(' / ') || T('graded by hand', 'chấm tay'));
      const tile = (v, label) => `<div class="cm-tile"><b>${v}</b><span>${label}</span></div>`;
      body.innerHTML = `<div class="cm-pad"><button class="cm-linkbtn" data-back>${T('← All quizzes', '← Tất cả bài kiểm tra')}</button>
        <div class="cm-split"><p class="cm-k">${h(q.title)} · ${T('results', 'kết quả')}</p>${res.released ? `<span class="cm-tag s">${T('Released to students', 'Đã công bố cho sinh viên')}</span>` : `<button class="wbtn primary" data-release ${done.length ? '' : 'disabled'}>${T('Release results', 'Công bố kết quả')}</button>`}</div>
        <div class="cm-tiles">${tile(`${best.size}/${nStudents}`, T('students submitted', 'sinh viên đã nộp'))}${tile(avg === null ? '–' : avg + '%', T('average (best attempt)', 'trung bình (lần tốt nhất)'))}${tile(pending, T('answers to grade by hand', 'câu cần chấm tay'))}${tile(open.length, T('in progress', 'đang làm'))}</div>
        ${pending ? `<p class="cm-warn">${T('Some short answers need a grade from you. Their points count as 0 until you grade them.', 'Một số câu trả lời ngắn cần bạn chấm. Chúng được tính 0 điểm cho đến khi bạn chấm.')}</p>` : ''}
        <div class="cm-scroll"><table class="cm-tbl"><thead><tr><th>${T('Student', 'Sinh viên')}</th><th>${T('Attempt', 'Lần')}</th><th>${T('Submitted', 'Đã nộp')}</th><th>${T('Score', 'Điểm')}</th><th></th></tr></thead><tbody>
        ${res.attempts.map((a) => `<tr><td>${h(a.name)}${best.get(a.uid) === a && res.attempts.filter((x) => x.uid === a.uid).length > 1 ? ` <span class="cm-tag g">${T('best', 'tốt nhất')}</span>` : ''}</td><td>${a.attempt}</td>
          <td class="cm-lo">${a.status === 'open' ? T('in progress', 'đang làm') : h(when(a.submittedAtMs))}${a.timedOut ? T(' · time ran out', ' · hết giờ') : ''}</td>
          <td>${a.status === 'open' ? '–' : `<b>${a.score}</b>/${a.points}${a.pending ? ` <span class="cm-tag d">${T(`${a.pending} to grade`, `${a.pending} câu cần chấm`)}</span>` : ''}`}</td>
          <td>${a.status === 'submitted' ? `<button class="wbtn" data-att="${h(a.id)}">${openAtt === a.id ? T('Hide', 'Ẩn') : T('Answers', 'Bài làm')}</button>` : ''}</td></tr>
          ${openAtt === a.id ? `<tr><td colspan="5"><div class="cm-card">${(a.order || key.map((x) => x.id)).map((id, i) => { const x = byId.get(id); if (!x) return ''; const r = (a.results || {})[id] || { score: 0 };
            return `<div class="cm-ans"><p><b>${i + 1}. ${h(x.text)}</b> <span class="cm-lo">(${x.points} ${T(x.points === 1 ? 'pt' : 'pts', 'điểm')})</span></p>
              <p>${r.pending ? '⏳' : r.score >= x.points ? '✅' : r.score > 0 ? '◐' : '❌'} ${h(shown(x, (a.answers || {})[id]))}</p>
              <p class="cm-lo">${T('Right answer', 'Đáp án đúng')}: ${h(rightText(x))}</p>
              <label class="cm-qpts">${T('Score', 'Điểm')} <input type="number" min="0" max="${x.points}" step="0.5" value="${r.pending ? '' : r.score}" data-gq="${h(id)}" data-ga="${h(a.id)}" placeholder="–"> / ${x.points}${r.by ? T(' · graded by hand', ' · chấm tay') : ''}</label></div>`; }).join('')}</div></td></tr>` : ''}`).join('')
          || `<tr><td colspan="5" class="cm-lo">${T('Nobody has taken this quiz yet.', 'Chưa ai làm bài kiểm tra này.')}</td></tr>`}</tbody></table></div>
        <p class="cm-lo">${T('Students see their scores, and which questions they got right, only after you release the results; they never see the right answers. Later attempts are released as they come in. Change any score above to grade by hand.', 'Sinh viên chỉ thấy điểm và những câu mình làm đúng sau khi bạn công bố kết quả; họ không bao giờ thấy đáp án đúng. Các lần làm sau đó được công bố ngay khi nộp. Sửa điểm bất kỳ ở trên để chấm tay.')}</p></div>`;
      body.querySelector('[data-back]').onclick = () => { results = null; openAtt = null; draw(); };
      body.querySelectorAll('[data-att]').forEach((b) => { b.onclick = () => { openAtt = openAtt === b.dataset.att ? null : b.dataset.att; draw(); }; });
      body.querySelectorAll('[data-gq]').forEach((el) => {
        el.onchange = async () => {
          if (el.value === '') return;
          try { const r = await C.gradeQuizAnswer(cid, el.dataset.ga, el.dataset.gq, Number(el.value)); say(T(`Saved. Attempt score ${r.score}${r.pending ? `, ${r.pending} still to grade` : ''}.`, `Đã lưu. Điểm lần làm: ${r.score}${r.pending ? `, còn ${r.pending} câu cần chấm` : ''}.`)); draw(); } catch (e) { say(C.errText(e)); }
        };
      });
      const rel = body.querySelector('[data-release]');
      if (rel) rel.onclick = async () => {
        if (!confirm(T(`Release the results of “${q.title}”? Students see their scores and which questions they got right (not the right answers).${pending ? `\n\n${pending} answer${pending === 1 ? ' is' : 's are'} still to grade by hand and count as 0 until you do.` : ''}`, `Công bố kết quả “${q.title}”? Sinh viên sẽ thấy điểm và những câu mình làm đúng (không thấy đáp án đúng).${pending ? `\n\nCòn ${pending} câu cần chấm tay và được tính 0 điểm cho đến khi bạn chấm.` : ''}`))) return;
        try { const r = await C.releaseQuizResults(cid, q.id); say(T(`Results released to ${r.released} student${r.released === 1 ? '' : 's'}.`, `Đã công bố kết quả cho ${r.released} sinh viên.`)); draw(); } catch (e) { say(C.errText(e)); }
      };
    }

    function quizForm(course, cid, q, qs, banks) {
      const cats = Object.keys(course.weights || { assignments: 100 });
      const cat = q ? q.category : (cats.includes('quizzes') ? 'quizzes' : cats[0]);
      const found = fromWidgets();
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${q ? T('Edit quiz', 'Sửa bài kiểm tra') : T('New quiz', 'Bài kiểm tra mới')}</p>
        <label class="cm-lbl">${T('Title', 'Tiêu đề')}<input name="title" required maxlength="120" value="${h(q ? q.title : '')}" placeholder="${T('e.g. Week 3 check: finding sources', 'ví dụ Kiểm tra tuần 3: tìm nguồn tài liệu')}"></label>
        <label class="cm-lbl">${T('Instructions', 'Hướng dẫn')}<textarea name="instructions" rows="2" maxlength="8000">${h(q ? q.instructions : '')}</textarea></label>
        <div class="cm-two"><label class="cm-lbl">${T('Opens', 'Mở lúc')}<input type="datetime-local" name="open" value="${localInput(q && q.openAtMs)}"></label>
        <label class="cm-lbl">${T('Due', 'Hạn')}<input type="datetime-local" name="due" value="${localInput(q && q.dueAtMs)}"></label></div>
        <div class="cm-two"><label class="cm-lbl">${T('Time limit in minutes (0 = none)', 'Thời gian làm bài, phút (0 = không giới hạn)')}<input type="number" min="0" max="600" name="time" value="${q ? q.timeLimitMin : 0}"></label>
        <label class="cm-lbl">${T('Attempts (0 = unlimited)', 'Số lần làm (0 = không giới hạn)')}<input type="number" min="0" max="20" name="attempts" value="${q ? q.attempts : 1}"></label></div>
        <div class="cm-two"><label class="cm-lbl">${T('Category', 'Nhóm điểm')}<select name="category">${cats.map((k) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${CAT_NAMES[k] || k}</option>`).join('')}</select></label>
        <label class="cm-check"><input type="checkbox" name="shuffle" ${q && q.shuffle ? 'checked' : ''}> ${T('Shuffle questions and choices for each student', 'Xáo trộn câu hỏi và lựa chọn cho từng sinh viên')}</label></div>
        <div class="cm-split"><p class="cm-k">${T('Questions', 'Câu hỏi')}</p><span class="cm-lo" data-total></span></div>
        <div data-qs></div>
        <div class="btn-row cm-left">${QTYPE_KEYS.map((v) => [v, QTYPES[v]]).map(([v, l]) => `<button type="button" class="wbtn" data-newq="${v}">＋ ${l}</button>`).join('')}</div>
        <div class="btn-row cm-left">${banks.length ? `<button type="button" class="wbtn" data-frombank>${T('From a question bank…', 'Từ ngân hàng câu hỏi…')}</button>` : ''}
          ${found.map((x, i) => `<button type="button" class="wbtn" data-import="${i}" title="${h(x.q.text)}">${T('Bring in from', 'Lấy từ')} ${x.from}</button>`).join('')}
          <button type="button" class="wbtn" data-tobank>${T('Save these questions to a new bank', 'Lưu các câu hỏi này vào ngân hàng mới')}</button></div>
        <div data-pickbank></div>
        <label class="cm-check"><input type="checkbox" name="published" ${q && q.published ? 'checked' : ''}> ${T('Published: students in the course can see it', 'Đã đăng: sinh viên trong khóa học có thể thấy')}${q && q.published ? '' : T(' (leave unticked to keep a draft)', ' (bỏ trống để giữ bản nháp)')}</label>
        <p class="cm-lo">${T('Students never see the answers: they stay with course staff, and quizzes are scored on the server.', 'Sinh viên không bao giờ thấy đáp án: đáp án chỉ ở chỗ giảng viên, trợ giảng, và bài kiểm tra được chấm trên máy chủ.')}</p>
        <div class="btn-row cm-left"><button class="wbtn primary">${T('Save quiz', 'Lưu bài kiểm tra')}</button><button type="button" class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>`;
      const f = body.querySelector('[data-f]');
      const total = f.querySelector('[data-total]');
      const ed = questionEditor(f.querySelector('[data-qs]'), qs, () => { total.textContent = T(`${qs.length} question${qs.length === 1 ? '' : 's'} · ${qPoints(qs)} pt${qPoints(qs) === 1 ? '' : 's'}`, `${qs.length} câu hỏi · ${qPoints(qs)} điểm`); });
      f.querySelectorAll('[data-newq]').forEach((b) => { b.onclick = () => ed.add(newQ(b.dataset.newq)); });
      f.querySelectorAll('[data-import]').forEach((b) => { b.onclick = () => { const x = found[Number(b.dataset.import)]; ed.add(copyQ(x.q)); say(x.q.type === 'mc' ? T('Added. Tick the right choice.', 'Đã thêm. Hãy đánh dấu đáp án đúng.') : T('Added. Add accepted answers, or leave it to grade by hand.', 'Đã thêm. Thêm đáp án được chấp nhận, hoặc để trống để chấm tay.')); }; });
      const fb = f.querySelector('[data-frombank]');
      if (fb) fb.onclick = () => {
        const box = f.querySelector('[data-pickbank]');
        if (box.innerHTML) { box.innerHTML = ''; return; }
        box.innerHTML = `<div class="cm-card"><label class="cm-lbl">${T('Question bank', 'Ngân hàng câu hỏi')}<select data-bank>${banks.map((b, i) => `<option value="${i}">${h(b.title)} (${b.count})</option>`).join('')}</select></label>
          <div data-bankqs class="cm-checks cm-col"></div><div class="btn-row cm-left"><button type="button" class="wbtn primary" data-addsel>${T('Add the ticked questions', 'Thêm các câu đã đánh dấu')}</button><button type="button" class="wbtn" data-addall>${T('Add all', 'Thêm tất cả')}</button></div></div>`;
        const bsel = box.querySelector('[data-bank]'), bq = box.querySelector('[data-bankqs]');
        const show = () => { const b = banks[Number(bsel.value)]; bq.innerHTML = b.questions.map((x, i) => `<label class="cm-check"><input type="checkbox" data-bi="${i}"> <span>${h(x.text)} <span class="cm-lo">${QTYPES[x.type]} · ${x.points} ${T(x.points === 1 ? 'pt' : 'pts', 'điểm')}</span></span></label>`).join('') || `<p class="cm-lo">${T('This bank is empty.', 'Ngân hàng này đang trống.')}</p>`; };
        bsel.onchange = show; show();
        const add = (all) => { const b = banks[Number(bsel.value)]; const pickd = b.questions.filter((x, i) => all || bq.querySelector(`[data-bi="${i}"]`).checked);
          if (!pickd.length) { say(T('Tick a question first.', 'Hãy đánh dấu một câu hỏi trước.')); return; } pickd.forEach((x) => qs.push(copyQ(x))); ed.paint(); box.innerHTML = ''; say(T(`${pickd.length} question${pickd.length === 1 ? '' : 's'} added.`, `Đã thêm ${pickd.length} câu hỏi.`)); };
        box.querySelector('[data-addsel]').onclick = () => add(false);
        box.querySelector('[data-addall]').onclick = () => add(true);
      };
      const tb = f.querySelector('[data-tobank]');
      if (tb) tb.onclick = async () => {
        if (!qs.length) { say(T('Add a question first.', 'Hãy thêm một câu hỏi trước.')); return; }
        const title = prompt(T('Name the new question bank:', 'Đặt tên cho ngân hàng câu hỏi mới:'), f.title.value ? T(`${f.title.value} questions`, `Câu hỏi ${f.title.value}`) : '');
        if (!title) return;
        try { const r = await C.saveBank(cid, { title, questions: qs.map(copyQ) }); say(T(`Saved ${r.count} question${r.count === 1 ? '' : 's'} to “${title}”.`, `Đã lưu ${r.count} câu hỏi vào “${title}”.`)); } catch (e) { say(C.errText(e)); }
      };
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const data = { id: q ? q.id : undefined, title: f.title.value, instructions: f.instructions.value, category: f.category.value,
          openAtMs: f.open.value ? new Date(f.open.value).getTime() : null, dueAtMs: f.due.value ? new Date(f.due.value).getTime() : null,
          timeLimitMin: Number(f.time.value) || 0, attempts: Number(f.attempts.value) || 0, shuffle: f.shuffle.checked, published: f.published.checked, questions: qs };
        try { const r = await C.saveQuiz(cid, data); say(T(`Quiz saved: ${r.points} pt${r.points === 1 ? '' : 's'}${data.published ? ', published' : ', draft'}.`, `Đã lưu bài kiểm tra: ${r.points} điểm${data.published ? ', đã đăng' : ', bản nháp'}.`)); editing = null; draw(); } catch (er) { say(C.errText(er)); }
      };
    }

    function bankForm(cid, b) {
      const qs = b ? b.questions.map((x) => JSON.parse(JSON.stringify(x))) : [];
      body.innerHTML = `<form class="cm-pad" data-f><p class="cm-k">${b ? T('Edit question bank', 'Sửa ngân hàng câu hỏi') : T('New question bank', 'Ngân hàng câu hỏi mới')}</p>
        <label class="cm-lbl">${T('Title', 'Tiêu đề')}<input name="title" required maxlength="120" value="${h(b ? b.title : '')}" placeholder="${T('e.g. Citations and plagiarism', 'ví dụ Trích dẫn và đạo văn')}"></label>
        <div class="cm-split"><p class="cm-k">${T('Questions', 'Câu hỏi')}</p><span class="cm-lo" data-total></span></div>
        <div data-qs></div>
        <div class="btn-row cm-left">${QTYPE_KEYS.map((v) => [v, QTYPES[v]]).map(([v, l]) => `<button type="button" class="wbtn" data-newq="${v}">＋ ${l}</button>`).join('')}</div>
        <p class="cm-lo">${T('Only course staff see question banks. Editing a bank doesn’t change quizzes that already took its questions.', 'Chỉ giảng viên, trợ giảng thấy ngân hàng câu hỏi. Sửa ngân hàng không làm thay đổi các bài kiểm tra đã lấy câu hỏi từ đó.')}</p>
        <div class="btn-row cm-left"><button class="wbtn primary">${T('Save bank', 'Lưu ngân hàng')}</button><button type="button" class="wbtn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>`;
      const f = body.querySelector('[data-f]');
      const total = f.querySelector('[data-total]');
      const ed = questionEditor(f.querySelector('[data-qs]'), qs, () => { total.textContent = T(`${qs.length} question${qs.length === 1 ? '' : 's'}`, `${qs.length} câu hỏi`); });
      f.querySelectorAll('[data-newq]').forEach((x) => { x.onclick = () => ed.add(newQ(x.dataset.newq)); });
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { await C.saveBank(cid, { id: b ? b.id : undefined, title: f.title.value, questions: qs }); say(T('Question bank saved.', 'Đã lưu ngân hàng câu hỏi.')); editing = null; draw(); } catch (er) { say(C.errText(er)); }
      };
    }
    draw();
    return live(draw);
  }

  /* ---------------- Supervision (phase 5, UniDeck v0.14.0; backend v2.21.0) ----------------
     A graduate student's supervisor notes, read-only: the student keeps them in UniStudentDeck and chooses to share a
     copy (meetings, and if they tick it their thesis progress) with a one-time code entered here. The student sees
     when you last looked and can stop sharing at any time. Nothing here changes their notes. */
  function renderSupervision(body) {
    let seq = 0, open = null;
    const dayOf = (ms) => (ms ? new Date(ms).toLocaleDateString(LOC(), { month: 'short', day: 'numeric', year: 'numeric' }) : '');
    const STAT = new Proxy({ planned: 'Planned', drafting: 'Drafting', revising: 'Revising', done: 'Done' }, { get: (o, k) => (VI() ? { planned: 'Dự kiến', drafting: 'Đang viết', revising: 'Đang sửa', done: 'Xong' } : o)[k] });
    async function draw() {
      const my = ++seq;
      if (!gate(body, draw)) return;
      let list;
      try { list = (await C.mySupervisees()).students; } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
      if (my !== seq) return;
      if (open && list.some((s) => s.studentUid === open)) {
        let v;
        try { v = await C.supervisionView(open); } catch (e) { body.innerHTML = `<p class="cm-pad">${h(C.errText(e))}</p>`; return; }
        if (my !== seq) return;
        return view(v, list.find((s) => s.studentUid === open));
      }
      body.innerHTML = `<div class="cm-pad">
        <form class="cm-row" data-join><input name="code" placeholder="${T('Code from your student, e.g. ABCD-2345', 'Mã từ học viên, ví dụ ABCD-2345')}" maxlength="12" autocomplete="off" aria-label="${T('Code from your student', 'Mã từ học viên')}" style="flex:1"><button class="wbtn primary">${T('Link', 'Liên kết')}</button></form>
        <ul class="cm-list">${list.map((s) => `<li><button class="cm-linkbtn" data-open="${h(s.studentUid)}"><b>${h(s.studentName)}</b><span class="cm-lo">${h(s.email || '')}${s.sharing ? (s.publishedAtMs ? ` · ${T('updated', 'cập nhật')} ${h(when(s.publishedAtMs))}` : T(' · nothing shared yet', ' · chưa chia sẻ gì')) : T(' · not sharing right now', ' · hiện không chia sẻ')}</span></button></li>`).join('')
          || `<li class="cm-lo">${T('No students yet. A graduate student turns on sharing in UniStudentDeck → 🧑‍🏫 Supervisor notes and gives you a code.', 'Chưa có học viên nào. Học viên sau đại học bật chia sẻ trong UniStudentDeck → 🧑‍🏫 Ghi chú với người hướng dẫn rồi gửi bạn mã.')}</li>`}</ul>
        <p class="cm-lo">${T('You see a read-only copy of what each student chooses to share: their supervisor meetings and, if they include it, their thesis progress. Never their citations or lab log.', 'Bạn thấy bản chỉ đọc của những gì học viên chọn chia sẻ: các buổi gặp với người hướng dẫn và, nếu họ chọn, tiến độ luận văn. Không bao giờ có trích dẫn hay nhật ký nghiên cứu.')}</p></div>`;
      const f = body.querySelector('[data-join]');
      f.onsubmit = async (e) => { e.preventDefault(); const code = f.code.value.trim(); if (!code) return;
        try { const r = await C.joinSupervision(code); say(`${T('Linked', 'Đã liên kết')}: ${r.studentName}.`); open = r.studentUid; draw(); } catch (er) { say(C.errText(er)); } };
      body.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { open = b.dataset.open; draw(); }; });
    }
    function view(v, s) {
      const t = v.thesis;
      const words = t ? t.chapters.reduce((a, c) => a + (c.words || 0), 0) : 0;
      const goal = t ? (t.wordGoal || t.chapters.reduce((a, c) => a + (c.goal || 0), 0)) : 0;
      const pct = goal ? Math.min(100, Math.round((words / goal) * 100)) : 0;
      const openActs = v.meetings.flatMap((m) => (m.actions || []).filter((a) => !a.done && a.owner === 'supervisor'));
      body.innerHTML = `<div class="cm-pad"><button class="cm-linkbtn" data-back>${T('← All students', '← Tất cả học viên')}</button>
        <div class="cm-split"><p class="cm-k">${h(v.studentName)} <span class="cm-lo">${h(v.email || '')}</span></p><button class="wbtn" data-leave>${T('Unlink', 'Hủy liên kết')}</button></div>
        ${!v.sharing ? `<p class="cm-warn">${T('Not sharing right now. The student has turned sharing off; you’ll see their notes again if they turn it back on.', 'Hiện không chia sẻ. Học viên đã tắt chia sẻ; bạn sẽ thấy lại ghi chú nếu họ bật lại.')}</p>`
        : `<p class="cm-lo">${v.publishedAtMs ? `${T('Updated', 'Cập nhật')} ${h(when(v.publishedAtMs))}` : T('Nothing shared yet', 'Chưa chia sẻ gì')} · ${T('read-only', 'chỉ đọc')}</p>
          ${openActs.length ? `<div class="cm-card"><p class="cm-k">${T('Waiting on you', 'Việc của bạn')} (${openActs.length})</p>${openActs.map((a) => `<p>• ${h(a.text)}${a.dueAtMs ? ` <span class="cm-lo">· ${T('by', 'trước')} ${h(dayOf(a.dueAtMs))}</span>` : ''}</p>`).join('')}</div>` : ''}
          ${t ? `<div class="cm-card"><p class="cm-k">🎓 ${h(t.title || T('Thesis', 'Luận văn'))}</p><p class="cm-lo">${t.dueAtMs ? `${T('Due', 'Hạn nộp')} ${h(dayOf(t.dueAtMs))} · ` : ''}${T(`${words.toLocaleString()}${goal ? ` of ${goal.toLocaleString()}` : ''} words`, `${words.toLocaleString('vi-VN')}${goal ? `/${goal.toLocaleString('vi-VN')}` : ''} từ`)}${goal ? ` · ${pct}%` : ''}</p>
            <div class="cm-bar"><span style="width:${pct}%"></span></div>
            ${t.chapters.length ? `<table class="cm-tbl"><thead><tr><th>${T('Chapter', 'Chương')}</th><th>${T('Status', 'Trạng thái')}</th><th>${T('Words', 'Số từ')}</th><th>${T('Due', 'Hạn')}</th></tr></thead><tbody>${t.chapters.map((c) => `<tr><td>${h(c.title)}</td><td><span class="cm-tag ${c.status === 'done' ? 's' : c.status === 'planned' ? '' : 'g'}">${STAT[c.status] || h(c.status)}</span></td><td>${(c.words || 0).toLocaleString()}${c.goal ? ` / ${c.goal.toLocaleString()}` : ''}</td><td class="cm-lo">${h(dayOf(c.dueAtMs))}</td></tr>`).join('')}</tbody></table>` : ''}
            ${t.milestones.length ? `<p class="cm-lo">${T('Milestones', 'Các mốc')}</p>${t.milestones.map((m) => `<p>${m.done ? '✅' : '⬜'} ${h(m.title)}${m.dueAtMs ? ` <span class="cm-lo">· ${h(dayOf(m.dueAtMs))}</span>` : ''}</p>`).join('')}` : ''}</div>` : ''}
          <p class="cm-k">${T('Meetings', 'Các buổi gặp')}</p>
          ${v.meetings.map((m) => `<div class="cm-card"><p class="cm-k">${h(m.title || T('Meeting', 'Buổi gặp'))} <span class="cm-lo">· ${h(when(m.atMs))}</span></p>
            ${(m.agenda || []).length ? `<p class="cm-lo">${T('Agenda', 'Nội dung trao đổi')}</p>${m.agenda.map((x) => `<p>• ${h(x)}</p>`).join('')}` : ''}
            ${m.notes ? `<p class="cm-lo">${T('Notes', 'Ghi chú')}</p><p>${rich(m.notes)}</p>` : ''}
            ${(m.actions || []).length ? `<p class="cm-lo">${T('Action items', 'Việc cần làm')}</p>${m.actions.map((a) => `<p>${a.done ? '✅' : '⬜'} ${h(a.text)} <span class="cm-tag">${a.owner === 'supervisor' ? T('you', 'bạn') : T('student', 'học viên')}</span>${a.dueAtMs ? ` <span class="cm-lo">· ${T('by', 'trước')} ${h(dayOf(a.dueAtMs))}</span>` : ''}</p>`).join('')}` : ''}</div>`).join('')
            || `<p class="cm-lo">${T('No meetings shared yet.', 'Chưa có buổi gặp nào được chia sẻ.')}</p>`}`}</div>`;
      body.querySelector('[data-back]').onclick = () => { open = null; draw(); };
      body.querySelector('[data-leave]').onclick = async () => {
        if (!confirm(T(`Stop seeing ${v.studentName}’s supervisor notes? They can give you a new code later.`, `Ngừng xem ghi chú hướng dẫn của ${v.studentName}? Họ có thể gửi bạn mã mới sau.`))) return;
        try { await C.leaveSupervision(s.studentUid); open = null; draw(); } catch (e) { say(C.errText(e)); }
      };
    }
    draw();
    return live(draw);
  }

  window.CourseMode = { quizzes: renderQuizBuilder, grader: renderGrader, gradebook: renderGradebook, stats: renderStats, groups: renderGroups, discussions: renderDiscussions, announcements: renderAnnouncements, office: renderOfficeHours };
  if (TA_HOST) return;
  window.UNI_WIDGETS = [
    { id: 'coursebuilder', cat: 'course', title: '🏛️ Course builder', desc: 'Create a university course: code, term, grading weights, late policy, people.', icon: 'people', w: 440, h: 600, titleVi: '🏛️ Tạo khóa học', descVi: 'Tạo khóa học đại học: mã, học kỳ, trọng số điểm, quy định nộp muộn, thành viên.', render: renderBuilder },
    { id: 'courseassign', cat: 'course', title: '🗂️ Course assignments', desc: 'Assignments with due dates, rubrics, submission types and attempts.', icon: 'clipboard', w: 440, h: 600, titleVi: '🗂️ Bài tập khóa học', descVi: 'Bài tập có hạn nộp, tiêu chí chấm, hình thức nộp và số lần nộp.', render: renderAssignments },
    { id: 'grader', cat: 'course', title: '✅ Grader', desc: 'Each submission beside its rubric: score, feedback, release.', icon: 'report', w: 820, h: 620, titleVi: '✅ Chấm bài', descVi: 'Mỗi bài nộp bên cạnh tiêu chí chấm: điểm, nhận xét, công bố.', render: renderGrader },
    { id: 'coursemodules', cat: 'course', title: '🧭 Modules', desc: 'Weekly modules: pages, links, readings and assignments, with release dates.', icon: 'clipboard', w: 520, h: 640, titleVi: '🧭 Học phần', descVi: 'Học phần hằng tuần: trang, liên kết, bài đọc và bài tập, có ngày mở.', render: renderModules },
    { id: 'courseannounce', cat: 'course', title: '📣 Announcements', desc: 'Post to one or several courses, pin, see who has read it.', icon: 'report', w: 460, h: 620, titleVi: '📣 Thông báo', descVi: 'Đăng cho một hoặc nhiều khóa học, ghim, xem ai đã đọc.', render: renderAnnouncements },
    { id: 'coursediscuss', cat: 'course', title: '💬 Discussions', desc: 'Start course discussions, post-first prompts, pin, close, moderate.', icon: 'report', w: 520, h: 640, titleVi: '💬 Thảo luận', descVi: 'Mở thảo luận, yêu cầu đăng trước khi xem, ghim, đóng, kiểm duyệt.', render: renderDiscussions },
    { id: 'coursecal', cat: 'course', title: '📅 Course calendar', desc: 'Class times, exams and events for every student’s Calendar.', icon: 'clipboard', w: 480, h: 600, titleVi: '📅 Lịch khóa học', descVi: 'Lịch học, lịch thi và sự kiện cho Lịch của mọi sinh viên.', render: renderCourseCalendar },
    { id: 'courseoffice', cat: 'course', title: '🙋 Office hours', desc: 'Open bookable slots, see who booked and why.', icon: 'people', w: 480, h: 600, titleVi: '🙋 Giờ tiếp sinh viên', descVi: 'Mở khung giờ để đặt, xem ai đặt và lý do.', render: renderOfficeHours },
    { id: 'coursegroups', cat: 'course', title: '👥 Groups', desc: 'Put students in groups for group projects; see each group’s task list.', icon: 'people', w: 520, h: 640, titleVi: '👥 Nhóm', descVi: 'Chia sinh viên thành nhóm cho dự án nhóm; xem danh sách công việc của từng nhóm.', render: renderGroups },
    { id: 'coursequiz', cat: 'course', title: '📝 Quiz builder', desc: 'Quizzes and question banks: multiple choice, true/false, short answer; time and attempt limits; bring in Poll and Exit Ticket questions.', icon: 'clipboard', w: 620, h: 660, titleVi: '📝 Tạo bài kiểm tra', descVi: 'Bài kiểm tra và ngân hàng câu hỏi: trắc nghiệm, đúng/sai, trả lời ngắn; giới hạn thời gian và số lần làm; lấy câu hỏi từ Bình chọn và Phiếu ra cửa.', render: renderQuizBuilder },
    { id: 'supervision', cat: 'course', title: '🎓 Supervision', desc: 'Graduate students’ supervisor notes and thesis progress, shared with you read-only by a code.', icon: 'people', w: 560, h: 640, titleVi: '🎓 Hướng dẫn', descVi: 'Ghi chú hướng dẫn và tiến độ luận văn của học viên sau đại học, chia sẻ cho bạn ở chế độ chỉ đọc bằng mã.', render: renderSupervision },
    { id: 'gradebook', cat: 'course', title: '📒 Gradebook', desc: 'Students by assignments, weighted totals, CSV export.', icon: 'stats', w: 760, h: 560, titleVi: '📒 Sổ điểm', descVi: 'Bảng sinh viên theo bài, tổng điểm có trọng số, xuất CSV.', render: renderGradebook },
    { id: 'coursestats', cat: 'course', title: '📊 Course stats', desc: 'Who is behind, submission and on-time rates, averages; names hidden for shared screens.', icon: 'stats', w: 720, h: 620, titleVi: '📊 Thống kê khóa học', descVi: 'Ai đang bị chậm, tỉ lệ nộp bài và nộp đúng hạn, điểm trung bình; ẩn tên khi chiếu màn hình.', render: renderStats },
  ];
})();

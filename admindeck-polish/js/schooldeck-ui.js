/* ============================================================
   AdminDeck SchoolDeck (v0.8.0) — the widget.
   ------------------------------------------------------------
   One widget with five tabs (v0.10.0 added ClassDeck, js/classdeck-ui.js), built on the People Directory (same records, same audit log, same secret):
     Overview — the setup checklist (teachers, students, parents, classes, teacher assignment, push) and what needs attention;
     ClassDeck — the school builds its classes, assigns teachers (= pushes the class to them) and manages codes and settings;
     Staff directory — admin staff grouped by department: add / edit / archive, CSV in and out, printable directory;
     Parents & links — import students WITH their parents from one CSV, and link or unlink parents and students by hand;
     Activity — the audit log of every change.
   The rules (who may be linked to whom, what a roster row means) live in functions/schooldeck.js and are enforced again by the Cloud
   Functions in functions/adminSchoolDeck.js; this file only draws and asks. State lives in SDUI and survives a refresh.
   Uses from app.js: t, esc, toast, widgetBoot, wireRefreshBtn, frameTop, fmtNum, openWidget, state, STRINGS, LOCALE_MAP, AD.
   ============================================================ */
const SD_STRINGS = {
  w_schooldeck: { en:'🎓 SchoolDeck', vi:'🎓 SchoolDeck' },
  sd_tab_overview: { en:'Overview', vi:'Tổng quan' }, sd_tab_staff: { en:'Staff directory', vi:'Danh bạ nhân viên' },
  sd_tab_families: { en:'Parents & links', vi:'Phụ huynh & liên kết' }, sd_tab_activity: { en:'Activity', vi:'Hoạt động' },
  sd_ov_title: { en:'Set up your school', vi:'Thiết lập trường của bạn' },
  sd_ov_sub: { en:'Bring in your people once, link families, and see what still needs attention.', vi:'Nhập danh sách một lần, liên kết gia đình và xem việc còn cần xử lý.' },
  sd_count_teachers: { en:'Teachers', vi:'Giáo viên' }, sd_count_students: { en:'Students', vi:'Học sinh' }, sd_count_parents: { en:'Parents', vi:'Phụ huynh' },
  sd_count_staff: { en:'Staff', vi:'Nhân viên' }, sd_count_classes: { en:'Classes', vi:'Lớp học' },
  sd_step_teachers: { en:'Add your teachers', vi:'Thêm giáo viên' },
  sd_step_teachers_d: { en:'Teachers are matched to their TeachersDeck account by email when they sign in.', vi:'Giáo viên được ghép với tài khoản TeachersDeck qua email khi họ đăng nhập.' },
  sd_step_students: { en:'Add your students', vi:'Thêm học sinh' },
  sd_step_students_d: { en:'Import a class list, or add students one at a time in the People Directory.', vi:'Nhập danh sách lớp, hoặc thêm từng học sinh trong Danh bạ thành viên.' },
  sd_step_parents: { en:'Link parents to students', vi:'Liên kết phụ huynh với học sinh' },
  sd_step_parents_d: { en:'Every student should have at least one parent or guardian.', vi:'Mỗi học sinh nên có ít nhất một phụ huynh hoặc người giám hộ.' },
  sd_step_classes: { en:'Build classes', vi:'Tạo lớp học' },
  sd_step_classes_d: { en:'Build the school’s classes in the ClassDeck tab. Classes teachers made in TeachersDeck show up there too.', vi:'Tạo lớp của trường trong tab ClassDeck. Lớp giáo viên tạo trong TeachersDeck cũng hiện ở đó.' },
  sd_step_assign: { en:'Assign teachers', vi:'Phân công giáo viên' },
  sd_step_assign_d: { en:'Every class needs a teacher. Choose one in the ClassDeck tab.', vi:'Mỗi lớp cần một giáo viên. Hãy chọn trong tab ClassDeck.' },
  sd_step_push: { en:'Push classes to teachers', vi:'Đẩy lớp đến giáo viên' },
  sd_step_push_d: { en:'Assigning a teacher pushes the class to their TeachersDeck. Share the join codes with students and parents.', vi:'Phân công giáo viên là đẩy lớp đến TeachersDeck của họ. Hãy gửi mã tham gia cho học sinh và phụ huynh.' },
  sd_state_done: { en:'Done', vi:'Xong' }, sd_state_doing: { en:'In progress', vi:'Đang làm' }, sd_state_todo: { en:'Not started', vi:'Chưa bắt đầu' },
  sd_state_later: { en:'Coming later', vi:'Sắp có' }, sd_state_unknown: { en:'Unknown', vi:'Chưa rõ' },
  sd_progress: { en:'{done} of {have}', vi:'{done} / {have}' },
  sd_unknown_note: { en:'Redeploy the v0.8.0 backend functions to see class progress.', vi:'Hãy triển khai lại các hàm backend v0.8.0 để xem tiến độ lớp.' },
  sd_go_directory: { en:'Open People Directory', vi:'Mở Danh bạ thành viên' }, sd_go_import: { en:'Import students', vi:'Nhập học sinh' }, sd_go_link: { en:'Link parents', vi:'Liên kết phụ huynh' },
  sd_backfill: { en:'{n} existing accounts are not in the directory yet.', vi:'{n} tài khoản hiện có chưa nằm trong danh bạ.' },
  sd_attn_title: { en:'Needs attention', vi:'Cần chú ý' }, sd_attn_none: { en:'Nothing needs attention.', vi:'Không có gì cần chú ý.' },
  sd_attn_student_no_parent: { en:'Students with no parent', vi:'Học sinh chưa có phụ huynh' }, sd_attn_parent_no_child: { en:'Parents with no child', vi:'Phụ huynh chưa có con' },
  sd_attn_link_stale: { en:'Links to archived or missing students', vi:'Liên kết tới học sinh đã lưu trữ hoặc không còn' }, sd_attn_staff_no_contact: { en:'Staff with no email or phone', vi:'Nhân viên chưa có email hoặc điện thoại' },
  sd_more: { en:'and {n} more', vi:'và {n} người nữa' },
  sd_staff_search: { en:'Search staff…', vi:'Tìm nhân viên…' }, sd_dept_all: { en:'All departments', vi:'Tất cả phòng ban' }, sd_dept_none: { en:'No department', vi:'Chưa có phòng ban' },
  sd_status_open: { en:'Current', vi:'Đang làm' }, sd_status_archived: { en:'Archived', vi:'Đã lưu trữ' }, sd_view_cards: { en:'Cards', vi:'Thẻ' }, sd_view_table: { en:'Table', vi:'Bảng' },
  sd_add_staff: { en:'+ Add staff', vi:'+ Thêm nhân viên' }, sd_import_csv: { en:'Import CSV', vi:'Nhập CSV' }, sd_export_csv: { en:'Export CSV', vi:'Xuất CSV' },
  sd_template: { en:'Template', vi:'Mẫu' }, sd_print: { en:'Print', vi:'In' },
  sd_new_staff: { en:'New staff member', vi:'Nhân viên mới' }, sd_edit_staff: { en:'Edit staff member', vi:'Sửa thông tin nhân viên' },
  sd_f_extension: { en:'Extension', vi:'Số nội bộ' }, sd_f_room: { en:'Office / room', vi:'Phòng làm việc' }, sd_f_start: { en:'Start date', vi:'Ngày bắt đầu' },
  sd_f_resp: { en:'Responsibilities', vi:'Phụ trách' },
  sd_ext: { en:'ext. {x}', vi:'nội bộ {x}' }, sd_since: { en:'Since {d}', vi:'Từ {d}' },
  sd_staff_count: { en:'{n} staff', vi:'{n} nhân viên' },
  sd_staff_empty: { en:'No staff yet. Add the principal, coordinators, front office, counsellors and IT.', vi:'Chưa có nhân viên. Hãy thêm hiệu trưởng, điều phối viên, lễ tân, tư vấn viên và bộ phận IT.' },
  sd_staff_nomatch: { en:'No staff match your search.', vi:'Không có nhân viên nào khớp.' },
  sd_staff_import_title: { en:'Import staff from a CSV', vi:'Nhập nhân viên từ tệp CSV' },
  sd_staff_import_hint: { en:'First row = column names: name, title, department, email, phone, extension, room, start_date, responsibilities. Only name is required. Dates are YYYY-MM-DD.', vi:'Dòng đầu là tên cột: name, title, department, email, phone, extension, room, start_date, responsibilities. Chỉ cần có tên. Ngày theo dạng YYYY-MM-DD.' },
  sd_print_title: { en:'Staff directory', vi:'Danh bạ nhân viên' },
  sd_close: { en:'Close', vi:'Đóng' }, sd_paste_ph: { en:'Paste CSV here', vi:'Dán CSV vào đây' },
  sd_roster_title: { en:'Import students with their parents', vi:'Nhập học sinh kèm phụ huynh' },
  sd_roster_open: { en:'Import students + parents', vi:'Nhập học sinh + phụ huynh' },
  sd_roster_hint: { en:'One row per student: name (or first_name + last_name), student_id, class. Add parent1_name, parent1_email, parent1_phone, parent1_relationship (and parent2_…) to create and link parents in the same step. Parents who share an email become one record, so siblings share their parent.', vi:'Mỗi dòng một học sinh: name (hoặc first_name + last_name), student_id, class. Thêm parent1_name, parent1_email, parent1_phone, parent1_relationship (và parent2_…) để tạo và liên kết phụ huynh cùng lúc. Phụ huynh trùng email là một hồ sơ, nên anh chị em dùng chung phụ huynh.' },
  sd_roster_plan: { en:'{c} students to add · {d} already exist · {i} with problems', vi:'Sẽ thêm {c} học sinh · {d} đã có · {i} có vấn đề' },
  sd_roster_plan2: { en:'{pn} new parents · {pe} existing parents · {l} links', vi:'{pn} phụ huynh mới · {pe} phụ huynh đã có · {l} liên kết' },
  sd_roster_ignored: { en:'Columns not used: {cols}', vi:'Cột không dùng: {cols}' },
  sd_roster_notes: { en:'{n} parents have no email, so they cannot be matched when they sign in.', vi:'{n} phụ huynh chưa có email nên không thể ghép khi họ đăng nhập.' },
  sd_roster_go: { en:'Add {n} students', vi:'Thêm {n} học sinh' },
  sd_roster_done: { en:'Added {s} students, {p} new parents and {l} links.', vi:'Đã thêm {s} học sinh, {p} phụ huynh mới và {l} liên kết.' },
  sd_roster_failed: { en:'{n} records could not be saved. See Activity and try again.', vi:'Không lưu được {n} hồ sơ. Xem Hoạt động và thử lại.' },
  sd_st_duplicate: { en:'Already in the directory', vi:'Đã có trong danh bạ' }, sd_parent_n: { en:'parent {n}', vi:'phụ huynh {n}' },
  sd_fam_students: { en:'Students', vi:'Học sinh' }, sd_fam_parents: { en:'Parents', vi:'Phụ huynh' },
  sd_fam_only_nop: { en:'Only students with no parent', vi:'Chỉ học sinh chưa có phụ huynh' }, sd_fam_only_nokid: { en:'Only parents with no child', vi:'Chỉ phụ huynh chưa có con' },
  sd_fam_search: { en:'Search by name, email or class…', vi:'Tìm theo tên, email hoặc lớp…' },
  sd_fam_empty: { en:'Nothing to show here.', vi:'Không có gì để hiển thị.' },
  sd_fam_note: { en:'Links record which parents the school connects to each student. Parents get ParentDeck access when they sign in and claim their record (a later build).', vi:'Liên kết ghi lại phụ huynh nào được trường gắn với từng học sinh. Phụ huynh sẽ dùng được ParentDeck khi đăng nhập và nhận hồ sơ của mình (bản sau).' },
  sd_no_class: { en:'No class', vi:'Chưa có lớp' }, sd_stale: { en:'archived or missing', vi:'đã lưu trữ hoặc không còn' },
  sd_accounts_linked: { en:'{n} linked account(s)', vi:'{n} tài khoản đã liên kết' },
  sd_link_parent: { en:'Link a parent', vi:'Liên kết phụ huynh' }, sd_link_find: { en:'Find a parent (name or email)', vi:'Tìm phụ huynh (tên hoặc email)' },
  sd_link_existing: { en:'Existing parent', vi:'Phụ huynh đã có' }, sd_link_new: { en:'New parent', vi:'Phụ huynh mới' },
  sd_link_rel: { en:'Relationship (e.g. Mother)', vi:'Quan hệ (ví dụ: Mẹ)' }, sd_link_go: { en:'Link', vi:'Liên kết' },
  sd_link_none: { en:'No parent matches. Try “New parent”.', vi:'Không có phụ huynh nào khớp. Hãy thử “Phụ huynh mới”.' },
  sd_linked: { en:'Linked', vi:'Đã liên kết' }, sd_unlinked: { en:'Unlinked', vi:'Đã bỏ liên kết' }, sd_unlink: { en:'Unlink {name}', vi:'Bỏ liên kết {name}' },
  sd_act_empty: { en:'No activity yet.', vi:'Chưa có hoạt động.' }, sd_act_people: { en:'{n} people', vi:'{n} người' },
  sd_act_directory_create: { en:'Person added', vi:'Thêm người' }, sd_act_directory_update: { en:'Person updated', vi:'Cập nhật hồ sơ' }, sd_act_directory_import: { en:'CSV import', vi:'Nhập CSV' },
  sd_act_directory_backfill: { en:'Existing accounts imported', vi:'Nhập tài khoản hiện có' }, sd_act_directory_archive: { en:'Archived', vi:'Lưu trữ' }, sd_act_directory_restore: { en:'Restored', vi:'Khôi phục' },
  sd_act_schooldeck_link: { en:'Linked', vi:'Liên kết' }, sd_act_schooldeck_unlink: { en:'Unlinked', vi:'Bỏ liên kết' }, sd_act_schooldeck_importRoster: { en:'Roster import', vi:'Nhập danh sách lớp' },
  sd_err_parent_not_found: { en:'Parent not found', vi:'Không tìm thấy phụ huynh' }, sd_err_student_not_found: { en:'Student not found', vi:'Không tìm thấy học sinh' },
  sd_err_not_a_parent: { en:'That record is not a parent', vi:'Hồ sơ này không phải phụ huynh' }, sd_err_not_a_student: { en:'That record is not a student', vi:'Hồ sơ này không phải học sinh' },
  sd_err_parent_archived: { en:'That parent is archived', vi:'Phụ huynh này đã được lưu trữ' }, sd_err_student_archived: { en:'That student is archived', vi:'Học sinh này đã được lưu trữ' },
  sd_err_already_linked: { en:'Already linked', vi:'Đã được liên kết' }, sd_err_not_linked: { en:'Not linked', vi:'Chưa được liên kết' },
  sd_err_too_many_children: { en:'A parent can be linked to at most {max} children', vi:'Một phụ huynh chỉ liên kết tối đa {max} học sinh' },
  sd_err_too_many_parents: { en:'A student can have at most {max} parents', vi:'Một học sinh chỉ có tối đa {max} phụ huynh' },
  sd_err_parent_no_email: { en:'No email, so they cannot be matched when they sign in', vi:'Chưa có email nên không thể ghép khi đăng nhập' },
  dir_err_date_invalid: { en:'Use a real date (YYYY-MM-DD)', vi:'Hãy nhập ngày hợp lệ (YYYY-MM-DD)' },
};

const SDUI = {
  data: null, people: [], attn: [], check: null, body: null, alive: () => false,
  tab: 'overview', attnOpen: '',
  staff: { search: '', department: '', status: 'open', view: 'cards', panel: null, form: null, errs: [], dup: null, imp: null, busy: false },
  fam: { view: 'students', search: '', onlyEmpty: true, linkFor: '', link: null, rosterOpen: false, roster: null, busy: false },
  act: { entries: null, err: '', loading: false },
};

/* ---------------- small helpers ---------------- */
const sdLocale = () => LOCALE_MAP[state.lang] || 'en-US';
function sdErr(e){ const k = STRINGS['sd_err_' + e.code] ? 'sd_err_' + e.code : 'dir_err_' + e.code; return t(k, { max: e.max }); }
function sdMsg(e){ return (e && e.message) || String(e); }
function sdDate(iso){ const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString(sdLocale(), { year: 'numeric', month: 'short', day: 'numeric' }); }
function sdDownload(name, text){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([(window.Watermark ? Watermark.stamp(text) : text)], { type: 'text/csv;charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const sdOpen = (p) => p.status !== 'archived';
const sdToday = () => new Date().toISOString().slice(0, 10);

function sdDerive(){
  SDUI.people = SchoolDeck.enrichLinks(SDUI.data.people || []);
  SDUI.attn = SchoolDeck.schoolAttention(SDUI.people);
  SDUI.check = SchoolDeck.setupChecklist(SDUI.people, SDUI.data.classes || []);
}
async function sdReload(){
  try{ SDUI.data = await AD.directoryList(true); }catch(e){ toast(sdMsg(e)); return; }
  if(!SDUI.alive()) return;
  sdDerive(); sdPaintPane();
}

/* ---------------- entry point + frame ---------------- */
function renderSchoolDeck(body){
  SDUI.body = body;
  return widgetBoot(body, async (b, isAlive) => {
    const data = await AD.directoryList();
    if(!isAlive()) return;
    SDUI.alive = isAlive; SDUI.data = data; SDUI.act.entries = null; sdDerive(); sdPaint();
  });
}
function sdPaint(){
  const body = SDUI.body;
  const tabs = ['overview', 'classes', 'schedule', 'history', 'staff', 'families', 'activity'].map(k => `<button class="chip${SDUI.tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}" role="tab" aria-selected="${SDUI.tab === k}">${esc(t('sd_tab_' + k))}</button>`).join('');
  body.innerHTML = frameTop() + `<div class="seg" role="tablist">${tabs}</div><div id="sd-pane"></div>`;
  wireRefreshBtn(body);
  body.onclick = sdClick; body.oninput = sdInput; body.onchange = sdChange;
  sdPaintPane();
}
function sdPaintPane(){
  const body = SDUI.body, pane = body && body.querySelector('#sd-pane');
  if(!pane) return;
  body.querySelectorAll('[data-act="tab"]').forEach(b => { const on = b.dataset.tab === SDUI.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  if(SDUI.tab === 'overview') pane.innerHTML = sdOverviewHtml();
  else if(SDUI.tab === 'classes'){ pane.innerHTML = cdHtml(); cdShow(); }          // js/classdeck-ui.js
  else if(SDUI.tab === 'schedule'){ pane.innerHTML = scHtml(); scShow(); }           // js/schedule-ui.js
  else if(SDUI.tab === 'history'){ pane.innerHTML = hsHtml(); hsShow(); }            // js/history-ui.js
  else if(SDUI.tab === 'staff') pane.innerHTML = sdStaffHtml();
  else if(SDUI.tab === 'families') pane.innerHTML = sdFamiliesHtml();
  else { pane.innerHTML = sdActivityHtml(); if(SDUI.act.entries === null && !SDUI.act.loading) sdLoadActivity(); }
}

/* ---------------- overview ---------------- */
function sdOverviewHtml(){
  const open = SDUI.people.filter(sdOpen), n = (ty) => open.filter(p => p.type === ty).length;
  const tiles = [['teachers', n('teacher')], ['students', n('student')], ['parents', n('parent')], ['staff', n('staff')], ['classes', (SDUI.data.classes || []).length]]
    .map(([k, v]) => `<div class="sd-tile"><b>${esc(fmtNum(v))}</b><span>${esc(t('sd_count_' + k))}</span></div>`).join('');
  const bf = SDUI.data.backfill;
  const banner = bf && bf.total > 0 ? `<div class="dir-banner"><span>${esc(t('sd_backfill', { n: bf.total }))}</span><button class="wbtn sm primary" data-act="go" data-go="directory">${esc(t('sd_go_directory'))}</button></div>` : '';
  const marks = { done: '✓', doing: '…', todo: '○', later: '·', unknown: '?' };
  const go = { teachers: ['directory', 'sd_go_directory'], students: ['import', 'sd_go_import'], parents: ['link', 'sd_go_link'], classes: ['classes', 'sd_go_classes'], assign: ['classes', 'sd_go_classes'], push: ['classes', 'sd_go_classes'] };
  const steps = SDUI.check.steps.map((s, i) => {
    const g = go[s.key];
    const prog = s.have > 0 && s.state !== 'unknown' ? ` <span class="sd-prog">${esc(t('sd_progress', { done: s.done, have: s.have }))}</span>` : '';
    return `<li class="sd-step ${s.state}"><span class="sd-mark" title="${esc(t('sd_state_' + s.state))}" aria-label="${esc(t('sd_state_' + s.state))}">${marks[s.state]}</span>
      <div class="sd-step-main"><div class="dir-name">${i + 1}. ${esc(t('sd_step_' + s.key))}${prog}</div><div class="dir-sub">${esc(t('sd_step_' + s.key + '_d'))}</div>${s.state === 'unknown' ? `<div class="dir-sub">${esc(t('sd_unknown_note'))}</div>` : ''}</div>
      ${g && s.state !== 'done' ? `<button class="wbtn sm" data-act="go" data-go="${g[0]}">${esc(t(g[1]))}</button>` : ''}</li>`;
  }).join('');
  const chips = SDUI.attn.length
    ? SDUI.attn.map(a => `<button class="chip${SDUI.attnOpen === a.key ? ' on' : ''}" data-act="attn" data-key="${a.key}">${esc(t('sd_attn_' + a.key))} <b>${a.ids.length}</b></button>`).join('')
    : `<span class="hint">${esc(t('sd_attn_none'))}</span>`;
  const sel = SDUI.attn.find(a => a.key === SDUI.attnOpen);
  const byId = new Map(SDUI.people.map(p => [p.personId, p]));
  const list = sel ? `<div class="dir-plan">${sel.ids.slice(0, 20).map(id => { const p = byId.get(id); return p ? `<div class="dir-issue"><span class="badge t-${p.type}">${esc(t('dir_type_' + p.type))}</span> ${esc(p.displayName)}</div>` : ''; }).join('')}${sel.ids.length > 20 ? `<div class="dir-issue">${esc(t('sd_more', { n: sel.ids.length - 20 }))}</div>` : ''}</div>` : '';
  return `${banner}<h3 class="sd-h">${esc(t('sd_ov_title'))}</h3><p class="hint">${esc(t('sd_ov_sub'))}</p>
    <div class="sd-tiles">${tiles}</div><ol class="sd-steps">${steps}</ol>
    <div class="dir-attn"><span class="dir-attn-title">${esc(t('sd_attn_title'))}</span>${chips}</div>${list}`;
}

/* ---------------- staff directory ---------------- */
const SD_STAFF_FIELDS = ['displayName', 'title', 'department', 'email', 'phone', 'extension', 'room', 'startDate', 'responsibilities'];
function sdStaffHtml(){
  const f = SDUI.staff, meta = SchoolDeck.groupStaff(SDUI.people, { status: f.status });
  const opts = `<option value="">${esc(t('sd_dept_all'))}</option>` + meta.departments.map(d => `<option value="${esc(d)}"${f.department === d ? ' selected' : ''}>${esc(d)}</option>`).join('')
    + `<option value="__none__"${f.department === '__none__' ? ' selected' : ''}>${esc(t('sd_dept_none'))}</option>`;
  return `<div class="dir-actions chip-row">
      <button class="wbtn sm primary" data-act="staff-add">${esc(t('sd_add_staff'))}</button>
      <button class="wbtn sm" data-act="staff-import">${esc(t('sd_import_csv'))}</button>
      <button class="wbtn sm" data-act="staff-export">${esc(t('sd_export_csv'))}</button>
      <button class="wbtn sm" data-act="staff-template">${esc(t('sd_template'))}</button>
      <button class="wbtn sm" data-act="staff-print">${esc(t('sd_print'))}</button></div>
    <div id="sd-staff-panel">${sdStaffPanelHtml()}</div>
    <div class="dir-filters"><input type="text" id="sd-staff-q" placeholder="${esc(t('sd_staff_search'))}" value="${esc(f.search)}">
      <select id="sd-staff-dept">${opts}</select>
      <select id="sd-staff-status"><option value="open"${f.status === 'open' ? ' selected' : ''}>${esc(t('sd_status_open'))}</option><option value="archived"${f.status === 'archived' ? ' selected' : ''}>${esc(t('sd_status_archived'))}</option></select></div>
    <div class="seg"><button class="chip${f.view === 'cards' ? ' on' : ''}" data-act="staff-view" data-view="cards">${esc(t('sd_view_cards'))}</button><button class="chip${f.view === 'table' ? ' on' : ''}" data-act="staff-view" data-view="table">${esc(t('sd_view_table'))}</button></div>
    <div id="sd-staff-list">${sdStaffListHtml()}</div>`;
}
function sdStaffListHtml(){
  const f = SDUI.staff, g = SchoolDeck.groupStaff(SDUI.people, { search: f.search, department: f.department, status: f.status });
  if(!g.total){
    const none = SchoolDeck.groupStaff(SDUI.people, { status: f.status }).total === 0;
    return `<p class="empty">${esc(t(none && f.status === 'open' ? 'sd_staff_empty' : 'sd_staff_nomatch'))}</p>`;
  }
  const actions = (p) => `<button class="wbtn sm" data-act="staff-edit" data-id="${esc(p.personId)}">${esc(t('dir_edit'))}</button> <button class="wbtn sm" data-act="staff-arch" data-id="${esc(p.personId)}" data-do="${p.status === 'archived' ? 'restore' : 'archive'}">${esc(t(p.status === 'archived' ? 'dir_restore' : 'dir_archive'))}</button>`;
  const contact = (p) => [
    p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '', p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '',
    p.extension ? esc(t('sd_ext', { x: p.extension })) : '', p.room ? esc(p.room) : '',
  ].filter(Boolean).join(' · ');
  return g.groups.map(grp => {
    const head = `<h4 class="sd-dept">${esc(grp.department || t('sd_dept_none'))} <span class="badge anon">${esc(t('sd_staff_count', { n: grp.people.length }))}</span></h4>`;
    if(f.view === 'table'){
      return head + `<div class="sd-table-wrap"><table class="sd-table"><tbody>${grp.people.map(p => `<tr><td><b>${esc(p.displayName)}</b><div class="dir-sub">${esc(p.title || '')}</div></td><td>${contact(p) || '—'}</td><td class="sd-act">${actions(p)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    return head + `<div class="sd-cards">${grp.people.map(p => `<div class="sd-card"><div class="dir-name">${esc(p.displayName)}</div>
      ${p.title ? `<div class="dir-sub">${esc(p.title)}</div>` : ''}${contact(p) ? `<div class="sd-lines">${contact(p)}</div>` : ''}
      ${p.startDate ? `<div class="dir-sub">${esc(t('sd_since', { d: sdDate(p.startDate) }))}</div>` : ''}${p.responsibilities ? `<div class="dir-sub">${esc(p.responsibilities)}</div>` : ''}
      <div class="sd-card-act">${actions(p)}</div></div>`).join('')}</div>`;
  }).join('');
}
function sdStaffPanelHtml(){
  const f = SDUI.staff;
  if(f.panel === 'form') return sdStaffFormHtml();
  if(f.panel === 'import') return sdStaffImportHtml();
  return '';
}
function sdStaffFormHtml(){
  const f = SDUI.staff, v = f.form || {}, errs = f.errs || [];
  const err = (name) => errs.filter(e => e.field === name).map(e => `<p class="dir-err">${esc(sdErr(e))}</p>`).join('');
  const depts = SchoolDeck.groupStaff(SDUI.people, { status: 'all' }).departments;
  const fld = (name, key, type) => `<label class="dir-field"><span>${esc(t(key))}</span><input type="${type || 'text'}" id="sd-f-${name}" value="${esc(v[name] || '')}"${name === 'department' ? ' list="sd-depts"' : ''}>${err(name)}</label>`;
  const dup = f.dup ? `<div class="dir-dup"><b>${esc(t('dir_dup_title'))}</b>${f.dup.map(m => `<div>${esc(m.displayName)} — ${esc(t('dir_dup_' + m.reason))}</div>`).join('')}<button class="wbtn sm" data-act="staff-save-force">${esc(t('dir_add_anyway'))}</button></div>` : '';
  return `<div class="dir-panel"><div class="dir-panel-head"><b>${esc(t(v.personId ? 'sd_edit_staff' : 'sd_new_staff'))}</b></div>
    <datalist id="sd-depts">${depts.map(d => `<option value="${esc(d)}">`).join('')}</datalist>
    <div class="dir-fields">${fld('displayName', 'dir_f_name')}${fld('title', 'dir_f_title')}${fld('department', 'dir_f_dept')}${fld('email', 'dir_f_email')}${fld('phone', 'dir_f_phone')}
      ${fld('extension', 'sd_f_extension')}${fld('room', 'sd_f_room')}${fld('startDate', 'sd_f_start', 'date')}</div>
    <label class="dir-field"><span>${esc(t('sd_f_resp'))}</span><textarea id="sd-f-responsibilities" rows="2">${esc(v.responsibilities || '')}</textarea>${err('responsibilities')}</label>
    ${err('type')}${dup}
    <div class="btn-row"><button class="wbtn sm primary" data-act="staff-save"${f.busy ? ' disabled' : ''}>${esc(t('dir_save'))}</button><button class="wbtn sm" data-act="staff-cancel">${esc(t('dir_cancel'))}</button></div></div>`;
}
function sdReadStaffForm(){
  const pane = SDUI.body, person = { type: 'staff' };
  SD_STAFF_FIELDS.forEach(k => { const el = pane.querySelector('#sd-f-' + k); person[k] = el ? el.value : ''; });
  if(SDUI.staff.form && SDUI.staff.form.personId) person.personId = SDUI.staff.form.personId;
  return person;
}
async function sdSaveStaff(force){
  const f = SDUI.staff; if(f.busy) return;
  const person = sdReadStaffForm(); f.form = person; f.errs = []; f.dup = null; f.busy = true; sdRepaintStaffPanel();
  try{
    await AD.directoryCall('adminDirectoryUpsert', { person, force: !!force });
    f.busy = false; f.panel = null; f.form = null; toast(t('dir_saved')); await sdReload(); return;
  }catch(e){
    if(e && e.status === 400 && e.data && e.data.errors) f.errs = e.data.errors;
    else if(e && e.status === 409 && e.data && e.data.duplicates) f.dup = e.data.duplicates;
    else toast(sdMsg(e));
  }
  f.busy = false; sdRepaintStaffPanel();
}
function sdRepaintStaffPanel(){ const el = SDUI.body.querySelector('#sd-staff-panel'); if(el) el.innerHTML = sdStaffPanelHtml(); }
async function sdArchive(id, action){
  try{ const r = await AD.directoryCall('adminDirectoryArchive', { personIds: [id], action }); toast(t(action === 'archive' ? 'dir_archived' : 'dir_restored', { n: r.changed })); await sdReload(); }
  catch(e){ toast(sdMsg(e)); }
}
function sdStaffImportHtml(){
  const im = SDUI.staff.imp, plan = im.plan;
  const issues = plan ? plan.results.filter(r => r.status !== 'create').slice(0, 25) : [];
  const cause = (r) => r.status === 'duplicate' ? r.matches.map(m => `${t('dir_dup_' + m.reason)}: ${m.displayName}`).join('; ') : r.errors.map(sdErr).join('; ');
  return `<div class="dir-panel"><div class="dir-panel-head"><b>${esc(t('sd_staff_import_title'))}</b></div>
    <label class="dir-field"><span>${esc(t('dir_import_file'))}</span><input type="file" id="sd-imp-file" accept=".csv,text/csv,text/plain"></label>
    <textarea id="sd-imp-text" rows="5" placeholder="${esc(t('sd_paste_ph'))}">${esc(im.text)}</textarea>
    <p class="hint">${esc(t('sd_staff_import_hint'))}</p>
    ${im.parseErrors.map(e => `<p class="dir-err">${esc(sdErr(e))}</p>`).join('')}
    ${im.ignored.length ? `<p class="hint">${esc(t('sd_roster_ignored', { cols: im.ignored.join(', ') }))}</p>` : ''}
    ${plan ? `<div class="dir-plan"><b>${esc(t('dir_import_summary', { c: plan.summary.create, d: plan.summary.duplicate, i: plan.summary.invalid }))}</b>
      ${issues.map(r => `<div class="dir-issue"><span class="badge ${r.status === 'duplicate' ? 'warn' : 'bad'}">${esc(t('dir_import_row', { row: r.row }))}</span> ${esc(r.person.displayName || '—')} — ${esc(cause(r))}</div>`).join('')}</div>` : ''}
    <div class="btn-row"><button class="wbtn sm" data-act="staff-imp-preview"${SDUI.staff.busy ? ' disabled' : ''}>${esc(t('dir_preview'))}</button>
      ${plan && plan.summary.create ? `<button class="wbtn sm primary" data-act="staff-imp-go"${SDUI.staff.busy ? ' disabled' : ''}>${esc(t('dir_import_n', { n: plan.summary.create }))}</button>` : ''}
      <button class="wbtn sm" data-act="staff-imp-close">${esc(t('dir_cancel'))}</button></div></div>`;
}
async function sdStaffImportRun(dryRun){
  const f = SDUI.staff, im = f.imp;
  const parsed = Directory.csvToPeople(im.text, 'staff');
  im.parseErrors = parsed.errors; im.ignored = parsed.ignoredHeaders;
  if(!parsed.people.length){ im.plan = null; sdRepaintStaffPanel(); return; }
  f.busy = true; sdRepaintStaffPanel();
  try{
    const r = await AD.directoryCall('adminDirectoryImport', { type: 'staff', people: parsed.people, dryRun });
    if(dryRun) im.plan = { summary: r.summary, results: r.results };
    else { toast(t('dir_import_done', { n: r.created })); f.busy = false; f.panel = null; f.imp = null; await sdReload(); return; }
  }catch(e){ toast(sdMsg(e)); }
  f.busy = false; sdRepaintStaffPanel();
}
function sdStaffLabels(){ return { name: t('dir_f_name'), title: t('dir_f_title'), department: t('dir_f_dept'), email: t('dir_f_email'), phone: t('dir_f_phone'), extension: t('sd_f_extension'), room: t('sd_f_room'), start_date: t('sd_f_start'), responsibilities: t('sd_f_resp'), status: t('dir_exp_status') }; }
function sdStaffExport(){
  const f = SDUI.staff, g = SchoolDeck.groupStaff(SDUI.people, { search: f.search, department: f.department, status: f.status });
  const list = [].concat(...g.groups.map(x => x.people));
  sdDownload(`staff-${sdToday()}.csv`, SchoolDeck.staffToCsv(list, sdStaffLabels()));
  toast(t('dir_exported', { n: list.length }));
}
function sdStaffPrint(){
  const f = SDUI.staff, g = SchoolDeck.groupStaff(SDUI.people, { search: f.search, department: f.department, status: f.status });
  const cell = (s) => esc(s || '');
  const rows = g.groups.map(grp => `<h2>${cell(grp.department || t('sd_dept_none'))}</h2><table><tbody>${grp.people.map(p => `<tr><td><b>${cell(p.displayName)}</b><br>${cell(p.title)}</td><td>${cell(p.email)}<br>${cell(p.phone)}</td><td>${p.extension ? cell(t('sd_ext', { x: p.extension })) : ''}<br>${cell(p.room)}</td></tr>`).join('')}</tbody></table>`).join('');
  const w = window.open('', '_blank');
  if(!w){ toast(t('sd_print') + ': popup blocked'); return; }
  w.document.write(`<!doctype html><html lang="${esc(state.lang)}"><head><meta charset="utf-8"><title>${esc(t('sd_print_title'))}</title><style>
    body{font:12px/1.4 Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0 0 2px}p{margin:0 0 14px;color:#555}h2{font-size:14px;margin:16px 0 4px;border-bottom:2px solid #1E6BFF;padding-bottom:3px}
    table{width:100%;border-collapse:collapse}td{padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:top;width:33%}tr{page-break-inside:avoid}</style></head>
    <body><h1>${esc(t('sd_print_title'))}</h1><p>${esc(new Date().toLocaleDateString(sdLocale(), { year: 'numeric', month: 'long', day: 'numeric' }))} · ${esc(t('sd_staff_count', { n: g.total }))}</p>${rows}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
}

/* ---------------- parents & links ---------------- */
function sdFamiliesHtml(){
  const f = SDUI.fam;
  return `<div class="dir-actions chip-row"><button class="wbtn sm primary" data-act="roster-open">${esc(t('sd_roster_open'))}</button><button class="wbtn sm" data-act="roster-template">${esc(t('sd_template'))}</button></div>
    <div id="sd-roster-panel">${f.rosterOpen ? sdRosterHtml() : ''}</div>
    <p class="hint">${esc(t('sd_fam_note'))}</p>
    <div class="seg"><button class="chip${f.view === 'students' ? ' on' : ''}" data-act="fam-view" data-view="students">${esc(t('sd_fam_students'))}</button><button class="chip${f.view === 'parents' ? ' on' : ''}" data-act="fam-view" data-view="parents">${esc(t('sd_fam_parents'))}</button></div>
    <div class="dir-filters"><input type="text" id="sd-fam-q" placeholder="${esc(t('sd_fam_search'))}" value="${esc(f.search)}">
      <label class="dir-confirm sd-check"><input type="checkbox" id="sd-fam-only"${f.onlyEmpty ? ' checked' : ''}> ${esc(t(f.view === 'students' ? 'sd_fam_only_nop' : 'sd_fam_only_nokid'))}</label></div>
    <div id="sd-fam-list">${sdFamListHtml()}</div>`;
}
function sdMatches(p, q){
  if(!q) return true;
  const hay = Directory.fold([p.displayName, p.email, p.className, p.studentNumber].join(' '));
  return Directory.fold(q).split(' ').filter(Boolean).every(w => hay.includes(w));
}
function sdFamListHtml(){
  const f = SDUI.fam, open = SDUI.people.filter(sdOpen), CAP = 100;
  if(f.view === 'students'){
    let list = open.filter(p => p.type === 'student' && sdMatches(p, f.search));
    if(f.onlyEmpty) list = list.filter(p => !(p.parentRecordCount > 0 || p.guardianCount > 0));
    if(!list.length) return `<p class="empty">${esc(t('sd_fam_empty'))}</p>`;
    return list.slice(0, CAP).map(s => {
      const chips = (s.parentRecords || []).map(pr => `<span class="chip sd-link">${esc(pr.name)}${pr.relationship ? ` (${esc(pr.relationship)})` : ''} <button class="sd-x" data-act="unlink" data-parent="${esc(pr.personId)}" data-student="${esc(s.personId)}" aria-label="${esc(t('sd_unlink', { name: pr.name }))}" title="${esc(t('sd_unlink', { name: pr.name }))}">×</button></span>`).join('');
      const acct = s.guardianCount > 0 ? `<span class="badge full">${esc(t('sd_accounts_linked', { n: s.guardianCount }))}</span>` : '';
      return `<div class="dir-row sd-row"><div class="dir-main"><span class="dir-name">${esc(s.displayName)}</span><span class="badge anon">${esc(s.className || t('sd_no_class'))}</span>${acct}
        <button class="wbtn sm" data-act="link-open" data-student="${esc(s.personId)}">${esc(t('sd_link_parent'))}</button></div>
        ${chips ? `<div class="chip-row">${chips}</div>` : ''}${f.linkFor === s.personId ? sdLinkPanelHtml(s) : ''}</div>`;
    }).join('') + (list.length > CAP ? `<p class="hint">${esc(t('sd_more', { n: list.length - CAP }))}</p>` : '');
  }
  let list = open.filter(p => p.type === 'parent' && sdMatches(p, f.search));
  if(f.onlyEmpty) list = list.filter(p => !(p.childRecordCount > 0 || p.childCount > 0));
  if(!list.length) return `<p class="empty">${esc(t('sd_fam_empty'))}</p>`;
  return list.slice(0, CAP).map(p => {
    const chips = (p.children || []).map(c => `<span class="chip sd-link${c.status === 'archived' || c.status === 'missing' ? ' stale' : ''}">${esc(c.name || '—')}${c.className ? ` · ${esc(c.className)}` : ''}${c.relationship ? ` (${esc(c.relationship)})` : ''}${c.status === 'archived' || c.status === 'missing' ? ` · ${esc(t('sd_stale'))}` : ''} <button class="sd-x" data-act="unlink" data-parent="${esc(p.personId)}" data-student="${esc(c.personId)}" aria-label="${esc(t('sd_unlink', { name: c.name || '' }))}">×</button></span>`).join('');
    return `<div class="dir-row sd-row"><div class="dir-main"><span class="dir-name">${esc(p.displayName)}</span>${p.email ? `<span class="dir-sub">${esc(p.email)}</span>` : ''}</div>${chips ? `<div class="chip-row">${chips}</div>` : ''}</div>`;
  }).join('') + (list.length > CAP ? `<p class="hint">${esc(t('sd_more', { n: list.length - CAP }))}</p>` : '');
}
/* the inline panel under a student: pick an existing parent, or make a new one, then Link */
function sdLinkPanelHtml(student){
  const L = SDUI.fam.link;
  const errs = (L.errs || []).map(e => `<p class="dir-err">${esc(sdErr(e))}</p>`).join('');
  const dup = L.dup ? `<div class="dir-dup"><b>${esc(t('dir_dup_title'))}</b>${L.dup.map(m => `<div>${esc(m.displayName)} — ${esc(t('dir_dup_' + m.reason))} <button class="wbtn sm" data-act="link-use" data-parent="${esc(m.personId)}">${esc(t('sd_link_go'))}</button></div>`).join('')}</div>` : '';
  const seg = `<div class="seg"><button class="chip${!L.isNew ? ' on' : ''}" data-act="link-mode" data-mode="existing">${esc(t('sd_link_existing'))}</button><button class="chip${L.isNew ? ' on' : ''}" data-act="link-mode" data-mode="new">${esc(t('sd_link_new'))}</button></div>`;
  let pick;
  if(L.isNew){
    const nf = (id, key, val) => `<label class="dir-field"><span>${esc(t(key))}</span><input type="text" id="${id}" value="${esc(val || '')}"></label>`;
    pick = `<div class="dir-fields">${nf('sd-n-name', 'dir_f_name', L.name)}${nf('sd-n-email', 'dir_f_email', L.email)}${nf('sd-n-phone', 'dir_f_phone', L.phone)}</div>`;
  }else{
    const q = Directory.fold(L.search || '');
    const cands = SDUI.people.filter(p => p.type === 'parent' && sdOpen(p) && !(p.links || []).some(l => l.studentId === student.personId) && (!q || Directory.fold(p.displayName + ' ' + (p.email || '')).includes(q))).slice(0, 8);
    pick = `<input type="text" id="sd-l-search" placeholder="${esc(t('sd_link_find'))}" value="${esc(L.search || '')}">
      <div class="chip-row" id="sd-l-cands">${sdCandidatesHtml(cands, L.parentId)}</div>`;
  }
  return `<div class="dir-panel sd-link-panel">${seg}${pick}<label class="dir-field"><span>${esc(t('sd_link_rel'))}</span><input type="text" id="sd-l-rel" value="${esc(L.relationship || '')}"></label>${errs}${dup}
    <div class="btn-row"><button class="wbtn sm primary" data-act="link-go"${SDUI.fam.busy ? ' disabled' : ''}>${esc(t('sd_link_go'))}</button><button class="wbtn sm" data-act="link-close">${esc(t('dir_cancel'))}</button></div></div>`;
}
function sdCandidatesHtml(cands, selected){
  if(!cands.length) return `<span class="hint">${esc(t('sd_link_none'))}</span>`;
  return cands.map(p => `<button class="chip${selected === p.personId ? ' on' : ''}" data-act="link-pick" data-parent="${esc(p.personId)}">${esc(p.displayName)}${p.email ? ` · ${esc(p.email)}` : ''}</button>`).join('');
}
function sdReadLinkInputs(){
  const L = SDUI.fam.link, q = (s) => SDUI.body.querySelector(s);
  const rel = q('#sd-l-rel'); if(rel) L.relationship = rel.value;
  if(L.isNew){ L.name = (q('#sd-n-name') || {}).value || ''; L.email = (q('#sd-n-email') || {}).value || ''; L.phone = (q('#sd-n-phone') || {}).value || ''; }
}
async function sdLinkCall(parentId, studentId, relationship){
  return AD.schoolDeckCall('adminSchoolDeckLink', { action: 'link', parentId, studentId, relationship });
}
async function sdLinkGo(useParentId){
  const fam = SDUI.fam, L = fam.link; if(fam.busy || !L) return;
  sdReadLinkInputs(); L.errs = []; L.dup = null;
  let parentId = useParentId || (L.isNew ? '' : L.parentId);
  if(!L.isNew && !parentId){ L.errs = [{ field: 'parentId', code: 'parent_not_found' }]; return sdPaintFamList(); }
  fam.busy = true;
  try{
    if(L.isNew && !parentId){
      const r = await AD.directoryCall('adminDirectoryUpsert', { person: { type: 'parent', displayName: L.name, email: L.email, phone: L.phone, relationship: L.relationship }, force: false });
      parentId = r.personId;
    }
    await sdLinkCall(parentId, fam.linkFor, L.relationship);
    fam.busy = false; fam.linkFor = ''; fam.link = null; toast(t('sd_linked')); await sdReload(); return;
  }catch(e){
    if(e && e.status === 400 && e.data && e.data.errors) L.errs = e.data.errors;
    else if(e && e.status === 409 && e.data && e.data.duplicates) L.dup = e.data.duplicates;
    else toast(sdMsg(e));
  }
  fam.busy = false; sdPaintFamList();
}
async function sdUnlink(parentId, studentId){
  try{ await AD.schoolDeckCall('adminSchoolDeckLink', { action: 'unlink', parentId, studentId }); toast(t('sd_unlinked')); await sdReload(); }
  catch(e){ toast(sdMsg(e)); }
}
function sdPaintFamList(){ const el = SDUI.body.querySelector('#sd-fam-list'); if(el) el.innerHTML = sdFamListHtml(); }

/* roster import panel */
function sdRosterHtml(){
  const r = SDUI.fam.roster || (SDUI.fam.roster = { text: '', parsed: null, plan: null, done: null });
  const plan = r.plan, issues = [];
  if(plan){
    plan.students.filter(s => s.status !== 'create').forEach(s => issues.push({ row: s.row, name: s.name, bad: s.status === 'invalid', cause: s.status === 'duplicate' ? t('sd_st_duplicate') : s.errors.map(sdErr).join('; ') }));
    plan.warnings.filter(w => !w.info).forEach(w => issues.push({ row: w.row, name: t('sd_parent_n', { n: w.parent }), bad: true, cause: w.errors.map(sdErr).join('; ') }));
  }
  const parseErrs = r.parsed ? r.parsed.errors : [];
  return `<div class="dir-panel"><div class="dir-panel-head"><b>${esc(t('sd_roster_title'))}</b></div>
    <label class="dir-field"><span>${esc(t('dir_import_file'))}</span><input type="file" id="sd-ros-file" accept=".csv,text/csv,text/plain"></label>
    <textarea id="sd-ros-text" rows="5" placeholder="${esc(t('sd_paste_ph'))}">${esc(r.text)}</textarea>
    <p class="hint">${esc(t('sd_roster_hint'))}</p>
    ${parseErrs.map(e => `<p class="dir-err">${esc(sdErr(e))}</p>`).join('')}
    ${r.parsed && r.parsed.ignoredHeaders.length ? `<p class="hint">${esc(t('sd_roster_ignored', { cols: r.parsed.ignoredHeaders.join(', ') }))}</p>` : ''}
    ${plan ? `<div class="dir-plan"><b>${esc(t('sd_roster_plan', { c: plan.summary.students.create, d: plan.summary.students.duplicate, i: plan.summary.students.invalid }))}</b>
      <div>${esc(t('sd_roster_plan2', { pn: plan.summary.parentsNew, pe: plan.summary.parentsExisting, l: plan.summary.links }))}</div>
      ${plan.summary.notes ? `<div class="dir-issue">${esc(t('sd_roster_notes', { n: plan.summary.notes }))}</div>` : ''}
      ${issues.slice(0, 25).map(i => `<div class="dir-issue"><span class="badge ${i.bad ? 'bad' : 'warn'}">${esc(t('dir_import_row', { row: i.row }))}</span> ${esc(i.name || '—')} — ${esc(i.cause)}</div>`).join('')}</div>` : ''}
    ${r.done ? `<p class="hint">${esc(t('sd_roster_done', { s: r.done.students, p: r.done.parents, l: r.done.links }))}${r.failedN ? ' ' + esc(t('sd_roster_failed', { n: r.failedN })) : ''}</p>` : ''}
    <div class="btn-row"><button class="wbtn sm" data-act="roster-preview"${SDUI.fam.busy ? ' disabled' : ''}>${esc(t('dir_preview'))}</button>
      ${plan && plan.summary.students.create ? `<button class="wbtn sm primary" data-act="roster-go"${SDUI.fam.busy ? ' disabled' : ''}>${esc(t('sd_roster_go', { n: plan.summary.students.create }))}</button>` : ''}
      <button class="wbtn sm" data-act="roster-close">${esc(t('dir_cancel'))}</button></div></div>`;
}
function sdRepaintRoster(){ const el = SDUI.body.querySelector('#sd-roster-panel'); if(el) el.innerHTML = SDUI.fam.rosterOpen ? sdRosterHtml() : ''; }
async function sdRosterRun(dryRun){
  const fam = SDUI.fam, r = fam.roster; if(fam.busy) return;
  r.parsed = SchoolDeck.parseRoster(r.text); r.done = null; r.failedN = 0;
  if(!r.parsed.rows.length){ r.plan = null; return sdRepaintRoster(); }
  fam.busy = true; sdRepaintRoster();
  try{
    const res = await AD.schoolDeckCall('adminSchoolDeckImportRoster', { rows: r.parsed.rows, dryRun });
    if(dryRun) r.plan = res;
    else { r.done = res.created; r.failedN = (res.failed || []).length; r.plan = null; r.text = ''; r.parsed = null; fam.busy = false; toast(t('sd_roster_done', { s: res.created.students, p: res.created.parents, l: res.created.links })); await sdReload(); sdRepaintRoster(); return; }
  }catch(e){ toast(sdMsg(e)); }
  fam.busy = false; sdRepaintRoster();
}

/* ---------------- activity ---------------- */
function sdActivityHtml(){
  const a = SDUI.act;
  if(a.loading) return `<p class="empty">${esc(t('loading'))}</p>`;
  if(a.err) return `<p class="err-box">${esc(a.err)}</p>`;
  if(!a.entries) return '';
  if(!a.entries.length) return `<p class="empty">${esc(t('sd_act_empty'))}</p>`;
  return `<div class="sd-log">${a.entries.map(e => {
    const key = 'sd_act_' + String(e.action).replace(/[^A-Za-z0-9]+/g, '_');
    const label = STRINGS[key] ? t(key) : e.action;
    return `<div class="dir-row sd-entry"><div class="dir-main"><span class="badge anon">${esc(label)}</span><span class="dir-sub">${esc(new Date(e.atMs).toLocaleString(sdLocale()))}</span>${e.people > 1 ? `<span class="dir-sub">· ${esc(t('sd_act_people', { n: e.people }))}</span>` : ''}</div><div class="dir-sub">${esc(e.summary)}</div></div>`;
  }).join('')}</div>`;
}
async function sdLoadActivity(){
  const a = SDUI.act; a.loading = true; a.err = '';
  try{
    const r = await AD.schoolDeckCall('adminSchoolDeckActivity', { limit: 100 });
    a.entries = r.entries || [];
  }catch(e){ a.err = sdMsg(e); a.entries = []; }
  a.loading = false;
  if(SDUI.alive() && SDUI.tab === 'activity') sdPaintPane();
}

/* ---------------- events (assigned as properties so a refresh never stacks handlers) ---------------- */
function sdClick(e){
  const el = e.target.closest('[data-act]'); if(!el || !SDUI.body.contains(el)) return;
  const d = el.dataset, f = SDUI.staff, fam = SDUI.fam;
  switch(d.act){
    case 'tab': SDUI.tab = d.tab; if(d.tab === 'activity') SDUI.act.entries = null; else if(d.tab === 'history') HSUI.entries = null; sdPaintPane(); break;
    case 'go':
      if(d.go === 'directory'){ if(typeof openWidget === 'function') openWidget('directory'); }
      else if(d.go === 'classes'){ SDUI.tab = 'classes'; sdPaintPane(); }
      else { SDUI.tab = 'families'; if(d.go === 'import'){ fam.rosterOpen = true; fam.roster = fam.roster || { text: '', parsed: null, plan: null, done: null }; } sdPaintPane(); }
      break;
    case 'attn': SDUI.attnOpen = SDUI.attnOpen === d.key ? '' : d.key; sdPaintPane(); break;
    case 'staff-add': f.panel = 'form'; f.form = {}; f.errs = []; f.dup = null; sdRepaintStaffPanel(); break;
    case 'staff-edit': { const p = SDUI.people.find(x => x.personId === d.id); if(p){ f.panel = 'form'; f.form = { ...p }; f.errs = []; f.dup = null; sdRepaintStaffPanel(); const panel = SDUI.body.querySelector('#sd-staff-panel'); if(panel && panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest' }); } break; }
    case 'staff-save': sdSaveStaff(false); break;
    case 'staff-save-force': sdSaveStaff(true); break;
    case 'staff-cancel': f.panel = null; f.form = null; f.errs = []; f.dup = null; sdRepaintStaffPanel(); break;
    case 'staff-arch': sdArchive(d.id, d.do); break;
    case 'staff-view': f.view = d.view; sdPaintPane(); break;
    case 'staff-import': f.panel = 'import'; f.imp = f.imp || { text: '', plan: null, parseErrors: [], ignored: [] }; sdRepaintStaffPanel(); break;
    case 'staff-imp-preview': sdStaffImportRun(true); break;
    case 'staff-imp-go': sdStaffImportRun(false); break;
    case 'staff-imp-close': f.panel = null; f.imp = null; sdRepaintStaffPanel(); break;
    case 'staff-export': sdStaffExport(); break;
    case 'staff-template': sdDownload('staff-template.csv', SchoolDeck.staffTemplateCsv()); break;
    case 'staff-print': sdStaffPrint(); break;
    case 'roster-open': fam.rosterOpen = true; fam.roster = fam.roster || { text: '', parsed: null, plan: null, done: null }; sdRepaintRoster(); break;
    case 'roster-close': fam.rosterOpen = false; fam.roster = null; sdRepaintRoster(); break;
    case 'roster-preview': sdRosterRun(true); break;
    case 'roster-go': sdRosterRun(false); break;
    case 'roster-template': sdDownload('students-with-parents-template.csv', SchoolDeck.rosterTemplateCsv()); break;
    case 'fam-view': fam.view = d.view; fam.linkFor = ''; fam.link = null; sdPaintPane(); break;
    case 'link-open': fam.linkFor = fam.linkFor === d.student ? '' : d.student; fam.link = { isNew: false, parentId: '', search: '', relationship: '', name: '', email: '', phone: '', errs: [], dup: null }; sdPaintFamList(); break;
    case 'link-close': fam.linkFor = ''; fam.link = null; sdPaintFamList(); break;
    case 'link-mode': sdReadLinkInputs(); fam.link.isNew = d.mode === 'new'; fam.link.errs = []; fam.link.dup = null; sdPaintFamList(); break;
    case 'link-pick': sdReadLinkInputs(); fam.link.parentId = d.parent; sdPaintFamList(); break;
    case 'link-use': sdLinkGo(d.parent); break;
    case 'link-go': sdLinkGo(); break;
    case 'unlink': sdUnlink(d.parent, d.student); break;
    default:
      if(String(d.act).indexOf('cd-') === 0) cdClick(d);        // ClassDeck (js/classdeck-ui.js)
      else if(String(d.act).indexOf('sc-') === 0) scClick(d);   // Schedule (js/schedule-ui.js)
      else if(String(d.act).indexOf('hs-') === 0) hsClick(d);   // History (js/history-ui.js)
  }
}
function sdInput(e){
  const id = e.target.id, f = SDUI.staff, fam = SDUI.fam;
  if(id.indexOf('cd-') === 0){ cdInput(e); return; }
  if(id.indexOf('sc-') === 0){ scInput(e); return; }
  if(id === 'sd-staff-q'){ f.search = e.target.value; const el = SDUI.body.querySelector('#sd-staff-list'); if(el) el.innerHTML = sdStaffListHtml(); }
  else if(id === 'sd-fam-q'){ fam.search = e.target.value; sdPaintFamList(); }
  else if(id === 'sd-imp-text'){ f.imp.text = e.target.value; }
  else if(id === 'sd-ros-text'){ fam.roster.text = e.target.value; }
  else if(id === 'sd-l-search' && fam.link){
    fam.link.search = e.target.value;
    const s = SDUI.people.find(p => p.personId === fam.linkFor), q = Directory.fold(fam.link.search);
    const cands = SDUI.people.filter(p => p.type === 'parent' && sdOpen(p) && !(p.links || []).some(l => l.studentId === (s && s.personId)) && (!q || Directory.fold(p.displayName + ' ' + (p.email || '')).includes(q))).slice(0, 8);
    const box = SDUI.body.querySelector('#sd-l-cands'); if(box) box.innerHTML = sdCandidatesHtml(cands, fam.link.parentId);
  }
}
function sdChange(e){
  const id = e.target.id, f = SDUI.staff, fam = SDUI.fam;
  if(id.indexOf('cd-') === 0){ cdChange(e); return; }
  if(id.indexOf('sc-') === 0){ scChange(e); return; }
  if(id.indexOf('hs-') === 0){ hsChange(e); return; }
  if(id === 'sd-staff-dept'){ f.department = e.target.value; const el = SDUI.body.querySelector('#sd-staff-list'); if(el) el.innerHTML = sdStaffListHtml(); }
  else if(id === 'sd-staff-status'){ f.status = e.target.value; f.department = ''; sdPaintPane(); }
  else if(id === 'sd-fam-only'){ fam.onlyEmpty = e.target.checked; sdPaintFamList(); }
  else if(id === 'sd-imp-file' || id === 'sd-ros-file'){
    const file = e.target.files && e.target.files[0]; if(!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      const text = window.Watermark ? Watermark.strip(String(rd.result || '')) : String(rd.result || '');
      if(id === 'sd-imp-file'){ f.imp.text = text; f.imp.plan = null; sdRepaintStaffPanel(); }
      else { fam.roster.text = text; fam.roster.plan = null; fam.roster.done = null; sdRepaintRoster(); }
    };
    rd.readAsText(file);
  }
}

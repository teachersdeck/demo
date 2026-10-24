/* ============================================================
   AdminDeck ClassDeck (v0.10.0) — SchoolDeck's 2nd tab: the school builds its classes.
   ------------------------------------------------------------
   Create a class, give it a teacher (assigning IS the push: the class appears in that teacher's TeachersDeck), change its name and settings,
   and read or rotate its join codes. Every change goes through the four functions in functions/adminClassDeck.js, which enforce the rules again
   (a teacher must have an account in this school, a name is required, nothing outside this school can be touched) and write the audit log.
   This file only draws and asks. It lives inside the SchoolDeck widget, so it uses SDUI, sdClick's dispatch and the helpers of schooldeck-ui.js.
   Loaded after schooldeck-ui.js. Uses: t, esc, toast, STRINGS, AD, SDUI, sdMsg, sdOpen, sdLocale, sdReload, sdPaintPane.
   ============================================================ */
const CD_STRINGS = {
  sd_tab_classes: { en:'ClassDeck', vi:'ClassDeck' },
  sd_go_classes: { en:'Open ClassDeck', vi:'Mở ClassDeck' },
  cd_title: { en:'Build and manage classes', vi:'Tạo và quản lý lớp học' },
  cd_sub: { en:'Classes you build here belong to the school. Give a class a teacher and it appears in their TeachersDeck.', vi:'Lớp tạo ở đây thuộc về trường. Phân công giáo viên là lớp sẽ hiện trong TeachersDeck của họ.' },
  cd_new: { en:'+ New class', vi:'+ Lớp mới' }, cd_new_title: { en:'New class', vi:'Lớp mới' },
  cd_f_name: { en:'Class name', vi:'Tên lớp' }, cd_f_teacher: { en:'Teacher', vi:'Giáo viên' },
  cd_teacher_none: { en:'— No teacher yet —', vi:'— Chưa có giáo viên —' }, cd_teacher_remove: { en:'— No teacher —', vi:'— Không có giáo viên —' },
  cd_create: { en:'Create class', vi:'Tạo lớp' }, cd_cancel: { en:'Cancel', vi:'Hủy' },
  cd_search: { en:'Search classes', vi:'Tìm lớp' }, cd_only_no_teacher: { en:'Only classes without a teacher', vi:'Chỉ lớp chưa có giáo viên' },
  cd_no_teacher: { en:'No teacher yet', vi:'Chưa có giáo viên' }, cd_school_class: { en:'School class', vi:'Lớp của trường' },
  cd_students: { en:'{n} students', vi:'{n} học sinh' }, cd_manage: { en:'Manage', vi:'Quản lý' }, cd_close: { en:'Close', vi:'Đóng' },
  cd_empty: { en:'No classes yet. Create the first one.', vi:'Chưa có lớp nào. Hãy tạo lớp đầu tiên.' }, cd_empty_filter: { en:'No class matches.', vi:'Không có lớp nào phù hợp.' },
  cd_loading: { en:'Loading classes…', vi:'Đang tải lớp học…' },
  cd_teacher_h: { en:'Teacher', vi:'Giáo viên' }, cd_assign: { en:'Assign and push', vi:'Phân công và đẩy lớp' },
  cd_assign_note: { en:'The class appears in this teacher’s TeachersDeck. Choose “No teacher” to take them off the class.', vi:'Lớp sẽ hiện trong TeachersDeck của giáo viên này. Chọn “Không có giáo viên” để gỡ giáo viên khỏi lớp.' },
  cd_settings_h: { en:'Settings', vi:'Cài đặt' }, cd_f_rank: { en:'Ranking visibility', vi:'Hiển thị bảng xếp hạng' },
  cd_rank_full: { en:'Full names', vi:'Tên đầy đủ' }, cd_rank_anonymized: { en:'Anonymised', vi:'Ẩn danh' }, cd_rank_opt_out: { en:'No ranking', vi:'Không xếp hạng' },
  cd_f_pulse: { en:'Class Pulse for parents', vi:'Class Pulse cho phụ huynh' }, cd_f_linking: { en:'How parents link', vi:'Cách phụ huynh liên kết' },
  cd_link_family: { en:'Child’s family code (recommended)', vi:'Mã gia đình của con (khuyến nghị)' }, cd_link_class: { en:'Class code and child’s name', vi:'Mã lớp và tên của con' },
  cd_save: { en:'Save changes', vi:'Lưu thay đổi' },
  cd_codes_h: { en:'Join codes', vi:'Mã tham gia' }, cd_code_student: { en:'Students', vi:'Học sinh' }, cd_code_parent: { en:'Parents', vi:'Phụ huynh' },
  cd_code_new: { en:'New code', vi:'Mã mới' }, cd_confirm_code: { en:'Make a new code? The old one stops working straight away.', vi:'Tạo mã mới? Mã cũ sẽ ngừng hoạt động ngay.' },
  cd_created: { en:'Class created', vi:'Đã tạo lớp' }, cd_assigned: { en:'Teacher assigned — the class is now in their TeachersDeck', vi:'Đã phân công — lớp đã có trong TeachersDeck của giáo viên' },
  cd_unassigned: { en:'Teacher taken off the class', vi:'Đã gỡ giáo viên khỏi lớp' }, cd_saved: { en:'Saved', vi:'Đã lưu' }, cd_nochange: { en:'Nothing to change', vi:'Không có gì thay đổi' },
  cd_code_done: { en:'New code made', vi:'Đã tạo mã mới' }, cd_gone: { en:'That class is no longer here', vi:'Lớp này không còn nữa' },
  cd_err_className_required: { en:'Give the class a name', vi:'Hãy đặt tên cho lớp' }, cd_err_className_too_long: { en:'At most {max} characters', vi:'Tối đa {max} ký tự' },
  cd_err_teacherUid_teacher_not_in_school: { en:'This teacher has no account in this school yet. They need to sign in to TeachersDeck and join the school first.', vi:'Giáo viên này chưa có tài khoản trong trường. Họ cần đăng nhập TeachersDeck và tham gia trường trước.' },
  cd_err_teacherUid_teacher_archived: { en:'This teacher is archived in the People Directory', vi:'Giáo viên này đã được lưu trữ trong Danh bạ thành viên' },
  cd_err_teacherUid_teacher_invalid: { en:'Choose a teacher from the list', vi:'Hãy chọn giáo viên trong danh sách' },
  cd_err_invalid: { en:'That value is not allowed', vi:'Giá trị này không hợp lệ' },
  cd_f_grade: { en:'Grade (optional)', vi:'Khối lớp (không bắt buộc)' }, cd_f_homeroom: { en:'Homeroom (optional)', vi:'Phòng chủ nhiệm (không bắt buộc)' },
  cd_f_year: { en:'School year (optional)', vi:'Năm học (không bắt buộc)' },
  cd_archived_badge: { en:'Archived', vi:'Đã lưu trữ' },
  cd_err_grade_too_long: { en:'At most {max} characters', vi:'Tối đa {max} ký tự' }, cd_err_homeroom_too_long: { en:'At most {max} characters', vi:'Tối đa {max} ký tự' },
  cd_err_year_too_long: { en:'At most {max} characters', vi:'Tối đa {max} ký tự' },
};

const CDUI = { classes: null, loading: false, loadErr: '', search: '', noTeacher: false, open: '', form: null, errs: [], edit: {}, detail: {}, busy: false };

function cdErr(e){
  const k = ['cd_err_' + e.field + '_' + e.code, 'cd_err_' + e.code].find(x => STRINGS[x]);
  return t(k || 'cd_err_invalid', { max: e.max });
}
const cdErrs = (errs, field) => (errs || []).filter(e => e.field === field).map(e => `<p class="dir-err">${esc(cdErr(e))}</p>`).join('');

/* ---------------- data ---------------- */
async function cdLoad(force){
  if(CDUI.loading) return;
  CDUI.loading = true; CDUI.loadErr = '';
  try{ CDUI.classes = await AD.getClasses(force); }catch(e){ CDUI.loadErr = sdMsg(e); }
  CDUI.loading = false;
  if(SDUI.alive() && (SDUI.tab === 'classes' || SDUI.tab === 'history')) sdPaintPane();   // History (js/history-ui.js) also reads CDUI.classes
}
// After any change: the class list and the directory (the Overview checklist counts classes and teachers) are both stale.
async function cdRefresh(){
  try{ CDUI.classes = await AD.getClasses(true); }catch(e){ CDUI.loadErr = sdMsg(e); }
  await sdReload();
}
// Teachers who can be given a class: directory teachers linked to a login, plus whoever already runs a class here.
function cdTeachers(){
  const m = new Map();
  (SDUI.people || []).filter(p => p.type === 'teacher' && sdOpen(p) && p.accountLink).forEach(p => m.set(p.accountLink, { uid: p.accountLink, name: p.displayName, email: p.email || '' }));
  (CDUI.classes || []).forEach(c => { if(c.teacherUid && !m.has(c.teacherUid)) m.set(c.teacherUid, { uid: c.teacherUid, name: c.teacherName || c.teacherEmail || c.teacherUid, email: c.teacherEmail || '' }); });
  return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, sdLocale()));
}
const cdTeacherOpts = (sel, blankKey) => `<option value="">${esc(t(blankKey))}</option>` + cdTeachers().map(x => `<option value="${esc(x.uid)}"${x.uid === sel ? ' selected' : ''}>${esc(x.name)}${x.email ? ' — ' + esc(x.email) : ''}</option>`).join('');
const cdVisible = () => {
  const q = Directory.fold(CDUI.search || '');
  return (CDUI.classes || []).filter(c => (!CDUI.noTeacher || !c.teacherUid) && (!q || Directory.fold(c.className + ' ' + (c.teacherName || '')).includes(q)))
    .sort((a, b) => (a.teacherUid ? 1 : 0) - (b.teacherUid ? 1 : 0) || a.className.localeCompare(b.className, sdLocale()));
};

/* ---------------- drawing ---------------- */
function cdHtml(){
  if(CDUI.classes === null) return `<p class="hint">${esc(CDUI.loadErr || t('cd_loading'))}</p>`;
  return `<h3 class="sd-h">${esc(t('cd_title'))}</h3><p class="hint">${esc(t('cd_sub'))}</p>
    <div class="dir-actions chip-row"><button class="wbtn sm primary" data-act="cd-new">${esc(t('cd_new'))}</button></div>
    <div class="dir-filters"><input type="text" id="cd-q" placeholder="${esc(t('cd_search'))}" value="${esc(CDUI.search)}" aria-label="${esc(t('cd_search'))}">
      <label class="dir-confirm sd-check"><input type="checkbox" id="cd-only"${CDUI.noTeacher ? ' checked' : ''}> ${esc(t('cd_only_no_teacher'))}</label></div>
    <div id="cd-panel">${cdNewHtml()}</div><div id="cd-list">${cdListHtml()}</div>`;
}
function cdNewHtml(){
  if(!CDUI.form) return '';
  const f = CDUI.form;
  return `<div class="dir-panel"><div class="dir-panel-head"><b>${esc(t('cd_new_title'))}</b></div>
    <div class="dir-fields"><label class="dir-field"><span>${esc(t('cd_f_name'))}</span><input type="text" id="cd-new-name" maxlength="80" value="${esc(f.className || '')}">${cdErrs(CDUI.errs, 'className')}</label>
      <label class="dir-field"><span>${esc(t('cd_f_teacher'))}</span><select id="cd-new-teacher">${cdTeacherOpts(f.teacherUid, 'cd_teacher_none')}</select>${cdErrs(CDUI.errs, 'teacherUid')}</label>
      <label class="dir-field"><span>${esc(t('cd_f_grade'))}</span><input type="text" id="cd-new-grade" maxlength="40" value="${esc(f.grade || '')}">${cdErrs(CDUI.errs, 'grade')}</label>
      <label class="dir-field"><span>${esc(t('cd_f_homeroom'))}</span><input type="text" id="cd-new-homeroom" maxlength="40" value="${esc(f.homeroom || '')}">${cdErrs(CDUI.errs, 'homeroom')}</label>
      <label class="dir-field"><span>${esc(t('cd_f_year'))}</span><input type="text" id="cd-new-year" maxlength="20" value="${esc(f.year || '')}">${cdErrs(CDUI.errs, 'year')}</label></div>
    <div class="btn-row"><button class="wbtn sm primary" data-act="cd-create"${CDUI.busy ? ' disabled' : ''}>${esc(t('cd_create'))}</button><button class="wbtn sm" data-act="cd-new-cancel">${esc(t('cd_cancel'))}</button></div></div>`;
}
function cdListHtml(){
  const list = cdVisible();
  if(!list.length) return `<p class="hint">${esc(t((CDUI.classes || []).length ? 'cd_empty_filter' : 'cd_empty'))}</p>`;
  return `<div class="sd-cards">${list.map(cdCardHtml).join('')}</div>`;
}
function cdCardHtml(c){
  const open = CDUI.open === c.id;
  const teacher = c.teacherUid ? esc(c.teacherName || c.teacherEmail || c.teacherUid) : `<span class="badge warn">${esc(t('cd_no_teacher'))}</span>`;
  const label = [c.grade, c.homeroom, c.year].filter(Boolean).join(' · ');
  return `<div class="sd-card${open ? ' cd-open' : ''}"><div class="dir-name">${esc(c.className)}${c.managedBy === 'school' ? ` <span class="badge t-staff">${esc(t('cd_school_class'))}</span>` : ''}${c.archived ? ` <span class="badge warn">${esc(t('cd_archived_badge'))}</span>` : ''}</div>
    <div class="dir-sub">${teacher} · ${esc(t('cd_students', { n: c.studentCount || 0 }))}${label ? ' · ' + esc(label) : ''}</div>
    <div class="sd-card-act"><button class="wbtn sm" data-act="cd-open" data-id="${esc(c.id)}" aria-expanded="${open}">${esc(t(open ? 'cd_close' : 'cd_manage'))}</button></div>
    ${open ? cdManageHtml(c) : ''}</div>`;
}
function cdManageHtml(c){
  const errs = (CDUI.edit[c.id] || {}).errs || [], d = CDUI.detail[c.id];
  const sel = (id, cur, vals) => `<select id="${id}">${vals.map(([v, k]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(t(k))}</option>`).join('')}</select>`;
  const code = (which, key) => `<div class="cd-row"><span class="dir-sub">${esc(t(key))}</span> <span class="cd-code">${d ? esc(d[which + 'JoinCode'] || '—') : '…'}</span>
      <button class="wbtn sm" data-act="cd-newcode" data-id="${esc(c.id)}" data-which="${which}">${esc(t('cd_code_new'))}</button></div>`;
  return `<div class="cd-manage">
    <div><div class="dir-name">${esc(t('cd_teacher_h'))}</div>
      <div class="cd-row"><select id="cd-teacher">${cdTeacherOpts(c.teacherUid || '', 'cd_teacher_remove')}</select><button class="wbtn sm primary" data-act="cd-assign" data-id="${esc(c.id)}">${esc(t('cd_assign'))}</button></div>
      ${cdErrs(errs, 'teacherUid')}<p class="hint">${esc(t('cd_assign_note'))}</p></div>
    <div><div class="dir-name">${esc(t('cd_settings_h'))}</div>
      <div class="dir-fields"><label class="dir-field"><span>${esc(t('cd_f_name'))}</span><input type="text" id="cd-name" maxlength="80" value="${esc(c.className)}">${cdErrs(errs, 'className')}</label>
        <label class="dir-field"><span>${esc(t('cd_f_rank'))}</span>${sel('cd-rank', c.rankingVisibility || 'anonymized', [['full', 'cd_rank_full'], ['anonymized', 'cd_rank_anonymized'], ['opt_out', 'cd_rank_opt_out']])}</label>
        <label class="dir-field"><span>${esc(t('cd_f_linking'))}</span>${sel('cd-linking', c.parentLinking || 'class-code', [['family-code', 'cd_link_family'], ['class-code', 'cd_link_class']])}</label>
        <label class="dir-field"><span>${esc(t('cd_f_grade'))}</span><input type="text" id="cd-grade" maxlength="40" value="${esc(c.grade || '')}">${cdErrs(errs, 'grade')}</label>
        <label class="dir-field"><span>${esc(t('cd_f_homeroom'))}</span><input type="text" id="cd-homeroom" maxlength="40" value="${esc(c.homeroom || '')}">${cdErrs(errs, 'homeroom')}</label>
        <label class="dir-field"><span>${esc(t('cd_f_year'))}</span><input type="text" id="cd-year" maxlength="20" value="${esc(c.year || '')}">${cdErrs(errs, 'year')}</label></div>
      <label class="dir-confirm sd-check"><input type="checkbox" id="cd-pulse"${c.classPulse !== false ? ' checked' : ''}> ${esc(t('cd_f_pulse'))}</label>
      <div class="btn-row"><button class="wbtn sm primary" data-act="cd-save" data-id="${esc(c.id)}">${esc(t('cd_save'))}</button></div></div>
    <div><div class="dir-name">${esc(t('cd_codes_h'))}</div>${code('student', 'cd_code_student')}${code('parent', 'cd_code_parent')}</div></div>`;
}
function cdRepaintPanel(){ const el = SDUI.body.querySelector('#cd-panel'); if(el) el.innerHTML = cdNewHtml(); }
function cdRepaintList(){ const el = SDUI.body.querySelector('#cd-list'); if(el) el.innerHTML = cdListHtml(); }
// Called by sdPaintPane right after the tab's HTML is in place.
function cdShow(){ if(CDUI.classes === null && !CDUI.loading) cdLoad(false); }

/* ---------------- actions ---------------- */
const cdVal = (id) => { const el = SDUI.body.querySelector('#' + id); return el ? el.value : ''; };
function cdKeepForm(){ if(CDUI.form && SDUI.body.querySelector('#cd-new-name')) CDUI.form = { className: cdVal('cd-new-name'), teacherUid: cdVal('cd-new-teacher'), grade: cdVal('cd-new-grade'), homeroom: cdVal('cd-new-homeroom'), year: cdVal('cd-new-year') }; }
async function cdOpenDetail(id){
  if(CDUI.detail[id]) return;
  try{ const r = await AD.getClassDetail(id); CDUI.detail[id] = r.class || {}; }catch(e){ CDUI.detail[id] = {}; toast(sdMsg(e)); }
  if(SDUI.alive() && SDUI.tab === 'classes') cdRepaintList();
}
// Runs one ClassDeck call; returns the response, or null after showing why not (400: the field errors go where `onErrors` puts them).
async function cdCall(name, body, onErrors){
  if(CDUI.busy) return null;
  CDUI.busy = true;
  try{ return await AD.classDeckCall(name, body); }
  catch(e){
    if(e && e.status === 400 && e.data && e.data.errors) onErrors(e.data.errors);
    else if(e && e.status === 404){ toast(t('cd_gone')); await cdRefresh(); }
    else toast(sdMsg(e));
    return null;
  }
  finally{ CDUI.busy = false; }
}
async function cdCreate(){
  CDUI.form = { className: cdVal('cd-new-name'), teacherUid: cdVal('cd-new-teacher'), grade: cdVal('cd-new-grade'), homeroom: cdVal('cd-new-homeroom'), year: cdVal('cd-new-year') }; CDUI.errs = [];
  const r = await cdCall('adminCreateClass', { className: CDUI.form.className, teacherUid: CDUI.form.teacherUid || null, grade: CDUI.form.grade, homeroom: CDUI.form.homeroom, year: CDUI.form.year }, (errs) => { CDUI.errs = errs; });
  if(!r){ cdRepaintPanel(); return; }
  CDUI.form = null; CDUI.open = r.classId; CDUI.detail[r.classId] = { studentJoinCode: r.studentJoinCode, parentJoinCode: r.parentJoinCode };
  toast(t('cd_created')); await cdRefresh();
}
async function cdAssign(id){
  const uid = cdVal('cd-teacher') || null; CDUI.edit[id] = { errs: [] };
  const r = await cdCall('adminAssignTeacher', { classId: id, teacherUid: uid }, (errs) => { CDUI.edit[id] = { errs }; });
  if(!r){ cdRepaintList(); return; }
  toast(t(r.changed ? (uid ? 'cd_assigned' : 'cd_unassigned') : 'cd_nochange')); await cdRefresh();
}
async function cdSave(id){
  const body = { classId: id, className: cdVal('cd-name'), rankingVisibility: cdVal('cd-rank'), parentLinking: cdVal('cd-linking'), classPulse: !!(SDUI.body.querySelector('#cd-pulse') || {}).checked, grade: cdVal('cd-grade'), homeroom: cdVal('cd-homeroom'), year: cdVal('cd-year') };
  CDUI.edit[id] = { errs: [] };
  const r = await cdCall('adminUpdateClass', body, (errs) => { CDUI.edit[id] = { errs }; });
  if(!r){ cdRepaintList(); return; }
  toast(t(r.changed.length ? 'cd_saved' : 'cd_nochange')); await cdRefresh();
}
async function cdNewCode(id, which){
  if(!window.confirm(t('cd_confirm_code'))) return;
  const r = await cdCall('adminRegenerateJoinCode', { classId: id, which }, () => {});
  if(!r) return;
  CDUI.detail[id] = { ...(CDUI.detail[id] || {}), ...r }; delete CDUI.detail[id].classId;
  toast(t('cd_code_done')); cdRepaintList();
}

/* ---------------- events (called from schooldeck-ui.js's handlers for anything that starts with cd-) ---------------- */
function cdClick(d){
  if(d.act !== 'cd-create') cdKeepForm();
  switch(d.act){
    case 'cd-new': CDUI.form = CDUI.form || { className: '', teacherUid: '' }; CDUI.errs = []; cdRepaintPanel(); break;
    case 'cd-new-cancel': CDUI.form = null; CDUI.errs = []; cdRepaintPanel(); break;
    case 'cd-create': cdCreate(); break;
    case 'cd-open': CDUI.open = CDUI.open === d.id ? '' : d.id; CDUI.edit[d.id] = { errs: [] }; cdRepaintList(); if(CDUI.open) cdOpenDetail(d.id); break;
    case 'cd-assign': cdAssign(d.id); break;
    case 'cd-save': cdSave(d.id); break;
    case 'cd-newcode': cdNewCode(d.id, d.which); break;
  }
}
function cdInput(e){ if(e.target.id === 'cd-q'){ CDUI.search = e.target.value; cdRepaintList(); } }
function cdChange(e){ if(e.target.id === 'cd-only'){ CDUI.noTeacher = e.target.checked; cdRepaintList(); } }

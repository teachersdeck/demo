/* ============================================================
   AdminDeck People Directory (v0.7.0) — the widget.
   ------------------------------------------------------------
   Teachers, students, parents and staff in one directory, filtered by type (chips with counts), with search, per-type filters, a
   'needs attention' queue, add / edit / archive, CSV import (previewed before anything is saved) and CSV export, and a one-click
   way to adopt the accounts that already exist. The rules (what is valid, what is a duplicate, how lists are filtered and counted) live
   in functions/directory.js, loaded as window.Directory — the SAME file the backend uses, so what you see in the preview is what the
   server will do. Every change is sent to the adminDirectory* Cloud Functions, which validate it again and log it.

   Layout note: this is a normal floating widget (resize it as large as you like). State (filters, selection, open panel) lives in DIRUI,
   outside the render function, so a Refresh or a language switch re-draws the widget without losing your place.
   ============================================================ */
const DIRUI = {
  data: null, body: null, alive: () => false,
  f: { type: 'all', status: 'open', classId: '', linked: 'all', hasEmail: 'all', search: '', sort: 'name', ids: null, attn: null },
  selected: null, panel: null,            // panel: null | 'add' | 'edit' | 'import'
  form: null, formErr: [], dup: null, busy: false, bfConfirm: false, imp: null,
};
const DIR_TYPES = ['teacher', 'student', 'parent', 'staff'];
const DIR_ROW_CAP = 200;

function dirErrText(e){ return t('dir_err_' + e.code, { max: e.max }); }
function dirTypeLabel(type){ return t('dir_one_' + type); }
function dirBlankForm(type){ return { type: type || 'staff', personId: '', displayName: '', email: '', phone: '', classId: '', studentNumber: '', subjects: '', employeeNumber: '', relationship: '', preferredContact: '', title: '', department: '' }; }
function dirApiError(e){
  // 400 -> field errors, 409 -> duplicates; anything else is shown as a message
  if(e && e.status === 400 && e.data && e.data.errors){ DIRUI.formErr = e.data.errors; DIRUI.dup = null; return true; }
  if(e && e.status === 409 && e.data && e.data.duplicates){ DIRUI.dup = e.data.duplicates; DIRUI.formErr = []; return true; }
  return false;
}

/* ---------------- the widget ---------------- */
function renderDirectory(body){
  return widgetBoot(body, async (body, isAlive)=>{
    DIRUI.data = await AD.directoryList();
    if(!isAlive()) return;
    DIRUI.body = body; DIRUI.alive = isAlive;
    dirPaintAll();
  });
}

function dirPaintAll(){
  const body = DIRUI.body, f = DIRUI.f, d = DIRUI.data;
  const opt = (v, label, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
  body.innerHTML = frameTop() + `<div class="dir">
    <div id="dir-banner"></div>
    <div class="seg" id="dir-chips"></div>
    <div class="dir-filters">
      <input type="text" id="dir-search" placeholder="${esc(t('dir_search_ph'))}" value="${esc(f.search)}" aria-label="${esc(t('dir_search_ph'))}">
      <select id="dir-status" aria-label="status">${opt('open', t('dir_status_open'), f.status)}${opt('archived', t('dir_status_archived'), f.status)}${opt('all', t('dir_status_all'), f.status)}</select>
      <select id="dir-class" aria-label="class">${opt('', t('dir_class_all'), f.classId)}${d.classes.map(c => opt(c.id, c.className, f.classId)).join('')}</select>
      <select id="dir-linked" aria-label="linked">${opt('all', t('dir_linked_all'), f.linked)}${opt('linked', t('dir_linked_yes'), f.linked)}${opt('unlinked', t('dir_linked_no'), f.linked)}</select>
      <select id="dir-email" aria-label="email">${opt('all', t('dir_email_all'), f.hasEmail)}${opt('yes', t('dir_email_yes'), f.hasEmail)}${opt('no', t('dir_email_no'), f.hasEmail)}</select>
      <select id="dir-sort" aria-label="sort">${opt('name', t('dir_sort_name'), f.sort)}${opt('added', t('dir_sort_added'), f.sort)}${opt('class', t('dir_sort_class'), f.sort)}</select>
    </div>
    <div class="btn-row dir-actions">
      <button class="wbtn sm primary" id="dir-add">${esc(t('dir_add'))}</button>
      <button class="wbtn sm" id="dir-import">${esc(t('dir_import'))}</button>
      <button class="wbtn sm" id="dir-export">${esc(t('dir_export'))}</button>
    </div>
    <div id="dir-attn"></div><div id="dir-panel"></div><div id="dir-list"></div>
    <p class="hint">${esc(t('dir_note'))}</p>
  </div>`;
  wireRefreshBtn(body);
  const $b = (s) => body.querySelector(s);
  $b('#dir-search').addEventListener('input', e => { f.search = e.target.value; dirPaintChips(); dirPaintList(); });
  [['#dir-status', 'status'], ['#dir-class', 'classId'], ['#dir-linked', 'linked'], ['#dir-email', 'hasEmail'], ['#dir-sort', 'sort']].forEach(([sel, key]) => {
    $b(sel).addEventListener('change', e => { f[key] = e.target.value; dirPaintChips(); dirPaintList(); });
  });
  $b('#dir-add').addEventListener('click', () => { DIRUI.panel = 'add'; DIRUI.form = dirBlankForm(f.type !== 'all' ? f.type : 'staff'); DIRUI.formErr = []; DIRUI.dup = null; dirPaintPanel(); });
  $b('#dir-import').addEventListener('click', () => { DIRUI.panel = 'import'; DIRUI.imp = { type: f.type !== 'all' ? f.type : 'student', text: '', plan: null, parseErrors: [], ignored: [], done: null }; dirPaintPanel(); });
  $b('#dir-export').addEventListener('click', dirExport);
  dirPaintBanner(); dirPaintChips(); dirPaintAttn(); dirPaintPanel(); dirPaintList();
}

function dirFiltered(){ return Directory.filterPeople(DIRUI.data.people, DIRUI.f); }

/* ---------------- backfill banner ---------------- */
function dirPaintBanner(){
  const el = DIRUI.body.querySelector('#dir-banner'); if(!el) return;
  const bf = DIRUI.data.backfill;
  if(!bf || !bf.total){ el.innerHTML = ''; return; }
  const msg = t('dir_backfill_banner', { n: bf.total, t: bf.pending.teacher, s: bf.pending.student, p: bf.pending.parent });
  el.innerHTML = `<div class="dir-banner"><span>${esc(msg)}</span>` + (DIRUI.bfConfirm
    ? `<span class="dir-banner-actions"><span class="dir-confirm">${esc(t('dir_backfill_confirm', { n: bf.total }))}</span><button class="wbtn sm primary" data-bf="go"${DIRUI.busy ? ' disabled' : ''}>${esc(t('dir_confirm'))}</button><button class="wbtn sm" data-bf="no">${esc(t('dir_cancel'))}</button></span>`
    : `<button class="wbtn sm primary" data-bf="ask">${esc(t('dir_backfill_btn'))}</button>`) + `</div>`;
  el.querySelectorAll('[data-bf]').forEach(b => b.addEventListener('click', async () => {
    const act = b.dataset.bf;
    if(act === 'ask'){ DIRUI.bfConfirm = true; dirPaintBanner(); }
    else if(act === 'no'){ DIRUI.bfConfirm = false; dirPaintBanner(); }
    else if(act === 'go'){
      DIRUI.busy = true; dirPaintBanner();
      try{
        const r = await AD.directoryCall('adminDirectoryBackfill', { dryRun: false });
        toast(t('dir_backfill_done', { n: r.created }));
      }catch(e){ toast(e.message || String(e)); }
      DIRUI.busy = false; DIRUI.bfConfirm = false; await dirReload();
    }
  }));
}

/* ---------------- type chips ---------------- */
function dirPaintChips(){
  const el = DIRUI.body.querySelector('#dir-chips'); if(!el) return;
  const f = DIRUI.f;
  const counts = Directory.countByType(DIRUI.data.people, { ...f, type: 'all' });
  el.innerHTML = ['all'].concat(DIR_TYPES).map(k => `<button class="chip ${f.type === k ? 'on' : ''}" data-type="${k}">${esc(t('dir_type_' + k))} <b>${counts[k] || 0}</b></button>`).join('');
  el.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { f.type = b.dataset.type; dirPaintChips(); dirPaintList(); }));
}

/* ---------------- needs attention ---------------- */
function dirPaintAttn(){
  const el = DIRUI.body.querySelector('#dir-attn'); if(!el) return;
  const q = DIRUI.data.attention || [], f = DIRUI.f;
  if(!q.length){ el.innerHTML = ''; return; }
  const label = (k) => t('dir_attn_' + k, { d: Directory.INVITE_STALE_DAYS });
  el.innerHTML = `<div class="dir-attn"><span class="dir-attn-title">${esc(t('dir_attn_title'))}</span>`
    + q.map(a => `<button class="chip ${f.attn === a.key ? 'on' : ''}" data-attn="${a.key}">${esc(label(a.key))} <b>${a.ids.length}</b></button>`).join('')
    + (f.attn ? `<button class="wbtn sm" data-attn="">${esc(t('dir_attn_clear'))}</button>` : '') + `</div>`;
  el.querySelectorAll('[data-attn]').forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.attn;
    if(!key || f.attn === key){ f.attn = null; f.ids = null; }
    else { f.attn = key; f.ids = (q.find(a => a.key === key) || { ids: [] }).ids; f.type = 'all'; f.status = 'open'; }
    dirPaintAll();
  }));
}

/* ---------------- the list ---------------- */
function dirPaintList(){
  const el = DIRUI.body.querySelector('#dir-list'); if(!el) return;
  const all = DIRUI.data.people, list = dirFiltered();
  if(!all.length){ el.innerHTML = emptyState(t('dir_empty_all')); return; }
  if(!list.length){ el.innerHTML = emptyState(t('dir_empty')); return; }
  const shown = list.slice(0, DIR_ROW_CAP);
  el.innerHTML = `<p class="hint dir-count">${esc(t('dir_count_showing', { n: list.length }))}</p>` + shown.map(p => dirRowHtml(p)).join('')
    + (list.length > shown.length ? `<p class="hint">${esc(t('dir_more', { n: list.length - shown.length }))}</p>` : '');
  el.querySelectorAll('.dir-row').forEach(r => r.addEventListener('click', () => { DIRUI.selected = DIRUI.selected === r.dataset.id ? null : r.dataset.id; dirPaintList(); }));
  el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); dirRowAction(b.dataset.act, b.dataset.id); }));
}
function dirRowHtml(p){
  const sel = DIRUI.selected === p.personId;
  const sub = [p.email, p.phone, Directory.classNameOf(p), p.title].filter(Boolean).map(esc).join(' · ');
  const stCls = p.status === 'archived' ? 'anon' : p.status === 'invited' ? 'warn' : 'full';
  return `<div class="dir-row${sel ? ' sel' : ''}" data-id="${esc(p.personId)}" tabindex="0">
    <div class="dir-main"><span class="dir-name">${esc(p.displayName)}</span><span class="badge t-${p.type}">${esc(dirTypeLabel(p.type))}</span><span class="badge ${stCls}">${esc(t('dir_st_' + p.status))}</span></div>
    ${sub ? `<div class="dir-sub">${sub}</div>` : ''}${sel ? dirDetailHtml(p) : ''}</div>`;
}
function dirDetailHtml(p){
  const kv = (k, v) => v === '' || v == null ? '' : `<div class="dir-kv"><span>${esc(t(k))}</span><b>${esc(v)}</b></div>`;
  let rows = '';
  if(p.type === 'teacher') rows += kv('dir_d_classes', (p.classNames || []).join(', ') || '—') + kv('dir_f_subjects', p.subjects) + kv('dir_f_emp_no', p.employeeNumber);
  if(p.type === 'student') rows += kv('dir_d_class', p.className || '—') + kv('dir_f_student_no', p.studentNumber) + kv('dir_d_guardians', p.guardianCount == null ? '—' : String(p.guardianCount));
  if(p.type === 'parent') rows += kv('dir_d_children', p.childCount == null ? '—' : (p.childNames || []).join(', ') || String(p.childCount)) + kv('dir_f_relationship', p.relationship) + kv('dir_f_contact', p.preferredContact);
  if(p.type === 'staff') rows += kv('dir_f_title', p.title) + kv('dir_f_dept', p.department);
  rows += kv('dir_d_account', p.accountLink ? t('dir_d_linked') : t('dir_d_not_linked')) + kv('dir_d_added', p.createdAtMs ? new Date(p.createdAtMs).toLocaleDateString(LOCALE_MAP[state.lang] || 'en-US') : '') + kv('dir_d_source', p.source);
  const btns = p.status === 'archived'
    ? `<button class="wbtn sm" data-act="restore" data-id="${esc(p.personId)}">${esc(t('dir_restore'))}</button>`
    : `<button class="wbtn sm" data-act="edit" data-id="${esc(p.personId)}">${esc(t('dir_edit'))}</button><button class="wbtn sm" data-act="archive" data-id="${esc(p.personId)}">${esc(t('dir_archive'))}</button>`;
  return `<div class="dir-detail">${rows}<div class="btn-row" style="margin-top:6px">${btns}</div></div>`;
}
async function dirRowAction(act, id){
  const p = DIRUI.data.people.find(x => x.personId === id); if(!p) return;
  if(act === 'edit'){
    const fm = dirBlankForm(p.type); Object.keys(fm).forEach(k => { if(p[k] != null) fm[k] = p[k]; });
    fm.personId = p.personId; fm.linked = !!p.accountLink;
    DIRUI.form = fm; DIRUI.panel = 'edit'; DIRUI.formErr = []; DIRUI.dup = null; dirPaintPanel();
    DIRUI.body.querySelector('#dir-panel').scrollIntoView({ block: 'nearest' });
    return;
  }
  try{
    const r = await AD.directoryCall('adminDirectoryArchive', { personIds: [id], action: act });
    toast(t(act === 'archive' ? 'dir_archived' : 'dir_restored', { n: r.changed }));
  }catch(e){ toast(e.message || String(e)); }
  DIRUI.selected = null;          // the row moves between views, so don't leave it expanded where it lands
  await dirReload();
}

/* ---------------- add / edit ---------------- */
function dirFieldsHtml(fm){
  const err = (field) => DIRUI.formErr.filter(e => e.field === field).map(e => `<span class="dir-err">${esc(dirErrText(e))}</span>`).join('');
  const inp = (field, label, extra) => `<label class="dir-field"><span>${esc(t(label))}</span><input type="text" data-f="${field}" value="${esc(fm[field] || '')}"${extra || ''}>${err(field)}</label>`;
  const locked = fm.type === 'student' && fm.linked;     // a linked student's name and class belong to the real account
  let h = inp('displayName', 'dir_f_name', locked ? ' disabled' : '');
  if(fm.type !== 'student') h += inp('email', 'dir_f_email') + inp('phone', 'dir_f_phone');
  if(fm.type === 'teacher') h += inp('subjects', 'dir_f_subjects') + inp('employeeNumber', 'dir_f_emp_no');
  if(fm.type === 'student'){
    const cls = DIRUI.data.classes;
    h += `<label class="dir-field"><span>${esc(t('dir_f_class'))}</span><select data-f="classId"${locked ? ' disabled' : ''}><option value="">${esc(t('dir_f_class_none'))}</option>${cls.map(c => `<option value="${esc(c.id)}"${fm.classId === c.id ? ' selected' : ''}>${esc(c.className)}</option>`).join('')}</select>${err('classId')}</label>`
       + inp('studentNumber', 'dir_f_student_no');
    if(locked) h += `<p class="hint dir-locked">${esc(t('dir_err_locked_linked_student'))}</p>`;
  }
  if(fm.type === 'parent') h += inp('relationship', 'dir_f_relationship')
    + `<label class="dir-field"><span>${esc(t('dir_f_contact'))}</span><select data-f="preferredContact">${['', 'email', 'phone', 'zalo'].map(v => `<option value="${v}"${fm.preferredContact === v ? ' selected' : ''}>${esc(v ? t('dir_contact_' + v) : '—')}</option>`).join('')}</select>${err('preferredContact')}</label>`;
  if(fm.type === 'staff') h += inp('title', 'dir_f_title') + inp('department', 'dir_f_dept');
  return h;
}
function dirPaintPanel(){
  const el = DIRUI.body.querySelector('#dir-panel'); if(!el) return;
  if(!DIRUI.panel){ el.innerHTML = ''; return; }
  if(DIRUI.panel === 'import'){ dirPaintImport(el); return; }
  const fm = DIRUI.form, adding = DIRUI.panel === 'add';
  const generic = DIRUI.formErr.filter(e => !['displayName','email','phone','classId','studentNumber','subjects','employeeNumber','relationship','preferredContact','title','department'].includes(e.field));
  const dupHtml = DIRUI.dup ? `<div class="dir-dup"><b>${esc(t('dir_dup_title'))}</b>${DIRUI.dup.map(m => `<div>${esc(m.displayName)} <span class="badge anon">${esc(t('dir_st_' + m.status))}</span> — ${esc(t('dir_dup_' + m.reason))}</div>`).join('')}<button class="wbtn sm primary" data-save="force"${DIRUI.busy ? ' disabled' : ''}>${esc(t('dir_add_anyway'))}</button></div>` : '';
  el.innerHTML = `<div class="dir-panel">
    <div class="dir-panel-head"><b>${esc(t(adding ? 'dir_add_title' : 'dir_edit_title'))}</b></div>
    ${adding ? `<label class="dir-field"><span>${esc(t('dir_f_type'))}</span><select data-f="type">${DIR_TYPES.map(k => `<option value="${k}"${fm.type === k ? ' selected' : ''}>${esc(dirTypeLabel(k))}</option>`).join('')}</select></label>` : `<p class="hint" style="margin:0 0 6px">${esc(dirTypeLabel(fm.type))}</p>`}
    <div class="dir-fields">${dirFieldsHtml(fm)}</div>
    ${generic.map(e => `<p class="dir-err">${esc(dirErrText(e))}</p>`).join('')}${dupHtml}
    <div class="btn-row"><button class="wbtn sm primary" data-save="1"${DIRUI.busy ? ' disabled' : ''}>${esc(t('dir_save'))}</button><button class="wbtn sm" data-close="1">${esc(t('dir_cancel'))}</button></div>
  </div>`;
  el.querySelectorAll('[data-f]').forEach(inp => {
    const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
    inp.addEventListener(ev, e => {
      DIRUI.form[inp.dataset.f] = e.target.value;
      if(inp.dataset.f === 'type'){ const keep = { displayName: DIRUI.form.displayName, email: DIRUI.form.email, phone: DIRUI.form.phone }; DIRUI.form = Object.assign(dirBlankForm(e.target.value), keep); DIRUI.formErr = []; DIRUI.dup = null; dirPaintPanel(); }
    });
  });
  el.querySelector('[data-close]').addEventListener('click', () => { DIRUI.panel = null; dirPaintPanel(); });
  el.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', () => dirSave(b.dataset.save === 'force')));
}
async function dirSave(force){
  const fm = DIRUI.form, person = { ...fm }; delete person.linked;
  if(!person.personId) delete person.personId;
  DIRUI.busy = true; dirPaintPanel();
  try{
    await AD.directoryCall('adminDirectoryUpsert', { person, force: !!force });
    DIRUI.panel = null; DIRUI.formErr = []; DIRUI.dup = null; toast(t('dir_saved'));
    DIRUI.busy = false; await dirReload(); return;
  }catch(e){
    if(!dirApiError(e)) toast(e.message || String(e));
  }
  DIRUI.busy = false; dirPaintPanel();
}

/* ---------------- CSV import ---------------- */
function dirPaintImport(el){
  const im = DIRUI.imp;
  const plan = im.plan;
  const issues = plan ? plan.results.filter(r => r.status !== 'create').slice(0, 25) : [];
  const cause = (r) => r.status === 'duplicate'
    ? r.matches.map(m => `${t('dir_dup_' + m.reason)}: ${m.displayName}`).join('; ')
    : r.errors.map(dirErrText).join('; ');
  el.innerHTML = `<div class="dir-panel">
    <div class="dir-panel-head"><b>${esc(t('dir_import_title'))}</b></div>
    <label class="dir-field"><span>${esc(t('dir_import_type'))}</span><select id="imp-type">${DIR_TYPES.map(k => `<option value="${k}"${im.type === k ? ' selected' : ''}>${esc(t('dir_type_' + k))}</option>`).join('')}</select></label>
    <label class="dir-field"><span>${esc(t('dir_import_file'))}</span><input type="file" id="imp-file" accept=".csv,text/csv,text/plain"></label>
    <textarea id="imp-text" rows="5" placeholder="Name,Email,Phone&#10;Nguyen Van A,a@example.com,0901234567">${esc(im.text)}</textarea>
    <p class="hint">${esc(t('dir_import_hint'))}</p>
    ${im.parseErrors.map(e => `<p class="dir-err">${esc(dirErrText(e))}</p>`).join('')}
    ${im.ignored.length ? `<p class="hint">${esc(t('dir_import_ignored', { cols: im.ignored.join(', ') }))}</p>` : ''}
    ${plan ? `<div class="dir-plan"><b>${esc(t('dir_import_summary', { c: plan.summary.create, d: plan.summary.duplicate, i: plan.summary.invalid }))}</b>
      ${issues.map(r => `<div class="dir-issue"><span class="badge ${r.status === 'duplicate' ? 'warn' : 'bad'}">${esc(t('dir_import_row', { row: r.row }))}</span> ${esc(r.person.displayName || '—')} — ${esc(cause(r))}</div>`).join('')}</div>` : ''}
    ${im.done != null ? `<p class="hint">${esc(t('dir_import_done', { n: im.done }))}</p>` : ''}
    <div class="btn-row">
      <button class="wbtn sm" id="imp-preview"${DIRUI.busy ? ' disabled' : ''}>${esc(t('dir_preview'))}</button>
      ${plan && plan.summary.create ? `<button class="wbtn sm primary" id="imp-go"${DIRUI.busy ? ' disabled' : ''}>${esc(t('dir_import_n', { n: plan.summary.create }))}</button>` : ''}
      <button class="wbtn sm" id="imp-close">${esc(t('dir_cancel'))}</button>
    </div></div>`;
  const $e = (s) => el.querySelector(s);
  $e('#imp-type').addEventListener('change', e => { im.type = e.target.value; im.plan = null; dirPaintImport(el); });
  $e('#imp-text').addEventListener('input', e => { im.text = e.target.value; });
  $e('#imp-file').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0]; if(!file) return;
    const rd = new FileReader();
    rd.onload = () => { im.text = window.Watermark ? Watermark.strip(String(rd.result || '')) : String(rd.result || ''); im.plan = null; dirPaintImport(el); };
    rd.readAsText(file);
  });
  $e('#imp-close').addEventListener('click', () => { DIRUI.panel = null; DIRUI.imp = null; dirPaintPanel(); });
  $e('#imp-preview').addEventListener('click', () => dirImportRun(el, true));
  const go = $e('#imp-go'); if(go) go.addEventListener('click', () => dirImportRun(el, false));
}
async function dirImportRun(el, dryRun){
  const im = DIRUI.imp;
  const parsed = Directory.csvToPeople(im.text, im.type);
  im.parseErrors = parsed.errors; im.ignored = parsed.ignoredHeaders; im.done = null;
  if(!parsed.people.length){ im.plan = null; dirPaintImport(el); return; }
  DIRUI.busy = true; dirPaintImport(el);
  try{
    const r = await AD.directoryCall('adminDirectoryImport', { type: im.type, people: parsed.people, dryRun });
    if(dryRun){ im.plan = { summary: r.summary, results: r.results }; }
    else {
      toast(t('dir_import_done', { n: r.created }));
      DIRUI.busy = false; DIRUI.panel = null; DIRUI.imp = null; await dirReload(); return;
    }
  }catch(e){ toast(e.message || String(e)); }
  DIRUI.busy = false; dirPaintImport(el);
}

/* ---------------- CSV export (what you are looking at: the filtered list) ---------------- */
function dirExport(){
  const list = dirFiltered();
  const labels = { type: t('dir_f_type'), name: t('dir_f_name'), email: t('dir_f_email'), phone: t('dir_f_phone'), cls: t('dir_f_class'), status: t('dir_exp_status'), linked: t('dir_exp_linked'), details: t('dir_exp_details'), added: t('dir_d_added') };
  const csv = Directory.toCsv(list, labels);
  const blob = new Blob([(window.Watermark ? Watermark.stamp(csv) : csv)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `directory-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast(t('dir_exported', { n: list.length }));
}

/* ---------------- reload after a change ---------------- */
async function dirReload(){
  try{ DIRUI.data = await AD.directoryList(true); }catch(e){ toast(e.message || String(e)); }
  if(!DIRUI.alive()) return;
  if(DIRUI.f.ids && DIRUI.f.attn){        // keep an open attention filter in step with the fresh data
    const q = (DIRUI.data.attention || []).find(a => a.key === DIRUI.f.attn);
    if(q) DIRUI.f.ids = q.ids; else { DIRUI.f.attn = null; DIRUI.f.ids = null; }
  }
  dirPaintAll();
}

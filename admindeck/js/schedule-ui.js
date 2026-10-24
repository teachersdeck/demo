/* ============================================================
   AdminDeck Schedule (v0.11.0) — SchoolDeck's 3rd tab: when and where each class meets.
   ------------------------------------------------------------
   A weekly grid of every class's timetable (filter by teacher or room), a list of clashes (one teacher or one room in two places at once), and an editor
   for one class's timetable. Clashes are WARNINGS: the school may mean them (a team-taught class), so they are shown in red and listed, never refused.
   The rules (what a valid timetable is, what counts as a clash) are in functions/classSchedule.js, the same file adminSetSchedule validates with, so
   this screen and the server cannot disagree. Saving goes through adminSetSchedule (functions/adminClassDeck.js), which also writes the audit log.
   Lives inside the SchoolDeck widget; loaded after classdeck-ui.js. Uses: t, esc, toast, STRINGS, AD, SDUI, sdMsg, sdLocale, sdPaintPane,
   ClassScheduleFns.
   ============================================================ */
const SC_STRINGS = {
  sd_tab_schedule: { en:'Schedule', vi:'Lịch học' },
  sc_title: { en:'Weekly timetable', vi:'Thời khóa biểu tuần' },
  sc_sub: { en:'Set when and where each class meets. A clash is a warning, not a block: you can still save it.', vi:'Đặt thời gian và địa điểm học của từng lớp. Trùng lịch chỉ là cảnh báo, bạn vẫn có thể lưu.' },
  sc_filter: { en:'Show', vi:'Hiển thị' }, sc_filter_all: { en:'All classes', vi:'Tất cả các lớp' }, sc_filter_teachers: { en:'Teachers', vi:'Giáo viên' }, sc_filter_rooms: { en:'Rooms', vi:'Phòng học' },
  sc_loading: { en:'Loading classes…', vi:'Đang tải lớp học…' },
  sc_grid_empty: { en:'Nothing to show. Add a timetable to a class below.', vi:'Chưa có gì để hiển thị. Hãy thêm lịch cho một lớp bên dưới.' },
  sc_clashes_h: { en:'Clashes ({n})', vi:'Trùng lịch ({n})' }, sc_no_clashes: { en:'No clashes.', vi:'Không có trùng lịch.' },
  sc_clash_teacher: { en:'{who} teaches {a} and {b} at the same time', vi:'{who} dạy {a} và {b} cùng lúc' },
  sc_clash_room: { en:'{who} is booked for {a} and {b} at the same time', vi:'{who} được đặt cho {a} và {b} cùng lúc' },
  sc_edit_h: { en:'Class timetables', vi:'Lịch của từng lớp' }, sc_none: { en:'No timetable yet', vi:'Chưa có lịch' }, sc_edit: { en:'Edit', vi:'Sửa' },
  sc_add: { en:'+ Add a time', vi:'+ Thêm giờ học' }, sc_save: { en:'Save timetable', vi:'Lưu lịch' }, sc_cancel: { en:'Cancel', vi:'Hủy' }, sc_remove: { en:'Remove', vi:'Xóa' },
  sc_f_day: { en:'Day', vi:'Thứ' }, sc_f_start: { en:'Start', vi:'Bắt đầu' }, sc_f_end: { en:'End', vi:'Kết thúc' }, sc_f_room: { en:'Room', vi:'Phòng' },
  sc_f_from: { en:'Term starts (optional)', vi:'Bắt đầu kỳ (không bắt buộc)' }, sc_f_to: { en:'Term ends (optional)', vi:'Kết thúc kỳ (không bắt buộc)' },
  sc_saved: { en:'Timetable saved', vi:'Đã lưu lịch' }, sc_nochange: { en:'Nothing to change', vi:'Không có gì thay đổi' }, sc_gone: { en:'That class is no longer here', vi:'Lớp này không còn nữa' },
  sc_slot: { en:'Time {n}', vi:'Giờ {n}' }, sc_term: { en:'{from} to {to}', vi:'{from} đến {to}' }, sc_term_open: { en:'open', vi:'không giới hạn' },
  sc_err_day_invalid: { en:'Choose a day', vi:'Hãy chọn thứ' }, sc_err_start_invalid_time: { en:'Enter a start time like 08:30', vi:'Nhập giờ bắt đầu, ví dụ 08:30' },
  sc_err_end_invalid_time: { en:'Enter an end time like 09:30', vi:'Nhập giờ kết thúc, ví dụ 09:30' }, sc_err_end_end_before_start: { en:'The end must be after the start', vi:'Giờ kết thúc phải sau giờ bắt đầu' },
  sc_err_room_too_long: { en:'Room name is too long (at most {max} characters)', vi:'Tên phòng quá dài (tối đa {max} ký tự)' }, sc_err_overlap_overlap: { en:'This overlaps another time of the same class', vi:'Trùng với một giờ khác của cùng lớp' },
  sc_err_slots_too_many: { en:'At most {max} times per class', vi:'Tối đa {max} giờ học cho mỗi lớp' }, sc_err_from_invalid_date: { en:'Enter a valid start date', vi:'Nhập ngày bắt đầu hợp lệ' },
  sc_err_to_invalid_date: { en:'Enter a valid end date', vi:'Nhập ngày kết thúc hợp lệ' }, sc_err_range_range_inverted: { en:'The term must end after it starts', vi:'Kỳ học phải kết thúc sau khi bắt đầu' },
  sc_err_generic: { en:'That timetable is not valid', vi:'Lịch này không hợp lệ' },
};

const SCUI = { classes: null, loading: false, loadErr: '', filter: 'all', editing: '', draft: null, errs: [], busy: false };
const SC_PX_PER_HOUR = 44;

/* ---------------- data ---------------- */
async function scLoad(force){
  if(SCUI.loading) return;
  SCUI.loading = true; SCUI.loadErr = '';
  try{ SCUI.classes = await AD.getClasses(force); }catch(e){ SCUI.loadErr = sdMsg(e); }
  SCUI.loading = false;
  if(SDUI.alive() && SDUI.tab === 'schedule') sdPaintPane();
}
const scDayName = (day) => new Intl.DateTimeFormat(sdLocale(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, day)));   // 1 Jan 2024 was a Monday
const scSlots = (c) => (c.schedule && Array.isArray(c.schedule.slots)) ? c.schedule.slots : [];
function scErrText(e){
  const seg = String(e.field).split('.'), k = seg.length === 3 ? seg[2] : seg[0], n = seg.length === 3 ? (+seg[1] + 1) : 0;
  const msg = t(STRINGS['sc_err_' + k + '_' + e.code] ? 'sc_err_' + k + '_' + e.code : 'sc_err_generic', { max: e.max });
  return n ? t('sc_slot', { n }) + ': ' + msg : msg;
}

/* ---------------- the grid ---------------- */
function scFilterOptions(){
  const cls = SCUI.classes || [], teachers = new Map(), rooms = new Map();
  cls.forEach(c => {
    if(c.teacherUid) teachers.set(c.teacherUid, c.teacherName || c.teacherEmail || c.teacherUid);
    scSlots(c).forEach(s => { const k = ClassScheduleFns.roomKey(s.room); if(k && !rooms.has(k)) rooms.set(k, ClassScheduleFns.normRoom(s.room)); });
  });
  const opt = (v, label) => `<option value="${esc(v)}"${SCUI.filter === v ? ' selected' : ''}>${esc(label)}</option>`;
  const byName = (a, b) => a[1].localeCompare(b[1], sdLocale());
  return opt('all', t('sc_filter_all'))
    + (teachers.size ? `<optgroup label="${esc(t('sc_filter_teachers'))}">${[...teachers].sort(byName).map(([u, n]) => opt('t:' + u, n)).join('')}</optgroup>` : '')
    + (rooms.size ? `<optgroup label="${esc(t('sc_filter_rooms'))}">${[...rooms].sort(byName).map(([k, n]) => opt('r:' + k, n)).join('')}</optgroup>` : '');
}
// Greedy lanes so overlapping blocks in one day sit side by side instead of on top of each other.
function scLanes(blocks){
  const sorted = blocks.slice().sort((a, b) => a.a - b.a || a.z - b.z), ends = [];
  sorted.forEach(b => { let lane = ends.findIndex(e => e <= b.a); if(lane < 0){ lane = ends.length; ends.push(0); } ends[lane] = b.z; b.lane = lane; });
  return { blocks: sorted, lanes: Math.max(1, ends.length) };
}
function scGridHtml(clashSet){
  const CS = ClassScheduleFns, f = SCUI.filter, byDay = {};
  (SCUI.classes || []).forEach(c => scSlots(c).forEach((s, i) => {
    if(f.indexOf('t:') === 0 && c.teacherUid !== f.slice(2)) return;
    if(f.indexOf('r:') === 0 && CS.roomKey(s.room) !== f.slice(2)) return;
    (byDay[s.day] = byDay[s.day] || []).push({ c, s, i, a: CS.parseTime(s.start), z: CS.parseTime(s.end) });
  }));
  const all = [].concat(...Object.values(byDay));
  if(!all.length) return `<p class="hint">${esc(t('sc_grid_empty'))}</p>`;
  const days = [1, 2, 3, 4, 5].concat([6, 7].filter(d => byDay[d]));
  const h0 = Math.max(0, Math.min(...all.map(b => Math.floor(b.a / 60)), 8)), h1 = Math.min(24, Math.max(...all.map(b => Math.ceil(b.z / 60)), h0 + 6));
  const height = (h1 - h0) * SC_PX_PER_HOUR;
  const axis = Array.from({ length: h1 - h0 }, (_, k) => `<div class="sc-hour" style="top:${k * SC_PX_PER_HOUR}px">${String(h0 + k).padStart(2, '0')}:00</div>`).join('');
  const cols = days.map(d => {
    const { blocks, lanes } = scLanes(byDay[d] || []);
    const html = blocks.map(b => {
      const top = (b.a - h0 * 60) * SC_PX_PER_HOUR / 60, hgt = Math.max(16, (b.z - b.a) * SC_PX_PER_HOUR / 60 - 1), w = 100 / lanes;
      const clash = clashSet.has(b.c.id + '#' + b.i), label = `${b.c.className}\n${b.s.start}–${b.s.end}${b.s.room ? ' · ' + b.s.room : ''}${b.c.teacherName ? '\n' + b.c.teacherName : ''}`;
      return `<div class="sc-block${clash ? ' sc-clash' : ''}" style="top:${top}px;height:${hgt}px;left:${b.lane * w}%;width:calc(${w}% - 2px)" title="${esc(label)}"><b>${esc(b.c.className)}</b><span>${esc(b.s.start)}–${esc(b.s.end)}${b.s.room ? ' · ' + esc(b.s.room) : ''}</span></div>`;
    }).join('');
    return `<div class="sc-col"><div class="sc-dayhead">${esc(scDayName(d))}</div><div class="sc-track" style="height:${height}px">${html}</div></div>`;
  }).join('');
  return `<div class="sc-scroll"><div class="sc-grid"><div class="sc-axis"><div class="sc-dayhead">&nbsp;</div><div class="sc-track" style="height:${height}px">${axis}</div></div>${cols}</div></div>`;
}
function scClashHtml(clashes){
  if(!clashes.length) return `<p class="hint">${esc(t('sc_no_clashes'))}</p>`;
  return `<ul class="sc-clashes">${clashes.map(x => `<li class="sc-clash-row"><span class="badge warn">${esc(scDayName(x.day))} ${esc(x.start)}–${esc(x.end)}</span> ${esc(t(x.kind === 'teacher' ? 'sc_clash_teacher' : 'sc_clash_room', { who: x.label, a: x.a.className, b: x.b.className }))}</li>`).join('')}</ul>`;
}

/* ---------------- per-class editor ---------------- */
function scSummary(c){
  const slots = scSlots(c);
  if(!slots.length) return `<span class="hint">${esc(t('sc_none'))}</span>`;
  const term = c.schedule.from || c.schedule.to ? ` · ${esc(t('sc_term', { from: c.schedule.from || t('sc_term_open'), to: c.schedule.to || t('sc_term_open') }))}` : '';
  return `<span class="dir-sub">${slots.map(s => `${esc(scDayName(s.day))} ${esc(s.start)}–${esc(s.end)}${s.room ? ' ' + esc(s.room) : ''}`).join(' · ')}${term}</span>`;
}
function scRowHtml(s, i){
  const day = [1, 2, 3, 4, 5, 6, 7].map(d => `<option value="${d}"${+s.day === d ? ' selected' : ''}>${esc(scDayName(d))}</option>`).join('');
  return `<div class="sc-slot cd-row" data-i="${i}"><label class="dir-field"><span>${esc(t('sc_f_day'))}</span><select data-f="day">${day}</select></label>
    <label class="dir-field"><span>${esc(t('sc_f_start'))}</span><input type="time" data-f="start" value="${esc(s.start || '')}"></label>
    <label class="dir-field"><span>${esc(t('sc_f_end'))}</span><input type="time" data-f="end" value="${esc(s.end || '')}"></label>
    <label class="dir-field"><span>${esc(t('sc_f_room'))}</span><input type="text" data-f="room" maxlength="${ClassScheduleFns.ROOM_MAX}" value="${esc(s.room || '')}"></label>
    <button class="wbtn sm" data-act="sc-del" data-i="${i}">${esc(t('sc_remove'))}</button></div>`;
}
function scEditorHtml(c){
  const d = SCUI.draft;
  return `<div class="cd-manage">${SCUI.errs.length ? `<div class="dir-err">${SCUI.errs.map(e => `<p>${esc(scErrText(e))}</p>`).join('')}</div>` : ''}
    ${d.slots.map(scRowHtml).join('')}
    <div class="btn-row"><button class="wbtn sm" data-act="sc-add">${esc(t('sc_add'))}</button></div>
    <div class="dir-fields"><label class="dir-field"><span>${esc(t('sc_f_from'))}</span><input type="date" id="sc-from" value="${esc(d.from || '')}"></label>
      <label class="dir-field"><span>${esc(t('sc_f_to'))}</span><input type="date" id="sc-to" value="${esc(d.to || '')}"></label></div>
    <div class="btn-row"><button class="wbtn sm primary" data-act="sc-save" data-id="${esc(c.id)}"${SCUI.busy ? ' disabled' : ''}>${esc(t('sc_save'))}</button><button class="wbtn sm" data-act="sc-cancel">${esc(t('sc_cancel'))}</button></div></div>`;
}
function scCardHtml(c){
  const open = SCUI.editing === c.id;
  return `<div class="sd-card${open ? ' cd-open' : ''}"><div class="dir-name">${esc(c.className)}</div><div class="dir-sub">${esc(c.teacherName || c.teacherEmail || '—')}</div><div>${scSummary(c)}</div>
    ${open ? scEditorHtml(c) : `<div class="sd-card-act"><button class="wbtn sm" data-act="sc-edit" data-id="${esc(c.id)}">${esc(t('sc_edit'))}</button></div>`}</div>`;
}

/* ---------------- drawing ---------------- */
function scHtml(){
  if(SCUI.classes === null) return `<p class="hint">${esc(SCUI.loadErr || t('sc_loading'))}</p>`;
  return `<h3 class="sd-h">${esc(t('sc_title'))}</h3><p class="hint">${esc(t('sc_sub'))}</p>
    <div class="dir-filters"><label class="dir-field"><span>${esc(t('sc_filter'))}</span><select id="sc-filter">${scFilterOptions()}</select></label></div>
    <div id="sc-view">${scViewHtml()}</div>
    <h4 class="sd-h">${esc(t('sc_edit_h'))}</h4><div id="sc-list"><div class="sd-cards">${(SCUI.classes || []).slice().sort((a, b) => a.className.localeCompare(b.className, sdLocale())).map(scCardHtml).join('')}</div></div>`;
}
// The grid and the clash list (everything that depends on the stored timetables and the filter)
function scViewHtml(){
  const clashes = ClassScheduleFns.findClashes(SCUI.classes || []), set = new Set();
  clashes.forEach(x => { set.add(x.a.classId + '#' + x.a.slot); set.add(x.b.classId + '#' + x.b.slot); });
  return scGridHtml(set) + `<h4 class="sd-h">${esc(t('sc_clashes_h', { n: clashes.length }))}</h4>` + scClashHtml(clashes);
}
function scRepaintList(){ const el = SDUI.body.querySelector('#sc-list'); if(el) el.innerHTML = `<div class="sd-cards">${(SCUI.classes || []).slice().sort((a, b) => a.className.localeCompare(b.className, sdLocale())).map(scCardHtml).join('')}</div>`; }
function scRepaintView(){ const el = SDUI.body.querySelector('#sc-view'); if(el) el.innerHTML = scViewHtml(); }
function scShow(){ if(SCUI.classes === null && !SCUI.loading) scLoad(false); }

/* ---------------- editing ---------------- */
// Read the rows back out of the page into the draft (before any repaint, so nothing typed is lost)
function scKeepDraft(){
  if(!SCUI.draft) return;
  const rows = [...SDUI.body.querySelectorAll('.sc-slot')];
  if(rows.length || SDUI.body.querySelector('#sc-from')){
    SCUI.draft.slots = rows.map(r => { const g = (f) => (r.querySelector('[data-f="' + f + '"]') || {}).value || ''; return { day: +g('day') || 1, start: g('start'), end: g('end'), room: g('room') }; });
    const from = SDUI.body.querySelector('#sc-from'), to = SDUI.body.querySelector('#sc-to');
    if(from) SCUI.draft.from = from.value || null;
    if(to) SCUI.draft.to = to.value || null;
  }
}
async function scSave(id){
  scKeepDraft();
  const v = ClassScheduleFns.validateSchedule(SCUI.draft);        // the server's own rules, so a mistake is caught here without a round trip
  if(!v.ok){ SCUI.errs = v.errors; scRepaintList(); return; }
  if(SCUI.busy) return;
  SCUI.busy = true; SCUI.errs = [];
  try{
    const r = await AD.classDeckCall('adminSetSchedule', { classId: id, slots: v.value.slots, from: v.value.from, to: v.value.to });
    toast(t(r.changed ? 'sc_saved' : 'sc_nochange'));
    SCUI.editing = ''; SCUI.draft = null;
    SCUI.classes = await AD.getClasses(true);
  }catch(e){
    if(e && e.status === 400 && e.data && e.data.errors) SCUI.errs = e.data.errors;
    else if(e && e.status === 404){ toast(t('sc_gone')); SCUI.editing = ''; SCUI.draft = null; try{ SCUI.classes = await AD.getClasses(true); }catch(_){} }
    else toast(sdMsg(e));
  }finally{ SCUI.busy = false; }
  scRepaintList(); scRepaintView();
}
function scClick(d){
  if(d.act !== 'sc-save') scKeepDraft();
  switch(d.act){
    case 'sc-edit': {
      const c = (SCUI.classes || []).find(x => x.id === d.id); if(!c) return;
      const sc = c.schedule || { slots: [], from: null, to: null };
      SCUI.editing = d.id; SCUI.errs = [];
      SCUI.draft = { slots: sc.slots.map(s => ({ ...s })), from: sc.from || null, to: sc.to || null };
      if(!SCUI.draft.slots.length) SCUI.draft.slots.push({ day: 1, start: '08:00', end: '09:00', room: '' });
      scRepaintList(); break;
    }
    case 'sc-cancel': SCUI.editing = ''; SCUI.draft = null; SCUI.errs = []; scRepaintList(); break;
    case 'sc-add': SCUI.draft.slots.push({ day: 1, start: '08:00', end: '09:00', room: '' }); scRepaintList(); break;
    case 'sc-del': SCUI.draft.slots.splice(+d.i, 1); SCUI.errs = []; scRepaintList(); break;
    case 'sc-save': scSave(d.id); break;
  }
}
function scInput(){ /* nothing is typed into a field that needs live handling; rows are read when you act */ }
function scChange(e){ if(e.target.id === 'sc-filter'){ SCUI.filter = e.target.value; scRepaintView(); } }

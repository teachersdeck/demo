/* ============================================================
   AdminDeck History (v0.13.0) — SchoolDeck's own tab: one class's audit trail.
   ------------------------------------------------------------
   A per-class view over the SAME adminAudit log every classdeck.* action already writes (create, assign,
   update, join-code reset, schedule, archive) — no new log, just adminClassHistory's classIds array-contains
   query (functions/adminClassDeck.js). Also the home of Archive/Restore: a class stays a class (its roster,
   teacher and codes are untouched), archiving is a label AdminDeck itself filters and shows a badge for.
   Lives inside the SchoolDeck widget, loaded after classdeck-ui.js. Uses: t, esc, toast, STRINGS, AD, SDUI,
   sdMsg, sdLocale, sdPaintPane, cdRefresh (classdeck-ui.js, so the Classes tab's badge/list stay in sync).
   ============================================================ */
const HS_STRINGS = {
  sd_tab_history: { en:'History', vi:'Lịch sử' },
  hs_title: { en:'Class history', vi:'Lịch sử lớp học' },
  hs_sub: { en:'Every change made to a class, from the audit log Classes/Schedule already write to.', vi:'Mọi thay đổi của một lớp, lấy từ nhật ký mà Lớp học/Lịch học đã ghi lại.' },
  hs_pick: { en:'Choose a class', vi:'Chọn một lớp' }, hs_pick_blank: { en:'— Choose a class —', vi:'— Chọn một lớp —' },
  hs_loading: { en:'Loading…', vi:'Đang tải…' }, hs_empty: { en:'No history yet for this class.', vi:'Lớp này chưa có lịch sử.' },
  hs_none: { en:'Choose a class above to see its history.', vi:'Hãy chọn một lớp ở trên để xem lịch sử.' },
  hs_archived_badge: { en:'Archived', vi:'Đã lưu trữ' },
  hs_archive: { en:'Archive this class', vi:'Lưu trữ lớp này' }, hs_restore: { en:'Restore this class', vi:'Khôi phục lớp này' },
  hs_confirm_archive: { en:'Archive this class? It stays fully intact — this only labels it archived.', vi:'Lưu trữ lớp này? Lớp vẫn còn nguyên — chỉ gắn nhãn đã lưu trữ.' },
  hs_archived_done: { en:'Class archived', vi:'Đã lưu trữ lớp' }, hs_restored_done: { en:'Class restored', vi:'Đã khôi phục lớp' },
  hs_act_classdeck_create: { en:'Created', vi:'Đã tạo' }, hs_act_classdeck_assign: { en:'Teacher changed', vi:'Đổi giáo viên' },
  hs_act_classdeck_update: { en:'Settings changed', vi:'Đổi cài đặt' }, hs_act_classdeck_regenerateCode: { en:'Join code reset', vi:'Làm mới mã tham gia' },
  hs_act_classdeck_schedule: { en:'Timetable changed', vi:'Đổi lịch học' }, hs_act_classdeck_archive: { en:'Archived / restored', vi:'Lưu trữ / khôi phục' },
};

const HSUI = { classId: '', entries: null, loading: false, err: '', busy: false };

/* ---------------- data ---------------- */
async function hsLoad(force){
  if(!HSUI.classId){ HSUI.entries = null; return; }
  if(HSUI.loading) return;
  HSUI.loading = true; HSUI.err = '';
  try{ HSUI.entries = (await AD.getClassHistory(HSUI.classId, force)).entries || []; }
  catch(e){ HSUI.err = sdMsg(e); HSUI.entries = null; }
  HSUI.loading = false;
  if(SDUI.alive() && SDUI.tab === 'history') hsRepaint();
}
// Called by sdPaintPane right after the tab's HTML is in place — classes come from the same cache ClassDeck uses.
function hsShow(){ if(CDUI.classes === null && !CDUI.loading) cdLoad(false); if(HSUI.classId && HSUI.entries === null && !HSUI.loading) hsLoad(false); }

/* ---------------- drawing ---------------- */
function hsClassOpts(){
  const classes = (CDUI.classes || []).slice().sort((a, b) => a.className.localeCompare(b.className, sdLocale()));
  return `<option value="">${esc(t('hs_pick_blank'))}</option>` + classes.map(c => `<option value="${esc(c.id)}"${c.id === HSUI.classId ? ' selected' : ''}>${esc(c.className)}${c.archived ? ' — ' + esc(t('hs_archived_badge')) : ''}</option>`).join('');
}
function hsActLabel(action){
  const key = 'hs_act_' + String(action).replace(/[^A-Za-z0-9]+/g, '_');
  return STRINGS[key] ? t(key) : action;
}
function hsEntriesHtml(){
  if(CDUI.classes === null) return `<p class="hint">${esc(t('hs_loading'))}</p>`;
  if(!HSUI.classId) return `<p class="hint">${esc(t('hs_none'))}</p>`;
  if(HSUI.loading) return `<p class="hint">${esc(t('hs_loading'))}</p>`;
  if(HSUI.err) return `<p class="err-box">${esc(HSUI.err)}</p>`;
  const c = (CDUI.classes || []).find(x => x.id === HSUI.classId);
  const archived = c ? !!c.archived : false;
  const head = c ? `<div class="dir-actions chip-row"><span class="dir-name">${esc(c.className)}${archived ? ` <span class="badge warn">${esc(t('hs_archived_badge'))}</span>` : ''}</span>
    <button class="wbtn sm${archived ? '' : ' danger'}" data-act="hs-archive" data-id="${esc(c.id)}" data-archived="${archived ? 'false' : 'true'}"${HSUI.busy ? ' disabled' : ''}>${esc(t(archived ? 'hs_restore' : 'hs_archive'))}</button></div>` : '';
  if(!HSUI.entries || !HSUI.entries.length) return head + `<p class="hint">${esc(t('hs_empty'))}</p>`;
  return head + `<div class="sd-log">${HSUI.entries.map(e => `<div class="dir-row sd-entry"><div class="dir-main"><span class="badge anon">${esc(hsActLabel(e.action))}</span><span class="dir-sub">${esc(new Date(e.atMs).toLocaleString(sdLocale()))}</span></div><div class="dir-sub">${esc(e.summary)}</div></div>`).join('')}</div>`;
}
function hsHtml(){
  return `<h3 class="sd-h">${esc(t('hs_title'))}</h3><p class="hint">${esc(t('hs_sub'))}</p>
    <div class="dir-filters"><label class="dir-field"><span>${esc(t('hs_pick'))}</span><select id="hs-class">${hsClassOpts()}</select></label></div>
    <div id="hs-view">${hsEntriesHtml()}</div>`;
}
function hsRepaint(){ const el = SDUI.body.querySelector('#hs-view'); if(el) el.innerHTML = hsEntriesHtml(); }

/* ---------------- actions ---------------- */
async function hsArchive(id, archived){
  if(HSUI.busy) return;
  if(archived && !window.confirm(t('hs_confirm_archive'))) return;
  HSUI.busy = true; hsRepaint();
  try{
    await AD.classDeckCall('adminArchiveClass', { classId: id, archived });
    toast(t(archived ? 'hs_archived_done' : 'hs_restored_done'));
    await cdRefresh();                 // refreshes CDUI.classes (and so SDUI.people counts) so the badge agrees everywhere
    await hsLoad(true);
  }catch(e){ toast(sdMsg(e)); }
  HSUI.busy = false; hsRepaint();
}

/* ---------------- events (called from schooldeck-ui.js's handlers for anything that starts with hs-) ---------------- */
function hsClick(d){
  if(d.act === 'hs-archive') hsArchive(d.id, d.archived === 'true');
}
function hsChange(e){
  if(e.target.id === 'hs-class'){ HSUI.classId = e.target.value; HSUI.entries = null; HSUI.err = ''; hsLoad(false); hsRepaint(); }
}

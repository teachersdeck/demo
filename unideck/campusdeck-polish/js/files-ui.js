/* ============================================================
   AdminDeck Files (v0.16.0) — the office's documents, as in TeachersDeck's Files widget.
   ------------------------------------------------------------
   PDFs added from the computer (kept in this browser only, IndexedDB "AdminDeckFiles" store "files"), Google Docs / Slides /
   Sheets / Drive links pasted in, and files picked from Google Drive (js/drivepick.js, the same file as TeachersDeck's).
   Everything shows full screen inside AdminDeck: a PDF in the browser's own viewer, a Google file in Google's viewer
   (with the browser's own Google sign-in). Nothing goes to the server. CampusDeck (UniDeck) keeps it too.
   Loaded before app.js. Uses: t, esc, toast, iconSvg, state (app.js).
   ============================================================ */
const FL_STRINGS = {
  w_files: { en:'📁 Files', vi:'📁 Tệp tin' },
  fl_add_pdf: { en:'Add a PDF', vi:'Thêm PDF' },
  fl_drive: { en:'Google Drive', vi:'Google Drive' },
  fl_link_ph: { en:'Paste a Google Docs / Slides / Sheets / Drive link', vi:'Dán liên kết Google Docs / Slides / Sheets / Drive' },
  fl_name_ph: { en:'Name (optional)', vi:'Tên (không bắt buộc)' },
  fl_add_link: { en:'Add link', vi:'Thêm liên kết' },
  fl_empty: { en:'No files yet — add a PDF, paste a Google link or choose from Google Drive.', vi:'Chưa có tệp nào — hãy thêm PDF, dán liên kết Google hoặc chọn từ Google Drive.' },
  fl_hint: { en:'PDFs you add stay in this browser only. Google files open with your browser’s Google account.', vi:'PDF bạn thêm chỉ lưu trên trình duyệt này. Tệp Google mở bằng tài khoản Google trên trình duyệt.' },
  fl_bad_link: { en:'That link doesn’t look like a Google Docs, Slides, Sheets or Drive link.', vi:'Liên kết này có vẻ không phải liên kết Google Docs, Slides, Sheets hay Drive.' },
  fl_only_pdf: { en:'Only PDFs can be added from the computer. For other files, use Google Drive.', vi:'Từ máy tính chỉ thêm được PDF. Với tệp khác, hãy dùng Google Drive.' },
  fl_added: { en:'Added {n}', vi:'Đã thêm {n}' },
  fl_drive_added: { en:'Added {n} from Google Drive', vi:'Đã thêm {n} tệp từ Google Drive' },
  fl_blocked: { en:'The Google Drive window was blocked. Allow pop-ups for this page and try again.', vi:'Cửa sổ Google Drive đã bị chặn. Hãy cho phép cửa sổ bật lên trên trang này rồi thử lại.' },
  fl_store_err: { en:'Files can’t be saved in this window: ', vi:'Không lưu được tệp trong cửa sổ này: ' },
  fl_show: { en:'Show full screen', vi:'Xem toàn màn hình' }, fl_tab: { en:'Open in a new tab', vi:'Mở trong thẻ mới' },
  fl_remove: { en:'Remove', vi:'Gỡ' }, fl_close: { en:'Close', vi:'Đóng' }
};

/* One store, opened on first use. */
const flDB = (() => {
  let db = null;
  const open = () => db ? Promise.resolve(db) : new Promise((res, rej) => {
    if(typeof indexedDB === 'undefined') return rej(new Error('IndexedDB'));
    const q = indexedDB.open('AdminDeckFiles', 1);   // its own database: 'AdminDeck' is js/theme.js's (images)
    q.onupgradeneeded = e => { const d = e.target.result; if(!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath:'id' }); };
    q.onsuccess = e => { db = e.target.result; db.onversionchange = () => { db.close(); db = null; }; res(db); };
    q.onerror = e => rej(e.target.error);
  });
  const run = (mode, fn) => open().then(d => new Promise((res, rej) => {
    const tx = d.transaction('files', mode), r = fn(tx.objectStore('files'));
    tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  }));
  return { put: rec => run('readwrite', st => st.put(rec)), delete: id => run('readwrite', st => st.delete(id)), getAll: () => run('readonly', st => st.getAll()) };
})();

/* The same reading of a Google link as TeachersDeck's parseGoogleLink: where to show it and where "open in a tab" goes. */
function flParseGoogle(raw){
  let u; try{ u = new URL(String(raw || '').trim()); }catch(e){ return null; }
  if(u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase(), path = u.pathname; let m;
  if(host === 'docs.google.com'){
    m = /^\/(document|presentation|spreadsheets|forms)(?:\/u\/\d+)?\/d\/(e\/)?([A-Za-z0-9_-]+)/.exec(path);
    if(!m) return null;
    const gtype = m[1], published = !!m[2], id = m[3], base = 'https://docs.google.com/' + gtype + '/d/' + (published ? 'e/' : '') + id;
    if(gtype === 'forms') return published ? { gtype, id, src: base + '/viewform?embedded=true', tab: base + '/viewform' } : null;
    if(published) return { gtype, id, src: base + (gtype === 'document' ? '/pub?embedded=true' : gtype === 'presentation' ? '/embed' : '/pubhtml?widget=true&headers=false'), tab: base + (gtype === 'spreadsheets' ? '/pubhtml' : '/pub') };
    return { gtype, id, src: base + '/preview', tab: base + '/edit' };
  }
  if(host === 'drive.google.com'){
    m = /^\/file(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/.exec(path);
    const id = m ? m[1] : (path === '/open' ? u.searchParams.get('id') : null);
    if(!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
    return { gtype:'drive', id, src:'https://drive.google.com/file/d/' + id + '/preview', tab:'https://drive.google.com/file/d/' + id + '/view' };
  }
  return null;
}
const FL_LABEL = { document:'DOC', presentation:'SLIDES', spreadsheets:'SHEET', forms:'FORM', drive:'DRIVE' };
const flId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* Full screen: one overlay, reused. A PDF from its blob, a Google file in Google's viewer. */
let flStage = null, flBlobUrl = null;
function flShow(f){
  let src, tab;
  if(f.kind === 'glink'){ const g = flParseGoogle(f.url); if(!g){ toast(t('fl_bad_link')); return; } src = g.src; tab = g.tab; }
  else { if(flBlobUrl) URL.revokeObjectURL(flBlobUrl); flBlobUrl = URL.createObjectURL(f.blob); src = tab = flBlobUrl; }
  if(!flStage){
    flStage = document.createElement('div'); flStage.className = 'fl-stage';
    flStage.innerHTML = `<div class="fl-bar"><span class="fl-title"></span><button type="button" class="wbtn fl-tab"></button><button type="button" class="wbtn fl-close"></button></div><iframe class="fl-frame" allow="fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    document.body.appendChild(flStage);
    flStage.querySelector('.fl-close').addEventListener('click', flClose);
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && flStage && !flStage.hidden) flClose(); });
  }
  flStage.querySelector('.fl-title').textContent = f.name;
  flStage.querySelector('.fl-tab').textContent = '↗ ' + t('fl_tab');
  flStage.querySelector('.fl-close').textContent = t('fl_close');
  flStage.querySelector('.fl-tab').onclick = () => window.open(tab, '_blank', 'noopener');
  flStage.querySelector('.fl-frame').src = src;
  flStage.hidden = false;
}
function flClose(){
  if(!flStage) return;
  flStage.hidden = true; flStage.querySelector('.fl-frame').src = 'about:blank';
  if(flBlobUrl){ URL.revokeObjectURL(flBlobUrl); flBlobUrl = null; }
}

function renderFilesWidget(body){
  const drive = typeof DrivePick !== 'undefined' && DrivePick.available();
  body.innerHTML = `<div class="fl-add"><button type="button" class="wbtn" id="fl-browse">＋ ${esc(t('fl_add_pdf'))}</button>${drive ? `<button type="button" class="wbtn" id="fl-drive">☁️ ${esc(t('fl_drive'))}</button>` : ''}</div>
    <input type="file" id="fl-input" hidden multiple accept=".pdf,application/pdf">
    <form class="fl-link" autocomplete="off"><input type="text" class="fl-url" placeholder="${esc(t('fl_link_ph'))}" aria-label="${esc(t('fl_link_ph'))}"><input type="text" class="fl-name" placeholder="${esc(t('fl_name_ph'))}" aria-label="${esc(t('fl_name_ph'))}"><button type="submit" class="wbtn">${esc(t('fl_add_link'))}</button></form>
    <p class="fl-err" hidden></p>
    <ul class="fl-list"></ul>
    <p class="meta">${esc(t('fl_hint'))}</p>`;
  const list = body.querySelector('.fl-list'), input = body.querySelector('#fl-input'), errEl = body.querySelector('.fl-err');
  const fail = msg => { errEl.hidden = !msg; errEl.textContent = msg || ''; };
  async function draw(){
    let files = []; try{ files = await flDB.getAll(); }catch(e){ fail(t('fl_store_err') + e.message); }
    files.sort((a, c) => (c.added || 0) - (a.added || 0));
    list.innerHTML = files.length ? '' : `<li class="empty">${esc(t('fl_empty'))}</li>`;
    files.forEach(f => {
      const li = document.createElement('li'), link = f.kind === 'glink';
      li.innerHTML = `<span class="fl-type">${esc(link ? (FL_LABEL[f.gtype] || 'LINK') : 'PDF')}</span><button type="button" class="fl-name-btn"></button><button type="button" class="fl-ico fl-open" title="${esc(t('fl_tab'))}" aria-label="${esc(t('fl_tab'))}">↗</button><button type="button" class="fl-ico fl-del" title="${esc(t('fl_remove'))}" aria-label="${esc(t('fl_remove'))}">×</button>`;
      const nameBtn = li.querySelector('.fl-name-btn'); nameBtn.textContent = f.name; nameBtn.title = t('fl_show');
      nameBtn.addEventListener('click', () => flShow(f));
      li.querySelector('.fl-open').addEventListener('click', () => {
        if(link){ const g = flParseGoogle(f.url); if(g) window.open(g.tab, '_blank', 'noopener'); }
        else window.open(URL.createObjectURL(f.blob), '_blank');
      });
      li.querySelector('.fl-del').addEventListener('click', async () => { try{ await flDB.delete(f.id); }catch(e){ fail(t('fl_store_err') + e.message); } draw(); });
      list.appendChild(li);
    });
  }
  body.querySelector('#fl-browse').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    let n = 0, skipped = 0;
    for(const file of input.files){
      if(!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf'){ skipped++; continue; }
      try{ await flDB.put({ id:flId(), name:file.name, blob:file, added:Date.now() }); n++; }catch(e){ fail(t('fl_store_err') + e.message); }
    }
    input.value = ''; draw();
    if(skipped) fail(t('fl_only_pdf'));
    if(n) toast(t('fl_added', { n }));
  });
  body.querySelector('.fl-link').addEventListener('submit', async e => {
    e.preventDefault();
    const urlEl = body.querySelector('.fl-url'), nameEl = body.querySelector('.fl-name'), g = flParseGoogle(urlEl.value);
    if(!g){ toast(t('fl_bad_link')); return; }
    try{ await flDB.put({ id:flId(), kind:'glink', name: nameEl.value.trim() || ('Google ' + (FL_LABEL[g.gtype] || '') + ' ' + g.id.slice(0, 6)).replace(/\s+/g, ' '), url: urlEl.value.trim(), gtype:g.gtype, added:Date.now() }); }
    catch(err){ fail(t('fl_store_err') + err.message); return; }
    urlEl.value = ''; nameEl.value = ''; draw();
  });
  const driveBtn = body.querySelector('#fl-drive');
  if(driveBtn) driveBtn.addEventListener('click', async () => {
    let picked;
    try{ picked = await DrivePick.pick(state.lang); }catch(e){ fail(t('fl_blocked')); return; }
    if(!picked.length) return;
    try{ for(const p of picked) await flDB.put({ id:flId(), kind:'glink', name:p.name, url:p.url, gtype:p.gtype, added:Date.now() }); }
    catch(err){ fail(t('fl_store_err') + err.message); }
    draw(); toast(t('fl_drive_added', { n:picked.length }));
  });
  draw();
}

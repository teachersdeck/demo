/* KinderDeck Files (v0.10.0): the office's own documents, as in AdminDeck's and TeachersDeck's Files widgets.
   PDFs added from the computer (kept in this browser only, IndexedDB "KinderDeckFiles"; "KinderDeck" is the background
   picture's), Google Docs / Slides / Sheets / Drive links pasted in, and files picked from Google Drive (js/drivepick.js,
   the suite's, a copy of TinyTeachersDeck's kept identical by tools/sync_shared.py). Everything shows full screen inside
   KinderDeck: a PDF in the browser's own viewer, a Google file in Google's (with the browser's own Google sign-in).
   Nothing goes to a server. The Document Library stays as it is: it records scanned paperwork typed in by hand. */
(function () {
  const db = (() => {
    let d = null;
    const open = () => d ? Promise.resolve(d) : new Promise((ok, no) => {
      if (typeof indexedDB === 'undefined') return no(new Error('IndexedDB'));
      const r = indexedDB.open('KinderDeckFiles', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('files')) r.result.createObjectStore('files', {keyPath:'id'}); };
      r.onsuccess = () => { d = r.result; d.onversionchange = () => { d.close(); d = null; }; ok(d); };
      r.onerror = () => no(r.error);
    });
    const run = (mode, fn) => open().then(x => new Promise((ok, no) => {
      const tx = x.transaction('files', mode), q = fn(tx.objectStore('files'));
      tx.oncomplete = () => ok(q && q.result); tx.onerror = () => no(tx.error); tx.onabort = () => no(tx.error);
    }));
    return {put: v => run('readwrite', s => s.put(v)), del: id => run('readwrite', s => s.delete(id)), all: () => run('readonly', s => s.getAll())};
  })();
  // The same reading of a Google link as TeachersDeck's parseGoogleLink.
  function parse(raw) {
    let u; try { u = new URL(String(raw || '').trim()); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase(), path = u.pathname; let m;
    if (host === 'docs.google.com') {
      m = /^\/(document|presentation|spreadsheets|forms)(?:\/u\/\d+)?\/d\/(e\/)?([A-Za-z0-9_-]+)/.exec(path);
      if (!m) return null;
      const g = m[1], pub = !!m[2], id = m[3], base = 'https://docs.google.com/' + g + '/d/' + (pub ? 'e/' : '') + id;
      if (g === 'forms') return pub ? {g, id, src:base + '/viewform?embedded=true', tab:base + '/viewform'} : null;
      if (pub) return {g, id, src:base + (g === 'document' ? '/pub?embedded=true' : g === 'presentation' ? '/embed' : '/pubhtml?widget=true&headers=false'), tab:base + (g === 'spreadsheets' ? '/pubhtml' : '/pub')};
      return {g, id, src:base + '/preview', tab:base + '/edit'};
    }
    if (host === 'drive.google.com') {
      m = /^\/file(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/.exec(path);
      const id = m ? m[1] : (path === '/open' ? u.searchParams.get('id') : null);
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
      return {g:'drive', id, src:'https://drive.google.com/file/d/' + id + '/preview', tab:'https://drive.google.com/file/d/' + id + '/view'};
    }
    return null;
  }
  const LABEL = {document:'DOC', presentation:'SLIDES', spreadsheets:'SHEET', forms:'FORM', drive:'DRIVE'};
  const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const badLink = () => L('That link doesn’t look like a Google Docs, Slides, Sheets or Drive link.', 'Liên kết này có vẻ không phải liên kết Google Docs, Slides, Sheets hay Drive.');
  const storeErr = e => L('Files can’t be saved in this window: ', 'Không lưu được tệp trong cửa sổ này: ') + e.message;

  let stage = null, blobUrl = null;
  function show(f) {
    let src, tab;
    if (f.kind === 'glink') { const g = parse(f.url); if (!g) return toast(badLink()); src = g.src; tab = g.tab; }
    else { if (blobUrl) URL.revokeObjectURL(blobUrl); blobUrl = URL.createObjectURL(f.blob); src = tab = blobUrl; }
    if (!stage) {
      stage = document.createElement('div'); stage.className = 'fl-stage';
      stage.innerHTML = '<div class="fl-bar"><span class="fl-title"></span><button type="button" class="wbtn fl-tab"></button><button type="button" class="wbtn fl-close"></button></div><iframe class="fl-frame" allow="fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      document.body.appendChild(stage);
      stage.querySelector('.fl-close').onclick = close;
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && stage && !stage.hidden) close(); });
    }
    stage.querySelector('.fl-title').textContent = f.name;
    stage.querySelector('.fl-tab').textContent = '↗ ' + L('Open in a new tab', 'Mở trong thẻ mới');
    stage.querySelector('.fl-close').textContent = L('Close', 'Đóng');
    stage.querySelector('.fl-tab').onclick = () => window.open(tab, '_blank', 'noopener');
    stage.querySelector('.fl-frame').src = src;
    stage.hidden = false;
  }
  function close() {
    stage.hidden = true; stage.querySelector('.fl-frame').src = 'about:blank';
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
  }

  const W = { id:'files', em:'📁', icon:'folder', en:'Files', vi:'Tệp tin', w:440, h:420,
    html() {
      const drive = typeof DrivePick !== 'undefined' && DrivePick.available();
      return `<div class="fl-add"><button type="button" class="wbtn" id="fl-browse">＋ ${L('Add a PDF', 'Thêm PDF')}</button>${drive ? `<button type="button" class="wbtn" id="fl-drive">☁️ Google Drive</button>` : ''}</div>
        <input type="file" id="fl-input" hidden multiple accept=".pdf,application/pdf">
        <form class="fl-link" autocomplete="off"><input type="text" class="fl-url" placeholder="${esc(L('Paste a Google Docs / Slides / Sheets / Drive link', 'Dán liên kết Google Docs / Slides / Sheets / Drive'))}"><input type="text" class="fl-name" placeholder="${esc(L('Name (optional)', 'Tên (không bắt buộc)'))}"><button type="submit" class="wbtn">${L('Add link', 'Thêm liên kết')}</button></form>
        <p class="fl-err" hidden></p><ul class="fl-list"></ul>
        <p class="empty" style="padding:4px 0;text-align:left">${L('PDFs you add stay in this browser only. Google files open with your browser’s Google account.', 'PDF bạn thêm chỉ lưu trên trình duyệt này. Tệp Google mở bằng tài khoản Google trên trình duyệt.')}</p>`;
    },
    wire(b) {
      const list = b.querySelector('.fl-list'), input = b.querySelector('#fl-input'), err = b.querySelector('.fl-err');
      const fail = m => { err.hidden = !m; err.textContent = m || ''; };
      async function draw() {
        let files = []; try { files = await db.all(); } catch (e) { fail(storeErr(e)); }
        files.sort((a, c) => (c.added || 0) - (a.added || 0));
        list.innerHTML = files.length ? '' : `<li class="empty">${L('No files yet — add a PDF, paste a Google link or choose from Google Drive.', 'Chưa có tệp nào — hãy thêm PDF, dán liên kết Google hoặc chọn từ Google Drive.')}</li>`;
        files.forEach(f => {
          const li = document.createElement('li'), link = f.kind === 'glink';
          li.innerHTML = `<span class="fl-type">${link ? (LABEL[f.gtype] || 'LINK') : 'PDF'}</span><button type="button" class="fl-name-btn"></button><button type="button" class="fl-ico fl-open" title="${L('Open in a new tab', 'Mở trong thẻ mới')}">↗</button><button type="button" class="fl-ico fl-del" title="${L('Remove', 'Gỡ')}">×</button>`;
          const nb = li.querySelector('.fl-name-btn'); nb.textContent = f.name; nb.onclick = () => show(f);
          li.querySelector('.fl-open').onclick = () => { if (link) { const g = parse(f.url); if (g) window.open(g.tab, '_blank', 'noopener'); } else window.open(URL.createObjectURL(f.blob), '_blank'); };
          li.querySelector('.fl-del').onclick = async () => { try { await db.del(f.id); } catch (e) { fail(storeErr(e)); } draw(); };
          list.appendChild(li);
        });
      }
      b.querySelector('#fl-browse').onclick = () => input.click();
      input.onchange = async () => {
        let n = 0, skipped = 0;
        for (const file of input.files) {
          if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { skipped++; continue; }
          try { await db.put({id:newId(), name:file.name, blob:file, added:Date.now()}); n++; } catch (e) { fail(storeErr(e)); }
        }
        input.value = ''; draw();
        if (skipped) fail(L('Only PDFs can be added from the computer. For other files, use Google Drive.', 'Từ máy tính chỉ thêm được PDF. Với tệp khác, hãy dùng Google Drive.'));
        if (n) toast(L('Added ' + n, 'Đã thêm ' + n));
      };
      b.querySelector('.fl-link').onsubmit = async e => {
        e.preventDefault();
        const u = b.querySelector('.fl-url'), nm = b.querySelector('.fl-name'), g = parse(u.value);
        if (!g) return toast(badLink());
        try { await db.put({id:newId(), kind:'glink', name:nm.value.trim() || ('Google ' + (LABEL[g.g] || '') + ' ' + g.id.slice(0, 6)), url:u.value.trim(), gtype:g.g, added:Date.now()}); }
        catch (x) { return fail(storeErr(x)); }
        u.value = ''; nm.value = ''; draw();
      };
      const dv = b.querySelector('#fl-drive');
      if (dv) dv.onclick = async () => {
        let picked;
        try { picked = await DrivePick.pick(state.lang); } catch (e) { return fail(L('The Google Drive window was blocked. Allow pop-ups for this page and try again.', 'Cửa sổ Google Drive đã bị chặn. Hãy cho phép cửa sổ bật lên trên trang này rồi thử lại.')); }
        if (!picked.length) return;
        try { for (const p of picked) await db.put({id:newId(), kind:'glink', name:p.name, url:p.url, gtype:p.gtype, added:Date.now()}); } catch (e) { fail(storeErr(e)); }
        draw(); toast(L('Added ' + picked.length + ' from Google Drive', 'Đã thêm ' + picked.length + ' tệp từ Google Drive'));
      };
      draw();
    } };
  const at = WIDGETS.findIndex(w => w.id === 'inbox');   // after the Document Library
  WIDGETS.splice(at < 0 ? WIDGETS.length : at + 1, 0, W);
})();

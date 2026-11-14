/* ============================================================
   KeepDeck's Scrapbook tab (js/keepdeck-scrap.js) — pages a family keeps for one child: a page is created
   automatically for the current month, plus free pages the parent adds. Items (photos, text, stickers,
   shapes) are dragged, resized and rotated into place using the SAME pure geometry/undo/sanitizer module as
   StudentDeck's own Scrapdeck — `window.ScrapCore`, kept byte-identical to studentdeck/js/scrapdeck-core.js
   by tools/check_shared.py. This file is the DOM layer (not shared: StudentDeck's own DOM layer,
   studentdeck/js/scrapdeck.js, has Firebase/school-policy/XP concerns baked into its event handlers that
   don't belong here) — the interaction pattern (pagePt/gesture/startDrag/startHandle, mutate the item in
   place during a drag, commit once on pointer-up) mirrors it closely.

   A "scrap" or "school card" saved from another ParentDeck widget (js/keepdeck-render.js) is not a new item
   type: it's a `photo` item whose asset is a PNG KeepDeck drew itself. KeepDeckScrap.saveScrap() is the one
   entry point keepdeck-render.js (and this file's own "add a photo" button) both go through.

   Storage: one `book` per child (ScrapCore.newBook, id forced to childId) + an `assets` store for every
   photo's blob — both in KeepDeckDB (js/keepdeck.js), the same IndexedDB database as the Home board's
   "boards" store, a different store so neither can collide with the other.
   ============================================================ */
Object.assign(KD_STRINGS, {
  kd_loading: { en: 'Loading…', vi: 'Đang tải…' },
  kd_add_text: { en: 'Text', vi: 'Văn bản' },
  kd_add_sticker: { en: 'Sticker', vi: 'Nhãn dán' },
  kd_add_shape: { en: 'Shape', vi: 'Hình khối' },
  kd_add_photo: { en: 'Photo', vi: 'Ảnh' },
  kd_tidy: { en: 'Tidy', vi: 'Sắp gọn' },
  kd_duplicate: { en: 'Duplicate', vi: 'Nhân đôi' },
  kd_delete: { en: 'Delete', vi: 'Xóa' },
  kd_new_page: { en: '+ Page', vi: '+ Trang' },
  kd_new_page_ask: { en: 'Name this page:', vi: 'Đặt tên cho trang này:' },
  kd_year: { en: 'Year', vi: 'Cả năm' },
  kd_year_back: { en: '← Back to page', vi: '← Về trang' },
  kd_page_empty: { en: 'Nothing on this page yet — add a photo, sticker or text.', vi: 'Trang này còn trống — hãy thêm ảnh, nhãn dán hoặc văn bản.' },
  kd_text_ph: { en: 'Write something…', vi: 'Viết gì đó…' },
  kd_del_page: { en: 'Delete this page', vi: 'Xóa trang này' },
  kd_del_page_q: { en: 'Delete this page and everything on it?', vi: 'Xóa trang này cùng mọi thứ trên đó?' },
  kd_month_untitled: { en: 'A page a month, automatically — add a free page for a trip or an event.', vi: 'Mỗi tháng tự có một trang — hãy thêm trang riêng cho một chuyến đi hay sự kiện.' },
  kd_saved_scrap: { en: 'Saved to Scrapbook', vi: 'Đã lưu vào Sổ lưu niệm' },
  kd_items_n: { en: '{n} items', vi: '{n} mục' },
});

const KeepDeckScrap = (function () {
  const C = window.ScrapCore, PAGE_W = C.PAGE_W, PAGE_H = C.PAGE_H;
  // If the Scrapbook tab is open for this child when a widget button saves a scrap (saveScrap below), the
  // save must go through that mount's own in-memory book — otherwise the mount's next debounced commit()
  // would overwrite the scrap with its own stale copy. Populated/cleared by mount() itself.
  const liveMounts = new Map();   // childId -> { addScrap(pngBlob, w, h) }
  const SHAPE_PATH = {
    rect: 'M0 0H100V100H0Z',
    round: 'M18 0H82Q100 0 100 18V82Q100 100 82 100H18Q0 100 0 82V18Q0 0 18 0Z',
    circle: 'M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z',
    heart: 'M50 92C8 62 2 30 26 18C38 12 47 19 50 30C53 19 62 12 74 18C98 30 92 62 50 92Z',
  };
  const EMOJI = ['⭐', '❤️', '🌈', '🌸', '🍀', '☀️', '🌙', '🎈', '🎉', '🐱', '🐶', '🦋', '📚', '✏️', '🏆', '😀', '😍', '👍', '🎵', '🍎', '🚀', '🌟'];
  const BG_COLOR = { white: '#ffffff', cream: '#fbf5e6', kraft: '#cdaa7d', mint: '#dff3e6', sky: '#dcecff', blush: '#ffe3ea', dots: '#fffdf5', grid: '#ffffff', lined: '#fffef8' };
  const MONTH_KEY = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const MONTH_LABEL = (key, locale) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' }); };

  // One live instance per mount — this module is only ever mounted once at a time (one widget, one tab).
  function mount(pane, childId, db) {
    let alive = true, book = null, pageId = null, view = 'page', sel = null, scale = 1, saveTimer = null;
    const assetCache = {};   // assetId -> dataUrl, populated as needed

    function locale() { return (typeof LOCALE_MAP !== 'undefined' && LOCALE_MAP[ui.lang]) || 'en-US'; }
    function curPage() { return book.pages[pageId]; }
    function uid(p) { return C.uid(p); }

    async function ensureMonthPage() {
      const key = MONTH_KEY(new Date());
      if (!book.pages[key]) {
        const p = C.newPage('cream'); p.id = key;   // no title: pageTitle() falls back to MONTH_LABEL(id) for a month page
        book.pages[key] = p; book.pageOrder.push(key);
      }
      if (!pageId || !book.pages[pageId]) pageId = key;
    }

    async function loadBook() {
      let b = await db.getBook();
      if (!b || !b.pageOrder || !b.pageOrder.length) {
        // validateBook refuses to accept an empty pageOrder — it adds its own blank page as a safety net
        // (every book must have at least one page) — so build the real month page up front instead of
        // stripping newBook()'s auto-created page and handing validateBook nothing to replace it with.
        b = C.newBook('My scrapbook'); b.id = childId;
        delete b.pages[b.pageOrder[0]];
        const p = C.newPage('cream'); p.id = MONTH_KEY(new Date());
        b.pages[p.id] = p; b.pageOrder = [p.id];
      }
      const v = C.validateBook(b); book = v.book; book.id = childId;
      await ensureMonthPage();
    }
    function commit() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { saveTimer = null; book.updated = Date.now(); db.putBook(book).catch(() => toast(t('dd_save_fail'))); }, 500);
    }

    async function assetUrl(assetId) {
      if (assetCache[assetId]) return assetCache[assetId];
      const a = await db.getAsset(assetId);
      if (a && a.dataUrl) { assetCache[assetId] = a.dataUrl; return a.dataUrl; }
      return null;
    }
    async function preloadPagePhotos() {
      const ids = curPage().items.filter(i => i.type === 'photo').map(i => i.assetId);
      await Promise.all(ids.map(assetUrl));
    }

    /* ---------- geometry/DOM (mirrors studentdeck/js/scrapdeck.js's own pattern) ---------- */
    function pagePt(ev) { const r = pane.querySelector('.kd-scrap-page').getBoundingClientRect(); return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale }; }
    function gesture(ev, onMove, onEnd) {
      const page = pane.querySelector('.kd-scrap-page'); try { page.setPointerCapture(ev.pointerId); } catch (e) { }
      let moved = false;
      const mv = e => { moved = true; onMove(e); };
      const up = () => { page.removeEventListener('pointermove', mv); page.removeEventListener('pointerup', up); page.removeEventListener('pointercancel', up); try { page.releasePointerCapture(ev.pointerId); } catch (e) { } if (moved) onEnd(); };
      page.addEventListener('pointermove', mv); page.addEventListener('pointerup', up); page.addEventListener('pointercancel', up);
    }
    function applyGeom(el, it) {
      el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; el.style.width = it.w + 'px'; el.style.height = it.h + 'px'; el.style.transform = 'rotate(' + (it.rot || 0) + 'deg)'; el.style.zIndex = it.z || 1;
      if (it.type === 'sticker' && it.glyph) el.style.fontSize = Math.round(Math.min(it.w, it.h) * 0.8) + 'px';
    }
    function fillItem(el, it) {
      el.className = 'kd-scrap-it kd-scrap-' + it.type + (sel === it.id ? ' picked' : '');
      if (it.type === 'photo') {
        el.textContent = ''; el.classList.add('kd-scrap-f-' + (it.frame || 'plain'));
        const url = assetCache[it.assetId];
        if (url) { const im = document.createElement('img'); im.src = url; im.draggable = false; el.appendChild(im); }
        else el.textContent = '…';
      } else if (it.type === 'text') {
        el.textContent = it.text; el.style.fontFamily = it.font === 'hand' ? '"Comic Sans MS","Segoe Print",cursive' : (it.font === 'serif' ? 'Georgia,serif' : 'inherit'); el.style.fontSize = it.size + 'px'; el.style.color = it.color; el.style.textAlign = it.align;
      } else if (it.type === 'sticker') {
        el.textContent = it.glyph || '';
      } else if (it.type === 'shape') {
        el.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' + SHAPE_PATH[it.kind] + '" fill="' + it.fill + '" stroke="' + it.stroke + '" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>';
      }
    }
    function makeItemEl(it) {
      const el = document.createElement('div'); el.dataset.id = it.id; el.tabIndex = 0;
      applyGeom(el, it); fillItem(el, it); return el;
    }
    function refreshItem(it) { const el = pane.querySelector('.kd-scrap-it[data-id="' + it.id + '"]'); if (el) { applyGeom(el, it); fillItem(el, it); } }

    function startDrag(ev, it) {
      const p0 = pagePt(ev), x0 = it.x, y0 = it.y, el = pane.querySelector('.kd-scrap-it[data-id="' + it.id + '"]');
      gesture(ev, e => { const p = pagePt(e); const k = C.keepInPage({ x: x0 + p.x - p0.x, y: y0 + p.y - p0.y, w: it.w, h: it.h, rot: it.rot }); it.x = k.x; it.y = k.y; applyGeom(el, it); }, commit);
    }
    function startHandle(ev, it, kind) {
      ev.preventDefault(); ev.stopPropagation();
      const start = { x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot }, el = pane.querySelector('.kd-scrap-it[data-id="' + it.id + '"]'), keep = it.type === 'photo' || it.type === 'sticker';
      gesture(ev, e => {
        const p = pagePt(e);
        if (kind === 'rot') it.rot = C.round(C.rotationFromPointer(it, p.x, p.y, e.shiftKey ? 15 : 0), 2);
        else { const g = C.resizeFromCorner(start, kind, p.x, p.y, { keepAspect: keep !== e.shiftKey }); it.x = g.x; it.y = g.y; it.w = g.w; it.h = g.h; }
        applyGeom(el, it);
      }, () => { commit(); paintSel(); });
    }

    function select(id) { sel = id; pane.querySelectorAll('.kd-scrap-it').forEach(n => n.classList.toggle('picked', n.dataset.id === id)); paintSel(); paintToolbar(); }
    function selItem() { return sel ? curPage().items.find(i => i.id === sel) : null; }
    function paintSel() {
      const old = pane.querySelector('.kd-scrap-handles'); if (old) old.remove();
      const it = selItem(); if (!it) return;
      const wrap = document.createElement('div'); wrap.className = 'kd-scrap-handles';
      wrap.style.left = it.x + 'px'; wrap.style.top = it.y + 'px'; wrap.style.width = it.w + 'px'; wrap.style.height = it.h + 'px'; wrap.style.transform = 'rotate(' + (it.rot || 0) + 'deg)';
      ['nw', 'ne', 'se', 'sw'].forEach(k => { const h = document.createElement('div'); h.className = 'kd-scrap-h kd-scrap-h-' + k; h.dataset.h = k; wrap.appendChild(h); });
      const rot = document.createElement('div'); rot.className = 'kd-scrap-h kd-scrap-h-rot'; rot.dataset.h = 'rot'; wrap.appendChild(rot);
      pane.querySelector('.kd-scrap-page').appendChild(wrap);
    }

    /* ---------- adding items ---------- */
    function addItem(raw) {
      const z = C.nextZ(curPage().items), it = C.sanitizeItem(Object.assign({ id: uid('it'), z }, raw));
      if (!it) return null;
      curPage().items.push(it); commit(); return it;
    }
    function addText() {
      const it = addItem({ type: 'text', text: t('kd_text_ph'), x: PAGE_W / 2 - 150, y: PAGE_H / 2 - 30, w: 300, h: 60, size: 32, font: 'hand', color: '#222222', align: 'center' });
      if (it) { paintPage(); select(it.id); }
    }
    function addSticker(glyph) {
      const it = addItem({ type: 'sticker', glyph, x: PAGE_W / 2 - 50, y: PAGE_H / 2 - 50, w: 100, h: 100 });
      if (it) { paintPage(); select(it.id); }
    }
    function addShape(kind) {
      const it = addItem({ type: 'shape', kind, fill: '#ffd166', stroke: '#222222', x: PAGE_W / 2 - 80, y: PAGE_H / 2 - 80, w: 160, h: 160 });
      if (it) { paintPage(); select(it.id); }
    }
    async function addPhotoFile(file) {
      if (!file || !/^image\//.test(file.type)) return;
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const fit = C.fitLongEdge(im.naturalWidth, im.naturalHeight, 1600);
      const cv = document.createElement('canvas'); cv.width = fit.w; cv.height = fit.h; cv.getContext('2d').drawImage(im, 0, 0, fit.w, fit.h);
      const dataUrl = cv.toDataURL('image/jpeg', C.LIMITS.jpegQuality);
      const assetId = uid('as');
      await db.putAsset({ id: assetId, dataUrl, w: fit.w, h: fit.h });
      assetCache[assetId] = dataUrl;
      const box = C.fitInto(fit.w, fit.h, 420, 420);
      const it = addItem({ type: 'photo', assetId, frame: 'plain', x: PAGE_W / 2 - box.w / 2, y: PAGE_H / 2 - box.h / 2, w: box.w, h: box.h });
      if (it) { paintPage(); select(it.id); }
    }
    function deleteSel() { if (!sel) return; curPage().items = curPage().items.filter(i => i.id !== sel); sel = null; commit(); paintPage(); }
    function duplicateSel() {
      const it = selItem(); if (!it) return;
      const copy = C.sanitizeItem(Object.assign({}, it, { id: uid('it'), x: it.x + 24, y: it.y + 24, z: C.nextZ(curPage().items) }));
      if (copy) { curPage().items.push(copy); commit(); paintPage(); select(copy.id); }
    }
    function tidy() {
      const patches = C.tidyGrid(curPage().items);
      const byId = new Map(curPage().items.map(i => [i.id, i]));
      patches.forEach(p => { const i = byId.get(p.id); if (i) { i.x = p.x; i.y = p.y; } });
      commit(); paintPage();
    }

    /** Drops a rendered scrap PNG onto today's (this month's) page, into THIS mount's own in-memory book —
     * the safe path when the Scrapbook tab is open; see saveScrap() below for when it isn't. */
    async function addScrap(pngBlob, w, h) {
      const assetId = uid('as'), dataUrl = await blobToDataUrl(pngBlob);
      await db.putAsset({ id: assetId, dataUrl, w, h });
      const key = MONTH_KEY(new Date());
      if (!book.pages[key]) { const p = C.newPage('cream'); p.id = key; book.pages[key] = p; book.pageOrder.push(key); }
      const pg = book.pages[key], box = C.fitInto(w, h, 420, 420 * (h / w));
      const z = C.nextZ(pg.items);
      const it = C.sanitizeItem({ id: uid('it'), type: 'photo', assetId, frame: 'polaroid', x: 40 + ((pg.items.length * 36) % (PAGE_W - 460)), y: 40 + ((pg.items.length * 24) % (PAGE_H - 460)), w: box.w, h: box.h, z });
      if (it) pg.items.push(it);
      book.updated = Date.now();
      await db.putBook(book);
      if (alive && pageId === key) paintPage();
    }
    function blobToDataUrl(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); }); }

    /* ---------- pages / year view ---------- */
    function pageTitle(pg) { return pg.title || MONTH_LABEL(pg.id, locale()); }
    function addFreePage() {
      const name = prompt(t('kd_new_page_ask'), ''); if (!name || !name.trim()) return;
      const p = C.newPage('cream', null, name.trim());
      book.pages[p.id] = p; book.pageOrder.push(p.id); pageId = p.id; commit(); paintPage();
    }
    function deletePage() {
      if (book.pageOrder.length <= 1) return;
      if (!confirm(t('kd_del_page_q'))) return;
      book.pageOrder = book.pageOrder.filter(id => id !== pageId); delete book.pages[pageId];
      pageId = book.pageOrder[book.pageOrder.length - 1]; commit(); paintPage();
    }
    function gotoPage(id) { pageId = id; sel = null; view = 'page'; paintPage(); }

    /* ---------- paint ---------- */
    async function paintPage() {
      if (!alive) return;
      await preloadPagePhotos();
      const pg = curPage(), items = pg.items.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
      pane.innerHTML = `<div class="kd-scrap-bar">
          <select class="kd-scrap-pagesel">${book.pageOrder.map(id => `<option value="${esc(id)}"${id === pageId ? ' selected' : ''}>${esc(pageTitle(book.pages[id]))}</option>`).join('')}</select>
          <button type="button" class="btn sm" data-ks="newpage">${esc(t('kd_new_page'))}</button>
          <button type="button" class="btn sm" data-ks="year">${esc(t('kd_year'))}</button>
          <span class="kd-scrap-sp"></span>
          <button type="button" class="btn sm" data-ks="addtext">${esc(t('kd_add_text'))}</button>
          <button type="button" class="btn sm" data-ks="addsticker">${esc(t('kd_add_sticker'))}</button>
          <button type="button" class="btn sm" data-ks="addshape">${esc(t('kd_add_shape'))}</button>
          <button type="button" class="btn sm" data-ks="addphoto">${esc(t('kd_add_photo'))}</button>
          <button type="button" class="btn sm" data-ks="tidy">${esc(t('kd_tidy'))}</button>
          ${sel ? `<button type="button" class="btn sm" data-ks="dup">${esc(t('kd_duplicate'))}</button><button type="button" class="btn sm" data-ks="del">${esc(t('kd_delete'))}</button>` : ''}
          <span class="kd-scrap-sp"></span>
          <button type="button" class="btn sm" data-ks="delpage"${book.pageOrder.length <= 1 ? ' disabled' : ''}>${esc(t('kd_del_page'))}</button>
        </div>
        <div class="kd-scrap-wrap"><div class="kd-scrap-page kd-scrap-bg-${pg.bg}" style="width:${PAGE_W}px;height:${PAGE_H}px;background:${BG_COLOR[pg.bg] || '#fff'}">
          ${items.length ? '' : `<p class="kd-scrap-empty muted">${esc(t('kd_page_empty'))}</p>`}
        </div></div>
        <input type="file" class="kd-scrap-file" accept="image/*" hidden>`;
      const pageEl = pane.querySelector('.kd-scrap-page');
      items.forEach(it => pageEl.appendChild(makeItemEl(it)));
      fitScale(); paintSel(); wireEvents();
    }
    function fitScale() {
      const wrapEl = pane.querySelector('.kd-scrap-wrap'); if (!wrapEl) return;
      const avail = wrapEl.clientWidth - 24;
      scale = Math.max(0.2, Math.min(1, avail / PAGE_W));
      pane.querySelector('.kd-scrap-page').style.transform = 'scale(' + scale + ')';
    }
    function paintToolbar() { paintPage(); }   // re-render is cheap enough at scrapbook scale; keeps selection-dependent buttons in sync
    function paintYear() {
      if (!alive) return;
      const byMonth = book.pageOrder.filter(id => /^\d{4}-\d{2}$/.test(id));
      const free = book.pageOrder.filter(id => !/^\d{4}-\d{2}$/.test(id));
      const card = id => `<button type="button" class="kd-scrap-cover" data-ks="goto" data-id="${esc(id)}"><b>${esc(pageTitle(book.pages[id]))}</b><span>${esc(t('kd_items_n', { n: book.pages[id].items.length }))}</span></button>`;
      pane.innerHTML = `<div class="kd-scrap-bar"><button type="button" class="btn sm" data-ks="backtopage">${esc(t('kd_year_back'))}</button></div>
        <div class="kd-scrap-yearwrap"><div class="kd-scrap-year">${byMonth.map(card).join('')}</div>
        ${free.length ? `<h4>${esc(t('kd_new_page'))}</h4><div class="kd-scrap-year">${free.map(card).join('')}</div>` : ''}</div>`;
      wireEvents();
    }

    function wireEvents() {
      pane.onclick = e => {
        const ks = e.target.closest('[data-ks]'); if (!ks) return;
        const a = ks.dataset.ks;
        if (a === 'newpage') addFreePage();
        else if (a === 'year') { view = 'year'; paintYear(); }
        else if (a === 'backtopage') { view = 'page'; paintPage(); }
        else if (a === 'goto') gotoPage(ks.dataset.id);
        else if (a === 'addtext') addText();
        else if (a === 'addsticker') openStickerPicker(ks);
        else if (a === 'addshape') openShapePicker(ks);
        else if (a === 'addphoto') pane.querySelector('.kd-scrap-file').click();
        else if (a === 'tidy') tidy();
        else if (a === 'dup') duplicateSel();
        else if (a === 'del') deleteSel();
        else if (a === 'delpage') deletePage();
      };
      const sel2 = pane.querySelector('.kd-scrap-pagesel'); if (sel2) sel2.onchange = () => gotoPage(sel2.value);
      const fileEl = pane.querySelector('.kd-scrap-file'); if (fileEl) fileEl.onchange = () => { if (fileEl.files[0]) addPhotoFile(fileEl.files[0]); fileEl.value = ''; };
      const pageEl = pane.querySelector('.kd-scrap-page'); if (!pageEl) return;
      pageEl.addEventListener('pointerdown', e => {
        const itEl = e.target.closest('.kd-scrap-it'), handle = e.target.closest('.kd-scrap-h');
        if (handle) { const it = selItem(); if (it) startHandle(e, it, handle.dataset.h); return; }
        if (itEl) { const it = curPage().items.find(i => i.id === itEl.dataset.id); if (it) { select(it.id); startDrag(e, it); } return; }
        select(null);
      });
    }
    function openStickerPicker(anchor) {
      const menu = document.createElement('div'); menu.className = 'kd-scrap-menu';
      menu.innerHTML = EMOJI.map(g => `<button type="button" data-g="${g}">${g}</button>`).join('');
      document.body.appendChild(menu);
      const r = anchor.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 4) + 'px';
      menu.onclick = e => { const b = e.target.closest('button'); if (b) addSticker(b.dataset.g); menu.remove(); };
      setTimeout(() => document.addEventListener('click', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', off); } }), 0);
    }
    function openShapePicker(anchor) {
      const menu = document.createElement('div'); menu.className = 'kd-scrap-menu';
      menu.innerHTML = Object.keys(SHAPE_PATH).map(k => `<button type="button" data-k="${k}"><svg viewBox="0 0 100 100" width="20" height="20"><path d="${SHAPE_PATH[k]}" fill="#ffd166" stroke="#222"/></svg></button>`).join('');
      document.body.appendChild(menu);
      const r = anchor.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 4) + 'px';
      menu.onclick = e => { const b = e.target.closest('button'); if (b) addShape(b.dataset.k); menu.remove(); };
      setTimeout(() => document.addEventListener('click', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', off); } }), 0);
    }

    pane.innerHTML = `<p class="muted" style="padding:14px">${esc(t('kd_loading'))}</p>`;
    loadBook().then(() => { if (!alive) return; liveMounts.set(childId, { addScrap }); paintPage(); });

    return () => {
      alive = false; liveMounts.delete(childId); pane.onclick = null;
      if (saveTimer) { clearTimeout(saveTimer); book.updated = Date.now(); db.putBook(book).catch(() => { }); }
    };
  }

  /** The entry point keepdeck-render.js (and anything else in ParentDeck) uses to drop a rendered scrap PNG
   * onto the child's Scrapbook — works whether or not the Scrapbook tab is currently open. `db` is a
   * KeepDeckDB.forChild(childId) wrapper (js/keepdeck.js). */
  async function saveScrap(childId, db, pngBlob, w, h) {
    const live = liveMounts.get(childId);
    if (live) { await live.addScrap(pngBlob, w, h); return; }
    let b = await db.getBook();
    if (!b || !b.pageOrder || !b.pageOrder.length) {
      // Same fix as loadBook() above: validateBook won't accept an empty pageOrder (it adds its own blank
      // page), so build the real month page up front rather than stripping newBook()'s and leaving nothing.
      b = C.newBook('My scrapbook'); b.id = childId;
      delete b.pages[b.pageOrder[0]];
      const p0 = C.newPage('cream'); p0.id = MONTH_KEY(new Date());
      b.pages[p0.id] = p0; b.pageOrder = [p0.id];
    }
    const book = C.validateBook(b).book; book.id = childId;
    const assetId = C.uid('as'), dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(pngBlob); });
    await db.putAsset({ id: assetId, dataUrl, w, h });
    const key = MONTH_KEY(new Date());
    if (!book.pages[key]) { const p = C.newPage('cream'); p.id = key; book.pages[key] = p; book.pageOrder.push(key); }
    const pg = book.pages[key], box = C.fitInto(w, h, 420, 420 * (h / w)), z = C.nextZ(pg.items);
    const it = C.sanitizeItem({ id: C.uid('it'), type: 'photo', assetId, frame: 'polaroid', x: 40 + ((pg.items.length * 36) % (PAGE_W - 460)), y: 40 + ((pg.items.length * 24) % (PAGE_H - 460)), w: box.w, h: box.h, z });
    if (it) pg.items.push(it);
    book.updated = Date.now();
    await db.putBook(book);
  }

  return { mount, saveScrap };
})();

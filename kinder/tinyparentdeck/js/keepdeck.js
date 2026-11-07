/* ============================================================
   KeepDeck (ParentDeck) — two tabs for a linked child: a Home board (built on the SAME DrawDeck canvas
   engine as TeachersDeck, js/drawdeck-engine.js, kept byte-identical to TeachersDeck's js/drawdeck.js by
   tools/check_shared.py — Kid Mode on, see drawdeck-engine.js's own header comment for what `host.kidMode`/
   `host.kidModeUnlock` do) and a Scrapbook (js/keepdeck-scrap.js, built on the SAME ScrapCore page-layout
   engine as StudentDeck's Scrapdeck, js/scrapdeck-core.js, also kept byte-identical by check_shared.py).

   This file owns: the tab shell (kdPaint below), the Home board tab itself, the shared IndexedDB wrapper
   both tabs use (KeepDeckDB), the parent-unlock challenge, and the Home board's free-tier board cap.
   js/keepdeck-scrap.js owns the Scrapbook tab's own UI. js/keepdeck-render.js draws the PNG "scraps" the
   five other ParentDeck widgets save into it (Badge Display Case, Reward Points, Rewards Wishlist, Progress
   Reports, Weekly Digest, Notes from teacher).

   Storage: everything lives in THIS deck's own IndexedDB ("ParentDeckKeepDeck" — "boards" for Home board,
   "books"/"assets" for Scrapbook), never shared with TeachersDeck's, StudentDeck's or the standalone web
   page's own databases. Every record is tagged with childId so one database holds every linked child's data
   without mixing it — KeepDeckDB.forChild(id) filters to the current child before handing anything to
   DrawDeck.mount() or keepdeck-scrap.js; neither of those is ever told about childId directly.
   Free tier: KD_FREE_BOARD_LIMIT Home boards per child (enforced here, not in the shared engine, by
   intercepting the "new board" click before it reaches the engine's own handler — see kdInstallBoardCap).
   ============================================================ */
const KD_STRINGS = {
  w_keepdeck: { en: '🖍️ KeepDeck', vi: '🖍️ KeepDeck' },
  wc_keepdeck: { en: 'A home drawing board and scrapbook you and your child share — stays on this device, no school data.', vi: 'Bảng vẽ và sổ lưu niệm ở nhà bạn và con cùng dùng — chỉ lưu trên thiết bị này, không liên quan dữ liệu trường học.' },
  kd_tab_home: { en: 'Home board', vi: 'Bảng vẽ ở nhà' },
  kd_tab_scrap: { en: 'Scrapbook', vi: 'Sổ lưu niệm' },
  kd_limit: { en: 'Free plan: {n} boards per child. Delete one to make room, or upgrade to Pro.', vi: 'Gói miễn phí: {n} bảng vẽ cho mỗi con. Hãy xóa một bảng, hoặc nâng cấp Pro.' },
  kd_unlock_title: { en: 'Parents only', vi: 'Chỉ dành cho phụ huynh' },
  kd_unlock_q: { en: 'What is {a} + {b}?', vi: '{a} + {b} bằng mấy?' },
  kd_unlock_wrong: { en: 'Not quite — try again.', vi: 'Chưa đúng — thử lại nhé.' },
  kd_unlock_go: { en: 'Unlock', vi: 'Mở khóa' },
  kd_unlock_cancel: { en: 'Cancel', vi: 'Hủy' },
};

const KD_FREE_BOARD_LIMIT = 2;

/* ---- a small IndexedDB wrapper, shared by the Home board and the Scrapbook, filtered to the current
   child before anything reaches either tab's own code. "boards" uses the same getAll/put/delete method
   shape DrawDeck's host.idb expects (same pattern as teachersdeck/web/web.js's standalone wrapper, since
   ParentDeck has no idb object of its own to extend); "books" (one per child, keyed directly by childId —
   ScrapCore.newBook()'s own generated id is overwritten on save) and "assets" (an item's photo blob, keyed
   by its own id) are keepdeck-scrap.js's and keepdeck-render.js's storage. ---- */
const KeepDeckDB = (function () {
  const BOARDS = 'boards', BOOKS = 'books', ASSETS = 'assets';
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('indexedDB unavailable')); return; }
      const req = indexedDB.open('ParentDeckKeepDeck', 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(BOARDS)) db.createObjectStore(BOARDS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS, { keyPath: 'id' });
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e.target && e.target.error ? e.target.error : e);
    });
    return dbp;
  }
  function tx(store, mode) { return open().then(db => db.transaction(store, mode).objectStore(store)); }
  function wrap(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
  // One wrapper per mount, scoped to one child. `knownIds` (boards only) is kept in sync on every call so
  // the board-cap check (kdInstallBoardCap) can be synchronous — it has to run inside a click handler,
  // before the engine's own (also synchronous) handler for the same click.
  function forChild(childId) {
    let knownIds = null;
    function ensure() {
      if (knownIds) return Promise.resolve(knownIds);
      return tx(BOARDS, 'readonly').then(os => wrap(os.getAll())).then(all => {
        knownIds = new Set((all || []).filter(b => b && b.childId === childId).map(b => b.id)); return knownIds;
      });
    }
    return {
      // ---- boards (DrawDeck's host.idb shape — `store` is always the literal 'boards' the engine passes) ----
      getAll: store => tx(store, 'readonly').then(os => wrap(os.getAll())).then(all => {
        const mine = (all || []).filter(b => b && b.childId === childId);
        if (store === BOARDS) knownIds = new Set(mine.map(b => b.id));
        return mine;
      }),
      put: (store, val) => tx(store, 'readwrite').then(os => wrap(os.put(Object.assign({}, val, { childId })))).then(() => { if (store === BOARDS && knownIds) knownIds.add(val.id); }),
      delete: (store, id) => tx(store, 'readwrite').then(os => wrap(os.delete(id))).then(() => { if (knownIds) knownIds.delete(id); }),
      count: () => ensure().then(ids => ids.size),
      knownCount: () => knownIds ? knownIds.size : 0,   // best-effort sync read — accurate once the engine's own init() has run getAll()
      // ---- book (one per child) + assets (a photo item's blob) — keepdeck-scrap.js / keepdeck-render.js ----
      getBook: () => tx(BOOKS, 'readonly').then(os => wrap(os.get(childId))),
      putBook: book => tx(BOOKS, 'readwrite').then(os => wrap(os.put(Object.assign({}, book, { id: childId, childId })))),
      getAsset: assetId => tx(ASSETS, 'readonly').then(os => wrap(os.get(assetId))),
      putAsset: asset => tx(ASSETS, 'readwrite').then(os => wrap(os.put(Object.assign({}, asset, { childId })))),
      deleteAsset: assetId => tx(ASSETS, 'readwrite').then(os => wrap(os.delete(assetId))),
    };
  }
  return { forChild };
})();

/* ---- the parent-unlock challenge: a simple sum, in its own overlay (DrawDeck's own .dd-modal is for its
   math-tool dialogs, already closed over inside mount() — not something a host hook can reuse). ---- */
function kdUnlockChallenge() {
  return new Promise(resolve => {
    const a = 2 + Math.floor(Math.random() * 7), b = 2 + Math.floor(Math.random() * 7);
    const ov = document.createElement('div');
    ov.className = 'kd-unlock-ov';
    ov.innerHTML = `<div class="kd-unlock-card">
        <h3>${esc(t('kd_unlock_title'))}</h3>
        <p>${esc(t('kd_unlock_q', { a, b }))}</p>
        <input type="number" inputmode="numeric" class="kd-unlock-input" autofocus>
        <p class="kd-unlock-err muted" hidden>${esc(t('kd_unlock_wrong'))}</p>
        <div class="kd-unlock-btns">
          <button type="button" class="btn" data-kd="cancel">${esc(t('kd_unlock_cancel'))}</button>
          <button type="button" class="btn primary" data-kd="go">${esc(t('kd_unlock_go'))}</button>
        </div></div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector('.kd-unlock-input'), err = ov.querySelector('.kd-unlock-err');
    function done(ok) { ov.remove(); resolve(ok); }
    function tryAnswer() { if (+input.value === a + b) done(true); else { err.hidden = false; input.value = ''; input.focus(); } }
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('[data-kd="cancel"]')) done(false);
      else if (e.target.closest('[data-kd="go"]')) tryAnswer();
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryAnswer(); });
    setTimeout(() => input.focus(), 30);
  });
}

/* ---- the Free-tier board cap: a capture-phase listener fires before DrawDeck's own (bubble-phase, on
   .dd-root) click handler for the exact same click, so it can refuse "new board" before the engine ever
   sees it — zero engine changes needed. ---- */
function kdInstallBoardCap(body, db) {
  function onCapture(e) {
    const el = e.target.closest && e.target.closest('[data-act="newboard"]'); if (!el) return;
    if (db.knownCount() >= KD_FREE_BOARD_LIMIT) { e.preventDefault(); e.stopImmediatePropagation(); toast(t('kd_limit', { n: KD_FREE_BOARD_LIMIT })); }
  }
  body.addEventListener('click', onCapture, true);
  return () => body.removeEventListener('click', onCapture, true);
}

// The Home board tab: identical host wiring to Step A, just mounted into a pane instead of the whole body.
function kdMountHome(pane, id, db) {
  const uninstallCap = kdInstallBoardCap(pane, db);
  const cleanupEngine = DrawDeck.mount(pane, {
    t, toast,
    close: () => closeWidget('keepdeck'),
    idb: db,
    lang: ui.lang,
    watermark: (typeof Watermark !== 'undefined') ? Watermark : null,
    download: (blob, name) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
    kidMode: true,
    kidModeUnlock: kdUnlockChallenge,
    // No cloudClassId/share/stopShare/assignBoard: DrawDeck's own canShare()/canAssign() checks already
    // hide those menu items with no cloud class — KeepDeck boards never touch the school's data at all.
  });
  return () => { uninstallCap(); if (cleanupEngine) cleanupEngine(); };
}

function renderKeepDeck(body) {
  return widgetGate(body, id => {
    body.classList.add('kd-body');   // establishes the flex-column chain .kd-tabs/.kd-pane rely on (css/style.css)
    const db = KeepDeckDB.forChild(id);
    let tab = 'home', cleanupTab = null;
    function paint() {
      if (cleanupTab) { cleanupTab(); cleanupTab = null; }
      body.innerHTML = `<div class="kd-tabs" role="tablist">
          <button type="button" class="kd-tab${tab === 'home' ? ' on' : ''}" role="tab" aria-selected="${tab === 'home'}" data-kdtab="home">${esc(t('kd_tab_home'))}</button>
          <button type="button" class="kd-tab${tab === 'scrap' ? ' on' : ''}" role="tab" aria-selected="${tab === 'scrap'}" data-kdtab="scrap">${esc(t('kd_tab_scrap'))}</button>
        </div><div class="kd-pane"></div>`;
      body.querySelectorAll('[data-kdtab]').forEach(b => { b.onclick = () => { if (tab !== b.dataset.kdtab) { tab = b.dataset.kdtab; paint(); } }; });
      const pane = body.querySelector('.kd-pane');
      cleanupTab = tab === 'home' ? kdMountHome(pane, id, db) : KeepDeckScrap.mount(pane, id, db);
    }
    paint();
    return () => { if (cleanupTab) cleanupTab(); };
  });
}

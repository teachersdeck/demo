/* DrawDeck — standalone web page (DrawDeck scope step F, "free web version"): the SAME js/drawdeck.js and
   css/drawdeck.css as the TeachersDeck Chrome extension, loaded directly (see index.html) — this file is
   only the glue: a minimal `host` (t, toast, idb, download; no cloud class, so Share/Assign never show —
   DrawDeck.mount()'s own canShare()/canAssign() checks already handle a missing host.cloudClassId), a
   plain translator reading DrawDeck's own exported strings table, and the acquisition banner.
   Boards save in THIS PAGE's OWN IndexedDB ("DrawDeckWeb", separate from the extension's "TeachersDeck"
   DB) — a board started here never silently merges with, or is overwritten by, the extension. */
(function () {
  'use strict';

  // TODO: point this at the real Chrome Web Store listing once TeachersDeck is published there.
  var OPEN_IN_TEACHERSDECK_URL = 'https://chrome.google.com/webstore/';

  var lang = (navigator.language || 'en').slice(0, 2);
  function t(key, vars) {
    var entry = (window.DrawDeck && window.DrawDeck.strings && window.DrawDeck.strings[key]) || null;
    var str = (entry && (entry[lang] || entry.en)) || key;
    if (vars) { Object.keys(vars).forEach(function (k) { str = str.replace('{' + k + '}', vars[k]); }); }
    return str;
  }

  var toastEl = document.createElement('div'); toastEl.className = 'web-toast'; document.body.appendChild(toastEl);
  var toastTimer = 0;
  function toast(msg, ms) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 3000);
  }

  // ---- a small IndexedDB wrapper, same method shape DrawDeck expects (getAll/put/delete), one store ----
  var STORE = 'boards';
  var idb = (function () {
    var dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        if (typeof indexedDB === 'undefined') { reject(new Error('indexedDB unavailable')); return; }
        var req = indexedDB.open('DrawDeckWeb', 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' }); // empty; DrawDeck's "pictures from Files" menu just finds nothing here
        };
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function (e) { reject(e.target && e.target.error ? e.target.error : e); };
      });
      return dbp;
    }
    function tx(store, mode) { return open().then(function (db) { return db.transaction(store, mode).objectStore(store); }); }
    return {
      getAll: function (store) { return tx(store, 'readonly').then(function (os) { return new Promise(function (res, rej) { var r = os.getAll(); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }); },
      put: function (store, val) { return tx(store, 'readwrite').then(function (os) { return new Promise(function (res, rej) { var r = os.put(val); r.onsuccess = function () { res(); }; r.onerror = function () { rej(r.error); }; }); }); },
      delete: function (store, id) { return tx(store, 'readwrite').then(function (os) { return new Promise(function (res, rej) { var r = os.delete(id); r.onsuccess = function () { res(); }; r.onerror = function () { rej(r.error); }; }); }); },
    };
  })();

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  // ---- the acquisition banner ----
  var openBtn = document.getElementById('open-in-teachersdeck');
  if (openBtn) openBtn.href = OPEN_IN_TEACHERSDECK_URL;
  var banner = document.getElementById('dd-banner'), closeBtn = document.getElementById('banner-close');
  if (closeBtn) closeBtn.addEventListener('click', function () { banner.classList.add('hidden'); try { localStorage.setItem('ddweb_banner_hidden', '1'); } catch (e) { } });
  try { if (localStorage.getItem('ddweb_banner_hidden') === '1') banner.classList.add('hidden'); } catch (e) { }

  // ---- mount DrawDeck. No cloudClassId/share/stopShare/assignBoard: DrawDeck's own canShare()/canAssign()
  // checks already hide those menu items when host.cloudClassId is missing — nothing else to gate here. ----
  window.DrawDeck.mount(document.getElementById('dd-root'), {
    t: t, toast: toast, idb: idb, download: download, watermark: null,
  });
})();

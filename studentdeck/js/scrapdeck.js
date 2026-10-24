/* Scrapdeck (StudentDeck v0.12.0): a scrapbook widget.
   A student builds pages on a free-form canvas: photos from their own computer, text, stickers and shapes, then drags, resizes and rotates them into place.
   Everything stays on this computer. Photos and scrapbooks live in their own IndexedDB database, `StudentDeckScrap` (books, assets, packs), NOT in
   `StudentDeck`: bumping that version would block Files while another StudentDeck tab is open. Only a tiny index lives in `state.scrap`.
   Pure logic (geometry, undo, validation, XP rule, school policy) is in js/scrapdeck-core.js and is tested under Node (tools/test_scrapdeck.js).
   This file is the DOM side. It is wrapped in a function so it adds one global, renderScrapdeck, and cannot clash with app.js.
   It uses these app.js globals at run time (never while loading): state, save, toast, esc, dayKey, awardXP, SD_DEMO, SDCloud, Watermark. */
(function () {
  'use strict';
  const C = window.ScrapCore, PAGE_W = C.PAGE_W, PAGE_H = C.PAGE_H;

  /* ---------- look-up tables ---------- */
  const FONT = {
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, Menlo, Consolas, monospace', hand: '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive'
  };
  const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  const BG = {   // base colour, optional pattern [kind, colour]
    white: ['#ffffff'], cream: ['#fbf5e6'], kraft: ['#cdaa7d'], mint: ['#dff3e6'], sky: ['#dcecff'], blush: ['#ffe3ea'],
    dots: ['#fffdf5', 'dots', '#c9c2a8'], grid: ['#ffffff', 'grid', '#cfd8e8'], lined: ['#fffef8', 'lined', '#bcd0ea']
  };
  const BG_NAME = { white: 'Plain white', cream: 'Cream', kraft: 'Kraft paper', mint: 'Mint', sky: 'Sky', blush: 'Blush', dots: 'Dots', grid: 'Grid', lined: 'Lined' };
  const SHAPE_PATH = {   // all drawn in a 0..100 box and stretched, so the screen (SVG) and the exported picture (canvas) use the same path
    rect: 'M0 0H100V100H0Z',
    round: 'M18 0H82Q100 0 100 18V82Q100 100 82 100H18Q0 100 0 82V18Q0 0 18 0Z',
    circle: 'M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z',
    triangle: 'M50 0L100 100H0Z',
    star: 'M50 3L62 37L98 38L69 60L80 96L50 74L20 96L31 60L2 38L38 37Z',
    heart: 'M50 92C8 62 2 30 26 18C38 12 47 19 50 30C53 19 62 12 74 18C98 30 92 62 50 92Z'
  };
  const SHAPE_NAME = { rect: 'Square', round: 'Rounded', circle: 'Circle', triangle: 'Triangle', star: 'Star', heart: 'Heart' };
  const PALETTE = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#c77dff', '#ff9f1c'];
  const EMOJI = ['⭐', '❤️', '🌈', '🌸', '🍀', '☀️', '🌙', '🎈', '🎉', '🐱', '🐶', '🦋', '📚', '✏️', '🏆', '😀', '😍', '👍', '🎵', '🍎', '🚀', '🌟', '🎨', '📷'];
  const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">';
  const STICKER_SVG = {   // the small built-in set (constant strings written here, never from user input)
    'star-gold': SVG_OPEN + '<polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38" fill="#ffd166" stroke="#e0a93b" stroke-width="4" stroke-linejoin="round"/></svg>',
    'heart-red': SVG_OPEN + '<path d="M50 90C8 60 4 30 27 20C40 15 48 23 50 32C52 23 60 15 73 20C96 30 92 60 50 90Z" fill="#ef476f" stroke="#c2284f" stroke-width="4" stroke-linejoin="round"/></svg>',
    'flower': SVG_OPEN + '<g fill="#ff9ec4"><circle cx="50" cy="24" r="17"/><circle cx="76" cy="43" r="17"/><circle cx="66" cy="73" r="17"/><circle cx="34" cy="73" r="17"/><circle cx="24" cy="43" r="17"/></g><circle cx="50" cy="50" r="13" fill="#ffd166"/></svg>',
    'cloud': SVG_OPEN + '<path d="M26 74C10 74 6 52 24 48C24 30 46 22 56 36C70 28 88 40 82 56C96 60 92 74 78 74Z" fill="#dcecff" stroke="#7fb0e6" stroke-width="4" stroke-linejoin="round"/></svg>',
    'sun': SVG_OPEN + '<g stroke="#ff9f1c" stroke-width="6" stroke-linecap="round"><path d="M50 6V18M50 82V94M6 50H18M82 50H94M19 19L27 27M73 73L81 81M81 19L73 27M27 73L19 81"/></g><circle cx="50" cy="50" r="22" fill="#ffd166" stroke="#ff9f1c" stroke-width="4"/></svg>',
    'check': SVG_OPEN + '<circle cx="50" cy="50" r="42" fill="#06d6a0"/><path d="M30 52L45 67L72 36" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'arrow': SVG_OPEN + '<path d="M8 38H58V16L94 50L58 84V62H8Z" fill="#118ab2" stroke="#0b6b8f" stroke-width="4" stroke-linejoin="round"/></svg>',
    'bubble': SVG_OPEN + '<path d="M14 14H86Q94 14 94 22V62Q94 70 86 70H48L28 88V70H14Q6 70 6 62V22Q6 14 14 14Z" fill="#fff" stroke="#8a93a8" stroke-width="4" stroke-linejoin="round"/></svg>'
  };
  const STICKER_NAME = { 'star-gold': 'Gold star', 'heart-red': 'Red heart', flower: 'Flower', cloud: 'Cloud', sun: 'Sun', check: 'Tick', arrow: 'Arrow', bubble: 'Speech bubble' };
  const TEXT_PAD = 6, LINE_H = 1.25, NOTE_SIZE = 26;

  /* ---------- M2 (v0.13.0): cutout frames and stamps — built in, plus packs ----------
     Free packs ship in studentdeck/packs/ (index.json lists them) and are copied into the StudentDeckScrap `packs` store
     on first run; a higher version replaces an older one. Packs are DATA ONLY (ScrapCore.validatePack refuses scripts,
     links, images, styles). Pack items are addressed as "packid:itemid". Sticker packs: the format is ready; placing
     pack stickers arrives with the store (M4). */
  const REG = { masks: Object.assign({}, C.MASKS), stamps: Object.assign({}, C.STAMPS), maskName: { circle: 'Circle', rounded: 'Rounded square', heart: 'Heart' } };
  function registerPack(raw) {
    const v = C.validatePack(raw); if (!v.ok) return false; const k = v.pack;
    k.items.forEach(it => { const id = k.id + ':' + it.id;
      if (k.kind === 'mask') { REG.masks[id] = it.path; REG.maskName[id] = it.name.en; }
      else if (k.kind === 'stamp') REG.stamps[id] = { d: it.path, mode: it.mode, name: it.name };
    });
    return true;
  }
  async function loadPacks(store) {
    const have = {};
    try { (await store.getPacks()).forEach(pk => { if (registerPack(pk)) have[pk.id] = pk.version; }); } catch (e) {}
    try {
      const idx = await (await fetch('packs/index.json')).json();
      for (const f of (idx.packs || [])) {
        if (!/^[a-z0-9_-]+\.json$/.test(f)) continue;
        const v = C.validatePack(await (await fetch('packs/' + f)).json()); if (!v.ok) continue;
        if (!(have[v.pack.id] >= v.pack.version)) { try { await store.putPack(v.pack); } catch (e) {} registerPack(v.pack); }
      }
    } catch (e) { /* bundled packs not reachable: the built-in frames and stamps still work */ }
  }
  function stampSvg(st, tint) {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="' + st.d + '" ' + (st.mode === 'stroke'
      ? 'fill="none" stroke="' + tint + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"' : 'fill="' + tint + '"') + '/></svg>';
  }
  function tapeBg(it) {
    if (it.pattern === 'stripes') return 'repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 8px, transparent 8px 16px), ' + it.color;
    if (it.pattern === 'dots') return 'radial-gradient(rgba(255,255,255,.6) 3px, transparent 3.5px) 0 0 / 16px 16px, ' + it.color;
    return it.color;
  }
  function drawCrop(cx, img, w, h, crop) {
    const s = C.cropSource(img.naturalWidth || img.width, img.naturalHeight || img.height, w, h, crop);
    cx.drawImage(img, s.sx, s.sy, s.sw, s.sh, 0, 0, w, h);
  }
  function blobToDataUrl(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); }); }
  function dataUrlToBlob(u) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(u); const bin = atob(m[2]), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return new Blob([out], { type: m[1] });
  }
  const LABEL = { frame: 'Photo frame', font: 'Font', align: 'Text alignment', kind: 'Shape', mask: 'Cutout frame', pattern: 'Tape pattern', width: 'Line size' };
  const MSG = {
    'photos-off': 'Your school has switched photos off for scrapbooks.',
    'photo-cap': 'This scrapbook already has the most photos it can hold (' + C.LIMITS.maxPhotosPerBook + ').',
    'sharing-off': 'Your school has turned sharing off for now.'
  };
  const SCRAP_STATUS = { pending: 'Waiting for your teacher', approved: 'Approved ✓', hidden: 'Hidden by your teacher' };

  const byZ = (a, b) => (a.z || 0) - (b.z || 0);
  const mb = n => (n / 1048576 < 0.1 ? '<0.1' : (n / 1048576).toFixed(1)) + ' MB';
  const clone = o => JSON.parse(JSON.stringify(o));
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const isThumb = t => typeof t === 'string' && t.length < 200000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(t);
  let demoStore = null;   // the demo keeps its scrapbooks for the whole page visit, then forgets them
  const scrapState = () => state.scrap || (state.scrap = { books: [], lastOpen: '', lastItemDay: '' });

  /* ---------- storage ---------- */
  function idbStore() {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') { dbp = null; return rej(new Error('IndexedDB isn\u2019t available here')); }
      const q = indexedDB.open('StudentDeckScrap', 1);
      q.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' }).createIndex('bookId', 'bookId', { unique: false });
        if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'id' });   // sticker/stamp/cutout packs (M2/M4); created now so no later schema bump is needed
      };
      q.onsuccess = e => { const db = e.target.result; db.onversionchange = () => { db.close(); dbp = null; }; res(db); };
      q.onerror = e => { dbp = null; rej(e.target.error); };
      q.onblocked = () => { dbp = null; rej(new Error('Another StudentDeck tab is blocking an update \u2014 close it and reload')); };
    }));
    const tx = (stores, mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction(stores, mode); let r;
      try { r = fn(t); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    }));
    return {
      getBooks: () => tx('books', 'readonly', t => t.objectStore('books').getAll()),
      getBook: id => tx('books', 'readonly', t => t.objectStore('books').get(id)),
      putBook: b => tx('books', 'readwrite', t => t.objectStore('books').put(b)),
      getAssetsByBook: id => tx('assets', 'readonly', t => t.objectStore('assets').index('bookId').getAll(IDBKeyRange.only(id))),
      putAsset: a => tx('assets', 'readwrite', t => t.objectStore('assets').put(a)),
      getPacks: () => tx('packs', 'readonly', t => t.objectStore('packs').getAll()),           // v0.13.0 (M2)
      putPack: pk => tx('packs', 'readwrite', t => t.objectStore('packs').put(pk)),
      deleteAsset: id => tx('assets', 'readwrite', t => t.objectStore('assets').delete(id)),
      deleteBook: id => tx(['books', 'assets'], 'readwrite', t => {
        t.objectStore('books').delete(id);
        const rq = t.objectStore('assets').index('bookId').openKeyCursor(IDBKeyRange.only(id));
        rq.onsuccess = () => { const c = rq.result; if (c) { t.objectStore('assets').delete(c.primaryKey); c.continue(); } };
      })
    };
  }
  /* Demo mode: a throw-away in-memory copy, so the demo never writes to the student's real scrapbooks. */
  function memStore() {
    const books = new Map(), assets = new Map(), packs = new Map(), tick = v => Promise.resolve(v);
    const sample = demoBook(); books.set(sample.id, sample);
    return {
      getBooks: () => tick([...books.values()].map(clone)),
      getBook: id => tick(books.has(id) ? clone(books.get(id)) : undefined),
      putBook: b => { books.set(b.id, clone(b)); return tick(); },
      getAssetsByBook: id => tick([...assets.values()].filter(a => a.bookId === id)),
      putAsset: a => { assets.set(a.id, a); return tick(); },
      getPacks: () => tick([...packs.values()].map(clone)), putPack: pk => { packs.set(pk.id, clone(pk)); return tick(); },
      deleteAsset: id => { assets.delete(id); return tick(); },
      deleteBook: id => { books.delete(id); [...assets.values()].filter(a => a.bookId === id).forEach(a => assets.delete(a.id)); return tick(); }
    };
  }
  function demoBook() {
    const b = C.newBook('My school year', Date.now() - 864e5), pg = b.pages[b.pageOrder[0]];
    const add = (o, z) => pg.items.push(C.sanitizeItem(Object.assign({ z, rot: 0 }, o)));
    add({ type: 'shape', kind: 'round', fill: '#ffd166', stroke: '#e0a93b', x: 130, y: 70, w: 940, h: 130 }, 1);
    add({ type: 'text', text: 'My school year', font: 'hand', size: 72, color: '#5a3200', align: 'center', x: 150, y: 88, w: 900, h: 100 }, 2);
    add({ type: 'sticker', svgId: 'heart-red', x: 150, y: 290, w: 190, h: 190, rot: -8 }, 3);
    add({ type: 'sticker', glyph: '📚', x: 470, y: 280, w: 200, h: 200, rot: 6 }, 4);
    add({ type: 'sticker', svgId: 'star-gold', x: 800, y: 290, w: 190, h: 190, rot: 10 }, 5);
    add({ type: 'text', text: 'Maths club, the science fair, and the day my beans sprouted first!', font: 'sans', size: 34, color: '#2b3a55', align: 'center', x: 190, y: 560, w: 820, h: 110, rot: -2 }, 6);
    pg.xp3 = true;
    return b;
  }

  /* ---------- PNG metadata (the watermark token travels inside the picture file) ---------- */
  const CRC_T = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function pngWithText(bytes, keyword, text) {
    const enc = new TextEncoder(), key = enc.encode(keyword), val = enc.encode(text);
    const data = new Uint8Array(key.length + 1 + val.length); data.set(key, 0); data.set(val, key.length + 1);
    const typ = enc.encode('tEXt'), crcIn = new Uint8Array(4 + data.length); crcIn.set(typ, 0); crcIn.set(data, 4);
    const chunk = new Uint8Array(12 + data.length), dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length); chunk.set(typ, 4); chunk.set(data, 8); dv.setUint32(8 + data.length, crc32(crcIn));
    const at = 33;   // 8-byte signature + the 25-byte IHDR chunk
    const out = new Uint8Array(bytes.length + chunk.length); out.set(bytes.subarray(0, at), 0); out.set(chunk, at); out.set(bytes.subarray(at), at + chunk.length);
    return out;
  }
  function deviceId() {
    try { let d = localStorage.getItem('sd_device_id'); if (!d) { d = Math.random().toString(36).slice(2, 12); localStorage.setItem('sd_device_id', d); } return d; } catch (e) { return 'nodevice'; }
  }
  if (window.Watermark) Watermark.configure({ identity: () => {      // "SD::<student id>", or "SD::local::<device id>" for a student who is not in a class
    let j = null; try { j = typeof SDCloud !== 'undefined' && SDCloud.getJoined ? SDCloud.getJoined() : null; } catch (e) {}
    return j && j.studentId ? 'SD::' + j.studentId : 'SD::local::' + deviceId();
  } });
  const wmRef = () => (window.Watermark ? Watermark.ref() : '');

  /* ---------- drawing a page to a canvas (export and thumbnails) ---------- */
  function wrapLines(cx, text, maxW) {
    const lines = [];
    String(text).split('\n').forEach(par => {
      if (!par) { lines.push(''); return; }
      let line = '';
      par.split(/(\s+)/).forEach(tok => {
        if (!tok) return;
        const test = line + tok;
        if (cx.measureText(test).width <= maxW || !line) {
          if (cx.measureText(tok).width > maxW) {   // one very long word: break it by characters
            for (const ch of tok) { if (cx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ''; } line += ch; }
          } else line = test;
        } else { lines.push(line.replace(/\s+$/, '')); line = tok.replace(/^\s+/, ''); }
      });
      lines.push(line.replace(/\s+$/, ''));
    });
    return lines;
  }
  function roundRectPath(cx, x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function drawCover(cx, img, x, y, w, h) {
    const ir = img.width / img.height, br = w / h; let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (ir > br) { sw = img.height * br; sx = (img.width - sw) / 2; } else { sh = img.width / br; sy = (img.height - sh) / 2; }
    cx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  function drawBg(cx, bg) {
    const d = BG[bg] || BG.white; cx.fillStyle = d[0]; cx.fillRect(0, 0, PAGE_W, PAGE_H);
    if (d[1] === 'dots') { cx.fillStyle = d[2]; for (let y = 12; y < PAGE_H; y += 24) for (let x = 12; x < PAGE_W; x += 24) { cx.beginPath(); cx.arc(x, y, 1.6, 0, 6.2832); cx.fill(); } }
    else if (d[1] === 'grid') { cx.fillStyle = d[2]; for (let x = 0; x < PAGE_W; x += 32) cx.fillRect(x, 0, 1, PAGE_H); for (let y = 0; y < PAGE_H; y += 32) cx.fillRect(0, y, PAGE_W, 1); }
    else if (d[1] === 'lined') { cx.fillStyle = d[2]; for (let y = 39; y < PAGE_H; y += 40) cx.fillRect(0, y, PAGE_W, 1); }
  }
  const svgImgs = {};
  function svgImage(id) {
    if (svgImgs[id]) return svgImgs[id];
    const svg = STICKER_SVG[id]; if (!svg) return Promise.resolve(null);
    return (svgImgs[id] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg width="256" height="256" ')); }));
  }
  function loadImage(url) { return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; }); }

  /* =========================================================================================================== */
  window.renderScrapdeck = function renderScrapdeck(body) {
    const S = {
      store: (typeof SD_DEMO !== 'undefined' && SD_DEMO.active) ? (demoStore || (demoStore = memStore())) : idbStore(),
      view: 'gallery', book: null, pageIdx: 0, sel: null, hist: null, assets: {}, imgs: {}, editing: null,
      grid: false, scale: 1, saveT: 0, thumbT: 0, dirty: false, alive: true, pop: '', ro: null, policyDoc: null, policyUnsub: null, busy: false,
      extra: new Set(), tool: '', cropping: null, penColor: '#222222', penWidth: 4,
      myPages: [], scrapUnsub: null, modal: '', sharing: false,   // v0.15.0 (backend v2.8.0): Scrapdeck sharing (M3)
      galTab: 'mine', classGallery: [], classGalUnsub: null   // v0.16.0: the class gallery tab (M3b, read side)
    };
    const q = (s, r = body) => r.querySelector(s);
    const curPage = () => S.book.pages[S.book.pageOrder[S.pageIdx]];
    const selItem = () => (S.sel && S.book ? curPage().items.find(i => i.id === S.sel) || null : null);
    const itemEl = id => q('.sc-page [data-id="' + id + '"]');
    const policy = () => {
      let inClass = false; try { inClass = !!(typeof SDCloud !== 'undefined' && SDCloud.getJoined && SDCloud.getJoined()); } catch (e) {}
      return C.effectivePolicy(S.policyDoc, inClass);
    };
    if (typeof SDCloud !== 'undefined' && typeof SDCloud.subscribePolicy === 'function') {   // arrives with the M0 backend; until then a missing policy means "allowed"
      try { S.policyUnsub = SDCloud.subscribePolicy(d => { S.policyDoc = d; if (S.view === 'editor') updateBar(); }); } catch (e) {}
    }
    if (typeof SDCloud !== 'undefined' && typeof SDCloud.subscribeMyScrapPages === 'function') {   // arrives with backend v2.8.0
      try { S.scrapUnsub = SDCloud.subscribeMyScrapPages(list => { S.myPages = list; if (S.modal === 'share') renderShareModal(); }); } catch (e) {}
    }
    if (typeof SDCloud !== 'undefined' && typeof SDCloud.subscribeScrapGallery === 'function') {   // arrives with backend v2.8.0 (M3b)
      try { S.classGalUnsub = SDCloud.subscribeScrapGallery(list => { S.classGallery = list; if (S.view === 'gallery' && S.galTab === 'class') showGallery(); }); } catch (e) {}
    }

    loadPacks(S.store).then(() => { if (S.alive && S.view === 'editor') drawPage(); });   // v0.13.0: bundled stamp and frame packs

    /* ----- gallery ----- */
    function inClass() { try { return !!(typeof SDCloud !== 'undefined' && SDCloud.getJoined && SDCloud.getJoined()); } catch (e) { return false; } }
    function galTabsHtml() {
      if (!inClass()) return '';
      return '<div class="sc-galtabs"><button class="chip ' + (S.galTab !== 'class' ? 'on' : '') + '" data-galtab="mine">My scrapbooks</button><button class="chip ' + (S.galTab === 'class' ? 'on' : '') + '" data-galtab="class">Class gallery</button></div>';
    }
    async function showGallery() {
      if (S.book) await closeBook();
      S.view = 'gallery'; S.pop = '';
      if (S.galTab === 'class' && inClass()) {
        const items = S.classGallery.map(p => '<article class="sc-card"><div class="sc-cover sc-cover-view"><img alt="" src="' + esc(p.thumbDataUrl || '') + '"></div><div class="sc-cardmeta"><b title="' + esc(p.title || '') + '">' + esc(p.title || '') + '</b><span class="muted">' + esc(p.firstName || 'Classmate') + '</span></div></article>').join('');
        body.innerHTML = '<div class="sc-gal">' + galTabsHtml() + '<p class="muted" style="margin:6px 0">Pages your classmates shared, approved by your teacher.</p><div class="sc-grid" aria-live="polite">' + (items || '<p class="muted">Nothing shared with the class yet.</p>') + '</div></div>';
        return;
      }
      body.innerHTML = '<div class="sc-gal">' + galTabsHtml() + '<div class="sc-galhead"><div><b>My scrapbooks</b><p class="muted" style="margin:2px 0 0">Your pictures and pages stay on this computer.</p></div><button class="btn primary" data-a="new">\uff0b New scrapbook</button><button class="btn" data-a="restore" title="Open a scrapbook saved to a file">\u2b06 Open from file</button><input type="file" class="sc-restore" accept=".json,application/json" hidden></div><div class="sc-grid" aria-live="polite"><p class="muted">Loading\u2026</p></div></div>';
      let books = [];
      try { books = await S.store.getBooks(); } catch (e) { if (S.alive && S.view === 'gallery') q('.sc-grid').innerHTML = '<p class="muted">Scrapbooks can\u2019t be opened here: ' + esc(e.message) + '</p>'; return; }
      if (!S.alive || S.view !== 'gallery') return;
      books.sort((a, b) => (b.updated || 0) - (a.updated || 0));
      const sc = scrapState(); sc.books = books.map(b => ({ id: b.id, title: b.title, updated: b.updated })); save();
      const grid = q('.sc-grid');
      grid.innerHTML = books.length ? books.map(b => {
        const n = (b.pageOrder || []).length, cover = isThumb(b.thumb) ? '<img alt="" src="' + b.thumb + '">' : '<span class="sc-nocover" aria-hidden="true">\ud83d\uddbc\ufe0f</span>';
        return '<article class="sc-card" data-id="' + esc(b.id) + '"><button class="sc-cover" data-a="open" aria-label="Open ' + esc(b.title) + '">' + cover + '</button><div class="sc-cardmeta"><b title="' + esc(b.title) + '">' + esc(b.title) + '</b><span class="muted">' + plural(n, 'page') + ' \u00b7 ' + new Date(b.updated || Date.now()).toLocaleDateString() + '</span></div><div class="sc-acts"><button class="btn" data-a="backup" title="Save this scrapbook to a file (a backup you can open on another computer)" aria-label="Save to file">\u2b07</button><button class="btn" data-a="dup">Duplicate</button><button class="btn" data-a="del">Delete</button></div></article>';
      }).join('') : '<p class="muted">No scrapbooks yet. Press \u201cNew scrapbook\u201d to start your first one.</p>';
    }
    async function newBook() {
      const sc = scrapState(); if (sc.books && sc.books.length >= C.LIMITS.maxBooks) { toast('You have ' + C.LIMITS.maxBooks + ' scrapbooks, the most this computer keeps. Delete one first.'); return; }
      const b = C.newBook('My scrapbook', Date.now());
      try { await S.store.putBook(b); } catch (e) { toast('Couldn\u2019t start a scrapbook: ' + e.message); return; }
      await openBook(b.id);
    }
    async function dupBook(id) {
      try {
        const raw = await S.store.getBook(id); if (!raw) return; const v = C.validateBook(raw).book, as = await S.store.getAssetsByBook(id);
        const nb = clone(v); nb.id = C.uid('bk'); nb.title = (v.title + ' copy').slice(0, C.LIMITS.maxTitle); nb.created = nb.updated = Date.now();
        const map = {}; as.forEach(a => { map[a.id] = C.uid('as'); });
        nb.pageOrder.forEach(pid => nb.pages[pid].items.forEach(it => { if (it.type === 'photo' && map[it.assetId]) it.assetId = map[it.assetId]; }));
        await S.store.putBook(nb); for (const a of as) await S.store.putAsset(Object.assign({}, a, { id: map[a.id], bookId: nb.id }));
        toast('Duplicated \u201c' + v.title + '\u201d'); showGallery();
      } catch (e) { toast('Couldn\u2019t duplicate: ' + e.message); }
    }
    /* v0.13.0: backup to and from a file — one JSON file with the pictures inside, opened as a NEW scrapbook (never overwrites). */
    async function backupBook(id) {
      try {
        const raw = await S.store.getBook(id); if (!raw) return; const v = C.validateBook(raw).book, as = await S.store.getAssetsByBook(id), assets = [];
        for (const a of as) assets.push({ id: a.id, dataUrl: await blobToDataUrl(a.blob), w: a.w, h: a.h, alt: a.alt });
        const data = C.makeBackup(v, assets); data.ref = wmRef();   // the export watermark travels with the file
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
        a.download = (v.title.replace(/[^\w\- ]+/g, '').trim() || 'scrapbook') + '.scrapbook.json'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Saved \u201c' + v.title + '\u201d to a file');
      } catch (e) { toast('Couldn\u2019t save the scrapbook: ' + e.message); }
    }
    async function restoreFile(file) {
      if (!file) return; if (file.size > 250 * 1048576) { toast('That file is too big.'); return; }
      const sc = scrapState(); if (sc.books && sc.books.length >= C.LIMITS.maxBooks) { toast('You have ' + C.LIMITS.maxBooks + ' scrapbooks, the most this computer keeps. Delete one first.'); return; }
      const r = C.parseBackup(await file.text()); if (!r.ok) { toast('That isn\u2019t a scrapbook file from StudentDeck.'); return; }
      if (!policy().studentPhotos && r.assets.length) {   // the school switched photos off: the file's pictures stay out too
        r.assets = []; r.book.pageOrder.forEach(pid => { r.book.pages[pid].items = r.book.pages[pid].items.filter(i => i.type !== 'photo'); });
        toast(MSG['photos-off']);
      }
      try {
        for (const a of r.assets) { const blob = dataUrlToBlob(a.dataUrl); await S.store.putAsset({ id: a.id, bookId: r.book.id, blob, w: a.w, h: a.h, bytes: blob.size, alt: a.alt }); }
        r.book.updated = Date.now(); await S.store.putBook(r.book); toast('Opened \u201c' + r.book.title + '\u201d'); showGallery();
      } catch (e) { toast('Couldn\u2019t open the file: ' + e.message); }
    }
    async function delBook(id) {
      const title = ((scrapState().books || []).find(b => b.id === id) || {}).title || 'this scrapbook';
      if (!confirm('Delete \u201c' + title + '\u201d and its pictures? This can\u2019t be undone.')) return;
      try { await S.store.deleteBook(id); } catch (e) { toast('Couldn\u2019t delete: ' + e.message); return; }
      showGallery();
    }

    /* ----- opening and closing a book ----- */
    function addAsset(a) { S.assets[a.id] = { id: a.id, blob: a.blob, url: URL.createObjectURL(a.blob), alt: a.alt || '', w: a.w, h: a.h, bytes: a.bytes || (a.blob && a.blob.size) || 0, bookId: a.bookId }; }
    async function openBook(id) {
      if (S.busy) return; S.busy = true;
      try {
        const raw = await S.store.getBook(id); if (!raw) { toast('That scrapbook wasn\u2019t found.'); S.busy = false; return showGallery(); }
        const v = C.validateBook(raw); if (!v.ok) toast('Some damaged items in this scrapbook were removed.');
        S.book = v.book; if (isThumb(raw.thumb)) S.book.thumb = raw.thumb; S.assets = {}; S.imgs = {};
        (await S.store.getAssetsByBook(id)).forEach(addAsset);
        S.pageIdx = 0; S.sel = null; S.editing = null; S.hist = C.createHistory(snapshot()); S.dirty = false;
        scrapState().lastOpen = id; save();
        if (!S.book.thumb) scheduleThumb();
      } catch (e) { S.busy = false; toast('Couldn\u2019t open that scrapbook: ' + e.message); return; }
      S.busy = false; showEditor();
    }
    async function closeBook() {
      if (!S.book) return;
      clearTimeout(S.thumbT); if (S.thumbPending) await makeThumb();
      await flushSave();
      try {   // sweep photos no item uses any more (undo may need them while the book is open, so this waits until it closes)
        const all = (await S.store.getAssetsByBook(S.book.id)).map(a => a.id);
        for (const id of C.unreferencedAssets(S.book, all)) await S.store.deleteAsset(id);
      } catch (e) { /* best effort */ }
      Object.values(S.assets).forEach(a => { try { URL.revokeObjectURL(a.url); } catch (e) {} });
      S.assets = {}; S.imgs = {}; S.book = null; S.sel = null; S.hist = null;
    }

    /* ----- saving ----- */
    function setSaved(t) { const el = q('.sc-saved'); if (el) el.textContent = t; }
    function scheduleSave() { S.dirty = true; setSaved('Saving\u2026'); clearTimeout(S.saveT); S.saveT = setTimeout(flushSave, 600); scheduleThumb(); }
    async function flushSave() {
      clearTimeout(S.saveT); if (!S.dirty || !S.book) return; S.dirty = false;
      const rec = clone(S.book); rec.updated = Date.now(); S.book.updated = rec.updated;
      try {
        await S.store.putBook(rec);
        const sc = scrapState(), row = (sc.books || []).find(b => b.id === rec.id), meta = { id: rec.id, title: rec.title, updated: rec.updated };
        if (row) Object.assign(row, meta); else (sc.books = sc.books || []).push(meta); save();
        setSaved('Saved \u2713');
      } catch (e) { S.dirty = true; setSaved('Not saved'); toast('Couldn\u2019t save your scrapbook: ' + e.message); }
    }
    async function makeThumb() {
      S.thumbPending = false; if (!S.alive || !S.book) return;
      try { const cv = await renderPageCanvas(S.book.pages[S.book.pageOrder[0]], 0.2); S.book.thumb = cv.toDataURL('image/jpeg', 0.7); S.dirty = true; } catch (e) { /* no cover picture */ }
    }
    function scheduleThumb() { S.thumbPending = true; clearTimeout(S.thumbT); S.thumbT = setTimeout(async () => { await makeThumb(); clearTimeout(S.saveT); S.saveT = setTimeout(flushSave, 300); }, 1800); }
    function snapshot() { return { pageOrder: S.book.pageOrder, pages: S.book.pages }; }
    function commit() { if (S.hist.push(snapshot())) updateUndo(); scheduleSave(); updateMeter(); }
    function restore(st) {
      const keep = {}; Object.keys(S.book.pages).forEach(id => { keep[id] = !!S.book.pages[id].xp3; });
      S.book.pageOrder = st.pageOrder.slice(); S.book.pages = clone(st.pages);
      Object.keys(S.book.pages).forEach(id => { if (keep[id]) S.book.pages[id].xp3 = true; });   // undo must never let a page earn its "3 items" XP twice
      S.pageIdx = Math.min(S.pageIdx, S.book.pageOrder.length - 1); S.sel = null; S.editing = null;
      drawPage(); updateUndo(); scheduleSave(); updateMeter();
    }
    const undo = () => { const s = S.hist && S.hist.undo(); if (s) restore(s); };
    const redo = () => { const s = S.hist && S.hist.redo(); if (s) restore(s); };

    /* ----- the editor shell ----- */
    function showEditor() {
      S.view = 'editor'; S.pop = '';
      const bgOpts = C.BACKGROUNDS.map(b => '<option value="' + b + '">' + BG_NAME[b] + '</option>').join('');
      body.innerHTML =
        '<div class="sc-ed">' +
        '<div class="sc-bar"><button class="btn" data-a="back">\u2190 My scrapbooks</button><input type="text" class="sc-title" aria-label="Scrapbook name" maxlength="' + C.LIMITS.maxTitle + '"><span class="sc-saved muted" role="status" aria-live="polite"></span><span class="grow"></span>' +
        '<button class="btn" data-a="undo" title="Undo (Ctrl+Z)" aria-label="Undo">\u21b6</button><button class="btn" data-a="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">\u21b7</button>' +
        '<label class="sc-snap"><input type="checkbox" data-a="snap"> Snap</label><button class="btn" data-a="share" title="Share this page with your family or class">\ud83d\udce4 Share</button><button class="btn primary" data-a="export" title="Save this page as a picture">\ud83d\udcbe Save page as picture</button></div>' +
        '<div class="sc-bar"><button class="btn" data-a="pprev" aria-label="Previous page">\u2039</button><span class="sc-pg" aria-live="polite"></span><button class="btn" data-a="pnext" aria-label="Next page">\u203a</button>' +
        '<button class="btn" data-a="padd">\uff0b Page</button><button class="btn" data-a="pleft" title="Move this page earlier" aria-label="Move page earlier">\u25c0</button><button class="btn" data-a="pright" title="Move this page later" aria-label="Move page later">\u25b6</button><button class="btn" data-a="pdel">Delete page</button>' +
        '<select data-a="bg" aria-label="Page background">' + bgOpts + '</select><span class="sc-sep"></span>' +
        '<button class="btn" data-a="addphoto">\ud83d\udcf7 Photo</button><button class="btn" data-a="addtext">Aa Text</button><button class="btn" data-a="stickers">\u2b50 Sticker</button><button class="btn" data-a="shapes">\u25a0 Shape</button><button class="btn" data-a="pen" title="Draw on the page (Esc stops)">\u270f\ufe0f Pen</button><button class="btn" data-a="tape">\ud83e\ude79 Tape</button><button class="btn" data-a="note">\ud83d\udcdd Note</button><button class="btn" data-a="stamps">\ud83d\udd16 Stamp</button><button class="btn" data-a="layouts">\ud83d\uddc2\ufe0f Layout</button><span class="muted sc-meter"></span></div>' +
        '<div class="sc-bar sc-ctx" hidden></div><div class="sc-pop" hidden></div>' +
        '<div class="sc-stage"><div class="sc-pagewrap"><div class="sc-page" tabindex="-1"><div class="sc-clip"></div><div class="sc-sel" hidden><i class="sc-h" data-h="nw"></i><i class="sc-h" data-h="ne"></i><i class="sc-h" data-h="se"></i><i class="sc-h" data-h="sw"></i><i class="sc-rotline"></i><i class="sc-h sc-rot" data-h="rot" title="Rotate"></i></div></div></div></div>' +
        '<input type="file" class="sc-file" accept="image/*" multiple hidden><div class="sc-modal" hidden></div></div>';
      q('.sc-title').value = S.book.title; q('[data-a="snap"]').checked = S.grid;
      S.ro = new ResizeObserver(fitStage); S.ro.observe(q('.sc-stage'));
      fitStage(); wirePage(); drawPage(); updateBar(); updateUndo(); updateMeter(); setSaved('Saved \u2713');
    }
    function fitStage() {
      const st = q('.sc-stage'), wrap = q('.sc-pagewrap'), page = q('.sc-page'); if (!st || !wrap || !st.clientWidth || !st.clientHeight) return;
      S.scale = Math.max(0.2, Math.min((st.clientWidth - 12) / PAGE_W, (st.clientHeight - 12) / PAGE_H));
      wrap.style.width = Math.round(PAGE_W * S.scale) + 'px'; wrap.style.height = Math.round(PAGE_H * S.scale) + 'px';
      page.style.transform = 'scale(' + S.scale + ')'; page.style.setProperty('--inv', String(1 / S.scale));
    }
    function updateBar() {
      if (S.view !== 'editor') return;
      const n = S.book.pageOrder.length, i = S.pageIdx, p = policy(), set = (a, f) => { const el = q('[data-a="' + a + '"]'); if (el) f(el); };
      q('.sc-pg').textContent = 'Page ' + (i + 1) + ' of ' + n;
      set('pprev', e => { e.disabled = i === 0; }); set('pnext', e => { e.disabled = i === n - 1; }); set('pleft', e => { e.disabled = i === 0; }); set('pright', e => { e.disabled = i === n - 1; });
      set('pdel', e => { e.disabled = n < 2; }); set('padd', e => { e.disabled = n >= C.LIMITS.maxPagesPerBook; });
      set('bg', e => { e.value = curPage().bg; });
      set('addphoto', e => { e.disabled = !p.studentPhotos; e.title = p.studentPhotos ? 'Add pictures from this computer' : MSG['photos-off']; });
      set('share', e => { e.disabled = !p.studentSharing; e.title = p.studentSharing ? 'Share this page with your family or class' : MSG['sharing-off']; });
    }
    function updateUndo() { const u = q('[data-a="undo"]'), r = q('[data-a="redo"]'); if (u) u.disabled = !S.hist.canUndo(); if (r) r.disabled = !S.hist.canRedo(); }
    function updateMeter() {
      const el = q('.sc-meter'); if (!el) return;
      const used = C.assetsInUse(S.book).reduce((s, id) => s + ((S.assets[id] || {}).bytes || 0), 0);
      el.textContent = 'Photos ' + C.photoCount(S.book) + ' / ' + C.LIMITS.maxPhotosPerBook + ' \u00b7 ' + mb(used);
    }

    /* ----- drawing the page on screen ----- */
    function drawPage() {
      if (S.view !== 'editor' || !S.book) return;
      const pg = curPage(), clip = q('.sc-clip'), ae = document.activeElement;
      const hadFocus = !ae || ae === document.body || clip.contains(ae);   // rebuilding the items would otherwise drop keyboard focus, and Delete / Ctrl+Z would stop working
      clip.className = 'sc-clip sc-bg-' + pg.bg;   // the page picture is clipped to the page; the selection handles (outside .sc-clip) are not
      clip.textContent = '';
      pg.items.slice().sort(byZ).forEach(it => clip.appendChild(makeItemEl(it)));
      updateBar(); updateSel(); updateCtx();
      const cur = hadFocus && !S.editing && S.sel && itemEl(S.sel); if (cur) cur.focus({ preventScroll: true });
    }
    function applyGeom(el, it) {
      el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; el.style.width = it.w + 'px'; el.style.height = it.h + 'px';
      el.style.transform = 'rotate(' + it.rot + 'deg)'; el.style.zIndex = it.z;
      if (it.type === 'sticker' && it.glyph) el.style.fontSize = Math.round(Math.min(it.w, it.h) * 0.8) + 'px';
    }
    function labelFor(it) {
      if (it.type === 'photo') return 'Photo' + ((S.assets[it.assetId] || {}).alt ? ': ' + S.assets[it.assetId].alt : '');
      if (it.type === 'text') return 'Text: ' + it.text.slice(0, 40);
      if (it.type === 'sticker') return 'Sticker ' + (it.glyph || STICKER_NAME[it.svgId] || '');
      if (it.type === 'tape') return 'Washi tape';
      if (it.type === 'note') return 'Note: ' + it.text.slice(0, 40);
      if (it.type === 'pen') return 'Drawing';
      if (it.type === 'stamp') return 'Stamp ' + (((REG.stamps[it.stampId] || {}).name || {}).en || '');
      return 'Shape ' + (SHAPE_NAME[it.kind] || '');
    }
    function fillItem(el, it) {
      el.className = 'sc-it sc-' + it.type + (selIds().indexOf(it.id) >= 0 ? ' picked' : ''); el.setAttribute('aria-label', labelFor(it));
      if (it.type === 'photo') {
        const a = S.assets[it.assetId], mp = it.mask && REG.masks[it.mask]; el.textContent = '';
        el.classList.add(mp ? 'sc-masked' : 'sc-f-' + it.frame); if (mp && it.edge) el.classList.add('sc-edge'); if (S.cropping === it.id) el.classList.add('cropping');
        if (!a) { el.textContent = 'Photo missing'; return; }
        const im = document.createElement('img'); im.src = a.url; im.alt = a.alt || ''; im.draggable = false;
        if (mp || (it.crop && it.frame === 'plain')) {   // v0.13.0: pan/zoom inside the frame (ScrapCore.cropSource, the same maths as the export)
          const s = C.cropSource(a.w, a.h, it.w, it.h, it.crop); im.className = 'sc-crop';
          im.style.width = (a.w * s.scale) + 'px'; im.style.height = (a.h * s.scale) + 'px'; im.style.left = (-s.sx * s.scale) + 'px'; im.style.top = (-s.sy * s.scale) + 'px';
        }
        if (mp) {
          const cid = 'scm-' + it.id;
          el.innerHTML = '<svg class="sc-defs" width="0" height="0" aria-hidden="true"><defs><clipPath id="' + cid + '" clipPathUnits="objectBoundingBox"><path d="' + mp + '"/></clipPath></defs></svg>'
            + (it.edge ? '<svg class="sc-edgeline" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"><path d="' + mp + '"/></svg>' : '');
          const wrap = document.createElement('div'); wrap.className = 'sc-mwrap'; wrap.style.clipPath = 'url(#' + cid + ')'; wrap.appendChild(im);
          el.insertBefore(wrap, el.querySelector('.sc-edgeline'));
        } else el.appendChild(im);
      } else if (it.type === 'text') {
        el.textContent = it.text; el.style.fontFamily = FONT[it.font]; el.style.fontSize = it.size + 'px'; el.style.color = it.color; el.style.textAlign = it.align;
      } else if (it.type === 'sticker') {
        if (it.glyph) el.textContent = it.glyph; else el.innerHTML = STICKER_SVG[it.svgId] || '';
      } else if (it.type === 'shape') {
        el.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' + SHAPE_PATH[it.kind] + '" fill="' + it.fill + '" stroke="' + it.stroke + '" stroke-width="3" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>';
      }
    }
    function fillItemM2(el, it) {   // v0.13.0 item types
      if (it.type === 'tape') { el.style.background = tapeBg(it); }
      else if (it.type === 'note') { el.textContent = it.text; el.style.background = it.color; el.style.fontFamily = FONT.hand; el.style.fontSize = NOTE_SIZE + 'px'; }
      else if (it.type === 'pen') { el.innerHTML = '<svg viewBox="0 0 ' + it.vw + ' ' + it.vh + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + it.d + '" fill="none" stroke="' + it.color + '" stroke-width="' + it.width + '" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>'; }
      else if (it.type === 'stamp') { const st = REG.stamps[it.stampId]; el.innerHTML = st ? stampSvg(st, it.tint) : ''; el.style.opacity = it.ink; }
    }
    function makeItemEl(it) {
      const el = document.createElement('div'); el.dataset.id = it.id; el.tabIndex = 0; el.setAttribute('role', 'button');
      applyGeom(el, it); fillItem(el, it); fillItemM2(el, it); return el;
    }
    function refreshItem(it) { const el = itemEl(it.id); if (el) { el.removeAttribute('style'); applyGeom(el, it); fillItem(el, it); fillItemM2(el, it); } updateSel(); }

    /* ----- selection ----- */
    function selIds() {   // v0.13.0: the selection is S.sel plus S.extra (Shift-click, a dragged box, or a group)
      if (!S.sel || !S.book) return [];
      const have = new Set(curPage().items.map(i => i.id));
      return [S.sel].concat([...S.extra].filter(x => x !== S.sel)).filter(x => have.has(x));
    }
    function select(id, add) {
      if (S.editing && S.editing !== id) { const e = itemEl(S.editing); if (e) e.blur(); }
      const items = S.book ? curPage().items : [];
      let list;
      if (!id) list = [];
      else if (add) { const g = C.groupIds(items, id), cur = selIds(), on = g.every(x => cur.indexOf(x) >= 0); list = on ? cur.filter(x => g.indexOf(x) < 0) : cur.concat(g.filter(x => cur.indexOf(x) < 0)); }
      else { const g = C.groupIds(items, id); list = [id].concat(g.filter(x => x !== id)); }
      S.sel = list[0] || null; S.extra = new Set(list.slice(1));
      if (S.cropping && S.cropping !== S.sel) { const c = items.find(i => i.id === S.cropping); S.cropping = null; if (c) refreshItem(c); }
      body.querySelectorAll('.sc-it.picked').forEach(n => n.classList.remove('picked'));
      list.forEach(x => { const n = itemEl(x); if (n) n.classList.add('picked'); });
      updateSel(); updateCtx();
      const el = S.sel && itemEl(S.sel);
      if (el && !S.editing && body.contains(document.activeElement) && /^(BODY|DIV)$/.test(document.activeElement.tagName)) el.focus({ preventScroll: true });
    }
    function updateSel() {
      const sel = q('.sc-sel'); if (!sel) return; const it = selItem(), ids = selIds();
      if (ids.length > 1) {
        const b = C.selectionBounds(curPage().items, ids); sel.hidden = false; sel.classList.add('multi');
        sel.style.left = b.x + 'px'; sel.style.top = b.y + 'px'; sel.style.width = b.w + 'px'; sel.style.height = b.h + 'px'; sel.style.transform = 'none'; return;
      }
      sel.classList.remove('multi');
      if (!it) { sel.hidden = true; return; }
      sel.hidden = false; sel.style.left = it.x + 'px'; sel.style.top = it.y + 'px'; sel.style.width = it.w + 'px'; sel.style.height = it.h + 'px'; sel.style.transform = 'rotate(' + it.rot + 'deg)';
    }
    // v0.13.0: redrawing this bar removes the button that had focus, and focus then falls outside Scrapdeck, where its
    // keyboard shortcuts (Ctrl+Z, Delete, arrows, Esc) can't hear it. Put focus back on the selection, or the page.
    function keepFocusHere() { const el = S.sel && itemEl(S.sel), pg = q('.sc-page'); (el || pg) && (el || pg).focus({ preventScroll: true }); }
    function updateCtx() {
      const bar0 = q('.sc-ctx'), had = !!(bar0 && bar0.contains(document.activeElement));
      renderCtx();
      if (had && !body.contains(document.activeElement)) keepFocusHere();
    }
    function renderCtx() {
      const bar = q('.sc-ctx'); if (!bar) return; const it = selItem(), ids = selIds();
      if (S.tool === 'pen' && !it) {
        bar.innerHTML = '<b>\u270f\ufe0f Drawing</b><label class="muted">Colour <input type="color" data-pen="color" value="' + S.penColor + '"></label><label class="muted">Size <select data-pen="width" aria-label="Line size">'
          + [['2', 'Thin'], ['4', 'Medium'], ['8', 'Thick'], ['14', 'Marker']].map(o => '<option value="' + o[0] + '"' + (Number(o[0]) === S.penWidth ? ' selected' : '') + '>' + o[1] + '</option>').join('')
          + '</select></label><button class="btn primary" data-a="pendone">Done drawing</button><span class="muted">Draw on the page. Esc stops.</span>';
        bar.hidden = false; return;
      }
      if (ids.length > 1) {
        const grouped = curPage().items.some(i => ids.indexOf(i.id) >= 0 && i.group);
        bar.innerHTML = '<b class="muted">' + ids.length + ' selected</b><button class="btn" data-a="group">Group</button>' + (grouped ? '<button class="btn" data-a="ungroup">Ungroup</button>' : '')
          + '<button class="btn" data-a="mdel">Delete</button><span class="muted">Shift-click adds or removes. Drag one to move them all.</span>';
        bar.hidden = false; return;
      }
      if (!it) { bar.hidden = true; bar.innerHTML = ''; return; }
      const sel = (key, opts, val) => '<select data-p="' + key + '" aria-label="' + (LABEL[key] || key) + '">' + opts.map(o => '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
      let h = '<b class="muted">Selected</b><button class="btn" data-a="zfront" title="Bring to front" aria-label="Bring to front">\u2912</button><button class="btn" data-a="zfwd" title="Forward one" aria-label="Forward one">\u2191</button><button class="btn" data-a="zbwd" title="Back one" aria-label="Back one">\u2193</button><button class="btn" data-a="zback" title="Send to back" aria-label="Send to back">\u2913</button><button class="btn" data-a="dup" title="Duplicate (Ctrl+D)">Duplicate</button><button class="btn" data-a="del" title="Delete (Delete key)">Delete</button>';
      if (it.type === 'photo') {
        h += sel('frame', C.FRAMES.map(f => [f, f[0].toUpperCase() + f.slice(1)]), it.frame) + '<input type="text" data-p="alt" placeholder="Describe this picture (optional)" aria-label="Picture description" maxlength="140" value="' + esc((S.assets[it.assetId] || {}).alt || '') + '">';
        const maskOpts = [['', 'No cutout']].concat(Object.keys(REG.masks).map(k => [k, REG.maskName[k] || k]));
        h += sel('mask', maskOpts, it.mask || '') + (it.mask ? '<label class="muted"><input type="checkbox" data-p="edge"' + (it.edge ? ' checked' : '') + '> Sticker edge</label>' : '')
          + ((it.mask || it.frame === 'plain') ? '<label class="muted">Zoom <input type="range" data-p="zoom" min="1" max="4" step="0.05" value="' + ((it.crop && it.crop.zoom) || 1) + '" style="width:90px"></label><button class="btn" data-a="crop">' + (S.cropping === it.id ? 'Done moving' : '\u2725 Move picture') + '</button>' : '');
      } else if (it.type === 'text') {
        h += sel('font', Object.keys(FONT).map(f => [f, f]), it.font) + '<input type="number" data-p="size" min="8" max="400" value="' + Math.round(it.size) + '" aria-label="Text size" style="width:64px"><input type="color" data-p="color" value="' + it.color + '" aria-label="Text colour">' + sel('align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], it.align) + '<button class="btn" data-a="edittext">Edit text</button>';
      } else if (it.type === 'shape') {
        h += sel('kind', C.SHAPES.map(k => [k, SHAPE_NAME[k]]), it.kind) + '<label class="muted">Fill <input type="color" data-p="fill" value="' + it.fill + '"></label><label class="muted">Line <input type="color" data-p="stroke" value="' + it.stroke + '"></label>';
      }
      if (it.type === 'tape') h += '<label class="muted">Colour <input type="color" data-p="color" value="' + it.color + '"></label>' + sel('pattern', [['plain', 'Plain'], ['stripes', 'Stripes'], ['dots', 'Dots']], it.pattern);
      else if (it.type === 'note') h += '<label class="muted">Paper <input type="color" data-p="color" value="' + it.color + '"></label><button class="btn" data-a="edittext">Edit words</button>';
      else if (it.type === 'pen') h += '<label class="muted">Colour <input type="color" data-p="color" value="' + it.color + '"></label>' + sel('width', [['2', 'Thin'], ['4', 'Medium'], ['8', 'Thick'], ['14', 'Marker']], String(it.width));
      else if (it.type === 'stamp') h += '<label class="muted">Ink <input type="color" data-p="tint" value="' + it.tint + '"></label><label class="muted">Strength <input type="range" data-p="ink" min="0.3" max="1" step="0.05" value="' + it.ink + '" style="width:90px"></label>';
      bar.innerHTML = h; bar.hidden = false;
    }

    /* ----- changing things ----- */
    function addItem(raw) {
      const pg = curPage();
      if (pg.items.length >= C.LIMITS.maxItemsPerPage) { toast('This page is full (' + C.LIMITS.maxItemsPerPage + ' things). Start a new page.'); return null; }
      const w = raw.w || 200, h = raw.h || 200, jit = (pg.items.length % 6) * 14;
      const it = C.sanitizeItem(Object.assign({ id: C.uid('it'), z: C.nextZ(pg.items), x: (PAGE_W - w) / 2 + jit, y: (PAGE_H - h) / 2 + jit, rot: 0 }, raw));
      if (!it) return null;
      pg.items.push(it); reward(pg); commit(); drawPage(); select(it.id); const el = itemEl(it.id); if (el && it.type !== 'text') el.focus({ preventScroll: true });
      return it;
    }
    function reward(pg) {   // XP only for adding something new (never move, resize, duplicate or delete), through the rule tested in the core
      const sc = scrapState(), r = C.xpForItemAdded({ today: dayKey(Date.now()), lastItemDay: sc.lastItemDay || '', pageItemCount: pg.items.length, pageXp3: !!pg.xp3 });
      sc.lastItemDay = r.lastItemDay; pg.xp3 = r.pageXp3; save(); if (r.xp > 0) awardXP('scrap', r.xp);
    }
    function removeItem(it) { const pg = curPage(); pg.items = pg.items.filter(i => i.id !== it.id); S.sel = null; commit(); drawPage(); }
    function duplicateItem(it) {
      const pg = curPage(); if (pg.items.length >= C.LIMITS.maxItemsPerPage) { toast('This page is full.'); return; }
      const d = Object.assign({}, clone(it), { id: C.uid('it'), x: it.x + 24, y: it.y + 24, z: C.nextZ(pg.items) }); delete d.group;   // a copy is not part of the group
      const c = C.sanitizeItem(d); if (!c) return; pg.items.push(c); commit(); drawPage(); select(c.id);
    }
    function moveZ(it, where) { const m = C.reorderZ(curPage().items, it.id, where); if (!m) return; curPage().items.forEach(i => { i.z = m[i.id]; }); commit(); drawPage(); const el = itemEl(it.id); if (el) el.focus({ preventScroll: true }); }
    function setProp(it, key, val) {
      if (key === 'alt') { const a = S.assets[it.assetId]; if (!a) return; a.alt = String(val).slice(0, 140); S.store.putAsset({ id: a.id, bookId: a.bookId || S.book.id, blob: a.blob, w: a.w, h: a.h, bytes: a.bytes, alt: a.alt }).catch(() => {}); refreshItem(it); return; }
      const map = { size: 1, color: 1, font: 1, align: 1, kind: 1, fill: 1, stroke: 1, frame: 1, mask: 1, edge: 1, zoom: 1, pattern: 1, width: 1, tint: 1, ink: 1 }; if (!map[key]) return;
      const raw = Object.assign({}, it);
      if (key === 'zoom') raw.crop = Object.assign({ zoom: 1, cx: 0.5, cy: 0.5 }, it.crop, { zoom: Number(val) });
      else if (key === 'mask') { if (val) raw.mask = val; else { delete raw.mask; delete raw.edge; } }
      else raw[key] = (key === 'size' || key === 'width' || key === 'ink') ? Number(val) : val;
      const next = C.sanitizeItem(raw); if (!next) return;
      Object.keys(it).forEach(k => { if (!(k in next)) delete it[k]; });   // a removed cutout or edge really goes
      Object.assign(it, next); if (key === 'mask' || key === 'edge') setTimeout(updateCtx, 0); if (it.type === 'text') growText(it, true); commit(); refreshItem(it);
    }
    function growText(it, redraw) {   // a text box grows to fit what the student typed
      const m = document.createElement('div'); m.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;box-sizing:border-box;padding:' + TEXT_PAD + 'px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:' + LINE_H + ';width:' + it.w + 'px;font-size:' + it.size + 'px;font-family:' + FONT[it.font];
      m.textContent = it.text; body.appendChild(m); const need = Math.ceil(m.scrollHeight); m.remove();
      if (need > it.h) it.h = Math.min(need, C.LIMITS.maxItem); if (redraw) refreshItem(it);
    }

    /* ----- text editing ----- */
    function startTextEdit(it) {
      const el = itemEl(it.id); if (!el || (it.type !== 'text' && it.type !== 'note') || S.editing) return;
      S.editing = it.id; el.classList.add('editing');
      el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
      let cancelled = false;
      const onPaste = e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text'); document.execCommand('insertText', false, t); };
      const onKey = e => { if (e.key === 'Escape') { cancelled = true; e.preventDefault(); el.blur(); } };
      const onBlur = () => {
        el.removeEventListener('paste', onPaste); el.removeEventListener('keydown', onKey); el.contentEditable = 'false'; el.classList.remove('editing'); S.editing = null;
        if (!S.alive || !S.book) return;
        const cur = curPage().items.find(i => i.id === it.id); if (!cur) return;
        let t = (el.innerText || '').replace(/\r/g, '').replace(/\n$/, '').slice(0, C.LIMITS.maxText);
        if (cancelled || t === cur.text) { refreshItem(cur); return; }
        if (!t.trim() && cur.type === 'text') { removeItem(cur); return; }   // an empty note stays: it is still a coloured paper
        cur.text = t; if (cur.type === 'text') growText(cur); commit(); refreshItem(cur); updateCtx();
      };
      el.addEventListener('paste', onPaste); el.addEventListener('keydown', onKey); el.addEventListener('blur', onBlur, { once: true });
      el.focus(); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }

    /* ----- pointer: drag, resize, rotate ----- */
    function pagePt(ev) { const r = q('.sc-page').getBoundingClientRect(); return { x: (ev.clientX - r.left) / S.scale, y: (ev.clientY - r.top) / S.scale }; }
    function gesture(ev, onMove, onEnd) {
      const page = q('.sc-page'); try { page.setPointerCapture(ev.pointerId); } catch (e) {}
      let moved = false;
      const mv = e => { moved = true; onMove(e); };
      const up = () => { page.removeEventListener('pointermove', mv); page.removeEventListener('pointerup', up); page.removeEventListener('pointercancel', up); try { page.releasePointerCapture(ev.pointerId); } catch (e) {} if (moved) onEnd(); };
      page.addEventListener('pointermove', mv); page.addEventListener('pointerup', up); page.addEventListener('pointercancel', up);
    }
    function startDrag(ev, it) {
      const ids = selIds();
      if (ids.length > 1 && ids.indexOf(it.id) >= 0) {   // v0.13.0: move the whole selection
        const p0 = pagePt(ev), o = curPage().items.filter(i => ids.indexOf(i.id) >= 0).map(i => ({ i, x: i.x, y: i.y }));
        return gesture(ev, e => {
          const p = pagePt(e); let dx = p.x - p0.x, dy = p.y - p0.y; if (S.grid) { dx = C.snap(dx, 20); dy = C.snap(dy, 20); }
          o.forEach(r => { r.i.x = C.round(r.x + dx); r.i.y = C.round(r.y + dy); const n = itemEl(r.i.id); if (n) applyGeom(n, r.i); }); updateSel();
        }, () => commit());
      }
      const p0 = pagePt(ev), x0 = it.x, y0 = it.y, el = itemEl(it.id);
      gesture(ev, e => {
        const p = pagePt(e); let nx = x0 + p.x - p0.x, ny = y0 + p.y - p0.y;
        if (S.grid) { nx = C.snap(nx, 20); ny = C.snap(ny, 20); }
        const k = C.keepInPage({ x: nx, y: ny, w: it.w, h: it.h, rot: it.rot }); it.x = k.x; it.y = k.y; applyGeom(el, it); updateSel();
      }, () => commit());
    }
    function startHandle(ev, kind) {
      const it = selItem(); if (!it) return; ev.preventDefault();
      const start = { x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot }, el = itemEl(it.id), keep = it.type === 'photo' || it.type === 'sticker';
      gesture(ev, e => {
        const p = pagePt(e);
        if (kind === 'rot') it.rot = C.round(C.rotationFromPointer(it, p.x, p.y, e.shiftKey ? 15 : 0), 2);
        else { const g = C.resizeFromCorner(start, kind, p.x, p.y, { keepAspect: keep !== e.shiftKey }); it.x = g.x; it.y = g.y; it.w = g.w; it.h = g.h; }
        applyGeom(el, it); updateSel();
      }, () => { if (it.type === 'text') growText(it, true); commit(); });
    }
    /* v0.13.0: pen, crop mode, rubber-band selection */
    function setTool(tool) {
      S.tool = tool; const pg = q('.sc-page'); if (pg) pg.classList.toggle('sc-drawing', tool === 'pen');
      const b = q('[data-a="pen"]'); if (b) b.classList.toggle('on', tool === 'pen');
      if (tool) select(null); else updateCtx();
    }
    function startPen(ev) {
      const pts = [pagePt(ev)]; let svg = null, path = null;
      gesture(ev, e => {
        pts.push(pagePt(e));
        if (!svg) {
          svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'sc-ink'); svg.setAttribute('viewBox', '0 0 ' + PAGE_W + ' ' + PAGE_H);
          path = document.createElementNS(svg.namespaceURI, 'path');
          [['fill', 'none'], ['stroke', S.penColor], ['stroke-width', S.penWidth], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']].forEach(a => path.setAttribute(a[0], a[1]));
          svg.appendChild(path); q('.sc-page').appendChild(svg);
        }
        path.setAttribute('d', 'M' + pts.map(p => C.round(p.x, 1) + ' ' + C.round(p.y, 1)).join('L'));
      }, () => {
        if (svg) svg.remove();
        const it = C.penItemFromPoints(pts, S.penColor, S.penWidth); if (!it) return;
        addItem(it); select(null);
      });
    }
    // Focus goes to the photo: the toolbar is redrawn here, and a removed button would drop keyboard focus outside Scrapdeck (Enter, arrows and Esc would stop working).
    function startCrop(it) { if (it.type !== 'photo' || !(it.mask || it.frame === 'plain')) return; S.cropping = it.id; refreshItem(it); updateCtx(); const el = itemEl(it.id); if (el) el.focus({ preventScroll: true }); }
    function endCrop() { const id = S.cropping; S.cropping = null; const it = id && curPage().items.find(i => i.id === id); if (it) refreshItem(it); updateCtx(); const el = it && itemEl(it.id); if (el) el.focus({ preventScroll: true }); }
    function cropBy(it, dx, dy) {   // dx, dy in page pixels; turned into the photo's own (rotated) direction
      const a = S.assets[it.assetId]; if (!a) return; const r = -it.rot * Math.PI / 180;
      it.crop = C.panCrop(it.crop || {}, a.w, a.h, it.w, it.h, dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)); refreshItem(it);
    }
    function startCropPan(ev, it) {
      const p0 = pagePt(ev), c0 = Object.assign({ zoom: 1, cx: 0.5, cy: 0.5 }, it.crop);
      gesture(ev, e => { const p = pagePt(e); it.crop = c0; cropBy(it, p.x - p0.x, p.y - p0.y); }, () => commit());
    }
    function startBand(ev) {
      const p0 = pagePt(ev); let band = null, r = null;
      gesture(ev, e => {
        const p = pagePt(e); if (!band) { band = document.createElement('div'); band.className = 'sc-band'; q('.sc-page').appendChild(band); }
        r = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
        band.style.left = r.x + 'px'; band.style.top = r.y + 'px'; band.style.width = r.w + 'px'; band.style.height = r.h + 'px';
      }, () => {
        if (band) band.remove(); if (!r) return;
        const all = []; C.itemsInRect(curPage().items, r).forEach(id => C.groupIds(curPage().items, id).forEach(x => { if (all.indexOf(x) < 0) all.push(x); }));
        if (!all.length) return;
        select(all[0]); S.extra = new Set(all.slice(1)); all.forEach(x => { const n = itemEl(x); if (n) n.classList.add('picked'); }); updateSel(); updateCtx();
      });
    }
    function removeMany(ids) { const pg = curPage(); pg.items = pg.items.filter(i => ids.indexOf(i.id) < 0); S.sel = null; S.extra = new Set(); commit(); drawPage(); }
    function addLayoutPage(name) {
      if (S.book.pageOrder.length >= C.LIMITS.maxPagesPerBook) { toast('This scrapbook has the most pages it can hold.'); return; }
      const p = C.layoutPage(name); if (!p) return;
      S.book.pageOrder.splice(S.pageIdx + 1, 0, p.id); S.book.pages[p.id] = p; S.pageIdx++; S.sel = null; S.extra = new Set(); commit(); drawPage();
      keepFocusHere(); toast('Added a \u201c' + C.LAYOUTS[name].name + '\u201d page \u2014 replace the notes with your photos and words');
    }
    function wirePage() {
      const page = q('.sc-page');
      page.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (S.tool === 'pen') { e.preventDefault(); closePop(); return startPen(e); }
        const h = e.target.closest('[data-h]'); if (h) return startHandle(e, h.dataset.h);
        const el = e.target.closest('.sc-it');
        if (!el) { if (S.cropping) endCrop(); select(null); closePop(); return startBand(e); }
        if (S.editing === el.dataset.id) return;
        const it = curPage().items.find(i => i.id === el.dataset.id); if (!it) return;
        closePop();
        if (S.cropping === it.id) { e.preventDefault(); return startCropPan(e, it); }
        if (S.cropping) endCrop();
        if (e.shiftKey) { select(it.id, true); return; }
        if (selIds().indexOf(it.id) < 0) select(it.id);
        el.focus({ preventScroll: true }); startDrag(e, it);
      });
      page.addEventListener('dblclick', e => {
        const el = e.target.closest('.sc-it'); const it = el && curPage().items.find(i => i.id === el.dataset.id); if (!it) return;
        if (it.type === 'text' || it.type === 'note') startTextEdit(it);
        else if (it.type === 'photo') { if (S.cropping === it.id) endCrop(); else startCrop(it); }
      });
      page.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
      page.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); importFiles([...e.dataTransfer.files]); } });
    }

    /* ----- photos ----- */
    async function downscale(file) {
      const bmp = await createImageBitmap(file), fit = C.fitLongEdge(bmp.width, bmp.height);
      const cv = document.createElement('canvas'); cv.width = fit.w; cv.height = fit.h; const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, fit.w, fit.h); cx.drawImage(bmp, 0, 0, fit.w, fit.h); if (bmp.close) bmp.close();
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', C.LIMITS.jpegQuality)); if (!blob) throw new Error('could not encode');
      return { blob, w: fit.w, h: fit.h };
    }
    async function importFiles(files) {
      const imgs = files.filter(f => /^image\//.test(f.type)); if (!imgs.length) { toast('That isn\u2019t a picture file.'); return; }
      for (const f of imgs) {
        const ok = C.canAddPhoto(S.book, policy()); if (!ok.ok) { toast(MSG[ok.reason]); break; }
        if (f.size > 40 * 1048576) { toast('\u201c' + f.name + '\u201d is too big (40 MB at most).'); continue; }
        try {
          const d = await downscale(f); if (!S.alive || !S.book) return;
          const rec = { id: C.uid('as'), bookId: S.book.id, blob: d.blob, w: d.w, h: d.h, bytes: d.blob.size, alt: '' };
          await S.store.putAsset(rec); addAsset(rec);
          const fit = C.fitInto(d.w, d.h, 520, 400); addItem({ type: 'photo', assetId: rec.id, w: fit.w, h: fit.h });
        } catch (e) { toast('\u201c' + f.name + '\u201d couldn\u2019t be opened as a picture.'); }
      }
    }

    /* ----- pop-ups for stickers and shapes ----- */
    function closePop() { S.pop = ''; const p = q('.sc-pop'); if (p) { p.hidden = true; p.innerHTML = ''; } }
    function openPop(kind) {
      if (S.pop === kind) return closePop(); S.pop = kind; const p = q('.sc-pop');
      if (kind === 'stamps') {
        p.innerHTML = '<p class="muted">Pick a stamp</p><div class="sc-pgrid">' + Object.keys(REG.stamps).map(k => { const st = REG.stamps[k];
          return '<button class="sc-pbtn" data-stamp="' + esc(k) + '" aria-label="Stamp ' + esc(st.name.en) + '" title="' + esc(st.name.en) + '">' + stampSvg(st, '#c0392b') + '</button>'; }).join('') + '</div>';
        p.hidden = false; return;
      }
      if (kind === 'layouts') {
        p.innerHTML = '<p class="muted">Add a new page laid out for\u2026</p><div class="sc-layouts">' + Object.keys(C.LAYOUTS).map(k => '<button class="btn" data-layout="' + k + '">' + esc(C.LAYOUTS[k].name) + '</button>').join('') + '</div>';
        p.hidden = false; return;
      }
      if (kind === 'stickers') p.innerHTML = '<p class="muted">Pick a sticker</p><div class="sc-pgrid">' + EMOJI.map(g => '<button class="sc-pbtn" data-sticker="' + g + '" aria-label="Sticker ' + g + '">' + g + '</button>').join('') + Object.keys(STICKER_SVG).map(id => '<button class="sc-pbtn" data-svg="' + id + '" aria-label="' + STICKER_NAME[id] + '">' + STICKER_SVG[id] + '</button>').join('') + '</div>';
      else p.innerHTML = '<p class="muted">Pick a shape</p><div class="sc-pgrid">' + Object.keys(SHAPE_PATH).map((k, i) => '<button class="sc-pbtn" data-shape="' + k + '" aria-label="' + SHAPE_NAME[k] + '"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="' + SHAPE_PATH[k] + '" fill="' + PALETTE[i % PALETTE.length] + '" stroke="#222" stroke-width="3" vector-effect="non-scaling-stroke"/></svg></button>').join('') + '</div>';
      p.hidden = false;
    }

    /* ----- export: a watermarked PNG of the current page ----- */
    async function drawItem(cx, it) {
      const w = it.w, h = it.h;
      if (it.type === 'photo') {
        const a = S.assets[it.assetId]; if (!a) return;
        const img = S.imgs[a.id] || (S.imgs[a.id] = await loadImage(a.url)); if (!img) return;
        const mp = it.mask && REG.masks[it.mask];
        if (mp) {   // v0.13.0: cutout — the same unit path as the screen, scaled to the photo
          const path = new Path2D(C.scaleUnitPath(mp, w, h));
          if (it.edge) { cx.save(); cx.shadowColor = 'rgba(0,0,0,.35)'; cx.shadowBlur = 10; cx.shadowOffsetY = 3; cx.fillStyle = '#fff'; cx.fill(path); cx.restore(); }
          cx.save(); cx.clip(path); drawCrop(cx, img, w, h, it.crop); cx.restore();
          if (it.edge) { cx.save(); cx.lineWidth = 8; cx.strokeStyle = '#fff'; cx.lineJoin = 'round'; cx.stroke(path); cx.restore(); }
          return;
        }
        if (it.frame === 'polaroid') {
          cx.save(); cx.shadowColor = 'rgba(0,0,0,.3)'; cx.shadowBlur = 10; cx.shadowOffsetY = 3; cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.restore();
          cx.save(); cx.beginPath(); cx.rect(10, 10, w - 20, h - 44); cx.clip(); drawCover(cx, img, 10, 10, w - 20, h - 44); cx.restore();
        } else {
          cx.save(); if (it.frame === 'plain') { roundRectPath(cx, 0, 0, w, h, 4); cx.clip(); } if (it.crop && it.frame === 'plain') drawCrop(cx, img, w, h, it.crop); else drawCover(cx, img, 0, 0, w, h); cx.restore();
          if (it.frame === 'taped') { cx.fillStyle = 'rgba(244,200,120,.78)'; [[18, 3, -35], [w - 18, 3, 35]].forEach(t => { cx.save(); cx.translate(t[0], t[1]); cx.rotate(t[2] * Math.PI / 180); cx.fillRect(-28, -9, 56, 18); cx.restore(); }); }
        }
      } else if (it.type === 'text') {
        cx.save(); cx.beginPath(); cx.rect(0, 0, w, h); cx.clip();
        cx.font = it.size + 'px ' + FONT[it.font]; cx.fillStyle = it.color; cx.textBaseline = 'middle'; cx.textAlign = it.align;
        const lh = it.size * LINE_H, x = it.align === 'left' ? TEXT_PAD : it.align === 'center' ? w / 2 : w - TEXT_PAD;
        wrapLines(cx, it.text, w - TEXT_PAD * 2).forEach((l, i) => cx.fillText(l, x, TEXT_PAD + i * lh + lh / 2));
        cx.restore();
      } else if (it.type === 'sticker') {
        if (it.glyph) { cx.font = Math.round(Math.min(w, h) * 0.8) + 'px ' + EMOJI_FONT; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#000'; cx.fillText(it.glyph, w / 2, h / 2 + Math.min(w, h) * 0.04); }
        else { const im = await svgImage(it.svgId); if (im) cx.drawImage(im, 0, 0, w, h); }
      } else if (it.type === 'shape') {
        const p = new Path2D(); p.addPath(new Path2D(SHAPE_PATH[it.kind]), new DOMMatrix([w / 100, 0, 0, h / 100, 0, 0]));
        cx.fillStyle = it.fill; cx.fill(p); cx.strokeStyle = it.stroke; cx.lineWidth = 3; cx.lineJoin = 'round'; cx.stroke(p);
      } else if (it.type === 'tape') {
        cx.save(); cx.globalAlpha = 0.85; cx.fillStyle = it.color; cx.fillRect(0, 0, w, h); cx.fillStyle = 'rgba(255,255,255,.45)';
        cx.beginPath(); cx.rect(0, 0, w, h); cx.clip();
        if (it.pattern === 'stripes') for (let x = -h; x < w + h; x += 16) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x + 8, 0); cx.lineTo(x + 8 - h, h); cx.lineTo(x - h, h); cx.closePath(); cx.fill(); }
        else if (it.pattern === 'dots') for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { cx.beginPath(); cx.arc(x, y, 3, 0, Math.PI * 2); cx.fill(); }
        cx.restore();
      } else if (it.type === 'note') {
        cx.save(); cx.shadowColor = 'rgba(0,0,0,.18)'; cx.shadowBlur = 8; cx.shadowOffsetY = 3; cx.fillStyle = it.color; cx.fillRect(0, 0, w, h); cx.restore();
        cx.save(); cx.beginPath(); cx.rect(0, 0, w, h); cx.clip(); cx.font = NOTE_SIZE + 'px ' + FONT.hand; cx.fillStyle = '#333'; cx.textBaseline = 'top'; cx.textAlign = 'left';
        wrapLines(cx, it.text, w - 28).forEach((l, i) => cx.fillText(l, 14, 14 + i * NOTE_SIZE * LINE_H)); cx.restore();
      } else if (it.type === 'pen') {
        const p = new Path2D(); p.addPath(new Path2D(it.d), new DOMMatrix([w / it.vw, 0, 0, h / it.vh, 0, 0]));
        cx.save(); cx.strokeStyle = it.color; cx.lineWidth = it.width; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.stroke(p); cx.restore();
      } else if (it.type === 'stamp') {
        const st = REG.stamps[it.stampId]; if (!st) return;
        const p = new Path2D(); p.addPath(new Path2D(st.d), new DOMMatrix([w / 100, 0, 0, h / 100, 0, 0]));
        cx.save(); cx.globalAlpha = it.ink; cx.globalCompositeOperation = 'multiply';
        if (st.mode === 'stroke') { cx.strokeStyle = it.tint; cx.lineWidth = Math.max(2, Math.min(w, h) * 0.09); cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.stroke(p); }
        else { cx.fillStyle = it.tint; cx.fill(p); }
        cx.restore();
      }
    }
    async function renderPageCanvas(pg, scale) {
      const cv = document.createElement('canvas'); cv.width = Math.round(PAGE_W * scale); cv.height = Math.round(PAGE_H * scale);
      const cx = cv.getContext('2d'); cx.scale(scale, scale); drawBg(cx, pg.bg);
      for (const it of pg.items.slice().sort(byZ)) {
        cx.save(); cx.translate(it.x + it.w / 2, it.y + it.h / 2); cx.rotate(it.rot * Math.PI / 180); cx.translate(-it.w / 2, -it.h / 2);
        try { await drawItem(cx, it); } catch (e) { /* skip one broken item rather than lose the picture */ }
        cx.restore();
      }
      return cv;
    }
    async function exportPage() {
      const btn = q('[data-a="export"]'); if (btn) btn.disabled = true;
      try {
        const cv = await renderPageCanvas(curPage(), 1), cx = cv.getContext('2d'), ref = wmRef();
        if (ref) { cx.font = '12px ' + FONT.sans; cx.textAlign = 'right'; cx.textBaseline = 'alphabetic'; cx.fillStyle = 'rgba(40,40,40,.5)'; cx.fillText(ref, PAGE_W - 10, PAGE_H - 10); }
        const blob = await new Promise(r => cv.toBlob(r, 'image/png')); if (!blob) throw new Error('could not make the picture');
        let bytes = new Uint8Array(await blob.arrayBuffer()); if (ref) bytes = pngWithText(bytes, 'Comment', ref);
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        a.download = (S.book.title.replace(/[^\w\- ]+/g, '').trim() || 'scrapbook') + ' - page ' + (S.pageIdx + 1) + '.png'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Saved your page as a picture \ud83d\udcf8');
      } catch (e) { toast('Couldn\u2019t save the picture: ' + e.message); }
      if (btn) btn.disabled = false;
    }

    /* ----- sharing (M3, backend v2.8.0): flattens the current page to a JPEG + a small thumbnail and
       sends it to shareScrapPage. Nothing leaves the device until the student presses "Share this page" \u2014
       see js/cloud.js's shareScrapPage/unshareScrapPage/subscribeMyScrapPages. ----- */
    function closeShareModal() { S.modal = ''; const m = q('.sc-modal'); if (m) { m.hidden = true; m.innerHTML = ''; } }
    function openShareModal() { if (!policy().studentSharing) { toast(MSG['sharing-off']); return; } S.modal = 'share'; renderShareModal(); }
    function renderShareModal() {
      const m = q('.sc-modal'); if (!m) return;
      const list = S.myPages.length
        ? '<ul class="sc-sharelist">' + S.myPages.map(p => (
            '<li><b>' + esc(p.title || 'Untitled') + '</b> \u2014 ' + esc(SCRAP_STATUS[p.status] || p.status) +
            ' <span class="muted">(' + p.audiences.map(a => a === 'family' ? 'family' : 'class').join(' + ') + ')</span>' +
            '<button type="button" class="btn" data-unshare="' + p.id + '">Unshare</button></li>'
          )).join('') + '</ul>'
        : '<p class="muted">You haven\u2019t shared any pages yet.</p>';
      m.innerHTML =
        '<div class="sc-mcard" role="dialog" aria-label="Share this page">' +
        '<h3>\ud83d\udce4 Share this page</h3>' +
        '<label class="sc-mlabel">Title<input type="text" class="sc-mtitle" maxlength="80" value="' + esc((S.book.title || 'My scrapbook') + ' \u2014 page ' + (S.pageIdx + 1)) + '"></label>' +
        '<label class="sc-mlabel">Caption (optional)<textarea class="sc-mcaption" maxlength="140" rows="2"></textarea></label>' +
        '<div class="sc-maud"><label><input type="checkbox" class="sc-maud-f" checked> My family</label><label><input type="checkbox" class="sc-maud-c"> My class</label></div>' +
        '<p class="muted sc-mhint">Please don\u2019t share pictures of other people without asking them first.</p>' +
        '<div class="sc-mbtns"><button type="button" class="btn" data-a="modal-cancel">Cancel</button><button type="button" class="btn primary" data-a="modal-share">Share this page</button></div>' +
        '<h4>Pages you\u2019ve shared</h4>' + list +
        '</div>';
      m.hidden = false;
    }
    async function shareCurrentPage() {
      const m = q('.sc-modal'); if (!m || S.sharing) return;
      const title = (q('.sc-mtitle', m).value || '').trim().slice(0, 80);
      if (!title) { toast('Give this page a title.'); return; }
      const caption = (q('.sc-mcaption', m).value || '').trim().slice(0, 140);
      const audiences = []; if (q('.sc-maud-f', m).checked) audiences.push('family'); if (q('.sc-maud-c', m).checked) audiences.push('class');
      if (!audiences.length) { toast('Pick My family, My class, or both.'); return; }
      S.sharing = true; const btn = q('[data-a="modal-share"]', m); if (btn) btn.disabled = true;
      try {
        const pg = curPage();
        const full = await renderPageCanvas(pg, 1), thumbCv = await renderPageCanvas(pg, 0.2);
        const containsPhotos = pg.items.some(it => it.type === 'photo');
        await SDCloud.shareScrapPage({
          title, caption, audiences, containsPhotos,
          thumbDataUrl: thumbCv.toDataURL('image/jpeg', 0.7),
          imageDataUrl: full.toDataURL('image/jpeg', 0.82)
        });
        toast('Shared \u2014 waiting for your teacher to approve it.');
        closeShareModal();
      } catch (e) { toast('Couldn\u2019t share this page: ' + (e.message || e)); }
      S.sharing = false; if (btn) btn.disabled = false;
    }
    async function unsharePage(pageId) {
      try { await SDCloud.unshareScrapPage(pageId); toast('Unshared.'); } catch (e) { toast('Couldn\u2019t unshare: ' + (e.message || e)); }
    }

    /* ----- pages ----- */
    function goPage(i) { S.pageIdx = Math.max(0, Math.min(S.book.pageOrder.length - 1, i)); S.sel = null; S.editing = null; drawPage(); }
    function addPage() {
      if (S.book.pageOrder.length >= C.LIMITS.maxPagesPerBook) { toast('A scrapbook can have ' + C.LIMITS.maxPagesPerBook + ' pages at most.'); return; }
      const p = C.newPage(curPage().bg); S.book.pageOrder.splice(S.pageIdx + 1, 0, p.id); S.book.pages[p.id] = p; S.pageIdx++; S.sel = null; commit(); drawPage();
    }
    function delPage() {
      const o = S.book.pageOrder; if (o.length < 2) return; const pg = curPage();
      if (pg.items.length && !confirm('Delete page ' + (S.pageIdx + 1) + ' and the ' + plural(pg.items.length, 'thing') + ' on it?')) return;
      delete S.book.pages[o[S.pageIdx]]; o.splice(S.pageIdx, 1); S.pageIdx = Math.min(S.pageIdx, o.length - 1); S.sel = null; commit(); drawPage();
    }
    function movePage(d) { const o = S.book.pageOrder, j = S.pageIdx + d; if (j < 0 || j >= o.length) return; [o[S.pageIdx], o[j]] = [o[j], o[S.pageIdx]]; S.pageIdx = j; commit(); drawPage(); }

    /* ----- events ----- */
    body.addEventListener('click', e => {
      if (e.target.classList && e.target.classList.contains('sc-modal')) { closeShareModal(); return; }   // click on the overlay (not the card inside it) closes it
      const sticker = e.target.closest('[data-sticker]'), svg = e.target.closest('[data-svg]'), shape = e.target.closest('[data-shape]');
      if (sticker) { closePop(); addItem({ type: 'sticker', glyph: sticker.dataset.sticker, w: 160, h: 160 }); return; }
      const stampB = e.target.closest('[data-stamp]'), layoutB = e.target.closest('[data-layout]');
      if (stampB) { closePop(); addItem({ type: 'stamp', stampId: stampB.dataset.stamp, w: 160, h: 160, tint: '#c0392b', ink: 0.85 }); keepFocusHere(); return; }
      if (layoutB) { closePop(); addLayoutPage(layoutB.dataset.layout); return; }
      if (svg) { closePop(); addItem({ type: 'sticker', svgId: svg.dataset.svg, w: 170, h: 170 }); return; }
      if (shape) { const k = shape.dataset.shape; closePop(); addItem({ type: 'shape', kind: k, w: 200, h: 200, fill: PALETTE[Object.keys(SHAPE_PATH).indexOf(k) % PALETTE.length] }); return; }
      const unshareBtn = e.target.closest('[data-unshare]'); if (unshareBtn) { unsharePage(unshareBtn.dataset.unshare); return; }
      const galTabBtn = e.target.closest('[data-galtab]'); if (galTabBtn) { S.galTab = galTabBtn.dataset.galtab; showGallery(); return; }
      const b = e.target.closest('[data-a]'); if (!b || b.disabled || b.tagName === 'SELECT' || b.type === 'checkbox') return;
      const a = b.dataset.a, card = e.target.closest('.sc-card'), it = S.book ? selItem() : null;
      switch (a) {
        case 'new': newBook(); break;
        case 'backup': if (card) backupBook(card.dataset.id); break;
        case 'restore': { const f = q('.sc-restore'); if (f) f.click(); break; }
        case 'pen': setTool(S.tool === 'pen' ? '' : 'pen'); break;
        case 'pendone': setTool(''); break;
        case 'tape': addItem({ type: 'tape', w: 220, h: 46, color: ['#f4a6c0', '#9bd3f0', '#ffd166', '#b8e0a8'][curPage().items.length % 4], pattern: 'stripes', rot: -4 }); break;
        case 'note': { const n = addItem({ type: 'note', text: 'Write here\u2026', w: 280, h: 210, color: '#fff3b0' }); if (n) startTextEdit(n); break; }
        case 'stamps': openPop('stamps'); break;
        case 'layouts': openPop('layouts'); break;
        case 'crop': if (it) { if (S.cropping === it.id) endCrop(); else startCrop(it); } break;
        case 'group': { const ids = selIds(); if (C.groupItems(curPage().items, ids)) { commit(); updateCtx(); toast('Grouped ' + ids.length + ' things'); } break; }
        case 'ungroup': C.ungroupItems(curPage().items, selIds()); commit(); updateCtx(); break;
        case 'mdel': removeMany(selIds()); break;
        case 'open': if (card) openBook(card.dataset.id); break;
        case 'dup': if (card) dupBook(card.dataset.id); else if (it) duplicateItem(it); break;
        case 'del': if (card) delBook(card.dataset.id); else if (it) removeItem(it); break;
        case 'back': showGallery(); break;
        case 'undo': undo(); break; case 'redo': redo(); break;
        case 'export': exportPage(); break;
        case 'share': openShareModal(); break;
        case 'modal-cancel': closeShareModal(); break;
        case 'modal-share': shareCurrentPage(); break;
        case 'pprev': goPage(S.pageIdx - 1); break; case 'pnext': goPage(S.pageIdx + 1); break;
        case 'padd': addPage(); break; case 'pdel': delPage(); break; case 'pleft': movePage(-1); break; case 'pright': movePage(1); break;
        case 'addphoto': { const ok = C.canAddPhoto(S.book, policy()); if (!ok.ok) toast(MSG[ok.reason]); else q('.sc-file').click(); break; }
        case 'addtext': { const t = addItem({ type: 'text', text: 'Your text', w: 360, h: 70, size: 40 }); if (t) startTextEdit(t); break; }
        case 'stickers': openPop('stickers'); break; case 'shapes': openPop('shapes'); break;
        case 'zfront': if (it) moveZ(it, 'front'); break; case 'zback': if (it) moveZ(it, 'back'); break;
        case 'zfwd': if (it) moveZ(it, 'forward'); break; case 'zbwd': if (it) moveZ(it, 'backward'); break;
        case 'edittext': if (it) startTextEdit(it); break;
      }
    });
    body.addEventListener('change', e => {
      const t = e.target;
      if (t.classList && t.classList.contains('sc-file')) { const f = [...t.files]; t.value = ''; importFiles(f); return; }
      if (t.classList && t.classList.contains('sc-restore')) { const f = t.files[0]; t.value = ''; restoreFile(f); return; }
      if (t.dataset.pen === 'color') { S.penColor = t.value; return; }
      if (t.dataset.pen === 'width') { S.penWidth = Number(t.value) || 4; return; }
      if (t.dataset.a === 'snap') { S.grid = t.checked; return; }
      if (t.dataset.a === 'bg') { curPage().bg = t.value; commit(); drawPage(); return; }
      if (t.dataset.p) { const it = selItem(); if (it) setProp(it, t.dataset.p, t.type === 'checkbox' ? t.checked : t.value); }
    });
    body.addEventListener('input', e => { if (e.target.classList.contains('sc-title') && S.book) { S.book.title = String(e.target.value).trim().slice(0, C.LIMITS.maxTitle) || 'My scrapbook'; scheduleSave(); } });
    body.addEventListener('keydown', e => {
      if (S.view !== 'editor' || !S.book || S.editing || e.isComposing) return;
      const t = e.target; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;   // v0.13.0: let a focused button do its own job (Enter on "Done moving" toggled crop twice)
      const mod = e.ctrlKey || e.metaKey, k = e.key;
      if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
      if (k === 'Escape') { if (S.modal) { closeShareModal(); e.preventDefault(); } else if (S.cropping) { endCrop(); e.preventDefault(); } else if (S.tool) { setTool(''); e.preventDefault(); } else if (S.pop) { closePop(); e.preventDefault(); } else if (S.sel) { select(null); e.preventDefault(); } return; }
      const many = selIds();
      if (many.length > 1) {   // v0.13.0: keys act on the whole selection
        if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeMany(many); }
        else if (k.startsWith('Arrow')) {
          e.preventDefault(); const st = e.shiftKey ? 10 : 1, dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
          C.moveItems(curPage().items, many, dx * st, dy * st); many.forEach(id => { const i = curPage().items.find(x => x.id === id); if (i) refreshItem(i); });
          clearTimeout(S.keyT); S.keyT = setTimeout(() => { if (S.book && S.hist) commit(); }, 350);
        }
        return;
      }   // preventDefault so the shell does not also close the page
      const it = selItem(); if (!it) return;
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); removeItem(it); }
      else if (k === 'Enter' && S.cropping === it.id) { e.preventDefault(); endCrop(); }
      else if (S.cropping === it.id && k.startsWith('Arrow')) { e.preventDefault(); const st = e.shiftKey ? 40 : 10; cropBy(it, k === 'ArrowLeft' ? st : k === 'ArrowRight' ? -st : 0, k === 'ArrowUp' ? st : k === 'ArrowDown' ? -st : 0); clearTimeout(S.keyT); S.keyT = setTimeout(() => { if (S.book && S.hist) commit(); }, 350); }
      else if (k === 'Enter' && (it.type === 'text' || it.type === 'note')) { e.preventDefault(); startTextEdit(it); }
      else if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); duplicateItem(it); }
      else if (k === ']' || k === '}' || e.code === 'BracketRight') { e.preventDefault(); moveZ(it, e.shiftKey ? 'front' : 'forward'); }   // v0.13.0: with Shift held the key is "}" / "{" — Shift+[ and Shift+] never fired before
      else if (k === '[' || k === '{' || e.code === 'BracketLeft') { e.preventDefault(); moveZ(it, e.shiftKey ? 'back' : 'backward'); }
      else if (k === 'r' || k === 'R') { e.preventDefault(); it.rot = C.normDeg(it.rot + (e.shiftKey ? -15 : 15)); refreshItem(it); commit(); }
      else if (k.startsWith('Arrow')) {
        e.preventDefault(); const st = e.shiftKey ? 10 : 1, dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
        if (e.altKey) { const g = { w: C.clamp(it.w + dx * st * 5, C.LIMITS.minItem, C.LIMITS.maxItem), h: C.clamp(it.h + dy * st * 5, C.LIMITS.minItem, C.LIMITS.maxItem) }; Object.assign(it, g); }
        else { const n = C.nudge(it, dx * st, dy * st, 0); it.x = n.x; it.y = n.y; }
        refreshItem(it); clearTimeout(S.keyT); S.keyT = setTimeout(() => { if (S.book && S.hist) commit(); }, 350);
      }
    });
    const onHide = () => { flushSave(); };
    const onOutside = e => { if (S.pop && !e.target.closest('.sc-pop') && !e.target.closest('[data-a="stickers"],[data-a="shapes"],[data-a="stamps"],[data-a="layouts"]')) closePop(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('pointerdown', onOutside);
    showGallery();

    return function cleanup() {
      S.alive = false; clearTimeout(S.thumbT); clearTimeout(S.keyT);
      window.removeEventListener('pagehide', onHide); document.removeEventListener('pointerdown', onOutside);
      if (S.ro) S.ro.disconnect(); if (S.policyUnsub) { try { S.policyUnsub(); } catch (e) {} }
      if (S.scrapUnsub) { try { S.scrapUnsub(); } catch (e) {} }
      if (S.classGalUnsub) { try { S.classGalUnsub(); } catch (e) {} }
      if (S.dirty && S.book) { const rec = clone(S.book); rec.updated = Date.now(); S.store.putBook(rec).catch(() => {}); }
      Object.values(S.assets).forEach(a => { try { URL.revokeObjectURL(a.url); } catch (e) {} });
    };
  };
})();

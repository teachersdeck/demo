/* StudentDeck: items the family bought in ParentDeck's Shop (v0.25.0, backend v2.32.0, Item Store scope S1).
 *
 * Never a shop here: StudentDeck shows no price, no buy button and no payment link (store scope rule 1).
 *   - What the family owns arrives on students/{id}.store.items (the backend copies it from the parents' purchases);
 *     the pack data (premium themes, watch faces) comes from getMyPacks and is kept on this device (localStorage),
 *     checked with StoreCore.validateStorePack before use, so it works offline.
 *   - Locked items show only when the school allows it (AdminDeck's studentStore switch; a child in no class: yes), greyed,
 *     with "ask a grown-up at home" and, where the parent allows it, "I'd like this" (at most 3, shown in ParentDeck).
 *   - Cosmetic only: nothing here gives XP or points.
 * Loaded before app.js; app.js draws the theme pop and the Clock with what this returns. */
const SD_STORE = (() => {
  const KEY = 'sd_store_packs', FILES = 'sd_store_files';   // FILES: { files:[packId], hidden:[packId] }
  const listeners = new Set();
  let packs = {}, view = null, ownedSkus = [], unsub = null, lastItems = '';
  try { const raw = JSON.parse(localStorage.getItem(KEY)) || {}; Object.values(raw).forEach(p => { const v = StoreCore.validateStorePack(p, { scrap: typeof ScrapCore !== 'undefined' ? ScrapCore : undefined }); if (v.ok) packs[v.pack.id] = v.pack; }); } catch (e) { packs = {}; }
  let meta = { files: [], hidden: [] };
  try { const m = JSON.parse(localStorage.getItem(FILES)); if (m && Array.isArray(m.files) && Array.isArray(m.hidden)) meta = m; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(packs)); localStorage.setItem(FILES, JSON.stringify(meta)); } catch (e) {} };
  const notify = () => listeners.forEach(f => { try { f(); } catch (e) {} });
  const cloudOk = () => typeof SDCloud !== 'undefined' && SDCloud.getStore && SDCloud.getStatus && SDCloud.getStatus() === 'joined';

  async function sync() {
    if (!cloudOk()) return;
    const have = {}; Object.values(packs).forEach(p => { have[p.id] = p.version; });
    try {
      const r = await SDCloud.getMyPacks(have);
      (r.packs || []).forEach(p => { const v = StoreCore.validateStorePack(p, { scrap: typeof ScrapCore !== 'undefined' ? ScrapCore : undefined }); if (v.ok) packs[v.pack.id] = v.pack; });
      const keep = new Set(r.current || []);
      Object.keys(packs).forEach(id => { if (!keep.has(id) && meta.files.indexOf(id) < 0) delete packs[id]; });   // a refunded pack leaves this device too (files you loaded stay)
      save();
    } catch (e) { /* offline: keep what is here */ }
    try { view = await SDCloud.getStore(); } catch (e) {}
    notify();
  }
  const items = kind => Object.values(packs).filter(p => p.kind === kind && meta.hidden.indexOf(p.id) < 0).flatMap(p => p.items.map(item => ({ key: `pk:${p.id}:${item.id}`, sku: p.sku, pack: p, item })));
  /** Greyed items of a kind the family doesn't own yet: names and swatches only, and only when the school allows it. */
  function locked(kind) {
    if (!view || !view.showLocked) return [];
    return view.catalog.filter(c => c.kind === kind && !view.owned.includes(c.sku))
      .flatMap(c => ((view.swatches || {})[c.sku] || []).map(s => ({ sku: c.sku, packName: c.name, name: s.name, swatch: s.swatch })));
  }
  async function toggleWish(sku) {
    if (!view || !view.wishesOn) return null;
    const on = !view.wishes.includes(sku);
    const r = await SDCloud.setStoreWish(sku, on);
    view.wishes = r.wishes || []; notify();
    return view.wishes;
  }

  if (typeof SDCloud !== 'undefined' && SDCloud.onStatusChanged) {
    SDCloud.onStatusChanged(st => {
      if (st === 'joined' && !unsub && SDCloud.subscribeStudent) {
        unsub = SDCloud.subscribeStudent(s => {
          const now = JSON.stringify((s && s.store && s.store.items) || []);
          ownedSkus = JSON.parse(now);
          if (now !== lastItems) { lastItems = now; sync(); }
          else if (view && s && s.store) { view.wishes = s.store.wishes || []; notify(); }
        });
      }
      if (st === 'signedOut') { if (unsub) { unsub(); unsub = null; } packs = {}; view = null; lastItems = ''; save(); notify(); }
    });
  }


  /* "New" items: packs that arrived since the person last looked (a purchase, or a file). The first run counts what is
     already here as seen, so nobody gets a pile of "new" on day one. */
  const SEEN_KEY = 'sd_store_seen';
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY)); } catch (e) { seen = null; }
  if (!Array.isArray(seen)) { seen = Object.keys(packs); try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) {} }
  function newPacks() { return Object.values(packs).filter(p => seen.indexOf(p.id) < 0 && meta.hidden.indexOf(p.id) < 0); }
  function markSeen(ids) { (ids || Object.keys(packs)).forEach(id => { if (seen.indexOf(id) < 0) seen.push(id); }); try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) {} notify(); }

  /* Store files (.tdpack) from the Themes menu's Browse… button (js/store-zip.js checks them and their licence). */
  async function addFile(file) {
    if (!file || typeof StoreZip === 'undefined') return { ok: false, error: 'unsupported' };
    const j = typeof SDCloud !== 'undefined' && SDCloud.getJoined ? SDCloud.getJoined() : null;
    const r = await StoreZip.openTdpack(await file.arrayBuffer(), { who: { studentId: j && j.studentId }, scrap: typeof ScrapCore !== 'undefined' ? ScrapCore : undefined });
    if (!r.ok) return r;
    r.packs.forEach(p => { packs[p.id] = p; if (meta.files.indexOf(p.id) < 0) meta.files.push(p.id); meta.hidden = meta.hidden.filter(x => x !== p.id); });
    save(); notify();
    return r;
  }
  /** Remove: a file's pack leaves this device; a pack from the family's purchases is hidden until Reset. */
  function removePack(id) {
    if (meta.files.indexOf(id) >= 0) { delete packs[id]; meta.files = meta.files.filter(x => x !== id); }
    else if (meta.hidden.indexOf(id) < 0) meta.hidden.push(id);
    save(); notify();
  }
  /** Reset to default: every loaded file removed, every hidden item shown again. The app puts its own defaults back. */
  function resetAll() { meta.files.forEach(id => { delete packs[id]; }); meta = { files: [], hidden: [] }; save(); notify(); }
  function loaded() {
    return Object.values(packs).map(p => ({ id: p.id, kind: p.kind, name: p.name, swatch: (p.items[0] && p.items[0].swatch) || null,
      fromFile: meta.files.indexOf(p.id) >= 0, hidden: meta.hidden.indexOf(p.id) >= 0 }));
  }

  return {
    addFile, removePack, resetAll, loaded, newPacks, markSeen,
    themes: () => items('theme'), faces: () => items('face'), docks: () => items('dock'),
    scrapPacks: () => Object.values(packs).filter(p => ['sticker', 'stamp', 'mask', 'layout'].indexOf(p.kind) >= 0 && meta.hidden.indexOf(p.id) < 0),
    dockByKey: key => items('dock').find(x => x.key === key) || null, lockedDocks: () => locked('dock'),
    themeByKey: key => items('theme').find(x => x.key === key) || null,
    faceByKey: key => items('face').find(x => x.key === key) || null,
    lockedThemes: () => locked('theme'), lockedFaces: () => locked('face'),
    wishes: () => (view && view.wishes) || [], wishesOn: () => !!(view && view.wishesOn), maxWishes: () => (view && view.maxWishes) || 3,
    toggleWish, sync, onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

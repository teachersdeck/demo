/* AdminDeck — theme helpers (v0.5.0): custom background image storage, and turning a theme into the small payload that is pushed to
   TeachersDeck. No DOM wiring here (that is in app.js); the parts that can be unit-tested are pure (tools/test_theme.js).

   The pushed theme is deliberately small: Firestore documents are capped at 1 MiB and the backend (functions/adminTheme.js) refuses
   anything over MAX_CHARS, so a picked photo is re-drawn at a sensible size as a JPEG before it leaves the browser. */
const AD_THEME = (function(){
  const PRESET_IDS = ['dusk', 'chalk', 'ocean', 'sunrise', 'slate', 'plain'];   // same six as TeachersDeck's Theme drawer
  const MAX_CHARS = 700000;                                                    // data-URL length cap, enforced again server-side
  const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

  /* Pure. render(edge, quality) -> data URL (or '' if it can't draw). Tries progressively smaller/lower-quality versions until one fits
     under maxChars, and returns { url, edge, quality } or null if nothing fits. */
  function fitDataUrl(render, opts){
    const o = Object.assign({ maxEdge:1600, minEdge:640, maxChars:MAX_CHARS, qualities:[0.82, 0.72, 0.62, 0.5, 0.4] }, opts || {});
    for(let edge = o.maxEdge; edge >= o.minEdge; edge = Math.floor(edge * 0.8)){
      for(const q of o.qualities){
        const url = render(edge, q);
        if(url && url.length <= o.maxChars) return { url, edge, quality:q };
      }
    }
    return null;
  }

  /* Browser only: draw the picked image onto a canvas at most `edge` px on its long side and export a JPEG. */
  async function blobToDataUrl(blob, opts){
    let bmp = null, img = null, objUrl = null;
    if(typeof createImageBitmap === 'function'){ try{ bmp = await createImageBitmap(blob); }catch(e){ bmp = null; } }
    if(!bmp){
      objUrl = URL.createObjectURL(blob);
      img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = objUrl; });
    }
    const src = bmp || img, w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    try{
      const res = fitDataUrl((edge, q) => {
        const s = Math.min(1, edge / Math.max(w, h)), cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
        const c = document.createElement('canvas'); c.width = cw; c.height = ch;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#12161C'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(src, 0, 0, cw, ch);
        return c.toDataURL('image/jpeg', q);
      }, opts);
      if(!res) throw new Error('That image is too detailed to send. Try a smaller picture.');
      return res.url;
    } finally { if(objUrl) URL.revokeObjectURL(objUrl); if(bmp && bmp.close) bmp.close(); }
  }

  /* Pure. What gets pushed: a preset id OR an image data URL (never both), plus the dim flag. version = ms timestamp; TeachersDeck applies a
     push once per version. Throws a short message the UI can show. */
  function buildPayload(look, now){
    if(look && look.image){
      if(!DATA_URL_RE.test(look.image) || look.image.length > MAX_CHARS) throw new Error('The background image is not in a form that can be sent.');
      return { preset:null, image:look.image, dim:!!look.dim, version:now || Date.now() };
    }
    const preset = look && look.preset;
    if(!PRESET_IDS.includes(preset)) throw new Error('Pick one of the built-in themes or upload an image first.');
    return { preset, image:null, dim:!!look.dim, version:now || Date.now() };
  }

  /* ---------- IndexedDB (custom background images; localStorage is too small for photos) ---------- */
  const idb = {
    _db:null,
    open(){
      if(this._db) return Promise.resolve(this._db);
      return new Promise((resolve, reject) => {
        if(typeof indexedDB === 'undefined'){ reject(new Error('indexedDB unavailable in this browsing context')); return; }
        const req = indexedDB.open('AdminDeck', 1);
        req.onupgradeneeded = () => { const db = req.result; if(!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath:'id' }); };
        req.onsuccess = () => { this._db = req.result; resolve(this._db); };
        req.onerror = () => reject(req.error);
      });
    },
    async _tx(mode, fn){
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('images', mode), st = tx.objectStore('images'), r = fn(st);
        tx.oncomplete = () => resolve(r && r.result);
        tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    },
    put(rec){ return this._tx('readwrite', st => st.put(rec)); },
    get(id){ return this._tx('readonly', st => st.get(id)); },
    delete(id){ return this._tx('readwrite', st => st.delete(id)); },
    destroy(){ try{ if(this._db) this._db.close(); this._db = null; if(typeof indexedDB !== 'undefined') indexedDB.deleteDatabase('AdminDeck'); }catch(e){} }
  };

  return { PRESET_IDS, MAX_CHARS, DATA_URL_RE, fitDataUrl, blobToDataUrl, buildPayload, idb };
})();
if(typeof module !== 'undefined') module.exports = AD_THEME;

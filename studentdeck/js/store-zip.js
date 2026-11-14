/* Store files (.tdpack) — owner's idea, 10 Nov 2026: every store item can be delivered as a file and loaded from the
 * Themes menu (Browse…), removed again, or reset back to the defaults.
 *
 * A .tdpack is an ordinary zip:
 *   tdpack.json   { format:1, title, packs:['theme-aurora.json', …], licence? }
 *   <pack>.json   store packs (StoreCore.validateStorePack: data only — themes, faces, docks, meters, lights)
 * Free packs need no licence. Paid packs load only with a licence signed by the TeachersDeck server (ECDSA P-256), which
 * names who bought them and the SHA-256 of every pack file, so a file can't be passed to another family or edited:
 *   licence = { v:1, skus:[…], files:{ name: sha256hex }, owner:{ students:[id], parents:[uid] } | { proKey }, issued, sig }
 * The signature covers canonical JSON of everything but `sig`.
 *
 * Runs in the browser (window.StoreZip) and under Node (the backend signs; tools write the files). Uses only built-ins:
 * DecompressionStream for zipped entries, crypto.subtle for SHA-256 and ECDSA. Canonical copy: studentdeck/js/store-zip.js
 * (check_shared.py keeps parentdeck/js/ and backend/functions/src/ identical).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./store-core'));
  else root.StoreZip = factory(root.StoreCore);
})(typeof self !== 'undefined' ? self : this, function (StoreCore) {
  'use strict';

  var MAX_FILE = 4 * 1024 * 1024;     // a whole .tdpack
  var MAX_ENTRIES = 64;
  var MAX_ENTRY = 512 * 1024;          // one pack file, unzipped
  var NAME_RE = /^[a-z0-9][a-z0-9_-]{0,60}\.json$/;

  // The server's public key (JWK, P-256). Set when the owner creates the signing key (tools/store/make_signing_key.js);
  // until then, paid packs from files are refused with 'signing-off'.
  var PUBLIC_KEY = null;

  var enc = new TextEncoder(), dec = new TextDecoder();
  var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;

  /* ---------- zip ---------- */
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  /** Writes a zip (entries stored, not compressed: packs are small and this keeps the writer tiny). files: { name: string|Uint8Array } */
  function writeZip(files) {
    var parts = [], central = [], offset = 0;
    Object.keys(files).forEach(function (name) {
      var data = typeof files[name] === 'string' ? enc.encode(files[name]) : files[name], nm = enc.encode(name), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(h.buffer), nm, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), nm);
      offset += 30 + nm.length + data.length;
    });
    var csize = central.reduce(function (n, p) { return n + p.length; }, 0), count = Object.keys(files).length;
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, count, true); e.setUint16(10, count, true); e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(e.buffer)]), out = new Uint8Array(all.reduce(function (n, p) { return n + p.length; }, 0)), at = 0;
    all.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('unzip-unsupported');
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Reads a zip into { name: Uint8Array }. Only stored and deflated entries; names are checked by the caller. */
  async function readZip(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8.length > MAX_FILE) throw new Error('too-big');
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not-a-zip');
    var count = dv.getUint16(eocd + 10, true), cdir = dv.getUint32(eocd + 16, true), out = {};
    if (count > MAX_ENTRIES) throw new Error('too-many-files');
    for (var n = 0, p = cdir; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad-zip');
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (/\/$/.test(name)) continue;                                   // a folder
      if (usize > MAX_ENTRY) throw new Error('file-too-big');
      var start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true), raw = u8.subarray(start, start + csize);
      var data = method === 0 ? raw.slice() : method === 8 ? await inflateRaw(raw) : null;
      if (!data) throw new Error('unsupported-compression');
      if (crc32(data) !== dv.getUint32(p - (46 + nlen + xlen + clen) + 16, true)) throw new Error('damaged');
      out[name.split('/').pop()] = data;                                // packs may sit in a folder inside the zip
    }
    return out;
  }

  /* ---------- licence ---------- */
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  var hex = function (buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); };
  var b64 = function (u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
  var unb64 = function (s) { var bin = atob(s), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; };
  async function sha256(u8) { return hex(await subtle.digest('SHA-256', u8)); }
  function unsigned(lic) { var o = {}; Object.keys(lic).forEach(function (k) { if (k !== 'sig') o[k] = lic[k]; }); return o; }

  /** Server side: signs a licence with the private key (JWK). Returns the licence with `sig` (base64, raw r||s). */
  async function signLicence(lic, privateJwk) {
    var key = await subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    var sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(canonical(unsigned(lic))));
    return Object.assign({}, unsigned(lic), { sig: b64(new Uint8Array(sig)) });
  }
  async function verifyLicence(lic, publicJwk) {
    if (!lic || typeof lic.sig !== 'string' || !publicJwk || !subtle) return false;
    try {
      var key = await subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64(lic.sig), enc.encode(canonical(unsigned(lic))));
    } catch (e) { return false; }
  }
  /** Is this licence for the person loading it? who: { studentId } | { parentUid } | { proKey } */
  function licenceFits(lic, who) {
    var o = (lic && lic.owner) || {};
    if (who.studentId && Array.isArray(o.students) && o.students.indexOf(who.studentId) >= 0) return true;
    if (who.parentUid && Array.isArray(o.parents) && o.parents.indexOf(who.parentUid) >= 0) return true;
    if (who.proKey && o.proKey && o.proKey === who.proKey) return true;
    return false;
  }

  /** Builds a .tdpack (Uint8Array). packs: validated store packs; licence: a signed licence or null (free packs). */
  function makeTdpack(packs, title, licence) {
    var files = {}, list = [];
    packs.forEach(function (p) { var n = p.id + '.json'; files[n] = JSON.stringify(p); list.push(n); });
    files['tdpack.json'] = JSON.stringify({ format: 1, title: String(title || '').slice(0, 80), packs: list, licence: licence || null });
    return writeZip(files);
  }
  /** The file hashes a licence must name (the server signs these). */
  async function packHashes(packs) {
    var out = {};
    for (var i = 0; i < packs.length; i++) out[packs[i].id + '.json'] = await sha256(enc.encode(JSON.stringify(packs[i])));
    return out;
  }

  /**
   * Opens a .tdpack chosen with Browse…. opts: { who, publicKey? (default PUBLIC_KEY), scrap? (ScrapCore) }.
   * Resolves to { ok:true, title, packs:[validated], refused:[{ file, why }] } or { ok:false, error }.
   * Free packs load; paid ones need a valid licence for `who` naming the exact file.
   */
  async function openTdpack(buf, opts) {
    opts = opts || {};
    var files;
    try { files = await readZip(buf); } catch (e) { return { ok: false, error: e.message }; }
    var man; try { man = JSON.parse(dec.decode(files['tdpack.json'] || new Uint8Array())); } catch (e) { man = null; }
    if (!man || man.format !== 1 || !Array.isArray(man.packs)) return { ok: false, error: 'not-a-tdpack' };
    var lic = man.licence || null, licOk = false, pub = opts.publicKey || PUBLIC_KEY;
    if (lic) licOk = !!pub && await verifyLicence(lic, pub) && licenceFits(lic, opts.who || {});
    var packs = [], refused = [];
    for (var i = 0; i < man.packs.length && i < MAX_ENTRIES; i++) {
      var name = man.packs[i];
      if (typeof name !== 'string' || !NAME_RE.test(name) || !files[name]) { refused.push({ file: String(name).slice(0, 60), why: 'missing' }); continue; }
      var raw; try { raw = JSON.parse(dec.decode(files[name])); } catch (e) { refused.push({ file: name, why: 'not-json' }); continue; }
      var v = StoreCore.validateStorePack(raw, { scrap: opts.scrap });
      if (!v.ok) { refused.push({ file: name, why: 'invalid' }); continue; }
      if (v.pack.tier !== 'free') {
        if (!lic) { refused.push({ file: name, why: pub ? 'no-licence' : 'signing-off' }); continue; }
        if (!licOk) { refused.push({ file: name, why: 'licence' }); continue; }
        if (lic.skus.indexOf(v.pack.sku) < 0 || !lic.files || lic.files[name] !== await sha256(files[name])) { refused.push({ file: name, why: 'licence' }); continue; }
      }
      packs.push(v.pack);
    }
    return { ok: true, title: String(man.title || ''), packs: packs, refused: refused };
  }

  return {
    writeZip: writeZip, readZip: readZip, crc32: crc32, canonical: canonical, sha256: sha256,
    signLicence: signLicence, verifyLicence: verifyLicence, licenceFits: licenceFits,
    makeTdpack: makeTdpack, packHashes: packHashes, openTdpack: openTdpack,
    setPublicKey: function (k) { PUBLIC_KEY = k; }, publicKey: function () { return PUBLIC_KEY; },
  };
});

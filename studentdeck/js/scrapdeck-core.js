/* Scrapdeck core: pure logic with no DOM, no storage, no Firebase.
 * Runs in the browser (window.ScrapCore) and under Node (module.exports),
 * so it can be tested without a browser. Plain JS, no build step.
 *
 * Item geometry: x, y = top-left of the UNROTATED box; w, h = size;
 * rot = degrees, rotated about the box centre (CSS transform-origin: center).
 * Page space is a fixed 1200 x 800 logical canvas.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScrapCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PAGE_W = 1200, PAGE_H = 800;
  var LIMITS = {
    maxPhotosPerBook: 60,
    maxItemsPerPage: 200,
    maxPagesPerBook: 30,
    maxBooks: 20,
    undoSteps: 50,
    importLongEdge: 1600,
    jpegQuality: 0.82,
    minItem: 24,
    maxItem: 4000,
    maxText: 2000,
    maxTitle: 80
  };
  var ITEM_TYPES = ['photo', 'text', 'sticker', 'shape', 'tape', 'note', 'pen', 'stamp'];   // stamp: v0.13.0 (M2)
  var BACKGROUNDS = ['white', 'cream', 'kraft', 'dots', 'grid', 'lined', 'mint', 'sky', 'blush'];
  var FRAMES = ['plain', 'polaroid', 'taped'];
  var SHAPES = ['rect', 'round', 'circle', 'triangle', 'star', 'heart'];
  var FONTS = ['sans', 'serif', 'mono', 'hand'];           // keys into a system font stack
  var ALIGNS = ['left', 'center', 'right'];
  var COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;
  var SVGID_RE = /^[a-z0-9_-]{1,40}$/;

  var PACK_REF_RE = /^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$/;   // "heart" (built in) or "packid:itemid"

  /* ---------- small helpers ---------- */
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function num(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }
  function rad(deg) { return deg * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function normDeg(d) {            // to (-180, 180]
    d = ((d % 360) + 360) % 360;
    return d > 180 ? d - 360 : d;
  }
  function round(v, p) { var m = Math.pow(10, p === undefined ? 2 : p); return Math.round(v * m) / m; }
  function snap(v, grid) { return grid > 0 ? Math.round(v / grid) * grid : v; }

  function uid(prefix, rng) {
    var r = rng || Math.random;
    return (prefix || 'id') + '_' + Math.floor(r() * 0xffffffff).toString(36) + Math.floor(r() * 0xffff).toString(36);
  }

  /* ---------- geometry ---------- */
  function center(it) { return { x: it.x + it.w / 2, y: it.y + it.h / 2 }; }

  function rotatePoint(px, py, cx, cy, degrees) {
    var a = rad(degrees), c = Math.cos(a), s = Math.sin(a), dx = px - cx, dy = py - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  function corners(it) {           // world positions: nw, ne, se, sw
    var c = center(it), hw = it.w / 2, hh = it.h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (p) {
      return rotatePoint(c.x + p[0], c.y + p[1], c.x, c.y, it.rot || 0);
    });
  }

  function bounds(it) {            // axis-aligned box of the rotated item
    var cs = corners(it), xs = cs.map(function (p) { return p.x; }), ys = cs.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
  }

  function hitTest(it, px, py) {
    var c = center(it), p = rotatePoint(px, py, c.x, c.y, -(it.rot || 0));
    return p.x >= it.x && p.x <= it.x + it.w && p.y >= it.y && p.y <= it.y + it.h;
  }

  function topItemAt(items, px, py) {   // highest z wins; ties resolved by later array index
    var best = null, bestZ = -Infinity, bestI = -1;
    items.forEach(function (it, i) {
      if (!hitTest(it, px, py)) return;
      var z = num(it.z, 0);
      if (z > bestZ || (z === bestZ && i > bestI)) { best = it; bestZ = z; bestI = i; }
    });
    return best;
  }

  var CORNER_SIGNS = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };

  /* Resize by dragging one corner; the opposite corner stays fixed in the world.
   * Returns a NEW item geometry {x, y, w, h} (rot unchanged). */
  function resizeFromCorner(it, corner, px, py, opts) {
    opts = opts || {};
    var sg = CORNER_SIGNS[corner];
    if (!sg) throw new Error('bad corner: ' + corner);
    var min = opts.min || LIMITS.minItem, max = opts.max || LIMITS.maxItem;
    var rot = it.rot || 0, c = center(it);
    var pl = rotatePoint(px, py, c.x, c.y, -rot);                 // pointer in local frame, origin at centre
    var plx = pl.x - c.x, ply = pl.y - c.y;
    var ax = -sg[0] * it.w / 2, ay = -sg[1] * it.h / 2;           // anchor (local)
    var aw = rotatePoint(c.x + ax, c.y + ay, c.x, c.y, rot);       // anchor (world)
    var nw = Math.max(min, (plx - ax) * sg[0]);
    var nh = Math.max(min, (ply - ay) * sg[1]);
    if (opts.keepAspect && it.w > 0 && it.h > 0) {
      var k = Math.max(nw / it.w, nh / it.h);
      nw = it.w * k; nh = it.h * k;
      if (nw < min || nh < min) { var up = Math.max(min / nw, min / nh); nw *= up; nh *= up; }
    }
    nw = Math.min(nw, max); nh = Math.min(nh, max);
    if (opts.keepAspect && it.w > 0 && it.h > 0) {                 // re-apply aspect after the max clamp
      var kk = Math.min(nw / it.w, nh / it.h); nw = it.w * kk; nh = it.h * kk;
    }
    var off = rotatePoint(sg[0] * nw / 2, sg[1] * nh / 2, 0, 0, rot);
    var ncx = aw.x + off.x, ncy = aw.y + off.y;
    return { x: ncx - nw / 2, y: ncy - nh / 2, w: nw, h: nh };
  }

  /* Rotation handle sits above the item: pointer straight above the centre = 0 degrees. */
  function rotationFromPointer(it, px, py, snapDeg) {
    var c = center(it), a = deg(Math.atan2(py - c.y, px - c.x)) + 90;
    a = normDeg(a);
    return snapDeg ? normDeg(Math.round(a / snapDeg) * snapDeg) : a;
  }

  /* Keep an item reachable: its centre must stay inside the page. */
  function keepInPage(it) {
    var c = center(it), nx = clamp(c.x, 0, PAGE_W), ny = clamp(c.y, 0, PAGE_H);
    return { x: it.x + (nx - c.x), y: it.y + (ny - c.y) };
  }

  function nudge(it, dx, dy, gridSnap) {
    var moved = { x: it.x + dx, y: it.y + dy, w: it.w, h: it.h, rot: it.rot || 0 };
    if (gridSnap > 0) { moved.x = snap(moved.x, gridSnap); moved.y = snap(moved.y, gridSnap); }
    var k = keepInPage(moved);
    return { x: k.x, y: k.y };
  }

  /* ---------- z-order ---------- */
  // Returns a map id -> new z (1..n, compact) after moving one item.
  function reorderZ(items, id, where) {
    var order = items.slice().sort(function (a, b) { return num(a.z, 0) - num(b.z, 0); }).map(function (i) { return i.id; });
    var i = order.indexOf(id);
    if (i < 0) return null;
    order.splice(i, 1);
    if (where === 'front') order.push(id);
    else if (where === 'back') order.unshift(id);
    else if (where === 'forward') order.splice(Math.min(order.length, i + 1), 0, id);
    else if (where === 'backward') order.splice(Math.max(0, i - 1), 0, id);
    else throw new Error('bad where: ' + where);
    var out = {};
    order.forEach(function (oid, n) { out[oid] = n + 1; });
    return out;
  }
  function nextZ(items) {
    return items.reduce(function (m, it) { return Math.max(m, num(it.z, 0)); }, 0) + 1;
  }

  /* ---------- undo / redo (snapshot based, JSON-cloneable states) ---------- */
  function createHistory(initial, limit) {
    limit = limit || LIMITS.undoSteps;
    var stack = [JSON.stringify(initial)], idx = 0;
    return {
      // coalesce = replace the current step instead of adding one (for drags)
      push: function (state, coalesce) {
        var s = JSON.stringify(state);
        if (s === stack[idx]) return false;
        if (coalesce && idx > 0 && idx === stack.length - 1) { stack[idx] = s; return true; }
        stack.length = idx + 1;
        stack.push(s); idx++;
        if (stack.length > limit + 1) { stack.shift(); idx--; }
        return true;
      },
      undo: function () { if (idx <= 0) return null; idx--; return JSON.parse(stack[idx]); },
      redo: function () { if (idx >= stack.length - 1) return null; idx++; return JSON.parse(stack[idx]); },
      canUndo: function () { return idx > 0; },
      canRedo: function () { return idx < stack.length - 1; },
      size: function () { return stack.length; }
    };
  }

  /* ---------- model: books, pages, items ---------- */
  function newPage(bg, rng) { return { id: uid('pg', rng), bg: BACKGROUNDS.indexOf(bg) >= 0 ? bg : 'white', items: [], xp3: false }; }

  function newBook(title, now, rng) {
    var p = newPage('cream', rng);
    return {
      id: uid('bk', rng), title: cleanTitle(title) || 'My scrapbook',
      created: now || Date.now(), updated: now || Date.now(),
      pageOrder: [p.id], pages: (function () { var o = {}; o[p.id] = p; return o; })()
    };
  }

  function cleanTitle(t) {
    return String(t == null ? '' : t).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, LIMITS.maxTitle);
  }
  function color(v, fallback) { return typeof v === 'string' && COLOR_RE.test(v) ? v : fallback; }
  function oneOf(v, list, fallback) { return list.indexOf(v) >= 0 ? v : fallback; }
  function plainText(v) { return String(v == null ? '' : v).replace(/\u0000/g, '').slice(0, LIMITS.maxText); }

  /* Whitelist sanitiser: known fields only, numbers clamped, strings bounded. Returns null to drop the item. */
  function sanitizeItem(raw) {
    if (!raw || typeof raw !== 'object' || ITEM_TYPES.indexOf(raw.type) < 0) return null;
    var it = {
      id: typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) ? raw.id : uid('it'),
      type: raw.type,
      x: clamp(num(raw.x, 0), -LIMITS.maxItem, PAGE_W + LIMITS.maxItem),
      y: clamp(num(raw.y, 0), -LIMITS.maxItem, PAGE_H + LIMITS.maxItem),
      w: clamp(num(raw.w, 100), LIMITS.minItem, LIMITS.maxItem),
      h: clamp(num(raw.h, 100), LIMITS.minItem, LIMITS.maxItem),
      rot: normDeg(num(raw.rot, 0)),
      z: Math.max(0, Math.floor(num(raw.z, 1)))
    };
    switch (raw.type) {
      case 'photo':
        if (typeof raw.assetId !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(raw.assetId)) return null;
        it.assetId = raw.assetId; it.frame = oneOf(raw.frame, FRAMES, 'plain');
        if (typeof raw.mask === 'string' && PACK_REF_RE.test(raw.mask)) it.mask = raw.mask;             // v0.13.0: cutout frame
        if (it.mask && raw.edge) it.edge = true;                                                         //   white sticker edge + shadow (only with a valid mask)
        if (raw.crop && typeof raw.crop === 'object') it.crop = normalizeCrop(raw.crop);                //   pan/zoom inside the frame
        if (raw.group && typeof raw.group === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(raw.group)) it.group = raw.group;
        break;
      case 'text':
        it.text = plainText(raw.text); it.font = oneOf(raw.font, FONTS, 'sans');
        it.size = clamp(num(raw.size, 32), 8, 400); it.color = color(raw.color, '#222222');
        it.align = oneOf(raw.align, ALIGNS, 'left'); break;
      case 'sticker':
        if (typeof raw.glyph === 'string' && raw.glyph.length > 0 && raw.glyph.length <= 16) it.glyph = raw.glyph;
        else if (typeof raw.svgId === 'string' && SVGID_RE.test(raw.svgId)) it.svgId = raw.svgId;
        else return null;
        break;
      case 'shape':
        it.kind = oneOf(raw.kind, SHAPES, 'rect'); it.fill = color(raw.fill, '#ffd166'); it.stroke = color(raw.stroke, '#222222'); break;
      case 'tape':
        it.color = color(raw.color, '#f4a6c0'); it.pattern = oneOf(raw.pattern, ['plain', 'stripes', 'dots'], 'plain'); break;
      case 'note':
        it.text = plainText(raw.text); it.color = color(raw.color, '#fff3b0'); break;
      case 'pen':
        if (typeof raw.d !== 'string' || raw.d.length > 20000 || !/^[MLCQZmlcqz0-9 .,\-eE]+$/.test(raw.d)) return null;
        it.d = raw.d; it.color = color(raw.color, '#222222'); it.width = clamp(num(raw.width, 4), 1, 40);
        it.vw = clamp(num(raw.vw, it.w), 1, LIMITS.maxItem); it.vh = clamp(num(raw.vh, it.h), 1, LIMITS.maxItem); break;   // v0.13.0: the path's own box, so a resized drawing scales
      case 'stamp':
        if (typeof raw.stampId !== 'string' || !PACK_REF_RE.test(raw.stampId)) return null;
        it.stampId = raw.stampId; it.tint = color(raw.tint, '#c0392b'); it.ink = clamp(num(raw.ink, 0.85), 0.3, 1); break;
    }
    if (raw.group && typeof raw.group === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(raw.group)) it.group = raw.group;   // v0.13.0: grouping
    return it;
  }

  /* Validate a stored book (e.g. loaded from IndexedDB or a backup file). */
  function validateBook(raw) {
    var problems = [];
    if (!raw || typeof raw !== 'object') return { ok: false, book: null, problems: ['not an object'] };
    var book = {
      id: typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) ? raw.id : uid('bk'),
      title: cleanTitle(raw.title) || 'My scrapbook',
      created: num(raw.created, Date.now()), updated: num(raw.updated, Date.now()),
      pageOrder: [], pages: {}
    };
    var order = Array.isArray(raw.pageOrder) ? raw.pageOrder : [];
    var pages = raw.pages && typeof raw.pages === 'object' ? raw.pages : {};
    order.forEach(function (pid) {
      if (book.pageOrder.length >= LIMITS.maxPagesPerBook) { problems.push('too many pages'); return; }
      var pg = pages[pid];
      if (!pg || typeof pid !== 'string' || book.pages[pid]) { problems.push('missing or duplicate page ' + pid); return; }
      var items = [];
      (Array.isArray(pg.items) ? pg.items : []).forEach(function (r) {
        if (items.length >= LIMITS.maxItemsPerPage) { problems.push('too many items on ' + pid); return; }
        var s = sanitizeItem(r);
        if (s) items.push(s); else problems.push('dropped invalid item on ' + pid);
      });
      book.pages[pid] = { id: pid, bg: oneOf(pg.bg, BACKGROUNDS, 'white'), items: items, xp3: !!pg.xp3 };
      book.pageOrder.push(pid);
    });
    if (!book.pageOrder.length) { var p = newPage('cream'); book.pageOrder.push(p.id); book.pages[p.id] = p; problems.push('no pages; added a blank one'); }
    return { ok: problems.length === 0, book: book, problems: problems };
  }

  /* ---------- photos ---------- */
  function fitLongEdge(w, h, maxEdge) {           // never upscale
    maxEdge = maxEdge || LIMITS.importLongEdge;
    var long = Math.max(w, h);
    if (long <= maxEdge) return { w: w, h: h, scale: 1 };
    var s = maxEdge / long;
    return { w: Math.round(w * s), h: Math.round(h * s), scale: s };
  }
  function fitInto(w, h, boxW, boxH) {            // for the first drop of a photo onto the page
    var s = Math.min(boxW / w, boxH / h, 1);
    return { w: Math.round(w * s), h: Math.round(h * s) };
  }
  function photoCount(book) {
    var n = 0;
    book.pageOrder.forEach(function (pid) { book.pages[pid].items.forEach(function (it) { if (it.type === 'photo') n++; }); });
    return n;
  }
  function assetsInUse(book) {
    var s = {};
    book.pageOrder.forEach(function (pid) { book.pages[pid].items.forEach(function (it) { if (it.type === 'photo') s[it.assetId] = true; }); });
    return Object.keys(s);
  }
  function unreferencedAssets(book, allAssetIds) {  // for the sweep when a scrapbook closes
    var used = {}; assetsInUse(book).forEach(function (id) { used[id] = true; });
    return allAssetIds.filter(function (id) { return !used[id]; });
  }
  function canAddPhoto(book, policy) {
    if (policy && policy.studentPhotos === false) return { ok: false, reason: 'photos-off' };
    if (photoCount(book) >= LIMITS.maxPhotosPerBook) return { ok: false, reason: 'photo-cap' };
    return { ok: true };
  }

  /* ---------- XP ---------- */
  // Rule from the scope doc: +2 the first time each day an item is added;
  // +3 when a page first reaches 3 items (once per page, ever). Nothing for move/resize/duplicate/delete.
  // The shell enforces the daily cap (XP_RULES.scrap.cap); this only says what an action is worth.
  function xpForItemAdded(ctx) {
    var xp = 0, out = { lastItemDay: ctx.lastItemDay, pageXp3: !!ctx.pageXp3, xp: 0 };
    if (ctx.today && ctx.lastItemDay !== ctx.today) { xp += 2; out.lastItemDay = ctx.today; }
    if (!ctx.pageXp3 && ctx.pageItemCount >= 3) { xp += 3; out.pageXp3 = true; }
    out.xp = xp;
    return out;
  }

  /* ---------- school policy (M0, client side) ---------- */
  // Stored per class at classes/{id}/policy/current. A missing document means allowed
  // for photos and sharing. The store flag (M4) defaults to off for a student in a class.
  function normalizePolicy(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    return {
      studentPhotos: raw.studentPhotos !== false,
      studentSharing: raw.studentSharing !== false,
      studentStore: raw.studentStore === true,
      version: Math.max(0, Math.floor(num(raw.version, 0)))
    };
  }
  function effectivePolicy(policyDoc, inClass) {
    if (!inClass) return { studentPhotos: true, studentSharing: false, studentStore: true, version: 0 };
    if (!policyDoc) return { studentPhotos: true, studentSharing: true, studentStore: false, version: 0 };
    return normalizePolicy(policyDoc);
  }


  /* =====================================================================
     M2 (StudentDeck v0.13.0): cutout masks and crop, stamps, packs, pen,
     multi-select and grouping, starter layouts, backup to and from a file.
     Pure functions: the screen (CSS/SVG) and the PNG export (canvas) both use
     them, so the two cannot disagree. Tested in tools/test_scrapdeck.js.
     ===================================================================== */
  var UNIT_PATH_RE = /^[MLHVCSQTAZmlhvcsqtaz0-9 .,\-eE]+$/;
  // Free cutout frames, in 0..1 units (they scale with the photo). Paid packs add more (kind "mask").
  var MASKS = {
    circle: 'M0.5 0A0.5 0.5 0 1 1 0.4999 0Z',
    rounded: 'M0.16 0H0.84Q1 0 1 0.16V0.84Q1 1 0.84 1H0.16Q0 1 0 0.84V0.16Q0 0 0.16 0Z',
    heart: 'M0.5 0.95C0.2 0.72 0 0.52 0 0.3C0 0.13 0.13 0.02 0.28 0.02C0.38 0.02 0.46 0.08 0.5 0.17C0.54 0.08 0.62 0.02 0.72 0.02C0.87 0.02 1 0.13 1 0.3C1 0.52 0.8 0.72 0.5 0.95Z'
  };
  function starPath(cx, cy, ro, ri, n, scale) {   // n-pointed star, used by the free "star" stamp
    var pts = [];
    for (var i = 0; i < n * 2; i++) { var r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / n; pts.push(round(cx + r * Math.cos(a), 1) + ' ' + round(cy + r * Math.sin(a), 1)); }
    return 'M' + pts.join('L') + 'Z';
  }
  // Free stamps: one-colour marks in a 0..100 box. mode "stroke" = drawn as lines, "fill" = solid.
  var STAMPS = {
    tick: { d: 'M16 54L41 78L86 24', mode: 'stroke', name: { en: 'Tick', vi: 'Dấu tích' } },
    star: { d: starPath(50, 52, 46, 19, 5), mode: 'fill', name: { en: 'Star', vi: 'Ngôi sao' } },
    heart: { d: 'M50 92C20 70 4 52 4 32C4 16 16 6 30 6C40 6 47 12 50 20C53 12 60 6 70 6C84 6 96 16 96 32C96 52 80 70 50 92Z', mode: 'fill', name: { en: 'Heart', vi: 'Trái tim' } },
    ring: { d: 'M50 6A44 44 0 1 1 49.99 6Z', mode: 'stroke', name: { en: 'Ring', vi: 'Vòng tròn' } },
    smile: { d: 'M50 6A44 44 0 1 1 49.99 6ZM34 38L34 42M66 38L66 42M28 58Q50 82 72 58', mode: 'stroke', name: { en: 'Smile', vi: 'Mặt cười' } }
  };

  function normalizeCrop(c) {
    return { zoom: clamp(num(c && c.zoom, 1), 1, 4), cx: clamp(num(c && c.cx, 0.5), 0, 1), cy: clamp(num(c && c.cy, 0.5), 0, 1) };
  }
  /** The part of the image that shows in a box: "cover" scaling, then zoom, centred on (cx, cy), never past an edge. */
  function cropSource(imgW, imgH, boxW, boxH, crop) {
    var c = normalizeCrop(crop || {});
    var scale = Math.max(boxW / imgW, boxH / imgH) * c.zoom;
    var sw = Math.min(imgW, boxW / scale), sh = Math.min(imgH, boxH / scale);
    var sx = clamp(c.cx * imgW - sw / 2, 0, imgW - sw), sy = clamp(c.cy * imgH - sh / 2, 0, imgH - sh);
    return { sx: sx, sy: sy, sw: sw, sh: sh, scale: scale };
  }
  /** Moves the crop centre by a drag of (dx, dy) box pixels. */
  function panCrop(crop, imgW, imgH, boxW, boxH, dx, dy) {
    var c = normalizeCrop(crop || {}), s = cropSource(imgW, imgH, boxW, boxH, c);
    var moved = normalizeCrop({ zoom: c.zoom, cx: (s.sx + s.sw / 2 - dx / s.scale) / imgW, cy: (s.sy + s.sh / 2 - dy / s.scale) / imgH });
    var e = cropSource(imgW, imgH, boxW, boxH, moved);    // store the centre that is really shown, so dragging back responds at once
    return { zoom: moved.zoom, cx: round((e.sx + e.sw / 2) / imgW, 6), cy: round((e.sy + e.sh / 2) / imgH, 6) };
  }
  /** Unit path → path in a w × h box (for the canvas export's Path2D). Numbers alternate x, y except for arcs' radii/flags. */
  function scaleUnitPath(d, w, h) {
    var out = [], tokens = String(d).match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [], cmd = '', idx = 0;
    var ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
    tokens.forEach(function (tk) {
      if (/[A-Za-z]/.test(tk)) { cmd = tk; idx = 0; out.push(tk); return; }
      var v = parseFloat(tk), U = cmd.toUpperCase(), n = ARGS[U] || 2, k = idx % n;
      if (U === 'H') v *= w; else if (U === 'V') v *= h;
      else if (U === 'A') { if (k === 0 || k === 5) v *= w; else if (k === 1 || k === 6) v *= h; }
      else v *= (k % 2 === 0 ? w : h);
      out.push(round(v, 2)); idx++;
    });
    return out.join(' ');
  }

  /* ---------- packs (stickers, stamps, cutout frames) ---------- */
  var PACK_KINDS = ['sticker', 'stamp', 'mask'];
  var UNSAFE_SVG = /<script|<foreignobject|<image|<iframe|<use\b|<style|<a\b|\bon[a-z]+\s*=|href\s*=|url\s*\(|@import|javascript:|data:/i;
  function checkSvg(svg) {
    if (typeof svg !== 'string' || svg.length > 8192) return 'too-big';
    var s = svg.trim();
    if (!/^<svg[\s>]/i.test(s) || !/<\/svg>$/i.test(s)) return 'not-svg';
    if (UNSAFE_SVG.test(s)) return 'unsafe';
    return null;
  }
  function checkPath(d) { return typeof d === 'string' && d.length > 0 && d.length <= 8192 && UNIT_PATH_RE.test(d) ? null : 'bad-path'; }
  function bilingual(n) { return n && typeof n.en === 'string' && n.en.trim() ? { en: n.en.trim().slice(0, 60), vi: typeof n.vi === 'string' && n.vi.trim() ? n.vi.trim().slice(0, 60) : n.en.trim().slice(0, 60) } : null; }
  /** A pack is data, never code: SVG markup or path strings only, no scripts, links, images, styles or fonts. */
  function validatePack(raw) {
    var errors = [];
    if (!raw || typeof raw !== 'object') return { ok: false, errors: ['not-an-object'] };
    if (typeof raw.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(raw.id)) errors.push('id');
    if (!(Number.isInteger(raw.version) && raw.version >= 1)) errors.push('version');
    if (PACK_KINDS.indexOf(raw.kind) < 0) errors.push('kind');
    var name = bilingual(raw.name); if (!name) errors.push('name');
    if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > 60) errors.push('items');
    var items = [], seen = {};
    (Array.isArray(raw.items) ? raw.items : []).forEach(function (r, i) {
      var where = 'items[' + i + ']';
      if (!r || typeof r.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(r.id) || seen[r.id]) { errors.push(where + '.id'); return; }
      seen[r.id] = true;
      var nm = bilingual(r.name); if (!nm) { errors.push(where + '.name'); return; }
      var it = { id: r.id, name: nm, w: clamp(num(r.w, 100), 8, 1000), h: clamp(num(r.h, 100), 8, 1000) };
      if (raw.kind === 'sticker') {
        var e = r.svg !== undefined ? checkSvg(r.svg) : checkPath(r.path);
        if (e) { errors.push(where + ':' + e); return; }
        if (r.svg !== undefined) it.svg = r.svg.trim(); else it.path = r.path;
      } else {
        var e2 = checkPath(r.path); if (e2) { errors.push(where + ':' + e2); return; }
        it.path = r.path;
        if (raw.kind === 'stamp') it.mode = r.mode === 'stroke' ? 'stroke' : 'fill';
      }
      items.push(it);
    });
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, pack: { id: raw.id, version: raw.version, kind: raw.kind, name: name, license: typeof raw.license === 'string' ? raw.license.slice(0, 200) : '', items: items } };
  }

  /* ---------- pen ---------- */
  function rdp(pts, eps) {                     // Ramer–Douglas–Peucker line simplification
    if (pts.length < 3) return pts.slice();
    var a = pts[0], b = pts[pts.length - 1], best = -1, idx = 0, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    for (var i = 1; i < pts.length - 1; i++) {
      var d = Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / len;
      if (d > best) { best = d; idx = i; }
    }
    if (best <= eps) return [a, b];
    return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  }
  /** Page-space pointer points → a pen item placed at the stroke's box, with the path in that box's own units. */
  function penItemFromPoints(points, colour, width) {
    var pts = (points || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
    if (pts.length < 2) return null;
    var wd = clamp(num(width, 4), 1, 40), pad = wd / 2 + 2, s = rdp(pts, 0.8);
    var xs = s.map(function (p) { return p.x; }), ys = s.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs) - pad, y0 = Math.min.apply(null, ys) - pad;
    var w = Math.max(LIMITS.minItem, Math.max.apply(null, xs) + pad - x0), h = Math.max(LIMITS.minItem, Math.max.apply(null, ys) + pad - y0);
    var d = 'M' + s.map(function (p) { return round(p.x - x0, 1) + ' ' + round(p.y - y0, 1); }).join('L');
    return sanitizeItem({ type: 'pen', x: x0, y: y0, w: w, h: h, rot: 0, d: d, color: colour, width: wd, vw: w, vh: h });
  }

  /* ---------- multi-select and grouping ---------- */
  function groupIds(items, id) {               // everything grouped with id (or just id)
    var it = items.filter(function (i) { return i.id === id; })[0];
    if (!it) return [];
    if (!it.group) return [id];
    return items.filter(function (i) { return i.group === it.group; }).map(function (i) { return i.id; });
  }
  function selectionBounds(items, ids) {
    var bs = items.filter(function (i) { return ids.indexOf(i.id) >= 0; }).map(bounds);
    if (!bs.length) return null;
    var x0 = Math.min.apply(null, bs.map(function (b) { return b.x; })), y0 = Math.min.apply(null, bs.map(function (b) { return b.y; }));
    var x1 = Math.max.apply(null, bs.map(function (b) { return b.x + b.w; })), y1 = Math.max.apply(null, bs.map(function (b) { return b.y + b.h; }));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function moveItems(items, ids, dx, dy) {
    items.forEach(function (i) { if (ids.indexOf(i.id) >= 0) { i.x = round(i.x + dx); i.y = round(i.y + dy); } });
  }
  function groupItems(items, ids, rng) {
    if (ids.length < 2) return null;
    var g = uid('gp', rng); items.forEach(function (i) { if (ids.indexOf(i.id) >= 0) i.group = g; }); return g;
  }
  function ungroupItems(items, ids) {
    var gs = {}; items.forEach(function (i) { if (ids.indexOf(i.id) >= 0 && i.group) gs[i.group] = true; });
    items.forEach(function (i) { if (gs[i.group]) delete i.group; });
  }
  function itemsInRect(items, r) {             // rubber-band selection: items whose box lies fully inside r
    return items.filter(function (i) { var b = bounds(i); return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h; }).map(function (i) { return i.id; });
  }

  /* ---------- starter layouts ---------- */
  var LAYOUTS = {
    trip: { name: 'My trip', bg: 'kraft', items: [
      { type: 'text', text: 'My trip to …', x: 60, y: 40, w: 700, h: 90, size: 64, font: 'hand', color: '#5a3e1b' },
      { type: 'note', text: 'Stick a photo here', x: 70, y: 170, w: 460, h: 330, color: '#ffffff' },
      { type: 'note', text: 'Another photo here', x: 600, y: 230, w: 380, h: 290, color: '#ffffff', rot: 4 },
      { type: 'tape', x: 230, y: 150, w: 160, h: 40, color: '#9bd3f0', pattern: 'stripes', rot: -6 },
      { type: 'note', text: 'The best part was …', x: 90, y: 560, w: 520, h: 180, color: '#fff3b0' },
      { type: 'sticker', glyph: '\u2708\ufe0f', x: 1010, y: 60, w: 120, h: 120 } ] },
    report: { name: 'Book report', bg: 'lined', items: [
      { type: 'text', text: 'Book report', x: 60, y: 40, w: 600, h: 90, size: 64, font: 'serif', color: '#1f3a5f' },
      { type: 'note', text: 'Title and author', x: 60, y: 160, w: 520, h: 120, color: '#fff3b0' },
      { type: 'note', text: 'What happened', x: 60, y: 310, w: 520, h: 230, color: '#d9f2e3' },
      { type: 'note', text: 'My favourite part', x: 620, y: 160, w: 520, h: 200, color: '#fde2e4' },
      { type: 'note', text: 'Draw the cover here', x: 620, y: 390, w: 520, h: 330, color: '#ffffff' },
      { type: 'sticker', glyph: '\ud83d\udcda', x: 1040, y: 40, w: 110, h: 110 } ] },
    aboutme: { name: 'All about me', bg: 'dots', items: [
      { type: 'text', text: 'All about me', x: 380, y: 30, w: 460, h: 90, size: 64, font: 'hand', color: '#7b2d8b', align: 'center' },
      { type: 'shape', kind: 'circle', x: 470, y: 160, w: 260, h: 260, fill: '#ffe8a3', stroke: '#7b2d8b' },
      { type: 'note', text: 'My favourite things', x: 60, y: 160, w: 360, h: 260, color: '#d9f2e3', rot: -3 },
      { type: 'note', text: 'When I grow up …', x: 780, y: 160, w: 360, h: 260, color: '#fde2e4', rot: 3 },
      { type: 'note', text: 'My family and friends', x: 300, y: 470, w: 600, h: 260, color: '#fff3b0' },
      { type: 'tape', x: 520, y: 150, w: 160, h: 36, color: '#f4a6c0', pattern: 'dots' } ] }
  };
  /** A new page laid out from a starter layout; every item passes sanitizeItem. */
  function layoutPage(name, rng) {
    var L = LAYOUTS[name]; if (!L) return null;
    var p = newPage(L.bg, rng);
    p.items = L.items.map(function (r, i) { return sanitizeItem(Object.assign({ id: uid('it', rng), z: i + 1, rot: 0 }, r)); }).filter(Boolean);
    return p;
  }

  /* ---------- backup to and from a file ---------- */
  var BACKUP_FORMAT = 'studentdeck-scrapbook';
  var DATAURL_RE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
  function makeBackup(book, assets, now) {
    return { format: BACKUP_FORMAT, version: 1, exported: now || Date.now(), book: book,
      assets: (assets || []).map(function (a) { return { id: a.id, dataUrl: a.dataUrl, w: a.w, h: a.h, alt: a.alt || '' }; }) };
  }
  /** Reads a backup file: checks everything, gives the book and its photos NEW ids (so it never overwrites), drops photos with no picture. */
  function parseBackup(text, rng) {
    var raw; try { raw = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, error: 'not-json' }; }
    if (!raw || raw.format !== BACKUP_FORMAT || raw.version !== 1) return { ok: false, error: 'not-a-backup' };
    var v = validateBook(raw.book); if (!v || !v.book) return { ok: false, error: 'bad-book' };
    var assets = [], map = {};
    (Array.isArray(raw.assets) ? raw.assets : []).slice(0, LIMITS.maxPhotosPerBook).forEach(function (a) {
      if (!a || typeof a.id !== 'string' || typeof a.dataUrl !== 'string' || a.dataUrl.length > 3500000 || !DATAURL_RE.test(a.dataUrl)) return;
      var nid = uid('as', rng); map[a.id] = nid;
      assets.push({ id: nid, dataUrl: a.dataUrl, w: clamp(num(a.w, 100), 1, 10000), h: clamp(num(a.h, 100), 1, 10000), alt: plainText(a.alt).slice(0, 140) });
    });
    var book = JSON.parse(JSON.stringify(v.book)); book.id = uid('bk', rng);
    book.pageOrder.forEach(function (pid) {
      var pg = book.pages[pid];
      pg.items = pg.items.filter(function (it) { if (it.type !== 'photo') return true; if (!map[it.assetId]) return false; it.assetId = map[it.assetId]; return true; });
    });
    return { ok: true, book: book, assets: assets };
  }

  return {
    MASKS: MASKS, STAMPS: STAMPS, LAYOUTS: LAYOUTS, PACK_KINDS: PACK_KINDS, BACKUP_FORMAT: BACKUP_FORMAT,
    normalizeCrop: normalizeCrop, cropSource: cropSource, panCrop: panCrop, scaleUnitPath: scaleUnitPath, starPath: starPath,
    checkSvg: checkSvg, checkPath: checkPath, validatePack: validatePack, rdp: rdp, penItemFromPoints: penItemFromPoints,
    groupIds: groupIds, selectionBounds: selectionBounds, moveItems: moveItems, groupItems: groupItems, ungroupItems: ungroupItems, itemsInRect: itemsInRect,
    layoutPage: layoutPage, makeBackup: makeBackup, parseBackup: parseBackup,
    PAGE_W: PAGE_W, PAGE_H: PAGE_H, LIMITS: LIMITS, ITEM_TYPES: ITEM_TYPES,
    BACKGROUNDS: BACKGROUNDS, FRAMES: FRAMES, SHAPES: SHAPES, FONTS: FONTS,
    clamp: clamp, normDeg: normDeg, round: round, snap: snap, uid: uid,
    center: center, rotatePoint: rotatePoint, corners: corners, bounds: bounds, hitTest: hitTest, topItemAt: topItemAt,
    resizeFromCorner: resizeFromCorner, rotationFromPointer: rotationFromPointer, keepInPage: keepInPage, nudge: nudge,
    reorderZ: reorderZ, nextZ: nextZ, createHistory: createHistory,
    newPage: newPage, newBook: newBook, sanitizeItem: sanitizeItem, validateBook: validateBook,
    fitLongEdge: fitLongEdge, fitInto: fitInto, photoCount: photoCount, assetsInUse: assetsInUse,
    unreferencedAssets: unreferencedAssets, canAddPhoto: canAddPhoto,
    xpForItemAdded: xpForItemAdded, normalizePolicy: normalizePolicy, effectivePolicy: effectivePolicy
  };
});

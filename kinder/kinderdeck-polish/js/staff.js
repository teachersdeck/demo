/* KinderDeck Staff Directory (v0.4.7).
   One record per staff member, imported from the school's own Excel list (.xlsx) or added by hand.
   Personal data (CCCD, date of birth, address) stays in this browser (state.staff): it is never in the repo,
   never in a seed file (only the client line, branch client/tp, prefills it), and the CCCD is masked until someone taps it. Live data: the demo switch does not hide it. */
(() => {
  const list = () => state.staff || (state.staff = []);
  const staffIn = () => list().filter(s => inLoc(s.loc));
  let shown = null, preview = null, q = '';

  /* ---- a small .xlsx reader: the file is a zip; read the first sheet with the browser's own inflate ---- */
  async function readXlsx(file, idx, namesOnly) {  // idx: which sheet (default the first); namesOnly: just list the sheet names
    const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer), td = new TextDecoder();
    let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('not a zip');
    const files = {}; let p = dv.getUint32(e + 16, true);
    for (let i = 0, n = dv.getUint16(e + 10, true); i < n; i++) {
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      files[td.decode(buf.subarray(p + 46, p + 46 + nl))] = {m:dv.getUint16(p + 10, true), size:dv.getUint32(p + 20, true), off:dv.getUint32(p + 42, true)};
      p += 46 + nl + xl + cl;
    }
    const text = async name => { const f = files[name]; if (!f) return null;
      const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), raw = buf.subarray(s, s + f.size);
      return f.m === 0 ? td.decode(raw) : new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text(); };
    const xml = async name => { const t = await text(name); return t && new DOMParser().parseFromString(t, 'application/xml'); };
    const wb = await xml('xl/workbook.xml'), rels = await xml('xl/_rels/workbook.xml.rels');
    const sheets = [...wb.getElementsByTagName('sheet')]; if (namesOnly) return sheets.map(x => x.getAttribute('name')); const first = sheets[idx || 0], rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = rels && [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
    const target = rel ? rel.getAttribute('Target').replace(/^\/?(xl\/)?/, 'xl/') : 'xl/worksheets/sheet1.xml';
    const ss = await xml('xl/sharedStrings.xml'), strs = ss ? [...ss.getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    const sh = await xml(target), rows = [];
    [...sh.getElementsByTagName('row')].forEach(r => { const out = [];
      [...r.getElementsByTagName('c')].forEach(c => { const ref = c.getAttribute('r') || '', col = [...ref.replace(/\d+/g, '')].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('is')[0];
        out[col < 0 ? out.length : col] = t === 's' ? strs[+v.textContent] : t === 'inlineStr' ? (is ? is.textContent : '') : v ? (t === 'str' || t === 'b' ? v.textContent : +v.textContent) : ''; });
      rows[+r.getAttribute('r') - 1] = out; });
    return rows.map(r => r || []);
  }

  /* ---- columns are found by their heading, with or without diacritics ---- */
  const COLS = [['n', /^(ho va ten|ho ten|ten nhan vien|ten)$/], ['id', /(cccd|cmnd|can cuoc)/], ['dob', /ngay sinh/], ['addr', /dia chi/], ['role', /(chuc vu|vi tri|cong viec)/], ['phone', /(dien thoai|sdt|so dt)/]];
  const pad = n => String(n).padStart(2, '0');
  const serial = v => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const dateOf = v => { // Excel date, or d/m/yyyy typed as text; anything else is kept as typed and flagged
    if (typeof v === 'number' && v > 1000) return [serial(v), true];
    const m = String(v).trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    return m ? [m[3] + '-' + pad(m[2]) + '-' + pad(m[1]), true] : [String(v).trim(), !String(v).trim()];
  };
  const idOf = v => { const s = String(v).trim().replace(/\s/g, ''); return /^\d{9,12}$/.test(s) && s.length > 9 ? s.padStart(12, '0') : s; }; // Excel drops the leading 0 of a 12-digit CCCD
  function parse(rows) {
    const hi = rows.findIndex(r => r.some(c => COLS[0][1].test(norm(String(c || '')).trim())));
    if (hi < 0) return null;
    const map = {}; rows[hi].forEach((c, i) => { const h = norm(String(c || '')).trim(); const k = COLS.find(x => x[1].test(h)); if (k && map[k[0]] == null) map[k[0]] = i; });
    return rows.slice(hi + 1).filter(r => String(r[map.n] || '').trim()).map(r => {
      const [dob, ok] = map.dob == null ? ['', true] : dateOf(r[map.dob] ?? '');
      const g = k => map[k] == null ? '' : String(r[map[k]] ?? '').trim();
      return {n:g('n').replace(/\s+/g, ' '), id:map.id == null ? '' : idOf(r[map.id] ?? ''), dob, check:!ok, addr:g('addr'), role:g('role'), phone:g('phone')};
    });
  }
  const dup = s => list().some(x => (s.id && x.id === s.id) || (norm(x.n) === norm(s.n) && x.dob === s.dob));

  /* ---- view ---- */
  const mask = id => id ? '••••' + id.slice(-4) : '';
  const fmtDob = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : d;
  const inp = (i, f, v, w, ph) => `<input type="text" class="kx-n" data-st="${i}" data-sf="${f}" value="${esc(v)}" placeholder="${esc(ph || '')}" style="width:${w}px">`;
  const W = { id:'staff', em:'👥', icon:'people', en:'Staff Directory', vi:'Danh sách nhân viên', w:760, h:520,
    html() {
      if (preview) {
        const fresh = preview.filter(s => !dup(s));
        return `<h4 class="wh">${L('Check before importing', 'Kiểm tra trước khi nhập')}: ${preview.length} ${L('rows', 'dòng')}, ${fresh.length} ${L('new', 'mới')}</h4>
          <div class="kx-scroll">${table(['#', L('Name', 'Họ và tên'), 'CCCD', L('Date of birth', 'Ngày sinh'), L('Address', 'Địa chỉ'), ''], preview.map((s, i) => [i + 1, esc(s.n), esc(mask(s.id)), esc(fmtDob(s.dob)) + (s.check ? ` <span class="badge warn">${L('check', 'kiểm tra')}</span>` : ''), esc(s.addr), dup(s) ? `<span class="badge">${L('already there', 'đã có')}</span>` : '']))}</div>
          <div class="btn-row" style="margin-top:10px"><button class="wbtn primary" id="sf-ok"${fresh.length ? '' : ' disabled'}>${L('Import ' + fresh.length + ' staff', 'Nhập ' + fresh.length + ' nhân viên')}</button><button class="wbtn" id="sf-no">${L('Cancel', 'Hủy')}</button></div>
          <p class="hint" style="margin-top:8px">${L('Rows already in the directory (same CCCD, or same name and date of birth) are skipped. Dates marked “check” were not a date in Excel: fix them after importing.', 'Dòng đã có (trùng CCCD, hoặc trùng tên và ngày sinh) sẽ bỏ qua. Ngày có nhãn “kiểm tra” không đúng dạng ngày trong Excel: sửa lại sau khi nhập.')}</p>`;
      }
      const nq = norm(q), rows = staffIn().map(s => [s, list().indexOf(s)]).filter(([s]) => norm(s.n + ' ' + s.role + ' ' + s.phone).includes(nq));
      const locs = i => KD.locs.length > 1 ? `<select data-st="${i}" data-sf="loc">${KD.locs.map(l => `<option value="${l.id}"${list()[i].loc === l.id ? ' selected' : ''}>${esc(l[state.lang])}</option>`).join('')}</select>` : '';
      return `<div class="btn-row" style="margin-bottom:10px"><input type="text" id="sf-q" placeholder="${L('Search name, role or phone', 'Tìm tên, chức vụ hoặc SĐT')}" value="${esc(q)}" style="flex:1;min-width:140px">
          <button class="wbtn primary" id="sf-imp">${L('Import from Excel', 'Nhập từ Excel')}</button><input type="file" id="sf-file" accept=".xlsx" hidden></div>
        ${tiles([[staffIn().length, L('Staff', 'Nhân viên')], [staffIn().filter(s => s.check || !s.dob).length, L('Dates to check', 'Ngày sinh cần kiểm tra')], [staffIn().filter(s => !s.phone).length, L('No phone yet', 'Chưa có SĐT')]])}
        <div class="kx-scroll kx" style="margin-top:10px">${table(['#', L('Name', 'Họ và tên'), L('Role', 'Chức vụ'), L('Phone', 'SĐT'), L('Date of birth', 'Ngày sinh'), 'CCCD', L('Address', 'Địa chỉ'), ''], rows.map(([s, i], k) => [k + 1, esc(s.n),
          inp(i, 'role', s.role, 110, L('e.g. cook', 'vd. cấp dưỡng')), inp(i, 'phone', s.phone, 100), s.check ? inp(i, 'dob', s.dob, 96, 'yyyy-mm-dd') : esc(fmtDob(s.dob)),
          s.id ? `<button class="wbtn sm" data-sid="${i}" title="${L('Tap to show or hide', 'Bấm để hiện hoặc ẩn')}">${esc(shown === i ? s.id : mask(s.id))}</button>` : '',
          esc(s.addr) + locs(i), `<button class="wbtn sm" data-sdel="${i}" aria-label="${L('Remove', 'Xóa')}">×</button>`]))}</div>
        <div class="btn-row kx-add" style="margin-top:8px"><input type="text" id="sf-n" placeholder="${L('Add a staff member by name', 'Thêm nhân viên theo tên')}" style="flex:1;min-width:150px"><button class="wbtn sm" id="sf-add">${L('Add', 'Thêm')}</button></div>
        <p class="hint" style="margin-top:8px">${L('Kept only in this browser on this computer. CCCD numbers stay hidden until tapped. Import reads the first sheet and finds the columns by their headings (Họ và tên, CCCD, Ngày sinh, Địa chỉ, Chức vụ, SĐT).', 'Chỉ lưu trong trình duyệt trên máy này. Số CCCD được ẩn cho đến khi bấm vào. Khi nhập, KinderDeck đọc trang tính đầu tiên và tìm cột theo tiêu đề (Họ và tên, CCCD, Ngày sinh, Địa chỉ, Chức vụ, SĐT).')}</p>`;
    },
    wire(b, rp) {
      const $q = s => b.querySelector(s);
      if (preview) {
        $q('#sf-ok').onclick = () => { const loc = state.loc === 'all' ? KD.locs[0].id : state.loc, n0 = list().length;
          preview.filter(s => !dup(s)).forEach(s => list().push(Object.assign({sid:'s' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), loc}, s)));
          const n = list().length - n0; preview = null; saveState(); rp(); toast(L(`Imported ${n} staff`, `Đã nhập ${n} nhân viên`), 2600); };
        $q('#sf-no').onclick = () => { preview = null; rp(); };
        return;
      }
      const f = $q('#sf-file');
      $q('#sf-imp').onclick = () => f.click();
      f.onchange = async () => { const file = f.files[0]; if (!file) return;
        try { const rows = parse(await readXlsx(file)); if (!rows || !rows.length) return toast(L('No “Họ và tên” column found in the first sheet', 'Không tìm thấy cột “Họ và tên” ở trang tính đầu'), 3500); preview = rows; rp(); }
        catch (x) { toast(L('Could not read this file. Save it as .xlsx and try again.', 'Không đọc được tệp này. Hãy lưu dạng .xlsx rồi thử lại.'), 3500); } };
      const sq = $q('#sf-q'); sq.oninput = () => { q = sq.value; const at = sq.selectionStart; rp(); const n = b.querySelector('#sf-q'); n.focus(); n.setSelectionRange(at, at); };
      b.querySelectorAll('[data-sid]').forEach(x => x.onclick = () => { shown = shown === +x.dataset.sid ? null : +x.dataset.sid; rp(); });
      b.querySelectorAll('[data-sf]').forEach(x => x.onchange = () => { const s = list()[+x.dataset.st], k = x.dataset.sf, v = x.value.trim();
        if (k === 'dob') { const [d, ok] = dateOf(v); s.dob = d; s.check = !ok; } else s[k] = v; saveState(); rp(); });
      b.querySelectorAll('[data-sdel]').forEach(x => x.onclick = () => { const s = list()[+x.dataset.sdel]; if (!confirm(L('Remove ' + s.n + ' from the staff directory?', 'Xóa ' + s.n + ' khỏi danh sách nhân viên?'))) return; list().splice(+x.dataset.sdel, 1); shown = null; saveState(); rp(); });
      const an = $q('#sf-n'); $q('#sf-add').onclick = () => { const v = an.value.trim(); if (!v) return an.focus();
        list().push({sid:'s' + Date.now().toString(36), loc:state.loc === 'all' ? KD.locs[0].id : state.loc, n:v, id:'', dob:'', check:false, addr:'', role:'', phone:''}); saveState(); rp(); };
      an.onkeydown = ev => { if (ev.key === 'Enter') $q('#sf-add').click(); };
    } };
  const at = WIDGETS.findIndex(w => w.id === 'parents');
  WIDGETS.splice(at < 0 ? WIDGETS.length : at + 1, 0, W);
  window.KS = {readXlsx, parse};
})();

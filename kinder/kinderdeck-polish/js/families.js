/* KinderDeck Students and Families (v0.4.11; name cards and side-by-side parents v0.4.15).
   Imports the school's "thông tin trẻ và phụ huynh" list (.csv or .xlsx) into families: each family holds its parents,
   its children, address, hometown and bank account. Siblings share one family and a parent is one record, so a change
   to a parent shows for every child. Children are linked when they share a parent (same CCCD, or same name and phone),
   including a sibling imported later. All of it stays in this browser (state.families / guardians / students); child ID,
   CCCD and bank numbers are masked until tapped. Replaces the demo-only Student Roster and Parent Directory views;
   the demo children still show beside the real ones while demo data is on.
   v0.4.15: a child's name in the roster opens the parents side by side with the roster (focused on that family); "Family" opens the whole
   family card; a sibling's name opens that child's own name card (cards stack, Escape closes the top one).
   v0.4.18: "New student" (roster and directory) is a form with every column of the school's list: child (name, birth date, child ID),
   father and mother (name, phone, CCCD), hometown, address, bank account and bank. It can join an existing family as a brother or sister.
   v0.4.20: the same form edits an existing child, parents and family ("Edit" in the roster, directory and cards, and it can move a child to
   another family); a re-imported list can update the children already here; "Export full list" gives every column of the school's list as
   Excel or CSV (re-importable), and each list imported is logged in Accounting › Spreadsheets. */
(() => {
  const fams = () => state.families || (state.families = []);
  const grds = () => state.guardians || (state.guardians = []);
  const studs = () => state.students || (state.students = []);
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const studentsIn = () => studs().filter(s => inLoc(s.loc));
  let shown = '', preview = null, fq = '', rq = '', split = false, pf = '', selSid = '', updExisting = true;  // updExisting: a re-imported list also updates the children already here  // pf: the one family the directory is focused on; selSid: the child picked in the roster

  /* ---- reading the file: CSV with quoted fields that may hold commas and line breaks, or .xlsx via the staff reader ---- */
  function parseCsv(t) {
    const rows = []; let row = [], f = '', q = false;
    t = t.replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  /* ---- cleaning ---- */
  const pad = n => String(n).padStart(2, '0');
  const title = s => String(s || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi').replace(/(^|\s)(\S)/g, (m, a, c) => a + c.toLocaleUpperCase('vi'));
  const digits = s => String(s ?? '').replace(/\.0$/, '').replace(/\D/g, '');
  const phoneOf = s => { const d = digits(s); return d.length === 9 && d[0] !== '0' ? '0' + d : d; };            // Excel drops the leading 0
  const idOf = s => { const d = digits(s); return d.length >= 10 && d.length < 12 ? d.padStart(12, '0') : d; };   // CCCD and child ID are 12 digits
  const dateOf = v => {
    if (typeof v === 'number' && v > 1000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const m = String(v || '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); return m ? m[3] + '-' + pad(m[2]) + '-' + pad(m[1]) : String(v || '').trim();
  };
  const COLS = [['n', /^ten tre$|^ho (va )?ten tre$|^ten be$/], ['dob', /ngay (thang nam )?sinh/], ['code', /ma dinh danh/],
    ['fn', /ho (va )?ten ba|ten cha/], ['fp', /(sdt|dien thoai) (ba|cha)/], ['fi', /(cccd|can cuoc cong dan|cmnd) (ba|cha)/],
    ['mn', /ho (va )?ten me/], ['mp', /(sdt|dien thoai) me/], ['mi', /(cccd|can cuoc cong dan|cmnd) me/],
    ['home', /que quan/], ['addr', /noi o|dia chi/], ['stk', /^stk$|so tai khoan/], ['bank', /ngan hang/]];
  function parseRows(rows) {
    const hi = rows.findIndex(r => r.some(c => COLS[0][1].test(norm(String(c || '')).trim())));
    if (hi < 0) return null;
    const map = {}; rows[hi].forEach((c, i) => { const h = norm(String(c || '')).replace(/\s+/g, ' ').trim(); const k = COLS.find(x => x[1].test(h)); if (k && map[k[0]] == null) map[k[0]] = i; });
    const g = (r, k) => map[k] == null ? '' : r[map[k]] ?? '', out = [], stray = [], warn = [];
    rows.slice(hi + 1).forEach((r, i) => {
      if (!r.some(c => String(c ?? '').trim())) return;
      const n = title(g(r, 'n')), line = hi + i + 2;
      if (!n) { stray.push({line, vals:r.map(c => String(c ?? '').trim()).filter(Boolean)}); return; }
      const rec = {line, n, dob:dateOf(g(r, 'dob')), code:idOf(g(r, 'code')), home:String(g(r, 'home')).replace(/\s+/g, ' ').trim(), addr:String(g(r, 'addr')).replace(/\s+/g, ' ').trim(),
        stk:digits(g(r, 'stk')), bank:String(g(r, 'bank')).trim(), par:[]};
      [['Ba', 'fn', 'fp', 'fi'], ['Mẹ', 'mn', 'mp', 'mi']].forEach(([rel, kn, kp, ki]) => { const pn = title(g(r, kn)); if (pn) rec.par.push({rel, n:pn, phone:phoneOf(g(r, kp)), cccd:idOf(g(r, ki))}); });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.dob)) warn.push(`${n}: ${L('date of birth unreadable', 'ngày sinh không đọc được')} “${rec.dob}”`);
      rec.par.forEach(p => { if (p.phone && p.phone.length !== 10) warn.push(`${p.n}: ${L('phone has', 'SĐT có')} ${p.phone.length} ${L('digits', 'chữ số')}`); });
      if (!rec.par.length) warn.push(`${n}: ${L('no parent on this row', 'không có tên phụ huynh')}`);
      out.push(rec);
    });
    return {rows:out, stray, warn};
  }

  /* ---- families: children sharing a parent (CCCD, or name + phone) are one family; existing families are joined too ---- */
  const pkeys = p => [p.cccd && 'id:' + p.cccd, p.phone && 'np:' + norm(p.n) + ':' + p.phone].filter(Boolean);
  const isDup = r => studs().some(s => (r.code && s.code === r.code) || (norm(s.n) === norm(r.n) && s.dob === r.dob));
  function plan(rows) { // group the new rows into families without writing anything (used by the preview and the import)
    const keyFam = {}; grds().forEach(g => pkeys(g).forEach(k => { keyFam[k] = g.fid; }));
    const groups = []; // {fid (existing) | null, rows:[]}
    rows.filter(r => !isDup(r)).forEach(r => {
      const ks = r.par.flatMap(pkeys), ex = ks.map(k => keyFam[k]).find(Boolean);
      let gp = groups.find(x => x.keys.some(k => ks.includes(k)) || (ex && x.fid === ex));
      if (!gp) groups.push(gp = {fid:ex || null, keys:[], rows:[]});
      gp.rows.push(r); ks.forEach(k => { if (!gp.keys.includes(k)) gp.keys.push(k); }); if (ex && !gp.fid) gp.fid = ex;
    });
    return groups;
  }
  function importRows(rows) {
    const loc = state.loc === 'all' ? KD.locs[0].id : state.loc; let nk = 0, nf = 0;
    plan(rows).forEach(gp => {
      let fid = gp.fid; const r0 = gp.rows[0];
      if (!fid) { fid = uid('f'); fams().push({fid, addr:r0.addr, home:r0.home, stk:r0.stk, bank:r0.bank}); nf++; }
      const fam = fams().find(f => f.fid === fid);
      gp.rows.forEach(r => {
        ['addr', 'home', 'stk', 'bank'].forEach(k => { if (!fam[k] && r[k]) fam[k] = r[k]; });
        r.par.forEach(p => { const g = grds().find(x => x.fid === fid && x.rel === p.rel && (pkeys(x).some(k => pkeys(p).includes(k)) || norm(x.n) === norm(p.n)));
          if (g) { ['phone', 'cccd'].forEach(k => { if (!g[k] && p[k]) g[k] = p[k]; }); } else grds().push(Object.assign({gid:uid('g'), fid}, p)); });
        studs().push({sid:uid('s'), fid, n:r.n, dob:r.dob, code:r.code, loc}); nk++;
      });
    });
    return [nk, nf];
  }

  /* ---- a re-imported list can update the children already here (only values the file actually has) ---- */
  const m4 = v => String(v).length > 4 ? '••••' + String(v).slice(-4) : String(v);
  function diffRow(r) {
    const s = studs().find(x => (r.code && x.code === r.code) || (norm(x.n) === norm(r.n) && x.dob === r.dob)); if (!s) return null;
    const ch = [], fam = famOf(s.fid), cmp = (lab, o, n, set, mask) => { if (n && n !== (o || '')) ch.push({lab, o:mask ? m4(o || '') : (o || ''), n:mask ? m4(n) : n, set:() => set(n)}); };
    cmp(L('name', 'tên'), s.n, r.n, v => { s.n = v; }); cmp(L('born', 'ngày sinh'), s.dob, r.dob, v => { s.dob = v; }); cmp(L('child ID', 'mã định danh'), s.code, r.code, v => { s.code = v; }, true);
    [['home', 'hometown', 'quê quán'], ['addr', 'address', 'nơi ở'], ['stk', 'bank account', 'STK', true], ['bank', 'bank', 'ngân hàng']].forEach(([k, en, vi, mk]) => cmp(L(en, vi), fam[k], r[k], v => { fam[k] = v; }, mk));
    r.par.forEach(p => { const g = parsOf(s.fid).find(x => x.rel === p.rel);
      if (!g) { ch.push({lab:p.rel, o:'', n:p.n, set:() => grds().push({gid:uid('g'), fid:s.fid, rel:p.rel, n:p.n, phone:p.phone, cccd:p.cccd})}); return; }
      cmp(p.rel + ' ' + L('name', 'tên'), g.n, p.n, v => { g.n = v; }); cmp(p.rel + ' ' + L('phone', 'SĐT'), g.phone, p.phone, v => { g.phone = v; }); cmp(p.rel + ' CCCD', g.cccd, p.cccd, v => { g.cccd = v; }, true); });
    return {s, ch};
  }
  const applyDiffs = rows => { let n = 0; rows.filter(isDup).map(diffRow).forEach(d => { if (d && d.ch.length) { d.ch.forEach(c => c.set()); n++; } }); return n; };
  function logImport(p, added, updated, dupN) { // so Accounting › Spreadsheets lists every file that was imported
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    (state.imports || (state.imports = [])).push({id:'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name:p.name || L('list', 'danh sách'), sheet:'', kind:'roster', on:d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), added, upd:updated, skipped:Math.max(0, dupN - updated), bad:0, from:'', to:'', total:0});
  }

  /* ---- export the whole list: every column of the school's spreadsheet, so it can be opened in Excel or imported again ---- */
  const FULL = ['Họ và tên trẻ', 'Ngày sinh', 'Mã định danh', 'Họ và tên ba', 'SĐT ba', 'CCCD ba', 'Họ và tên mẹ', 'SĐT mẹ', 'CCCD mẹ', 'Quê quán', 'Nơi ở', 'STK', 'Ngân hàng'];
  function exportFull(kind) {
    if (!confirm(L('This file includes child ID, CCCD and bank account numbers. Keep it private.', 'Tệp này có mã định danh, CCCD và số tài khoản. Hãy giữ kín.'))) return;
    const rows = studentsIn().slice().sort((a, b) => a.n.localeCompare(b.n, 'vi')).map(s => { const P = r => parsOf(s.fid).find(g => g.rel === r) || {}, f = famOf(s.fid);
      return [s.n, dmy(s.dob), s.code, P('Ba').n, P('Ba').phone, P('Ba').cccd, P('Mẹ').n, P('Mẹ').phone, P('Mẹ').cccd, f.home, f.addr, f.stk, f.bank]; });
    const a = document.createElement('a'); let blob, name;
    if (kind === 'xls') { const c = v => `<td>${esc(String(v ?? ''))}</td>`;
      blob = new Blob(['\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>td,th{mso-number-format:"\\@";border:1px solid #999;padding:3px 6px}th{background:#eee}</style></head><body><table><tr>' + FULL.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>' + rows.map(r => '<tr>' + r.map(c).join('') + '</tr>').join('') + '</table></body></html>'], {type:'application/vnd.ms-excel'}); name = 'danh-sach-hoc-sinh.xls'; }
    else { const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'; blob = new Blob(['\uFEFF' + [FULL].concat(rows).map(r => r.map(q).join(',')).join('\n')], {type:'text/csv;charset=utf-8'}); name = 'danh-sach-hoc-sinh.csv'; }
    a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---- shared bits of the views ---- */
  const famOf = fid => fams().find(f => f.fid === fid) || {};
  const kidsOf = fid => studs().filter(s => s.fid === fid);
  const parsOf = fid => grds().filter(g => g.fid === fid);
  const ageM = dob => { const d = new Date(dob + 'T00:00:00'); if (isNaN(d)) return null; const t = new Date(); return (t.getFullYear() - d.getFullYear()) * 12 + t.getMonth() - d.getMonth() - (t.getDate() < d.getDate() ? 1 : 0); };
  const ageTxt = m => m == null ? '' : m < 36 ? `${m} ${L('mo', 'th')}` : `${Math.floor(m / 12)} ${L('y', 'tuổi')} ${m % 12 ? (m % 12) + ' ' + L('mo', 'th') : ''}`;
  const group = m => m == null ? '' : m < 24 ? L('Under 24 mo', 'Dưới 24 th') : m < 36 ? L('Nursery', 'Nhà trẻ') : m < 48 ? L('Mầm (3–4)', 'Mầm') : m < 60 ? L('Chồi (4–5)', 'Chồi') : m < 72 ? L('Lá (5–6)', 'Lá') : L('Over 6', 'Trên 6 tuổi');
  const dmy = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : d;
  const mask = (k, v) => v ? `<button class="wbtn sm kf-mask" data-show="${k}" title="${L('Tap to show or hide', 'Bấm để hiện hoặc ẩn')}">${esc(shown === k ? v : '••••' + v.slice(-4))}</button>` : '';
  const phone = p => p ? `<a class="kf-tel" href="tel:${esc(p)}">${esc(p)}</a> <button class="wbtn sm" data-copy="${esc(p)}" aria-label="${L('Copy', 'Sao chép')}">⧉</button>` : `<span class="muted">${L('no phone', 'chưa có SĐT')}</span>`;
  const famName = fid => parsOf(fid).map(g => g.n).join(' – ') || kidsOf(fid).map(k => k.n).join(', ');
  function wireCommon(b, rp) {
    b.querySelectorAll('[data-show]').forEach(x => x.onclick = () => { shown = shown === x.dataset.show ? '' : x.dataset.show; rp(); });
    b.querySelectorAll('[data-copy]').forEach(x => x.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(x.dataset.copy); toast(t('copied')); });
    b.querySelectorAll('[data-kid]').forEach(x => x.onclick = () => openKid(x.dataset.kid));
    b.querySelectorAll('[data-edit]').forEach(x => x.onclick = () => openForm(x.dataset.edit));
  }

  /* ---- Cards: popups that stack. The family card holds the whole family; a name card holds one child and opens from a sibling's name. ---- */
  const parentsTable = fid => table([L('Parent', 'Phụ huynh'), L('Phone / Zalo', 'SĐT / Zalo'), 'CCCD'], parsOf(fid).map(g => [`${esc(g.rel)}: <b>${esc(g.n)}</b>`, phone(g.phone), mask('g' + g.gid, g.cccd) || '<span class="muted">–</span>']));
  const kidChip = (k, extra) => `<button class="kx-chip kf-chip" data-kid="${k.sid}" title="${L('Open name card', 'Mở thẻ của bé')}">${esc(k.n + (extra || ''))}</button>`;
  function closeCards() { document.querySelectorAll('.kf-card-back').forEach(x => x._close ? x._close() : x.remove()); }
  function cardShell(label, body, after) {
    const back = document.createElement('div'); back.className = 'kf-card-back'; const depth = document.querySelectorAll('.kf-card-back').length;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (!document.querySelector('.kf-card-back')) shown = ''; };
    const onKey = e => { if (e.key === 'Escape' && back === [...document.querySelectorAll('.kf-card-back')].pop()) close(); };
    const draw = () => {
      back.innerHTML = `<div class="kf-card" role="dialog" aria-modal="true" aria-label="${esc(label())}" style="transform:translate(${depth * 20}px,${depth * 20}px)"><button class="kf-card-x" aria-label="${L('Close', 'Đóng')}">×</button>${body()}</div>`;
      back.querySelector('.kf-card-x').onclick = close;
      back.querySelectorAll('[data-show]').forEach(x => x.onclick = () => { shown = shown === x.dataset.show ? '' : x.dataset.show; draw(); });
      back.querySelectorAll('[data-copy]').forEach(x => x.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(x.dataset.copy); toast(t('copied')); });
      back.querySelectorAll('[data-kid]').forEach(x => x.onclick = () => openKid(x.dataset.kid));
      back.querySelectorAll('[data-edit]').forEach(x => x.onclick = () => { closeCards(); openForm(x.dataset.edit); });
      back.querySelectorAll('[data-fcard]').forEach(x => x.onclick = () => openCard(x.dataset.fcard));
      back.querySelectorAll('[data-fdir]').forEach(x => x.onclick = () => { closeCards(); showFamily(x.dataset.fdir); });
      if (after) after(back, close);
    };
    back._close = close; back.onclick = e => { if (e.target === back) close(); };
    document.addEventListener('keydown', onKey); draw(); document.body.appendChild(back);
  }
  /* the whole family: parents, children (each name opens its own card), address, bank */
  function openCard(fid) {
    if (!famOf(fid).fid) return;
    cardShell(() => famName(fid), () => { const f = famOf(fid);
      return `<h3 class="kf-card-h">${esc(famName(fid))}</h3><p class="muted" style="margin:0 0 8px">${L('Family', 'Gia đình')} · ${kidsOf(fid).length} ${L('child(ren)', 'trẻ')}</p>
        <h4 class="wh">${L('Parents', 'Phụ huynh')}</h4>${parentsTable(fid)}
        <h4 class="wh">${L('Children', 'Con')}</h4>
        <div>${kidsOf(fid).map(k => kidChip(k, ' · ' + dmy(k.dob) + ' · ' + ageTxt(ageM(k.dob)))).join('')}</div>
        <p class="hint" style="margin:4px 0 0">${L('Click a child’s name to open their own card.', 'Bấm tên bé để mở thẻ của bé đó.')}</p>
        ${f.addr || f.home ? `<h4 class="wh">${L('Address', 'Địa chỉ')}</h4><div class="muted">${f.addr ? L('Lives at', 'Nơi ở') + ': ' + esc(f.addr) : ''}${f.addr && f.home ? '<br>' : ''}${f.home ? L('Hometown', 'Quê quán') + ': ' + esc(f.home) : ''}</div>` : ''}
        ${f.stk ? `<h4 class="wh">${L('Bank', 'Tài khoản')}</h4><div class="muted">${mask('b' + fid, f.stk)} ${esc(f.bank)}</div>` : ''}
        <div class="btn-row" style="margin-top:12px"><button class="wbtn sm" data-edit="${kidsOf(fid)[0].sid}">${L('Edit', 'Sửa')}</button><button class="wbtn sm" data-fdir="${fid}">${L('Open in Family Directory', 'Mở trong Danh bạ gia đình')}</button></div>`; });
  }
  /* one child: a new name card, opened from the roster or from a sibling's name */
  function openKid(sid) {
    const s0 = studs().find(x => x.sid === sid); if (!s0) return;
    cardShell(() => s0.n, () => { const s = studs().find(x => x.sid === sid) || s0, m = ageM(s.dob), sib = kidsOf(s.fid).filter(x => x.sid !== s.sid), row = (a, v) => `<div class="arow"><span class="name">${a}</span><span class="val">${v}</span></div>`;
      return `<h3 class="kf-card-h">${esc(s.n)}</h3><p class="muted" style="margin:0 0 8px">${L('Child', 'Trẻ')}${group(m) ? ' · ' + esc(group(m)) : ''}</p>
        ${row(L('Born', 'Ngày sinh'), esc(dmy(s.dob)))}${row(L('Age', 'Tuổi'), esc(ageTxt(m)))}${row(L('Campus', 'Cơ sở'), esc(locName(s.loc)))}
        ${s.code ? row(L('Child ID', 'Mã định danh'), mask('k' + s.sid, s.code)) : ''}
        <h4 class="wh">${L('Parents', 'Phụ huynh')}</h4>${parentsTable(s.fid)}
        <h4 class="wh">${L('Brothers and sisters', 'Anh chị em')}</h4>
        <div>${sib.length ? sib.map(x => kidChip(x, ' · ' + ageTxt(ageM(x.dob)))).join('') : `<span class="muted">${L('No sibling here.', 'Không có anh chị em cùng trường.')}</span>`}</div>
        <div class="btn-row" style="margin-top:12px"><button class="wbtn sm" data-edit="${s.sid}">${L('Edit', 'Sửa')}</button><button class="wbtn sm" data-fcard="${s.fid}">${L('Family card', 'Thẻ gia đình')}</button></div>`; });
  }
  /* ---- New student: one form with every column of the school's list; creates the child, both parents and the family ---- */
  function addTo(fid, rec, loc) { // a brother or sister of a child already here
    const fam = famOf(fid); ['addr', 'home', 'stk', 'bank'].forEach(k => { if (!fam[k] && rec[k]) fam[k] = rec[k]; });
    rec.par.forEach(p => { const g = grds().find(x => x.fid === fid && x.rel === p.rel && (pkeys(x).some(k => pkeys(p).includes(k)) || norm(x.n) === norm(p.n)));
      if (g) { ['phone', 'cccd'].forEach(k => { if (!g[k] && p[k]) g[k] = p[k]; }); } else grds().push(Object.assign({gid:uid('g'), fid}, p)); });
    studs().push({sid:uid('s'), fid, n:rec.n, dob:rec.dob, code:rec.code, loc});
  }
  const openNew = () => openForm();
  function openForm(sid) { // no sid: a new student. With a sid: edit that child, their parents and their family.
    const st0 = sid ? studs().find(x => x.sid === sid) : null; if (sid && !st0) return;
    const fo = fams().filter(f => kidsOf(f.fid).length), tx = (id, en, vi, type, ph) => `<label class="kx-rate" style="flex:1;min-width:150px">${L(en, vi)}<input type="${type || 'text'}" id="nw-${id}"${ph ? ` placeholder="${esc(ph)}"` : ''}></label>`;
    const row = inner => `<div class="btn-row" style="align-items:flex-end;margin-bottom:6px">${inner}</div>`, fname = f => `${esc(famName(f.fid))} (${esc(kidsOf(f.fid).map(k => k.n).join(', '))})`;
    const sel = st0 ? `<label class="kx-rate" style="margin-bottom:8px">${L('Family', 'Gia đình')}<select id="nw-fam">${fo.map(f => `<option value="${f.fid}"${f.fid === st0.fid ? ' selected' : ''}>${fname(f)}</option>`).join('')}</select></label>
        <p class="hint" style="margin:0 0 6px">${L('Parents and family details are shared by every child in the family. Choose another family to move this child.', 'Phụ huynh và thông tin gia đình dùng chung cho mọi bé trong gia đình. Chọn gia đình khác để chuyển bé sang đó.')}</p>`
      : fo.length ? `<label class="kx-rate" style="margin-bottom:8px">${L('Brother or sister of a child already here? Join that family', 'Là anh chị em của bé đã có? Chọn gia đình đó')}<select id="nw-fam"><option value="">${L('No: a new family', 'Không: gia đình mới')}</option>${fo.map(f => `<option value="${f.fid}">${fname(f)}</option>`).join('')}</select></label>` : '';
    cardShell(() => st0 ? st0.n : L('New student', 'Thêm học sinh'), () => `<div class="kx kf-new"><h3 class="kf-card-h">${st0 ? L('Edit student', 'Sửa thông tin học sinh') : L('New student', 'Thêm học sinh')}</h3>
      <p class="muted" style="margin:0 0 8px">${L('The same columns as the school’s list. Only the child’s name, birth date and one parent are needed.', 'Các cột giống danh sách của trường. Chỉ cần tên bé, ngày sinh và một phụ huynh.')}</p>
      ${sel}
      ${KD.locs.length > 1 ? `<label class="kx-rate" style="margin-bottom:8px">${L('Campus', 'Cơ sở')}<select id="nw-loc">${KD.locs.map(l => `<option value="${l.id}"${l.id === (st0 ? st0.loc : state.loc === 'all' ? KD.locs[0].id : state.loc) ? ' selected' : ''}>${esc(l[state.lang])}</option>`).join('')}</select></label>` : ''}
      <h4 class="wh">${L('Child', 'Trẻ')}</h4>${row(tx('n', 'Full name *', 'Họ và tên trẻ *') + tx('dob', 'Date of birth *', 'Ngày sinh *', 'date') + tx('code', 'Child ID (mã định danh)', 'Mã định danh', 'text', '12 digits'))}
      <h4 class="wh">${L('Father', 'Ba')}</h4>${row(tx('fn', 'Full name', 'Họ và tên ba') + tx('fp', 'Phone / Zalo', 'SĐT / Zalo', 'tel') + tx('fi', 'CCCD', 'CCCD ba'))}
      <h4 class="wh">${L('Mother', 'Mẹ')}</h4>${row(tx('mn', 'Full name', 'Họ và tên mẹ') + tx('mp', 'Phone / Zalo', 'SĐT / Zalo', 'tel') + tx('mi', 'CCCD', 'CCCD mẹ'))}
      <h4 class="wh">${L('Family', 'Gia đình')}</h4>${row(tx('home', 'Hometown (quê quán)', 'Quê quán') + tx('addr', 'Lives at (nơi ở)', 'Nơi ở'))}${row(tx('stk', 'Bank account number', 'Số tài khoản', 'text') + tx('bank', 'Bank', 'Ngân hàng'))}
      <p class="hint" id="nw-msg" style="color:var(--danger);min-height:16px"></p>
      <div class="btn-row"><button class="wbtn primary" id="nw-save">${L('Save', 'Lưu')}</button>${st0 ? '' : `<button class="wbtn" id="nw-more">${L('Save and add another', 'Lưu và thêm bé khác')}</button>`}<button class="wbtn" id="nw-no">${L('Cancel', 'Hủy')}</button></div></div>`,
      (card, close) => {
        const $q = x => card.querySelector(x), v = id => ($q('#nw-' + id) || {}).value || '', set = (id, val) => { const e = $q('#nw-' + id); if (e) e.value = val || ''; };
        const fill = fid => { const f = famOf(fid), P = rel => parsOf(fid).find(g => g.rel === rel) || {}; // a family's parents and address fill in, still editable
          set('fn', P('Ba').n); set('fp', P('Ba').phone); set('fi', P('Ba').cccd); set('mn', P('Mẹ').n); set('mp', P('Mẹ').phone); set('mi', P('Mẹ').cccd);
          set('home', f.home); set('addr', f.addr); set('stk', f.stk); set('bank', f.bank); };
        const fs = $q('#nw-fam'); if (fs) fs.onchange = () => fill(fs.value);
        if (st0) { set('n', st0.n); set('dob', st0.dob); set('code', st0.code); fill(st0.fid); }
        const save = more => {
          const msg = t => { $q('#nw-msg').textContent = t; };
          const rels = [['Ba', 'f'], ['Mẹ', 'm']].map(([rel, k]) => ({rel, n:title(v(k + 'n')), phone:phoneOf(v(k + 'p')), cccd:idOf(v(k + 'i'))}));
          const rec = {n:title(v('n')), dob:dateOf(v('dob')), code:idOf(v('code')), home:v('home').replace(/\s+/g, ' ').trim(), addr:v('addr').replace(/\s+/g, ' ').trim(), stk:digits(v('stk')), bank:v('bank').trim(), par:rels.filter(p => p.n)};
          if (!rec.n) return msg(L('Type the child’s name.', 'Hãy nhập tên bé.'));
          if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.dob)) return msg(L('Choose the date of birth.', 'Hãy chọn ngày sinh.'));
          if (!rec.par.length) return msg(L('Type at least one parent’s name.', 'Hãy nhập tên ít nhất một phụ huynh.'));
          const bp = rec.par.find(p => p.phone && p.phone.length !== 10); if (bp) return msg(L(`${bp.n}: the phone should have 10 digits.`, `${bp.n}: SĐT cần đủ 10 chữ số.`));
          if (rec.code && rec.code.length !== 12) return msg(L('The child ID should have 12 digits.', 'Mã định danh cần đủ 12 chữ số.'));
          const same = st0 ? studs().some(x => x.sid !== sid && ((rec.code && x.code === rec.code) || (norm(x.n) === norm(rec.n) && x.dob === rec.dob))) : isDup(rec);
          if (same) return msg(L('This child is already in the roster.', 'Bé này đã có trong danh sách.'));
          if (st0) { // ---- edit: child, then the family and its two parents
            const tf = fs.value || st0.fid, gone = rels.filter(p => !p.n && parsOf(tf).some(g => g.rel === p.rel));
            if (gone.length && !confirm(L('Remove ' + gone.map(p => p.rel).join(' and ') + ' from this family?', 'Xóa ' + gone.map(p => p.rel).join(' và ') + ' khỏi gia đình này?'))) return;
            st0.n = rec.n; st0.dob = rec.dob; st0.code = rec.code; if (v('loc')) st0.loc = v('loc');  // v0.4.32: campus
            const fam = famOf(tf); ['home', 'addr', 'stk', 'bank'].forEach(k => { fam[k] = rec[k]; });
            rels.forEach(p => { const g = parsOf(tf).find(x => x.rel === p.rel);
              if (!p.n) { if (g) state.guardians = grds().filter(x => x !== g); }
              else if (g) { g.n = p.n; g.phone = p.phone; g.cccd = p.cccd; } else grds().push({gid:uid('g'), fid:tf, rel:p.rel, n:p.n, phone:p.phone, cccd:p.cccd}); });
            const old = st0.fid; st0.fid = tf;
            if (old !== tf && !kidsOf(old).length) { state.guardians = grds().filter(g => g.fid !== old); state.families = fams().filter(f => f.fid !== old); }  // no child left: the old family goes
            saveState(); closeCards(); toast(L('Saved ' + rec.n, 'Đã lưu ' + rec.n), 2500); refreshWidget('roster'); refreshWidget('parents'); return;
          }
          const loc = v('loc') || (state.loc === 'all' ? KD.locs[0].id : state.loc), fid = fs ? fs.value : '';
          if (fid) addTo(fid, rec, loc); else importRows([rec]);
          saveState(); const s = studs().find(x => x.n === rec.n && x.dob === rec.dob);
          closeCards(); toast(L('Saved ' + rec.n, 'Đã lưu ' + rec.n), 2500);
          if (more) { refreshWidget('roster'); refreshWidget('parents'); openForm(); } else if (s) pairWith(s.fid, s.sid); else { refreshWidget('roster'); refreshWidget('parents'); }
        };
        $q('#nw-save').onclick = () => save(false); const mo = $q('#nw-more'); if (mo) mo.onclick = () => save(true); $q('#nw-no').onclick = close; setTimeout(() => $q('#nw-n').focus(), 30);
      });
  }
  /* the Family Directory focused on one family (or, in side by side, the right-hand list) */
  function showFamily(fid) {
    pf = fid; fq = '';
    if (split && (widgetEls.roster || widgetEls.parents)) { refreshWidget('roster'); refreshWidget('parents'); return; }
    openWidget('parents'); renderWidget('parents'); bringToFront(widgetEls.parents.el); syncDock();
  }
  /* a child's name in the roster: the parents open beside the roster, focused on that family */
  function pairWith(fid, sid) { split = true; pf = fid; fq = ''; selSid = sid; refreshWidget('roster'); refreshWidget('parents'); }

  /* ---- Student Roster: one row per child, with parents and siblings ---- */
  const roster = WIDGETS.find(w => w.id === 'roster');
  Object.assign(roster, { w:760, h:560, full:true,
    html() { return preview ? this.previewHtml() : page('roster'); },
    mainHtml() {
      const nq = norm(rq), live = studentsIn().filter(s => norm(s.n + ' ' + famName(s.fid)).includes(nq)).sort((a, b) => a.n.localeCompare(b.n, 'vi'));
      const demo = demoOn() ? KD.kids.filter(k => inLoc(k.l) && norm(k.n).includes(nq)) : [];
      const rows = live.map((s, i) => { const m = ageM(s.dob), sib = kidsOf(s.fid).filter(x => x.sid !== s.sid);
        return [i + 1, `<button class="kf-name${selSid === s.sid ? ' kf-sel' : ''}" data-pair="${s.fid}:${s.sid}" title="${L('Show the parents beside the list', 'Xem phụ huynh bên cạnh danh sách')}">${esc(s.n)}</button>`, esc(dmy(s.dob)), esc(ageTxt(m)), esc(group(m)),
          sib.length ? sib.map(x => kidChip(x)).join('') : '<span class="muted">–</span>',
          `<button class="wbtn sm" data-edit="${s.sid}">${L('Edit', 'Sửa')}</button> <button class="wbtn sm" data-fam="${s.fid}" title="${L('Open the whole family card', 'Mở thẻ cả gia đình')}">${L('Family', 'Gia đình')}</button> <button class="wbtn sm" data-sdel="${s.sid}" aria-label="${L('Remove', 'Xóa')}">×</button>`]; });
      return `<div class="btn-row" style="margin-bottom:10px"><input type="text" id="kf-rq" placeholder="${L('Search child or parent (diacritics optional)', 'Tìm bé hoặc phụ huynh (có hoặc không dấu)')}" value="${esc(rq)}" style="flex:1;min-width:150px">
          <button class="wbtn primary" id="kf-new">${L('+ New student', '+ Thêm học sinh')}</button><button class="wbtn" id="kf-imp">${L('Import list (.csv, .xlsx)', 'Nhập danh sách (.csv, .xlsx)')}</button><input type="file" id="kf-file" accept=".csv,.xlsx" hidden><button class="wbtn sm" id="kf-xl" title="${L('Every column of the school’s list, opens in Excel', 'Đủ mọi cột của danh sách trường, mở bằng Excel')}">${L('Export Excel (full list)', 'Xuất Excel (đủ cột)')}</button><button class="wbtn sm" id="kf-xc" title="${L('Same columns as CSV; can be imported again', 'Cùng các cột, dạng CSV; có thể nhập lại')}">${L('Full list (CSV)', 'Đủ cột (CSV)')}</button><button class="wbtn sm" id="kd-csv" title="${L('Names and phones only, no ID or bank numbers', 'Chỉ tên và SĐT, không có số định danh hay tài khoản')}">${L('Contact list (CSV)', 'Danh bạ (CSV)')}</button></div>
        ${tiles([[studentsIn().length, L('Children', 'Trẻ')], [new Set(studentsIn().map(s => s.fid)).size, L('Families', 'Gia đình')], [studentsIn().filter(s => kidsOf(s.fid).length > 1).length, L('With a sibling here', 'Có anh chị em cùng trường')]])}
        <div class="kx-scroll" style="margin-top:10px">${table(['#', L('Child', 'Họ tên trẻ'), L('Born', 'Ngày sinh'), L('Age', 'Tuổi'), L('Group', 'Nhóm'), L('Siblings', 'Anh chị em'), ''], rows)}</div>
        ${demo.length ? `<h4 class="wh">${L('Demo children', 'Trẻ mẫu')} <span class="badge">${L('demo', 'mẫu')}</span></h4>${table([L('Child', 'Bé'), L('Class', 'Lớp'), L('Campus', 'Cơ sở'), L('Allergy', 'Dị ứng')], demo.map(k => [esc(k.n), esc((KD.classes.find(c => c.id === k.c) || {}).n || ''), esc(locName(k.l)), k.al ? `<span class="badge warn">${esc(k.al)}</span>` : '–']))}` : ''}
        <p class="hint" style="margin-top:8px">${L('Kept only in this browser on this computer. Click a child’s name to see the parents beside the list; “Family” opens the whole family card; click a brother or sister to open their own card. Children who share a parent are one family.', 'Chỉ lưu trong trình duyệt trên máy này. Bấm vào tên bé để xem phụ huynh bên cạnh danh sách; nút “Gia đình” mở thẻ cả gia đình; bấm tên anh chị em để mở thẻ của bé đó. Các bé có chung ba hoặc mẹ là một gia đình.')}</p>`;
    },
    previewHtml() {
      const p = preview, groups = plan(p.rows), dup = p.rows.filter(isDup), diffs = dup.map(diffRow).filter(d => d && d.ch.length), nup = updExisting ? diffs.length : 0;
      const fams_ = groups.map((g, i) => `<div class="kf-fam"><b>${g.fid ? L('Joins existing family: ', 'Vào gia đình đã có: ') + esc(famName(g.fid)) : L('New family ', 'Gia đình mới ') + (i + 1)}</b>
          <div>${g.rows.map(r => `<span class="kx-chip">${esc(r.n)} · ${esc(dmy(r.dob))}</span>`).join('')}</div>
          <div class="muted">${[...new Map(g.rows.flatMap(r => r.par).map(x => [x.rel + norm(x.n), x])).values()].map(x => `${esc(x.rel)}: ${esc(x.n)} ${esc(x.phone)}`).join(' · ') || L('no parent', 'chưa có phụ huynh')}</div></div>`).join('');
      return `<h4 class="wh">${L('Check before importing', 'Kiểm tra trước khi nhập')}: ${p.rows.length} ${L('children', 'trẻ')}, ${groups.length} ${L('families', 'gia đình')}${dup.length ? `, ${dup.length} ${L('already in the roster (skipped)', 'đã có (bỏ qua)')}` : ''}</h4>
        ${dup.length ? `<label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="kf-upd"${updExisting ? ' checked' : ''}> ${L(`Update the ${dup.length} children already in the roster with this file’s values`, `Cập nhật ${dup.length} bé đã có trong danh sách theo tệp này`)}</label>
          ${diffs.length ? `<ul class="kf-list">${diffs.slice(0, 12).map(d => `<li><b>${esc(d.s.n)}</b>: ${d.ch.map(c => `${esc(c.lab)} ${c.o ? esc(c.o) + ' → ' : ''}${esc(c.n)}`).join('; ')}</li>`).join('')}${diffs.length > 12 ? `<li>… +${diffs.length - 12}</li>` : ''}</ul>` : `<p class="hint">${L('No differences from what is already here.', 'Không có khác biệt so với dữ liệu đang có.')}</p>`}` : ''}
        ${fams_ || `<p class="empty">${L('Nothing new to import.', 'Không có gì mới để nhập.')}</p>`}
        ${p.warn.length ? `<h4 class="wh">${L('Worth a look', 'Cần xem lại')}</h4><ul class="kf-list">${p.warn.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${p.stray.length ? `<h4 class="wh">${L('Rows with no child name (not imported)', 'Dòng không có tên trẻ (không nhập)')}</h4><ul class="kf-list">${p.stray.map(x => `<li>${L('line', 'dòng')} ${x.line}: ${esc(x.vals.map(v => /^\d{9,}$/.test(v) ? '••••' + v.slice(-4) : v).join(', '))}</li>`).join('')}</ul>` : ''}
        <div class="btn-row" style="margin-top:10px"><button class="wbtn primary" id="kf-ok"${groups.length || nup ? '' : ' disabled'}>${L('Import', 'Nhập')} ${p.rows.length - dup.length} ${L('children', 'trẻ')}${nup ? ` + ${L('update', 'cập nhật')} ${nup}` : ''}</button><button class="wbtn" id="kf-no">${L('Cancel', 'Hủy')}</button></div>
        <p class="hint" style="margin-top:8px">${L('Phone and ID numbers that lost their leading 0 in Excel are fixed; names are capitalised. Children with the same father or mother (same CCCD, or same name and phone) become one family.', 'SĐT và số định danh bị mất số 0 đầu trong Excel được sửa lại; tên được viết hoa chữ đầu. Các bé có cùng ba hoặc mẹ (trùng CCCD, hoặc trùng tên và SĐT) được gộp thành một gia đình.')}</p>`;
    },
    wire(b, rp) {
      if (preview) {
        const upd = b.querySelector('#kf-upd'); if (upd) upd.onchange = () => { updExisting = upd.checked; rp(); };
        b.querySelector('#kf-ok').onclick = () => { const dupN = preview.rows.filter(isDup).length, [nk, nf] = importRows(preview.rows), nu = updExisting ? applyDiffs(preview.rows) : 0; logImport(preview, nk, nu, dupN); preview = null; saveState(); rp(); refreshWidget('parents');
          toast(L(`Imported ${nk} children, ${nf} new families${nu ? ', updated ' + nu : ''}`, `Đã nhập ${nk} trẻ, ${nf} gia đình mới${nu ? ', cập nhật ' + nu : ''}`), 3500); };
        b.querySelector('#kf-no').onclick = () => { preview = null; rp(); };
        return;
      }
      wirePage(b, rp);
    },
    mainWire(b, rp) {
      b.querySelector('#kf-new').onclick = () => openNew();
      const f = b.querySelector('#kf-file'); b.querySelector('#kf-imp').onclick = () => f.click();
      f.onchange = async () => { const file = f.files[0]; if (!file) return;
        try { const rows = /\.xlsx$/i.test(file.name) ? await KS.readXlsx(file) : parseCsv(await file.text()), p = parseRows(rows);
          if (!p || !p.rows.length) return toast(L('No “Tên trẻ” column found', 'Không tìm thấy cột “Tên trẻ”'), 3500); p.name = file.name; preview = p; rp(); }
        catch (x) { toast(L('Could not read this file.', 'Không đọc được tệp này.'), 3500); } };
      const q = b.querySelector('#kf-rq'); q.oninput = () => { rq = q.value; const at = q.selectionStart; rp(); const n = b.querySelector('#kf-rq'); n.focus(); n.setSelectionRange(at, at); };
      b.querySelectorAll('[data-pair]').forEach(x => x.onclick = () => { const [fid, sid] = x.dataset.pair.split(':'); pairWith(fid, sid); });
      b.querySelectorAll('[data-fam]').forEach(x => x.onclick = () => openCard(x.dataset.fam));
      b.querySelectorAll('[data-sdel]').forEach(x => x.onclick = () => { const s = studs().find(y => y.sid === x.dataset.sdel); if (!confirm(L('Remove ' + s.n + '?', 'Xóa ' + s.n + ' khỏi danh sách?'))) return;
        state.students = studs().filter(y => y !== s); if (selSid === s.sid) { selSid = ''; if (pf === s.fid) pf = ''; }
        if (!kidsOf(s.fid).length) { state.guardians = grds().filter(g => g.fid !== s.fid); state.families = fams().filter(f => f.fid !== s.fid); }  // no child left: the family goes too
        saveState(); rp(); refreshWidget('parents'); });
      b.querySelector('#kf-xl').onclick = () => exportFull('xls'); b.querySelector('#kf-xc').onclick = () => exportFull('csv');
      b.querySelector('#kd-csv').onclick = () => { // names, dates, parents and phones; no ID or bank numbers
        const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', P = (s, r) => parsOf(s.fid).find(g => g.rel === r) || {};
        const csv = '﻿' + [['Họ tên trẻ', 'Ngày sinh', 'Nhóm', 'Ba', 'SĐT ba', 'Mẹ', 'SĐT mẹ', 'Anh chị em']].concat(studentsIn().map(s => [s.n, dmy(s.dob), group(ageM(s.dob)), P(s, 'Ba').n, P(s, 'Ba').phone, P(s, 'Mẹ').n, P(s, 'Mẹ').phone, kidsOf(s.fid).filter(x => x !== s).map(x => x.n).join('; ')]))
          .map(r => r.map(q).join(',')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); a.download = 'danh-sach-tre.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
      wireCommon(b, rp);
    } });

  /* ---- Parent Directory: one card per family, parents editable once for all their children ---- */
  const parents = WIDGETS.find(w => w.id === 'parents');
  Object.assign(parents, { w:760, h:560, full:true,
    html() { return page('parents'); },
    mainHtml() {
      const nq = norm(fq), list = fams().filter(f => (!pf || f.fid === pf) && kidsOf(f.fid).some(k => inLoc(k.loc)) && norm(famName(f.fid) + ' ' + kidsOf(f.fid).map(k => k.n).join(' ') + ' ' + parsOf(f.fid).map(g => g.phone).join(' ')).includes(nq));
      const other = fid => fams().filter(f => f.fid !== fid).map(f => `<option value="${f.fid}">${esc(famName(f.fid))}</option>`).join('');
      const cards = list.map(f => `<div class="kf-fam" data-fid="${f.fid}"><div class="kf-fam-h"><b>${esc(famName(f.fid))}</b><span><span class="muted">${kidsOf(f.fid).length} ${L('child(ren)', 'trẻ')}</span> <button class="wbtn sm" data-edit="${kidsOf(f.fid)[0].sid}">${L('Edit', 'Sửa')}</button></span></div>
          ${table([L('Parent', 'Phụ huynh'), L('Phone / Zalo', 'SĐT / Zalo'), 'CCCD'], parsOf(f.fid).map(g => [`${esc(g.rel)}: <b>${esc(g.n)}</b>`,
            `<input type="tel" class="kx-n" data-gp="${g.gid}" value="${esc(g.phone)}" style="width:120px"> ${g.phone ? `<button class="wbtn sm" data-copy="${esc(g.phone)}" aria-label="${L('Copy', 'Sao chép')}">⧉</button>` : ''}`, mask('g' + g.gid, g.cccd)]))}
          <div style="margin:6px 0">${L('Children', 'Con')}: ${kidsOf(f.fid).map(k => kidChip(k, ' · ' + ageTxt(ageM(k.dob)))).join('')}</div>
          <div class="muted">${f.addr ? L('Lives at', 'Nơi ở') + ': ' + esc(f.addr) : ''}${f.home ? ' · ' + L('Hometown', 'Quê quán') + ': ' + esc(f.home) : ''}</div>
          ${f.stk ? `<div class="muted">${L('Bank', 'Tài khoản')}: ${mask('b' + f.fid, f.stk)} ${esc(f.bank)}</div>` : ''}
          ${fams().length > 1 ? `<div class="btn-row" style="margin-top:6px"><select data-merge="${f.fid}"><option value="">${L('Same family as…', 'Cùng gia đình với…')}</option>${other(f.fid)}</select></div>` : ''}</div>`).join('');
      const demo = demoOn() ? kids() : [];
      return `<div class="btn-row" style="margin-bottom:10px"><input type="text" id="kf-fq" placeholder="${L('Search parent, child or phone', 'Tìm phụ huynh, bé hoặc SĐT')}" value="${esc(fq)}" style="flex:1;min-width:150px"><button class="wbtn primary" id="kf-new2">${L('+ New student', '+ Thêm học sinh')}</button>${pf ? `<span class="badge">${L('Showing', 'Đang xem')}: ${esc(famName(pf))}</span>` : ''}${fq || pf ? `<button class="wbtn sm" id="kf-fx">${L('Show all', 'Xem tất cả')}</button>` : ''}</div>
        ${tiles([[list.length, L('Families', 'Gia đình')], [list.reduce((a, f) => a + parsOf(f.fid).length, 0), L('Parents', 'Phụ huynh')], [list.reduce((a, f) => a + parsOf(f.fid).filter(g => !g.phone).length, 0), L('No phone yet', 'Chưa có SĐT')]])}
        <div style="margin-top:10px">${cards || `<p class="empty">${fams().length ? L('No family matches.', 'Không có gia đình phù hợp.') : L('No families yet: import the list in the Student Roster.', 'Chưa có gia đình: hãy nhập danh sách ở Danh sách học sinh.')}</p>`}</div>
        ${demo.length ? `<h4 class="wh">${L('Demo parents', 'Phụ huynh mẫu')} <span class="badge">${L('demo', 'mẫu')}</span></h4>${table([L('Parent', 'Phụ huynh'), L('Child', 'Bé'), 'Zalo / ' + L('Phone', 'ĐT')], demo.map(k => [esc(k.p), esc(k.n), `<button class="wbtn sm" data-copy="${esc(k.phone)}">${esc(k.phone)}</button>`]))}` : ''}`;
    },
    wire(b, rp) { wirePage(b, rp); },
    mainWire(b, rp) {
      const q = b.querySelector('#kf-fq'); q.oninput = () => { fq = q.value; pf = ''; selSid = ''; const at = q.selectionStart; rp(); const n = b.querySelector('#kf-fq'); n.focus(); n.setSelectionRange(at, at); };
      b.querySelector('#kf-new2').onclick = () => openNew();
      const fx = b.querySelector('#kf-fx'); if (fx) fx.onclick = () => { fq = ''; pf = ''; selSid = ''; rp(); };
      b.querySelectorAll('[data-gp]').forEach(x => x.onchange = () => { const g = grds().find(y => y.gid === x.dataset.gp); g.phone = phoneOf(x.value); saveState(); rp(); refreshWidget('roster'); });
      b.querySelectorAll('[data-merge]').forEach(x => x.onchange = () => { const from = x.dataset.merge, to = x.value; if (!to) return;
        if (!confirm(L('Put these two families together?', 'Gộp hai gia đình này làm một?'))) { x.value = ''; return; }
        studs().forEach(s => { if (s.fid === from) s.fid = to; });
        grds().filter(g => g.fid === from).forEach(g => { const same = grds().find(y => y.fid === to && y.rel === g.rel && norm(y.n) === norm(g.n)); if (same) { ['phone', 'cccd'].forEach(k => { if (!same[k]) same[k] = g[k]; }); state.guardians = grds().filter(y => y !== g); } else g.fid = to; });
        const a = famOf(from), z = famOf(to); ['addr', 'home', 'stk', 'bank'].forEach(k => { if (!z[k] && a[k]) z[k] = a[k]; });
        state.families = fams().filter(f => f.fid !== from); saveState(); rp(); refreshWidget('roster'); });
      wireCommon(b, rp);
    } });
  /* ---- full-screen pages: one directory, or both side by side (the same page from either dock button) ---- */
  function page(id) {
    const btn = `<div class="btn-row" style="margin-bottom:10px;justify-content:flex-end"><button class="wbtn sm ${split ? 'primary' : ''}" id="kf-split">⇆ ${L('Side by side', 'Xem song song')}</button></div>`;
    return `<div class="ss-root kf-page">${btn}${split ? `<div class="kx-split"><div><h3 class="kf-h">${esc(L(roster.en, roster.vi))}</h3>${roster.mainHtml()}</div><div><h3 class="kf-h">${esc(L(parents.en, parents.vi))}</h3>${parents.mainHtml()}</div></div>`
      : (id === 'roster' ? roster.mainHtml() : parents.mainHtml())}</div>`;
  }
  function wirePage(b, rp) {
    b.querySelector('#kf-split').onclick = () => { split = !split; rp(); };
    const id = widgetEls.parents && b === widgetEls.parents.el.querySelector('.widget-body') ? 'parents' : 'roster';
    if (split || id === 'roster') roster.mainWire(b, rp);
    if (split || id === 'parents') parents.mainWire(b, rp);
  }
  window.KF = {parseCsv, parseRows, plan, students:studentsIn, allStudents:studs, group, ageM, ageTxt, dmy, parsOf, openKid};  // students etc. are read by Attendance (v0.4.21)
})();

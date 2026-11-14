/* KinderDeck Accounting (v0.4.16; first built as the Accounting Book in v0.4.15).
   One place for the school's money. Everything is built from the same lines, so nothing is typed twice:
   the Kitchen Cost Book's meal allowance (money in) and market, gas, power and water (money out), fee receipts and supplier
   invoices from the Document Library, and what is entered or imported here.
   BOOKS     Summary (the month, last month and the year so far, with the kitchen at a glance), Months, Ledger (every line with a
             running balance), Money in and Money out (where each came from). Print or export the month.
   ENTER     Meal money, Fees and Cash out forms (the old Cash Flow tabs), the Kitchen cost book (moved in unchanged), and
             Spreadsheets: import the school's existing .xlsx or .csv files (fees, meal money, expenses), keep them organised
             in one list, re-import an updated file without double counting, remove an import, and export everything back to CSV
             so her own spreadsheets can carry on. Entries are kept in state.cf.entries (as before); imports in state.imports.
   The Cash Flow and Kitchen widgets still exist but are switched off; their screens now live here. */
(() => {
  const acc = () => state.acc || (state.acc = {m:'', tab:'sum'});
  const pad = n => String(n).padStart(2, '0');
  const mOf = iso => iso.slice(0, 7);
  const shiftM = (m, n) => { const k = +m.slice(0, 4) * 12 + +m.slice(5) - 1 + n; return Math.floor(k / 12) + '-' + pad(k % 12 + 1); };
  const fmtD = iso => iso.slice(8) + '/' + iso.slice(5, 7);
  const dmy = iso => iso ? iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
  const fmtM = m => m.slice(5) + '/' + m.slice(0, 4);
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const money = n => `<span class="${n < 0 ? 'kx-neg' : 'kx-pos'}">${n < 0 ? '−' : ''}${vnd(Math.abs(n))}</span>`;
  const cell = v => v ? vnd(v) : '<span class="muted">–</span>';

  /* ---- the groups the school reads: few, plain, the same every month ---- */
  const IN = [['fee', 'Fees', 'Học phí'], ['meal', 'Meal money', 'Tiền ăn']];
  const OUT = [['market', 'Kitchen: food shopping', 'Bếp: đi chợ'], ['svc', 'Kitchen: gas, power, water', 'Bếp: gas, điện, nước'], ['sup', 'Suppliers', 'Nhà cung cấp'],
    ['salary', 'Salaries', 'Lương'], ['rent', 'Rent', 'Tiền thuê'], ['util', 'Utilities', 'Điện nước'], ['supply', 'Supplies', 'Vật tư'], ['other', 'Other', 'Khác']];
  const grp = x => x.inn ? x.cat : x.cat === 'market' || x.cat === 'svc' ? x.cat : x.cat === 'inv' ? 'sup' : x.cat === 'cash' ? (x.oc === 'supplier' ? 'sup' : x.oc || 'other') : 'other';
  const gOf = key => IN.concat(OUT).find(y => y[0] === key);
  const gName = x => { const g = gOf(grp(x)); return g ? L(g[1], g[2]) : ''; };
  const by = ls => { const o = {}; ls.forEach(x => { const g = grp(x); o[g] = (o[g] || 0) + x.inn + x.out; }); return o; };

  const lines = () => CF.lines();
  const curM = () => { if (acc().m) return acc().m; const ls = lines(); return ls.length ? mOf(ls[ls.length - 1].date) : mOf(todayISO()); };

  function book(m) {
    const ls = lines(), pm = shiftM(m, -1), y = m.slice(0, 4);
    const cur = ls.filter(x => mOf(x.date) === m), pre = ls.filter(x => mOf(x.date) === pm), ytd = ls.filter(x => x.date.slice(0, 4) === y && mOf(x.date) <= m);
    return {m, pm, cur, c:by(cur), p:by(pre), y:by(ytd), opening:sum(ls.filter(x => mOf(x.date) < m), x => x.inn - x.out),
      inn:sum(cur, 'inn'), out:sum(cur, 'out'), pin:sum(pre, 'inn'), pout:sum(pre, 'out'), yin:sum(ytd, 'inn'), yout:sum(ytd, 'out')};
  }
  function kitchen(m) { // the Kitchen Cost Book for the month, in one line
    if (!inLoc(KD.locs[0].id)) return null;
    const ds = KX.days().filter(d => mOf(d) === m), cs = ds.map(d => KX.calc(d));
    if (!ds.length) return null;
    const fed = sum(cs, 'all'), spent = sum(cs, 'spent');
    return {days:ds, fed, allowed:sum(cs, 'allowed'), market:sum(cs, 'shop'), svc:sum(cs, 'svc'), spent, per:fed ? Math.round(spent / fed) : 0};
  }

  /* ================= BOOKS ================= */
  function stmtRows(b) {
    const hd = t => [`<b>${t}</b>`, '', '', ''], line = g => [esc(L(g[1], g[2])), cell(b.c[g[0]]), cell(b.p[g[0]]), cell(b.y[g[0]])];
    const tot = (t, a, p, y) => [`<b>${t}</b>`, `<b>${vnd(a)}</b>`, `<b>${vnd(p)}</b>`, `<b>${vnd(y)}</b>`];
    const outs = OUT.filter(g => b.c[g[0]] || b.p[g[0]] || b.y[g[0]]);
    return [hd(L('Money in', 'Tiền thu'))].concat(IN.map(line), [tot(L('Total money in', 'Tổng thu'), b.inn, b.pin, b.yin)],
      [hd(L('Money out', 'Tiền chi'))], outs.map(line), [tot(L('Total money out', 'Tổng chi'), b.out, b.pout, b.yout)],
      [[`<b>${L('Result (in − out)', 'Kết quả (thu − chi)')}</b>`, money(b.inn - b.out), money(b.pin - b.pout), money(b.yin - b.yout)]]);
  }
  const stmtHead = b => ['', L('This month', 'Tháng này') + ' ' + fmtM(b.m), L('Last month', 'Tháng trước') + ' ' + fmtM(b.pm), L('Year to date', 'Từ đầu năm')];

  function sumView(b) {
    const k = kitchen(b.m), nothing = !b.cur.length && !b.pin && !b.pout;
    const kit = k ? `<h4 class="wh">${L('Kitchen at a glance', 'Bếp trong một dòng')}</h4>
      ${tiles([[vnd(k.allowed), L('Meal allowance', 'Tiền ăn được chi')], [vnd(k.spent), L('Spent (market + gas, power, water)', 'Đã chi (đi chợ + gas, điện, nước)')], [money(k.allowed - k.spent), L('Left over or over', 'Còn lại hoặc vượt')], [vnd(k.per), L('Cost per child per day', 'Chi phí mỗi bé mỗi ngày')]])}
      <div class="btn-row" style="margin-top:8px;align-items:center"><span class="muted">${k.days.length} ${L('school days', 'ngày học')} · ${k.fed} ${L('meals served', 'suất ăn')} · ${L('market', 'đi chợ')} ${vnd(k.market)} · ${L('gas, power, water', 'gas, điện, nước')} ${vnd(k.svc)}</span><span style="flex:1"></span>
        <button class="wbtn sm" data-kopen="${k.days[k.days.length - 1]}">${L('Open the Kitchen tab', 'Mở tab Bếp')} ↗</button></div>` : '';
    return `${tiles([[money(b.opening), L('Opening balance', 'Số dư đầu tháng')], [vnd(b.inn), L('Money in', 'Tiền thu')], [vnd(b.out), L('Money out', 'Tiền chi')], [money(b.opening + b.inn - b.out), L('Closing balance', 'Số dư cuối tháng')]])}
      <h4 class="wh">${L('Money in and out', 'Thu và chi')}</h4>
      ${nothing ? `<p class="empty">${L('Nothing recorded this month. Enter meal money, fees or payments in the tabs below, or import a spreadsheet.', 'Tháng này chưa có số liệu. Hãy nhập tiền ăn, học phí hoặc khoản chi ở các tab bên dưới, hoặc nhập một bảng tính.')}</p>` : `<div class="kx-scroll">${table(stmtHead(b), stmtRows(b))}</div>`}
      ${kit}
      <p class="hint" style="margin-top:8px">${L('Everything here is read from the Kitchen tab, the Document Library and what is entered or imported in the Enter tabs: nothing is typed twice. The kitchen’s meal allowance counts as money in, and its market, gas, power and water as money out; its delivery notes are counted once. Rejected documents are left out.', 'Mọi số liệu lấy từ tab Bếp, Thư viện tài liệu và các khoản nhập hoặc đã nhập từ bảng tính ở nhóm Nhập liệu: không phải nhập hai lần. Tiền ăn được chi của bếp tính là tiền thu; đi chợ, gas, điện, nước tính là tiền chi; phiếu xuất kho chỉ tính một lần. Tài liệu bị từ chối không tính.')}</p>`;
  }

  function monthsView() {
    const ls = lines(), ms = [...new Set(ls.map(x => mOf(x.date)))].sort(); let open = 0, ti = 0, to = 0;
    const rows = ms.map(m => { const mine = ls.filter(x => mOf(x.date) === m), i = sum(mine, 'inn'), o = sum(mine, 'out'), k = kitchen(m), close = open + i - o;
      const r = `<tr data-m="${m}"${m === curM() ? ' class="kx-cur"' : ''}><td>${fmtM(m)}</td><td>${money(open)}</td><td>${vnd(i)}</td><td>${vnd(o)}</td><td>${money(i - o)}</td><td>${money(close)}</td><td>${k ? money(k.allowed - k.spent) : '<span class="muted">–</span>'}</td></tr>`;
      open = close; ti += i; to += o; return r; }).join('');
    return `<div class="kx-scroll kx-click"><table class="kd-table"><tr><th>${L('Month', 'Tháng')}</th><th>${L('Opening', 'Đầu tháng')}</th><th>${L('In', 'Thu')}</th><th>${L('Out', 'Chi')}</th><th>${L('Result', 'Kết quả')}</th><th>${L('Closing', 'Cuối tháng')}</th><th>${L('Kitchen left over', 'Bếp còn lại')}</th></tr>
      ${rows || `<tr><td colspan="7" class="muted">${L('Nothing recorded yet.', 'Chưa có số liệu.')}</td></tr>`}
      ${ms.length ? `<tr><td><b>${L('All months', 'Tất cả')}</b></td><td></td><td><b>${vnd(ti)}</b></td><td><b>${vnd(to)}</b></td><td>${money(ti - to)}</td><td>${money(ti - to)}</td><td></td></tr>` : ''}</table></div>
      <p class="hint" style="margin-top:8px">${L('Tap a month to open its summary. The closing balance of one month is the opening balance of the next; it is calculated, not carried over by hand.', 'Bấm một tháng để xem tổng quan tháng đó. Số dư cuối tháng này là số dư đầu tháng sau, tự tính, không cần chuyển tay.')}</p>`;
  }

  const link = x => x.src.k === 'cf' ? `<span class="badge">${L('Entered', 'Nhập tay')}</span>` : `<button class="wbtn sm" data-src="${x.src.k}:${esc(x.src.id)}">${x.src.k === 'kx' ? L('Kitchen', 'Sổ bếp') : L('Document', 'Tài liệu')} ↗</button>`;
  const stB = x => x.st && x.st !== 'approved' ? ` <span class="badge warn">${esc(L(stOf(x.st)[1], stOf(x.st)[2]))}</span>` : '';
  function ledgerRows(b, withLink) {
    let run = b.opening;
    const rows = b.cur.map(x => { run += x.inn - x.out; return [fmtD(x.date), esc(L(x.en, x.vi)) + stB(x), esc(gName(x)), x.inn ? vnd(x.inn) : '', x.out ? vnd(x.out) : '', money(run), withLink ? link(x) : '']; });
    return [['', `<b>${L('Opening balance', 'Số dư đầu tháng')}</b>`, '', '', '', money(b.opening), '']].concat(rows, [['', `<b>${L('Closing balance', 'Số dư cuối tháng')}</b>`, '', `<b>${vnd(b.inn)}</b>`, `<b>${vnd(b.out)}</b>`, money(b.opening + b.inn - b.out), '']]);
  }
  const ledgerHead = () => [L('Date', 'Ngày'), L('Item', 'Nội dung'), L('Group', 'Nhóm'), L('In', 'Thu'), L('Out', 'Chi'), L('Balance', 'Số dư'), ''];
  const ledgerView = b => `<div class="kx-scroll" style="max-height:480px">${table(ledgerHead(), ledgerRows(b, true))}</div>`;

  const srcName = k => k === 'kx' ? L('Kitchen tab', 'Tab Bếp') : k === 'doc' ? L('Document Library', 'Thư viện tài liệu') : L('Entered or imported', 'Nhập tay hoặc từ bảng tính');
  function sourcesView(b, dir) { // where the money in, or the money out, came from: grouped, then every line
    const ls = b.cur.filter(x => dir === 'in' ? x.inn : x.out), g = {};
    ls.forEach(x => { const k = grp(x) + '|' + x.src.k, e = g[k] || (g[k] = {g:grp(x), k:x.src.k, n:0, v:0}); e.n++; e.v += x.inn + x.out; });
    const rows = Object.values(g).map(e => { const q = gOf(e.g); return [esc(q ? L(q[1], q[2]) : e.g), esc(srcName(e.k)), e.n, vnd(e.v)]; });
    const rest = ls.map(x => [fmtD(x.date), esc(L(x.en, x.vi)) + stB(x), vnd(x.inn + x.out), esc(srcName(x.src.k)), link(x)]);
    return `<h4 class="wh">${dir === 'in' ? L('Where the money in comes from', 'Tiền thu đến từ đâu') : L('Where the money out goes', 'Tiền chi đi đâu')}</h4>${table([L('Group', 'Nhóm'), L('Source', 'Nguồn'), L('Lines', 'Số dòng'), L('Amount', 'Số tiền')], rows)}
      <h4 class="wh">${L('Every line this month', 'Mọi dòng trong tháng')}</h4><div class="kx-scroll" style="max-height:340px">${table([L('Date', 'Ngày'), L('Item', 'Nội dung'), L('Amount', 'Số tiền'), L('Source', 'Nguồn'), ''], rest)}</div>`;
  }

  function download(name, rows) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(q).join(',')).join('\n')], {type:'text/csv;charset=utf-8'}));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportMonth(b) {
    const rows = [['Ngày', 'Nội dung', 'Nhóm', 'Thu', 'Chi', 'Số dư', 'Nguồn']]; let run = b.opening;
    rows.push(['', 'Số dư đầu tháng', '', '', '', b.opening, '']);
    b.cur.forEach(x => { run += x.inn - x.out; rows.push([x.date, x.vi, gName(x), x.inn || '', x.out || '', run, x.src.k === 'kx' ? 'Sổ tính tiền ăn' : x.src.k === 'cf' ? 'Nhập tay hoặc bảng tính' : 'Thư viện tài liệu']); });
    rows.push(['', 'Cộng', '', b.inn, b.out, '', '']); rows.push(['', 'Số dư cuối tháng', '', '', '', b.opening + b.inn - b.out, '']);
    download('so-ke-toan-' + b.m + '.csv', rows);
  }
  function printBook(b) {
    const w = window.open('', '_blank'); if (!w) return toast(L('Allow pop-ups to print', 'Hãy cho phép cửa sổ bật lên để in'), 3000);
    const k = kitchen(b.m), name = (KD.kitchen && KD.kitchen.unit) || (KD.locs[0] && KD.locs[0][state.lang]) || '';
    w.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${esc(L('Accounting book', 'Sổ kế toán tổng hợp'))} ${fmtM(b.m)}</title><style>body{font-family:Arial,sans-serif;margin:14mm;color:#111}h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:16px 0 6px}p{margin:0 0 8px;color:#555;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:5px 8px;font-size:12px;text-align:left;vertical-align:top}th{background:#f0f0f0}td:nth-child(n+2){white-space:nowrap}.muted{color:#888}.kx-neg{color:#b00020}@page{size:A4;margin:10mm}</style></head><body>
      <h1>${esc(name)}</h1><p>${esc(L('Accounting book', 'Sổ kế toán tổng hợp'))} · ${L('Month', 'Tháng')} ${fmtM(b.m)}</p>
      <h2>${L('Money in and out', 'Thu và chi')}</h2>${table(stmtHead(b), stmtRows(b))}
      ${k ? `<h2>${L('Kitchen', 'Bếp')}</h2><p>${L('Meal allowance', 'Tiền ăn được chi')} ${vnd(k.allowed)} · ${L('spent', 'đã chi')} ${vnd(k.spent)} · ${L('left over or over', 'còn lại hoặc vượt')} ${vnd(k.allowed - k.spent)} · ${L('cost per child per day', 'chi phí mỗi bé mỗi ngày')} ${vnd(k.per)}</p>` : ''}
      <h2>${L('Ledger', 'Sổ nhật ký')}</h2>${table(ledgerHead().slice(0, 6), ledgerRows(b, false).map(r => r.slice(0, 6)))}
      <script>onload=()=>print()<\/script></body></html>`);
    w.document.close();
  }

  /* ================= SPREADSHEETS: import the school's own files, keep them organised ================= */
  const KIND = [['fee', 'Fees received', 'Học phí đã thu'], ['meal', 'Meal money received', 'Tiền ăn đã thu'], ['cash', 'Money paid out', 'Tiền đã chi']];
  const kindName = k => { const x = KIND.find(y => y[0] === k); return x ? L(x[1], x[2]) : k === 'roster' ? L('Children and parents', 'Trẻ và phụ huynh') : k; };
  const imps = () => state.imports || (state.imports = []);
  let dr = null;   // the spreadsheet being set up (not saved until Import)

  const txt = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const colName = i => { let s = '', n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const validIso = iso => { const d = new Date(iso + 'T00:00:00'); return !isNaN(d) && d.getFullYear() === +iso.slice(0, 4) && d.getMonth() + 1 === +iso.slice(5, 7) && d.getDate() === +iso.slice(8, 10); };
  const isoOf = v => {
    let iso = '';
    if (typeof v === 'number') { if (v < 20000 || v > 90000) return ''; const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); iso = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    else { const s = txt(v); let m = s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
      if (m) iso = m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
      else { m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); if (m) iso = (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad(m[2]) + '-' + pad(m[1]); } }
    return iso && validIso(iso) ? iso : '';
  };
  const amtOf = v => { if (typeof v === 'number') return Math.abs(Math.round(v)); const s = String(v ?? '').replace(/[^\d-]/g, ''); return s && s !== '-' ? Math.abs(parseInt(s, 10)) : 0; };
  const GUESS = {date:/^(ngay|date|thoi gian)|ngay (thu|chi|nop|dong)/, amt:/so tien|thanh tien|amount|^tong|^thu$|^chi$|tien (thu|chi|an|hoc)|hoc phi$/,
    who:/ho (va )?ten|^ten|noi dung|dien giai|nguoi (nop|nhan|chi|thu)|doi tuong|^be$|hoc sinh|name|description|khach|nha cung cap|ncc/, note:/ghi chu|note|ly do/, cat:/nhom|loai|hang muc|category/};
  const hdrOf = r => (r || []).map(c => norm(txt(c)));
  const findHeader = rows => { for (let i = 0; i < Math.min(25, rows.length); i++) { const h = hdrOf(rows[i]); if (h.filter(c => GUESS.date.test(c) || GUESS.amt.test(c) || GUESS.who.test(c)).length >= 2) return i; }
    const f = rows.findIndex(r => r.filter(c => txt(c)).length >= 2); return f < 0 ? 0 : f; };
  const guessMap = hi => { const h = hdrOf(dr.rows[hi]), used = new Set(), m = {};
    ['date', 'amt', 'who', 'note', 'cat'].forEach(k => { const i = h.findIndex((c, j) => !used.has(j) && c && GUESS[k].test(c)); m[k] = i; if (i >= 0) used.add(i); }); return m; };
  const guessCat = s => { const n = norm(s); return /luong|nhan vien|giao vien/.test(n) ? 'salary' : /thue|mat bang/.test(n) ? 'rent' : /dien|nuoc|internet|wifi|gas/.test(n) ? 'util' : /ncc|nha cung cap|cty|cong ty|thuc pham|rau|thit|gao/.test(n) ? 'supplier' : /vat tu|van phong pham|do dung|dung cu/.test(n) ? 'supply' : 'other'; };
  const sigOf = (kind, date, who, amt) => [kind, date, norm(who), amt].join('|');

  const dense = rows => Array.from(rows, r => r || []);  // the xlsx reader leaves holes for blank rows
  function startDraft(file, sheets, sheet, rows) { dr = {file, name:file.name, sheets, sheet, rows:dense(rows), kind:'fee', cat:'auto', hi:0, map:{}}; dr.hi = findHeader(rows); dr.map = guessMap(dr.hi); }
  function mapRows() { // what the current settings would add: new rows, rows already in the books, rows that cannot be read
    const ok = [], bad = [], have = {}; let dup = 0;
    CF.ents().forEach(e => { const k = sigOf(e.kind, e.date, e.who || '', e.amt); have[k] = (have[k] || 0) + 1; });
    dr.rows.slice(dr.hi + 1).forEach((r, i) => {
      if (!r.some(c => txt(c))) return;
      const g = k => dr.map[k] >= 0 ? r[dr.map[k]] : '', line = dr.hi + i + 2, date = isoOf(g('date')), amt = amtOf(g('amt')), who = txt(g('who')), note = txt(g('note'));
      if (!date) return bad.push({line, why:L('date not readable', 'không đọc được ngày')});
      if (!amt) return bad.push({line, why:L('no amount', 'không có số tiền')});
      const k = sigOf(dr.kind, date, who, amt); if (have[k] > 0) { have[k]--; dup++; return; }
      ok.push({date, who, note, amt, cat:dr.kind === 'cash' ? (dr.cat === 'auto' ? guessCat(txt(g('cat')) + ' ' + who + ' ' + note) : dr.cat) : ''});
    });
    return {ok, bad, dup};
  }
  function commitImport() {
    const m = mapRows(); if (!m.ok.length) return toast(L('Nothing new to import.', 'Không có gì mới để nhập.'), 3000);
    const id = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), loc = state.loc === 'all' ? CF.kloc() : state.loc, t0 = Date.now().toString(36);
    m.ok.forEach((x, i) => CF.ents().push({id:'e' + t0 + i + Math.random().toString(36).slice(2, 4), kind:dr.kind, date:x.date, cat:x.cat, who:x.who, note:x.note, amt:x.amt, loc, imp:id}));
    const ds = m.ok.map(x => x.date).sort();
    imps().push({id, name:dr.name, sheet:dr.sheets.length > 1 ? dr.sheets[dr.sheet] : '', kind:dr.kind, on:todayISO(), added:m.ok.length, skipped:m.dup, bad:m.bad.length, from:ds[0], to:ds[ds.length - 1], total:sum(m.ok, 'amt')});
    acc().m = ds[ds.length - 1].slice(0, 7); saveState();
    toast(L(`Imported ${m.ok.length} rows from ${dr.name}`, `Đã nhập ${m.ok.length} dòng từ ${dr.name}`), 3500); dr = null;
  }
  function removeImport(id) {
    const im = imps().find(x => x.id === id); if (!im) return;
    if (!confirm(L(`Remove ${im.name} and the ${im.added} rows it added? Your original file is not touched.`, `Xóa ${im.name} và ${im.added} dòng đã nhập từ bảng tính này? Tệp gốc của bạn không bị ảnh hưởng.`))) return;
    CF.cf().entries = CF.ents().filter(e => e.imp !== id); state.imports = imps().filter(x => x.id !== id); saveState();
  }
  function exportAll() { // everything entered or imported, for her own spreadsheets
    const rows = [['Ngày', 'Loại', 'Nhóm', 'Tên / nội dung', 'Ghi chú', 'Số tiền', 'Nguồn']], im = id => (imps().find(x => x.id === id) || {}).name || 'Nhập tay';
    const kn = k => (KIND.find(y => y[0] === k) || [])[2] || k, cn = c => (CF.OUTCATS.find(y => y[0] === c) || [])[2] || '';
    CF.ents().filter(e => inLoc(e.loc)).sort((a, b) => a.date.localeCompare(b.date)).forEach(e => rows.push([e.date, kn(e.kind), cn(e.cat), e.who, e.note, e.amt, im(e.imp)]));
    download('so-ke-toan-tat-ca-khoan-nhap.csv', rows);
  }

  function draftView() {
    const m = mapRows(), ncol = Math.max(1, ...dr.rows.slice(0, 30).map(r => r.length)), hdr = dr.rows[dr.hi] || [];
    const opt = (sel, none) => `<option value="-1"${sel < 0 ? ' selected' : ''}>${none || '—'}</option>` + Array.from({length:ncol}, (_, i) => `<option value="${i}"${sel === i ? ' selected' : ''}>${colName(i)}: ${esc(txt(hdr[i]).slice(0, 28))}</option>`).join('');
    const fld = (id, en, vi, inner) => `<label class="kx-rate" style="min-width:150px">${L(en, vi)}<select id="${id}">${inner}</select></label>`;
    const sample = m.ok.slice(0, 8).map(x => [esc(dmy(x.date)), esc(x.who || '–') + (x.note ? ` <span class="muted">${esc(x.note)}</span>` : ''), dr.kind === 'cash' ? esc(((CF.OUTCATS.find(c => c[0] === x.cat) || [])[state.lang === 'vi' ? 2 : 1]) || '') : '', vnd(x.amt)]);
    return `<div class="kf-fam"><div class="kf-fam-h"><b>${esc(dr.name)}</b><span class="muted">${dr.rows.length} ${L('rows read', 'dòng đã đọc')}</span></div>
      <div class="btn-row" style="align-items:flex-end;margin-bottom:6px">
        ${fld('sh-kind', 'This spreadsheet is', 'Bảng tính này là', KIND.map(k => `<option value="${k[0]}"${dr.kind === k[0] ? ' selected' : ''}>${esc(L(k[1], k[2]))}</option>`).join(''))}
        ${dr.sheets.length > 1 ? fld('sh-sheet', 'Sheet', 'Trang tính', dr.sheets.map((n, i) => `<option value="${i}"${dr.sheet === i ? ' selected' : ''}>${esc(n)}</option>`).join('')) : ''}
        <label class="kx-rate">${L('Header is on row', 'Dòng tiêu đề là dòng')}<input type="number" id="sh-hi" min="1" max="${dr.rows.length}" value="${dr.hi + 1}" style="width:70px"></label></div>
      <div class="btn-row" style="align-items:flex-end">
        ${fld('sh-date', 'Date column', 'Cột ngày', opt(dr.map.date, L('— choose —', '— chọn —')))}${fld('sh-who', dr.kind === 'fee' ? 'Child column' : 'Name or description column', dr.kind === 'fee' ? 'Cột tên bé' : 'Cột tên hoặc nội dung', opt(dr.map.who, L('— none —', '— không —')))}
        ${fld('sh-amt', 'Amount column', 'Cột số tiền', opt(dr.map.amt, L('— choose —', '— chọn —')))}${fld('sh-note', 'Note column (optional)', 'Cột ghi chú (không bắt buộc)', opt(dr.map.note, L('— none —', '— không —')))}
        ${dr.kind === 'cash' ? fld('sh-cat', 'Kind column (optional)', 'Cột nhóm chi (không bắt buộc)', opt(dr.map.cat, L('— none —', '— không —'))) + fld('sh-catfix', 'Kind of payment', 'Nhóm chi', `<option value="auto"${dr.cat === 'auto' ? ' selected' : ''}>${L('Work it out from the text', 'Tự nhận từ nội dung')}</option>` + CF.OUTCATS.map(c => `<option value="${c[0]}"${dr.cat === c[0] ? ' selected' : ''}>${esc(L(c[1], c[2]))}</option>`).join('')) : ''}</div>
      ${tiles([[m.ok.length, L('New rows to add', 'Dòng mới sẽ nhập')], [m.dup, L('Already in the books', 'Đã có trong sổ')], [m.bad.length, L('Rows skipped', 'Dòng bị bỏ qua')], [vnd(sum(m.ok, 'amt')), L('Total amount', 'Tổng số tiền')]])}
      ${sample.length ? `<div class="kx-scroll" style="margin-top:8px;max-height:220px">${table([L('Date', 'Ngày'), L('Name or note', 'Tên hoặc ghi chú'), dr.kind === 'cash' ? L('Kind', 'Nhóm') : '', L('Amount', 'Số tiền')], sample)}</div>` : `<p class="empty">${L('Choose the date and amount columns to see the rows.', 'Hãy chọn cột ngày và cột số tiền để xem các dòng.')}</p>`}
      ${m.bad.length ? `<p class="hint">${L('Skipped', 'Bỏ qua')}: ${m.bad.slice(0, 5).map(x => `${L('row', 'dòng')} ${x.line} (${esc(x.why)})`).join(', ')}${m.bad.length > 5 ? '…' : ''}. ${L('Totals and blank rows are skipped on purpose.', 'Dòng tổng cộng và dòng trống được bỏ qua.')}</p>` : ''}
      <div class="btn-row" style="margin-top:10px"><button class="wbtn primary" id="sh-ok"${m.ok.length ? '' : ' disabled'}>${L('Import', 'Nhập')} ${m.ok.length} ${L('rows', 'dòng')}</button><button class="wbtn" id="sh-no">${L('Cancel', 'Hủy')}</button></div></div>`;
  }
  function sheetsView() {
    const list = imps(), rows = list.slice().reverse().map(x => [`<b>${esc(x.name)}</b>${x.sheet ? ` <span class="muted">${esc(x.sheet)}</span>` : ''}`, esc(kindName(x.kind)), x.from ? `${esc(dmy(x.from))} – ${esc(dmy(x.to))}` : '<span class="muted">–</span>',
      `${x.added}${x.upd ? ` <span class="muted">(${x.upd} ${L('updated', 'cập nhật')})</span>` : ''}${x.skipped > 0 ? ` <span class="muted">(+${x.skipped} ${L('already there', 'đã có')})</span>` : ''}`, x.kind === 'roster' ? '<span class="muted">–</span>' : vnd(x.total), esc(dmy(x.on)), x.kind === 'roster' ? '' : `<button class="wbtn sm" data-imp-del="${x.id}">${L('Remove', 'Xóa')}</button>`]);
    const go = (id, en, vi) => `<button class="wbtn sm" data-go="${id}">${L(en, vi)} ↗</button>`;
    const guide = [
      [L('Children and parents list', 'Danh sách trẻ và phụ huynh'), L('Student Roster › Import list (.csv, .xlsx); re-import to update; Export full list to get it back as a spreadsheet', 'Danh sách học sinh › Nhập danh sách (.csv, .xlsx); nhập lại để cập nhật; Xuất đủ cột để lấy lại bảng tính'), go('roster', 'Open', 'Mở')],
      [L('Staff list', 'Danh sách nhân viên'), L('Staff › Import (.xlsx)', 'Nhân viên › Nhập (.xlsx)'), go('staff', 'Open', 'Mở')],
      [L('Fees and tuition received', 'Học phí đã thu'), L('Here: Spreadsheets › Fees received, or type in the Fees tab', 'Tại đây: Bảng tính › Học phí đã thu, hoặc gõ ở tab Học phí'), ''],
      [L('Meal money received', 'Tiền ăn đã thu'), L('Here: Spreadsheets › Meal money received, or the Meal money tab', 'Tại đây: Bảng tính › Tiền ăn đã thu, hoặc tab Tiền ăn'), ''],
      [L('Expenses, salaries, rent, supplier payments', 'Chi phí, lương, tiền thuê, trả nhà cung cấp'), L('Here: Spreadsheets › Money paid out, or the Cash out tab', 'Tại đây: Bảng tính › Tiền đã chi, hoặc tab Chi tiền'), ''],
      [L('Kitchen workbook (menus, market list, daily cash book)', 'Sổ bếp (thực đơn, đi chợ, sổ tiền ăn)'), L('Kitchen tab: type each day; sheets 2, 5 and 10 print or open in Excel', 'Tab Bếp: nhập từng ngày; tờ 2, 5, 10 in hoặc mở bằng Excel'), '']];
    return `<h4 class="wh">${L('Add a spreadsheet', 'Thêm bảng tính')}</h4>
      <div class="btn-row" style="margin-bottom:8px"><button class="wbtn primary" id="sh-pick">${L('Choose a spreadsheet (.xlsx, .csv)', 'Chọn bảng tính (.xlsx, .csv)')}</button><input type="file" id="sh-file" accept=".xlsx,.csv" hidden>
        <button class="wbtn sm" id="sh-export">${L('Export everything entered (CSV)', 'Xuất mọi khoản đã nhập (CSV)')}</button></div>
      ${dr ? draftView() : `<p class="hint">${L('Your own file is only read, never changed or stored. KinderDeck keeps the rows it imports; importing an updated version of the same spreadsheet adds only the new rows, so nothing is counted twice.', 'Tệp của bạn chỉ được đọc, không bị thay đổi hay lưu lại. KinderDeck giữ các dòng đã nhập; nhập lại bản cập nhật của cùng bảng tính chỉ thêm các dòng mới, không tính hai lần.')}</p>`}
      <h4 class="wh">${L('Spreadsheets in KinderDeck', 'Bảng tính trong KinderDeck')}</h4>
      ${tiles([[list.length, L('Spreadsheets imported', 'Bảng tính đã nhập')], [sum(list, 'added'), L('Rows imported', 'Dòng đã nhập')], [vnd(sum(list, 'total')), L('Total amount', 'Tổng số tiền')]])}
      <div class="kx-scroll" style="margin-top:8px">${table([L('Spreadsheet', 'Bảng tính'), L('Kind', 'Loại'), L('Dates', 'Ngày'), L('Rows added', 'Dòng nhập'), L('Amount', 'Số tiền'), L('Imported', 'Ngày nhập'), ''], rows)}</div>
      <h4 class="wh">${L('Where each spreadsheet goes', 'Mỗi bảng tính nhập ở đâu')}</h4>
      ${table([L('Your spreadsheet', 'Bảng tính của bạn'), L('Where it goes in KinderDeck', 'Nhập vào đâu trong KinderDeck'), ''], guide)}
      <p class="hint" style="margin-top:8px">${L('Keep your spreadsheets going if you like: type in KinderDeck and export the CSV to paste into them, or import theirs here.', 'Bạn vẫn có thể dùng bảng tính của mình: nhập ở KinderDeck rồi xuất CSV để dán vào, hoặc nhập bảng tính của bạn vào đây.')}</p>`;
  }
  function wireSheets(b, rp) {
    const $q = s => b.querySelector(s), fi = $q('#sh-file');
    $q('#sh-pick').onclick = () => fi.click(); $q('#sh-export').onclick = exportAll;
    fi.onchange = async () => { const f = fi.files[0]; fi.value = ''; if (!f) return;
      try { let sheets = [], rows;
        if (/\.xlsx$/i.test(f.name)) { sheets = await KS.readXlsx(f, 0, true); rows = await KS.readXlsx(f, 0); }
        else if (/\.csv$/i.test(f.name)) rows = KF.parseCsv(await f.text());
        else return toast(L('Save the spreadsheet as .xlsx or .csv first.', 'Hãy lưu bảng tính thành .xlsx hoặc .csv trước.'), 4000);
        startDraft(f, sheets, 0, rows); rp(); }
      catch (x) { toast(L('Could not read this file.', 'Không đọc được tệp này.'), 3500); } };
    b.querySelectorAll('[data-imp-del]').forEach(x => x.onclick = () => { removeImport(x.dataset.impDel); rp(); });
    b.querySelectorAll('[data-go]').forEach(x => x.onclick = () => { openWidget(x.dataset.go); renderWidget(x.dataset.go); bringToFront(widgetEls[x.dataset.go].el); syncDock(); });
    if (!dr) return;
    const on = (id, f) => { const e = $q(id); if (e) e.onchange = () => { f(e); rp(); }; };
    on('#sh-kind', e => { dr.kind = e.value; }); on('#sh-catfix', e => { dr.cat = e.value; });
    on('#sh-hi', e => { dr.hi = Math.min(Math.max(0, (+e.value || 1) - 1), dr.rows.length - 1); dr.map = guessMap(dr.hi); });
    ['date', 'who', 'amt', 'note', 'cat'].forEach(k => on('#sh-' + k, e => { dr.map[k] = +e.value; }));
    const sh = $q('#sh-sheet'); if (sh) sh.onchange = async () => { try { dr.sheet = +sh.value; dr.rows = dense(await KS.readXlsx(dr.file, dr.sheet)); dr.hi = findHeader(dr.rows); dr.map = guessMap(dr.hi); rp(); } catch (x) { toast(L('Could not read this sheet.', 'Không đọc được trang tính này.'), 3500); } };
    $q('#sh-no').onclick = () => { dr = null; rp(); };
    $q('#sh-ok').onclick = () => { commitImport(); rp(); };
  }

  /* ================= THE WIDGET ================= */
  const GROUPS = [[['Books', 'Sổ sách'], [['sum', 'Summary', 'Tổng quan'], ['months', 'Months', 'Theo tháng'], ['ledger', 'Ledger', 'Sổ nhật ký'], ['in', 'Money in', 'Nguồn thu'], ['out', 'Money out', 'Nguồn chi']]],
    [['Enter', 'Nhập liệu'], [['kitchen', 'Kitchen cost book', 'Sổ tiền ăn bếp'], ['meal', 'Meal money', 'Tiền ăn'], ['fee', 'Fees', 'Học phí'], ['cash', 'Cash out', 'Chi tiền'], ['sheets', 'Spreadsheets', 'Bảng tính']]]];
  const NOMONTH = ['kitchen', 'sheets'];
  const W = { id:'accounts', em:'📒', icon:'book', en:'Accounting', vi:'Kế toán', w:860, h:680, full:true,
    html() {
      const m = curM(), b = book(m), tab = acc().tab || 'sum', mt = !NOMONTH.includes(tab);
      const tb = GROUPS.map(g => `<div class="btn-row" style="margin-bottom:6px;align-items:center"><span class="muted" style="min-width:76px">${esc(L(g[0][0], g[0][1]))}</span>${g[1].map(t => `<button class="wbtn sm ${tab === t[0] ? 'primary' : ''}" data-tab="${t[0]}">${esc(L(t[1], t[2]))}</button>`).join('')}</div>`).join('');
      const body = tab === 'months' ? monthsView() : tab === 'ledger' ? ledgerView(b) : tab === 'in' || tab === 'out' ? sourcesView(b, tab) : tab === 'meal' || tab === 'fee' || tab === 'cash' ? CF.inputView(tab, m)
        : tab === 'kitchen' ? KX.widget.html() : tab === 'sheets' ? sheetsView() : sumView(b);
      return `<div class="ss-root"><div class="btn-row" style="margin-bottom:10px;align-items:center">${mt ? `<button class="wbtn sm" data-m="-1" aria-label="${L('Previous month', 'Tháng trước')}">‹</button>
          <b>${L('Month', 'Tháng')} ${fmtM(m)}</b><button class="wbtn sm" data-m="1" aria-label="${L('Next month', 'Tháng sau')}">›</button>` : `<b>${esc(L(W.en, W.vi))}</b>`}<span style="flex:1"></span>
          ${mt ? `<button class="wbtn sm" id="ac-print">${L('Print month', 'In tháng')}</button><button class="wbtn" id="ac-csv">${L('Export month (CSV)', 'Xuất tháng (CSV)')}</button>` : ''}</div>
        ${tb}<div style="margin-top:6px">${body}</div></div>`;
    },
    wire(b, rp) {
      const st = acc(), tab = st.tab || 'sum';
      b.querySelectorAll('[data-tab]').forEach(x => x.onclick = () => { st.tab = x.dataset.tab; saveState(); rp(); });
      b.querySelectorAll('[data-m]').forEach(x => x.onclick = () => { if (x.tagName === 'TR') { st.m = x.dataset.m; st.tab = 'sum'; } else st.m = shiftM(curM(), +x.dataset.m); saveState(); rp(); });
      b.querySelectorAll('[data-src]').forEach(x => x.onclick = () => { const [k, ...id] = x.dataset.src.split(':'); CF.openSrc(k, id.join(':')); });
      b.querySelectorAll('[data-kopen]').forEach(x => x.onclick = () => KX.open(x.dataset.kopen));
      const csv = b.querySelector('#ac-csv'); if (csv) csv.onclick = () => exportMonth(book(curM()));
      const pr = b.querySelector('#ac-print'); if (pr) pr.onclick = () => printBook(book(curM()));
      if (tab === 'meal' || tab === 'fee' || tab === 'cash') CF.wireEntry(b, tab, rp, m => { st.m = m; });
      else if (tab === 'kitchen') KX.widget.wire(b, rp);
      else if (tab === 'sheets') wireSheets(b, rp);
    } };
  const at = WIDGETS.findIndex(w => w.id === 'cashflow');
  WIDGETS.splice(at < 0 ? WIDGETS.length : at + 1, 0, W);
  /* open Accounting on a tab (used by the Kitchen cost book's links and by anything that points at a kitchen day) */
  window.ACC = {open(tab) { if (tab) acc().tab = tab; saveState(); openWidget('accounts'); renderWidget('accounts'); bringToFront(widgetEls.accounts.el); syncDock(); }};
})();

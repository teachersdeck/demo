/* KinderDeck Cash Flow (v0.4.2).
   Money in and out by day, built live from what is already recorded: meal money, market spend and gas/power/water
   from the Kitchen Cost Book, fee receipts and supplier invoices from the Document Library. Nothing is typed twice;
   every line links back to the kitchen day or document it came from. v0.4.15 shares its lines with the Accounting Book (window.CF); v0.4.16 moves its tabs into Accounting, where the entry forms and imports now live, and switches this widget off. v0.4.14.TP adds tabs: the existing in and out sources,
   and three input tabs (meal money, fees, cash out) whose entries are kept in state.cf.entries and counted with the rest. */
(() => {
  const KLOC = () => KD.locs[0].id; // the kitchen book is not tagged by campus yet; it files under the first campus, as fileDay does
  const fmtD = iso => iso.slice(8) + '/' + iso.slice(5, 7);
  const monthOf = iso => iso.slice(0, 7);
  const shiftM = (m, n) => { const k = +m.slice(0, 4) * 12 + +m.slice(5) - 1 + n; return Math.floor(k / 12) + '-' + String(k % 12 + 1).padStart(2, '0'); };
  const cf = () => state.cf || (state.cf = {m:'', day:''});
  const ents = () => cf().entries || (cf().entries = []);
  const OUTCATS = [['salary', 'Salaries', 'Lương'], ['rent', 'Rent', 'Tiền thuê'], ['util', 'Utilities', 'Điện nước'], ['supply', 'Supplies', 'Vật tư'], ['supplier', 'Supplier payment', 'Trả nhà cung cấp'], ['other', 'Other', 'Khác']];
  let lastDate = '';  // the date of the last entry typed: the next one starts there, handy when copying from a paper book
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---- every money line, from its source ---- */
  function allLines() {
    const out = [];
    if (inLoc(KLOC())) KX.days().forEach(iso => {
      const c = KX.calc(iso), src = {k:'kx', id:iso};
      if (c.allowed && !cf().noAutoMeal) out.push({date:iso, en:`Meal money, ${c.all} children`, vi:`Tiền ăn, ${c.all} bé`, cat:'meal', inn:c.allowed, out:0, src});
      if (c.shop) out.push({date:iso, en:'Market (kitchen)', vi:'Đi chợ (bếp)', cat:'market', inn:0, out:c.shop, src});
      if (c.svc) out.push({date:iso, en:'Gas, power, water', vi:'Gas, điện, nước', cat:'svc', inn:0, out:c.svc, src});
    });
    docsIn().filter(d => d.status !== 'rejected' && +d.amount > 0).forEach(d => {
      const src = {k:'doc', id:d.id}, who = d.who || d.name;
      if (d.cls === 'fee') out.push({date:d.date, en:'Fee receipt: ' + who, vi:'Biên lai học phí: ' + who, cat:'fee', inn:+d.amount, out:0, src, st:d.status});
      // the kitchen's own delivery notes are already counted as market spend above
      else if (d.cls === 'invoice' && d.id.indexOf('kx-') !== 0) out.push({date:d.date, en:'Supplier invoice: ' + who, vi:'Hóa đơn NCC: ' + who, cat:'inv', inn:0, out:+d.amount, src, st:d.status});
    });
    ents().filter(e => inLoc(e.loc)).forEach(e => { const src = {k:'cf', id:e.id}, oc = OUTCATS.find(c => c[0] === e.cat) || OUTCATS[5], w = e.who ? ': ' + e.who : '';
      if (e.kind === 'meal') out.push({date:e.date, en:'Meal money received' + w, vi:'Thu tiền ăn' + w, cat:'meal', inn:e.amt, out:0, src});
      else if (e.kind === 'fee') out.push({date:e.date, en:'Fee received' + w, vi:'Thu học phí' + w, cat:'fee', inn:e.amt, out:0, src});
      else out.push({date:e.date, en:oc[1] + w + (e.note ? ' (' + e.note + ')' : ''), vi:oc[2] + w + (e.note ? ' (' + e.note + ')' : ''), cat:'cash', oc:oc[0], inn:0, out:e.amt, src}); });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  const curM = () => { if (cf().m) return cf().m; const ls = allLines(); return monthOf(ls.length ? ls[ls.length - 1].date : new Date().toISOString().slice(0, 10)); }; // default: the latest month with numbers
  const CATS = [['fee', 'Fees', 'Học phí', 1], ['meal', 'Meal money', 'Tiền ăn', 1], ['market', 'Market (kitchen)', 'Đi chợ (bếp)', 0], ['svc', 'Gas, power, water', 'Gas, điện, nước', 0], ['inv', 'Supplier invoices', 'Hóa đơn NCC', 0], ['cash', 'Cash out (entered)', 'Chi tiền (nhập)', 0]];

  function summary(m) {
    const ls = allLines(), opening = sum(ls.filter(x => monthOf(x.date) < m), x => x.inn - x.out), mine = ls.filter(x => monthOf(x.date) === m);
    const byDay = {}; mine.forEach(x => { const d = byDay[x.date] || (byDay[x.date] = {inn:0, out:0}); d.inn += x.inn; d.out += x.out; });
    return {ls, mine, opening, byDay, inn:sum(mine, 'inn'), out:sum(mine, 'out')};
  }
  const money = n => `<span class="${n < 0 ? 'kx-neg' : 'kx-pos'}">${n < 0 ? '−' : ''}${vnd(Math.abs(n))}</span>`;
  const link = x => x.src.k === 'cf' ? `<span class="badge">${L('Entered', 'Nhập tay')}</span>` : `<button class="wbtn sm" data-src="${x.src.k}:${esc(x.src.id)}">${x.src.k === 'kx' ? L('Kitchen', 'Sổ bếp') : L('Document', 'Tài liệu')} ↗</button>`;

  function openSrc(k, id) {
    if (k === 'kx') return KX.open(id);
    libTab = 'lib'; libSel = id; openWidget('inbox'); renderWidget('inbox'); bringToFront(widgetEls.inbox.el); syncDock();
  }
  function exportCsv(m) {
    const s = summary(m), q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Ngày', 'Nội dung', 'Nhóm', 'Thu', 'Chi', 'Nguồn']];
    s.mine.forEach(x => rows.push([x.date, x.vi, (CATS.find(c => c[0] === x.cat) || [])[2], x.inn || '', x.out || '', x.src.k === 'kx' ? 'Sổ tính tiền ăn' : x.src.k === 'cf' ? 'Nhập tay' : 'Thư viện tài liệu']));
    rows.push(['', 'Số dư đầu tháng', '', s.opening, '', '']); rows.push(['', 'Cộng', '', s.inn, s.out, '']); rows.push(['', 'Số dư cuối tháng', '', s.opening + s.inn - s.out, '', '']);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n')], {type:'text/csv;charset=utf-8'}));
    a.download = 'dong-tien-' + m + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const TABS = [['over', 'Overview', 'Tổng quan'], ['in', 'In sources', 'Nguồn thu'], ['out', 'Out sources', 'Nguồn chi'], ['meal', 'Meal money', 'Tiền ăn (nhập)'], ['fee', 'Fees', 'Học phí (nhập)'], ['cash', 'Cash out', 'Chi tiền (nhập)']];
  const srcName = k => k === 'kx' ? L('Kitchen book', 'Sổ bếp') : k === 'doc' ? L('Document Library', 'Thư viện tài liệu') : L('Entered here', 'Nhập tại đây');
  const catName = c => { const x = CATS.find(y => y[0] === c); return x ? L(x[1], x[2]) : c; };

  function overView(s, m) {
    const days = Object.keys(s.byDay).sort(), st = cf(), day = days.includes(st.day) ? st.day : days[days.length - 1];
    let run = s.opening;
    const dayRows = days.map(d => { const x = s.byDay[d]; run += x.inn - x.out;
      return `<tr data-d="${d}"${d === day ? ' class="kx-cur"' : ''}><td>${fmtD(d)}</td><td>${vnd(x.inn)}</td><td>${vnd(x.out)}</td><td>${money(x.inn - x.out)}</td><td>${money(run)}</td></tr>`; }).join('');
    const cats = CATS.map(c => { const v = sum(s.mine.filter(x => x.cat === c[0]), x => x.inn + x.out); return [esc(L(c[1], c[2])), c[3] ? L('In', 'Thu') : L('Out', 'Chi'), vnd(v)]; });
    const dl = s.mine.filter(x => x.date === day).map(x => [esc(L(x.en, x.vi)) + (x.st && x.st !== 'approved' ? ` <span class="badge warn">${esc(L(stOf(x.st)[1], stOf(x.st)[2]))}</span>` : ''), x.inn ? vnd(x.inn) : '', x.out ? vnd(x.out) : '', link(x)]);
    return `<div class="ss-grid" style="margin-top:10px"><div class="ss-sub"><div class="ss-subhead"><span class="ss-subtitle">${L('By day', 'Theo ngày')}</span></div><div class="ss-subbody">
        <div class="kx-scroll kx-click" style="max-height:300px"><table class="kd-table"><tr><th>${L('Date', 'Ngày')}</th><th>${L('In', 'Thu')}</th><th>${L('Out', 'Chi')}</th><th>${L('Net', 'Chênh lệch')}</th><th>${L('Running', 'Lũy kế')}</th></tr>${dayRows || `<tr><td colspan="5" class="muted">${L('Nothing recorded this month.', 'Tháng này chưa có số liệu.')}</td></tr>`}</table></div></div></div>
        <div class="ss-sub"><div class="ss-subhead"><span class="ss-subtitle">${L('By kind', 'Theo nhóm')}</span></div><div class="ss-subbody">${table([L('Kind', 'Nhóm'), '', L('Amount', 'Số tiền')], cats)}</div></div></div>
      ${day ? `<h4 class="wh">${L('Lines on ', 'Chi tiết ngày ')}${fmtD(day)}</h4>${table([L('Item', 'Nội dung'), L('In', 'Thu'), L('Out', 'Chi'), L('Source', 'Nguồn')], dl)}` : ''}
      <p class="hint" style="margin-top:8px">${L('Built from the Kitchen Cost Book, the Document Library and what is entered in the Meal money, Fees and Cash out tabs. Rejected documents are left out; the kitchen’s own delivery notes are counted once, as market spend. The kitchen book counts under ' + locName(KLOC()) + '.', 'Lấy từ Sổ tính tiền ăn, Thư viện tài liệu và các khoản nhập ở tab Tiền ăn, Học phí, Chi tiền. Tài liệu bị từ chối không tính; phiếu xuất kho của bếp chỉ tính một lần (tiền đi chợ). Sổ bếp tính cho ' + locName(KLOC()) + '.')}</p>`;
  }
  function sourcesView(s, dir) { // the existing sources of money in, or of money out, grouped, then every line
    const ls = s.mine.filter(x => dir === 'in' ? x.inn : x.out), g = {};
    ls.forEach(x => { const k = x.cat + '|' + x.src.k, e = g[k] || (g[k] = {cat:x.cat, k:x.src.k, n:0, v:0}); e.n++; e.v += x.inn + x.out; });
    const rows = Object.values(g).map(e => [esc(catName(e.cat)), esc(srcName(e.k)), e.n, vnd(e.v)]);
    const lines = ls.map(x => [fmtD(x.date), esc(L(x.en, x.vi)) + (x.st && x.st !== 'approved' ? ` <span class="badge warn">${esc(L(stOf(x.st)[1], stOf(x.st)[2]))}</span>` : ''), vnd(x.inn + x.out), esc(srcName(x.src.k)), link(x)]);
    return `<h4 class="wh">${dir === 'in' ? L('Where the money in comes from', 'Tiền thu đến từ đâu') : L('Where the money out goes', 'Tiền chi đi đâu')}</h4>${table([L('Kind', 'Nhóm'), L('Source', 'Nguồn'), L('Lines', 'Số dòng'), L('Amount', 'Số tiền')], rows)}
      <h4 class="wh">${L('Every line this month', 'Mọi dòng trong tháng')}</h4><div class="kx-scroll" style="max-height:340px">${table([L('Date', 'Ngày'), L('Item', 'Nội dung'), L('Amount', 'Số tiền'), L('Source', 'Nguồn'), ''], lines)}</div>`;
  }
  function inputView(kind, m) { // one of the three input tabs: a form, then what was entered this month
    const mine = ents().filter(e => e.kind === kind && e.date.slice(0, 7) === m && inLoc(e.loc)).sort((a, b) => a.date.localeCompare(b.date)), total = sum(mine, 'amt');
    const names = kind === 'fee' ? [...new Set((state.students || []).map(x => x.n).concat(kids().map(k => k.n)))] : kind === 'cash' ? (state.suppliers || []).map(x => x.n) : [];
    const ph = kind === 'meal' ? L('Class or note (optional)', 'Lớp hoặc ghi chú (không bắt buộc)') : kind === 'fee' ? L('Child', 'Tên bé') : L('Paid to', 'Chi cho ai');
    const form = `<div class="btn-row kx-add" style="margin:8px 0;align-items:flex-end"><label class="kx-rate">${L('Date', 'Ngày')}<input type="date" id="cf-d" value="${lastDate && lastDate.slice(0, 7) === m ? lastDate : todayIso().slice(0, 7) === m ? todayIso() : m + '-01'}"></label>
        ${kind === 'cash' ? `<label class="kx-rate">${L('Kind', 'Nhóm')}<select id="cf-c">${OUTCATS.map(c => `<option value="${c[0]}">${esc(L(c[1], c[2]))}</option>`).join('')}</select></label>` : ''}
        <label class="kx-rate" style="flex:1;min-width:140px">${ph}<input type="text" id="cf-w" list="cf-names" placeholder="${esc(ph)}"></label>
        ${kind === 'cash' ? `<label class="kx-rate" style="flex:1;min-width:120px">${L('Note', 'Ghi chú')}<input type="text" id="cf-n"></label>` : ''}
        <label class="kx-rate">${L('Amount (₫)', 'Số tiền (₫)')}<input type="number" id="cf-a" min="0" step="1000" style="width:120px"></label>
        <button class="wbtn primary" id="cf-add">${L('Add', 'Thêm')}</button></div><datalist id="cf-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
    const rows = mine.map(e => { const oc = OUTCATS.find(c => c[0] === e.cat);
      return [fmtD(e.date), (kind === 'cash' && oc ? `<b>${esc(L(oc[1], oc[2]))}</b> ` : '') + esc(e.who || '–') + (e.note ? ` <span class="muted">${esc(e.note)}</span>` : '') + (e.imp ? ` <span class="badge">${L('Imported', 'Từ bảng tính')}</span>` : ''), vnd(e.amt), `<button class="wbtn sm" data-edel="${e.id}" aria-label="${L('Remove', 'Xóa')}">×</button>`]; });
    const auto = kind === 'meal' ? `<label class="switch-row" style="margin:6px 0"><span>${L('Also count the kitchen book’s daily meal allowance as money in', 'Đồng thời tính tiền ăn được chi trong sổ bếp là tiền thu')}</span><input type="checkbox" id="cf-auto"${cf().noAutoMeal ? '' : ' checked'}></label><p class="hint">${L('Turn this off once you enter the meal money actually received, so it is not counted twice.', 'Tắt mục này khi đã nhập tiền ăn thực thu, để không bị tính hai lần.')}</p>` : '';
    return `${auto}${form}${tiles([[vnd(total), kind === 'cash' ? L('Cash out this month', 'Chi trong tháng') : L('Entered this month', 'Đã nhập trong tháng')], [mine.length, L('Entries', 'Số khoản')]])}
      <div class="kx-scroll" style="margin-top:8px;max-height:320px">${table([L('Date', 'Ngày'), kind === 'meal' ? L('Note', 'Ghi chú') : kind === 'fee' ? L('Child', 'Bé') : L('Paid to', 'Chi cho'), L('Amount', 'Số tiền'), ''], rows)}</div>
      <p class="hint" style="margin-top:8px">${L('Everything entered here counts in the balance and shows in the Overview and the source tabs.', 'Mọi khoản nhập ở đây đều tính vào số dư và hiện ở tab Tổng quan và các tab nguồn.')}</p>`;
  }

  function wireEntry(b, kind, rp, onMonth) { // the entry form and the list under it: used by Cash Flow and by Accounting
    const $q = x => b.querySelector(x);
    const auto = $q('#cf-auto'); if (auto) auto.onchange = () => { cf().noAutoMeal = !auto.checked; saveState(); rp(); };
    b.querySelectorAll('[data-edel]').forEach(x => x.onclick = () => { if (!confirm(L('Remove this entry?', 'Xóa khoản này?'))) return; cf().entries = ents().filter(e => e.id !== x.dataset.edel); saveState(); rp(); });
    const add = $q('#cf-add'); if (add) {
      const go = () => { const amt = Math.round(+$q('#cf-a').value), date = $q('#cf-d').value;
        if (!date) return $q('#cf-d').focus(); if (!(amt > 0)) return $q('#cf-a').focus();
        const c = $q('#cf-c'), n = $q('#cf-n');
        ents().push({id:'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind, date, cat:c ? c.value : '', who:$q('#cf-w').value.trim(), note:n ? n.value.trim() : '', amt, loc:state.loc === 'all' ? KLOC() : state.loc});
        lastDate = date; onMonth(date.slice(0, 7)); saveState(); rp(); setTimeout(() => { const w = b.querySelector('#cf-w'); if (w) w.focus(); }); };
      add.onclick = go; $q('#cf-a').onkeydown = ev => { if (ev.key === 'Enter') go(); };
    }
  }

  const W = { id:'cashflow', em:'💵', icon:'coins', en:'Cash Flow', vi:'Dòng tiền', w:820, h:640, full:true,
    html() {
      const st = cf(), m = curM(), s = summary(m), tab = st.tab || 'over';
      const tb = TABS.map(t => `<button class="wbtn sm ${tab === t[0] ? 'primary' : ''}" data-tab="${t[0]}">${esc(L(t[1], t[2]))}</button>`).join('');
      return `<div class="ss-root"><div class="btn-row" style="margin-bottom:10px;align-items:center"><button class="wbtn sm" data-m="-1" aria-label="${L('Previous month', 'Tháng trước')}">‹</button>
          <b>${L('Month', 'Tháng')} ${m.slice(5)}/${m.slice(0, 4)}</b><button class="wbtn sm" data-m="1" aria-label="${L('Next month', 'Tháng sau')}">›</button><span style="flex:1"></span>
          <button class="wbtn" id="cf-csv">${L('Export month (CSV)', 'Xuất tháng (CSV)')}</button></div>
        ${tiles([[money(s.opening), L('Opening balance', 'Số dư đầu tháng')], [vnd(s.inn), L('Money in', 'Tiền thu')], [vnd(s.out), L('Money out', 'Tiền chi')], [money(s.opening + s.inn - s.out), L('Closing balance', 'Số dư cuối tháng')]])}
        <div class="btn-row" style="margin:10px 0 0">${tb}</div>
        ${tab === 'over' ? overView(s, m) : tab === 'in' || tab === 'out' ? sourcesView(s, tab) : inputView(tab, m)}</div>`;
    },
    wire(b, rp) {
      const st = cf(), $q = x => b.querySelector(x), tab = st.tab || 'over';
      b.querySelectorAll('[data-tab]').forEach(x => x.onclick = () => { st.tab = x.dataset.tab; saveState(); rp(); });
      b.querySelectorAll('[data-m]').forEach(x => x.onclick = () => { st.m = shiftM(curM(), +x.dataset.m); st.day = ''; saveState(); rp(); });
      b.querySelectorAll('tr[data-d]').forEach(tr => tr.onclick = () => { st.day = tr.dataset.d; saveState(); rp(); });
      b.querySelectorAll('[data-src]').forEach(x => x.onclick = () => { const [k, ...id] = x.dataset.src.split(':'); openSrc(k, id.join(':')); });
      $q('#cf-csv').onclick = () => exportCsv(curM());
      wireEntry(b, tab, rp, m => { st.m = m; st.day = ''; });
    } };
  window.CF = {lines:allLines, openSrc, inputView, wireEntry, ents, cf, kloc:KLOC, OUTCATS};  // read by the Accounting book
  const at = WIDGETS.findIndex(w => w.id === 'kitchen');
  WIDGETS.splice(at < 0 ? WIDGETS.length : at + 1, 0, W);
})();

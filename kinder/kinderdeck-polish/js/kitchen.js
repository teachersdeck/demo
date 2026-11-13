/* KinderDeck Kitchen Cost Book (v0.4.6; since v0.4.16 it is shown inside Accounting, as its Kitchen tab).
   Enter the number of children once; the market list, daily cash book, supplier invoice, food-safety forms,
   dashboard tile and Document Library entries all follow. Add-only: reads KD.kitchen (seed) and writes state.kitchen. */
(() => {
  const K0 = KD.kitchen, DRY = new Set(K0.dry);
  const kst = () => state.kitchen || (state.kitchen = {sel:'', ov:{}, rates:{}});
  const rates = () => Object.assign({}, K0.allow, kst().rates);
  const pad = n => String(n).padStart(2, '0');
  const toISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); };
  const fmtD = iso => iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const clone = o => JSON.parse(JSON.stringify(o));
  const known = () => Object.keys(Object.assign({}, K0.days, kst().ov)).sort();
  const isW = u => /^(kg|lít|lit)$/i.test(String(u).trim());
  const qround = (v, u) => isW(u) ? Math.round((v + 1e-9) * 100) / 100 : Math.round(v + 1e-9);
  const shown = (n, u) => isW(u) ? +(n * 1000).toFixed(2) : +(+n).toFixed(3);
  const MEALS = [['Bữa sáng', 'Breakfast', 'Bữa sáng'], ['Bữa trưa', 'Lunch', 'Bữa trưa'], ['Bữa xế', 'Afternoon meal', 'Bữa xế'], ['Bữa phụ NT', 'Snack, nursery', 'Bữa phụ NT'], ['Bữa phụ MG', 'Snack, kindergarten', 'Bữa phụ MG']];
  let kxTab = 'menu', kxRange = 'day', kxForm = 'all', kxSplit = false, kxSide = 'tp', kxPaper = false;  // kxPaper: show the forms as white A4 paper (print preview) instead of in the app's look

  /* ---- data access: seed day, or her saved edit, or a new day copied from the closest earlier one ---- */
  function dayOf(iso) {
    const k = kst();
    if (k.ov[iso]) return [k.ov[iso], null];
    if (K0.days[iso]) return [K0.days[iso], null];
    const ks = known(), prev = ks.filter(d => d < iso).pop() || ks[0], c = clone(k.ov[prev] || K0.days[prev]);
    c.dishes = []; return [c, prev];
  }
  function edit(iso) { const k = kst(); if (!k.ov[iso]) k.ov[iso] = clone(dayOf(iso)[0]); return k.ov[iso]; }
  function sel() {
    const k = kst(); if (k.sel) return k.sel;
    const t = toISO(new Date()), ks = known();
    return ks.includes(t) ? t : (ks.filter(d => d <= t).pop() || ks[0]);
  }

  /* ---- the one calculation everything else reads ---- */
  function calc(iso) {
    const [d, from] = dayOf(iso), r = rates(), nt = Math.max(0, +d.nt || 0), mg = Math.max(0, +d.mg || 0), all = nt + mg;
    const bf = d.bf.map(x => { const q = qround(x[3] * all, x[1]); return {n:x[0], u:x[1], p:x[2], kn:x[3], q, a:Math.round(q * x[2])}; });
    const mn = d.mn.map(x => { const qn = qround(x[3] * nt, x[1]), qm = qround(x[4] * mg, x[1]), q = qround(qn + qm, x[1]);
      return {n:x[0], u:x[1], p:x[2], kn:x[3], km:x[4], qn, qm, q, a:Math.round(q * x[2])}; });
    const bfShop = sum(bf, 'a'), mnShop = sum(mn, 'a'), shop = bfShop + mnShop;
    const allowed = nt * r.nt + mg * r.mg + all * r.bf, svc = all * r.svc, spent = svc + shop;
    return {iso, d, from, nt, mg, all, bf, mn, bfShop, mnShop, shop, allowed, svc, spent, diff:allowed - spent, per:all ? Math.round(spent / all) : 0};
  }
  const portions = (meal, c) => /NT/.test(meal) ? c.nt : /MG/.test(meal) ? c.mg : c.all;
  function lines(c) { // supplier invoice: same item, unit and price merged across meals
    const m = {};
    c.bf.concat(c.mn).forEach(x => { const k = x.n + '|' + x.u + '|' + x.p; const e = m[k] || (m[k] = {n:x.n, u:x.u, p:x.p, q:0, a:0}); e.q += x.q; e.a += x.a; });
    return Object.values(m).filter(x => x.q > 0).map(x => { x.q = qround(x.q, x.u); return x; });
  }
  const odd = x => { const u = K0.cat[x.n]; return !!(u && u[1] && Math.abs(x.p - u[1]) / u[1] > .4); };
  const filed = iso => docs().filter(d => d.id.indexOf('kx-' + iso + '-') === 0);
  const wk = iso => { const g = new Date(iso + 'T00:00:00').getDay(); return g === 0 || g === 6; };
  const step = (iso, dir) => { let d = addDays(iso, dir); while (wk(d)) d = addDays(d, dir); return d; };
  const money = n => `<span class="${n < 0 ? 'kx-neg' : 'kx-pos'}">${n < 0 ? '−' : ''}${vnd(Math.abs(n))}</span>`;
  const num = (v, w, extra) => `<input type="number" class="kx-n" step="any" min="0" value="${v}" ${extra || ''} style="width:${w || 64}px">`;

  /* ---- inputs shared by the market list and the menu ---- */
  const fx = (sec, i, f, v, u) => num(shown(v, u), 62, `data-s="${sec}" data-i="${i}" data-f="${f}"`);
  const qx = (sec, i, f, v, u, n) => n ? num(v, 66, `data-s="${sec}" data-i="${i}" data-q="${f}" step="${isW(u) ? 0.01 : 1}" title="${L('Type the quantity to buy', 'Nhập số lượng cần mua')}"`) : v;
  const px = (sec, i, x) => `<input type="number" class="kx-n${odd(x) ? ' kx-flag' : ''}" min="0" step="500" value="${x.p}" data-s="${sec}" data-i="${i}" data-f="p" style="width:84px" title="${odd(x) ? esc(L('Usual price ' + vnd(K0.cat[x.n][1]) + ': please check', 'Giá thường là ' + vnd(K0.cat[x.n][1]) + ': hãy kiểm tra')) : ''}">`;
  const del = (sec, i) => `<button class="wbtn sm" data-del="${sec}:${i}" aria-label="${L('Remove', 'Xóa dòng')}">×</button>`;
  const addRow = () => `<h4 class="wh">${L('Add an ingredient', 'Thêm nguyên liệu')}</h4>
      <div class="btn-row kx-add"><select id="kx-as"><option value="mn">${L('Main meal', 'Ăn chính')}</option><option value="bf">${L('Breakfast group', 'Nhóm ăn sáng')}</option></select>
        <input type="text" id="kx-an" list="kx-names" placeholder="${L('Name (price fills in if known)', 'Tên (tự điền giá nếu đã có)')}" style="flex:1;min-width:150px">
        <button class="wbtn sm primary" id="kx-aadd">${L('Add', 'Thêm')}</button></div>`;
  const names = () => `<datalist id="kx-names">${Object.keys(K0.cat).map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;

  /* ---- a day with nothing saved yet: she chooses how to start it ---- */
  function startPanel(c) {
    const wa = addDays(c.iso, -7), ks = known(), lw = ks.includes(wa) ? wa : null;
    return `<div class="kx-start"><b>${L('Nothing planned for ' + fmtD(c.iso) + ' yet.', 'Ngày ' + fmtD(c.iso) + ' chưa có thực đơn.')}</b> ${L('Start from:', 'Bắt đầu từ:')}
      <div class="btn-row" style="margin-top:8px"><button class="wbtn sm primary" data-start="${c.from}">${L('Copy ' + fmtD(c.from) + ' (menu and shopping list)', 'Chép ngày ' + fmtD(c.from) + ' (thực đơn và đi chợ)')}</button>
        ${lw ? `<button class="wbtn sm" data-start="${lw}">${L('Copy the same day last week, ' + fmtD(lw), 'Chép cùng thứ tuần trước, ' + fmtD(lw))}</button>` : ''}
        <button class="wbtn sm" data-start="">${L('Start empty', 'Bắt đầu trống')}</button></div>
      <p class="hint" style="margin-top:6px">${L('The headcount is carried over; change it above. Then type each ingredient’s kg for the day.', 'Số bé được giữ như hôm trước, sửa ở trên nếu khác. Sau đó nhập số kg từng nguyên liệu cho ngày này.')}</p></div>`;
  }
  function startDay(iso, src) {
    const k = kst(), base = dayOf(iso)[0];
    k.ov[iso] = src ? Object.assign(clone(dayOf(src)[0]), {nt:base.nt, mg:base.mg}) : {nt:base.nt, mg:base.mg, bf:[], mn:[], dishes:[]};
  }

  /* ---- menu and shopping list together: each dish with its ingredients and the kg to buy ---- */
  function menuView(c) {
    const ds = c.d.dishes, used = new Set();
    const rowFor = (meal, n, i, j) => { // one ingredient of one dish; the kg box is that portion group's share of the day's line
      const sec = meal === 'Bữa sáng' ? 'bf' : 'mn', k = c[sec].findIndex(x => x.n === n), x = c[sec][k];
      const rm = `<button class="wbtn sm" data-di="${i}:${j}" aria-label="${L('Take off this dish', 'Bỏ khỏi món')}">×</button>`;
      if (!x) return [esc(n), '', `<span class="muted">${L('not on the shopping list', 'chưa có trong danh sách đi chợ')}</span>`, '', '', rm];
      used.add(sec + ':' + x.n);
      const f = sec === 'bf' ? 'q' : /NT/.test(meal) ? 'qn' : /MG/.test(meal) ? 'qm' : 'q', shared = ds.filter(d => (d[0] === 'Bữa sáng') === (sec === 'bf') && (d[2] || []).includes(n)).length > 1;
      return [esc(x.n) + (shared ? ` <span class="badge warn">${L('shared', 'dùng chung')}</span>` : ''), esc(x.u), qx(sec, k, f, x[f], x.u, f === 'qn' ? c.nt : f === 'qm' ? c.mg : c.all), px(sec, k, x), vnd(f === 'q' ? x.a : Math.round(x[f] * x.p)), rm];
    };
    const head = [L('Ingredient', 'Nguyên liệu'), L('Unit', 'ĐVT'), L('Qty to buy', 'SL cần mua'), L('Price', 'Đơn giá'), L('Amount', 'Thành tiền'), ''];
    const meals = MEALS.map(m => {
      const mine = ds.map((d, i) => [d, i]).filter(([d]) => d[0] === m[0]);
      const cards = mine.map(([d, i]) => `<div class="kx-dish"><div class="kx-dish-h"><b>${esc(d[1])}</b><span class="muted">${portions(d[0], c)} ${L('portions', 'suất')}</span><span style="flex:1"></span><button class="wbtn sm" data-dd="${i}" aria-label="${L('Remove dish', 'Xóa món')}">×</button></div>
          ${(d[2] || []).length ? `<div class="kx-scroll">${table(head, d[2].map((n, j) => rowFor(d[0], n, i, j)))}</div>` : ''}
          <div class="btn-row kx-add" style="margin-top:6px"><input type="text" list="kx-names" data-ain="${i}" placeholder="${L('Add an ingredient to this dish', 'Thêm nguyên liệu cho món này')}" style="flex:1;min-width:150px"><button class="wbtn sm" data-ai="${i}">${L('Add', 'Thêm')}</button></div></div>`).join('');
      return `<h4 class="wh">${esc(L(m[1], m[2]))} · ${portions(m[0], c)} ${L('portions', 'suất')}</h4>${cards}
        <div class="btn-row kx-add"><input type="text" data-mdn="${m[0]}" placeholder="${L('New dish for ' + m[1].toLowerCase(), 'Món mới cho ' + m[2].toLowerCase())}" style="flex:1;min-width:150px"><button class="wbtn sm" data-mda="${m[0]}">${L('Add dish', 'Thêm món')}</button></div>`;
    }).join('');
    const rest = [['bf', L('Breakfast group', 'Nhóm ăn sáng')], ['mn', L('Main meal', 'Ăn chính')]].map(([sec, t]) => {
      const xs = c[sec].map((x, k) => [x, k]).filter(([x]) => !used.has(sec + ':' + x.n));
      return xs.length ? `<p class="muted" style="margin:6px 0 2px">${t}</p><div class="kx-scroll">${table(head, xs.map(([x, k]) => [esc(x.n), esc(x.u), qx(sec, k, 'q', x.q, x.u, c.all), px(sec, k, x), vnd(x.a), del(sec, k)]))}</div>` : '';
    }).join('');
    return `${meals}
      <h4 class="wh">${L('Seasonings and other items (not on a dish)', 'Gia vị và hàng khác (chưa gán món)')}</h4>${rest || `<p class="empty">${L('Every item on the list belongs to a dish.', 'Mọi mặt hàng đều đã gán món.')}</p>`}
      ${addRow()}${names()}
      <p class="hint" style="margin-top:8px">${L('Shopping total ' + vnd(c.shop) + '. Type the kg to buy for each ingredient: the market list, forms, cash book and cash flow follow. An ingredient added to a dish joins the shopping list. Snacks use the nursery or kindergarten share.', 'Tổng tiền đi chợ ' + vnd(c.shop) + '. Nhập số kg cần mua cho từng nguyên liệu: danh sách đi chợ, biểu mẫu, sổ tiền ăn và dòng tiền tự cập nhật. Nguyên liệu thêm vào món sẽ có trong danh sách đi chợ. Bữa phụ tính theo phần nhà trẻ hoặc mẫu giáo.')}</p>`;
  }

  /* ---- Meals and weekly menu: the old Meals and Menu widget, folded in. One simple table, Monday to Friday, read from the dishes on each day ---- */
  const DAYN = [['Mon', 'Thứ 2'], ['Tue', 'Thứ 3'], ['Wed', 'Thứ 4'], ['Thu', 'Thứ 5'], ['Fri', 'Thứ 6']];
  const WROWS = [[['Bữa sáng'], 'Breakfast', 'Sáng'], [['Bữa trưa'], 'Lunch', 'Trưa'], [['Bữa xế'], 'Afternoon', 'Xế'], [['Bữa phụ NT', 'Bữa phụ MG'], 'Snack', 'Phụ']];
  const isRice = n => /^c[ơo]m tr[ắa]ng$/i.test(n);
  const cap1 = n => n.charAt(0).toLocaleUpperCase('vi') + n.slice(1);
  const mondayOf = iso => { const d = new Date(iso + 'T00:00:00'); return addDays(iso, -((d.getDay() + 6) % 7)); };
  function weekCells(iso) { // iso -> {meal row index -> [dish names]} with commas split, blanks dropped, rice shown once
    const have = known().includes(iso), out = WROWS.map(() => []);
    if (!have) return null;
    const ds = dayOf(iso)[0].dishes || [];
    WROWS.forEach((r, i) => { let rice = false; const seen = new Set();
      ds.filter(d => r[0].includes(d[0])).forEach(d => String(d[1]).split(',').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).forEach(n => {
        if (isRice(n)) { rice = true; return; } const k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); out[i].push(cap1(n)); } }));
      if (rice) out[i].unshift('Cơm trắng'); });
    return out;
  }
  function weekTable(mon, plain) {
    const days = DAYN.map((_, i) => addDays(mon, i)), cells = days.map(weekCells);
    const th = days.map((d, i) => plain ? `<th>${esc(L(DAYN[i][0], DAYN[i][1]))}<br><small>${fmtD(d).slice(0, 5)}</small></th>` : `<th><button class="kf-name" data-wd="${d}">${esc(L(DAYN[i][0], DAYN[i][1]))}<br><small class="muted">${fmtD(d).slice(0, 5)}</small></button></th>`).join('');
    const body = WROWS.map((r, ri) => `<tr><th>${esc(L(r[1], r[2]))}</th>${cells.map(c => `<td>${c && c[ri].length ? c[ri].map(esc).join('<br>') : '<span class="muted">–</span>'}</td>`).join('')}</tr>`).join('');
    return `<table class="kd-table kx-week"><tr><th></th>${th}</tr>${body}</table>`;
  }
  function weekView(c) {
    const mon = mondayOf(c.iso), fri = addDays(mon, 4), al = kids().filter(k => k.al);
    return `<div class="btn-row" style="margin-bottom:8px;align-items:center"><button class="wbtn sm" data-wk="-7" aria-label="${L('Previous week', 'Tuần trước')}">‹</button>
        <b>${L('Week of ', 'Tuần ')}${fmtD(mon).slice(0, 5)} – ${fmtD(fri)}</b><button class="wbtn sm" data-wk="7" aria-label="${L('Next week', 'Tuần sau')}">›</button><span style="flex:1"></span>
        <button class="wbtn sm" id="kx-wprint">${L('Print weekly menu', 'In thực đơn tuần')}</button></div>
      <div class="kx-scroll">${weekTable(mon)}</div>
      <p class="hint" style="margin-top:6px">${L('Read from the dishes on each day (Menu and shopping tab). Lunch always lists rice first; the two snack lines are merged. Tap a day to edit it.', 'Lấy từ các món ăn của từng ngày (tab Thực đơn & đi chợ). Bữa trưa luôn ghi cơm trắng trước; hai bữa phụ được gộp. Bấm vào thứ để sửa ngày đó.')}</p>
      <h4 class="wh">${L('Portions for the kitchen, ', 'Số suất cho bếp, ')}${fmtD(c.iso)}</h4>
      <div class="arow"><span class="name">${L('Nursery / kindergarten', 'Nhà trẻ / mẫu giáo')}</span><span class="val">${c.nt} / ${c.mg}</span></div>
      <div class="arow"><span class="name">${L('Breakfast and lunch', 'Ăn sáng và ăn trưa')}</span><span class="val">${c.all}</span></div>
      <h4 class="wh">${L('Allergy list for the kitchen', 'Danh sách dị ứng cho bếp')}</h4>
      ${al.map(k => `<div class="arow"><span class="name">${esc(k.n)}</span><span class="badge warn">${esc(k.al)}</span></div>`).join('') || `<p class="empty">${L('No allergies recorded.', 'Chưa ghi nhận dị ứng.')}</p>`}`;
  }
  function printWeek(iso) {
    const mon = mondayOf(iso), w = window.open('', '_blank'); if (!w) return toast(L('Allow pop-ups to print', 'Hãy cho phép cửa sổ bật lên để in'), 3000);
    w.document.write(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${esc(L('Weekly menu', 'Thực đơn tuần'))}</title><style>body{font-family:Arial,sans-serif;margin:14mm}h1{font-size:18px;margin:0 0 2px}p{margin:0 0 10px;color:#555}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:6px 8px;vertical-align:top;font-size:13px;text-align:left}th{background:#f0f0f0}small{font-weight:normal}@page{size:A4 landscape;margin:10mm}</style></head><body><h1>${esc(K0.unit)}</h1><p>${esc(L('Weekly menu', 'Thực đơn tuần'))} ${fmtD(mon).slice(0, 5)} – ${fmtD(addDays(mon, 4))}</p>${weekTable(mon, true)}<script>onload=()=>print()<\/script></body></html>`);
    w.document.close();
  }

  /* ---- views ---- */
  function listView(c) {
    const g = L('g or pcs per child', 'g hoặc cái / bé');
    const t1 = table(['#', L('Item', 'Mặt hàng'), L('Unit', 'ĐVT'), g, L('Qty', 'SL'), L('Price', 'Đơn giá'), L('Amount', 'Thành tiền'), ''],
      c.bf.map((x, i) => [i + 1, esc(x.n), esc(x.u), fx('bf', i, 3, x.kn, x.u), qx('bf', i, 'q', x.q, x.u, c.all), px('bf', i, x), vnd(x.a), del('bf', i)]));
    const t2 = table(['#', L('Item', 'Mặt hàng'), L('Unit', 'ĐVT'), L('Nursery ' + g, 'Nhà trẻ ' + g), L('Kindergarten ' + g, 'Mẫu giáo ' + g), L('Nursery qty', 'SL NT'), L('Kinder qty', 'SL MG'), L('Total', 'Tổng'), L('Price', 'Đơn giá'), L('Amount', 'Thành tiền'), ''],
      c.mn.map((x, i) => [i + 1, esc(x.n), esc(x.u), fx('mn', i, 3, x.kn, x.u), fx('mn', i, 4, x.km, x.u), qx('mn', i, 'qn', x.qn, x.u, c.nt), qx('mn', i, 'qm', x.qm, x.u, c.mg), qx('mn', i, 'q', x.q, x.u, c.all), px('mn', i, x), vnd(x.a), del('mn', i)]));
    return `<h4 class="wh">${L('Breakfast group', 'Nhóm ăn sáng')} · ${vnd(c.bfShop)}</h4><div class="kx-scroll">${t1}</div>
      <h4 class="wh">${L('Main meal', 'Ăn chính')} · ${vnd(c.mnShop)}</h4><div class="kx-scroll">${t2}</div>
      ${addRow()}${names()}
      <p class="hint" style="margin-top:8px">${L('Type either the per-child amount or the quantity in kg: the other works itself out, and the forms, cash book and delivery note follow. Quantities are rounded to 0.01 kg (whole pieces for eggs, boxes). Changes apply to this day only.', 'Nhập định lượng mỗi bé hoặc số lượng (kg): số còn lại tự tính, các biểu mẫu, sổ tiền ăn và phiếu xuất kho tự cập nhật. Số lượng làm tròn 0,01 kg (số nguyên với trứng, hộp). Chỉ đổi cho ngày này.')}</p>`;
  }
  /* Forms tab: the overview, or one of the school's sheets shown filled in (her sheet numbers 2, 5 and 10) */
  const SHEETS = [['tp', 2, 'Receiving', 'Phiếu tiếp nhận'], ['b2', 5, 'Step 2', 'Bước 2'], ['mg', 10, 'Weekly rations', 'Khẩu phần tuần']];
  function formsView(c) {
    const st = (k, en, vi) => `<button class="wbtn sm ${kxForm === k ? 'primary' : ''}" data-kf="${k}">${en ? L(en, vi) : ''}</button>`;
    return `<div class="btn-row" style="margin-bottom:10px">${st('all', 'Overview', 'Tổng quan')}${SHEETS.map(s => st(s[0], `Sheet ${s[1]} · ${s[2]}`, `Tờ ${s[1]} · ${s[3]}`)).join('')}</div>` +
      (kxForm === 'all' ? formsAll(c) : sheetView(c));
  }
  function sheetView(c) {
    const wk = kxForm === 'mg';
    return `<div class="btn-row" style="margin-bottom:8px;align-items:center"><span class="muted">${wk ? L('Week of ', 'Tuần có ngày ') : L('Day ', 'Ngày ')}${fmtD(c.iso)}</span><span style="flex:1"></span>
        <select id="kx-range"><option value="day"${kxRange === 'day' ? ' selected' : ''}>${wk ? L('This week', 'Tuần này') : L('This day', 'Ngày này')}</option><option value="month"${kxRange === 'month' ? ' selected' : ''}>${L('Whole month', 'Cả tháng')}</option></select>
        <button class="wbtn sm ${kxPaper ? 'primary' : ''}" data-pp title="${L('Show the form as it will print, on white paper', 'Xem tờ như khi in, trên giấy trắng')}">${L('Print preview', 'Xem trước khi in')}</button><button class="wbtn sm" data-sp="${kxForm}">${L('Print', 'In')}</button><button class="wbtn sm" data-sx="${kxForm}">Excel</button></div>
      <label class="kx-note">${wk ? L('Notes for this week (printed on the sheet)', 'Ghi chú tuần này (in trên tờ)') : kxForm === 'tp' ? L('Notes (printed under “II. Other content”)', 'Ghi chú (in ở mục “II. Nội dung khác”)') : L('Notes for this day (printed on the sheet)', 'Ghi chú ngày này (in trên tờ)')}
        <textarea id="kx-note" rows="2" placeholder="${esc(L('For example: delivery late, fish replaced with chicken', 'Ví dụ: giao hàng trễ, thay cá bằng gà'))}">${esc(KX.sheets.getNote(kxForm, c.iso))}</textarea></label>
      <iframe class="kx-sheet" id="kx-sheet" title="${esc(L('Sheet preview', 'Xem trước tờ'))}"></iframe>
      <p class="hint" style="margin-top:8px">${L('Filled from this day’s numbers: change a kg, the headcount or a dish and it changes here. It looks like the rest of the app; “Print preview”, Print and Excel give the white paper form. The range applies to Print and Excel.', 'Lấy số của ngày này: sửa số kg, số bé hoặc món ăn thì tờ này tự đổi. Tờ hiển thị cùng giao diện với ứng dụng; “Xem trước khi in”, In và Excel cho ra tờ giấy trắng. Phạm vi áp dụng cho In và Excel.')}</p>`;
  }
  function formsAll(c) {
    const ls = lines(c), fresh = ls.filter(x => !DRY.has(x.n)), dry = ls.filter(x => DRY.has(x.n)), ds = c.d.dishes, f = filed(c.iso);
    const row = (a, b, v) => [esc(a), esc(b), v];
    const rows = [
      row(L('Market list (Form 06-VT)', 'Bảng kê hàng chợ (Mẫu 06-VT)'), L('every quantity and amount', 'mọi số lượng và thành tiền'), `${c.bf.length + c.mn.length} ${L('lines', 'dòng')} · ${vnd(c.shop)}`),
      row(L('Food receiving and quality check', 'Phiếu tiếp nhận thực phẩm'), L('portions and expected kg', 'số suất và số lượng dự kiến'), `${L('Portions', 'Số suất')}: ${c.all}`),
      row(L('Step 1, fresh food', 'Bước 1, thực phẩm tươi sống'), L('kg received per item', 'khối lượng nhập từng món'), `${fresh.length} ${L('items', 'món')}`),
      row(L('Step 1, dry and packaged food', 'Bước 1, thực phẩm khô, bao gói'), L('kg received per item', 'khối lượng nhập từng món'), `${dry.length} ${L('items', 'món')}`),
      row(L('Step 2, during cooking', 'Bước 2, khi chế biến'), L('ingredients and kg/portions per dish', 'nguyên liệu và kg/số suất từng món'), `${ds.length} ${L('dishes', 'món')}`),
      row(L('Weekly rations, kindergarten and nursery', 'Khẩu phần tuần, mẫu giáo và nhà trẻ'), L('kg per item per day, average per portion', 'kg từng món mỗi ngày, bình quân 1 suất'), L('Mon to Fri', 'Thứ 2 đến thứ 6')),
      row(L('Step 3, before eating', 'Bước 3, trước khi ăn'), L('portion counts per dish', 'số suất từng món'), `${ds.length} ${L('dishes', 'món')}`),
      row(L('Retained food samples', 'Lưu mẫu thức ăn'), L('portion counts per dish', 'số suất từng món'), `${ds.length} ${L('samples', 'mẫu')}`),
      row(L('Supplier delivery note', 'Phiếu xuất kho nhà cung cấp'), L('merged lines and total', 'dòng gộp và tổng tiền'), `${ls.length} ${L('lines', 'dòng')} · ${vnd(sum(ls, 'a'))}`),
      row(L('Daily food cash book', 'Sổ tính tiền ăn trong ngày'), L('allowed, spent, difference', 'được chi, đã chi, chênh lệch'), `${vnd(c.allowed)} → ${vnd(c.spent)}`)
    ];
    const ings = (x, i) => { // ingredients of a dish: chips, plus a picker of the day's items not ticked yet
      const have = x[2] || [], pool = (x[0] === 'Bữa sáng' ? c.bf : c.mn).map(y => y.n).filter(n => !have.includes(n));
      return have.map((n, j) => `<span class="kx-chip">${esc(n)}<button data-di="${i}:${j}" aria-label="${L('Remove', 'Xóa')}">×</button></span>`).join('') +
        (pool.length ? `<select class="kx-pick" data-da="${i}"><option value="">${L('+ ingredient', '+ nguyên liệu')}</option>${pool.map(n => `<option>${esc(n)}</option>`).join('')}</select>` : '');
    };
    const dt = ds.map((x, i) => [esc(x[0]), esc(x[1]), ings(x, i), portions(x[0], c), `<button class="wbtn sm" data-dd="${i}" aria-label="${L('Remove', 'Xóa')}">×</button>`]);
    const sh = (k, n, en, vi, en2, vi2) => [`<b>${L(en, vi)}</b> <span class="muted">(${L('sheet', 'tờ')} ${n})</span>`, esc(L(en2, vi2)),
      `<button class="wbtn sm" data-sp="${k}">${L('Print', 'In')}</button> <button class="wbtn sm" data-sx="${k}">Excel</button>`];
    const prev = f.length ? f.map(d => `<span class="badge ${stOf(d.status)[3]}">${esc(d.name.split(' – ')[0])}: ${esc(L(stOf(d.status)[1], stOf(d.status)[2]))}</span>`).join(' ') : `<span class="muted">${L('Not filed yet.', 'Chưa lưu vào Thư viện.')}</span>`;
    return `<h4 class="wh">${L('Everything this day’s numbers feed', 'Các biểu mẫu lấy số từ ngày này')}</h4>${table([L('Form', 'Biểu mẫu'), L('What follows the headcount', 'Số tự cập nhật'), L('Today', 'Hôm nay')], rows)}
      <h4 class="wh">${L('Sheets to print or open in Excel', 'Tờ in hoặc mở bằng Excel')}</h4>
      <div class="btn-row" style="margin-bottom:6px"><label class="kx-rate" style="flex-direction:row;align-items:center;gap:8px">${L('Range', 'Phạm vi')}
        <select id="kx-range"><option value="day"${kxRange === 'day' ? ' selected' : ''}>${L('This day (this week for rations)', 'Ngày này (tuần này với khẩu phần)')}</option><option value="month"${kxRange === 'month' ? ' selected' : ''}>${L('Whole month', 'Cả tháng')} ${c.iso.slice(5, 7)}/${c.iso.slice(0, 4)}</option></select></label></div>
      ${table([L('Sheet', 'Tờ'), L('Filled from', 'Lấy số từ'), ''], [
        sh('tp', 2, 'Food receiving and quality check', 'Phiếu tiếp nhận', 'the market list, breakfast and main meal', 'danh sách đi chợ, ăn sáng và ăn chính'),
        sh('b2', 5, 'Step 2, during cooking', 'Bước 2, khi chế biến', 'dishes below with their ingredients', 'món ăn bên dưới và nguyên liệu'),
        sh('mg', 10, 'Weekly rations, kindergarten', 'Khẩu phần tuần, mẫu giáo', 'kindergarten kg, Mon to Fri', 'số kg mẫu giáo, thứ 2 đến thứ 6'),
        sh('nt', 13, 'Weekly rations, nursery', 'Khẩu phần tuần, nhà trẻ', 'nursery kg, Mon to Fri', 'số kg nhà trẻ, thứ 2 đến thứ 6')])}
      <h4 class="wh">${L('Dishes, ingredients and portions (steps 2, 3 and samples)', 'Món ăn, nguyên liệu và số suất (bước 2, 3 và lưu mẫu)')}</h4>
      ${dt.length ? `<div class="kx-scroll">${table([L('Meal', 'Bữa'), L('Dish', 'Món ăn'), L('Main ingredients', 'Nguyên liệu chính'), L('Portions', 'Số suất'), ''], dt)}</div>` : `<p class="empty">${L('No dishes recorded for this day.', 'Chưa có món ăn cho ngày này.')}</p>`}
      <div class="btn-row kx-add" style="margin-top:8px"><select id="kx-dm">${MEALS.map(m => `<option value="${m[0]}">${esc(L(m[1], m[2]))}</option>`).join('')}</select>
        <input type="text" id="kx-dn" placeholder="${L('Dish name', 'Tên món ăn')}" style="flex:1;min-width:150px"><button class="wbtn sm primary" id="kx-dadd">${L('Add dish', 'Thêm món')}</button></div>
      <h4 class="wh">${L('In the Document Library', 'Trong Thư viện tài liệu')}</h4><div>${prev}</div>
      <p class="hint" style="margin-top:8px">${L('Tick each dish’s main ingredients from the day’s market list: step 2 then shows kg/portions for each. The sheets follow every kg, headcount and dish change.', 'Chọn nguyên liệu chính của từng món từ danh sách đi chợ: bước 2 sẽ ghi kg/số suất cho từng nguyên liệu. Các tờ tự cập nhật khi sửa số kg, số bé hoặc món ăn.')}</p>`;
  }
  function monthView(c) {
    const m = c.iso.slice(0, 7), r = rates(); let run = 0, T = {a:0, s:0, nt:0, mg:0};
    const rows = known().filter(d => d.slice(0, 7) === m && !wk(d)).map(d => {
      const x = calc(d); run += x.diff; T.a += x.allowed; T.s += x.spent; T.nt += x.nt; T.mg += x.mg;
      return `<tr data-d="${d}"${d === c.iso ? ' class="kx-cur"' : ''}><td>${fmtD(d).slice(0, 5)}</td><td>${x.nt}</td><td>${x.mg}</td><td>${vnd(x.allowed)}</td><td>${vnd(x.spent)}</td><td>${money(x.diff)}</td><td>${money(run)}</td></tr>`;
    }).join('');
    const rate = (k, en, vi) => `<label class="kx-rate">${L(en, vi)} ${num(r[k], 80, `data-r="${k}"`)}</label>`;
    return `${tiles([[vnd(T.a), L('Allowed this month', 'Được chi trong tháng')], [vnd(T.s), L('Spent this month', 'Đã chi trong tháng')], [money(T.a - T.s), L('Left over or over', 'Còn lại hoặc vượt')], [T.nt + T.mg, L('Child-days fed', 'Suất ăn trong tháng')]])}
      <div class="kx-scroll kx-click"><table class="kd-table"><tr><th>${L('Date', 'Ngày')}</th><th>${L('Nursery', 'NT')}</th><th>${L('Kinder', 'MG')}</th><th>${L('Allowed', 'Được chi')}</th><th>${L('Spent', 'Đã chi')}</th><th>${L('Day', 'Ngày')}</th><th>${L('Running', 'Lũy kế')}</th></tr>${rows}</table></div>
      <h4 class="wh">${L('Daily rates per child (₫), used on every day', 'Mức chi mỗi bé mỗi ngày (₫), áp dụng mọi ngày')}</h4>
      <div class="btn-row">${rate('nt', 'Nursery meals', 'Ăn chính NT')}${rate('mg', 'Kindergarten meals', 'Ăn chính MG')}${rate('bf', 'Breakfast', 'Ăn sáng')}${rate('svc', 'Gas, power, water', 'Gas, điện, nước')}</div>
      <p class="hint" style="margin-top:8px">${L('The running balance is calculated, not carried over by hand. Tap a row to open that day.', 'Số lũy kế tự tính, không cần chuyển tay từ hôm trước. Bấm một dòng để mở ngày đó.')}</p>`;
  }
  const outHtml = c => `${tiles([[vnd(c.allowed), L('Allowed today', 'Được chi hôm nay')], [vnd(c.spent), L('Spent today', 'Đã chi hôm nay')], [money(c.diff), L('Left over or over', 'Còn lại hoặc vượt')], [vnd(c.per), L('Cost per child', 'Chi phí mỗi bé')]])}
    ${c.bf.concat(c.mn).filter(odd).length ? `<p class="hint kx-warnline">${L(c.bf.concat(c.mn).filter(odd).length + ' price(s) differ from the usual price by more than 40% (outlined): check for a typing slip.', c.bf.concat(c.mn).filter(odd).length + ' đơn giá lệch hơn 40% so với giá thường (viền cam): hãy kiểm tra xem có gõ nhầm không.')}</p>` : ''}
    ${c.from && kxTab !== 'month' && kxTab !== 'week' ? startPanel(c) : ''}
    ${kxSplit ? `<div class="kx-split"><div class="kx-left">${mainView(c)}</div><div class="kx-right">${sidePanel(c)}</div></div>` : mainView(c)}`;
  const mainView = c => kxTab === 'week' ? weekView(c) : kxTab === 'forms' ? formsView(c) : kxTab === 'month' ? monthView(c) : kxTab === 'menu' ? (c.from ? '' : menuView(c)) : listView(c);
  /* side by side: one of the school's sheets next to whatever she is editing, redrawn on every change */
  function sidePanel(c) {
    const b = (k, n, vi, en) => `<button class="wbtn sm ${kxSide === k ? 'primary' : ''}" data-ks="${k}">${L('Sheet ' + n + ' · ' + en, 'Tờ ' + n + ' · ' + vi)}</button>`;
    return `<div class="btn-row" style="margin-bottom:8px;align-items:center">${b('tp', 2, 'Phiếu tiếp nhận', 'Receiving')}${b('b2', 5, 'Bước 2', 'Step 2')}${b('mg', 10, 'Khẩu phần tuần', 'Weekly rations')}<span style="flex:1"></span>
        <button class="wbtn sm ${kxPaper ? 'primary' : ''}" data-pp title="${L('Show the form as it will print, on white paper', 'Xem tờ như khi in, trên giấy trắng')}">${L('Print preview', 'Xem trước khi in')}</button><button class="wbtn sm" data-sp="${kxSide}">${L('Print', 'In')}</button><button class="wbtn sm" data-sx="${kxSide}">Excel</button></div>
      ${c.from ? `<p class="empty">${L('Start the day on the left first.', 'Hãy bắt đầu ngày này ở bên trái trước.')}</p>` : `<iframe class="kx-side" id="kx-side" title="${esc(L('Sheet beside the list', 'Tờ bên cạnh danh sách'))}"></iframe>`}`;
  }

  /* ---- other widgets read the same numbers ---- */
  const dash = WIDGETS.find(w => w.id === 'dashboard'), meals = WIDGETS.find(w => w.id === 'meals');
  if (dash) { const h0 = dash.html; dash.html = function () {
    const s = h0.call(this), i = s.lastIndexOf('</div></div>'); if (i < 0) return s;
    const c = calc(sel());
    return s.slice(0, i) + `<div class="ss-sub"><div class="ss-subhead"><span class="ss-subtitle">${L('Kitchen cost, ', 'Chi phí bếp, ')}${fmtD(c.iso)}</span></div><div class="ss-subbody">
      <div class="arow"><span class="name">${L('Children fed', 'Số bé ăn')}</span><span class="val">${c.nt} + ${c.mg}</span></div>
      <div class="arow"><span class="name">${L('Allowed', 'Được chi')}</span><span class="val">${vnd(c.allowed)}</span></div>
      <div class="arow"><span class="name">${L('Spent', 'Đã chi')}</span><span class="val">${vnd(c.spent)}</span></div>
      <div class="arow"><span class="name">${L('Left over or over', 'Còn lại hoặc vượt')}</span><span class="val">${money(c.diff)}</span></div></div></div>` + s.slice(i);
  }; }
  if (meals) { const h0 = meals.html; meals.html = function () {
    const c = calc(sel());
    return `<h4 class="wh">${L('Portions for the kitchen, ', 'Số suất cho bếp, ')}${fmtD(c.iso)}</h4><div class="arow"><span class="name">${L('Nursery / kindergarten', 'Nhà trẻ / mẫu giáo')}</span><span class="val">${c.nt} / ${c.mg}</span></div><div class="arow"><span class="name">${L('Breakfast and lunch', 'Ăn sáng và ăn trưa')}</span><span class="val">${c.all}</span></div>` + h0.call(this);
  }; }
  const others = () => ['dashboard', 'inbox', 'cashflow'].forEach(refreshWidget);

  /* ---- Document Library: one upsert per form, same id each time so nothing duplicates ---- */
  function fileDay(iso) {
    const c = calc(iso), ls = lines(c), stamp = fmtD(iso), n0 = docs().length, base = {date:iso, loc:state.loc === 'all' ? KD.locs[0].id : state.loc};
    const sum1 = `${L('Nursery', 'NT')} ${c.nt}, ${L('kindergarten', 'MG')} ${c.mg}; ${L('allowed', 'được chi')} ${vnd(c.allowed)}, ${L('spent', 'đã chi')} ${vnd(c.spent)}`;
    const specs = [
      ['inv', `${L('Supplier delivery note', 'Phiếu xuất kho')} ${stamp} – ${K0.supplier}`, 'invoice', K0.supplier, c.shop, `${ls.length} ${L('lines', 'dòng')}; ${sum1}`],
      ['led', `${L('Daily food cash book', 'Sổ tính tiền ăn')} ${stamp} – ${K0.unit}`, 'other', K0.unit, 0, sum1],
      ['saf', `${L('Food-safety forms, steps 1 to 3 and samples', 'Biểu mẫu an toàn thực phẩm, bước 1 đến 3 và lưu mẫu')} ${stamp}`, 'other', K0.unit, 0, `${L('Portions', 'Số suất')} ${c.all}; ${c.d.dishes.length} ${L('dishes', 'món')}; ${ls.length} ${L('items', 'món hàng')}`]
    ];
    let made = 0, changed = 0;
    specs.forEach(s => {
      const id = 'kx-' + iso + '-' + s[0], sig = [c.nt, c.mg, c.shop, c.d.dishes.length].join('/'), cur = docs().find(d => d.id === id);
      if (!cur) { docs().push(newDoc(s[1], Object.assign({id, cls:s[2], who:s[3], amount:s[4], notes:s[5], sig}, base))); made++; return; }
      const moved = cur.sig !== sig;
      Object.assign(cur, {name:s[1], who:s[3], amount:s[4], notes:s[5], date:iso, sig});
      if (moved) { changed++; if (cur.status === 'approved' || cur.status === 'rejected') { cur.status = 'review'; cur.notes = L('Numbers changed after approval. ', 'Số liệu đổi sau khi duyệt. ') + s[5]; } }
    });
    saveState(); others();
    toast(made ? L(`Filed ${made} documents in the Library`, `Đã lưu ${made} tài liệu vào Thư viện`) : changed ? L('Library entries updated; approved ones are back in review', 'Đã cập nhật Thư viện; mục đã duyệt chuyển về chờ xem lại') : L('Library already up to date', 'Thư viện đã cập nhật'), 3200);
  }
  function exportCsv(iso) {
    const c = calc(iso), q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['STT', 'Nội dung', 'Nhóm', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Người bán']];
    c.bf.map(x => [L('Breakfast', 'Ăn sáng'), x]).concat(c.mn.map(x => [L('Main meal', 'Ăn chính'), x])).forEach((r, i) => rows.push([i + 1, r[1].n, r[0], r[1].u, r[1].q, r[1].p, r[1].a, K0.supplier]));
    rows.push(['', 'Tổng cộng', '', '', '', '', c.shop, '']);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(q).join(',')).join('\n')], {type:'text/csv;charset=utf-8'}));
    a.download = 'bang-ke-hang-cho-' + iso + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* a sheet preview: the printable page on paper, scaled to the width of its frame and sized to its height */
  function paintSheet(fr, kind) {
    const fit = () => { try { const d = fr.contentDocument; if (!d || !d.body) return; const z = kxPaper ? Math.min(1, (fr.clientWidth - 2) / (KX.sheets.paper(kind)[0] * 96 / 25.4)) : 1; d.body.style.zoom = z; if (fr.id !== 'kx-side') fr.style.height = Math.max(240, d.documentElement.scrollHeight) + 'px'; } catch (x) {} };
    fr.onload = fit; fr.srcdoc = KX.sheets.preview(kind, sel(), 'day', kxPaper);
    if (window.ResizeObserver && !fr._ro) { let w = 0; fr._ro = new ResizeObserver(() => { if (fr.clientWidth !== w) { w = fr.clientWidth; fit(); } }); fr._ro.observe(fr); }
  }

  /* ---- the widget ---- */
  const W = { id:'kitchen', em:'🧺', icon:'bowl', en:'Kitchen Cost Book', vi:'Sổ tính tiền ăn và đi chợ', w:860, h:680, full:true,
    html() {
      const c = calc(sel()), tab = (k, en, vi) => `<button class="wbtn sm ${kxTab === k ? 'primary' : ''}" data-kt="${k}">${L(en, vi)}</button>`;
      return `<div class="kx"><div class="kx-head">
        <div class="kx-date"><button class="wbtn sm" data-step="-1" aria-label="${L('Previous school day', 'Ngày học trước')}">‹</button><input type="date" id="kx-date" value="${c.iso}"><button class="wbtn sm" data-step="1" aria-label="${L('Next school day', 'Ngày học sau')}">›</button></div>
        <label class="kx-big">${L('Nursery (24–36 mo)', 'Nhà trẻ (24–36 th)')}<input type="number" min="0" id="kx-nt" value="${c.nt}"></label>
        <label class="kx-big">${L('Kindergarten (36–72 mo)', 'Mẫu giáo (36–72 th)')}<input type="number" min="0" id="kx-mg" value="${c.mg}"></label>
        <span class="kx-all"><b id="kx-all">${c.all}</b> ${L('children at breakfast and lunch', 'bé ăn sáng và trưa')}</span></div>
        <div class="btn-row" style="margin:10px 0">${tab('week', 'Meals and weekly menu', 'Bữa ăn và thực đơn tuần')}${tab('menu', 'Menu and shopping', 'Thực đơn & đi chợ')}${tab('list', 'Market list', 'Danh sách đi chợ')}${tab('forms', 'Forms', 'Biểu mẫu')}${tab('month', 'Month', 'Cả tháng')}<button class="wbtn sm ${kxSplit ? 'primary' : ''}" id="kx-split" title="${L('Show a sheet beside this tab', 'Hiện một tờ bên cạnh tab này')}">⇆ ${L('Side by side', 'Xem song song')}</button><span style="flex:1"></span>
          <button class="wbtn" id="kx-csv">${L('Export market list (CSV)', 'Xuất bảng kê (CSV)')}</button><button class="wbtn primary" id="kx-file">${L('File in Library', 'Lưu vào Thư viện')}</button></div>
        <div id="kx-out">${outHtml(c)}</div></div>`;
    },
    wire(b, rp) {
      const $q = s => b.querySelector(s), cur = () => sel();
      const go = iso => { kst().sel = iso; saveState(); rp(); others(); };
      const paint = () => { const c = calc(cur()); $q('#kx-out').innerHTML = outHtml(c); $q('#kx-all').textContent = c.all; wireOut(); };
      const commit = () => { saveState(); paint(); others(); };
      b.querySelectorAll('[data-kt]').forEach(x => x.onclick = () => { kxTab = x.dataset.kt; rp(); });
      $q('#kx-split').onclick = () => { kxSplit = !kxSplit; rp(); };
      b.querySelectorAll('[data-step]').forEach(x => x.onclick = () => go(step(cur(), +x.dataset.step)));
      $q('#kx-date').onchange = e => { if (e.target.value) go(e.target.value); };
      ['nt', 'mg'].forEach(f => { const e = $q('#kx-' + f);
        e.oninput = () => { edit(cur())[f] = Math.max(0, Math.round(Number(e.value) || 0)); paint(); };
        e.onchange = () => { saveState(); others(); }; });
      $q('#kx-csv').onclick = () => exportCsv(cur());
      $q('#kx-file').onclick = () => fileDay(cur());
      function wireOut() {
        b.querySelectorAll('.kx-n[data-s]').forEach(e => e.onchange = () => {
          const v = Number(e.value), d = edit(cur()), row = d[e.dataset.s][+e.dataset.i], f = +(e.dataset.f === 'p' ? 2 : e.dataset.f);
          if (!isFinite(v) || v < 0) return paint();
          row[f] = f === 2 ? Math.round(v) : (isW(row[1]) ? v / 1000 : v); commit();
        });
        b.querySelectorAll('.kx-n[data-q]').forEach(e => e.onchange = () => { // a typed quantity becomes the per-child amount for this day
          const v = Number(e.value), s = e.dataset.s, i = +e.dataset.i, f = e.dataset.q, c = calc(cur()), x = c[s][i];
          if (!isFinite(v) || v < 0) return paint();
          const row = edit(cur())[s][i], q = qround(v, x.u);
          if (s === 'bf') row[3] = q / c.all;
          else if (f === 'qn') row[3] = q / c.nt;
          else if (f === 'qm') row[4] = q / c.mg;
          else { // total: split between nursery and kindergarten as before (by headcount if it was 0)
            const qn = c.mg ? qround(q * (x.q ? x.qn / x.q : c.nt / c.all), x.u) : q;
            row[3] = c.nt ? qn / c.nt : 0; row[4] = c.mg ? qround(q - qn, x.u) / c.mg : 0;
          }
          commit();
        });
        b.querySelectorAll('.kx-n[data-r]').forEach(e => e.onchange = () => { const v = Number(e.value); if (isFinite(v) && v >= 0) { kst().rates[e.dataset.r] = Math.round(v); commit(); } else paint(); });
        b.querySelectorAll('[data-del]').forEach(x => x.onclick = () => { // off the list, and off that meal group's dishes, so step 2 does not name an item that was not bought
          const [s, i] = x.dataset.del.split(':'), d = edit(cur()), name = d[s].splice(+i, 1)[0][0];
          d.dishes.forEach(dsh => { if ((dsh[0] === 'Bữa sáng') === (s === 'bf') && dsh[2]) dsh[2] = dsh[2].filter(n => n !== name); }); commit(); });
        b.querySelectorAll('[data-dd]').forEach(x => x.onclick = () => { edit(cur()).dishes.splice(+x.dataset.dd, 1); commit(); });
        b.querySelectorAll('[data-di]').forEach(x => x.onclick = () => { const [i, j] = x.dataset.di.split(':').map(Number); edit(cur()).dishes[i][2].splice(j, 1); commit(); });
        b.querySelectorAll('[data-da]').forEach(x => x.onchange = () => { if (!x.value) return; const dsh = edit(cur()).dishes[+x.dataset.da]; (dsh[2] || (dsh[2] = [])).push(x.value); commit(); });
        const rg = $q('#kx-range'); if (rg) rg.onchange = () => { kxRange = rg.value; };
        b.querySelectorAll('[data-wk]').forEach(x => x.onclick = () => go(addDays(cur(), +x.dataset.wk)));
        b.querySelectorAll('[data-wd]').forEach(x => x.onclick = () => { kxTab = 'menu'; go(x.dataset.wd); });
        const wp = $q('#kx-wprint'); if (wp) wp.onclick = () => printWeek(cur());
        b.querySelectorAll('[data-kf]').forEach(x => x.onclick = () => { kxForm = x.dataset.kf; paint(); });
        const sd = $q('#kx-side'); if (sd) paintSheet(sd, kxSide);
        b.querySelectorAll('[data-ks]').forEach(x => x.onclick = () => { kxSide = x.dataset.ks; paint(); });
        const sv = $q('#kx-sheet'); if (sv) { // same-origin srcdoc, no scripts in it: the paper preview of the sheet
          paintSheet(sv, kxForm);
          const nt = $q('#kx-note'); let h = 0;
          nt.oninput = () => { KX.sheets.setNote(kxForm, cur(), nt.value); clearTimeout(h); h = setTimeout(() => { paintSheet(sv, kxForm); if (sd && kxSide === kxForm) paintSheet(sd, kxSide); }, 400); }; }
        b.querySelectorAll('[data-pp]').forEach(x => x.onclick = () => { kxPaper = !kxPaper; paint(); });
        b.querySelectorAll('[data-sp]').forEach(x => x.onclick = () => KX.sheets.print(x.dataset.sp, cur(), kxRange));
        b.querySelectorAll('[data-sx]').forEach(x => x.onclick = () => KX.sheets.excel(x.dataset.sx, cur(), kxRange));
        b.querySelectorAll('tr[data-d]').forEach(tr => tr.onclick = () => { kxTab = 'list'; go(tr.dataset.d); });
        const an = $q('#kx-an'), add = $q('#kx-aadd');
        if (add) add.onclick = () => {
          const name = an.value.trim(); if (!name) return an.focus();
          const k = K0.cat[name] || ['Kg', 0, 0, 0, 0], s = $q('#kx-as').value, d = edit(cur());
          d[s].push(s === 'bf' ? [name, k[0], k[1], k[2]] : [name, k[0], k[1], k[3], k[4]]); commit();
          toast(K0.cat[name] ? L('Added with the last known price and typical amounts. Check them.', 'Đã thêm với giá gần nhất và định lượng thường dùng. Hãy kiểm tra lại.') : L('Added with price 0: type the price and per-child amounts.', 'Đã thêm với giá 0: hãy nhập giá và định lượng.'), 3200);
        };
        b.querySelectorAll('[data-start]').forEach(x => x.onclick = () => { startDay(cur(), x.dataset.start); commit(); });
        b.querySelectorAll('[data-mda]').forEach(x => x.onclick = () => { // new dish under a meal
          const inp = b.querySelector(`[data-mdn="${x.dataset.mda}"]`), v = inp.value.trim(); if (!v) return inp.focus();
          edit(cur()).dishes.push([x.dataset.mda, v, []]); commit();
          const ni = b.querySelector(`[data-ain="${edit(cur()).dishes.length - 1}"]`); if (ni) ni.focus(); });
        b.querySelectorAll('[data-ai]').forEach(x => x.onclick = () => { // ingredient to a dish; it joins the shopping list if it is not there yet
          const i = +x.dataset.ai, inp = b.querySelector(`[data-ain="${i}"]`), name = inp.value.trim(); if (!name) return inp.focus();
          const d = edit(cur()), dsh = d.dishes[i], sec = dsh[0] === 'Bữa sáng' ? 'bf' : 'mn', k = K0.cat[name] || ['Kg', 0, 0, 0, 0];
          let at = d[sec].findIndex(r => r[0] === name);
          if (at < 0) { d[sec].push(sec === 'bf' ? [name, k[0], k[1], 0] : [name, k[0], k[1], 0, 0]); at = d[sec].length - 1; }
          const ing = dsh[2] || (dsh[2] = []); if (!ing.includes(name)) ing.push(name); commit();
          if (!K0.cat[name] && !d[sec][at][2]) toast(L('New item: type its price too.', 'Mặt hàng mới: hãy nhập cả đơn giá.'), 3000);
          const f = sec === 'bf' ? 'q' : /NT/.test(dsh[0]) ? 'qn' : /MG/.test(dsh[0]) ? 'qm' : 'q', q = b.querySelector(`.kx-n[data-s="${sec}"][data-i="${at}"][data-q="${f}"]`); if (q) { q.focus(); q.select(); } });
        b.querySelectorAll('[data-ain]').forEach(x => x.onkeydown = ev => { if (ev.key === 'Enter') b.querySelector(`[data-ai="${x.dataset.ain}"]`).click(); });
        b.querySelectorAll('[data-mdn]').forEach(x => x.onkeydown = ev => { if (ev.key === 'Enter') b.querySelector(`[data-mda="${x.dataset.mdn}"]`).click(); });
        const dn = $q('#kx-dn'), da = $q('#kx-dadd');
        if (da) da.onclick = () => { const v = dn.value.trim(); if (!v) return dn.focus(); edit(cur()).dishes.push([$q('#kx-dm').value, v, []]); commit(); };
      }
      wireOut();
    } };
  const at = WIDGETS.findIndex(w => w.id === 'fees');
  WIDGETS.splice(at < 0 ? WIDGETS.length : at + 1, 0, W);
  const open = iso => { kst().sel = iso; kxTab = 'list'; saveState(); if (window.ACC) return ACC.open('kitchen'); openWidget('kitchen'); renderWidget('kitchen'); bringToFront(widgetEls.kitchen.el); syncDock(); };
  /* v0.6.0: one day's menu by meal, for Classes for teachers to send to TinyTeachersDeck and TinyParentDeck (null: no menu that day) */
  const menuOf = iso => { const c = weekCells(iso); return c ? WROWS.map((r, i) => ({meal:r[2], mealEn:r[1], dishes:c[i]})).filter(m => m.dishes.length) : null; };
  window.KX = {calc, lines, dayOf, fileDay, open, portions, isW, widget:W, menuOf, days:() => known().filter(d => !wk(d))};  // widget: v0.4.16, shown as the Kitchen tab of Accounting
})();

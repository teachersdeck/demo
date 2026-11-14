/* KinderDeck kitchen sheets (v0.4.4): the school's own paper forms, filled from the Kitchen Cost Book.
   tp = Phiếu tiếp nhận (her sheet 2), b2 = Bước 2 khi chế biến (sheet 5), mg / nt = Bảng tổng hợp khẩu phần tuần
   (sheets 10 and 13). Every number comes from KX.calc, so a kg, headcount or dish change shows up on the next print.
   Print opens a page and the print dialog; Excel saves an .xls that Excel opens directly. */
(() => {
  const K0 = KD.kitchen;
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  const dmy = iso => iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const monday = iso => { const g = new Date(iso + 'T00:00:00').getDay(); return addDays(iso, g === 0 ? -6 : 1 - g); };
  const byName = (a, b) => a.n.localeCompare(b.n, 'vi');
  const r2 = v => Math.round((v + 1e-9) * 100) / 100;
  const num = v => `<td class="n" x:num="${v}">${String(v).replace('.', ',')}</td>`; // x:num keeps it a number in Excel whatever the locale
  const blank = n => '<td></td>'.repeat(n);
  const sign = names => `<table class="sig"><tr>${names.map(n => `<td><b>${e(n)}</b><br><i>(Ký, họ tên)</i></td>`).join('')}</tr></table>`;
  const known = () => KX.days();
  /* notes typed above each sheet: per day for sheets 2 and 5, per week (its Monday) for the ration sheets */
  const noteKey = (kind, iso) => kind + ':' + (kind === 'mg' || kind === 'nt' ? monday(iso) : iso);
  const getNote = (kind, iso) => ((state.kitchen && state.kitchen.notes) || {})[noteKey(kind, iso)] || '';
  function setNote(kind, iso, v) { const k = state.kitchen || (state.kitchen = {sel:'', ov:{}, rates:{}}), n = k.notes || (k.notes = {}), key = noteKey(kind, iso);
    if (v.trim()) n[key] = v; else delete n[key]; saveState(); }
  const noteHtml = v => e(v).replace(/\n/g, '<br>');
  const noteLine = (kind, iso) => { const v = getNote(kind, iso); return v ? `<p style="margin-top:8px"><b>Ghi chú:</b> ${noteHtml(v)}</p>` : ''; };

  /* ---- sheet 2: Phiếu tiếp nhận và kiểm tra chất lượng thực phẩm ---- */
  function tp(iso) {
    const c = KX.calc(iso), part = (title, xs) => xs.length ? `<tr class="sec"><td colspan="5">${title}</td></tr>` +
      xs.slice().sort(byName).map((x, i) => `<tr><td class="c">${i + 1}</td><td class="nm">${e(x.n)}</td><td class="c">${e(x.u)}</td>${num(x.q)}<td></td></tr>`).join('') : '';
    return `<div class="blk"><h1>PHIẾU TIẾP NHẬN VÀ KIỂM TRA CHẤT LƯỢNG THỰC PHẨM</h1>
      <p>Đơn vị: ${e(K0.unit)}</p><p>Số suất: ${c.nt + c.mg + c.all}</p><p class="c">Ngày ${dmy(iso)}</p>
      <p><b>I. Tiếp nhận, kiểm tra chất lượng thực phẩm</b></p>
      <table class="g"><tr><th>STT</th><th>Tên thực phẩm</th><th>Đơn vị tính</th><th>Số lượng dự kiến mua (Kg)</th><th>Thực tế tiếp nhận (Kg)</th></tr>
      ${part('Ăn sáng', c.bf.filter(x => x.q > 0))}${part('Ăn chính', c.mn.filter(x => x.q > 0))}</table>
      <p><b>II. Nội dung khác:</b></p>${getNote('tp', iso) ? `<p>${noteHtml(getNote('tp', iso))}</p>` : `<p class="dots">. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .</p><p class="dots">. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .</p>`}
      ${sign(['Người lập biểu', 'Người trực tiếp chế biến', 'Kế toán', 'Ban giám hiệu'])}</div>`;
  }

  /* ---- sheet 5: Kiểm tra khi chế biến thức ăn (bước 2), Mẫu 2 ---- */
  function b2(iso) {
    const c = KX.calc(iso), snack = m => /phụ/i.test(m);
    const qty = (meal, n) => { // the kg that dish's portions eat: breakfast list, nursery or kindergarten share for snacks, else the whole lunch line
      const b = c.bf.find(x => x.n === n), m = c.mn.find(x => x.n === n);
      if (meal === 'Bữa sáng' && b) return b.q;
      if (!m) return b ? b.q : '';
      return /NT/.test(meal) ? m.qn : /MG/.test(meal) ? m.qm : m.q;
    };
    let last = '', rows = '';
    c.d.dishes.forEach((d, i) => {
      const ing = d[2] && d[2].length ? d[2] : [''], p = KX.portions(d[0], c), span = ing.length > 1 ? ` rowspan="${ing.length}"` : '';
      ing.forEach((n, j) => {
        const q = n ? qty(d[0], n) : '';
        rows += `<tr>${j ? '' : `<td class="c"${span}>${i + 1}</td><td${span}>${d[0] !== last ? e(d[0]) : ''}</td><td${span}>${e(d[1])}</td>`}<td>${e(n)}</td><td class="c">${q === '' ? p : String(q).replace('.', ',') + '/' + p}</td>` +
          (j ? '' : `<td${span}></td><td${span}></td><td${span}>cấp dưỡng</td><td${span}>${snack(d[0]) ? 'khay inox' : 'nồi inox'}</td><td${span}>bếp</td><td${span}></td><td${span}></td><td${span}></td>`) + '</tr>';
      });
      last = d[0];
    });
    return `<div class="blk wide"><table class="hd"><tr><td>${e(K0.unit)}<br>Người kiểm tra: ……………………<br>Thời gian kiểm tra: ngày … tháng … năm …<br>Địa điểm kiểm tra: bếp ${e(K0.unit)}</td>
        <td class="c"><h1>KIỂM TRA KHI CHẾ BIẾN THỨC ĂN (BƯỚC 2)</h1>Ngày ${dmy(iso)}</td><td class="r">Số: 1246/QĐ-BYT<br>Mẫu 2</td></tr></table>
      <table class="g"><tr><th rowspan="2">STT</th><th rowspan="2">Ca/bữa ăn (Bữa ăn, giờ ăn)</th><th rowspan="2">Tên món ăn</th><th rowspan="2">Nguyên liệu chính để chế biến (tên, số lượng…)</th><th rowspan="2">Số lượng/Số suất ăn</th><th rowspan="2">Thời gian sơ chế xong (ngày, giờ)</th><th rowspan="2">Thời gian chế biến xong (ngày, giờ)</th><th colspan="3">Kiểm tra điều kiện vệ sinh (từ thời điểm bắt đầu sơ chế, chế biến cho đến khi thức ăn được chế biến xong)</th><th colspan="2">Kiểm tra cảm quan (màu, mùi, vị, trạng thái, bảo quản…)</th><th rowspan="2">Biện pháp xử lý/Ghi chú</th></tr>
        <tr><th>Người tham gia chế biến</th><th>Trang thiết bị dụng cụ</th><th>Khu vực chế biến và phụ trợ</th><th>Đạt</th><th>Không đạt</th></tr>
        <tr class="idx">${Array.from({length:13}, (_, i) => `<td class="c">${i + 1}</td>`).join('')}</tr>
        ${rows || `<tr><td colspan="13" class="c">Chưa có món ăn cho ngày này.</td></tr>`}</table>
      ${noteLine('b2', iso)}<table class="sig"><tr><td></td><td><b>Người kiểm tra</b><br><i>(Do hiệu trưởng phân công)</i></td></tr></table></div>`;
  }

  /* ---- sheets 10 and 13: Bảng tổng hợp khẩu phần dinh dưỡng trong tuần ---- */
  function kp(grp, mon) {
    const days = Array.from({length:5}, (_, i) => addDays(mon, i)), have = new Set(known());
    const cs = days.map(d => have.has(d) ? KX.calc(d) : null), qf = grp === 'mg' ? 'qm' : 'qn';
    const por = cs.map(c => c ? c[grp] : 0), totP = por.reduce((s, v) => s + v, 0), items = [];
    cs.forEach((c, k) => c && c.mn.forEach(x => { if (!(x[qf] > 0)) return;
      let it = items.find(y => y.n === x.n); if (!it) items.push(it = {n:x.n, u:x.u, q:[0, 0, 0, 0, 0], a:0});
      it.q[k] = r2(it.q[k] + x[qf]); it.a += x[qf] * x.p; }));
    const spend = Math.round(items.reduce((s, x) => s + x.a, 0));
    const menu = cs.map((c, k) => c ? `<b>Thứ ${k + 2} ${dmy(days[k]).slice(0, 5)}</b><br>` + c.d.dishes.filter(d => d[0] !== 'Bữa sáng' && !(grp === 'mg' ? /NT/ : /MG/).test(d[0])).map(d => `${e(d[0])}: ${e(d[1])}`).join('<br>') : '').filter(Boolean).join('<br>');
    const rows = items.map((x, i) => { const tot = r2(x.q.reduce((s, v) => s + v, 0)), per = totP ? r2((KX.isW(x.u) ? tot * 1000 : tot) / totP) : 0;
      return `<tr><td class="c">${i + 1}</td><td class="nm">${e(x.n)}</td><td class="c">${e(x.u)}</td>${x.q.map(v => v ? num(v) : '<td></td>').join('')}${num(tot)}${num(per)}${blank(6)}${i ? '' : `<td class="menu" rowspan="${items.length}">${menu}</td>`}</tr>`; }).join('');
    return `<div class="blk wide kp"><table class="hd"><tr><td>Phòng GD &amp; ĐT: ……………<br>Đơn vị: ${e(K0.unit)}</td><td class="c"><h1>BẢNG TỔNG HỢP KHẨU PHẦN DINH DƯỠNG TRONG TUẦN</h1>
        Từ ngày: ${dmy(days[0])} &nbsp; Đến ngày: ${dmy(days[4])}<br>Nhóm trẻ: ${grp === 'mg' ? 'Trẻ 37 - 72 tháng tuổi' : 'Trẻ 24 - 36 tháng tuổi'}</td></tr></table>
      <table class="g"><tr><th rowspan="3">STT</th><th rowspan="3">Tên thực phẩm</th><th rowspan="3">ĐVT</th>${days.map((_, k) => `<th>Thứ ${k + 2}</th>`).join('')}<th rowspan="2">Cộng (kg)</th><th rowspan="3">BQ 1 suất (g/ngày)</th><th colspan="2">Đạm</th><th colspan="2">Béo</th><th rowspan="2">Đường</th><th rowspan="2">Calo (Kcal)</th><th rowspan="3">Tên thực đơn</th></tr>
        <tr>${days.map(d => `<th>${dmy(d).slice(0, 5)}</th>`).join('')}<th>Động vật</th><th>Thực vật</th><th>Động vật</th><th>Thực vật</th></tr>
        <tr>${por.map(p => `<th>${p || ''}</th>`).join('')}<th>${totP}</th><th colspan="6" class="note">Số suất mỗi ngày ↑ · dinh dưỡng: chưa nối</th></tr>
        ${rows || `<tr><td colspan="17" class="c">Chưa có số liệu trong tuần này.</td></tr>`}
        <tr class="sec"><td colspan="3">Tổng số tiền chi trong tuần:</td><td colspan="5" class="n">${spend.toLocaleString('vi-VN')} đ</td><td colspan="9"></td></tr>
        <tr class="sec"><td colspan="3">Bình quân 1 suất:</td><td colspan="5" class="n">${(totP ? Math.round(spend / totP) : 0).toLocaleString('vi-VN')} đ</td><td colspan="9"></td></tr></table>
      ${noteLine(grp, mon)}${sign(['Người lập bảng', 'Phó hiệu trưởng'])}</div>`;
  }

  /* ---- ranges, page and file ---- */
  function blocks(kind, iso, range) {
    const m = iso.slice(0, 7), ds = range === 'month' ? known().filter(d => d.slice(0, 7) === m) : [iso];
    if (kind === 'tp' || kind === 'b2') return ds.map(kind === 'tp' ? tp : b2);
    const ws = [...new Set((range === 'month' ? ds : [iso]).map(monday))];
    return ws.map(w => kp(kind, w));
  }
  const NAMES = {tp:'phieu-tiep-nhan', b2:'buoc-2', mg:'khau-phan-mau-giao', nt:'khau-phan-nha-tre'};
  const PM = 10, BM = 12; // mm: the printer page margin and the body margin; the preview paper uses both, so lines wrap exactly as printed
  const land = kind => kind !== 'tp', paper = kind => land(kind) ? [297, 210] : [210, 297];
  const CSS = `body{font-family:'Times New Roman',serif;font-size:12pt;color:#000;margin:${BM}mm}h1{font-size:13pt;margin:4px 0;text-align:center}p{margin:3px 0}
    table{border-collapse:collapse;width:100%}.g td,.g th{border:1px solid #000;padding:3px 5px;vertical-align:top}.g th{font-weight:bold;text-align:center;font-size:11pt}
    .c{text-align:center}.r{text-align:right}.n{text-align:right}.sec td{font-weight:bold}.idx td{font-style:italic}.hd td{vertical-align:top;padding:2px 4px}
    .sig{margin-top:14px}.sig td{text-align:center;vertical-align:top;padding-bottom:50px}.dots{letter-spacing:1px}.menu{font-size:10pt;min-width:180px}.nm{min-width:150px}.note{font-weight:normal;font-style:italic;font-size:9pt}
    .wide{font-size:11pt}.kp{zoom:.88}.blk{page-break-after:always}.blk:last-child{page-break-after:auto}`;
  const page = (kind, bl) => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><title>${NAMES[kind]}</title>
    <style>${CSS}@page{size:A4 ${land(kind) ? 'landscape' : 'portrait'};margin:${PM}mm}</style></head><body>${bl.join('')}</body></html>`;
  /* the on-screen form (v0.4.16): the very same tables and layout as the printed sheet, drawn in the app's own dark look so it sits with the rest
     of the screen. Only "Print preview" (paper = true), Print and Excel give the white A4 page, so what prints is what the spreadsheet shows. */
  const SCREEN = `html{background:transparent}body{margin:0!important;padding:2px 0;color:#EDEFF3;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;line-height:1.45}
    .pg{box-sizing:border-box;margin:0 0 14px;padding:14px 16px;border:1px solid rgba(237,239,243,.09);border-radius:12px;background:rgba(255,255,255,.03);overflow-x:auto}
    .blk{page-break-after:auto!important}h1{font-size:14px;letter-spacing:.2px}.wide{font-size:12px}.g td,.g th{border:1px solid rgba(237,239,243,.28)!important}
    .g th{background:rgba(255,255,255,.06);font-size:12px}.sec td{background:rgba(255,255,255,.04)}.menu{font-size:11px}.note{color:#8A93A6}.dots{color:#8A93A6}.sig td{padding-bottom:30px}
    @media print{html,body{background:#fff!important;color:#000!important}.pg{border:0;background:none;padding:0}.g td,.g th{border-color:#000!important}.g th,.sec td{background:none}.note,.dots{color:#000}}`;
  function preview(kind, iso, range, paperMode) {
    if (!paperMode) return page(kind, blocks(kind, iso, range).map(b => `<div class="pg">${b}</div>`)).replace('</style>', SCREEN + '</style>');
    const [W] = paper(kind), H = paper(kind)[1], css = `html{background:#c9ccd3}body{margin:0!important;padding:12px 0}.pg{box-sizing:border-box;width:${W}mm;min-height:${H}mm;padding:${PM + BM}mm;margin:0 auto 14px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35)}.blk{page-break-after:auto!important}`;
    return page(kind, blocks(kind, iso, range).map(b => `<div class="pg">${b}</div>`)).replace('</style>', css + '</style>');
  }
  function print(kind, iso, range) {
    const w = window.open('', '_blank'); if (!w) return toast(L('Allow pop-ups to print', 'Hãy cho phép cửa sổ bật lên để in'), 3000);
    w.document.open(); w.document.write(page(kind, blocks(kind, iso, range))); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }
  function excel(kind, iso, range) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + page(kind, blocks(kind, iso, range))], {type:'application/vnd.ms-excel;charset=utf-8'}));
    a.download = NAMES[kind] + '-' + (range === 'month' ? iso.slice(0, 7) : iso) + '.xls'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  KX.sheets = {print, excel, blocks, getNote, setNote, preview, paper, page:(kind, iso, range) => page(kind, blocks(kind, iso, range))};
})();

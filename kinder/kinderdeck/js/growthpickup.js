/* KinderDeck Health and Growth, and Pickup cards (v0.9.0). They take the places of the demo Health and Growth widget and
   the QR Code Generator placeholder.

   Health and Growth: height and weight on measurement day, typed per child (state.growth.days[date][childId] = {h, w}),
   with the last measurement beside it. "Send" publishes the day to each family in TinyParentDeck (suite backend v2.28.0,
   kinderPublishGrowth, the school's AdminDeck key from Classes for teachers). Numbers only: no nutrition label or
   percentile is worked out here or sent. Only children of classes published to teachers can be sent.

   Pickup cards: every child of a published class gets a pickup code from the backend (kinderPickupCodes). The office
   prints one card per child (the QR code and the code), the family also has it in TinyParentDeck, and the teacher checks
   it at the gate in TinyTeachersDeck's Attendance. "New code" replaces a lost card's code. Codes are kept here
   (state.pickup.codes) for printing. QR codes are drawn by js/qrcode-lib.js (MIT, a copy of TinyTeachersDeck's). */
(() => {
  const BASE = 'https://backend.demo.invalid';
  const key = () => (state.tsync && state.tsync.key) || '';
  const pad = n => String(n).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dmy = iso => iso ? iso.split('-').reverse().join('/') : '';
  async function post(fn, body) {
    const r = await fetch(`${BASE}/${fn}`, {method:'POST', headers:{'Content-Type':'application/json', 'X-Admin-Secret':key()}, body:JSON.stringify(body)});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 ? L('The school key was refused.', 'Mã trường không đúng.') : (j.errors && j.errors[0] ? `${j.errors[0].field}: ${j.errors[0].code}` : j.error || ('HTTP ' + r.status)));
    return j;
  }
  /* Children of classes already published to teachers, with their class name. */
  function published() {
    const T = state.tsync || {classes:[], last:{}}, cls = {};
    (T.classes || []).filter(c => (T.last || {})[c.key]).forEach(c => c.sids.forEach(s => { cls[s] = c.name; }));
    return KF.allStudents().filter(s => cls[s.sid]).map(s => ({sid:s.sid, n:s.n, cls:cls[s.sid]})).sort((a, b) => a.n.localeCompare(b.n, 'vi'));
  }
  const needKey = () => `<p class="empty">${L('Save the school key and publish a class in Classes for teachers first.', 'Hãy lưu mã trường và gửi lớp trong Lớp cho giáo viên trước.')}</p>`;

  /* ======================= Health and Growth ======================= */
  const G = () => state.growth || (state.growth = {days:{}, sent:{}});
  let gDate = todayISO(), gBusy = false, gMsg = '';
  const lastBefore = (sid, date) => { const ds = Object.keys(G().days).filter(d => d < date && G().days[d][sid]).sort(); const d = ds[ds.length - 1]; return d ? {d, ...G().days[d][sid]} : null; };
  const health = {
    html() {
      const kids = published(), day = G().days[gDate] || {}, sent = G().sent[gDate];
      if (!key() || !kids.length) return `<p class="hint">${L('Height and weight on measurement day, sent to each family in TinyParentDeck. Numbers only: no nutrition label.', 'Chiều cao, cân nặng ngày cân đo, gửi cho từng gia đình trong TinyParentDeck. Chỉ có số đo: không xếp loại dinh dưỡng.')}</p>` + needKey();
      const num = (sid, f, v, step, ph) => `<input type="number" inputmode="decimal" step="${step}" min="0" data-gr="${sid}:${f}" value="${v == null ? '' : v}" placeholder="${ph}" style="width:84px">`;
      return `<div class="btn-row" style="align-items:center;gap:8px"><label>${L('Measurement day', 'Ngày cân đo')} <input type="date" id="gr-date" value="${gDate}" max="${todayISO()}"></label></div>
        <div class="kx-scroll" style="margin-top:8px;max-height:340px"><table class="kd-table"><tr><th>${L('Child', 'Bé')}</th><th>${L('Height (cm)', 'Chiều cao (cm)')}</th><th>${L('Weight (kg)', 'Cân nặng (kg)')}</th><th>${L('Last time', 'Lần trước')}</th></tr>
          ${kids.map(c => { const m = day[c.sid] || {}, p = lastBefore(c.sid, gDate);
            return `<tr><td>${esc(c.n)}<br><span class="muted">${esc(c.cls)}</span></td><td>${num(c.sid, 'h', m.h, '0.1', 'cm')}</td><td>${num(c.sid, 'w', m.w, '0.1', 'kg')}</td><td class="muted">${p ? `${p.h != null ? p.h + ' cm' : ''}${p.h != null && p.w != null ? ' · ' : ''}${p.w != null ? p.w + ' kg' : ''}<br>${dmy(p.d)}` : '–'}</td></tr>`; }).join('')}</table></div>
        <p class="hint">${L('Numbers only: families see the measurements and the change since last time, never a nutrition label.', 'Chỉ có số đo: phụ huynh thấy số đo và thay đổi so với lần trước, không có xếp loại dinh dưỡng.')}</p>
        <div class="btn-row"><button class="wbtn primary" id="gr-send" ${gBusy ? 'disabled' : ''}>${gBusy ? L('Sending…', 'Đang gửi…') : '📤 ' + L(`Send ${dmy(gDate)} to families`, `Gửi số đo ngày ${dmy(gDate)} cho phụ huynh`)}</button>
          ${sent ? `<button class="wbtn" id="gr-remove" ${gBusy ? 'disabled' : ''}>${L('Take this day back', 'Gỡ ngày này khỏi phụ huynh')}</button>` : ''}</div>
        ${sent ? `<p class="hint">${L('Sent', 'Đã gửi')} ${esc(new Date(sent.at).toLocaleString(state.lang === 'vi' ? 'vi-VN' : 'en-GB'))}: ${sent.written} ${L('children', 'bé')}</p>` : ''}
        ${gMsg ? `<p class="hint">${esc(gMsg)}</p>` : ''}`;
    },
    wire(b, rp) {
      const dt = b.querySelector('#gr-date'); if (dt) dt.onchange = () => { if (dt.value) { gDate = dt.value; gMsg = ''; rp(); } };
      b.querySelectorAll('[data-gr]').forEach(x => x.onchange = () => {
        const [sid, f] = x.dataset.gr.split(':'), v = x.value === '' ? null : Math.round(+x.value * 10) / 10;
        const day = G().days[gDate] || (G().days[gDate] = {}), m = day[sid] || (day[sid] = {});
        if (v == null || !isFinite(v) || v <= 0) delete m[f]; else m[f] = v;
        if (m.h == null && m.w == null) delete day[sid];
        if (!Object.keys(day).length) delete G().days[gDate];
        saveState(); rp();
      });
      const send = b.querySelector('#gr-send');
      if (send) send.onclick = async () => {
        const day = G().days[gDate] || {}, kids = published().filter(c => day[c.sid]).map(c => ({childId:c.sid, ...(day[c.sid].h != null ? {heightCm:day[c.sid].h} : {}), ...(day[c.sid].w != null ? {weightKg:day[c.sid].w} : {})}));
        if (!kids.length) { gMsg = L('Type some measurements first.', 'Hãy nhập số đo trước.'); return rp(); }
        gBusy = true; gMsg = ''; rp();
        try { const r = await post('kinderPublishGrowth', {date:gDate, children:kids}); G().sent[gDate] = {at:Date.now(), written:r.written};
          gMsg = L(`Sent for ${r.written} children.`, `Đã gửi số đo của ${r.written} bé.`) + (r.skipped ? ' ' + L(`${r.skipped} were left out (a number out of range or not in a published class).`, `${r.skipped} bé không gửi được (số đo không hợp lý hoặc chưa thuộc lớp đã gửi).`) : '');
        } catch (e) { gMsg = e.message || String(e); }
        gBusy = false; saveState(); rp();
      };
      const rm = b.querySelector('#gr-remove');
      if (rm) rm.onclick = async () => {
        if (!confirm(L('Take this measurement day back from the families?', 'Gỡ số đo ngày này khỏi phụ huynh?'))) return;
        gBusy = true; rp();
        try { await post('kinderPublishGrowth', {remove:gDate}); delete G().sent[gDate]; gMsg = L('Taken back.', 'Đã gỡ.'); } catch (e) { gMsg = e.message || String(e); }
        gBusy = false; saveState(); rp();
      };
    } };

  /* ======================= Pickup cards ======================= */
  const P = () => state.pickup || (state.pickup = {codes:{}, at:0});
  let pBusy = false, pMsg = '';
  const payload = code => 'TDPICKUP:' + code;
  const qrSvg = (text, cell) => { if (typeof qrcode !== 'function') return ''; const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag(cell || 4, 2); };
  async function fetchCodes(rotate) {
    pBusy = true; pMsg = '';
    try { const r = await post('kinderPickupCodes', rotate ? {rotate:[rotate]} : {}); const codes = {}; (r.codes || []).forEach(c => { codes[c.childId] = c.code; }); P().codes = codes; P().at = Date.now();
      pMsg = rotate ? L('New code made. Print a new card; the old one no longer works.', 'Đã tạo mã mới. Hãy in thẻ mới; thẻ cũ không còn dùng được.') : L(`${(r.codes || []).length} codes ready (${r.created} new).`, `Đã có ${(r.codes || []).length} mã (${r.created} mã mới).`);
    } catch (e) { pMsg = e.message || String(e); }
    pBusy = false; saveState();
  }
  function printCards(kids) {
    const cards = kids.filter(c => P().codes[c.sid]).map(c => `<div class="card"><div class="qr">${qrSvg(payload(P().codes[c.sid]), 5)}</div><div class="t"><b>${esc(c.n)}</b><span>${esc(c.cls)}</span><code>${esc(P().codes[c.sid])}</code><small>${L('Show this card to the teacher at pickup.', 'Đưa thẻ này cho cô khi đón bé.')}</small></div></div>`).join('');
    if (!cards) return;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${L('Pickup cards', 'Thẻ đón trẻ')}</title><style>
      @page{size:A4;margin:10mm} body{font-family:'Segoe UI',Arial,sans-serif;margin:0} .grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
      .card{border:1px dashed #888;border-radius:4mm;padding:4mm;display:flex;gap:4mm;align-items:center;break-inside:avoid}
      .qr svg{width:34mm;height:34mm} .t{display:grid;gap:1.5mm} .t b{font-size:13pt} .t code{font-size:14pt;letter-spacing:1.5px} .t small{color:#555;font-size:8.5pt}
    </style></head><body><div class="grid">${cards}</div></body></html>`;
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
    f.srcdoc = doc; f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => f.remove(), 60000); };
  }
  const pickup = {
    html() {
      const kids = published(), have = kids.filter(c => P().codes[c.sid]).length;
      if (!key() || !kids.length) return `<p class="hint">${L('A pickup card per child: the family shows it (or the same code in TinyParentDeck) and the teacher checks it at the gate.', 'Thẻ đón trẻ cho từng bé: phụ huynh đưa thẻ (hoặc mã trong TinyParentDeck) và cô kiểm tra khi trả trẻ.')}</p>` + needKey();
      return `<p class="hint">${L('Each child gets a code. The family shows the card, or the same QR code in TinyParentDeck, and the teacher checks it in Attendance.', 'Mỗi bé có một mã. Phụ huynh đưa thẻ, hoặc mã QR giống vậy trong TinyParentDeck, và cô kiểm tra trong Điểm danh.')}</p>
        <div class="btn-row"><button class="wbtn primary" id="pk-get" ${pBusy ? 'disabled' : ''}>${pBusy ? L('Working…', 'Đang xử lý…') : '🔑 ' + (have ? L('Update the codes', 'Cập nhật mã') : L('Make the codes', 'Tạo mã đón'))}</button>
          <button class="wbtn" id="pk-print" ${have ? '' : 'disabled'}>🖨️ ${L('Print the cards', 'In thẻ')}</button></div>
        ${pMsg ? `<p class="hint">${esc(pMsg)}</p>` : ''}
        <div class="kx-scroll" style="margin-top:8px;max-height:320px"><table class="kd-table"><tr><th>${L('Child', 'Bé')}</th><th>${L('Code', 'Mã')}</th><th></th></tr>
          ${kids.map(c => `<tr><td>${esc(c.n)}<br><span class="muted">${esc(c.cls)}</span></td><td><code>${esc(P().codes[c.sid] || '–')}</code></td><td>${P().codes[c.sid] ? `<button class="wbtn sm" data-pk-new="${c.sid}">${L('New code', 'Đổi mã')}</button>` : ''}</td></tr>`).join('')}</table></div>`;
    },
    wire(b, rp) {
      const g = b.querySelector('#pk-get'); if (g) g.onclick = async () => { pBusy = true; rp(); await fetchCodes(); rp(); };
      const pr = b.querySelector('#pk-print'); if (pr) pr.onclick = () => printCards(published());
      b.querySelectorAll('[data-pk-new]').forEach(x => x.onclick = async () => { if (!confirm(L('Make a new code for this child? The old card stops working.', 'Tạo mã mới cho bé này? Thẻ cũ sẽ không dùng được nữa.'))) return; pBusy = true; rp(); await fetchCodes(x.dataset.pkNew); rp(); });
    } };

  const h = WIDGETS.find(w => w.id === 'health');
  if (h) Object.assign(h, health, {w:560, h:560});
  const q = WIDGETS.find(w => w.id === 'qr');
  if (q) { Object.assign(q, pickup, {em:'🎫', en:'Pickup cards', vi:'Thẻ đón trẻ', w:480, h:520}); delete q.soon; }
})();

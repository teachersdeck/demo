/* KinderDeck Fees for families (v0.8.0): fees due, shown to each family in TinyParentDeck, only if the school wants it.
   Off by default (state.feesDue.on). When on, the office keeps a monthly amount per age group (tuition and meals), can
   change it for one child, and sees what each child has paid this month (the Fees receipts typed in Accounting for that
   child's name; it can be changed here). "Send" publishes the month to the suite backend v2.27.0 (kinderPublishFees,
   the school's AdminDeck key from Classes for teachers): each family sees only their own child's lines, what was paid,
   what is left, the due date and how to pay. Teachers never see fees. Turning it off removes every month already sent.
   Only children in a class already published to teachers can be sent (the backend knows them by KinderDeck's child id). */
(() => {
  const BASE = 'https://backend.demo.invalid';
  const F = () => state.feesDue || (state.feesDue = {on:false, rates:{}, child:{}, paid:{}, dueDay:10, howToPay:'', sent:{}});
  const key = () => (state.tsync && state.tsync.key) || '';
  const pad = n => String(n).padStart(2, '0');
  const thisMonth = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
  const vnd = n => (Math.round(+n || 0)).toLocaleString('vi-VN') + ' ₫';
  let month = thisMonth(), busy = false, msg = '';

  async function post(fn, body) {
    const r = await fetch(`${BASE}/${fn}`, {method:'POST', headers:{'Content-Type':'application/json', 'X-Admin-Secret':key()}, body:JSON.stringify(body)});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 ? L('The school key was refused.', 'Mã trường không đúng.') : (j.errors && j.errors[0] ? `${j.errors[0].field}: ${j.errors[0].code}` : j.error || ('HTTP ' + r.status)));
    return j;
  }
  /* The children of classes already published to teachers, with their age group. */
  function children() {
    const T = state.tsync || {classes:[], last:{}}, sids = new Set();
    (T.classes || []).filter(c => (T.last || {})[c.key]).forEach(c => c.sids.forEach(s => sids.add(s)));
    return KF.allStudents().filter(s => sids.has(s.sid)).map(s => ({sid:s.sid, n:s.n, g:KF.group(KF.ageM(s.dob)) || L('No age group', 'Chưa có nhóm tuổi')}))
      .sort((a, b) => a.n.localeCompare(b.n, 'vi'));
  }
  /* What a child owes this month: the age group's amounts unless changed for the child. */
  function lines(c) {
    const f = F(), r = f.rates[c.g] || {}, o = f.child[c.sid] || {};
    const tu = o.tuition != null ? o.tuition : (r.tuition || 0), me = o.meals != null ? o.meals : (r.meals || 0);
    return [[L('Tuition', 'Học phí'), tu], [L('Meals', 'Tiền ăn'), me]].filter(x => +x[1] > 0);
  }
  /* Paid this month: Accounting's fee receipts for this child's name, unless typed here. */
  function paidOf(c) {
    const typed = ((F().paid || {})[month] || {})[c.sid];
    if (typed != null) return {amt:+typed, typed:true};
    const name = fold(c.n), ents = (window.CF && CF.ents ? CF.ents() : []).filter(e => e.kind === 'fee' && (e.date || '').slice(0, 7) === month && fold(e.who) === name);
    return {amt:ents.reduce((s, e) => s + (+e.amt || 0), 0), typed:false};
  }

  const W = { id:'feesdue', em:'💳', icon:'coins', en:'Fees for families', vi:'Học phí gửi phụ huynh', w:620, h:620,
    html() {
      const f = F(), kids = children(), groups = [...new Set(kids.map(c => c.g))], sent = f.sent[month];
      const head = `<label class="tc-photos"><input type="checkbox" id="fd-on" ${f.on ? 'checked' : ''}> 💳 ${L('Show each family the fees due in TinyParentDeck', 'Cho phụ huynh xem học phí cần đóng trong TinyParentDeck')}</label>
        <p class="hint">${f.on ? L('On. Each family sees only their own child; teachers never see fees.', 'Đang bật. Mỗi gia đình chỉ thấy học phí của con mình; giáo viên không bao giờ thấy học phí.') : L('Off: no fees leave KinderDeck.', 'Đang tắt: không có thông tin học phí nào rời KinderDeck.')}</p>`;
      if (!f.on) return head;
      if (!key()) return head + `<p class="empty">${L('Save the school key in Classes for teachers first.', 'Hãy lưu mã trường trong Lớp cho giáo viên trước.')}</p>`;
      if (!kids.length) return head + `<p class="empty">${L('Publish a class in Classes for teachers first: fees go to the children of published classes.', 'Hãy gửi lớp trong Lớp cho giáo viên trước: học phí gửi cho các bé thuộc lớp đã gửi.')}</p>`;
      const num = (id, v, ph) => `<input type="number" min="0" step="1000" data-fd="${id}" value="${v == null || v === '' ? '' : v}" placeholder="${ph || ''}" style="width:110px">`;
      const rows = kids.map(c => { const o = f.child[c.sid] || {}, r = f.rates[c.g] || {}, ls = lines(c), tot = ls.reduce((s, x) => s + +x[1], 0), p = paidOf(c), bal = Math.max(0, tot - p.amt);
        return `<tr><td>${esc(c.n)}<br><span class="muted">${esc(c.g)}</span></td><td>${num('c:' + c.sid + ':tuition', o.tuition, r.tuition || 0)}</td><td>${num('c:' + c.sid + ':meals', o.meals, r.meals || 0)}</td>
          <td>${num('p:' + c.sid, p.typed ? p.amt : '', p.amt || 0)}</td><td style="text-align:right"><b>${vnd(bal)}</b><br><span class="muted">${bal === 0 && tot ? L('Paid', 'Đã đóng') : p.amt ? L('Part paid', 'Đóng một phần') : L('Due', 'Chưa đóng')}</span></td></tr>`; }).join('');
      return head + `
        <div class="btn-row" style="align-items:center;flex-wrap:wrap;gap:8px"><label>${L('Month', 'Tháng')} <input type="month" id="fd-month" value="${month}"></label>
          <label>${L('Due by day', 'Hạn đóng ngày')} <input type="number" id="fd-day" min="1" max="28" value="${f.dueDay || 10}" style="width:60px"></label></div>
        <label class="kx-rate" style="display:block;margin:8px 0">${L('How to pay (shown to families)', 'Cách đóng (phụ huynh sẽ thấy)')}<textarea id="fd-how" rows="2" maxlength="500" placeholder="${L('e.g. bank transfer to … with the child’s name, or cash at the office', 'ví dụ: chuyển khoản vào STK … ghi tên bé, hoặc nộp tiền mặt tại văn phòng')}">${esc(f.howToPay || '')}</textarea></label>
        <p class="hint">${L('Monthly amounts per age group (VND); change one child in the table.', 'Số tiền mỗi tháng theo nhóm tuổi (đồng); sửa riêng từng bé trong bảng.')}</p>
        <div class="kx-scroll"><table class="kd-table"><tr><th>${L('Age group', 'Nhóm tuổi')}</th><th>${L('Tuition', 'Học phí')}</th><th>${L('Meals', 'Tiền ăn')}</th></tr>
          ${groups.map(g => `<tr><td>${esc(g)}</td><td>${num('r:' + g + ':tuition', (f.rates[g] || {}).tuition)}</td><td>${num('r:' + g + ':meals', (f.rates[g] || {}).meals)}</td></tr>`).join('')}</table></div>
        <div class="kx-scroll" style="margin-top:8px;max-height:300px"><table class="kd-table"><tr><th>${L('Child', 'Bé')}</th><th>${L('Tuition', 'Học phí')}</th><th>${L('Meals', 'Tiền ăn')}</th><th>${L('Paid', 'Đã đóng')}</th><th>${L('Left to pay', 'Còn lại')}</th></tr>${rows}</table></div>
        <p class="hint">${L('“Paid” comes from the Fees receipts in Accounting typed with the child’s name this month; type an amount to change it.', '“Đã đóng” lấy từ các khoản thu học phí trong Kế toán ghi tên bé trong tháng; gõ số tiền để sửa.')}</p>
        <div class="btn-row"><button class="wbtn primary" id="fd-send" ${busy ? 'disabled' : ''}>${busy ? L('Sending…', 'Đang gửi…') : '📤 ' + L(`Send ${month.slice(5)}/${month.slice(0, 4)} to families`, `Gửi học phí ${month.slice(5)}/${month.slice(0, 4)} cho phụ huynh`)}</button></div>
        ${sent ? `<p class="hint">${L('Last sent', 'Gửi lần cuối')} ${esc(new Date(sent.at).toLocaleString(state.lang === 'vi' ? 'vi-VN' : 'en-GB'))}: ${sent.written} ${L('families', 'gia đình')}</p>` : ''}
        ${msg ? `<p class="hint">${esc(msg)}</p>` : ''}`;
    },
    wire(b, rp) {
      const f = F(), save = () => saveState();
      b.querySelector('#fd-on').onchange = async e => {
        if (e.target.checked) {
          if (!confirm(L('Show fees due to families? Each family sees only their own child’s fees in TinyParentDeck.', 'Cho phụ huynh xem học phí? Mỗi gia đình chỉ thấy học phí của con mình trong TinyParentDeck.'))) { e.target.checked = false; return; }
          f.on = true; msg = ''; save(); return rp();
        }
        const any = Object.keys(f.sent || {}).length;
        if (any && !confirm(L('Stop showing fees? Every month already sent is removed from TinyParentDeck.', 'Ngừng hiển thị học phí? Mọi tháng đã gửi sẽ được gỡ khỏi TinyParentDeck.'))) { e.target.checked = true; return; }
        f.on = false; save();
        if (any && key()) { try { const r = await post('kinderPublishFees', {clear:'all'}); f.sent = {}; msg = L(`Removed from families (${r.cleared}).`, `Đã gỡ khỏi phụ huynh (${r.cleared}).`); } catch (err) { f.on = true; msg = err.message || String(err); } save(); }
        rp();
      };
      if (!f.on) return;
      const mo = b.querySelector('#fd-month'); if (mo) mo.onchange = () => { if (/^\d{4}-\d{2}$/.test(mo.value)) { month = mo.value; msg = ''; rp(); } };
      const dd = b.querySelector('#fd-day'); if (dd) dd.onchange = () => { f.dueDay = Math.min(28, Math.max(1, +dd.value || 10)); save(); };
      const hw = b.querySelector('#fd-how'); if (hw) hw.onchange = () => { f.howToPay = hw.value.trim().slice(0, 500); save(); };
      b.querySelectorAll('[data-fd]').forEach(x => x.onchange = () => {
        const [k, a, c] = x.dataset.fd.split(':'), v = x.value === '' ? null : Math.max(0, Math.round(+x.value || 0));
        if (k === 'r') { (f.rates[a] || (f.rates[a] = {}))[c] = v || 0; }
        else if (k === 'c') { const o = f.child[a] || (f.child[a] = {}); if (v == null) delete o[c]; else o[c] = v; }
        else if (k === 'p') { const p = f.paid[month] || (f.paid[month] = {}); if (v == null) delete p[a]; else p[a] = v; }
        save(); rp();
      });
      const send = b.querySelector('#fd-send');
      if (send) send.onclick = async () => {
        const kids = children().map(c => ({childId:c.sid, items:lines(c).map(([label, amount]) => ({label, amount:+amount})), paid:paidOf(c).amt})).filter(k => k.items.length);
        if (!kids.length) { msg = L('No amounts yet: fill in the age groups first.', 'Chưa có số tiền: hãy điền theo nhóm tuổi trước.'); return rp(); }
        busy = true; msg = ''; rp();
        try {
          const r = await post('kinderPublishFees', {month, dueDate:`${month}-${pad(f.dueDay || 10)}`, howToPay:f.howToPay || '', children:kids});
          f.sent[month] = {at:Date.now(), written:r.written};
          msg = L(`Sent to ${r.written} families.`, `Đã gửi cho ${r.written} gia đình.`) + (r.skipped ? ' ' + L(`${r.skipped} child(ren) are not in a published class yet.`, `${r.skipped} bé chưa thuộc lớp nào đã gửi.`) : '');
        } catch (err) { msg = err.message || String(err); }
        busy = false; save(); rp();
      };
    } };
  const at = WIDGETS.findIndex(w => w.id === 'tclasses');
  WIDGETS.splice(at < 0 ? WIDGETS.length : at + 1, 0, W);
})();

/* KinderDeck widgets. Each: {id, em, icon, en, vi, w, h, full?, soon?, deact?, html(), wire?(body, repaint)} */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L = (en, vi) => state.lang === 'vi' ? vi : en;
/* v0.6.0: the school calendar (holiday presets + the school's own events) and dated notices, shared with js/teachers.js */
const schoolEvents = () => KD.holidays.map(h => ({id:'h' + h[0], date:h[0], time:'', title:L(h[1], h[2])})).concat((state.events || []).map(e => Object.assign({own:true}, e)))
  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
const noteOf = n => typeof n === 'string' ? {text:n, date:''} : {text:n.text || '', date:n.date || ''};
const vnd = n => Number(n || 0).toLocaleString('vi-VN') + ' ₫';
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
const inLoc = l => state.loc === 'all' || state.loc === l;
const cls = () => KD.classes.filter(c => inLoc(c.l));
/* v0.4.25: enrolled comes from the Student Roster (plus the demo classes while demo data is on). v0.4.30: no capacity figure any more. */
const enrolledAt = id => (state.students || []).filter(s => s.loc === id).length + (demoOn() ? sum(KD.classes.filter(c => c.l === id), 'e') : 0);
const enrIn = () => (state.students || []).filter(s => inLoc(s.loc)).length + (demoOn() ? sum(cls(), 'e') : 0);
const ageBars = () => { const ss = (state.students || []).filter(s => inLoc(s.loc)), g = {};  // the roster by age group
  ss.forEach(s => { const m = window.KF ? KF.ageM(s.dob) : null, k = (window.KF && KF.group(m)) || L('Other', 'Khác'); (g[k] = g[k] || {k, n:0, m:m == null ? 999 : m}).n++; g[k].m = Math.min(g[k].m, m == null ? 999 : m); });
  return Object.values(g).sort((a, b) => a.m - b.m).map(x => bar(x.k, x.n, ss.length ? x.n / ss.length * 100 : 0, '')).join(''); };
const kids = () => KD.kids.filter(k => inLoc(k.l));
const sum = (a, f) => a.reduce((s, x) => s + (typeof f === 'function' ? f(x) : x[f]), 0);
const locName = id => { const l = KD.locs.find(x => x.id === id); return l ? l[state.lang] : id; };
const tiles = a => `<div class="tiles">${a.map(([v, l]) => `<div class="tile"><b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
const bar = (lbl, val, pct, c) => `<div class="bar"><div class="barlbl"><span>${esc(lbl)}</span><span>${esc(val)}</span></div><div class="track"><div class="fill ${c || ''}" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div></div>`;
const pc = p => p >= 90 ? 'good' : p >= 75 ? '' : 'bad';
const table = (head, rows) => `<table class="kd-table"><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="muted">${L('Nothing here yet.', 'Chưa có gì.')}</td></tr>`}</table>`;
const daysTo = d => Math.round((new Date(d + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5);
const soonHtml = () => `<p class="empty">${L('Planned for a later phase.', 'Sẽ có ở giai đoạn sau.')}</p>`;
let rosterQ = '', calM = new Date(), calSel = null;
calM.setDate(1);

let libTab = 'lib', libCls = 'all', libQ = '', libSt = '';
let libSel = null; const docPrev = {};
const DOC_CLS = [['enrol','Enrolment form','Đơn nhập học'],['fee','Fee receipt','Biên lai học phí'],['health','Health record','Hồ sơ sức khỏe'],['licence','Licence or certificate','Giấy phép, chứng nhận'],['invoice','Supplier invoice','Hóa đơn nhà cung cấp'],['notice','Parent notice','Thông báo phụ huynh'],['other','Other','Khác']];
const DOC_ST = [['new','New','Mới','warn'],['review','Needs review','Cần xem lại','warn'],['approved','Approved','Đã duyệt','good'],['rejected','Rejected','Từ chối','bad']];
const clsName = k => { const c = DOC_CLS.find(x => x[0] === k) || DOC_CLS[6]; return L(c[1], c[2]); };
const stOf = k => DOC_ST.find(x => x[0] === k) || DOC_ST[0];
const stBadge = k => { const t = stOf(k); return `<span class="badge ${t[3]}">${esc(L(t[1], t[2]))}</span>`; };
const isoDay = o => { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); };
const newDoc = (name, over) => Object.assign({id:'d' + Date.now() + Math.random().toString(36).slice(2, 6), name, cls:'other', loc:state.loc === 'all' ? KD.locs[0].id : state.loc, who:'', date:isoDay(0), amount:0, expiry:'', status:'new', notes:''}, over || {});
const docs = () => { if (state.docs.some(d => typeof d === 'string')) { state.docs = state.docs.map(d => typeof d === 'string' ? newDoc(d) : d); saveState(); } return state.docs; };
const docsIn = () => docs().filter(d => inLoc(d.loc) && (demoOn() || !isSample(d)));
const toReview = () => docsIn().filter(d => d.status === 'new' || d.status === 'review').length;
const allLicences = () => KD.licences.concat(docs().filter(d => (demoOn() || !isSample(d)) && d.cls === 'licence' && d.status === 'approved' && d.expiry).map(d => [d.who || d.name, d.who || d.name, d.loc, d.expiry]));
const sampleDocs = () => { const a = KD.locs[0].id, b = KD.locs[1].id, k = KD.kids; return [
  ['Enrolment-' + k[0].n + '.pdf','enrol',a,k[0].n,-40,0,0,'approved'], ['Enrolment-' + k[5].n + '.pdf','enrol',b,k[5].n,-35,0,0,'approved'],
  ['Receipt-Oct-' + k[0].n + '.jpg','fee',a,k[0].n,-12,k[0].fee,0,'approved'], ['Receipt-Oct-' + k[4].n + '.jpg','fee',b,k[4].n,-10,k[4].fee,0,'approved'],
  ['Receipt-Oct-' + k[2].n + '.jpg','fee',a,k[2].n,-9,k[2].fee,0,'review'], ['Vaccination-' + k[2].n + '.pdf','health',a,k[2].n,-20,0,0,'approved'],
  ['Allergy-note-' + k[8].n + '.jpg','health',b,k[8].n,-5,0,0,'new'], ['Fire-safety-record.pdf','licence',a,'Fire-safety record',-300,0,136,'approved'],
  ['Food-safety-cert.pdf','licence',b,'Food-safety certificate',-330,0,41,'review'], ['Invoice-produce.pdf','invoice',a,'Rau sạch Củ Chi',-15,5800000,0,'approved'],
  ['Invoice-stationery.jpg','invoice',a,'Văn phòng phẩm Hoa Mai',-8,1250000,0,'new'], ['Invoice-uniforms.pdf','invoice',b,'Đồng phục Sao Mai',-3,940000,0,'new'],
  ['Notice-Teachers-Day.pdf','notice',a,'All parents',-25,0,0,'approved'], ['Scan-0042.jpg','other',a,'',-1,0,0,'new']
].map((r, i) => ({id:'sample' + i, name:r[0], cls:r[1], loc:r[2], who:r[3], date:isoDay(r[4]), amount:r[5], expiry:r[6] ? isoDay(r[6]) : '', status:r[7], notes:''})); };

const WIDGETS = [
{ id:'dashboard', em:'📊', icon:'chart', en:'Owner Dashboard', vi:'Bảng điều khiển chủ trường', w:420, h:640, full:true,
  html() {
    const cs = cls(), ks = kids(), enr = enrIn();
    const billed = sum(ks, 'fee'), paid = sum(ks.filter(k => k.paid), 'fee'), rate = billed ? Math.round(paid / billed * 100) : 0;
    const att = window.ATT ? ATT.label() : '–';  // from the Attendance tracker (roster-linked, v0.4.21)
    const isoToday = (() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
    const ac = (at) => window.ATT ? ATT.counts(isoToday, at || state.loc || 'all') : {p:0, l:0, a:0, marked:0, total:0};  // today's present / late / absent, from the same records as the Attendance Tracker
    const a0 = ac(), notMarked = Math.max(0, a0.total - a0.marked);
    const unpaid = ks.filter(k => !k.paid);
    /* v0.4.27: money cards read the same lines as Accounting (window.CF.lines), for the month Accounting is showing (else the latest month with numbers). */
    const cm = (() => { const ls = window.CF ? CF.lines() : [], m = (state.acc && state.acc.m) || (ls.length ? ls[ls.length - 1].date.slice(0, 7) : ''), mine = ls.filter(x => x.date.slice(0, 7) === m);
      const inn = sum(mine, 'inn'), out = sum(mine, 'out'), open = sum(ls.filter(x => x.date.slice(0, 7) < m), x => x.inn - x.out);
      return {m, has:mine.length > 0, inn, out, bal:open + inn - out}; })();
    /* year to date, same groups as the Accounting summary */
    const ytd = (() => { const ls = window.CF ? CF.lines() : [], y = (cm.m || new Date().toISOString().slice(0, 7)).slice(0, 4), mm = cm.m || y + '-12';
      const mine = ls.filter(x => x.date.slice(0, 4) === y && x.date.slice(0, 7) <= mm), g = {};
      const grp = x => x.inn ? x.cat : x.cat === 'market' || x.cat === 'svc' ? x.cat : x.cat === 'inv' ? 'sup' : x.cat === 'cash' ? (x.oc === 'supplier' ? 'sup' : x.oc || 'other') : 'other';
      mine.forEach(x => { const k = grp(x); g[k] = (g[k] || 0) + x.inn + x.out; });
      return {y, g, inn:sum(mine, 'inn'), out:sum(mine, 'out'), has:mine.length > 0}; })();
    const YIN = [['fee', 'Fees', 'Học phí'], ['meal', 'Meal money', 'Tiền ăn']], YOUT = [['market', 'Kitchen: food shopping', 'Bếp: đi chợ'], ['svc', 'Kitchen: gas, power, water', 'Bếp: gas, điện, nước'], ['sup', 'Suppliers', 'Nhà cung cấp'], ['salary', 'Salaries', 'Lương'], ['rent', 'Rent', 'Tiền thuê'], ['util', 'Utilities', 'Điện nước'], ['supply', 'Supplies', 'Vật tư'], ['other', 'Other', 'Khác']];
    const ycell = n => n ? vnd(n) : '<span class="muted">–</span>', yres = ytd.inn - ytd.out;
    const ytdCard = `<div class="ss-sub"><div class="ss-subhead"><span class="ss-subtitle">${L('Cash flow, year to date', 'Dòng tiền từ đầu năm')} ${ytd.y}</span><button class="wbtn sm" id="od-acc">${L('Accounting', 'Kế toán')} ↗</button></div><div class="ss-subbody">
          ${ytd.has ? table(['', L('Year to date', 'Từ đầu năm')], [[`<b>${L('Money in', 'Tiền thu')}</b>`, '']].concat(YIN.map(g => [esc(L(g[1], g[2])), ycell(ytd.g[g[0]])]), [[`<b>${L('Total money in', 'Tổng thu')}</b>`, `<b>${vnd(ytd.inn)}</b>`], [`<b>${L('Money out', 'Tiền chi')}</b>`, '']], YOUT.filter(g => ytd.g[g[0]]).map(g => [esc(L(g[1], g[2])), vnd(ytd.g[g[0]])]), [[`<b>${L('Total money out', 'Tổng chi')}</b>`, `<b>${vnd(ytd.out)}</b>`], [`<b>${L('Result (in − out)', 'Kết quả (thu − chi)')}</b>`, `<span class="${yres < 0 ? 'kx-neg' : 'kx-pos'}">${yres < 0 ? '−' : ''}${vnd(Math.abs(yres))}</span>`]])) : `<p class="empty">${L('Nothing recorded this year yet.', 'Năm nay chưa có số liệu.')}</p>`}</div></div>`;
    const mLbl = cm.m ? ' · ' + cm.m.slice(5) + '/' + cm.m.slice(0, 4) : '';
    /* stoplight status, same look as School Stats in TeachersDeck: good = on track, watch = monitor, bad = needs attention; '' = no verdict (not enough data) */
    const attN = parseInt(att, 10);
    const st = {
      att: isNaN(attN) ? '' : attN >= 90 ? 'good' : attN >= 80 ? 'watch' : 'bad',
      inn: !cm.has ? '' : cm.inn >= cm.out ? 'good' : cm.inn >= cm.out * .9 ? 'watch' : 'bad',
      out: !cm.has ? '' : cm.out <= cm.inn * .85 ? 'good' : cm.out <= cm.inn ? 'watch' : 'bad',
      bal: !cm.has ? '' : cm.bal < 0 ? 'bad' : cm.bal >= cm.out ? 'good' : 'watch',
      unp: !billed ? '' : !(billed - paid) ? 'good' : (billed - paid) <= billed * .1 ? 'watch' : 'bad'
    };
    const stTile = ([v, l, s, sm, go, sub]) => `<div class="tile${go ? ' od-go' : ''}" ${s ? `data-st="${s}"` : ''}${go ? ` data-go="${go}" role="button" tabindex="0" title="${esc(go === 'roster' ? L('Open the Student Roster', 'Mở Danh sách học sinh') : L('Open Attendance', 'Mở Điểm danh'))}"` : ''}><b${sm ? ` style="--vs:${sm}px"` : ''}>${v}</b><span>${esc(l)}</span>${sub ? `<em class="ss-delta">${esc(sub)}</em>` : ''}</div>`;
    const stTitle = {good:L('On track', 'Ổn định'), watch:L('Monitor', 'Cần theo dõi'), bad:L('Needs attention', 'Cần xử lý')};
    return `<div class="ss-root">
      <div class="ss-stlegend"><span class="ss-st" data-st="good">${stTitle.good}</span><span class="ss-st" data-st="watch">${stTitle.watch}</span><span class="ss-st" data-st="bad">${stTitle.bad}</span>
        <details><summary>${L('How are these colours worked out?', 'Màu được tính như thế nào?')}</summary>
          <p>${L('Attendance today: green 90% or more present (present + late), yellow 80–89%, red below 80%. Enrolled has no colour: it is a count from the Student Roster.', 'Chuyên cần hôm nay: xanh từ 90% có mặt (có mặt + đến muộn), vàng 80–89%, đỏ dưới 80%. Sĩ số không có màu: đó là số đếm từ Danh sách học sinh.')}</p>
          <p>${L('Cash in: green when it covers cash out, yellow within 10% of it, red below that. Cash out: green at 85% of cash in or less, yellow up to 100%, red above cash in. Balance: green when it covers a month of cash out, yellow when positive but lower, red when negative. Cash cards show the month in Accounting and have no colour until something is recorded.', 'Tiền thu: xanh khi đủ bù tiền chi, vàng nếu thấp hơn tối đa 10%, đỏ nếu thấp hơn nữa. Tiền chi: xanh khi bằng 85% tiền thu trở xuống, vàng đến 100%, đỏ khi vượt tiền thu. Số dư: xanh khi đủ một tháng tiền chi, vàng khi dương nhưng thấp hơn, đỏ khi âm. Các thẻ tiền hiển thị tháng đang xem ở Kế toán, chưa có màu khi chưa ghi nhận số liệu.')}</p>
          <p>${L('Unpaid fees: green when none, yellow up to 10% of billed, red above.', 'Học phí còn nợ: xanh khi không còn nợ, vàng đến 10% tổng phải thu, đỏ nếu hơn.')}</p></details></div>
      <div class="tiles ss-tiles">${[
        [enr, L('Enrolled', 'Sĩ số'), '', undefined, 'roster', L('children in the roster', 'bé trong danh sách')],
        [att, L('Attendance today', 'Chuyên cần hôm nay'), st.att, undefined, 'attendance', a0.marked ? `${a0.p} ${L('present', 'có mặt')} · ${a0.l} ${L('late', 'muộn')} · ${a0.a} ${L('absent', 'vắng')}` : L('not marked yet', 'chưa điểm danh')],
        [vnd(cm.inn), L('Cash in', 'Tiền thu') + mLbl, st.inn, 20],
        [vnd(cm.out), L('Cash out', 'Tiền chi') + mLbl, st.out, 20],
        [(cm.bal < 0 ? '−' : '') + vnd(Math.abs(cm.bal)), L('Balance', 'Số dư') + mLbl, st.bal, 20],
        [vnd(billed - paid), L('Unpaid fees', 'Học phí còn nợ'), st.unp, 20]
        ].map(stTile).join('')}</div>
      <div class="ss-cols">
        <div class="ss-col">
        <div class="ss-sub"><div class="ss-subhead"><span class="ss-subtitle">${L('Enrollment', 'Sĩ số')}</span><span class="btn-row" style="gap:6px"><button class="wbtn sm" data-go="roster">${L('Student Roster', 'Danh sách học sinh')} ↗</button><button class="wbtn sm" data-go="attendance">${L('Attendance', 'Điểm danh')} ↗</button></span></div><div class="ss-subbody">
          ${tiles([[enr, L('Enrolled', 'Sĩ số')], [a0.p, L('Present today', 'Có mặt hôm nay')], [a0.l, L('Late', 'Đến muộn')], [a0.a, L('Absent', 'Vắng')], [notMarked, L('Not marked', 'Chưa điểm danh')]])}
          ${KD.locs.filter(l => inLoc(l.id)).map(l => { const e = enrolledAt(l.id); return bar(l[state.lang], String(e), enr ? e / enr * 100 : 0, ''); }).join('')}
          <div class="muted" style="margin:8px 0 2px;font-size:11px">${L('By age group (from the Student Roster)', 'Theo nhóm tuổi (từ Danh sách học sinh)')}</div>${ageBars() || `<p class="empty">${L('No children in the roster yet.', 'Chưa có bé nào trong danh sách.')}</p>`}</div></div>
        <div class="ss-sub"><div class="ss-subhead"><span class="ss-subtitle">${L('Campus comparison', 'So sánh các cơ sở')}</span></div><div class="ss-subbody">
          ${table([L('Campus', 'Cơ sở'), L('Enrolled', 'Sĩ số'), L('Present today', 'Có mặt hôm nay'), L('Collected', 'Đã thu')], KD.locs.map(l => {
            const k = KD.kids.filter(x => x.l === l.id), b = sum(k, 'fee'), p = sum(k.filter(x => x.paid), 'fee'), c = KD.classes.filter(x => x.l === l.id);
            const a = ac(l.id); return [esc(l[state.lang]), enrolledAt(l.id), a.marked ? `${a.p + a.l}/${a.marked}` : '–', (b ? Math.round(p / b * 100) : 0) + '%'];
          }))}</div></div>
        </div>
        <div class="ss-col">
        <div class="ss-sub"><div class="ss-subhead"><span class="ss-subtitle">${L('Paid / unpaid this month', 'Đã đóng / chưa đóng tháng này')}${mLbl}</span></div><div class="ss-subbody">
          ${table(['', L('Amount', 'Số tiền')], [[L('Fees paid', 'Học phí đã đóng'), `<span class="kx-pos">${vnd(paid)}</span>`], [L('Fees unpaid', 'Học phí chưa đóng'), `<span class="${billed - paid ? 'kx-neg' : 'kx-pos'}">${vnd(billed - paid)}</span>`], [L('Cash in', 'Tiền thu'), vnd(cm.inn)], [L('Expenses (cash out)', 'Chi phí (tiền chi)'), vnd(cm.out)]])}
          <div class="muted" style="margin:10px 0 2px;font-size:11px">${L('Unpaid this month', 'Chưa đóng tháng này')}</div>
          ${unpaid.map(k => `<div class="arow"><span class="name">${esc(k.n)}</span><span class="meta">${esc(k.p)} · ${esc(k.phone)}</span><span class="val">${vnd(k.fee)}</span></div>`).join('') || `<p class="empty">${L('Everyone has paid.', 'Mọi bé đã đóng học phí.')}</p>`}</div></div>
        </div>
        <div class="ss-col">
        ${ytdCard}
        </div>
      </div></div>`;
  },
  wire(b) { const x = b.querySelector('#od-acc'); if (x && window.ACC) x.onclick = () => ACC.open('sum');
    const go = id => { if (!widgetEls || !WIDGETS.some(w => w.id === id)) return; openWidget(id); renderWidget(id); bringToFront(widgetEls[id].el); syncDock(); };  // v0.4.29: tiles and Enrollment buttons open the Student Roster / Attendance
    b.querySelectorAll('[data-go]').forEach(e => { e.onclick = () => go(e.dataset.go); e.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(e.dataset.go); } }; }); } },
{ id:'inbox', em:'📥', icon:'inbox', en:'Document Library', vi:'Thư viện tài liệu', w:760, h:580,
  rows() { const n = norm(libQ); return docsIn().filter(d => (libCls === 'all' || d.cls === libCls) && (!libSt || d.status === libSt) && norm(d.name + ' ' + d.who + ' ' + d.notes).includes(n)).sort((a, b) => b.date.localeCompare(a.date)); },
  html() {
    const tab = (k, en, vi) => `<button class="wbtn sm ${libTab === k ? 'primary' : ''}" data-tab="${k}">${L(en, vi)}</button>`;
    return `<div class="btn-row" style="margin-bottom:10px">${tab('lib', 'Library', 'Thư viện')}${tab('met', 'Metrics', 'Số liệu')}</div>` + (libTab === 'met' ? this.met() : libSel && docs().some(d => d.id === libSel) ? this.detail() : this.lib());
  },
  drop(small) { return `<div class="kd-drop${small ? ' kd-drop-sm' : ''}" id="kd-drop">${L('Drop scans or PDFs here, or click to choose', 'Kéo thả bản scan hoặc PDF vào đây, hoặc bấm để chọn')}</div><input type="file" id="kd-file" multiple accept="image/*,.pdf" hidden>`; },
  lib() {
    const all = docsIn();
    if (!all.length) return this.drop() + `<p class="empty">${L('No documents yet.', 'Chưa có tài liệu nào.')}</p>${demoOn() ? `<div class="btn-row" style="justify-content:center"><button class="wbtn" id="kd-sample">${L('Load sample documents', 'Tải tài liệu mẫu')}</button></div>` : ''}`;
    const cnt = k => all.filter(d => k === 'all' || d.cls === k).length;
    const chip = (k, nm) => `<button class="wbtn sm ${libCls === k ? 'primary' : ''}" data-cls="${k}">${esc(nm)} ${cnt(k)}</button>`;
    return this.drop(true) + `<div class="btn-row" style="margin-bottom:8px"><input type="text" id="kd-lq" placeholder="${L('Search name, child or supplier (diacritics optional)', 'Tìm tên, bé hoặc nhà cung cấp (có hoặc không dấu)')}" value="${esc(libQ)}" style="flex:1"><select id="kd-ls"><option value="">${L('All statuses', 'Mọi trạng thái')}</option>${DOC_ST.map(t => `<option value="${t[0]}" ${libSt === t[0] ? 'selected' : ''}>${esc(L(t[1], t[2]))}</option>`).join('')}</select></div>
      <div class="btn-row" style="margin-bottom:8px">${chip('all', L('All', 'Tất cả'))}${DOC_CLS.map(c => chip(c[0], L(c[1], c[2]))).join('')}</div>
      <div id="kd-lrows">${this.tbl()}</div>
      <p class="hint" style="margin-top:10px">${L('Shell only: files are listed, not read yet, so details are typed in. The AI Document Assistant will fill them in at the MVP. File contents are not stored.', 'Mới là bộ khung: tệp chưa được đọc nên thông tin nhập tay. Trợ lý tài liệu AI sẽ điền sẵn ở bản MVP. Nội dung tệp không được lưu.')}</p>`;
  },
  tbl() {
    const r = this.rows();
    return r.length ? `<table class="kd-table kd-click"><tr><th>${L('Document', 'Tài liệu')}</th><th>${L('Type', 'Loại')}</th><th>${L('Child or supplier', 'Bé hoặc nhà cung cấp')}</th><th>${L('Date', 'Ngày')}</th><th>${L('Status', 'Trạng thái')}</th></tr>${r.map(d => `<tr data-id="${esc(d.id)}"><td>${esc(d.name)}</td><td>${esc(clsName(d.cls))}</td><td>${esc(d.who) || '–'}</td><td>${esc(d.date)}</td><td>${stBadge(d.status)}</td></tr>`).join('')}</table>` : `<p class="empty">${L('No documents match. Add scans or clear the filters.', 'Không có tài liệu phù hợp. Thêm bản scan hoặc bỏ bộ lọc.')}</p>`;
  },
  detail() {
    const d = docs().find(x => x.id === libSel), o = (a, v) => a.map(x => `<option value="${esc(x[0])}" ${x[0] === v ? 'selected' : ''}>${esc(x[1])}</option>`).join('');
    return `<div class="kd-form"><button class="wbtn sm" id="kd-back">‹ ${L('Back to list', 'Về danh sách')}</button>
      ${docPrev[d.id] ? `<img class="kd-prev" src="${docPrev[d.id]}" alt="">` : ''}
      <label for="kd-f-name">${L('Document', 'Tài liệu')}</label><input type="text" id="kd-f-name" value="${esc(d.name)}">
      <label for="kd-f-cls">${L('Type', 'Loại')}</label><select id="kd-f-cls">${o(DOC_CLS.map(c => [c[0], L(c[1], c[2])]), d.cls)}</select>
      <label for="kd-f-loc">${L('Campus', 'Cơ sở')}</label><select id="kd-f-loc">${o(KD.locs.map(l => [l.id, l[state.lang]]), d.loc)}</select>
      <label for="kd-f-who">${L('Child or supplier', 'Bé hoặc nhà cung cấp')}</label><input type="text" id="kd-f-who" value="${esc(d.who)}">
      <label for="kd-f-date">${L('Document date', 'Ngày trên tài liệu')}</label><input type="date" id="kd-f-date" value="${esc(d.date)}">
      <label for="kd-f-amount">${L('Amount (₫)', 'Số tiền (₫)')}</label><input type="number" min="0" id="kd-f-amount" value="${d.amount || 0}">
      <label for="kd-f-expiry">${L('Expiry date (licences)', 'Ngày hết hạn (giấy phép)')}</label><input type="date" id="kd-f-expiry" value="${esc(d.expiry)}">
      <label for="kd-f-status">${L('Status', 'Trạng thái')}</label><select id="kd-f-status">${o(DOC_ST.map(t => [t[0], L(t[1], t[2])]), d.status)}</select>
      <label for="kd-f-notes">${L('Notes', 'Ghi chú')}</label><textarea id="kd-f-notes" rows="3">${esc(d.notes)}</textarea>
      <div class="btn-row" style="margin-top:12px"><button class="wbtn primary" id="kd-save">${L('Save changes', 'Lưu thay đổi')}</button><button class="wbtn" id="kd-approve">${L('Approve', 'Duyệt')}</button><button class="wbtn" id="kd-reject">${L('Reject', 'Từ chối')}</button><button class="wbtn" id="kd-del">${L('Delete', 'Xóa')}</button></div></div>`;
  },
  met() {
    const ds = docsIn(), n = ds.length, ap = ds.filter(d => d.status === 'approved').length;
    if (!n) return `<p class="empty">${L('Add documents in the Library to see numbers here.', 'Thêm tài liệu trong Thư viện để xem số liệu ở đây.')}</p>`;
    const money = k => sum(ds.filter(d => d.cls === k && d.status !== 'rejected'), 'amount');
    const lic = ds.filter(d => d.cls === 'licence' && d.status !== 'rejected' && d.expiry && daysTo(d.expiry) <= 60).sort((a, b) => a.expiry.localeCompare(b.expiry));
    const pct = c => c / n * 100, mon = [];
    for (let m = 5; m >= 0; m--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - m); mon.push(d.toISOString().slice(0, 7)); }
    const sub = t => `<div class="ss-sub"><div class="ss-subhead"><span class="ss-subtitle">${t}</span></div><div class="ss-subbody">`;
    return tiles([[n, L('Documents in the library', 'Tài liệu trong thư viện')], [toReview(), L('Waiting for review', 'Đang chờ duyệt')], [Math.round(ap / n * 100) + '%', L('Approved', 'Đã duyệt')],
        [vnd(money('fee')), L('Fees on receipts', 'Học phí trên biên lai')], [vnd(money('invoice')), L('Supplier invoices', 'Hóa đơn nhà cung cấp')], [lic.length, L('Licences expiring in 60 days', 'Giấy tờ sắp hết hạn (60 ngày)')]]).replace('class="tiles"', 'class="tiles ss-tiles"') +
      `<div class="ss-grid">` +
      sub(L('By status', 'Theo trạng thái')) + DOC_ST.map(t => { const c = ds.filter(d => d.status === t[0]).length; return bar(L(t[1], t[2]), c, pct(c), t[3] === 'warn' ? '' : t[3]); }).join('') + `</div></div>` +
      sub(L('By type', 'Theo loại')) + DOC_CLS.map(c => { const k = ds.filter(d => d.cls === c[0]).length; return bar(L(c[1], c[2]), k, pct(k)); }).join('') + `</div></div>` +
      sub(L('Added per month (by document date)', 'Theo tháng (ngày trên tài liệu)')) + mon.map(m => { const k = ds.filter(d => d.date.slice(0, 7) === m).length; return bar(m, k, pct(k)); }).join('') + `</div></div>` +
      sub(L('Fees on receipts by campus', 'Học phí trên biên lai theo cơ sở')) + table([L('Campus', 'Cơ sở'), L('Receipts', 'Biên lai'), L('Amount', 'Số tiền')], KD.locs.filter(l => inLoc(l.id)).map(l => { const r = ds.filter(d => d.loc === l.id && d.cls === 'fee' && d.status !== 'rejected'); return [esc(l[state.lang]), r.length, vnd(sum(r, 'amount'))]; })) + `</div></div>` +
      sub(L('Licences to renew', 'Giấy tờ cần gia hạn')) + (lic.map(d => { const t = daysTo(d.expiry); return `<div class="arow"><span class="name">${esc(d.who || d.name)}</span><span class="meta">${esc(locName(d.loc))}</span><span class="badge ${t <= 30 ? 'bad' : 'warn'}">${t < 0 ? L('Expired', 'Hết hạn') : t + ' ' + L('days', 'ngày')}</span></div>`; }).join('') || `<p class="empty">${L('Nothing expiring soon.', 'Chưa có giấy tờ sắp hết hạn.')}</p>`) + `</div></div></div>` +
      `<div class="btn-row" style="margin-top:12px"><button class="wbtn" id="kd-csv">${L('Export CSV', 'Xuất CSV')}</button></div><p class="hint" style="margin-top:8px">${L('Numbers use the details confirmed in the Library. Rejected documents are left out of money totals.', 'Số liệu lấy từ thông tin đã xác nhận trong Thư viện. Tài liệu bị từ chối không tính vào tổng tiền.')}</p>`;
  },
  wire(b, rp) {
    const w = this, after = () => { saveState(); rp(); refreshWidget('dashboard'); refreshWidget('cashflow'); }, $q = x => b.querySelector(x);
    b.querySelectorAll('[data-tab]').forEach(x => x.onclick = () => { libTab = x.dataset.tab; libSel = null; rp(); });
    b.querySelectorAll('[data-cls]').forEach(x => x.onclick = () => { libCls = x.dataset.cls; rp(); });
    const rowsWire = () => b.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { libSel = tr.dataset.id; rp(); });
    rowsWire();
    const drop = $q('#kd-drop'), f = $q('#kd-file');
    if (drop) {
      const add = fl => { const n = [...fl].map(x => { const d = newDoc(x.name); if (x.type.startsWith('image/')) docPrev[d.id] = URL.createObjectURL(x); return d; }); if (!n.length) return; docs().push(...n); libTab = 'lib'; libSel = n.length === 1 ? n[0].id : null; after(); };
      drop.onclick = () => f.click(); f.onchange = () => add(f.files);
      drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = e => { e.preventDefault(); add(e.dataTransfer.files); };
    }
    const smp = $q('#kd-sample'); if (smp) smp.onclick = () => { docs().push(...sampleDocs()); after(); };
    const q = $q('#kd-lq'); if (q) q.oninput = () => { libQ = q.value; $q('#kd-lrows').innerHTML = w.tbl(); rowsWire(); };
    const ls = $q('#kd-ls'); if (ls) ls.onchange = () => { libSt = ls.value; rp(); };
    const rd = () => { const d = docs().find(x => x.id === libSel); if (!d) return null; const v = k => $q('#kd-f-' + k).value;
      d.name = v('name').trim() || d.name; d.cls = v('cls'); d.loc = v('loc'); d.who = v('who').trim(); d.date = v('date') || d.date; d.amount = Number(v('amount')) || 0; d.expiry = v('expiry'); d.status = v('status'); d.notes = v('notes'); return d; };
    const act = (id, fn) => { const e = $q(id); if (e) e.onclick = fn; };
    act('#kd-back', () => { libSel = null; rp(); });
    act('#kd-save', () => { if (rd()) { libSel = null; after(); } });
    act('#kd-approve', () => { const d = rd(); if (d) { d.status = 'approved'; libSel = null; after(); } });
    act('#kd-reject', () => { const d = rd(); if (d) { d.status = 'rejected'; libSel = null; after(); } });
    act('#kd-del', () => { if (confirm(L('Delete this document from the library?', 'Xóa tài liệu này khỏi thư viện?'))) { state.docs = docs().filter(x => x.id !== libSel); libSel = null; after(); } });
    act('#kd-csv', () => {
      const csv = '\uFEFF' + ['name,type,campus,child_or_supplier,date,amount,expiry,status,notes'].concat(docsIn().map(d => [d.name, clsName(d.cls), locName(d.loc), d.who, d.date, d.amount, d.expiry, L(stOf(d.status)[1], stOf(d.status)[2]), d.notes].map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','))).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); a.download = 'library.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  } },
{ id:'roster', em:'🧒', icon:'child', en:'Student Roster', vi:'Danh sách học sinh', w:520, h:440,
  rows() { const q = norm(rosterQ); return kids().filter(k => norm(k.n).includes(q)); },
  html() {
    return `<div class="btn-row" style="margin-bottom:10px"><input type="text" id="kd-q" placeholder="${L('Search name (diacritics optional)', 'Tìm tên (có hoặc không dấu)')}" value="${esc(rosterQ)}" style="flex:1"><button class="wbtn sm" id="kd-csv">${L('Export CSV', 'Xuất CSV')}</button></div>
      <div id="kd-rows">${this.tbl()}</div>`;
  },
  tbl() { return table([L('Child', 'Bé'), L('Class', 'Lớp'), L('Campus', 'Cơ sở'), L('Allergy', 'Dị ứng')], this.rows().map(k => [esc(k.n), esc(KD.classes.find(c => c.id === k.c).n), esc(locName(k.l)), k.al ? `<span class="badge warn">${esc(k.al)}</span>` : '–'])); },
  wire(b) {
    const w = this, q = b.querySelector('#kd-q');
    q.oninput = () => { rosterQ = q.value; b.querySelector('#kd-rows').innerHTML = w.tbl(); };
    b.querySelector('#kd-csv').onclick = () => {
      const csv = '\uFEFF' + ['name,class,campus,allergy'].concat(w.rows().map(k => [k.n, KD.classes.find(c => c.id === k.c).n, locName(k.l), k.al].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); a.download = 'roster.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  } },
{ id:'parents', em:'👪', icon:'people', en:'Parent Directory', vi:'Danh bạ phụ huynh', w:480, h:380,
  html() { return table([L('Parent', 'Phụ huynh'), L('Child', 'Bé'), 'Zalo / ' + L('Phone', 'ĐT')], kids().map(k => [esc(k.p), esc(k.n), `<button class="wbtn sm" data-copy="${esc(k.phone)}">${esc(k.phone)}</button>`])); },
  wire(b) { b.querySelectorAll('[data-copy]').forEach(x => x.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(x.dataset.copy); toast(t('copied')); }); } },
{ id:'suppliers', em:'🚚', icon:'truck', en:'Supplier Directory', vi:'Nhà cung cấp', w:540, h:340,
  html() {
    const sups = state.suppliers || [], multi = KD.locs.length > 1, cats = [['Food and produce', 'Thực phẩm'], ['Stationery', 'Văn phòng phẩm'], ['Uniforms', 'Đồng phục'], ['Other', 'Khác']];
    const rows = sups.map((x, i) => [x, i]).filter(([x]) => inLoc(x.loc)).map(([x, i]) => [`<b>${esc(x.n)}</b>`, esc(L(x.cat[0], x.cat[1])),
        `<input type="tel" class="kx-n" data-sp="${i}" value="${esc(x.phone)}" style="width:110px">`].concat(multi ? [esc(locName(x.loc))] : []).concat([`<button class="wbtn sm" data-sdel="${i}" aria-label="${L('Remove', 'Xóa')}">×</button>`]))
      .concat(KD.suppliers.filter(x => inLoc(x[3])).map(x => [esc(x[0]) + ` <span class="badge">${L('demo', 'mẫu')}</span>`, esc(L(x[1], x[2])), '–'].concat(multi ? [esc(locName(x[3]))] : []).concat([''])));
    return `<div class="kx-scroll kx">${table([L('Supplier', 'Nhà cung cấp'), L('Category', 'Nhóm'), L('Phone', 'SĐT')].concat(multi ? [L('Campus', 'Cơ sở')] : []).concat(['']), rows)}</div>
      <div class="btn-row kx-add" style="margin-top:8px"><input type="text" id="ks-n" placeholder="${L('Add a supplier by name', 'Thêm nhà cung cấp theo tên')}" style="flex:1;min-width:150px"><select id="ks-c">${cats.map((c, i) => `<option value="${i}">${esc(L(c[0], c[1]))}</option>`).join('')}</select><button class="wbtn sm primary" id="ks-add">${L('Add', 'Thêm')}</button></div>`;
  },
  wire(b, rp) {
    const cats = [['Food and produce', 'Thực phẩm'], ['Stationery', 'Văn phòng phẩm'], ['Uniforms', 'Đồng phục'], ['Other', 'Khác']], list = () => state.suppliers || (state.suppliers = []);
    b.querySelectorAll('[data-sp]').forEach(x => x.onchange = () => { list()[+x.dataset.sp].phone = x.value.trim(); saveState(); });
    b.querySelectorAll('[data-sdel]').forEach(x => x.onclick = () => { const s = list()[+x.dataset.sdel]; if (!confirm(L('Remove ' + s.n + '?', 'Xóa ' + s.n + '?'))) return; list().splice(+x.dataset.sdel, 1); saveState(); rp(); });
    const n = b.querySelector('#ks-n'), add = () => { const v = n.value.trim(); if (!v) return n.focus(); list().push({sid:'s' + Date.now().toString(36), n:v, cat:cats[+b.querySelector('#ks-c').value], phone:'', loc:state.loc === 'all' ? KD.locs[0].id : state.loc}); saveState(); rp(); };
    b.querySelector('#ks-add').onclick = add; n.onkeydown = ev => { if (ev.key === 'Enter') add(); };
  } },
{ id:'fees', em:'💰', icon:'coins', en:'Fees', vi:'Học phí', w:420, h:340,
  html() {
    const ks = kids(), b = sum(ks, 'fee'), p = sum(ks.filter(k => k.paid), 'fee'), r = b ? Math.round(p / b * 100) : 0;
    return tiles([[vnd(b), L('Billed', 'Phải thu')], [vnd(p), L('Collected', 'Đã thu')], [r + '%', L('Collection rate', 'Tỷ lệ thu')]]) +
      table([L('Child', 'Bé'), L('Fee', 'Học phí'), L('Status', 'Trạng thái')], ks.map(k => [esc(k.n), vnd(k.fee), k.paid ? `<span class="badge good">${L('Paid', 'Đã đóng')}</span>` : `<span class="badge bad">${L('Due', 'Còn nợ')}</span>`]));
  } },
{ id:'health', em:'📏', icon:'pulse', en:'Health and Growth', vi:'Sức khỏe và tăng trưởng', w:420, h:340,
  html() { return table([L('Child', 'Bé'), L('Height', 'Chiều cao'), L('Weight', 'Cân nặng')], kids().map(k => [esc(k.n), k.h + ' cm', k.w + ' kg'])) + `<p class="hint" style="margin-top:8px">${L('Nutrition status against WHO standards arrives in Phase 2.', 'Đánh giá dinh dưỡng theo chuẩn WHO sẽ có ở Giai đoạn 2.')}</p>`; } },
{ id:'overview', em:'🏫', icon:'school', en:'Location Overview', vi:'Tổng quan cơ sở', w:460, h:380,
  /* v0.4.32: add, rename and remove campuses. They are kept in state.locs and show in the campus picker at the top, the dashboard, the roster, Attendance and the staff list. */
  html() {
    const mine = id => (state.locs || []).some(l => l.id === id);
    return table([L('Campus', 'Cơ sở'), L('Enrolled', 'Sĩ số'), ''], KD.locs.map(l => [mine(l.id) ? `<input type="text" data-ln="${l.id}" value="${esc(l[state.lang])}" aria-label="${L('Campus name', 'Tên cơ sở')}">` : esc(l[state.lang]), enrolledAt(l.id), mine(l.id) ? `<button class="wbtn sm" data-ldel="${l.id}" aria-label="${L('Remove', 'Xóa')}">×</button>` : '']))
      + `<div class="btn-row" style="margin-top:10px;align-items:flex-end"><label class="kx-rate" style="flex:1;min-width:160px">${L('Add a campus', 'Thêm cơ sở')}<input type="text" id="lo-n" placeholder="${L('Campus name', 'Tên cơ sở')}"></label><button class="wbtn primary" id="lo-add">${L('Add', 'Thêm')}</button></div>`
      + `<p class="hint" style="margin-top:8px">${L('Enrolled is counted from the Student Roster. Choose a child’s campus when you add or edit them there. A campus can be removed once no children, staff or records are filed under it.', 'Sĩ số được đếm từ Danh sách học sinh. Chọn cơ sở của bé khi thêm hoặc sửa ở đó. Chỉ xóa được cơ sở khi không còn bé, nhân viên hay chứng từ nào thuộc cơ sở đó.')}</p>`;
  },
  wire(b, rp) {
    const after = () => { saveState(); buildLocSelect(); refreshAllWidgets(); };
    const used = id => (state.students || []).some(x => x.loc === id) || (state.staff || []).some(x => x.loc === id) || (state.suppliers || []).some(x => x.loc === id) || (state.docs || []).some(x => x && x.loc === id) || ((state.cf && state.cf.entries) || []).some(x => x.loc === id);
    const add = () => { const n = b.querySelector('#lo-n'), v = n.value.trim().replace(/\s+/g, ' '); if (!v) return n.focus();
      if (KD.locs.some(l => norm(l.en) === norm(v) || norm(l.vi) === norm(v))) { toast(L('A campus with this name already exists.', 'Đã có cơ sở tên này.'), 3000); return n.focus(); }
      (state.locs || (state.locs = [])).push({id:'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), en:v, vi:v}); after(); toast(L('Added ' + v, 'Đã thêm ' + v), 2500); };
    const ab = b.querySelector('#lo-add'); if (ab) ab.onclick = add; const ni = b.querySelector('#lo-n'); if (ni) ni.onkeydown = e => { if (e.key === 'Enter') add(); };
    b.querySelectorAll('[data-ln]').forEach(x => x.onchange = () => { const l = (state.locs || []).find(y => y.id === x.dataset.ln), v = x.value.trim(); if (l && v) { l.en = l.vi = v; after(); } else rp(); });
    b.querySelectorAll('[data-ldel]').forEach(x => x.onclick = () => { const id = x.dataset.ldel;
      if (used(id)) return toast(L('Move its children, staff and records to another campus first.', 'Hãy chuyển bé, nhân viên và chứng từ sang cơ sở khác trước.'), 3500);
      if (!confirm(L('Remove this campus?', 'Xóa cơ sở này?'))) return; state.locs = (state.locs || []).filter(l => l.id !== id); if (state.loc === id) state.loc = 'all'; after(); });
  } },
{ id:'attendance', em:'✅', icon:'tasks', en:'Attendance Tracker', vi:'Điểm danh', w:340, h:420,
  html() { return `<p class="hint">${L('Tap a child to mark absent or present.', 'Bấm vào bé để đánh dấu vắng hoặc có mặt.')}</p>` + kids().map(k => { const a = state.att[k.n] === 0; return `<div class="arow kd-att" data-k="${esc(k.n)}"><span class="name">${esc(k.n)}</span><span class="badge ${a ? 'bad' : 'good'}">${a ? L('Absent', 'Vắng') : L('Present', 'Có mặt')}</span></div>`; }).join(''); },
  wire(b, rp) { b.querySelectorAll('.kd-att').forEach(x => x.onclick = () => { const k = x.dataset.k; state.att[k] = state.att[k] === 0 ? 1 : 0; saveState(); rp(); refreshWidget('dashboard'); }); } },
{ id:'calendar', em:'📅', icon:'calendar', en:'Calendar', vi:'Lịch', w:380, h:560,
  /* v0.6.0: the school's own events (state.events = [{id, date, time, title}]) beside the holiday presets. Classes for teachers
     sends both to TinyTeachersDeck and TinyParentDeck. */
  html() {
    const y = calM.getFullYear(), m = calM.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
    const key = d => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, today = new Date().toISOString().slice(0, 10);
    const evs = iso => schoolEvents().filter(e => e.date === iso);
    let g = (state.lang === 'vi' ? ['T2','T3','T4','T5','T6','T7','CN'] : ['Mo','Tu','We','Th','Fr','Sa','Su']).map(x => `<div class="cal-dow">${x}</div>`).join('') + '<div class="cal-cell pad"></div>'.repeat(off);
    for (let d = 1; d <= n; d++) g += `<div class="cal-cell${key(d) === today ? ' today' : ''}${evs(key(d)).length ? ' has-evt' : ''}${key(d) === calSel ? ' sel' : ''}" data-day="${key(d)}">${d}${evs(key(d)).length ? '<span class="cal-dot"></span>' : ''}</div>`;
    const sel = calSel ? evs(calSel) : null;
    return `<div class="btn-row" style="align-items:center;margin-bottom:8px"><button class="wbtn sm" data-nav="-1">‹</button><span style="flex:1;text-align:center;font-family:Quicksand;font-weight:700">${calM.toLocaleDateString(state.lang === 'vi' ? 'vi-VN' : 'en-GB', {month:'long', year:'numeric'})}</span><button class="wbtn sm" data-nav="1">›</button></div>
      <div class="cal-grid">${g}</div><div class="cal-day-list">${sel ? (sel.map(e => `<div class="arow"><span class="meta" style="width:44px">${esc(e.time || '')}</span><span class="name">${esc(e.title)}</span>${e.own ? `<button class="wbtn sm" data-edel="${esc(e.id)}" aria-label="${L('Remove', 'Xóa')}">×</button>` : ''}</div>`).join('') || `<p class="empty">${L('No events this day.', 'Không có sự kiện.')}</p>`)
        + `<div class="btn-row" style="margin-top:8px"><input type="text" id="ce-title" maxlength="120" placeholder="${L('Add a school event this day', 'Thêm sự kiện của trường ngày này')}" style="flex:1;min-width:140px"><input type="time" id="ce-time"><button class="wbtn sm primary" id="ce-add">${L('Add', 'Thêm')}</button></div>`
        : `<p class="hint">${L('Pick a day to see or add events.', 'Chọn một ngày để xem hoặc thêm sự kiện.')}</p>`}</div>`;
  },
  wire(b, rp) {
    b.querySelectorAll('[data-nav]').forEach(x => x.onclick = () => { calM.setMonth(calM.getMonth() + +x.dataset.nav); calSel = null; rp(); });
    b.querySelectorAll('[data-day]').forEach(x => x.onclick = () => { calSel = x.dataset.day; rp(); });
    const add = b.querySelector('#ce-add');
    if (add) add.onclick = () => { const t = b.querySelector('#ce-title').value.trim(); if (!t) return;
      (state.events || (state.events = [])).push({id:'ev' + Date.now().toString(36), date:calSel, time:b.querySelector('#ce-time').value || '', title:t}); saveState(); rp(); };
    b.querySelectorAll('[data-edel]').forEach(x => x.onclick = () => { state.events = (state.events || []).filter(e => e.id !== x.dataset.edel); saveState(); rp(); });
  } },
{ id:'announce', em:'📣', icon:'megaphone', en:'Announcements Board', vi:'Bảng thông báo', w:380, h:440,
  /* v0.6.0: each notice keeps the day it was written ({text, date}; older plain strings still read). Classes for teachers sends
     them to the teachers' Notices and the families' Class Notices. */
  html() { return `<textarea id="kd-note" rows="3" placeholder="${L('Write a notice for parents…', 'Viết thông báo cho phụ huynh…')}"></textarea><div class="btn-row" style="margin:8px 0"><button class="wbtn primary" id="kd-add">${L('Post notice', 'Đăng thông báo')}</button></div>` +
    (state.notes.map((n, i) => { const x = noteOf(n); return `<div class="arow"><span class="name" style="white-space:normal">${esc(x.text)}${x.date ? ` <span class="muted">${esc(x.date.split('-').reverse().slice(0, 2).join('/'))}</span>` : ''}</span><button class="wbtn sm" data-i="${i}">${L('Copy for Zalo', 'Chép sang Zalo')}</button><button class="wbtn sm" data-ndel="${i}" aria-label="${L('Remove', 'Xóa')}">×</button></div>`; }).join('') || `<p class="empty">${L('No notices yet.', 'Chưa có thông báo.')}</p>`); },
  wire(b, rp) {
    b.querySelector('#kd-add').onclick = () => { const v = b.querySelector('#kd-note').value.trim(); if (v) { state.notes.unshift({text:v, date:new Date().toISOString().slice(0, 10)}); saveState(); rp(); } };
    b.querySelectorAll('[data-i]').forEach(x => x.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(noteOf(state.notes[x.dataset.i]).text); toast(t('copied')); });
    b.querySelectorAll('[data-ndel]').forEach(x => x.onclick = () => { if (!confirm(L('Remove this notice?', 'Xóa thông báo này?'))) return; state.notes.splice(+x.dataset.ndel, 1); saveState(); rp(); });
  } },
{ id:'agenda', em:'🗓️', icon:'list', en:'Agenda Board', vi:'Lịch trình trong ngày', w:340, h:380,
  html() { return KD.agenda.map(a => `<div class="arow"><span class="meta" style="width:44px">${a[0]}</span><span class="name">${esc(L(a[1], a[2]))}</span></div>`).join('') + `<p class="hint" style="margin-top:8px">${L('Preschool template. Editing comes later.', 'Mẫu cho mầm non. Chức năng chỉnh sửa sẽ có sau.')}</p>`; } },
{ id:'clock', em:'🕒', icon:'clock', en:'Clock', vi:'Đồng hồ', w:240, h:290,   // 15 Nov 2026: the Glass Blue demo's Clock face (js/deckclock.js)
  html() { return ''; },
  wire(b) { if (window.DeckClock) DeckClock.mount(b, { lang: state.lang }); } },
{ id:'qr', em:'🔳', icon:'qr', en:'QR Code Generator', vi:'Tạo mã QR', w:300, h:200, soon:true, html: soonHtml }
];

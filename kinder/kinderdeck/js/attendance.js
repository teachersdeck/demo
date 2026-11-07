/* KinderDeck Attendance (v0.4.21): linked to the Student Roster.
   The list is the roster itself, so a new, edited or removed child shows up here at once. Each child has three check marks:
   green = present, yellow = late, red = absent (tap again to clear). Children are listed in one list by their full Vietnamese name with date
   of birth and parents' names beside it, because two children in a class can share the same name; marks are kept against the
   child (not the name), and a location dropdown picks the campus (v0.4.23: each row is the name and date of birth), one record per day in state.att2 = {'YYYY-MM-DD': {childId: 'p' | 'l' | 'a'}}. Tap a name to open that
   child's card. The Owner Dashboard's "Attendance today" reads the same records (window.ATT). While demo data is on, the demo
   children are listed at the bottom (kept by name). */
(() => {
  const pad = n => String(n).padStart(2, '0'), todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  let day = '', q = '', loc = '';  // loc: this widget's own campus choice ('all' or a campus id); starts at the campus chosen at the top of the app
  const curLoc = () => loc || state.loc || 'all';
  const curDay = () => day || (day = todayISO());
  const rec = () => state.att2 || (state.att2 = {});
  const dayRec = d => rec()[d] || (rec()[d] = {});
  const MARKS = [['p', 'Present', 'Có mặt'], ['l', 'Late', 'Đến muộn'], ['a', 'Absent', 'Vắng']];

  /* everyone who can be marked: the roster (this campus), then the demo children while demo data is on */
  function items(at) {
    const L_ = at || curLoc(), ok = id => L_ === 'all' || id === L_;
    const live = KF.allStudents().filter(s => ok(s.loc)).map(s => ({key:s.sid, n:s.n, dob:s.dob, fid:s.fid, m:KF.ageM(s.dob)}));
    const demo = demoOn() ? KD.kids.filter(k => ok(k.l)).map(k => ({key:'d:' + k.n, n:k.n, demo:true})) : [];
    return {live, demo};
  }
  function counts(d, at) {
    const r = rec()[d] || {}, it = items(at), all = it.live.concat(it.demo), c = {p:0, l:0, a:0, total:all.length};
    all.forEach(x => { if (r[x.key]) c[r[x.key]]++; }); c.marked = c.p + c.l + c.a; return c;
  }
  window.ATT = {counts, label() { const c = counts(todayISO(), state.loc || 'all'); return c.marked ? Math.round((c.p + c.l) / c.marked * 100) + '%' : '–'; }};

    const chk = (key, m, cur, name) => `<button class="att-chk ${m[0]}${cur === m[0] ? ' on' : ''}" data-mk="${esc(key)}|${m[0]}" aria-pressed="${cur === m[0]}" aria-label="${esc(name)}: ${esc(L(m[1], m[2]))}" title="${esc(L(m[1], m[2]))}">✓</button>`;

  const W = WIDGETS.find(w => w.id === 'attendance');
  Object.assign(W, { w:600, h:620,
    html() {
      const d = curDay(), r = dayRec(d), nq = norm(q), it = items(), c = counts(d);
      const match = x => !nq || norm(x.n).includes(nq);
      const live = it.live.filter(match).sort((a, b) => a.n.localeCompare(b.n, 'vi') || (a.dob || '').localeCompare(b.dob || ''));  // one list, by name
      const row = x => `<div class="arow att-row" style="align-items:center"><span class="name" style="white-space:normal"><b class="att-name" data-open="${x.key}">${esc(x.n)}</b>${x.dob ? ` <small class="muted">${esc(KF.dmy(x.dob))}</small>` : ''}</span>${MARKS.map(m => chk(x.key, m, r[x.key], x.n)).join('')}</div>`;
      const demo = it.demo.filter(match);
      const head = `<div class="arow att-head"><span class="name"></span>${MARKS.map(m => `<span class="att-lab ${m[0]}">${esc(L(m[1], m[2]))}</span>`).join('')}</div>`;
      return `<div class="ss-root">
        <div class="btn-row" style="align-items:center;margin-bottom:8px"><button class="wbtn sm" data-dn="-1" aria-label="${L('Previous day', 'Ngày trước')}">‹</button>
          <input type="date" id="att-d" value="${d}" style="background:var(--ink-1);border:1px solid var(--line);border-radius:8px;color:var(--text-hi);padding:5px 8px;font-family:'Inter';font-size:12.5px;color-scheme:dark">
          <button class="wbtn sm" data-dn="1" aria-label="${L('Next day', 'Ngày sau')}">›</button>${d !== todayISO() ? `<button class="wbtn sm" data-dn="0">${L('Today', 'Hôm nay')}</button>` : ''}<span style="flex:1"></span>
          <select id="att-loc" aria-label="${L('Location', 'Cơ sở')}" style="background:var(--ink-1);border:1px solid var(--line);border-radius:8px;color:var(--text-hi);padding:5px 8px;font-family:'Inter';font-size:12.5px"><option value="all"${curLoc() === 'all' ? ' selected' : ''}>${L('All locations', 'Tất cả cơ sở')}</option>${KD.locs.map(l => `<option value="${l.id}"${curLoc() === l.id ? ' selected' : ''}>${esc(l[state.lang])}</option>`).join('')}</select>
          <button class="wbtn sm" id="att-all">${L('Mark all present', 'Tất cả có mặt')}</button><button class="wbtn sm" id="att-clr">${L('Clear day', 'Xóa ngày')}</button></div>
        ${tiles([[c.p, L('Present', 'Có mặt')], [c.l, L('Late', 'Đến muộn')], [c.a, L('Absent', 'Vắng')], [c.total - c.marked, L('Not marked', 'Chưa điểm danh')]])}
        <input type="text" id="att-q" placeholder="${L('Search child (diacritics optional)', 'Tìm bé (có hoặc không dấu)')}" value="${esc(q)}" style="width:100%;margin:8px 0;background:var(--ink-1);border:1px solid var(--line);border-radius:8px;color:var(--text-hi);padding:6px 8px;font-family:'Inter';font-size:12.5px">
        ${it.live.length ? '' : `<p class="empty">${L('No children in the Student Roster yet. Add or import them there and they appear here.', 'Chưa có bé nào trong Danh sách học sinh. Hãy thêm hoặc nhập ở đó, các bé sẽ hiện ở đây.')}</p>`}
        ${live.length ? head + live.map(row).join('') : ''}
        ${demo.length ? `<h4 class="wh">${L('Demo children', 'Trẻ mẫu')} <span class="badge">${L('demo', 'mẫu')}</span></h4>${demo.map(row).join('')}` : ''}
        <p class="hint" style="margin-top:8px">${L('This list is the Student Roster. Green is present, yellow is late, red is absent; tap a mark again to clear it. Tap a name to open the child’s card. The date of birth tells apart children who share a name. Pick the location above.', 'Danh sách này lấy từ Danh sách học sinh. Xanh là có mặt, vàng là đến muộn, đỏ là vắng; bấm lại dấu để xóa. Bấm vào tên để mở thẻ của bé. Ngày sinh giúp phân biệt các bé trùng tên. Chọn cơ sở ở phía trên.')}</p></div>`;
    },
    wire(b, rp) {
      const d = curDay(), after = () => { saveState(); rp(); refreshWidget('dashboard'); };
      b.querySelectorAll('[data-mk]').forEach(x => x.onclick = () => { const [key, m] = x.dataset.mk.split('|'), r = dayRec(d); if (r[key] === m) delete r[key]; else r[key] = m; after(); });
      b.querySelectorAll('[data-open]').forEach(x => x.onclick = () => { if (!x.dataset.open.startsWith('d:')) KF.openKid(x.dataset.open); });
      b.querySelectorAll('[data-dn]').forEach(x => x.onclick = () => { day = +x.dataset.dn ? shift(d, +x.dataset.dn) : todayISO(); rp(); });
      b.querySelector('#att-loc').onchange = e => { loc = e.target.value; rp(); };
      const di = b.querySelector('#att-d'); di.onchange = () => { if (di.value) { day = di.value; rp(); } };
      b.querySelector('#att-all').onclick = () => { const r = dayRec(d), it = items(); it.live.concat(it.demo).forEach(x => { if (!r[x.key]) r[x.key] = 'p'; }); after(); };
      b.querySelector('#att-clr').onclick = () => { if (!Object.keys(dayRec(d)).length) return; if (!confirm(L('Clear every mark for this day?', 'Xóa mọi dấu điểm danh của ngày này?'))) return; delete rec()[d]; after(); };
      const qi = b.querySelector('#att-q'); qi.oninput = () => { q = qi.value; const at = qi.selectionStart; rp(); const n = b.querySelector('#att-q'); n.focus(); n.setSelectionRange(at, at); };
    } });
})();

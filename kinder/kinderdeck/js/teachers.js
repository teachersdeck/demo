/* KinderDeck Classes for teachers (v0.5.0; school info v0.6.0): the bridge to TinyTeachersDeck (scope step 2; contracts in ../contracts).
   The office makes each class here (name, campus, the teacher's Google email, which children are in it) and publishes it
   to the suite backend with the school's AdminDeck key. Teachers then see the class in TinyTeachersDeck: My Class,
   Attendance, Daily Report, Notes to Parents. Sync brings the teachers' attendance back into KinderDeck's Attendance.

   What leaves this browser is the allow-list only (contracts/teacher-allowlist.json): the child's name, age group and
   parents' names and phones. Never the child ID, CCCD, bank account, address, date of birth or fees.
   v0.7.0: children's photos, only when the school switches them on (state.tsync.photos, off by default; for when the
   families have agreed). A photo is taken or chosen per child here, cut square and made small (160 px JPEG) in the
   browser, kept in KinderDeck's IndexedDB ('cp:' + child id), and sent with the class (backend v2.26.0). Turned off,
   the next publish removes the photos from the teachers' and families' apps.
   The key is kept in this browser (state.tsync.key), as AdminDeck keeps its own. */
(() => {
  const BASE = 'https://backend.demo.invalid';   // the suite backend (AdminDeck uses the same)
  const ts = () => state.tsync || (state.tsync = {key:'', classes:[], last:{}});
  const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  let open = null, busy = '', msg = '';
  const pad = n => String(n).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  const PH = {};   // child id -> the small photo (data URL), from IndexedDB (js/app.js's idb, loaded after this file)
  let phLoad = null;
  function loadPhotos() {
    if (phLoad || typeof idb === 'undefined') return;
    phLoad = idb.tx('readonly', st => st.getAll()).then(all => {
      (all || []).forEach(r => { if (r && typeof r.id === 'string' && r.id.startsWith('cp:') && r.url) PH[r.id.slice(3)] = r.url; });
      if (Object.keys(PH).length && typeof renderWidget === 'function') renderWidget('tclasses');
    }).catch(() => {});
  }
  /* A photo file -> a 160 px square JPEG (the middle of the picture), small enough to travel with the class. */
  function smallPhoto(file) {
    return new Promise((ok, no) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url);
        const n = Math.min(im.naturalWidth, im.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 160;
        c.getContext('2d').drawImage(im, (im.naturalWidth - n) / 2, (im.naturalHeight - n) / 2, n, n, 0, 0, 160, 160);
        let q = 0.75, d = c.toDataURL('image/jpeg', q); while (d.length > 20000 && q > 0.3) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
        ok(d); };
      im.onerror = () => { URL.revokeObjectURL(url); no(new Error('image')); };
      im.src = url;
    });
  }

  async function post(fn, body) {
    const r = await fetch(`${BASE}/${fn}`, {method:'POST', headers:{'Content-Type':'application/json', 'X-Admin-Secret':ts().key}, body:JSON.stringify(body)});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 ? L('The school key was refused.', 'Mã trường không đúng.') : (j.errors && j.errors[0] ? `${j.errors[0].field}: ${j.errors[0].code}` : j.error || ('HTTP ' + r.status)));
    return j;
  }
  /* One child as published (contracts/schemas/child.schema.json). childId is KinderDeck's own id. */
  function published(s) {
    const pars = KF.parsOf(s.fid) || [];
    const rel = r => r === 'Ba' ? L('Father', 'Bố') : r === 'Mẹ' ? L('Mother', 'Mẹ') : r;
    return {childId:s.sid, firstName:s.n, ageGroup:KF.group(KF.ageM(s.dob)) || undefined, ...(ts().photos && PH[s.sid] ? {photo:PH[s.sid]} : {}),
      guardians:pars.filter(p => p.n).map(p => ({name:p.n, relationship:rel(p.rel), ...(p.phone ? {phone:p.phone, zalo:p.phone} : {}), authorisedPickup:true}))};
  }

  const W = { id:'tclasses', em:'🧑‍🏫', icon:'school', en:'Classes for teachers', vi:'Lớp cho giáo viên', w:520, h:600,
    html() {
      loadPhotos();
      const T = ts(), kids = KF.allStudents().slice().sort((a, b) => a.n.localeCompare(b.n, 'vi')), inAny = new Set(T.classes.flatMap(c => c.sids));
      const locName = id => { const l = KD.locs.find(x => x.id === id); return l ? l[state.lang] : ''; };
      const card = c => {
        const last = T.last[c.key], ex = open === c.key;
        return `<div class="tc-card${ex ? ' open' : ''}">
          <div class="tc-head"><button class="wbtn sm" data-tc-open="${c.key}">${ex ? '▾' : '▸'}</button><b>${esc(c.name || L('(no name)', '(chưa đặt tên)'))}</b>
            <span class="muted">${c.sids.length} ${L('children', 'bé')} · ${esc(c.email || L('no teacher yet', 'chưa có giáo viên'))}</span>
            <button class="wbtn sm primary" data-tc-pub="${c.key}" ${busy ? 'disabled' : ''}>${busy === c.key ? L('Publishing…', 'Đang gửi…') : L('Publish', 'Gửi cho giáo viên')}</button></div>
          ${last ? `<p class="hint">${L('Last published', 'Gửi lần cuối')} ${esc(new Date(last.at).toLocaleString(state.lang === 'vi' ? 'vi-VN' : 'en-GB'))}: ${last.added} ${L('new', 'mới')}, ${last.updated} ${L('updated', 'cập nhật')}, ${last.deactivated} ${L('left the class', 'rời lớp')}</p>` : `<p class="hint">${L('Not published yet.', 'Chưa gửi.')}</p>`}
          ${ex ? `<div class="tc-edit">
            <label class="kx-rate">${L('Class name', 'Tên lớp')}<input type="text" data-tc-f="${c.key}:name" value="${esc(c.name)}" maxlength="80"></label>
            <label class="kx-rate">${L('Teacher’s Google email', 'Email Google của giáo viên')}<input type="email" data-tc-f="${c.key}:email" value="${esc(c.email)}"></label>
            ${KD.locs.length > 1 ? `<label class="kx-rate">${L('Campus', 'Cơ sở')}<select data-tc-f="${c.key}:loc">${KD.locs.map(l => `<option value="${l.id}"${l.id === c.loc ? ' selected' : ''}>${esc(l[state.lang])}</option>`).join('')}</select></label>` : ''}
            <p class="hint">${L('Children in this class (tick):', 'Các bé trong lớp (đánh dấu):')}</p>
            <div class="tc-kids">${kids.filter(s => !c.loc || !s.loc || s.loc === c.loc).map(s => `<label class="tc-kid${!c.sids.includes(s.sid) && inAny.has(s.sid) ? ' other' : ''}"><input type="checkbox" data-tc-kid="${c.key}:${s.sid}" ${c.sids.includes(s.sid) ? 'checked' : ''}> ${esc(s.n)} <span class="muted">${esc(KF.group(KF.ageM(s.dob)) || '')}</span>${T.photos ? `<span class="tc-ph-wrap"><button type="button" class="tc-ph" data-tc-ph="${s.sid}" title="${PH[s.sid] ? L('Change the photo', 'Đổi ảnh') : L('Add a photo', 'Thêm ảnh')}" aria-label="${PH[s.sid] ? L('Change the photo', 'Đổi ảnh') : L('Add a photo', 'Thêm ảnh')}">${PH[s.sid] ? `<img src="${PH[s.sid]}" alt="">` : '📷'}</button>${PH[s.sid] ? `<button type="button" class="tc-ph-x" data-tc-phx="${s.sid}" aria-label="${L('Remove the photo', 'Gỡ ảnh')}">×</button>` : ''}</span>` : ''}</label>`).join('') || `<p class="empty">${L('Add children in the Student Roster first.', 'Hãy thêm bé trong Danh sách học sinh trước.')}</p>`}</div>
            <div class="btn-row"><button class="wbtn sm" data-tc-del="${c.key}">${L('Remove this class here', 'Xóa lớp này ở đây')}</button></div>
          </div>` : ''}</div>`;
      };
      return `<p class="hint">${L('Make each class, choose its teacher and children, then publish. The teacher sees it in TinyTeachersDeck. Only names, age groups and parents’ names and phones are sent: never ID numbers, bank accounts, addresses or dates of birth.', 'Tạo từng lớp, chọn giáo viên và các bé, rồi gửi. Giáo viên sẽ thấy lớp trong TinyTeachersDeck. Chỉ gửi tên, nhóm tuổi, tên và SĐT phụ huynh: không bao giờ gửi số định danh, CCCD, tài khoản ngân hàng, địa chỉ hay ngày sinh.')}</p>
        <details class="tc-key"${T.key ? '' : ' open'}><summary>${T.key ? '🔑 ' + L('School key saved', 'Đã lưu mã trường') : '🔑 ' + L('School key', 'Mã trường')}</summary>
          <div class="btn-row"><input type="password" id="tc-key" placeholder="${L('The school’s AdminDeck key', 'Mã AdminDeck của trường')}" value="${esc(T.key)}" autocomplete="off" style="flex:1"><button class="wbtn sm" id="tc-key-save">${L('Save', 'Lưu')}</button></div>
          <p class="hint">${L('Kept in this browser only. TeachersDeck gives each school its key.', 'Chỉ lưu trong trình duyệt này. TeachersDeck cấp mã cho mỗi trường.')}</p></details>
        <label class="tc-photos"><input type="checkbox" id="tc-photos" ${T.photos ? 'checked' : ''}> 📷 ${L('Send children’s photos to their teachers and families', 'Gửi ảnh của bé cho giáo viên và phụ huynh của bé')}</label>
        <p class="hint">${T.photos ? L('On. Add a photo next to each child in a class, then publish the class. Turn it off and publish again to remove the photos.', 'Đang bật. Thêm ảnh bên cạnh từng bé trong lớp, rồi gửi lại lớp. Tắt và gửi lại lớp để gỡ ảnh.') : L('Off: no photos leave KinderDeck. Turn it on only when the families have agreed.', 'Đang tắt: không có ảnh nào rời KinderDeck. Chỉ bật khi phụ huynh đã đồng ý.')}</p>
        <input type="file" id="tc-ph-file" accept="image/*" hidden>
        <div class="btn-row"><button class="wbtn" id="tc-info" ${busy || !T.key ? 'disabled' : ''}>${busy === 'info' ? L('Sending…', 'Đang gửi…') : '📤 ' + L('Send menu, notices and calendar', 'Gửi thực đơn, thông báo, lịch')}</button>
          <button class="wbtn" id="tc-fix" ${busy || !T.key ? 'disabled' : ''}>${busy === 'fix' ? L('Sending…', 'Đang gửi…') : '✏️ ' + L('Send today’s office corrections', 'Gửi sửa điểm danh hôm nay')}</button></div>
        ${T.info ? `<p class="hint">${L('School information last sent', 'Đã gửi thông tin trường lúc')} ${esc(new Date(T.info.at).toLocaleString(state.lang === 'vi' ? 'vi-VN' : 'en-GB'))}: ${T.info.menuDays} ${L('menu days', 'ngày thực đơn')}, ${T.info.notices} ${L('notices', 'thông báo')}, ${T.info.calendar} ${L('events', 'sự kiện')}.</p>` : ''}
        <div class="btn-row"><button class="wbtn primary" id="tc-new">＋ ${L('New class', 'Thêm lớp')}</button><button class="wbtn" id="tc-sync" ${busy || !T.key ? 'disabled' : ''}>${busy === 'sync' ? L('Syncing…', 'Đang đồng bộ…') : '⟳ ' + L('Bring in today’s attendance', 'Lấy điểm danh hôm nay')}</button></div>
        ${msg ? `<p class="hint">${esc(msg)}</p>` : ''}
        ${T.classes.map(card).join('') || `<p class="empty">${L('No classes yet.', 'Chưa có lớp nào.')}</p>`}`;
    },
    wire(b, rp) {
      const T = ts(), find = k => T.classes.find(c => c.key === k), after = () => { saveState(); rp(); };
      b.querySelector('#tc-key-save').onclick = () => { T.key = b.querySelector('#tc-key').value.trim(); msg = ''; after(); };
      b.querySelector('#tc-photos').onchange = e => {
        if (e.target.checked && !confirm(L('Send children’s photos? Only when their families have agreed. Each photo goes to the class’s teachers and to that child’s own family.', 'Gửi ảnh của bé? Chỉ khi phụ huynh đã đồng ý. Mỗi ảnh đến giáo viên của lớp và phụ huynh của chính bé đó.'))) { e.target.checked = false; return; }
        T.photos = e.target.checked; msg = T.photos ? '' : L('Photos off. Publish each class again to remove the photos already sent.', 'Đã tắt ảnh. Gửi lại từng lớp để gỡ ảnh đã gửi.'); after(); };
      let phFor = null; const phIn = b.querySelector('#tc-ph-file');
      b.querySelectorAll('[data-tc-ph]').forEach(x => x.onclick = e => { e.preventDefault(); phFor = x.dataset.tcPh; phIn.value = ''; phIn.click(); });
      phIn.onchange = async () => { const f = phIn.files && phIn.files[0], sid = phFor; if (!f || !sid) return;
        try { const url = await smallPhoto(f); PH[sid] = url; await idb.put({id:'cp:' + sid, url}); msg = L('Photo saved. Publish the class to send it.', 'Đã lưu ảnh. Gửi lại lớp để gửi ảnh.'); }
        catch (err) { msg = L('That file is not a picture KinderDeck can read.', 'Tệp này không phải ảnh KinderDeck đọc được.'); }
        rp(); };
      b.querySelectorAll('[data-tc-phx]').forEach(x => x.onclick = async e => { e.preventDefault(); const sid = x.dataset.tcPhx; delete PH[sid]; try { await idb.del('cp:' + sid); } catch (err) {} msg = L('Photo removed here. Publish the class to remove it for the teachers too.', 'Đã gỡ ảnh ở đây. Gửi lại lớp để gỡ cả ở giáo viên.'); rp(); });
      b.querySelector('#tc-new').onclick = () => { const c = {key:uid(), name:'', email:'', loc:(state.loc && state.loc !== 'all') ? state.loc : (KD.locs[0] || {}).id, sids:[]}; T.classes.push(c); open = c.key; after(); };
      b.querySelectorAll('[data-tc-open]').forEach(x => x.onclick = () => { open = open === x.dataset.tcOpen ? null : x.dataset.tcOpen; rp(); });
      b.querySelectorAll('[data-tc-f]').forEach(x => x.onchange = () => { const [k, f] = x.dataset.tcF.split(':'), c = find(k); if (c) { c[f] = x.value.trim(); after(); } });
      b.querySelectorAll('[data-tc-kid]').forEach(x => x.onchange = () => { const [k, sid] = x.dataset.tcKid.split(':'), c = find(k); if (!c) return; c.sids = x.checked ? [...new Set(c.sids.concat(sid))] : c.sids.filter(s => s !== sid); saveState(); });
      b.querySelectorAll('[data-tc-del]').forEach(x => x.onclick = () => { if (!confirm(L('Remove this class from KinderDeck? It stays with the teacher until you publish again.', 'Xóa lớp này khỏi KinderDeck? Giáo viên vẫn thấy lớp cho đến lần gửi sau.'))) return; T.classes = T.classes.filter(c => c.key !== x.dataset.tcDel); delete T.last[x.dataset.tcDel]; after(); });
      b.querySelectorAll('[data-tc-pub]').forEach(x => x.onclick = async () => {
        const c = find(x.dataset.tcPub); if (!c) return;
        if (!T.key) { msg = L('Save the school key first.', 'Hãy lưu mã trường trước.'); return rp(); }
        if (!c.name) { msg = L('Give the class a name first.', 'Hãy đặt tên lớp trước.'); return rp(); }
        const kids = KF.allStudents().filter(s => c.sids.includes(s.sid)).map(published);
        busy = c.key; msg = ''; rp();
        try { const r = await post('kinderPublishRoster', {classKey:c.key, className:c.name, teacherEmail:c.email || undefined, children:kids});
          T.last[c.key] = {at:Date.now(), classId:r.classId, added:r.added, updated:r.updated, deactivated:r.deactivated};
          const nPh = T.photos ? kids.filter(k => k.photo).length : 0;
          msg = L(`Published ${c.name}.`, `Đã gửi ${c.name}.`) + (nPh ? ' ' + L(`${nPh} photo(s) included.`, `Kèm ${nPh} ảnh.`) : '') + (r.rejected && r.rejected.length ? ' ' + L(`${r.rejected.length} child(ren) had no name and were skipped.`, `${r.rejected.length} bé thiếu tên nên đã bỏ qua.`) : '');
        } catch (e) { msg = e.message === 'teacherEmail: not_signed_in_yet' ? L('That teacher has not signed in to TinyTeachersDeck yet. Ask them to sign in once, then publish again.', 'Giáo viên này chưa đăng nhập TinyTeachersDeck. Nhờ cô đăng nhập một lần rồi gửi lại.') : (e.message || String(e)); }
        busy = ''; saveState(); rp();
      });
      /* v0.6.0: the school's menu (today and the next 13 days, from the kitchen book), notices (Announcements Board) and calendar
         (holidays and the school's events from today) to every class published to teachers. Nothing about a child is sent. */
      const inf = b.querySelector('#tc-info');
      if (inf) inf.onclick = async () => {
        busy = 'info'; msg = ''; rp();
        try {
          const t0 = todayISO(), days = {};
          for (let i = 0; i < 14; i++) { const d = new Date(t0 + 'T00:00:00'); d.setDate(d.getDate() + i); const iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            const m = window.KX && KX.menuOf ? KX.menuOf(iso) : null; if (m && m.length) days[iso] = m; }
          const notices = state.notes.slice(0, 30).map((n, i) => { const x = noteOf(n), lines = x.text.split('\n'); return {id:'kn' + i, title:lines[0].slice(0, 120), body:lines.slice(1).join('\n').trim().slice(0, 1000), date:x.date || t0}; });
          const calendar = schoolEvents().filter(e => e.date >= t0).slice(0, 80).map(e => ({id:e.id, title:e.title, date:e.date, time:e.time || ''}));
          const r = await post('kinderPublishSchoolInfo', {menu:{days}, notices, calendar});
          ts().info = {at:Date.now(), menuDays:r.menuDays, notices:r.notices, calendar:r.calendar};
          msg = L(`Sent to ${r.classes} class(es).`, `Đã gửi cho ${r.classes} lớp.`);
        } catch (e) { msg = e.message || String(e); }
        busy = ''; saveState(); rp();
      };
      /* v0.6.0: the office's attendance corrections for today: every child of a published class whose mark in KinderDeck's
         Attendance differs from what the teachers recorded (as last brought in) goes to the backend as an office correction. */
      const fix = b.querySelector('#tc-fix');
      if (fix) fix.onclick = async () => {
        const T = ts(), d = todayISO(), mine = (state.att2 || {})[d] || {}, theirs = (T.synced || {})[d];
        if (!theirs) { msg = L('Bring in today’s attendance first, then correct it in Attendance.', 'Hãy lấy điểm danh hôm nay trước, rồi sửa trong Điểm danh.'); return rp(); }
        const word = {p:'present', l:'late', a:'absent'}, todo = Object.keys(mine).filter(k => (T.map || {})[k] && word[mine[k]] && mine[k] !== theirs[k]);
        if (!todo.length) { msg = L('Nothing to correct: KinderDeck and the teachers agree.', 'Không có gì để sửa: KinderDeck và giáo viên khớp nhau.'); return rp(); }
        busy = 'fix'; msg = ''; rp();
        let ok = 0; const bad = [];
        for (const k of todo) { try { await post('kinderCorrectAttendance', {studentId:T.map[k], date:d, record:{status:word[mine[k]]}}); theirs[k] = mine[k]; ok++; } catch (e) { bad.push(e.message || String(e)); } }
        msg = L(`${ok} correction(s) sent; the teacher sees “changed by the office”.`, `Đã gửi ${ok} sửa đổi; giáo viên sẽ thấy “văn phòng đã sửa”.`) + (bad.length ? ' ' + bad[0] : '');
        busy = ''; saveState(); rp();
      };
      const sy = b.querySelector('#tc-sync');
      if (sy) sy.onclick = async () => {
        busy = 'sync'; msg = ''; rp();
        try {
          const d = todayISO(), r = await post('kinderClassSync', {from:d, to:d}), att = state.att2 || (state.att2 = {}), day = att[d] || (att[d] = {});
          let n = 0; const code = {present:'p', late:'l', absent:'a'};
          const T = ts(), map = T.map || (T.map = {}), synced = T.synced || (T.synced = {}); synced[d] = {};
          (r.classes || []).forEach(c => c.children.forEach(k => { if (k.kdChildId) map[k.kdChildId] = k.studentId;
            const a = k.attendance && k.attendance[d]; if (a && code[a.status] && k.kdChildId) { day[k.kdChildId] = code[a.status]; synced[d][k.kdChildId] = code[a.status]; n++; } }));
          msg = L(`${n} attendance marks brought in from the teachers.`, `Đã lấy ${n} dấu điểm danh từ giáo viên.`);
          if (typeof renderWidget === 'function') { renderWidget('attendance'); renderWidget('dashboard'); }
        } catch (e) { msg = e.message || String(e); }
        busy = ''; saveState(); rp();
      };
    } };
  const at = WIDGETS.findIndex(w => w.id === 'roster');
  WIDGETS.splice(at < 0 ? WIDGETS.length : at + 1, 0, W);
})();

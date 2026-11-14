'use strict';
/* UniStudentDeck — graduate tools (UniDeck phase 5, v0.13.0). UniStudentDeck's own file, loaded after
   js/uni-courses-ui.js (it adds to window.UNI_WIDGETS) and js/cite.js, before js/app.js.

   Four widgets, shown when the student turns on graduate tools (Courses → "Graduate tools"; always on in the demo):
   - 🎓 Thesis tracker: chapters with status and word counts, milestones, the thesis due date and word goal.
   - 📚 Citations: a personal library (add by DOI, ISBN or web address, by hand, or from BibTeX), references and in-text
     citations in APA, MLA, Chicago, Harvard or IEEE (js/cite.js), export as .bib.
   - 🧪 Lab log: dated entries with tags and links, search, export as Markdown.
   - 🧑‍🏫 Supervisor notes: meetings with agenda, notes and action items. If the student turns it on, a read-only copy of
     the meetings (and, if ticked, thesis progress) goes to the supervisors they link with a one-time code, who read it
     in LectureDeck (backend v2.21.0, supervision.js). It is published again after every change.
   Everything lives on this device (localStorage), like the other study widgets: "Back up" in the Thesis tracker saves all
   four as one file, "Restore" brings them back. The citations library and the lab log are never sent anywhere. */
(function () {
  const C = window.UniCourses, X = window.UDCite;
  const DEMO = typeof SD_DEMO !== 'undefined' && SD_DEMO.active;
  let on = DEMO;
  try { on = on || localStorage.getItem('ud_grad') === '1'; } catch (e) {}
  window.UDGrad = Object.freeze({ on, set(v) { try { localStorage.setItem('ud_grad', v ? '1' : '0'); } catch (e) {} location.reload(); } });
  if (!on || !X) return;

  const h = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (m) => (typeof toast === 'function' ? toast(m, 3600) : alert(m));
  // English or Vietnamese from <html lang> (js/lang.js, Settings → Language). References themselves stay in the style's language.
  const VI = () => /^vi/i.test(document.documentElement.lang || '');
  const T = (en, vi) => (VI() ? vi : en);
  const LOC = () => (VI() ? 'vi-VN' : []);
  const TYPE = (k) => (VI() ? { article: 'Bài báo khoa học', book: 'Sách', chapter: 'Chương sách', web: 'Trang web', thesis: 'Luận văn', report: 'Báo cáo', other: 'Khác' }[k] : X.TYPES[k]) || T('Other', 'Khác');
  const day = (ms) => (ms ? new Date(ms).toLocaleDateString(LOC(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const when = (ms) => (ms ? new Date(ms).toLocaleString(LOC(), { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const dateInput = (ms) => { if (!ms) return ''; const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const dtInput = (ms) => { const d = new Date(ms || Date.now()); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fromDate = (v) => (v ? new Date(v + 'T12:00').getTime() : null);
  const fromDt = (v) => (v ? new Date(v).getTime() : Date.now());
  const rid = (p) => p + Math.random().toString(36).slice(2, 9);
  const lines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const commas = (v) => [...new Set(String(v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))];
  const n0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const link = (s) => h(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
  const today = () => new Date().toISOString().slice(0, 10);

  /* ---- this device's data ---- */
  const KEYS = { thesis: 'ud_thesis', cite: 'ud_cite', lab: 'ud_lablog', meet: 'ud_meetings' };
  const EMPTY = { thesis: { title: '', dueAtMs: null, wordGoal: 0, chapters: [], milestones: [] }, cite: { style: 'apa', refs: [] }, lab: [], meet: [] };
  const load = (k) => { try { const v = JSON.parse(localStorage.getItem(KEYS[k]) || 'null'); return v || JSON.parse(JSON.stringify(EMPTY[k])); } catch (e) { return JSON.parse(JSON.stringify(EMPTY[k])); } };
  const save = (k, v) => { try { localStorage.setItem(KEYS[k], JSON.stringify(v)); } catch (e) { say(T('Couldn’t save on this device (storage full?).', 'Không lưu được trên thiết bị này (bộ nhớ đầy?).')); } if (k === 'thesis' || k === 'meet') publishSoon(); fire(k); };
  const subs = {};
  const fire = (k) => (subs[k] || []).forEach((f) => { try { f(); } catch (e) {} });
  const listen = (k, f) => { (subs[k] = subs[k] || []).push(f); return () => { subs[k] = subs[k].filter((x) => x !== f); }; };
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type: type || 'text/plain;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function copy(plain, html) {
    try {
      if (html && window.ClipboardItem && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([plain], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      else await navigator.clipboard.writeText(plain);
      say(T('Copied.', 'Đã sao chép.'));
    } catch (e) { say(plain); }
  }

  if (DEMO && !localStorage.getItem(KEYS.thesis)) seedDemo();

  /* ---- sharing with the supervisor: publish a fresh copy after changes, if the student turned it on ---- */
  let pubTimer = null;
  function publishSoon(now) {
    clearTimeout(pubTimer);
    pubTimer = setTimeout(publishNow, now ? 0 : 2500);
  }
  async function publishNow() {
    let share = false; try { share = localStorage.getItem('ud_sup_share') === '1'; } catch (e) {}
    if (!share || !C || !C.available()) return null;
    const s = C.state();
    if (!s.user || s.role !== 'unistudent') return null;
    try { const r = await C.publishSupervision({ meetings: load('meet'), thesis: load('thesis') }); fire('shared'); return r; }
    catch (e) { if (/Turn on sharing/.test(String(e && e.message))) { try { localStorage.setItem('ud_sup_share', '0'); } catch (x) {} } return null; }
  }

  /* ================= 🎓 Thesis tracker ================= */
  const STATUS = () => [['planned', T('Planned', 'Dự kiến')], ['drafting', T('Drafting', 'Đang viết')], ['revising', T('Revising', 'Đang sửa')], ['done', T('Done', 'Xong')]];
  function renderThesis(body) {
    let editHead = false;
    function draw() {
      const t = load('thesis');
      const words = t.chapters.reduce((s, c) => s + (c.words || 0), 0);
      const goal = t.wordGoal || t.chapters.reduce((s, c) => s + (c.goal || 0), 0);
      const pct = goal ? Math.min(100, Math.round((words / goal) * 100)) : 0;
      const left = t.dueAtMs ? Math.ceil((t.dueAtMs - Date.now()) / 864e5) : null;
      const done = t.chapters.filter((c) => c.status === 'done').length;
      body.innerHTML = `<div class="ud-pad">
        ${editHead || !t.title ? `<form class="ud-card" data-head><label class="ud-lbl">${T('Thesis title', 'Tên luận văn')}<input name="title" maxlength="200" value="${h(t.title)}" placeholder="${T('Working title', 'Tên tạm')}" required></label>
          <div class="row"><label class="ud-lbl">${T('Due', 'Hạn nộp')}<input type="date" name="due" value="${dateInput(t.dueAtMs)}"></label><label class="ud-lbl">${T('Word goal', 'Mục tiêu số từ')}<input type="number" min="0" step="1000" name="goal" value="${t.wordGoal || ''}" placeholder="80000"></label></div>
          <div class="row"><button class="btn primary">${T('Save', 'Lưu')}</button>${t.title ? `<button type="button" class="btn" data-cancel>${T('Cancel', 'Hủy')}</button>` : ''}</div></form>`
        : `<div class="ud-card"><div class="row" style="justify-content:space-between"><p class="ud-k">${h(t.title)}</p><button class="btn" data-edit>${T('Edit', 'Sửa')}</button></div>
          <p class="muted">${t.dueAtMs ? `${T('Due', 'Hạn nộp')} ${h(day(t.dueAtMs))}${left !== null ? ` · ${left >= 0 ? T(`${left} day${left === 1 ? '' : 's'} left`, `còn ${left} ngày`) : T(`${-left} days past`, `quá hạn ${-left} ngày`)}` : ''}` : T('No due date', 'Chưa có hạn nộp')} · ${T(`${done}/${t.chapters.length} chapter${t.chapters.length === 1 ? '' : 's'} done`, `xong ${done}/${t.chapters.length} chương`)}</p>
          <div class="ud-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
          <p class="muted">${T(`${words.toLocaleString()} ${goal ? `of ${goal.toLocaleString()} ` : ''}words`, `${words.toLocaleString('vi-VN')}${goal ? `/${goal.toLocaleString('vi-VN')}` : ''} từ`)}${goal ? ` · ${pct}%` : ''}</p></div>`}
        <p class="ud-k">${T('Chapters', 'Các chương')}</p>
        <table class="ud-tbl ud-chap"><thead><tr><th>${T('Chapter', 'Chương')}</th><th>${T('Status', 'Trạng thái')}</th><th>${T('Words', 'Số từ')}</th><th>${T('Goal', 'Mục tiêu')}</th><th>${T('Due', 'Hạn')}</th><th></th></tr></thead><tbody>
          ${t.chapters.map((c, k) => `<tr data-c="${k}"><td><input data-k="title" value="${h(c.title)}" maxlength="200" aria-label="${T('Chapter title', 'Tên chương')}"></td>
            <td><select data-k="status" aria-label="${T('Status', 'Trạng thái')}">${STATUS().map(([v, l]) => `<option value="${v}" ${c.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
            <td><input type="number" min="0" data-k="words" value="${c.words || 0}" aria-label="${T('Words written', 'Số từ đã viết')}"></td><td><input type="number" min="0" data-k="goal" value="${c.goal || ''}" aria-label="${T('Word goal', 'Mục tiêu số từ')}"></td>
            <td><input type="date" data-k="due" value="${dateInput(c.dueAtMs)}" aria-label="${T('Due', 'Hạn')}"></td>
            <td class="ud-nowrap"><button class="ud-x" data-up="${k}" ${k ? '' : 'disabled'} aria-label="${T('Move up', 'Lên trên')}">▲</button><button class="ud-x" data-rm="${k}" aria-label="${T('Remove chapter', 'Xóa chương')}">×</button></td></tr>`).join('')
            || `<tr><td colspan="6" class="muted">${T('No chapters yet.', 'Chưa có chương nào.')}</td></tr>`}</tbody></table>
        <form class="row" data-addc><input name="t" placeholder="${T('New chapter, e.g. Literature review', 'Chương mới, ví dụ Tổng quan tài liệu')}" maxlength="200" style="flex:1" aria-label="${T('New chapter', 'Chương mới')}"><button class="btn">${T('＋ Chapter', '＋ Chương')}</button></form>
        <p class="ud-k">${T('Milestones', 'Các mốc')}</p>
        <ul class="ud-list">${t.milestones.map((m, k) => `<li class="${m.done ? 'ud-done' : ''}"><label class="ud-check"><input type="checkbox" data-mdone="${k}" ${m.done ? 'checked' : ''}> <span>${h(m.title)}${m.dueAtMs ? ` <span class="muted">· ${h(day(m.dueAtMs))}</span>` : ''}</span></label><button class="ud-x" data-mrm="${k}" aria-label="${T('Remove milestone', 'Xóa mốc')}">×</button></li>`).join('')
          || `<li class="muted">${T('No milestones yet: ethics approval, data collection, full draft…', 'Chưa có mốc nào: phê duyệt đạo đức, thu thập dữ liệu, bản thảo đầy đủ…')}</li>`}</ul>
        <form class="row" data-addm><input name="t" placeholder="${T('New milestone', 'Mốc mới')}" maxlength="200" style="flex:1" aria-label="${T('New milestone', 'Mốc mới')}"><input type="date" name="d" aria-label="${T('Milestone date', 'Ngày của mốc')}"><button class="btn">${T('＋ Milestone', '＋ Mốc')}</button></form>
        <div class="row"><button class="btn" data-w="usupnotes">${T('Supervisor notes →', 'Ghi chú với người hướng dẫn →')}</button><button class="btn" data-backup>${T('Back up graduate tools', 'Sao lưu công cụ sau đại học')}</button><label class="btn">${T('Restore', 'Khôi phục')}<input type="file" accept=".json,application/json" data-restore hidden></label></div>
        <p class="muted">${T('Kept on this device. Back up saves the thesis tracker, citations, lab log and supervisor notes as one file.', 'Lưu trên thiết bị này. Sao lưu sẽ lưu tiến độ luận văn, trích dẫn, nhật ký nghiên cứu và ghi chú với người hướng dẫn vào một tệp.')}</p></div>`;
      const hf = body.querySelector('[data-head]');
      if (hf) {
        hf.onsubmit = (e) => { e.preventDefault(); t.title = hf.title.value.trim(); t.dueAtMs = fromDate(hf.due.value); t.wordGoal = n0(hf.goal.value); editHead = false; save('thesis', t); draw(); };
        const c = hf.querySelector('[data-cancel]'); if (c) c.onclick = () => { editHead = false; draw(); };
      }
      const ed = body.querySelector('[data-edit]'); if (ed) ed.onclick = () => { editHead = true; draw(); };
      body.querySelectorAll('[data-c] [data-k]').forEach((el) => {
        el.onchange = () => { const c = t.chapters[Number(el.closest('[data-c]').dataset.c)], k = el.dataset.k;
          if (k === 'words' || k === 'goal') c[k] = n0(el.value); else if (k === 'due') c.dueAtMs = fromDate(el.value); else c[k] = k === 'title' ? el.value.trim() : el.value;
          save('thesis', t); if (k !== 'title') draw(); };
      });
      body.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => { const k = Number(b.dataset.up); [t.chapters[k - 1], t.chapters[k]] = [t.chapters[k], t.chapters[k - 1]]; save('thesis', t); draw(); }; });
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { if (!confirm(T('Remove this chapter?', 'Xóa chương này?'))) return; t.chapters.splice(Number(b.dataset.rm), 1); save('thesis', t); draw(); }; });
      body.querySelector('[data-addc]').onsubmit = (e) => { e.preventDefault(); const v = e.target.t.value.trim(); if (!v) return; t.chapters.push({ id: rid('c'), title: v, status: 'planned', words: 0, goal: 0, dueAtMs: null }); save('thesis', t); draw(); };
      body.querySelectorAll('[data-mdone]').forEach((el) => { el.onchange = () => { t.milestones[Number(el.dataset.mdone)].done = el.checked; save('thesis', t); draw(); }; });
      body.querySelectorAll('[data-mrm]').forEach((b) => { b.onclick = () => { t.milestones.splice(Number(b.dataset.mrm), 1); save('thesis', t); draw(); }; });
      body.querySelector('[data-addm]').onsubmit = (e) => { e.preventDefault(); const v = e.target.t.value.trim(); if (!v) return; t.milestones.push({ id: rid('k'), title: v, dueAtMs: fromDate(e.target.d.value), done: false });
        t.milestones.sort((a, b) => (a.dueAtMs || 9e15) - (b.dueAtMs || 9e15)); save('thesis', t); draw(); };
      body.querySelector('[data-w]').onclick = () => (typeof openWidget === 'function' ? openWidget('usupnotes') : null);
      body.querySelector('[data-backup]').onclick = () => download(`graduate-tools-${today()}.json`, JSON.stringify({ app: 'UniStudentDeck', kind: 'graduate-tools', savedAt: new Date().toISOString(),
        thesis: load('thesis'), citations: load('cite'), lablog: load('lab'), meetings: load('meet') }, null, 2), 'application/json');
      body.querySelector('[data-restore]').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const d = JSON.parse(await f.text());
          if (d.kind !== 'graduate-tools') throw new Error('x');
          if (!confirm(T('Replace the graduate tools on this device with the ones in this file?', 'Thay công cụ sau đại học trên thiết bị này bằng nội dung trong tệp?'))) return;
          save('thesis', d.thesis || EMPTY.thesis); save('cite', d.citations || EMPTY.cite); save('lab', d.lablog || []); save('meet', d.meetings || []);
          say(T('Restored.', 'Đã khôi phục.')); draw();
        } catch (er) { say(T('That isn’t a graduate tools backup file.', 'Đó không phải tệp sao lưu công cụ sau đại học.')); }
      };
    }
    draw();
    return listen('thesis', () => { if (!body.contains(document.activeElement)) draw(); });
  }

  /* ================= 📚 Citations ================= */
  function renderCitations(body) {
    let editing = null, q = '', tag = '', paste = false;   // editing: null | a draft reference
    function draw() {
      const lib = load('cite');
      const style = X.STYLES[lib.style] ? lib.style : 'apa';
      if (editing) return form(lib);
      const order = style === 'ieee' ? lib.refs : [...lib.refs].sort((a, b) => X.text(X.format(a, style)).localeCompare(X.text(X.format(b, style))));
      const num = new Map(lib.refs.map((r, k) => [r.id, k + 1]));
      const tags = [...new Set(lib.refs.flatMap((r) => r.tags || []))].sort();
      const shown = order.filter((r) => (!tag || (r.tags || []).includes(tag)) && (!q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())));
      body.innerHTML = `<div class="ud-pad">
        <form class="row" data-find><input name="v" placeholder="${T('DOI, ISBN or web address', 'DOI, ISBN hoặc địa chỉ web')}" style="flex:1" aria-label="${T('DOI, ISBN or web address', 'DOI, ISBN hoặc địa chỉ web')}" autocomplete="off"><button class="btn primary">${T('Add', 'Thêm')}</button></form>
        <div class="row"><button class="btn" data-hand>${T('＋ By hand', '＋ Nhập tay')}</button><button class="btn" data-paste>${paste ? T('Close BibTeX', 'Đóng BibTeX') : T('Import BibTeX', 'Nhập BibTeX')}</button><button class="btn" data-bib ${lib.refs.length ? '' : 'disabled'}>${T('Export .bib', 'Xuất .bib')}</button></div>
        ${paste ? `<div class="ud-card"><label class="ud-lbl">${T('Paste BibTeX (from Zotero, Mendeley, Google Scholar…)', 'Dán BibTeX (từ Zotero, Mendeley, Google Scholar…)')}<textarea rows="5" data-bibtext spellcheck="false"></textarea></label>
          <div class="row"><button class="btn primary" data-import>${T('Import', 'Nhập')}</button><label class="btn">${T('Or choose a .bib file', 'Hoặc chọn tệp .bib')}<input type="file" accept=".bib,.txt" data-bibfile hidden></label></div></div>` : ''}
        <div class="row"><label class="ud-pick">${T('Style', 'Kiểu')} <select data-style>${Object.entries(X.STYLES).map(([k, l]) => `<option value="${k}" ${k === style ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <input type="search" data-q value="${h(q)}" placeholder="${T('Search', 'Tìm')}" style="flex:1" aria-label="${T('Search the library', 'Tìm trong thư viện')}"><button class="btn" data-all ${shown.length ? '' : 'disabled'}>${tag || q ? T('Copy these', 'Sao chép các mục này') : T('Copy all', 'Sao chép tất cả')}</button></div>
        ${tags.length ? `<div class="row">${tags.map((t) => `<button class="chip ${t === tag ? 'on' : ''}" data-tag="${h(t)}">${h(t)}</button>`).join('')}</div>` : ''}
        <ul class="ud-list ud-refs">${shown.map((r) => `<li><div class="ud-ref">${X.format(r, style, num.get(r.id))}</div>
          <div class="row"><span class="muted">${h(TYPE(r.type))}${(r.tags || []).length ? ' · ' + h(r.tags.join(', ')) : ''}</span><span style="flex:1"></span>
          <button class="btn" data-copy="${h(r.id)}">${T('Copy', 'Sao chép')}</button><button class="btn" data-cite="${h(r.id)}" title="${h(X.inText(r, style, num.get(r.id)))}">${T('In-text', 'Trong bài')}</button><button class="btn" data-ed="${h(r.id)}">${T('Edit', 'Sửa')}</button><button class="ud-x" data-rm="${h(r.id)}" aria-label="${T('Delete reference', 'Xóa tài liệu')}">×</button></div></li>`).join('')
          || `<li class="muted">${lib.refs.length ? T('Nothing matches.', 'Không có kết quả.') : T('Your library is empty. Add a reference by its DOI or ISBN, by hand, or import a .bib file.', 'Thư viện của bạn đang trống. Thêm tài liệu bằng DOI hoặc ISBN, nhập tay, hoặc nhập tệp .bib.')}</li>`}</ul>
        <p class="muted">${T('Formatted from each guide’s common forms: check against your department’s guide before you hand work in. Kept on this device; only DOI and ISBN look-ups go out (to Crossref and Open Library).', 'Định dạng theo các dạng phổ biến của từng chuẩn: hãy đối chiếu với hướng dẫn của khoa trước khi nộp bài. Lưu trên thiết bị này; chỉ việc tra DOI và ISBN được gửi đi (đến Crossref và Open Library).')}</p></div>`;
      const f = body.querySelector('[data-find]');
      f.onsubmit = async (e) => { e.preventDefault(); const k = X.kindOf(f.v.value); f.querySelector('button').disabled = true; try { await lookUp(k); } finally { f.querySelector('button').disabled = false; } };
      body.querySelector('[data-hand]').onclick = () => { editing = { type: 'article', authors: [], tags: [] }; draw(); };
      body.querySelector('[data-paste]').onclick = () => { paste = !paste; draw(); };
      body.querySelector('[data-bib]').onclick = () => download('library.bib', X.toBibtex(lib.refs), 'application/x-bibtex');
      const imp = (src) => { const got = X.parseBibtex(src).filter((r) => r.title); if (!got.length) { say(T('No references found in that BibTeX.', 'Không tìm thấy tài liệu nào trong BibTeX đó.')); return; }
        got.forEach((r) => { r.id = rid('r'); r.tags = r.tags || []; }); lib.refs.push(...got); save('cite', lib); paste = false; say(T(`${got.length} reference${got.length === 1 ? '' : 's'} added.`, `Đã thêm ${got.length} tài liệu.`)); draw(); };
      const ib = body.querySelector('[data-import]'); if (ib) ib.onclick = () => imp(body.querySelector('[data-bibtext]').value);
      const bf = body.querySelector('[data-bibfile]'); if (bf) bf.onchange = async (e) => { const file = e.target.files[0]; if (file) imp(await file.text()); };
      body.querySelector('[data-style]').onchange = (e) => { lib.style = e.target.value; save('cite', lib); draw(); };
      const qs = body.querySelector('[data-q]'); qs.oninput = () => { q = qs.value; const pos = qs.selectionStart; draw(); const n = body.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); };
      body.querySelectorAll('[data-tag]').forEach((b) => { b.onclick = () => { tag = tag === b.dataset.tag ? '' : b.dataset.tag; draw(); }; });
      body.querySelector('[data-all]').onclick = () => { const list = style === 'ieee' ? shown.map((r) => X.format(r, style, num.get(r.id))) : X.bibliography(shown, style);
        copy(list.map(X.text).join('\n'), list.map((x) => `<p>${x}</p>`).join('')); };
      const byId = (id) => lib.refs.find((r) => r.id === id);
      body.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => { const x = X.format(byId(b.dataset.copy), style, num.get(b.dataset.copy)); copy(X.text(x), x); }; });
      body.querySelectorAll('[data-cite]').forEach((b) => { b.onclick = () => copy(X.inText(byId(b.dataset.cite), style, num.get(b.dataset.cite))); });
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = JSON.parse(JSON.stringify(byId(b.dataset.ed))); draw(); }; });
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { if (!confirm(T('Delete this reference?', 'Xóa tài liệu này?'))) return; lib.refs = lib.refs.filter((r) => r.id !== b.dataset.rm); save('cite', lib); draw(); }; });
    }
    async function lookUp(k) {
      if (k.kind === 'doi') {
        try { const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(k.value)}`); if (!r.ok) throw new Error(String(r.status));
          editing = { ...X.fromCrossref((await r.json()).message), tags: [] }; say(T('Found it. Check the details, then save.', 'Đã tìm thấy. Kiểm tra thông tin rồi lưu.')); }
        catch (e) { editing = { type: 'article', authors: [], doi: k.value, tags: [] }; say(T('Couldn’t look that DOI up (offline, or not a registered DOI). Fill it in by hand.', 'Không tra được DOI này (mất mạng, hoặc DOI chưa đăng ký). Hãy nhập tay.')); }
      } else if (k.kind === 'isbn') {
        try { const r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(k.value)}&format=json&jscmd=data`); const j = await r.json(); const b = j[`ISBN:${k.value}`];
          if (!b) throw new Error('none'); editing = { ...X.fromOpenLibrary(b, k.value), tags: [] }; say(T('Found it. Check the details, then save.', 'Đã tìm thấy. Kiểm tra thông tin rồi lưu.')); }
        catch (e) { editing = { type: 'book', authors: [], isbn: k.value, tags: [] }; say(T('That ISBN isn’t in Open Library. Fill it in by hand.', 'ISBN này không có trong Open Library. Hãy nhập tay.')); }
      } else if (k.kind === 'url') { editing = { type: 'web', authors: [], url: k.value, accessed: today(), tags: [] }; say(T('Fill in the page’s title and author.', 'Hãy điền tiêu đề và tác giả của trang.')); }
      else { say(k.value ? T('That doesn’t look like a DOI, an ISBN or a web address. Use “By hand”.', 'Đây không giống DOI, ISBN hay địa chỉ web. Hãy dùng “Nhập tay”.') : T('Type a DOI, an ISBN or a web address.', 'Hãy nhập DOI, ISBN hoặc địa chỉ web.')); return; }
      draw();
    }
    function form(lib) {
      const r = editing;
      const ppl = (list) => (list || []).map((p) => (p.given ? `${p.family}, ${p.given}` : p.family)).join('\n');
      const contLabel = { article: T('Journal', 'Tạp chí'), chapter: T('Book title', 'Tên sách'), web: T('Website', 'Trang web'), thesis: T('Repository (optional)', 'Kho lưu trữ (không bắt buộc)'), report: T('Series (optional)', 'Tùng thư (không bắt buộc)') }[r.type] || T('Published in', 'Đăng trên');
      body.innerHTML = `<form class="ud-pad" data-f><p class="ud-k">${r.id ? T('Edit reference', 'Sửa tài liệu') : T('New reference', 'Tài liệu mới')}</p>
        <label class="ud-lbl">${T('Type', 'Loại')}<select name="type">${Object.keys(X.TYPES).map((k) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${h(TYPE(k))}</option>`).join('')}</select></label>
        <label class="ud-lbl">${T('Title', 'Tiêu đề')}<input name="title" required maxlength="500" value="${h(r.title)}"></label>
        <label class="ud-lbl">${T('Authors, one per line: Family, Given (an organisation on its own line in { braces })', 'Tác giả, mỗi dòng một người: Họ, Tên (tổ chức thì đặt trong { ngoặc nhọn })')}<textarea name="authors" rows="3">${h(ppl(r.authors))}</textarea></label>
        ${r.type === 'chapter' ? `<label class="ud-lbl">${T('Editors, one per line', 'Biên tập viên, mỗi dòng một người')}<textarea name="editors" rows="2">${h(ppl(r.editors))}</textarea></label>` : ''}
        <div class="row"><label class="ud-lbl">${T('Year', 'Năm')}<input name="year" maxlength="10" value="${h(r.year)}" style="width:6em"></label><label class="ud-lbl" style="flex:1">${contLabel}<input name="container" maxlength="300" value="${h(r.container)}"></label></div>
        ${r.type === 'article' ? `<div class="row"><label class="ud-lbl">${T('Volume', 'Tập')}<input name="volume" value="${h(r.volume)}" style="width:5em"></label><label class="ud-lbl">${T('Issue', 'Số')}<input name="issue" value="${h(r.issue)}" style="width:5em"></label><label class="ud-lbl">${T('Pages', 'Trang')}<input name="pages" value="${h(r.pages)}" style="width:8em"></label></div>` : ''}
        ${['book', 'chapter', 'thesis', 'report', 'other'].includes(r.type) ? `<div class="row"><label class="ud-lbl" style="flex:1">${r.type === 'thesis' ? T('University', 'Trường') : T('Publisher', 'Nhà xuất bản')}<input name="publisher" value="${h(r.publisher)}"></label><label class="ud-lbl">${T('Place', 'Nơi xuất bản')}<input name="place" value="${h(r.place)}"></label>${r.type === 'chapter' ? `<label class="ud-lbl">${T('Pages', 'Trang')}<input name="pages" value="${h(r.pages)}" style="width:8em"></label>` : `<label class="ud-lbl">${T('Edition', 'Lần xuất bản')}<input name="edition" value="${h(r.edition)}" style="width:5em"></label>`}</div>` : ''}
        <div class="row"><label class="ud-lbl" style="flex:1">DOI<input name="doi" value="${h(r.doi)}" placeholder="10.xxxx/…"></label>${['book', 'chapter'].includes(r.type) ? `<label class="ud-lbl">ISBN<input name="isbn" value="${h(r.isbn)}"></label>` : ''}</div>
        <div class="row"><label class="ud-lbl" style="flex:1">${T('Web address', 'Địa chỉ web')}<input name="url" value="${h(r.url)}" placeholder="https://"></label><label class="ud-lbl">${T('Accessed', 'Ngày truy cập')}<input type="date" name="accessed" value="${h(r.accessed)}"></label></div>
        <label class="ud-lbl">${T('Tags, separated by commas', 'Thẻ, cách nhau bằng dấu phẩy')}<input name="tags" value="${h((r.tags || []).join(', '))}" placeholder="${T('chapter 2, methods', 'chương 2, phương pháp')}"></label>
        <label class="ud-lbl">${T('Note (only for you)', 'Ghi chú (chỉ bạn thấy)')}<textarea name="note" rows="2">${h(r.note)}</textarea></label>
        <div class="row"><button class="btn primary">${T('Save', 'Lưu')}</button><button type="button" class="btn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>`;
      const f = body.querySelector('[data-f]');
      const grab = () => { const v = (n) => (f[n] ? f[n].value.trim() : (r[n] || ''));
        const ppl2 = (n) => (f[n] ? lines(f[n].value).map((l) => (l.includes(',') ? X.person(l) : X.person(/^\{.*\}$/.test(l) ? l : `{${l}}`))).filter(Boolean) : (r[n] || []));
        return { ...r, type: f.type.value, title: v('title'), authors: ppl2('authors'), editors: ppl2('editors'), year: v('year'), container: v('container'), volume: v('volume'), issue: v('issue'),
          pages: v('pages'), publisher: v('publisher'), place: v('place'), edition: v('edition'), doi: v('doi'), isbn: v('isbn'), url: v('url'), accessed: v('accessed'), tags: commas(f.tags.value), note: v('note') }; };
      f.type.onchange = () => { editing = grab(); draw(); };   // the fields follow the type
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = (e) => { e.preventDefault(); const x = grab(); if (x.id) lib.refs = lib.refs.map((y) => (y.id === x.id ? x : y)); else lib.refs.push({ ...x, id: rid('r') });
        save('cite', lib); editing = null; say(T('Saved to your library.', 'Đã lưu vào thư viện.')); draw(); };
    }
    draw();
    return listen('cite', () => { if (!editing && !body.contains(document.activeElement)) draw(); });
  }

  /* ================= 🧪 Lab log ================= */
  function renderLab(body) {
    let editing = null, open = null, q = '', tag = '';
    function draw() {
      const log = load('lab').sort((a, b) => b.atMs - a.atMs);
      if (editing) return form(log);
      const tags = [...new Set(log.flatMap((e) => e.tags || []))].sort();
      const shown = log.filter((e) => (!tag || (e.tags || []).includes(tag)) && (!q || `${e.title} ${e.body} ${(e.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase())));
      body.innerHTML = `<div class="ud-pad"><div class="row"><button class="btn primary" data-new>${T('＋ New entry', '＋ Mục mới')}</button><input type="search" data-q value="${h(q)}" placeholder="${T('Search', 'Tìm')}" style="flex:1" aria-label="${T('Search the lab log', 'Tìm trong nhật ký')}"><button class="btn" data-md ${log.length ? '' : 'disabled'}>${T('Export .md', 'Xuất .md')}</button></div>
        ${tags.length ? `<div class="row">${tags.map((t) => `<button class="chip ${t === tag ? 'on' : ''}" data-tag="${h(t)}">${h(t)}</button>`).join('')}</div>` : ''}
        <ul class="ud-list">${shown.map((e) => `<li class="ud-entry"><button class="ud-linkbtn" data-open="${h(e.id)}"><b>${h(e.title || T('Untitled', 'Không tiêu đề'))}</b><span class="muted">${h(when(e.atMs))}${(e.tags || []).length ? ' · ' + h(e.tags.join(', ')) : ''}</span></button>
          ${open === e.id ? `<div class="ud-instr">${link(e.body)}</div>${(e.links || []).map((l) => `<p>🔗 ${link(l)}</p>`).join('')}<div class="row"><button class="btn" data-ed="${h(e.id)}">${T('Edit', 'Sửa')}</button><button class="ud-x" data-rm="${h(e.id)}" aria-label="${T('Delete entry', 'Xóa mục')}">×</button></div>`
            : `<span class="muted ud-clip">${h(String(e.body || '').slice(0, 140))}${String(e.body || '').length > 140 ? '…' : ''}</span>`}</li>`).join('')
          || `<li class="muted">${log.length ? T('Nothing matches.', 'Không có kết quả.') : T('No entries yet. Log what you did, what you saw and what to try next.', 'Chưa có mục nào. Ghi lại việc bạn đã làm, điều bạn quan sát được và việc cần thử tiếp.')}</li>`}</ul>
        <p class="muted">${T('Kept on this device, never shared. Files: keep them in 📂 Files or Google Drive and paste their links here.', 'Lưu trên thiết bị này, không bao giờ chia sẻ. Tệp: lưu trong 📂 Tệp hoặc Google Drive rồi dán liên kết vào đây.')}</p></div>`;
      body.querySelector('[data-new]').onclick = () => { editing = { atMs: Date.now(), title: '', body: '', tags: tag ? [tag] : [], links: [] }; draw(); };
      const qs = body.querySelector('[data-q]'); qs.oninput = () => { q = qs.value; const pos = qs.selectionStart; draw(); const n = body.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); };
      body.querySelectorAll('[data-tag]').forEach((b) => { b.onclick = () => { tag = tag === b.dataset.tag ? '' : b.dataset.tag; draw(); }; });
      body.querySelector('[data-md]').onclick = () => download(`lab-log-${today()}.md`, `# Lab log\n\n${log.map((e) => `## ${new Date(e.atMs).toLocaleString()} — ${e.title || 'Untitled'}\n\n${(e.tags || []).length ? `Tags: ${e.tags.join(', ')}\n\n` : ''}${e.body || ''}\n${(e.links || []).map((l) => `\n- ${l}`).join('')}\n`).join('\n')}`, 'text/markdown;charset=utf-8');
      body.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { open = open === b.dataset.open ? null : b.dataset.open; draw(); }; });
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = { ...log.find((e) => e.id === b.dataset.ed) }; draw(); }; });
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { if (!confirm(T('Delete this entry?', 'Xóa mục này?'))) return; save('lab', log.filter((e) => e.id !== b.dataset.rm)); draw(); }; });
    }
    function form(log) {
      const e = editing;
      body.innerHTML = `<form class="ud-pad" data-f><p class="ud-k">${e.id ? T('Edit entry', 'Sửa mục') : T('New entry', 'Mục mới')}</p>
        <div class="row"><label class="ud-lbl">${T('When', 'Thời gian')}<input type="datetime-local" name="at" value="${dtInput(e.atMs)}"></label><label class="ud-lbl" style="flex:1">${T('Title', 'Tiêu đề')}<input name="title" maxlength="200" value="${h(e.title)}" placeholder="${T('e.g. Pilot recording, class 10A', 'ví dụ Ghi âm thử, lớp 10A')}"></label></div>
        <label class="ud-lbl">${T('Entry', 'Nội dung')}<textarea name="body" rows="8" placeholder="${T('What you did, what happened, what to try next', 'Bạn đã làm gì, chuyện gì xảy ra, cần thử gì tiếp')}">${h(e.body)}</textarea></label>
        <label class="ud-lbl">${T('Tags, separated by commas', 'Thẻ, cách nhau bằng dấu phẩy')}<input name="tags" value="${h((e.tags || []).join(', '))}" placeholder="${T('pilot, recordings', 'thử nghiệm, ghi âm')}"></label>
        <label class="ud-lbl">${T('Links, one per line (files in Drive, data, papers)', 'Liên kết, mỗi dòng một liên kết (tệp trên Drive, dữ liệu, bài báo)')}<textarea name="links" rows="2">${h((e.links || []).join('\n'))}</textarea></label>
        <div class="row"><button class="btn primary">${T('Save', 'Lưu')}</button><button type="button" class="btn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>`;
      const f = body.querySelector('[data-f]');
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = (ev) => { ev.preventDefault();
        const x = { id: e.id || rid('e'), atMs: fromDt(f.at.value), title: f.title.value.trim(), body: f.body.value, tags: commas(f.tags.value), links: lines(f.links.value) };
        if (!x.title && !x.body.trim()) { say(T('Write something first.', 'Hãy viết gì đó trước.')); return; }
        save('lab', e.id ? log.map((y) => (y.id === x.id ? x : y)) : [...log, x]); editing = null; open = x.id; draw(); };
    }
    draw();
    return listen('lab', () => { if (!editing && !body.contains(document.activeElement)) draw(); });
  }

  /* ================= 🧑‍🏫 Supervisor notes ================= */
  function renderSupervisor(body) {
    let editing = null, seq = 0;
    function draw() {
      const meets = load('meet').sort((a, b) => b.atMs - a.atMs);
      if (editing) return form(meets);
      const mine = meets.flatMap((m) => (m.actions || []).filter((a) => !a.done && a.owner !== 'supervisor').map((a) => ({ m, a }))).sort((x, y) => (x.a.dueAtMs || 9e15) - (y.a.dueAtMs || 9e15));
      body.innerHTML = `<div class="ud-pad">
        ${mine.length ? `<div class="ud-card"><p class="ud-k">${T('Your open action items', 'Việc bạn cần làm')} (${mine.length})</p>${mine.map(({ m, a }) => `<label class="ud-check"><input type="checkbox" data-act="${h(m.id)}|${h(a.id)}"> <span>${h(a.text)}${a.dueAtMs ? ` <span class="muted">· ${T('by', 'trước')} ${h(day(a.dueAtMs))}</span>` : ''}</span></label>`).join('')}</div>` : ''}
        <div class="row"><button class="btn primary" data-new>${T('＋ New meeting', '＋ Buổi gặp mới')}</button><button class="btn" data-w="uthesis">${T('Thesis tracker →', 'Tiến độ luận văn →')}</button></div>
        <ul class="ud-list ud-meets">${meets.map((m) => `<li class="ud-card"><div class="row" style="justify-content:space-between"><p class="ud-k">${h(m.title || T('Meeting', 'Buổi gặp'))} <span class="muted">· ${h(when(m.atMs))}</span></p><span><button class="btn" data-ed="${h(m.id)}">${T('Edit', 'Sửa')}</button><button class="ud-x" data-rm="${h(m.id)}" aria-label="${T('Delete meeting', 'Xóa buổi gặp')}">×</button></span></div>
          ${(m.agenda || []).length ? `<p class="muted">${T('Agenda', 'Nội dung trao đổi')}</p><ul>${m.agenda.map((x) => `<li>${h(x)}</li>`).join('')}</ul>` : ''}
          ${m.notes ? `<div class="ud-instr">${link(m.notes)}</div>` : ''}
          ${(m.actions || []).map((a) => `<label class="ud-check ${a.done ? 'ud-dim' : ''}"><input type="checkbox" data-act="${h(m.id)}|${h(a.id)}" ${a.done ? 'checked' : ''}> <span>${h(a.text)} <span class="ud-tag">${a.owner === 'supervisor' ? T('supervisor', 'người hướng dẫn') : T('me', 'tôi')}</span>${a.dueAtMs ? ` <span class="muted">· ${T('by', 'trước')} ${h(day(a.dueAtMs))}</span>` : ''}</span></label>`).join('')}</li>`).join('')
          || `<li class="muted">${T('No meetings yet. Write the agenda before you meet, then the notes and action items after.', 'Chưa có buổi gặp nào. Viết nội dung cần trao đổi trước khi gặp, rồi ghi chú và việc cần làm sau đó.')}</li>`}</ul>
        <div data-share></div></div>`;
      body.querySelector('[data-new]').onclick = () => { editing = { atMs: Date.now(), title: '', agenda: [], notes: '', actions: [] }; draw(); };
      body.querySelector('[data-w]').onclick = () => (typeof openWidget === 'function' ? openWidget('uthesis') : null);
      body.querySelectorAll('[data-act]').forEach((el) => { el.onchange = () => { const [mid, aid] = el.dataset.act.split('|'); const all = load('meet'); const a = all.find((m) => m.id === mid).actions.find((x) => x.id === aid); a.done = el.checked; save('meet', all); draw(); }; });
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = JSON.parse(JSON.stringify(meets.find((m) => m.id === b.dataset.ed))); draw(); }; });
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { if (!confirm(T('Delete this meeting?', 'Xóa buổi gặp này?'))) return; save('meet', meets.filter((m) => m.id !== b.dataset.rm)); draw(); }; });
      sharePanel(body.querySelector('[data-share]'));
    }
    function form(meets) {
      const m = editing;
      const acts = (m.actions || []).map((a) => ({ ...a }));
      body.innerHTML = `<form class="ud-pad" data-f><p class="ud-k">${m.id ? T('Edit meeting', 'Sửa buổi gặp') : T('New meeting', 'Buổi gặp mới')}</p>
        <div class="row"><label class="ud-lbl">${T('When', 'Thời gian')}<input type="datetime-local" name="at" value="${dtInput(m.atMs)}"></label><label class="ud-lbl" style="flex:1">${T('Title', 'Tiêu đề')}<input name="title" maxlength="200" value="${h(m.title)}" placeholder="${T('e.g. Chapter 2 draft', 'ví dụ Bản thảo chương 2')}"></label></div>
        <label class="ud-lbl">${T('Agenda, one item per line', 'Nội dung trao đổi, mỗi dòng một mục')}<textarea name="agenda" rows="3">${h((m.agenda || []).join('\n'))}</textarea></label>
        <label class="ud-lbl">${T('Notes', 'Ghi chú')}<textarea name="notes" rows="5">${h(m.notes)}</textarea></label>
        <p class="ud-k">${T('Action items', 'Việc cần làm')}</p><div data-acts></div><button type="button" class="btn" data-adda>${T('＋ Action item', '＋ Việc cần làm')}</button>
        <div class="row"><button class="btn primary">${T('Save', 'Lưu')}</button><button type="button" class="btn" data-cancel>${T('Cancel', 'Hủy')}</button></div></form>`;
      const f = body.querySelector('[data-f]'), box = f.querySelector('[data-acts]');
      const paint = () => {
        box.innerHTML = acts.map((a, k) => `<div class="ud-act"><input type="checkbox" data-k="done" data-i="${k}" ${a.done ? 'checked' : ''} aria-label="${T('Done', 'Đã xong')}"><input data-k="text" data-i="${k}" value="${h(a.text)}" placeholder="${T('What', 'Việc gì')}" aria-label="${T('Action item', 'Việc cần làm')}">
          <select data-k="owner" data-i="${k}" aria-label="${T('Who', 'Ai làm')}"><option value="me" ${a.owner !== 'supervisor' ? 'selected' : ''}>${T('Me', 'Tôi')}</option><option value="supervisor" ${a.owner === 'supervisor' ? 'selected' : ''}>${T('Supervisor', 'Người hướng dẫn')}</option></select>
          <input type="date" data-k="due" data-i="${k}" value="${dateInput(a.dueAtMs)}" aria-label="${T('By', 'Hạn')}"><button type="button" class="ud-x" data-rma="${k}" aria-label="${T('Remove action item', 'Xóa việc cần làm')}">×</button></div>`).join('');
        box.querySelectorAll('[data-k]').forEach((el) => { el.oninput = el.onchange = () => { const a = acts[Number(el.dataset.i)], k = el.dataset.k;
          if (k === 'done') a.done = el.checked; else if (k === 'due') a.dueAtMs = fromDate(el.value); else a[k] = el.value; }; });
        box.querySelectorAll('[data-rma]').forEach((b) => { b.onclick = () => { acts.splice(Number(b.dataset.rma), 1); paint(); }; });
      };
      paint();
      f.querySelector('[data-adda]').onclick = () => { acts.push({ id: rid('a'), text: '', owner: 'me', dueAtMs: null, done: false }); paint(); const t = box.querySelectorAll('[data-k="text"]'); t[t.length - 1].focus(); };
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = (e) => { e.preventDefault();
        const x = { id: m.id || rid('m'), atMs: fromDt(f.at.value), title: f.title.value.trim(), agenda: lines(f.agenda.value), notes: f.notes.value.trim(), actions: acts.filter((a) => a.text.trim()).map((a) => ({ ...a, text: a.text.trim() })) };
        save('meet', m.id ? meets.map((y) => (y.id === x.id ? x : y)) : [...meets, x]); editing = null; draw(); };
    }
    async function sharePanel(el) {
      const my = ++seq;
      const card = (inner) => { if (my === seq && el.isConnected) el.innerHTML = `<div class="ud-card ud-share"><p class="ud-k">${T('Share with your supervisor', 'Chia sẻ với người hướng dẫn')}</p>${inner}</div>`; };
      if (!C || !C.available()) return card(`<p class="muted">${T('Sharing needs UniDeck’s course sync, which isn’t set up in this build. Your notes stay on this device.', 'Việc chia sẻ cần đồng bộ khóa học của UniDeck, bản này chưa bật. Ghi chú của bạn vẫn ở trên thiết bị này.')}</p>`);
      const s = C.state();
      if (!s.user || s.role !== 'unistudent') {
        card(`<p class="muted">${T('Sign in to share a read-only copy of these meetings with your supervisor, who reads it in LectureDeck.', 'Đăng nhập để chia sẻ bản chỉ đọc của các buổi gặp này với người hướng dẫn, người sẽ xem trong LectureDeck.')}</p><div class="row"><button class="btn" data-in>${T('Sign in with Google', 'Đăng nhập bằng Google')}</button></div>`);
        const b = el.querySelector('[data-in]'); if (b) b.onclick = async () => { try { await C.signIn('student'); draw(); } catch (e) { say(C.errText(e)); } };
        return;
      }
      if (s.needsBirthDate) return card(`<p class="muted">${T('Finish signing in from 🏛️ Courses first.', 'Hãy hoàn tất đăng nhập ở 🏛️ Khóa học trước.')}</p>`);
      let st;
      try { st = await C.supervisionStatus(); } catch (e) { return card(`<p class="muted">${h(C.errText(e))}</p>`); }
      try { localStorage.setItem('ud_sup_share', st.enabled ? '1' : '0'); } catch (e) {}
      card(`<label class="ud-check"><input type="checkbox" data-on ${st.enabled ? 'checked' : ''}> <span>${T('Share a read-only copy of these meetings with my supervisor', 'Chia sẻ bản chỉ đọc của các buổi gặp này với người hướng dẫn')}</span></label>
        <label class="ud-check ${st.enabled ? '' : 'ud-dim'}"><input type="checkbox" data-thesis ${st.includeThesis ? 'checked' : ''} ${st.enabled ? '' : 'disabled'}> <span>${T('Include my thesis progress (chapters, word counts, milestones)', 'Kèm tiến độ luận văn (các chương, số từ, các mốc)')}</span></label>
        ${st.enabled ? `<p class="muted">${st.publishedAtMs ? T(`Last shared ${h(when(st.publishedAtMs))}. It updates by itself after each change.`, `Chia sẻ lần cuối ${h(when(st.publishedAtMs))}. Bản này tự cập nhật sau mỗi thay đổi.`) : T('Not shared yet.', 'Chưa chia sẻ.')}</p><div class="row"><button class="btn" data-now>${T('Share now', 'Chia sẻ ngay')}</button></div>
          ${st.invite ? `<div class="ud-invite"><p>${T('Code for your supervisor', 'Mã cho người hướng dẫn')}: <span class="ud-code">${h(st.invite.code)}</span></p><p class="muted">${T(`They enter it in LectureDeck → 🎓 Supervision. Works once, until ${h(day(st.invite.expiresAtMs))}.`, `Người hướng dẫn nhập mã trong LectureDeck → 🎓 Hướng dẫn. Dùng được một lần, đến ${h(day(st.invite.expiresAtMs))}.`)}</p><div class="row"><button class="btn" data-cancelc>${T('Cancel the code', 'Hủy mã')}</button></div></div>`
            : `<div class="row"><button class="btn primary" data-code>${T('Get a code for my supervisor', 'Lấy mã cho người hướng dẫn')}</button></div>`}` : ''}
        ${st.supervisors.length ? `<p class="ud-k">${T('Linked', 'Đã liên kết')}</p><ul class="ud-list">${st.supervisors.map((p) => `<li><span><b>${h(p.name)}</b> <span class="muted">${h(p.email)}${p.lastViewedAtMs ? ` · ${T('last looked', 'xem lần cuối')} ${h(when(p.lastViewedAtMs))}` : T(' · hasn’t looked yet', ' · chưa xem')}</span></span><button class="btn" data-unlink="${h(p.uid)}">${T('Remove', 'Gỡ')}</button></li>`).join('')}</ul>` : ''}
        <p class="muted">${T('Your citations and lab log are never shared. Turning sharing off hides everything from your supervisors at once.', 'Trích dẫn và nhật ký nghiên cứu của bạn không bao giờ được chia sẻ. Tắt chia sẻ sẽ ẩn mọi thứ khỏi người hướng dẫn ngay lập tức.')}</p>`);
      const act = async (fn) => { try { await fn(); } catch (e) { say(C.errText(e)); } draw(); };
      const on = el.querySelector('[data-on]');
      if (on) on.onchange = () => act(async () => { const r = await C.setSupervisionSharing({ enabled: on.checked }); try { localStorage.setItem('ud_sup_share', r.enabled ? '1' : '0'); } catch (e) {} if (r.enabled) await publishNow(); });
      const th = el.querySelector('[data-thesis]');
      if (th) th.onchange = () => act(async () => { await C.setSupervisionSharing({ enabled: true, includeThesis: th.checked }); await publishNow(); });
      const nw = el.querySelector('[data-now]'); if (nw) nw.onclick = () => act(async () => { const r = await publishNow(); say(r ? T('Shared.', 'Đã chia sẻ.') : T('Couldn’t share just now.', 'Chưa chia sẻ được lúc này.')); });
      const cd = el.querySelector('[data-code]'); if (cd) cd.onclick = () => act(() => C.createSupervisionInvite());
      const cc = el.querySelector('[data-cancelc]'); if (cc) cc.onclick = () => act(() => C.cancelSupervisionInvite());
      el.querySelectorAll('[data-unlink]').forEach((b) => { b.onclick = () => { if (confirm(T('Remove this supervisor? They stop seeing your notes at once.', 'Gỡ người hướng dẫn này? Họ sẽ không thấy ghi chú của bạn nữa ngay lập tức.'))) act(() => C.removeSupervisor(b.dataset.unlink)); }; });
    }
    draw();
    const offs = [listen('meet', () => { if (!editing && !body.contains(document.activeElement)) draw(); }), listen('shared', () => { if (!editing) sharePanel(body.querySelector('[data-share]') || document.createElement('div')); })];
    const offC = C && C.onChange ? C.onChange(() => { if (!editing && body.querySelector('[data-share]')) sharePanel(body.querySelector('[data-share]')); }) : () => {};
    return () => { offs.forEach((f) => f()); offC(); };
  }

  /* ---- the demo: a thesis under way ---- */
  function seedDemo() {
    const D = 864e5, at = (d, hr = 10) => { const x = new Date(Date.now() + d * D); x.setHours(hr, 0, 0, 0); return x.getTime(); };
    const put = (k, v) => { try { localStorage.setItem(KEYS[k], JSON.stringify(v)); } catch (e) {} };
    put('thesis', { title: 'Code-switching in Hanoi secondary classrooms', dueAtMs: at(210), wordGoal: 60000,
      chapters: [{ id: 'c1', title: 'Introduction', status: 'revising', words: 5200, goal: 6000, dueAtMs: null }, { id: 'c2', title: 'Literature review', status: 'drafting', words: 8400, goal: 15000, dueAtMs: at(30) },
        { id: 'c3', title: 'Methodology', status: 'planned', words: 0, goal: 10000, dueAtMs: at(70) }, { id: 'c4', title: 'Findings', status: 'planned', words: 0, goal: 18000, dueAtMs: null }],
      milestones: [{ id: 'k1', title: 'Ethics approval', dueAtMs: at(-14), done: true }, { id: 'k2', title: 'Classroom recordings', dueAtMs: at(45), done: false }, { id: 'k3', title: 'Full draft to supervisor', dueAtMs: at(180), done: false }] });
    put('cite', { style: 'apa', refs: [
      { id: 'r1', type: 'article', title: 'Translanguaging as a practical theory of language', authors: [{ family: 'Wei', given: 'Li' }], year: '2018', container: 'Applied Linguistics', volume: '39', issue: '1', pages: '9–30', doi: '10.1093/applin/amx039', tags: ['chapter 2', 'theory'] },
      { id: 'r2', type: 'book', title: 'Translanguaging: Language, bilingualism and education', authors: [{ family: 'García', given: 'Ofelia' }, { family: 'Wei', given: 'Li' }], year: '2014', publisher: 'Palgrave Macmillan', place: 'London', tags: ['chapter 2'] },
      { id: 'r3', type: 'article', title: 'Code-switching in the EFL classroom: Friend or foe?', authors: [{ family: 'Sert', given: 'Olcay' }], year: '2005', container: 'The Internet TESL Journal', volume: '11', issue: '8', url: 'http://iteslj.org/Articles/Sert-CodeSwitching.html', tags: ['chapter 2', 'classroom'] }] });
    put('lab', [
      { id: 'e1', atMs: at(-6, 14), title: 'Pilot recording, class 10A', body: 'Recorded 45 min of an English lesson. Teacher switched to Vietnamese mostly for grammar explanations and classroom management. Two students used English among themselves in pair work.\nNext: ask about consent for the student mics.', tags: ['pilot', 'recordings'], links: [] },
      { id: 'e2', atMs: at(-2, 9), title: 'Coding scheme v2', body: 'Merged "explanation" and "clarification". Added a code for humour. Inter-rater check with Minh on 20 turns: 17/20 agree.', tags: ['coding'], links: ['https://docs.google.com/document/d/demo-coding-scheme'] }]);
    put('meet', [
      { id: 'm3', atMs: at(-1, 15), title: 'Chapter 2 draft', agenda: ['Structure of the literature review', 'Which theories to keep'], notes: 'Keep the sociolinguistic and the pedagogical strands apart. Cut the section on bilingual memory.', actions: [{ id: 'a1', text: 'Reorganise chapter 2 into two strands', owner: 'me', dueAtMs: at(10), done: false }, { id: 'a2', text: 'Send two key papers on translanguaging', owner: 'supervisor', dueAtMs: at(3), done: false }] },
      { id: 'm2', atMs: at(-15, 15), title: 'Ethics and data', agenda: ['Ethics form', 'Recording consent'], notes: 'Ethics approved with one change: consent forms in Vietnamese too.', actions: [{ id: 'a3', text: 'Translate the consent form', owner: 'me', dueAtMs: at(-8), done: true }] }]);
  }

  const P = { thesis: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>', cite: '<path d="M7 7h4v4H8l-1 3M14 7h4v4h-3l-1 3"/>',
    lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M8 14h8"/>', sup: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 4h5M16 8h5M17 12h4"/>' };
  window.UNI_WIDGETS = (window.UNI_WIDGETS || []).concat([
    { id: 'uthesis', title: T('🎓 Thesis tracker', '🎓 Tiến độ luận văn'), iconPath: P.thesis, w: 560, h: 620, render: renderThesis, cat: 'study' },
    { id: 'ucite', title: T('📚 Citations', '📚 Trích dẫn'), iconPath: P.cite, w: 520, h: 620, render: renderCitations, cat: 'study' },
    { id: 'ulablog', title: T('🧪 Lab log', '🧪 Nhật ký nghiên cứu'), iconPath: P.lab, w: 460, h: 600, render: renderLab, cat: 'study' },
    { id: 'usupnotes', title: T('🧑‍🏫 Supervisor notes', '🧑‍🏫 Ghi chú với người hướng dẫn'), iconPath: P.sup, w: 480, h: 640, render: renderSupervisor, cat: 'study' },
  ]);
})();

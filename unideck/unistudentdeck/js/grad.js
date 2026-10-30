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
  const day = (ms) => (ms ? new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const when = (ms) => (ms ? new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
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
  const save = (k, v) => { try { localStorage.setItem(KEYS[k], JSON.stringify(v)); } catch (e) { say('Couldn’t save on this device (storage full?).'); } if (k === 'thesis' || k === 'meet') publishSoon(); fire(k); };
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
      say('Copied.');
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
  const STATUS = [['planned', 'Planned'], ['drafting', 'Drafting'], ['revising', 'Revising'], ['done', 'Done']];
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
        ${editHead || !t.title ? `<form class="ud-card" data-head><label class="ud-lbl">Thesis title<input name="title" maxlength="200" value="${h(t.title)}" placeholder="Working title" required></label>
          <div class="row"><label class="ud-lbl">Due<input type="date" name="due" value="${dateInput(t.dueAtMs)}"></label><label class="ud-lbl">Word goal<input type="number" min="0" step="1000" name="goal" value="${t.wordGoal || ''}" placeholder="80000"></label></div>
          <div class="row"><button class="btn primary">Save</button>${t.title ? '<button type="button" class="btn" data-cancel>Cancel</button>' : ''}</div></form>`
        : `<div class="ud-card"><div class="row" style="justify-content:space-between"><p class="ud-k">${h(t.title)}</p><button class="btn" data-edit>Edit</button></div>
          <p class="muted">${t.dueAtMs ? `Due ${h(day(t.dueAtMs))}${left !== null ? ` · ${left >= 0 ? `${left} day${left === 1 ? '' : 's'} left` : `${-left} days past`}` : ''}` : 'No due date'} · ${done}/${t.chapters.length} chapter${t.chapters.length === 1 ? '' : 's'} done</p>
          <div class="ud-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
          <p class="muted">${words.toLocaleString()} ${goal ? `of ${goal.toLocaleString()} ` : ''}words${goal ? ` · ${pct}%` : ''}</p></div>`}
        <p class="ud-k">Chapters</p>
        <table class="ud-tbl ud-chap"><thead><tr><th>Chapter</th><th>Status</th><th>Words</th><th>Goal</th><th>Due</th><th></th></tr></thead><tbody>
          ${t.chapters.map((c, k) => `<tr data-c="${k}"><td><input data-k="title" value="${h(c.title)}" maxlength="200" aria-label="Chapter title"></td>
            <td><select data-k="status" aria-label="Status">${STATUS.map(([v, l]) => `<option value="${v}" ${c.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
            <td><input type="number" min="0" data-k="words" value="${c.words || 0}" aria-label="Words written"></td><td><input type="number" min="0" data-k="goal" value="${c.goal || ''}" aria-label="Word goal"></td>
            <td><input type="date" data-k="due" value="${dateInput(c.dueAtMs)}" aria-label="Due"></td>
            <td class="ud-nowrap"><button class="ud-x" data-up="${k}" ${k ? '' : 'disabled'} aria-label="Move up">▲</button><button class="ud-x" data-rm="${k}" aria-label="Remove chapter">×</button></td></tr>`).join('')
            || '<tr><td colspan="6" class="muted">No chapters yet.</td></tr>'}</tbody></table>
        <form class="row" data-addc><input name="t" placeholder="New chapter, e.g. Literature review" maxlength="200" style="flex:1" aria-label="New chapter"><button class="btn">＋ Chapter</button></form>
        <p class="ud-k">Milestones</p>
        <ul class="ud-list">${t.milestones.map((m, k) => `<li class="${m.done ? 'ud-done' : ''}"><label class="ud-check"><input type="checkbox" data-mdone="${k}" ${m.done ? 'checked' : ''}> <span>${h(m.title)}${m.dueAtMs ? ` <span class="muted">· ${h(day(m.dueAtMs))}</span>` : ''}</span></label><button class="ud-x" data-mrm="${k}" aria-label="Remove milestone">×</button></li>`).join('')
          || '<li class="muted">No milestones yet: ethics approval, data collection, full draft…</li>'}</ul>
        <form class="row" data-addm><input name="t" placeholder="New milestone" maxlength="200" style="flex:1" aria-label="New milestone"><input type="date" name="d" aria-label="Milestone date"><button class="btn">＋ Milestone</button></form>
        <div class="row"><button class="btn" data-w="usupnotes">Supervisor notes →</button><button class="btn" data-backup>Back up graduate tools</button><label class="btn">Restore<input type="file" accept=".json,application/json" data-restore hidden></label></div>
        <p class="muted">Kept on this device. Back up saves the thesis tracker, citations, lab log and supervisor notes as one file.</p></div>`;
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
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { if (!confirm('Remove this chapter?')) return; t.chapters.splice(Number(b.dataset.rm), 1); save('thesis', t); draw(); }; });
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
          if (!confirm('Replace the graduate tools on this device with the ones in this file?')) return;
          save('thesis', d.thesis || EMPTY.thesis); save('cite', d.citations || EMPTY.cite); save('lab', d.lablog || []); save('meet', d.meetings || []);
          say('Restored.'); draw();
        } catch (er) { say('That isn’t a graduate tools backup file.'); }
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
        <form class="row" data-find><input name="v" placeholder="DOI, ISBN or web address" style="flex:1" aria-label="DOI, ISBN or web address" autocomplete="off"><button class="btn primary">Add</button></form>
        <div class="row"><button class="btn" data-hand>＋ By hand</button><button class="btn" data-paste>${paste ? 'Close BibTeX' : 'Import BibTeX'}</button><button class="btn" data-bib ${lib.refs.length ? '' : 'disabled'}>Export .bib</button></div>
        ${paste ? `<div class="ud-card"><label class="ud-lbl">Paste BibTeX (from Zotero, Mendeley, Google Scholar…)<textarea rows="5" data-bibtext spellcheck="false"></textarea></label>
          <div class="row"><button class="btn primary" data-import>Import</button><label class="btn">Or choose a .bib file<input type="file" accept=".bib,.txt" data-bibfile hidden></label></div></div>` : ''}
        <div class="row"><label class="ud-pick">Style <select data-style>${Object.entries(X.STYLES).map(([k, l]) => `<option value="${k}" ${k === style ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <input type="search" data-q value="${h(q)}" placeholder="Search" style="flex:1" aria-label="Search the library"><button class="btn" data-all ${shown.length ? '' : 'disabled'}>Copy ${tag || q ? 'these' : 'all'}</button></div>
        ${tags.length ? `<div class="row">${tags.map((t) => `<button class="chip ${t === tag ? 'on' : ''}" data-tag="${h(t)}">${h(t)}</button>`).join('')}</div>` : ''}
        <ul class="ud-list ud-refs">${shown.map((r) => `<li><div class="ud-ref">${X.format(r, style, num.get(r.id))}</div>
          <div class="row"><span class="muted">${h(X.TYPES[r.type] || 'Other')}${(r.tags || []).length ? ' · ' + h(r.tags.join(', ')) : ''}</span><span style="flex:1"></span>
          <button class="btn" data-copy="${h(r.id)}">Copy</button><button class="btn" data-cite="${h(r.id)}" title="${h(X.inText(r, style, num.get(r.id)))}">In-text</button><button class="btn" data-ed="${h(r.id)}">Edit</button><button class="ud-x" data-rm="${h(r.id)}" aria-label="Delete reference">×</button></div></li>`).join('')
          || `<li class="muted">${lib.refs.length ? 'Nothing matches.' : 'Your library is empty. Add a reference by its DOI or ISBN, by hand, or import a .bib file.'}</li>`}</ul>
        <p class="muted">Formatted from each guide’s common forms: check against your department’s guide before you hand work in. Kept on this device; only DOI and ISBN look-ups go out (to Crossref and Open Library).</p></div>`;
      const f = body.querySelector('[data-find]');
      f.onsubmit = async (e) => { e.preventDefault(); const k = X.kindOf(f.v.value); f.querySelector('button').disabled = true; try { await lookUp(k); } finally { f.querySelector('button').disabled = false; } };
      body.querySelector('[data-hand]').onclick = () => { editing = { type: 'article', authors: [], tags: [] }; draw(); };
      body.querySelector('[data-paste]').onclick = () => { paste = !paste; draw(); };
      body.querySelector('[data-bib]').onclick = () => download('library.bib', X.toBibtex(lib.refs), 'application/x-bibtex');
      const imp = (src) => { const got = X.parseBibtex(src).filter((r) => r.title); if (!got.length) { say('No references found in that BibTeX.'); return; }
        got.forEach((r) => { r.id = rid('r'); r.tags = r.tags || []; }); lib.refs.push(...got); save('cite', lib); paste = false; say(`${got.length} reference${got.length === 1 ? '' : 's'} added.`); draw(); };
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
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { if (!confirm('Delete this reference?')) return; lib.refs = lib.refs.filter((r) => r.id !== b.dataset.rm); save('cite', lib); draw(); }; });
    }
    async function lookUp(k) {
      if (k.kind === 'doi') {
        try { const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(k.value)}`); if (!r.ok) throw new Error(String(r.status));
          editing = { ...X.fromCrossref((await r.json()).message), tags: [] }; say('Found it. Check the details, then save.'); }
        catch (e) { editing = { type: 'article', authors: [], doi: k.value, tags: [] }; say('Couldn’t look that DOI up (offline, or not a registered DOI). Fill it in by hand.'); }
      } else if (k.kind === 'isbn') {
        try { const r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(k.value)}&format=json&jscmd=data`); const j = await r.json(); const b = j[`ISBN:${k.value}`];
          if (!b) throw new Error('none'); editing = { ...X.fromOpenLibrary(b, k.value), tags: [] }; say('Found it. Check the details, then save.'); }
        catch (e) { editing = { type: 'book', authors: [], isbn: k.value, tags: [] }; say('That ISBN isn’t in Open Library. Fill it in by hand.'); }
      } else if (k.kind === 'url') { editing = { type: 'web', authors: [], url: k.value, accessed: today(), tags: [] }; say('Fill in the page’s title and author.'); }
      else { say(k.value ? 'That doesn’t look like a DOI, an ISBN or a web address. Use “By hand”.' : 'Type a DOI, an ISBN or a web address.'); return; }
      draw();
    }
    function form(lib) {
      const r = editing;
      const ppl = (list) => (list || []).map((p) => (p.given ? `${p.family}, ${p.given}` : p.family)).join('\n');
      const contLabel = { article: 'Journal', chapter: 'Book title', web: 'Website', thesis: 'Repository (optional)', report: 'Series (optional)' }[r.type] || 'Published in';
      body.innerHTML = `<form class="ud-pad" data-f><p class="ud-k">${r.id ? 'Edit reference' : 'New reference'}</p>
        <label class="ud-lbl">Type<select name="type">${Object.entries(X.TYPES).map(([k, l]) => `<option value="${k}" ${r.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="ud-lbl">Title<input name="title" required maxlength="500" value="${h(r.title)}"></label>
        <label class="ud-lbl">Authors, one per line: Family, Given (an organisation on its own line in { braces })<textarea name="authors" rows="3">${h(ppl(r.authors))}</textarea></label>
        ${r.type === 'chapter' ? `<label class="ud-lbl">Editors, one per line<textarea name="editors" rows="2">${h(ppl(r.editors))}</textarea></label>` : ''}
        <div class="row"><label class="ud-lbl">Year<input name="year" maxlength="10" value="${h(r.year)}" style="width:6em"></label><label class="ud-lbl" style="flex:1">${contLabel}<input name="container" maxlength="300" value="${h(r.container)}"></label></div>
        ${r.type === 'article' ? `<div class="row"><label class="ud-lbl">Volume<input name="volume" value="${h(r.volume)}" style="width:5em"></label><label class="ud-lbl">Issue<input name="issue" value="${h(r.issue)}" style="width:5em"></label><label class="ud-lbl">Pages<input name="pages" value="${h(r.pages)}" style="width:8em"></label></div>` : ''}
        ${['book', 'chapter', 'thesis', 'report', 'other'].includes(r.type) ? `<div class="row"><label class="ud-lbl" style="flex:1">${r.type === 'thesis' ? 'University' : 'Publisher'}<input name="publisher" value="${h(r.publisher)}"></label><label class="ud-lbl">Place<input name="place" value="${h(r.place)}"></label>${r.type === 'chapter' ? `<label class="ud-lbl">Pages<input name="pages" value="${h(r.pages)}" style="width:8em"></label>` : `<label class="ud-lbl">Edition<input name="edition" value="${h(r.edition)}" style="width:5em"></label>`}</div>` : ''}
        <div class="row"><label class="ud-lbl" style="flex:1">DOI<input name="doi" value="${h(r.doi)}" placeholder="10.xxxx/…"></label>${['book', 'chapter'].includes(r.type) ? `<label class="ud-lbl">ISBN<input name="isbn" value="${h(r.isbn)}"></label>` : ''}</div>
        <div class="row"><label class="ud-lbl" style="flex:1">Web address<input name="url" value="${h(r.url)}" placeholder="https://"></label><label class="ud-lbl">Accessed<input type="date" name="accessed" value="${h(r.accessed)}"></label></div>
        <label class="ud-lbl">Tags, separated by commas<input name="tags" value="${h((r.tags || []).join(', '))}" placeholder="chapter 2, methods"></label>
        <label class="ud-lbl">Note (only for you)<textarea name="note" rows="2">${h(r.note)}</textarea></label>
        <div class="row"><button class="btn primary">Save</button><button type="button" class="btn" data-cancel>Cancel</button></div></form>`;
      const f = body.querySelector('[data-f]');
      const grab = () => { const v = (n) => (f[n] ? f[n].value.trim() : (r[n] || ''));
        const ppl2 = (n) => (f[n] ? lines(f[n].value).map((l) => (l.includes(',') ? X.person(l) : X.person(/^\{.*\}$/.test(l) ? l : `{${l}}`))).filter(Boolean) : (r[n] || []));
        return { ...r, type: f.type.value, title: v('title'), authors: ppl2('authors'), editors: ppl2('editors'), year: v('year'), container: v('container'), volume: v('volume'), issue: v('issue'),
          pages: v('pages'), publisher: v('publisher'), place: v('place'), edition: v('edition'), doi: v('doi'), isbn: v('isbn'), url: v('url'), accessed: v('accessed'), tags: commas(f.tags.value), note: v('note') }; };
      f.type.onchange = () => { editing = grab(); draw(); };   // the fields follow the type
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = (e) => { e.preventDefault(); const x = grab(); if (x.id) lib.refs = lib.refs.map((y) => (y.id === x.id ? x : y)); else lib.refs.push({ ...x, id: rid('r') });
        save('cite', lib); editing = null; say('Saved to your library.'); draw(); };
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
      body.innerHTML = `<div class="ud-pad"><div class="row"><button class="btn primary" data-new>＋ New entry</button><input type="search" data-q value="${h(q)}" placeholder="Search" style="flex:1" aria-label="Search the lab log"><button class="btn" data-md ${log.length ? '' : 'disabled'}>Export .md</button></div>
        ${tags.length ? `<div class="row">${tags.map((t) => `<button class="chip ${t === tag ? 'on' : ''}" data-tag="${h(t)}">${h(t)}</button>`).join('')}</div>` : ''}
        <ul class="ud-list">${shown.map((e) => `<li class="ud-entry"><button class="ud-linkbtn" data-open="${h(e.id)}"><b>${h(e.title || 'Untitled')}</b><span class="muted">${h(when(e.atMs))}${(e.tags || []).length ? ' · ' + h(e.tags.join(', ')) : ''}</span></button>
          ${open === e.id ? `<div class="ud-instr">${link(e.body)}</div>${(e.links || []).map((l) => `<p>🔗 ${link(l)}</p>`).join('')}<div class="row"><button class="btn" data-ed="${h(e.id)}">Edit</button><button class="ud-x" data-rm="${h(e.id)}" aria-label="Delete entry">×</button></div>`
            : `<span class="muted ud-clip">${h(String(e.body || '').slice(0, 140))}${String(e.body || '').length > 140 ? '…' : ''}</span>`}</li>`).join('')
          || `<li class="muted">${log.length ? 'Nothing matches.' : 'No entries yet. Log what you did, what you saw and what to try next.'}</li>`}</ul>
        <p class="muted">Kept on this device, never shared. Files: keep them in 📂 Files or Google Drive and paste their links here.</p></div>`;
      body.querySelector('[data-new]').onclick = () => { editing = { atMs: Date.now(), title: '', body: '', tags: tag ? [tag] : [], links: [] }; draw(); };
      const qs = body.querySelector('[data-q]'); qs.oninput = () => { q = qs.value; const pos = qs.selectionStart; draw(); const n = body.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); };
      body.querySelectorAll('[data-tag]').forEach((b) => { b.onclick = () => { tag = tag === b.dataset.tag ? '' : b.dataset.tag; draw(); }; });
      body.querySelector('[data-md]').onclick = () => download(`lab-log-${today()}.md`, `# Lab log\n\n${log.map((e) => `## ${new Date(e.atMs).toLocaleString()} — ${e.title || 'Untitled'}\n\n${(e.tags || []).length ? `Tags: ${e.tags.join(', ')}\n\n` : ''}${e.body || ''}\n${(e.links || []).map((l) => `\n- ${l}`).join('')}\n`).join('\n')}`, 'text/markdown;charset=utf-8');
      body.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { open = open === b.dataset.open ? null : b.dataset.open; draw(); }; });
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = { ...log.find((e) => e.id === b.dataset.ed) }; draw(); }; });
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { if (!confirm('Delete this entry?')) return; save('lab', log.filter((e) => e.id !== b.dataset.rm)); draw(); }; });
    }
    function form(log) {
      const e = editing;
      body.innerHTML = `<form class="ud-pad" data-f><p class="ud-k">${e.id ? 'Edit entry' : 'New entry'}</p>
        <div class="row"><label class="ud-lbl">When<input type="datetime-local" name="at" value="${dtInput(e.atMs)}"></label><label class="ud-lbl" style="flex:1">Title<input name="title" maxlength="200" value="${h(e.title)}" placeholder="e.g. Pilot recording, class 10A"></label></div>
        <label class="ud-lbl">Entry<textarea name="body" rows="8" placeholder="What you did, what happened, what to try next">${h(e.body)}</textarea></label>
        <label class="ud-lbl">Tags, separated by commas<input name="tags" value="${h((e.tags || []).join(', '))}" placeholder="pilot, recordings"></label>
        <label class="ud-lbl">Links, one per line (files in Drive, data, papers)<textarea name="links" rows="2">${h((e.links || []).join('\n'))}</textarea></label>
        <div class="row"><button class="btn primary">Save</button><button type="button" class="btn" data-cancel>Cancel</button></div></form>`;
      const f = body.querySelector('[data-f]');
      f.querySelector('[data-cancel]').onclick = () => { editing = null; draw(); };
      f.onsubmit = (ev) => { ev.preventDefault();
        const x = { id: e.id || rid('e'), atMs: fromDt(f.at.value), title: f.title.value.trim(), body: f.body.value, tags: commas(f.tags.value), links: lines(f.links.value) };
        if (!x.title && !x.body.trim()) { say('Write something first.'); return; }
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
        ${mine.length ? `<div class="ud-card"><p class="ud-k">Your open action items (${mine.length})</p>${mine.map(({ m, a }) => `<label class="ud-check"><input type="checkbox" data-act="${h(m.id)}|${h(a.id)}"> <span>${h(a.text)}${a.dueAtMs ? ` <span class="muted">· by ${h(day(a.dueAtMs))}</span>` : ''}</span></label>`).join('')}</div>` : ''}
        <div class="row"><button class="btn primary" data-new>＋ New meeting</button><button class="btn" data-w="uthesis">Thesis tracker →</button></div>
        <ul class="ud-list ud-meets">${meets.map((m) => `<li class="ud-card"><div class="row" style="justify-content:space-between"><p class="ud-k">${h(m.title || 'Meeting')} <span class="muted">· ${h(when(m.atMs))}</span></p><span><button class="btn" data-ed="${h(m.id)}">Edit</button><button class="ud-x" data-rm="${h(m.id)}" aria-label="Delete meeting">×</button></span></div>
          ${(m.agenda || []).length ? `<p class="muted">Agenda</p><ul>${m.agenda.map((x) => `<li>${h(x)}</li>`).join('')}</ul>` : ''}
          ${m.notes ? `<div class="ud-instr">${link(m.notes)}</div>` : ''}
          ${(m.actions || []).map((a) => `<label class="ud-check ${a.done ? 'ud-dim' : ''}"><input type="checkbox" data-act="${h(m.id)}|${h(a.id)}" ${a.done ? 'checked' : ''}> <span>${h(a.text)} <span class="ud-tag">${a.owner === 'supervisor' ? 'supervisor' : 'me'}</span>${a.dueAtMs ? ` <span class="muted">· by ${h(day(a.dueAtMs))}</span>` : ''}</span></label>`).join('')}</li>`).join('')
          || '<li class="muted">No meetings yet. Write the agenda before you meet, then the notes and action items after.</li>'}</ul>
        <div data-share></div></div>`;
      body.querySelector('[data-new]').onclick = () => { editing = { atMs: Date.now(), title: '', agenda: [], notes: '', actions: [] }; draw(); };
      body.querySelector('[data-w]').onclick = () => (typeof openWidget === 'function' ? openWidget('uthesis') : null);
      body.querySelectorAll('[data-act]').forEach((el) => { el.onchange = () => { const [mid, aid] = el.dataset.act.split('|'); const all = load('meet'); const a = all.find((m) => m.id === mid).actions.find((x) => x.id === aid); a.done = el.checked; save('meet', all); draw(); }; });
      body.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { editing = JSON.parse(JSON.stringify(meets.find((m) => m.id === b.dataset.ed))); draw(); }; });
      body.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { if (!confirm('Delete this meeting?')) return; save('meet', meets.filter((m) => m.id !== b.dataset.rm)); draw(); }; });
      sharePanel(body.querySelector('[data-share]'));
    }
    function form(meets) {
      const m = editing;
      const acts = (m.actions || []).map((a) => ({ ...a }));
      body.innerHTML = `<form class="ud-pad" data-f><p class="ud-k">${m.id ? 'Edit meeting' : 'New meeting'}</p>
        <div class="row"><label class="ud-lbl">When<input type="datetime-local" name="at" value="${dtInput(m.atMs)}"></label><label class="ud-lbl" style="flex:1">Title<input name="title" maxlength="200" value="${h(m.title)}" placeholder="e.g. Chapter 2 draft"></label></div>
        <label class="ud-lbl">Agenda, one item per line<textarea name="agenda" rows="3">${h((m.agenda || []).join('\n'))}</textarea></label>
        <label class="ud-lbl">Notes<textarea name="notes" rows="5">${h(m.notes)}</textarea></label>
        <p class="ud-k">Action items</p><div data-acts></div><button type="button" class="btn" data-adda>＋ Action item</button>
        <div class="row"><button class="btn primary">Save</button><button type="button" class="btn" data-cancel>Cancel</button></div></form>`;
      const f = body.querySelector('[data-f]'), box = f.querySelector('[data-acts]');
      const paint = () => {
        box.innerHTML = acts.map((a, k) => `<div class="ud-act"><input type="checkbox" data-k="done" data-i="${k}" ${a.done ? 'checked' : ''} aria-label="Done"><input data-k="text" data-i="${k}" value="${h(a.text)}" placeholder="What" aria-label="Action item">
          <select data-k="owner" data-i="${k}" aria-label="Who"><option value="me" ${a.owner !== 'supervisor' ? 'selected' : ''}>Me</option><option value="supervisor" ${a.owner === 'supervisor' ? 'selected' : ''}>Supervisor</option></select>
          <input type="date" data-k="due" data-i="${k}" value="${dateInput(a.dueAtMs)}" aria-label="By"><button type="button" class="ud-x" data-rma="${k}" aria-label="Remove action item">×</button></div>`).join('');
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
      const card = (inner) => { if (my === seq && el.isConnected) el.innerHTML = `<div class="ud-card ud-share"><p class="ud-k">Share with your supervisor</p>${inner}</div>`; };
      if (!C || !C.available()) return card('<p class="muted">Sharing needs UniDeck’s course sync, which isn’t set up in this build. Your notes stay on this device.</p>');
      const s = C.state();
      if (!s.user || s.role !== 'unistudent') {
        card('<p class="muted">Sign in to share a read-only copy of these meetings with your supervisor, who reads it in LectureDeck.</p><div class="row"><button class="btn" data-in>Sign in with Google</button></div>');
        const b = el.querySelector('[data-in]'); if (b) b.onclick = async () => { try { await C.signIn('student'); draw(); } catch (e) { say(C.errText(e)); } };
        return;
      }
      if (s.needsBirthDate) return card('<p class="muted">Finish signing in from 🏛️ Courses first.</p>');
      let st;
      try { st = await C.supervisionStatus(); } catch (e) { return card(`<p class="muted">${h(C.errText(e))}</p>`); }
      try { localStorage.setItem('ud_sup_share', st.enabled ? '1' : '0'); } catch (e) {}
      card(`<label class="ud-check"><input type="checkbox" data-on ${st.enabled ? 'checked' : ''}> <span>Share a read-only copy of these meetings with my supervisor</span></label>
        <label class="ud-check ${st.enabled ? '' : 'ud-dim'}"><input type="checkbox" data-thesis ${st.includeThesis ? 'checked' : ''} ${st.enabled ? '' : 'disabled'}> <span>Include my thesis progress (chapters, word counts, milestones)</span></label>
        ${st.enabled ? `<p class="muted">${st.publishedAtMs ? `Last shared ${h(when(st.publishedAtMs))}. It updates by itself after each change.` : 'Not shared yet.'}</p><div class="row"><button class="btn" data-now>Share now</button></div>
          ${st.invite ? `<div class="ud-invite"><p>Code for your supervisor: <span class="ud-code">${h(st.invite.code)}</span></p><p class="muted">They enter it in LectureDeck → 🎓 Supervision. Works once, until ${h(day(st.invite.expiresAtMs))}.</p><div class="row"><button class="btn" data-cancelc>Cancel the code</button></div></div>`
            : '<div class="row"><button class="btn primary" data-code>Get a code for my supervisor</button></div>'}` : ''}
        ${st.supervisors.length ? `<p class="ud-k">Linked</p><ul class="ud-list">${st.supervisors.map((p) => `<li><span><b>${h(p.name)}</b> <span class="muted">${h(p.email)}${p.lastViewedAtMs ? ` · last looked ${h(when(p.lastViewedAtMs))}` : ' · hasn’t looked yet'}</span></span><button class="btn" data-unlink="${h(p.uid)}">Remove</button></li>`).join('')}</ul>` : ''}
        <p class="muted">Your citations and lab log are never shared. Turning sharing off hides everything from your supervisors at once.</p>`);
      const act = async (fn) => { try { await fn(); } catch (e) { say(C.errText(e)); } draw(); };
      const on = el.querySelector('[data-on]');
      if (on) on.onchange = () => act(async () => { const r = await C.setSupervisionSharing({ enabled: on.checked }); try { localStorage.setItem('ud_sup_share', r.enabled ? '1' : '0'); } catch (e) {} if (r.enabled) await publishNow(); });
      const th = el.querySelector('[data-thesis]');
      if (th) th.onchange = () => act(async () => { await C.setSupervisionSharing({ enabled: true, includeThesis: th.checked }); await publishNow(); });
      const nw = el.querySelector('[data-now]'); if (nw) nw.onclick = () => act(async () => { const r = await publishNow(); say(r ? 'Shared.' : 'Couldn’t share just now.'); });
      const cd = el.querySelector('[data-code]'); if (cd) cd.onclick = () => act(() => C.createSupervisionInvite());
      const cc = el.querySelector('[data-cancelc]'); if (cc) cc.onclick = () => act(() => C.cancelSupervisionInvite());
      el.querySelectorAll('[data-unlink]').forEach((b) => { b.onclick = () => { if (confirm('Remove this supervisor? They stop seeing your notes at once.')) act(() => C.removeSupervisor(b.dataset.unlink)); }; });
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
    { id: 'uthesis', title: '🎓 Thesis tracker', iconPath: P.thesis, w: 560, h: 620, render: renderThesis, cat: 'study' },
    { id: 'ucite', title: '📚 Citations', iconPath: P.cite, w: 520, h: 620, render: renderCitations, cat: 'study' },
    { id: 'ulablog', title: '🧪 Lab log', iconPath: P.lab, w: 460, h: 600, render: renderLab, cat: 'study' },
    { id: 'usupnotes', title: '🧑‍🏫 Supervisor notes', iconPath: P.sup, w: 480, h: 640, render: renderSupervisor, cat: 'study' },
  ]);
})();

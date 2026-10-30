'use strict';
/* UniStudentDeck — citations (UniDeck phase 5, v0.13.0). UniStudentDeck's own file. Plain functions, no DOM, so the same
   file runs in the app (window.UDCite) and in tools/test_cite.js (Node).

   A reference: { id, type: 'article'|'book'|'chapter'|'web'|'thesis'|'report'|'other', title, authors[{ family, given }],
   editors[{ family, given }], year, container (journal, book or website), publisher, place, volume, issue, pages,
   edition, doi, isbn, url, accessed ('YYYY-MM-DD'), tags[], note }.

   format(ref, style, n) -> HTML (titles in <i>); text(html) -> plain text. Styles: apa (7th), mla (9th), chicago
   (author-date, 17th), harvard (Cite Them Right) and ieee. They follow each guide's common forms, not every edge case:
   a student should still check a reference before handing work in. fromCrossref / fromOpenLibrary read those services'
   JSON; parseBibtex / toBibtex read and write .bib files. */
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.UDCite = make();
})(typeof self !== 'undefined' ? self : this, function () {
  const STYLES = { apa: 'APA 7', mla: 'MLA 9', chicago: 'Chicago (author-date)', harvard: 'Harvard', ieee: 'IEEE' };
  const TYPES = { article: 'Journal article', book: 'Book', chapter: 'Book chapter', web: 'Web page', thesis: 'Thesis', report: 'Report', other: 'Other' };
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clean = (s) => String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
  const i = (s) => (s ? `<i>${esc(s)}</i>` : '');
  const end = (s) => (/[.?!]$/.test(s) ? s : s + '.');   // a sentence-final full stop, unless one is there
  const dash = (p) => clean(p).replace(/\s*-+\s*/g, '–');
  const doiUrl = (d) => (d ? `https://doi.org/${clean(d).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : '');
  const titleOf = (r) => clean(r.title) || 'Untitled';

  /* ---- names ---- */
  /** "Family, Given" or "Given Family" (or { family, given }) -> { family, given } */
  function person(x) {
    if (x && typeof x === 'object') return { family: clean(x.family), given: clean(x.given) };
    const s = clean(x);
    if (!s) return null;
    if (/^\{.*\}$/.test(s)) return { family: s.slice(1, -1).trim(), given: '' };   // {An Organisation} stays whole
    if (s.includes(',')) { const [f, ...g] = s.split(','); return { family: clean(f), given: clean(g.join(' ')) }; }
    const parts = s.split(' ');
    return parts.length === 1 ? { family: s, given: '' } : { family: parts.pop(), given: parts.join(' ') };
  }
  const people = (list) => (Array.isArray(list) ? list : []).map(person).filter((p) => p && p.family);
  /** "Jean-Paul Marie" -> "J.-P. M." */
  const initials = (g) => clean(g).split(' ').filter(Boolean).map((w) => w.split('-').map((p) => (p ? p[0].toUpperCase() + '.' : '')).join('-')).join(' ');
  const inverted = (p, ini) => (p.given ? `${p.family}, ${ini ? initials(p.given) : p.given}` : p.family);   // Family, G.
  const direct = (p, ini) => (p.given ? `${ini ? initials(p.given) : p.given} ${p.family}` : p.family);       // G. Family

  function authorsFor(style, list) {
    const a = people(list);
    if (!a.length) return '';
    if (style === 'apa') {
      if (a.length === 1) return inverted(a[0], true);
      if (a.length <= 20) return a.slice(0, -1).map((p) => inverted(p, true)).join(', ') + ', & ' + inverted(a[a.length - 1], true);
      return a.slice(0, 19).map((p) => inverted(p, true)).join(', ') + ', . . . ' + inverted(a[a.length - 1], true);
    }
    if (style === 'mla') {
      if (a.length === 1) return inverted(a[0]);
      if (a.length === 2) return `${inverted(a[0])}, and ${direct(a[1])}`;
      return `${inverted(a[0])}, et al.`;
    }
    if (style === 'chicago') {
      const list10 = a.length > 10 ? a.slice(0, 7) : a;
      const names = list10.map((p, k) => (k === 0 ? inverted(p) : direct(p)));
      if (a.length > 10) return names.join(', ') + ', et al.';
      return names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
    }
    if (style === 'harvard') {
      if (a.length > 3) return `${inverted(a[0], true)} et al.`;
      const names = a.map((p) => inverted(p, true));
      return names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    }
    // ieee
    if (a.length > 6) return `${direct(a[0], true)} et al.`;
    const names = a.map((p) => direct(p, true));
    return names.length === 1 ? names[0] : names.length === 2 ? names.join(' and ') : names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
  }
  const editorsFor = (style, list) => {
    const e = people(list);
    if (!e.length) return '';
    const names = e.map((p) => direct(p, style !== 'mla' && style !== 'chicago'));
    const joined = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + (style === 'apa' ? ', & ' : ' and ') + names[names.length - 1];
    if (style === 'apa') return `${joined} (${e.length > 1 ? 'Eds.' : 'Ed.'})`;
    if (style === 'harvard') return `${joined} (${e.length > 1 ? 'eds.' : 'ed.'})`;
    if (style === 'ieee') return `${joined}, ${e.length > 1 ? 'Eds.' : 'Ed.'}`;
    return `edited by ${joined}`;
  };
  const edition = (r) => { const e = clean(r.edition); if (!e || e === '1') return ''; return /^\d+$/.test(e) ? `${e}${({ 1: 'st', 2: 'nd', 3: 'rd' })[e % 10 > 3 || [11, 12, 13].includes(e % 100) ? 0 : e % 10] || 'th'} ed.` : e; };

  /* ---- one reference ---- */
  function format(r, style, n) {
    const t = r.type || 'other', y = clean(r.year) || 'n.d.', title = titleOf(r), cont = clean(r.container), pub = clean(r.publisher);
    const vol = clean(r.volume), iss = clean(r.issue), pages = dash(r.pages || ''), doi = clean(r.doi), url = clean(r.url);
    const link = doi ? doiUrl(doi) : url;
    const au = authorsFor(style, r.authors);
    const ed = edition(r);
    const pubT = t === 'thesis' ? `Thesis${pub ? ', ' + pub : ''}` : pub;   // outside APA a thesis says so where the publisher goes
    if (style === 'apa') {
      const tail = link ? ` ${esc(link)}` : '';
      const head = (lead) => (au ? `${esc(end(au))} (${esc(y)}). ${lead}` : `${lead.replace(/\.\s*$/, '')} (${esc(y)}). `);   // no author: the title takes its place
      const eds = editorsFor('apa', r.editors);
      let out;
      if (t === 'article') out = `${head(esc(end(title)) + ' ')}${i(cont)}${vol ? `, ${i(vol)}` : ''}${iss ? `(${esc(iss)})` : ''}${pages ? `, ${esc(pages)}` : ''}.${tail}`;
      else if (t === 'chapter') out = `${head(esc(end(title)) + ' ')}In ${eds ? esc(eds) + ', ' : ''}${i(cont)}${pages ? ` (pp. ${esc(pages)})` : ''}.${pub ? ' ' + esc(end(pub)) : ''}${tail}`;
      else if (t === 'thesis') out = `${head(i(title) + ' ')}[Thesis${pub ? ', ' + esc(pub) : ''}].${tail}`;
      else if (t === 'web') out = `${head(i(title) + '. ')}${cont ? esc(end(cont)) : ''}${tail}`;
      else out = `${head(i(title) + (ed ? ` (${esc(ed)})` : '') + '. ')}${pub ? esc(end(pub)) : ''}${tail}`;
      return out.replace(/\s+/g, ' ').trim();
    }
    if (style === 'mla') {
      const lead = au ? `${esc(end(au))} ` : '';
      const tail = link ? ` ${esc(doi ? doiUrl(doi) : url.replace(/^https?:\/\//, ''))}.` : '';
      if (t === 'article') return `${lead}“${esc(end(title))}” ${i(cont)}${vol ? `, vol. ${esc(vol)}` : ''}${iss ? `, no. ${esc(iss)}` : ''}, ${esc(y)}${pages ? `, pp. ${esc(pages)}` : ''}.${tail}`;
      if (t === 'chapter') return `${lead}“${esc(end(title))}” ${i(cont)}${people(r.editors).length ? `, ${esc(editorsFor('mla', r.editors))}` : ''}${pub ? `, ${esc(pub)}` : ''}, ${esc(y)}${pages ? `, pp. ${esc(pages)}` : ''}.${tail}`;
      if (t === 'web') return `${lead}“${esc(end(title))}” ${cont ? `${i(cont)}, ` : ''}${esc(y)}.${tail}${r.accessed ? ` Accessed ${esc(r.accessed)}.` : ''}`;
      return `${lead}${i(title)}.${ed ? ` ${esc(ed)},` : ''}${pubT ? ` ${esc(pubT)},` : ''} ${esc(y)}.${tail}`;
    }
    if (style === 'chicago') {
      const lead = au ? `${esc(end(au))} ${esc(y)}. ` : `${i(title)}. ${esc(y)}. `;
      const tail = link ? ` ${esc(link)}.` : '';
      const place = clean(r.place);
      if (t === 'article') return `${lead}“${esc(end(title))}” ${i(cont)}${vol ? ` ${esc(vol)}` : ''}${iss ? ` (${esc(iss)})` : ''}${pages ? `: ${esc(pages)}` : ''}.${tail}`;
      if (t === 'chapter') return `${lead}“${esc(end(title))}” In ${i(cont)}${people(r.editors).length ? `, ${esc(editorsFor('chicago', r.editors))}` : ''}${pages ? `, ${esc(pages)}` : ''}. ${place ? esc(place) + ': ' : ''}${pub ? esc(end(pub)) : ''}${tail}`;
      if (t === 'web') return `${lead}“${esc(end(title))}” ${cont ? esc(end(cont)) : ''}${tail}`;
      return `${lead}${au ? end(i(title)) + ' ' : ''}${ed ? esc(ed) + ' ' : ''}${place ? esc(place) + ': ' : ''}${pubT ? esc(end(pubT)) : ''}${tail}`.replace(/\s+$/, '');
    }
    if (style === 'harvard') {
      const lead = `${au ? esc(au) + ' ' : ''}(${esc(y)}) `;
      const avail = doi ? ` doi: ${esc(doi)}.` : url ? ` Available at: ${esc(url)}${r.accessed ? ` (Accessed: ${esc(r.accessed)})` : ''}.` : '';
      const place = clean(r.place);
      if (t === 'article') return `${lead}‘${esc(title)}’, ${i(cont)}${vol ? `, ${esc(vol)}` : ''}${iss ? `(${esc(iss)})` : ''}${pages ? `, pp. ${esc(pages)}` : ''}.${avail}`;
      if (t === 'chapter') return `${lead}‘${esc(title)}’, in ${people(r.editors).length ? esc(editorsFor('harvard', r.editors)) + ' ' : ''}${i(cont)}. ${place ? esc(place) + ': ' : ''}${pub ? esc(pub) : ''}${pages ? `, pp. ${esc(pages)}` : ''}.${avail}`;
      if (t === 'web') return `${lead}${i(title)}.${avail}`;
      return `${lead}${i(title)}.${ed ? ` ${esc(ed)}` : ''}${place || pubT ? ` ${place ? esc(place) + ': ' : ''}${esc(pubT)}.` : ''}${avail}`;
    }
    // ieee
    const num = n ? `[${n}] ` : '';
    const lead = au ? `${esc(au)}, ` : '';
    const tail = doi ? `, doi: ${esc(doi)}.` : url ? `. [Online]. Available: ${esc(url)}` : '.';
    if (t === 'article') return `${num}${lead}“${esc(title)},” ${i(cont)}${vol ? `, vol. ${esc(vol)}` : ''}${iss ? `, no. ${esc(iss)}` : ''}${pages ? `, pp. ${esc(pages)}` : ''}, ${esc(y)}${tail}`;
    if (t === 'chapter') return `${num}${lead}“${esc(title)},” in ${i(cont)}${people(r.editors).length ? `, ${esc(end(editorsFor('ieee', r.editors)))}` : '.'} ${clean(r.place) ? esc(r.place) + ': ' : ''}${esc(pub)}, ${esc(y)}${pages ? `, pp. ${esc(pages)}` : ''}${tail}`;
    if (t === 'web') return `${num}${lead}“${esc(title)}.” ${cont ? i(cont) + '. ' : ''}${url ? `${esc(url)}` : ''}${r.accessed ? ` (accessed ${esc(r.accessed)})` : ''}.`;
    return `${num}${lead}${i(title)}${ed ? `, ${esc(ed)}` : '.'} ${clean(r.place) ? esc(r.place) + ': ' : ''}${pubT ? esc(pubT) + ', ' : ''}${esc(y)}${tail}`;
  }

  /** The in-text citation: (Family, 2021), (Family and Other 2021), [3]. */
  function inText(r, style, n) {
    if (style === 'ieee') return `[${n || 1}]`;
    const a = people(r.authors), y = clean(r.year) || 'n.d.';
    const short = clean(r.title).split(' ').slice(0, 4).join(' ');
    const who = !a.length ? `“${short}”`
      : a.length === 1 ? a[0].family
      : a.length === 2 ? `${a[0].family} ${style === 'apa' ? '&' : 'and'} ${a[1].family}`
      : style === 'harvard' && a.length === 3 ? `${a[0].family}, ${a[1].family} and ${a[2].family}`
      : `${a[0].family} et al.`;
    if (style === 'mla') return `(${who})`;
    if (style === 'chicago') return `(${who} ${y})`;
    return `(${who}, ${y})`;
  }

  /** A whole list: alphabetical by first author (then year), except IEEE, which keeps the order given and numbers it. */
  function bibliography(refs, style) {
    const key = (r) => `${(people(r.authors)[0] || { family: clean(r.title) }).family.toLowerCase()} ${clean(r.year)}`;
    const list = style === 'ieee' ? [...refs] : [...refs].sort((a, b) => key(a).localeCompare(key(b)));
    return list.map((r, k) => format(r, style, k + 1));
  }
  const text = (html) => String(html).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  /* ---- reading other formats ---- */
  const CR_TYPES = { 'journal-article': 'article', 'proceedings-article': 'article', book: 'book', monograph: 'book', 'edited-book': 'book', 'book-chapter': 'chapter',
    dissertation: 'thesis', report: 'report', 'posted-content': 'web' };
  /** Crossref's /works/{doi} "message" -> a reference */
  /** Crossref titles can carry HTML (<i>, <sub>) and escapes (&amp;): plain text instead. */
  const unHtml = (v) => clean(String(v || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&'));
  function fromCrossref(m) {
    const first = (v) => unHtml((Array.isArray(v) ? v[0] : v) || '');
    const parts = (m.issued && m.issued['date-parts'] && m.issued['date-parts'][0]) || (m.published && m.published['date-parts'] && m.published['date-parts'][0]) || [];
    return { type: CR_TYPES[m.type] || 'other', title: clean(first(m.title)), authors: (m.author || []).map((a) => ({ family: clean(a.family || a.name), given: clean(a.given) })),
      editors: (m.editor || []).map((a) => ({ family: clean(a.family || a.name), given: clean(a.given) })),
      year: parts[0] ? String(parts[0]) : '', container: clean(first(m['container-title'])), publisher: clean(m.publisher), volume: clean(m.volume), issue: clean(m.issue),
      pages: clean(m.page), doi: clean(m.DOI), isbn: clean(first(m.ISBN)), url: '', edition: clean(m['edition-number']) };
  }
  /** Open Library's /api/books?jscmd=data entry -> a reference */
  function fromOpenLibrary(b, isbn) {
    const yr = /(\d{4})/.exec(b.publish_date || '');
    return { type: 'book', title: clean([b.title, b.subtitle].filter(Boolean).join(': ')), authors: (b.authors || []).map((a) => person(a.name)).filter(Boolean),
      year: yr ? yr[1] : '', publisher: clean(((b.publishers || [])[0] || {}).name), place: clean(((b.publish_places || [])[0] || {}).name), isbn: clean(isbn), url: '' };
  }
  /** What the user typed: a DOI, an ISBN, a URL or nothing we know. */
  function kindOf(s) {
    const v = clean(s);
    const doi = /(10\.\d{4,9}\/[^\s]+)/i.exec(v);
    if (doi) return { kind: 'doi', value: doi[1].replace(/[.,;]$/, '') };
    const digits = v.replace(/[\s-]/g, '');
    if (/^(97[89])?\d{9}[\dX]$/i.test(digits)) return { kind: 'isbn', value: digits.toUpperCase() };
    if (/^https?:\/\//i.test(v)) return { kind: 'url', value: v };
    return { kind: null, value: v };
  }

  /* ---- BibTeX ---- */
  const BIB_TYPES = { article: 'article', book: 'book', inbook: 'chapter', incollection: 'chapter', phdthesis: 'thesis', mastersthesis: 'thesis', techreport: 'report', online: 'web', misc: 'other', inproceedings: 'article' };
  const unTex = (s) => String(s).replace(/\\["'`^~=.]\{?([A-Za-z])\}?/g, '$1').replace(/\\&/g, '&').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  function parseBibtex(src) {
    const out = [];
    const s = String(src || '');
    let k = 0;
    while ((k = s.indexOf('@', k)) !== -1) {
      const m = /^@(\w+)\s*\{/.exec(s.slice(k));
      if (!m) { k += 1; continue; }
      const type = m[1].toLowerCase();
      let p = k + m[0].length, depth = 1, start = p;
      while (p < s.length && depth > 0) { if (s[p] === '{') depth++; else if (s[p] === '}') depth--; p++; }
      const body = s.slice(start, p - 1);
      k = p;
      if (['comment', 'preamble', 'string'].includes(type)) continue;
      const comma = body.indexOf(',');
      const fields = {};
      let q = comma + 1;
      while (q < body.length) {
        const fm = /^\s*([A-Za-z][\w-]*)\s*=\s*/.exec(body.slice(q));
        if (!fm) break;
        q += fm[0].length;
        let val = '';
        if (body[q] === '{') { let d = 0, st = q; do { if (body[q] === '{') d++; else if (body[q] === '}') d--; q++; } while (q < body.length && d > 0); val = body.slice(st + 1, q - 1); }
        else if (body[q] === '"') { let st = ++q; while (q < body.length && body[q] !== '"') q++; val = body.slice(st, q); q++; }
        else { const vm = /^[^,]*/.exec(body.slice(q)); val = vm[0]; q += val.length; }
        fields[fm[1].toLowerCase()] = unTex(val);
        const cm = body.indexOf(',', q); q = cm === -1 ? body.length : cm + 1;
      }
      const names = (f) => (fields[f] ? fields[f].split(/\s+and\s+/i).map(person).filter(Boolean) : []);
      out.push({ type: BIB_TYPES[type] || 'other', title: fields.title || '', authors: names('author'), editors: names('editor'), year: (fields.year || fields.date || '').slice(0, 4),
        container: fields.journal || fields.journaltitle || fields.booktitle || '', publisher: fields.publisher || fields.school || fields.institution || '', place: fields.address || fields.location || '',
        volume: fields.volume || '', issue: fields.number || fields.issue || '', pages: (fields.pages || '').replace(/-+/g, '–'), edition: fields.edition || '', doi: fields.doi || '',
        isbn: fields.isbn || '', url: fields.url || '', accessed: fields.urldate || '', note: fields.note || '', key: body.slice(0, comma).trim() });
    }
    return out;
  }
  const bibEsc = (v) => String(v).replace(/[{}]/g, '').replace(/&/g, '\\&');
  function toBibtex(refs) {
    const used = new Set();
    const back = { article: 'article', book: 'book', chapter: 'incollection', thesis: 'phdthesis', report: 'techreport', web: 'online', other: 'misc' };
    return refs.map((r) => {
      const first = people(r.authors)[0];
      let key = (r.key || `${(first ? first.family : 'ref').replace(/[^A-Za-z]/g, '')}${clean(r.year)}`) || 'ref';
      while (used.has(key)) key += 'a';
      used.add(key);
      const f = [['author', people(r.authors).map((p) => inverted(p)).join(' and ')], ['editor', people(r.editors).map((p) => inverted(p)).join(' and ')], ['title', r.title],
        [r.type === 'article' ? 'journal' : r.type === 'chapter' ? 'booktitle' : 'howpublished', r.type === 'web' ? r.container : r.container], ['year', r.year], ['volume', r.volume],
        ['number', r.issue], ['pages', String(r.pages || '').replace(/–/g, '--')], ['edition', r.edition], ['publisher', r.publisher], ['address', r.place], ['doi', r.doi],
        ['isbn', r.isbn], ['url', r.url], ['urldate', r.accessed], ['note', r.note]].filter(([, v]) => clean(v));
      return `@${back[r.type] || 'misc'}{${key},\n${f.map(([k, v]) => `  ${k} = {${bibEsc(v)}}`).join(',\n')}\n}`;
    }).join('\n\n') + '\n';
  }

  return { STYLES, TYPES, person, format, inText, bibliography, text, fromCrossref, fromOpenLibrary, kindOf, parseBibtex, toBibtex, doiUrl };
});

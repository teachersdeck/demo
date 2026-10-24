'use strict';
/* =========================================================
   AdminDeck People Directory — shared logic (v0.7.0)
   -----------------------------------------------------------------
   Everything the directory decides, as pure functions: what a valid person looks like, what counts as a duplicate, how a list is
   filtered and counted by type, what 'needs attention', how existing accounts are adopted into the directory (backfill), and how
   a CSV becomes people and people become a CSV. No Firebase imports, so:
     - the backend (functions/adminDirectory.js) uses it as the authority for every write,
     - the browser loads the SAME file (window.Directory) to filter/count the list and to preview an import before sending it,
     - demo mode runs the real validation, de-duplication and import code over a pretend school,
     - tools/test_directory.js exercises every branch with synthetic data.
   index.html loads it from functions/, so there is only one copy.

   Model (see the spec: 'AdminDeck Suite — Directory & Admin Modules'):
     A DIRECTORY RECORD is the school's knowledge of a person; an ACCOUNT is a Firebase identity (a Google uid for teachers/parents,
     a students/{id} document for students). A record can exist before the person ever signs in, and is LINKED (accountLink) when
     they claim it. Learning data stays in students/{id}; the directory holds identity, contact details and relationships and
     points at it — nothing is copied. Records are archived, never deleted.

   Record fields:
     personId, type ('teacher'|'student'|'parent'|'staff'), displayName, email, phone, status ('invited'|'active'|'archived'),
     accountLink (uid or students/{id}; null until claimed), schoolId ('default' — reserved for a second school), source
     ('manual'|'import'|'backfill'), createdAtMs/updatedAtMs/archivedAtMs, plus per type:
       teacher: subjects, employeeNumber        student: classId, studentNumber
       parent: relationship, preferredContact   staff: title, department, extension, room, startDate (YYYY-MM-DD), responsibilities
   Derived at read time, never stored (so they cannot go stale): classIds/classNames (teacher), className + guardianCount (student),
   childCount + childNames (parent).

   PRIVACY: students get no contact fields (validation rejects them). The list is for the admin only; a Viewer role that hides parent
   and staff contact details is part of the access work that comes before this ships beyond one trusted admin (see README).
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Directory = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = ['teacher', 'student', 'parent', 'staff'];
  const STATUSES = ['invited', 'active', 'archived'];
  const LIMITS = { name: 120, email: 254, phone: 32, short: 80, long: 200, number: 40, classId: 128 };
  const INVITE_STALE_DAYS = 14;
  const IMPORT_MAX_ROWS = 500;
  const DAY_MS = 86400000;
  const CONTACTS = ['email', 'phone', 'zalo'];

  const str = (v) => (v == null ? '' : String(v)).trim();
  const squeeze = (v) => str(v).replace(/\s+/g, ' ');
  // Search and duplicate checks ignore case AND Vietnamese diacritics, so 'nguyen' finds 'Nguyễn' and 'Đạt' matches 'Dat'.
  const stripMarks = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const fold = (v) => stripMarks(squeeze(v)).toLowerCase();
  const normEmail = (v) => str(v).toLowerCase();
  const normPhone = (v) => str(v).replace(/[^\d+]/g, '');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^\+?\d{6,18}$/;
  // YYYY-MM-DD that is a real calendar day (2026-02-30 is rejected).
  const isIsoDate = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]; };

  const defaultStatus = (type) => (type === 'staff' ? 'active' : 'invited');   // staff have no account to claim

  /* ---------------------------------------------------------------- validation */
  // Returns { ok, errors:[{field, code, max?}], person }. `person` holds only the fields that belong to that type.
  function validatePerson(input) {
    const o = input || {}, errors = [];
    const type = str(o.type).toLowerCase();
    if (!TYPES.includes(type)) errors.push({ field: 'type', code: 'type_invalid' });
    const displayName = squeeze(o.displayName);
    if (!displayName) errors.push({ field: 'displayName', code: 'name_required' });
    else if (displayName.length > LIMITS.name) errors.push({ field: 'displayName', code: 'too_long', max: LIMITS.name });
    const email = normEmail(o.email);
    if (email && (email.length > LIMITS.email || !EMAIL_RE.test(email))) errors.push({ field: 'email', code: 'email_invalid' });
    const phone = squeeze(o.phone);
    if (phone && !PHONE_RE.test(normPhone(phone))) errors.push({ field: 'phone', code: 'phone_invalid' });
    if (type === 'student' && (email || phone)) errors.push({ field: email ? 'email' : 'phone', code: 'student_no_contact' });
    const person = { type, displayName, email: type === 'student' ? '' : email, phone: type === 'student' ? '' : phone };
    const take = (f, max) => { const v = squeeze(o[f]); if (v.length > max) errors.push({ field: f, code: 'too_long', max }); person[f] = v; };
    if (type === 'teacher') { take('subjects', LIMITS.long); take('employeeNumber', LIMITS.number); }
    if (type === 'student') { take('classId', LIMITS.classId); take('studentNumber', LIMITS.number); }
    if (type === 'parent') {
      take('relationship', LIMITS.short);
      const pc = str(o.preferredContact).toLowerCase();
      if (pc && !CONTACTS.includes(pc)) errors.push({ field: 'preferredContact', code: 'contact_invalid' });
      person.preferredContact = pc;
    }
    if (type === 'staff') {
      take('title', LIMITS.short); take('department', LIMITS.short); take('extension', LIMITS.number); take('room', LIMITS.short);
      take('responsibilities', LIMITS.long);
      const sd = str(o.startDate);
      if (sd && !isIsoDate(sd)) errors.push({ field: 'startDate', code: 'date_invalid' });
      person.startDate = sd;
    }
    return { ok: errors.length === 0, errors, person };
  }

  /* ---------------------------------------------------------------- duplicates */
  // Same type, and: both have an email -> same email; otherwise same name (students: also the same class when both have one).
  // Archived records are included on purpose — re-adding someone who was archived should say so rather than silently duplicate them.
  function isDuplicate(a, b) {
    if (a.type !== b.type) return null;
    const ea = normEmail(a.email), eb = normEmail(b.email);
    if (ea && eb) return ea === eb ? 'email' : null;
    if (fold(a.displayName) !== fold(b.displayName) || !fold(a.displayName)) return null;
    if (a.type === 'student') return (!a.classId || !b.classId || a.classId === b.classId) ? 'name_class' : null;
    return 'name';
  }
  function findDuplicates(person, existing, ignoreId) {
    const out = [];
    (existing || []).forEach((e) => {
      if (ignoreId && e.personId === ignoreId) return;
      const reason = isDuplicate(person, e);
      if (reason) out.push({ personId: e.personId, displayName: e.displayName, status: e.status, reason });
    });
    return out;
  }

  /* ---------------------------------------------------------------- read-time enrichment */
  // ctx = { classes:[{id,className,teacherUid}], students:[{id,classId}], guardianLinks:[{parentUid,studentId}] }
  function enrichPeople(directory, ctx, nowMs) {
    const now = nowMs || Date.now();
    const classes = (ctx && ctx.classes) || [], students = (ctx && ctx.students) || [], links = (ctx && ctx.guardianLinks) || [];
    const classById = new Map(classes.map((c) => [c.id, c]));
    const studentById = new Map(students.map((s) => [s.id, s]));
    const guardiansOf = new Map(), childrenOf = new Map();
    links.forEach((l) => {
      if (!guardiansOf.has(l.studentId)) guardiansOf.set(l.studentId, new Set());
      guardiansOf.get(l.studentId).add(l.parentUid);
      if (!childrenOf.has(l.parentUid)) childrenOf.set(l.parentUid, new Set());
      childrenOf.get(l.parentUid).add(l.studentId);
    });
    const nameByStudentAccount = new Map();
    (directory || []).forEach((p) => { if (p.type === 'student' && p.accountLink) nameByStudentAccount.set(p.accountLink, p.displayName); });
    return (directory || []).map((p) => {
      const out = { ...p, linked: !!p.accountLink, ageDays: p.createdAtMs ? Math.floor((now - p.createdAtMs) / DAY_MS) : null };
      if (p.type === 'teacher') {
        const mine = p.accountLink ? classes.filter((c) => c.teacherUid === p.accountLink) : [];
        out.classIds = mine.map((c) => c.id); out.classNames = mine.map((c) => c.className);
      } else if (p.type === 'student') {
        const acct = p.accountLink ? studentById.get(p.accountLink) : null;
        out.classId = p.classId || (acct && acct.classId) || '';
        const cl = classById.get(out.classId);
        out.className = cl ? cl.className : '';
        out.guardianCount = p.accountLink ? (guardiansOf.get(p.accountLink) || new Set()).size : null;   // null = no account yet, so nothing to link
      } else if (p.type === 'parent') {
        const kids = p.accountLink ? Array.from(childrenOf.get(p.accountLink) || []) : [];
        out.childCount = p.accountLink ? kids.length : null;
        out.childNames = kids.map((k) => nameByStudentAccount.get(k)).filter(Boolean).slice(0, 5);
      }
      return out;
    });
  }

  /* ---------------------------------------------------------------- filtering, counting, sorting */
  const classNameOf = (p) => p.className || (p.classNames || []).join(', ') || '';
  function filterPeople(list, f) {
    const q = f || {};
    const terms = fold(q.search || '').split(' ').filter(Boolean);
    const idSet = q.ids ? new Set(q.ids) : null;
    const status = q.status || 'open';
    let out = (list || []).filter((p) => {
      if (q.type && q.type !== 'all' && p.type !== q.type) return false;
      if (status === 'open' && p.status === 'archived') return false;
      if (status === 'archived' && p.status !== 'archived') return false;
      if (q.classId) { const hit = p.classId === q.classId || (p.classIds || []).includes(q.classId); if (!hit) return false; }
      if (q.linked === 'linked' && !p.accountLink) return false;
      if (q.linked === 'unlinked' && p.accountLink) return false;
      if (q.hasEmail === 'yes' && !normEmail(p.email)) return false;
      if (q.hasEmail === 'no' && normEmail(p.email)) return false;
      if (idSet && !idSet.has(p.personId)) return false;
      if (terms.length) {
        const hay = fold([p.displayName, p.email, p.phone, classNameOf(p), p.title, p.department, p.studentNumber, p.employeeNumber].join(' '));
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const cmpName = (a, b) => fold(a.displayName).localeCompare(fold(b.displayName));
    const sort = q.sort || 'name';
    if (sort === 'added') out = out.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0) || cmpName(a, b));
    else if (sort === 'class') out = out.sort((a, b) => classNameOf(a).localeCompare(classNameOf(b)) || cmpName(a, b));
    else out = out.sort(cmpName);
    return out;
  }
  // Counts for the type chips: they respect every filter EXCEPT type, so each chip shows what you would get by clicking it.
  function countByType(list, f) {
    const base = { ...(f || {}), type: 'all' };
    const counts = { all: 0, teacher: 0, student: 0, parent: 0, staff: 0 };
    filterPeople(list, base).forEach((p) => { counts.all++; counts[p.type]++; });
    return counts;
  }

  /* ---------------------------------------------------------------- 'needs attention' */
  // Over OPEN (not archived) people only. Each entry: { key, ids }.
  function attentionQueue(enriched) {
    const open = (enriched || []).filter((p) => p.status !== 'archived');
    const q = [];
    const add = (key, ids) => { if (ids.length) q.push({ key, ids }); };
    add('student_no_class', open.filter((p) => p.type === 'student' && !p.classId).map((p) => p.personId));
    add('student_no_guardian', open.filter((p) => p.type === 'student' && p.accountLink && p.guardianCount === 0).map((p) => p.personId));
    add('parent_no_child', open.filter((p) => p.type === 'parent' && p.accountLink && p.childCount === 0).map((p) => p.personId));
    add('teacher_no_class', open.filter((p) => p.type === 'teacher' && p.accountLink && (p.classIds || []).length === 0).map((p) => p.personId));
    const dup = new Set();
    for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) if (isDuplicate(open[i], open[j])) { dup.add(open[i].personId); dup.add(open[j].personId); }
    add('duplicates', Array.from(dup));
    add('stale_invites', open.filter((p) => p.status === 'invited' && p.ageDays != null && p.ageDays >= INVITE_STALE_DAYS).map((p) => p.personId));
    return q;
  }

  /* ---------------------------------------------------------------- backfill: adopt the accounts that already exist */
  // input = { users:[{uid,role,displayName,email}], students:[{id,classId,displayName}], classes:[{id,teacherUid}], teachers:{uid:{name,email}}, directory:[...] }
  // Deterministic ids (t_<uid>, p_<uid>, s_<studentId>) + a check on accountLink make it idempotent: running it twice creates nothing the second time.
  function buildBackfill(input, nowMs) {
    const now = nowMs || Date.now();
    const users = input.users || [], students = input.students || [], classes = input.classes || [], dir = input.directory || [];
    const haveId = new Set(dir.map((p) => p.personId));
    const haveLink = new Set(dir.filter((p) => p.accountLink).map((p) => p.type + ':' + p.accountLink));
    const create = [], seen = new Set();
    const push = (rec) => {
      if (haveId.has(rec.personId) || haveLink.has(rec.type + ':' + rec.accountLink) || seen.has(rec.personId)) return;
      seen.add(rec.personId); create.push(rec);
    };
    const base = (type, id, accountLink, name, email) => ({
      personId: id, type, displayName: squeeze(name) || (type === 'teacher' ? '(teacher account)' : type === 'parent' ? '(parent account)' : '(unnamed student)'),
      email: type === 'student' ? '' : normEmail(email), phone: '', status: 'active', accountLink, schoolId: 'default', source: 'backfill',
      createdAtMs: now, updatedAtMs: now, archivedAtMs: null, createdBy: 'backfill',
    });
    users.filter((u) => u.role === 'teacher').forEach((u) => push(base('teacher', 't_' + u.uid, u.uid, u.displayName, u.email)));
    // a teacher who owns a class but has no users/ document still belongs in the directory
    const tInfo = input.teachers || {};
    Array.from(new Set(classes.map((c) => c.teacherUid).filter(Boolean))).forEach((uid) => push(base('teacher', 't_' + uid, uid, (tInfo[uid] || {}).name, (tInfo[uid] || {}).email)));
    users.filter((u) => u.role === 'parent').forEach((u) => push(base('parent', 'p_' + u.uid, u.uid, u.displayName, u.email)));
    students.forEach((s) => { const r = base('student', 's_' + s.id, s.id, s.displayName); r.classId = s.classId || ''; r.studentNumber = ''; push(r); });
    const counts = { teacher: 0, student: 0, parent: 0 };
    create.forEach((r) => { counts[r.type]++; });
    return { create, counts, total: create.length };
  }

  /* ---------------------------------------------------------------- the list response (backend and demo both build it here) */
  function buildListResponse(directory, ctx, backfillInput, filters, nowMs) {
    const now = nowMs || Date.now();
    const enriched = enrichPeople(directory, ctx, now);
    const bf = buildBackfill({ ...backfillInput, directory }, now);
    return {
      generatedAtMs: now,
      people: filters ? filterPeople(enriched, filters) : enriched,
      counts: countByType(enriched, { status: 'open' }),
      archivedCount: enriched.filter((p) => p.status === 'archived').length,
      attention: attentionQueue(enriched),
      classes: ((ctx && ctx.classes) || []).map((c) => ({ id: c.id, className: c.className, hasTeacher: !!c.teacherUid,
        studentCount: ((ctx && ctx.students) || []).filter((st) => st.classId === c.id).length })).sort((a, b) => a.className.localeCompare(b.className)),
      backfill: { pending: bf.counts, total: bf.total },
    };
  }

  /* ---------------------------------------------------------------- CSV in */
  // RFC-4180-ish: quoted cells, doubled quotes, newlines inside quotes, BOM, and comma / semicolon / tab as the delimiter
  // (Excel in Vietnamese and many European locales saves with semicolons).
  function parseCsv(text) {
    let s = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    const firstLine = s.split(/\r?\n/, 1)[0] || '';
    const count = (ch) => (firstLine.match(new RegExp(ch === '\t' ? '\\t' : '\\' + ch, 'g')) || []).length;
    const delim = [',', ';', '\t'].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0];
    const D = delim[1] > 0 ? delim[0] : ',';
    const rows = []; let row = [], cell = '', inQ = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQ) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c;
      } else if (c === '"' && cell === '') inQ = true;
      else if (c === D) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => str(c) !== ''));
  }
  const HEADER_ALIASES = {
    displayName: ['name', 'fullname', 'displayname', 'hoten', 'ten', 'student', 'teacher', 'parent', 'staff'],
    email: ['email', 'emailaddress', 'mail'],
    phone: ['phone', 'phonenumber', 'mobile', 'tel', 'telephone', 'zalo', 'sdt', 'dienthoai'],
    className: ['class', 'classname', 'lop', 'homeroom'],
    title: ['title', 'role', 'position', 'jobtitle', 'chucvu'],
    department: ['department', 'dept', 'phongban'],
    employeeNumber: ['employeenumber', 'employeeid', 'staffid', 'staffnumber'],
    studentNumber: ['studentnumber', 'studentid', 'id', 'mahocsinh'],
    subjects: ['subjects', 'subject'],
    relationship: ['relationship', 'relation', 'quanhe'],
    preferredContact: ['preferredcontact', 'contactpreference', 'contact'],
    extension: ['extension', 'ext', 'phoneextension'],
    room: ['room', 'office', 'officeroom'],
    startDate: ['startdate', 'start', 'datestarted', 'ngaybatdau'],
    responsibilities: ['responsibilities', 'responsibility', 'notes'],
  };
  const headerKey = (h) => stripMarks(str(h)).toLowerCase().replace(/[^a-z0-9]/g, '');
  // -> { people:[{...fields, row}], errors:[{row, code}], ignoredHeaders:[...] }   (row = 1-based line number in the file)
  function csvToPeople(text, type) {
    const rows = parseCsv(text);
    if (rows.length < 1) return { people: [], errors: [{ row: 0, code: 'csv_empty' }], ignoredHeaders: [] };
    const headers = rows[0].map(headerKey), map = [], ignored = [];
    headers.forEach((h, i) => {
      const field = Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(h));
      map[i] = field || null;
      if (!field && h) ignored.push(str(rows[0][i]));
    });
    if (!map.includes('displayName')) return { people: [], errors: [{ row: 1, code: 'csv_no_name_column' }], ignoredHeaders: ignored };
    const people = [], errors = [];
    if (rows.length - 1 > IMPORT_MAX_ROWS) errors.push({ row: 0, code: 'csv_too_many_rows', max: IMPORT_MAX_ROWS });
    rows.slice(1, IMPORT_MAX_ROWS + 1).forEach((r, k) => {
      const o = { type, row: k + 2 };
      r.forEach((cell, i) => { if (map[i] && str(cell) !== '') o[map[i]] = cell; });
      people.push(o);
    });
    return { people, errors, ignoredHeaders: ignored };
  }

  /* ---------------------------------------------------------------- CSV out */
  // Formula-safe: a cell that would start a formula in Excel/Sheets (= + - @, tab, CR) is prefixed with an apostrophe.
  const csvCell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  function toCsv(people, labels) {
    const L = Object.assign({ type: 'Type', name: 'Name', email: 'Email', phone: 'Phone', cls: 'Class', status: 'Status', linked: 'Linked to an account', details: 'Details', added: 'Added' }, labels || {});
    const head = [L.type, L.name, L.email, L.phone, L.cls, L.status, L.linked, L.details, L.added];
    const lines = [head.map(csvCell).join(',')];
    (people || []).forEach((p) => {
      const details = [p.title, p.department, p.subjects, p.relationship, p.studentNumber, p.employeeNumber].filter(Boolean).join(' / ');
      const added = p.createdAtMs ? new Date(p.createdAtMs).toISOString().slice(0, 10) : '';
      lines.push([p.type, p.displayName, p.email, p.phone, classNameOf(p), p.status, p.accountLink ? 'yes' : 'no', details, added].map(csvCell).join(','));
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  /* ---------------------------------------------------------------- import planning (shared by the backend and the browser preview) */
  // rows: [{type,row,displayName,email,...,className?}], existing: directory records, classes: [{id,className}]
  // -> { results:[{row, status:'create'|'duplicate'|'invalid', errors, matches, person}], summary:{create,duplicate,invalid} }
  function planImport(rows, existing, classes) {
    const byClassName = new Map((classes || []).map((c) => [fold(c.className), c.id]));
    const pool = (existing || []).slice();           // grows as rows are accepted, so duplicates INSIDE the file are caught too
    const results = [], summary = { create: 0, duplicate: 0, invalid: 0 };
    (rows || []).forEach((r) => {
      const input = { ...r };
      const errs = [];
      if (input.type === 'student' && !input.classId && input.className) {
        const id = byClassName.get(fold(input.className));
        if (id) input.classId = id; else errs.push({ field: 'className', code: 'class_not_found' });
      }
      const v = validatePerson(input);
      const all = errs.concat(v.errors);
      if (all.length) { results.push({ row: r.row, status: 'invalid', errors: all, matches: [], person: v.person }); summary.invalid++; return; }
      const matches = findDuplicates(v.person, pool);
      if (matches.length) { results.push({ row: r.row, status: 'duplicate', errors: [], matches, person: v.person }); summary.duplicate++; return; }
      pool.push({ ...v.person, personId: 'pending_' + r.row });
      results.push({ row: r.row, status: 'create', errors: [], matches: [], person: v.person }); summary.create++;
    });
    return { results, summary };
  }

  return {
    TYPES, STATUSES, LIMITS, INVITE_STALE_DAYS, IMPORT_MAX_ROWS, defaultStatus,
    validatePerson, isDuplicate, findDuplicates, enrichPeople, filterPeople, countByType, attentionQueue,
    buildBackfill, buildListResponse, parseCsv, csvToPeople, toCsv, planImport, fold, classNameOf, isIsoDate, csvCell,
  };
});

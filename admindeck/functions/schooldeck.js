'use strict';
/* =========================================================
   SchoolDeck — shared logic (AdminDeck v0.8.0)
   -----------------------------------------------------------------
   Everything the SchoolDeck widget decides, as pure functions, on top of the People Directory (functions/directory.js):
     - PARENT LINKS: which parent is linked to which student, with the rules (a parent can have up to 12 children, a student up to 4
       parents, no duplicates, archived people can't be linked) and the read-time view of those links;
     - THE SETUP CHECKLIST and the NEEDS-ATTENTION list shown on the Overview tab;
     - THE STAFF DIRECTORY: grouping by department, CSV out, templates;
     - THE ROSTER IMPORT: a student CSV that also carries parent columns (parent1_name, parent1_email, ...) becomes a plan of students to
       create, parents to create, parents who already exist, and the links between them.
   No Firebase imports, so the backend (functions/adminSchoolDeck.js) uses it as the authority for every write, the browser loads the SAME
   file (window.SchoolDeck) to preview and display, demo mode runs it for real, and tools/test_schooldeck.js exercises every branch.

   Model: a LINK lives on the PARENT's directory record as links:[{ studentId (the student's personId), relationship }]. A student's parents
   are derived at read time, never stored, so they cannot disagree. Links between directory records say who the school INTENDS to connect;
   they do not create a guardianLinks entry (the real ParentDeck link) — that happens when the parent claims their record (a later build).
   ========================================================= */
(function (root, factory) {
  const D = (typeof module !== 'undefined' && module.exports) ? require('./directory') : root.Directory;
  const api = factory(D);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchoolDeck = api;
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const MAX_CHILDREN = 12;     // children one parent record can be linked to
  const MAX_PARENTS = 4;       // parent records one student can be linked to
  const isOpen = (p) => p.status !== 'archived';
  const squeeze = (v) => (v == null ? '' : String(v)).trim().replace(/\s+/g, ' ');

  /* ---------------------------------------------------------------- parent links */
  // -> { ok:true, links, parentId, studentId } with the parent's NEW links array, or { ok:false, errors:[{field, code, max?}] }
  function linkParent(directory, a) {
    const dir = directory || [], input = a || {};
    const parent = dir.find((p) => p.personId === input.parentId);
    const student = dir.find((p) => p.personId === input.studentId);
    const errors = [];
    if (!parent) errors.push({ field: 'parentId', code: 'parent_not_found' });
    else if (parent.type !== 'parent') errors.push({ field: 'parentId', code: 'not_a_parent' });
    else if (!isOpen(parent)) errors.push({ field: 'parentId', code: 'parent_archived' });
    if (!student) errors.push({ field: 'studentId', code: 'student_not_found' });
    else if (student.type !== 'student') errors.push({ field: 'studentId', code: 'not_a_student' });
    else if (!isOpen(student)) errors.push({ field: 'studentId', code: 'student_archived' });
    const relationship = squeeze(input.relationship);
    if (relationship.length > D.LIMITS.short) errors.push({ field: 'relationship', code: 'too_long', max: D.LIMITS.short });
    if (errors.length) return { ok: false, errors };
    const links = (parent.links || []).slice();
    if (links.some((l) => l.studentId === student.personId)) return { ok: false, errors: [{ field: 'studentId', code: 'already_linked' }] };
    if (links.length >= MAX_CHILDREN) return { ok: false, errors: [{ field: 'parentId', code: 'too_many_children', max: MAX_CHILDREN }] };
    const parentsOfStudent = dir.filter((p) => p.type === 'parent' && isOpen(p) && (p.links || []).some((l) => l.studentId === student.personId)).length;
    if (parentsOfStudent >= MAX_PARENTS) return { ok: false, errors: [{ field: 'studentId', code: 'too_many_parents', max: MAX_PARENTS }] };
    links.push({ studentId: student.personId, relationship });
    return { ok: true, links, parentId: parent.personId, studentId: student.personId };
  }
  function unlinkParent(directory, a) {
    const input = a || {};
    const parent = (directory || []).find((p) => p.personId === input.parentId);
    if (!parent || parent.type !== 'parent') return { ok: false, errors: [{ field: 'parentId', code: 'parent_not_found' }] };
    const links = parent.links || [];
    if (!links.some((l) => l.studentId === input.studentId)) return { ok: false, errors: [{ field: 'studentId', code: 'not_linked' }] };
    return { ok: true, links: links.filter((l) => l.studentId !== input.studentId), parentId: parent.personId, studentId: input.studentId };
  }

  // Read-time view of the links (never stored). Students get parentRecords (open parents linked to them), parents get children.
  function enrichLinks(people) {
    const list = people || [], byId = new Map(list.map((p) => [p.personId, p]));
    const parentsOf = new Map();
    list.forEach((p) => {
      if (p.type !== 'parent' || !isOpen(p)) return;
      (p.links || []).forEach((l) => {
        if (!parentsOf.has(l.studentId)) parentsOf.set(l.studentId, []);
        parentsOf.get(l.studentId).push({ personId: p.personId, name: p.displayName, relationship: l.relationship || '' });
      });
    });
    return list.map((p) => {
      if (p.type === 'student') { const rec = parentsOf.get(p.personId) || []; return { ...p, parentRecords: rec, parentRecordCount: rec.length }; }
      if (p.type === 'parent') {
        const children = (p.links || []).map((l) => {
          const s = byId.get(l.studentId);
          return { personId: l.studentId, name: s ? s.displayName : '', relationship: l.relationship || '', status: s ? s.status : 'missing', className: s ? (s.className || '') : '' };
        });
        return { ...p, children, childRecordCount: children.filter((c) => c.status !== 'missing' && c.status !== 'archived').length };
      }
      return p;
    });
  }

  /* ---------------------------------------------------------------- needs attention + setup checklist (input: enrichLinks(enrichPeople(...))) */
  const hasParent = (s) => (s.parentRecordCount || 0) > 0 || (s.guardianCount || 0) > 0;
  function schoolAttention(enriched) {
    const open = (enriched || []).filter(isOpen), q = [];
    const add = (key, ids) => { if (ids.length) q.push({ key, ids }); };
    add('student_no_parent', open.filter((p) => p.type === 'student' && !hasParent(p)).map((p) => p.personId));
    add('parent_no_child', open.filter((p) => p.type === 'parent' && (p.childRecordCount || 0) === 0 && !(p.childCount > 0)).map((p) => p.personId));
    add('link_stale', open.filter((p) => p.type === 'parent' && (p.children || []).some((c) => c.status === 'archived' || c.status === 'missing')).map((p) => p.personId));
    add('staff_no_contact', open.filter((p) => p.type === 'staff' && !p.email && !p.phone).map((p) => p.personId));
    return q;
  }
  // classes: the list response's classes [{id, className, hasTeacher, studentCount}]. v0.10.0 (ClassDeck): giving a class a teacher IS pushing it to them, so the last
  // step counts the same classes as 'assign' — it is a separate line only so the checklist still ends on "the teacher has their classes".
  function setupChecklist(enriched, classes) {
    const open = (enriched || []).filter(isOpen), cl = classes || [];
    const T = open.filter((p) => p.type === 'teacher'), S = open.filter((p) => p.type === 'student');
    const stage = (have, done) => (have === 0 ? 'todo' : done >= have ? 'done' : 'doing');
    const step = (key, have, done) => ({ key, have, done, state: stage(have, done) });
    const reported = cl.every((c) => typeof c.hasTeacher === 'boolean' && typeof c.studentCount === 'number');
    const steps = [
      step('teachers', T.length, T.filter((p) => p.accountLink).length),
      step('students', S.length, S.filter((p) => p.classId).length),
      step('parents', S.length, S.filter(hasParent).length),
      step('classes', cl.length, cl.filter((c) => c.studentCount > 0).length),
      step('assign', cl.length, cl.filter((c) => c.hasTeacher).length),
      step('push', cl.length, cl.filter((c) => c.hasTeacher).length),
    ];
    if (!reported) { steps[3].state = 'unknown'; steps[4].state = 'unknown'; steps[5].state = 'unknown'; }
    return { steps, complete: steps.slice(0, 5).every((s) => s.state === 'done'), classesReported: reported };
  }

  /* ---------------------------------------------------------------- staff directory */
  // filters: { search, department ('' = all, '__none__' = no department), status ('open'|'archived'|'all') }
  // -> { groups:[{department, people}], departments:[names], total }
  function groupStaff(people, f) {
    const q = f || {}, status = q.status || 'open';
    const base = D.filterPeople(people, { type: 'staff', status, sort: 'name' });
    // 'IT', 'it' and 'It' are one department. Show the spelling most people use; on a tie the one that sorts first (so 'IT' beats 'it').
    const spellings = new Map();       // folded department -> Map(spelling -> count)
    base.forEach((p) => { const k = D.fold(p.department || ''); if (!k) return; const m = spellings.get(k) || new Map(); const sp = squeeze(p.department); m.set(sp, (m.get(sp) || 0) + 1); spellings.set(k, m); });
    const display = new Map();
    spellings.forEach((m, k) => display.set(k, Array.from(m.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]));
    const departments = Array.from(display.values()).sort((a, b) => D.fold(a).localeCompare(D.fold(b)));
    let list = D.filterPeople(people, { type: 'staff', status, search: q.search || '', sort: 'name' });
    if (q.department === '__none__') list = list.filter((p) => !D.fold(p.department || ''));
    else if (q.department) list = list.filter((p) => D.fold(p.department || '') === D.fold(q.department));
    const buckets = new Map();
    list.forEach((p) => {
      const k = D.fold(p.department || '');
      if (!buckets.has(k)) buckets.set(k, { department: k ? display.get(k) : '', people: [] });
      buckets.get(k).people.push(p);
    });
    const groups = Array.from(buckets.values()).sort((a, b) => (a.department === '' ? 1 : b.department === '' ? -1 : D.fold(a.department).localeCompare(D.fold(b.department))));
    return { groups, departments, total: list.length };
  }
  const STAFF_COLUMNS = ['name', 'title', 'department', 'email', 'phone', 'extension', 'room', 'start_date', 'responsibilities'];
  function staffToCsv(people, labels) {
    const L = Object.assign({ name: 'Name', title: 'Title', department: 'Department', email: 'Email', phone: 'Phone', extension: 'Extension', room: 'Room', start_date: 'Start date', responsibilities: 'Responsibilities', status: 'Status' }, labels || {});
    const lines = [STAFF_COLUMNS.concat('status').map((c) => D.csvCell(L[c])).join(',')];
    (people || []).forEach((p) => lines.push([p.displayName, p.title, p.department, p.email, p.phone, p.extension, p.room, p.startDate, p.responsibilities, p.status].map(D.csvCell).join(',')));
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }
  const staffTemplateCsv = () => '\uFEFF' + STAFF_COLUMNS.join(',') + '\r\n' + 'Tran Thi Hoa,Office manager,Administration,hoa.tran@example.com,0901234567,102,Front office,2024-08-15,Admissions and parent enquiries\r\n';

  /* ---------------------------------------------------------------- roster import: students + parents in one CSV */
  const hk = (h) => D.fold(h).replace(/[^a-z0-9]/g, '');
  const ROSTER_ALIASES = {
    displayName: ['name', 'fullname', 'displayname', 'studentname', 'hoten', 'ten', 'student'],
    firstName: ['firstname', 'givenname'], lastName: ['lastname', 'surname', 'familyname'],
    studentNumber: ['studentid', 'studentnumber', 'id', 'mahocsinh'],
    className: ['class', 'classname', 'lop', 'homeroom'],
  };
  const PARENT_FIELD = { name: 'name', fullname: 'name', hoten: 'name', email: 'email', mail: 'email', phone: 'phone', mobile: 'phone', zalo: 'phone', sdt: 'phone', relationship: 'relationship', relation: 'relationship', quanhe: 'relationship' };
  // -> { rows:[{row, displayName, studentNumber, className, parents:[{name,email,phone,relationship}]}], errors:[{row, code, max?}], ignoredHeaders:[] }
  function parseRoster(text) {
    const grid = D.parseCsv(text);
    if (!grid.length) return { rows: [], errors: [{ row: 0, code: 'csv_empty' }], ignoredHeaders: [] };
    const map = [], ignored = [];
    grid[0].forEach((h, i) => {
      const k = hk(h);
      const field = Object.keys(ROSTER_ALIASES).find((f) => ROSTER_ALIASES[f].includes(k));
      const pm = /^(?:parent|guardian)([1-4])([a-z]+)$/.exec(k);
      if (field) map[i] = { field };
      else if (pm && PARENT_FIELD[pm[2]]) map[i] = { parent: Number(pm[1]) - 1, field: PARENT_FIELD[pm[2]] };
      else { map[i] = null; if (k) ignored.push(squeeze(h)); }
    });
    const has = (f) => map.some((m) => m && !m.parent && m.field === f && m.parent === undefined);
    if (!has('displayName') && !has('firstName') && !has('lastName')) return { rows: [], errors: [{ row: 1, code: 'csv_no_name_column' }], ignoredHeaders: ignored };
    const errors = [];
    if (grid.length - 1 > D.IMPORT_MAX_ROWS) errors.push({ row: 0, code: 'csv_too_many_rows', max: D.IMPORT_MAX_ROWS });
    const rows = grid.slice(1, D.IMPORT_MAX_ROWS + 1).map((cells, k) => {
      const o = { row: k + 2, parents: [] }, ps = {};
      cells.forEach((cell, i) => {
        const m = map[i], v = squeeze(cell);
        if (!m || v === '') return;
        if (m.parent !== undefined) { (ps[m.parent] = ps[m.parent] || {})[m.field] = v; } else o[m.field] = v;
      });
      if (!o.displayName && (o.firstName || o.lastName)) o.displayName = [o.firstName, o.lastName].filter(Boolean).join(' ');
      delete o.firstName; delete o.lastName;
      Object.keys(ps).map(Number).sort().forEach((i) => o.parents.push({ name: ps[i].name || '', email: ps[i].email || '', phone: ps[i].phone || '', relationship: ps[i].relationship || '' }));
      return o;
    });
    return { rows, errors, ignoredHeaders: ignored };
  }
  const rosterTemplateCsv = () => '\uFEFF' + 'student_id,name,class,parent1_name,parent1_email,parent1_phone,parent1_relationship,parent2_name,parent2_email,parent2_phone,parent2_relationship\r\n'
    + 'S1001,Nguyễn Minh Anh,5A,Nguyễn Văn An,an.nguyen@example.com,0901234567,Father,Trần Thị Hoa,hoa.tran@example.com,,Mother\r\n';

  // rows: parseRoster rows; directory: existing records; classes: [{id, className}]
  // -> { students:[planImport results], newParents:[{key, person, links:[{row, relationship}]}], existingParents:[{personId, displayName, add:[{row, relationship}]}],
  //      warnings:[{row, parent, errors:[{field, code}]}], summary }
  // A parent is matched to an existing or earlier parent by EMAIL only. Two parents with the same name and no email are never merged — two
  // different families can share a name, and a wrong link would later show one family's child to another family.
  function planRoster(rows, directory, classes) {
    const list = rows || [];
    const plan = D.planImport(list.map((r) => ({ type: 'student', row: r.row, displayName: r.displayName, studentNumber: r.studentNumber, className: r.className })), directory, classes);
    const byRow = new Map(list.map((r) => [r.row, r]));
    const byEmail = new Map();
    (directory || []).filter((p) => p.type === 'parent' && p.email).forEach((p) => { if (!byEmail.has(p.email.toLowerCase())) byEmail.set(p.email.toLowerCase(), { kind: 'existing', rec: p }); });
    const newParents = [], existing = new Map(), warnings = [];
    let links = 0;
    plan.results.forEach((res) => {
      if (res.status !== 'create') return;
      const src = byRow.get(res.row);
      (src.parents || []).slice(0, MAX_PARENTS).forEach((sp, idx) => {
        if (!sp.name && !sp.email && !sp.phone) return;
        const v = D.validatePerson({ type: 'parent', displayName: sp.name, email: sp.email, phone: sp.phone, relationship: sp.relationship });
        if (!v.ok) { warnings.push({ row: res.row, parent: idx + 1, errors: v.errors }); return; }
        const email = v.person.email, rel = v.person.relationship;
        const hit = email ? byEmail.get(email) : null;
        if (hit && hit.kind === 'existing') {
          if (!isOpen(hit.rec)) { warnings.push({ row: res.row, parent: idx + 1, errors: [{ field: 'email', code: 'parent_archived' }] }); return; }
          const touch = existing.get(hit.rec.personId) || { personId: hit.rec.personId, displayName: hit.rec.displayName, add: [] };
          if ((hit.rec.links || []).length + touch.add.length >= MAX_CHILDREN) { warnings.push({ row: res.row, parent: idx + 1, errors: [{ field: 'parentId', code: 'too_many_children', max: MAX_CHILDREN }] }); return; }
          touch.add.push({ row: res.row, relationship: rel }); existing.set(hit.rec.personId, touch); links++; return;
        }
        if (hit && hit.kind === 'new') {
          if (hit.entry.links.length >= MAX_CHILDREN) { warnings.push({ row: res.row, parent: idx + 1, errors: [{ field: 'parentId', code: 'too_many_children', max: MAX_CHILDREN }] }); return; }
          hit.entry.links.push({ row: res.row, relationship: rel }); links++; return;
        }
        if (!email) warnings.push({ row: res.row, parent: idx + 1, errors: [{ field: 'email', code: 'parent_no_email' }], info: true });
        const entry = { key: 'np' + (newParents.length + 1), person: v.person, links: [{ row: res.row, relationship: rel }] };
        newParents.push(entry); links++;
        if (email) byEmail.set(email, { kind: 'new', entry });
      });
    });
    return {
      students: plan.results, newParents, existingParents: Array.from(existing.values()), warnings,
      summary: { students: plan.summary, parentsNew: newParents.length, parentsExisting: existing.size, links, warnings: warnings.filter((w) => !w.info).length, notes: warnings.filter((w) => w.info).length },
    };
  }

  return {
    MAX_CHILDREN, MAX_PARENTS, linkParent, unlinkParent, enrichLinks, schoolAttention, setupChecklist,
    groupStaff, STAFF_COLUMNS, staffToCsv, staffTemplateCsv, parseRoster, rosterTemplateCsv, planRoster,
  };
});

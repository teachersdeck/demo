/* adminSchoolDeck — AdminDeck v0.8.0 reference copy, for trifecta-firebase-backend v1.8.0.
   THE BACKEND PACKAGE IS THE SOURCE OF TRUTH: copy THREE files into the backend's functions/src/ (next to adminDeck.js and adminDirectory.js):
       adminSchoolDeck.js (this file), schooldeck.js, and the v0.8.0 versions of directory.js and adminDirectory.js (both gained a few lines);
   export the three functions below from its index.js, and deploy:
       firebase deploy --only functions:adminSchoolDeckLink,functions:adminSchoolDeckImportRoster,functions:adminSchoolDeckActivity,functions:adminDirectoryList,functions:adminDirectoryUpsert,functions:adminDirectoryImport
   (the last three because directory.js changed: staff records now carry extension, room, start date and responsibilities, and the list reports each class's
   student count and whether it has a teacher). Same secret (ADMINDECK_SECRET), same auth, same CORS as every other AdminDeck function. Admin SDK.

   SCHOOLDECK, first slice. Writes go to TWO collections only — `directory` and `adminAudit`, exactly as the People Directory — and it reads
   `classes`, `students`, `users` and `guardianLinks` with select() through the same loadContext. It never writes to classes, students, users, guardianLinks,
   points or homework. Neither collection has a Firestore rule, so clients cannot touch them. Do NOT add one.

   A LINK between a parent and a student is stored on the parent's directory record (links:[{studentId, relationship}]); see schooldeck.js. It records who the
   school intends to connect. It does NOT create a guardianLinks entry — that is the account-claim step, still to come.

   Every write appends an adminAudit entry with the real counts after the commit. `actor` is 'admin-secret' (no named admin accounts yet).

   Loads in Node (the backend, tests/) AND in the browser (window.AdminSchoolDeckFns): demo mode runs these very functions over an in-memory database.

   Wire them like the directory functions:
       const { makeAdminSchoolDeckLink, makeAdminSchoolDeckImportRoster, makeAdminSchoolDeckActivity } = require('./adminSchoolDeck');
       const deps = { onRequest, logger, db, auth, FieldValue, secret: ADMINDECK_SECRET, handlePreflight, requireAdmin };
       const adminSchoolDeckLink = makeAdminSchoolDeckLink(deps);         // ...and likewise for the other two

   Bodies (POST, JSON; the activity also answers GET):
     adminSchoolDeckLink        { action:'link'|'unlink', parentId, studentId, relationship? } -> { parentId, studentId, links } | 400 { errors }
     adminSchoolDeckImportRoster{ rows:[{row, displayName, studentNumber, className, parents:[{name,email,phone,relationship}]}], dryRun?: true }
                                -> { dryRun, summary, students, newParents, existingParents, warnings, created?:{students,parents,links}, failed? }   dry run by default
     adminSchoolDeckActivity    { limit? (1-200, default 100) } -> { entries:[{id, atMs, actor, action, summary, people}] }   newest first */
'use strict';
(function (root) {
const node = typeof module !== 'undefined' && module.exports;
const D = node ? require('./directory') : root.Directory;
const S = node ? require('./schooldeck') : root.SchoolDeck;
const DF = node ? require('./adminDirectory') : root.AdminDirectoryFns;
const { handler, commitAll, audit, loadContext } = DF;

const str = (v, max) => (v == null ? '' : String(v)).slice(0, max || 300);
const validId = (id) => typeof id === 'string' && id && id.length <= 128 && !id.includes('/');
const cleanRow = (r, i) => ({
  row: Number.isFinite(Number(r && r.row)) ? Number(r.row) : i + 2,
  displayName: str(r && r.displayName), studentNumber: str(r && r.studentNumber, 80), className: str(r && r.className, 80),
  parents: (Array.isArray(r && r.parents) ? r.parents : []).slice(0, S.MAX_PARENTS).map((p) => ({ name: str(p && p.name), email: str(p && p.email, 254), phone: str(p && p.phone, 40), relationship: str(p && p.relationship, 100) })),
});
const trimPlan = (plan) => ({
  summary: plan.summary,
  students: plan.students.map((r) => ({ row: r.row, status: r.status, errors: r.errors, matches: r.matches, name: r.person.displayName })),
  newParents: plan.newParents.map((n) => ({ key: n.key, name: n.person.displayName, email: n.person.email, children: n.links.length })),
  existingParents: plan.existingParents.map((e) => ({ personId: e.personId, name: e.displayName, children: e.add.length })),
  warnings: plan.warnings,
});

/* ---------------------------------------------------------------- link / unlink one parent and one student */
function makeAdminSchoolDeckLink(deps) {
  const { db, FieldValue } = deps;
  return handler(deps, { name: 'adminSchoolDeckLink' }, async (req, res) => {
    const b = req.body || {};
    if (!['link', 'unlink'].includes(b.action)) { res.status(400).json({ error: "action must be 'link' or 'unlink'" }); return; }
    if (!validId(b.parentId) || !validId(b.studentId)) { res.status(400).json({ error: 'parentId and studentId are required' }); return; }
    const snap = await db.collection('directory').get();
    const directory = snap.docs.map((d) => ({ personId: d.id, ...d.data() }));
    const r = b.action === 'link' ? S.linkParent(directory, b) : S.unlinkParent(directory, b);
    if (!r.ok) { res.status(400).json({ errors: r.errors }); return; }
    const parent = directory.find((p) => p.personId === r.parentId), student = directory.find((p) => p.personId === r.studentId);
    await db.collection('directory').doc(r.parentId).set({ links: r.links, updatedAtMs: Date.now() }, { merge: true });
    await audit(db, FieldValue, 'schooldeck.' + b.action, { personIds: [r.parentId, r.studentId], summary: `${b.action}: ${parent.displayName} - ${student ? student.displayName : r.studentId}` });
    res.status(200).json({ parentId: r.parentId, studentId: r.studentId, links: r.links.length });
  });
}

/* ---------------------------------------------------------------- roster import: students and their parents */
function makeAdminSchoolDeckImportRoster(deps) {
  const { db, auth, logger, FieldValue } = deps;
  return handler(deps, { name: 'adminSchoolDeckImportRoster' }, async (req, res) => {
    const b = req.body || {};
    if (!Array.isArray(b.rows) || !b.rows.length) { res.status(400).json({ error: 'rows must be a non-empty list' }); return; }
    if (b.rows.length > D.IMPORT_MAX_ROWS) { res.status(400).json({ error: 'at most ' + D.IMPORT_MAX_ROWS + ' rows per import' }); return; }
    const dryRun = b.dryRun !== false;
    const ctx = await loadContext(db, auth);
    const plan = S.planRoster(b.rows.map(cleanRow), ctx.directory, ctx.classes);
    if (dryRun) { res.status(200).json({ dryRun: true, ...trimPlan(plan) }); return; }

    const now = Date.now();
    const base = (source) => ({ schoolId: 'default', accountLink: null, source, createdAtMs: now, updatedAtMs: now, archivedAtMs: null, createdBy: 'admin-secret' });
    // 1) students first, so a parent link can only ever point at a student that really was written
    const rowToId = new Map(), studentWrites = [];
    plan.students.filter((r) => r.status === 'create').forEach((r) => {
      const ref = db.collection('directory').doc(); rowToId.set(r.row, ref.id);
      studentWrites.push({ ref, data: { ...r.person, ...base('import'), personId: ref.id, status: D.defaultStatus('student') } });
    });
    const sw = await commitAll(db, logger, studentWrites);
    const bad = new Set(sw.failed);
    const idOf = (row) => { const id = rowToId.get(row); return id && !bad.has(id) ? id : null; };
    // 2) then the parents (new records, and new links added to parents who already exist)
    const parentWrites = [], meta = new Map();
    plan.newParents.forEach((n) => {
      const links = n.links.map((l) => ({ studentId: idOf(l.row), relationship: l.relationship })).filter((l) => l.studentId);
      if (!links.length) return;
      const ref = db.collection('directory').doc();
      parentWrites.push({ ref, data: { ...n.person, ...base('import'), personId: ref.id, status: D.defaultStatus('parent'), links } });
      meta.set(ref.id, { isNew: true, links: links.length });
    });
    plan.existingParents.forEach((e) => {
      const rec = ctx.directory.find((p) => p.personId === e.personId);
      const add = e.add.map((l) => ({ studentId: idOf(l.row), relationship: l.relationship })).filter((l) => l.studentId);
      if (!rec || !add.length) return;
      parentWrites.push({ ref: db.collection('directory').doc(e.personId), merge: true, data: { links: (rec.links || []).concat(add), updatedAtMs: now } });
      meta.set(e.personId, { isNew: false, links: add.length });
    });
    const pw = await commitAll(db, logger, parentWrites);
    const pbad = new Set(pw.failed);
    let parentsCreated = 0, links = 0;
    meta.forEach((m, id) => { if (pbad.has(id)) return; if (m.isNew) parentsCreated++; links += m.links; });
    const created = { students: sw.written, parents: parentsCreated, links };
    const failed = sw.failed.concat(pw.failed);
    if (sw.written || failed.length) {
      await audit(db, FieldValue, 'schooldeck.importRoster', {
        personIds: studentWrites.slice(0, 50).map((w) => w.ref.id),
        summary: `roster import: ${created.students} student(s), ${created.parents} new parent(s), ${links} link(s); ${plan.summary.students.duplicate} duplicate, ${plan.summary.students.invalid} invalid, ${failed.length} failed`,
        counts: created, failed,
      });
    }
    res.status(200).json({ dryRun: false, ...trimPlan(plan), created, failed });
  });
}

/* ---------------------------------------------------------------- activity: the audit log, newest first */
function makeAdminSchoolDeckActivity(deps) {
  const { db } = deps;
  return handler(deps, { name: 'adminSchoolDeckActivity', get: true }, async (req, res) => {
    const n = Math.floor(Number(req.body && req.body.limit));
    const limit = n >= 1 ? Math.min(200, n) : 100;                 // anything that is not a positive number gets the default
    const snap = await db.collection('adminAudit').orderBy('atMs', 'desc').limit(limit).get();
    const entries = snap.docs.map((d) => { const x = d.data(); return { id: d.id, atMs: x.atMs || 0, actor: x.actor || '', action: x.action || '', summary: x.summary || '', people: (x.personIds || []).length }; });
    res.status(200).json({ entries });
  });
}

const api = { makeAdminSchoolDeckLink, makeAdminSchoolDeckImportRoster, makeAdminSchoolDeckActivity };
if (node) module.exports = api; else root.AdminSchoolDeckFns = api;
})(typeof self !== 'undefined' ? self : this);

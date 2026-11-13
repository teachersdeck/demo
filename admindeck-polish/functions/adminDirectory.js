/* adminDirectory — AdminDeck v0.7.0 reference copy, for trifecta-firebase-backend v1.7.0.
   THE BACKEND PACKAGE IS THE SOURCE OF TRUTH: copy BOTH this file and directory.js into the backend's functions/src/ (next to adminDeck.js and
   adminTheme.js), export the five functions below from its index.js, and deploy:
       firebase deploy --only functions:adminDirectoryList,functions:adminDirectoryBackfill,functions:adminDirectoryUpsert,functions:adminDirectoryImport,functions:adminDirectoryArchive
   Same secret (ADMINDECK_SECRET), same auth, same CORS as every other AdminDeck function. Admin SDK.

   THE PEOPLE DIRECTORY (first slice of the administration build). Records for teachers, students, parents and staff that an admin can create
   BEFORE the person ever signs in or joins; they are linked to their account later. See directory.js's header for the model.

   Collections it touches — and ONLY these, for writes:
       directory/{personId}   one document per person
       adminAudit/{id}        one entry per write: { atMs, at, actor, action, personIds, summary, ... }
   It READS classes, students, users and guardianLinks (select(): only the fields it needs) to link and describe people. It never writes to
   classes, students, users, guardianLinks, points, homework or anything else — so a directory mistake cannot touch learning data.
   Neither collection has a Firestore rule, so clients cannot read or write them (default deny); only these functions can.

   AUDIT: every write appends an adminAudit entry, with the actual counts after the commit (so a half-failed import is recorded as exactly what
   happened). `actor` is 'admin-secret' for now — there are still no named admin accounts, so the log says WHAT changed and WHEN, not WHO.
   Named accounts and roles are the next piece of this build; until they exist, everyone holding ADMINDECK_SECRET is an Owner.

   Loads in Node (the backend, tests/) AND in the browser (window.AdminDirectoryFns): demo mode runs these very functions over an in-memory database,
   so the demo exercises the real validation, duplicate checks, import and audit code. index.html loads it from functions/ — one copy.

   Wire them like adminPushTheme:
       const { makeAdminDirectoryList, makeAdminDirectoryBackfill, makeAdminDirectoryUpsert, makeAdminDirectoryImport, makeAdminDirectoryArchive } = require('./adminDirectory');
       const deps = { onRequest, logger, db, auth, FieldValue, secret: ADMINDECK_SECRET, handlePreflight, requireAdmin };
       const adminDirectoryList = makeAdminDirectoryList(deps);       // ...and likewise for the other four

   Bodies (POST, JSON; the list also answers GET):
     adminDirectoryList      { filters? }                    -> { people, counts, archivedCount, attention, classes, backfill:{pending,total} }
     adminDirectoryBackfill  { dryRun?: true }               -> { dryRun, counts:{teacher,student,parent}, total, created? }   dry run by default
     adminDirectoryUpsert    { person:{personId?, type, ...}, force? } -> { personId, created } | 400 { errors } | 409 { duplicates }
     adminDirectoryImport    { type, people:[{row, ...}], dryRun?: true } -> { dryRun, summary:{create,duplicate,invalid}, results, created? }
     adminDirectoryArchive   { personIds:[...], action:'archive'|'restore' } -> { changed, skipped:[], missing:[] }  */
'use strict';
(function (root) {
const D = (typeof module !== 'undefined' && module.exports) ? require('./directory') : root.Directory;   // same file in Node (backend, tests) and the browser (demo mode)

const BATCH = 400;
const ARCHIVE_MAX = 200;
const ALLOWED_INPUT = ['personId', 'type', 'displayName', 'email', 'phone', 'subjects', 'employeeNumber', 'classId', 'className', 'studentNumber', 'relationship', 'preferredContact', 'title', 'department', 'extension', 'room', 'startDate', 'responsibilities', 'row'];
const pickInput = (o) => { const out = {}; ALLOWED_INPUT.forEach((k) => { if (o && o[k] !== undefined) out[k] = o[k]; }); return out; };

// Everything the directory needs to link and describe people. `auth` is optional (teacher names are best-effort).
async function loadContext(db, auth) {
  const [dirS, classesS, studentsS, usersS, linksS] = await Promise.all([
    db.collection('directory').get(),
    db.collection('classes').select('className', 'teacherUid').get(),
    db.collection('students').select('classId', 'displayName').get(),
    db.collection('users').select('role', 'displayName', 'email').get(),
    db.collection('guardianLinks').select('parentUid', 'studentId').get(),
  ]);
  const directory = dirS.docs.map((d) => ({ personId: d.id, ...d.data() }));
  const classes = classesS.docs.map((d) => ({ id: d.id, className: d.data().className || '', teacherUid: d.data().teacherUid || null }));
  const students = studentsS.docs.map((d) => ({ id: d.id, classId: d.data().classId || '', displayName: d.data().displayName || '' }));
  const users = usersS.docs.map((d) => ({ uid: d.id, role: d.data().role, displayName: d.data().displayName || '', email: d.data().email || '' }));
  const guardianLinks = linksS.docs.map((d) => ({ parentUid: d.data().parentUid, studentId: d.data().studentId }));
  // a teacher who owns a class but has no users/ document: look the name up in Firebase Auth, best effort
  const known = new Set(users.map((u) => u.uid)), teachers = {};
  const missing = Array.from(new Set(classes.map((c) => c.teacherUid).filter((u) => u && !known.has(u))));
  if (auth) for (let i = 0; i < missing.length; i += 100) {
    try { (await auth.getUsers(missing.slice(i, i + 100).map((uid) => ({ uid })))).users.forEach((u) => { teachers[u.uid] = { name: u.displayName || '', email: u.email || '' }; }); }
    catch (e) { /* degrade to a blank name */ }
  }
  return { directory, classes, students, users, guardianLinks, teachers };
}

function handler(deps, opts, fn) {
  const { onRequest, logger, secret, handlePreflight, requireAdmin } = deps;
  return onRequest({ secrets: [secret], timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (!(opts.get && req.method === 'GET') && req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
    if (!requireAdmin(req, res)) return;
    try { await fn(req, res); }
    catch (e) { logger.error(opts.name + ' failed', e); res.status(500).json({ error: 'Internal error in ' + opts.name }); }
  });
}

// Commit `refs`/`data` pairs in small batches; returns how many were written and which failed. Audit is written AFTER, with the real numbers.
async function commitAll(db, logger, writes) {
  let written = 0; const failed = [];
  for (let i = 0; i < writes.length; i += BATCH) {
    const chunk = writes.slice(i, i + BATCH), batch = db.batch();
    chunk.forEach((w) => (w.merge ? batch.set(w.ref, w.data, { merge: true }) : batch.set(w.ref, w.data)));
    try { await batch.commit(); written += chunk.length; }
    catch (e) { logger.error('adminDirectory: batch failed', e); chunk.forEach((w) => failed.push(w.ref.id)); }
  }
  return { written, failed };
}
async function audit(db, FieldValue, action, extra) {
  await db.collection('adminAudit').doc().set({ atMs: Date.now(), at: FieldValue.serverTimestamp(), actor: 'admin-secret', action, ...extra });
}

/* ---------------------------------------------------------------- list */
function makeAdminDirectoryList(deps) {
  const { db, auth } = deps;
  return handler(deps, { name: 'adminDirectoryList', get: true }, async (req, res) => {
    const ctx = await loadContext(db, auth);
    const filters = (req.body && req.body.filters) || null;
    res.status(200).json(D.buildListResponse(ctx.directory, ctx, ctx, filters, Date.now()));
  });
}

/* ---------------------------------------------------------------- backfill */
function makeAdminDirectoryBackfill(deps) {
  const { db, auth, logger, FieldValue } = deps;
  return handler(deps, { name: 'adminDirectoryBackfill' }, async (req, res) => {
    const dryRun = !(req.body && req.body.dryRun === false);
    const ctx = await loadContext(db, auth);
    const plan = D.buildBackfill(ctx, Date.now());
    if (dryRun) { res.status(200).json({ dryRun: true, counts: plan.counts, total: plan.total }); return; }
    const writes = plan.create.map((r) => ({ ref: db.collection('directory').doc(r.personId), data: r }));
    const { written, failed } = await commitAll(db, logger, writes);
    if (written || failed.length) await audit(db, FieldValue, 'directory.backfill', { personIds: [], summary: `adopted ${written} existing account(s); ${failed.length} failed`, counts: plan.counts, written, failed: failed.length });
    res.status(200).json({ dryRun: false, counts: plan.counts, total: plan.total, created: written, failed });
  });
}

/* ---------------------------------------------------------------- add / edit one */
function makeAdminDirectoryUpsert(deps) {
  const { db, auth, FieldValue } = deps;
  return handler(deps, { name: 'adminDirectoryUpsert' }, async (req, res) => {
    const body = req.body || {};
    const input = pickInput(body.person);
    const ctx = await loadContext(db, auth);
    const now = Date.now();
    const existing = input.personId ? ctx.directory.find((p) => p.personId === input.personId) : null;
    if (input.personId && !existing) { res.status(404).json({ error: 'No such person' }); return; }

    let merged = input;
    if (existing) {
      if (input.type && input.type !== existing.type) { res.status(400).json({ errors: [{ field: 'type', code: 'type_locked' }] }); return; }
      merged = { ...existing, ...input, type: existing.type };
      // A linked student's name and class belong to the student's own account (students/{id}) — the name is what they use to get back in.
      // Changing them here would make the two disagree, so that waits for the StudentAdmin move/rename functions.
      if (existing.type === 'student' && existing.accountLink) {
        const lockedErrors = [];
        if (input.displayName !== undefined && D.fold(input.displayName) !== D.fold(existing.displayName)) lockedErrors.push({ field: 'displayName', code: 'locked_linked_student' });
        if (input.classId !== undefined && (input.classId || '') !== (existing.classId || '')) lockedErrors.push({ field: 'classId', code: 'locked_linked_student' });
        if (lockedErrors.length) { res.status(400).json({ errors: lockedErrors }); return; }
      }
    }
    const classIds = new Set(ctx.classes.map((c) => c.id));
    const v = D.validatePerson(merged);
    // report EVERY problem at once (a bad class alongside a bad field), not one per attempt
    const errors = v.errors.slice();
    if (merged.type === 'student' && merged.classId && !classIds.has(merged.classId)) errors.push({ field: 'classId', code: 'class_not_found' });
    if (errors.length) { res.status(400).json({ errors }); return; }

    const dups = D.findDuplicates(v.person, ctx.directory, existing && existing.personId);
    if (dups.length && !body.force) { res.status(409).json({ duplicates: dups }); return; }

    if (!existing) {
      const ref = db.collection('directory').doc();
      const rec = { ...v.person, personId: ref.id, status: D.defaultStatus(v.person.type), accountLink: null, schoolId: 'default', source: 'manual', createdAtMs: now, updatedAtMs: now, archivedAtMs: null, createdBy: 'admin-secret' };
      await ref.set(rec);
      await audit(db, FieldValue, 'directory.create', { personIds: [ref.id], summary: `${rec.type}: ${rec.displayName}`, forcedDuplicate: !!dups.length });
      res.status(200).json({ personId: ref.id, created: true });
      return;
    }
    const changes = {};
    Object.keys(v.person).forEach((k) => { if ((existing[k] || '') !== (v.person[k] || '')) changes[k] = [existing[k] || '', v.person[k] || '']; });
    if (!Object.keys(changes).length) { res.status(200).json({ personId: existing.personId, created: false, unchanged: true }); return; }
    // merge:true — the edit form owns only the person's descriptive fields; status, accountLink, source, created*, archived* stay as they are
    await db.collection('directory').doc(existing.personId).set({ ...v.person, updatedAtMs: now }, { merge: true });
    await audit(db, FieldValue, 'directory.update', { personIds: [existing.personId], summary: `${existing.type}: ${existing.displayName}`, changes });
    res.status(200).json({ personId: existing.personId, created: false });
  });
}

/* ---------------------------------------------------------------- bulk import */
function makeAdminDirectoryImport(deps) {
  const { db, auth, logger, FieldValue } = deps;
  return handler(deps, { name: 'adminDirectoryImport' }, async (req, res) => {
    const body = req.body || {};
    if (!D.TYPES.includes(body.type)) { res.status(400).json({ errors: [{ field: 'type', code: 'type_invalid' }] }); return; }
    if (!Array.isArray(body.people) || !body.people.length) { res.status(400).json({ error: 'people must be a non-empty list' }); return; }
    if (body.people.length > D.IMPORT_MAX_ROWS) { res.status(400).json({ error: 'at most ' + D.IMPORT_MAX_ROWS + ' rows per import' }); return; }
    const dryRun = body.dryRun !== false;
    const ctx = await loadContext(db, auth);
    const rows = body.people.map((r, i) => ({ ...pickInput(r), type: body.type, row: Number.isFinite(Number(r && r.row)) ? Number(r.row) : i + 2 }));
    const plan = D.planImport(rows, ctx.directory, ctx.classes);
    if (dryRun) { res.status(200).json({ dryRun: true, summary: plan.summary, results: plan.results }); return; }
    const now = Date.now();
    const writes = plan.results.filter((r) => r.status === 'create').map((r) => {
      const ref = db.collection('directory').doc();
      return { ref, data: { ...r.person, personId: ref.id, status: D.defaultStatus(r.person.type), accountLink: null, schoolId: 'default', source: 'import', createdAtMs: now, updatedAtMs: now, archivedAtMs: null, createdBy: 'admin-secret' } };
    });
    const { written, failed } = await commitAll(db, logger, writes);
    if (written || failed.length) await audit(db, FieldValue, 'directory.import', { personIds: writes.slice(0, 50).map((w) => w.ref.id), summary: `${body.type} import: ${written} created, ${plan.summary.duplicate} duplicate, ${plan.summary.invalid} invalid, ${failed.length} failed`, summary_counts: plan.summary, written, failed: failed.length });
    res.status(200).json({ dryRun: false, summary: plan.summary, results: plan.results, created: written, failed });
  });
}

/* ---------------------------------------------------------------- archive / restore */
function makeAdminDirectoryArchive(deps) {
  const { db, logger, FieldValue } = deps;
  return handler(deps, { name: 'adminDirectoryArchive' }, async (req, res) => {
    const { personIds, action } = req.body || {};
    if (!['archive', 'restore'].includes(action)) { res.status(400).json({ error: "action must be 'archive' or 'restore'" }); return; }
    if (!Array.isArray(personIds) || !personIds.length || personIds.length > ARCHIVE_MAX) { res.status(400).json({ error: 'personIds must be a list of 1 to ' + ARCHIVE_MAX }); return; }
    if (!personIds.every((id) => typeof id === 'string' && id && id.length <= 128 && !id.includes('/'))) { res.status(400).json({ error: 'personIds contains an invalid id' }); return; }
    const ids = Array.from(new Set(personIds)), now = Date.now();
    const snaps = await Promise.all(ids.map((id) => db.collection('directory').doc(id).get()));
    const writes = [], skipped = [], missing = [], changedIds = [];
    snaps.forEach((s, i) => {
      if (!s.exists) { missing.push(ids[i]); return; }
      const p = s.data();
      if (action === 'archive') {
        if (p.status === 'archived') { skipped.push(ids[i]); return; }
        writes.push({ ref: db.collection('directory').doc(ids[i]), merge: true, data: { status: 'archived', statusBeforeArchive: p.status, archivedAtMs: now, updatedAtMs: now } });
      } else {
        if (p.status !== 'archived') { skipped.push(ids[i]); return; }
        writes.push({ ref: db.collection('directory').doc(ids[i]), merge: true, data: { status: p.statusBeforeArchive || (p.accountLink ? 'active' : 'invited'), archivedAtMs: null, updatedAtMs: now } });
      }
      changedIds.push(ids[i]);
    });
    const { written, failed } = await commitAll(db, logger, writes);
    if (written || failed.length) await audit(db, FieldValue, 'directory.' + action, { personIds: changedIds.slice(0, 200), summary: `${action}: ${written} changed, ${failed.length} failed`, written, failed: failed.length });
    res.status(200).json({ changed: written, skipped, missing, failed });
  });
}

const api = { loadContext, handler, commitAll, audit, pickInput, makeAdminDirectoryList, makeAdminDirectoryBackfill, makeAdminDirectoryUpsert, makeAdminDirectoryImport, makeAdminDirectoryArchive };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AdminDirectoryFns = api;
})(typeof self !== 'undefined' ? self : this);

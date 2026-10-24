/* adminClassDeck — AdminDeck v0.13.0, for trifecta-firebase-backend v2.10.0 (v0.10.0 / v2.4.0 added the first four functions; v2.5.0 added
   adminSetSchedule; v2.10.0 adds adminClassHistory + adminArchiveClass, and grade/homeroom/year/archived on the class itself — SchoolDeck's History tab).
   THE BACKEND PACKAGE DEPLOYS THIS FILE from functions/src/admindeck/ (byte-identical to this copy: tools/check_shared.py). Edit THIS copy, then run
   `python3 tools/check_shared.py --fix`.

   CLASSDECK — the school builds its classes. Until now a class could only be created by its own teacher (classes.js createClass) and AdminDeck
   could only READ classes. These functions are the school-side counterparts, for SchoolDeck's Classes/Schedule/History tabs:

     adminCreateClass        { className, teacherUid?, schoolId?, grade?, homeroom?, year? } -> { classId, className, teacherUid, studentJoinCode, parentJoinCode }
     adminAssignTeacher      { classId, teacherUid | null }                   -> { classId, teacherUid, changed }     (null = unassign)
     adminUpdateClass        { classId, className?, rankingVisibility?, classPulse?, parentLinking?, grade?, homeroom?, year? } -> { classId, changed:[field,...] }
     adminRegenerateJoinCode { classId, which:'student'|'parent' }            -> { classId, studentJoinCode? | parentJoinCode? }
     adminSetSchedule        { classId, slots:[{day,start,end,room}], from?, to? } -> { classId, changed, schedule }   (v2.5.0; replaces the whole timetable, [] clears it;
                                                                                         the rules live in classSchedule.js, which the Schedule tab shares)
     adminClassHistory       { classId, limit? }                              -> { classId, className, archived, entries }   (v2.10.0; a per-class view
                                                                                         over the SAME adminAudit log every classdeck.* action already writes —
                                                                                         no new log, just a classIds array-contains query on the existing one)
     adminArchiveClass       { classId, archived:boolean }                    -> { classId, changed, archived }       (v2.10.0; sets archived/archivedAt on
                                                                                         the class and writes one more classdeck.archive audit entry)

   They are the admin versions of createClass / setRankingVisibility / setClassPulse / setParentLinking / regenerateJoinCode, which only accept the class's
   own teacher. Same field names, same allowed values, so a class built here is indistinguishable from one a teacher built — except `managedBy: 'school'`,
   which tells TeachersDeck the school owns it. grade/homeroom/year/archived are new fields with no TeachersDeck/StudentDeck/ParentDeck reader yet — this
   is additive, AdminDeck-only data for now (the scope document flagged these as entirely absent from the class model; archiving a class does NOT touch
   teacherUid, rosters, or anything a student/parent app reads — it is a label AdminDeck shows and filters on, not an enforcement).

   WHAT THEY WRITE: `classes` (the first AdminDeck functions that do — schoolScope.js allows it, inside the caller's school only, and stamps schoolId on
   create) and `adminAudit` (one entry per change, with classIds). `classes` still has no client write rule: `allow write: if false` stands, and must.
   They never touch students, users, guardianLinks, points or homework.

   A TEACHER CAN ONLY BE ASSIGNED IF THEY HAVE AN ACCOUNT IN THIS SCHOOL: a People Directory teacher record that is linked to a login (accountLink), or a
   users/{uid} teacher who has joined the school. A teacher who has only been invited cannot own a class yet — there is no uid to give it. Assigning is the
   "push": the teacher's apps find their classes by classes.teacherUid, so the class simply appears for them.

   JOIN CODES must be unique across ALL schools (a student types one in with no school attached), so the uniqueness check reads the real database
   (`deps.rawDb`), not the school-scoped one.

   Loads in Node (the backend, tests/) AND in the browser (window.AdminClassDeckFns): demo mode runs these very functions over an in-memory database.

   Wire them like the SchoolDeck functions:
       const { makeAdminCreateClass, makeAdminAssignTeacher, makeAdminUpdateClass, makeAdminRegenerateJoinCode, makeAdminSetSchedule, makeAdminClassHistory, makeAdminArchiveClass } = require('./adminClassDeck');
       const deps = { onRequest, logger, db, rawDb, auth, FieldValue, secret, handlePreflight, requireAdmin, lookupTeacher, currentScope, generateJoinCode };  */
'use strict';
(function (root) {
const node = typeof module !== 'undefined' && module.exports;
const DF = node ? require('./adminDirectory') : root.AdminDirectoryFns;
const CS = node ? require('./classSchedule') : root.ClassScheduleFns;
const { handler, audit } = DF;

const NAME_MAX = 80;
const LABEL_MAX = 40; // grade, homeroom
const YEAR_MAX = 20;  // e.g. "2026-2027" or a single-year school's own convention — free text, not a parsed range
const RANKING_VISIBILITIES = ['full', 'anonymized', 'opt_out'];
const PARENT_LINKING = ['family-code', 'class-code'];
const FIELD_LABEL = { className: 'name', rankingVisibility: 'ranking visibility', classPulse: 'Class Pulse', parentLinking: 'parent linking', grade: 'grade', homeroom: 'homeroom', year: 'year' };

const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 128 && !id.includes('/');
const squeeze = (v) => (v == null ? '' : String(v)).trim().replace(/\s+/g, ' ');

// ---------------------------------------------------------------- pure validation (also used by the tests and the ClassDeck form)
// -> { ok:true, value } | { ok:false, error:{ field, code, max? } }
function validateClassName(v) {
  const name = squeeze(v);
  if (!name) return { ok: false, error: { field: 'className', code: 'required' } };
  if (name.length > NAME_MAX) return { ok: false, error: { field: 'className', code: 'too_long', max: NAME_MAX } };
  return { ok: true, value: name };
}
// grade/homeroom/year: short free text, optional everywhere, '' clears the field. No parsed format — conventions
// vary too much by school/country to validate as anything more than "a short label" (see the scope document's
// own note that these simply don't exist on the class model yet).
function validateLabel(field, v, max) {
  const s = squeeze(v);
  if (s.length > max) return { ok: false, error: { field, code: 'too_long', max } };
  return { ok: true, value: s };
}
// The settings an admin may change. Only keys present in `input` are looked at. -> { fields:{...}, errors:[...] }
function cleanSettings(input) {
  const b = input || {}, fields = {}, errors = [];
  if (b.className !== undefined) { const r = validateClassName(b.className); if (r.ok) fields.className = r.value; else errors.push(r.error); }
  if (b.rankingVisibility !== undefined) { if (RANKING_VISIBILITIES.includes(b.rankingVisibility)) fields.rankingVisibility = b.rankingVisibility; else errors.push({ field: 'rankingVisibility', code: 'invalid' }); }
  if (b.classPulse !== undefined) { if (typeof b.classPulse === 'boolean') fields.classPulse = b.classPulse; else errors.push({ field: 'classPulse', code: 'invalid' }); }
  if (b.parentLinking !== undefined) { if (PARENT_LINKING.includes(b.parentLinking)) fields.parentLinking = b.parentLinking; else errors.push({ field: 'parentLinking', code: 'invalid' }); }
  if (b.grade !== undefined) { const r = validateLabel('grade', b.grade, LABEL_MAX); if (r.ok) fields.grade = r.value; else errors.push(r.error); }
  if (b.homeroom !== undefined) { const r = validateLabel('homeroom', b.homeroom, LABEL_MAX); if (r.ok) fields.homeroom = r.value; else errors.push(r.error); }
  if (b.year !== undefined) { const r = validateLabel('year', b.year, YEAR_MAX); if (r.ok) fields.year = r.value; else errors.push(r.error); }
  return { fields, errors };
}

// ---------------------------------------------------------------- helpers that need the database
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Demo mode only: the backend always passes its own cryptographic generateJoinCode (utils/codes.js).
function localJoinCode() {
  const pick = (n) => { if (root.crypto && root.crypto.getRandomValues) { const a = new Uint32Array(1); root.crypto.getRandomValues(a); return a[0] % n; } return Math.floor(Math.random() * n); };
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[pick(CODE_ALPHABET.length)]).join('');
  return part() + '-' + part();
}
async function takenCodes(deps) {
  const snap = await (deps.rawDb || deps.db).collection('classes').select('studentJoinCode', 'parentJoinCode').get();
  const taken = new Set();
  snap.docs.forEach((d) => { const x = d.data() || {}; if (x.studentJoinCode) taken.add(x.studentJoinCode); if (x.parentJoinCode) taken.add(x.parentJoinCode); });
  return taken;
}
function freshCode(deps, taken) {
  const gen = deps.generateJoinCode || localJoinCode;
  for (let i = 0; i < 10; i++) { const c = gen(); if (!taken.has(c)) { taken.add(c); return c; } }
  throw new Error('Could not generate a unique join code');
}
// The school a new class belongs to: the caller's own school, or (platform owner, all-schools scope) the one named in the body, else the pilot school.
function schoolIdFor(deps, body) {
  const sc = deps.currentScope ? deps.currentScope() : null;
  if (sc && sc.schoolId) return sc.schoolId;
  return (sc && sc.all && validId(body.schoolId)) ? body.schoolId : 'default';
}
// Can this uid own a class in this school? -> { ok:true, name } | { ok:false, code }
async function resolveTeacher(db, uid) {
  if (!validId(uid)) return { ok: false, code: 'teacher_invalid' };
  const dir = (await db.collection('directory').get()).docs.map((d) => d.data() || {}).find((p) => p.type === 'teacher' && p.accountLink === uid);
  if (dir) return dir.status === 'archived' ? { ok: false, code: 'teacher_archived' } : { ok: true, name: dir.displayName || '' };
  const user = await db.collection('users').doc(uid).get();
  if (user.exists && (user.data() || {}).role === 'teacher') return { ok: true, name: user.data().displayName || '' };
  return { ok: false, code: 'teacher_not_in_school' };
}
async function loadClass(db, classId) {
  if (!validId(classId)) return null;
  const ref = db.collection('classes').doc(classId), snap = await ref.get();
  return snap.exists ? { ref, data: snap.data() || {} } : null;
}
const classLabel = (c) => '"' + (c.className || '(untitled class)') + '"';
async function teacherName(deps, uid) {
  if (!uid) return 'nobody';
  try { const t = deps.lookupTeacher ? await deps.lookupTeacher(uid) : null; return (t && (t.teacherName || t.teacherEmail)) || uid; } catch (e) { return uid; }
}

/* ---------------------------------------------------------------- create */
function makeAdminCreateClass(deps) {
  const { db, FieldValue } = deps;
  return handler(deps, { name: 'adminCreateClass' }, async (req, res) => {
    const b = req.body || {};
    const nm = validateClassName(b.className);
    if (!nm.ok) { res.status(400).json({ errors: [nm.error] }); return; }
    const grade = validateLabel('grade', b.grade, LABEL_MAX); if (!grade.ok) { res.status(400).json({ errors: [grade.error] }); return; }
    const homeroom = validateLabel('homeroom', b.homeroom, LABEL_MAX); if (!homeroom.ok) { res.status(400).json({ errors: [homeroom.error] }); return; }
    const year = validateLabel('year', b.year, YEAR_MAX); if (!year.ok) { res.status(400).json({ errors: [year.error] }); return; }
    let teacher = null;
    if (b.teacherUid !== undefined && b.teacherUid !== null && b.teacherUid !== '') {
      const r = await resolveTeacher(db, b.teacherUid);
      if (!r.ok) { res.status(400).json({ errors: [{ field: 'teacherUid', code: r.code }] }); return; }
      teacher = { uid: b.teacherUid, name: r.name };
    }
    const taken = await takenCodes(deps);
    const studentJoinCode = freshCode(deps, taken), parentJoinCode = freshCode(deps, taken);
    const ref = db.collection('classes').doc();
    // The same shape classes.js createClass writes, plus managedBy: this class belongs to the school, not to the teacher who happens to run it.
    await ref.set({
      teacherUid: teacher ? teacher.uid : null, schoolId: schoolIdFor(deps, b), className: nm.value, managedBy: 'school',
      studentJoinCode, parentJoinCode, rankingVisibility: 'anonymized', parentLinking: 'family-code', classPulse: true,
      grade: grade.value, homeroom: homeroom.value, year: year.value, archived: false,
      createdAt: FieldValue.serverTimestamp(), createdAtMs: Date.now(),
    });
    await ref.collection('meta').doc('guardianIndex').set({ parentUids: [] });   // the denormalised guardian index firestore.rules depend on
    if (deps.onClassCreated) await deps.onClassCreated(ref.id, schoolIdFor(deps, b));   // backend v2.6.0: the school's student policy
    await audit(db, FieldValue, 'classdeck.create', { personIds: [], classIds: [ref.id], summary: `created class ${classLabel({ className: nm.value })}${teacher ? ' for ' + (teacher.name || teacher.uid) : ' (no teacher yet)'}` });
    res.status(200).json({ classId: ref.id, className: nm.value, teacherUid: teacher ? teacher.uid : null, studentJoinCode, parentJoinCode });
  });
}

/* ---------------------------------------------------------------- assign (= push to the teacher) */
function makeAdminAssignTeacher(deps) {
  const { db, FieldValue } = deps;
  return handler(deps, { name: 'adminAssignTeacher' }, async (req, res) => {
    const b = req.body || {};
    if (!validId(b.classId)) { res.status(400).json({ errors: [{ field: 'classId', code: 'required' }] }); return; }
    if (b.teacherUid === undefined) { res.status(400).json({ errors: [{ field: 'teacherUid', code: 'required' }] }); return; }
    const cls = await loadClass(db, b.classId);
    if (!cls) { res.status(404).json({ error: 'No such class' }); return; }
    const to = b.teacherUid === null || b.teacherUid === '' ? null : b.teacherUid;
    const from = cls.data.teacherUid || null;
    if (to === from) { res.status(200).json({ classId: b.classId, teacherUid: to, changed: false }); return; }
    if (to !== null) {
      const r = await resolveTeacher(db, to);
      if (!r.ok) { res.status(400).json({ errors: [{ field: 'teacherUid', code: r.code }] }); return; }
    }
    await cls.ref.update({ teacherUid: to, teacherAssignedAtMs: Date.now() });
    await audit(db, FieldValue, 'classdeck.assign', { personIds: [], classIds: [b.classId], summary: `class ${classLabel(cls.data)}: teacher ${await teacherName(deps, from)} -> ${await teacherName(deps, to)}` });
    res.status(200).json({ classId: b.classId, teacherUid: to, changed: true });
  });
}

/* ---------------------------------------------------------------- name and settings */
function makeAdminUpdateClass(deps) {
  const { db, FieldValue } = deps;
  return handler(deps, { name: 'adminUpdateClass' }, async (req, res) => {
    const b = req.body || {};
    if (!validId(b.classId)) { res.status(400).json({ errors: [{ field: 'classId', code: 'required' }] }); return; }
    const { fields, errors } = cleanSettings(b);
    if (errors.length) { res.status(400).json({ errors }); return; }
    if (!Object.keys(fields).length) { res.status(400).json({ errors: [{ field: 'body', code: 'nothing_to_change' }] }); return; }
    const cls = await loadClass(db, b.classId);
    if (!cls) { res.status(404).json({ error: 'No such class' }); return; }
    // A class made before v2.0.0 has no classPulse / parentLinking: those count as on / 'class-code' (pulse.js, parents.js), so compare against that.
    // grade/homeroom/year didn't exist before v2.10.0 either: a class with none counts as '' (unset), same "missing = default" pattern.
    const current = {
      className: cls.data.className, rankingVisibility: cls.data.rankingVisibility || 'anonymized', classPulse: cls.data.classPulse !== false, parentLinking: cls.data.parentLinking || 'class-code',
      grade: cls.data.grade || '', homeroom: cls.data.homeroom || '', year: cls.data.year || '',
    };
    const changed = Object.keys(fields).filter((k) => fields[k] !== current[k]);
    if (!changed.length) { res.status(200).json({ classId: b.classId, changed: [] }); return; }
    const patch = {}; changed.forEach((k) => { patch[k] = fields[k]; });
    await cls.ref.update(patch);
    await audit(db, FieldValue, 'classdeck.update', { personIds: [], classIds: [b.classId], summary: `class ${classLabel(cls.data)}: changed ${changed.map((k) => FIELD_LABEL[k]).join(', ')}` + (patch.className ? ` (now ${classLabel(patch)})` : '') });
    res.status(200).json({ classId: b.classId, changed });
  });
}

/* ---------------------------------------------------------------- rotate a join code */
function makeAdminRegenerateJoinCode(deps) {
  const { db, FieldValue } = deps;
  return handler(deps, { name: 'adminRegenerateJoinCode' }, async (req, res) => {
    const b = req.body || {};
    if (!validId(b.classId)) { res.status(400).json({ errors: [{ field: 'classId', code: 'required' }] }); return; }
    if (!['student', 'parent'].includes(b.which)) { res.status(400).json({ errors: [{ field: 'which', code: 'invalid' }] }); return; }
    const cls = await loadClass(db, b.classId);
    if (!cls) { res.status(404).json({ error: 'No such class' }); return; }
    const field = b.which === 'student' ? 'studentJoinCode' : 'parentJoinCode';
    const code = freshCode(deps, await takenCodes(deps));
    await cls.ref.update({ [field]: code });
    // The code itself is a secret the log must not hold; it records only that the old one stopped working.
    await audit(db, FieldValue, 'classdeck.regenerateCode', { personIds: [], classIds: [b.classId], summary: `class ${classLabel(cls.data)}: new ${b.which} join code (the old one no longer works)` });
    res.status(200).json({ classId: b.classId, [field]: code });
  });
}

/* ---------------------------------------------------------------- the weekly timetable (v2.5.0) */
function makeAdminSetSchedule(deps) {
  const { db, FieldValue } = deps;
  return handler(deps, { name: 'adminSetSchedule' }, async (req, res) => {
    const b = req.body || {};
    if (!validId(b.classId)) { res.status(400).json({ errors: [{ field: 'classId', code: 'required' }] }); return; }
    // `slots` must be SENT (an empty list clears the timetable); leaving it out is a mistake, not a request to clear.
    if (!Array.isArray(b.slots)) { res.status(400).json({ errors: [{ field: 'slots', code: 'required' }] }); return; }
    const v = CS.validateSchedule({ slots: b.slots, from: b.from, to: b.to });
    if (!v.ok) { res.status(400).json({ errors: v.errors }); return; }
    const cls = await loadClass(db, b.classId);
    if (!cls) { res.status(404).json({ error: 'No such class' }); return; }
    if (CS.sameSchedule(cls.data.schedule, v.value)) { res.status(200).json({ classId: b.classId, changed: false, schedule: v.value }); return; }
    await cls.ref.update({ schedule: v.value });
    const n = v.value.slots.length;
    await audit(db, FieldValue, 'classdeck.schedule', { personIds: [], classIds: [b.classId], summary: `class ${classLabel(cls.data)}: ` + (n ? `timetable set (${n} weekly slot${n === 1 ? '' : 's'})` : 'timetable cleared') });
    res.status(200).json({ classId: b.classId, changed: true, schedule: v.value });
  });
}

/* ---------------------------------------------------------------- one class's own history (v2.10.0, SchoolDeck's History tab) */
// Every classdeck.* audit entry already carries classIds (create/assign/update/regenerateCode/schedule —
// see each function above): this is "a per-class view over the same audit log" the scope document asked
// for, not a new log. No new fields needed for this part; archived (below) is the one addition it needs.
function makeAdminClassHistory(deps) {
  const { db } = deps;
  return handler(deps, { name: 'adminClassHistory' }, async (req, res) => {
    const b = req.body || {};
    if (!validId(b.classId)) { res.status(400).json({ errors: [{ field: 'classId', code: 'required' }] }); return; }
    const cls = await loadClass(db, b.classId);
    if (!cls) { res.status(404).json({ error: 'No such class' }); return; }
    const n = Math.floor(Number(b.limit));
    const limit = n >= 1 ? Math.min(200, n) : 100;
    const snap = await db.collection('adminAudit').where('classIds', 'array-contains', b.classId).orderBy('atMs', 'desc').limit(limit).get();
    const entries = snap.docs.map((d) => { const x = d.data(); return { id: d.id, atMs: x.atMs || 0, actor: x.actor || '', action: x.action || '', summary: x.summary || '' }; });
    res.status(200).json({ classId: b.classId, className: cls.data.className || '', archived: !!cls.data.archived, entries });
  });
}
/* ---------------------------------------------------------------- archive / restore a class (v2.10.0) */
function makeAdminArchiveClass(deps) {
  const { db, FieldValue } = deps;
  return handler(deps, { name: 'adminArchiveClass' }, async (req, res) => {
    const b = req.body || {};
    if (!validId(b.classId)) { res.status(400).json({ errors: [{ field: 'classId', code: 'required' }] }); return; }
    if (typeof b.archived !== 'boolean') { res.status(400).json({ errors: [{ field: 'archived', code: 'invalid' }] }); return; }
    const cls = await loadClass(db, b.classId);
    if (!cls) { res.status(404).json({ error: 'No such class' }); return; }
    if (!!cls.data.archived === b.archived) { res.status(200).json({ classId: b.classId, changed: false, archived: b.archived }); return; }
    await cls.ref.update({ archived: b.archived, archivedAt: b.archived ? FieldValue.serverTimestamp() : null });
    await audit(db, FieldValue, 'classdeck.archive', { personIds: [], classIds: [b.classId], summary: `class ${classLabel(cls.data)}: ${b.archived ? 'archived' : 'restored'}` });
    res.status(200).json({ classId: b.classId, changed: true, archived: b.archived });
  });
}

const api = { NAME_MAX, RANKING_VISIBILITIES, PARENT_LINKING, validateClassName, cleanSettings, makeAdminCreateClass, makeAdminAssignTeacher, makeAdminUpdateClass, makeAdminRegenerateJoinCode, makeAdminSetSchedule, makeAdminClassHistory, makeAdminArchiveClass };
if (node) module.exports = api; else root.AdminClassDeckFns = api;
})(typeof self !== 'undefined' ? self : this);

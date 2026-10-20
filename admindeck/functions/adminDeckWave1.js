/* adminSchoolActivity — AdminDeck v0.6.0 reference copy, for trifecta-firebase-backend v1.6.0.
   THE BACKEND PACKAGE IS THE SOURCE OF TRUTH: copy BOTH this file and schoolActivity.js into the backend's functions/src/ (next to
   adminDeck.js and adminTheme.js), export `adminSchoolActivity` from its index.js, and deploy:
       firebase deploy --only functions:adminSchoolActivity
   Same secret (ADMINDECK_SECRET), same auth, same CORS as adminListClasses / adminGetClass / adminGetSchoolStats / adminPushTheme.
   Admin SDK -> no Firestore rules change.

   READ-ONLY. ONE call behind six widgets (Homework Completion, Student Activity Pulse, Points & Rewards Economy, Class Onboarding
   Funnel, Family Link Coverage, Teacher Engagement) plus the 'active classes' fallback in School Snapshot and 'last points awarded'
   in Teacher Directory. It reads whole collections, hands them to the pure aggregation in schoolActivity.js and returns counts and
   percentages — never raw student rows, ledger reasons, journal text or parent contact details (see that file's header).

   Reads: classes, students, and collection-group reads of homework, homeworkDone, practiceDaily, rewards, calendarEvents,
   pointsLedger, plus guardianLinks. Every read uses select() so only the fields the aggregation needs leave the database.
   Cost/scale: each call reads every document in those collections; fine for a pilot school (AdminDeck caches the answer for the
   session). practiceDaily grows by one document per active student per day — bound that query by a date field before reads matter.

   Wire it like adminPushTheme:
       const { makeAdminSchoolActivity } = require('./adminDeckWave1');
       const adminSchoolActivity = makeAdminSchoolActivity({ onRequest, logger, db, auth, secret: ADMINDECK_SECRET, handlePreflight, requireAdmin });

   Query/body: tzOffsetMin (the admin's UTC offset in minutes; AdminDeck sends the browser's) decides which calendar day a due date or a
   practice day falls on. Defaults to UTC. GET or POST. */
'use strict';
const { computeSchoolActivity } = require('./schoolActivity');

// Collection-group queries match a collection NAME anywhere in the tree, so confirm each doc really sits under the expected parent
// (classes/{id}/<name> or students/{id}/<name>) and return that parent's id. Anything else is ignored rather than mis-attributed.
function ownerId(doc, root) {
  const parent = doc.ref.parent;            // the subcollection
  const owner = parent && parent.parent;    // classes/{id} or students/{id}
  if (!owner || !owner.parent || owner.parent.id !== root) return null;
  return owner.id;
}

const tsMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : null);

// Reads everything the aggregation needs. `db` / `auth` are injected so the reads can be tested against a fake database
// (tools/test_schoolactivity.js) without Firebase.
async function loadInputs(db, auth) {
  const [classesS, studentsS, hwS, doneS, practiceS, rewardsS, eventsS, ledgerS, linksS] = await Promise.all([
    db.collection('classes').select('teacherUid', 'className', 'createdAt').get(),
    db.collection('students').select('classId', 'displayName', 'xp', 'practice').get(),
    db.collectionGroup('homework').select('title', 'subject', 'dueDate', 'dueTime').get(),
    db.collectionGroup('homeworkDone').select('done', 'doneAt', 'backfilled').get(),
    db.collectionGroup('practiceDaily').select('readMin', 'readEntries', 'focus', 'hw', 'games', 'idioms', 'mood').get(),
    db.collectionGroup('rewards').select('name', 'cost', 'active').get(),
    db.collectionGroup('calendarEvents').select('date').get(),
    db.collectionGroup('pointsLedger').select('delta', 'awardedBy', 'redeemedRewardId', 'createdAt').get(),
    db.collection('guardianLinks').select('parentUid', 'studentId', 'classId', 'createdAt').get(),
  ]);

  const classes = classesS.docs.map((d) => {
    const x = d.data();
    return { id: d.id, className: x.className, teacherUid: x.teacherUid || null, createdAtMs: tsMs(x.createdAt) };
  });
  const students = studentsS.docs.map((d) => {
    const x = d.data();
    return { id: d.id, classId: x.classId, displayName: x.displayName, xp: x.xp, streak: x.practice && x.practice.streak };
  });

  const classScoped = (snap, mapFn) => snap.docs.map((d) => {
    const classId = ownerId(d, 'classes');
    return classId ? mapFn(d, classId) : null;
  }).filter(Boolean);

  const homework = classScoped(hwS, (d, classId) => ({ id: d.id, classId, ...pick(d.data(), ['title', 'subject', 'dueDate', 'dueTime']) }));
  const rewards = classScoped(rewardsS, (d, classId) => ({ id: d.id, classId, ...pick(d.data(), ['name', 'cost', 'active']) }));
  const calendarEvents = classScoped(eventsS, (d, classId) => ({ classId }));
  const pointsLedger = classScoped(ledgerS, (d, classId) => {
    const x = d.data();
    return { classId, delta: x.delta, awardedBy: x.awardedBy, redeemedRewardId: x.redeemedRewardId, createdAtMs: tsMs(x.createdAt) };
  });

  const studentScoped = (snap, mapFn) => snap.docs.map((d) => {
    const studentId = ownerId(d, 'students');
    return studentId ? mapFn(d, studentId) : null;
  }).filter(Boolean);
  const homeworkDone = studentScoped(doneS, (d, studentId) => {
    const x = d.data();
    return { studentId, assignmentId: d.id, done: x.done, doneAtMs: tsMs(x.doneAt), backfilled: x.backfilled === true };
  });
  const practiceDaily = studentScoped(practiceS, (d, studentId) => ({ studentId, day: d.id, ...d.data() }));

  const guardianLinks = linksS.docs.map((d) => {
    const x = d.data();
    return { parentUid: x.parentUid, studentId: x.studentId, classId: x.classId, createdAtMs: tsMs(x.createdAt) };
  });

  // Teacher names/emails from Firebase Auth, best-effort: a deleted account degrades to blank fields.
  const teachers = {};
  const uids = Array.from(new Set(classes.map((c) => c.teacherUid).filter(Boolean)));
  for (let i = 0; i < uids.length; i += 100) {
    try {
      const res = await auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
      res.users.forEach((u) => { teachers[u.uid] = { name: u.displayName || null, email: u.email || null }; });
    } catch (e) {
      logger.warn('adminSchoolActivity: teacher lookup failed for a batch', e);
    }
  }

  return { classes, students, homework, homeworkDone, practiceDaily, rewards, calendarEvents, pointsLedger, guardianLinks, teachers };
}

function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

/* Cloud Function factory — dependency-injected like makeAdminPushTheme. */
function makeAdminSchoolActivity(deps) {
  const { onRequest, logger, db, auth, secret, handlePreflight, requireAdmin } = deps;
  return onRequest({ secrets: [secret], timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (!requireAdmin(req, res)) return;
    try {
      const raw = Number((req.query && req.query.tzOffsetMin) || (req.body && req.body.tzOffsetMin) || 0);
      const tz = Number.isFinite(raw) ? raw : 0;
      const input = await loadInputs(db, auth);
      res.status(200).json(computeSchoolActivity(input, { nowMs: Date.now(), tzOffsetMin: tz }));
    } catch (e) {
      logger.error('adminSchoolActivity failed', e);
      res.status(500).json({ error: 'Internal error building the school activity summary' });
    }
  });
}

module.exports = { makeAdminSchoolActivity, loadInputs };

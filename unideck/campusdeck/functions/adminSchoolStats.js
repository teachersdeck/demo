/* adminGetSchoolStats — AdminDeck v0.3.0 reference copy, for trifecta-firebase-backend v1.4.0.
   THE BACKEND PACKAGE IS THE SOURCE OF TRUTH: copy this into the backend's functions/src/ (next to adminDeck.js),
   export `adminGetSchoolStats` from its index.js, and deploy:
       firebase deploy --only functions:adminGetSchoolStats
   Same secret (ADMINDECK_SECRET), same auth, same CORS as adminListClasses/adminGetClass. Admin SDK -> no rules change.

   READ-ONLY, AGGREGATES ONLY. Nothing here writes. No student name, id or per-student row ever leaves this function:
   it returns one `daily` series per class (sums over students) plus counts. Per-student data is used in memory only.

   What it reads, per class: students where classId == class, and each student's practiceDaily (newest `days` docs,
   doc id = 'YYYY-MM-DD' on the student's device) plus the student's `practice` field (streak). XP / points are NOT
   part of this endpoint on purpose (AdminDeck's School Stats page is about activity, not XP).

   Body: { days?: number (default 90, max 200), today?: 'YYYY-MM-DD' (the caller's date, so streak/active windows agree
           with the browser), windows?: [{ key, from:'YYYY-MM-DD', to:'YYYY-MM-DD' }] (max 12) , force?: boolean }
   Returns { generatedAt, days, today, classes:[{ id, className, teacherName, students, withPractice, rankingVisibility,
             lastActiveAt, avgStreak, streaks:{'0','1-2','3-6','7+'}, active:{[windowKey]: distinctStudents},
             daily:[{ d, active, hw, readMin, readEntries, focus, games, gamesStarted, idioms, time, timeBy }] }],
             errors:[{ classId, message }] }
   `time` = seconds of StudentDeck use that day (sum of timeBy). `active` in a daily row = students active that day.
   A student is active on a day if that day's doc has any non-zero of xp, hw, readMin, readEntries, focus, games,
   gamesStarted, idioms or any timeBy value. */
'use strict';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUM_FIELDS = ['hw', 'readMin', 'readEntries', 'focus', 'games', 'gamesStarted', 'idioms'];

function addDays(key, n) {
  const d = new Date(key + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

function dayIsActive(r) {
  if (!r) return false;
  if (num(r.xp) > 0) return true;
  if (NUM_FIELDS.some((f) => num(r[f]) > 0)) return true;
  return Object.values(r.timeBy || {}).some((v) => num(v) > 0);
}
function streakBucket(n) { return n <= 0 ? '0' : n <= 2 ? '1-2' : n <= 6 ? '3-6' : '7+'; }

/* Pure: students = [{ practice, days: { 'YYYY-MM-DD': docData } }] for ONE class. No Firestore, no names.
   Returns the class's aggregate block (everything except id/className/teacher/lastActiveAt, which the caller adds). */
function aggregateClass(students, { today, windows }) {
  const daily = {};            // d -> row
  const activeDaysByStudent = students.map(() => new Set());
  const streaks = { '0': 0, '1-2': 0, '3-6': 0, '7+': 0 };
  let streakSum = 0, withPractice = 0;
  const yesterday = addDays(today, -1);

  students.forEach((s, i) => {
    const keys = Object.keys(s.days || {});
    keys.forEach((d) => {
      const r = s.days[d] || {};
      const row = daily[d] || (daily[d] = { d, active: 0, hw: 0, readMin: 0, readEntries: 0, focus: 0, games: 0, gamesStarted: 0, idioms: 0, time: 0, timeBy: {} });
      NUM_FIELDS.forEach((f) => { row[f] += num(r[f]); });
      Object.entries(r.timeBy || {}).forEach(([w, secs]) => {
        const v = num(secs);
        if (v) { row.timeBy[w] = (row.timeBy[w] || 0) + v; row.time += v; }
      });
      if (dayIsActive(r)) { row.active += 1; activeDaysByStudent[i].add(d); }
    });
    // A student counts as "with practice" if StudentDeck ever synced something for them.
    if (keys.length || (s.practice && (s.practice.xpTotal || s.practice.streak || s.practice.updatedAt))) {
      withPractice += 1;
      const newest = keys.sort().pop() || '';
      const raw = s.practice && typeof s.practice.streak === 'number' ? s.practice.streak : 0;
      const streak = newest >= yesterday ? raw : 0;          // ParentDeck's rule: lapsed streak counts as 0
      streaks[streakBucket(streak)] += 1; streakSum += streak;
    }
  });

  const active = {};
  (windows || []).forEach((w) => {
    let n = 0;
    activeDaysByStudent.forEach((set) => { for (const d of set) { if (d >= w.from && d <= w.to) { n += 1; break; } } });
    active[w.key] = n;
  });

  return {
    students: students.length,
    withPractice,
    avgStreak: withPractice ? Math.round((streakSum / withPractice) * 10) / 10 : 0,
    streaks,
    active,
    daily: Object.values(daily).sort((a, b) => a.d.localeCompare(b.d)),
  };
}

function cleanWindows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 12).filter((w) => w && typeof w.key === 'string' && w.key.length <= 24 && DAY_RE.test(w.from) && DAY_RE.test(w.to))
    .map((w) => ({ key: w.key, from: w.from, to: w.to }));
}

/* ---------------- Cloud Function factory ----------------
   Dependency-injected so it drops into trifecta-firebase-backend's adminDeck.js, where db / lookupTeacher /
   newestActivity / requireAdmin / handlePreflight / ADMINDECK_SECRET already exist:

       const { makeAdminGetSchoolStats } = require('./adminSchoolStats');
       const adminGetSchoolStats = makeAdminGetSchoolStats({ onRequest, logger, FieldPath, db, secret: ADMINDECK_SECRET,
                                     handlePreflight, requireAdmin, lookupTeacher, newestActivity });
       module.exports = { adminListClasses, adminGetClass, adminGetSchoolStats };

   (FieldPath comes from 'firebase-admin/firestore'.) */
function makeAdminGetSchoolStats(deps) {
  const { onRequest, logger, FieldPath, db, secret, handlePreflight, requireAdmin, lookupTeacher, newestActivity } = deps;
  const cache = new Map();                       // days -> { at, raw }   (per function instance, in memory)
  const TTL_MS = 5 * 60 * 1000;

  async function pool(items, size, fn) {         // run at most `size` classes at once
    const out = new Array(items.length); let next = 0;
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
    }));
    return out;
  }

  return onRequest({ secrets: [secret], timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
    if (handlePreflight(req, res)) return;
    if (!requireAdmin(req, res)) return;
    try {
      const body = req.body || {};
      const days = Math.max(1, Math.min(200, parseInt(body.days, 10) || 90));
      const today = DAY_RE.test(body.today || '') ? body.today : new Date().toISOString().slice(0, 10);
      const windows = cleanWindows(body.windows);

      let hit = cache.get(days);
      if (!hit || body.force === true || Date.now() - hit.at > TTL_MS) {
        const classesSnap = await db.collection('classes').get();
        const raw = await pool(classesSnap.docs, 5, async (doc) => {
          try {
            const [teacher, studentsSnap] = await Promise.all([
              lookupTeacher(doc.data().teacherUid),
              db.collection('students').where('classId', '==', doc.id).get(),
            ]);
            const students = await Promise.all(studentsSnap.docs.map(async (s) => {
              const snap = await s.ref.collection('practiceDaily').orderBy(FieldPath.documentId(), 'desc').limit(days).get();
              const dayDocs = {}; snap.docs.forEach((d) => { dayDocs[d.id] = d.data(); });
              return { practice: (s.data() || {}).practice || null, days: dayDocs };
            }));
            return { ok: true, doc, teacher, studentDocs: studentsSnap.docs, students };
          } catch (e) {
            logger.error('adminGetSchoolStats: class failed', doc.id, e);
            return { ok: false, doc, message: 'Could not load this class' };
          }
        });
        hit = { at: Date.now(), raw };
        cache.set(days, hit);
      }

      const classes = [], errors = [];
      hit.raw.forEach((r) => {
        if (!r.ok) { errors.push({ classId: r.doc.id, message: r.message }); return; }
        const c = r.doc.data();
        classes.push({
          id: r.doc.id,
          className: c.className || '(untitled class)',
          teacherName: r.teacher.teacherName,
          rankingVisibility: c.rankingVisibility || 'anonymized',
          lastActiveAt: newestActivity(r.studentDocs),
          ...aggregateClass(r.students, { today, windows }),
        });
      });
      res.status(200).json({ generatedAt: hit.at, days, today, classes, errors });
    } catch (e) {
      logger.error('adminGetSchoolStats failed', e);
      res.status(500).json({ error: 'Internal error building school stats' });
    }
  });
}

module.exports = { aggregateClass, cleanWindows, addDays, makeAdminGetSchoolStats, DAY_RE };

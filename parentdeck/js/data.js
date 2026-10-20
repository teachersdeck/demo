'use strict';
/* ParentDeck data layer — now backed by real Firebase.
   ------------------------------------------------------
   This file used to be a local demo store standing in for the "Firebase
   Account & Login Scoping" doc's design. That design has now been built
   (see the trifecta-firebase-backend package) and this file is the real
   version — same exported PD.* shape as before, so nothing in app.js or
   any widget had to change.

   Interface kept identical to the demo version:
     onAuthChanged, signInWithGoogle, signOut, getSession,
     getLinkedChildren, linkChild, unlinkChild,
     getChildSnapshot, subscribeChild, refreshChild
   Added (the demo version had no way to push a live notification):
     onPointsAwarded(cb) — fires with (student, ledgerEntry) the moment a
     new points-ledger entry appears for any linked child, so app.js can
     toast it in real time.
     onLinksChanged(cb) — fires whenever the linked-children list itself
     changes (link/unlink/rename), so app.js can re-render the child
     switcher without polling.
   Changed signature: linkChild(parentJoinCode, studentDisplayName) — the
   real backend needs both (see linkParentToStudent's contract); the demo
   version only ever took one "join code" string.
   Removed (no backend equivalent — see backend README "Assumptions made" /
   "Deliberately out of scope"): devAwardPoints, devAddDemerit. There is no
   demerits/behaviour-notes collection in the backend yet, so
   getChildSnapshot().demerits is always [].

   Without js/firebase-config.js filled in, PD.isConfigured() is false and
   every call rejects with a clear "not configured" error.
*/
const PD = (() => {
  function isConfigured() {
    const c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.apiKey !== 'YOUR_API_KEY');
  }

  let auth = null, db = null, functions = null, ready = false;
  function init() {
    if (ready) return true;
    if (!isConfigured() || typeof firebase === 'undefined') return false;
    firebase.initializeApp(window.FIREBASE_CONFIG);
    auth = firebase.auth(); db = firebase.firestore(); functions = firebase.functions();
    ready = true;
    return true;
  }

  // ---- auth ----
  const authListeners = new Set();
  let session = null;
  function fireAuth() { authListeners.forEach(fn => { try { fn(session); } catch (e) {} }); }
  function onAuthChanged(fn) { authListeners.add(fn); if (ready) fn(session); return () => authListeners.delete(fn); }

  function watchAuth() {
    if (!init()) return;
    auth.onAuthStateChanged(user => {
      watchPro(user);   // v0.21.4: ParentDeck Pro status (users/{uid}.pro, written by the backend)
      // Always tear down first, not just on sign-out: switching Google
      // accounts mid-session (re-triggering sign-in without an explicit
      // sign-out first) fires this same callback with a NEW uid while the
      // OLD account's guardianLinks listener is still alive — without this,
      // watchLinks()'s own "only ever subscribe once" guard (linksUnsub)
      // would keep it permanently locked to whichever account signed in
      // first, silently hiding every link made under a later account.
      teardownLinks();
      session = user ? { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL } : null;
      if (session) watchLinks();
      fireAuth();
    });
  }

  async function signInWithGoogle() {
    if (!init()) throw new Error('Cloud sync isn\u2019t set up yet \u2014 ask whoever built this app to finish Firebase setup.');
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred = await auth.signInWithPopup(provider);
    await functions.httpsCallable('ensureUserProfile')({ role: 'parent' });
    await cred.user.getIdToken(true); // pick up the new role custom claim before any Cloud Function/Firestore call that requires it
    session = { uid: cred.user.uid, displayName: cred.user.displayName, email: cred.user.email, photoURL: cred.user.photoURL };
    watchLinks();
    fireAuth();
    return session;
  }
  function signOut() { if (auth) auth.signOut(); session = null; teardownLinks(); fireAuth(); }
  function getSession() { return session; }

  // ---- linked children ----
  // guardianLinks/{parentUid}_{studentId} lists which students this parent
  // can see; each linked student's own doc (and their class's rewards/
  // calendar, via isGuardianOfClass) is then readable per firestore.rules.
  let linksUnsub = null;
  let studentUnsubs = {}; // studentId -> unsub
  let classUnsubs = {};   // classId -> unsub (for className)
  let calendarUnsubs = {}; // classId -> unsub (for the Calendar widget — same collection StudentDeck reads)
  let homeworkUnsubs = {}; // classId -> unsub (for the Homework widget — classes/{id}/homework, TeachersDeck's Assignments widget)
  let homeworkDoneUnsubs = {}; // studentId -> unsub (students/{id}/homeworkDone — StudentDeck's check-offs, see below)
  let badgeUnsubs = {};   // studentId -> unsub (students/{id}/badges — StudentDeck's earned XP badges, v0.15.0 Badge Display Case)
  let ledgerUnsubs = {};  // studentId -> unsub
  let practiceUnsubs = {}; // studentId -> unsub
  let reportUnsubs = {};   // studentId -> unsub (students/{id}/progressReports — Progress Reports, v0.9.2)
  let attendanceUnsubs = {}; // studentId -> unsub (students/{id}/attendance — Attendance, v0.15.0)
  let rewardUnsubs = {};   // classId -> unsub (classes/{id}/rewards — v0.9.1, Rewards Wishlist)
  let notesUnsubs = {};   // studentId -> unsub (classes/{id}/notesHome where studentId == child — Notes Home, v0.9.0)
  const cache = { links: [], students: {}, classes: {}, calendars: {}, homework: {}, homeworkDone: {}, badges: {}, ledgers: {}, practice: {}, notes: {}, rewards: {}, reports: {}, attendance: {} };
  const childListeners = {}; // studentId -> Set(cb)
  const pointsListeners = new Set();
  const homeworkListeners = new Set();
  const badgeListeners = new Set();
  const linksChangedListeners = new Set();
  const noteListeners = new Set();       // fn(student, note) — a genuinely NEW note arrived
  const reportListeners = new Set();       // fn(student, report) — a new progress report arrived
  const notesChangedListeners = new Set(); // fn() — any notes list changed (drives the unread badge)

  function notifyChild(studentId) { (childListeners[studentId] || []).forEach(cb => cb(buildSnapshot(studentId))); }
  function notifyNotesChanged() { notesChangedListeners.forEach(fn => { try { fn(); } catch (e) {} }); }
  function notifyLinksChanged() { linksChangedListeners.forEach(fn => { try { fn(); } catch (e) {} }); }

  function watchLinks() {
    if (!ready || !session || linksUnsub) return;
    linksUnsub = db.collection('guardianLinks').where('parentUid', '==', session.uid).onSnapshot(snap => {
      const links = snap.docs.map(d => d.data()); // { parentUid, studentId, classId }
      cache.links = links;
      const wantStudentIds = new Set(links.map(l => l.studentId));
      const wantClassIds = new Set(links.map(l => l.classId));
      wantStudentIds.forEach(sid => {
        if (!studentUnsubs[sid]) subscribeStudentDoc(sid);
        const link = links.find(l => l.studentId === sid);
        if (link && !classUnsubs[link.classId]) subscribeClassDoc(link.classId);
        if (link && !calendarUnsubs[link.classId]) subscribeCalendarEvents(link.classId);
        if (link && !homeworkUnsubs[link.classId]) subscribeHomework(link.classId);
        if (!homeworkDoneUnsubs[sid]) subscribeHomeworkDone(sid);
        if (!badgeUnsubs[sid]) subscribeBadges(sid);
        if (!ledgerUnsubs[sid]) subscribeLedger(sid, link.classId);
        if (!practiceUnsubs[sid]) subscribePracticeDaily(sid);
        if (link && !notesUnsubs[sid]) subscribeNotes(sid, link.classId);
        if (link && !rewardUnsubs[link.classId]) subscribeRewards(link.classId);
        if (!reportUnsubs[sid]) subscribeProgressReports(sid);
        if (!attendanceUnsubs[sid]) subscribeAttendance(sid);
      });
      Object.keys(studentUnsubs).forEach(sid => { if (!wantStudentIds.has(sid)) { studentUnsubs[sid](); delete studentUnsubs[sid]; delete cache.students[sid]; } });
      Object.keys(homeworkDoneUnsubs).forEach(sid => { if (!wantStudentIds.has(sid)) { homeworkDoneUnsubs[sid](); delete homeworkDoneUnsubs[sid]; delete cache.homeworkDone[sid]; } });
      Object.keys(badgeUnsubs).forEach(sid => { if (!wantStudentIds.has(sid)) { badgeUnsubs[sid](); delete badgeUnsubs[sid]; delete cache.badges[sid]; } });
      Object.keys(ledgerUnsubs).forEach(sid => { if (!wantStudentIds.has(sid)) { ledgerUnsubs[sid](); delete ledgerUnsubs[sid]; delete cache.ledgers[sid]; } });
      Object.keys(practiceUnsubs).forEach(sid => { if (!wantStudentIds.has(sid)) { practiceUnsubs[sid](); delete practiceUnsubs[sid]; delete cache.practice[sid]; } });
      Object.keys(reportUnsubs).forEach(sid => { if (!wantStudentIds.has(sid)) { reportUnsubs[sid](); delete reportUnsubs[sid]; delete cache.reports[sid]; } });
      Object.keys(attendanceUnsubs).forEach(sid => { if (!wantStudentIds.has(sid)) { attendanceUnsubs[sid](); delete attendanceUnsubs[sid]; delete cache.attendance[sid]; } });
      Object.keys(notesUnsubs).forEach(sid => { if (!wantStudentIds.has(sid)) { notesUnsubs[sid](); delete notesUnsubs[sid]; delete cache.notes[sid]; } });
      // A class stops being readable (isGuardianOfClass) the moment no
      // linked child of ours is in it anymore — Firestore will actively
      // revoke that listener's permission (unlinkParentFromStudent removes
      // us from the class's guardianIndex), so this has to be pruned
      // in lockstep with the student/ledger unsubs above, not left running.
      Object.keys(classUnsubs).forEach(cid => { if (!wantClassIds.has(cid)) { classUnsubs[cid](); delete classUnsubs[cid]; delete cache.classes[cid]; } });
      Object.keys(calendarUnsubs).forEach(cid => { if (!wantClassIds.has(cid)) { calendarUnsubs[cid](); delete calendarUnsubs[cid]; delete cache.calendars[cid]; } });
      Object.keys(homeworkUnsubs).forEach(cid => { if (!wantClassIds.has(cid)) { homeworkUnsubs[cid](); delete homeworkUnsubs[cid]; delete cache.homework[cid]; } });
      Object.keys(rewardUnsubs).forEach(cid => { if (!wantClassIds.has(cid)) { rewardUnsubs[cid](); delete rewardUnsubs[cid]; delete cache.rewards[cid]; } });
      notifyLinksChanged();
    }, (err) => {
      // This assumption was wrong once already (see firestore.rules'
      // guardianLinks fix) and silently swallowing it is exactly what let
      // that bug hide in production — log it loudly instead of guessing
      // it's fine.
      console.error('guardianLinks listener error — children may fail to appear:', err);
    });
  }
  function teardownLinks() {
    if (linksUnsub) { linksUnsub(); linksUnsub = null; }
    Object.values(studentUnsubs).forEach(u => u()); studentUnsubs = {};
    Object.values(classUnsubs).forEach(u => u()); classUnsubs = {};
    Object.values(calendarUnsubs).forEach(u => u()); calendarUnsubs = {};
    Object.values(homeworkUnsubs).forEach(u => u()); homeworkUnsubs = {};
    Object.values(homeworkDoneUnsubs).forEach(u => u()); homeworkDoneUnsubs = {};
    Object.values(badgeUnsubs).forEach(u => u()); badgeUnsubs = {};
    Object.values(ledgerUnsubs).forEach(u => u()); ledgerUnsubs = {};
    Object.values(practiceUnsubs).forEach(u => u()); practiceUnsubs = {};
    Object.values(notesUnsubs).forEach(u => u()); notesUnsubs = {};
    Object.values(rewardUnsubs).forEach(u => u()); rewardUnsubs = {};
    Object.values(reportUnsubs).forEach(u => u()); reportUnsubs = {};
    Object.values(attendanceUnsubs).forEach(u => u()); attendanceUnsubs = {};
    cache.links = []; cache.students = {}; cache.classes = {}; cache.calendars = {}; cache.homework = {}; cache.homeworkDone = {}; cache.badges = {}; cache.ledgers = {}; cache.practice = {}; cache.notes = {}; cache.rewards = {}; cache.reports = {}; cache.attendance = {};
    notifyNotesChanged();
  }
  // students/{studentId}/homeworkDone/{assignmentId} — StudentDeck's per-assignment check-off
  // (js/cloud.js's setHomeworkDone there). doc.done tells us finished vs un-ticked; doc.doneAt is
  // a server timestamp used below to only notify for a genuinely new completion, same pattern as
  // subscribeLedger's award notification. Requires the sibling guardian-read rule described in
  // StudentDeck's README for this feature — fails quiet (cache stays {}) if it isn't deployed yet,
  // same as every other homework/calendar listener here.
  function subscribeHomeworkDone(studentId) {
    homeworkDoneUnsubs[studentId] = db.collection('students').doc(studentId).collection('homeworkDone').onSnapshot(snap => {
      const prev = cache.homeworkDone[studentId] || {};
      const next = {}; snap.docs.forEach(d => { next[d.id] = d.data(); });
      cache.homeworkDone[studentId] = next;
      notifyChild(studentId);
      const student = buildSnapshot(studentId);
      Object.entries(next).forEach(([assignmentId, rec]) => {
        const was = prev[assignmentId];
        if (rec && rec.done && !(was && was.done)) {
          const a = (cache.homework[(cache.links.find(l => l.studentId === studentId) || {}).classId] || []).find(x => x.id === assignmentId);
          homeworkListeners.forEach(cb => { try { cb(student, a || { id: assignmentId, title: rec.title, subject: rec.subject }, rec); } catch (e) {} });
        }
      });
    }, () => { cache.homeworkDone[studentId] = {}; notifyChild(studentId); }); // access revoked, or rule not deployed yet
  }
  // students/{studentId}/badges/{badgeId} — one doc per XP badge the child has earned in StudentDeck (v0.15.0, Badge Display Case).
  // The doc id is the badge id, so a badge can only ever appear once; the doc carries a snapshot of what the case needs to draw it
  // (name, icon, tier, group, desc) plus earnedAt (server time). `old: true` marks a badge StudentDeck awarded silently the first time it
  // ran on a device that already had history: it is shown in the case but never announced. The FIRST snapshot is a baseline (nothing is
  // announced for what was already there), and only genuinely new, non-old docs fire onBadgeEarned — same idea as subscribeHomeworkDone.
  // Needs the guardian-read rule on students/{id}/badges; fails quiet (empty case) if it isn't deployed or the child's app is older.
  function subscribeBadges(studentId) {
    let baseline = true;
    badgeUnsubs[studentId] = db.collection('students').doc(studentId).collection('badges').onSnapshot(snap => {
      const prev = cache.badges[studentId] || {};
      const next = {}; snap.docs.forEach(d => { next[d.id] = { id: d.id, ...d.data() }; });
      cache.badges[studentId] = next;
      notifyChild(studentId);
      if (baseline) { baseline = false; return; }
      const student = buildSnapshot(studentId);
      Object.values(next).forEach(b => {
        if (!prev[b.id] && !b.old) badgeListeners.forEach(cb => { try { cb(student, badgeRow(b)); } catch (e) {} });
      });
    }, () => { cache.badges[studentId] = {}; notifyChild(studentId); });   // access revoked, or rule not deployed yet
  }
  // One stored badge doc -> the row the widgets use: { id, name, icon, tier(1-4), group, desc, t (ms, 0 if unknown), old }
  function badgeRow(b) {
    const e = b.earnedAt;
    return { id: b.id, name: b.name || b.id, icon: b.icon || '\ud83c\udfc5', tier: Math.min(4, Math.max(1, +b.tier || 1)), group: b.group || '', desc: b.desc || '', t: (e && e.toMillis) ? e.toMillis() : (e && e.seconds ? e.seconds * 1000 : 0), old: !!b.old };
  }
  // students/{id}/practiceDaily/{YYYY-MM-DD} — StudentDeck's local XP engine (reading minutes,
  // homework done, focus minutes, games, idioms) plus one mood value per day. This is numbers-only:
  // StudentDeck never sends journal text here, by design (see its cloud.js header). Keyed by the
  // YYYY-MM-DD doc id, so a plain object cache (not an array) is the natural shape for trend math.
  function subscribePracticeDaily(studentId) {
    practiceUnsubs[studentId] = db.collection('students').doc(studentId).collection('practiceDaily')
      .orderBy(firebase.firestore.FieldPath.documentId(), 'desc').limit(200)
      .onSnapshot(snap => {
        const days = {}; snap.docs.forEach(d => { days[d.id] = d.data(); });
        cache.practice[studentId] = days; notifyChild(studentId);
      }, () => { cache.practice[studentId] = {}; notifyChild(studentId); }); // access revoked — pruned shortly by watchLinks
  }
  function subscribeStudentDoc(studentId) {
    studentUnsubs[studentId] = db.collection('students').doc(studentId).onSnapshot(doc => {
      cache.students[studentId] = doc.exists ? doc.data() : null;
      notifyChild(studentId); notifyLinksChanged();
    }, () => { cache.students[studentId] = null; notifyChild(studentId); }); // access revoked (unlinked) — watchLinks will prune this listener shortly
  }
  function subscribeClassDoc(classId) {
    classUnsubs[classId] = db.collection('classes').doc(classId).onSnapshot(doc => {
      cache.classes[classId] = doc.exists ? doc.data() : null;
      Object.keys(studentUnsubs).forEach(sid => {
        const l = cache.links.find(x => x.studentId === sid);
        if (l && l.classId === classId) notifyChild(sid);
      });
      notifyLinksChanged();
    }, () => { /* access revoked — watchLinks prunes this listener once no linked child is in this class */ });
  }
  // classes/{classId}/calendarEvents — the same collection TeachersDeck's Calendar
  // widget pushes to (js/cloud.js there) and StudentDeck's Class widget already
  // reads; an event with assignment:true is a homework assignment (its `notes`
  // field is the instructions). Requires a firestore.rule letting a guardian
  // read this subcollection for a class they're linked into — if that rule
  // isn't deployed yet, this just fails quiet like subscribeClassDoc above,
  // so the new Calendar widget shows an empty list rather than erroring.
  function subscribeCalendarEvents(classId) {
    calendarUnsubs[classId] = db.collection('classes').doc(classId).collection('calendarEvents')
      .orderBy('date').limit(100)
      .onSnapshot(snap => {
        cache.calendars[classId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        Object.keys(studentUnsubs).forEach(sid => {
          const l = cache.links.find(x => x.studentId === sid);
          if (l && l.classId === classId) notifyChild(sid);
        });
      }, () => { /* access revoked, or rule not deployed yet — see comment above */ });
  }
  // classes/{classId}/homework — TeachersDeck's Assignments widget (as of its
  // v0.9.0) pushes here via TDCloud.syncHomework(), the canonical source for
  // an assignment's subject/dueDate/dueTime/points/instructions; StudentDeck's
  // Homework To-Do widget reads the same collection. TeachersDeck also mirrors
  // a due date into its own calendarEvents (id `assign-<id>`, `type:'assignment'`)
  // purely so its Calendar widget shows one unified view — that mirrored copy
  // is NOT the source of truth for subject/points/instructions, this is.
  // Same not-deployed-yet caveat as subscribeCalendarEvents above.
  function subscribeHomework(classId) {
    homeworkUnsubs[classId] = db.collection('classes').doc(classId).collection('homework')
      .onSnapshot(snap => {
        cache.homework[classId] = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
        Object.keys(studentUnsubs).forEach(sid => {
          const l = cache.links.find(x => x.studentId === sid);
          if (l && l.classId === classId) notifyChild(sid);
        });
      }, () => { /* access revoked, or rule not deployed yet */ });
  }
  // classes/{classId}/rewards — {name, cost, description, active}. Class-wide, so guardians read it through
  // isGuardianOfClass. ParentDeck never writes it; redeeming stays a StudentDeck action. (v0.9.1, Rewards Wishlist)
  // students/{studentId}/progressReports/* — a teacher's progress report for THIS child (TeachersDeck's Progress Reports
  // widget writes it straight to the student, not through a class-wide collection), so the read is the plain per-student
  // isGuardianOf rule. Read-only here. TeachersDeck's exact field names were not in the upload, so normalizeReport()
  // accepts the likely spellings and tolerates strings or lists; the raw doc is kept on `raw`. Sorted client-side (newest
  // first) so no index is needed. The first snapshot only sets a baseline; a report id we haven't seen after that is a new
  // arrival and fires onProgressReportReceived.
  const listOf = v => Array.isArray(v) ? v.map(x => (x && typeof x === 'object') ? (x.text || x.name || x.title || x.skill || '') : x).map(x => String(x).trim()).filter(Boolean)
    : (typeof v === 'string' ? v.split(/\r?\n|;/).map(x => x.replace(/^[\s•\-*]+/, '').trim()).filter(Boolean) : []);
  const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null; };
  function normalizeReport(id, o) {
    const ms = t => (t && t.toMillis) ? t.toMillis() : (t && t.seconds ? t.seconds * 1000 : (typeof t === 'number' ? t : (Date.parse(t) || 0)));
    return {
      id, raw: o,
      t: ms(pick(o, ['createdAt', 'date', 'sentAt', 'reportDate', 'updatedAt'])),
      frequency: String(pick(o, ['frequency', 'period', 'cadence', 'type']) || ''),
      score: pick(o, ['score', 'overallScore', 'overall', 'grade', 'rating']),
      skills: listOf(pick(o, ['skills', 'skillsCovered', 'skillsLearned'])),
      improve: listOf(pick(o, ['thingsToImprove', 'improve', 'improvements', 'toImprove', 'areasToImprove', 'weaknesses'])),
      strengths: listOf(pick(o, ['strengths', 'strength', 'strongPoints'])),
      nextFocus: listOf(pick(o, ['nextLearningFocus', 'nextFocus', 'next', 'nextSteps', 'focus']))
    };
  }
  function subscribeProgressReports(studentId) {
    let baseline = null;
    reportUnsubs[studentId] = db.collection('students').doc(studentId).collection('progressReports')
      .onSnapshot(snap => {
        const rows = snap.docs.map(d => normalizeReport(d.id, d.data())).sort((a, b) => b.t - a.t);
        const seen = baseline; baseline = new Set(rows.map(r => r.id));
        cache.reports[studentId] = rows;
        notifyChild(studentId);
        if (seen) rows.filter(r => !seen.has(r.id)).reverse().forEach(r => { const st = buildSnapshot(studentId); reportListeners.forEach(cb => { try { cb(st, r); } catch (e) {} }); });
      }, () => { cache.reports[studentId] = []; notifyChild(studentId); }); // access revoked, or rule not deployed yet
  }
  // students/{studentId}/attendance/{YYYY-MM-DD} — Attendance widget (v0.15.0). ONE document per child per day, `{ status: 'present' | 'late' | 'absent' }`,
  // written by TeachersDeck's attendance sync. Deliberately NOT classes/{id}/attendance/{date}: that shape holds every student's record in one
  // document, which a guardian must never be able to read. This per-student path is covered by the isGuardianOf(studentId) rule.
  // Until TeachersDeck syncs it and the rule is deployed, this listener errors (permission-denied) — that is "not shared yet", NOT "no absences",
  // so the cache records which of the two happened and the widget says so. Nothing else (no notes, no reasons) is read from these documents.
  function subscribeAttendance(studentId) {
    attendanceUnsubs[studentId] = db.collection('students').doc(studentId).collection('attendance')
      .orderBy(firebase.firestore.FieldPath.documentId(), 'desc').limit(400)
      .onSnapshot(snap => {
        const days = {}; snap.docs.forEach(d => { const st = (d.data() || {}).status; if (st) days[d.id] = { status: String(st).toLowerCase() }; });
        cache.attendance[studentId] = { available: true, days }; notifyChild(studentId);
      }, () => { cache.attendance[studentId] = { available: false, days: {} }; notifyChild(studentId); }); // rule not deployed / not synced yet / access revoked
  }
  /* getClassPulse(classId) — Cloud Function (Class Pulse, v0.15.0). The server totals the class's practiceDaily / homeworkDone with admin access and returns
     RANGES ONLY — no per-child values, no names, no ranks. Expected reply:
       { available: true,  weekFrom: 'YYYY-MM-DD', weekTo: 'YYYY-MM-DD', classSize: n,
         ranges: { readMin: {low, high}, focus: {low, high}, hwPct: {low, high} } }
       { available: false, reason: 'class-too-small' | 'teacher-off' }
     A function that is not deployed yet answers 'not-found' / 'unimplemented'; that comes back as { available: false, reason: 'not-ready' }.
     The reply is cleaned here so a mistake on the server can never put anything but three numeric ranges on screen. */
  async function getClassPulse(studentId) {
    const link = cache.links.find(l => l.studentId === studentId);
    if (!link) throw new Error('Not linked to that student.');
    let r;
    const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;   // the parent's own date, so the server's week matches this app's
    try { r = (await functions.httpsCallable('getClassPulse')({ classId: link.classId, today })).data || {}; }
    catch (e) {
      const c = String((e && e.code) || '').replace('functions/', '');
      if (c === 'not-found' || c === 'unimplemented') return { available: false, reason: 'not-ready' };
      throw e;
    }
    return cleanPulse(r);
  }
  function cleanPulse(r) {
    if (!r || r.available !== true) return { available: false, reason: ['class-too-small', 'teacher-off'].includes(r && r.reason) ? r.reason : 'not-ready' };
    const rng = o => { const lo = Number(o && o.low), hi = Number(o && o.high); return isFinite(lo) && isFinite(hi) && hi >= lo && lo >= 0 ? { low: Math.round(lo), high: Math.round(hi) } : null; };
    const ranges = {}; ['readMin', 'focus', 'hwPct'].forEach(k => { const v = rng((r.ranges || {})[k]); if (v) ranges[k] = v; });
    return { available: Object.keys(ranges).length > 0, reason: Object.keys(ranges).length ? '' : 'not-ready', weekFrom: r.weekFrom || '', weekTo: r.weekTo || '', classSize: Number(r.classSize) || 0, ranges };
  }

  function subscribeRewards(classId) {
    rewardUnsubs[classId] = db.collection('classes').doc(classId).collection('rewards')
      .onSnapshot(snap => {
        cache.rewards[classId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        Object.keys(studentUnsubs).forEach(sid => {
          const l = cache.links.find(x => x.studentId === sid);
          if (l && l.classId === classId) notifyChild(sid);
        });
      }, () => { cache.rewards[classId] = []; }); // access revoked, or rule not deployed yet
  }
  function subscribeLedger(studentId, classId) {
    ledgerUnsubs[studentId] = db.collection('classes').doc(classId).collection('pointsLedger')
      .where('studentId', '==', studentId).orderBy('createdAt', 'desc').limit(60)
      .onSnapshot(snap => {
        const prevLen = (cache.ledgers[studentId] || []).length;
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cache.ledgers[studentId] = rows;
        notifyChild(studentId);
        // real-time award notification for genuinely new entries — skip
        // the very first load, where "new" just means "existing"
        if (prevLen && rows.length > prevLen) {
          const fresh = rows.slice(0, rows.length - prevLen);
          const student = buildSnapshot(studentId);
          fresh.reverse().forEach(entry => pointsListeners.forEach(cb => { try { cb(student, entry); } catch (e) {} }));
        }
      }, () => { /* access revoked — watchLinks prunes this listener shortly */ });
  }

  // classes/{classId}/notesHome — Notes Home (v0.9.0): a teacher's private note about THIS child, sent to the parents.
  // The query filters on studentId == this child, which is exactly what firestore.rules' per-student read check
  // (isGuardianOf(resource.data.studentId)) needs — we never ask for the whole collection. A note is never edited:
  // marking one read is the markNoteRead Cloud Function (below), and its result comes back through this same listener.
  // Sorted client-side (newest first) so no composite index is needed. The first snapshot only sets a baseline; after
  // that, a note id we haven't seen — and that isn't already read — is a new arrival and fires onNoteReceived.
  function subscribeNotes(studentId, classId) {
    let baseline = null;
    notesUnsubs[studentId] = db.collection('classes').doc(classId).collection('notesHome').where('studentId', '==', studentId)
      .onSnapshot(snap => {
        const toMs = t => (t && t.toMillis) ? t.toMillis() : (t && t.seconds ? t.seconds * 1000 : 0);
        const rows = snap.docs.map(d => ({ id: d.id, classId, ...d.data() })).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        const seen = baseline; baseline = new Set(rows.map(r => r.id));
        cache.notes[studentId] = rows;
        notifyChild(studentId); notifyNotesChanged();
        if (seen) rows.filter(r => !seen.has(r.id) && !r.read).reverse().forEach(n => { const st = buildSnapshot(studentId); noteListeners.forEach(cb => { try { cb(st, n); } catch (e) {} }); });
      }, () => { cache.notes[studentId] = []; notifyChild(studentId); notifyNotesChanged(); }); // access revoked, or rule not deployed yet
  }
  async function markNoteRead(studentId, noteId) {
    const link = cache.links.find(l => l.studentId === studentId);
    if (!link) throw new Error('Not linked to that student.');
    await functions.httpsCallable('markNoteRead')({ classId: link.classId, noteId });
  }
  function getUnreadNotesCount() { return Object.values(cache.notes).reduce((n, arr) => n + (arr || []).filter(x => !x.read).length, 0); }
  function onProgressReportReceived(fn) { reportListeners.add(fn); return () => reportListeners.delete(fn); }
  function onNoteReceived(fn) { noteListeners.add(fn); return () => noteListeners.delete(fn); }
  function onNotesChanged(fn) { notesChangedListeners.add(fn); return () => notesChangedListeners.delete(fn); }

  function buildSnapshot(studentId) {
    const s = cache.students[studentId];
    if (!s) return null;
    const link = cache.links.find(l => l.studentId === studentId);
    const cls = link ? cache.classes[link.classId] : null;
    const ledger = cache.ledgers[studentId] || [];
    const now = Date.now(), weekAgo = now - 7 * 864e5;
    const toMillis = t => (t && t.toMillis) ? t.toMillis() : (t && t.seconds ? t.seconds * 1000 : now);
    const weekly = ledger.filter(e => toMillis(e.createdAt) > weekAgo);
    const practiceDaily = cache.practice[studentId] || {};                  // { 'YYYY-MM-DD': {xp,hw,readEntries,readMin,focus,games,idioms,mood} }
    const dayKey = d => new Date(d).toLocaleDateString('en-CA');
    const last7 = Array.from({ length: 7 }, (_, i) => dayKey(now - i * 864e5)).map(k => practiceDaily[k]).filter(Boolean);
    const sum7 = f => last7.reduce((a, r) => a + (r[f] || 0), 0);
    return {
      studentId,
      displayName: s.displayName,
      classId: link ? link.classId : null,
      className: cls ? cls.className : '',
      points: s.xp || 0,
      level: s.level || 1,
      pointsLog: ledger.map(e => ({ t: toMillis(e.createdAt), amount: e.delta, reason: e.reason || '', from: e.awardedBy === 'self-redemption' ? 'Redeemed' : 'Teacher' })),
      demerits: [], // not modeled by the backend yet — see file header
      ranking: { position: null, classSize: null }, // fetch via PD.getRanking() — not real-time, see below
      // xpTotal/streak always present; gameScores/recentXp only once the linked child's StudentDeck is on
      // v0.6.3+ (see its cloud.js pushPracticeStats) — pass whatever's there through as-is rather than
      // reconstructing just two fields, so Student Stats and XP actually gets the rest of what's synced.
      practice: { xpTotal: 0, streak: 0, ...(s.practice || {}) },
      practiceDaily, // full recent history, for the Trends widget's daily/weekly/monthly charts
      calendar: link ? (cache.calendars[link.classId] || []) : [], // for the Calendar widget — see subscribeCalendarEvents above
      homework: link ? (cache.homework[link.classId] || []) : [], // for the Homework widget — see subscribeHomework above
      badges: Object.values(cache.badges[studentId] || {}).map(badgeRow).sort((a, c) => (c.t - a.t) || (c.tier - a.tier)), // earned XP badges, newest first — see subscribeBadges above
      homeworkDone: cache.homeworkDone[studentId] || {}, // assignmentId -> {done, doneAt, ...} — see subscribeHomeworkDone above
      rewards: link ? (cache.rewards[link.classId] || []) : [], // class rewards catalog — see subscribeRewards above
      progressReports: cache.reports[studentId] || [], // newest first — see subscribeProgressReports above
      notes: cache.notes[studentId] || [], // Notes Home, newest first — see subscribeNotes above
      attendance: cache.attendance[studentId] || { available: null, days: {} }, // available: null = still loading, false = not shared yet — see subscribeAttendance above
      weekly: {
        pointsEarned: weekly.filter(e => e.delta > 0).reduce((a, e) => a + e.delta, 0),
        homeworkDone: sum7('hw'), readingMinutes: sum7('readMin'),
        demerits: 0
      }
    };
  }

  function getLinkedChildren() {
    return cache.links.map(l => cache.students[l.studentId] && ({
      studentId: l.studentId,
      displayName: cache.students[l.studentId].displayName,
      classId: l.classId,
      className: (cache.classes[l.classId] || {}).className || ''
    })).filter(Boolean);
  }
  function onLinksChanged(fn) { linksChangedListeners.add(fn); return () => linksChangedListeners.delete(fn); }

  /* The backend's linkParentToStudent only accepts accounts whose ID token carries role === 'parent'.
     That claim is normally set once, by ensureUserProfile, right after the Google popup. A session
     that was restored on page load (or an account that first signed in under another app/role)
     never goes through that step, so re-check it here right before linking. Returns the role the
     token actually carries after one repair attempt (undefined if none). */
  async function currentRole(force) {
    const user = auth && auth.currentUser;
    if (!user) throw new Error('Sign in with Google first.');
    const r = await user.getIdTokenResult(!!force);
    return r && r.claims ? r.claims.role : undefined;
  }
  async function ensureParentRole() {
    let role = await currentRole(true);
    if (role === 'parent') return role;
    try { await functions.httpsCallable('ensureUserProfile')({ role: 'parent' }); }
    catch (e) { if (window.console) console.warn('[ParentDeck] ensureUserProfile failed', e.code, e.message); }
    role = await currentRole(true);
    if (window.console) console.info('[ParentDeck] token role after repair attempt:', role);
    return role;
  }
  function wrongRoleError(role) {
    return new Error(role
      ? 'This Google account is already registered as a ' + role + ' account, and only parent accounts can link a student. Sign out and sign in with a different Google account that has not been used in TeachersDeck or StudentDeck.'
      : 'This account has no parent role yet, so the server won\u2019t let it link a student. Sign out, sign in again, and retry; if it keeps happening the backend\u2019s ensureUserProfile needs checking.');
  }
  /* linkChild(code, name) — v0.21.3, for backend v2.0.0's family codes.
     `code` is normally the child's own FAMILY CODE (StudentDeck → Class, or from the teacher); the server tidies
     spaces, case, dashes and a missing hyphen itself, so it is sent once as typed. `name` is only needed in a class
     whose teacher still allows the older class code + child's name; both are sent so one call covers either case
     (and an older backend, which only understands parentJoinCode + studentDisplayName, still works). */
  async function linkChild(code, studentDisplayName) {
    if (!ready) throw new Error('Cloud sync isn\u2019t set up yet.');
    const typed = String(code || '').replace(/[\u2010-\u2015\u2212]/g, '-').trim();
    if (!typed) throw new Error('Enter your child\u2019s family code.');
    const name = String(studentDisplayName || '').trim().replace(/\s+/g, ' ');
    const role = await ensureParentRole();
    if (role && role !== 'parent') throw wrongRoleError(role);   // e.g. this Google account is the teacher's or a student's
    try {
      const res = await functions.httpsCallable('linkParentToStudent')({ familyCode: typed, parentJoinCode: typed.toUpperCase(), studentDisplayName: name });
      return { studentId: res.data.studentId, displayName: res.data.displayName || name };
    } catch (e) {
      if (e && /only parent/i.test(e.message || '')) throw wrongRoleError(await currentRole(false).catch(() => undefined));
      throw e;
    }
  }
  async function unlinkChild(studentId) {
    await functions.httpsCallable('unlinkParentFromStudent')({ studentId });
  }

  /* Pull the child's current stats straight from the server (bypassing Firestore's local cache), instead of
     waiting for the live listeners. Reads students/{id} and students/{id}/practiceDaily -- the two places
     StudentDeck syncs xpTotal/streak/gameScores/recentXp and the daily XP/time buckets -- updates the
     cache and notifies subscribers. Throws if offline/unlinked so the UI can say so. */
  async function refreshChild(studentId) {
    if (!db || !cache.links.some(l => l.studentId === studentId)) throw new Error('Not linked to that student.');
    const ref = db.collection('students').doc(studentId), opt = { source: 'server' };
    const [doc, snap] = await Promise.all([
      ref.get(opt),
      ref.collection('practiceDaily').orderBy(firebase.firestore.FieldPath.documentId(), 'desc').limit(200).get(opt)
    ]);
    cache.students[studentId] = doc.exists ? doc.data() : null;
    const days = {}; snap.docs.forEach(d => { days[d.id] = d.data(); });
    cache.practice[studentId] = days;
    notifyChild(studentId);
    return buildSnapshot(studentId);
  }

  function getChildSnapshot(studentId) { return buildSnapshot(studentId); }
  function subscribeChild(studentId, cb) {
    (childListeners[studentId] || (childListeners[studentId] = new Set())).add(cb);
    cb(buildSnapshot(studentId));
    return () => childListeners[studentId] && childListeners[studentId].delete(cb);
  }

  async function getRanking(studentId) {
    const link = cache.links.find(l => l.studentId === studentId);
    if (!link) throw new Error('Not linked to that student.');
    return (await functions.httpsCallable('getClassRanking')({ classId: link.classId })).data;
  }

  function onPointsAwarded(fn) { pointsListeners.add(fn); return () => pointsListeners.delete(fn); }
  function onHomeworkCompleted(fn) { homeworkListeners.add(fn); return () => homeworkListeners.delete(fn); }
  function onBadgeEarned(fn) { badgeListeners.add(fn); return () => badgeListeners.delete(fn); }   // fn(student, badgeRow) when a linked child earns a new badge

  watchAuth();
  /* ---- ParentDeck Pro (v0.21.4, backend v2.1.0) ----
     users/{uid}.pro = { active, key, since } is written only by the backend (activateParentLicense; a voided key
     switches it off). While it is active, every child linked to this account is Pro in StudentDeck too. */
  let proUnsub = null; const proListeners = new Set(); let proOn = false, proInfo = null;
  function notifyPro() { if (window.ProGate) window.ProGate.setPro(proOn); proListeners.forEach(f => { try { f(proOn, proInfo); } catch (e) {} }); }
  function watchPro(user) {
    if (proUnsub) { proUnsub(); proUnsub = null; }
    proOn = false; proInfo = null;
    if (!user || !db) { notifyPro(); return; }
    proUnsub = db.collection('users').doc(user.uid).onSnapshot(doc => {
      proInfo = (doc.exists && doc.data().pro) || null; proOn = !!(proInfo && proInfo.active); notifyPro();
    }, () => { proOn = false; notifyPro(); });
  }
  async function activatePro(key) {
    if (!ready) throw new Error('Cloud sync isn\u2019t set up yet.');
    const role = await ensureParentRole();
    if (role && role !== 'parent') throw wrongRoleError(role);
    return (await functions.httpsCallable('activateParentLicense')({ key: String(key || '').trim() })).data;
  }
  function getPro() { return { active: proOn, info: proInfo }; }
  function onProChanged(fn) { proListeners.add(fn); return () => proListeners.delete(fn); }

  return {
    activatePro, getPro, onProChanged,
    isConfigured, onAuthChanged, signInWithGoogle, signOut, getSession,
    getLinkedChildren, onLinksChanged, linkChild, unlinkChild,
    getChildSnapshot, subscribeChild, refreshChild, getRanking, getClassPulse, onPointsAwarded, onHomeworkCompleted, onBadgeEarned,
    markNoteRead, getUnreadNotesCount, onNoteReceived, onNotesChanged, onProgressReportReceived
  };
})();

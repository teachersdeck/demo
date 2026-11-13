'use strict';
/* =========================================================
   AdminDeck Wave 1 — school activity aggregation (pure logic)
   -----------------------------------------------------------------
   Takes plain arrays read from Firestore (see adminDeckWave1.js for
   the reads) and returns the per-class / per-teacher / school-wide
   aggregates behind six AdminDeck widgets:

     Homework Completion Rates   -> classes[].homework
     Student Activity Pulse      -> classes[].activity, school.activity
     Points & Rewards Economy    -> classes[].economy
     Class Onboarding Funnel     -> classes[].funnel, school.funnel
     Family Link Coverage        -> classes[].families, school.families
     Teacher Engagement          -> teachers[]

   No Firebase imports on purpose: this file is a pure function of
   its input, so tools/test_schoolactivity.js can exercise every
   branch with synthetic data and no database. It is wrapped so the SAME
   file loads in Node (module.exports, the backend and the tests) and in
   the browser (window.SchoolActivity, which demo mode uses to build its
   numbers) — index.html loads it from functions/, so there is only one copy.

   PRIVACY BOUNDARIES, enforced here rather than left to the widgets:
   - Returns counts, percentages and class/teacher names. The only
     student-identifying output is `families.unlinked` (display names
     of students with no linked guardian, capped) — a roster fact the
     admin already sees in adminGetClass.
   - Never returns point-ledger reasons, journal text, per-student
     mood, per-student activity, or any parent email/uid.
   - Mood counts are class-level and suppressed entirely when fewer
     than MOOD_MIN_STUDENTS distinct students contributed one, since a
     'class mood' built from two children identifies them.
   - practiceDaily / practice.* / homeworkDone are written by the
     student's own device. Everything built on them is activity
     information, never an authoritative score; official points are
     students.xp (Cloud Functions only) and the pointsLedger.
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchoolActivity = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  const MOOD_MIN_STUDENTS = 5;          // below this many students, class mood is hidden
  const MOODS = ['😢', '😐', '😊'];      // the only mood words StudentDeck writes
  const LOW_COMPLETION_PCT = 50;        // avg completion under this (past-due work) ...
  const LOW_COMPLETION_MIN_ASSIGNMENTS = 3; // ... across at least this many assignments => flagged
  const DORMANT_DAYS = 14;              // no points awarded for this long => dormant class
  const NEW_CLASS_DAYS = 14;            // a class younger than this with no awards is 'new', not dormant
  const STUCK_DAYS = 7;                 // class older than this with unfinished setup => stuck
  const UNLINKED_LIST_CAP = 50;         // max unlinked-student names returned per class
  const LINK_WEEKS = 8;                 // weeks of guardian-link growth returned

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // Firestore Timestamp | ms number | ISO string | undefined  ->  ms or null
  function toMs(v) {
    if (v == null) return null;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') { const p = Date.parse(v); return Number.isFinite(p) ? p : null; }
    return null;
  }

  // Local calendar day (YYYY-MM-DD) of an instant, in a fixed UTC offset.
  function localDay(ms, tzOffsetMin) {
    return new Date(ms + tzOffsetMin * 60000).toISOString().slice(0, 10);
  }
  // Monday-start week key (YYYY-MM-DD of that Monday) of an instant, in a fixed UTC offset.
  function weekStartDay(ms, tzOffsetMin) {
    const d = new Date(ms + tzOffsetMin * 60000);
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  }

  function isRedemption(e) {
    return !!(e.redeemedRewardId || e.awardedBy === 'self-redemption');
  }

  function pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : null; }

  function emptyWindow() {
    return { activeStudents: 0, readMin: 0, readEntries: 0, focusMin: 0, games: 0, idioms: 0, hwChecks: 0 };
  }

  function computeSchoolActivity(input, opts) {
    const nowMs = (opts && opts.nowMs) || Date.now();
    const tz = Math.max(-840, Math.min(840, num(opts && opts.tzOffsetMin)));

    const classes = input.classes || [];
    const students = input.students || [];
    const homework = input.homework || [];
    const homeworkDone = input.homeworkDone || [];
    const practiceDaily = input.practiceDaily || [];
    const rewards = input.rewards || [];
    const calendarEvents = input.calendarEvents || [];
    const ledger = input.pointsLedger || [];
    const links = input.guardianLinks || [];
    const teacherInfo = input.teachers || {};

    const classById = new Map(classes.map((c) => [c.id, c]));
    const studentById = new Map(students.map((s) => [s.id, s]));

    // ---- bucket everything by class up front ----
    const rosterByClass = new Map();
    students.forEach((s) => {
      if (!classById.has(s.classId)) return; // student of a deleted class
      if (!rosterByClass.has(s.classId)) rosterByClass.set(s.classId, []);
      rosterByClass.get(s.classId).push(s);
    });
    const group = (arr) => {
      const m = new Map();
      arr.forEach((x) => { if (!classById.has(x.classId)) return; if (!m.has(x.classId)) m.set(x.classId, []); m.get(x.classId).push(x); });
      return m;
    };
    const hwByClass = group(homework);
    const rewardsByClass = group(rewards);
    const eventsByClass = group(calendarEvents);
    const ledgerByClass = group(ledger);

    // guardian links: keep the ones pointing at a real student in their class; count the rest as orphans
    const linksByClass = new Map();
    const orphanLinksByClass = new Map();
    let orphanLinksTotal = 0;
    links.forEach((l) => {
      const stu = studentById.get(l.studentId);
      if (!stu) {
        orphanLinksTotal++;
        if (classById.has(l.classId)) orphanLinksByClass.set(l.classId, (orphanLinksByClass.get(l.classId) || 0) + 1);
        return;
      }
      const cid = stu.classId;
      if (!classById.has(cid)) return;
      if (!linksByClass.has(cid)) linksByClass.set(cid, []);
      linksByClass.get(cid).push(l);
    });

    // ---- practiceDaily windows ----
    const day7 = localDay(nowMs - 6 * DAY_MS, tz);
    const day30 = localDay(nowMs - 29 * DAY_MS, tz);
    // Allow one day of slack on the upper edge: a student's device can be a time zone ahead of the
    // admin's, so a doc dated 'tomorrow' by the admin's clock can still be genuinely today's.
    const latestDay = localDay(nowMs + DAY_MS, tz);
    const activityByClass = new Map(); // classId -> {w7, w30, moodStudents:Set, moods:{}}
    const schoolActive7 = new Set(), schoolActive30 = new Set();
    const schoolMoodStudents = new Set(); const schoolMoods = {};
    const bumpAct = (cid) => {
      if (!activityByClass.has(cid)) {
        activityByClass.set(cid, { w7: emptyWindow(), w30: emptyWindow(), active7: new Set(), active30: new Set(), moodStudents: new Set(), moods: {} });
      }
      return activityByClass.get(cid);
    };
    practiceDaily.forEach((p) => {
      const stu = studentById.get(p.studentId);
      if (!stu || !classById.has(stu.classId)) return;
      const day = String(p.day || '');
      if (day < day30 || day > latestDay) return; // outside the 30-day window (or dated further ahead than a time-zone gap explains)
      const a = bumpAct(stu.classId);
      const add = (w) => {
        w.readMin += num(p.readMin); w.readEntries += num(p.readEntries); w.focusMin += num(p.focus);
        w.games += num(p.games); w.idioms += num(p.idioms); w.hwChecks += num(p.hw);
      };
      add(a.w30); a.active30.add(p.studentId); schoolActive30.add(p.studentId);
      if (day >= day7) {
        add(a.w7); a.active7.add(p.studentId); schoolActive7.add(p.studentId);
        if (MOODS.includes(p.mood)) {
          a.moodStudents.add(p.studentId); a.moods[p.mood] = (a.moods[p.mood] || 0) + 1;
          schoolMoodStudents.add(p.studentId); schoolMoods[p.mood] = (schoolMoods[p.mood] || 0) + 1;
        }
      }
    });

    // ---- homeworkDone index: assignmentId -> studentId -> doc ----
    const doneByAssignment = new Map();
    homeworkDone.forEach((d) => {
      if (d.done !== true) return;
      if (!doneByAssignment.has(d.assignmentId)) doneByAssignment.set(d.assignmentId, new Map());
      doneByAssignment.get(d.assignmentId).set(d.studentId, d);
    });

    // ---- per-class output ----
    const out = [];
    const teacherAgg = new Map();
    const funnelCounts = { students: 0, parents: 0, homework: 0, rewards: 0, points: 0 };
    let linkedStudentsTotal = 0, rosterTotal = 0;
    const schoolLinkWeeks = new Map();
    let schoolAwarded = 0, schoolDeducted = 0, schoolRedeemed = 0;
    let schoolPastAssignments = 0, schoolPastDoneSum = 0, schoolPastPossibleSum = 0, flaggedLowCompletion = 0;
    const schoolTotals = { read7: 0, focus7: 0, games7: 0, idioms7: 0 };
    let classesActive7 = 0;

    classes.forEach((c) => {
      const roster = rosterByClass.get(c.id) || [];
      const rosterIds = new Set(roster.map((s) => s.id));
      const rosterSize = roster.length;
      rosterTotal += rosterSize;
      const classHw = hwByClass.get(c.id) || [];
      const classRewards = rewardsByClass.get(c.id) || [];
      const classEvents = eventsByClass.get(c.id) || [];
      const classLedger = ledgerByClass.get(c.id) || [];
      const classLinks = linksByClass.get(c.id) || [];
      const createdAtMs = toMs(c.createdAtMs != null ? c.createdAtMs : c.createdAt);
      const ageDays = createdAtMs != null ? Math.floor((nowMs - createdAtMs) / DAY_MS) : null;

      // ===== homework completion =====
      const assignments = classHw.map((h) => {
        const dueTime = /^\d{1,2}:\d{2}$/.test(h.dueTime || '') ? h.dueTime : '23:59';
        let dueMs = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(h.dueDate || '')) {
          const p = Date.parse(`${h.dueDate}T${dueTime.padStart(5, '0')}:00Z`);
          if (Number.isFinite(p)) dueMs = p - tz * 60000; // due date/time are in the teacher's local time
        }
        const doneMap = doneByAssignment.get(h.id) || new Map();
        let doneCount = 0, onTime = 0, late = 0, untimed = 0;
        doneMap.forEach((d, sid) => {
          if (!rosterIds.has(sid)) return; // a student who left the class doesn't count
          doneCount++;
          const at = toMs(d.doneAtMs != null ? d.doneAtMs : d.doneAt);
          // A 'backfilled' completion was recorded when a device first synced, not when the work was
          // done, so its timestamp says nothing about lateness. Same if either date is missing.
          if (d.backfilled === true || at == null || dueMs == null) { untimed++; return; }
          if (at <= dueMs) onTime++; else late++;
        });
        const isPast = dueMs != null && dueMs < nowMs;
        return {
          id: h.id, title: h.title || '', subject: h.subject || '', dueDate: h.dueDate || null, dueTime: h.dueTime || null,
          isPast, doneCount, onTime, late, untimed, rosterSize, pctDone: pct(doneCount, rosterSize),
        };
      }).sort((a, b) => String(b.dueDate || '').localeCompare(String(a.dueDate || '')));
      const pastWithRoster = assignments.filter((a) => a.isPast && a.rosterSize > 0);
      const pastDoneSum = pastWithRoster.reduce((s, a) => s + a.doneCount, 0);
      const pastPossibleSum = pastWithRoster.reduce((s, a) => s + a.rosterSize, 0);
      const avgPctDonePast = pct(pastDoneSum, pastPossibleSum);
      const lowCompletion = pastWithRoster.length >= LOW_COMPLETION_MIN_ASSIGNMENTS && avgPctDonePast != null && avgPctDonePast < LOW_COMPLETION_PCT;
      const timed = assignments.reduce((s, a) => s + a.onTime + a.late, 0);
      const lateTotal = assignments.reduce((s, a) => s + a.late, 0);
      schoolPastAssignments += pastWithRoster.length; schoolPastDoneSum += pastDoneSum; schoolPastPossibleSum += pastPossibleSum;
      if (lowCompletion) flaggedLowCompletion++;

      // ===== activity =====
      const act = activityByClass.get(c.id);
      const w7 = act ? act.w7 : emptyWindow(), w30 = act ? act.w30 : emptyWindow();
      w7.activeStudents = act ? act.active7.size : 0; w30.activeStudents = act ? act.active30.size : 0;
      const moodVisible = !!act && act.moodStudents.size >= MOOD_MIN_STUDENTS;
      const streaks = roster.map((s) => num(s.streak));
      if (w7.activeStudents > 0) classesActive7++;
      schoolTotals.read7 += w7.readMin; schoolTotals.focus7 += w7.focusMin; schoolTotals.games7 += w7.games; schoolTotals.idioms7 += w7.idioms;

      // ===== economy =====
      let awarded = 0, deducted = 0, redeemed = 0, redemptions = 0, awardEntries = 0, awarded30 = 0, redeemed30 = 0;
      let lastAwardMs = null, awards7 = 0, awards30 = 0;
      const redemptionsByReward = new Map();
      classLedger.forEach((e) => {
        const delta = num(e.delta);
        if (!delta) return;
        const at = toMs(e.createdAtMs != null ? e.createdAtMs : e.createdAt);
        const recent30 = at != null && at >= nowMs - 30 * DAY_MS;
        if (isRedemption(e)) {
          redeemed += Math.abs(delta); redemptions++;
          if (recent30) redeemed30 += Math.abs(delta);
          if (e.redeemedRewardId) redemptionsByReward.set(e.redeemedRewardId, (redemptionsByReward.get(e.redeemedRewardId) || 0) + 1);
        } else {
          awardEntries++;
          if (delta > 0) { awarded += delta; if (recent30) awarded30 += delta; } else deducted += Math.abs(delta);
          if (at != null) {
            if (lastAwardMs == null || at > lastAwardMs) lastAwardMs = at;
            if (at >= nowMs - 7 * DAY_MS) awards7++;
            if (recent30) awards30++;
          }
        }
      });
      schoolAwarded += awarded; schoolDeducted += deducted; schoolRedeemed += redeemed;
      const activeRewards = classRewards.filter((r) => r.active !== false);
      const costs = activeRewards.map((r) => num(r.cost)).filter((x) => x > 0);
      const cheapest = costs.length ? Math.min(...costs) : null;
      const maxXp = roster.reduce((m, s) => Math.max(m, num(s.xp)), 0);
      let catalogStatus = 'ok';
      if (!activeRewards.length) catalogStatus = 'none';
      else if (cheapest != null && awarded > 0 && cheapest > maxXp && redemptions === 0) catalogStatus = 'unreachable';
      const perReward = classRewards.map((r) => ({
        id: r.id, name: r.name || '', cost: num(r.cost), active: r.active !== false, redemptions: redemptionsByReward.get(r.id) || 0,
      })).sort((a, b) => b.redemptions - a.redemptions || a.cost - b.cost);

      // ===== families =====
      const guardiansByStudent = new Map();
      const parentUidsInClass = new Set();
      classLinks.forEach((l) => {
        if (!guardiansByStudent.has(l.studentId)) guardiansByStudent.set(l.studentId, new Set());
        guardiansByStudent.get(l.studentId).add(l.parentUid);
        parentUidsInClass.add(l.parentUid);
      });
      const linkedStudents = roster.filter((s) => guardiansByStudent.has(s.id)).length;
      const multiGuardian = roster.filter((s) => (guardiansByStudent.get(s.id) || new Set()).size >= 2).length;
      const unlinkedAll = roster.filter((s) => !guardiansByStudent.has(s.id));
      linkedStudentsTotal += linkedStudents;
      const weekBuckets = new Map();
      classLinks.forEach((l) => {
        const at = toMs(l.createdAtMs != null ? l.createdAtMs : l.createdAt);
        if (at == null) return;
        const wk = weekStartDay(at, tz);
        weekBuckets.set(wk, (weekBuckets.get(wk) || 0) + 1);
        schoolLinkWeeks.set(wk, (schoolLinkWeeks.get(wk) || 0) + 1);
      });

      // ===== funnel =====
      const stages = {
        students: rosterSize > 0,
        parents: linkedStudents > 0,
        homework: classHw.length > 0,
        rewards: classRewards.length > 0,
        points: awardEntries > 0,
      };
      Object.keys(stages).forEach((k) => { if (stages[k]) funnelCounts[k]++; });
      const order = ['students', 'parents', 'homework', 'rewards', 'points'];
      const nextStep = order.find((k) => !stages[k]) || null;
      const done = order.filter((k) => stages[k]).length;
      const stuck = ageDays != null && ageDays >= STUCK_DAYS && done < order.length;

      // ===== teacher rollup =====
      const tuid = c.teacherUid || 'none';
      if (!teacherAgg.has(tuid)) {
        const info = teacherInfo[tuid] || {};
        teacherAgg.set(tuid, {
          teacherUid: tuid === 'none' ? null : tuid, name: info.name || null, email: info.email || null,
          classCount: 0, lastAwardMs: null, awards7d: 0, awards30d: 0,
          classesActive: 0, classesDormant: 0, classesNew: 0, dormantClasses: [],
          features: { rewards: 0, calendar: 0, homework: 0 },
        });
      }
      const T = teacherAgg.get(tuid);
      T.classCount++;
      if (lastAwardMs != null && (T.lastAwardMs == null || lastAwardMs > T.lastAwardMs)) T.lastAwardMs = lastAwardMs;
      T.awards7d += awards7; T.awards30d += awards30;
      let engagement;
      if (lastAwardMs != null && lastAwardMs >= nowMs - DORMANT_DAYS * DAY_MS) engagement = 'active';
      else if (lastAwardMs == null && ageDays != null && ageDays < NEW_CLASS_DAYS) engagement = 'new';
      else engagement = 'dormant';
      if (engagement === 'active') T.classesActive++;
      else if (engagement === 'new') T.classesNew++;
      else { T.classesDormant++; T.dormantClasses.push(c.className || ''); }
      if (classRewards.length) T.features.rewards++;
      if (classEvents.length) T.features.calendar++;
      if (classHw.length) T.features.homework++;

      out.push({
        id: c.id, className: c.className || '', teacherUid: c.teacherUid || null,
        teacherName: (teacherInfo[c.teacherUid] || {}).name || null,
        createdAtMs, ageDays, rosterSize,
        homework: {
          assignments, assignmentCount: assignments.length, pastDueCount: pastWithRoster.length,
          avgPctDonePast, lowCompletion, lateShare: pct(lateTotal, timed),
        },
        activity: {
          active7: w7.activeStudents, active30: w30.activeStudents, w7, w30,
          avgStreak: roster.length ? Math.round((streaks.reduce((a, b) => a + b, 0) / roster.length) * 10) / 10 : 0,
          streak3Plus: streaks.filter((x) => x >= 3).length,
          moodSuppressed: !!act && act.moodStudents.size > 0 && !moodVisible,
          mood: moodVisible ? act.moods : null,
        },
        economy: {
          awarded, deducted, redeemed, redemptions, awarded30, redeemed30,
          redemptionRate: pct(redeemed, awarded),
          activeRewards: activeRewards.length, totalRewards: classRewards.length,
          cheapestActiveCost: cheapest, topStudentPoints: maxXp, catalogStatus,
          perReward, neverRedeemed: perReward.filter((r) => r.active && r.redemptions === 0).map((r) => r.name),
        },
        families: {
          rosterSize, linkedStudents, unlinkedCount: unlinkedAll.length,
          coveragePct: pct(linkedStudents, rosterSize), multiGuardian,
          guardianCount: parentUidsInClass.size, parentCodeUsed: classLinks.length > 0,
          orphanLinks: orphanLinksByClass.get(c.id) || 0,
          unlinked: unlinkedAll.slice(0, UNLINKED_LIST_CAP).map((s) => ({ id: s.id, name: s.displayName || '(unnamed)' })),
          linkWeeks: weekBuckets.size ? Object.fromEntries(weekBuckets) : {},
        },
        funnel: { stages, done, total: order.length, nextStep, stuck },
        engagement: { status: engagement, lastAwardMs, awards7, awards30 },
      });
    });

    // ---- link growth: dense list of the last LINK_WEEKS weeks, oldest first ----
    const weeks = [];
    const thisWeek = new Date(weekStartDay(nowMs, tz) + 'T00:00:00Z');
    for (let i = LINK_WEEKS - 1; i >= 0; i--) {
      const d = new Date(thisWeek.getTime() - i * 7 * DAY_MS).toISOString().slice(0, 10);
      weeks.push({ weekStart: d, links: schoolLinkWeeks.get(d) || 0 });
    }

    const teachers = Array.from(teacherAgg.values()).map((T) => ({
      ...T,
      lastAwardMs: T.lastAwardMs,
      featuresUsed: ['rewards', 'calendar', 'homework'].filter((k) => T.features[k] > 0).length,
    }));

    const mood = schoolMoodStudents.size >= MOOD_MIN_STUDENTS ? schoolMoods : null;
    const totalClasses = classes.length;

    return {
      generatedAtMs: nowMs,
      tzOffsetMin: tz,
      thresholds: {
        moodMinStudents: MOOD_MIN_STUDENTS, lowCompletionPct: LOW_COMPLETION_PCT,
        lowCompletionMinAssignments: LOW_COMPLETION_MIN_ASSIGNMENTS, dormantDays: DORMANT_DAYS, stuckDays: STUCK_DAYS,
      },
      school: {
        classes: totalClasses, teachers: teachers.filter((t) => t.teacherUid).length, students: rosterTotal,
        activity: {
          activeStudents7: schoolActive7.size, activeStudents30: schoolActive30.size, activeClasses7: classesActive7,
          readMin7: schoolTotals.read7, focusMin7: schoolTotals.focus7, games7: schoolTotals.games7, idioms7: schoolTotals.idioms7,
          moodSuppressed: schoolMoodStudents.size > 0 && !mood, mood,
        },
        homework: {
          pastAssignments: schoolPastAssignments, avgPctDonePast: pct(schoolPastDoneSum, schoolPastPossibleSum),
          lowCompletionClasses: flaggedLowCompletion,
        },
        economy: { awarded: schoolAwarded, deducted: schoolDeducted, redeemed: schoolRedeemed, redemptionRate: pct(schoolRedeemed, schoolAwarded) },
        families: {
          linkedStudents: linkedStudentsTotal, students: rosterTotal, coveragePct: pct(linkedStudentsTotal, rosterTotal),
          unlinkedStudents: rosterTotal - linkedStudentsTotal, orphanLinks: orphanLinksTotal, linkWeeks: weeks,
        },
        funnel: { classes: totalClasses, reached: funnelCounts },
      },
      classes: out,
      teachers,
    };
  }

  return { computeSchoolActivity, toMs, localDay, weekStartDay, MOOD_MIN_STUDENTS, LOW_COMPLETION_PCT, DORMANT_DAYS };
});

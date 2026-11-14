'use strict';
/* TinyTeachersDeck's data layer for Kinder classes (scope steps 2–4). This file is TinyTeachersDeck's own; it loads after
   js/cloud.js (TeachersDeck's sign-in and Firebase set-up, shared) and before js/kinder-widgets.js.

   It talks to the suite backend v2.22.0 on the paths agreed in ../contracts (v1.0.0-draft2):
     classes where teacherUid == me or staffUids contains me (kinder: true)    published by KinderDeck
     students where classId == the class (active children only)                published by KinderDeck
     students/{id}/attendance/{YYYY-MM-DD}                                       written here; the office may correct it
     students/{id}/reportEntries/{date}_{fieldId}                               written here
     students/{id}/absenceNotices                                               written by parents; marked seen here
     classes/{id}/notesHome                                                     sendNotesHome / delete while unread
     kinderListStaff / kinderAddStaff / kinderRemoveStaff                       the class's staff
     getFamilyCodes (the class teacher)                                         the codes families link with in TinyParentDeck
     classes/{id}/dayPlans/{YYYY-MM-DD}                                         Today's Plan, shared with the class's families
     classes/{id}/classNotices                                                  Notices posted to the class's families
     students/{id}/observations                                                 Development Observations (words by area; shared or staff-only)
     students/{id}/milestones/{milestoneId}                                     Milestones reached (v2.27.0; id from contracts/milestones.json)
     students/{id}/pickup/current                                               the family's pickup code, checked at the gate (v2.28.0; read only)
     classes/{id}/schoolInfo/current                                            the school's menu, notices and calendar, sent by KinderDeck
   Writes made offline wait in Firestore's queue; every snapshot says whether it is still waiting (pending), which the
   widgets show as Not sent yet. In demo mode (js/demo.js, ?demo=1) the same calls run against made-up classes in memory.

   Children's data stays out of localStorage: only the chosen class id is remembered on the device. */
const KinderCloud = (() => {
  const CLASS_KEY = 'ttd_kinder_class';
  const demo = typeof TD_DEMO !== 'undefined' && !!TD_DEMO.active;   // js/demo.js declares TD_DEMO with const, so it is not on window
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const nowIso = () => new Date().toISOString();
  const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  let chosen = null; try { chosen = localStorage.getItem(CLASS_KEY); } catch (e) {}
  const classListeners = new Set();
  function choose(id) { chosen = id; try { localStorage.setItem(CLASS_KEY, id || ''); } catch (e) {} classListeners.forEach(f => f(id)); }
  function onChoose(fn) { classListeners.add(fn); return () => classListeners.delete(fn); }
  function remember(id) { if (id && id !== chosen) { chosen = id; try { localStorage.setItem(CLASS_KEY, id); } catch (e) {} } }   // the class on screen, without re-subscribing

  /* ======================= live backend ======================= */
  function live() {
    const db = () => firebase.firestore(), fn = name => (window.TDBackend ? TDBackend.functions() : firebase.functions()).httpsCallable(name);
    const me = () => (TDCloud.getSession() || {}).uid;
    const ts = () => firebase.firestore.FieldValue.serverTimestamp();
    return {
      ready: () => TDCloud.isConfigured() && TDCloud.init(),
      session: () => TDCloud.getSession(),
      signIn: () => TDCloud.signIn(),
      onAuth: f => TDCloud.onAuthChanged(f),
      subscribeClasses(cb) {
        if (!me()) { cb([]); return () => {}; }
        const got = { a: [], b: [] }, emit = () => { const m = new Map(); [...got.a, ...got.b].forEach(c => m.set(c.id, c)); cb([...m.values()].sort((x, y) => (x.className || '').localeCompare(y.className || '', 'vi'))); };
        const map = s => s.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.kinder === true && !c.archived);
        const u1 = db().collection('classes').where('teacherUid', '==', me()).onSnapshot(s => { got.a = map(s); emit(); }, () => {});
        const u2 = db().collection('classes').where('staffUids', 'array-contains', me()).onSnapshot(s => { got.b = map(s); emit(); }, () => {});
        return () => { u1(); u2(); };
      },
      subscribeChildren(classId, cb) {
        return db().collection('students').where('classId', '==', classId).onSnapshot(s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.active !== false && c.kinder === true)), () => cb([]));
      },
      subscribeDay(children, sub, date, cb) {   // sub: 'attendance' (doc per day) or 'reportEntries' (docs where date ==)
        const out = {}, unsubs = children.map(c => sub === 'attendance'
          ? db().doc(`students/${c.id}/attendance/${date}`).onSnapshot({ includeMetadataChanges: true }, d => { out[c.id] = d.exists ? { ...d.data(), pending: d.metadata.hasPendingWrites } : null; cb({ ...out }); }, () => {})
          : db().collection(`students/${c.id}/reportEntries`).where('date', '==', date).onSnapshot({ includeMetadataChanges: true }, s => {
              out[c.id] = {}; s.docs.forEach(d => { out[c.id][d.data().fieldId] = { ...d.data(), pending: d.metadata.hasPendingWrites }; }); cb({ ...out });
            }, () => {}));
        return () => unsubs.forEach(u => u());
      },
      setAttendance(classId, childId, date, rec) {
        const r = { ...rec, classId, recordedAt: nowIso(), recordedBy: me(), updatedByRole: 'teacher', updatedAt: ts() };
        delete r.pending; delete r.seenNotice;
        return db().doc(`students/${childId}/attendance/${date}`).set(r);
      },
      setReport(classId, childId, date, fieldId, value, via) {
        return db().doc(`students/${childId}/reportEntries/${date}_${fieldId}`).set({ classId, date, fieldId, value, via: via || 'single', recordedAt: nowIso(), recordedBy: me(), updatedAt: ts() });
      },
      clearReport(childId, date, fieldId) { return db().doc(`students/${childId}/reportEntries/${date}_${fieldId}`).delete(); },
      subscribeNotices(children, cb) {
        const out = {}, unsubs = children.map(c => db().collection(`students/${c.id}/absenceNotices`).where('seen', '==', false).onSnapshot(s => { out[c.id] = s.docs.map(d => ({ id: d.id, ...d.data() })); cb({ ...out }); }, () => {}));
        return () => unsubs.forEach(u => u());
      },
      markNoticeSeen(childId, noticeId) { return db().doc(`students/${childId}/absenceNotices/${noticeId}`).update({ seen: true, seenBy: me(), seenAt: ts() }); },
      subscribeNotes(classId, cb) {
        return db().collection(`classes/${classId}/notesHome`).orderBy('createdAt', 'desc').limit(100).onSnapshot(s => cb(s.docs.map(d => ({ id: d.id, ...d.data(), createdMs: d.data().createdAt ? d.data().createdAt.toMillis() : Date.now() }))), () => cb([]));
      },
      sendNote: (classId, studentIds, category, text, signedAs) => fn('sendNotesHome')({ classId, studentIds, category, text, signedAs }).then(r => r.data),
      takeBack: (classId, noteId) => db().doc(`classes/${classId}/notesHome/${noteId}`).delete(),
      listStaff: classId => fn('kinderListStaff')({ classId }).then(r => r.data.staff),
      addStaff: (classId, email) => fn('kinderAddStaff')({ classId, email }).then(r => r.data),
      removeStaff: (classId, uid) => fn('kinderRemoveStaff')({ classId, uid }).then(r => r.data),
      subscribeClassNotices: (classId, cb) => db().collection(`classes/${classId}/classNotices`).orderBy('createdAt', 'desc').limit(50)
        .onSnapshot({ includeMetadataChanges: true }, s => cb(s.docs.map(d => ({ id: d.id, ...d.data(), pending: d.metadata.hasPendingWrites }))), () => cb([])),
      postClassNotice(classId, n) {
        const rec = { title: n.title, date: n.date, authorUid: me(), createdAt: ts() };
        if (n.body) rec.body = n.body;
        return db().collection(`classes/${classId}/classNotices`).add(rec);
      },
      deleteClassNotice: (classId, id) => db().doc(`classes/${classId}/classNotices/${id}`).delete(),
      subscribeObservations: (childId, cb) => db().collection(`students/${childId}/observations`).orderBy('date', 'desc').limit(100)
        .onSnapshot({ includeMetadataChanges: true }, s => cb(s.docs.map(d => ({ id: d.id, ...d.data(), pending: d.metadata.hasPendingWrites }))), () => cb([])),
      addObservation: (classId, childId, o) => db().collection(`students/${childId}/observations`).add({ classId, area: o.area, text: o.text, date: o.date, shared: !!o.shared, recordedAt: nowIso(), recordedBy: me(), updatedAt: ts() }),
      shareObservation: (childId, id, shared) => db().doc(`students/${childId}/observations/${id}`).update({ shared: !!shared, recordedAt: nowIso(), recordedBy: me(), updatedAt: ts() }),
      deleteObservation: (childId, id) => db().doc(`students/${childId}/observations/${id}`).delete(),
      subscribeMilestones: (childId, cb) => db().collection(`students/${childId}/milestones`).onSnapshot({ includeMetadataChanges: true }, s => cb(s.docs.map(d => ({ id: d.id, ...d.data(), pending: d.metadata.hasPendingWrites }))), () => cb([])),
      setMilestone: (classId, childId, id, m) => db().doc(`students/${childId}/milestones/${id}`).set({ classId, milestone: id, date: m.date, shared: !!m.shared, recordedAt: nowIso(), recordedBy: me(), updatedAt: ts() }),
      removeMilestone: (childId, id) => db().doc(`students/${childId}/milestones/${id}`).delete(),
      pickupCodes(children, cb) {   // { childId: code } for the class's children (made by KinderDeck)
        const out = {}, us = children.map(c => db().doc(`students/${c.id}/pickup/current`).onSnapshot(d => { if (d.exists && d.data().code) out[c.id] = d.data().code; else delete out[c.id]; cb({ ...out }); }, () => {}));
        return () => us.forEach(u => u());
      },
      subscribeSchoolInfo: (classId, cb) => db().doc(`classes/${classId}/schoolInfo/current`).onSnapshot(d => cb(d.exists ? d.data() : null), () => cb(null)),   // KinderDeck's menu, notices, calendar
      familyCodes: classId => fn('getFamilyCodes')({ classId }).then(r => (r.data && r.data.codes) || []),   // the class teacher only
      setDayPlan: (classId, date, plan) => db().doc(`classes/${classId}/dayPlans/${date}`).set({ items: plan.items || [], song: plan.song || '', game: plan.game || '', act: plan.act || '', updatedBy: me(), updatedAt: ts() }),
    };
  }

  /* ======================= demo backend (made-up children only) ======================= */
  function memory() {
    const SESSION = { uid: 'demo-teacher', displayName: 'Cô Mai (demo)', email: 'demo.teacher@example.com' };
    const G = (name, rel, phone, pickup) => ({ name, relationship: rel, phone, zalo: phone, authorisedPickup: pickup });
    const C = {
      demo_k1: { id: 'demo_k1', kinder: true, className: 'Lớp Chồi (demo)', teacherUid: 'demo-teacher', staffUids: ['demo-staff'] },
      demo_k2: { id: 'demo_k2', kinder: true, className: 'Lớp Lá (demo)', teacherUid: 'demo-teacher', staffUids: [] },
    };
    const kid = (cls, i, firstName, nickname, ageGroup, alerts, mum, dad) => ({ id: `${cls}_c${i}`, classId: cls, kinder: true, active: true, firstName, nickname, displayName: nickname || firstName, ageGroup,
      medicalAlerts: alerts || [], guardians: [G(mum, 'Mẹ', '0900000' + pad(i) + '1', true), G(dad, 'Bố', '0900000' + pad(i) + '2', true)], emergencyContact: { name: 'Bà ngoại', relationship: 'Bà', phone: '0900000' + pad(i) + '9' } });
    const K = [
      kid('demo_k1', 1, 'Bảo An', 'Bin', 'Chồi (4–5 tuổi)', [{ kind: 'allergy', label: 'Dị ứng tôm' }], 'Nguyễn Thị Hoa', 'Trần Văn Nam'),
      kid('demo_k1', 2, 'Minh Khang', '', 'Chồi (4–5 tuổi)', [], 'Lê Thu Trang', 'Phạm Quốc Huy'),
      kid('demo_k1', 3, 'Gia Hân', 'Bông', 'Chồi (4–5 tuổi)', [{ kind: 'dietary', label: 'Không ăn thịt bò' }], 'Võ Ngọc Lan', 'Đặng Minh Tuấn'),
      kid('demo_k1', 4, 'Thảo Nhi', '', 'Chồi (4–5 tuổi)', [], 'Bùi Thị Mai', 'Hồ Văn Long'),
      kid('demo_k1', 5, 'Đức Anh', 'Su', 'Chồi (4–5 tuổi)', [{ kind: 'condition', label: 'Hen suyễn nhẹ – có thuốc xịt' }], 'Đỗ Thu Hà', 'Ngô Đức Thắng'),
      kid('demo_k1', 6, 'Ngọc Mai', '', 'Chồi (4–5 tuổi)', [], 'Phan Thị Yến', 'Lý Văn Hùng'),
      kid('demo_k1', 7, 'Quốc Bảo', 'Tôm', 'Chồi (4–5 tuổi)', [], 'Trịnh Mỹ Linh', 'Vũ Quang Vinh'),
      kid('demo_k1', 8, 'Khánh Vy', '', 'Chồi (4–5 tuổi)', [], 'Dương Thị Thảo', 'Mai Văn Phúc'),
      kid('demo_k2', 1, 'Gia Bảo', '', 'Lá (5–6 tuổi)', [], 'Hà Thị Nga', 'Tạ Văn Long'),
      kid('demo_k2', 2, 'Phương Anh', 'Mít', 'Lá (5–6 tuổi)', [{ kind: 'allergy', label: 'Dị ứng đậu phộng' }], 'Châu Ngọc Ánh', 'Kiều Văn Thy'),
      kid('demo_k2', 3, 'Hải Đăng', '', 'Lá (5–6 tuổi)', [], 'La Thị Uyên', 'Doãn Văn Việt'),
    ];
    const A = {}, R = {}, NOTICES = { demo_k1_c4: [{ id: 'n1', dateFrom: today(), reason: 'Bé bị sốt, mẹ cho nghỉ ở nhà', createdBy: 'demo-parent', seen: false }] };
    const NOTES = [{ id: 'dn1', studentId: 'demo_k1_c2', category: 'good_news', mood: 'smiley', text: 'Hôm nay bé Khang giúp cô chia đồ chơi cho các bạn.', read: true, createdMs: Date.now() - 864e5, createdBy: 'demo-teacher' }];
    const STAFF = { demo_k1: [{ uid: 'demo-teacher', name: 'Cô Mai (demo)', role: 'teacher' }, { uid: 'demo-staff', name: 'Cô Lan (demo)', role: 'staff' }], demo_k2: [{ uid: 'demo-teacher', name: 'Cô Mai (demo)', role: 'teacher' }] };
    const PLANS = {};
    const MS = [{ id: 'lang-4-2', childId: 'demo_k1_c1', classId: 'demo_k1', milestone: 'lang-4-2', date: today(), shared: true, recordedAt: nowIso(), recordedBy: 'demo-teacher' }];
    const OBS = [{ id: 'ob0', childId: 'demo_k1_c1', classId: 'demo_k1', area: 'lang', text: 'Bé kể lại câu chuyện Ba chú heo con bằng lời của mình, nhớ đúng thứ tự.', date: today(), shared: true, recordedAt: nowIso(), recordedBy: 'demo-teacher' }];
    const CN = [{ id: 'cn0', classId: 'demo_k1', title: 'Thứ Năm mang áo mưa', body: 'Lớp đi dạo công viên nếu trời không mưa to. Phụ huynh cho con mang áo mưa nhé.', date: today(), authorUid: 'demo-teacher', createdMs: Date.now() - 864e5 }];
    const subs = new Set(), emit = () => subs.forEach(f => f());
    const watch = f => { subs.add(f); f(); return () => subs.delete(f); };
    const later = v => new Promise(r => setTimeout(() => r(v), 150));
    const clone = o => JSON.parse(JSON.stringify(o));
    return {
      ready: () => true, session: () => SESSION, signIn: async () => SESSION, onAuth: f => { f(SESSION); return () => {}; },
      subscribeClasses: cb => watch(() => cb(Object.values(C).map(clone))),
      subscribeChildren: (classId, cb) => watch(() => cb(K.filter(k => k.classId === classId).map(clone))),
      subscribeDay: (children, sub, date, cb) => watch(() => { const src = sub === 'attendance' ? A : R, out = {}; children.forEach(c => { out[c.id] = src[c.id + '|' + date] ? clone(src[c.id + '|' + date]) : (sub === 'attendance' ? null : {}); }); cb(out); }),
      async setAttendance(classId, childId, date, rec) { const r = { ...rec, classId, recordedAt: nowIso(), recordedBy: SESSION.uid, updatedByRole: 'teacher' }; delete r.pending; A[childId + '|' + date] = r; emit(); },
      async setReport(classId, childId, date, fieldId, value, via) { const k = childId + '|' + date; R[k] = R[k] || {}; R[k][fieldId] = { classId, date, fieldId, value, via: via || 'single', recordedAt: nowIso(), recordedBy: SESSION.uid }; emit(); },
      async clearReport(childId, date, fieldId) { const k = childId + '|' + date; if (R[k]) delete R[k][fieldId]; emit(); },
      subscribeNotices: (children, cb) => watch(() => { const out = {}; children.forEach(c => { out[c.id] = (NOTICES[c.id] || []).filter(n => !n.seen).map(clone); }); cb(out); }),
      async markNoticeSeen(childId, noticeId) { (NOTICES[childId] || []).forEach(n => { if (n.id === noticeId) n.seen = true; }); emit(); },
      subscribeNotes: (classId, cb) => watch(() => cb(NOTES.filter(n => K.some(k => k.id === n.studentId && k.classId === classId)).sort((a, b) => b.createdMs - a.createdMs).map(clone))),
      async sendNote(classId, studentIds, category, text) {
        if (category !== 'good_news' && !String(text || '').trim()) throw new Error('This kind of note needs a few words so the parent knows what happened.');
        studentIds.forEach(id => NOTES.push({ id: 'dn' + Math.random().toString(36).slice(2, 8), studentId: id, category, mood: category === 'good_news' ? 'smiley' : 'neutral', text: String(text || '').trim(), read: false, createdMs: Date.now(), createdBy: SESSION.uid }));
        emit(); return later({ sent: studentIds.length });
      },
      async takeBack(classId, noteId) { const i = NOTES.findIndex(n => n.id === noteId && !n.read); if (i >= 0) NOTES.splice(i, 1); emit(); },
      listStaff: classId => later(clone(STAFF[classId] || [])),
      async addStaff(classId, email) { const s = { uid: 'demo-' + Math.random().toString(36).slice(2, 6), name: String(email).split('@')[0], role: 'staff' }; (STAFF[classId] = STAFF[classId] || []).push(s); return later({ ok: true, ...s }); },
      async removeStaff(classId, uid) { STAFF[classId] = (STAFF[classId] || []).filter(s => s.uid !== uid); return later({ ok: true }); },
      subscribeClassNotices: (classId, cb) => watch(() => cb(clone(CN.filter(n => n.classId === classId)).sort((a, b) => b.createdMs - a.createdMs))),
      async postClassNotice(classId, n) { CN.push({ id: 'cn' + Date.now(), classId, title: n.title, body: n.body || '', date: n.date, authorUid: SESSION.uid, createdMs: Date.now() }); emit(); },
      async deleteClassNotice(classId, id) { const i = CN.findIndex(x => x.id === id); if (i >= 0) CN.splice(i, 1); emit(); },
      subscribeObservations: (childId, cb) => watch(() => cb(clone(OBS.filter(o => o.childId === childId)).sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt)))),
      async addObservation(classId, childId, o) { OBS.push({ id: 'ob' + Date.now(), childId, classId, area: o.area, text: o.text, date: o.date, shared: !!o.shared, recordedAt: nowIso(), recordedBy: SESSION.uid }); emit(); },
      async shareObservation(childId, id, shared) { const o = OBS.find(x => x.id === id); if (o) o.shared = !!shared; emit(); },
      subscribeMilestones: (childId, cb) => watch(() => cb(clone(MS.filter(m => m.childId === childId)))),
      async setMilestone(classId, childId, id, m) { const i = MS.findIndex(x => x.childId === childId && x.id === id), row = { id, childId, classId, milestone: id, date: m.date, shared: !!m.shared, recordedAt: nowIso(), recordedBy: SESSION.uid }; if (i >= 0) MS[i] = row; else MS.push(row); emit(); },
      pickupCodes: (children, cb) => watch(() => cb(Object.fromEntries(children.map((c, i) => [c.id, 'DEMO' + String(2300 + i * 7).slice(-4)])))),   // made-up codes: DEMO2300, DEMO2307…
      async removeMilestone(childId, id) { const i = MS.findIndex(x => x.childId === childId && x.id === id); if (i >= 0) MS.splice(i, 1); emit(); },
      async deleteObservation(childId, id) { const i = OBS.findIndex(x => x.id === id); if (i >= 0) OBS.splice(i, 1); emit(); },
      subscribeSchoolInfo: (classId, cb) => watch(() => cb(clone({ menu: { [today()]: [{ meal: 'Sáng', mealEn: 'Breakfast', dishes: ['Phở thịt giá hẹ'] }, { meal: 'Trưa', mealEn: 'Lunch', dishes: ['Cơm trắng', 'Chả cá', 'Canh bắp cải nấu thịt'] }, { meal: 'Xế', mealEn: 'Afternoon', dishes: ['Bánh canh thịt su su'] }] },
      notices: [{ id: 'sn1', title: 'Nghỉ lễ 20/11', body: 'Trường nghỉ cả ngày Ngày Nhà giáo Việt Nam.', date: today() }],
      calendar: [{ id: 'se1', title: 'Ngày Nhà giáo Việt Nam', date: '2026-11-20', time: '' }, { id: 'se2', title: 'Văn nghệ cuối tuần', date: '2026-11-28', time: '15:00' }] }))),
      familyCodes: classId => later(K.filter(k => k.classId === classId).map((k, i) => ({ studentId: k.id, displayName: k.displayName, familyCode: 'DEMO-' + String(1000 + i * 37).slice(-4) }))),
      async setDayPlan(classId, date, plan) { PLANS[classId + '|' + date] = clone(plan); return later({ ok: true }); },
      demo: true,
    };
  }

  const B = demo ? memory() : live();
  return { ...B, demo, today, nowHM, chosen: () => chosen, choose, onChoose, remember };
})();

/* Phone safety (js/kinder-guard.js): the PIN lock, sign out and clear, the 14-day expiry. */
window.KINDER_GUARD_HOST = {
  name: 'TinyTeachersDeck', key: 'ttd', demo: KinderCloud.demo,
  session: () => (KinderCloud.ready() ? KinderCloud.session() : null),
  onAuth: f => (KinderCloud.ready() ? KinderCloud.onAuth(f) : () => {}),
  signOut: () => { if (typeof TDCloud !== 'undefined') TDCloud.signOut(); },
  keys: ['ttd_kinder_class'],
};

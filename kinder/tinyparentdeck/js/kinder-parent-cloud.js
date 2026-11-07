'use strict';
/* TinyParentDeck's data layer for a Kinder child (TinyParentDeck's own file). It loads after js/data.js and js/demo.js
   (ParentDeck's sign-in, family links and demo, shared) and before js/kinder-widgets.js. A parent reaches only their own
   linked children: every path below is one the suite backend v2.23.0 lets a guardian read (../contracts, v1.0.0-draft2).

     students/{id}                                   the child as the school published them
     students/{id}/attendance/{YYYY-MM-DD}           written by the class staff (or corrected by the office)
     students/{id}/reportEntries where date ==       the Daily Report, one entry per field
     students/{id}/absenceNotices                    written here; the class staff mark them seen
     classes/{id}/notesHome where studentId ==       notes from the teacher; opening one calls markNoteRead
     classes/{id}/classNotices, calendarEvents       the class's notices and calendar
     classes/{id}/dayPlans/{YYYY-MM-DD}              the day's plan, for Ask Me About Today
     students/{id}/observations where shared == true the teacher's Development Observations the family may see
     classes/{id}/schoolInfo/current                 the school's menu, notices and calendar, sent by KinderDeck

   In ParentDeck's demo mode (?demo=1) the same calls run against made-up days for the demo children. */
const KinderParentCloud = (() => {
  const demo = typeof PD_DEMO !== 'undefined' && !!PD_DEMO.active;   // js/demo.js declares PD_DEMO with const
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => isoOf(new Date());
  const shift = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
  const ms = v => (v && v.toMillis ? v.toMillis() : typeof v === 'number' ? v : 0);

  function live() {
    const db = () => firebase.firestore(), fn = name => firebase.functions().httpsCallable(name);
    const me = () => (PD.getSession() || {}).uid;
    const ts = () => firebase.firestore.FieldValue.serverTimestamp();
    const docs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
    return {
      subscribeChild: (sid, cb) => db().doc(`students/${sid}`).onSnapshot(d => cb(d.exists ? { id: d.id, ...d.data() } : null), () => cb(null)),
      subscribeDay(sid, date, cb) {
        const out = { att: null, rep: {} }, emit = () => cb({ att: out.att, rep: { ...out.rep } });
        const u1 = db().doc(`students/${sid}/attendance/${date}`).onSnapshot(d => { out.att = d.exists ? d.data() : null; emit(); }, () => emit());
        const u2 = db().collection(`students/${sid}/reportEntries`).where('date', '==', date).onSnapshot(s => { out.rep = {}; s.docs.forEach(d => { out.rep[d.data().fieldId] = d.data(); }); emit(); }, () => emit());
        return () => { u1(); u2(); };
      },
      subscribeAttendance(sid, days, cb) {
        return db().collection(`students/${sid}/attendance`).orderBy(firebase.firestore.FieldPath.documentId(), 'desc').limit(days)
          .onSnapshot(s => cb(docs(s)), () => cb([]));
      },
      subscribeNotes(classId, sid, cb) {
        return db().collection(`classes/${classId}/notesHome`).where('studentId', '==', sid).orderBy('createdAt', 'desc').limit(60)
          .onSnapshot(s => cb(docs(s).map(n => ({ ...n, createdMs: ms(n.createdAt) }))), () => cb([]));
      },
      markRead: (classId, noteId) => fn('markNoteRead')({ classId, noteId }),
      subscribeNotices: (sid, cb) => db().collection(`students/${sid}/absenceNotices`).onSnapshot(s => cb(docs(s).sort((a, b) => b.dateFrom.localeCompare(a.dateFrom))), () => cb([])),
      sendNotice(sid, classId, n) {
        const rec = { classId, dateFrom: n.dateFrom, createdBy: me(), createdAt: ts(), seen: false };
        if (n.dateTo && n.dateTo !== n.dateFrom) rec.dateTo = n.dateTo;
        if (n.reason) rec.reason = n.reason;
        return db().collection(`students/${sid}/absenceNotices`).add(rec);
      },
      withdrawNotice: (sid, id) => db().doc(`students/${sid}/absenceNotices/${id}`).delete(),
      subscribeClassNotices: (classId, cb) => db().collection(`classes/${classId}/classNotices`).orderBy('createdAt', 'desc').limit(30)
        .onSnapshot(s => cb(docs(s)), () => cb([])),
      subscribeEvents: (classId, cb) => db().collection(`classes/${classId}/calendarEvents`).onSnapshot(s => cb(docs(s).filter(e => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10)), () => cb([])),
      subscribeDayPlan: (classId, date, cb) => db().doc(`classes/${classId}/dayPlans/${date}`).onSnapshot(d => cb(d.exists ? d.data() : null), () => cb(null)),
      subscribeGrowth: (sid, cb) => db().collection(`students/${sid}/growth`).onSnapshot(s => cb(docs(s).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 12)), () => cb([])),   // v0.7.0
      subscribePickup: (sid, cb) => db().doc(`students/${sid}/pickup/current`).onSnapshot(d => cb(d.exists ? (d.data().code || '') : ''), () => cb('')),   // v0.7.0: the code KinderDeck made
      subscribePickupList: (sid, cb) => db().doc(`students/${sid}`).onSnapshot(d => cb(d.exists ? (d.data().guardians || []).filter(g => g.authorisedPickup) : []), () => cb([])),
      subscribePhoto: (sid, cb) => db().doc(`students/${sid}`).onSnapshot(d => cb(d.exists ? (d.data().photo || '') : ''), () => cb('')),   // v0.5.0: only when the school sends photos
      subscribeSchoolInfo: (classId, cb) => db().doc(`classes/${classId}/schoolInfo/current`).onSnapshot(d => cb(d.exists ? d.data() : null), () => cb(null)),
      subscribeFees: (sid, cb) => db().collection(`students/${sid}/fees`).onSnapshot(s => cb(docs(s).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 6)), () => cb([])),   // v0.6.0: only when the school shows fees
      subscribeMilestones: (sid, cb) => db().collection(`students/${sid}/milestones`).where('shared', '==', true)   // v0.6.0: the shared ones only
        .onSnapshot(s => cb(docs(s).sort((a, b) => b.date.localeCompare(a.date))), () => cb([])),
      subscribeObservations: (sid, cb) => db().collection(`students/${sid}/observations`).where('shared', '==', true)   // a family may read only the shared ones
        .onSnapshot(s => cb(docs(s).sort((a, b) => b.date.localeCompare(a.date))), () => cb([])),
      subscribeReportsFrom: (sid, from, cb) => db().collection(`students/${sid}/reportEntries`).where('date', '>=', from)
        .onSnapshot(s => cb(docs(s)), () => cb([])),
    };
  }

  /* ---- the demo: made-up days for whichever demo children ParentDeck's demo links ---- */
  function memory() {
    const subs = new Set(), emit = () => subs.forEach(f => f());
    const watch = f => { subs.add(f); f(); return () => subs.delete(f); };
    const clone = o => JSON.parse(JSON.stringify(o));
    const T = today(), H = (h, m) => pad(h) + ':' + pad(m);
    const days = [], att = {}, rep = {}, notes = {}, notices = {};
    for (let i = 0, d = T; days.length < 10 && i < 20; i++, d = shift(T, -i)) { const wd = new Date(d + 'T00:00:00').getDay(); if (wd !== 0 && wd !== 6) days.push(d); }
    const seed = sid => {
      if (att[sid]) return;
      att[sid] = {}; rep[sid] = {}; notices[sid] = [];
      days.forEach((d, i) => { if (i === 0) return; att[sid][d] = i === 4 ? { status: 'absent', absenceReason: 'Ốm' } : { status: i === 2 ? 'late' : 'present', checkInAt: i === 2 ? '08:20' : '07:4' + (i % 6), checkOutAt: '16:1' + (i % 6), collectedBy: i % 2 ? 'Mẹ' : 'Bố', mealCount: 2 }; });
      att[sid][T] = { status: 'present', checkInAt: '07:45', collectedBy: '', mealCount: 1 };
      rep[sid][T] = { mood: { value: 'cheerful', recordedAt: T + 'T09:05:00' }, meals: { value: 'most', recordedAt: T + 'T11:40:00' }, nap: { value: 'well', recordedAt: T + 'T14:05:00' },
        note: { value: 'Hôm nay con tự xúc cơm và giúp bạn cất đồ chơi.', recordedAt: T + 'T15:30:00' } };
      notes[sid] = [{ id: sid + '_n1', category: 'good_news', mood: 'smiley', text: 'Con hát rất to trong giờ sinh hoạt chung, cả lớp vỗ tay!', read: false, createdMs: Date.now() - 2 * 3600e3, signedAs: 'Cô Mai' },
        { id: sid + '_n2', category: 'health_or_accident', mood: 'neutral', text: 'Con bị trầy nhẹ đầu gối khi chơi ngoài trời, cô đã rửa và dán băng.', read: true, createdMs: Date.now() - 3 * 864e5, signedAs: 'Cô Mai' }];
    };
    const classNotices = [{ id: 'cn1', title: 'Thứ Năm mang áo mưa', body: 'Lớp đi dạo công viên nếu trời không mưa to. Phụ huynh cho con mang áo mưa nhé.', date: shift(T, 2) },
      { id: 'cn2', title: 'Họp phụ huynh cuối tháng', body: '', date: shift(T, 9) }];
    const events = [{ id: 'e1', title: 'Dã ngoại ngoài trời', date: shift(T, 3), time: '09:00' }, { id: 'e2', title: 'Văn nghệ cuối tuần', date: shift(T, 9), time: '15:00' }];
    const plan = { song: 'Cả nhà thương nhau', game: 'Mèo đuổi chuột', act: 'Vẽ bông hoa tặng mẹ',
      items: [{ time: '07:00', em: '🏫', text: 'Đón trẻ' }, { time: '08:30', em: '🧑‍🤝‍🧑', text: 'Sinh hoạt chung' }, { time: '09:00', em: '🎨', text: 'Hoạt động học' }, { time: '10:30', em: '🍚', text: 'Ăn trưa' }, { time: '11:30', em: '😴', text: 'Ngủ trưa' }, { time: '16:00', em: '👋', text: 'Trả trẻ' }] };
    const kidOf = sid => (PD.getLinkedChildren().find(k => k.studentId === sid) || {});
    return {
      subscribeChild: (sid, cb) => watch(() => { const k = kidOf(sid); cb({ id: sid, firstName: k.displayName, ageGroup: 'Chồi (4–5 tuổi)', kinder: true }); }),
      subscribeDay: (sid, date, cb) => watch(() => { seed(sid); cb({ att: clone(att[sid][date] || null), rep: clone(rep[sid][date] || {}) }); }),
      subscribeAttendance: (sid, n, cb) => watch(() => { seed(sid); cb(Object.keys(att[sid]).sort().reverse().slice(0, n).map(d => ({ id: d, ...att[sid][d] }))); }),
      subscribeNotes: (classId, sid, cb) => watch(() => { seed(sid); cb(clone(notes[sid])); }),
      async markRead(classId, noteId) { Object.values(notes).forEach(l => l.forEach(n => { if (n.id === noteId) n.read = true; })); emit(); },
      subscribeNotices: (sid, cb) => watch(() => { seed(sid); cb(clone(notices[sid]).sort((a, b) => b.dateFrom.localeCompare(a.dateFrom))); }),
      async sendNotice(sid, classId, n) { seed(sid); notices[sid].push({ id: 'an' + Date.now(), classId, ...n, seen: false }); emit(); setTimeout(() => { const x = notices[sid][notices[sid].length - 1]; if (x) { x.seen = true; emit(); } }, 4000); },
      async withdrawNotice(sid, id) { notices[sid] = notices[sid].filter(n => n.id !== id || n.seen); emit(); },
      subscribeClassNotices: (classId, cb) => watch(() => cb(clone(classNotices))),
      subscribeEvents: (classId, cb) => watch(() => cb(clone(events))),
      subscribeDayPlan: (classId, date, cb) => watch(() => cb(date === T ? clone(plan) : null)),
      subscribeGrowth: (sid, cb) => watch(() => cb([{ id: T, date: T, heightCm: 104.6, weightKg: 17.3 }, { id: shift(T, -61), date: shift(T, -61), heightCm: 102.9, weightKg: 16.8 }, { id: shift(T, -122), date: shift(T, -122), heightCm: 101.2, weightKg: 16.4 }])),
      subscribePickup: (sid, cb) => watch(() => cb('DEMO2300')),   // a made-up code
      subscribePickupList: (sid, cb) => watch(() => cb([{ name: 'Nguyễn Thị Hoa', relationship: 'Mẹ', authorisedPickup: true }, { name: 'Trần Văn Nam', relationship: 'Bố', authorisedPickup: true }, { name: 'Bà ngoại', relationship: 'Bà', authorisedPickup: true }])),
      subscribePhoto: (sid, cb) => watch(() => cb('')),   // the demo children have no photos
      subscribeSchoolInfo: (classId, cb) => watch(() => cb(clone({ menu: { [T]: [{ meal: 'Sáng', mealEn: 'Breakfast', dishes: ['Phở thịt giá hẹ'] }, { meal: 'Trưa', mealEn: 'Lunch', dishes: ['Cơm trắng', 'Chả cá', 'Canh bắp cải nấu thịt'] }, { meal: 'Xế', mealEn: 'Afternoon', dishes: ['Bánh canh thịt su su'] }] },
      notices: [{ id: 'sn1', title: 'Nghỉ lễ 20/11', body: 'Trường nghỉ cả ngày Ngày Nhà giáo Việt Nam.', date: T }],
      calendar: [{ id: 'se1', title: 'Ngày Nhà giáo Việt Nam', date: '2026-11-20', time: '' }, { id: 'se2', title: 'Văn nghệ cuối tuần', date: '2026-11-28', time: '15:00' }] }))),
      subscribeFees: (sid, cb) => watch(() => cb([{ id: T.slice(0, 7), month: T.slice(0, 7), dueDate: T.slice(0, 8) + '10', howToPay: 'Chuyển khoản vào tài khoản của trường (ví dụ), ghi tên bé và lớp.',
        items: [{ label: 'Học phí', amount: 2500000 }, { label: 'Tiền ăn', amount: 800000 }], total: 3300000, paid: 1000000, balance: 2300000, status: 'part' }])),
      subscribeMilestones: (sid, cb) => watch(() => cb([{ id: 'lang-4-2', milestone: 'lang-4-2', date: T, shared: true }, { id: 'soc-4-1', milestone: 'soc-4-1', date: shift(T, -6), shared: true }])),
      subscribeObservations: (sid, cb) => watch(() => cb([{ id: 'o1', area: 'lang', text: 'Con kể lại câu chuyện Ba chú heo con bằng lời của mình, nhớ đúng thứ tự.', date: T, shared: true },
        { id: 'o2', area: 'soc', text: 'Con chủ động mời bạn mới cùng chơi xếp hình.', date: shift(T, -2), shared: true }])),
      subscribeReportsFrom: (sid, from, cb) => watch(() => { seed(sid); const out = []; Object.keys(rep[sid]).filter(d => d >= from).forEach(d => Object.keys(rep[sid][d]).forEach(f => out.push({ date: d, fieldId: f, ...rep[sid][d][f] }))); cb(out); }),
    };
  }

  return { ...(demo ? memory() : live()), demo, today, shift };
})();

/* Phone safety (js/kinder-guard.js): the PIN lock, sign out and clear, the 14-day expiry. Only the layout of the page is
   kept in localStorage; the children's days are in Firestore's cache, which the guard empties. */
window.KINDER_GUARD_HOST = {
  name: 'TinyParentDeck', key: 'tpd', demo: KinderParentCloud.demo,
  session: () => (KinderParentCloud.demo ? { uid: 'demo' } : PD.getSession()),
  onAuth: f => PD.onAuthChanged(f),
  signOut: () => PD.signOut(),
  keys: [],
};

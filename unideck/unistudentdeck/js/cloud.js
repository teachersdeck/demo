'use strict';
/* =========================================================
   StudentDeck ⇄ Firebase — "Cloud Class" sync layer
   ---------------------------------------------------------
   Additive, same as TeachersDeck's js/cloud.js: with no Firebase project
   configured, isConfigured() is false and the Class widget just shows a
   setup message. The existing local/automatic XP engine in app.js
   (awardXP, state.xp) is completely untouched — this is a SEPARATE,
   teacher-awarded "official" points balance that lives in the backend,
   matching the trifecta backend's own "both XP systems run in parallel"
   decision (see its README). Local practice XP is StudentDeck's own thing;
   Class Points is what the teacher gives out from TeachersDeck.

   Auth: students use Firebase Anonymous Auth. The anonymous uid is local
   to one browser, so on first join the backend hands back a stable
   studentId + a one-time-shown PIN; this module stores
   { studentJoinCode, displayName, pin, studentId, classId } in
   localStorage and silently replays resumeStudentSession on every later
   load, so re-opening StudentDeck (even after clearing the anonymous
   session) reclaims the same student record without asking again. Only a
   different browser/device — or clearing that localStorage — needs the
   code+name+PIN re-entered by hand. */
const SDCloud = (() => {
  const CREDS_KEY = 'sd_cloud_creds_v1';
  let auth = null, db = null, functions = null, ready = false;
  let anonUid = null;

  function isConfigured(){
    const c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.apiKey !== 'YOUR_API_KEY');
  }
  function init(){
    if(ready) return true;
    if(!isConfigured() || typeof firebase === 'undefined') return false;
    firebase.initializeApp(window.FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    functions = firebase.functions();
    ready = true;
    return true;
  }

  function loadCreds(){
    try{ return JSON.parse(localStorage.getItem(CREDS_KEY)); }catch(e){ return null; }
  }
  function saveCreds(c){ try{ localStorage.setItem(CREDS_KEY, JSON.stringify(c)); }catch(e){} }
  function clearCreds(){ try{ localStorage.removeItem(CREDS_KEY); }catch(e){} }

  const listeners = new Set(); // fn(status) — status: 'signedOut'|'joining'|'joined'
  let status = 'signedOut';
  let joined = null; // { studentId, classId, displayName }
  function fire(){ listeners.forEach(fn=>{ try{ fn(status, joined); }catch(e){} }); }
  function onStatusChanged(fn){ listeners.add(fn); fn(status, joined); return ()=> listeners.delete(fn); }

  async function ensureAnon(){
    if(!init()) throw new Error('not-configured');
    if(anonUid) return anonUid;
    let user = auth.currentUser;
    if(!user){
      const cred = await auth.signInAnonymously();
      user = cred.user;
    }
    anonUid = user.uid;
    return anonUid;
  }

  async function joinClass(studentJoinCode, displayName){
    status = 'joining'; fire();
    await ensureAnon();
    const res = await functions.httpsCallable('joinClassAsStudent')({ studentJoinCode, displayName });
    await auth.currentUser.getIdToken(true); // pick up the new custom claim before the next read
    const creds = { studentJoinCode, displayName, pin: res.data.pin, studentId: res.data.studentId, classId: res.data.classId };
    if(res.data.familyCode) creds.familyCode = res.data.familyCode;   // backend v2.0.0+
    saveCreds(creds);
    joined = creds; status = 'joined'; fire();
    return creds; // caller should show creds.pin to the student ONCE
  }

  async function resumeClass(studentJoinCode, displayName, pin){
    status = 'joining'; fire();
    await ensureAnon();
    const res = await functions.httpsCallable('resumeStudentSession')({ studentJoinCode, displayName, pin });
    await auth.currentUser.getIdToken(true);
    const prev = loadCreds();
    const creds = { studentJoinCode, displayName, pin, studentId: res.data.studentId, classId: res.data.classId };
    if(prev && prev.studentId === creds.studentId && prev.familyCode) creds.familyCode = prev.familyCode;
    saveCreds(creds);
    joined = creds; status = 'joined'; fire();
    return creds;
  }

  // Called once at startup: silently replay the last join with stored
  // creds so a returning student doesn't have to type anything.
  async function autoResume(){
    if(!init()) return;
    const creds = loadCreds();
    if(!creds){ status = 'signedOut'; fire(); return; }
    try{ await resumeClass(creds.studentJoinCode, creds.displayName, creds.pin); }
    catch(e){
      // v0.11.2: forget the saved login ONLY when the server says the name/PIN or class code is wrong.
      // A lockout (backend v2.0.0 locks a name for 15 min after 8 wrong PINs — possibly someone else's
      // guesses), being offline or a server hiccup must not make this device forget the student.
      const code = String((e && e.code) || '').replace('functions/', '');
      if(code === 'not-found' || code === 'invalid-argument') clearCreds();
      status = 'signedOut'; fire();
    }
  }

  function leaveClass(){
    clearCreds();
    joined = null; status = 'signedOut'; fire();
  }

  function getJoined(){ return joined; }

  // v0.11.2: the student's family code — what their parents type into ParentDeck to link (backend v2.0.0+).
  // New students get it when they join; anyone who joined earlier gets it created on first ask.
  async function getFamilyCode(){
    if(!ready || !joined) throw new Error('Join a class first.');
    if(joined.familyCode) return joined.familyCode;
    const res = await functions.httpsCallable('getFamilyCode')({});
    const code = res && res.data && res.data.familyCode;
    if(!code) throw new Error('No family code came back.');
    joined.familyCode = code;
    const c = loadCreds(); if(c && c.studentId === joined.studentId){ c.familyCode = code; saveCreds(c); }
    return code;
  }
  function getStatus(){ return status; }

  function subscribeStudent(cb){
    if(!ready || !joined) return ()=>{};
    return db.collection('students').doc(joined.studentId).onSnapshot(
      doc=> cb(doc.exists ? { id:doc.id, ...doc.data() } : null),
      ()=> cb(null)
    );
  }
  function subscribeClassMeta(cb){
    if(!ready || !joined) return ()=>{};
    return db.collection('classes').doc(joined.classId).onSnapshot(
      doc=> cb(doc.exists ? { id:doc.id, ...doc.data() } : null),
      ()=> cb(null)
    );
  }
  function subscribeRewards(cb){
    if(!ready || !joined) return ()=>{};
    return db.collection('classes').doc(joined.classId).collection('rewards').onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() })).filter(r=>r.active!==false)),
      ()=> cb([])
    );
  }
  function subscribeCalendar(cb){
    if(!ready || !joined) return ()=>{};
    return db.collection('classes').doc(joined.classId).collection('calendarEvents').onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() })).sort((a,b)=> (a.date+  (a.time||'')).localeCompare(b.date+(b.time||'')))),
      ()=> cb([])
    );
  }
  // Assignments the teacher pushed from TeachersDeck's Assignments widget
  // (mirrored to classes/{id}/homework by TDCloud.syncHomework). Read-only
  // here. onError (optional) gets the Firestore error so the Homework To-Do
  // widget can say WHY nothing is showing (e.g. permission-denied) instead of
  // looking empty; the list callback still receives [] in that case.
  function subscribeHomework(cb, onError){
    if(!ready || !joined) return ()=>{};
    return db.collection('classes').doc(joined.classId).collection('homework').onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() })).sort((a,b)=> (a.dueDate||'9999').localeCompare(b.dueDate||'9999'))),
      err=>{ try{ if(onError) onError(err); }catch(e){} cb([], err); }
    );
  }
  // v0.13.0 (backend v2.6.0): the school's student policy for this class, classes/{classId}/policy/current
  // ({ studentPhotos, studentSharing, studentStore, version }). Scrapdeck obeys it. cb(null) = no policy document
  // (or the backend is older), which Scrapdeck treats as the defaults: photos and sharing allowed, no shop.
  function subscribePolicy(cb){
    if(!ready || !joined){ try{ cb(null); }catch(e){} return ()=>{}; }
    return db.collection('classes').doc(joined.classId).collection('policy').doc('current').onSnapshot(
      d=> cb(d.exists ? d.data() : null),
      ()=> cb(null)
    );
  }
  // v0.14.0 (backend v2.7.0): the page a teacher is sharing from DrawDeck right now,
  // classes/{classId}/sharedBoards/current ({ imageDataUrl, sharedAt, sharedBy }). One page
  // at a time: sharing again replaces it, cb(null) = nothing currently shared (or the
  // backend is older than v2.7.0 — same "cb(null) = off" convention as subscribePolicy above).
  function subscribeSharedBoard(cb){
    if(!ready || !joined){ try{ cb(null); }catch(e){} return ()=>{}; }
    return db.collection('classes').doc(joined.classId).collection('sharedBoards').doc('current').onSnapshot(
      d=> cb(d.exists ? d.data() : null),
      ()=> cb(null)
    );
  }
  // This student's own completion marks, students/{studentId}/homeworkDone/{assignmentId}.
  // Doc id = the assignment's id (same id TeachersDeck uses in classes/{id}/homework), so a
  // check-off is idempotent and ParentDeck can join it to the assignment list by id.
  // cb receives a Map(assignmentId -> { done, doneAt, backfilled, ... }).
  function subscribeHomeworkDone(cb, onError){
    if(!ready || !joined) return ()=>{};
    return db.collection('students').doc(joined.studentId).collection('homeworkDone').onSnapshot(
      snap=>{ const m = new Map(); snap.docs.forEach(d=> m.set(d.id, d.data())); cb(m); },
      err=>{ try{ if(onError) onError(err); }catch(e){} }
    );
  }
  // Write (or clear) this student's completion mark. This is what ParentDeck listens to for its
  // "your child finished ..." notification. `doneAt` is stamped by the server only when marking
  // done; un-ticking flips done back to false and removes doneAt. opts.backfilled marks a mark
  // that is being sent late (ticked before this feature existed, or the first attempt was
  // refused) so ParentDeck records it without announcing it as brand new. Returns true/false.
  async function setHomeworkDone(a, done, opts){
    if(!ready || !joined || !a || !a.id) return false;
    try{
      const FV = firebase.firestore.FieldValue;
      const data = {
        assignmentId: a.id,
        classId: joined.classId,
        title: a.title || '',
        subject: a.subject || '',
        dueDate: a.dueDate || '',
        done: !!done,
        updatedAt: FV.serverTimestamp()
      };
      if(done){ data.doneAt = FV.serverTimestamp(); data.backfilled = !!(opts && opts.backfilled); }
      else { data.doneAt = FV.delete(); data.backfilled = FV.delete(); }
      await db.collection('students').doc(joined.studentId).collection('homeworkDone').doc(a.id).set(data, { merge: true });
      return true;
    }catch(e){ if(window.console) console.warn('[StudentDeck] homeworkDone write failed:', e && (e.code || e.message)); return false; }
  }
  // students/{studentId}/badges/{badgeId} — one doc per XP badge earned (v0.10.0), read by ParentDeck's Badge Display Case.
  // The doc id is the badge id, so a badge exists at most once. The doc carries what the case needs to draw it (name, icon, tier, group, desc)
  // and earnedAt. `old: true` marks a badge awarded silently the first time badges ran on a device that already had history, so ParentDeck
  // shows it without announcing it. Written create-only: an existing doc is left alone (a second device can't change an earn date), which
  // is why this reads first. Returns true once the badge is in the cloud (or already was), false if it couldn't be written (retried later).
  async function pushBadge(b, rec){
    if(!ready || !joined || !b || !b.id) return false;
    const ref = db.collection('students').doc(joined.studentId).collection('badges').doc(b.id);
    try{
      if((await ref.get()).exists) return true;
      const FV = firebase.firestore.FieldValue, when = rec && +rec.t;
      const data = {
        badgeId: b.id, classId: joined.classId, name: String(b.name || '').slice(0, 48), icon: String(b.icon || '').slice(0, 8),
        tier: b.tier | 0, group: String(b.group || ''), desc: String(b.desc || '').slice(0, 140),
        earnedAt: (when && when <= Date.now() + 3e5) ? firebase.firestore.Timestamp.fromMillis(when) : FV.serverTimestamp()
      };
      if(rec && rec.old) data.old = true;
      await ref.set(data);
      return true;
    }catch(e){
      try{ if((await ref.get()).exists) return true; }catch(e2){}      // another device got there first
      if(window.console) console.warn('[StudentDeck] badge write failed:', e && (e.code || e.message));
      return false;
    }
  }
  async function redeemReward(rewardId){
    return (await functions.httpsCallable('redeemReward')({ classId: joined.classId, rewardId })).data;
  }
  async function getRanking(){
    return (await functions.httpsCallable('getClassRanking')({ classId: joined.classId })).data;
  }

  // v0.15.0 (backend v2.8.0): Scrapdeck sharing (M3). shareScrapPage/unshareScrapPage are thin
  // wrappers — scrapdeck.js does the flattening (JPEG + thumbnail) before calling share().
  async function shareScrapPage(data){
    return (await functions.httpsCallable('shareScrapPage')(data)).data;
  }
  async function unshareScrapPage(pageId){
    return (await functions.httpsCallable('unshareScrapPage')({ pageId })).data;
  }
  // The student's own shared pages, for showing a status badge ("waiting for your teacher",
  // "shared with your family", …) per LOCAL scrapbook page — keyed by pageId, not joined to a
  // local page id anywhere server-side, so the widget matches them up itself (see scrapdeck.js).
  function subscribeMyScrapPages(cb){
    if(!ready || !joined){ try{ cb([]); }catch(e){} return ()=>{}; }
    return db.collection('students').doc(joined.studentId).collection('scrapPages').onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() }))),
      ()=> cb([])
    );
  }
  // M3b: approved pages classmates shared "to my class", first names only — empty/no-op until
  // the teacher's scrapGalleryOn switch is on (cb([]) either way; there's no way to tell from
  // here whether it's off or just empty, which is the point — no "ask your teacher" nagging).
  function subscribeScrapGallery(cb){
    if(!ready || !joined){ try{ cb([]); }catch(e){} return ()=>{}; }
    return db.collection('classes').doc(joined.classId).collection('scrapGallery')
      .onSnapshot(snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() }))), ()=> cb([]));
  }

  // v0.17.0 (backend v2.9.0): Board Assignments — DrawDeck pages the teacher pushed to the class
  // (DrawDeck scope step D). subscribeBoardAssignments returns every assignment (open and closed, newest
  // first) — StudentDeck itself decides what "open" means for the UI; subscribeMyBoardAnswers keyed by
  // assignmentId tells it which ones this student has already submitted or been graded on.
  function subscribeBoardAssignments(cb){
    if(!ready || !joined){ try{ cb([]); }catch(e){} return ()=>{}; }
    return db.collection('classes').doc(joined.classId).collection('boardAssignments').onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() })).sort((a,b)=> (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0))),
      ()=> cb([])
    );
  }
  function subscribeMyBoardAnswers(cb){
    if(!ready || !joined){ try{ cb([]); }catch(e){} return ()=>{}; }
    return db.collection('students').doc(joined.studentId).collection('boardAnswers').onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() }))), ()=> cb([])
    );
  }
  async function getBoardAssignmentImage(assignmentId){
    const d = await db.collection('classes').doc(joined.classId).collection('boardAssignmentImages').doc(assignmentId).get();
    return d.exists ? d.data().imageDataUrl : null;
  }
  async function submitBoardAnswer(data){
    return (await functions.httpsCallable('submitBoardAnswer')({ classId: joined.classId, ...data })).data;
  }

  /* Practice sync — pushes the LOCAL XP/stats engine (app.js's state.xp/state.stats, completely
     separate from Class Points above) up to Firestore so ParentDeck's Student Stats and XP can show
     it. Only numbers + a single mood value per day ever leave the device — journal TEXT is never sent.
     app.js owns all the aggregation (what counts as "today", backfill cursor, etc.); this is a thin
     batched writer that also REMEMBERS how the last attempt went (getSyncInfo/onSyncChanged), so the
     Stats & XP widget can say "synced 11:58 PM" or "failed: permission-denied" instead of failing silently.
     Written under students/{studentId} (its `practice` field) and its practiceDaily/* subcollection.
     It first tries the full payload (per-source XP, per-widget time, game scores, recent XP); if the
     server refuses that shape (a rule that schema-validates the docs) it retries with the basic
     shape so the headline numbers still arrive, and records that in the sync info (mode 'basic'). */
  let syncInfo = { at: 0, ok: null, mode: '', error: '' };
  const syncListeners = new Set();
  function getSyncInfo(){ return { ...syncInfo }; }
  function onSyncChanged(fn){ syncListeners.add(fn); return ()=> syncListeners.delete(fn); }
  function setSyncInfo(ok, mode, error){
    syncInfo = { at: Date.now(), ok, mode: mode || '', error: error || '' };
    syncListeners.forEach(fn=>{ try{ fn(getSyncInfo()); }catch(e){} });
    return ok;
  }
  const BASIC_DAY_FIELDS = ['xp','hw','readEntries','readMin','focus','games','idioms','mood'];
  async function pushPracticeStats(payload){
    // payload: { xpTotal, streak, days: { 'YYYY-MM-DD': {xp,hw,readEntries,readMin,focus,games,gamesStarted,idioms,wordsSaved,cardsReviewed,mood,xpBy,timeBy} }, gameScores, recentXp }
    if(!isConfigured()) return setSyncInfo(false, '', 'not-configured');
    if(!ready || !joined) return setSyncInfo(false, '', 'not-joined');
    const FV = firebase.firestore.FieldValue, sRef = db.collection('students').doc(joined.studentId);
    async function attempt(full){
      const batch = db.batch(), practice = { xpTotal: payload.xpTotal, streak: payload.streak, updatedAt: FV.serverTimestamp() };
      if(full){ practice.gameScores = payload.gameScores || {}; practice.recentXp = payload.recentXp || []; }
      batch.set(sRef, { practice }, { merge: true });
      Object.entries(payload.days).forEach(([d, rec]) => {
        let doc = rec;
        if(!full){ doc = {}; BASIC_DAY_FIELDS.forEach(k => { doc[k] = rec[k] === undefined ? null : rec[k]; }); }
        batch.set(sRef.collection('practiceDaily').doc(d), doc, { merge: true });
      });
      await batch.commit();
    }
    try{ await attempt(true); return setSyncInfo(true, 'full', ''); }
    catch(e1){
      const code = (e1 && (e1.code || e1.message)) || 'error';
      if(window.console) console.warn('[StudentDeck] practice sync (full payload) failed:', code);
      if(/permission/i.test(code)){
        try{ await attempt(false); return setSyncInfo(true, 'basic', code); }
        catch(e2){ const c2 = (e2 && (e2.code || e2.message)) || 'error'; if(window.console) console.warn('[StudentDeck] practice sync (basic payload) failed:', c2); return setSyncInfo(false, '', c2); }
      }
      return setSyncInfo(false, '', code);                      // offline / unavailable / etc: caller retries
    }
  }

  return {
    isConfigured, init, onStatusChanged, joinClass, resumeClass, autoResume, leaveClass, getJoined, getStatus,
    subscribeStudent, subscribeClassMeta, subscribeRewards, subscribeCalendar, subscribeHomework, subscribePolicy, subscribeSharedBoard, subscribeHomeworkDone, setHomeworkDone, pushBadge, redeemReward, getRanking, getFamilyCode,
    shareScrapPage, unshareScrapPage, subscribeMyScrapPages, subscribeScrapGallery,
    subscribeBoardAssignments, subscribeMyBoardAnswers, getBoardAssignmentImage, submitBoardAnswer,
    pushPracticeStats, getSyncInfo, onSyncChanged
  };
})();
SDCloud.autoResume();

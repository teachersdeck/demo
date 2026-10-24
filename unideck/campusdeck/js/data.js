/* ============================================================
   AdminDeck data layer (AD)
   ------------------------------------------------------------
   Talks to the same two read-only Cloud Functions as AdminDeck v1
   (adminDeck.js in the suite's backend/, trifecta-firebase-backend v2.0.0):
     adminListClasses  — every class: teacher, student count/list
     adminGetClass     — one class's roster+points, rewards,
                          calendar events and homework/assignments
   Gated by X-Admin-Secret (a separate secret from TeachersDeck
   Pro's ADMIN_SECRET — see README). This file only ever sends GET/
   POST reads; nothing here can write to a class, student, reward,
   event or assignment.

   v0.3.0 adds adminGetSchoolStats (functions/adminSchoolStats.js) for the School Stats widget — see getSchoolStats below.

   v0.6.0 adds adminSchoolActivity (functions/adminDeckWave1.js): ONE call returning pre-aggregated per-class, per-teacher and
   school-wide numbers (homework completion, practice activity, points economy, onboarding funnel, guardian-link coverage, teacher
   engagement) behind the six Wave 1 widgets — see getSchoolActivity below.

   Caching: adminListClasses and each class's adminGetClass are
   fetched once and cached in memory for the session. Several
   widgets need the same data (e.g. every class's homework), so
   `AD.getAllDetails()` loads every class's detail in parallel once
   and every widget reads from that same cache. `AD.refreshAll()`
   clears the cache and re-fetches — wired to a "Refresh" button in
   each widget, since this is a pull/poll model (plain HTTPS Cloud
   Functions), not a realtime Firestore listener.
   ============================================================ */
const AD = (function(){
  const STORAGE_KEYS = { project:'ad_admin_project', region:'ad_admin_region', secret:'ad_admin_secret' };
  const DEFAULTS = { project:'', region:'us-central1', secret:'' };

  function getConfig(){
    try{
      return {
        project: localStorage.getItem(STORAGE_KEYS.project) || DEFAULTS.project,
        region: localStorage.getItem(STORAGE_KEYS.region) || DEFAULTS.region,
        secret: localStorage.getItem(STORAGE_KEYS.secret) || ''
      };
    }catch(e){ return { ...DEFAULTS }; }
  }
  function setConfig(cfg){
    try{
      localStorage.setItem(STORAGE_KEYS.project, cfg.project);
      localStorage.setItem(STORAGE_KEYS.region, cfg.region);
      localStorage.setItem(STORAGE_KEYS.secret, cfg.secret);
    }catch(e){ /* storage unavailable — settings just won't persist */ }
  }
  function isConfigured(){ return !!getConfig().secret; }
  function baseUrl(cfg){ return `https://${cfg.region}-${cfg.project}.cloudfunctions.net`; }

  async function callFn(name, { method = 'GET', body } = {}){
    const cfg = getConfig();
    if(!cfg.secret) throw new Error('Set your admin secret in Settings first.');
    const url = `${baseUrl(cfg)}/${name}`;
    let res;
    try{
      res = await fetch(url, {
        method,
        headers: { 'Content-Type':'application/json', 'X-Admin-Secret': cfg.secret, ...(getSchool() ? { 'X-School-Id': getSchool() } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
    }catch(e){
      throw new Error(`Couldn't reach "${name}". Check the project/region in Settings, and that it's been deployed.`);
    }
    let data;
    // `status` / `notDeployed` let callers tell "this function isn't deployed yet" (404) from a real failure.
    const fail = (msg) => { const err = new Error(msg); err.status = res.status; err.notDeployed = res.status === 404; err.data = data; return err; };   // err.data keeps the body (v0.7.0: the directory returns { errors } on 400 and { duplicates } on 409)
    try{ data = await res.json(); }
    catch(e){ throw fail(`Server returned an unexpected response (HTTP ${res.status}).`); }
    if(!res.ok) throw fail(data.error || `Request failed (HTTP ${res.status}).`);
    return data;
  }

  // ---- cache ----
  let classesPromise = null;     // Promise<[class,...]> from adminListClasses
  let detailCache = {};          // classId -> Promise<{class,roster,rewards,calendarEvents,homework}>
  let allDetailsPromise = null;  // Promise<Map<classId, detail>> once every class's detail has loaded

  function getClasses(force){
    if(force || !classesPromise){
      classesPromise = callFn('adminListClasses').then(d => d.classes || []);
    }
    return classesPromise;
  }
  function getClassDetail(classId, force){
    if(force || !detailCache[classId]){
      detailCache[classId] = callFn('adminGetClass', { method:'POST', body:{ classId } });
    }
    return detailCache[classId];
  }
  // v0.13.0 (backend v2.10.0) — the History tab: one class's own classdeck.* audit entries, newest first.
  let historyCache = {};
  function getClassHistory(classId, force){
    if(force || !historyCache[classId]){
      historyCache[classId] = callFn('adminClassHistory', { method:'POST', body:{ classId } });
    }
    return historyCache[classId];
  }
  async function getAllDetails(force){
    if(force) allDetailsPromise = null;
    if(!allDetailsPromise){
      allDetailsPromise = (async () => {
        const classes = await getClasses(force);
        const pairs = await Promise.all(classes.map(async c => {
          try{ return [c.id, await getClassDetail(c.id, force)]; }
          catch(e){ return [c.id, { error: e.message || String(e) }]; }
        }));
        return new Map(pairs);
      })();
    }
    return allDetailsPromise;
  }
  // School Stats (v0.3.0): one aggregated call (adminGetSchoolStats) — activity per class per day, no student rows.
  // `req` = { days, windows, today }. Cached per request shape; a Refresh (refreshAll) makes the NEXT call bypass the backend's own 5-min cache too.
  let statsCache = {}, forceStatsNext = false;
  function getSchoolStats(req, force){
    const key = JSON.stringify([req.days, req.windows, req.today]);
    if(force || !statsCache[key]){
      const bust = !!(force || forceStatsNext); forceStatsNext = false;
      statsCache[key] = callFn('adminGetSchoolStats', { method:'POST', body:{ days:req.days, windows:req.windows, today:req.today, force:bust } })
        .catch(e => { delete statsCache[key]; throw e; });
    }
    return statsCache[key];
  }
  // Wave 1 (v0.6.0): one aggregated call. Sends the browser's UTC offset so the server decides which calendar day a due date / practice
  // day falls on the way the admin experiences it. A failure is kept for a few seconds only — several widgets open together share this
  // call, so they shouldn't each re-hit a missing endpoint — but the next open / Refresh retries. A function that isn't deployed gets a
  // plain-language message instead of a bare HTTP 404.
  let activityPromise = null;
  function getSchoolActivity(force){
    if(force || !activityPromise){
      const tz = -new Date().getTimezoneOffset();
      const p = callFn('adminSchoolActivity', { method:'POST', body:{ tzOffsetMin: tz } }).catch(e => {
        setTimeout(() => { if(activityPromise === p) activityPromise = null; }, 15000);
        if(e && (e.notDeployed || /Couldn't reach/.test(e.message || ''))){
          const err = new Error('This widget needs the adminSchoolActivity Cloud Function (new in AdminDeck v0.6.0). Deploy it first — see README → Deploy.');
          err.notDeployed = true; throw err;
        }
        throw e;
      });
      activityPromise = p;
    }
    return activityPromise;
  }
  // Same, but resolves to null instead of throwing — for widgets that only use the summary to fill in an extra tile (Snapshot, Teacher
  // Directory) and must keep working exactly as before when the function isn't there.
  function getSchoolActivityOrNull(){ return getSchoolActivity().catch(() => null); }
  /* v0.7.0 — the People Directory (functions/adminDirectory.js). The list is cached for the session; every write drops the cache so the next
     read is fresh. Writes: adminDirectoryUpsert / Import / Archive / Backfill, all audited server-side. A function that isn't deployed gets a
     plain-language message instead of a bare HTTP 404. */
  let dirPromise = null;
  const dirNotDeployed = (e) => {
    if(e && (e.notDeployed || /Couldn't reach/.test(e.message || ''))){
      const err = new Error('The People Directory needs the adminDirectory Cloud Functions (new in AdminDeck v0.7.0). Deploy them first — see README → Deploy.');
      err.notDeployed = true; return err;
    }
    return e;
  };
  function directoryList(force){
    if(force || !dirPromise){
      const p = callFn('adminDirectoryList', { method:'POST', body:{} }).catch(e => { if(dirPromise === p) dirPromise = null; throw dirNotDeployed(e); });
      dirPromise = p;
    }
    return dirPromise;
  }
  function directoryCall(name, body){
    dirPromise = null;
    return callFn(name, { method:'POST', body }).catch(e => { throw dirNotDeployed(e); });
  }
  /* v0.8.0 — SchoolDeck (functions/adminSchoolDeck.js): link / unlink a parent and a student, import a roster, read the activity log. The first two change
     the directory, so they drop the cached list; the activity read does not. A function that isn't deployed gets a plain-language message. */
  const sdNotDeployed = (e) => {
    if(e && (e.notDeployed || /Couldn't reach/.test(e.message || ''))){
      const err = new Error('SchoolDeck needs the adminSchoolDeck Cloud Functions (new in AdminDeck v0.8.0). Deploy them first — see README → Deploy.');
      err.notDeployed = true; return err;
    }
    return e;
  };
  function schoolDeckCall(name, body){
    if(name !== 'adminSchoolDeckActivity') dirPromise = null;
    return callFn(name, { method:'POST', body }).catch(e => { throw sdNotDeployed(e); });
  }
  /* v0.10.0 — ClassDeck (functions/adminClassDeck.js): adminCreateClass, adminAssignTeacher, adminUpdateClass, adminRegenerateJoinCode. They change classes
     (and so the teacher's TeachersDeck, the directory's class list and the aggregates), so every cache that holds a class is dropped. */
  const cdNotDeployed = (e) => {
    if(e && (e.notDeployed || /Couldn't reach/.test(e.message || ''))){
      const err = new Error('ClassDeck needs the adminClassDeck Cloud Functions (backend v2.4.0). Deploy them first — see README → Deploy.');
      err.notDeployed = true; return err;
    }
    return e;
  };
  function classDeckCall(name, body){
    classesPromise = null; detailCache = {}; allDetailsPromise = null; statsCache = {}; activityPromise = null; dirPromise = null; historyCache = {};
    return callFn(name, { method:'POST', body }).catch(e => { throw cdNotDeployed(e); });
  }
  function refreshAll(){
    classesPromise = null;
    detailCache = {};
    allDetailsPromise = null;
    statsCache = {};
    forceStatsNext = true;
    activityPromise = null;
    dirPromise = null;
    historyCache = {};
  }

  /* v0.5.0 — the first WRITE in AdminDeck: push a theme (a built-in preset or a background image) to the TeachersDeck of the given classes
     (classIds: 'all' or a list). Backend: functions/adminTheme.js. Returns { updated, missing, failed }. */
  function pushTheme(classIds, theme){
    return callFn('adminPushTheme', { method:'POST', body:{ classIds, theme } });
  }

  /* v0.9.3 (backend v2.1.0): schools, notes to teachers, AdminDeck Pro.
     A school admin's key already belongs to one school. The platform owner (ADMINDECK_SECRET) picks a school in
     Settings, sent as X-School-Id; with none picked the owner sees every school. */
  const SCHOOL_KEY = 'ad_admin_school';
  function getSchool(){ try{ return localStorage.getItem(SCHOOL_KEY) || ''; }catch(e){ return ''; } }
  function setSchool(id){ try{ if(id) localStorage.setItem(SCHOOL_KEY, id); else localStorage.removeItem(SCHOOL_KEY); }catch(e){} }
  const whoAmI = () => AD.callFn('adminWhoAmI');
  const listSchools = async () => ((await AD.callFn('adminListSchools')) || {}).schools || [];
  const createSchool = (name) => AD.callFn('adminCreateSchool', { method:'POST', body:{ name } });
  const updateSchool = (o) => AD.callFn('adminUpdateSchool', { method:'POST', body:o });
  const backfillSchools = () => AD.callFn('adminBackfillSchools', { method:'POST', body:{} });
  const sendTeacherNote = (o) => AD.callFn('adminSendTeacherNote', { method:'POST', body:o });
  const listTeacherNotes = () => AD.callFn('adminListTeacherNotes');
  const activateLicense = (key) => AD.callFn('adminActivateSchoolLicense', { method:'POST', body:{ key } });
  // v0.12.0 (backend v2.6.0): the school's student policy — { studentPhotos?, studentSharing?, studentStore? }
  const setSchoolPolicy = (o) => AD.callFn('adminSetSchoolPolicy', { method:'POST', body:o });

  return { setSchoolPolicy, getSchool, setSchool, whoAmI, listSchools, createSchool, updateSchool, backfillSchools, sendTeacherNote, listTeacherNotes, activateLicense,
    getConfig, setConfig, isConfigured, callFn, getClasses, getClassDetail, getClassHistory, getAllDetails, getSchoolStats, getSchoolActivity, getSchoolActivityOrNull, directoryList, directoryCall, schoolDeckCall, classDeckCall, pushTheme, refreshAll };
})();

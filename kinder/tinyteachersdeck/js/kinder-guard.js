'use strict';
/* Kinder guard: keeping children's data safe on a personal phone (TinyTeachersDeck scope section 8; the same for
   TinyParentDeck). One file in both apps: TinyTeachersDeck's copy is the one to edit; tools/sync_shared.py copies it to
   tinyparentdeck/js/kinder-guard.js and --check fails if the two differ.

     Offline that lasts   Firestore keeps its data and its queue of unsent writes on the device (IndexedDB), so a mark made
                          offline survives a reload or a closed app. Turned on here by wrapping firebase.initializeApp, so
                          it happens before the shared sign-in code first touches Firestore. Only the person's own classes
                          or children are ever read, so only they are cached.
     Lock                 once signed in, the person sets a 4-digit PIN for this device. The app locks itself after a few
                          minutes without a touch (1, 2, 5 or 10; 5 by default), also while it is in the background, and
                          stays locked across a reload. 5 wrong PINs: a pause that doubles each time; 10: sign out and clear.
     Sign out and clear   signs out, empties Firestore's cache and queue, and forgets the PIN and the app's own keys on
                          this device. "Forgot the PIN" does the same. Nothing is left that names a child.
     Expiry               not opened for 14 days while signed in: signed out and cleared on the next start.
     Adult check          verify() asks for the PIN inside the app (DrawDeck's Kid Mode); wrong tries are not counted.

   The app's own data file describes it before the page has loaded:
     window.KINDER_GUARD_HOST = { name, key, demo, session(), onAuth(fn) -> unsubscribe, signOut(), keys: [localStorage keys] }
   The demo (made-up children) is not locked; ?guard=1 turns the lock on there, to try it. The PIN is kept only as a salted
   hash, in this browser. */
const KinderGuard = (() => {
  const EXPIRE_DAYS = 14, PAUSE_MS = 30000, CHOICES = [1, 2, 5, 10];

  /* ---- offline that lasts: before anyone calls firebase.initializeApp ---- */
  if (typeof firebase !== 'undefined' && firebase.initializeApp && !firebase.__kinderGuard) {
    const init0 = firebase.initializeApp.bind(firebase);
    firebase.initializeApp = function () {
      const app = init0.apply(null, arguments);
      try { app.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) { /* no IndexedDB: memory only */ }
      return app;
    };
    firebase.__kinderGuard = true;
  }

  const vi = () => !/^en/.test(document.documentElement.lang || 'vi');
  const L = (en, v) => (vi() ? v : en);
  let H = null, S = null, locked = false, verifyDone = null, last = Date.now(), overlay = null, entry = '', setupFirst = null, msg = '', btn = null, pop = null;

  const load = () => { try { return JSON.parse(localStorage.getItem(H.key + '_guard')) || {}; } catch (e) { return {}; } };
  const store = () => { try { localStorage.setItem(H.key + '_guard', JSON.stringify(S)); } catch (e) { /* private window */ } };
  const signedIn = () => { try { return !!H.session(); } catch (e) { return false; } };
  const on = () => !!H && (!H.demo || /[?&]guard=1\b/.test(location.search));

  async function hash(pin, salt) {
    const text = salt + ':' + pin;
    if (window.crypto && crypto.subtle) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;   // plain http only
    return 'f' + h.toString(16);
  }
  const newSalt = () => { const a = new Uint8Array(12); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return Array.from(a).map(x => x.toString(16).padStart(2, '0')).join(''); };

  /* ---- sign out and clear ---- */
  async function wipe(reason) {
    try { sessionStorage.setItem('kinder_guard_note', reason || 'signout'); } catch (e) {}
    try { localStorage.removeItem(H.key + '_guard'); (H.keys || []).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    try { H.signOut(); } catch (e) {}
    try { if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) { const db = firebase.firestore(); await db.terminate(); await db.clearPersistence(); } } catch (e) { /* nothing cached */ }
    location.reload();
  }

  /* ---- the lock screen and the PIN set-up ---- */
  const dots = () => `<div class="kg-dots" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i < entry.length ? 'on' : ''}"></i>`).join('')}</div>`;
  const pad = () => `<div class="kg-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? `<button type="button" data-k="${k}" aria-label="${k === '⌫' ? L('Delete', 'Xóa') : k}">${k}</button>` : '<span></span>').join('')}</div>`;
  function show(mode) {   // 'lock' | 'setup' | 'change' | 'verify'
    if (!overlay) {
      overlay = document.createElement('div'); overlay.className = 'kguard'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { const b = e.target.closest('button'); if (b) press(b); });
      document.addEventListener('keydown', e => { if (!overlay || overlay.hidden) return; if (/^\d$/.test(e.key)) { key(e.key); e.preventDefault(); } else if (e.key === 'Backspace') { key('⌫'); e.preventDefault(); } }, true);
    }
    overlay.dataset.mode = mode; overlay.hidden = false; document.documentElement.classList.add('kguard-on'); paint();
  }
  function paint() {
    const mode = overlay.dataset.mode, wait = Math.max(0, (S.until || 0) - Date.now());
    const title = mode === 'verify' ? L('An adult: type the PIN', 'Người lớn: nhập mã PIN') : mode === 'lock' ? L(`${H.name} is locked`, `${H.name} đang khóa`)
      : setupFirst == null ? L('Choose a 4-digit PIN for this phone', 'Đặt mã PIN 4 số cho máy này') : L('Type the PIN again', 'Nhập lại mã PIN');
    const sub = mode === 'verify' ? '' : mode === 'lock' ? L('Type your PIN to open it.', 'Nhập mã PIN để mở.')
      : L('It locks the app when the phone is not in use, so children\'s details stay private.', 'Mã PIN khóa ứng dụng khi không dùng, để thông tin của các bé được giữ kín.');
    overlay.innerHTML = `<div class="kg-card">
      <div class="kg-ic" aria-hidden="true">🔒</div><h2>${title}</h2><p>${sub}</p>${dots()}
      <p class="kg-msg" aria-live="assertive">${wait ? L(`Too many tries. Wait ${Math.ceil(wait / 1000)} s.`, `Nhập sai nhiều lần. Chờ ${Math.ceil(wait / 1000)} giây.`) : msg}</p>
      ${pad()}
      <div class="kg-links">${mode === 'change' || mode === 'verify' ? `<button type="button" data-a="cancel">${L('Cancel', 'Hủy')}</button>` : ''}
        ${mode === 'verify' ? '' : `<button type="button" data-a="out">${mode === 'lock' ? L('Forgot the PIN? Sign out', 'Quên mã PIN? Đăng xuất') : L('Sign out', 'Đăng xuất')}</button>`}</div></div>`;
    if (wait) setTimeout(() => { if (overlay && !overlay.hidden) paint(); }, 1000);
  }
  function press(b) {
    if (b.dataset.k) return key(b.dataset.k);
    if (b.dataset.a === 'cancel') { const m = overlay.dataset.mode; hide(); if (m === 'verify') done(false); return; }
    if (b.dataset.a === 'out' && confirm(L('Sign out and clear this app\'s data on this phone? Anything not sent yet is lost.', 'Đăng xuất và xóa dữ liệu của ứng dụng trên máy này? Những gì chưa gửi sẽ mất.'))) wipe('signout');
  }
  function key(k) {
    if ((S.until || 0) > Date.now()) return;
    if (k === '⌫') entry = entry.slice(0, -1); else if (entry.length < 4) entry += k;
    msg = ''; paint();
    if (entry.length === 4) setTimeout(submit, 120);
  }
  async function submit() {
    const mode = overlay.dataset.mode, pin = entry; entry = '';
    if (mode === 'verify') {   // an adult check inside the app: wrong tries are not counted (a child may tap at it)
      if (await hash(pin, S.salt) === S.pin) { hide(); done(true); } else { msg = L('Wrong PIN.', 'Sai mã PIN.'); paint(); }
      return;
    }
    if (mode === 'lock') {
      if (await hash(pin, S.salt) === S.pin) { S.fails = 0; S.until = 0; S.locked = false; store(); hide(); return; }
      S.fails = (S.fails || 0) + 1;
      if (S.fails >= 10) { wipe('tries'); return; }
      if (S.fails >= 5) S.until = Date.now() + PAUSE_MS * Math.pow(2, S.fails - 5);
      msg = L('Wrong PIN.', 'Sai mã PIN.'); store(); paint(); return;
    }
    if (setupFirst == null) { setupFirst = pin; paint(); return; }
    if (pin !== setupFirst) { setupFirst = null; msg = L('The two PINs were different. Start again.', 'Hai mã PIN khác nhau. Làm lại nhé.'); paint(); return; }
    S.salt = newSalt(); S.pin = await hash(pin, S.salt); S.fails = 0; S.locked = false; setupFirst = null; store(); hide();
  }
  function done(ok) { const f = verifyDone; verifyDone = null; if (f) f(ok); }
  /* An adult check for the app (leaving DrawDeck's Kid Mode): resolves true with the right PIN, false on Cancel, and null
     when no PIN is set here (the app then asks its own way). */
  function verify() {
    if (!H || !S || !S.pin || !on()) return Promise.resolve(null);
    if (isUp()) return Promise.resolve(false);
    return new Promise(res => { verifyDone = res; show('verify'); });
  }
  function hide() { locked = false; if (overlay) overlay.hidden = true; document.documentElement.classList.remove('kguard-on'); entry = ''; msg = ''; setupFirst = null; last = Date.now(); ensureButton(); }
  function lock() { if (!on() || !S.pin || locked) return; locked = true; S.locked = true; store(); closePop(); show('lock'); }
  const isUp = () => !!overlay && !overlay.hidden;

  /* ---- the 🔒 button in the top bar: lock now, lock after, change the PIN, sign out and clear ---- */
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function ensureButton() {
    const want = on() && signedIn() && !!S.pin;
    if (!want) { if (btn) { btn.remove(); btn = null; } return; }
    if (btn && document.body.contains(btn)) return;
    const anchor = document.getElementById('mode-toggle'); if (!anchor || !anchor.parentNode) return;
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'kg-lockbtn'; btn.textContent = '🔒';
    btn.title = L('This phone: lock and sign out', 'Máy này: khóa và đăng xuất'); btn.setAttribute('aria-label', btn.title);
    anchor.parentNode.insertBefore(btn, anchor);
    btn.addEventListener('click', e => { e.stopPropagation(); pop ? closePop() : openPop(); });
  }
  function openPop() {
    pop = document.createElement('div'); pop.className = 'kg-pop'; pop.setAttribute('role', 'menu');
    const after = S.after || 5;
    pop.innerHTML = `<button type="button" data-p="lock">🔒 ${L('Lock now', 'Khóa ngay')}</button>
      <div class="kg-row"><span>${L('Lock after', 'Tự khóa sau')}</span>${CHOICES.map(m => `<button type="button" data-m="${m}" aria-pressed="${m === after}">${m} ${L('min', 'phút')}</button>`).join('')}</div>
      <button type="button" data-p="pin">🔢 ${L('Change the PIN', 'Đổi mã PIN')}</button>
      <button type="button" data-p="out" class="danger">⏏ ${L('Sign out and clear this phone', 'Đăng xuất và xóa dữ liệu trên máy')}</button>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + 'px'; pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
    pop.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.m) { S.after = +b.dataset.m; store(); closePop(); openPop(); return; }
      closePop();
      if (b.dataset.p === 'lock') lock();
      else if (b.dataset.p === 'pin') { setupFirst = null; show('change'); }
      else if (b.dataset.p === 'out' && confirm(L('Sign out and clear this app\'s data on this phone? Anything not sent yet is lost.', 'Đăng xuất và xóa dữ liệu của ứng dụng trên máy này? Những gì chưa gửi sẽ mất.'))) wipe('signout');
    });
  }
  document.addEventListener('click', e => { if (pop && !pop.contains(e.target) && e.target !== btn) closePop(); });

  /* ---- watching: activity, the background, sign-in ---- */
  function check() {
    if (!H) return;
    ensureButton();
    if (!on() || !signedIn()) return;
    if (!S.pin) { if (!isUp()) show('setup'); return; }
    if (!locked && Date.now() - last > (S.after || 5) * 60000) lock();
  }
  let saved = 0;
  function touch() {
    if (isUp()) return;
    last = Date.now();
    if (last - saved > 30000 && H && signedIn()) { saved = last; S.seen = last; store(); }   // for the 14-day expiry
  }
  const CSS = `
    html.kguard-on body > :not(.kguard){ visibility:hidden; }
    .kguard{ position:fixed; inset:0; z-index:2147483000; display:flex; align-items:center; justify-content:center; padding:16px;
      background:var(--bg, #10141c); color:var(--text-hi, #f3f5f9); font-family:inherit; visibility:visible; }
    .kguard[hidden]{ display:none; }
    .kg-card{ width:min(340px, 100%); text-align:center; }
    .kg-card h2{ margin:6px 0 4px; font-size:20px; } .kg-card p{ margin:0 0 10px; opacity:.8; font-size:14px; line-height:1.4; }
    .kg-ic{ font-size:40px; }
    .kg-dots{ display:flex; gap:14px; justify-content:center; margin:14px 0 6px; }
    .kg-dots i{ width:16px; height:16px; border-radius:50%; border:2px solid currentColor; opacity:.6; }
    .kg-dots i.on{ background:currentColor; opacity:1; }
    .kg-msg{ min-height:1.3em; color:#ff8a80; opacity:1 !important; }
    .kg-pad{ display:grid; grid-template-columns:repeat(3, 72px); gap:12px; justify-content:center; margin:6px 0 14px; }
    .kg-pad button{ width:72px; height:72px; border-radius:50%; border:1px solid rgba(127,127,127,.35); background:rgba(127,127,127,.12); color:inherit; font:600 26px/1 inherit; cursor:pointer; }
    .kg-pad button:active{ background:rgba(127,127,127,.3); }
    .kg-links{ display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
    .kg-links button{ background:none; border:0; color:inherit; text-decoration:underline; font:inherit; font-size:14px; padding:10px; min-height:44px; cursor:pointer; opacity:.85; }
    .kg-lockbtn{ background:none; border:0; font-size:18px; width:40px; height:40px; border-radius:10px; cursor:pointer; }
    .kg-lockbtn:hover{ background:rgba(127,127,127,.15); }
    .kg-pop{ position:fixed; z-index:2147482000; min-width:250px; padding:6px; border-radius:12px; background:var(--panel, #1c2230); color:var(--text-hi, #f3f5f9);
      border:1px solid rgba(127,127,127,.3); box-shadow:0 12px 30px rgba(0,0,0,.35); display:flex; flex-direction:column; gap:2px; font-size:14px; }
    .kg-pop > button{ text-align:left; background:none; border:0; color:inherit; font:inherit; padding:10px 12px; border-radius:8px; min-height:44px; cursor:pointer; }
    .kg-pop > button:hover{ background:rgba(127,127,127,.15); } .kg-pop .danger{ color:#ff8a80; }
    .kg-row{ display:flex; align-items:center; gap:4px; padding:6px 12px; flex-wrap:wrap; } .kg-row span{ margin-right:4px; opacity:.8; }
    .kg-row button{ border:1px solid rgba(127,127,127,.35); background:none; color:inherit; border-radius:999px; padding:6px 10px; min-height:36px; font:inherit; cursor:pointer; }
    .kg-row button[aria-pressed="true"]{ background:#f0a23a; border-color:#f0a23a; color:#1b1300; }
    .kg-note{ position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:2147482500; background:#263238; color:#fff; padding:12px 16px;
      border-radius:12px; max-width:min(520px, calc(100% - 32px)); font-size:14px; box-shadow:0 8px 24px rgba(0,0,0,.3); }`;
  function start() {
    H = window.KINDER_GUARD_HOST; if (!H || !H.key) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    S = load();
    try { const n = sessionStorage.getItem('kinder_guard_note'); if (n) { sessionStorage.removeItem('kinder_guard_note'); note(n); } } catch (e) {}
    if (!on()) return;
    if (S.pin && (S.locked || (S.seen && Date.now() - S.seen > (S.after || 5) * 60000))) { locked = true; show('lock'); }   // stays locked across a reload
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, touch, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); else if (signedIn()) { S.seen = last; store(); } });
    const first = () => {
      if (signedIn() && S.seen && Date.now() - S.seen > EXPIRE_DAYS * 86400000) { wipe('expired'); return; }
      if (signedIn()) { S.seen = Date.now(); store(); }
      check();
    };
    try { H.onAuth(() => { first(); }); } catch (e) {}
    setInterval(check, 10000); first();
  }
  function note(n) {
    const t = n === 'expired' ? L('Signed out: the app was not used for 14 days, so its data on this phone was cleared.', 'Đã đăng xuất: ứng dụng không được dùng 14 ngày nên dữ liệu trên máy đã được xóa.')
      : n === 'tries' ? L('Signed out after 10 wrong PINs; this phone\'s data was cleared.', 'Đã đăng xuất vì nhập sai mã PIN 10 lần; dữ liệu trên máy đã được xóa.')
      : L('Signed out. This app\'s data on this phone was cleared.', 'Đã đăng xuất. Dữ liệu của ứng dụng trên máy này đã được xóa.');
    const d = document.createElement('div'); d.className = 'kg-note'; d.setAttribute('role', 'status'); d.textContent = t; document.body.appendChild(d);
    setTimeout(() => d.remove(), 7000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);

  return { lock, wipe, verify, get locked() { return isUp(); } };
})();

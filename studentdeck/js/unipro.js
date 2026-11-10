'use strict';
/* =========================================================
   UniPro — UniStudentDeck Pro: the store and the VietQR payment (backend v2.31.0)
   ---------------------------------------------------------
   University students buy Pro for their own account: 50,000₫ a month or 500,000₫ a year (owner, 10 Nov 2026).
   Only UniStudentDeck loads this file (its own index.html, after app.js). StudentDeck carries it through the shared
   folder but never runs it, and the guard below stops it anywhere that isn't the university edition: the school
   StudentDeck never shows children a price, a buy button or a payment link (PRO-TIERS.md).

   How it works (the same flow as ParentDeck's Account → Pro):
     1. The student signs in with Google (UniCourses, role 'unistudent').
     2. Buy → createOrder { product:'unistudentdeck', cycle, email } with the student's ID token. The server sets the
        price and returns a note token ("US K7Q4M9") and a VietQR image; the order is kept in localStorage.
     3. The owner sees the transfer and marks the order paid in the Key Manager: the backend issues a USPRO key bound
        to this account and sets users/{uid}.pro, which this file watches; Pro switches on with no reload.
   Settings → ⭐ UniStudentDeck Pro shows all of it. A locked Pro widget (when PRO_GATE_ENABLED is on) opens it.
   ========================================================= */
(() => {
  const ED = window.SD_EDITION;
  if (!ED || !ED.uni || !window.UniCourses || typeof ProGate === 'undefined') return;
  const C = window.UniCourses;
  const PRICE = { monthly: 50000, annual: 500000 };   // shown only; the server's payments.js PRICES.unistudentdeck is the price charged
  const ORDER_KEY = 'us_pro_order';
  const T = (en, vi) => (typeof V === 'function' ? V(en, vi) : en);
  const say = (m) => (typeof toast === 'function' ? toast(m) : alert(m));
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vnd = (n) => `${Number(n).toLocaleString('vi-VN')}₫`;
  const fb = () => (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length ? firebase : null);

  let uid = null, email = '', name = '', pro = null, unsub = null, busy = false;

  /* ---------- the saved order ---------- */
  function readOrder() { try { const o = JSON.parse(localStorage.getItem(ORDER_KEY)); return o && uid && o.uid === uid ? o : null; } catch (e) { return null; } }
  function saveOrder(o) { try { if (o) localStorage.setItem(ORDER_KEY, JSON.stringify(o)); else localStorage.removeItem(ORDER_KEY); } catch (e) {} }

  /* ---------- Pro on this account: users/{uid}.pro, written only by the backend ---------- */
  function setPro(p) {
    pro = p || null;
    const on = !!(pro && pro.active);
    try { localStorage.setItem('sd_pro', on ? '1' : '0'); } catch (e) {}
    ProGate.setPro(on);
    render();
  }
  function watch(u) {
    if (u === uid && (u || !pro)) return;
    uid = u; if (unsub) { unsub(); unsub = null; }
    if (!uid) { setPro(null); return; }
    const F = fb(); if (!F) return;
    unsub = F.firestore().collection('users').doc(uid).onSnapshot((d) => {
      const was = !!(pro && pro.active);
      setPro((d.exists && d.data().pro) || null);
      if (!was && pro && pro.active && readOrder()) check();
    }, () => setPro(null));
    setTimeout(check, 3000);
  }
  /* ---------- the order functions (plain HTTP, like ParentDeck's) ---------- */
  async function orderFn(fn, body) {
    const F = fb(), u = F && F.auth().currentUser;
    if (!u) throw Object.assign(new Error('Sign in first.'), { code: 'signed-out' });
    const token = await u.getIdToken();
    const res = await fetch(`https://us-central1-${window.FIREBASE_CONFIG.projectId}.cloudfunctions.net/${fn}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body || {}) });
    let data = {}; try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code, status: res.status });
    return data;
  }
  async function check() {
    const o = readOrder(); if (!o) return;
    try {
      const r = await orderFn('getOrder', { id: o.id, secret: o.secret });
      if (r.status === 'paid') { saveOrder(null); say(o.renew ? T('Thank you! Your Pro is renewed.', 'Cảm ơn bạn! Pro đã được gia hạn.') : T('Thank you! Pro is on for your account.', 'Cảm ơn bạn! Pro đã được bật cho tài khoản của bạn.')); render(); }
      else if (r.status === 'cancelled') { saveOrder(null); render(); }
    } catch (e) { if (e.status === 404) { saveOrder(null); render(); } }
  }
  setInterval(() => { if (readOrder() && isOpen()) check(); }, 20000);

  /* ---------- the Settings section ---------- */
  const STYLE = `
  .us-pro{border:1px solid var(--line,rgba(127,127,127,.3));border-radius:14px;padding:14px;margin:0 0 20px}
  .us-pro h3{margin:0 0 6px;font-size:15px}
  .us-pro p{margin:6px 0}
  .us-pro .us-plans{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
  .us-pro .us-plan{flex:1 1 130px;border:1px solid var(--line,rgba(127,127,127,.3));border-radius:10px;padding:8px 10px;cursor:pointer;display:flex;gap:8px;align-items:flex-start}
  .us-pro .us-plan b{display:block}
  .us-pro .us-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
  .us-pro input[type=email]{flex:1 1 180px;min-width:0;padding:7px 10px;border-radius:8px;border:1px solid var(--line,rgba(127,127,127,.4));background:transparent;color:inherit;font:inherit}
  .us-pro .us-qr{display:block;width:220px;max-width:100%;margin:8px auto;background:#fff;border-radius:10px}
  .us-pro .us-amount{text-align:center;font-size:22px;font-weight:700;margin:4px 0}
  .us-pro .us-token{font:700 18px/1.2 ui-monospace,Consolas,monospace;letter-spacing:1px;padding:4px 10px;border-radius:8px;background:rgba(127,127,127,.15)}
  .us-pro .center{text-align:center;justify-content:center}
  .us-pro .us-on{font-weight:600}
  .us-pro details summary{cursor:pointer;margin-top:8px}
  .us-pro a{color:inherit;text-decoration:underline}`;
  function ensureStyle() { if (document.getElementById('us-pro-style')) return; const s = document.createElement('style'); s.id = 'us-pro-style'; s.textContent = STYLE; document.head.appendChild(s); }
  function box() {
    let el = document.getElementById('us-pro');
    if (el) return el;
    const body = document.querySelector('#settings-drawer .drawer-body'); if (!body) return null;
    ensureStyle();
    el = document.createElement('section'); el.id = 'us-pro'; el.className = 'us-pro';
    body.insertBefore(el, body.firstChild);
    return el;
  }
  const isOpen = () => { const d = document.getElementById('settings-drawer'); return !!(d && !d.hidden); };

  const pitch = () => `<p class="muted">${T('Pro is for your own account and follows you to every device where you sign in. It opens UniStudentDeck’s Pro tools: Translate, Dictionary and Flashcards.',
    'Pro dành cho tài khoản của riêng bạn và đi theo bạn trên mọi thiết bị bạn đăng nhập. Pro mở các công cụ Pro của UniStudentDeck: Dịch, Từ điển và Thẻ ghi nhớ.')}</p>`;
  function buyHtml(renewKey) {
    return `<div class="us-plans">
        <label class="us-plan"><input type="radio" name="us-plan" value="monthly"><span><b>${vnd(PRICE.monthly)}</b>${T('a month', 'mỗi tháng')}</span></label>
        <label class="us-plan"><input type="radio" name="us-plan" value="annual" checked><span><b>${vnd(PRICE.annual)}</b>${T('a year (2 months free)', 'mỗi năm (tặng 2 tháng)')}</span></label>
      </div>
      ${renewKey ? `<p class="muted">${T('This adds time to your key', 'Thêm thời gian cho mã')} ${h(renewKey)}.</p>` : ''}
      <p class="muted">${T('We email your receipt and key here:', 'Chúng tôi gửi biên nhận và mã tới email này:')}</p>
      <div class="us-row"><input type="email" id="us-email" value="${h(email)}" autocomplete="email" placeholder="you@university.edu"><button class="btn primary" id="us-buy" ${busy ? 'disabled' : ''}>${T('Pay by VietQR', 'Thanh toán bằng VietQR')}</button></div>`;
  }
  function orderHtml(o) {
    const b = o.bank || {};
    return `<p class="muted center">${T('Scan with your banking app. Keep the note exactly as it is: it tells us the payment is yours.', 'Quét bằng ứng dụng ngân hàng. Giữ nguyên nội dung chuyển khoản: nhờ đó chúng tôi biết khoản thanh toán là của bạn.')}</p>
      ${o.qrUrl ? `<img class="us-qr" src="${h(o.qrUrl)}" alt="VietQR">` : ''}
      <p class="us-amount">${vnd(o.amount)}</p>
      <p class="muted center">${T('Transfer note', 'Nội dung chuyển khoản')}</p>
      <div class="us-row center"><span class="us-token">${h(o.token)}</span><button class="btn" id="us-copy">${T('Copy', 'Sao chép')}</button></div>
      ${b.account ? `<p class="muted center"><b>${h(b.accountName || '')}</b><br>${h(b.account)} · ${h(b.bankName || '')}</p>` : ''}
      <p class="muted center">${T('Pro switches on here once we see your transfer (usually the same day). You can close this.', 'Pro sẽ bật tại đây khi chúng tôi nhận được chuyển khoản (thường trong ngày). Bạn có thể đóng cửa sổ này.')}</p>
      <p class="muted center"><a href="#" id="us-over">${T('Start over', 'Làm lại')}</a></p>`;
  }
  function render() {
    const el = box(); if (!el) return;
    const head = `<h3>⭐ ${T('UniStudentDeck Pro', 'UniStudentDeck Pro')}</h3>`;
    const prices = `<p class="muted">${vnd(PRICE.monthly)} ${T('a month or', 'mỗi tháng hoặc')} ${vnd(PRICE.annual)} ${T('a year', 'mỗi năm')}.</p>`;
    if (C.demo) { el.innerHTML = head + pitch() + prices + `<p class="muted">${T('The Pro store is off in the demo.', 'Cửa hàng Pro tắt trong bản demo.')}</p>`; return; }
    if (!uid) {
      el.innerHTML = head + pitch() + prices + `<p class="muted">${T('Sign in with your Google account to buy Pro for it.', 'Đăng nhập bằng tài khoản Google để mua Pro cho tài khoản đó.')}</p>
        <div class="us-row"><button class="btn primary" id="us-signin">${T('Sign in with Google', 'Đăng nhập bằng Google')}</button></div>`;
      const b = el.querySelector('#us-signin');
      b.onclick = async () => { b.disabled = true; try { await C.signIn('student'); } catch (e) { say(C.errText(e)); } b.disabled = false; render(); };
      return;
    }
    const order = readOrder(), key = pro && pro.key;
    if (pro && pro.active) {
      el.innerHTML = head + `<p class="us-on">✓ ${T('Pro is on for your account.', 'Pro đang bật cho tài khoản của bạn.')}</p>${key ? `<p class="muted">${T('Key', 'Mã')}: ${h(key)}</p>` : ''}` +
        (order ? orderHtml(order) : `<details><summary>${T('Renew early', 'Gia hạn sớm')}</summary>${buyHtml(key)}</details>`);
    } else {
      el.innerHTML = head + pitch() + (pro && pro.reason === 'expired' ? `<p class="muted">${T('Your Pro has ended. Renew to switch it back on.', 'Pro của bạn đã hết hạn. Gia hạn để bật lại.')}</p>` : '') +
        (order ? orderHtml(order) : buyHtml(key));
    }
    bind(el);
  }
  function bind(el) {
    const buy = el.querySelector('#us-buy'), copy = el.querySelector('#us-copy'), over = el.querySelector('#us-over');
    if (buy) buy.onclick = async () => {
      const mail = el.querySelector('#us-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { say(T('Enter your email: the receipt and key go there.', 'Nhập email của bạn: biên nhận và mã sẽ được gửi tới đó.')); el.querySelector('#us-email').focus(); return; }
      const cycle = (el.querySelector('input[name="us-plan"]:checked') || {}).value === 'monthly' ? 'monthly' : 'annual';
      const body = { product: 'unistudentdeck', cycle, email: mail, name };
      if (pro && pro.key) body.renewKey = pro.key;
      busy = true; buy.disabled = true;
      try {
        const o = await orderFn('createOrder', body);
        saveOrder({ uid, id: o.id, secret: o.secret, token: o.token, amount: o.amount, qrUrl: o.qrUrl, bank: o.bank, renew: !!body.renewKey, at: Date.now() });
      } catch (e) {
        say({ 'payments-off': T('Payments aren’t open yet. Please try again later.', 'Chưa mở thanh toán. Vui lòng thử lại sau.'),
          'too-many-open': T('You already have unpaid orders. Pay one of them, or wait a week for it to expire.', 'Bạn đã có đơn chưa thanh toán. Hãy thanh toán một đơn, hoặc chờ một tuần để đơn hết hạn.'),
          'signed-out': T('Sign in first.', 'Hãy đăng nhập trước.') }[e.code] || T('Couldn’t make the order. Check your connection and try again.', 'Không tạo được đơn. Kiểm tra kết nối rồi thử lại.'));
      }
      busy = false; render();
    };
    if (copy) copy.onclick = () => { const o = readOrder(); if (!o) return; (navigator.clipboard ? navigator.clipboard.writeText(o.token) : Promise.reject()).then(() => say(T('Copied', 'Đã sao chép')), () => say(o.token)); };
    if (over) over.onclick = (e) => { e.preventDefault(); if (!confirm(T('Start over? If you already paid, keep waiting: the order is still being checked.', 'Làm lại? Nếu bạn đã chuyển khoản, hãy chờ thêm: đơn vẫn đang được kiểm tra.'))) return; saveOrder(null); render(); };
  }

  /* ---------- open the store from a locked Pro widget, and keep it fresh ---------- */
  function openStore() {
    if (typeof openSettings === 'function') openSettings(); else { const d = document.getElementById('settings-drawer'); if (d) d.hidden = false; }
    render(); const el = box(); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  ProGate.configure({
    title: T('⭐ A Pro tool', '⭐ Công cụ Pro'),
    text: T(`This one opens with UniStudentDeck Pro: ${vnd(PRICE.monthly)} a month or ${vnd(PRICE.annual)} a year, for your own account.`,
      `Công cụ này mở với UniStudentDeck Pro: ${vnd(PRICE.monthly)} mỗi tháng hoặc ${vnd(PRICE.annual)} mỗi năm, cho tài khoản của riêng bạn.`),
    cta: openStore, ctaLabel: T('Get Pro', 'Mua Pro'),
  });
  const btn = document.getElementById('btn-settings');
  if (btn) btn.addEventListener('click', () => setTimeout(() => { render(); if (readOrder()) check(); }, 0));
  // Last, so everything above exists when UniCourses calls back at once with its current state.
  if (!C.demo) {
    C.onChange((s) => {
      if (s.user && s.role === 'unistudent') { email = s.user.email || ''; name = s.user.name || ''; watch(s.user.uid); }
      else if (s.user) watch(null);   // signed in, but not as a student (a lecturer's account): nothing to sell
      render();
    });
    const F = fb();
    if (F) F.auth().onAuthStateChanged((u) => { if (!u || u.isAnonymous) watch(null); });   // signed out (UniCourses' first "no user" is only "not known yet")
  }
  render();
  window.UniPro = { open: openStore, state: () => ({ uid, pro, order: readOrder() }) };
})();

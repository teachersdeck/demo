/* ParentDeck Shop (v0.28.0, backend v2.32.0) — Item Store scope, step S1.
 *
 * Parents buy small digital items (premium themes, watch faces) once; every child linked to the family gets them in
 * StudentDeck, and so does the other parent. Children never see a price: the buying happens only here.
 *   - The catalog, previews, what the family owns, the children's "I'd like this" wishes and past items orders come
 *     from getStore. Prices are set by the server (store-catalog.js); this file only shows them.
 *   - Paying is the Pro path unchanged: createOrder({ product:'items', skus }) gives a VietQR with a note token
 *     ("IT K7Q4M9"); the owner marks it paid; getOrder (polled while the Shop is open) then says paid.
 *   - Bought packs (themes, faces) come from getMyPacks and are kept on this device (localStorage) so they work offline;
 *     each is checked again with StoreCore.validateStorePack before use. Paid packs are never bundled in the app.
 * Loaded before app.js; uses app.js's t / esc / toast / ui at call time. */
const SHOP_STRINGS = {
  w_shop:            { en: 'Shop', vi: 'Cửa hàng' },
  shop_intro:        { en: 'One-time purchases. Every child you link gets them in StudentDeck: {names}.', vi: 'Mua một lần. Mọi con bạn liên kết đều có trong StudentDeck: {names}.' },
  shop_intro_nokids: { en: 'One-time purchases. Every child you link gets them in StudentDeck.', vi: 'Mua một lần. Mọi con bạn liên kết đều có trong StudentDeck.' },
  shop_signin:       { en: 'Sign in to ParentDeck to see the Shop.', vi: 'Đăng nhập ParentDeck để xem Cửa hàng.' },
  shop_demo:         { en: 'The Shop needs a signed-in parent account; this is demo data.', vi: 'Cửa hàng cần tài khoản phụ huynh đã đăng nhập; đây là dữ liệu mẫu.' },
  shop_loading:      { en: 'Loading the Shop…', vi: 'Đang tải Cửa hàng…' },
  shop_failed:       { en: 'The Shop could not load. Check your connection and try again.', vi: 'Không tải được Cửa hàng. Kiểm tra kết nối rồi thử lại.' },
  shop_retry:        { en: 'Try again', vi: 'Thử lại' },
  shop_owned:        { en: 'Owned', vi: 'Đã có' },
  shop_add:          { en: 'Add to basket', vi: 'Thêm vào giỏ' },
  shop_in_basket:    { en: 'In basket ✓', vi: 'Trong giỏ ✓' },
  shop_g_themes:     { en: 'Premium themes', vi: 'Giao diện cao cấp' },
  shop_g_watch:      { en: 'Watch faces', vi: 'Mặt đồng hồ đeo tay' },
  shop_g_pocket:     { en: 'Pocket watches', vi: 'Đồng hồ bỏ túi' },
  shop_g_wall:       { en: 'Wall clocks', vi: 'Đồng hồ treo tường' },
  shop_g_alarm:      { en: 'Alarm clocks', vi: 'Đồng hồ báo thức' },
  shop_g_desk:       { en: 'Desk clocks', vi: 'Đồng hồ để bàn' },
  new_title:         { en: 'New for you', vi: 'Mới cho bạn' },
  new_try:           { en: 'Try it', vi: 'Dùng thử' },
  new_later:         { en: 'Later', vi: 'Để sau' },
  shop_soon:         { en: 'Coming soon', vi: 'Sắp ra mắt' },
  shop_soon_on:      { en: 'from {date}', vi: 'từ {date}' },
  shop_g_packs:      { en: 'Theme packs', vi: 'Gói giao diện' },
  shop_g_stickers:   { en: 'Scrapdeck stickers', vi: 'Nhãn dán Scrapdeck' },
  shop_g_layouts:    { en: 'Scrapdeck pages', vi: 'Trang mẫu Scrapdeck' },
  shop_g_docks:      { en: 'Docks', vi: 'Dock' },
  shop_g_bundle:     { en: 'Bundle', vi: 'Trọn bộ' },
  dock_title:        { en: 'Dock', vi: 'Dock' },
  dock_standard:     { en: 'Standard', vi: 'Chuẩn' },
  dock_tray:         { en: 'All widgets', vi: 'Tất cả tiện ích' },
  dock_widgets:      { en: 'Widgets', vi: 'Tiện ích' },
  dock_favourites:   { en: 'Favourites', vi: 'Yêu thích' },
  dock_pin:          { en: 'Keep open', vi: 'Giữ mở' },
  dock_unpin:        { en: 'Let it fold', vi: 'Thu gọn' },
  files_title:       { en: 'Your items', vi: 'Mục của bạn' },
  files_browse:      { en: 'Browse… (.tdpack)', vi: 'Chọn tệp… (.tdpack)' },
  files_reset:       { en: 'Reset to default', vi: 'Về mặc định' },
  files_save:        { en: 'Save my items as a file', vi: 'Lưu các mục thành tệp' },
  files_empty:       { en: 'Items you buy, or a .tdpack file, appear here.', vi: 'Mục bạn mua, hoặc tệp .tdpack, sẽ hiện ở đây.' },
  files_hidden:      { en: 'hidden', vi: 'đã ẩn' },
  files_added:       { en: 'Added {n} item(s).', vi: 'Đã thêm {n} mục.' },
  files_other:       { en: ' Some items belong to another family.', vi: ' Một số mục thuộc gia đình khác.' },
  files_unchecked:   { en: ' Some items could not be checked.', vi: ' Một số mục không kiểm tra được.' },
  files_bad:         { en: 'That file is not a TeachersDeck store file.', vi: 'Tệp này không phải tệp cửa hàng TeachersDeck.' },
  files_reset_q:     { en: 'Go back to the default theme and dock, remove every file you loaded and show hidden items again? Items your family bought stay yours.', vi: 'Quay về giao diện và dock mặc định, gỡ mọi tệp đã tải và hiện lại các mục đã ẩn? Các mục gia đình đã mua vẫn là của bạn.' },
  reset_all:         { en: 'Everything', vi: 'Tất cả' },
  files_reset_done:  { en: 'Back to the defaults', vi: 'Đã về mặc định' },
  files_saved:       { en: 'Saved {n} item(s) to a file.', vi: 'Đã lưu {n} mục vào tệp.' },
  files_off:         { en: 'Saving to a file is not switched on yet.', vi: 'Chưa bật lưu thành tệp.' },
  shop_bundle_packs: { en: 'packs in one', vi: 'gói trong một' },
  shop_more:         { en: '+{n} more', vi: '+{n} nữa' },
  shop_basket:       { en: 'Basket', vi: 'Giỏ hàng' },
  shop_basket_empty: { en: 'Your basket is empty.', vi: 'Giỏ hàng đang trống.' },
  shop_total:        { en: 'Total', vi: 'Tổng' },
  shop_min:          { en: 'The smallest order is {n}: add another item.', vi: 'Đơn nhỏ nhất là {n}: hãy thêm một mục nữa.' },
  shop_pay:          { en: 'Pay by VietQR', vi: 'Thanh toán bằng VietQR' },
  shop_pay_hint:     { en: 'One transfer for the whole basket. A receipt comes to this email.', vi: 'Một lần chuyển khoản cho cả giỏ. Biên nhận gửi tới email này.' },
  shop_waiting:      { en: 'Once we match your transfer (usually the same day), the items appear for every child within a minute.', vi: 'Khi chúng tôi đối chiếu chuyển khoản (thường trong ngày), các mục sẽ hiện cho mọi con trong vòng một phút.' },
  shop_paid:         { en: 'Payment received: your items are on the family account.', vi: 'Đã nhận thanh toán: các mục đã có trong tài khoản gia đình.' },
  shop_owned_err:    { en: 'Your family already owns one of these. The Shop has been refreshed.', vi: 'Gia đình bạn đã có một trong các mục này. Cửa hàng đã được làm mới.' },
  shop_wishes:       { en: 'Wishes from your children', vi: 'Điều con mong muốn' },
  shop_wish_row:     { en: '{name} would like {item}', vi: '{name} muốn có {item}' },
  shop_no_wishes:    { en: 'No wishes right now.', vi: 'Hiện chưa có mong muốn nào.' },
  shop_wishes_on:    { en: 'Let my children mark "I\'d like this" (up to 3 items)', vi: 'Cho con đánh dấu "Con muốn có" (tối đa 3 mục)' },
  shop_purchases:    { en: 'Purchases', vi: 'Đã mua' },
  shop_no_purchases: { en: 'No purchases yet.', vi: 'Chưa mua gì.' },
  shop_status_pending:  { en: 'waiting for payment', vi: 'chờ thanh toán' },
  shop_status_paid:     { en: 'paid', vi: 'đã thanh toán' },
  shop_status_cancelled:{ en: 'cancelled', vi: 'đã huỷ' },
  shop_status_refunded: { en: 'refunded', vi: 'đã hoàn tiền' },
  shop_theme_owned:  { en: 'Premium themes', vi: 'Giao diện cao cấp' },
  shop_theme_get:    { en: 'More themes in the Shop →', vi: 'Thêm giao diện trong Cửa hàng →' },
  shop_store_wishes: { en: 'Also wished for in the Shop: {items}', vi: 'Con cũng mong muốn trong Cửa hàng: {items}' },
};

const PD_SHOP = (() => {
  const PACKS_KEY = 'pd_store_packs', ORDER_KEY = 'pd_items_order', FILES_KEY = 'pd_store_files';
  const listeners = new Set();
  let packs = {};            // packId -> validated pack (owned by the family)
  let state = null;          // the last getStore answer
  const basket = new Set();
  try { const raw = JSON.parse(localStorage.getItem(PACKS_KEY)) || {}; Object.values(raw).forEach(p => { const v = StoreCore.validateStorePack(p, { scrap: typeof ScrapCore !== 'undefined' ? ScrapCore : undefined }); if (v.ok) packs[v.pack.id] = v.pack; }); } catch (e) { packs = {}; }
  let meta = { files: [], hidden: [] };   // packs loaded from .tdpack files; packs hidden until Reset
  try { const m = JSON.parse(localStorage.getItem(FILES_KEY)); if (m && Array.isArray(m.files) && Array.isArray(m.hidden)) meta = m; } catch (e) {}
  const savePacks = () => { try { localStorage.setItem(PACKS_KEY, JSON.stringify(packs)); localStorage.setItem(FILES_KEY, JSON.stringify(meta)); } catch (e) {} };
  const notify = () => listeners.forEach(f => { try { f(); } catch (e) {} });
  const signedIn = () => !!(PD.getSession && PD.getSession()) && !!PD.getStore && !(typeof PD_DEMO !== 'undefined' && PD_DEMO.active === true);

  function readOrder() { try { const o = JSON.parse(localStorage.getItem(ORDER_KEY)); const s = PD.getSession(); return o && s && o.uid === s.uid ? o : null; } catch (e) { return null; } }
  function saveOrder(o) { try { o ? localStorage.setItem(ORDER_KEY, JSON.stringify(o)) : localStorage.removeItem(ORDER_KEY); } catch (e) {} }

  /** Fetches the family's packs that are new or changed, and drops packs the family no longer owns (a refund). */
  async function syncPacks() {
    if (!signedIn()) return;
    const have = {}; Object.values(packs).forEach(p => { have[p.id] = p.version; });
    const r = await PD.getMyPacks(have);
    (r.packs || []).forEach(p => { const v = StoreCore.validateStorePack(p, { scrap: typeof ScrapCore !== 'undefined' ? ScrapCore : undefined }); if (v.ok) packs[v.pack.id] = v.pack; });
    const keep = new Set(r.current || []);
    Object.keys(packs).forEach(id => { if (!keep.has(id) && meta.files.indexOf(id) < 0) delete packs[id]; });
    savePacks(); notify();
  }
  function ownedThemes() {
    return Object.values(packs).filter(p => p.kind === 'theme' && meta.hidden.indexOf(p.id) < 0).flatMap(p => p.items.map(item => ({ key: `pk:${p.id}:${item.id}`, pack: p, item })));
  }
  function themeByKey(key) { return ownedThemes().find(x => x.key === key) || null; }
  function ownedDocks() {
    return Object.values(packs).filter(p => p.kind === 'dock' && meta.hidden.indexOf(p.id) < 0).flatMap(p => p.items.map(item => ({ key: `pk:${p.id}:${item.id}`, pack: p, item })));
  }
  function dockByKey(key) { return ownedDocks().find(x => x.key === key) || null; }
  function wishesFor(studentId) {
    const c = state && (state.children || []).find(k => k.id === studentId);
    return c ? c.wishes.map(sku => itemName(sku)).filter(Boolean) : [];
  }
  const itemOf = sku => state && state.catalog.find(i => i.sku === sku);
  const itemName = sku => { const it = itemOf(sku); return it ? (it.name[ui.lang] || it.name.en) : null; };
  const vndS = n => `${Number(n).toLocaleString('vi-VN')}₫`;

  /** The server's pricing rules, repeated only to show a total (the server prices every order itself). */
  function priced() {
    if (!state) return { lines: [], amount: 0 };
    const own = new Set(state.owned);
    const inBundles = new Set([...basket].filter(s => (itemOf(s) || {}).kind === 'bundle').flatMap(s => itemOf(s).includes));
    const lines = [];
    [...basket].forEach(s => {
      const it = itemOf(s); if (!it || (it.kind !== 'bundle' && inBundles.has(s))) return;
      let price = it.price;
      if (it.kind === 'bundle') price = Math.max(0, price - it.includes.filter(x => own.has(x)).reduce((n, x) => n + ((itemOf(x) || {}).price || 0), 0));
      lines.push({ sku: s, name: it.name[ui.lang] || it.name.en, price });
    });
    return { lines, amount: lines.reduce((n, l) => n + l.price, 0) };
  }
  function isOwned(it) { const own = new Set(state.owned); return it.kind === 'bundle' ? it.includes.every(s => own.has(s)) : own.has(it.sku); }

  // ---------- previews ----------
  function themeTiles(items) {
    return `<div class="shop-themes">${items.map(it => { const k = it.tokens;
      return `<div class="shop-tw" style="background:${StoreCore.themeBackground(it, false)};color:${k.ink}"><b style="color:${k.acc}">${esc(it.name[ui.lang] || it.name.en)}</b><i style="background:${k.card};border-color:${k.line}"></i><span style="background:${k.bb};color:${k.bt}">Aa</span></div>`; }).join('')}</div>`;
  }
  function previewHtml(it) {
    const pv = (state.previews || {})[it.sku];
    if (it.kind === 'bundle') return `<div class="shop-stage shop-bundle"><b>${it.includes.length}</b><span>${esc(t('shop_bundle_packs'))}</span></div>`;
    if (!pv) return '<div class="shop-stage"></div>';
    if (pv.kind === 'theme') return `<div class="shop-stage">${themeTiles(pv.items)}</div>`;
    if (pv.kind === 'sticker') return `<div class="shop-stage"><div class="shop-stickers">${pv.items.slice(0, 6).map(x => `<span>${x.svg || ''}</span>`).join('')}</div></div>`;
    if (pv.kind === 'layout') return `<div class="shop-stage"><div class="shop-layouts">${pv.names.map(n => `<span>${esc(n[ui.lang] || n.en)}</span>`).join('')}</div></div>`;
    if (pv.kind === 'dock') { const d = pv.items[0]; return `<div class="shop-stage shop-dark"><div class="shop-dock dk-${esc(d.style)}" style="--dk:${d.swatch}"><i></i><i></i><i></i><i></i><i></i></div></div>`; }
    if (pv.kind === 'face') return `<div class="shop-stage shop-dark"><div class="shop-faces">${pv.items.map((f, i) => `<div class="shop-face" data-face="${esc(it.sku)}:${i}"></div>`).join('')}</div>${pv.count > pv.items.length ? `<span class="shop-more">${esc(t('shop_more', { n: pv.count - pv.items.length }))}</span>` : ''}</div>`;
    return '<div class="shop-stage"></div>';
  }

  // ---------- the widget ----------
  function render(body) {
    let alive = true, faces = [], poll = 0;
    const stopFaces = () => { faces.forEach(f => f.stop()); faces = []; };
    async function load() {
      if (!signedIn()) { body.innerHTML = `<p class="muted">${esc(t(typeof PD_DEMO !== 'undefined' && PD_DEMO.active === true ? 'shop_demo' : 'shop_signin'))}</p>`; return; }
      if (!state) body.innerHTML = `<p class="muted">${esc(t('shop_loading'))}</p>`;
      try { state = await PD.getStore(); } catch (e) {
        if (!alive) return;
        body.innerHTML = `<p class="muted">${esc(t('shop_failed'))}</p><button class="btn" data-shop="retry">${esc(t('shop_retry'))}</button>`; return;
      }
      if (!alive) return;
      [...basket].forEach(s => { const it = itemOf(s); if (!it || isOwned(it)) basket.delete(s); });
      draw();
      syncPacks().catch(() => {});
    }
    function draw() {
      stopFaces();
      const kids = PD.getLinkedChildren ? PD.getLinkedChildren() : [];
      const order = readOrder();
      const { lines, amount } = priced();
      const min = state.minOrder || 20000;
      const s = PD.getSession();
      const card = it => {
        const owned = isOwned(it);
        let price = it.price;
        if (it.kind === 'bundle') price = Math.max(0, it.price - it.includes.filter(x => state.owned.includes(x)).reduce((n, x) => n + ((itemOf(x) || {}).price || 0), 0));
        return `<article class="shop-card">${previewHtml(it)}
          <div class="shop-cbody"><b>${esc(it.name[ui.lang] || it.name.en)}</b><span class="muted">${esc((it.blurb && (it.blurb[ui.lang] || it.blurb.en)) || '')}</span>
          <div class="shop-cfoot"><span class="shop-price">${owned ? '' : esc(vndS(price))}${it.kind === 'bundle' && !owned && price !== it.price ? ` <s>${esc(vndS(it.price))}</s>` : ''}</span>
          ${owned ? `<span class="pill ok">${esc(t('shop_owned'))}</span>` : `<button class="btn${basket.has(it.sku) ? '' : ' primary'}" data-sku="${esc(it.sku)}"${order ? ' disabled' : ''}>${esc(t(basket.has(it.sku) ? 'shop_in_basket' : 'shop_add'))}</button>`}</div></div></article>`;
      };
      // Sections: themes, faces by what they are (watch, pocket, wall, alarm, desk), docks, then the bundle.
      const GROUPS = [['theme', null, 'shop_g_themes'], ['face', 'watch', 'shop_g_watch'], ['face', 'pocket', 'shop_g_pocket'], ['face', 'wall', 'shop_g_wall'],
        ['face', 'alarm', 'shop_g_alarm'], ['face', 'desk', 'shop_g_desk'], ['sticker', null, 'shop_g_stickers'], ['layout', null, 'shop_g_layouts'], ['dock', null, 'shop_g_docks'], ['bundle', null, 'shop_g_bundle']];
      const packsFirst = state.catalog.filter(i => i.kind === 'bundle' && i.themePack);
      const cards = (packsFirst.length ? `<h4 class="shop-group">${esc(t('shop_g_packs'))}</h4><div class="shop-grid">${packsFirst.map(card).join('')}</div>` : '') + GROUPS.map(([kind, form, key]) => {
        const list = state.catalog.filter(i => i.kind === kind && (!form || (i.form || 'watch') === form) && !(i.kind === 'bundle' && i.themePack));
        return list.length ? `<h4 class="shop-group">${esc(t(key))}</h4><div class="shop-grid">${list.map(card).join('')}</div>` : '';
      }).join('');
      const wishes = (state.children || []).flatMap(c => c.wishes.map(sku => ({ c, sku }))).filter(w => itemName(w.sku));
      const st = x => t('shop_status_' + x) || x;
      body.innerHTML = `
        <p class="muted" style="margin-top:0">${esc(kids.length ? t('shop_intro', { names: kids.map(k => k.displayName).join(', ') }) : t('shop_intro_nokids'))}</p>
        ${order ? orderHtml(order) : ''}
        ${cards}
        ${order ? '' : `<div class="pay-box shop-basket"><h4 style="margin:0 0 6px">${esc(t('shop_basket'))}</h4>
          ${lines.length ? lines.map(l => `<div class="srow"><span>${esc(l.name)}</span><b>${esc(vndS(l.price))}</b></div>`).join('') +
            `<div class="srow shop-total"><span>${esc(t('shop_total'))}</span><b>${esc(vndS(amount))}</b></div>` +
            (amount < min ? `<p class="muted">${esc(t('shop_min', { n: vndS(min) }))}</p>` : '') +
            `<div class="row"><input type="email" id="shop-email" value="${esc((s && s.email) || '')}" placeholder="${esc(t('pay_email_ph'))}" autocomplete="email"><button class="btn primary" data-shop="pay"${amount < min ? ' disabled' : ''}>${esc(t('shop_pay'))}</button></div><p class="muted">${esc(t('shop_pay_hint'))}</p>`
            : `<p class="muted">${esc(t('shop_basket_empty'))}</p>`}</div>`}
        ${(state.upcoming || []).length ? `<h4 class="shop-group">${esc(t('shop_soon'))}</h4><div class="shop-soon">${state.upcoming.map(u => `<div class="srow"><span>${esc(u.name[ui.lang] || u.name.en)}</span><span class="muted">${esc(t('shop_soon_on', { date: new Date(u.release).toLocaleDateString(ui.lang === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }) }))}</span></div>`).join('')}</div>` : ''}
        <h4>${esc(t('shop_wishes'))}</h4>
        ${wishes.length ? wishes.map(w => `<div class="srow"><span>♥ ${esc(t('shop_wish_row', { name: w.c.firstName || '', item: itemName(w.sku) }))}</span></div>`).join('') : `<p class="muted">${esc(t('shop_no_wishes'))}</p>`}
        <label class="row" style="gap:8px;align-items:center"><input type="checkbox" data-shop="wishes"${state.settings.wishesOn ? ' checked' : ''}> ${esc(t('shop_wishes_on'))}</label>
        <h4>${esc(t('shop_purchases'))}</h4>
        ${state.orders.length ? state.orders.map(o => `<div class="srow"><span>${esc(fmtShort(o.createdAt))} · ${esc(o.token)} · ${esc((o.lines || []).map(l => l.name).join(', '))} <span class="muted">(${esc(st(o.status))})</span></span><b>${esc(vndS(o.amount))}</b></div>`).join('') : `<p class="muted">${esc(t('shop_no_purchases'))}</p>`}`;
      body.querySelectorAll('[data-face]').forEach(el => {
        const [sku, i] = el.dataset.face.split(':'); const f = state.previews[sku].items[+i];
        faces.push(StoreCore.mountFace(el, f, { lang: ui.lang, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }));
      });
    }
    function orderHtml(o) {   // the Pro order box's look (css .pay-box), with the items and the Shop's own wording
      const b = o.bank || {};
      return `<div class="pay-box">
        <p class="muted center-t">${t('pay_scan')}</p>
        ${o.qrUrl ? `<img class="pay-qr" src="${esc(o.qrUrl)}" alt="VietQR">` : ''}
        <p class="pay-amount">${esc(vndS(o.amount))}</p>
        <p class="muted center-t">${(o.lines || []).map(l => esc(l.name)).join(' · ')}</p>
        <p class="muted center-t">${t('pay_note_label')}</p>
        <div class="row center"><span class="pay-token">${esc(o.token)}</span><button class="btn" id="pay-copy">${t('pay_copy')}</button></div>
        ${b.account ? `<p class="muted center-t"><b>${esc(b.accountName || '')}</b><br>${esc(b.account)} · ${esc(b.bankName || '')}</p>` : ''}
        <p class="muted center-t">${esc(t('shop_waiting'))}</p>
        <p class="muted center-t"><a href="#" id="pay-over">${t('pay_start_over')}</a></p></div>`;
    }
    const fmtShort = ms => new Date(ms).toLocaleDateString(ui.lang === 'vi' ? 'vi-VN' : 'en-GB', { day: 'numeric', month: 'short' });
    async function pay(btn) {
      if (typeof isOfficialBuild === 'function' && !isOfficialBuild()) { toast(t('pay_unofficial')); return; }
      const email = (body.querySelector('#shop-email') || {}).value || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast(t('pay_email_needed')); return; }
      btn.disabled = true;
      try {
        const o = await PD.createItemsOrder({ skus: [...basket], email: email.trim(), name: (PD.getSession() || {}).displayName || '' });
        saveOrder({ uid: PD.getSession().uid, id: o.id, secret: o.secret, token: o.token, amount: o.amount, qrUrl: o.qrUrl, bank: o.bank, lines: o.lines, at: Date.now() });
        basket.clear(); draw();
      } catch (e) {
        if (e.code === 'owned') { toast(t('shop_owned_err')); basket.clear(); load(); return; }
        toast(t({ 'payments-off': 'pay_off', 'too-many-open': 'pay_too_many' }[e.code] || 'pay_failed')); btn.disabled = false;
      }
    }
    async function checkOrder() {
      const o = readOrder(); if (!o) return;
      try {
        const r = await PD.getProOrder(o.id, o.secret);
        if (r.status === 'paid') { saveOrder(null); toast(t('shop_paid'), 3200, 'good'); await syncPacks(); load(); }
        else if (r.status === 'cancelled' || r.status === 'refunded') { saveOrder(null); load(); }
      } catch (e) { if (e.status === 404) { saveOrder(null); load(); } }
    }
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-sku]');
      if (b) { const s = b.dataset.sku; basket.has(s) ? basket.delete(s) : basket.add(s); draw(); return; }
      const a = e.target.closest('[data-shop]'); if (!a) return;
      if (a.dataset.shop === 'retry') load();
      else if (a.dataset.shop === 'pay') pay(a);
    });
    body.addEventListener('change', async e => {
      const c = e.target.closest('[data-shop="wishes"]'); if (!c) return;
      try { await PD.setStoreSettings({ wishesOn: c.checked }); state.settings.wishesOn = c.checked; load(); }
      catch (err) { c.checked = !c.checked; toast(t('shop_failed')); }
    });
    body.addEventListener('click', e => {   // the order box's own buttons (same ids as the Pro order box)
      if (e.target.id === 'pay-copy') { const o = readOrder(); if (o) (navigator.clipboard ? navigator.clipboard.writeText(o.token) : Promise.reject()).then(() => toast(t('pay_copied')), () => toast(o.token)); }
      if (e.target.id === 'pay-over') { e.preventDefault(); if (!confirm(t('pay_start_over_confirm'))) return; saveOrder(null); draw(); }
    });
    load();
    // A Shop restored at start-up opens before sign-in finishes: load again when the account changes.
    let lastUid = (PD.getSession() || {}).uid || null;
    const offAuth = PD.onAuthChanged ? PD.onAuthChanged(sess => { const u = (sess && sess.uid) || null; if (u !== lastUid) { lastUid = u; state = null; load(); } }) : () => {};
    poll = setInterval(() => { if (readOrder()) checkOrder(); }, 20000);
    setTimeout(checkOrder, 1500);
    return () => { alive = false; stopFaces(); clearInterval(poll); offAuth(); };
  }

  // Keep the family's packs fresh: at sign-in, and when Pro changes (tier:'pro' packs follow Pro).
  // The last getStore is also what the Rewards Wishlist reads for the children's Shop wishes.
  async function refreshState() { if (!signedIn()) return; try { state = await PD.getStore(); notify(); } catch (e) {} }
  if (PD.onAuthChanged) PD.onAuthChanged(s => { if (s) setTimeout(() => { syncPacks().catch(() => {}); refreshState(); }, 2500); else { packs = {}; state = null; savePacks(); notify(); } });
  if (PD.onProChanged) PD.onProChanged(() => syncPacks().catch(() => {}));


  /* "New" items: packs that arrived since the person last looked (a purchase, or a file). The first run counts what is
     already here as seen, so nobody gets a pile of "new" on day one. */
  const SEEN_KEY = 'pd_store_seen';
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(SEEN_KEY)); } catch (e) { seen = null; }
  if (!Array.isArray(seen)) { seen = Object.keys(packs); try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) {} }
  function newPacks() { return Object.values(packs).filter(p => seen.indexOf(p.id) < 0 && meta.hidden.indexOf(p.id) < 0); }
  function markSeen(ids) { (ids || Object.keys(packs)).forEach(id => { if (seen.indexOf(id) < 0) seen.push(id); }); try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (e) {} notify(); }

  /* Store files (.tdpack): load one with Browse…, remove an item, reset to the defaults, or save the family's items. */
  async function addFile(file) {
    const s = PD.getSession && PD.getSession();
    const r = await StoreZip.openTdpack(await file.arrayBuffer(), { who: { parentUid: s && s.uid }, scrap: typeof ScrapCore !== 'undefined' ? ScrapCore : undefined });
    if (!r.ok) return r;
    r.packs.forEach(p => { packs[p.id] = p; if (meta.files.indexOf(p.id) < 0) meta.files.push(p.id); meta.hidden = meta.hidden.filter(x => x !== p.id); });
    savePacks(); notify(); return r;
  }
  function removePack(id) {
    if (meta.files.indexOf(id) >= 0) { delete packs[id]; meta.files = meta.files.filter(x => x !== id); }
    else if (meta.hidden.indexOf(id) < 0) meta.hidden.push(id);
    savePacks(); notify();
  }
  function resetAll() { meta.files.forEach(id => { delete packs[id]; }); meta = { files: [], hidden: [] }; savePacks(); notify(); }
  function loaded() {
    return Object.values(packs).map(p => ({ id: p.id, kind: p.kind, name: p.name, swatch: (p.items[0] && p.items[0].swatch) || null,
      fromFile: meta.files.indexOf(p.id) >= 0, hidden: meta.hidden.indexOf(p.id) >= 0 }));
  }
  async function saveFile() {
    const r = await PD.getMyPackFile();
    const bin = atob(r.file), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'application/zip' })); a.download = r.name || 'teachersdeck-items.tdpack';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return r.count;
  }

  const scrapPacks = () => Object.values(packs).filter(p => ['sticker', 'stamp', 'mask', 'layout'].indexOf(p.kind) >= 0 && meta.hidden.indexOf(p.id) < 0);
  return { newPacks, markSeen, scrapPacks, ownedDocks, dockByKey, addFile, removePack, resetAll, loaded, saveFile, render, syncPacks, ownedThemes, themeByKey, wishesFor, onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
})();

/* TEST COPY ONLY (demo site): loads every family store item, signed for the demo family with a throwaway key,
   so the Item Store can be tried before the backend is deployed. Not part of the suite branch. */
(function () {
  var PUB = {"kty":"EC","crv":"P-256","x":"xr0Vi1jF0LVLyf-aOz4ug2veJQvQ_eOV8aww1UNaUZ8","y":"cdcQO0a7hPdRBpjIGMw5TXl4awya19cHbslqS6NvP54"};
  function banner(n) {
    var b = document.createElement('div');
    b.textContent = 'Store test copy: ' + n + ' store items loaded for the demo family (seasonal packs included here only for testing).';
    b.style.cssText = 'position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:9999;background:#7fd4ff;color:#05223f;font:600 12px system-ui,sans-serif;padding:4px 12px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.35);pointer-events:none';
    document.body.appendChild(b); setTimeout(function () { b.remove(); }, 7000);
  }
  async function go() {
    if (typeof StoreZip === 'undefined') return;
    StoreZip.setPublicKey(PUB);
    var store = typeof PD_SHOP !== 'undefined' ? PD_SHOP : null;
    if (!store) return;
    var g = PD.getSession; if (!(g && g())) PD.getSession = function () { return { uid: 'demo-parent' }; };
    try {
      var blob = await (await fetch('store-test.tdpack', { cache: 'no-store' })).blob();
      var r = await store.addFile(new File([blob], 'store-test.tdpack'));
      PD.getSession = g;
      if (r && r.ok) banner(r.packs.length);
    } catch (e) { console.warn('store test copy: could not load the test items', e); }
  }
  if (document.readyState === 'complete') setTimeout(go, 800); else window.addEventListener('load', function () { setTimeout(go, 800); });
})();

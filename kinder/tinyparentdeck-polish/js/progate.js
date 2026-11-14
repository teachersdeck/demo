/* =========================================================
   ProGate — which widgets need Pro, and what a locked one shows.
   Shared by StudentDeck, ParentDeck and AdminDeck: three identical copies,
   kept identical by tools/check_shared.py (edit one, copy to the others).
   TeachersDeck has its own older gate in js/app.js with the same switch.

   THE SWITCH: each app calls ProGate.configure({ enabled: PRO_GATE_ENABLED, … }).
   While enabled is false nothing is ever locked. Add ?progate=1 to the page's
   address to PREVIEW the gate (as a user without Pro) without changing it;
   ?progate=0 forces it off. The Pro lists and the reasons are in PRO-TIERS.md
   at the repository root.
   ========================================================= */
(function (root) {
  'use strict';
  var qs = new URLSearchParams((root.location && root.location.search) || '');
  var G = {
    enabled: false, ids: [], pro: false, title: '⭐ Pro', text: '', cta: null, ctaLabel: '', onChange: null,
    configure: function (o) {
      Object.keys(o || {}).forEach(function (k) { G[k] = o[k]; });
      if (qs.get('progate') === '1') { G.enabled = true; G.preview = true; G.pro = false; }
      if (qs.get('progate') === '0') G.enabled = false;
      return G;
    },
    isProWidget: function (id) { return G.ids.indexOf(id) >= 0; },
    locked: function (id) { return !!(G.enabled && !G.pro && G.ids.indexOf(id) >= 0); },
    setPro: function (v) {
      v = !!v; if (G.preview) return;                  // a preview always shows the locked experience
      if (v === G.pro) return;
      G.pro = v; if (typeof G.onChange === 'function') G.onChange(v);
    },
    render: function (def, body) { return G.locked(def.id) ? G.renderLocked(body, def) : def.render(body); },
    renderLocked: function (body, def) {
      var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
      body.innerHTML = '<div class="pg-lock"><div class="pg-star" aria-hidden="true">⭐</div><b>' + esc(G.title) + '</b><p>' + esc(G.text) + '</p>' +
        (G.cta ? '<button type="button" class="pg-cta">' + esc(G.ctaLabel || 'Get Pro') + '</button>' : '') +
        (G.preview ? '<p class="pg-note">Preview of the Pro gate (?progate=1). It is switched off for everyone else.</p>' : '') + '</div>';
      var b = body.querySelector('.pg-cta'); if (b) b.addEventListener('click', function () { G.cta(def.id); });
      return null;
    }
  };
  root.ProGate = G;
})(window);

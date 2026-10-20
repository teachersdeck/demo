'use strict';
/* ============================================================
   ParentDeck — Badge Display Case (v0.15.0)
   ------------------------------------------------------------
   A full-screen trophy case for the badges a child earns in StudentDeck (the 36 XP badges: bronze, silver, gold, diamond),
   plus the class rewards the child has redeemed. The point is pride: the parent opens it and sees what their child has
   achieved, on shelves, the way you would display medals.

   Where the data comes from:
     - badges   → students/{id}/badges/{badgeId}, written by StudentDeck v0.10.0+ and read here by data.js (subscribeBadges).
                  Each doc carries its own name/icon/tier/group/desc, so this file needs no copy of StudentDeck's catalog.
     - rewards  → the points ledger entries StudentDeck marks as self-redemptions (pointsLog entries with from === 'Redeemed').
                  Nothing new is stored for these.
   A new badge arrives live (PD.onBadgeEarned → a toast, wired in app.js, and a sparkle here while the case is open).

   Guardrails (same spirit as the rest of ParentDeck — a guide, not a grade):
     - Earned badges only. No locked badges, no "next up" bars, no "N of 36", nothing that reads as a score or a comparison.
     - Badge text comes from the child's device, so every string is escaped and length-limited before it is drawn.
     - Read-only: the parent cannot add, remove or edit anything here.

   Loaded BEFORE app.js. Declarations only: the render function looks up app.js's helpers (t, esc, ui, PD, emptyState,
   widgetGate, locale, fmtDate) and tier1.js's T1.listen when it RUNS. app.js merges BADGE_STRINGS into STRINGS and lists the widget.
   ============================================================ */

const BADGE_STRINGS = {
  w_badges:      { en:'Badge Display Case', vi:'Tủ huy hiệu' },
  bc_title:      { en:'{name}’s trophy case', vi:'Tủ huy hiệu của {name}' },
  bc_count:      { en:'{n} earned', vi:'Đã đạt {n}' },
  bc_latest:     { en:'Latest badge', vi:'Huy hiệu mới nhất' },
  bc_view_tier:  { en:'By tier', vi:'Theo hạng' },
  bc_view_cat:   { en:'By category', vi:'Theo nhóm' },
  bc_t1:         { en:'Bronze', vi:'Đồng' },
  bc_t2:         { en:'Silver', vi:'Bạc' },
  bc_t3:         { en:'Gold', vi:'Vàng' },
  bc_t4:         { en:'Diamond', vi:'Kim cương' },
  bc_g_xp:       { en:'Milestones', vi:'Cột mốc' },
  bc_g_level:    { en:'Levels', vi:'Cấp độ' },
  bc_g_streak:   { en:'Streaks', vi:'Chuỗi ngày' },
  bc_g_day:      { en:'Big days', vi:'Ngày xuất sắc' },
  bc_g_mix:      { en:'Variety', vi:'Đa dạng' },
  bc_g_skill:    { en:'Skills', vi:'Kỹ năng' },
  bc_g_habit:    { en:'Habits', vi:'Thói quen' },
  bc_g_other:    { en:'More badges', vi:'Huy hiệu khác' },
  bc_rewards:    { en:'Rewards won', vi:'Phần thưởng đã đổi' },
  bc_redeemed:   { en:'Redeemed {date}', vi:'Đổi ngày {date}' },
  bc_cost:       { en:'{n} pts', vi:'{n} điểm' },
  bc_more:       { en:'…and {n} more redeemed earlier', vi:'…và {n} phần thưởng đã đổi trước đó' },
  bc_no_rewards: { en:'Rewards {name} redeems with class points will be kept here.', vi:'Phần thưởng {name} đổi bằng điểm của lớp sẽ được lưu ở đây.' },
  bc_empty:      { en:'{name} hasn’t earned a badge yet. They will appear here the moment {name} earns one in StudentDeck.', vi:'{name} chưa đạt huy hiệu nào. Huy hiệu sẽ xuất hiện ở đây ngay khi {name} đạt được trong StudentDeck.' },
  bc_earned_on:  { en:'Earned {date}', vi:'Đạt ngày {date}' },
  bc_earned_pre: { en:'Earned before badges began', vi:'Đạt trước khi có huy hiệu' },
  bc_tier_badge: { en:'{tier} badge · {group}', vi:'Huy hiệu {tier} · {group}' },
  bc_new:        { en:'New!', vi:'Mới!' },
  bc_prev:       { en:'Previous badge', vi:'Huy hiệu trước' },
  bc_next:       { en:'Next badge', vi:'Huy hiệu tiếp theo' },
  bc_close:      { en:'Close', vi:'Đóng' },
  bc_note:       { en:'{name} earns badges through everyday practice in StudentDeck. This is a celebration of effort, not a score.', vi:'{name} đạt huy hiệu nhờ luyện tập mỗi ngày trong StudentDeck. Đây là để ăn mừng nỗ lực, không phải điểm số.' },
  fam_badges:    { en:'{n} badges · latest: {name}', vi:'{n} huy hiệu · mới nhất: {name}' },
  toast_badge:   { en:'🏅 {name} earned a badge: {badge}!', vi:'🏅 {name} vừa đạt huy hiệu: {badge}!' }
};

const BC = (() => {
  const GROUPS = ['xp', 'level', 'streak', 'day', 'mix', 'skill', 'habit'];
  const MAX_SHOWN_REWARDS = 12;
  const clip = (v, n) => Array.from(String(v == null ? '' : v)).slice(0, n).join('');
  const fresh = {};                                      // badge id -> ms it was first seen arriving live (drives the "New!" sparkle for ~8s)
  // Everything a badge doc says is the child's device talking, so it is clipped here and escaped where it is drawn.
  const clean = b => ({ ...b, name: clip(b.name, 48), icon: clip(b.icon, 4) || '🏅', desc: clip(b.desc, 140), group: GROUPS.includes(b.group) ? b.group : 'other' });
  const tierName = n => t('bc_t' + n);
  const groupName = g => t('bc_g_' + g);
  const medal = (b, cls) => `<span class="medal t${b.tier} on ${cls || ''}" aria-hidden="true"><span class="mi">${esc(b.icon)}</span></span>`;
  const longDate = ms => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  const earnedLine = b => b.old ? t('bc_earned_pre') : b.t ? t('bc_earned_on', { date: longDate(b.t) }) : '';
  const shortLine = b => b.old ? t('bc_earned_pre') : b.t ? fmtDate(b.t) : '';
  const still = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  // Rewards the child redeemed, newest first. The reward's name is whatever follows "Redeemed:" in the ledger reason.
  const prizes = s => (s.pointsLog || []).filter(p => p.from === 'Redeemed').sort((a, b) => b.t - a.t).map(p => {
    const raw = clip(p.reason || '', 80).replace(/^\s*redeemed\s*[:\-–—]?\s*/i, '').trim();
    const cat = (s.rewards || []).find(r => r.name && raw && r.name.toLowerCase() === raw.toLowerCase());
    return { t: p.t, name: raw || t('pts_redeemed'), cost: Math.abs(p.amount || 0), desc: clip(cat && cat.description, 100) };
  });
  return { GROUPS, MAX_SHOWN_REWARDS, clip, clean, tierName, groupName, medal, earnedLine, shortLine, longDate, still, prizes, fresh };
})();

function renderBadgeCase(body) {
  return widgetGate(body, id => {
    let latest = null, order = [], dlg = null, firstDraw = true, timer = 0;
    const known = new Set();                              // ids already drawn, so a badge that appears later can be flagged as new
    const view = () => (ui.badgeView === 'cat' ? 'cat' : 'tier');
    const ac = T1.listen(body, e => {
      const v = e.target.closest('[data-bcview]');
      if (v) { ui.badgeView = v.dataset.bcview; saveUI(); if (latest) draw(latest); return; }
      const it = e.target.closest('[data-b]');
      if (it) { const i = order.findIndex(b => b.id === it.dataset.b); if (i >= 0) openDetail(i, it); }
    });
    const unsub = PD.subscribeChild(id, s => { if (!s) return; latest = s; draw(s); });

    function shelf(label, count, list, cls) {
      return `<section class="bc-shelf ${cls}"><h3>${esc(label)} <span>${count}</span></h3>
        <div class="bc-row">${list.map(b => `<button type="button" class="bc-item${BC.fresh[b.id] && Date.now() - BC.fresh[b.id] < 8000 ? ' fresh' : ''}" data-b="${esc(b.id)}" aria-label="${esc(b.name)}, ${esc(BC.tierName(b.tier))}">
          ${BC.medal(b)}<b>${esc(b.name)}</b><small>${esc(BC.shortLine(b))}</small>${BC.fresh[b.id] && Date.now() - BC.fresh[b.id] < 8000 ? `<i class="bc-new">${esc(t('bc_new'))}</i>` : ''}</button>`).join('')}</div>
        <div class="bc-ledge" aria-hidden="true"></div></section>`;
    }

    function draw(s) {
      const badges = (s.badges || []).map(BC.clean);
      // flag badges that showed up after the first draw (live arrivals) so they sparkle for a few seconds
      if (!firstDraw) badges.forEach(b => { if (!known.has(b.id) && !b.old) BC.fresh[b.id] = Date.now(); });
      badges.forEach(b => known.add(b.id)); firstDraw = false;

      const byTier = [4, 3, 2, 1].map(n => [n, badges.filter(b => b.tier === n)]).filter(x => x[1].length);
      const byCat = [...BC.GROUPS, 'other'].map(g => [g, badges.filter(b => b.group === g)]).filter(x => x[1].length);
      const shelves = view() === 'tier'
        ? byTier.map(([n, list]) => shelf(BC.tierName(n), list.length, list, 't' + n))
        : byCat.map(([g, list]) => shelf(BC.groupName(g), list.length, list, ''));
      order = view() === 'tier' ? byTier.flatMap(x => x[1]) : byCat.flatMap(x => x[1]);

      const spot = badges[0];                              // newest first (data.js sorts them)
      const prz = BC.prizes(s), shown = prz.slice(0, BC.MAX_SHOWN_REWARDS);
      const chips = [4, 3, 2, 1].map(n => [n, badges.filter(b => b.tier === n).length]).filter(x => x[1]).map(([n, c]) => `<span class="bc-chip t${n}"><i></i>${esc(BC.tierName(n))} ${c}</span>`).join('');

      body.innerHTML = `<div class="bc">
        <header class="bc-hero">
          ${spot ? `<button type="button" class="bc-spot${BC.fresh[spot.id] && Date.now() - BC.fresh[spot.id] < 8000 ? ' fresh' : ''}" data-b="${esc(spot.id)}" aria-label="${esc(spot.name)}">${BC.medal(spot)}</button>` : `<div class="bc-spot empty" aria-hidden="true">🏅</div>`}
          <div class="bc-hero-t">
            <h2>${esc(t('bc_title', { name: s.displayName }))}</h2>
            ${spot ? `<p class="bc-count"><b>${esc(t('bc_count', { n: badges.length }))}</b></p><div class="bc-chips">${chips}</div>
              <p class="muted bc-last">${esc(t('bc_latest'))}: <b>${esc(spot.name)}</b>${BC.earnedLine(spot) ? ' · ' + esc(BC.earnedLine(spot)) : ''}</p>` : ''}
          </div>
        </header>
        ${badges.length ? `<div class="bc-bar" role="group">
          <button type="button" class="chip${view() === 'tier' ? ' on' : ''}" data-bcview="tier" aria-pressed="${view() === 'tier'}">${esc(t('bc_view_tier'))}</button>
          <button type="button" class="chip${view() === 'cat' ? ' on' : ''}" data-bcview="cat" aria-pressed="${view() === 'cat'}">${esc(t('bc_view_cat'))}</button></div>
          <div class="bc-cabinet">${shelves.join('')}</div>` : `<div class="bc-cabinet bc-bare"><p class="bc-empty">${esc(t('bc_empty', { name: s.displayName }))}</p></div>`}
        <section class="bc-prizes"><h3>${esc(t('bc_rewards'))} ${prz.length ? `<span>${prz.length}</span>` : ''}</h3>
          ${shown.length ? `<div class="bc-prow">${shown.map(p => `<div class="bc-prize"><span class="bc-gift" aria-hidden="true">🎁</span><b>${esc(p.name)}</b>
            <small>${esc(t('bc_redeemed', { date: fmtDate(p.t) }))}${p.cost ? ' · ' + esc(t('bc_cost', { n: p.cost })) : ''}</small>${p.desc ? `<small class="bc-pdesc">${esc(p.desc)}</small>` : ''}</div>`).join('')}</div>
            ${prz.length > shown.length ? `<p class="muted">${esc(t('bc_more', { n: prz.length - shown.length }))}</p>` : ''}`
            : `<p class="muted">${esc(t('bc_no_rewards', { name: s.displayName }))}</p>`}
        </section>
        <p class="muted bc-foot">${esc(t('bc_note', { name: s.displayName }))}</p></div>`;
      clearTimeout(timer);                                  // once the 8s "New!" window ends, redraw once so the sparkle clears
      const live = Object.values(BC.fresh).filter(ms => Date.now() - ms < 8000);
      if (live.length) timer = setTimeout(() => { if (latest) draw(latest); }, 8100 - (Date.now() - Math.min(...live)));
      if (dlg) { const cur = order.findIndex(b => b.id === dlg.dataset.id); if (cur < 0) closeDetail(); }
    }

    function closeDetail() {
      if (!dlg) return;
      const d = dlg, back = d._back; dlg = null;
      document.removeEventListener('keydown', onKey, true);
      d.remove(); if (back && back.isConnected) back.focus({ preventScroll: true });
    }
    function onKey(e) {
      if (!dlg) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDetail(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    }
    function step(d) { if (!dlg || !order.length) return; const i = order.findIndex(b => b.id === dlg.dataset.id); openDetail((i + d + order.length) % order.length); }
    function openDetail(i, from) {
      const b = order[i]; if (!b) return;
      const back = from || (dlg && dlg._back);
      if (dlg) { dlg.remove(); dlg = null; } else document.addEventListener('keydown', onKey, true);
      const d = document.createElement('div'); d.className = 'bc-back'; d.dataset.id = b.id; d._back = back;
      d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', b.name);
      d.innerHTML = `<div class="bc-card"><button type="button" class="bc-x" data-d="close" aria-label="${esc(t('bc_close'))}">×</button>
        <div class="bc-bigmedal">${BC.medal(b)}</div>
        <small class="bc-tier t${b.tier}">${esc(t('bc_tier_badge', { tier: BC.tierName(b.tier), group: BC.groupName(b.group) }))}</small>
        <h3>${esc(b.name)}</h3>${b.desc ? `<p>${esc(b.desc)}</p>` : ''}
        ${BC.earnedLine(b) ? `<em>${esc(BC.earnedLine(b))}</em>` : ''}
        <div class="row center bc-nav">${order.length > 1 ? `<button type="button" class="btn" data-d="prev" aria-label="${esc(t('bc_prev'))}">‹</button>` : ''}<button type="button" class="btn primary" data-d="close">${esc(t('bc_close'))}</button>${order.length > 1 ? `<button type="button" class="btn" data-d="next" aria-label="${esc(t('bc_next'))}">›</button>` : ''}</div></div>`;
      d.addEventListener('click', e => {
        const a = e.target.closest('[data-d]'); const k = a && a.dataset.d;
        if (e.target === d || k === 'close') closeDetail(); else if (k === 'prev') step(-1); else if (k === 'next') step(1);
      });
      document.body.appendChild(d); dlg = d;
      d.querySelector('.btn.primary').focus({ preventScroll: true });
    }
    return () => { clearTimeout(timer); ac.abort(); unsub(); closeDetail(); };
  });
}

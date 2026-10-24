/* ============================================================
   KeepDeck's scrap/school-card renderer (js/keepdeck-render.js) — draws a 1600x1000 PNG from data
   `PD.subscribeChild` already holds (no new Firestore reads), exactly as the KeepDeck scope doc's own
   table specifies: first name only, no class ranking, no other children, the suite's usual watermark ref
   bottom-right. Not shared with StudentDeck/TeachersDeck — purely ParentDeck/KeepDeck presentation.

   `KeepDeckRender.save(type, childId, snapshot, opts)` is the one entry point the five source widgets call
   (js/badges.js, js/app.js, js/tier1.js — the Save to scrapbook / Snapshot to KeepDeck buttons): it draws,
   then hands the PNG blob to KeepDeckScrap.saveScrap() (js/keepdeck-scrap.js), which places it on the
   child's current month page whether or not the Scrapbook tab happens to be open.
   ============================================================ */
Object.assign(KD_STRINGS, {
  kd_snapshot: { en: '📌 Snapshot to KeepDeck', vi: '📌 Lưu vào KeepDeck' },
  kd_snapshot_fail: { en: 'Could not save to KeepDeck', vi: 'Không thể lưu vào KeepDeck' },
  kd_card_badges_earned: { en: 'Badges earned', vi: 'Huy hiệu đã đạt' },
  kd_card_points_total: { en: 'Points', vi: 'Điểm' },
  kd_card_redeemed: { en: 'Redeemed', vi: 'Đã đổi' },
  kd_card_wishlist_goal: { en: 'Saving up for', vi: 'Đang để dành cho' },
  kd_card_homework: { en: 'Homework done', vi: 'Bài tập đã làm' },
  kd_card_reading: { en: 'Reading minutes', vi: 'Phút đọc sách' },
  kd_card_streak: { en: 'Day streak', vi: 'Chuỗi ngày' },
  kd_card_level: { en: 'Level', vi: 'Cấp độ' },
  kd_card_class: { en: 'Class', vi: 'Lớp' },
  kd_card_from: { en: 'From', vi: 'Từ' },
});

const KeepDeckRender = (function () {
  const W = 1600, H = 1000;
  function ctx2d() { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; }
  function firstName(s) { return (s.displayName || '').split(' ')[0] || s.displayName || ''; }
  function fmtDate(ms) { try { return new Date(ms || Date.now()).toLocaleDateString(ui.lang === 'vi' ? 'vi-VN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return ''; } }
  function bg(cx, c1, c2) { const g = cx.createLinearGradient(0, 0, W, H); g.addColorStop(0, c1); g.addColorStop(1, c2); cx.fillStyle = g; cx.fillRect(0, 0, W, H); }
  function card(cx, x, y, w, h, radius) {
    radius = radius || 28; cx.fillStyle = 'rgba(255,255,255,.94)';
    cx.beginPath(); cx.moveTo(x + radius, y);
    cx.arcTo(x + w, y, x + w, y + h, radius); cx.arcTo(x + w, y + h, x, y + h, radius);
    cx.arcTo(x, y + h, x, y, radius); cx.arcTo(x, y, x + w, y, radius); cx.closePath(); cx.fill();
  }
  function header(cx, title, subtitle) {
    cx.fillStyle = '#20264a'; cx.font = '700 64px system-ui,sans-serif'; cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    cx.fillText(title, 64, 110);
    cx.fillStyle = '#51577c'; cx.font = '400 34px system-ui,sans-serif'; cx.fillText(subtitle, 64, 158);
  }
  function footer(cx, dateMs) {
    cx.fillStyle = '#7b81a6'; cx.font = '400 26px system-ui,sans-serif'; cx.textAlign = 'right'; cx.fillText(fmtDate(dateMs), W - 50, H - 36);
    if (typeof Watermark !== 'undefined') { cx.font = '11px system-ui,sans-serif'; cx.fillStyle = 'rgba(0,0,0,.28)'; cx.fillText(Watermark.ref(), W - 50, H - 10); }
  }
  function wrapLines(cx, text, maxW) {
    const words = String(text || '').split(/\s+/), lines = []; let line = '';
    words.forEach(w => { const t2 = line ? line + ' ' + w : w; if (cx.measureText(t2).width > maxW && line) { lines.push(line); line = w; } else line = t2; });
    if (line) lines.push(line); return lines;
  }

  function drawBadge(cx, s, badge) {
    bg(cx, '#ffd36b', '#ff9f6b'); header(cx, t('kd_card_badges_earned'), firstName(s));
    card(cx, 260, 220, 1080, 620);
    cx.textAlign = 'center'; cx.font = '220px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; cx.fillText(badge.icon || '🏅', W / 2, 560);
    cx.fillStyle = '#20264a'; cx.font = '700 54px system-ui,sans-serif'; cx.fillText(badge.name || '', W / 2, 680);
    cx.font = '400 30px system-ui,sans-serif'; cx.fillStyle = '#51577c'; cx.fillText(badge.desc || '', W / 2, 730);
    footer(cx, badge.t);
  }
  function drawBadgeSet(cx, s, badges) {
    bg(cx, '#ffd36b', '#ff9f6b'); header(cx, t('kd_card_badges_earned'), firstName(s) + ' — ' + badges.length);
    const cols = 6, cell = 190, pad = 24, x0 = (W - (cols * cell + (cols - 1) * pad)) / 2, y0 = 220;
    badges.slice(0, 24).forEach((b, i) => {
      const col = i % cols, row = Math.floor(i / cols), x = x0 + col * (cell + pad), y = y0 + row * (cell + pad + 40);
      card(cx, x, y, cell, cell, 20);
      cx.textAlign = 'center'; cx.font = '90px "Apple Color Emoji","Segoe UI Emoji",sans-serif'; cx.fillText(b.icon || '🏅', x + cell / 2, y + cell / 2 + 30);
      cx.fillStyle = '#20264a'; cx.font = '600 22px system-ui,sans-serif'; wrapLines(cx, b.name || '', cell).slice(0, 1).forEach((l, li) => cx.fillText(l, x + cell / 2, y + cell + 30 + li * 24));
    });
    footer(cx, Date.now());
  }
  function drawRewardsSummary(cx, s, data) {
    bg(cx, '#8bd3c7', '#5aa9e6'); header(cx, t('kd_card_points_total'), firstName(s));
    card(cx, 100, 210, 680, 220);
    cx.textAlign = 'left'; cx.fillStyle = '#20264a'; cx.font = '700 140px system-ui,sans-serif'; cx.fillText(String(data.points || 0), 140, 370);
    card(cx, 820, 210, 680, 220);
    const redeemed = (data.pointsLog || []).filter(p => p.from === 'Redeemed');
    cx.font = '700 44px system-ui,sans-serif'; cx.fillText(String(redeemed.length), 860, 320);
    cx.font = '400 28px system-ui,sans-serif'; cx.fillStyle = '#51577c'; cx.fillText(t('kd_card_redeemed'), 860, 370);
    if (data.wishGoal) {
      card(cx, 100, 460, 1400, 240);
      cx.fillStyle = '#51577c'; cx.font = '400 30px system-ui,sans-serif'; cx.fillText(t('kd_card_wishlist_goal'), 140, 540);
      cx.fillStyle = '#20264a'; cx.font = '700 48px system-ui,sans-serif'; wrapLines(cx, data.wishGoal.name || '', 1320).slice(0, 2).forEach((l, i) => cx.fillText(l, 140, 610 + i * 56));
    }
    footer(cx, Date.now());
  }
  function drawStats(cx, s, data) {
    bg(cx, '#a7c7ff', '#7fe0c0'); header(cx, t('w_summary') || 'Stats', firstName(s));
    const tiles = [[t('kd_card_homework'), data.hw], [t('kd_card_reading'), data.readMin], [t('kd_card_streak'), data.streak], [t('kd_card_level'), data.level]];
    const cw = 330, ch = 320, gap = 24, x0 = (W - (4 * cw + 3 * gap)) / 2, y0 = 240;
    tiles.forEach((tl, i) => {
      const x = x0 + i * (cw + gap); card(cx, x, y0, cw, ch);
      cx.textAlign = 'center'; cx.fillStyle = '#20264a'; cx.font = '700 84px system-ui,sans-serif'; cx.fillText(String(tl[1] == null ? '—' : tl[1]), x + cw / 2, y0 + 170);
      cx.font = '400 28px system-ui,sans-serif'; cx.fillStyle = '#51577c'; wrapLines(cx, tl[0], cw - 30).forEach((l, li) => cx.fillText(l, x + cw / 2, y0 + 220 + li * 32));
    });
    footer(cx, Date.now());
  }
  function drawSchoolCard(cx, s, kind, data) {
    bg(cx, '#e8ecff', '#cfe0ff');
    header(cx, t(kind === 'report' ? 'w_progress' : kind === 'digest' ? 'w_digest' : 'w_notes') || kind, firstName(s) + (s.className ? ' · ' + s.className : ''));
    card(cx, 100, 220, 1400, 660);
    cx.textAlign = 'left'; cx.fillStyle = '#20264a'; cx.font = '400 32px system-ui,sans-serif';
    const lines = []; (data.lines || []).forEach(l => wrapLines(cx, l, 1320).forEach(x => lines.push(x)));
    lines.slice(0, 16).forEach((l, i) => cx.fillText(l, 140, 300 + i * 44));
    footer(cx, data.t);
  }

  function renderCanvas(type, s, payload) {
    const [cv, cx] = ctx2d();
    if (type === 'badge') drawBadge(cx, s, payload);
    else if (type === 'badgeSet') drawBadgeSet(cx, s, payload);
    else if (type === 'rewardsSummary') drawRewardsSummary(cx, s, payload);
    else if (type === 'stats') drawStats(cx, s, payload);
    else drawSchoolCard(cx, s, type, payload);
    return cv;
  }

  /** `snapshot` is the object PD.subscribeChild already handed the calling widget. Returns a Promise. */
  async function save(type, childId, snapshot, payload) {
    const cv = renderCanvas(type, snapshot, payload || {});
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    if (!blob) throw new Error('canvas-empty');
    const db = KeepDeckDB.forChild(childId);
    await KeepDeckScrap.saveScrap(childId, db, blob, W, H);
  }

  return { save };
})();

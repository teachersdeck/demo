'use strict';
/* StudentDeck and UniStudentDeck — one shared file. StudentDeck (teachersdeck/teachersdeck-suite, studentdeck/js/app.js) is the copy to edit;
   UniStudentDeck (teachersdeck/unideck) takes it unchanged through tools/sync_shared.py, so a fix made here reaches both apps.
   Original header: StudentDeck v0.3.0 — laptop shell, 5 study widgets, XP engine and a Stats & XP dashboard.
   Widget contract: { id, title, icon, w, h, render(body) -> optional cleanup fn }.
   awardXP() is the M2 seam: M1 widgets already call it, it just does nothing yet. */
/* Which app this is: each app's own js/edition.js (the first script on the page) sets window.SD_EDITION — the app's name,
   its version, and the edition. UNI = the university edition (UniStudentDeck); XP_ON = XP, levels and badges are shown
   (always in StudentDeck; off by default in UniStudentDeck, where XP keeps being COUNTED either way). U(studentText, uniText)
   picks the wording for the current edition. Without an edition file this is StudentDeck. */
const ED = window.SD_EDITION || { uni: false, xpOn: true, name: 'StudentDeck', version: '0.0.0', setXp() {} };
const UNI = !!ED.uni, XP_ON = ED.xpOn !== false, APP = ED.name || 'StudentDeck', U = (sd, uni) => (UNI ? uni : sd);
const VERSION = ED.version, KEY = 'sd_state_v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dayKey = d => new Date(d).toLocaleDateString('en-CA');           // local YYYY-MM-DD
const pad = n => String(n).padStart(2, '0');
/* Language (v0.22.0): js/lang.js sets <html lang> to 'en' or 'vi' before this runs, and changing it reloads the page, so text only needs the right
   language when it is drawn. V('English', 'Tiếng Việt') picks the wording (named V because T and L are local names all over this file);
   LOC() is the locale for dates and times people read (never for the 'en-CA' YYYY-MM-DD keys). */
const V_EN = new Map();   // Vietnamese text -> its English, for labels defined while the app loads (badges keep English names in the cloud)
let V_LOADING = true; setTimeout(() => { V_LOADING = false; }, 0);   // only load-time text, so per-second redraws don't fill the map
const V = (en, vi) => { if (!/^vi/i.test(document.documentElement.lang || '')) return en; if (V_LOADING && vi !== en) V_EN.set(vi, en); return vi; };
const LOC = () => (/^vi/i.test(document.documentElement.lang || '') ? 'vi-VN' : []);

function fresh() {
  return { active: {}, layout: {}, todo: [], hwDone: {}, hwPending: {}, theme: 'dusk',
    timer: { dur: 1500, left: 1500, endsAt: 0, doneDate: '', doneCount: 0 },
    reading: { entries: [], startedAt: 0 },
    games: { plays: {}, scores: {} }, idiom: { learned: [], awardDate: '' }, journal: { entries: [] }, notes: { pages: [], current: '', lastAward: 0 }, scrap: { books: [], lastOpen: '', lastItemDay: '' }, badges: { earned: {}, init: false, bestStreak: 0 }, fsBar: false, docTime: {}, filesSort: 'recent', hwLinks: {}, hwCache: [], docToReading: true, pdfTools: false, docFocus: true, words: [], tr: { from: 'en', to: 'vi', hist: [] }, cardsBonusDate: '',
    layoutMode: 'cozy', showEmojisCustom: true, edgeDock: { left: { visible: true }, right: { visible: true } }, dockAutoHide: false, dockPlacement: {},
    xp: { total: 0, streak: 0, last: '', log: [] }, stats: { daily: {}, syncedThrough: '' } };
}
function load() {
  let s = {}; try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const f = fresh(); return { ...f, ...s, hwDone: { ...f.hwDone, ...s.hwDone }, hwPending: { ...f.hwPending, ...s.hwPending }, timer: { ...f.timer, ...s.timer }, reading: { ...f.reading, ...s.reading }, games: { ...f.games, ...s.games }, idiom: { ...f.idiom, ...s.idiom }, journal: { ...f.journal, ...s.journal }, notes: { ...f.notes, ...s.notes }, scrap: { ...f.scrap, ...s.scrap }, badges: { ...f.badges, ...s.badges, earned: { ...((s.badges || {}).earned || {}) } }, xp: { ...f.xp, ...s.xp }, stats: { ...f.stats, ...s.stats } };
}
if (typeof SD_DEMO !== 'undefined') SD_DEMO.install();     // v0.9.2 demo mode (js/demo.js): swaps in the pretend class connection; does nothing when the demo is off
const state = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* not persisted */ } }

let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
function beep() {
  try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination); o.frequency.value = 880;
    g.gain.setValueAtTime(.2, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + 1);
    o.start(); o.stop(c.currentTime + 1); } catch (e) {}
}

/* ---------- XP + stats engine ----------
   awardXP(source, amount, meta) is the one door XP goes through. Every widget calls it; nothing else touches the total.
   A NEW WIDGET IS TRACKED AUTOMATICALLY: time-in-widget is counted by the shell for every entry in WIDGETS, and any
   source name passed to awardXP() shows up on the dashboard on its own (unlisted sources get DEFAULT_CAP per day).
   Add a row to XP_RULES only to give it a nicer label or its own daily cap. */
const XP_RULES = {
  focus:   { label: V('Focus sessions', 'Phiên tập trung'),   cap: 60 },
  todo:    { label: U(V('Homework done', 'Bài tập về nhà đã xong'), V('Assignments done', 'Bài tập đã xong')), cap: 30 },
  reading: { label: V('Reading', 'Đọc sách'),        cap: 60 },
  game:    { label: V('Games', 'Trò chơi'),          cap: 60 },
  idiom:   { label: V('Idiom of the day', 'Thành ngữ hôm nay'), cap: 5 },
  words:   { label: V('Saving words', 'Lưu từ vựng'),     cap: 10 },    // 2 XP per new word saved from Translate / Dictionary / Idiom (not typed in by hand)
  cards:   { label: V('Flashcards', 'Thẻ ghi nhớ'),       cap: 30 },    // 1 XP per card answered right in a scheduled review + a 3 XP bonus for the day's first finished session
  journal: { label: V('Journal', 'Nhật ký'),          cap: 10 },
  notes:   { label: U(V('Notepad', 'Sổ tay'), V('Notes', 'Ghi chú')), cap: 15 },    // 1 XP per timestamped line of 4+ words (a repeat of a line earns once a day, and rewarded lines are at least 20 s apart) + 2 for the day's first one — see noteXpFor()
  scrap:   { label: V('Scrapbooking', 'Sổ lưu niệm'),     cap: 15 },    // Scrapdeck: 2 XP the first time each day something new is added + 3 XP the first time a page reaches 3 items — never for moving, resizing, duplicating or deleting (js/scrapdeck-core.js xpForItemAdded)
  daily:   { label: V('Daily visit', 'Ghé thăm mỗi ngày'),      cap: 5 },
  docs:    { label: V('Reading documents', 'Đọc tài liệu'), cap: 20 }     // 1 XP per DOC_XP_SECS of active time with a document open (Files widget), at most DOC_XP_PER_DOC per document per day
};
const DEFAULT_CAP = 50, SOFT_CEILING = 150, IDLE_MS = 5 * 60 * 1000;
const DOC_KEY = 'docs', DOC_XP_SECS = 300, DOC_XP_PER_DOC = 8, DOC_IDLE_MS = 15 * 60 * 1000;   // document time: stats key, seconds per XP, max XP one document can earn in a day, and how long a document may sit untouched before we ask "still reading?"
const levelStart = L => 100 * (L - 1) + 25 * (L - 1) * (L - 2);           // total XP at which level L begins: 0, 100, 250, 450…
function levelInfo(total) { let L = 1; while (total >= levelStart(L + 1)) L++; return { level: L, into: total - levelStart(L), need: levelStart(L + 1) - levelStart(L) }; }
const streakMult = () => { const n = state.xp.streak; return n >= 2 ? Math.min(1.5, 1 + 0.1 * (n - 1)) : 1; };
const srcLabel = s => (XP_RULES[s] || {}).label || s;
function dayRec(d = dayKey(Date.now())) {
  return state.stats.daily[d] || (state.stats.daily[d] = { xp: 0, xpBy: {}, timeBy: {}, hw: 0, readEntries: 0, readMin: 0, focus: 0, games: 0, gamesStarted: 0, idioms: 0 });
}
let statsRedraw = null, badgesRedraw = null; const refreshStats = () => { if (statsRedraw) statsRedraw(); if (badgesRedraw) badgesRedraw(); };
function stat(k, n = 1) { const r = dayRec(); r[k] = (r[k] || 0) + n; save(); refreshStats(); scheduleSync(); }       // counters: hw, readEntries, readMin, focus, games, gamesStarted, idioms
const capSeen = new Set();
function awardXP(source, amount, meta) {
  const rule = XP_RULES[source] || { label: source, cap: DEFAULT_CAP }, r = dayRec();
  let n = Math.round(amount * streakMult());
  if (r.xp >= SOFT_CEILING) n = Math.ceil(n / 2);                             // past ~150 XP a day, everything earns half
  n = Math.min(n, rule.cap - (r.xpBy[source] || 0));
  if (n <= 0) { const k = source + dayKey(Date.now()); if (!capSeen.has(k)) { capSeen.add(k); if (XP_ON) toast(V(`Daily XP limit reached for ${rule.label}.`, `Đã đạt giới hạn XP hôm nay cho ${rule.label}.`)); } return 0; }
  const before = levelInfo(state.xp.total).level;
  state.xp.total += n; r.xp += n; r.xpBy[source] = (r.xpBy[source] || 0) + n;
  state.xp.log.push({ t: Date.now(), s: source, n }); if (state.xp.log.length > 100) state.xp.log.shift();
  save(); drawXP(n, levelInfo(state.xp.total).level > before); checkBadges(); refreshStats(); scheduleSync(); return n;
}
function drawXP(gain, up) {
  const L = levelInfo(state.xp.total);
  $('#xp-lv').textContent = V('Lv ', 'Cấp ') + L.level; $('#xp-fill').style.width = Math.round(L.into / L.need * 100) + '%'; $('#xp-tot').textContent = state.xp.total + ' XP';
  if (!XP_ON) return;                                                            // UniStudentDeck with XP off: counted, never shown
  if (gain) { const p = $('#xp-pop'); p.textContent = '+' + gain + ' XP'; p.classList.remove('go'); void p.offsetWidth; p.classList.add('go'); }
  if (up) toast(V(`Level up! You reached level ${L.level} 🎉`, `Lên cấp! Bạn đã đạt cấp ${L.level} 🎉`), 3500);
}
function touchDay() {                                                            // first visit of a day: streak + 5 XP
  const today = dayKey(Date.now()), X = state.xp; if (X.last === today) return;
  X.streak = X.last === dayKey(Date.now() - 864e5) ? X.streak + 1 : 1; X.last = today; dayRec(); save();
  awardXP('daily', 5, {});
}
/* ---------- Badges for gaining XP (v0.9.6) ----------
   Everything here is derived from numbers StudentDeck already keeps — total XP, level, the streak, each day's XP and where it came from — so a badge can't be
   earned any way XP itself can't (the daily caps and the ~150 XP soft ceiling already limit it). Each badge is { id, group, tier 1-4 (bronze, silver, gold,
   diamond), icon, name, desc, need, unit, val(ctx) }: it is earned when val(ctx) >= need, once, and stays earned. What is stored is only
   state.badges = { earned: { id: { t: when, old?: true } }, init, bestStreak, synced: { id: true }, syncedFor } on this device. From v0.10.0 each earned badge is also copied once to
   students/{studentId}/badges/{badgeId} (SDCloud.pushBadge) so ParentDeck's Badge Display Case can show it; `synced` records which copies reached the cloud. Nothing goes to the teacher.
   The first time this runs on a device that already has history, every badge that history qualifies for is awarded SILENTLY (marked `old`) and a single
   message says how many — no flood of pop-ups. After that, each new badge pops up when the XP that earned it lands. */
const BADGE_GROUPS = [['xp', V('Milestones', 'Cột mốc')], ['level', V('Levels', 'Cấp độ')], ['streak', V('Streaks', 'Chuỗi ngày')], ['day', V('Big days', 'Ngày bùng nổ')], ['mix', V('Variety', 'Đa dạng')], ['skill', V('Skills', 'Kỹ năng')], ['habit', V('Habits', 'Thói quen')]];
const BADGES = [
  ...[[50, '\ud83c\udf31', V('First sparks', 'Tia lửa đầu tiên'), 1], [100, '\ud83d\udcaf', V('Century', 'Tròn trăm'), 1], [250, '\u2b50', V('Rising star', 'Ngôi sao đang lên'), 1], [500, '\ud83c\udf1f', V('Shining bright', 'Tỏa sáng rực rỡ'), 2], [1000, '\ud83c\udfc6', V('Thousand club', 'Câu lạc bộ nghìn XP'), 2], [2500, '\ud83d\udc51', V('XP champion', 'Nhà vô địch XP'), 3], [5000, '\ud83d\udc8e', V('XP legend', 'Huyền thoại XP'), 4]]
    .map(([n, icon, name, t]) => ({ id: 'xp_' + n, group: 'xp', tier: t, icon, name, desc: V(`Earn ${n.toLocaleString()} XP in total`, `Đạt tổng cộng ${n.toLocaleString('vi-VN')} XP`), need: n, unit: ' XP', val: c => c.total })),
  ...[[3, '\ud83d\ude80', V('Lift-off', 'Cất cánh'), 1], [5, '\ud83c\udfaf', V('On target', 'Trúng đích'), 1], [8, '\ud83c\udf93', V('Scholar', 'Học giả'), 2], [10, '\ud83d\udd1f', V('Double digits', 'Hai chữ số'), 3], [15, '\ud83e\udde0', V('Brainiac', 'Bộ óc thiên tài'), 3], [20, '\ud83e\uddd9', V('Grand master', 'Đại kiện tướng'), 4]]
    .map(([n, icon, name, t]) => ({ id: 'lv_' + n, group: 'level', tier: t, icon, name, desc: V(`Reach level ${n}`, `Đạt cấp ${n}`), need: n, unit: '', val: c => c.level })),
  ...[[3, '\ud83d\udd25', V('On a roll', 'Đang vào guồng'), 1], [7, '\ud83d\uddd3\ufe0f', V('Week warrior', 'Chiến binh cả tuần'), 2], [14, '\ud83c\udf20', V('Fortnight focus', 'Hai tuần tập trung'), 2], [30, '\ud83c\udf19', V('Month master', 'Bậc thầy cả tháng'), 3], [100, '\ud83c\udf0b', V('Unstoppable', 'Không thể cản bước'), 4]]
    .map(([n, icon, name, t]) => ({ id: 'st_' + n, group: 'streak', tier: t, icon, name, desc: V(`Keep a ${n}-day streak`, `Giữ chuỗi ${n} ngày liên tiếp`), need: n, unit: V(' days', ' ngày'), val: c => c.bestStreak })),
  ...[[50, '\u2600\ufe0f', V('Good day', 'Ngày tốt lành'), 1], [100, '\u26a1', V('Power day', 'Ngày hết công suất'), 2], [150, '\ud83c\udf0b', V('Maximum effort', 'Nỗ lực tối đa'), 3]]
    .map(([n, icon, name, t]) => ({ id: 'day_' + n, group: 'day', tier: t, icon, name, desc: V(`Earn ${n} XP in a single day`, `Đạt ${n} XP trong một ngày`), need: n, unit: ' XP', val: c => c.bestDay })),
  { id: 'mix_4', group: 'mix', tier: 2, icon: '\ud83e\udde9', name: V('All-rounder', 'Toàn năng'), desc: V('Earn XP from 4 different things in one day', 'Nhận XP từ 4 hoạt động khác nhau trong một ngày'), need: 4, unit: V(' things', ' hoạt động'), val: c => c.maxSources },
  { id: 'mix_7', group: 'mix', tier: 3, icon: '\ud83c\udf08', name: V('Whole toolbox', 'Cả hộp đồ nghề'), desc: V('Earn XP from 7 different things in one day', 'Nhận XP từ 7 hoạt động khác nhau trong một ngày'), need: 7, unit: V(' things', ' hoạt động'), val: c => c.maxSources },
  ...[['reading', '\ud83d\udc1b', V('Bookworm', 'Mọt sách'), 150, 2], ['focus', '\ud83d\udd2d', V('Laser focus', 'Tập trung cao độ'), 150, 2], ['todo', '\ud83e\uddb8', V('Homework hero', 'Anh hùng bài tập về nhà'), 60, 2], ['game', '\ud83c\udfae', V('Game on', 'Vào trận'), 120, 2], ['idiom', '\ud83d\udde3\ufe0f', V('Idiom ace', 'Cao thủ thành ngữ'), 25, 1],
     ['words', '\ud83d\udd24', V('Word collector', 'Nhà sưu tầm từ vựng'), 40, 1], ['cards', '\ud83c\udccf', V('Card shark', 'Cao thủ thẻ ghi nhớ'), 60, 2], ['journal', '\ud83d\udcd4', V('Dear diary', 'Nhật ký thân mến'), 30, 1], ['notes', '\ud83d\uddd2\ufe0f', V('Note taker', 'Người ghi chép'), 45, 1], ['scrap', '\ud83d\uddbc\ufe0f', V('Memory maker', 'Người lưu giữ kỷ niệm'), 60, 2], ['docs', '\ud83d\udcc4', V('Document diver', 'Thợ lặn tài liệu'), 40, 1]]
    .map(([src, icon, name, n, t]) => ({ id: 'sk_' + src, group: 'skill', tier: t, icon, name, desc: V(`Earn ${n} XP from ${(XP_RULES[src] || {}).label ? XP_RULES[src].label.toLowerCase() : src}`, `Đạt ${n} XP từ ${(XP_RULES[src] || {}).label ? XP_RULES[src].label.toLowerCase() : src}`), need: n, unit: ' XP', val: c => c.by[src] || 0 })),
  ...[[7, '\ud83c\udf3f', V('First week', 'Tuần đầu tiên'), 1], [30, '\ud83d\udcc5', V('Month of learning', 'Một tháng học tập'), 2], [100, '\ud83c\udfdb\ufe0f', V('100 days', '100 ngày'), 3]]
    .map(([n, icon, name, t]) => ({ id: 'hab_' + n, group: 'habit', tier: t, icon, name, desc: V(`Be active on ${n} different days`, `Học trong ${n} ngày khác nhau`), need: n, unit: V(' days', ' ngày'), val: c => c.activeDays }))
];
function badgeCtx() {                                              // one pass over the day records gives every number a badge needs
  const ctx = { total: state.xp.total, level: levelInfo(state.xp.total).level, bestStreak: Math.max(state.badges.bestStreak || 0, state.xp.streak || 0), bestDay: 0, maxSources: 0, activeDays: 0, by: {} };
  Object.values(state.stats.daily).forEach(r => {
    if ((r.xp || 0) > 0) ctx.activeDays++;
    ctx.bestDay = Math.max(ctx.bestDay, r.xp || 0);
    let kinds = 0; Object.entries(r.xpBy || {}).forEach(([k, n]) => { ctx.by[k] = (ctx.by[k] || 0) + n; if (k !== 'daily' && n > 0) kinds++; });
    ctx.maxSources = Math.max(ctx.maxSources, kinds);
  });
  return ctx;
}
const sxStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function sxBurst(host, x, y, n = 12) {                             // a little shower of stars at a point inside `host` (the host must be positioned)
  if (sxStill() || !host) return;
  for (let i = 0; i < n; i++) { const p = document.createElement('s'), a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 46;
    p.className = 'sx-spark'; p.textContent = Math.random() < 0.5 ? '\u2726' : '\u2727'; p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 12}px;animation-delay:${Math.random() * 0.25}s;font-size:${9 + Math.random() * 9}px`;
    host.appendChild(p); setTimeout(() => p.remove(), 1400); }
}
const medalHtml = (b, on) => `<span class="medal t${b.tier}${on ? ' on' : ''}" aria-hidden="true"><span class="mi">${b.icon}</span></span>`;
const badgeQ = []; let badgeBusy = false;
function popBadge(b) { badgeQ.push(b); if (!badgeBusy) nextBadgePop(); }
function nextBadgePop() {
  const b = badgeQ.shift(); if (!b) { badgeBusy = false; return; }
  badgeBusy = true;
  const el = document.createElement('div'); el.className = 'badge-pop'; el.setAttribute('role', 'status');
  el.innerHTML = `${medalHtml(b, true)}<div class="bp-t"><small>${V('New badge!', 'Huy hiệu mới!')}</small><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div>`;
  el.addEventListener('click', () => { el.remove(); showBadge(b.id); nextBadgePop(); });
  document.body.appendChild(el); sxBurst(el, 40, 40, 16);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); nextBadgePop(); }, 380); }, 4300);
}
/* The badge strip (v0.9.8): the 🏅 count and a row of small medals for the badges you've earned, under the XP pill at the top. Newest first; the number that fit depends on
   the window width, the rest are the "+N". Point at a medal and it pops up with its name; click one for the full-size badge in the middle of the screen. */
const badgeSlots = el => { const w = el && el.clientWidth; return w ? Math.max(3, Math.min(30, Math.floor((w - 100) / 62))) : (innerWidth < 720 ? 4 : innerWidth < 1000 ? 6 : 9); };   // v0.9.9: as many as fit the strip in Stats & XP
let freshBadge = {};                                                    // id -> true for badges earned in the last few seconds (they pop in)
function renderBadgeStrip() {
  const el = $('#badge-strip'); if (!el) return;
  const E = state.badges.earned, tierOf = id => (BADGES.find(b => b.id === id) || {}).tier || 1;
  const ids = Object.keys(E).filter(id => BADGES.some(b => b.id === id)).sort((a, c) => (E[c].t - E[a].t) || (tierOf(c) - tierOf(a))), n = ids.length, slots = badgeSlots(el), shown = ids.slice(0, slots);
  el.innerHTML = `<button class="bs-count" id="badge-chip" aria-label="${V(`${n} of ${BADGES.length} badges earned. Open all badges`, `Đã đạt ${n}/${BADGES.length} huy hiệu. Mở tất cả huy hiệu`)}" title="${V(`${n} of ${BADGES.length} badges earned \u2014 open them`, `Đã đạt ${n}/${BADGES.length} huy hiệu \u2014 mở xem`)}"><span aria-hidden="true">\ud83c\udfc5</span><b id="badge-n">${n}</b></button>`
    + shown.map(id => { const b = BADGES.find(x => x.id === id);
        return `<span class="bs-item${freshBadge[id] ? ' fresh' : ''}"><button class="bs-ic" data-badge="${id}" aria-label="${esc(b.name)}: ${esc(b.desc)}">${medalHtml(b, true)}</button><span class="bs-tip" role="tooltip"><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></span></span>`; }).join('')
    + (n === 0 ? `<span class="bs-empty">${V('No badges yet \u2014 earn XP to unlock your first.', 'Chưa có huy hiệu nào \u2014 hãy kiếm XP để mở khóa huy hiệu đầu tiên.')}</span>` : '')
    + (n > shown.length ? `<button class="bs-more" data-more aria-label="${V(`${n - shown.length} more badges. Open all badges`, `Thêm ${n - shown.length} huy hiệu. Mở tất cả huy hiệu`)}" title="${V('Open all badges', 'Mở tất cả huy hiệu')}">+${n - shown.length}</button>` : '');
}
function updateBadgeChip(pulse) {                                       // (name kept from v0.9.6) redraw the strip; shake the count when something new arrived
  renderBadgeStrip();
  const chip = $('#badge-chip'); if (pulse && chip && !sxStill()) { chip.classList.remove('pulse'); void chip.offsetWidth; chip.classList.add('pulse'); }
}
function showBadge(id) {                                                // the full-size badge, centred, with the toast
  const b = BADGES.find(x => x.id === id); if (!b) return;
  const old = $('#badge-view'); if (old) old.remove();
  const e = state.badges.earned[id], on = !!e, C = badgeCtx(), have = Math.min(b.val(C), b.need), TIER = ['', V('Bronze', 'Đồng'), V('Silver', 'Bạc'), V('Gold', 'Vàng'), V('Diamond', 'Kim cương')][b.tier], grp = (BADGE_GROUPS.find(g => g[0] === b.group) || [, ''])[1];
  const when = on ? (e.old ? V('Earned before badges began', 'Đạt được trước khi có huy hiệu') : V('Earned ', 'Đạt ngày ') + new Date(e.t).toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' })) : V(`Not earned yet \u2014 ${Math.round(have).toLocaleString()} / ${b.need.toLocaleString()}${b.unit}`, `Chưa đạt \u2014 ${Math.round(have).toLocaleString('vi-VN')} / ${b.need.toLocaleString('vi-VN')}${b.unit}`);
  const v = document.createElement('div'); v.className = 'bv-back'; v.id = 'badge-view'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', V('Badge: ', 'Huy hiệu: ') + b.name);
  v.innerHTML = `<div class="bv-card"><button class="bv-x" aria-label="${V('Close', 'Đóng')}">\u00d7</button><div class="bv-medal">${medalHtml(b, on)}</div><small class="bv-tier">${V(`${TIER} badge`, `Huy hiệu ${TIER.toLowerCase()}`)} \u00b7 ${esc(grp)}</small><h3>${esc(b.name)}</h3><p>${esc(b.desc)}</p>
    ${on ? '' : `<div class="bd-bar"><i style="width:${Math.round(have / b.need * 100)}%"></i></div>`}<em>${esc(when)}</em>
    <div class="row" style="justify-content:center;gap:8px;margin-top:12px"><button class="btn" data-bv="all">${V('See all badges', 'Xem tất cả huy hiệu')}</button><button class="btn primary" data-bv="close">${V('Close', 'Đóng')}</button></div></div>`;
  const close = () => { v.removeAttribute('id'); v.classList.add('out'); setTimeout(() => v.remove(), sxStill() ? 0 : 220); document.removeEventListener('keydown', onKey, true); };   // drop the id at once so a quick second Esc reaches the page underneath
  const onKey = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
  v.addEventListener('click', ev => { const a = ev.target.closest('[data-bv]')?.dataset.bv; if (ev.target === v || ev.target.closest('.bv-x') || a === 'close') close(); else if (a === 'all') { close(); openBadges(); } });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(v); v.querySelector('.btn.primary').focus({ preventScroll: true });
  if (on) sxBurst(v.querySelector('.bv-card'), v.querySelector('.bv-card').offsetWidth / 2, 96, 18);
  toast(`\ud83c\udfc5 ${b.name} \u2014 ${on ? (e.old ? V('earned before badges began', 'đạt được trước khi có huy hiệu') : V('earned ', 'đạt ngày ') + new Date(e.t).toLocaleDateString(LOC(), { month: 'short', day: 'numeric' })) : V('keep going: ', 'cố lên: ') + b.desc}`, 3400);
}
function grantBadge(b, silent) {
  const B = state.badges; if (B.earned[b.id]) return false;
  B.earned[b.id] = silent ? { t: Date.now(), old: 1 } : { t: Date.now() };
  if (!silent) { freshBadge[b.id] = true; setTimeout(() => { delete freshBadge[b.id]; }, 4500); }
  return true;
}
function checkBadges() {
  if (UNI) return;                                                   // UniStudentDeck has no badges, even with XP on (milestones come later); switching back awards what was reached
  const B = state.badges; B.bestStreak = Math.max(B.bestStreak || 0, state.xp.streak || 0);
  const c = badgeCtx(), fresh = BADGES.filter(b => !B.earned[b.id] && b.val(c) >= b.need), first = !B.init;
  if (first) {                                                       // first run with history: award quietly, say so once
    fresh.forEach(b => grantBadge(b, true)); B.init = true; save();
    if (fresh.length && !(typeof SD_DEMO !== 'undefined' && SD_DEMO.active)) toast(V(`\ud83c\udfc5 You already earned ${fresh.length} badge${fresh.length === 1 ? '' : 's'}! Open Badges & Rewards to see them.`, `\ud83c\udfc5 Bạn đã đạt ${fresh.length} huy hiệu! Mở Huy hiệu & Phần thưởng để xem.`), 4800);
  } else if (fresh.length) {
    fresh.forEach(b => grantBadge(b, false)); save();
    fresh.slice(0, 3).forEach(popBadge); if (fresh.length > 3) setTimeout(() => toast(V(`\ud83c\udfc5 \u2026and ${fresh.length - 3} more new badges!`, `\ud83c\udfc5 \u2026và thêm ${fresh.length - 3} huy hiệu mới!`), 3600), 600);
    refreshStats();
  }
  updateBadgeChip(fresh.length > 0 && !first);
  syncBadges();
}
/* Copy every earned badge that isn't in the cloud yet to students/{id}/badges (v0.10.0). Safe to call any time: it does nothing unless a Cloud Class
   is joined, skips what is already synced, and a failed write (offline, rule not deployed yet) simply stays unsynced and is retried by the timer below.
   Badges awarded silently on first run carry `old`, so ParentDeck shows them without announcing them. `synced` is remembered per student, so
   joining a different class/student starts the copy again. Skipped entirely in demo mode. */
const badgeSyncing = {};
function syncBadges() {
  if (typeof SD_DEMO !== 'undefined' && SD_DEMO.active) return;
  if (typeof SDCloud.pushBadge !== 'function' || SDCloud.getStatus() !== 'joined') return;
  const j = SDCloud.getJoined(); if (!j || !j.studentId) return;
  const B0 = state.badges; if (B0.syncedFor !== j.studentId) { B0.synced = {}; B0.syncedFor = j.studentId; save(); }
  BADGES.forEach(b => {
    const e = state.badges.earned[b.id], key = j.studentId + '/' + b.id;
    if (!e || (state.badges.synced || {})[b.id] || badgeSyncing[key]) return;
    badgeSyncing[key] = true;
    SDCloud.pushBadge({ id: b.id, name: V_EN.get(b.name) || b.name, icon: b.icon, tier: b.tier, group: b.group, desc: V_EN.get(b.desc) || b.desc }, e).then(ok => {
      delete badgeSyncing[key];
      if (ok && SDCloud.getJoined() && SDCloud.getJoined().studentId === j.studentId) { (state.badges.synced || (state.badges.synced = {}))[b.id] = true; save(); }
    });
  });
}
setInterval(syncBadges, 60000);                                                   // retry anything a failed write left behind
SDCloud.onStatusChanged(status => { if (status === 'joined') syncBadges(); });    // also fires at once if already joined
function openBadges() {                                              // strip count / +N / "See all badges" / pop-up click: open the Badges & Rewards widget (v0.9.9)
  const o = panels.badges; if (o) { o.el.classList.remove('min'); raiseFull('badges'); syncFullscreen(); } else openWidget('badges');
}
function raiseFull(id) {                                             // full-screen widgets share one layer; the most recently opened one is on top (Esc closes that one)
  Object.entries(panels).forEach(([k, o]) => { if (o.el.classList.contains('full')) o.el.classList.toggle('fs-top', k === id); });
}

/* ---------- Badges & Rewards (v0.9.9) ----------
   A full-screen widget (like Stats & XP) holding the whole badge display: how many you have, Next up, the All / Earned / Locked filter, then every badge by group.
   It moved here from a card in Stats & XP; Stats & XP keeps the small medal strip. Click a tile for the full-size badge. Display only — nothing new is stored or synced. */
let badgeFilter = 'all';
function badgeGallery() {                                                   // the Badges card: a display case (hero + shelves), next up, filters, then every badge by group
  const B = state.badges, C = badgeCtx(), n = BADGES.filter(x => B.earned[x.id]).length, pct = Math.round(n / BADGES.length * 100);
  const prog = x => Math.min(1, x.val(C) / x.need), nf = v => Math.round(v).toLocaleString();
  const next = BADGES.filter(x => !B.earned[x.id]).sort((a, c) => prog(c) - prog(a)).slice(0, 3);
  const spot = BADGES.filter(x => B.earned[x.id]).sort((a, c) => (B.earned[c.id].t || 0) - (B.earned[a.id].t || 0))[0];
  let k = 0;
  const tile = x => { const on = !!B.earned[x.id], e = B.earned[x.id], i = k++;
    return `<div class="bd t${x.tier}${on ? ' on' : ''}" data-on="${on ? 1 : 0}" data-bid="${x.id}" role="button" tabindex="0" style="--n:${i}" title="${esc(x.desc)}">${medalHtml(x, on)}<b>${esc(x.name)}</b><small>${esc(x.desc)}</small>${on
      ? `<em>${e.old ? V('Earned before badges began', 'Đạt được trước khi có huy hiệu') : V('Earned ', 'Đạt ngày ') + new Date(e.t).toLocaleDateString(LOC(), { month: 'short', day: 'numeric' })}</em>`
      : `<div class="bd-bar"><i style="width:${Math.round(prog(x) * 100)}%"></i></div><em>${nf(Math.min(x.val(C), x.need))} / ${nf(x.need)}${x.unit}</em>`}</div>`; };
  return `<div class="bc-hero">
      ${spot ? `<button type="button" class="bc-spot" data-bid="${spot.id}" aria-label="${esc(spot.name)}">${medalHtml(spot, true)}</button>
        <div class="bc-hero-t"><p class="bc-count">${V(`<b>${n}</b> of ${BADGES.length} earned`, `Đã đạt <b>${n}</b>/${BADGES.length}`)}</p><div class="xpbar wide"><i style="width:${pct}%"></i></div>
        <p class="muted bc-last">${V('Latest:', 'Mới nhất:')} <b>${esc(spot.name)}</b>${B.earned[spot.id].old ? '' : ' · ' + new Date(B.earned[spot.id].t).toLocaleDateString(LOC(), { month: 'short', day: 'numeric' })}</p></div>`
      : `<span class="bc-spot empty" aria-hidden="true">🏅</span><div class="bc-hero-t"><p class="muted">${V('No badges yet — keep practicing to earn your first one!', 'Chưa có huy hiệu nào — tiếp tục luyện tập để đạt huy hiệu đầu tiên nhé!')}</p></div>`}
    </div>
    <div class="row" role="group" aria-label="${V('Show badges', 'Hiện huy hiệu')}">${[['all', V('All', 'Tất cả')], ['on', V('Earned', 'Đã đạt')], ['off', V('Locked', 'Chưa mở')]].map(([f, l]) => `<button class="chip${badgeFilter === f ? ' on' : ''}" data-bf="${f}">${l}</button>`).join('')}</div>
    ${next.length ? `<p class="bd-next-h">${V('Next up', 'Sắp đạt')}</p><div class="bd-next">${next.map(x => `<div class="bd-nx t${x.tier}">${medalHtml(x, false)}<div><b>${esc(x.name)}</b><small>${esc(x.desc)}</small><div class="bd-bar"><i style="width:${Math.round(prog(x) * 100)}%"></i></div><em>${nf(Math.min(x.val(C), x.need))} / ${nf(x.need)}${x.unit}</em></div></div>`).join('')}</div>` : `<p class="muted">${V('Every badge earned. Legend.', 'Đã đạt mọi huy hiệu. Huyền thoại!')}</p>`}
    <div class="bgal bc-cabinet" data-f="${badgeFilter}">${BADGE_GROUPS.map(([g, label]) => `<section class="bc-shelf"><h5>${label}</h5><div class="bd-grid">${BADGES.filter(x => x.group === g).map(tile).join('')}</div><div class="bc-ledge" aria-hidden="true"></div></section>`).join('')}</div>`;
}
function renderBadges(b) {
  b.innerHTML = `<div class="bdw"><div class="bdw-head"><h3>${V('Your badges', 'Huy hiệu của bạn')}</h3><span class="muted">${V('Click a badge to see it full size.', 'Bấm vào huy hiệu để xem cỡ lớn.')}</span></div><div id="bdw-body"></div></div>`;
  let fx = true, sig = '';
  const signature = () => { const C = badgeCtx(); return JSON.stringify([Object.keys(state.badges.earned).sort(), C.total, C.level, C.bestStreak, C.bestDay, C.maxSources, C.activeDays, C.by]); };
  function draw() {
    const host = $('#bdw-body', b); if (!host) return;
    const keep = b.scrollTop; sig = signature();
    host.classList.toggle('fx-in', fx); host.innerHTML = badgeGallery(); b.scrollTop = keep;
    if (fx) { setTimeout(() => host.classList.remove('fx-in'), 2400); fx = false; }
  }
  badgesRedraw = () => { if (b.isConnected && signature() !== sig && !b.matches(':hover')) draw(); };   // only when something changed, and not under the pointer (a redraw would restart a tile's hover)
  b.addEventListener('click', e => {
    const tl = e.target.closest('[data-bid]'); if (tl) { showBadge(tl.dataset.bid); return; }
    const f = e.target.closest('[data-bf]')?.dataset.bf; if (f) { badgeFilter = f; draw(); }
  });
  b.addEventListener('keydown', e => { const tl = e.target.closest('.bd[data-bid]'); if (tl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showBadge(tl.dataset.bid); } });
  draw(); const iv = setInterval(() => badgesRedraw && badgesRedraw(), 10000);
  return () => { clearInterval(iv); badgesRedraw = null; };
}

/* Per-document time (v0.7.1). state.docTime[fileId] = { name, kind, secs, opens, last } is the lifetime total for one file or link
   (kept in localStorage, not IndexedDB, so it survives the file being removed and never rewrites a PDF blob). Today's seconds for
   each document live on the day record as docSecs[fileId], and the XP already granted for it as docUnitsBy[fileId] — that is what
   enforces DOC_XP_PER_DOC, so one PDF left open can't earn the whole daily document allowance. Only the aggregate timeBy.docs is
   synced to ParentDeck; per-document names and times stay on this device. */
const docKeyOf = d => d.id || ('n:' + d.name), docCapSeen = new Set();
function docEntry(d) {
  const T = state.docTime, k = docKeyOf(d);
  if (!T[k]) {
    const keys = Object.keys(T); if (keys.length >= 100) { keys.sort((a, c) => (T[a].last || 0) - (T[c].last || 0)); delete T[keys[0]]; }     // keep the list bounded
    T[k] = { name: d.name, kind: d.kind, secs: 0, opens: 0, last: Date.now() };
  }
  T[k].name = d.name; return T[k];
}
function noteDocOpen(d) { const e = docEntry(d); e.opens++; e.last = Date.now(); save(); }
function trackDoc(d, secs) {                                                     // returns today's seconds for this one document
  const e = docEntry(d), r = dayRec(), k = docKeyOf(d); e.secs += secs; e.last = Date.now();
  r.docSecs = r.docSecs || {}; return (r.docSecs[k] = (r.docSecs[k] || 0) + secs);
}
function docXpGranted(d) { const r = dayRec(); return ((r.docUnitsBy || {})[docKeyOf(d)]) || 0; }

/* Linking documents to Reading Log and Homework (v0.7.2).
   READING LOG: when a document is closed (and every ~30 s while it's open) today's minutes on it are written to ONE Reading Log
   entry per document per day (entry.doc = the document's key), so the log stays current without piling up duplicates. Those
   minutes count in the reading stats (and so reach ParentDeck) but earn no 'reading' XP — the document already earned 'docs' XP
   for the same minutes. Turned off by the "Add to my Reading Log" tick in the toolbar's Track menu (state.docToReading).
   HOMEWORK: the Track menu links the open document to homework items (state.hwLinks[hwKey] = { docs:[docKey…], secs }).
   hwKey is 'a:<assignmentId>' for a teacher assignment or 't:<taskId>' for the student's own task. While a linked document is
   being read, each linked item collects the same active seconds; the Homework widget shows them with the document's name
   (click to open it). Linking is local only — nothing about it is sent to ParentDeck. */
let readingRedraw = null, todoRedraw = null;
function hwLink(k, dk, on) {
  const L = state.hwLinks[k] || (state.hwLinks[k] = { docs: [], secs: 0 }), i = L.docs.indexOf(dk);
  if (on && i < 0) L.docs.push(dk); if (!on && i >= 0) L.docs.splice(i, 1);
  if (!L.docs.length && !L.secs) delete state.hwLinks[k];
  save(); if (todoRedraw) todoRedraw();
}
function trackHwTime(dk, secs) { Object.values(state.hwLinks).forEach(L => { if (L.docs.includes(dk)) L.secs = (L.secs || 0) + secs; }); }
function hwOpenItems() {                                                         // homework this document could be for: not yet ticked off
  const out = [];
  (state.hwCache || []).forEach(a => { if (!state.hwDone[a.id]) out.push({ key: 'a:' + a.id, title: a.title, sub: a.dueDate || '' }); });
  state.todo.forEach(t => { if (!t.done) out.push({ key: 't:' + t.id, title: t.text, sub: '' }); });
  return out;
}
function cacheHomework(list) { state.hwCache = list.map(a => ({ id: a.id, title: a.title || V('Assignment', 'Bài tập'), dueDate: a.dueDate || '' })); save(); }
function hwDocsHtml(k) {
  const L = state.hwLinks[k]; if (!L || !L.docs.length) return '';
  return `<div class="hw-docs">${L.docs.map(d => { const e = state.docTime[d]; return `<button type="button" class="chip doc-chip" data-opendoc="${esc(d)}" title="${V('Open this document', 'Mở tài liệu này')}">\ud83d\udcc4 ${esc(e ? e.name : V('Document', 'Tài liệu'))}</button>`; }).join('')}<span class="muted">\u23f1 ${V(`${fmtT(L.secs || 0)} on this`, `${fmtT(L.secs || 0)} cho bài này`)}</span></div>`;
}
function logDocToReading(d) {                                                    // returns the minutes now on today's entry (0 = nothing to log yet)
  const r = dayRec(), k = docKeyOf(d), min = Math.min(600, Math.floor(((r.docSecs || {})[k] || 0) / 60)); if (min < 1) return 0;
  const E = state.reading.entries, today = dayKey(Date.now()); r.docLogged = r.docLogged || {};
  const counted = r.docLogged[k] || 0; let e = E.find(x => x.doc === k && x.date === today);
  if (!e) { e = { id: uid(), date: today, book: d.name, min, doc: k }; E.push(e); } else e.min = min;
  if (min > counted) { if (!counted) stat('readEntries'); stat('readMin', min - counted); r.docLogged[k] = min; }      // stats count each minute once, even if the entry is deleted and re-made
  save(); if (readingRedraw) readingRedraw(); return min;
}

/* ---------- Word bank (v0.8.0) ----------
   One list of words and phrases the student wants to learn, filled from Translate, Dictionary, Idiom of the Day or typed in by hand, and
   reviewed in Flashcards. Leitner boxes 1-5: a right answer moves a card up a box (it comes back after BOX_DAYS[box] days), a wrong answer
   sends it to box 1 (back tomorrow). Box 5 counts as "mastered". Kept in localStorage with a 1,000-word cap (~200 KB); it moves to
   IndexedDB if it ever needs to be bigger. Words stay on the device — only counters and XP leave it. */
const BANK_MAX = 1000, BOX_DAYS = [0, 1, 2, 4, 8, 16];
let bankRedraw = null;
const addDays = n => dayKey(Date.now() + n * 864e5);
function bankAdd({ term, meaning, example, from }) {
  term = String(term || '').trim().replace(/\s+/g, ' ').slice(0, 80); meaning = String(meaning || '').trim().replace(/\s+/g, ' ').slice(0, 240);
  if (!term || !meaning) return { ok: false, why: 'empty' };
  const W = state.words; if (W.some(w => w.term.toLowerCase() === term.toLowerCase())) return { ok: false, why: 'dup' };
  if (W.length >= BANK_MAX) return { ok: false, why: 'full' };
  W.push({ id: uid(), term, meaning, example: String(example || '').trim().slice(0, 200), from: from || 'manual', added: Date.now(), box: 1, due: dayKey(Date.now()), seen: 0, right: 0 });
  stat('wordsSaved'); if (from && from !== 'manual') awardXP('words', 2, {});
  save(); if (bankRedraw) bankRedraw(); return { ok: true };
}
const bankDue = () => { const t = dayKey(Date.now()); return state.words.filter(w => w.due <= t); };
function bankAnswer(w, right) { w.seen++; if (right) { w.right++; w.box = Math.min(5, w.box + 1); } else w.box = 1; w.due = addDays(BOX_DAYS[w.box]); save(); }
const bankMsg = r => r.ok ? V('Saved to your word bank ✅', 'Đã lưu vào kho từ vựng ✅') : r.why === 'dup' ? V('That’s already in your word bank.', 'Từ này đã có trong kho từ vựng.') : r.why === 'full' ? V('Your word bank is full (1,000 words) — delete some in Flashcards.', 'Kho từ vựng đã đầy (1.000 từ) — hãy xóa bớt trong Thẻ ghi nhớ.') : V('Nothing to save yet.', 'Chưa có gì để lưu.');

/* Time in widgets: every 5 s, each open widget (and the game stage, counted as Games Hub) gets the elapsed seconds — but only
   while this tab is visible and the student has touched the page in the last 5 minutes, so a forgotten tab earns nothing.
   Document time (the Files widget's viewer) is counted separately under timeBy.docs, and — unlike widget time — it earns XP.
   Reading happens inside the iframe, whose scrolling/clicks never reach this page, so the 5-minute input rule can't apply to it:
   a document counts while the tab is visible AND the window has focus (focus inside the iframe still counts), and after
   DOC_IDLE_MS with no input on this page a "Still reading?" card pauses the clock until the student presses its button. */
let lastTick = Date.now(), lastInput = Date.now(), lastDocPoke = Date.now(), ticks = 0;
['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach(t => window.addEventListener(t, () => { lastInput = Date.now(); }, { passive: true }));
setInterval(() => {
  const now = Date.now(), dt = Math.min(15, Math.round((now - lastTick) / 1000)); lastTick = now;
  if (document.visibilityState !== 'visible' || !dt) return;
  const r = dayRec(), tb = r.timeBy; let counted = false;
  if (now - lastInput <= IDLE_MS) {
    const ids = new Set(Object.keys(panels)); if (stageGame) ids.add('games');
    ids.forEach(id => { tb[id] = (tb[id] || 0) + dt; counted = true; });
  }
  if (docStageOpen() && document.hasFocus()) {
    if (now - Math.max(lastInput, lastDocPoke) <= DOC_IDLE_MS) {
      tb[DOC_KEY] = (tb[DOC_KEY] || 0) + dt; counted = true;
      const k = docKeyOf(docCur), todayDoc = trackDoc(docCur, dt); trackHwTime(k, dt);                      // lifetime + today's seconds for THIS document
      r.docUnitsBy = r.docUnitsBy || {};
      const got = r.docUnitsBy[k] || 0, due = Math.min(Math.floor(todayDoc / DOC_XP_SECS), DOC_XP_PER_DOC) - got;   // one XP unit per full DOC_XP_SECS, up to DOC_XP_PER_DOC per document per day
      if (due > 0) {
        r.docUnitsBy[k] = got + due; awardXP('docs', due, {});
        if (got + due >= DOC_XP_PER_DOC && !docCapSeen.has(k + dayKey(now))) { docCapSeen.add(k + dayKey(now)); toast(V('That\u2019s the most XP this document earns today \u2014 your time still counts. Try another one for more! \ud83d\udcc4', 'Tài liệu này đã cho tối đa XP hôm nay \u2014 thời gian đọc vẫn được tính. Thử tài liệu khác để nhận thêm nhé! \ud83d\udcc4')); }
      }
      drawDocTime();
    } else docAskStillReading();
  }
  if (counted && ++ticks % 6 === 0) { if (docStageOpen() && docCur && state.docToReading) logDocToReading(docCur); if (docStageOpen() && todoRedraw) todoRedraw(); save(); refreshStats(); practiceDirty = true; syncPractice(); }             // write to storage every ~30 s, not every tick
}, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); syncPractice(); } else { lastTick = Date.now(); touchDay(); } });
window.addEventListener('pagehide', () => { if (docStageOpen()) closeDocLog(); save(); syncPractice(); });

/* ---------- Cloud practice sync ----------
   Pushes the local XP/stats engine above (never Class Points) up to Firestore, one small batch at a
   time, so ParentDeck's Trends widget has real history to chart. ONLY numbers + a single mood value
   per day ever leave this device — journal.entries[].text is never read here or sent anywhere.
   Today's doc is re-sent every sync (it's still changing); past days are sent once each, tracked by
   stats.syncedThrough, so a long-running tab doesn't re-upload its whole history every 30s. */
function moodOn(d) { const e = state.journal.entries.find(x => dayKey(x.ts) === d); return e ? e.mood : null; }
function dailyPayload(d) {
  const r = state.stats.daily[d] || {};
  return { xp: r.xp || 0, hw: r.hw || 0, readEntries: r.readEntries || 0, readMin: r.readMin || 0, focus: r.focus || 0, games: r.games || 0, gamesStarted: r.gamesStarted || 0, idioms: r.idioms || 0, wordsSaved: r.wordsSaved || 0, cardsReviewed: r.cardsReviewed || 0, mood: UNI ? null : moodOn(d), xpBy: { ...(r.xpBy || {}) }, timeBy: { ...(r.timeBy || {}) } };
}
// Per-game plays/best/last, for ParentDeck's "Game scores" (map keyed by game folder; Firestore keys can't contain . or /).
function gameScoresPayload() {
  const out = {};
  GAMES.forEach(g => { const S = state.games.scores[g.folder];
    out[String(g.folder).replace(/[.\/]/g, '_')] = { name: g.name, plays: state.games.plays[g.folder] || 0, best: S && S.best !== undefined ? S.best : null, last: S && S.last !== undefined ? S.last : null, label: g.scoreLabel || '' }; });
  return out;
}
const SYNC_SCHEMA = 2;                                            // bump when the payload gains fields: past days are re-sent once
let syncing = null, practiceDirty = true, syncTimer = 0;
function scheduleSync() { practiceDirty = true; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncPractice(), 4000); }   // soon after any change, not only every 30 s
function syncPractice() {                                        // resolves true/false; concurrent callers share one in-flight push
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const today = dayKey(Date.now());
      if (state.stats.syncSchema !== SYNC_SCHEMA) state.stats.syncedThrough = '';
      const days = { [today]: dailyPayload(today) };
      Object.keys(state.stats.daily).filter(d => d < today && d > (state.stats.syncedThrough || '')).sort().slice(-200).forEach(d => { days[d] = dailyPayload(d); });
      const ok = await SDCloud.pushPracticeStats({ xpTotal: state.xp.total, streak: state.xp.streak, days, gameScores: gameScoresPayload(), recentXp: state.xp.log.slice(-8) });
      if (ok) {
        practiceDirty = false;
        const finished = Object.keys(days).filter(d => d < today).sort(); if (finished.length) state.stats.syncedThrough = finished[finished.length - 1];
        if (SDCloud.getSyncInfo().mode === 'full') state.stats.syncSchema = SYNC_SCHEMA;
        save();
      }
      return ok;
    } finally { syncing = null; }
  })();
  return syncing;
}
setInterval(() => { if (practiceDirty || SDCloud.getSyncInfo().ok === false) syncPractice(); }, 30000);   // retry after a failed push, e.g. offline
SDCloud.onStatusChanged(status => { if (status === 'joined') syncPractice(); });

/* ---------- Widgets ---------- */
/* Clock widget — ported from TeachersDeck's renderClock (v0.11.0): analog face with hour / minute / second hands, a 12-hour digital
   readout and today's date. Left out on purpose: TeachersDeck's lunar-calendar line and its language setting (StudentDeck has
   neither a calendar-system option nor a language switch). Display only: no state, nothing saved, no XP. */
function renderClock(b) {
  b.innerHTML = `<div class="clock-face" aria-hidden="true">
      <div class="clock-hand hr"></div><div class="clock-hand min"></div><div class="clock-hand sec"></div><div class="clock-dot"></div>
    </div>
    <div class="clock-digital">--:--</div>
    <div class="clock-date">--</div>`;
  const hr = $('.hr', b), min = $('.min', b), sec = $('.sec', b), digital = $('.clock-digital', b), dateEl = $('.clock-date', b);
  function tick() {
    const d = new Date(), H = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    hr.style.transform = `rotate(${(H % 12) * 30 + m * 0.5}deg)`;
    min.style.transform = `rotate(${m * 6}deg)`;
    sec.style.transform = `rotate(${s * 6}deg)`;
    digital.textContent = `${H % 12 || 12}:${pad(m)} ${H >= 12 ? V('PM', 'CH') : V('AM', 'SA')}`;
    dateEl.textContent = d.toLocaleDateString(V('en-US', 'vi-VN'), { weekday: 'short', month: 'short', day: 'numeric' });
  }
  tick();
  const iv = setInterval(tick, 1000);
  return () => clearInterval(iv);
}

function renderTimer(b) {
  b.innerHTML = `<div class="tm-time" id="tt"></div>
    <div class="row center" role="group" aria-label="${V('Session length', 'Thời lượng phiên')}">${[15, 25, 45].map(m => `<button class="chip" data-m="${m}">${m} ${V('min', 'phút')}</button>`).join('')}</div>
    <div class="row center"><button class="btn primary" data-a="go"></button><button class="btn" data-a="reset">${V('Reset', 'Đặt lại')}</button></div>
    <p class="muted" id="tn" style="text-align:center"></p>`;
  const left = () => state.timer.endsAt ? Math.max(0, Math.ceil((state.timer.endsAt - Date.now()) / 1000)) : state.timer.left;
  function finish() {
    const T = state.timer, today = dayKey(Date.now());
    T.endsAt = 0; T.left = T.dur;
    T.doneCount = (T.doneDate === today ? T.doneCount : 0) + 1; T.doneDate = today;
    save(); beep(); toast(V('Focus session complete — nice work!', 'Hoàn thành phiên tập trung — làm tốt lắm!'));
    stat('focus'); awardXP('focus', Math.round(T.dur / 60), {});
  }
  function draw() {
    const T = state.timer;
    if (T.endsAt && Date.now() >= T.endsAt) finish();
    const s = left(), run = !!T.endsAt;
    $('#tt', b).textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    $('#tt', b).classList.toggle('run', run);
    b.querySelector('[data-a=go]').textContent = run ? V('Pause', 'Tạm dừng') : (s < T.dur ? V('Resume', 'Tiếp tục') : V('Start', 'Bắt đầu'));
    b.querySelectorAll('[data-m]').forEach(c => { c.classList.toggle('on', +c.dataset.m * 60 === T.dur); c.disabled = run; });
    $('#tn', b).textContent = `${V('Sessions today', 'Số phiên hôm nay')}: ${T.doneDate === dayKey(Date.now()) ? T.doneCount : 0}`;
  }
  b.addEventListener('click', e => {
    const T = state.timer, chip = e.target.closest('[data-m]'), a = e.target.closest('[data-a]')?.dataset.a;
    if (chip && !T.endsAt) { T.dur = T.left = +chip.dataset.m * 60; }
    else if (a === 'go') { if (T.endsAt) { T.left = left(); T.endsAt = 0; } else if (T.left > 0) T.endsAt = Date.now() + T.left * 1000; }
    else if (a === 'reset') { T.endsAt = 0; T.left = T.dur; }
    else return;
    save(); draw();
  });
  draw(); const iv = setInterval(draw, 500);
  return () => clearInterval(iv);
}

/* Read-only port of TeachersDeck's canonical month-grid calendar (its own js/app.js
   renderCalendar) — same cal-* CSS classes/layout, editing UI stripped out (no add/edit/
   delete/manage mode). `nav` is a {viewYear, viewMonth, selectedDate} object the CALLER owns;
   this is a pure render that re-invokes itself on nav clicks, same shape as TeachersDeck's own
   wireCalendar() calling back into its outer draw(). */
function renderMonthCalendar(el, events, nav) {
  const monthLabel = new Date(nav.viewYear, nav.viewMonth, 1).toLocaleDateString(V('en-US', 'vi-VN'), { month: 'long', year: 'numeric' });
  const firstDow = new Date(nav.viewYear, nav.viewMonth, 1).getDay();
  const daysInMonth = new Date(nav.viewYear, nav.viewMonth + 1, 0).getDate();
  const weekdayFmt = new Intl.DateTimeFormat(V('en-US', 'vi-VN'), { weekday: 'narrow' });
  let weekdayRow = ''; for (let i = 0; i < 7; i++) weekdayRow += `<span>${weekdayFmt.format(new Date(2023, 0, 1 + i))}</span>`;
  const eventsOn = d => events.filter(e => e.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayStr = dayKey(Date.now());

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += `<button class="cal-cell empty" disabled></button>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = isoDate(nav.viewYear, nav.viewMonth + 1, d);
    const hasEvents = eventsOn(dateStr).length > 0;
    cells += `<button class="cal-cell${dateStr === todayStr ? ' today' : ''}${dateStr === nav.selectedDate ? ' selected' : ''}" data-date="${dateStr}">${d}${hasEvents ? '<span class="cal-dot"></span>' : ''}</button>`;
  }

  const dayEvents = eventsOn(nav.selectedDate);
  const dayLabel = new Date(nav.selectedDate + 'T00:00:00').toLocaleDateString(V('en-US', 'vi-VN'), { weekday: 'long', month: 'long', day: 'numeric' });
  const listHtml = dayEvents.length ? dayEvents.map(e => `
      <li class="cal-ev-row">
        ${e.time ? `<span class="cal-ev-time">${esc(e.time)}</span>` : ''}
        <span class="cal-ev-title">${e.type === 'assignment' ? '📘 ' : ''}${esc(e.title || V('Untitled event', 'Sự kiện chưa đặt tên'))}</span>
      </li>`).join('') : `<li class="muted">${V('Nothing on this day.', 'Không có gì trong ngày này.')}</li>`;

  el.innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" id="mc-prev" aria-label="${V('Previous month', 'Tháng trước')}">${iconChevron('left')}</button>
      <span class="cal-month">${esc(monthLabel)}</span>
      <button class="cal-nav" id="mc-next" aria-label="${V('Next month', 'Tháng sau')}">${iconChevron('right')}</button>
    </div>
    <div class="cal-weekdays">${weekdayRow}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-day-head"><span class="cal-day-label">${esc(dayLabel)}</span></div>
    <ul class="cal-ev-list">${listHtml}</ul>`;

  el.querySelector('#mc-prev').addEventListener('click', () => { nav.viewMonth--; if (nav.viewMonth < 0) { nav.viewMonth = 11; nav.viewYear--; } renderMonthCalendar(el, events, nav); });
  el.querySelector('#mc-next').addEventListener('click', () => { nav.viewMonth++; if (nav.viewMonth > 11) { nav.viewMonth = 0; nav.viewYear++; } renderMonthCalendar(el, events, nav); });
  el.querySelectorAll('.cal-cell[data-date]').forEach(cell => cell.addEventListener('click', () => { nav.selectedDate = cell.dataset.date; renderMonthCalendar(el, events, nav); }));
}
function iconChevron(dir) { return dir === 'left' ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'; }

/* Homework Assignments — merges two sources into one list:
   1) Assignments the teacher pushed from TeachersDeck (SDCloud.subscribeHomework,
      read-only). "Done" is tracked locally per student in state.hwDone, same as
      before (that's what awardXP dedupes against — the backend has no per-student
      XP-award table) — but a checked box is now ALSO written to
      students/{studentId}/homeworkDone/{assignmentId} via SDCloud.setHomeworkDone(),
      so ParentDeck's Homework widget can show completion and fire a "finished"
      notification. If setHomeworkDone() fails (offline, or the rule below isn't
      deployed yet), the local checkbox still sticks and state.hwPending queues the
      id to retry next time this widget draws or the app reconnects — completion
      isn't lost, it's just late reaching the parent. Requires a firestore.rule
      letting a student create/update their own students/{uid}/homeworkDone/* docs
      (see js/cloud.js's setHomeworkDone comment) and a guardian read that same
      subcollection for a linked child — same shape as the existing homework rule.
   2) The student's own local tasks (state.todo), unchanged from before —
      add/tick/delete all work exactly as they did. */
function renderTodo(b) {
  let assignments = [], hwErr = null, calEvents = [], calOpen = false;
  const calNav = { viewYear: new Date().getFullYear(), viewMonth: new Date().getMonth(), selectedDate: dayKey(Date.now()) };
  b.innerHTML = `<button class="chip" id="hw-cal-toggle" style="margin-bottom:8px">\ud83d\udcc5 ${V('Calendar', 'Lịch')}</button>
    <div id="hw-cal-wrap" hidden></div>
    <div id="hw-teacher"></div>
    <p class="drawer-label" style="margin-top:10px">${V('My list', 'Danh sách của tôi')}</p>
    <div class="row"><input type="text" id="ti" placeholder="${U(V('Add homework or a task…', 'Thêm bài tập về nhà hoặc việc cần làm…'), V('Add an assignment or a task…', 'Thêm bài tập hoặc việc cần làm…'))}" maxlength="120" style="flex:1" aria-label="${V('New task', 'Việc mới')}"><button class="btn primary" data-a="add">${V('Add', 'Thêm')}</button></div>
    <ul id="tl"></ul><div class="row"><span class="muted" id="tc"></span><button class="btn" data-a="clear" style="margin-left:auto">${V('Clear done', 'Xóa việc đã xong')}</button></div>`;

  function drawCal() {
    if (!calOpen) return;
    renderMonthCalendar($('#hw-cal-wrap', b), calEvents, calNav);
  }
  $('#hw-cal-toggle', b).addEventListener('click', () => {
    calOpen = !calOpen;
    $('#hw-cal-wrap', b).hidden = !calOpen;
    $('#hw-cal-toggle', b).classList.toggle('on', calOpen);
    drawCal();
  });

  function drawTeacher() {
    const el = $('#hw-teacher', b);
    if (hwErr) { el.innerHTML = `<p class="drawer-label" style="color:#e05353">${V(`Couldn\u2019t load assignments from your teacher (${esc(hwErr)}). Ask your teacher to check Cloud Class sync.`, `Không tải được bài tập từ giáo viên (${esc(hwErr)}). Hãy nhờ giáo viên kiểm tra đồng bộ Lớp học trực tuyến.`)}</p>`; return; }
    if (!assignments.length) { el.innerHTML = ''; return; }
    const today = dayKey(Date.now());
    el.innerHTML = `<p class="drawer-label">${U(V('From your teacher', 'Từ giáo viên của bạn'), V('From your instructor', 'Từ giảng viên của bạn'))}</p><ul id="hw-list">${assignments.map(a => {
      const done = !!state.hwDone[a.id];
      const pending = state.hwPending && state.hwPending[a.id];
      const overdue = !done && a.dueDate && a.dueDate < today;
      return `<li class="${done ? 'done' : ''}${(state.hwLinks['a:' + a.id] || { docs: [] }).docs.length ? ' hasdocs' : ''}"><label><input type="checkbox" data-hw="${a.id}" ${done ? 'checked' : ''}>
        <span>${esc(a.title || V('Assignment', 'Bài tập'))}${a.subject ? ` <span class="muted">· ${esc(a.subject)}</span>` : ''}</span></label>
        <span class="muted" style="${overdue ? 'color:#e05353' : ''}">${a.dueDate ? esc(a.dueDate) + (a.dueTime ? ' ' + esc(a.dueTime) : '') : ''}${a.points ? ' · ' + a.points + V('pt', ' điểm') : ''}${pending ? ' · \u2601\ufe0f\u200b ' + V('syncing\u2026', 'đang đồng bộ\u2026') : ''}</span>${hwDocsHtml('a:' + a.id)}</li>`;
    }).join('')}</ul>`;
  }
  /* Push any check-offs that didn't make it to the backend last time (offline,
     rule not deployed yet, etc.) — tried again each time the widget draws and
     whenever Cloud Class reconnects (see the onStatusChanged hook below). */
  function retryPending() {
    if (!state.hwPending) return;
    Object.keys(state.hwPending).forEach(id => {
      const a = assignments.find(x => x.id === id);
      if (!a) return;
      SDCloud.setHomeworkDone(a, true, { backfilled: true }).then(ok => {
        if (ok) { delete state.hwPending[id]; save(); drawTeacher(); }
      });
    });
  }
  function draw() {
    const L = state.todo;
    $('#tl', b).innerHTML = L.map(t => `<li class="${t.done ? 'done' : ''}${(state.hwLinks['t:' + t.id] || { docs: [] }).docs.length ? ' hasdocs' : ''}"><label><input type="checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}</span></label><button class="x" data-del="${t.id}" aria-label="${V('Delete task', 'Xóa việc')}">×</button>${hwDocsHtml('t:' + t.id)}</li>`).join('') || `<li class="muted">${V('No tasks yet — add one above.', 'Chưa có việc nào — hãy thêm ở trên.')}</li>`;
    $('#tc', b).textContent = L.length ? V(`${L.filter(t => t.done).length} of ${L.length} done`, `Xong ${L.filter(t => t.done).length}/${L.length}`) : '';
  }
  function add() {
    const i = $('#ti', b), text = i.value.trim(); if (!text) return;
    state.todo.push({ id: uid(), text, done: false, awarded: false }); i.value = ''; save(); draw();
  }
  b.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a, del = e.target.closest('[data-del]')?.dataset.del;
    const od = e.target.closest('[data-opendoc]')?.dataset.opendoc; if (od) { openDocById(od); return; }
    if (a === 'add') add();
    else if (a === 'clear') { state.todo = state.todo.filter(t => !t.done); save(); draw(); }
    else if (del) { state.todo = state.todo.filter(t => t.id !== del); save(); draw(); }
  });
  b.addEventListener('change', e => {
    if (e.target.dataset.hw) {
      const id = e.target.dataset.hw, checked = e.target.checked, wasDone = !!state.hwDone[id];
      state.hwDone[id] = checked;
      if (checked && !wasDone) { stat('hw'); awardXP('todo', 3, { id }); }   // once per assignment, same as local tasks
      if (!state.hwPending) state.hwPending = {};
      const a = assignments.find(x => x.id === id);
      save(); drawTeacher();
      if (a) {
        SDCloud.setHomeworkDone(a, checked).then(ok => {
          if (ok) { delete state.hwPending[id]; }
          else { state.hwPending[id] = true; }   // couldn't reach the backend — retried by retryPending()
          save(); drawTeacher();
        });
      }
      return;
    }
    const t = state.todo.find(x => x.id === e.target.dataset.id); if (!t) return;
    t.done = e.target.checked;
    if (t.done && !t.awarded) { t.awarded = true; stat('hw'); awardXP('todo', 3, { id: t.id }); }   // once per task, so un/re-ticking can't farm XP
    save(); draw();
  });
  $('#ti', b).addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  draw();
  // (Re)subscribe whenever the class connection changes. A returning student's Homework widget is usually restored at startup,
  // BEFORE SDCloud.autoResume() has finished — subscribeHomework/subscribeCalendar return a no-op until the student is joined, so
  // subscribing only once (as v0.9.0 and earlier did) left the teacher's assignments empty until the widget was closed and reopened.
  // onStatusChanged also fires immediately with the current status, so this covers "already joined" too.
  let unsubHw = () => {}, unsubCal = () => {};
  const attach = () => {
    unsubHw(); unsubCal();
    unsubHw = SDCloud.subscribeHomework((list, err) => { assignments = list; hwErr = err ? ((err.code || err.message) || V('unknown error', 'lỗi không xác định')) : null; if (!err) cacheHomework(list); drawTeacher(); retryPending(); });
    unsubCal = SDCloud.subscribeCalendar(list => { calEvents = list; drawCal(); });
  };
  const unsubStatus = SDCloud.onStatusChanged(status => {
    attach();
    if (status === 'joined') retryPending(); else { assignments = []; calEvents = []; hwErr = null; drawTeacher(); drawCal(); }   // left the class: don't keep showing its homework
  });
  const redraw = () => { draw(); drawTeacher(); }; todoRedraw = redraw;
  return () => { unsubHw(); unsubStatus(); unsubCal(); if (todoRedraw === redraw) todoRedraw = null; };
}

function renderReading(b) {
  b.innerHTML = `<div class="stat"><div><b id="rt">0</b><span class="muted">${V('min today', 'phút hôm nay')}</span></div><div><b id="rw">0</b><span class="muted">${V('min this week', 'phút tuần này')}</span></div></div>
    <div class="row"><input type="text" id="rb" placeholder="${V('What are you reading?', 'Bạn đang đọc gì?')}" maxlength="80" style="flex:1" aria-label="${V('Book or text', 'Sách hoặc bài đọc')}"></div>
    <div class="row"><input type="number" id="rm" min="1" max="600" value="15" style="width:74px" aria-label="${V('Minutes read', 'Số phút đã đọc')}"><span class="muted">${V('min', 'phút')}</span>
      <button class="btn primary" data-a="add">${V('Add to log', 'Thêm vào nhật ký')}</button><button class="btn" data-a="sw"></button></div>
    <p class="muted" id="rs"></p><ul id="rl"></ul>`;
  const R = () => state.reading;
  function draw() {
    const E = R().entries, today = dayKey(Date.now()), wk = Date.now() - 7 * 864e5;
    $('#rt', b).textContent = E.filter(e => e.date === today).reduce((s, e) => s + e.min, 0);
    $('#rw', b).textContent = E.filter(e => new Date(e.date + 'T12:00').getTime() > wk).reduce((s, e) => s + e.min, 0);
    $('#rl', b).innerHTML = E.slice(-8).reverse().map(e => `<li><span>${e.doc ? '📄 ' : ''}${esc(e.book || V('Reading', 'Đọc sách'))} <span class="muted">· ${e.date}</span></span><span>${e.min} ${V('min', 'phút')} <button class="x" data-del="${e.id}" aria-label="${V('Delete entry', 'Xóa mục')}">×</button></span></li>`).join('') || `<li class="muted">${V('No entries yet.', 'Chưa có mục nào.')}</li>`;
    const run = !!R().startedAt;
    b.querySelector('[data-a=sw]').textContent = run ? V('Stop reading', 'Dừng đọc') : V('Start reading timer', 'Bắt đầu hẹn giờ đọc');
    $('#rs', b).textContent = run ? V(`Reading… ${Math.max(0, Math.floor((Date.now() - R().startedAt) / 60000))} min so far`, `Đang đọc… đã được ${Math.max(0, Math.floor((Date.now() - R().startedAt) / 60000))} phút`) : '';
  }
  b.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a, del = e.target.closest('[data-del]')?.dataset.del;
    if (a === 'add') {
      const min = clamp(Math.round(+$('#rm', b).value) || 0, 0, 600);
      if (!min) { toast(V('Enter how many minutes you read.', 'Hãy nhập số phút bạn đã đọc.')); return; }
      R().entries.push({ id: uid(), date: dayKey(Date.now()), book: $('#rb', b).value.trim(), min });
      save(); draw(); stat('readEntries'); stat('readMin', min); awardXP('reading', min, {});
    } else if (a === 'sw') {
      if (R().startedAt) { $('#rm', b).value = Math.max(1, Math.round((Date.now() - R().startedAt) / 60000)); R().startedAt = 0; toast(V('Timer stopped — press “Add to log” to save it.', 'Đã dừng hẹn giờ — bấm “Thêm vào nhật ký” để lưu.')); }
      else R().startedAt = Date.now();
      save(); draw();
    } else if (del) { R().entries = R().entries.filter(x => x.id !== del); save(); draw(); }
  });
  readingRedraw = draw; draw(); const iv = setInterval(draw, 20000);
  return () => { clearInterval(iv); if (readingRedraw === draw) readingRedraw = null; };
}

function bestOf(g) { const S = state.games.scores[g.folder]; return S && S.best !== null ? ` · ${V('Best', 'Cao nhất')}: ${S.best} ${g.scoreLabel || ''}` : ''; }
function renderGames(b) {
  b.innerHTML = `<p class="muted" style="margin:0 0 8px">${V('Pick a game to play.', 'Chọn một trò chơi để chơi.')}</p><div id="gl"><p class="muted">${V('Loading games…', 'Đang tải trò chơi…')}</p></div>`;
  let list = GAMES, dead = false;
  const draw = () => {
    $('#gl', b).innerHTML = list.map((g, i) => `<div class="gtile"><div><b>${esc(g.name)}</b><div class="muted">${V('Finished', 'Đã hoàn thành')} ${state.games.plays[g.folder] || 0}×${bestOf(g)}</div></div>
      <div class="row" style="margin:0"><button class="btn primary" data-play="${i}">${V('Play', 'Chơi')}</button>${g.instructions ? `<button class="btn" data-help="${i}" aria-label="${V('How to play', 'Cách chơi')} ${esc(g.name)}">?</button>` : ''}</div></div>`).join('')
      || `<p class="muted">${V('No games installed.', 'Chưa cài trò chơi nào.')}</p>`;
  };
  draw();
  b.addEventListener('click', e => {
    const p = e.target.closest('[data-play]')?.dataset.play, h = e.target.closest('[data-help]')?.dataset.help;
    if (p !== undefined) playGame(list[p]); else if (h !== undefined) openHelp(list[h]);
  });
  gamesRedraw = draw;
  return () => { dead = true; gamesRedraw = null; };
}

/* Game stage: full-screen overlay with the game in a sandboxed iframe (games use inline scripts, which extension
   pages forbid — manifest.json lists games/* as sandbox pages). Games report back with postMessage:
   { type:'sd-xp', game, result, score }. */
let gamesRedraw = null, stageGame = null;
const gameUrl = (g, f) => `games/${g.folder}/${f}`;
function openHelp(g) { if (g && g.instructions) window.open(gameUrl(g, g.instructions), '_blank', 'noopener'); }
function playGame(g) {
  if (!g) return; stageGame = g; stat('gamesStarted');
  $('#s-title').textContent = g.name; $('#s-help').hidden = !g.instructions;
  $('#s-frame').title = g.name; $('#s-frame').src = gameUrl(g, g.entry); $('#stage').hidden = false;
}
function leaveGame() { $('#stage').hidden = true; $('#s-frame').src = 'about:blank'; stageGame = null; }
$('#s-back').addEventListener('click', leaveGame);
$('#s-help').addEventListener('click', () => openHelp(stageGame));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stageGame) leaveGame(); });
window.addEventListener('message', e => {
  const d = e.data;
  if (!stageGame || e.source !== $('#s-frame').contentWindow || !d || d.type !== 'sd-xp') return;   // sandboxed origin is "null", so match on the frame
  const g = stageGame, id = g.folder, score = Number.isFinite(d.score) ? d.score : null;
  state.games.plays[id] = (state.games.plays[id] || 0) + 1;
  if (score !== null) {
    const S = state.games.scores[id] || (state.games.scores[id] = { best: null, last: null }); S.last = score;
    if (S.best === null || (g.better === 'low' ? score < S.best : score > S.best)) S.best = score;
  }
  save(); stat('games'); toast(V('Game finished — well played!', 'Kết thúc trò chơi — chơi hay lắm!'));
  awardXP('game', 10 + (score !== null && g.bonus ? g.bonus(score) : 0), { game: id, result: d.result, score });
  if (gamesRedraw) gamesRedraw();
});

function renderIdiom(b) {
  const N = IDIOM_BANK.length, now = new Date();
  const todayIdx = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5) % N;
  let idx = todayIdx;
  function draw() {
    const it = IDIOM_BANK[idx], got = state.idiom.learned.includes(it.phrase);
    b.innerHTML = `<div class="idiom"><h3>${esc(it.phrase)}</h3><p><b>${V('Meaning:', 'Nghĩa:')}</b> ${esc(it.meaning)}</p><p><b>${V('Example:', 'Ví dụ:')}</b> <i>${esc(it.example)}</i></p></div>
      <div class="row"><button class="btn primary" data-a="got" ${got ? 'disabled' : ''}>${got ? V('Learned ✓', 'Đã học ✓') : V('Got it!', 'Đã hiểu!')}</button><button class="btn" data-a="more">${V('Show another', 'Xem câu khác')}</button><button class="btn" data-a="save" title="${V('Add this idiom to your word bank', 'Thêm thành ngữ này vào kho từ vựng')}">＋ ${V('Word bank', 'Kho từ vựng')}</button>${idx === todayIdx ? '' : `<button class="btn" data-a="today">${V('Back to today', 'Về câu hôm nay')}</button>`}</div>
      <p class="muted">${V('Idioms learned', 'Thành ngữ đã học')}: ${state.idiom.learned.length}/${N}</p>`;
  }
  b.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'more') idx = (idx + 1 + Math.floor(Math.random() * (N - 1))) % N;     // never the same one twice in a row
    else if (a === 'today') idx = todayIdx;
    else if (a === 'save') { const it = IDIOM_BANK[idx]; toast(bankMsg(bankAdd({ term: it.phrase, meaning: it.meaning, example: it.example, from: 'idiom' }))); return; }
    else if (a === 'got') {
      const it = IDIOM_BANK[idx], I = state.idiom, today = dayKey(Date.now());
      if (!I.learned.includes(it.phrase)) { I.learned.push(it.phrase); stat('idioms'); }
      toast(V('Nice — idiom learned!', 'Tuyệt — đã học thêm một thành ngữ!'));
      if (I.awardDate !== today) { I.awardDate = today; awardXP('idiom', 5, { phrase: it.phrase }); }   // once a day
      save();
    }
    draw();
  });
  draw();
}

const dayActive = r => Object.entries((r && r.timeBy) || {}).reduce((a, [w, n]) => a + (w === DOC_KEY ? 0 : n), 0);   // seconds active in widgets that day (document time overlaps it)
const fmtT = s => s >= 3600 ? `${Math.floor(s / 3600)}h ${pad(Math.floor(s % 3600 / 60))}m` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;
function renderStats(b) {
  let range = 'today';
  b.innerHTML = `<div class="sx-top"><div id="sx-lvl"></div><div class="sx-ctl"><div class="row" role="group" aria-label="${V('Time range', 'Khoảng thời gian')}">${[['today', V('Today', 'Hôm nay')], ['week', V('7 days', '7 ngày')], ['month', V('30 days', '30 ngày')], ['all', V('All time', 'Toàn bộ')]].map(([k, l]) => `<button class="chip" data-r="${k}">${l}</button>`).join('')}</div>
    <div class="row"><button class="btn" id="sx-sync-btn">${U(V('☁️ Sync to ParentDeck', '☁️ Đồng bộ lên ParentDeck'), V('☁️ Sync now', '☁️ Đồng bộ ngay'))}</button><span class="muted" id="sx-sync-msg"></span></div></div></div><div class="sx-medals"><div class="bstrip" id="badge-strip" aria-label="${V('Your badges', 'Huy hiệu của bạn')}"></div><button class="btn" data-open-badges>🏅 ${V('Badges & Rewards', 'Huy hiệu & Phần thưởng')} →</button></div><div id="sx-body" class="sx-grid"></div>`;
  const D = () => state.stats.daily, back = n => dayKey(Date.now() - n * 864e5);
  const dayKeys = () => { const all = Object.keys(D()), t = dayKey(Date.now()); return range === 'today' ? all.filter(k => k === t) : range === 'week' ? all.filter(k => k >= back(6)) : range === 'month' ? all.filter(k => k >= back(29)) : all; };
  const bars = rows => { const mx = Math.max(1, ...rows.map(r => r.v)); return rows.map((r, n) => `<div class="bar" style="--n:${n}"><span>${esc(r.l)}</span><div><i style="width:${Math.round(r.v / mx * 100)}%"></i></div><b>${esc(r.t)}</b></div>`).join('') || `<p class="muted">${V('Nothing yet.', 'Chưa có gì.')}</p>`; };
  let ci = 0, fx = true;                                                    // ci: card number (for the staggered entrance); fx: play the entrance this time (first draw, and when the range changes)
  const card = (title, html, cls = '') => `<section class="sx-card ${cls}" style="--i:${ci++}"><h4>${title}</h4>${html}</section>`;
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;      // everything below respects the system "reduce motion" setting (CSS does too)
  // Same stoplight formula/colours as AdminDeck's School Stats, ParentDeck's Student Summary and TeachersDeck's My Stats & XP.
  // 'trend' (every raw-count tile below) judges % change vs the period right before it, same as AdminDeck's Homework/Reading/Focus/Active-time tiles.
  const STOPLIGHT = { days:{ good:4, watch:2 }, share:{ good:70, watch:40 }, trend:{ good:0, watch:-10 } };
  const stoplight = (kind, v) => { const r = STOPLIGHT[kind]; if (!r || v == null) return null;
    if (v >= r.good) return 'good'; if (v >= r.watch) return 'watch'; return 'bad'; };
  const stPct = (cur, prev) => (prev > 0 ? Math.round((cur - prev) / prev * 100) : null);
  const prevDayKeys = () => { if (range === 'all') return null;
    return range === 'today' ? [back(1)] : range === 'week' ? Array.from({ length:7 }, (_, i) => back(7 + i)) : Array.from({ length:30 }, (_, i) => back(30 + i)); };
  const sumBasic = ks => { const s = { xp:0, hw:0, readEntries:0, readMin:0, focus:0, games:0, gamesStarted:0, idioms:0, wordsSaved:0, cardsReviewed:0, translations:0, lookups:0, notes:0, totalT:0, docT:0, activeDays:0 };
    ks.forEach(k => { const r = D()[k]; if (!r) return;
      ['xp', 'hw', 'readEntries', 'readMin', 'focus', 'games', 'gamesStarted', 'idioms', 'wordsSaved', 'cardsReviewed', 'translations', 'lookups', 'notes'].forEach(f => { s[f] += r[f] || 0; });
      Object.entries(r.timeBy || {}).forEach(([w, n]) => { if (w !== DOC_KEY) s.totalT += n; else s.docT += n; });
      if ((r.xp || 0) > 0) s.activeDays++; });
    return s; };
  function countUp(el, delay = 0) {                                          // 0 -> its own number, easing out; text after the number (units, dates) stays put
    if (!el || still()) return;
    const raw = el.dataset.raw || (el.dataset.raw = el.textContent), m = /^(\d+(?:\.\d+)?)(.*)$/s.exec(raw); if (!m || +m[1] === 0) return;
    const end = +m[1], dec = (m[1].split('.')[1] || '').length, t0 = performance.now() + delay, dur = 750; cancelAnimationFrame(el._raf);
    const step = now => { const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3); el.textContent = (end * e).toFixed(dec) + m[2]; if (k < 1) el._raf = requestAnimationFrame(step); else el.textContent = raw; };
    el.textContent = '0' + m[2]; el._raf = requestAnimationFrame(step);
  }
  function sparkleBurst(host, x, y, n = 12) {                                // a little shower of stars at a point inside `host`
    if (still() || !host) return;
    for (let i = 0; i < n; i++) { const p = document.createElement('s'), a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 42;
      p.className = 'sx-spark'; p.textContent = Math.random() < 0.5 ? '\u2726' : '\u2727'; p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 14}px;animation-delay:${Math.random() * 0.25}s;font-size:${9 + Math.random() * 9}px`;
      host.appendChild(p); setTimeout(() => p.remove(), 1300); }
  }
  function bestStreak() {                                                     // longest run of consecutive days with any XP, from the daily records
    const ks = Object.keys(D()).filter(k => (D()[k].xp || 0) > 0).sort(); let best = 0, run = 0, prev = 0;
    ks.forEach(k => { const t = new Date(k + 'T12:00').getTime(); run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; prev = t; best = Math.max(best, run); });
    return best;
  }
  const sumDays = (from, to, f) => { let n = 0; for (let i = from; i <= to; i++) n += (D()[back(i)] || {})[f] || 0; return n; };
  function heatmap() {                                                        // last 16 weeks, Monday at the top, today in the last column
    const now = new Date(); now.setHours(12, 0, 0, 0);
    const monday = new Date(now.getTime() - ((now.getDay() + 6) % 7) * 864e5), start = monday.getTime() - 15 * 7 * 864e5, today = dayKey(now);
    const cells = Array.from({ length: 16 * 7 }, (_, i) => { const k = dayKey(start + i * 864e5); return { k, v: k > today ? -1 : XP_ON ? (D()[k] || {}).xp || 0 : dayActive(D()[k]) }; });
    const mx = Math.max(1, ...cells.map(c => c.v));
    return `<div class="heat" role="img" aria-label="${XP_ON ? V('XP per day over the last 16 weeks', 'XP mỗi ngày trong 16 tuần qua') : V('Study time per day over the last 16 weeks', 'Thời gian học mỗi ngày trong 16 tuần qua')}">${cells.map((c, n) => `<i class="${c.v < 0 ? 'f' : c.v === 0 ? '' : 'l' + Math.min(4, Math.ceil(c.v / mx * 4))}" style="--n:${n};--d:${((n * 37) % 23) / 10}s" title="${c.k}${c.v >= 0 ? ': ' + (XP_ON ? c.v + ' XP' : fmtT(c.v)) : ''}"></i>`).join('')}</div>
      <p class="muted" style="margin:6px 0 0">${V('Each square is a day (Monday at the top). Brighter = ', 'Mỗi ô là một ngày (thứ Hai ở trên cùng). Càng sáng = ')}${XP_ON ? V('more XP', 'càng nhiều XP') : V('more study time', 'học càng lâu')}.</p>`;
  }
  function draw() {
    const T = { xp: 0, hw: 0, readEntries: 0, readMin: 0, focus: 0, games: 0, gamesStarted: 0, idioms: 0, wordsSaved: 0, cardsReviewed: 0, translations: 0, lookups: 0, notes: 0 }, xpBy = {}, timeBy = {};
    ci = 0; const ks = dayKeys();
    ks.forEach(k => { const r = D()[k];
      Object.keys(T).forEach(f => { T[f] += r[f] || 0; });
      Object.entries(r.xpBy || {}).forEach(([s, n]) => { xpBy[s] = (xpBy[s] || 0) + n; });
      Object.entries(r.timeBy || {}).forEach(([w, n]) => { timeBy[w] = (timeBy[w] || 0) + n; }); });
    const X = state.xp, L = levelInfo(X.total), m = streakMult(), totalT = Object.entries(timeBy).filter(([k]) => k !== DOC_KEY).reduce((a, [, c]) => a + c, 0), docT = timeBy[DOC_KEY] || 0;   // document time overlaps widget time, so it isn't added to it
    const pct = Math.round(L.into / L.need * 100);
    $('#sx-lvl', b).innerHTML = `<div class="lvl"><div class="big">${V('Lv', 'Cấp')} ${L.level}</div><div style="flex:1"><div class="xpbar wide"><i style="width:${fx && !still() ? 0 : pct}%"></i></div>
      <div class="muted">${V(`${L.into} / ${L.need} XP to level ${L.level + 1} · ${X.total} XP total`, `${L.into} / ${L.need} XP để lên cấp ${L.level + 1} · tổng ${X.total} XP`)}</div></div></div>
      <p class="muted" style="margin:6px 0">🔥 ${V(`Streak: ${X.streak} day${X.streak === 1 ? '' : 's'} · best ${Math.max(bestStreak(), X.streak)}`, `Chuỗi ngày: ${X.streak} ngày · dài nhất ${Math.max(bestStreak(), X.streak)}`)}${m > 1 && XP_ON ? ` · ×${m.toFixed(1)} ${V('XP bonus', 'thưởng XP')}` : ''}</p>`;
    b.querySelectorAll('[data-r]').forEach(c => c.classList.toggle('on', c.dataset.r === range));
    const active = ks.filter(k => (D()[k].xp || 0) > 0), best = active.reduce((a, k) => (D()[k].xp > (a ? D()[a].xp : 0) ? k : a), '');
    const daysSt = range === 'week' ? stoplight('days', active.length) : null;       // day-count thresholds assume a 7-day week
    const badgesEarnedN = Object.keys(state.badges.earned).length;
    const badgesSt = stoplight('share', Math.round(badgesEarnedN / BADGES.length * 100)); // % of a fixed total — valid at any range
    const prevKeys = prevDayKeys(), P = prevKeys ? sumBasic(prevKeys) : null;         // null on "all time" — no equal-length period before it
    const trendSt = (cur, prevVal) => P ? stoplight('trend', stPct(cur, prevVal)) : null;
    const avgXp = active.length ? Math.round(T.xp / active.length) : 0, prevAvgXp = P && P.activeDays ? Math.round(P.xp / P.activeDays) : null;
    const tiles = [['XP earned', T.xp, trendSt(T.xp, P && P.xp)], ['Active days', active.length, daysSt], ['Average XP / active day', avgXp, trendSt(avgXp, prevAvgXp)], ['Best day', best ? `${D()[best].xp} XP · ${new Date(best + 'T12:00').toLocaleDateString(LOC(), { month: 'short', day: 'numeric' })}` : '—'],
      [U(V('Homework done', 'Bài tập về nhà đã xong'), V('Assignments done', 'Bài tập đã xong')), T.hw, trendSt(T.hw, P && P.hw)], ['Reading', V(`${T.readEntries} entr${T.readEntries === 1 ? 'y' : 'ies'} · ${T.readMin} min`, `${T.readEntries} mục · ${T.readMin} phút`), trendSt(T.readMin, P && P.readMin)], ['Games played', V(`${T.gamesStarted} (${T.games} finished)`, `${T.gamesStarted} (${T.games} đã xong)`), trendSt(T.games, P && P.games)], ['Focus sessions', T.focus, trendSt(T.focus, P && P.focus)],
      ['Active time', fmtT(totalT), trendSt(totalT, P && P.totalT)], ['Time with documents', fmtT(docT), trendSt(docT, P && P.docT)], ['Words saved', T.wordsSaved, trendSt(T.wordsSaved, P && P.wordsSaved)], ['Cards reviewed', T.cardsReviewed, trendSt(T.cardsReviewed, P && P.cardsReviewed)], ['Translations', T.translations, trendSt(T.translations, P && P.translations)], ['Dictionary look-ups', T.lookups, trendSt(T.lookups, P && P.lookups)], [U(V('Notepad lines', 'Dòng trong sổ tay'), V('Note lines', 'Dòng ghi chú')), T.notes, trendSt(T.notes, P && P.notes)], ['Idioms learned', T.idioms, trendSt(T.idioms, P && P.idioms)], ['Badges earned', `${badgesEarnedN} / ${BADGES.length}`, badgesSt]].filter(([l]) => !(UNI && ['Games played', 'Idioms learned', 'Badges earned'].includes(l)) && !(!XP_ON && ['XP earned', 'Average XP / active day', 'Best day'].includes(l)))
      .map(([l, v, st]) => [V(l, { 'XP earned': 'XP đã nhận', 'Active days': 'Ngày có học', 'Average XP / active day': 'XP trung bình / ngày có học', 'Best day': 'Ngày tốt nhất', Reading: 'Đọc sách', 'Games played': 'Trò chơi đã chơi', 'Focus sessions': 'Phiên tập trung', 'Active time': 'Thời gian học',
        'Time with documents': 'Thời gian đọc tài liệu', 'Words saved': 'Từ đã lưu', 'Cards reviewed': 'Thẻ đã ôn', Translations: 'Lượt dịch', 'Dictionary look-ups': 'Lượt tra từ điển', 'Idioms learned': 'Thành ngữ đã học', 'Badges earned': 'Huy hiệu đã đạt' }[l] || l), v, st]);   // labels above stay English for the filters; translated here
    const xpRows = Object.keys({ ...XP_RULES, ...xpBy }).map(s => ({ l: srcLabel(s), v: xpBy[s] || 0, t: (xpBy[s] || 0) + ' XP' })).filter(r => r.v).sort((a, c) => c.v - a.v);
    const timeRows = [...WIDGETS.map(w => ({ id: w.id, l: stripLeadingEmoji(w.title) })), { id: DOC_KEY, l: V('Open documents', 'Tài liệu đang mở') }].map(w => ({ l: w.l, v: timeBy[w.id] || 0, t: fmtT(timeBy[w.id] || 0) })).filter(r => r.v).sort((a, c) => c.v - a.v);
    const docRows = Object.values(state.docTime).filter(e => e.secs).sort((a, c) => c.secs - a.secs).slice(0, 6).map(e => ({ l: (e.kind === 'pdf' ? '\ud83d\udcd5 ' : '\ud83d\udd17 ') + e.name, v: e.secs, t: fmtT(e.secs) }));
    const nCols = range === 'month' || range === 'all' ? 30 : 7, colsD = Array.from({ length: nCols }, (_, i) => { const k = back(nCols - 1 - i); return { k, v: XP_ON ? (D()[k] || {}).xp || 0 : Math.round(dayActive(D()[k]) / 60) }; }), mxc = Math.max(1, ...colsD.map(d => d.v));
    const trend = [['XP', 'xp'], [V('Reading (min)', 'Đọc sách (phút)'), 'readMin'], [U(V('Homework done', 'Bài tập về nhà đã xong'), V('Assignments done', 'Bài tập đã xong')), 'hw'], [V('Focus sessions', 'Phiên tập trung'), 'focus'], [V('Games finished', 'Trò chơi đã xong'), 'games'], [V('Words saved', 'Từ đã lưu'), 'wordsSaved'], [U(V('Notepad lines', 'Dòng trong sổ tay'), V('Note lines', 'Dòng ghi chú')), 'notes']].filter(([, f]) => !(f === 'xp' && !XP_ON) && !(f === 'games' && UNI)).map(([l, f], n) => {
      const a = sumDays(0, 6, f), c = sumDays(7, 13, f), d = a - c;
      return `<tr style="--n:${n}"><td>${l}</td><td>${a}</td><td>${c}</td><td class="${d > 0 ? 'up' : d < 0 ? 'dn' : ''}">${d > 0 ? '▲ +' + d : d < 0 ? '▼ −' + Math.abs(d) : '—'}</td></tr>`; }).join('');
    const rowsN = range === 'all' ? 21 : range === 'month' ? 14 : 7;
    const daily = Array.from({ length: rowsN }, (_, i) => { const k = back(i), r = D()[k] || {}, mo = moodOn(k), emo = mo ? (MOODS.find(x => x[0] === mo) || [, '·'])[1] : '·';
      return `<tr style="--n:${i}"><td>${new Date(k + 'T12:00').toLocaleDateString(LOC(), { weekday: 'short', month: 'short', day: 'numeric' })}</td>${XP_ON ? `<td>${r.xp || 0}</td>` : ''}${UNI ? `<td>${fmtT(dayActive(r))}</td>` : ''}<td>${r.readMin || 0}</td><td>${r.hw || 0}</td><td>${r.focus || 0}</td>${UNI ? '' : `<td>${r.games || 0}</td>`}<td>${r.notes || 0}</td><td>${emo}</td></tr>`; }).join('');
    const mood14 = Array.from({ length: 14 }, (_, i) => { const k = back(13 - i), mo = moodOn(k); return `<span class="mo" style="--n:${i}" title="${k}">${mo ? (MOODS.find(x => x[0] === mo) || [, '·'])[1] : '·'}</span>`; }).join('');
    const NP = state.notes.pages, noteLines = NP.reduce((n, p) => n + p.lines.length, 0), today = dayKey(Date.now()), linesToday = NP.reduce((n, p) => n + p.lines.filter(l => dayKey(l.t) === today).length, 0), xpNotesToday = ((D()[today] || {}).xpBy || {}).notes || 0;
    $('#sx-body', b).innerHTML = [
      card(V('Highlights', 'Điểm nổi bật'), `<div class="ss-stlegend"><span class="ss-st ss-stkey" data-st="good">${V('On track', 'Đúng hướng')}</span><span class="ss-st ss-stkey" data-st="watch">${V('Monitor', 'Cần theo dõi')}</span><span class="ss-st ss-stkey" data-st="bad">${V('Needs attention', 'Cần chú ý')}</span>
        <details><summary>${V('How are these colours worked out?', 'Các màu này được tính thế nào?')}</summary>${V(`<p>Active days this week: ${STOPLIGHT.days.good}+ is on track, ${STOPLIGHT.days.watch}–${STOPLIGHT.days.good} is worth monitoring, below ${STOPLIGHT.days.watch} needs attention.</p><p>Share of a total (e.g. badges): ${STOPLIGHT.share.good}%+ is on track, ${STOPLIGHT.share.watch}–${STOPLIGHT.share.good}% is worth monitoring, below ${STOPLIGHT.share.watch}% needs attention.</p><p>Everything else is judged against the period right before it of the same length: flat or up is on track, down to 10% is worth monitoring, down more than that needs attention.</p>`, `<p>Số ngày có học trong tuần: từ ${STOPLIGHT.days.good} trở lên là đúng hướng, ${STOPLIGHT.days.watch}–${STOPLIGHT.days.good} là cần theo dõi, dưới ${STOPLIGHT.days.watch} là cần chú ý.</p><p>Tỉ lệ trên tổng số (ví dụ huy hiệu): từ ${STOPLIGHT.share.good}% trở lên là đúng hướng, ${STOPLIGHT.share.watch}–${STOPLIGHT.share.good}% là cần theo dõi, dưới ${STOPLIGHT.share.watch}% là cần chú ý.</p><p>Mọi chỉ số khác được so với khoảng thời gian dài bằng ngay trước đó: giữ nguyên hoặc tăng là đúng hướng, giảm đến 10% là cần theo dõi, giảm nhiều hơn là cần chú ý.</p>`)}</details></div>
        <div class="tiles wide">${tiles.map(([l, v, st], n) => `<div class="tile" style="--n:${n}"${st ? ` data-st="${st}"` : ''}><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>`, 'wide'),
      XP_ON ? card(V('XP by source', 'XP theo nguồn'), bars(xpRows)) : '',
      card(`${XP_ON ? V('XP per day', 'XP mỗi ngày') : V('Study minutes per day', 'Số phút học mỗi ngày')} <span class="muted">${V(`(last ${nCols} days)`, `(${nCols} ngày qua)`)}</span>`, `<div class="cols big${nCols > 7 ? ' dense' : ''}">${colsD.map((d, n) => `<div class="col" style="--n:${n}" data-v="${d.v} ${XP_ON ? 'XP' : V('min', 'phút')}" title="${d.k}: ${d.v} ${XP_ON ? 'XP' : V('min', 'phút')}"><em>${nCols > 7 ? '' : (d.v || '')}</em><i style="height:${Math.round(d.v / mxc * 100)}%"></i><span>${nCols > 7 ? (new Date(d.k + 'T12:00').getDate() % 5 === 0 ? new Date(d.k + 'T12:00').getDate() : '') : new Date(d.k + 'T12:00').toLocaleDateString(V('en', 'vi'), { weekday: 'short' })}</span></div>`).join('')}</div>`),
      card(V('Activity <span class="muted">(last 16 weeks)</span>', 'Hoạt động <span class="muted">(16 tuần qua)</span>'), heatmap()),
      card(V('This week vs last week', 'Tuần này so với tuần trước'), `<table class="sx-tbl"><thead><tr><th></th><th>${V('Last 7 days', '7 ngày qua')}</th><th>${V('Before that', '7 ngày trước đó')}</th><th>${V('Change', 'Thay đổi')}</th></tr></thead><tbody>${trend}</tbody></table>`),
      card(V(`Time in each widget <span class="muted">(while you're active)</span>`, `Thời gian trong từng tiện ích <span class="muted">(khi bạn đang hoạt động)</span>`), bars(timeRows)),
      card(U(V('Notepad', 'Sổ tay'), V('Notes', 'Ghi chú')), `<div class="tiles"><div class="tile"><b>${linesToday}</b><span>${V('lines today', 'dòng hôm nay')}</span></div><div class="tile"><b>${noteLines}</b><span>${V(`lines in ${NP.length} page${NP.length === 1 ? '' : 's'}`, `dòng trong ${NP.length} trang`)}</span></div>${XP_ON ? `<div class="tile"><b>${xpNotesToday} / ${XP_RULES.notes.cap}</b><span>${V('notepad XP today', 'XP sổ tay hôm nay')}</span></div>` : ''}</div><p class="muted" style="margin:0">${V('Only these counts are used here. What you write stays on this device.', 'Ở đây chỉ dùng các con số này. Nội dung bạn viết vẫn ở trên thiết bị này.')}</p>`),
      card(V('Mood, last 14 days', 'Tâm trạng 14 ngày qua'), `<div class="moods">${mood14}</div><p class="muted" style="margin:6px 0 0">${U(V('From your Journey entries (the latest one each day).', 'Từ các mục Hành trình của bạn (mục mới nhất mỗi ngày).'), V('From your Journal entries (the latest one each day).', 'Từ các mục Nhật ký của bạn (mục mới nhất mỗi ngày).'))}${UNI ? V(' Your mood never leaves this device.', ' Tâm trạng của bạn không bao giờ rời khỏi thiết bị này.') : ''}</p>`),
      card(V('Top documents <span class="muted">(all time)</span>', 'Tài liệu đọc nhiều nhất <span class="muted">(toàn bộ)</span>'), bars(docRows)),
      UNI ? '' : card(V('Game scores <span class="muted">(all time)</span>', 'Điểm trò chơi <span class="muted">(toàn bộ)</span>'), GAMES.map((g, n) => { const S = state.games.scores[g.folder];
        return `<div class="srow" style="--n:${n}"><span>${esc(g.name)}</span><span class="muted">${V('played', 'đã chơi')} ${state.games.plays[g.folder] || 0}× · ${S && S.best !== null && S.best !== undefined ? V(`best ${S.best}, last ${S.last} ${esc(g.scoreLabel || '')}`, `cao nhất ${S.best}, gần nhất ${S.last} ${esc(g.scoreLabel || '')}`) : V('no score yet', 'chưa có điểm')}</span></div>`; }).join('')),
      !XP_ON ? '' : card(V('Recent XP', 'XP gần đây'), X.log.slice(-25).reverse().map((e, n) => `<div class="srow" style="--n:${n}"><span>${new Date(e.t).toLocaleDateString(LOC(), { month: 'short', day: 'numeric' })} ${new Date(e.t).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' })} · ${esc(srcLabel(e.s))}</span><b>+${e.n}</b></div>`).join('') || `<p class="muted">${V('Nothing yet.', 'Chưa có gì.')}</p>`),
      card(V(`Day by day <span class="muted">(last ${rowsN} days)</span>`, `Từng ngày <span class="muted">(${rowsN} ngày qua)</span>`), `<div class="tbl-scroll"><table class="sx-tbl"><thead><tr><th>${V('Day', 'Ngày')}</th>${XP_ON ? '<th>XP</th>' : ''}${UNI ? `<th>${V('Active', 'Thời gian học')}</th>` : ''}<th>${V('Reading min', 'Phút đọc')}</th><th>${U(V('Homework', 'Bài tập về nhà'), V('Assignments', 'Bài tập'))}</th><th>${V('Focus', 'Tập trung')}</th>${UNI ? '' : `<th>${V('Games', 'Trò chơi')}</th>`}<th>${V('Notes', 'Ghi chú')}</th><th>${V('Mood', 'Tâm trạng')}</th></tr></thead><tbody>${daily}</tbody></table></div>`, 'wide')
    ].join('');
    const body = $('#sx-body', b), lvl = $('#sx-lvl', b);
    body.classList.toggle('fx-in', fx); lvl.classList.toggle('fx-lvl', fx);
    if (fx) {                                                                // the entrance: cards rise in, bars and columns grow, squares pop, numbers count up, the level bar fills
      const bar = lvl.querySelector('.xpbar i');
      if (bar && !still()) requestAnimationFrame(() => requestAnimationFrame(() => {
        bar.style.width = pct + '%';
        setTimeout(() => { const r = bar.getBoundingClientRect(), h = lvl.getBoundingClientRect(); sparkleBurst(lvl, Math.max(8, r.right - h.left), r.top - h.top + r.height / 2, 14); }, 750);
      }));
      body.querySelectorAll('.tile b').forEach((el, n) => countUp(el, 250 + n * 40));
      setTimeout(() => { body.classList.remove('fx-in'); lvl.classList.remove('fx-lvl'); }, 2400);
      fx = false;
    }
  }
  b.addEventListener('click', e => { if (e.target.closest('[data-open-badges]')) { openBadges(); return; } const r = e.target.closest('[data-r]')?.dataset.r; if (r) { range = r; fx = true; draw(); } });
  // Hover: a tile's number counts up again; the level badge throws a few stars. (Everything else on hover is CSS — see "Stats & XP sparkle" in style.css.)
  b.addEventListener('mouseover', e => {
    const tile = e.target.closest('.tile'); if (tile && !tile.contains(e.relatedTarget)) countUp(tile.querySelector('b'));
    const big = e.target.closest('.lvl'); if (big && !big.contains(e.relatedTarget)) { const lvl = $('#sx-lvl', b), r = big.getBoundingClientRect(), h = lvl.getBoundingClientRect(); sparkleBurst(lvl, r.left - h.left + 34, r.top - h.top + r.height / 2, 10); }
  });
  // Cloud sync status line + manual "Sync now" (ParentDeck reads what was last pushed here).
  const syncMsg = $('#sx-sync-msg', b), syncBtn = $('#sx-sync-btn', b);
  function drawSync() {
    const i = SDCloud.getSyncInfo(), j = SDCloud.getJoined(), tm = i.at ? new Date(i.at).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
    if (!SDCloud.isConfigured()) syncMsg.textContent = V('Cloud sync isn\u2019t set up in this build.', 'Bản này chưa thiết lập đồng bộ đám mây.');
    else if (!j) syncMsg.textContent = U(V('Not connected to a class \u2014 join in the Class widget so your parent can see your stats.', 'Chưa kết nối với lớp nào \u2014 hãy tham gia trong tiện ích Lớp để phụ huynh xem được thống kê của bạn.'), V('Not connected to a course \u2014 join in the Course widget to share your study stats with your instructor.', 'Chưa kết nối với khóa học nào \u2014 hãy tham gia trong tiện ích Khóa học để chia sẻ thống kê học tập với giảng viên.'));
    else if (i.ok === null) syncMsg.textContent = V('Not synced yet \u2014 tap the button.', 'Chưa đồng bộ \u2014 hãy bấm nút.');
    else if (i.ok) syncMsg.textContent = `\u2705 ${V('Synced', 'Đã đồng bộ')} ${tm}` + (i.mode === 'basic' ? V(' (totals only \u2014 the server refused the extra details)', ' (chỉ số tổng \u2014 máy chủ từ chối phần chi tiết)') : '');
    else syncMsg.textContent = `\u26a0\ufe0f ${V('Sync failed', 'Đồng bộ thất bại')} ${tm}: ${i.error}` + (/permission/i.test(i.error) ? V(' \u2014 the Firestore rules must let a student write their own students/{id} \u201cpractice\u201d field and practiceDaily/*.', ' \u2014 quy tắc Firestore phải cho học sinh ghi trường \u201cpractice\u201d trong students/{id} của mình và practiceDaily/*.') : /unavailable|network|offline/i.test(i.error) ? V(' \u2014 check your connection; it retries automatically.', ' \u2014 hãy kiểm tra kết nối; ứng dụng sẽ tự thử lại.') : '');
  }
  syncBtn.addEventListener('click', async () => { syncBtn.disabled = true; syncMsg.textContent = V('Syncing\u2026', 'Đang đồng bộ\u2026'); try { await syncPractice(); } finally { syncBtn.disabled = false; drawSync(); } });
  const unSync = SDCloud.onSyncChanged(drawSync), unStatus = SDCloud.onStatusChanged(drawSync); drawSync();
  renderBadgeStrip(); statsRedraw = draw; draw(); const iv = setInterval(() => { if (!b.matches(':hover')) draw(); }, 10000);   // not while the pointer is on the page: a redraw would restart whatever is animating under it
  return () => { clearInterval(iv); statsRedraw = null; unSync(); unStatus(); };
}

/* ---------- Journey (mood + journal) ----------
   Entirely local. Only the MOOD of today's most recent entry ever leaves this device (via
   syncPractice() above, as a single word per day) — entry text is never read outside this widget. */
const MOODS = [['sad', '😢', V('Sad', 'Buồn')], ['meh', '😐', V('Meh', 'Bình thường')], ['happy', '😊', V('Happy', 'Vui')]];
function renderJourney(b) {
  let mood = '';
  b.innerHTML = `<p class="muted" style="margin:0 0 4px">${V('How was today?', 'Hôm nay của bạn thế nào?')}</p>
    <div class="row" role="group" aria-label="${V('Mood', 'Tâm trạng')}" id="jm">${MOODS.map(([k, e, l]) => `<button class="chip mood" data-m="${k}" aria-label="${l}">${e}</button>`).join('')}</div>
    <textarea id="jt" rows="4" maxlength="4000" placeholder="${U(V('Write about your day, or how school went…', 'Viết về một ngày của bạn, hoặc buổi học hôm nay thế nào…'), V('Write about your day, or how your studies went…', 'Viết về một ngày của bạn, hoặc việc học hôm nay thế nào…'))}" aria-label="${V('Journal entry', 'Mục nhật ký')}"></textarea>
    <div class="row"><button class="btn primary" data-a="save" style="margin-left:auto">${V('Save entry', 'Lưu mục')}</button></div>
    ${UNI ? `<p class="muted uni-note">\ud83d\udd12 ${V('Private: kept on this device, never visible to your instructors or your school.', 'Riêng tư: chỉ lưu trên thiết bị này, giảng viên và nhà trường không bao giờ xem được.')}</p>` : ''}
    <h4 style="margin:12px 0 4px">${V('Past entries', 'Các mục trước')}</h4><div id="jl"></div>`;
  function draw() {
    b.querySelectorAll('[data-m]').forEach(c => c.classList.toggle('on', c.dataset.m === mood));
    const E = state.journal.entries;
    $('#jl', b).innerHTML = E.length ? `<table class="jtbl"><thead><tr><th>${V('Date', 'Ngày')}</th><th>${V('Time', 'Giờ')}</th><th></th><th>${V('Entry', 'Nội dung')}</th><th></th></tr></thead><tbody>
      ${E.map(e => { const emo = (MOODS.find(m => m[0] === e.mood) || [, '—'])[1], d = new Date(e.ts);
        return `<tr data-row="${e.id}"><td>${d.toLocaleDateString(LOC(), { month: 'short', day: 'numeric', year: 'numeric' })}</td><td>${d.toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' })}</td><td>${emo}</td>
          <td class="jtext" data-open="${e.id}">${esc(e.text.length > 60 && !e.open ? e.text.slice(0, 60) + '…' : e.text)}</td><td><button class="x" data-del="${e.id}" aria-label="${V('Delete entry', 'Xóa mục')}">×</button></td></tr>`; }).join('')}
      </tbody></table>` : `<p class="muted">${V('No entries yet — write your first one above.', 'Chưa có mục nào — hãy viết mục đầu tiên ở trên.')}</p>`;
  }
  b.addEventListener('click', e => {
    const m = e.target.closest('[data-m]')?.dataset.m, a = e.target.closest('[data-a]')?.dataset.a,
      open = e.target.closest('[data-open]')?.dataset.open, del = e.target.closest('[data-del]')?.dataset.del;
    if (m) { mood = mood === m ? '' : m; draw(); }
    else if (a === 'save') {
      const text = $('#jt', b).value.trim();
      if (!mood) { toast(V('Pick a mood first.', 'Hãy chọn tâm trạng trước.')); return; }
      if (!text) { toast(V('Write a little about your day.', 'Hãy viết đôi dòng về một ngày của bạn.')); return; }
      state.journal.entries.unshift({ id: uid(), ts: Date.now(), mood, text });
      $('#jt', b).value = ''; mood = ''; save(); draw(); toast(V('Entry saved.', 'Đã lưu mục.'));
      awardXP('journal', 5, {});
      syncPractice();                                             // push today's mood right away, don't wait for the next tick
    } else if (open) { const en = state.journal.entries.find(x => x.id === open); if (en && en.text.length > 60) { en.open = !en.open; draw(); } }
    else if (del) { state.journal.entries = state.journal.entries.filter(x => x.id !== del); save(); draw(); syncPractice(); }
  });
  draw();
}

/* ---------- Notepad (v0.9.2) ----------
   Class notes with a timestamp on every line. A page is one lesson or topic; each line you add is stamped with the time you typed it, so
   you can see what was said when (and match it to the teacher's board or a recording). Pages, lines and times are kept ONLY on this device,
   in state.notes — nothing here is ever sent anywhere, and the only number that leaves is the XP it earns (inside the usual XP sync).
   XP, deliberately hard to farm: a line must be 4+ words (12+ characters) to count, the same line earns once a day, rewarded lines must be
   at least 20 s apart, and the whole source is capped at 15 XP a day (XP_RULES.notes). The first rewarded line of the day also earns +2.
   Editing a line never earns XP. `stat('notes')` counts every line written (shown in Stats & XP) whether or not it earned anything. */
const NOTE_MIN_WORDS = 4, NOTE_MIN_CHARS = 12, NOTE_GAP_MS = 20000, NOTE_FIRST_BONUS = 2, NOTE_LINE_MAX = 2000, NOTE_PAGE_LINES = 1000, NOTE_PAGES_MAX = 200;
const noteNorm = t => String(t).toLowerCase().replace(/\s+/g, ' ').trim();
const noteWordCount = t => (String(t).match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu) || []).length;
const noteHash = t => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return h; };       // today's rewarded lines are remembered as hashes, never as text
function noteXpFor(text, now = Date.now()) {                  // XP a new line would earn right now; 0 = none
  const t = noteNorm(text); if (t.length < NOTE_MIN_CHARS || noteWordCount(t) < NOTE_MIN_WORDS) return 0;
  const seen = dayRec().noteKeys || [];
  if (seen.includes(noteHash(t))) return 0;                   // the same line again earns nothing
  if (now - (state.notes.lastAward || 0) < NOTE_GAP_MS) return 0;
  return 1 + (seen.length === 0 ? NOTE_FIRST_BONUS : 0);
}
function noteAward(text) {
  const xp = noteXpFor(text); if (!xp) return 0;
  const r = dayRec(); (r.noteKeys || (r.noteKeys = [])).push(noteHash(noteNorm(text))); state.notes.lastAward = Date.now();
  return awardXP('notes', xp, {});
}
const noteTime = ms => new Date(ms).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
const noteStamp = ms => new Date(ms).toLocaleString(LOC(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function noteExport(p) {
  const head = `${p.title}${p.subject ? ' \u2014 ' + p.subject : ''}\n${new Date(p.created).toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n`;
  let day = '';
  return head + '\n' + p.lines.map(l => { const d = dayKey(l.t), pre = d !== day && day ? `\n-- ${d} --\n` : ''; day = d; return `${pre}[${noteTime(l.t)}] ${l.text}`; }).join('\n') + '\n';
}
function renderNotes(b) {
  const N = () => state.notes;
  let q = '', editing = '';
  const page = () => N().pages.find(p => p.id === N().current) || null;
  b.innerHTML = `<div class="row np-top"><select id="np-page" aria-label="${V('Notes page', 'Trang ghi chú')}"></select><button class="btn" data-a="new">\uff0b ${V('New page', 'Trang mới')}</button></div>
    <div class="row np-meta"><input type="text" id="np-title" maxlength="80" placeholder="${V('Page title', 'Tiêu đề trang')}" aria-label="${V('Page title', 'Tiêu đề trang')}" style="flex:1.4"><input type="text" id="np-subj" maxlength="40" placeholder="${V('Subject', 'Môn học')}" list="np-subjects" aria-label="${V('Subject', 'Môn học')}" style="flex:1"><datalist id="np-subjects"></datalist></div>
    <input type="search" id="np-q" placeholder="${V('Search all your notes', 'Tìm trong tất cả ghi chú')}" aria-label="${V('Search notes', 'Tìm ghi chú')}" maxlength="60">
    <div class="np-lines" id="np-lines" tabindex="0" aria-label="${V('Notes with timestamps', 'Ghi chú kèm thời gian')}"></div>
    <div class="np-add"><textarea id="np-in" rows="2" maxlength="${NOTE_LINE_MAX}" placeholder="${V('Type a note, then press Enter. It is stamped with the time. (Shift+Enter for a new line)', 'Gõ ghi chú rồi nhấn Enter. Ghi chú sẽ được gắn thời gian. (Shift+Enter để xuống dòng)')}" aria-label="${V('New note', 'Ghi chú mới')}"></textarea><button class="btn primary" data-a="add">${V('Add', 'Thêm')}</button></div>
    <div class="row np-tools"><button class="btn" data-a="copy">${V('Copy page', 'Sao chép trang')}</button><button class="btn" data-a="dl">${V('Download .txt', 'Tải về .txt')}</button><button class="btn" data-a="del">${V('Delete page', 'Xóa trang')}</button><span class="muted" id="np-xp" style="margin-left:auto"></span></div>`;
  function newPage() {
    if (N().pages.length >= NOTE_PAGES_MAX) { toast(V('You have 200 pages \u2014 delete some old ones first.', 'Bạn đã có 200 trang \u2014 hãy xóa bớt trang cũ trước.')); return null; }
    const now = Date.now(), p = { id: uid(), title: V('Notes \u00b7 ', 'Ghi chú \u00b7 ') + new Date(now).toLocaleDateString(LOC(), { weekday: 'short', day: 'numeric', month: 'short' }), subject: (page() || {}).subject || '', created: now, updated: now, lines: [] };
    N().pages.unshift(p); N().current = p.id; save(); return p;
  }
  function drawPages() {
    const P = N().pages, sel = $('#np-page', b);
    sel.innerHTML = P.length ? P.map(p => `<option value="${p.id}">${esc(p.title)} \u00b7 ${p.lines.length}</option>`).join('') : `<option value="">${V('No pages yet', 'Chưa có trang nào')}</option>`;
    sel.value = N().current; const p = page();
    $('#np-title', b).value = p ? p.title : ''; $('#np-subj', b).value = p ? p.subject || '' : ''; $('#np-title', b).disabled = $('#np-subj', b).disabled = !p;
    $('#np-subjects', b).innerHTML = [...new Set(P.map(x => x.subject).filter(Boolean))].map(x => `<option value="${esc(x)}">`).join('');
  }
  function drawLines() {
    const box = $('#np-lines', b), p = page(), keep = box.scrollTop, atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    if (q) {                                                                                  // search across every page
      const needle = q.toLowerCase(), hits = [];
      N().pages.forEach(pg => pg.lines.forEach(l => { if (l.text.toLowerCase().includes(needle) || pg.title.toLowerCase().includes(needle)) hits.push({ pg, l }); }));
      hits.sort((x, y) => y.l.t - x.l.t);
      box.innerHTML = hits.length ? hits.slice(0, 60).map(({ pg, l }) => `<button class="np-hit" data-go="${pg.id}"><time>${new Date(l.t).toLocaleDateString(LOC(), { month: 'short', day: 'numeric' })} ${noteTime(l.t)}</time><span>${esc(l.text)}</span><em>${esc(pg.title)}</em></button>`).join('') : `<p class="muted">${V('No notes match.', 'Không có ghi chú nào khớp.')}</p>`;
      return;
    }
    if (!p || !p.lines.length) { box.innerHTML = `<p class="muted" style="margin:8px 0">${p ? V('Nothing on this page yet. Type below \u2014 every line gets the time.', 'Trang này chưa có gì. Hãy gõ ở dưới \u2014 mỗi dòng đều được gắn thời gian.') : V('Press \u201cNew page\u201d, or just start typing below.', 'Bấm \u201cTrang mới\u201d, hoặc cứ bắt đầu gõ ở dưới.')}</p>`; return; }
    let day = '';
    box.innerHTML = p.lines.map(l => {
      const d = dayKey(l.t), hdr = d !== day && (day || dayKey(p.created) !== d) ? `<div class="np-day">${new Date(l.t).toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>` : ''; day = d;
      const body = editing === l.id ? `<textarea class="np-edit" data-edit="${l.id}" rows="2" maxlength="${NOTE_LINE_MAX}">${esc(l.text)}</textarea>` : `<div class="np-text" data-open="${l.id}" title="${V('Click to edit', 'Bấm để sửa')}">${esc(l.text)}${l.edited ? ` <em class="muted">${V('(edited)', '(đã sửa)')}</em>` : ''}</div>`;
      return `${hdr}<div class="np-line"><time title="${esc(noteStamp(l.t))}">${noteTime(l.t)}</time>${body}<button class="x" data-del="${l.id}" aria-label="${V('Delete this line', 'Xóa dòng này')}">\u00d7</button></div>`;
    }).join('');
    if (atEnd) box.scrollTop = box.scrollHeight; else box.scrollTop = keep;
    const ed = $('[data-edit]', box); if (ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
  }
  function drawXp() {
    const got = ((dayRec().xpBy) || {}).notes || 0;
    $('#np-xp', b).textContent = `${V('Notepad XP today', 'XP sổ tay hôm nay')}: ${got} / ${XP_RULES.notes.cap}` + (got >= XP_RULES.notes.cap ? V(' \u2014 limit reached', ' \u2014 đã đạt giới hạn') : V(' \u00b7 lines of 4+ words earn 1 XP', ' \u00b7 dòng từ 4 từ trở lên được 1 XP'));
  }
  const drawAll = () => { drawPages(); drawLines(); drawXp(); };
  function add() {
    const inp = $('#np-in', b), text = inp.value.trim(); if (!text) return;
    let p = page() || newPage(); if (!p) return;
    if (p.lines.length >= NOTE_PAGE_LINES) { toast(V('This page is full (1,000 lines) \u2014 start a new page.', 'Trang này đã đầy (1.000 dòng) \u2014 hãy tạo trang mới.')); return; }
    p.lines.push({ id: uid(), t: Date.now(), text: text.slice(0, NOTE_LINE_MAX) }); p.updated = Date.now();
    inp.value = ''; q = ''; $('#np-q', b).value = ''; save(); stat('notes'); const xp = noteAward(text);
    drawAll(); $('#np-lines', b).scrollTop = $('#np-lines', b).scrollHeight; inp.focus();
    if (xp) { /* the XP pill in the header already pops; nothing else to say */ }
  }
  function saveEdit(id, val) {
    const p = page(), l = p && p.lines.find(x => x.id === id); editing = '';
    if (l) { const t = val.trim(); if (t && t !== l.text) { l.text = t.slice(0, NOTE_LINE_MAX); l.edited = Date.now(); p.updated = Date.now(); save(); } }
    drawLines();
  }
  b.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a, del = e.target.closest('[data-del]')?.dataset.del, open = e.target.closest('[data-open]')?.dataset.open, go = e.target.closest('[data-go]')?.dataset.go;
    if (a === 'new') { if (newPage()) { q = ''; $('#np-q', b).value = ''; drawAll(); $('#np-in', b).focus(); } }
    else if (a === 'add') add();
    else if (a === 'copy') { const p = page(); if (!p || !p.lines.length) { toast(V('Nothing to copy yet.', 'Chưa có gì để sao chép.')); return; }
      const txt = noteExport(p); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast(V('Copied \u2014 times included.', 'Đã sao chép \u2014 kèm thời gian.')), () => { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(V('Copied \u2014 times included.', 'Đã sao chép \u2014 kèm thời gian.')); } catch (x) { toast(V('Couldn\u2019t copy. Use Download instead.', 'Không sao chép được. Hãy dùng Tải về.')); } ta.remove(); }); }
    else if (a === 'dl') { const p = page(); if (!p || !p.lines.length) { toast(V('Nothing to download yet.', 'Chưa có gì để tải về.')); return; }
      const url = URL.createObjectURL(new Blob([noteExport(p)], { type: 'text/plain;charset=utf-8' })), el = document.createElement('a'); el.href = url; el.download = (p.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'notes') + '.txt'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    else if (a === 'del') { const p = page(); if (!p) return; if (!confirm(V(`Delete \u201c${p.title}\u201d and its ${p.lines.length} line${p.lines.length === 1 ? '' : 's'}? This can\u2019t be undone.`, `Xóa \u201c${p.title}\u201d và ${p.lines.length} dòng của trang này? Không thể hoàn tác.`))) return;
      N().pages = N().pages.filter(x => x.id !== p.id); N().current = N().pages[0] ? N().pages[0].id : ''; save(); drawAll(); }
    else if (del) { const p = page(); if (!p) return; p.lines = p.lines.filter(l => l.id !== del); save(); drawLines(); drawPages(); }
    else if (open) { editing = open; drawLines(); }
    else if (go) { N().current = go; q = ''; $('#np-q', b).value = ''; save(); drawAll(); }
  });
  b.addEventListener('change', e => { if (e.target.id === 'np-page') { N().current = e.target.value; save(); drawAll(); } });
  b.addEventListener('input', e => {
    const p = page();
    if (e.target.id === 'np-q') { q = e.target.value.trim(); drawLines(); }
    else if (e.target.id === 'np-title' && p) { p.title = e.target.value.slice(0, 80) || p.title; save(); const o = $(`#np-page option[value="${p.id}"]`, b); if (o) o.textContent = `${p.title} \u00b7 ${p.lines.length}`; }
    else if (e.target.id === 'np-subj' && p) { p.subject = e.target.value.slice(0, 40); save(); }
  });
  b.addEventListener('keydown', e => {
    if (e.target.id === 'np-in' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); }
    else if (e.target.dataset && e.target.dataset.edit) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(e.target.dataset.edit, e.target.value); } else if (e.key === 'Escape') { editing = ''; drawLines(); } }
  });
  b.addEventListener('focusout', e => { if (e.target.dataset && e.target.dataset.edit && editing === e.target.dataset.edit) saveEdit(e.target.dataset.edit, e.target.value); });
  drawAll(); const iv = setInterval(drawXp, 15000);
  return () => clearInterval(iv);
}

/* ---------- Class (Firebase sync — Class Points, rewards, calendar) ----------
   A SEPARATE, teacher-awarded points balance from the local XP engine above
   (see js/cloud.js header comment for why both exist). Nothing here touches
   state.xp or awardXP(). */
// v0.14.0 (backend v2.7.0): the page a teacher is sharing live from TeachersDeck's DrawDeck
// ("Share this page with the class"). Free widget — never gate the loop: this carries information
// from teacher to student, same rule the Homework/Calendar sync already follows. Read-only, one
// page at a time, no history (see DrawDeck_Scope_Document.pdf §8 for the scope decision).
function renderSharedBoard(b) {
  let unsub = null, data = null;
  function draw() {
    if (!SDCloud.isConfigured() || !SDCloud.getJoined()) {
      b.innerHTML = `<p class="muted">${V('Join your class first to see anything your teacher shares here.', 'Hãy tham gia lớp trước để xem những gì giáo viên chia sẻ ở đây.')}</p>`;
      return;
    }
    if (!data || !data.imageDataUrl) {
      b.innerHTML = `<div class="sb-empty"><p class="muted">${V('Nothing shared right now — check back when your teacher shares a DrawDeck page.', 'Hiện chưa có gì được chia sẻ — hãy quay lại khi giáo viên chia sẻ một trang DrawDeck.')}</p></div>`;
      return;
    }
    b.innerHTML = `<div class="sb-wrap"><img class="sb-img" src="${esc(data.imageDataUrl)}" alt="${V('Page shared by your teacher', 'Trang giáo viên chia sẻ')}"></div>`;
  }
  draw();
  unsub = SDCloud.subscribeSharedBoard(d => { data = d; draw(); });
  return function cleanup() { if (unsub) unsub(); };
}

function renderClass(b) {
  let pinBanner = '';
  function draw() {
    if (!SDCloud.isConfigured()) {
      b.innerHTML = `<p class="muted">${U(V('Class sync isn\u2019t set up yet \u2014 ask your teacher\u2019s app to finish setup.', 'Chưa thiết lập đồng bộ lớp học \u2014 hãy nhờ ứng dụng của giáo viên hoàn tất thiết lập.'), V('Course sync isn\u2019t set up yet \u2014 ask your instructor.', 'Chưa thiết lập đồng bộ khóa học \u2014 hãy hỏi giảng viên của bạn.'))}</p><div class="row center"><button class="btn primary" data-demo-start>${V('Try the demo', 'Dùng thử demo')}</button></div>`;
      return;
    }
    const j = SDCloud.getJoined();
    if (!j) {
      if (SDCloud.getStatus() === 'joining') {
        b.innerHTML = `<p class="muted">${U(V('Reconnecting to your class\u2026', 'Đang kết nối lại với lớp của bạn\u2026'), V('Reconnecting to your course\u2026', 'Đang kết nối lại với khóa học của bạn\u2026'))}</p>`;
        return;
      }
      let tab = 'join';
      b.innerHTML = `
        <div class="row" style="margin-bottom:4px"><button class="chip on" data-tab="join">🚪 ${U(V('Join with class code', 'Tham gia bằng mã lớp'), V('Join with course code', 'Tham gia bằng mã khóa học'))}</button><button class="chip" data-tab="resume">🔑 ${V('I have a PIN', 'Tôi có mã PIN')}</button></div>
        <div id="cl-form"></div>`;
      function drawForm() {
        b.querySelector('[data-tab="join"]').classList.toggle('on', tab === 'join');
        b.querySelector('[data-tab="resume"]').classList.toggle('on', tab === 'resume');
        $('#cl-form', b).innerHTML = tab === 'join'
          ? `<div class="row"><input type="text" id="cl-code" placeholder="${U(V('🏫 Class code', '🏫 Mã lớp'), V('🏛️ Course code', '🏛️ Mã khóa học'))}" maxlength="12" style="flex:1"></div>
             <div class="row"><input type="text" id="cl-name" placeholder="🙋 ${V('Your name', 'Tên của bạn')}" maxlength="60" style="flex:1"></div>
             <p class="muted" style="font-size:11.5px;margin:2px 0 0">${U(V('Already joined this class before? Use <b>🔑 I have a PIN</b> instead — joining again here makes a brand-new record and your teacher will see you twice.', 'Đã từng tham gia lớp này? Hãy dùng <b>🔑 Tôi có mã PIN</b> — tham gia lại ở đây sẽ tạo một hồ sơ hoàn toàn mới và giáo viên sẽ thấy bạn hai lần.'), V('Already joined this course before? Use <b>🔑 I have a PIN</b> instead — joining again here makes a brand-new record and your instructor will see you twice.', 'Đã từng tham gia khóa học này? Hãy dùng <b>🔑 Tôi có mã PIN</b> — tham gia lại ở đây sẽ tạo một hồ sơ hoàn toàn mới và giảng viên sẽ thấy bạn hai lần.'))}</p>
             <div class="row center"><button class="btn primary" id="cl-go">✅ ${U(V('Join class', 'Tham gia lớp'), V('Join course', 'Tham gia khóa học'))}</button></div>`
          : `<div class="row"><input type="text" id="cl-code" placeholder="${U(V('🏫 Class code', '🏫 Mã lớp'), V('🏛️ Course code', '🏛️ Mã khóa học'))}" maxlength="12" style="flex:1"></div>
             <div class="row"><input type="text" id="cl-name" placeholder="🙋 ${V('Your name', 'Tên của bạn')}" maxlength="60" style="flex:1"></div>
             <div class="row"><input type="text" id="cl-pin" placeholder="🔢 ${V('4-digit PIN', 'Mã PIN 4 số')}" maxlength="4" style="width:90px"></div>
             <div class="row center"><button class="btn primary" id="cl-go">↩️ ${V('Resume', 'Vào lại')}</button></div>`;
        $('#cl-go', b).addEventListener('click', async () => {
          const code = $('#cl-code', b).value.trim(), name = $('#cl-name', b).value.trim();
          if (!code || !name) { toast(U(V('Enter a class code and your name.', 'Hãy nhập mã lớp và tên của bạn.'), V('Enter a course code and your name.', 'Hãy nhập mã khóa học và tên của bạn.'))); return; }
          try {
            if (tab === 'join') {
              const creds = await SDCloud.joinClass(code, name);
              pinBanner = V(`🔐 Your PIN is ${creds.pin} \u2014 write it down! You\u2019ll need it to get back in from another device.`, `🔐 Mã PIN của bạn là ${creds.pin} \u2014 hãy ghi lại! Bạn sẽ cần nó để vào lại từ thiết bị khác.`);
            } else {
              const pin = $('#cl-pin', b).value.trim();
              if (!/^\d{4}$/.test(pin)) { toast(V('Enter your 4-digit PIN.', 'Hãy nhập mã PIN 4 số của bạn.')); return; }
              await SDCloud.resumeClass(code, name, pin);
            }
            draw();
          } catch (e) { toast(e.message || String(e)); }
        });
      }
      drawForm();
      b.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => { tab = btn.dataset.tab; drawForm(); }));
      return;
    }

    b.innerHTML = `
      ${pinBanner ? `<p class="muted" style="color:var(--gold-hi)">${esc(pinBanner)}</p>` : ''}
      ${XP_ON ? `<div class="stat"><div><b id="cl-pts">0</b><span class="muted">⭐ ${V('class points', 'điểm lớp')}</span></div><div><b id="cl-lvl">1</b><span class="muted">🚀 ${V('level', 'cấp')}</span></div></div>` : ''}
      <p class="muted" id="cl-class-name"></p>
      ${UNI ? '' : `<p class="cl-pro" id="cl-pro" hidden>⭐ ${V('Pro — thanks to your family!', 'Pro — cảm ơn gia đình bạn!')}</p>
      <div class="cl-family" id="cl-family" hidden>
        <span>👪 ${V('Family code for your parents:', 'Mã gia đình cho phụ huynh:')} <b id="cl-family-code"></b></span>
        <button class="x" id="cl-family-copy" aria-label="${V('Copy family code', 'Sao chép mã gia đình')}">📋</button>
        <p class="muted" style="margin:2px 0 0">${V('Your parents type this into ParentDeck to see your progress. Only share it with your own family.', 'Phụ huynh nhập mã này vào ParentDeck để xem tiến độ của bạn. Chỉ chia sẻ với gia đình của bạn.')}</p>
      </div>`}
      ${XP_ON ? `<h4 style="margin:10px 0 4px">🎁 ${V('Rewards', 'Phần thưởng')}</h4><ul id="cl-rewards"><li class="muted">${V('Loading\u2026', 'Đang tải\u2026')}</li></ul>` : ''}
      <h4 style="margin:10px 0 4px">📅 ${V('Upcoming', 'Sắp tới')}</h4><ul id="cl-cal"><li class="muted">${V('Loading\u2026', 'Đang tải\u2026')}</li></ul>
      <div class="row">${XP_ON ? `<button class="btn" id="cl-rank">🏆 ${V('See class ranking', 'Xem bảng xếp hạng lớp')}</button>` : ''}<button class="btn" id="cl-leave" style="margin-left:auto">👋 ${U(V('Leave class', 'Rời lớp'), V('Leave course', 'Rời khóa học'))}</button></div>
      <p class="muted" id="cl-rank-out"></p>`;

    const unsubs = [
      SDCloud.subscribeStudent(s => {
        if (!s) return;
        if (XP_ON) { $('#cl-pts', b).textContent = s.xp || 0; $('#cl-lvl', b).textContent = s.level || 1; }
        if (!UNI) $('#cl-pro', b).hidden = !(s.pro && s.pro.active);
      }),
      SDCloud.subscribeClassMeta(cls => { $('#cl-class-name', b).textContent = cls ? `${U('🏫', '🏛️')} ${cls.className}` : ''; }),
      XP_ON && SDCloud.subscribeRewards(list => {
        $('#cl-rewards', b).innerHTML = list.length ? list.map(r =>
          `<li><span>🎁 ${esc(r.name)}</span><span>⭐ ${r.cost} ${V('pts', 'điểm')} <button class="x" data-redeem="${r.id}" aria-label="${V('Redeem', 'Đổi')} ${esc(r.name)}">🎟️</button></span></li>`
        ).join('') : `<li class="muted">${V('No rewards yet.', 'Chưa có phần thưởng nào.')}</li>`;
        $('#cl-rewards', b).querySelectorAll('[data-redeem]').forEach(btn => {
          btn.addEventListener('click', async () => {
            try { await SDCloud.redeemReward(btn.dataset.redeem); toast(V('🎉 Redeemed!', '🎉 Đã đổi thưởng!')); }
            catch (e) { toast(e.message || String(e)); }
          });
        });
      }),
      SDCloud.subscribeCalendar(list => {
        const today = dayKey(Date.now());
        const upcoming = list.filter(e => e.date >= today).slice(0, 6);
        $('#cl-cal', b).innerHTML = upcoming.length ? upcoming.map(e =>
          `<li><span>📌 ${esc(e.title || V('Event', 'Sự kiện'))}</span><span class="muted">${e.date}${e.time ? ' ' + e.time : ''}</span></li>`
        ).join('') : `<li class="muted">${V('Nothing coming up.', 'Chưa có gì sắp tới.')}</li>`;
      })
    ];

    if (!UNI && SDCloud.getFamilyCode) {
      SDCloud.getFamilyCode().then(code => {
        if (!b.isConnected) return;
        $('#cl-family-code', b).textContent = code;
        $('#cl-family', b).hidden = false;
        $('#cl-family-copy', b).addEventListener('click', () => {
          (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => toast(V('📋 Family code copied', '📋 Đã sao chép mã gia đình')), () => toast(code));
        });
      }).catch(() => { /* backend older than v2.0.0, or offline: nothing to show */ });
    }

    if (XP_ON) $('#cl-rank', b).addEventListener('click', async () => {
      $('#cl-rank-out', b).textContent = V('Loading\u2026', 'Đang tải\u2026');
      try {
        const res = await SDCloud.getRanking();
        $('#cl-rank-out', b).textContent = res.rows.map(r => `#${r.rank} ${r.displayName}${r.xp !== undefined ? ' \u2014 ' + r.xp : ''}`).join('  \u00b7  ');
      } catch (e) { $('#cl-rank-out', b).textContent = e.message || String(e); }
    });
    $('#cl-leave', b).addEventListener('click', () => {
      unsubs.forEach(u => u && u());
      SDCloud.leaveClass();
      pinBanner = '';
      draw();
    });

    return () => unsubs.forEach(u => u && u());
  }
  let cleanup = draw();
  const unsub = SDCloud.onStatusChanged(() => { if (typeof cleanup === 'function') cleanup(); cleanup = draw(); });
  return () => { if (typeof cleanup === 'function') cleanup(); unsub(); };
}

/* ---------- Files widget + document stage (ported from TeachersDeck v0.13) ----------
   The Files widget keeps PDFs (in IndexedDB — they're too big for localStorage) and pasted Google Docs / Slides / Sheets /
   Forms / Drive links. Clicking one opens it in the DOCUMENT STAGE: a layer over the wall (z 1000) that holds one iframe.
     - a PDF is a blob URL in Chrome's own PDF viewer — deliberately NOT sandboxed (a sandboxed frame disables that viewer);
     - a Google link becomes its embeddable /preview (or published) URL in a sandboxed frame. The /edit URL can't be framed
       (X-Frame-Options: SAMEORIGIN), so "Edit in Google" opens a tab.
   Closing the stage removes the iframe and revokes the blob URL. Time with the stage open is tracked by the shell's 5 s tick
   (timeBy.docs) and earns XP ('docs'); see the tick near the top of this file.
   Not carried over from TeachersDeck: Word/PowerPoint/Excel conversion through the teacher's Google Drive (needs Pro + sign-in).
   A student shares those as a Google link instead. */
const idb = (() => {
  let db = null;
  const open = () => db ? Promise.resolve(db) : new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error(V('IndexedDB isn\u2019t available here', 'Không dùng được IndexedDB ở đây')));
    const q = indexedDB.open('StudentDeck', 1);
    q.onupgradeneeded = e => { const d = e.target.result; if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' }); };
    q.onsuccess = e => { db = e.target.result; db.onversionchange = () => { db.close(); db = null; }; res(db); };
    q.onerror = e => rej(e.target.error);
    q.onblocked = () => rej(new Error(V(`Another ${APP} tab is blocking an update \u2014 close it and reload`, `Một thẻ ${APP} khác đang chặn việc cập nhật \u2014 hãy đóng thẻ đó và tải lại`)));
  });
  const run = (mode, fn) => open().then(d => new Promise((res, rej) => {
    const tx = d.transaction('files', mode), r = fn(tx.objectStore('files'));
    tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  }));
  return { put: rec => run('readwrite', st => st.put(rec)), delete: id => run('readwrite', st => st.delete(id)), getAll: () => run('readonly', st => st.getAll()) };
})();

const GOOGLE_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads';
const GDOC_LABEL = { document: 'DOC', presentation: 'SLIDES', spreadsheets: 'SHEET', forms: 'FORM', drive: 'DRIVE' };
const GDOC_NAME = { document: 'Google Doc', presentation: 'Google Slides', spreadsheets: 'Google Sheet', forms: 'Google Form', drive: V('Drive file', 'Tệp Drive') };
let docStage = null, docCur = null, docLoadTimer = null, filesRedraw = null;
const extOf = n => { const m = /\.([a-z0-9]+)$/i.exec(n); return m ? m[1].toLowerCase() : ''; };

function parseGoogleLink(raw) {
  let u; try { u = new URL(String(raw || '').trim()); } catch (e) { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase(), path = u.pathname; let m;
  if (host === 'docs.google.com') {
    m = /^\/(document|presentation|spreadsheets|forms)(?:\/u\/\d+)?\/d\/(e\/)?([A-Za-z0-9_-]+)/.exec(path);
    if (!m) return null;
    const gtype = m[1], published = !!m[2], id = m[3], base = 'https://docs.google.com/' + gtype + '/d/' + (published ? 'e/' : '') + id;
    if (gtype === 'forms') { if (!published) return null; return { gtype, id, src: base + '/viewform?embedded=true', tab: base + '/viewform' }; }   // the form editor can't be framed
    if (published) {
      const src = gtype === 'document' ? '/pub?embedded=true' : gtype === 'presentation' ? '/embed' : '/pubhtml?widget=true&headers=false';
      return { gtype, id, src: base + src, tab: base + (gtype === 'spreadsheets' ? '/pubhtml' : '/pub') };
    }
    return { gtype, id, src: base + '/preview', tab: base + '/edit' };
  }
  if (host === 'drive.google.com') {
    m = /^\/file(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/.exec(path);
    const id = m ? m[1] : (path === '/open' ? u.searchParams.get('id') : null);
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
    return { gtype: 'drive', id, src: 'https://drive.google.com/file/d/' + id + '/preview', tab: 'https://drive.google.com/file/d/' + id + '/view' };
  }
  return null;
}

function docStageOpen() { return !!(docStage && !docStage.el.hidden); }
function drawDocTime() {
  if (!docStage) return;
  const r = dayRec(), here = docCur ? ((r.docSecs || {})[docKeyOf(docCur)] || 0) : 0;
  docStage.time.textContent = '\u23f1 ' + fmtT(here) + V(' here \u00b7 ', ' ở đây \u00b7 ') + fmtT(r.timeBy[DOC_KEY] || 0) + V(' today', ' hôm nay') + (docCur ? ' \u00b7 ' + docXpGranted(docCur) + '/' + DOC_XP_PER_DOC + ' XP' : '');
  docStage.time.title = V('This document today \u00b7 all documents today \u00b7 XP this document has earned today (max ', 'Tài liệu này hôm nay \u00b7 mọi tài liệu hôm nay \u00b7 XP tài liệu này đã nhận hôm nay (tối đa ') + DOC_XP_PER_DOC + ')';
}
function docAskStillReading() { if (docStage && docStage.idle.hidden) docStage.idle.hidden = false; }

function buildDocStage() {
  if (docStage) return docStage;
  const el = document.createElement('div'); el.className = 'doc-stage'; el.id = 'doc-stage'; el.hidden = true;
  el.innerHTML = `<div class="doc-toolbar" role="toolbar" aria-label="${V('Document toolbar', 'Thanh công cụ tài liệu')}">
      <span class="doc-title"></span><span class="doc-time muted" title="${V('Time with documents open today', 'Thời gian mở tài liệu hôm nay')}"></span>
      <button type="button" class="doc-hint" hidden>${V('Not loading? Open it in a new tab', 'Không tải được? Mở trong thẻ mới')}</button>
      <div class="doc-tools">
        <div class="doc-menu-wrap"><button type="button" class="doc-btn doc-track-btn" aria-haspopup="true" aria-expanded="false" title="${V('Show this time in your Reading Log and Homework', 'Hiện thời gian này trong Nhật ký đọc và Bài tập về nhà')}">\ud83d\udcce ${V('Track', 'Theo dõi')}</button><div class="doc-menu doc-track-menu" hidden></div></div>
        <div class="doc-menu-wrap"><button type="button" class="doc-btn doc-widgets-btn" aria-haspopup="true" aria-expanded="false">\ud83d\udccc ${V('Widgets', 'Tiện ích')}</button><div class="doc-menu" hidden></div></div>
        <button type="button" class="doc-btn doc-edit" hidden>${V('Edit in Google', 'Sửa trong Google')}</button>
        <button type="button" class="doc-btn doc-tab">${V('Open in new tab', 'Mở trong thẻ mới')}</button>
        <button type="button" class="doc-btn doc-pdftools" hidden aria-pressed="false" title="${V('Show or hide Chrome\u2019s PDF toolbar (page, zoom, print). Reloads the PDF.', 'Hiện hoặc ẩn thanh công cụ PDF của Chrome (trang, thu phóng, in). PDF sẽ được tải lại.')}">\ud83d\udee0 ${V('PDF tools', 'Công cụ PDF')}</button>
        <button type="button" class="doc-btn doc-full" aria-label="${V('Full screen', 'Toàn màn hình')}" title="${V('Full screen on / off', 'Bật / tắt toàn màn hình')}">\u26f6</button>
        <button type="button" class="doc-btn doc-collapse" aria-label="${V('Hide toolbar', 'Ẩn thanh công cụ')}" title="${V('Hide toolbar', 'Ẩn thanh công cụ')}">\u25b4</button>
        <button type="button" class="doc-btn primary doc-close">${V('Close', 'Đóng')}</button>
      </div></div>
    <button type="button" class="doc-handle" hidden aria-label="${V('Show toolbar', 'Hiện thanh công cụ')}" title="${V('Show toolbar', 'Hiện thanh công cụ')}">\u25be</button>
    <div class="doc-frame-wrap"></div>
    <div class="doc-idle" role="alertdialog" aria-label="${V('Still reading?', 'Vẫn đang đọc?')}" hidden><p>\ud83d\udcd6 ${V('Still reading? The document timer is paused.', 'Vẫn đang đọc chứ? Đồng hồ tính giờ tài liệu đang tạm dừng.')}</p><button type="button" class="btn primary doc-idle-yes">${V('Yes, keep counting', 'Có, tiếp tục tính giờ')}</button></div>
    <div class="doc-fallback" hidden><p>${V(`This page didn\u2019t load inside ${APP} \u2014 Google may not allow it to be shown here.`, `Trang này không tải được trong ${APP} \u2014 có thể Google không cho phép hiển thị ở đây.`)}</p><button type="button" class="btn primary doc-fallback-tab">${V('Open in a new tab', 'Mở trong thẻ mới')}</button></div>`;
  wall.appendChild(el);
  const q = sel => el.querySelector(sel);
  docStage = { el, title: q('.doc-title'), time: q('.doc-time'), hint: q('.doc-hint'), wrap: q('.doc-frame-wrap'), menu: q('.doc-menu:not(.doc-track-menu)'), menuBtn: q('.doc-widgets-btn'),
    editBtn: q('.doc-edit'), fallback: q('.doc-fallback'), idle: q('.doc-idle'), handle: q('.doc-handle'), tmenu: q('.doc-track-menu'), tmenuBtn: q('.doc-track-btn'), pdfBtn: q('.doc-pdftools') };
  [q('.doc-tab'), q('.doc-fallback-tab'), docStage.hint].forEach(b => b.addEventListener('click', docOpenInTab));
  docStage.editBtn.addEventListener('click', () => { if (docCur && docCur.editUrl) window.open(docCur.editUrl, '_blank', 'noopener'); });
  q('.doc-close').addEventListener('click', closeDocViewer);
  q('.doc-idle-yes').addEventListener('click', () => { lastDocPoke = Date.now(); docStage.idle.hidden = true; });
  const setCollapsed = on => { el.classList.toggle('collapsed', on); document.body.classList.toggle('doc-collapsed', on); if (!on) requestAnimationFrame(syncDocPads); docStage.handle.hidden = !on; q('.doc-toolbar').hidden = on; };
  q('.doc-collapse').addEventListener('click', () => setCollapsed(true));
  docStage.handle.addEventListener('click', () => setCollapsed(false));
  docStage.setCollapsed = setCollapsed;
  docStage.menuBtn.addEventListener('click', e => { e.stopPropagation(); docStage.menu.hidden ? openDocMenu() : closeDocMenu(); });
  docStage.menu.addEventListener('click', e => e.stopPropagation());
  docStage.tmenuBtn.addEventListener('click', e => { e.stopPropagation(); docStage.tmenu.hidden ? openTrackMenu() : closeDocMenu(); });
  docStage.tmenu.addEventListener('click', e => e.stopPropagation());
  q('.doc-full').addEventListener('click', toggleFullscreen);
  docStage.pdfBtn.addEventListener('click', () => { state.pdfTools = !state.pdfTools; save(); reloadPdfFrame(); });
  window.addEventListener('resize', syncDocPads); if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(syncDocPads); [$('.brand'), $('.hright')].forEach(n => n && ro.observe(n)); }
  document.addEventListener('click', closeDocMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDocMenu(); });
  // Focus moving into the iframe means the student just clicked into the document: that's activity we can see.
  window.addEventListener('blur', () => setTimeout(() => { if (docStageOpen() && document.activeElement && document.activeElement.tagName === 'IFRAME' && el.contains(document.activeElement)) { lastDocPoke = Date.now(); docStage.idle.hidden = true; } }, 0));
  return docStage;
}

function closeDocMenu() {
  if (!docStage) return;
  if (!docStage.menu.hidden) { docStage.menu.hidden = true; docStage.menuBtn.setAttribute('aria-expanded', 'false'); }
  if (!docStage.tmenu.hidden) { docStage.tmenu.hidden = true; docStage.tmenuBtn.setAttribute('aria-expanded', 'false'); }
}
function openDocMenu() {
  closeDocMenu(); const menu = docStage.menu, open = WIDGETS.filter(d => panels[d.id]);
  menu.innerHTML = `<p class="doc-menu-hint">${V('Tick a widget to keep it in front of the document.', 'Đánh dấu một tiện ích để giữ nó ở phía trước tài liệu.')}</p>`;
  if (!open.length) menu.insertAdjacentHTML('beforeend', `<p class="doc-menu-empty">${V('No widgets are open \u2014 open one from the dock.', 'Chưa mở tiện ích nào \u2014 hãy mở một tiện ích từ thanh dock.')}</p>`);
  else {
    const bar = document.createElement('div'); bar.className = 'doc-menu-bar';
    [[V('Pin all', 'Ghim tất cả'), true], [V('Unpin all', 'Bỏ ghim tất cả'), false]].forEach(([label, on]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'doc-menu-link'; b.textContent = label;
      b.addEventListener('click', () => { open.forEach(d => setPinned(d.id, on)); openDocMenu(); }); bar.appendChild(b); });
    menu.appendChild(bar);
    open.forEach(d => { const row = document.createElement('label'); row.className = 'doc-menu-row';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = panels[d.id].el.dataset.onTop === '1'; cb.addEventListener('change', () => setPinned(d.id, cb.checked));
      const sp = document.createElement('span'); sp.textContent = d.title; row.append(cb, sp); menu.appendChild(row); });
  }
  menu.hidden = false; docStage.menuBtn.setAttribute('aria-expanded', 'true');
}

function clearDocFrame() {
  if (docLoadTimer) { clearTimeout(docLoadTimer); docLoadTimer = null; }
  if (docStage) { docStage.wrap.innerHTML = ''; docStage.fallback.hidden = true; docStage.idle.hidden = true; }     // removing the iframe stops whatever it was loading
  if (docCur && docCur.objUrl) { try { URL.revokeObjectURL(docCur.objUrl); } catch (e) {} }
}

// doc: { kind:'pdf', name, blob }  or  { kind:'google', name, src, tabUrl, editUrl }
function openDocViewer(doc) {
  const wasOpen = docStageOpen(), st = buildDocStage(); closeDocLog(); clearDocFrame(); closeDocMenu(); docCur = doc; noteDocOpen(doc);
  let src;
  if (doc.kind === 'pdf') {
    // Files picked from disk can arrive without a MIME type; Chrome only hands a blob to its PDF viewer when it's labelled application/pdf.
    doc.objUrl = URL.createObjectURL(doc.blob.type === 'application/pdf' ? doc.blob : new Blob([doc.blob], { type: 'application/pdf' }));
    src = doc.objUrl + pdfFrag();
  } else src = doc.src;
  const frame = document.createElement('iframe');
  frame.title = doc.name || ''; frame.setAttribute('allow', 'fullscreen'); frame.setAttribute('allowfullscreen', ''); frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  if (doc.kind === 'google') frame.setAttribute('sandbox', GOOGLE_SANDBOX);
  st.pdfBtn.hidden = doc.kind !== 'pdf'; st.pdfBtn.setAttribute('aria-pressed', String(!!state.pdfTools)); st.title.textContent = doc.name || ''; st.hint.hidden = doc.kind !== 'google'; st.editBtn.hidden = !(doc.kind === 'google' && doc.editUrl);
  // A page Google refuses to frame fires no error, only (at best) a load of its error page. If nothing has loaded after 6 s, say what to do.
  if (doc.kind === 'google') {
    docLoadTimer = setTimeout(() => { docLoadTimer = null; st.fallback.hidden = false; }, 6000);
    frame.addEventListener('load', () => { if (docLoadTimer) { clearTimeout(docLoadTimer); docLoadTimer = null; } });
  }
  frame.src = src; st.wrap.appendChild(frame); st.setCollapsed(false); st.el.hidden = false; document.body.classList.add('doc-open'); syncDocPads(); if (!wasOpen) focusOnDocOpen();
  lastDocPoke = Date.now(); drawDocTime();
  // Widgets that were already open stay where they are: behind the document unless pinned (Widgets menu in the toolbar).
}
function closeDocViewer() {
  if (!docStage) return;
  closeDocMenu(); closeDocLog(); clearDocFrame(); docStage.el.hidden = true; docCur = null; document.body.classList.remove('doc-open', 'doc-collapsed'); hideFocusAsk(); tidyFocusTimer();
  Object.keys(panels).forEach(id => setPinned(id, false));                          // back to ordinary stacking
  save(); refreshStats(); if (filesRedraw) filesRedraw(); if (todoRedraw) todoRedraw();
}
function docOpenInTab() {
  if (!docCur) return;
  if (docCur.kind === 'pdf') window.open(URL.createObjectURL(docCur.blob.type === 'application/pdf' ? docCur.blob : new Blob([docCur.blob], { type: 'application/pdf' })), '_blank');   // a fresh URL: the stage's own is revoked on close
  else window.open(docCur.tabUrl, '_blank', 'noopener');
}

// Opens one saved file or link record in the document stage (used by the Files list and by the Homework widget's document chips).
function showFile(f) {
  if (f.kind === 'glink') {
    const g = parseGoogleLink(f.url); if (!g) { toast(V('That link doesn\u2019t look like a Google Docs, Slides, Sheets or Drive link.', 'Liên kết này có vẻ không phải liên kết Google Docs, Slides, Sheets hay Drive.')); return; }
    openDocViewer({ id: f.id, kind: 'google', name: f.name, src: g.src, tabUrl: g.tab, editUrl: g.gtype === 'forms' ? null : g.tab }); return;
  }
  openDocViewer({ id: f.id, kind: 'pdf', name: f.name, blob: f.blob });
}
async function openDocById(id) {
  let files = []; try { files = await idb.getAll(); } catch (e) { toast(V('Your saved files couldn\u2019t be loaded.', 'Không tải được các tệp đã lưu của bạn.')); return; }
  const f = files.find(x => x.id === id); if (!f) { toast(V('That document was removed from Files.', 'Tài liệu đó đã bị xóa khỏi Tệp.')); return; }
  showFile(f);
}
function closeDocLog() {                                                         // called when a document is closed or swapped
  if (!docCur || !state.docToReading) return;
  const mins = logDocToReading(docCur); if (mins) toast('\ud83d\udcda ' + V(mins + ' min of \u201c' + (docCur.name || 'document') + '\u201d is in your Reading Log', mins + ' phút đọc \u201c' + (docCur.name || 'tài liệu') + '\u201d đã có trong Nhật ký đọc'));
}
// Chrome's PDF viewer reads display options from the URL fragment: toolbar=0 hides its top bar, navpanes=0 the thumbnail sidebar.
// Default is both hidden (more room to read); the toolbar's "PDF tools" button brings them back for the student who needs zoom / page jump / print.
const pdfFrag = () => '#' + (state.pdfTools ? '' : 'toolbar=0&navpanes=0&') + 'view=FitH';
function reloadPdfFrame() {                                                      // a fragment change alone doesn't re-apply these options, so swap in a fresh iframe (same blob URL; reading position is lost)
  if (!docStage || !docCur || docCur.kind !== 'pdf') return;
  const old = docStage.wrap.querySelector('iframe'); if (!old) return;
  const f = document.createElement('iframe'); f.title = old.title; f.setAttribute('allow', 'fullscreen'); f.setAttribute('allowfullscreen', ''); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  f.src = docCur.objUrl + pdfFrag(); old.replaceWith(f); docStage.pdfBtn.setAttribute('aria-pressed', String(!!state.pdfTools)); lastDocPoke = Date.now();
}
/* Focus timer + documents (v0.7.4). Opening a document (not switching between two) brings the Focus Timer forward, pins it above the
   document and — depending on its state — asks about it:
     idle (never started / reset)    -> popup: "Start a focus timer?" with 15 / 25 / 45 min, [Start] [Not now]
     paused with time left           -> popup: "Resume your focus timer?" [Resume] [Leave it paused]
     running                         -> left alone: no popup, nothing reset; a toast says how long is left
   The popup is a plain card at the top of the page (not a blocking modal) so the document stays readable; Esc or "Not now" dismisses it.
   If this opened the timer widget and the timer is idle when the document is closed, the widget is closed again; a running or paused
   timer is left where it is. "Don't ask me again" (or the Track menu tick) turns the whole thing off: state.docFocus. */
let docOpenedTimer = false, focusAsk = null;
const mmss = secs => pad(Math.floor(secs / 60)) + ':' + pad(secs % 60);
const timerLeftSecs = () => { const T = state.timer; return T.endsAt ? Math.max(0, Math.ceil((T.endsAt - Date.now()) / 1000)) : T.left; };
function focusOnDocOpen() {
  if (!state.docFocus) return;
  if (!panels.timer) { openWidget('timer'); docOpenedTimer = true; }              // opening it runs the widget's first draw(), which settles a session that ended while the tab was closed
  setPinned('timer', true);
  const T = state.timer;
  if (T.endsAt && Date.now() < T.endsAt) { toast(V('\u23f1 Your focus timer is running \u2014 ' + mmss(timerLeftSecs()) + ' left', '\u23f1 Hẹn giờ tập trung đang chạy \u2014 còn ' + mmss(timerLeftSecs()))); return; }
  askFocus(!T.endsAt && T.left > 0 && T.left < T.dur ? 'resume' : 'start');
}
function startFocus(mode, mins) {
  const T = state.timer; if (T.endsAt) return;                                       // started by hand while the popup was showing
  if (mode === 'resume') { if (T.left > 0) T.endsAt = Date.now() + T.left * 1000; }
  else { T.dur = T.left = mins * 60; T.endsAt = Date.now() + T.left * 1000; }
  save();                                                                            // the open Focus Timer widget redraws itself within half a second
}
function hideFocusAsk() { if (focusAsk) { focusAsk.remove(); focusAsk = null; } }
function askFocus(mode) {
  hideFocusAsk(); const T = state.timer; let mins = Math.round(T.dur / 60) || 25;
  const el = document.createElement('div'); el.className = 'focus-ask'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', mode === 'resume' ? V('Resume focus timer?', 'Tiếp tục hẹn giờ tập trung?') : V('Start focus timer?', 'Bắt đầu hẹn giờ tập trung?'));
  el.innerHTML = mode === 'resume'
    ? `<p><b>\u23f1 ${V('Resume your focus timer?', 'Tiếp tục hẹn giờ tập trung?')}</b><br><span class="muted">${V(`${mmss(T.left)} left \u2014 it\u2019s paused.`, `Còn ${mmss(T.left)} \u2014 đang tạm dừng.`)}</span></p><div class="row"><button type="button" class="btn primary" data-f="go">${V('Resume', 'Tiếp tục')}</button><button type="button" class="btn" data-f="no">${V('Leave it paused', 'Để tạm dừng')}</button></div>`
    : `<p><b>\u23f1 ${V('Start a focus timer?', 'Bắt đầu hẹn giờ tập trung?')}</b><br><span class="muted">${V('Stay on track while you read.', 'Giữ nhịp tập trung khi bạn đọc.')}</span></p><div class="row" role="group" aria-label="${V('Session length', 'Thời lượng phiên')}">${[15, 25, 45].map(m => `<button type="button" class="chip${m === mins ? ' on' : ''}" data-m="${m}">${m} ${V('min', 'phút')}</button>`).join('')}</div><div class="row"><button type="button" class="btn primary" data-f="go">${V('Start', 'Bắt đầu')}</button><button type="button" class="btn" data-f="no">${V('Not now', 'Để sau')}</button></div>`;
  el.insertAdjacentHTML('beforeend', `<label class="focus-ask-off"><input type="checkbox" data-f="off"> ${V('Don\u2019t ask me again', 'Đừng hỏi lại')}</label>`);
  el.addEventListener('click', e => {
    const chip = e.target.closest('[data-m]'), f = e.target.closest('[data-f]')?.dataset.f;
    if (chip) { mins = +chip.dataset.m; el.querySelectorAll('[data-m]').forEach(c => c.classList.toggle('on', c === chip)); return; }
    if (f !== 'go' && f !== 'no') return;
    if (f === 'go') startFocus(mode, mins);
    if (el.querySelector('[data-f=off]').checked) { state.docFocus = false; save(); toast(V('Okay \u2014 you can turn the focus-timer offer back on in \ud83d\udcce Track.', 'Được rồi \u2014 bạn có thể bật lại gợi ý hẹn giờ tập trung trong \ud83d\udcce Theo dõi.')); }
    hideFocusAsk();
  });
  document.body.appendChild(el); focusAsk = el;
}
function tidyFocusTimer() {
  if (!docOpenedTimer) return; docOpenedTimer = false;
  const T = state.timer; if (panels.timer && !T.endsAt && !(T.left > 0 && T.left < T.dur)) closeWidget('timer');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideFocusAsk(); });

/* Closing the Focus Timer while a session is running (v0.7.5). A session is only finished — and its XP only awarded — by the open
   Focus Timer widget, so closing the widget mid-session delays that XP until it is opened again. Both ways a student closes a widget
   (its × button and the dock) go through requestClose(), which asks first for the timer in that situation. A paused or idle timer
   has nothing at stake and closes straight away; so does every other widget. */
function requestClose(id) {
  const T = state.timer;
  if (id === 'timer' && T.endsAt && Date.now() < T.endsAt) { askCloseTimer(); return; }
  closeWidget(id);
}
function askCloseTimer() {
  hideFocusAsk();
  const el = document.createElement('div'); el.className = 'focus-ask'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', V('Close the focus timer?', 'Đóng hẹn giờ tập trung?'));
  el.innerHTML = `<p><b>\u23f1 ${V('Close the Focus Timer?', 'Đóng Hẹn giờ tập trung?')}</b><br><span class="muted">${V(`${mmss(timerLeftSecs())} left in this session. The session only finishes \u2014 and your XP is only added \u2014 while the timer is open, so closing it delays your XP until you open it again.`, `Phiên này còn ${mmss(timerLeftSecs())}. Phiên chỉ kết thúc \u2014 và XP chỉ được cộng \u2014 khi hẹn giờ đang mở, nên đóng nó sẽ làm XP của bạn bị chậm lại cho đến khi bạn mở lại.`)}</span></p><div class="row"><button type="button" class="btn primary" data-f="keep">${V('Keep it open', 'Giữ mở')}</button><button type="button" class="btn" data-f="close">${V('Close anyway', 'Vẫn đóng')}</button></div>`;
  el.addEventListener('click', e => {
    const f = e.target.closest('[data-f]')?.dataset.f; if (!f) return;
    hideFocusAsk(); if (f === 'close' && panels.timer) closeWidget('timer');
  });
  document.body.appendChild(el); focusAsk = el; el.querySelector('[data-f=keep]').focus();
}

function openTrackMenu() {
  if (!docStage || !docCur) return; closeDocMenu();
  const menu = docStage.tmenu, dk = docKeyOf(docCur), row = (checked, text, on) => {
    const l = document.createElement('label'); l.className = 'doc-menu-row'; const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = checked;
    cb.addEventListener('change', () => on(cb.checked)); const sp = document.createElement('span'); sp.textContent = text; l.append(cb, sp); return l; };
  menu.innerHTML = `<p class="doc-menu-hint">${V('Time with this document can also show up here.', 'Thời gian với tài liệu này cũng có thể hiện ở đây.')}</p>`;
  menu.appendChild(row(!!state.docToReading, '\ud83d\udcda ' + V('Add to my Reading Log when I close it', 'Thêm vào Nhật ký đọc khi tôi đóng tài liệu'), v => { state.docToReading = v; save(); }));
  menu.appendChild(row(!!state.docFocus, '\u23f1 ' + V('Offer a focus timer when I open a document', 'Gợi ý hẹn giờ tập trung khi tôi mở tài liệu'), v => { state.docFocus = v; save(); }));
  const h = document.createElement('p'); h.className = 'doc-menu-hint'; h.style.marginTop = '8px'; h.textContent = '\ud83d\udcdd ' + U(V('Homework this document is for:', 'Bài tập về nhà dùng tài liệu này:'), V('Assignment this document is for:', 'Bài tập dùng tài liệu này:')); menu.appendChild(h);
  const items = hwOpenItems();
  if (!items.length) menu.insertAdjacentHTML('beforeend', `<p class="doc-menu-empty">${U(V('No open homework \u2014 add some in Homework Assignments.', 'Không có bài tập về nhà nào đang mở \u2014 hãy thêm trong Bài tập về nhà.'), V('No open assignments \u2014 add some in Assignments.', 'Không có bài tập nào đang mở \u2014 hãy thêm trong Bài tập.'))}</p>`);
  items.forEach(it => menu.appendChild(row((state.hwLinks[it.key] || { docs: [] }).docs.includes(dk), it.title + (it.sub ? ' \u00b7 ' + it.sub : ''), v => hwLink(it.key, dk, v))));
  menu.hidden = false; docStage.tmenuBtn.setAttribute('aria-expanded', 'true');
}
// The app header and the document toolbar share one row while a document is open: keep the toolbar clear of the brand (left) and XP/theme (right).
function syncDocPads() {
  const br = $('.brand'), hr = $('.hright'); if (!br || !hr) return;
  const l = Math.ceil(br.getBoundingClientRect().right) + 12, r = Math.ceil(window.innerWidth - hr.getBoundingClientRect().left) + 12;
  if (l > 40 && r > 40 && r < window.innerWidth * 0.6) { const st = document.documentElement.style; st.setProperty('--hdr-l', l + 'px'); st.setProperty('--hdr-r', r + 'px'); }
}
function toggleFullscreen() {
  try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => toast(V('This browser window wouldn\u2019t go full screen.', 'Cửa sổ trình duyệt này không chuyển được sang toàn màn hình.'))); } catch (e) { /* unsupported */ }
}
// Teacher assignments are cached (title + due date only) so the Track menu can offer them even when the Homework widget is closed.
let hwFeedOff = null;
SDCloud.onStatusChanged(status => { if (hwFeedOff) { hwFeedOff(); hwFeedOff = null; } if (status === 'joined') hwFeedOff = SDCloud.subscribeHomework((list, err) => { if (!err) cacheHomework(list); }); });

function renderFiles(b) {
  b.innerHTML = `<div class="row" style="margin-top:0"><button type="button" class="btn" id="file-browse">\u2795 ${V('Add a PDF', 'Thêm PDF')}</button><span class="muted">${V('Opens right here, full size.', 'Mở ngay tại đây, cỡ lớn.')}</span></div>
    <input type="file" id="file-input" hidden multiple accept=".pdf,application/pdf">
    <form class="file-glink" id="file-glink" autocomplete="off">
      <input type="text" id="glink-url" placeholder="${V('Paste a Google Docs / Slides / Sheets / Drive link', 'Dán liên kết Google Docs / Slides / Sheets / Drive')}" aria-label="${V('Google link', 'Liên kết Google')}">
      <input type="text" id="glink-name" placeholder="${V('Name (optional)', 'Tên (không bắt buộc)')}" aria-label="${V('Name for the link', 'Tên cho liên kết')}">
      <button type="submit" class="btn">${V('Add link', 'Thêm liên kết')}</button>
    </form>
    <p class="muted" id="file-err" hidden></p>
    <div class="row file-sortrow"><span class="muted">${V('Sort by', 'Sắp xếp theo')}</span><select id="file-sort" aria-label="${V('Sort files', 'Sắp xếp tệp')}"><option value="recent">${V('Last opened', 'Mở gần nhất')}</option><option value="time">${V('Most time', 'Nhiều thời gian nhất')}</option><option value="added">${V('Date added', 'Ngày thêm')}</option></select></div>
    <ul class="file-list"></ul>
    <p class="muted">\ud83d\udcc4 ${V('Time you spend with a document open counts toward Stats &amp; XP.', 'Thời gian bạn mở tài liệu được tính vào Thống kê &amp; XP.')}</p>`;
  const list = $('.file-list', b), input = $('#file-input', b), errEl = $('#file-err', b);
  const fail = msg => { errEl.hidden = !msg; errEl.textContent = msg || ''; };
  $('#file-browse', b).addEventListener('click', () => input.click());

  async function draw() {
    let files = []; try { files = await idb.getAll(); fail(''); } catch (e) { fail(V('Your saved files couldn\u2019t be loaded: ', 'Không tải được các tệp đã lưu: ') + e.message); }
    const DT = state.docTime, by = state.filesSort;
    files.sort((a, c) => by === 'time' ? ((DT[c.id] || {}).secs || 0) - ((DT[a.id] || {}).secs || 0) || (c.added || 0) - (a.added || 0)
      : by === 'added' ? (c.added || 0) - (a.added || 0)
      : ((DT[c.id] || {}).last || c.added || 0) - ((DT[a.id] || {}).last || a.added || 0));
    list.innerHTML = '';
    if (!files.length) { list.innerHTML = `<li class="file-empty muted">${V('No files yet \u2014 add a PDF or paste a Google link.', 'Chưa có tệp nào \u2014 hãy thêm PDF hoặc dán liên kết Google.')}</li>`; return; }
    files.forEach(f => {
      const isLink = f.kind === 'glink', li = document.createElement('li');
      li.innerHTML = `<span class="ftype">${esc(isLink ? (GDOC_LABEL[f.gtype] || 'LINK') : (extOf(f.name).toUpperCase() || 'FILE'))}</span><span class="fname" role="button" tabindex="0"></span><span class="ftime muted"></span><button type="button" class="x" aria-label="${V('Remove', 'Gỡ')} ${esc(f.name)}">\u00d7</button>`;
      const nameEl = $('.fname', li); nameEl.textContent = f.name; nameEl.title = f.name;
      const dt = DT[f.id]; if (dt && dt.secs) { const tm = $('.ftime', li); tm.textContent = '\u23f1 ' + fmtT(dt.secs); tm.title = V('Time with this document, all time \u00b7 opened ', 'Tổng thời gian với tài liệu này \u00b7 đã mở ') + dt.opens + '\u00d7'; }
      nameEl.addEventListener('click', () => showFile(f));
      nameEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showFile(f); } });
      $('.x', li).addEventListener('click', async () => { try { await idb.delete(f.id); } catch (e) { fail(V('Couldn\u2019t remove it: ', 'Không gỡ được: ') + e.message); } draw(); });
      list.appendChild(li);
    });
  }
  input.addEventListener('change', async () => {
    const skipped = []; let n = 0;
    for (const file of input.files) {
      if (extOf(file.name) !== 'pdf' && file.type !== 'application/pdf') { skipped.push(file.name); continue; }
      try { await idb.put({ id: uid() + Date.now().toString(36), name: file.name, blob: file, added: Date.now() }); n++; } catch (e) { fail(V('Couldn\u2019t save ', 'Không lưu được ') + file.name + ': ' + e.message); }
    }
    input.value = ''; draw();
    if (skipped.length) fail(V('Only PDFs can be opened here. For Word, PowerPoint or Excel files, share them to Google and paste the link instead (', 'Ở đây chỉ mở được PDF. Với tệp Word, PowerPoint hay Excel, hãy chia sẻ lên Google rồi dán liên kết (') + skipped.join(', ') + ').');
    if (n) toast(n === 1 ? V('File added.', 'Đã thêm tệp.') : V(n + ' files added.', 'Đã thêm ' + n + ' tệp.'));
  });
  $('#file-glink', b).addEventListener('submit', async e => {
    e.preventDefault();
    const urlEl = $('#glink-url', b), nameEl = $('#glink-name', b), g = parseGoogleLink(urlEl.value);
    if (!g) { toast(V('That link doesn\u2019t look like a Google Docs, Slides, Sheets or Drive link.', 'Liên kết này có vẻ không phải liên kết Google Docs, Slides, Sheets hay Drive.')); return; }
    try { await idb.put({ id: uid() + Date.now().toString(36), kind: 'glink', name: nameEl.value.trim() || (GDOC_NAME[g.gtype] + ' ' + g.id.slice(0, 6)), url: urlEl.value.trim(), gtype: g.gtype, added: Date.now() }); }
    catch (err) { fail(V('Couldn\u2019t save the link: ', 'Không lưu được liên kết: ') + err.message); return; }
    urlEl.value = ''; nameEl.value = ''; draw(); toast(V('Link added.', 'Đã thêm liên kết.'));
  });
  const sortEl = $('#file-sort', b); sortEl.value = state.filesSort; sortEl.addEventListener('change', () => { state.filesSort = sortEl.value; save(); draw(); });
  filesRedraw = draw; draw();
  return () => { if (filesRedraw === draw) filesRedraw = null; };
}

const I = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
/* ---------- Translate (v0.8.0) ----------
   Layered, per the scoping doc: (B) Chrome's built-in on-device Translator / LanguageDetector APIs (Chrome 138+, desktop; language packs
   download on first use, then it works offline and the text never leaves the computer) and (C) a link that opens Google Translate in a new
   tab with the text filled in. Google's cloud engine (option A) needs a backend and is not in this version. No XP for translating itself
   (it would be farmed by pasting) — XP comes from saving words and reviewing them. History is the last 20 translations, on this device. */
const TR_LANGS = [['en', V('English', 'Tiếng Anh')], ['vi', V('Vietnamese', 'Tiếng Việt')], ['zh', V('Chinese', 'Tiếng Trung')], ['ja', V('Japanese', 'Tiếng Nhật')], ['ko', V('Korean', 'Tiếng Hàn')], ['fr', V('French', 'Tiếng Pháp')], ['es', V('Spanish', 'Tiếng Tây Ban Nha')], ['de', V('German', 'Tiếng Đức')], ['it', V('Italian', 'Tiếng Ý')], ['pt', V('Portuguese', 'Tiếng Bồ Đào Nha')], ['ru', V('Russian', 'Tiếng Nga')], ['th', V('Thai', 'Tiếng Thái')], ['id', V('Indonesian', 'Tiếng Indonesia')], ['ar', V('Arabic', 'Tiếng Ả Rập')]];
const trName = c => (TR_LANGS.find(l => l[0] === c) || [c, c])[1], trCache = new Map();
const googleTranslateUrl = (text, from, to) => 'https://translate.google.com/?sl=' + encodeURIComponent(from) + '&tl=' + encodeURIComponent(to) + '&text=' + encodeURIComponent(text) + '&op=translate';
async function trRun(text, from, to, onProgress) {
  if (typeof self.Translator === 'undefined') throw { code: 'noapi' };
  if (from === 'auto') {
    if (typeof self.LanguageDetector === 'undefined') throw { code: 'noapi' };
    const det = await self.LanguageDetector.create(), res = await det.detect(text); from = res && res[0] && res[0].detectedLanguage;
    if (!from || from === 'und') throw { code: 'detect' };
  }
  if (from === to) return { out: text, from };
  const key = from + '>' + to; let tr = trCache.get(key);
  if (!tr) {
    const av = await self.Translator.availability({ sourceLanguage: from, targetLanguage: to });
    if (av === 'unavailable') throw { code: 'pair', from, to };
    tr = await self.Translator.create({ sourceLanguage: from, targetLanguage: to, monitor(m) { m.addEventListener('downloadprogress', e => onProgress && onProgress(e.loaded)); } });
    trCache.set(key, tr);
  }
  return { out: await tr.translate(text), from };
}
function trErr(e, from, to) {
  if (e && e.code === 'noapi') return V(`Translating inside ${APP} needs Chrome 138 or later on a computer. Use Google Translate below.`, `Dịch ngay trong ${APP} cần Chrome 138 trở lên trên máy tính. Hãy dùng Google Dịch ở dưới.`);
  if (e && e.code === 'pair') return V('Chrome can’t translate ' + trName(e.from) + ' → ' + trName(e.to) + ' on this device yet. Use Google Translate below.', 'Chrome chưa dịch được ' + trName(e.from) + ' → ' + trName(e.to) + ' trên thiết bị này. Hãy dùng Google Dịch ở dưới.');
  if (e && e.code === 'detect') return V('I couldn’t tell which language that is — pick it from the list.', 'Không nhận ra đây là ngôn ngữ nào — hãy chọn trong danh sách.');
  console.warn('translate failed', e); return V('That didn’t work this time. Try again, or use Google Translate below.', 'Lần này chưa được. Hãy thử lại, hoặc dùng Google Dịch ở dưới.');
}
function renderTranslate(b) {
  const S = state.tr, canAuto = typeof self.LanguageDetector !== 'undefined'; if (S.from === 'auto' && !canAuto) S.from = 'en';
  const opts = (sel, auto) => (auto && canAuto ? `<option value="auto" ${sel === 'auto' ? 'selected' : ''}>${V('Detect language', 'Phát hiện ngôn ngữ')}</option>` : '') + TR_LANGS.map(([c, n]) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${n}</option>`).join('');
  b.innerHTML = `<div class="tr"><div class="row tr-langs"><select id="tr-from" aria-label="${V('Translate from', 'Dịch từ')}">${opts(S.from, true)}</select><button type="button" class="btn" data-a="swap" aria-label="${V('Swap languages', 'Đổi chiều ngôn ngữ')}" title="${V('Swap languages', 'Đổi chiều ngôn ngữ')}">⇄</button><select id="tr-to" aria-label="${V('Translate to', 'Dịch sang')}">${opts(S.to, false)}</select></div>
    <textarea id="tr-in" rows="4" maxlength="500" placeholder="${V('Type or paste a word or sentence…', 'Gõ hoặc dán một từ hay một câu…')}" aria-label="${V('Text to translate', 'Văn bản cần dịch')}"></textarea>
    <div class="row"><button type="button" class="btn primary" data-a="go">${V('Translate', 'Dịch')}</button><button type="button" class="btn" data-a="paste">${V('Paste', 'Dán')}</button><button type="button" class="btn" data-a="clear">${V('Clear', 'Xóa')}</button><span class="muted" id="tr-count">0 / 500</span></div>
    <div class="tr-out" id="tr-out" aria-live="polite"></div>
    <div class="row"><span id="tr-own" hidden><button type="button" class="btn" data-a="copy">${V('Copy', 'Sao chép')}</button> <button type="button" class="btn" data-a="save">＋ ${V('Word bank', 'Kho từ vựng')}</button></span><button type="button" class="btn" data-a="google">${V('Open in Google Translate ↗', 'Mở trong Google Dịch ↗')}</button></div>
    <p class="muted" id="tr-note"></p>
    <details class="tr-hist"><summary id="tr-hs"></summary><ul id="tr-hl"></ul></details></div>`;
  const $$ = id => $('#' + id, b), inp = $$('tr-in'), fromSel = $$('tr-from'), toSel = $$('tr-to'), out = $$('tr-out'), own = $$('tr-own'), note = $$('tr-note'), goBtn = b.querySelector('[data-a=go]'); let cur = null;
  const count = () => { $$('tr-count').textContent = inp.value.length + ' / 500'; };
  function drawHist() {
    $$('tr-hs').textContent = V('Recent (', 'Gần đây (') + S.hist.length + ')';
    $$('tr-hl').innerHTML = S.hist.map((h, i) => `<li><button type="button" class="linkish" data-h="${i}" title="${V('Use this again', 'Dùng lại')}">${esc(h.src.slice(0, 40))} → ${esc(h.out.slice(0, 40))}</button></li>`).join('') || `<li class="muted">${V('Nothing yet.', 'Chưa có gì.')}</li>`;
  }
  async function go() {
    const text = inp.value.trim(); if (!text) { inp.focus(); return; }
    const from = fromSel.value, to = toSel.value; S.from = from; S.to = to; save();
    out.textContent = V('Translating…', 'Đang dịch…'); note.textContent = ''; own.hidden = true; goBtn.disabled = true; cur = null;
    try {
      const r = await trRun(text, from, to, p => { out.textContent = V('Downloading the language pack… ', 'Đang tải gói ngôn ngữ… ') + Math.round(p * 100) + V('% (first time only)', '% (chỉ lần đầu)'); });
      cur = { src: text, out: r.out, from: r.from, to }; out.textContent = r.out; own.hidden = false;
      note.textContent = V('Translated on this device by Chrome — your text isn’t sent anywhere.', 'Chrome đã dịch ngay trên thiết bị này — văn bản của bạn không được gửi đi đâu cả.');
      stat('translations'); S.hist.unshift({ from: r.from, to, src: text.slice(0, 200), out: r.out.slice(0, 400) }); S.hist.length = Math.min(S.hist.length, 20); save(); drawHist();
    } catch (e) { out.textContent = ''; note.textContent = trErr(e, from, to); }
    goBtn.disabled = false;
  }
  b.addEventListener('click', async e => {
    const h = e.target.closest('[data-h]')?.dataset.h;
    if (h !== undefined) { const it = S.hist[+h]; if (it) { inp.value = it.src; fromSel.value = it.from; toSel.value = it.to; count(); go(); } return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'go') go();
    else if (a === 'clear') { inp.value = ''; out.textContent = ''; note.textContent = ''; own.hidden = true; cur = null; count(); inp.focus(); }
    else if (a === 'paste') { try { inp.value = (await navigator.clipboard.readText()).slice(0, 500); count(); } catch (err) { toast(V('Press Ctrl+V to paste.', 'Nhấn Ctrl+V để dán.')); } }
    else if (a === 'swap') {
      const f = fromSel.value, t = toSel.value;
      if (f === 'auto') { fromSel.value = t; toSel.value = cur ? cur.from : (t === 'en' ? 'vi' : 'en'); } else { fromSel.value = t; toSel.value = f; }
      if (cur) { inp.value = cur.out; count(); } S.from = fromSel.value; S.to = toSel.value; save(); out.textContent = ''; own.hidden = true; cur = null;
    }
    else if (a === 'copy' && cur) { try { await navigator.clipboard.writeText(cur.out); toast(V('Copied', 'Đã sao chép')); } catch (err) { toast(V('Select the text and press Ctrl+C.', 'Hãy chọn văn bản rồi nhấn Ctrl+C.')); } }
    else if (a === 'save' && cur) {
      const outIsTerm = cur.to === 'en' && cur.from !== 'en';                      // the English side is the word being learned
      toast(cur.src.length > 80 || cur.out.length > 240 ? V('Saving works for words and short phrases (up to 80 characters).', 'Chỉ lưu được từ và cụm từ ngắn (tối đa 80 ký tự).')
        : bankMsg(bankAdd(outIsTerm ? { term: cur.out, meaning: cur.src, from: 'translate' } : { term: cur.src, meaning: cur.out, from: 'translate' })));
    }
    else if (a === 'google') { const t = inp.value.trim(); window.open(googleTranslateUrl(t, fromSel.value, toSel.value), '_blank', 'noopener'); }
  });
  inp.addEventListener('input', count); inp.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });
  fromSel.addEventListener('change', () => { S.from = fromSel.value; save(); }); toSel.addEventListener('change', () => { S.to = toSel.value; save(); });
  drawHist(); count();
}

/* ---------- Dictionary (v0.8.0) ----------
   English definitions from the free dictionaryapi.dev service (no key; needs the host permission in manifest.json). It is a third-party,
   best-effort service: if it can't be reached the widget says so. Look-ups earn no XP; saving a word to the word bank earns a little. */
function renderDictionary(b) {
  b.innerHTML = `<div class="row"><input id="dc-in" type="text" maxlength="40" placeholder="${V('Look up an English word…', 'Tra một từ tiếng Anh…')}" aria-label="${V('English word', 'Từ tiếng Anh')}" autocomplete="off"><button type="button" class="btn primary" data-a="go">${V('Look up', 'Tra')}</button></div>
    <div id="dc-out" aria-live="polite"><p class="muted">${V('English words only — use Translate for other languages.', 'Chỉ tra từ tiếng Anh — dùng Dịch cho các ngôn ngữ khác.')}</p></div>`;
  const inp = $('#dc-in', b), out = $('#dc-out', b); let entry = null;
  async function look() {
    const word = inp.value.trim().toLowerCase(); if (!word) { inp.focus(); return; }
    if (navigator.onLine === false) { out.innerHTML = `<p>${V('You’re offline — the dictionary needs the internet.', 'Bạn đang ngoại tuyến — từ điển cần có internet.')}</p>`; return; }
    out.innerHTML = `<p class="muted">${V('Looking it up…', 'Đang tra…')}</p>`; entry = null;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word), { signal: ctl.signal });
      if (res.status === 404) { out.innerHTML = `<p>${V(`No definition found for <b>${esc(word)}</b>. Check the spelling, or try Translate.`, `Không tìm thấy định nghĩa cho <b>${esc(word)}</b>. Hãy kiểm tra chính tả, hoặc thử Dịch.`)}</p>`; return; }
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json(); entry = Array.isArray(data) ? data[0] : null; if (!entry) throw new Error('empty');
      stat('lookups'); show();
    } catch (e) { out.innerHTML = `<p>${V('The dictionary can’t be reached right now. Check your internet connection and try again.', 'Hiện không kết nối được với từ điển. Hãy kiểm tra internet rồi thử lại.')}</p>`; }
    finally { clearTimeout(timer); }
  }
  const firstDef = () => { for (const m of entry.meanings || []) for (const d of m.definitions || []) if (d.definition) return d; return null; };
  function show() {
    const ph = (entry.phonetics || []).find(x => x.audio && /^https:/.test(x.audio)), ipa = entry.phonetic || ((entry.phonetics || []).find(x => x.text) || {}).text || '';
    out.innerHTML = `<div class="dc-head"><h3>${esc(entry.word)}</h3><span class="muted">${esc(ipa)}</span>${ph ? `<button type="button" class="btn" data-a="say" data-url="${esc(ph.audio)}" aria-label="${V('Hear it', 'Nghe phát âm')}">🔊</button>` : ''}<button type="button" class="btn" data-a="save">＋ ${V('Word bank', 'Kho từ vựng')}</button></div>`
      + (entry.meanings || []).slice(0, 3).map(m => `<h4>${esc(m.partOfSpeech || '')}</h4><ol>${(m.definitions || []).slice(0, 2).map(d => `<li>${esc(d.definition)}${d.example ? `<br><i class="muted">${esc(d.example)}</i>` : ''}</li>`).join('')}</ol>`).join('');
  }
  b.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a;
    if (a === 'go') look();
    else if (a === 'say') { try { new Audio(el.dataset.url).play().catch(() => toast(V('Couldn’t play the sound.', 'Không phát được âm thanh.'))); } catch (err) { /* no audio */ } }
    else if (a === 'save' && entry) { const d = firstDef(); toast(d ? bankMsg(bankAdd({ term: entry.word, meaning: d.definition, example: d.example, from: 'dictionary' })) : V('No definition to save.', 'Không có định nghĩa để lưu.')); }
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') look(); });
}

/* ---------- Flashcards (v0.8.0) ----------
   Reviews the word bank. A session is up to 10 due cards; "Got it" moves a card up a Leitner box, "Not yet" sends it to box 1 and shows it once more
   at the end of the session (that retry changes nothing). XP: 1 per card answered right in a scheduled review (cap 30 a day) + 3 for the day's first
   finished session of 3+ cards. A card that's answered can't be due again the same day, and "Practice anyway" (nothing due) changes no schedule and
   earns no XP, so there is nothing to farm. */
function renderCards(b) {
  let sess = null, listOpen = false;
  const mastered = () => state.words.filter(w => w.box >= 5).length;
  function home() {
    const due = bankDue().length, n = state.words.length, W = state.words.slice().sort((a, c) => c.added - a.added).slice(0, 100);
    b.innerHTML = `<div class="fc-sum"><div><b>${due}</b><span>${V('due today', 'đến hạn hôm nay')}</span></div><div><b>${n}</b><span>${V('words', 'từ')}</span></div><div><b>${mastered()}</b><span>${V('mastered', 'đã thuộc')}</span></div></div>`
      + (n === 0 ? `<p class="muted">${V('Your word bank is empty. Save words from <b>Translate</b>, <b>Dictionary</b> or <b>Idiom of the Day</b> — or add one below.', 'Kho từ vựng đang trống. Hãy lưu từ từ <b>Dịch</b>, <b>Từ điển</b> hoặc <b>Thành ngữ hôm nay</b> — hoặc thêm ở dưới.')}</p>`
        : due ? `<div class="row"><button type="button" class="btn primary" data-a="review">${V(`Review ${Math.min(10, due)} card${Math.min(10, due) === 1 ? '' : 's'}`, `Ôn ${Math.min(10, due)} thẻ`)}</button></div>`
        : `<p>🎉 ${V('All caught up for today!', 'Hôm nay bạn đã ôn xong hết!')}</p><div class="row"><button type="button" class="btn" data-a="practice">${V('Practice anyway', 'Vẫn luyện tập')} <span class="muted">${V('(no XP)', '(không có XP)')}</span></button></div>`)
      + `<div class="row fc-add"><input id="fc-t" type="text" placeholder="${V('Word or phrase', 'Từ hoặc cụm từ')}" maxlength="80" aria-label="${V('Word or phrase', 'Từ hoặc cụm từ')}"><input id="fc-m" type="text" placeholder="${V('Meaning', 'Nghĩa')}" maxlength="240" aria-label="${V('Meaning', 'Nghĩa')}"><button type="button" class="btn" data-a="add">${V('Add', 'Thêm')}</button></div>
      <details id="fc-det" ${listOpen ? 'open' : ''}><summary>${V('Word bank', 'Kho từ vựng')} (${n})</summary><ul class="fc-list">${W.map(w => `<li><span><b>${esc(w.term)}</b> — ${esc(w.meaning)}</span><span class="muted">${V('box', 'hộp')} ${w.box}</span><button type="button" class="x" data-del="${w.id}" aria-label="${V('Delete', 'Xóa')} ${esc(w.term)}">×</button></li>`).join('')}</ul>${n > 100 ? `<p class="muted">${V('Showing the newest 100.', 'Đang hiện 100 từ mới nhất.')}</p>` : ''}</details>`;
  }
  function start(practice) {
    const pool = practice ? state.words.slice() : bankDue();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const pick = pool.slice(0, 10); if (!pick.length) { home(); return; }
    sess = { q: pick.map(w => ({ id: w.id, retry: false })), i: 0, total: pick.length, right: 0, answered: 0, shown: false, practice }; card();
  }
  function card() {
    if (!sess || sess.i >= sess.q.length) { finish(); return; }
    const it = sess.q[sess.i], w = state.words.find(x => x.id === it.id); if (!w) { sess.i++; card(); return; }
    b.innerHTML = `<p class="muted">${sess.practice ? V('Practice', 'Luyện tập') : V('Review', 'Ôn tập')} · ${it.retry ? V('one more try', 'thử thêm lần nữa') : V('card ' + (sess.answered + 1) + ' of ' + sess.total, 'thẻ ' + (sess.answered + 1) + '/' + sess.total)}</p>
      <div class="fc-card"><div class="fc-term">${esc(w.term)}</div>${sess.shown ? `<div class="fc-def">${esc(w.meaning)}</div>${w.example ? `<div class="fc-ex">${esc(w.example)}</div>` : ''}` : ''}</div>
      <div class="row">${sess.shown ? `<button type="button" class="btn" data-a="no">✗ ${V('Not yet', 'Chưa thuộc')}</button><button type="button" class="btn primary" data-a="yes">✓ ${V('Got it', 'Đã thuộc')}</button>` : `<button type="button" class="btn primary" data-a="show">${V('Show answer', 'Xem đáp án')}</button>`}<button type="button" class="btn" data-a="stop">${V('Stop', 'Dừng')}</button></div>`;
  }
  function answer(right) {
    const it = sess.q[sess.i], w = state.words.find(x => x.id === it.id);
    if (w && !it.retry) {
      sess.answered++;
      if (!sess.practice) { bankAnswer(w, right); stat('cardsReviewed'); if (right) awardXP('cards', 1, {}); }
      if (right) sess.right++; else sess.q.push({ id: w.id, retry: true });
    }
    sess.i++; sess.shown = false; card();
  }
  function finish() {
    const s = sess; sess = null; let bonus = 0, today = dayKey(Date.now());
    if (!s.practice && s.total >= 3 && state.cardsBonusDate !== today) { state.cardsBonusDate = today; bonus = awardXP('cards', 3, {}); save(); }
    b.innerHTML = `<div class="fc-done"><h3>${V('Session complete 🎉', 'Hoàn thành phiên ôn 🎉')}</h3><p>${V(`${s.right} of ${s.total} right first time.`, `Đúng ngay lần đầu ${s.right}/${s.total} thẻ.`)}${bonus ? V(` <b>+${bonus} XP</b> bonus.`, ` Thưởng <b>+${bonus} XP</b>.`) : ''}</p></div><div class="row"><button type="button" class="btn primary" data-a="home">${V('Done', 'Xong')}</button></div>`;
  }
  b.addEventListener('click', e => {
    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del) { listOpen = true; state.words = state.words.filter(w => w.id !== del); save(); home(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'review') start(false); else if (a === 'practice') start(true);
    else if (a === 'show') { sess.shown = true; card(); } else if (a === 'yes') answer(true); else if (a === 'no') answer(false);
    else if (a === 'stop' || a === 'home') { sess = null; home(); }
    else if (a === 'add') { const r = bankAdd({ term: $('#fc-t', b).value, meaning: $('#fc-m', b).value, from: 'manual' }); toast(bankMsg(r)); if (!r.ok && r.why !== 'empty') return; }
  });
  b.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.fc-add')) { e.preventDefault(); b.querySelector('[data-a=add]').click(); } });
  bankRedraw = () => { if (!sess) home(); };
  home();
  return () => { if (bankRedraw) bankRedraw = null; };
}

const WIDGETS = [
  { id: 'clock', title: V('⏰ Clock', '⏰ Đồng hồ'), icon: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'), w: 220, h: 270, render: renderClock },
  { id: 'timer', title: V('⏱️ Focus Timer', '⏱️ Hẹn giờ tập trung'), icon: I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'), w: 280, h: 300, render: renderTimer },
  { id: 'todo', title: V('📝 Homework Assignments', '📝 Bài tập về nhà'), icon: I('<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'), w: 320, h: 440, render: renderTodo },
  { id: 'reading', title: V('📚 Reading Log', '📚 Nhật ký đọc'), icon: I('<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z M12 6v13"/>'), w: 340, h: 430, render: renderReading },
  { id: 'notes', title: V('🗒️ Notepad', '🗒️ Sổ tay'), icon: I('<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3M6 7H4M6 11H4M6 15H4"/>'), w: 360, h: 520, render: renderNotes },
  { id: 'games', title: V('🎮 Games Hub', '🎮 Trò chơi'), icon: I('<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.5h5M15 11h.01M18 14h.01"/>'), w: 330, h: 300, render: renderGames },
  { id: 'files', title: V('📂 Files', '📂 Tệp'), icon: I('<path d="M4 4h10l4 4v12H4z"/><path d="M14 4v4h4M8 13h8M8 17h5"/>'), w: 320, h: 400, render: renderFiles },
  { id: 'idiom', title: V('💡 Idiom of the Day', '💡 Thành ngữ hôm nay'), icon: I('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'), w: 320, h: 330, render: renderIdiom },
  { id: 'translate', title: V('🌐 Translate', '🌐 Dịch'), icon: I('<path d="M4 5h9M8 3v2M6 5c0 4 3 7 6 8M12 5c-1 4-4 7-8 8M13 20l4-9 4 9M14.5 17h5"/>'), w: 340, h: 480, render: renderTranslate },
  { id: 'dict', title: V('📖 Dictionary', '📖 Từ điển'), icon: I('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>'), w: 340, h: 440, render: renderDictionary },
  { id: 'cards', title: V('🗂️ Flashcards', '🗂️ Thẻ ghi nhớ'), icon: I('<rect x="3" y="7" width="14" height="11" rx="2"/><path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>'), w: 340, h: 470, render: renderCards },
  { id: 'stats', title: V('📈 Stats & XP', '📈 Thống kê & XP'), icon: I('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'), w: 400, h: 600, full: true, render: renderStats },   // full: true = fills the whole screen (v0.9.2); the other widgets float on top of it
  { id: 'badges', title: V('🏅 Badges & Rewards', '🏅 Huy hiệu & Phần thưởng'), icon: I('<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>'), w: 400, h: 600, full: true, render: renderBadges },   // v0.9.9: the full badge display (moved out of Stats & XP)
  { id: 'journey', title: V('🗺️ Journey', '🗺️ Hành trình'), icon: I('<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 15c1.2 1.2 2.8 1.2 4 0"/>'), w: 360, h: 480, render: renderJourney },
  { id: 'sharedboard', title: V('🖥️ Shared Board', '🖥️ Bảng chia sẻ'), icon: I('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'), w: 400, h: 600, full: true, render: renderSharedBoard },   // v0.14.0: live view of whatever the teacher is sharing from DrawDeck
  { id: 'boardassign', title: V('📋 Board Assignments', '📋 Bài tập trên bảng'), icon: I('<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'), w: 400, h: 600, full: true, render: renderBoardAssign },   // v0.17.0 (backend v2.9.0): draw an answer on a page the teacher pushed (DrawDeck scope step D)
  { id: 'scrap', title: '🖼️ Scrapdeck', icon: I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5L8 19"/>'), w: 400, h: 600, full: true, render: renderScrapdeck },   // v0.12.0: scrapbook pages (js/scrapdeck.js); full-screen like Stats & XP
  { id: 'class', title: V('🏫 Class', '🏫 Lớp'), icon: I('<path d="M7 18a4.5 4.5 0 0 1-.6-8.96 5.5 5.5 0 0 1 10.7-1.6A4 4 0 0 1 17.5 18H7Z"/>'), w: 330, h: 460, render: renderClass }
];
/* UniStudentDeck edition: the scope doc's "From StudentDeck to UniDeck" table, as far as it goes without the new course backend.
   Dropped: Games Hub, Idiom of the Day, Scrapdeck, and Badges & Rewards (lighter gamification). Renamed for an adult tone.
   Saved layouts, panels and dock placements of a dropped widget are kept untouched.
   UniDeck phase 1: the school-class widgets (Cloud Class, Shared Board, Board Assignments) give way to UniDeck's own
   course widgets, which UniStudentDeck's js/uni-courses-ui.js lists in window.UNI_WIDGETS ({ id, title, iconPath, w, h,
   render, cat? }); the to-do list is "To-do" again now that real course Assignments exist. */
const UNI_DROP = ['games', 'idiom', 'scrap', 'badges', 'class', 'sharedboard', 'boardassign'];
const UNI_TITLES = { todo: V('📝 To-do', '📝 Việc cần làm'), reading: V('📚 Reading List', '📚 Danh sách đọc'), notes: V('🗒️ Notes', '🗒️ Ghi chú'), stats: V('📈 Study Stats', '📈 Thống kê học tập'), journey: V('📓 Journal', '📓 Nhật ký') };
if (UNI) {
  for (let i = WIDGETS.length - 1; i >= 0; i--) if (UNI_DROP.includes(WIDGETS[i].id)) WIDGETS.splice(i, 1);
  WIDGETS.forEach(w => { if (UNI_TITLES[w.id]) w.title = UNI_TITLES[w.id]; });
  (window.UNI_WIDGETS || []).forEach(w => { if (!WIDGETS.some(x => x.id === w.id)) WIDGETS.push({ ...w, icon: I(w.iconPath || '<circle cx="12" cy="12" r="8"/>') }); });
}

/* ---------- Shell: panels, drag, resize, dock ---------- */
const wall = $("#wall"), panels = {}; let topZ = 10, pinZ = 1000;
/* z-index counter: never re-append (breaks pointer capture). Ordinary widgets live in 11..979, below the document stage (1000);
   a pinned widget (Files viewer → Widgets menu) counts up from 1001, above it. */
function front(el) {
  if (el.dataset.onTop === '1') { if (+el.style.zIndex !== pinZ) el.style.zIndex = ++pinZ; return; }
  if (+el.style.zIndex === topZ) return;
  if (topZ >= 979) {                                                            // out of room: renumber the ordinary widgets 11, 12, …
    const list = Object.values(panels).map(o => o.el).filter(e => e.dataset.onTop !== '1').sort((a, b) => a.style.zIndex - b.style.zIndex);
    list.forEach((e, i) => { e.style.zIndex = 11 + i; }); topZ = 10 + list.length;
  }
  el.style.zIndex = ++topZ;
}
function setPinned(id, on) {
  const o = panels[id]; if (!o) return;
  if (on) o.el.dataset.onTop = '1'; else delete o.el.dataset.onTop;
  o.el.classList.toggle('is-pinned', !!on); o.el.style.zIndex = ''; front(o.el);
}

function gesture(handle, el, mode, id) {
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || (mode === 'move' && e.target.closest('button'))) return;
    const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop, ow = el.offsetWidth, oh = el.offsetHeight;
    handle.setPointerCapture(e.pointerId); front(el); e.preventDefault();
    const ds = document.getElementById('doc-stage'); if (ds) ds.classList.add('shielded');       // an iframe under the pointer would swallow the drag
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (mode === 'move') { el.style.left = clamp(ox + dx, 0, wall.clientWidth - 150) + 'px'; el.style.top = clamp(oy + dy, 0, wall.clientHeight - 44) + 'px'; }
      else { el.style.width = Math.max(220, ow + dx) + 'px'; el.style.height = Math.max(140, oh + dy) + 'px'; }
    };
    const up = () => {
      ['pointermove', 'pointerup', 'pointercancel'].forEach((t, i) => handle.removeEventListener(t, [mv, up, up][i]));
      if (ds) ds.classList.remove('shielded');
      const L = state.layout[id]; L.x = el.offsetLeft; L.y = el.offsetTop; L.w = el.offsetWidth; if (!L.min) L.h = el.offsetHeight; save();
    };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  });
}

/* A widget with `full: true` (Stats & XP, v0.9.2) fills the whole screen instead of floating: it can't be dragged or resized, it sits UNDER every
   ordinary widget (so a Notepad or Homework window can be opened on top of it), the top bar is hidden while it is open so it starts at the very top
   edge, and the dock floats over its bottom (its body has extra padding so the last card scrolls clear). Minimise turns it into a small floating
   title bar; the "Toolbar" button in its header brings the top bar back (state.fsBar, remembered). All of this is CSS keyed off `.widget.full` and
   `body.fs-open`; syncFullscreen() keeps that body class in step. */
function syncFullscreen() {
  const any = Object.values(panels).some(o => o.el.classList.contains('full') && !o.el.classList.contains('min'));
  document.body.classList.toggle('fs-open', any && !state.fsBar);
  Object.values(panels).forEach(o => { const t = o.el.querySelector('[data-w="bar"]'); if (t) { t.classList.toggle('on', !!state.fsBar); t.title = state.fsBar ? V('Hide the top bar', 'Ẩn thanh trên cùng') : V('Show the top bar', 'Hiện thanh trên cùng'); t.setAttribute('aria-pressed', String(!!state.fsBar)); } });
}
document.addEventListener('keydown', e => {                      // Esc leaves a full-screen widget, like the game stage (from the parallel v0.9.2 line)
  if (e.key !== 'Escape' || e.defaultPrevented || stageGame || docStageOpen() || $('#badge-view')) return;
  const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;   // Esc inside a text box cancels that edit, it doesn't close the page
  const fulls = Object.keys(panels).filter(k => panels[k].el.classList.contains('full') && !panels[k].el.classList.contains('min')), id = fulls.find(k => panels[k].el.classList.contains('fs-top')) || fulls[0]; if (id) requestClose(id);
});
/* ---------- Pro (v0.11.3) — PRO-TIERS.md ----------
   A student is Pro when a parent linked to them has ParentDeck Pro (backend v2.1.0 writes students/{id}.pro).
   PRO_GATE_ENABLED stays false until launch: nothing is locked. ?progate=1 previews the gate. A locked widget
   tells the child to ask a grown-up — StudentDeck never shows children a price or a purchase link. */
const PRO_GATE_ENABLED = false;
const PRO_WIDGETS = ['games', 'translate', 'dict', 'cards', 'idiom', 'scrap'];
ProGate.configure({
  enabled: PRO_GATE_ENABLED, ids: PRO_WIDGETS, pro: (() => { try { return localStorage.getItem('sd_pro') === '1'; } catch (e) { return false; } })(),
  title: V('⭐ A Pro widget', '⭐ Tiện ích Pro'), text: V('This one opens when your family has ParentDeck Pro. Ask a grown-up at home!', 'Tiện ích này mở khi gia đình bạn có ParentDeck Pro. Hãy hỏi người lớn ở nhà nhé!'),
  onChange: () => { if (ProGate.enabled) location.reload(); }
});
function setStudentPro(on) { try { localStorage.setItem('sd_pro', on ? '1' : '0'); } catch (e) {} ProGate.setPro(on); }
if (typeof SDCloud !== 'undefined' && SDCloud.onStatusChanged) {
  let proUnsub = null;
  SDCloud.onStatusChanged(st => {
    if (st === 'joined' && !proUnsub && SDCloud.subscribeStudent) proUnsub = SDCloud.subscribeStudent(s => setStudentPro(!!(s && s.pro && s.pro.active)));
    if (st === 'signedOut') { if (proUnsub) { proUnsub(); proUnsub = null; } setStudentPro(false); }
  });
}

function openWidget(id) {
  const def = WIDGETS.find(w => w.id === id); if (!def || panels[id]) return;
  const n = Object.keys(panels).length;
  let x = 24; Object.values(panels).forEach(o => { x = Math.max(x, o.el.offsetLeft + o.el.offsetWidth + 16); });   // tile beside open panels…
  const fits = x + def.w <= wall.clientWidth, off = fits ? 0 : 30 + n * 32;                                     // …or cascade if there's no room
  const L = state.layout[id] = { x: fits ? x : off, y: fits ? 24 : off, w: def.w, h: def.h, min: false, ...state.layout[id] };
  const full = !!def.full, el = document.createElement('section'); el.className = 'widget' + (full ? ' full' : '') + (!full && L.min ? ' min' : '');
  const top = clamp(L.y, 0, Math.max(0, wall.clientHeight - 44));                                   // and never taller than the space below it
  if (!full) el.style.cssText = `left:${clamp(L.x, 0, Math.max(0, wall.clientWidth - 150))}px;top:${top}px;width:${L.w}px;height:${Math.max(140, Math.min(L.h, wall.clientHeight - top - 8))}px`;
  el.innerHTML = `<div class="head">${full ? `<button class="btn" data-w="close" aria-label="${V('Back to', 'Quay lại')} ${APP}">\u2190 ${V('Back to', 'Quay lại')} ${APP}</button>` : ''}<span class="title" data-wl="${def.id}">${esc(widgetLabel(def.title))}</span>
    ${full ? `<button class="hbtn wide" data-w="bar" aria-label="${V('Show or hide the top bar', 'Hiện hoặc ẩn thanh trên cùng')}" title="${V('Show the top bar', 'Hiện thanh trên cùng')}">${V('Toolbar', 'Thanh công cụ')}</button>` : ''}<button class="hbtn" data-w="min" aria-label="${V('Minimise', 'Thu nhỏ')} ${esc(def.title)}">–</button><button class="hbtn" data-w="close" aria-label="${V('Close', 'Đóng')} ${esc(def.title)}">×</button></div>
    <div class="body"></div>${full ? '' : '<div class="grip" aria-hidden="true"></div>'}`;
  el.dataset.wid = id; wall.appendChild(el); front(el);
  if (!full) { gesture($('.head', el), el, 'move', id); gesture($('.grip', el), el, 'resize', id); }
  el.addEventListener('pointerdown', () => front(el));
  el.addEventListener('click', e => {
    const w = e.target.closest('[data-w]')?.dataset.w;
    if (w === 'close') requestClose(id);
    else if (w === 'min') { if (full) el.classList.toggle('min'); else { L.min = !L.min; el.classList.toggle('min', L.min); save(); } syncFullscreen(); }
    else if (w === 'bar') { state.fsBar = !state.fsBar; save(); syncFullscreen(); }
  });
  panels[id] = { el, cleanup: ProGate.render(def, $('.body', el)) };
  state.active[id] = true; save(); syncDock(); syncFullscreen();
  if (full) { raiseFull(id); closeAppTray(); }                                   // v0.9.5: picked from the app tray? the tray must not stay open over the page it just opened
  if (docStageOpen()) setPinned(id, true);                                                    // opened from the dock while reading: keep it visible
}
function closeWidget(id) {
  const o = panels[id]; if (!o) return;
  if (o.cleanup) o.cleanup(); o.el.remove(); delete panels[id]; state.active[id] = false; save(); syncDock(); syncFullscreen();
}
/* ---------- Layout modes, docks, app tray, Settings drawer (v0.9.0) ----------
   Ported from TeachersDeck v0.14.1 (same look and behaviour), trimmed to the layout side of its Settings.
   Every widget lives in exactly one launcher: the bottom dock (up to 10), the left or right drawer (up to 5 each) or "hidden". The app tray —
   a sheet that slides up from the tab on the dock's top edge — lists EVERY widget whatever its launcher, so nothing is ever unreachable.
     Compact : only the bottom dock; side drawers off; widget names without emoji.
     Cozy    : bottom + left + right docks; names with emoji.   (the default)
     Custom  : the student chooses each widget's launcher, the two drawers, and whether emoji show.
   A mode never moves a widget between docks — it only decides which docks are shown — so switching back and forth loses nothing.
   Not ported (needs TeachersDeck-only systems): top dock/pills, hover-to-open edge drawers, the Classes manager, language and theme pickers in Settings. */
const LAYOUT_MODES = ['compact', 'cozy', 'custom'];
const LAYOUT_TEXT = { compact: [V('Compact', 'Gọn'), V('Just the bottom dock \u2014 tap the arrow above it for an app tray with every widget', 'Chỉ có thanh dock dưới \u2014 bấm mũi tên phía trên để mở khay ứng dụng với mọi tiện ích')], cozy: [V('Cozy', 'Thoải mái'), V('Bottom, left and right docks all shown', 'Hiện cả thanh dock dưới, trái và phải')], custom: [V('Custom', 'Tùy chỉnh'), V('Pick each widget\u2019s dock and toggle drawers yourself', 'Tự chọn thanh dock cho từng tiện ích và bật/tắt ngăn bên')] };
const DOCK_CAPS = { bottom: 10, left: 5, right: 5 };
const PLACE_LABEL = { bottom: V('Bottom dock', 'Thanh dock dưới'), left: V('Left drawer', 'Ngăn trái'), right: V('Right drawer', 'Ngăn phải'), hidden: V('Hidden', 'Ẩn') };
const DEFAULT_PLACEMENT = { clock: 'bottom', timer: 'bottom', todo: 'bottom', reading: 'bottom', notes: 'bottom', files: 'bottom', translate: 'bottom', dict: 'bottom', cards: 'bottom', games: 'left', idiom: 'left', journey: 'left', scrap: 'left', stats: 'right', badges: 'right', class: 'right' };
const WIDGET_CAT = { timer: 'study', todo: 'study', reading: 'study', notes: 'study', files: 'study', translate: 'language', dict: 'language', cards: 'language', idiom: 'language', games: 'me', journey: 'me', scrap: 'me', stats: 'me', badges: 'me', class: 'cloud' };
if (UNI) (window.UNI_WIDGETS || []).forEach(w => { WIDGET_CAT[w.id] = w.cat || 'cloud'; });   // UniDeck's course widgets
const CATEGORIES = [['study', V('Study', 'Học tập')], ['language', V('Language', 'Ngôn ngữ')], ['me', U(V('Me & fun', 'Tôi & giải trí'), V('Me', 'Tôi'))], ['cloud', U(V('Class', 'Lớp'), V('Courses', 'Khóa học'))]];

const widgetsFor = loc => WIDGETS.filter(w => state.dockPlacement[w.id] === loc).slice(0, DOCK_CAPS[loc] || 99);   // a dock never shows more than its cap; the rest stay reachable in the tray
const placementCount = loc => widgetsFor(loc).length;
function ensureDockPlacement() {                       // first run, and any widget added in a later version: default launcher (or hidden if that dock is full)
  let changed = false;
  WIDGETS.forEach(w => {
    if (state.dockPlacement[w.id]) return;
    const want = DEFAULT_PLACEMENT[w.id] || 'hidden';
    state.dockPlacement[w.id] = want !== 'hidden' && placementCount(want) >= DOCK_CAPS[want] ? 'hidden' : want; changed = true;
  });
  if (changed) save();
}
const effectiveSideVisible = side => state.layoutMode === 'compact' ? false : state.layoutMode === 'cozy' ? true : !!state.edgeDock[side].visible;
const emojisVisible = () => state.layoutMode === 'compact' ? false : state.layoutMode === 'cozy' ? true : !!state.showEmojisCustom;
const stripLeadingEmoji = t => String(t).replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '');
const widgetLabel = title => emojisVisible() ? title : stripLeadingEmoji(title);       // the one place that decides whether a widget name carries its emoji
/* -- layout core above (pure logic) · DOM below -- */

const toggleWidget = id => panels[id] ? requestClose(id) : openWidget(id);
function syncDock() { document.querySelectorAll('.dock-item[data-id],.app-tray-item[data-id]').forEach(b => b.classList.toggle('active', !!panels[b.dataset.id])); }
function makeDockButton(w, cls) {
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = cls + (panels[w.id] ? ' active' : ''); btn.dataset.id = w.id;
  btn.setAttribute('aria-label', V('Toggle ', 'Bật/tắt ') + stripLeadingEmoji(w.title)); btn.title = w.title;
  btn.innerHTML = `<span class="dock-ic">${w.icon}</span><span data-wl="${w.id}">${esc(widgetLabel(w.title))}</span>`;
  btn.addEventListener('click', () => toggleWidget(w.id)); return btn;
}
const dock = $('#dock');
function buildDock() { dock.innerHTML = ''; widgetsFor('bottom').forEach(w => dock.appendChild(makeDockButton(w, 'dock-item'))); $('#dock-wrap').classList.toggle('auto-hide', !!state.dockAutoHide); }
function buildSideDock(side) {
  const box = $('#dock-' + side + '-items'); box.innerHTML = ''; widgetsFor(side).forEach(w => box.appendChild(makeDockButton(w, 'dock-item')));
  $('#dock-' + side).hidden = !effectiveSideVisible(side) || !box.children.length;
}
function buildAppTray() {
  const grid = $('#app-tray-grid'); grid.innerHTML = '';
  CATEGORIES.forEach(([id, label]) => {
    const ws = WIDGETS.filter(w => WIDGET_CAT[w.id] === id); if (!ws.length) return;
    const h = document.createElement('p'); h.className = 'app-tray-cat'; h.textContent = label; grid.appendChild(h);
    ws.forEach(w => grid.appendChild(makeDockButton(w, 'app-tray-item')));
  });
  WIDGETS.filter(w => !WIDGET_CAT[w.id]).forEach(w => grid.appendChild(makeDockButton(w, 'app-tray-item')));      // safety net: an uncategorised widget still shows
}
function openAppTray() { $('#app-tray-backdrop').hidden = false; const t = $('#app-tray-tab'); t.classList.add('open'); t.setAttribute('aria-expanded', 'true'); }
function closeAppTray() { $('#app-tray-backdrop').hidden = true; const t = $('#app-tray-tab'); t.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); }
function refreshWidgetTitles() {                       // open panels and every launcher re-label when the emoji setting changes
  document.querySelectorAll('[data-wl]').forEach(el => { const d = WIDGETS.find(w => w.id === el.dataset.wl); if (d) el.textContent = widgetLabel(d.title); });
}
function rebuildAllDocks() { buildDock(); buildSideDock('left'); buildSideDock('right'); buildAppTray(); syncDock(); }

function buildLayoutModeSelector() {
  const grid = $('#layout-mode-grid'); grid.innerHTML = '';
  LAYOUT_MODES.forEach(mode => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'layout-mode-opt' + (state.layoutMode === mode ? ' active' : ''); btn.dataset.mode = mode;
    btn.innerHTML = `<span class="layout-mode-name">${LAYOUT_TEXT[mode][0]}</span><span class="layout-mode-desc">${LAYOUT_TEXT[mode][1]}</span>`;
    btn.addEventListener('click', () => {
      if (state.layoutMode === mode) return; state.layoutMode = mode; save();
      rebuildAllDocks(); refreshWidgetTitles(); buildLayoutModeSelector(); buildLockedControls();
    });
    grid.appendChild(btn);
  });
}
function buildLockedControls() {                       // everything the mode locks (Compact / Cozy) and Custom unlocks
  const locked = state.layoutMode !== 'custom';
  const emoji = $('#show-emojis-toggle'), left = $('#drawer-left-visible'), right = $('#drawer-right-visible');
  emoji.checked = emojisVisible(); emoji.disabled = locked; emoji.closest('.switch-row').classList.toggle('locked', locked); $('#emoji-lock-hint').hidden = !locked;
  emoji.onchange = e => { state.showEmojisCustom = e.target.checked; save(); rebuildAllDocks(); refreshWidgetTitles(); };
  left.checked = effectiveSideVisible('left'); right.checked = effectiveSideVisible('right');
  [left, right].forEach(c => { c.disabled = locked; c.closest('.switch-row').classList.toggle('locked', locked); }); $('#drawers-lock-hint').hidden = !locked;
  left.onchange = e => { state.edgeDock.left.visible = e.target.checked; save(); rebuildAllDocks(); };
  right.onchange = e => { state.edgeDock.right.visible = e.target.checked; save(); rebuildAllDocks(); };
  const auto = $('#dock-autohide-toggle'); auto.checked = !!state.dockAutoHide; auto.onchange = e => { state.dockAutoHide = e.target.checked; save(); buildDock(); };
  buildDockPlacementList(locked);
}
function buildDockPlacementList(locked) {
  const box = $('#dock-vis-list'); box.innerHTML = ''; $('#dock-buttons-lock-hint').hidden = !locked;
  WIDGETS.forEach(w => {
    const row = document.createElement('div'); row.className = 'dock-vis-row placement-row' + (locked ? ' locked' : '');
    const name = document.createElement('span'); name.textContent = widgetLabel(w.title); name.dataset.wl = w.id; row.appendChild(name);
    const sel = document.createElement('select'); sel.disabled = locked; sel.setAttribute('aria-label', V('Launcher for ', 'Vị trí nút mở của ') + stripLeadingEmoji(w.title));
    Object.keys(PLACE_LABEL).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = PLACE_LABEL[k]; sel.appendChild(o); });
    sel.value = state.dockPlacement[w.id] || 'hidden';
    sel.addEventListener('change', () => {
      const target = sel.value;
      if (target !== 'hidden' && placementCount(target) >= DOCK_CAPS[target]) { toast(V(PLACE_LABEL[target] + ' is full (' + DOCK_CAPS[target] + ' max)', PLACE_LABEL[target] + ' đã đầy (tối đa ' + DOCK_CAPS[target] + ')')); sel.value = state.dockPlacement[w.id] || 'hidden'; return; }
      state.dockPlacement[w.id] = target; save(); rebuildAllDocks();
    });
    row.appendChild(sel); box.appendChild(row);
  });
}
const settingsDrawer = $('#settings-drawer');
function openSettings() { settingsDrawer.hidden = false; $('#btn-settings').setAttribute('aria-expanded', 'true'); }
function closeSettings() { settingsDrawer.hidden = true; $('#btn-settings').setAttribute('aria-expanded', 'false'); }
{ const dt = $('#sd-demo-toggle'), rg = $('#sd-demo-reset'), badge = $('#demo-badge');
  dt.textContent = SD_DEMO.active ? V('Exit the demo', 'Thoát demo') : V('Try the demo', 'Dùng thử demo');   // set here, not by data-vi: SD_LANG.apply() runs after this
  if (SD_DEMO.active) { rg.hidden = false; badge.hidden = false; }
  dt.addEventListener('click', () => SD_DEMO.active ? SD_DEMO.exit() : SD_DEMO.enter());
  rg.addEventListener('click', () => location.reload()); }                                      // the demo lives in memory, so a reload regenerates it
document.addEventListener('click', e => { if (e.target.closest('[data-demo-start]')) SD_DEMO.enter(); });
{ const xt = $('#edition-xp-toggle');                              // UniStudentDeck's XP and levels switch (js/edition.js); StudentDeck has none
  if (xt) { xt.checked = XP_ON; xt.addEventListener('change', () => ED.setXp(xt.checked)); } }
document.querySelectorAll('.app-name').forEach(el => { el.textContent = APP; });
$('#btn-settings').addEventListener('click', openSettings); $('#settings-close').addEventListener('click', closeSettings);
$('#app-tray-tab').addEventListener('click', () => $('#app-tray-backdrop').hidden ? openAppTray() : closeAppTray());
$('#app-tray-handle').addEventListener('click', closeAppTray);
$('#app-tray-backdrop').addEventListener('click', e => { if (e.target.id === 'app-tray-backdrop') closeAppTray(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#app-tray-backdrop').hidden) closeAppTray(); else if (!settingsDrawer.hidden) closeSettings(); } });
ensureDockPlacement(); rebuildAllDocks(); buildLayoutModeSelector(); buildLockedControls();
$('#ver').textContent = 'v' + VERSION;

/* New-tab pages: several can be open at once and every save writes the whole state, so
   pick up other tabs' changes (and re-draw open widgets) or a stale tab would overwrite them. */
window.addEventListener('storage', e => {
  if (e.key !== KEY) return;
  const n = load(), slice = st => JSON.stringify([st.todo, st.timer, st.reading, st.games, st.idiom, st.journal, st.notes, st.badges, st.hwDone]), changed = slice(n) !== slice(state);
  ['todo', 'timer', 'reading', 'games', 'idiom', 'journal', 'notes', 'badges', 'xp', 'stats', 'hwDone', 'hwPending', 'theme'].forEach(k => { state[k] = n[k]; });
  drawXP(0, false); refreshStats();
  if (changed) Object.keys(panels).forEach(id => { if (id === 'stats' || id === 'badges') return; const o = panels[id], def = WIDGETS.find(w => w.id === id);
    if (o.cleanup) o.cleanup(); const body = $('.body', o.el), c = body.cloneNode(false); body.replaceWith(c); o.cleanup = ProGate.render(def, c); });
});

$('#xp').addEventListener('click', () => { if (panels.stats) { front(panels.stats.el); raiseFull('stats'); } else openWidget('stats'); });

/* ---------- Theme customization pill (same 6 presets as TeachersDeck's theme picker) ---------- */
const PRESETS = [
  { id: 'dusk', css: 'linear-gradient(180deg,#1a2740 0%, #2c3b57 38%, #3f4f68 62%, #263248 100%)' },
  { id: 'chalk', css: 'linear-gradient(180deg,#2b2f26 0%, #3a4032 60%, #23261e 100%)' },
  { id: 'ocean', css: 'linear-gradient(180deg,#0e2f3f 0%, #164a5c 55%, #0c2733 100%)' },
  { id: 'sunrise', css: 'linear-gradient(180deg,#3a2140 0%, #7a4a55 45%, #c98a5e 100%)' },
  { id: 'slate', css: 'linear-gradient(180deg,#20242c 0%, #2b3038 100%)' },
  { id: 'plain', css: '#12161C' }
];
function applyTheme() {
  const p = PRESETS.find(p => p.id === state.theme) || PRESETS[0];
  document.body.style.background = presetBg(p);
  document.body.style.backgroundSize = 'cover';
}
const presetBg = p => (typeof DeckMode !== 'undefined') ? DeckMode.background(p.id, p.css) : p.css;   // Light mode: the same preset, pale (js/mode.js)
function buildThemePop() {                                          // Light / Dark on top (mounted once), the backgrounds below
  const pop = $('#theme-pop');
  if (!pop.querySelector('.swatch-grid')) {
    pop.innerHTML = `${typeof DeckMode !== 'undefined' ? `<p class="pop-label">${V('Mode', 'Chế độ')}</p><div class="mode-switch"></div><p class="pop-label">${V('Background', 'Hình nền')}</p>` : ''}<div class="swatch-grid"></div>`;
    if (typeof DeckMode !== 'undefined') {
      DeckMode.mountSwitch(pop.querySelector('.mode-switch'), { label: V('Mode', 'Chế độ'), light: V('Light', 'Sáng'), dark: V('Dark', 'Tối') });
      DeckMode.onChange(() => { applyTheme(); buildThemePop(); });
    }
  }
  const grid = pop.querySelector('.swatch-grid');
  grid.innerHTML = PRESETS.map(p => `<button class="swatch ${state.theme === p.id ? 'active' : ''}" data-theme="${p.id}" style="background:${presetBg(p)}" aria-label="${V('Theme', 'Giao diện')} ${p.id}"></button>`).join('');
  grid.querySelectorAll('[data-theme]').forEach(sw => sw.addEventListener('click', () => {
    state.theme = sw.dataset.theme; save(); applyTheme(); buildThemePop();
  }));
}
buildThemePop();
// Light / Dark in the top bar, just left of Settings as in every suite app (js/mode.js, css/mode.css). UniStudentDeck gets it once its page has #mode-toggle.
if (typeof DeckMode !== 'undefined') DeckMode.mountSwitch(document.getElementById('mode-toggle'), { label: V('Mode', 'Chế độ'), light: V('Light', 'Sáng'), dark: V('Dark', 'Tối') }, { compact: true });
$('#theme-pill').addEventListener('click', e => {
  e.stopPropagation();
  const open = $('#theme-pop').hidden;
  $('#theme-pop').hidden = !open;
  $('#theme-pill').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', e => { if (!e.target.closest('.theme-pill-wrap')) $('#theme-pop').hidden = true; });
applyTheme();

touchDay(); drawXP(0, false); checkBadges();
document.addEventListener('click', e => {                           // v0.9.8/0.9.9: medal -> full-size badge; count or +N -> Badges & Rewards
  if (!e.target.closest('.bstrip')) return;
  const m = e.target.closest('[data-badge]'); if (m) { showBadge(m.dataset.badge); return; }
  if (e.target.closest('#badge-chip') || e.target.closest('[data-more]')) openBadges();
});
{ const flip = e => { const it = e.target.closest && e.target.closest('.bs-item'); if (it) it.classList.toggle('flip', it.getBoundingClientRect().left + 230 > innerWidth - 12); };   // pop-up card opens to the right unless there's no room
  document.addEventListener('mouseover', flip); document.addEventListener('focusin', flip); }
{ let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderBadgeStrip, 120); }); }
(state.active.timer === undefined && Object.keys(state.active).length === 0 ? ['timer', 'todo'] : WIDGETS.map(w => w.id).filter(id => state.active[id])).forEach(openWidget);

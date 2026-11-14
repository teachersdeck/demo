'use strict';
/* TinyTeachersDeck's classroom widgets (scope step 5). This file is TinyTeachersDeck's own; it loads before js/app.js, which
   reads window.KINDER_WIDGETS through the same hook as UniDeck's course widgets ({ id, cat, title, titleVi, desc, descVi,
   icon, w, h, render }). `replaces: true` takes the place of the TeachersDeck widget with the same id, so a teacher's saved
   layout and dock places carry over:

     agenda        → Today's Plan (Lịch trong ngày)       picture schedule from preschool templates, the song/game/activity of the day
     lessonplanner → Weekly Plan (Kế hoạch tuần)          a weekly theme and activities per day, tagged by development area
     namepicker    → Helper of the Day (Bé trực nhật)     fair rotation: everyone once before anyone twice
     groupmaker    → Activity Groups (Nhóm hoạt động)     even groups named after animals or colours; never by ability
     scoreboard    → Sticker Chart (Bảng bé ngoan)        one shared class goal; no child is counted or ranked
     dice          → Counting Dice (Xúc xắc đếm)          one or two dot dice, the number shown or hidden
     traffic       → Stop and Go (Dừng và Đi)             a class-level signal, never attached to a child

   Rules from the scope (section 8): no ranking or comparison of children, shape plus colour, tap targets of 44 px, reduced
   motion respected, Vietnamese first. Everything is kept in the class's own state (state.kinder), on this device. */
(() => {
  /* ---------- helpers (the app's own globals — state, saveState, ccCopyText — exist by the time a widget renders) ---------- */
  const vi = () => (state.lang || 'vi') === 'vi';
  const L = (en, v) => (vi() ? v : en);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K = () => state.kinder || (state.kinder = {});
  const save = () => saveState();
  const kids = () => (state.roster || []).map(n => String(n).trim()).filter(Boolean);
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => isoOf(new Date());
  const uid = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const noKids = () => `<p class="kw-empty">${L('No children in this class yet. They arrive from KinderDeck with My Class; until then, add names to the class roster.', 'Lớp chưa có bé nào. Danh sách bé sẽ đến từ KinderDeck cùng với Lớp của tôi; trước đó, hãy thêm tên vào danh sách lớp.')}</p>`;

  /* A child's picture until photos arrive with My Class: initials on a colour picked from the name (the same colour every time). */
  const HUES = [12, 36, 145, 175, 200, 265, 320];
  function avatar(name, big) {
    const parts = String(name).trim().split(/\s+/), ini = (parts.length > 1 ? parts[parts.length - 2][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
    let h = 0; for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return `<span class="kw-av${big ? ' big' : ''}" style="--h:${HUES[h % HUES.length]}" aria-hidden="true">${esc(ini)}</span>`;
  }

  /* v0.11.0: a child's photo, when the school switched photos on in KinderDeck (backend v2.26.0); otherwise the initials. */
  const PHOTO_OK = /^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*|https:\/\/[^\s"'<>]+)$/;
  const childFace = (c, big) => (c && typeof c.photo === 'string' && PHOTO_OK.test(c.photo)
    ? `<img class="kw-av kw-photo${big ? ' big' : ''}" src="${esc(c.photo)}" alt="" aria-hidden="true" loading="lazy">`
    : avatar(c.firstName || c.displayName || '?', big));

  /* Widgets redraw when the language changes (setLanguage sets <html lang>), and stop listening when closed. */
  const mounted = new Set();
  new MutationObserver(() => mounted.forEach(f => f())).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  const mount = draw => { mounted.add(draw); draw(); return () => mounted.delete(draw); };

  /* ======================= An adult check (DrawDeck's Kid Mode) =======================
     The phone's PIN (js/kinder-guard.js) when one is set; otherwise a sum a preschool child cannot do yet. Wired in the
     shared js/app.js as DrawDeck's kidModeUnlock. Resolves true for an adult, false on Cancel. */
  window.KinderAdultGate = () => (typeof KinderGuard !== 'undefined' ? KinderGuard.verify() : Promise.resolve(null)).then(ok => (ok === null ? sumGate() : ok));
  function sumGate() {
    return new Promise(res => {
      const a = 6 + Math.floor(Math.random() * 4), b = 5 + Math.floor(Math.random() * 5);
      const d = document.createElement('div'); d.className = 'kw-gate'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
      d.innerHTML = `<form class="kw-gate-card"><p class="kw-h">${L('For an adult', 'Dành cho người lớn')}</p>
        <label>${a} + ${b} = <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" aria-label="${L('Answer', 'Kết quả')}"></label>
        <p class="kw-hint" aria-live="polite"></p>
        <div class="btn-row center"><button type="button" class="wbtn" data-x>${L('Cancel', 'Hủy')}</button><button type="submit" class="wbtn primary">${L('OK', 'Đồng ý')}</button></div></form>`;
      document.body.appendChild(d);
      const inp = d.querySelector('input'), end = ok => { d.remove(); res(ok); };
      d.querySelector('[data-x]').addEventListener('click', () => end(false));
      d.querySelector('form').addEventListener('submit', e => { e.preventDefault(); if (+inp.value === a + b) end(true); else { inp.value = ''; d.querySelector('.kw-hint').textContent = L('Not quite. Try again.', 'Chưa đúng. Thử lại nhé.'); inp.focus(); } });
      setTimeout(() => inp.focus(), 0);
    });
  }

  /* ======================= Today's Plan (agenda) ======================= */
  const PLAN_TEMPLATE = [   // a usual bán trú day; the school's own times are set once and kept
    ['07:00', '🏫', 'Arrival', 'Đón trẻ'], ['08:00', '🤸', 'Morning exercise', 'Thể dục sáng'], ['08:30', '🧑‍🤝‍🧑', 'Circle time', 'Sinh hoạt chung'],
    ['09:00', '🎨', 'Learning activity', 'Hoạt động học'], ['09:45', '🌳', 'Outdoor play', 'Chơi ngoài trời'], ['10:30', '🍚', 'Lunch', 'Ăn trưa'],
    ['11:30', '😴', 'Nap', 'Ngủ trưa'], ['14:00', '🥛', 'Afternoon snack', 'Ăn xế'], ['14:30', '🧩', 'Afternoon activity', 'Hoạt động chiều'],
    ['16:00', '👋', 'Pickup', 'Trả trẻ']
  ];
  const PLAN_EMOJI = ['🏫', '🤸', '🧑‍🤝‍🧑', '🎨', '📖', '🎵', '🌳', '🍚', '🥛', '😴', '🧼', '🧩', '🚌', '🎉', '👋'];
  const planOf = () => { const k = K(); if (!k.plan) k.plan = { items: PLAN_TEMPLATE.map(([time, em, en, v]) => ({ id: uid(), time, em, en, vi: v })) }; return k.plan; };
  const itemLabel = it => it.text || L(it.en, it.vi);

  function renderTodaysPlan(body) {
    let editing = false, timer = null, shareMsg = '', menu = null, unInfo = () => {};
    const draw = () => {
      const P = planOf(), items = P.items.slice().sort((a, b) => a.time.localeCompare(b.time));
      const now = new Date(), hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
      let cur = -1; items.forEach((it, i) => { if (it.time <= hm) cur = i; });
      const day = P.day && P.day.date === today() ? P.day : { song: '', game: '', act: '' };
      body.innerHTML = editing ? `
        <div class="kw-plan-edit">
          ${items.map(it => `<div class="kw-row" data-id="${it.id}">
            <select class="kw-em" aria-label="${L('Picture', 'Hình')}">${PLAN_EMOJI.concat(PLAN_EMOJI.includes(it.em) ? [] : [it.em]).map(e => `<option${e === it.em ? ' selected' : ''}>${e}</option>`).join('')}</select>
            <input type="time" class="kw-time" value="${esc(it.time)}" aria-label="${L('Time', 'Giờ')}">
            <input type="text" class="kw-text" value="${esc(itemLabel(it))}" maxlength="40" aria-label="${L('Activity', 'Hoạt động')}">
            <button class="wbtn kw-x" data-del aria-label="${L('Remove', 'Xóa')}">×</button></div>`).join('')}
          <div class="btn-row"><button class="wbtn" id="kp-add">＋ ${L('Add a step', 'Thêm mục')}</button><button class="wbtn" id="kp-tpl">${L('Use the template', 'Dùng mẫu')}</button><button class="wbtn primary" id="kp-done">${L('Done', 'Xong')}</button></div>
        </div>` : `
        <ol class="kw-plan">${items.map((it, i) => `<li class="${i === cur ? 'now' : i < cur ? 'past' : ''}">
          <span class="kw-plan-em" aria-hidden="true">${esc(it.em)}</span><span class="kw-plan-time">${esc(it.time)}</span>
          <span class="kw-plan-name">${esc(itemLabel(it))}</span>${i === cur ? `<span class="kw-now">▶ ${L('Now', 'Bây giờ')}</span>` : ''}</li>`).join('')}</ol>
        <div class="kw-today">
          <p class="kw-h">${L('Today we…', 'Hôm nay lớp mình…')}</p>
          <label>🎵 ${L('sing', 'hát bài')}<input type="text" data-day="song" value="${esc(day.song)}" maxlength="60"></label>
          <label>🎲 ${L('play', 'chơi trò')}<input type="text" data-day="game" value="${esc(day.game)}" maxlength="60"></label>
          <label>🎨 ${L('do', 'làm')}<input type="text" data-day="act" value="${esc(day.act)}" maxlength="60"></label>
          <p class="kw-hint">${L('Parents will see this in TinyParentDeck’s Ask Me About Today once the school is connected.', 'Phụ huynh sẽ thấy phần này trong mục “Hỏi con về hôm nay” của TinyParentDeck khi trường được kết nối.')}</p>
        </div>
        <div class="kw-menu"><b>🍽️ ${L('Today’s menu', 'Thực đơn hôm nay')}</b>${menu && menu.length ? `<ul>${menu.map(m => `<li><span class="kw-hint">${esc(L(m.mealEn || m.meal, m.meal))}</span> ${m.dishes.map(esc).join(', ')}</li>`).join('')}</ul>` : `: <span class="kw-nr">${L('not received yet (comes from KinderDeck)', 'chưa nhận (đến từ KinderDeck)')}</span>`}</div>
        <div class="btn-row"><button class="wbtn" id="kp-edit">✏️ ${L('Change the plan', 'Sửa lịch')}</button><button class="wbtn primary" id="kp-share">📤 ${L('Share with families', 'Gửi cho phụ huynh')}</button></div>
        ${shareMsg ? `<p class="kw-hint">${esc(shareMsg)}</p>` : ''}`;
      if (editing) {
        const rowOf = el => P.items.find(x => x.id === el.closest('.kw-row').dataset.id);
        body.querySelectorAll('.kw-em').forEach(s => s.addEventListener('change', () => { rowOf(s).em = s.value; save(); }));
        body.querySelectorAll('.kw-time').forEach(s => s.addEventListener('change', () => { if (s.value) { rowOf(s).time = s.value; save(); } }));
        body.querySelectorAll('.kw-text').forEach(s => s.addEventListener('change', () => { const it = rowOf(s); it.text = s.value.trim(); save(); }));
        body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { const it = rowOf(b); P.items = P.items.filter(x => x !== it); save(); draw(); }));
        body.querySelector('#kp-add').addEventListener('click', () => { const last = items[items.length - 1]; P.items.push({ id: uid(), time: last ? last.time : '08:00', em: '🧩', text: L('New activity', 'Hoạt động mới') }); save(); draw(); });
        body.querySelector('#kp-tpl').addEventListener('click', () => { if (!confirm(L('Replace the plan with the template?', 'Thay lịch bằng lịch mẫu?'))) return; delete K().plan; save(); draw(); });
        body.querySelector('#kp-done').addEventListener('click', () => { editing = false; draw(); });
      } else {
        body.querySelectorAll('[data-day]').forEach(inp => inp.addEventListener('change', () => {
          const P2 = planOf(); if (!P2.day || P2.day.date !== today()) P2.day = { date: today(), song: '', game: '', act: '' };
          P2.day[inp.dataset.day] = inp.value.trim(); save();
        }));
        body.querySelector('#kp-edit').addEventListener('click', () => { editing = true; draw(); });
        body.querySelector('#kp-share').addEventListener('click', async () => {   // TinyParentDeck's Ask Me About Today reads it (classes/{id}/dayPlans/{date})
          const kc = KC(), signed = kc && kc.ready() && kc.session();
          const cls = !signed ? null : kc.chosen() || await new Promise(res => { let u = null; u = kc.subscribeClasses(l => { res(l[0] ? l[0].id : null); setTimeout(() => u && u(), 0); }); });
          if (!cls) { shareMsg = L('Sign in and open My Class first, so the plan goes to your class.', 'Hãy đăng nhập và mở Lớp của tôi trước, để lịch gửi đúng lớp.'); draw(); return; }
          const P2 = planOf(), dd = P2.day && P2.day.date === today() ? P2.day : {};
          const steps = P2.items.slice().sort((a, b) => a.time.localeCompare(b.time)).slice(0, 20).map(it => ({ time: it.time, em: it.em, text: itemLabel(it).slice(0, 40) }));
          try { await kc.setDayPlan(cls, today(), { items: steps, song: dd.song || '', game: dd.game || '', act: dd.act || '' }); shareMsg = L(`Shared at ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}. Families see it in Ask Me About Today.`, `Đã gửi lúc ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}. Phụ huynh xem trong “Hỏi con về hôm nay”.`); }
          catch (e) { shareMsg = e.message || String(e); }
          draw();
        });
      }
    };
    const stop = mount(draw);
    // today's menu, from KinderDeck through the class's school info (the class on screen, or the teacher's first class)
    const followInfo = () => {
      unInfo(); unInfo = () => {};
      const kc = KC(); if (!kc || !kc.ready() || !kc.session()) return;
      const go = id => { if (id) unInfo = kc.subscribeSchoolInfo(id, i => { menu = (i && i.menu && i.menu[today()]) || null; if (!editing && !body.contains(document.activeElement)) draw(); }); };
      if (kc.chosen()) go(kc.chosen());
      else { let u = null; u = kc.subscribeClasses(l => { setTimeout(() => u && u(), 0); go(l[0] && l[0].id); }); }
    };
    const kc0 = KC();
    const unAuth = kc0 && kc0.ready() ? kc0.onAuth(followInfo) : (followInfo(), () => {});
    const unChoose = kc0 ? kc0.onChoose(followInfo) : () => {};
    timer = setInterval(() => { if (!editing && !body.contains(document.activeElement)) draw(); }, 60000);   // move "Now" along
    return () => { stop(); clearInterval(timer); unInfo(); unAuth(); unChoose(); };
  }

  /* ======================= Weekly Plan (lessonplanner) ======================= */
  /* The five development areas of Vietnam's preschool programme. Wording to confirm with the school (scope 4.2). */
  const AREAS = (window.KinderContract && KinderContract.developmentAreas || []).map(a => [a.id, a.icon, a.en, a.vi]);   // ../contracts/development-areas.json; wording to confirm with the school
  const areaOf = k => AREAS.find(a => a[0] === k) || AREAS[0];
  const DAYS = [['Mon', 'Thứ 2'], ['Tue', 'Thứ 3'], ['Wed', 'Thứ 4'], ['Thu', 'Thứ 5'], ['Fri', 'Thứ 6']];
  const mondayOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const dm = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1);

  function renderWeeklyPlan(body) {
    let wk = mondayOf(new Date()), addDay = 0;
    const draw = () => {
      const k = K(), weeks = k.weeks || (k.weeks = {}), key = isoOf(wk), W = weeks[key] || { theme: '', days: {} };
      const fri = new Date(wk); fri.setDate(fri.getDate() + 4);
      body.innerHTML = `
        <div class="kw-weeknav"><button class="wbtn" data-w="-1" aria-label="${L('Previous week', 'Tuần trước')}">‹</button>
          <b>${L('Week', 'Tuần')} ${dm(wk)} – ${dm(fri)}</b><button class="wbtn" data-w="1" aria-label="${L('Next week', 'Tuần sau')}">›</button></div>
        <label class="kw-theme">${L('Theme of the week', 'Chủ đề tuần')}<input type="text" id="kw-theme" value="${esc(W.theme)}" maxlength="60" placeholder="${L('e.g. My family', 'ví dụ: Gia đình bé')}"></label>
        <div class="kw-days">${DAYS.map(([en, v], i) => {
          const list = W.days[i + 1] || [];
          return `<section class="kw-day"><h5>${L(en, v)}</h5>${list.length ? `<ul>${list.map(a => { const ar = areaOf(a.area);
            return `<li><span class="kw-area a-${ar[0]}" title="${esc(L(ar[2], ar[3]))}"><span aria-hidden="true">${ar[1]}</span> ${esc(L(ar[2], ar[3]))}</span><span class="kw-act">${esc(a.text)}</span><button class="kw-x" data-del="${i + 1}:${a.id}" aria-label="${L('Remove', 'Xóa')}">×</button></li>`; }).join('')}</ul>` : `<p class="kw-nr">${L('Nothing planned', 'Chưa có hoạt động')}</p>`}</section>`;
        }).join('')}</div>
        <div class="kw-add">
          <select id="kw-day" aria-label="${L('Day', 'Ngày')}">${DAYS.map(([en, v], i) => `<option value="${i + 1}"${i + 1 === addDay ? ' selected' : ''}>${L(en, v)}</option>`).join('')}</select>
          <select id="kw-area" aria-label="${L('Development area', 'Lĩnh vực phát triển')}">${AREAS.map(a => `<option value="${a[0]}">${a[1]} ${esc(L(a[2], a[3]))}</option>`).join('')}</select>
          <input type="text" id="kw-text" maxlength="80" placeholder="${L('Activity', 'Hoạt động')}">
          <button class="wbtn primary" id="kw-addbtn">${L('Add', 'Thêm')}</button>
        </div>
        <div class="btn-row"><button class="wbtn" id="kw-copy">📋 ${L('Copy for Zalo', 'Sao chép gửi Zalo')}</button></div>`;
      const store = () => { weeks[key] = W; save(); };
      if (!addDay) { const t = (new Date().getDay() + 6) % 7 + 1; body.querySelector('#kw-day').value = String(t <= 5 ? t : 1); }
      body.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => { wk.setDate(wk.getDate() + 7 * +b.dataset.w); draw(); }));
      body.querySelector('#kw-theme').addEventListener('change', e => { W.theme = e.target.value.trim(); store(); });
      body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { const [d, id] = b.dataset.del.split(':'); W.days[d] = (W.days[d] || []).filter(a => a.id !== id); store(); draw(); }));
      const add = () => {
        const text = body.querySelector('#kw-text').value.trim(); if (!text) return;
        const d = +body.querySelector('#kw-day').value; addDay = d;
        (W.days[d] = W.days[d] || []).push({ id: uid(), text, area: body.querySelector('#kw-area').value }); store(); draw();
        const inp = body.querySelector('#kw-text'); if (inp) inp.focus();
      };
      body.querySelector('#kw-addbtn').addEventListener('click', add);
      body.querySelector('#kw-text').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
      body.querySelector('#kw-copy').addEventListener('click', async () => {
        const lines = [`${L('Weekly plan', 'Kế hoạch tuần')} ${dm(wk)} – ${dm(fri)}${W.theme ? ' · ' + W.theme : ''}`];
        DAYS.forEach(([en, v], i) => { const list = W.days[i + 1] || []; if (list.length) lines.push('', L(en, v) + ':', ...list.map(a => `- ${a.text} (${L(areaOf(a.area)[2], areaOf(a.area)[3])})`)); });
        const ok = typeof ccCopyText === 'function' && await ccCopyText(lines.join('\n'));
        const b = body.querySelector('#kw-copy'); if (b) b.textContent = ok ? '✓ ' + L('Copied', 'Đã sao chép') : L('Could not copy', 'Không sao chép được');
      });
    };
    return mount(draw);
  }

  /* ======================= Helper of the Day (namepicker) ======================= */
  /* Fair rotation: everyone is picked once before anyone is picked again. "Away today" puts the child back for later. */
  function helperState() {
    const k = K(), H = k.helper || (k.helper = { left: null, today: null }), all = kids();
    if (!H.left) H.left = all.slice();
    H.left = H.left.filter(n => all.includes(n));
    const picked = new Set(H.picked || []); all.forEach(n => { if (!picked.has(n) && !H.left.includes(n)) H.left.push(n); });   // a child new to the class joins this round
    if (H.today && H.today.date !== today()) H.today = null;
    return H;
  }
  function renderHelper(body) {
    let spinning = false;
    const draw = () => {
      if (spinning) return;
      const all = kids(); if (!all.length) { body.innerHTML = noKids(); return; }
      const H = helperState(), who = H.today && H.today.name;
      body.innerHTML = `
        <div class="kw-helper">${who ? `${avatar(who, true)}<p class="kw-helper-name">${esc(who)}</p><p class="kw-hint">${L('Helper of the day', 'Bé trực nhật hôm nay')}</p>`
          : `<span class="kw-av big blank" aria-hidden="true">?</span><p class="kw-hint">${L('Who helps today?', 'Hôm nay bé nào trực nhật?')}</p>`}</div>
        <div class="btn-row center"><button class="wbtn primary kw-big" id="kh-spin">🎡 ${who ? L('Pick someone else', 'Chọn bạn khác') : L('Spin', 'Quay')}</button>
          ${who ? `<button class="wbtn" id="kh-away">${L('Away today', 'Bé vắng hôm nay')}</button>` : ''}</div>
        <p class="kw-hint">${L(`${H.left.length} of ${all.length} not picked yet this round.`, `Còn ${H.left.length}/${all.length} bé chưa được chọn trong vòng này.`)}</p>
        <div class="btn-row center"><button class="wbtn" id="kh-new">${L('Start a new round', 'Bắt đầu vòng mới')}</button></div>`;
      const pick = () => {
        const H2 = helperState(); if (!H2.left.length) { H2.left = kids(); H2.picked = []; }
        const name = H2.left[Math.floor(Math.random() * H2.left.length)];
        H2.left = H2.left.filter(n => n !== name); H2.picked = (H2.picked || []).concat(name);
        H2.today = { date: today(), name }; save();
        if (still()) { draw(); return; }
        spinning = true; const stage = body.querySelector('.kw-helper'); let n = 0;
        const iv = setInterval(() => {
          const fake = n < 11 ? all[Math.floor(Math.random() * all.length)] : name;
          stage.innerHTML = `${avatar(fake, true)}<p class="kw-helper-name">${esc(fake)}</p>`;
          if (++n > 11) { clearInterval(iv); spinning = false; draw(); }
        }, 80);
      };
      body.querySelector('#kh-spin').addEventListener('click', () => {
        // picking someone else keeps the earlier child picked (they had their turn) unless they are away
        pick();
      });
      const away = body.querySelector('#kh-away');
      if (away) away.addEventListener('click', () => {
        const H2 = helperState(), n0 = H2.today && H2.today.name; if (!n0) return;
        H2.picked = (H2.picked || []).filter(n => n !== n0); if (!H2.left.includes(n0)) H2.left.push(n0); H2.today = null; save(); pick();
      });
      body.querySelector('#kh-new').addEventListener('click', () => { const H2 = helperState(); H2.left = kids(); H2.picked = []; H2.today = null; save(); draw(); });
    };
    return mount(draw);
  }

  /* ======================= Activity Groups (groupmaker) ======================= */
  const NAMES_GROUP = {
    animal: [['🐰', 'Rabbits', 'Thỏ'], ['🐻', 'Bears', 'Gấu'], ['🐘', 'Elephants', 'Voi'], ['🐯', 'Tigers', 'Hổ'], ['🐼', 'Pandas', 'Gấu trúc'], ['🦒', 'Giraffes', 'Hươu cao cổ']],
    colour: [['🔴', 'Red', 'Đỏ'], ['🔵', 'Blue', 'Xanh dương'], ['🟡', 'Yellow', 'Vàng'], ['🟢', 'Green', 'Xanh lá'], ['🟣', 'Purple', 'Tím'], ['🟠', 'Orange', 'Cam']]
  };
  function renderGroups(body) {
    const draw = () => {
      const all = kids(); if (!all.length) { body.innerHTML = noKids(); return; }
      const k = K(), G = k.groups || (k.groups = { n: 3, scheme: 'animal', list: [] });
      const live = (G.list || []).map(g => g.filter(n => all.includes(n)));
      body.innerHTML = `
        <div class="kw-gopts">
          <label>${L('Groups', 'Số nhóm')}<select id="kg-n">${[2, 3, 4, 5, 6].map(n => `<option${n === G.n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>${L('Names', 'Tên nhóm')}<select id="kg-s"><option value="animal"${G.scheme === 'animal' ? ' selected' : ''}>🐰 ${L('Animals', 'Con vật')}</option><option value="colour"${G.scheme === 'colour' ? ' selected' : ''}>🔴 ${L('Colours', 'Màu sắc')}</option></select></label>
          <button class="wbtn primary kw-big" id="kg-go">🔀 ${L('Make groups', 'Chia nhóm')}</button>
        </div>
        ${live.length ? `<div class="kw-groups">${live.map((g, i) => { const nm = NAMES_GROUP[G.scheme][i % 6];
          return `<section class="kw-group g${i % 6}"><h5><span aria-hidden="true">${nm[0]}</span> ${L('The', 'Nhóm')} ${esc(L(nm[1], nm[2]))}</h5><ul>${g.map(n => `<li>${avatar(n)}<span>${esc(n)}</span></li>`).join('')}</ul></section>`; }).join('')}</div>`
          : `<p class="kw-hint">${L(`${all.length} children. Groups are mixed by chance, never by ability.`, `${all.length} bé. Các nhóm được chia ngẫu nhiên, không theo năng lực.`)}</p>`}`;
      body.querySelector('#kg-n').addEventListener('change', e => { G.n = +e.target.value; save(); });
      body.querySelector('#kg-s').addEventListener('change', e => { G.scheme = e.target.value; save(); draw(); });
      body.querySelector('#kg-go').addEventListener('click', () => {
        const n = Math.min(G.n, all.length), list = Array.from({ length: n }, () => []);
        shuffle(all).forEach((name, i) => list[i % n].push(name)); G.list = list; save(); draw();
      });
    };
    return mount(draw);
  }

  /* ======================= Sticker Chart (scoreboard) ======================= */
  /* The whole class works toward one goal. There is no per-child count, no order and no taking away for behaviour:
     the − button only corrects a mistaken tap. */
  function renderStickers(body) {
    const draw = () => {
      const k = K(), S = k.stickers || (k.stickers = { goal: '', target: 20, count: 0 });
      const done = S.count >= S.target;
      body.innerHTML = `
        <label class="kw-theme">${L('Our class goal', 'Mục tiêu của lớp')}<input type="text" id="ks-goal" value="${esc(S.goal)}" maxlength="60" placeholder="${L('e.g. A picnic in the park', 'ví dụ: Đi dã ngoại công viên')}"></label>
        <div class="kw-stars" role="img" aria-label="${L(`${S.count} of ${S.target} stickers`, `${S.count}/${S.target} sao`)}">${Array.from({ length: S.target }, (_, i) => `<span class="${i < S.count ? 'on' : ''}">${i < S.count ? '⭐' : '☆'}</span>`).join('')}</div>
        <p class="kw-count"><b>${S.count}</b> / ${S.target}</p>
        ${done ? `<p class="kw-done">🎉 ${L('The whole class reached the goal!', 'Cả lớp đã đạt mục tiêu!')}</p>` : ''}
        <div class="btn-row center">
          ${done ? `<button class="wbtn primary kw-big" id="ks-new">${L('Start a new goal', 'Bắt đầu mục tiêu mới')}</button>`
            : `<button class="wbtn primary kw-big" id="ks-add">⭐ ${L('Add a sticker', 'Thêm sao')}</button><button class="wbtn" id="ks-undo" ${S.count ? '' : 'disabled'} aria-label="${L('Undo the last sticker', 'Bỏ sao vừa thêm')}">↩</button>`}
        </div>
        <label class="kw-target">${L('Stickers to reach the goal', 'Số sao cần đạt')}<select id="ks-target">${[10, 15, 20, 25, 30].map(n => `<option${n === S.target ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
      body.querySelector('#ks-goal').addEventListener('change', e => { S.goal = e.target.value.trim(); save(); });
      body.querySelector('#ks-target').addEventListener('change', e => { S.target = +e.target.value; save(); draw(); });
      const add = body.querySelector('#ks-add'); if (add) add.addEventListener('click', () => { S.count = Math.min(S.target, S.count + 1); save(); draw(); });
      const undo = body.querySelector('#ks-undo'); if (undo) undo.addEventListener('click', () => { S.count = Math.max(0, S.count - 1); save(); draw(); });
      const nw = body.querySelector('#ks-new'); if (nw) nw.addEventListener('click', () => { S.count = 0; S.goal = ''; save(); draw(); });
    };
    return mount(draw);
  }

  /* ======================= Counting Dice (dice) ======================= */
  const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
                 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };
  const face = v => `<svg viewBox="0 0 100 100" class="kw-die" role="img" aria-label="${v}"><rect x="5" y="5" width="90" height="90" rx="18" fill="#FFF8EC" stroke="#E8A33D" stroke-width="4"/>${PIPS[v].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#2A3542"/>`).join('')}</svg>`;
  function renderDice(body) {
    let vals = null;
    const draw = () => {
      const k = K(), D = k.dice || (k.dice = { n: 1, show: true });
      if (!vals || vals.length !== D.n) vals = Array.from({ length: D.n }, () => 1);
      body.innerHTML = `
        <div class="kw-dice">${vals.map(v => `<div>${face(v)}${D.show ? `<b class="kw-num">${v}</b>` : ''}</div>`).join('')}</div>
        ${D.show && D.n === 2 ? `<p class="kw-sum">${vals[0]} + ${vals[1]} = <b>${vals[0] + vals[1]}</b></p>` : ''}
        <div class="btn-row center"><button class="wbtn primary kw-big" id="kd-roll">🎲 ${L('Roll', 'Gieo')}</button></div>
        <div class="btn-row center">
          <button class="wbtn${D.n === 1 ? ' on' : ''}" data-n="1">${L('One die', '1 xúc xắc')}</button><button class="wbtn${D.n === 2 ? ' on' : ''}" data-n="2">${L('Two dice', '2 xúc xắc')}</button>
          <button class="wbtn" id="kd-show">${D.show ? L('Hide the number', 'Ẩn số') : L('Show the number', 'Hiện số')}</button></div>`;
      body.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => { D.n = +b.dataset.n; vals = null; save(); draw(); }));
      body.querySelector('#kd-show').addEventListener('click', () => { D.show = !D.show; save(); draw(); });
      body.querySelector('#kd-roll').addEventListener('click', () => {
        const roll = () => Array.from({ length: D.n }, () => 1 + Math.floor(Math.random() * 6));
        if (still()) { vals = roll(); draw(); return; }
        let n = 0; const iv = setInterval(() => { vals = roll(); body.querySelector('.kw-dice').innerHTML = vals.map(v => `<div>${face(v)}</div>`).join(''); if (++n > 8) { clearInterval(iv); draw(); } }, 70);
      });
    };
    return mount(draw);
  }

  /* ======================= Stop and Go (traffic) ======================= */
  const SIGNALS = [['stop', '■', 'Stop', 'Dừng lại'], ['wait', '▲', 'Wait', 'Chờ nhé'], ['go', '●', 'Go', 'Đi nào']];
  function renderStopGo(body) {
    const draw = () => {
      const k = K(), cur = k.signal || '';
      body.innerHTML = `<div class="kw-signal">${SIGNALS.map(([id, sh, en, v]) => `<button class="kw-lamp ${id}${cur === id ? ' on' : ''}" data-s="${id}" aria-pressed="${cur === id}"><span class="kw-shape" aria-hidden="true">${sh}</span><span>${esc(L(en, v))}</span></button>`).join('')}</div>`;
      body.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => { k.signal = k.signal === b.dataset.s ? '' : b.dataset.s; save(); draw(); }));
    };
    return mount(draw);
  }

  /* ============ The class day: My Class, Attendance, Daily Report, Notes to Parents (scope steps 2–4) ============
     Data comes from KinderCloud (js/kinder-cloud.js): the children KinderDeck published to the teacher's class, and what
     the class's staff record. Not recorded is the absence of a record: grey, never red, never counted as absent. */
  const KC = () => (typeof KinderCloud !== 'undefined' ? KinderCloud : null);   // js/kinder-cloud.js declares it with const
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const childName = c => c.nickname ? `${c.firstName} (${c.nickname})` : c.firstName;
  const alertIcon = { allergy: '⚠️', dietary: '🍽️', condition: '❤️‍🩹' };
  const alertBadges = c => (c.medicalAlerts || []).map(a => `<span class="kw-alert ${esc(a.kind)}" title="${esc(a.label)}"><span aria-hidden="true">${alertIcon[a.kind] || '⚠️'}</span> ${esc(a.label)}</span>`).join('');
  const dayLabel = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const shiftDay = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };

  /* The class a widget shows, with the sign-in and "no class yet" states. draw(ctx) runs with { cls, classes, children };
     everything is re-subscribed when the chosen class or the sign-in changes. */
  function classView(body, draw, extra) {
    let classes = [], children = null, unC = () => {}, unK = () => {}, unA = () => {}, extraUn = () => {};
    const paint = () => {
      const kc = KC();
      if (!kc || !kc.ready()) { body.innerHTML = `<p class="kw-empty">${L('Classes arrive from KinderDeck once the school is connected. Try the demo classes in Settings meanwhile.', 'Danh sách lớp sẽ đến từ KinderDeck khi trường được kết nối. Trong lúc chờ, hãy dùng thử lớp mẫu trong Cài đặt.')}</p>`; return; }
      if (!kc.session()) {
        body.innerHTML = `<p class="kw-empty">${L('Sign in with the Google account the school invited.', 'Đăng nhập bằng tài khoản Google mà trường đã mời.')}</p><div class="btn-row center"><button class="wbtn primary kw-big" data-signin>${L('Sign in with Google', 'Đăng nhập với Google')}</button></div>`;
        body.querySelector('[data-signin]').addEventListener('click', () => kc.signIn().catch(e => alert(e.message || e)));
        return;
      }
      if (!classes.length) { body.innerHTML = `<p class="kw-empty">${L('No class yet. When the school publishes your class from KinderDeck, it appears here.', 'Chưa có lớp. Khi trường gửi lớp của bạn từ KinderDeck, lớp sẽ hiện ở đây.')}</p>`; return; }
      const cls = classes.find(c => c.id === kc.chosen()) || classes[0];
      kc.remember(cls.id);
      if (children === null) { body.innerHTML = `<p class="kw-empty">${L('Loading…', 'Đang tải…')}</p>`; return; }
      draw({ cls, classes, children, picker: classes.length > 1 ? `<select class="kw-classpick" aria-label="${L('Class', 'Lớp')}">${classes.map(c => `<option value="${esc(c.id)}"${c.id === cls.id ? ' selected' : ''}>${esc(c.className)}</option>`).join('')}</select>` : `<b class="kw-classname">${esc(cls.className)}</b>` });
      const pick = body.querySelector('.kw-classpick'); if (pick) pick.addEventListener('change', () => kc.choose(pick.value));
    };
    body.__kwPaint = paint;   // a widget that changes its own view (a search, an open row) repaints through this
    let current = null;
    const follow = () => {
      const kc = KC(); unK(); extraUn(); children = null;
      const cls = classes.find(c => c.id === kc.chosen()) || classes[0];
      current = cls ? cls.id : null;
      if (cls) unK = kc.subscribeChildren(cls.id, list => {
        children = list.sort((a, b) => fold(a.firstName).localeCompare(fold(b.firstName)));
        extraUn(); extraUn = extra ? extra(cls, children, paint) : () => {};
        paint();
      });
      paint();
    };
    const start = () => {
      const kc = KC(); unC(); unK(); extraUn(); classes = []; children = null;
      if (!kc || !kc.ready() || !kc.session()) { paint(); return; }
      unC = kc.subscribeClasses(list => { classes = list; const want = (classes.find(c => c.id === kc.chosen()) || classes[0] || {}).id || null; if (want !== current || children === null) follow(); else paint(); });
    };
    const kc = KC();
    const unAuth = kc && kc.ready() ? kc.onAuth(() => start()) : (start(), () => {});
    const unChoose = kc ? kc.onChoose(() => follow()) : () => {};
    const stop = mount(paint);
    return () => { stop(); unAuth(); unChoose(); unC(); unK(); unA(); extraUn(); };
  }

  /* ======================= My Class ======================= */
  function renderMyClass(body) {
    let q = '', open = null, staff = null, staffFor = null, msg = '', codes = null, codesMsg = '';
    return classView(body, ({ cls, children, picker }) => {
      const kc = KC(), mine = (kc.session() || {}).uid === cls.teacherUid;
      if (staffFor !== cls.id) { staffFor = cls.id; staff = null; kc.listStaff(cls.id).then(s => { staff = s; if (staffFor === cls.id) redraw(); }).catch(() => { staff = []; }); }
      const shown = children.filter(c => !q || fold(childName(c)).includes(fold(q)));
      const alerts = children.filter(c => (c.medicalAlerts || []).length).length;
      const row = c => {
        const ex = open === c.id;
        return `<li class="kw-kid${ex ? ' open' : ''}"><button class="kw-kidhead" data-open="${esc(c.id)}" aria-expanded="${ex}">${childFace(c)}<span class="kw-kidname">${esc(childName(c))}<small>${esc(c.ageGroup || '')}</small></span>${(c.medicalAlerts || []).length ? '<span class="kw-alertdot" title="' + L('Medical alert', 'Lưu ý sức khỏe') + '">⚠️</span>' : ''}</button>
          ${ex ? `<div class="kw-kidbody">
            ${(c.medicalAlerts || []).length ? `<div class="kw-alerts">${alertBadges(c)}</div>` : ''}
            ${(c.guardians || []).map(g => `<div class="kw-guard"><b>${esc(g.name)}</b> <span class="kw-hint">${esc(g.relationship || '')}${g.authorisedPickup ? ' · ✅ ' + L('may collect', 'được đón bé') : ''}</span>
              <span class="kw-contact">${g.phone ? `<a class="wbtn" href="tel:${esc(g.phone)}">📞 ${esc(g.phone)}</a>` : ''}${g.zalo ? `<a class="wbtn" href="https://zalo.me/${esc(String(g.zalo).replace(/\D/g, ''))}" target="_blank" rel="noopener">Zalo</a>` : ''}</span></div>`).join('')}
            ${c.emergencyContact ? `<p class="kw-hint">🚨 ${L('Emergency', 'Khẩn cấp')}: <b>${esc(c.emergencyContact.name)}</b> ${esc(c.emergencyContact.relationship || '')} <a href="tel:${esc(c.emergencyContact.phone)}">${esc(c.emergencyContact.phone)}</a></p>` : ''}
          </div>` : ''}</li>`;
      };
      body.innerHTML = `
        <div class="kw-classbar">${picker}<span class="kw-hint">${L(`${children.length} children · ${alerts} with alerts`, `${children.length} bé · ${alerts} bé cần lưu ý`)}</span></div>
        <input type="search" class="kw-search" placeholder="${L('Find a child', 'Tìm bé')}" value="${esc(q)}" aria-label="${L('Find a child', 'Tìm bé')}">
        <ul class="kw-kids">${shown.map(row).join('') || `<li class="kw-empty">${L('Nobody matches.', 'Không tìm thấy bé nào.')}</li>`}</ul>
        <details class="kw-staff"${msg ? ' open' : ''}><summary>${L('Class staff', 'Giáo viên của lớp')}</summary>
          ${staff === null ? `<p class="kw-hint">${L('Loading…', 'Đang tải…')}</p>` : `<ul>${staff.map(s => `<li>${avatar(s.name || '?')}<span>${esc(s.name || s.uid)}</span><span class="kw-hint">${s.role === 'teacher' ? L('teacher', 'giáo viên chủ nhiệm') : L('staff', 'giáo viên / cô nuôi')}</span>${mine && s.role !== 'teacher' ? `<button class="kw-x" data-rm="${esc(s.uid)}" aria-label="${L('Remove', 'Xóa')}">×</button>` : ''}</li>`).join('')}</ul>`}
          ${mine ? `<div class="kw-add1"><input type="email" id="km-email" placeholder="${L('Their Google email', 'Email Google của cô')}"><button class="wbtn primary" id="km-add">${L('Add', 'Thêm')}</button></div><p class="kw-hint">${L('They sign in to TinyTeachersDeck once first. Staff see this class and record for it.', 'Cô cần đăng nhập TinyTeachersDeck một lần trước. Cô sẽ xem được lớp này và ghi chép cho lớp.')}</p>` : ''}
          ${msg ? `<p class="kw-hint">${esc(msg)}</p>` : ''}
        </details>
        ${mine ? `<details class="kw-staff"${codes ? ' open' : ''}><summary>${L('Family codes for TinyParentDeck', 'Mã gia đình cho TinyParentDeck')}</summary>
          <p class="kw-hint">${L('Each family links to their child with this code in TinyParentDeck (tinyparent.myteachersdeck.com). Hand each family only their own code.', 'Mỗi gia đình nhập mã này trong TinyParentDeck (tinyparent.myteachersdeck.com) để xem bé. Chỉ đưa mỗi gia đình mã của bé nhà mình.')}</p>
          ${codes ? `<ul>${codes.map(c => `<li>${avatar(c.displayName || '?')}<span>${esc(c.displayName)}</span><b class="kw-code">${esc(c.familyCode)}</b></li>`).join('')}</ul><div class="btn-row"><button class="wbtn primary" id="km-print">🖨️ ${L('Print a slip per family', 'In phiếu cho từng gia đình')}</button></div>`
            : `<div class="btn-row"><button class="wbtn" id="km-codes">${L('Show the codes', 'Xem mã')}</button></div>`}
          ${codesMsg ? `<p class="kw-hint">${esc(codesMsg)}</p>` : ''}</details>` : ''}
        <p class="kw-hint">${L('Changes to children are made by the school in KinderDeck.', 'Thông tin của bé do trường cập nhật trong KinderDeck.')}</p>`;
      const sc = body.querySelector('#km-codes');
      if (sc) sc.addEventListener('click', async () => { try { codes = await kc.familyCodes(cls.id); codesMsg = ''; } catch (e) { codesMsg = e.message || String(e); } redraw(); });
      const pr = body.querySelector('#km-print');
      if (pr) pr.addEventListener('click', () => {
        const w = window.open('', '_blank'); if (!w) { codesMsg = L('Allow pop-ups to print.', 'Hãy cho phép cửa sổ bật lên để in.'); redraw(); return; }
        const slip = c => `<div class="slip"><h2>TinyParentDeck</h2><p>${esc(cls.className)} · <b>${esc(c.displayName)}</b></p><p class="code">${esc(c.familyCode)}</p>
          <ol><li>Mở <b>tinyparent.myteachersdeck.com</b> trên điện thoại.</li><li>Đăng nhập bằng tài khoản Google của phụ huynh.</li><li>Chọn “Thêm con” và nhập mã ở trên.</li></ol>
          <p class="en">Open tinyparent.myteachersdeck.com, sign in with Google, choose Add a child and type the code above. Keep this code private.</p></div>`;
        w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(cls.className)}</title><style>body{font-family:sans-serif;margin:0}.slip{box-sizing:border-box;height:33vh;padding:14mm;border-bottom:1px dashed #999;page-break-inside:avoid}h2{margin:0 0 4px}.code{font:700 28px monospace;letter-spacing:2px;margin:8px 0}.en{color:#555;font-size:12px}@page{size:A4;margin:0}</style>${codes.map(slip).join('')}<script>print()<\/script>`);
        w.document.close();
      });
      const s = body.querySelector('.kw-search');
      s.addEventListener('input', () => { q = s.value; const pos = s.selectionStart; redraw(); const s2 = body.querySelector('.kw-search'); s2.focus(); s2.setSelectionRange(pos, pos); });
      body.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { open = open === b.dataset.open ? null : b.dataset.open; redraw(); }));
      body.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', async () => { try { await kc.removeStaff(cls.id, b.dataset.rm); staffFor = null; msg = ''; } catch (e) { msg = e.message; } redraw(); }));
      const add = body.querySelector('#km-add');
      if (add) add.addEventListener('click', async () => {
        const email = body.querySelector('#km-email').value.trim(); if (!email) return;
        try { const r = await kc.addStaff(cls.id, email); msg = L(`${r.name || email} was added.`, `Đã thêm ${r.name || email}.`); staffFor = null; } catch (e) { msg = e.message; }
        redraw();
      });
      function redraw() { body.__kwPaint(); }
    }, null);
  }

  /* ======================= Pickup check (in Attendance) =======================
     v0.13.0: the family shows their pickup card or TinyParentDeck's QR code (TDPICKUP:<code>, made by KinderDeck, backend
     v2.28.0). The teacher scans it where the device can read QR codes (BarcodeDetector: Android, iPad and Mac Chrome), or
     types the 8 characters. A code of this class shows the child and who may collect them; tapping a name marks the child
     gone home now, collected by that person. A code that is not this class's is refused with a warning. */
  const cleanCode = s => String(s || '').toUpperCase().replace(/^TDPICKUP:/, '').replace(/[^A-Z0-9]/g, '').slice(0, 8);
  function pickupPanel(host, { children, codes, save, st }) {   // st keeps the panel's state across Attendance's redraws
    st.host = host;
    const stop = () => { if (st.timer) clearInterval(st.timer); st.timer = null; if (st.stream) st.stream.getTracks().forEach(t => t.stop()); st.stream = null; };
    const canScan = typeof window.BarcodeDetector === 'function' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    const check = raw => {
      const code = cleanCode(raw); if (code.length < 8) { st.msg = L('A pickup code has 8 characters.', 'Mã đón gồm 8 ký tự.'); st.found = null; return paint(); }
      const id = Object.keys(codes()).find(k => codes()[k] === code);
      st.found = id ? children().find(c => c.id === id) : null;
      st.msg = st.found ? '' : '⚠️ ' + L('This code is not for a child of this class. Do not hand over the child; check with the office.', 'Mã này không phải của bé trong lớp. Chưa trả trẻ; hãy hỏi văn phòng.');
      if (st.found) stop();
      paint();
    };
    function paint() {
      const h = st.host, f = st.found, pk = f ? (f.guardians || []).filter(g => g.authorisedPickup) : [];
      h.innerHTML = `<div class="kw-pickup">
        ${f ? `<div class="kw-pk-who">${childFace(f, true)}<div><b>${esc(childName(f))}</b><p class="kw-hint">${L('Who is collecting?', 'Ai đón bé?')}</p></div></div>
          <div class="btn-row">${pk.map(g => `<button class="wbtn primary kw-big" data-pkby="${esc(g.name)}">${g.pickupPhoto && /^(data:image\/|https:)/.test(g.pickupPhoto) ? `<img class="kw-av" src="${esc(g.pickupPhoto)}" alt="">` : ''}${esc(g.name)}${g.relationship ? ` <small>(${esc(g.relationship)})</small>` : ''}</button>`).join('') || `<p class="kw-warn">⚠️ ${L('Nobody is on this child’s pickup list. Check with the office.', 'Bé chưa có ai trong danh sách đón. Hãy hỏi văn phòng.')}</p>`}</div>
          <label class="kw-pk-other">${L('Someone else', 'Người khác')}<input type="text" id="pk-other" maxlength="200" value="${esc(st.other || '')}"><button class="wbtn" id="pk-other-ok">${L('Record', 'Ghi')}</button></label>
          <div class="btn-row"><button class="wbtn" id="pk-again">${L('Another child', 'Bé khác')}</button></div>`
        : `${canScan && st.stream ? `<video id="pk-video" playsinline muted aria-label="${L('Camera', 'Máy ảnh')}"></video>` : ''}
          <div class="btn-row"><input type="text" id="pk-code" maxlength="20" autocomplete="off" autocapitalize="characters" placeholder="${L('Pickup code', 'Mã đón')}" aria-label="${L('Pickup code', 'Mã đón')}"><button class="wbtn primary" id="pk-check">${L('Check', 'Kiểm tra')}</button>
            ${canScan ? `<button class="wbtn" id="pk-scan">📷 ${st.stream ? L('Stop', 'Dừng') : L('Scan', 'Quét')}</button>` : ''}</div>`}
        ${st.msg ? `<p class="${/^✓/.test(st.msg) ? 'kw-hint' : 'kw-warn'}">${esc(st.msg)}</p>` : ''}</div>`;
      const v = h.querySelector('#pk-video'); if (v && st.stream) { v.srcObject = st.stream; v.play().catch(() => {}); }
      const ci = h.querySelector('#pk-code'); if (ci) ci.addEventListener('keydown', e => { if (e.key === 'Enter') check(ci.value); });
      const cb = h.querySelector('#pk-check'); if (cb) cb.addEventListener('click', () => check(ci.value));
      const sb = h.querySelector('#pk-scan'); if (sb) sb.addEventListener('click', async () => {
        if (st.stream) { stop(); return paint(); }
        try {
          st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          const det = new BarcodeDetector({ formats: ['qr_code'] }); paint();
          st.timer = setInterval(async () => { const vid = st.host.querySelector('#pk-video'); if (!vid || vid.readyState < 2) return; try { const r = await det.detect(vid); if (r && r[0]) check(r[0].rawValue); } catch (e) {} }, 400);
        } catch (e) { stop(); st.msg = L('The camera could not start. Type the code instead.', 'Không mở được máy ảnh. Hãy nhập mã.'); paint(); }
      });
      h.querySelectorAll('[data-pkby]').forEach(b => b.addEventListener('click', () => { const k = st.found; st.found = null; st.other = ''; st.msg = '✓ ' + L(`${k.nickname || k.firstName} went home with ${b.dataset.pkby}.`, `Bé ${k.nickname || k.firstName} đã về cùng ${b.dataset.pkby}.`); save(k.id, b.dataset.pkby); paint(); }));
      const oi = h.querySelector('#pk-other'); if (oi) oi.addEventListener('input', () => { st.other = oi.value; });
      const ok = h.querySelector('#pk-other-ok'); if (ok) ok.addEventListener('click', () => { const n = (oi.value || '').trim(), k = st.found; if (!n || !k) return;
        if (!confirm(L(`${n} is not on the pickup list. Check with the office first. Record anyway?`, `${n} không có trong danh sách đón. Hãy hỏi văn phòng trước. Vẫn ghi lại?`))) return;
        st.found = null; st.other = ''; st.msg = '✓ ' + L('Recorded.', 'Đã ghi.'); save(k.id, n); paint(); });
      const ag = h.querySelector('#pk-again'); if (ag) ag.addEventListener('click', () => { st.found = null; st.msg = ''; st.other = ''; paint(); });
    }
    paint();
    return stop;
  }

  /* ======================= Attendance ======================= */
  const ATT = [['present', '✓', 'Present', 'Có mặt'], ['late', '⏰', 'Late', 'Đi muộn'], ['absent', '✕', 'Absent', 'Vắng']];
  function renderAttendance(body) {
    let date = today(), rec = {}, notices = {}, open = null, curCls = null, codes = {}, pkOpen = false, pkStop = () => {}, kidsNow = [], pkSt = {};
    return classView(body, ({ cls, children, picker }) => {
      curCls = cls; kidsNow = children;
      const n = { present: 0, late: 0, absent: 0, none: 0 };
      children.forEach(c => { const r = rec[c.id]; n[r ? r.status : 'none']++; });
      const row = c => {
        const r = rec[c.id], ex = open === c.id, nt = (notices[c.id] || [])[0];
        const pickers = (c.guardians || []).filter(g => g.authorisedPickup).map(g => g.name);
        return `<li class="kw-att${r ? ' ' + r.status : ' none'}">
          <div class="kw-attrow"><button class="kw-kidhead" data-open="${esc(c.id)}">${childFace(c)}<span class="kw-kidname">${esc(childName(c))}
            <small>${r ? esc(L(ATT.find(a => a[0] === r.status)[2], ATT.find(a => a[0] === r.status)[3])) + (r.checkInAt ? ' · ' + esc(r.checkInAt) : '') + (r.checkOutAt ? '–' + esc(r.checkOutAt) : '') : L('Not recorded', 'Chưa điểm danh')}${r && r.pending ? ' · ⏳ ' + L('not sent yet', 'chưa gửi') : ''}${r && r.updatedByRole === 'office' ? ' · 🏢 ' + L('changed by the office', 'văn phòng đã sửa') : ''}</small></span>
            ${(c.medicalAlerts || []).length ? '<span class="kw-alertdot">⚠️</span>' : ''}${nt ? '<span class="kw-flag" title="' + esc(nt.reason || '') + '">📩</span>' : ''}</button>
            <span class="kw-marks">${ATT.map(([id, sh, en, v]) => `<button class="kw-mark ${id}${r && r.status === id ? ' on' : ''}" data-mark="${esc(c.id)}:${id}" aria-pressed="${!!(r && r.status === id)}" aria-label="${esc(L(en, v))}"><span aria-hidden="true">${sh}</span></button>`).join('')}</span></div>
          ${nt ? `<div class="kw-notice">📩 ${L('Parent says', 'Phụ huynh báo')}: ${esc(nt.reason || L('away', 'cho bé nghỉ'))} (${esc(dayLabel(nt.dateFrom))}${nt.dateTo && nt.dateTo !== nt.dateFrom ? '–' + esc(dayLabel(nt.dateTo)) : ''}) <button class="wbtn" data-seen="${esc(c.id)}:${esc(nt.id)}">${L('Seen', 'Đã xem')}</button></div>` : ''}
          ${ex && r ? `<div class="kw-kidbody kw-attmore">
            <div class="btn-row"><button class="wbtn" data-time="${esc(c.id)}:checkInAt">🕗 ${L('Arrived', 'Đến lúc')} ${esc(r.checkInAt || L('now', 'bây giờ'))}</button><button class="wbtn" data-time="${esc(c.id)}:checkOutAt">🏠 ${L('Went home', 'Về lúc')} ${esc(r.checkOutAt || L('now', 'bây giờ'))}</button></div>
            ${r.status === 'absent' ? `<label>${L('Reason', 'Lý do')}<input type="text" maxlength="200" data-field="${esc(c.id)}:absenceReason" value="${esc(r.absenceReason || '')}"></label>` : ''}
            <label>${L('Collected by', 'Người đón')}<input type="text" maxlength="200" list="kw-pick-${esc(c.id)}" data-field="${esc(c.id)}:collectedBy" value="${esc(r.collectedBy || '')}"><datalist id="kw-pick-${esc(c.id)}">${pickers.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
            ${r.collectedBy && pickers.length && !pickers.includes(r.collectedBy) ? `<p class="kw-warn">⚠️ ${L('Not on the pickup list. Check with the office.', 'Không có trong danh sách đón. Hãy hỏi văn phòng.')}</p>` : ''}
            <label>${L('Meals eaten', 'Số bữa ăn')}<span class="kw-step"><button class="wbtn" data-meal="${esc(c.id)}:-1">−</button><b>${r.mealCount == null ? '–' : r.mealCount}</b><button class="wbtn" data-meal="${esc(c.id)}:1">＋</button></span></label>
          </div>` : ''}</li>`;
      };
      body.innerHTML = `
        <div class="kw-classbar">${picker}<span class="kw-daynav"><button class="wbtn" data-day="-1" aria-label="${L('Previous day', 'Hôm trước')}">‹</button><b>${date === today() ? L('Today', 'Hôm nay') : esc(dayLabel(date))}</b><button class="wbtn" data-day="1" ${date >= today() ? 'disabled' : ''} aria-label="${L('Next day', 'Hôm sau')}">›</button></span></div>
        ${date === today() ? `<div class="btn-row"><button class="wbtn${pkOpen ? ' primary' : ''}" id="kw-pk">🎫 ${pkOpen ? L('Close the pickup check', 'Đóng kiểm tra đón') : L('Pickup check', 'Kiểm tra mã đón')}</button></div><div id="kw-pk-host"${pkOpen ? '' : ' hidden'}></div>` : ''}
        <p class="kw-counts"><span class="present">✓ ${n.present}</span><span class="late">⏰ ${n.late}</span><span class="absent">✕ ${n.absent}</span><span class="none">○ ${n.none} ${L('not recorded', 'chưa điểm danh')}</span></p>
        <ul class="kw-kids">${children.map(row).join('')}</ul>
        <p class="kw-hint">${L('Tap a mark; tap the name for times, who collected the child and meals. A mark can be changed, not removed.', 'Chạm vào ô để điểm danh; chạm vào tên để ghi giờ, người đón và bữa ăn. Có thể đổi điểm danh, không xóa được.')}</p>`;
      const kc = KC(), save = (id, patch) => kc.setAttendance(cls.id, id, date, { ...(rec[id] || {}), ...patch }).catch(e => alert(e.message || e));
      body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { date = shiftDay(date, +b.dataset.day); if (date > today()) date = today(); open = null; resub(); }));
      body.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { open = open === b.dataset.open ? null : b.dataset.open; body.__kwPaint(); }));
      body.querySelectorAll('[data-mark]').forEach(b => b.addEventListener('click', () => {
        const [id, st] = b.dataset.mark.split(':'), r = rec[id] || {};
        const patch = { status: st }; if (st !== 'absent') patch.absenceReason = undefined;
        if (st !== 'absent' && !r.checkInAt && date === today()) patch.checkInAt = KC().nowHM();
        const next = { ...r, ...patch }; Object.keys(next).forEach(k => next[k] === undefined && delete next[k]);
        rec[id] = next; kc.setAttendance(cls.id, id, date, next).catch(e => alert(e.message || e)); body.__kwPaint();
      }));
      body.querySelectorAll('[data-time]').forEach(b => b.addEventListener('click', () => { const [id, k] = b.dataset.time.split(':'); save(id, { [k]: KC().nowHM() }); }));
      body.querySelectorAll('[data-field]').forEach(inp => inp.addEventListener('change', () => { const [id, k] = inp.dataset.field.split(':'); const v = inp.value.trim(); const r = { ...(rec[id] || {}) }; if (v) r[k] = v; else delete r[k]; kc.setAttendance(cls.id, id, date, r).catch(e => alert(e.message || e)); }));
      body.querySelectorAll('[data-meal]').forEach(b => b.addEventListener('click', () => { const [id, d] = b.dataset.meal.split(':'); const cur = (rec[id] || {}).mealCount; save(id, { mealCount: Math.max(0, Math.min(5, (cur == null ? 0 : cur) + +d)) }); }));
      body.querySelectorAll('[data-seen]').forEach(b => b.addEventListener('click', () => { const [id, nid] = b.dataset.seen.split(':'); kc.markNoticeSeen(id, nid); }));
      const pkb = body.querySelector('#kw-pk'), pkh = body.querySelector('#kw-pk-host');
      if (pkb) pkb.addEventListener('click', () => { pkOpen = !pkOpen; pkStop(); pkStop = () => {}; pkSt = {}; body.__kwPaint(); });
      if (pkOpen && pkh) { pkStop = pickupPanel(pkh, { st: pkSt, children: () => kidsNow, codes: () => codes,
        save: (id, by) => { const r = rec[id] || {}, next = { ...r, status: r.status && r.status !== 'absent' ? r.status : 'present', checkOutAt: KC().nowHM(), collectedBy: by };
          rec[id] = next; kc.setAttendance(cls.id, id, date, next).catch(e => alert(e.message || e)); } }); }
    }, (cls, children, paint) => {
      const kc = KC(); body.__kwResub = () => {};
      const u3 = kc.pickupCodes ? kc.pickupCodes(children, x => { codes = x; }) : () => {};
      let u1 = kc.subscribeDay(children, 'attendance', date, r => { rec = r; paint(); });
      const u2 = kc.subscribeNotices(children, x => { notices = x; paint(); });
      body.__kwResub = () => { u1(); u1 = kc.subscribeDay(children, 'attendance', date, r => { rec = r; paint(); }); };
      return () => { u1(); u2(); u3(); pkStop(); };
    });
    function resub() { if (body.__kwResub) body.__kwResub(); }
  }

  /* ======================= Daily Report ======================= */
  function renderDailyReport(body) {
    let date = today(), rep = {}, att = {}, field = null;
    return classView(body, ({ cls, children, picker }) => {
      const F = (window.KinderContract && KinderContract.reportFields) || [];
      if (!field || !F.some(f => f.id === field)) field = (F[0] || {}).id;
      const f = F.find(x => x.id === field) || {};
      const here = children.filter(c => att[c.id] && att[c.id].status !== 'absent');
      const missing = here.filter(c => !(rep[c.id] || {})[field]).length;
      const lbl = o => L(o.en, o.vi);
      const row = c => {
        const e = (rep[c.id] || {})[field], away = !att[c.id] || att[c.id].status === 'absent';
        return `<li class="kw-rep${e ? '' : ' none'}${away ? ' away' : ''}">${childFace(c)}<span class="kw-kidname">${esc(childName(c))}<small>${away ? (att[c.id] ? L('absent', 'vắng') : L('not marked present', 'chưa điểm danh có mặt')) : e ? (e.pending ? '⏳ ' + L('not sent yet', 'chưa gửi') : '') : L('Not recorded', 'Chưa ghi')}</small></span>
          ${f.kind === 'text' ? `<input type="text" class="kw-note" maxlength="${f.maxLength || 200}" data-note="${esc(c.id)}" value="${esc(e ? e.value : '')}" placeholder="${L('Note of the day', 'Ghi chú')}">`
            : `<span class="kw-opts">${(f.options || []).map(o => `<button class="kw-opt${e && e.value === o.id ? ' on' : ''}" data-opt="${esc(c.id)}:${esc(o.id)}" aria-pressed="${!!(e && e.value === o.id)}" title="${esc(lbl(o))}"><span aria-hidden="true">${o.icon}</span><span class="kw-optl">${esc(lbl(o))}</span></button>`).join('')}</span>`}</li>`;
      };
      body.innerHTML = `
        <div class="kw-classbar">${picker}<span class="kw-daynav"><button class="wbtn" data-day="-1" aria-label="${L('Previous day', 'Hôm trước')}">‹</button><b>${date === today() ? L('Today', 'Hôm nay') : esc(dayLabel(date))}</b><button class="wbtn" data-day="1" ${date >= today() ? 'disabled' : ''} aria-label="${L('Next day', 'Hôm sau')}">›</button></span></div>
        <div class="kw-tabs" role="tablist">${F.map(x => `<button role="tab" class="kw-tab${x.id === field ? ' on' : ''}" aria-selected="${x.id === field}" data-field="${esc(x.id)}">${esc(L(x.label.en, x.label.vi))}</button>`).join('')}</div>
        ${f.kind === 'choice' ? `<div class="kw-classact"><span class="kw-hint">${L('For everyone present not yet recorded:', 'Cho các bé có mặt chưa ghi:')}</span>${(f.options || []).map(o => `<button class="wbtn" data-all="${esc(o.id)}">${o.icon} ${esc(lbl(o))}</button>`).join('')}</div>` : ''}
        <p class="kw-counts"><span class="none">○ ${L(`${missing} of ${here.length} present children not recorded`, `${missing}/${here.length} bé có mặt chưa ghi`)}</span></p>
        <ul class="kw-kids">${children.map(row).join('')}</ul>
        <p class="kw-hint">${L('Nothing is filled in for you: parents see only what you record. Tap a choice again to remove it. These options are defaults until the school confirms them.', 'Không có gì được điền sẵn: phụ huynh chỉ thấy những gì cô ghi. Chạm lại để bỏ chọn. Các lựa chọn này là mặc định cho đến khi trường xác nhận.')}</p>`;
      const kc = KC();
      body.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { date = shiftDay(date, +b.dataset.day); if (date > today()) date = today(); body.__kwResub(); }));
      body.querySelectorAll('[data-field]').forEach(b => b.addEventListener('click', () => { field = b.dataset.field; body.__kwPaint(); }));
      body.querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
        const [id, v] = b.dataset.opt.split(':'), e = (rep[id] || {})[field];
        (e && e.value === v ? kc.clearReport(id, date, field) : kc.setReport(cls.id, id, date, field, v, 'single')).catch(err => alert(err.message || err));
      }));
      body.querySelectorAll('[data-note]').forEach(inp => inp.addEventListener('change', () => { const v = inp.value.trim(); (v ? kc.setReport(cls.id, inp.dataset.note, date, field, v, 'single') : kc.clearReport(inp.dataset.note, date, field)).catch(err => alert(err.message || err)); }));
      body.querySelectorAll('[data-all]').forEach(b => b.addEventListener('click', () => {
        here.filter(c => !(rep[c.id] || {})[field]).forEach(c => kc.setReport(cls.id, c.id, date, field, b.dataset.all, 'class-action').catch(err => alert(err.message || err)));
      }));
    }, (cls, children, paint) => {
      const kc = KC();
      let u1 = () => {}, u2 = () => {};
      const sub = () => { u1(); u2(); u1 = kc.subscribeDay(children, 'reportEntries', date, r => { rep = r; paint(); }); u2 = kc.subscribeDay(children, 'attendance', date, a => { att = a; paint(); }); };
      body.__kwResub = sub; sub();
      return () => { u1(); u2(); };
    });
  }

  /* ======================= Notes to Parents ======================= */
  function renderNotes(body) {
    let notes = [], cat = 'good_news', picked = new Set(), text = '', sending = false, msg = '';
    return classView(body, ({ cls, children, picker }) => {
      const C = (window.KinderContract && KinderContract.noteCategoryLabels) || {};
      const cats = Object.keys(C).length ? Object.keys(C) : ['good_news', 'something_to_know', 'health_or_accident'];
      const nameOf = id => { const c = children.find(x => x.id === id); return c ? childName(c) : L('(not in the class now)', '(không còn trong lớp)'); };
      const max = (window.KinderContract && KinderContract.noteMaxLength) || 500;
      body.innerHTML = `
        <div class="kw-classbar">${picker}</div>
        <div class="kw-cats" role="radiogroup" aria-label="${L('Kind of note', 'Loại ghi chú')}">${cats.map(k => `<button role="radio" class="kw-cat${k === cat ? ' on' : ''}" aria-checked="${k === cat}" data-cat="${k}"><span aria-hidden="true">${(C[k] || {}).icon || ''}</span> ${esc(L((C[k] || {}).en || k, (C[k] || {}).vi || k))}</button>`).join('')}</div>
        <div class="kw-pick"><button class="wbtn" id="kn-all">${picked.size === children.length && children.length ? L('Clear', 'Bỏ chọn') : L('Whole class', 'Cả lớp')}</button>${children.map(c => `<button class="kw-chip${picked.has(c.id) ? ' on' : ''}" data-kid="${esc(c.id)}" aria-pressed="${picked.has(c.id)}">${childFace(c)}${esc(c.nickname || c.firstName)}</button>`).join('')}</div>
        <textarea id="kn-text" maxlength="${max}" rows="3" placeholder="${cat === 'good_news' ? L('A few words (optional)', 'Vài lời (không bắt buộc)') : L('What happened, in a few words', 'Chuyện gì đã xảy ra, vài lời')}">${esc(text)}</textarea>
        <div class="btn-row"><span class="kw-hint">${text.length}/${max}</span><button class="wbtn primary kw-big" id="kn-send" ${!picked.size || sending || (cat !== 'good_news' && !text.trim()) ? 'disabled' : ''}>${sending ? L('Sending…', 'Đang gửi…') : L(`Send to ${picked.size}`, `Gửi cho ${picked.size} phụ huynh`)}</button></div>
        ${msg ? `<p class="kw-hint">${esc(msg)}</p>` : ''}
        <h5 class="kw-h">${L('Sent', 'Đã gửi')}</h5>
        <ul class="kw-notes">${notes.map(n => `<li><span class="kw-ncat" aria-hidden="true">${(C[n.category] || {}).icon || '🙂'}</span><div><b>${esc(nameOf(n.studentId))}</b> <span class="kw-hint">${new Date(n.createdMs).toLocaleString(vi() ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><p>${esc(n.text) || '<span class="kw-hint">' + esc(L((C[n.category] || {}).en || '', (C[n.category] || {}).vi || '')) + '</span>'}</p></div>
          <span class="kw-nstat">${n.read ? '✓✓ ' + L('Read', 'Đã xem') : '✓ ' + L('Sent', 'Đã gửi') + ` <button class="wbtn" data-back="${esc(n.id)}">${L('Take back', 'Thu hồi')}</button>`}</span></li>`).join('') || `<li class="kw-empty">${L('No notes yet.', 'Chưa có ghi chú nào.')}</li>`}</ul>`;
      const kc = KC(), ta = body.querySelector('#kn-text');
      body.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { cat = b.dataset.cat; body.__kwPaint(); }));
      body.querySelectorAll('[data-kid]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.kid; picked.has(id) ? picked.delete(id) : picked.add(id); body.__kwPaint(); }));
      body.querySelector('#kn-all').addEventListener('click', () => { picked = picked.size === children.length ? new Set() : new Set(children.map(c => c.id)); body.__kwPaint(); });
      ta.addEventListener('input', () => { text = ta.value; const b = body.querySelector('#kn-send'); b.disabled = !picked.size || (cat !== 'good_news' && !text.trim()); body.querySelector('.btn-row .kw-hint').textContent = `${text.length}/${max}`; });
      body.querySelector('#kn-send').addEventListener('click', async () => {
        sending = true; msg = ''; body.__kwPaint();
        try {
          const sess = kc.session() || {}, r = await kc.sendNote(cls.id, [...picked], cat, text.trim(), (sess.displayName || '').slice(0, 40));
          msg = L(`Sent to ${r.sent} families.`, `Đã gửi cho ${r.sent} gia đình.`); picked = new Set(); text = '';
        } catch (e) { msg = e.message || String(e); }
        sending = false; body.__kwPaint();
      });
      body.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { if (confirm(L('Take this note back? The parent has not opened it yet.', 'Thu hồi ghi chú này? Phụ huynh chưa mở.'))) kc.takeBack(cls.id, b.dataset.back).catch(e => alert(e.message || e)); }));
    }, (cls, children, paint) => KC().subscribeNotes(cls.id, n => { notes = n; paint(); }));
  }

  /* ======================= Notices (announcements) =======================
     Scope 4.2 and decision 5: the teacher posts to their own class, no office approval; parents see it in TinyParentDeck's
     Class Notices (classes/{id}/classNotices). School notices come from KinderDeck once it sends them. Copy for Zalo stays. */
  function renderNoticesK(body) {
    let list = [], school = null, msg = '', draft = { title: '', body: '', date: '' };
    return classView(body, ({ cls, picker }) => {
      const kc = KC(), d0 = draft.date || today();
      const dm = d => d ? d.split('-').reverse().slice(0, 2).join('/') : '';
      const sNotes = (school && school.notices) || [], sCal = ((school && school.calendar) || []).filter(e => e.date >= today()).slice(0, 8);
      body.innerHTML = `
        <div class="kw-classbar">${picker}</div>
        <div class="kw-nform">
          <input type="text" id="kn-title" maxlength="120" placeholder="${L('Title, e.g. Bring a raincoat on Thursday', 'Tiêu đề, ví dụ: Thứ Năm mang áo mưa')}" value="${esc(draft.title)}">
          <textarea id="kn-body" maxlength="1000" rows="3" placeholder="${L('Details for the families (optional)', 'Nội dung cho phụ huynh (không bắt buộc)')}">${esc(draft.body)}</textarea>
          <label>${L('Date', 'Ngày')}<input type="date" id="kn-date" value="${esc(d0)}"></label>
          <button class="wbtn primary kw-big" id="kn-post" ${draft.title.trim() ? '' : 'disabled'}>📣 ${L('Post to the class', 'Gửi cho cả lớp')}</button>
        </div>
        ${msg ? `<p class="kw-hint">${esc(msg)}</p>` : ''}
        <h5 class="kw-h">${L('Posted to', 'Đã gửi cho')} ${esc(cls.className)}</h5>
        <ul class="kw-notes">${list.map(n => `<li><span class="kw-ncat" aria-hidden="true">📣</span><div><b>${esc(n.title)}</b> <span class="kw-hint">${esc(n.date ? n.date.split('-').reverse().slice(0, 2).join('/') : '')}${n.pending ? ' · ⏳ ' + L('not sent yet', 'chưa gửi') : ''}</span>${n.body ? `<p>${esc(n.body)}</p>` : ''}</div>
          <span class="kw-nstat"><button class="wbtn" data-zalo="${esc(n.id)}">${L('Copy for Zalo', 'Chép sang Zalo')}</button><button class="wbtn" data-del="${esc(n.id)}">${L('Remove', 'Gỡ')}</button></span></li>`).join('') || `<li class="kw-empty">${L('Nothing posted yet. Families see what you post in TinyParentDeck.', 'Chưa gửi gì. Phụ huynh xem thông báo trong TinyParentDeck.')}</li>`}</ul>
        <h5 class="kw-h">${L('From the school', 'Từ nhà trường')}</h5>
        ${school ? `<ul class="kw-notes">${sNotes.map(n => `<li><span class="kw-ncat" aria-hidden="true">🏫</span><div><b>${esc(n.title)}</b> <span class="kw-hint">${esc(dm(n.date))}</span>${n.body ? `<p>${esc(n.body)}</p>` : ''}</div></li>`).join('') || `<li class="kw-empty">${L('No school notices.', 'Không có thông báo của trường.')}</li>`}</ul>
        <h5 class="kw-h">${L('School calendar', 'Lịch của trường')}</h5>
        <ul class="kw-notes">${sCal.map(e => `<li><span class="kw-ncat" aria-hidden="true">📅</span><div><b>${esc(e.title)}</b> <span class="kw-hint">${esc(dm(e.date))}${e.time ? ' · ' + esc(e.time) : ''}</span></div></li>`).join('') || `<li class="kw-empty">${L('Nothing coming up.', 'Sắp tới chưa có sự kiện.')}</li>`}</ul>`
        : `<p class="kw-nr">${L('Not received yet (school notices come from KinderDeck).', 'Chưa nhận (thông báo của trường đến từ KinderDeck).')}</p>`}`;
      const t = body.querySelector('#kn-title'), b = body.querySelector('#kn-body'), dt = body.querySelector('#kn-date'), post = body.querySelector('#kn-post');
      t.addEventListener('input', () => { draft.title = t.value; post.disabled = !t.value.trim(); });
      b.addEventListener('input', () => { draft.body = b.value; });
      dt.addEventListener('change', () => { draft.date = dt.value; });
      post.addEventListener('click', async () => {
        const n = { title: draft.title.trim(), body: draft.body.trim(), date: dt.value || today() };
        if (!n.title) return;
        post.disabled = true;
        try { await kc.postClassNotice(cls.id, n); msg = L('Posted. Families see it in TinyParentDeck.', 'Đã gửi. Phụ huynh xem trong TinyParentDeck.'); draft = { title: '', body: '', date: '' }; }
        catch (e) { msg = e.message || String(e); }
        body.__kwPaint();
      });
      body.querySelectorAll('[data-del]').forEach(x => x.addEventListener('click', () => { if (confirm(L('Remove this notice for every family?', 'Gỡ thông báo này với mọi phụ huynh?'))) kc.deleteClassNotice(cls.id, x.dataset.del).catch(e => alert(e.message || e)); }));
      body.querySelectorAll('[data-zalo]').forEach(x => x.addEventListener('click', async () => {
        const n = list.find(y => y.id === x.dataset.zalo); if (!n) return;
        const text = `📣 ${cls.className}: ${n.title}${n.date ? ' (' + n.date.split('-').reverse().join('/') + ')' : ''}${n.body ? '\n' + n.body : ''}`;
        const ok = typeof ccCopyText === 'function' && await ccCopyText(text);
        x.textContent = ok ? '✓ ' + L('Copied', 'Đã chép') : L('Could not copy', 'Không chép được');
      }));
    }, (cls, children, paint) => {
      const u1 = KC().subscribeClassNotices(cls.id, x => { list = x; paint(); });
      const u2 = KC().subscribeSchoolInfo(cls.id, i => { school = i; paint(); });
      return () => { u1(); u2(); };
    });
  }

  /* ======================= Development Observations (progressreports) =======================
     Scope 4.2 and step 6: what the teacher notices about a child, by development area, in words. No grades, levels, scores
     or comparison between children (Kinder rules). Shared ones reach the family in TinyParentDeck; the others stay with the
     class's staff. students/{id}/observations (backend v2.24.0). Never written for or shown to children. */
  function renderObservations(body) {
    let child = null, list = [], unO = () => {}, msg = '', draft = { area: '', text: '', shared: true };
    return classView(body, ({ cls, children, picker }) => {
      const kc = KC();
      const kid = children.find(c => c.id === child);
      if (!draft.area) draft.area = (AREAS[0] || [])[0] || 'phys';
      body.innerHTML = `
        <div class="kw-classbar">${picker}</div>
        <div class="kw-pick">${children.map(c => `<button class="kw-chip${c.id === child ? ' on' : ''}" data-child="${esc(c.id)}" aria-pressed="${c.id === child}">${childFace(c)}${esc(c.nickname || c.firstName)}</button>`).join('')}</div>
        ${kid ? `
        <div class="kw-cats" role="radiogroup" aria-label="${L('Development area', 'Lĩnh vực phát triển')}">${AREAS.map(a => `<button role="radio" class="kw-cat${a[0] === draft.area ? ' on' : ''}" aria-checked="${a[0] === draft.area}" data-area="${a[0]}"><span aria-hidden="true">${a[1]}</span> ${esc(L(a[2], a[3]))}</button>`).join('')}</div>
        <textarea id="ko-text" maxlength="500" rows="3" placeholder="${L(`What did you notice about ${kid.nickname || kid.firstName}?`, `Cô thấy điều gì ở bé ${kid.nickname || kid.firstName}?`)}">${esc(draft.text)}</textarea>
        <div class="btn-row"><label class="kw-check"><input type="checkbox" id="ko-share" ${draft.shared ? 'checked' : ''}> ${L('Share with the family', 'Gửi cho phụ huynh')}</label>
          <button class="wbtn primary kw-big" id="ko-save" ${draft.text.trim() ? '' : 'disabled'}>${L('Save', 'Lưu')}</button></div>
        ${msg ? `<p class="kw-hint">${esc(msg)}</p>` : ''}
        <h5 class="kw-h">${esc(childName(kid))}</h5>
        <ul class="kw-notes">${list.map(o => { const a = areaOf(o.area);
          return `<li><span class="kw-ncat" aria-hidden="true">${a[1]}</span><div><b>${esc(L(a[2], a[3]))}</b> <span class="kw-hint">${esc(o.date.split('-').reverse().slice(0, 2).join('/'))}${o.pending ? ' · ⏳ ' + L('not sent yet', 'chưa gửi') : ''}</span><p>${esc(o.text)}</p></div>
          <span class="kw-nstat"><span>${o.shared ? '👪 ' + L('Family sees it', 'Phụ huynh xem được') : '🔒 ' + L('Staff only', 'Chỉ cô xem')}</span>
            <button class="wbtn" data-share="${esc(o.id)}">${o.shared ? L('Stop sharing', 'Thôi chia sẻ') : L('Share', 'Chia sẻ')}</button><button class="wbtn" data-odel="${esc(o.id)}">${L('Delete', 'Xóa')}</button></span></li>`; }).join('') || `<li class="kw-empty">${L('Nothing written yet for this child.', 'Chưa có quan sát nào cho bé.')}</li>`}</ul>
        <p class="kw-hint">${L('Words only: no grades, levels or comparisons with other children. The area names are to be confirmed with the school.', 'Chỉ ghi bằng lời: không chấm điểm, xếp mức hay so sánh với bạn khác. Tên các lĩnh vực sẽ được trường xác nhận.')}</p>` : noKids()}`;
      body.querySelectorAll('[data-child]').forEach(b => b.addEventListener('click', () => { child = b.dataset.child; msg = ''; resub(); }));
      body.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => { draft.area = b.dataset.area; body.__kwPaint(); }));
      const ta = body.querySelector('#ko-text'), save = body.querySelector('#ko-save'), sh = body.querySelector('#ko-share');
      if (ta) ta.addEventListener('input', () => { draft.text = ta.value; save.disabled = !ta.value.trim(); });
      if (sh) sh.addEventListener('change', () => { draft.shared = sh.checked; });
      if (save) save.addEventListener('click', async () => {
        const text = draft.text.trim(); if (!text) return;
        save.disabled = true;
        try { await kc.addObservation(cls.id, child, { area: draft.area, text, date: today(), shared: draft.shared }); msg = draft.shared ? L('Saved and shared with the family.', 'Đã lưu và gửi cho phụ huynh.') : L('Saved for the class staff.', 'Đã lưu, chỉ cô xem.'); draft.text = ''; }
        catch (e) { msg = e.message || String(e); }
        body.__kwPaint();
      });
      body.querySelectorAll('[data-share]').forEach(b => b.addEventListener('click', () => { const o = list.find(x => x.id === b.dataset.share); if (o) kc.shareObservation(child, o.id, !o.shared).catch(e => alert(e.message || e)); }));
      body.querySelectorAll('[data-odel]').forEach(b => b.addEventListener('click', () => { if (confirm(L('Delete this observation?', 'Xóa quan sát này?'))) kc.deleteObservation(child, b.dataset.odel).catch(e => alert(e.message || e)); }));
    }, (cls, children) => {   // runs whenever the class's children arrive: pick a child, then follow their observations
      if (!child || !children.some(c => c.id === child)) child = children[0] && children[0].id;
      resub();
      return () => unO();
    });
    function resub() { unO(); list = []; if (!child) return; unO = KC().subscribeObservations(child, x => { list = x; if (body.__kwPaint) body.__kwPaint(); }); if (body.__kwPaint) body.__kwPaint(); }
  }

  /* ======================= Milestones (new) =======================
     The milestones in ../contracts/milestones.json (by development area and age band; wording to confirm with the school)
     that the class staff saw a child reach: tap to mark one reached today, choose whether the family sees it, take it back.
     students/{id}/milestones/{milestoneId} (backend v2.27.0). The family sees only what was reached and shared, never a
     list of what was not; nothing here compares children. */
  const MILES = (window.KinderContract && KinderContract.milestones) || [];
  const BANDS = (window.KinderContract && KinderContract.milestoneBands) || [];
  const bandOf = c => { const g = String((c && c.ageGroup) || '').toLowerCase(); return /lá|la\b|5\s*[–-]\s*6/.test(g) ? '5' : /mầm|mam\b|3\s*[–-]\s*4/.test(g) ? '3' : '4'; };
  function renderMilestones(body) {
    let child = null, band = null, reached = [], unM = () => {}, msg = '';
    return classView(body, ({ cls, children, picker }) => {
      const kc = KC(), kid = children.find(c => c.id === child);
      if (kid && !band) band = bandOf(kid);
      const got = new Map(reached.map(m => [m.id, m])), dm = d => d ? d.split('-').reverse().slice(0, 2).join('/') : '';
      const inBand = MILES.filter(m => m.band === band);
      body.innerHTML = `
        <div class="kw-classbar">${picker}</div>
        <div class="kw-pick">${children.map(c => `<button class="kw-chip${c.id === child ? ' on' : ''}" data-child="${esc(c.id)}" aria-pressed="${c.id === child}">${childFace(c)}${esc(c.nickname || c.firstName)}</button>`).join('')}</div>
        ${kid ? `
        <div class="kw-cats" role="radiogroup" aria-label="${L('Age band', 'Độ tuổi')}">${BANDS.map(b => `<button role="radio" class="kw-cat${b.id === band ? ' on' : ''}" aria-checked="${b.id === band}" data-band="${esc(b.id)}">${esc(L(b.en, b.vi))}</button>`).join('')}</div>
        ${msg ? `<p class="kw-hint">${esc(msg)}</p>` : ''}
        ${AREAS.map(a => { const ms = inBand.filter(m => m.area === a[0]); if (!ms.length) return '';
          return `<h5 class="kw-h"><span aria-hidden="true">${a[1]}</span> ${esc(L(a[2], a[3]))}</h5><ul class="kw-notes kw-miles">${ms.map(m => { const r = got.get(m.id);
            return `<li class="${r ? 'got' : ''}"><button class="kw-mile" data-mile="${esc(m.id)}" aria-pressed="${!!r}"><span class="kw-ncat" aria-hidden="true">${r ? '⭐' : '○'}</span><span>${esc(L(m.en, m.vi))}${r ? ` <span class="kw-hint">${esc(dm(r.date))}${r.pending ? ' · ⏳ ' + L('not sent yet', 'chưa gửi') : ''}</span>` : ''}</span></button>
              ${r ? `<span class="kw-nstat"><button class="wbtn" data-mshare="${esc(m.id)}">${r.shared ? '👪 ' + L('Family sees it', 'Phụ huynh xem được') : '🔒 ' + L('Staff only', 'Chỉ cô xem')}</button></span>` : ''}</li>`; }).join('')}</ul>`; }).join('')}
        <p class="kw-hint">${L(`${reached.length} reached by ${kid.nickname || kid.firstName}. Tap a milestone when you see it; tap again to take it back. Families see only what was reached and shared. The list is to be confirmed with the school.`,
          `Bé ${kid.nickname || kid.firstName} đã đạt ${reached.length} mốc. Chạm vào mốc khi cô thấy bé làm được; chạm lại để bỏ. Phụ huynh chỉ thấy những mốc đã đạt và được chia sẻ. Danh sách sẽ được thống nhất với nhà trường.`)}</p>` : ''}`;
      body.querySelectorAll('[data-child]').forEach(b => b.addEventListener('click', () => { child = b.dataset.child; band = null; msg = ''; resub(); }));
      body.querySelectorAll('[data-band]').forEach(b => b.addEventListener('click', () => { band = b.dataset.band; body.__kwPaint(); }));
      body.querySelectorAll('[data-mile]').forEach(b => b.addEventListener('click', async () => {
        const id = b.dataset.mile, r = got.get(id);
        try {
          if (r) { if (!confirm(L('Take this milestone back?', 'Bỏ đánh dấu mốc này?'))) return; await kc.removeMilestone(child, id); msg = ''; }
          else { await kc.setMilestone(cls.id, child, id, { date: today(), shared: true }); msg = L('Marked, and shared with the family.', 'Đã đánh dấu và chia sẻ với phụ huynh.'); }
        } catch (e) { msg = e.message || String(e); }
        body.__kwPaint();
      }));
      body.querySelectorAll('[data-mshare]').forEach(b => b.addEventListener('click', () => { const r = got.get(b.dataset.mshare); if (r) kc.setMilestone(cls.id, child, r.id, { date: r.date, shared: !r.shared }).catch(e => alert(e.message || e)); }));
    }, (cls, children) => {
      if (!child || !children.some(c => c.id === child)) { child = children[0] && children[0].id; band = null; }
      resub();
      return () => unM();
    });
    function resub() { unM(); reached = []; if (!child) return; unM = KC().subscribeMilestones(child, x => { reached = x; if (body.__kwPaint) body.__kwPaint(); }); if (body.__kwPaint) body.__kwPaint(); }
  }

  window.KINDER_WIDGETS = [
    { id: 'progressreports', replaces: true, cat: 'tools', icon: 'report', w: 480, h: 640, render: renderObservations,
      title: '🌱 Development Observations', titleVi: 'Quan sát phát triển', desc: 'What you notice about each child, by development area, in words: no grades.', descVi: 'Điều cô thấy ở từng bé theo lĩnh vực phát triển, bằng lời: không chấm điểm.' },
    { id: 'announcements', replaces: true, cat: 'tools', icon: 'bell', w: 440, h: 600, render: renderNoticesK,
      title: '📣 Notices', titleVi: 'Thông báo', desc: 'Post a notice to your class’s families; copy it for Zalo.', descVi: 'Gửi thông báo cho phụ huynh của lớp; chép sang Zalo.' },
    { id: 'milestones', cat: 'tools', icon: 'pin', w: 480, h: 640, render: renderMilestones,
      title: '⭐ Milestones', titleVi: 'Mốc phát triển', desc: 'Milestones each child reaches, by development area and age, shared with the family.', descVi: 'Những mốc phát triển từng bé đạt được, theo lĩnh vực và độ tuổi, chia sẻ với phụ huynh.' },
    { id: 'myclass', cat: 'tools', icon: 'people', w: 380, h: 600, render: renderMyClass,
      title: '🧒 My Class', titleVi: 'Lớp của tôi', desc: 'The children of your class, their alerts, parents and who may collect them.', descVi: 'Các bé trong lớp, lưu ý sức khỏe, phụ huynh và người được đón bé.' },
    { id: 'attendance', replaces: true, cat: 'time', icon: 'checklist', w: 420, h: 620, render: renderAttendance,
      title: '🙋 Attendance', titleVi: 'Điểm danh', desc: 'One tap per child; times, who collected the child and meals.', descVi: 'Một chạm cho mỗi bé; giờ đến, giờ về, người đón và bữa ăn.' },
    { id: 'dailyreport', cat: 'tools', icon: 'report', w: 460, h: 620, render: renderDailyReport,
      title: '📒 Daily Report', titleVi: 'Báo cáo ngày', desc: 'Mood, meals, nap, toilet and a note for each child, for the parents.', descVi: 'Tâm trạng, bữa ăn, giấc ngủ, vệ sinh và ghi chú của từng bé gửi phụ huynh.' },
    { id: 'noteshome', replaces: true, cat: 'tools', icon: 'mail', w: 520, h: 620, render: renderNotes,
      title: '✉️ Notes to Parents', titleVi: 'Ghi chú gửi phụ huynh', desc: 'Good news, something to know, or health and accidents; Sent, then Read.', descVi: 'Tin vui, điều cần lưu ý, hoặc sức khỏe và tai nạn; Đã gửi rồi Đã xem.' },
    { id: 'agenda', replaces: true, cat: 'tools', icon: 'clipboard', w: 320, h: 560, render: renderTodaysPlan,
      title: "🗓️ Today's Plan", titleVi: 'Lịch trong ngày', desc: 'The day in pictures, and what the class sings, plays and does today.', descVi: 'Một ngày của lớp bằng hình, và hôm nay lớp hát, chơi, làm gì.' },
    { id: 'lessonplanner', replaces: true, cat: 'tools', icon: 'lessonplan', w: 420, h: 600, render: renderWeeklyPlan,
      title: '📅 Weekly Plan', titleVi: 'Kế hoạch tuần', desc: 'A weekly theme and the activities of each day, by development area.', descVi: 'Chủ đề tuần và hoạt động mỗi ngày theo lĩnh vực phát triển.' },
    { id: 'namepicker', replaces: true, cat: 'tools', icon: 'shuffle', w: 280, h: 400, render: renderHelper,
      title: '🌟 Helper of the Day', titleVi: 'Bé trực nhật', desc: 'Everyone gets a turn before anyone has two.', descVi: 'Bé nào cũng được một lượt trước khi có bé được hai lượt.' },
    { id: 'groupmaker', replaces: true, cat: 'tools', icon: 'shuffle', w: 380, h: 480, render: renderGroups,
      title: '🐰 Activity Groups', titleVi: 'Nhóm hoạt động', desc: 'Even groups named after animals or colours, mixed by chance.', descVi: 'Chia nhóm đều, đặt tên theo con vật hoặc màu sắc, ngẫu nhiên.' },
    { id: 'scoreboard', replaces: true, cat: 'tools', icon: 'trophy', w: 340, h: 460, render: renderStickers,
      title: '⭐ Sticker Chart', titleVi: 'Bảng bé ngoan', desc: 'The whole class works toward one goal together.', descVi: 'Cả lớp cùng nhau hướng tới một mục tiêu.' },
    { id: 'dice', replaces: true, cat: 'tools', icon: 'dice', w: 300, h: 340, render: renderDice,
      title: '🎲 Counting Dice', titleVi: 'Xúc xắc đếm', desc: 'Big dot dice for counting, with the number shown or hidden.', descVi: 'Xúc xắc chấm to để đếm, hiện hoặc ẩn số.' },
    { id: 'traffic', replaces: true, cat: 'tools', icon: 'traffic', w: 220, h: 380, render: renderStopGo,
      title: '🚦 Stop and Go', titleVi: 'Dừng và Đi', desc: 'A signal for the whole class: stop, wait, go.', descVi: 'Tín hiệu cho cả lớp: dừng lại, chờ, đi.' }
  ];
})();

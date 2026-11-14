'use strict';
/* TinyParentDeck's widgets (scope Draft 2, section "Widgets in v1"). TinyParentDeck's own file; js/app.js (ParentDeck's,
   shared) reads window.KINDER_WIDGETS ({ id, title, titleVi, iconPath, w, h, render, cat?, full? }) when the Kinder edition
   is on, and drops ParentDeck's school widgets (homework, points, badges…).

     today    Today at School (Hôm nay ở trường)     arrived and when, mood, meals, nap, toilet, the note of the day, the menu
     kattend  Attendance (Điểm danh)                  the last school days, with times and who collected the child
     knotes   Notes from teacher (Ghi chú từ cô)      the category icon, the text; opening one tells the teacher it was read
     absence  Absence Notice (Báo nghỉ)               tell the class the child will be away; Seen when the teacher reads it
     notices  Class Notices (Thông báo của lớp)       the school's and the teacher's notices; the school and class calendar
     askme    Ask Me About Today (Hỏi con về hôm nay) the song, game and activity of the day, as questions

   Rules (scope, Rules for the Kinder edition): the parent's own child only; Not recorded is grey and never inferred;
   nothing compares children. Every render goes through ParentDeck's widgetGate (signed in, a child chosen), and a language
   or child switch re-renders the widget (app.js refreshAll / switchChild). Data: js/kinder-parent-cloud.js. */
(() => {
  const L = (en, vi) => ((typeof ui !== 'undefined' && ui.lang) === 'en' ? en : vi);
  const KPC = () => KinderParentCloud;
  const link = sid => PD.getLinkedChildren().find(k => k.studentId === sid) || {};
  const dm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const dayName = iso => new Date(iso + 'T00:00:00').toLocaleDateString(L('en-GB', 'vi-VN'), { weekday: 'long', day: 'numeric', month: 'numeric' });
  const timeOf = iso => (iso && iso.length >= 16 ? iso.slice(11, 16) : '');
  const ATT = { present: ['✓', 'Arrived', 'Đã đến lớp'], late: ['⏰', 'Arrived late', 'Đến muộn'], absent: ['✕', 'Absent', 'Vắng'] };
  const NR = () => `<span class="kp-nr">${L('Not recorded', 'Chưa ghi')}</span>`;
  const gate = (body, fn) => widgetGate(body, sid => fn(sid, link(sid)));
  /* v0.5.0: the child's photo, when the school switched photos on in KinderDeck (backend v2.26.0). */
  const PHOTO_OK = /^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*|https:\/\/[^\s"'<>]+)$/;
  const pic = photo => (typeof photo === 'string' && PHOTO_OK.test(photo) ? `<img class="kp-photo" src="${esc(photo)}" alt="" aria-hidden="true">` : '');
  const mount = (body, html, wire) => { body.innerHTML = html; if (wire) wire(); };

  /* ---------------- Today at School ---------------- */
  function renderToday(body) {
    let date = KPC().today(), un = () => {}, unI = () => {}, unP = () => {}, info = null, last = null, photo = '';
    const outer = gate(body, (sid, k) => {
      const draw = ({ att, rep }) => {
        last = { att, rep };
        const menu = (info && info.menu && info.menu[date]) || [];
        const F = (window.KinderContract && KinderContract.reportFields) || [];
        const a = att && ATT[att.status];
        const field = f => {
          const e = rep[f.id];
          if (!e) return `<div class="kp-field none"><b>${esc(L(f.label.en, f.label.vi))}</b>${NR()}</div>`;
          const o = f.kind === 'choice' ? (f.options || []).find(x => x.id === e.value) : null;
          return `<div class="kp-field"><b>${esc(L(f.label.en, f.label.vi))}</b><span class="kp-val">${o ? `<span aria-hidden="true">${o.icon}</span> ${esc(L(o.en, o.vi))}` : esc(e.value)}</span>${timeOf(e.recordedAt) ? `<small>${L('at', 'lúc')} ${timeOf(e.recordedAt)}</small>` : ''}</div>`;
        };
        mount(body, `
          <div class="kp-head"><div class="kp-who">${pic(photo)}<span><b class="kp-name">${esc(k.displayName || '')}</b><small>${esc(k.className || '')}</small></span></div>
            <span class="kp-daynav"><button class="btn" data-d="-1" aria-label="${L('Previous day', 'Hôm trước')}">‹</button><b>${date === KPC().today() ? L('Today', 'Hôm nay') : esc(dayName(date))}</b><button class="btn" data-d="1" ${date >= KPC().today() ? 'disabled' : ''} aria-label="${L('Next day', 'Hôm sau')}">›</button></span></div>
          <div class="kp-arrive ${att ? att.status : 'none'}">${a ? `<span class="kp-mark" aria-hidden="true">${a[0]}</span><div><b>${esc(L(a[1], a[2]))}${att.checkInAt ? ' ' + L('at', 'lúc') + ' ' + esc(att.checkInAt) : ''}</b>
              <small>${att.status === 'absent' && att.absenceReason ? esc(att.absenceReason) : ''}${att.checkOutAt ? L('Went home at ', 'Về lúc ') + esc(att.checkOutAt) : ''}${att.collectedBy ? ' · ' + L('collected by ', 'người đón: ') + esc(att.collectedBy) : ''}${att.updatedByRole === 'office' ? ' · ' + L('changed by the office', 'văn phòng đã sửa') : ''}</small></div>`
            : `<span class="kp-mark" aria-hidden="true">○</span><div><b>${L('Attendance not recorded yet', 'Chưa điểm danh')}</b></div>`}</div>
          <div class="kp-fields">${F.map(field).join('')}</div>
          ${menu.length ? `<div class="kp-menu"><b>🍽️ ${L('The school menu', 'Thực đơn của trường')}</b><ul>${menu.map(m => `<li><small>${esc(L(m.mealEn || m.meal, m.meal))}</small> ${m.dishes.map(esc).join(', ')}</li>`).join('')}</ul></div>` : ''}
          <p class="kp-hint">${L('Only what the teacher recorded is shown. Not recorded means nothing was written yet.', 'Chỉ hiện những gì cô đã ghi. “Chưa ghi” nghĩa là cô chưa ghi gì.')}</p>`, () => {
          body.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { date = KPC().shift(date, +b.dataset.d); if (date > KPC().today()) date = KPC().today(); sub(); }));
        });
      };
      const sub = () => { un(); un = KPC().subscribeDay(sid, date, draw); };
      sub();
      unI();   // the school's menu for the day (from KinderDeck, through the class's school info)
      unI = KPC().subscribeSchoolInfo(k.classId, i => { info = i; if (last) draw(last); });
      unP(); unP = KPC().subscribePhoto(sid, p => { photo = p; if (last) draw(last); });
      return () => { un(); unI(); unP(); };
    });
    return () => { if (typeof outer === 'function') outer(); un(); unI(); unP(); };
  }

  /* ---------------- Attendance ---------------- */
  function renderAttend(body) {
    return gate(body, sid => KPC().subscribeAttendance(sid, 15, list => {
      mount(body, list.length ? `<ul class="kp-list">${list.map(r => { const a = ATT[r.status] || ['○', '', ''];
        return `<li class="kp-att ${esc(r.status)}"><span class="kp-mark" aria-hidden="true">${a[0]}</span><div><b>${esc(dayName(r.id))}</b>
          <small>${esc(L(a[1], a[2]))}${r.checkInAt ? ' · ' + esc(r.checkInAt) : ''}${r.checkOutAt ? '–' + esc(r.checkOutAt) : ''}${r.absenceReason ? ' · ' + esc(r.absenceReason) : ''}${r.collectedBy ? ' · ' + L('collected by ', 'người đón: ') + esc(r.collectedBy) : ''}${r.updatedByRole === 'office' ? ' · ' + L('changed by the office', 'văn phòng đã sửa') : ''}</small></div></li>`; }).join('')}</ul>
        <p class="kp-hint">${L('A day that is not listed was not recorded.', 'Ngày không có trong danh sách là ngày chưa được ghi.')}</p>`
        : `<p class="kp-hint">${L('No attendance recorded yet.', 'Chưa có điểm danh nào.')}</p>`);
    }));
  }

  /* ---------------- Notes from teacher ---------------- */
  function renderNotes(body) {
    let open = null, notes = [];
    return gate(body, (sid, k) => {
      const C = (window.KinderContract && KinderContract.noteCategoryLabels) || {};
      const draw = () => mount(body, notes.length ? `<ul class="kp-list">${notes.map(n => { const c = C[n.category] || { icon: n.mood === 'smiley' ? '🙂' : '📝', en: '', vi: '' }, ex = open === n.id;
        return `<li class="kp-note${n.read ? '' : ' unread'}"><button class="kp-notehead" data-n="${esc(n.id)}" aria-expanded="${ex}"><span class="kp-ncat" aria-hidden="true">${c.icon}</span>
          <div><b>${esc(L(c.en || '', c.vi || ''))}</b><small>${new Date(n.createdMs).toLocaleString(L('en-GB', 'vi-VN'), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${n.read ? '' : ' · ' + L('new', 'mới')}</small></div></button>
          ${ex ? `<div class="kp-notebody"><p>${esc(n.text || '')}</p><small>${esc(k.className || '')}${n.signedAs ? ' · ' + esc(n.signedAs) : ''}</small></div>` : ''}</li>`; }).join('')}</ul>`
        : `<p class="kp-hint">${L('No notes from the teacher yet.', 'Chưa có ghi chú nào từ cô.')}</p>`, () => {
        body.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
          const n = notes.find(x => x.id === b.dataset.n); if (!n) return;
          open = open === n.id ? null : n.id;
          if (!n.read) KPC().markRead(k.classId, n.id).catch(() => {});   // the teacher's list then shows Read
          draw();
        }));
      });
      return KPC().subscribeNotes(k.classId, sid, x => { notes = x; draw(); });
    });
  }

  /* ---------------- Absence Notice ---------------- */
  function renderAbsence(body) {
    let msg = '', list = [];
    return gate(body, (sid, k) => {
      const t0 = KPC().today();
      const draw = () => mount(body, `
        <p class="kp-hint">${L('Tell the teacher when your child will be away.', 'Báo cô giáo khi con nghỉ học.')}</p>
        <div class="kp-form">
          <label>${L('From', 'Từ ngày')}<input type="date" id="ab-from" value="${t0}" min="${t0}"></label>
          <label>${L('To (optional)', 'Đến ngày (nếu nghỉ nhiều ngày)')}<input type="date" id="ab-to" min="${t0}"></label>
          <label class="wide">${L('Reason (optional)', 'Lý do (không bắt buộc)')}<input type="text" id="ab-why" maxlength="200" placeholder="${L('e.g. a fever', 'ví dụ: con bị sốt')}"></label>
          <button class="btn primary kp-big" id="ab-send">${L('Send to the teacher', 'Gửi cho cô')}</button>
        </div>
        ${msg ? `<p class="kp-hint">${esc(msg)}</p>` : ''}
        ${list.length ? `<h5 class="kp-h">${L('Sent', 'Đã gửi')}</h5><ul class="kp-list">${list.map(n => `<li class="kp-notice"><div><b>${esc(dm(n.dateFrom))}${n.dateTo ? '–' + esc(dm(n.dateTo)) : ''}</b><small>${esc(n.reason || '')}</small></div>
          <span class="kp-seen">${n.seen ? '✓ ' + L('Seen by the teacher', 'Cô đã xem') : '… ' + L('Not seen yet', 'Cô chưa xem') + ` <button class="btn" data-w="${esc(n.id)}">${L('Withdraw', 'Rút lại')}</button>`}</span></li>`).join('')}</ul>` : ''}`, () => {
        body.querySelector('#ab-send').addEventListener('click', async () => {
          const from = body.querySelector('#ab-from').value, to = body.querySelector('#ab-to').value, why = body.querySelector('#ab-why').value.trim();
          if (!from) return;
          if (to && to < from) { msg = L('The end date is before the start date.', 'Ngày kết thúc trước ngày bắt đầu.'); draw(); return; }
          try { await KPC().sendNotice(sid, k.classId, { dateFrom: from, dateTo: to || undefined, reason: why || undefined }); msg = L('Sent. The teacher sees it in Attendance.', 'Đã gửi. Cô sẽ thấy trong mục Điểm danh.'); }
          catch (e) { msg = e.message || String(e); }
          draw();
        });
        body.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => KPC().withdrawNotice(sid, b.dataset.w).catch(e => alert(e.message || e))));
      });
      return KPC().subscribeNotices(sid, x => { list = x; draw(); });
    });
  }

  /* ---------------- Class Notices and calendar ---------------- */
  function renderNotices(body) {
    let notices = [], events = [], school = null;
    const outer = gate(body, (sid, k) => {
      const draw = () => { const sNotes = (school && school.notices) || [], t0 = KPC().today();
        const all = events.map(e => Object.assign({ from: 'class' }, e)).concat(((school && school.calendar) || []).filter(e => e.date >= t0).map(e => Object.assign({ from: 'school' }, e)))
          .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 12);
        mount(body, `
        ${sNotes.length ? `<h5 class="kp-h">${L('From the school', 'Từ nhà trường')}</h5><ul class="kp-list">${sNotes.map(n => `<li class="kp-cn school"><div><b>🏫 ${esc(n.title)}</b><small>${esc(dm(n.date || ''))}</small>${n.body ? `<p>${esc(n.body)}</p>` : ''}</div></li>`).join('')}</ul>` : ''}
        <h5 class="kp-h">${L('From the class', 'Thông báo của lớp')}</h5>
        ${notices.length ? `<ul class="kp-list">${notices.map(n => `<li class="kp-cn"><div><b>${esc(n.title)}</b><small>${esc(dm(n.date || ''))}</small>${n.body ? `<p>${esc(n.body)}</p>` : ''}</div></li>`).join('')}</ul>` : `<p class="kp-hint">${L('No notices yet.', 'Chưa có thông báo.')}</p>`}
        <h5 class="kp-h">${L('Coming up', 'Sắp tới')}</h5>
        ${all.length ? `<ul class="kp-list">${all.map(e => `<li class="kp-ev"><span class="kp-date">${esc(dm(e.date))}</span><div><b>${e.from === 'school' ? '🏫 ' : ''}${esc(e.title)}</b><small>${e.time ? esc(e.time) + ' · ' : ''}${e.from === 'school' ? L('school', 'của trường') : L('class', 'của lớp')}</small></div></li>`).join('')}</ul>` : `<p class="kp-hint">${L('Nothing on the calendar.', 'Lịch chưa có gì.')}</p>`}`); };
      const u1 = KPC().subscribeClassNotices(k.classId, x => { notices = x; draw(); });
      const u2 = KPC().subscribeEvents(k.classId, x => { events = x; draw(); });
      const u3 = KPC().subscribeSchoolInfo(k.classId, x => { school = x; draw(); });
      return () => { u1(); u2(); u3(); };
    });
    return outer;
  }

  /* ---------------- Ask Me About Today ---------------- */
  function renderAskMe(body) {
    return gate(body, (sid, k) => KPC().subscribeDayPlan(k.classId, KPC().today(), plan => {
      const name = k.displayName || L('your child', 'con');
      const qs = plan ? [
        plan.song && [L(`What song did you sing today?`, `Hôm nay con hát bài gì?`), plan.song],
        plan.game && [L(`What game did you play?`, `Con chơi trò gì ở lớp?`), plan.game],
        plan.act && [L(`What did you make or do?`, `Hôm nay con làm gì ở lớp?`), plan.act],
      ].filter(Boolean) : [];
      mount(body, plan ? `
        ${qs.length ? `<p class="kp-hint">${L(`Ask ${name}, then listen. The answer is underneath if you need a hint.`, `Hãy hỏi ${name}, rồi lắng nghe. Gợi ý ở bên dưới nếu cần.`)}</p>
          <ul class="kp-list">${qs.map(([q, a]) => `<li class="kp-q"><b>💬 ${esc(q)}</b><details><summary>${L('Hint', 'Gợi ý')}</summary>${esc(a)}</details></li>`).join('')}</ul>` : ''}
        ${(plan.items || []).length ? `<h5 class="kp-h">${L('The day', 'Một ngày ở lớp')}</h5><ol class="kp-plan">${plan.items.map(i => `<li><span aria-hidden="true">${esc(i.em || '')}</span><span class="kp-t">${esc(i.time || '')}</span>${esc(i.text || '')}</li>`).join('')}</ol>` : ''}`
        : `<p class="kp-hint">${L('The class has not shared today’s plan yet.', 'Lớp chưa chia sẻ lịch hôm nay.')}</p>`);
    }));
  }

  /* ---------------- Observations from the teacher (scope step 6) ----------------
     What the teacher noticed, by development area, in words. Only what the staff chose to share reaches the family; no
     grades, levels or comparison with other children. */
  const AREAS = () => (window.KinderContract && KinderContract.developmentAreas) || [];
  const areaOf = id => AREAS().find(a => a.id === id) || { icon: '🌱', en: '', vi: '' };
  function renderObs(body) {
    return gate(body, (sid, k) => KPC().subscribeObservations(sid, list => {
      mount(body, list.length ? `<p class="kp-hint">${L(`What the teacher noticed about ${k.displayName || 'your child'}.`, `Những điều cô thấy ở ${k.displayName || 'con'}.`)}</p>
        <ul class="kp-list">${list.map(o => { const a = areaOf(o.area);
          return `<li class="kp-obs"><span class="kp-ncat" aria-hidden="true">${a.icon}</span><div><b>${esc(L(a.en, a.vi))}</b><small>${esc(dm(o.date))}</small><p>${esc(o.text)}</p></div></li>`; }).join('')}</ul>`
        : `<p class="kp-hint">${L('Nothing shared by the teacher yet.', 'Cô chưa chia sẻ quan sát nào.')}</p>`);
    }));
  }

  /* ---------------- This Week (Weekly Digest) ----------------
     The child's week on one page, Monday to today: days at school, the teacher's note of each day, notes from the teacher,
     shared observations and the class's notices. Only this child; nothing compared. */
  function renderDigest(body) {
    const T0 = KPC().today(), wd = (new Date(T0 + 'T00:00:00').getDay() + 6) % 7, mon = KPC().shift(T0, -wd);
    const days = Array.from({ length: wd + 1 }, (_, i) => KPC().shift(mon, i)).filter(d => { const x = new Date(d + 'T00:00:00').getDay(); return x !== 0 && x !== 6; });
    let att = [], rep = [], notes = [], obs = [], notices = [], photo = '';
    const outer = gate(body, (sid, k) => {
      const draw = () => {
        const A = Object.fromEntries(att.map(r => [r.id, r]));
        const dayNote = d => (rep.find(e => e.date === d && e.fieldId === 'note') || {}).value;
        const wNotes = notes.filter(n => n.createdMs >= new Date(mon + 'T00:00:00').getTime());
        const wObs = obs.filter(o => o.date >= mon), wNot = notices.filter(n => (n.date || '') >= mon);
        mount(body, `
          <div class="kp-head"><div class="kp-who">${pic(photo)}<span><b class="kp-name">${esc(k.displayName || '')}</b><small>${L('This week', 'Tuần này')} · ${esc(dm(mon))}–${esc(dm(T0))}</small></span></div></div>
          <ul class="kp-week">${days.map(d => { const r = A[d], a = r && ATT[r.status];
            return `<li class="${r ? esc(r.status) : 'none'}"><span class="kp-mark" aria-hidden="true">${a ? a[0] : '○'}</span><b>${esc(new Date(d + 'T00:00:00').toLocaleDateString(L('en-GB', 'vi-VN'), { weekday: 'short' }))}</b>
              <small>${a ? esc(L(a[1], a[2])) : L('Not recorded', 'Chưa ghi')}</small>${dayNote(d) ? `<p>${esc(dayNote(d))}</p>` : ''}</li>`; }).join('')}</ul>
          ${wObs.length ? `<h5 class="kp-h">${L('Noticed by the teacher', 'Cô quan sát')}</h5><ul class="kp-list">${wObs.map(o => { const ar = areaOf(o.area); return `<li><span class="kp-ncat" aria-hidden="true">${ar.icon}</span><div><b>${esc(L(ar.en, ar.vi))}</b><p>${esc(o.text)}</p></div></li>`; }).join('')}</ul>` : ''}
          ${wNotes.length ? `<h5 class="kp-h">${L('Notes from the teacher', 'Ghi chú từ cô')}</h5><ul class="kp-list">${wNotes.map(n => { const c = ((window.KinderContract && KinderContract.noteCategoryLabels) || {})[n.category] || { icon: '🙂' }; return `<li><span class="kp-ncat" aria-hidden="true">${c.icon}</span><div><p>${esc(n.text || L(c.en || '', c.vi || ''))}</p></div></li>`; }).join('')}</ul>` : ''}
          ${wNot.length ? `<h5 class="kp-h">${L('From the class', 'Thông báo của lớp')}</h5><ul class="kp-list">${wNot.map(n => `<li><div><b>${esc(n.title)}</b><small>${esc(dm(n.date))}</small></div></li>`).join('')}</ul>` : ''}
          <p class="kp-hint">${L('A day marked “Not recorded” has no attendance entry yet; it does not mean absent.', 'Ngày “Chưa ghi” là cô chưa điểm danh; không có nghĩa là vắng.')}</p>`);
      };
      const us = [KPC().subscribeAttendance(sid, 10, x => { att = x; draw(); }), KPC().subscribeReportsFrom(sid, mon, x => { rep = x; draw(); }),
        KPC().subscribeNotes(k.classId, sid, x => { notes = x; draw(); }), KPC().subscribeObservations(sid, x => { obs = x; draw(); }),
        KPC().subscribeClassNotices(k.classId, x => { notices = x; draw(); }), KPC().subscribePhoto(sid, p => { photo = p; draw(); })];
      return () => us.forEach(u => u());
    });
    return outer;
  }

  /* ---------------- Milestones (v0.6.0) ----------------
     The milestones the teacher saw the child reach and shared (../contracts/milestones.json, backend v2.27.0). Only what was
     reached: never a list of what was not, never a comparison. */
  const MILES = () => (window.KinderContract && KinderContract.milestones) || [];
  function renderMiles(body) {
    return gate(body, (sid, k) => KPC().subscribeMilestones(sid, list => {
      const byId = new Map(MILES().map(m => [m.id, m])), rows = list.map(r => ({ r, m: byId.get(r.milestone || r.id) })).filter(x => x.m);
      mount(body, rows.length ? `<p class="kp-hint">${L(`What ${k.displayName || 'your child'} can do now, as the teacher saw it.`, `Những điều ${k.displayName || 'con'} đã làm được, theo cô ghi nhận.`)}</p>
        <ul class="kp-list">${rows.map(({ r, m }) => { const a = areaOf(m.area);
          return `<li class="kp-ev"><span class="kp-date">${esc(dm(r.date || ''))}</span><div><b><span aria-hidden="true">⭐</span> ${esc(L(m.en, m.vi))}</b><small><span aria-hidden="true">${a.icon}</span> ${esc(L(a.en, a.vi))}</small></div></li>`; }).join('')}</ul>`
        : `<p class="kp-hint">${L('The teacher has not shared a milestone yet.', 'Cô chưa chia sẻ mốc phát triển nào.')}</p>`);
    }));
  }

  /* ---------------- Fees (v0.6.0) ----------------
     Fees due, only when the school chose to show them (KinderDeck; backend v2.27.0): each month's lines, what was paid, what
     is left, the due date and how to pay. Only this family's own child; teachers never see it. */
  const vnd = n => (Math.round(+n || 0)).toLocaleString('vi-VN') + ' ₫';
  const FEE = { paid: ['✓', 'Paid', 'Đã đóng'], part: ['◐', 'Part paid', 'Đóng một phần'], due: ['○', 'To pay', 'Chưa đóng'] };
  function renderFees(body) {
    return gate(body, (sid, k) => KPC().subscribeFees(sid, list => {
      const how = (list.find(f => f.howToPay) || {}).howToPay;
      mount(body, list.length ? `${list.map(f => { const s = FEE[f.status] || FEE.due, mm = String(f.month || f.id || '');
          return `<div class="kp-fee ${esc(f.status || 'due')}"><div class="kp-head"><div><b class="kp-name">${L('Month', 'Tháng')} ${esc(mm.slice(5))}/${esc(mm.slice(0, 4))}</b>${f.dueDate ? `<small>${L('Due by', 'Hạn đóng')} ${esc(dm(f.dueDate))}</small>` : ''}</div>
              <span class="kp-feestat"><span aria-hidden="true">${s[0]}</span> ${esc(L(s[1], s[2]))}</span></div>
            <table class="kp-feet">${(f.items || []).map(i => `<tr><td>${esc(i.label)}</td><td>${vnd(i.amount)}</td></tr>`).join('')}
              <tr class="sum"><td>${L('Total', 'Tổng')}</td><td>${vnd(f.total)}</td></tr><tr><td>${L('Paid', 'Đã đóng')}</td><td>${vnd(f.paid)}</td></tr>
              <tr class="sum"><td>${L('Left to pay', 'Còn lại')}</td><td>${vnd(f.balance)}</td></tr></table>${f.note ? `<p class="kp-hint">${esc(f.note)}</p>` : ''}</div>`; }).join('')}
          ${how ? `<h5 class="kp-h">${L('How to pay', 'Cách đóng')}</h5><p class="kp-hint" style="white-space:pre-line">${esc(how)}</p>` : ''}
          <p class="kp-hint">${L('From the school office. Ask the office if something looks wrong.', 'Thông tin từ văn phòng nhà trường. Nếu có gì chưa đúng, phụ huynh vui lòng hỏi văn phòng.')}</p>`
        : `<p class="kp-hint">${L('The school has not sent fee information.', 'Nhà trường chưa gửi thông tin học phí.')}</p>`);
    }));
  }

  /* ---------------- Health and Growth (v0.7.0) ----------------
     Height and weight on the school's measurement days (KinderDeck, backend v2.28.0), newest first, with the change since
     the measurement before. Numbers only: no nutrition label, percentile or comparison with other children. */
  const num1 = n => (Math.round(+n * 10) / 10).toLocaleString('vi-VN');
  const diff = (a, b, u) => (a == null || b == null ? '' : `<small class="kp-diff">${a - b >= 0 ? '+' : '−'}${num1(Math.abs(a - b))} ${u}</small>`);
  function renderGrowth(body) {
    return gate(body, (sid, k) => KPC().subscribeGrowth(sid, list => {
      mount(body, list.length ? `<p class="kp-hint">${L(`${k.displayName || 'Your child'}’s height and weight on the school’s measurement days.`, `Chiều cao, cân nặng của ${k.displayName || 'con'} vào các ngày nhà trường cân đo.`)}</p>
        <table class="kp-feet kp-growth"><tr><th>${L('Day', 'Ngày')}</th><th>${L('Height', 'Chiều cao')}</th><th>${L('Weight', 'Cân nặng')}</th></tr>
        ${list.map((g, i) => { const p = list[i + 1] || {};
          return `<tr><td>${esc(dm(g.date || g.id))}</td><td>${g.heightCm != null ? num1(g.heightCm) + ' cm' + diff(g.heightCm, p.heightCm, 'cm') : '–'}</td><td>${g.weightKg != null ? num1(g.weightKg) + ' kg' + diff(g.weightKg, p.weightKg, 'kg') : '–'}</td></tr>`; }).join('')}</table>
        <p class="kp-hint">${L('Every child grows at their own pace. Ask the school’s health staff if you have a question.', 'Mỗi bé lớn theo nhịp riêng. Nếu có thắc mắc, phụ huynh hỏi nhân viên y tế của trường.')}</p>`
        : `<p class="kp-hint">${L('No measurements from the school yet.', 'Nhà trường chưa gửi số đo nào.')}</p>`);
    }));
  }

  /* ---------------- Pickup (v0.7.0) ----------------
     The family's pickup pass: the QR code and the code KinderDeck made (backend v2.28.0), shown to the teacher at the
     gate; who may collect the child (the school's list); the last pickups recorded. QR drawn by js/qrcode-lib.js. */
  function renderPickup(body) {
    let code = '', list = [], recent = [];
    const outer = gate(body, (sid, k) => {
      const draw = () => {
        let svg = '';
        if (code && typeof qrcode === 'function') { const q = qrcode(0, 'M'); q.addData('TDPICKUP:' + code); q.make(); svg = q.createSvgTag(7, 2); }
        mount(body, `${code ? `<div class="kp-pass"><div class="kp-qr" role="img" aria-label="${L('Pickup QR code', 'Mã QR đón con')}">${svg}</div>
            <p class="kp-code" aria-label="${L('Pickup code', 'Mã đón')}">${esc(code.replace(/(.{4})/, '$1 '))}</p>
            <p class="kp-hint">${L('Show this to the teacher when you collect your child. Turn up the screen brightness if it does not scan.', 'Đưa mã này cho cô khi đón con. Nếu cô quét không được, hãy tăng độ sáng màn hình.')}</p></div>`
          : `<p class="kp-hint">${L('The school has not made a pickup code for your child yet.', 'Nhà trường chưa tạo mã đón cho con.')}</p>`}
          <h5 class="kp-h">${L('Who may collect', 'Người được đón con')}</h5>
          ${list.length ? `<ul class="kp-list">${list.map(g => `<li><div><b>${esc(g.name)}</b>${g.relationship ? `<small>${esc(g.relationship)}</small>` : ''}</div></li>`).join('')}</ul>` : `<p class="kp-hint">${L('Nobody is on the list yet.', 'Danh sách chưa có ai.')}</p>`}
          <p class="kp-hint">${L('To change the list, tell the school office.', 'Muốn thay đổi danh sách, phụ huynh báo văn phòng nhà trường.')}</p>
          ${recent.length ? `<h5 class="kp-h">${L('Recent pickups', 'Những lần đón gần đây')}</h5><ul class="kp-list">${recent.map(r => `<li class="kp-ev"><span class="kp-date">${esc(dm(r.id))}</span><div><b>${esc(r.collectedBy)}</b>${r.checkOutAt ? `<small>${L('at', 'lúc')} ${esc(r.checkOutAt)}</small>` : ''}</div></li>`).join('')}</ul>` : ''}`);
      };
      const us = [KPC().subscribePickup(sid, c => { code = c; draw(); }), KPC().subscribePickupList(sid, l => { list = l; draw(); }),
        KPC().subscribeAttendance(sid, 10, a => { recent = a.filter(r => r.collectedBy).slice(0, 5); draw(); })];
      return () => us.forEach(u => u());
    });
    return outer;
  }

  const P = d => d;   // icon paths, 24×24 stroke
  window.KINDER_WIDGETS = [
    { id: 'today', title: 'Today at School', titleVi: 'Hôm nay ở trường', iconPath: P('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'), w: 380, h: 600, render: renderToday },
    { id: 'kattend', title: 'Attendance', titleVi: 'Điểm danh', iconPath: P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4"/>'), w: 360, h: 520, render: renderAttend },
    { id: 'knotes', title: 'Notes from teacher', titleVi: 'Ghi chú từ cô', iconPath: P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'), w: 380, h: 520, render: renderNotes },
    { id: 'absence', title: 'Absence Notice', titleVi: 'Báo nghỉ', iconPath: P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9.5 13.5l5 5M14.5 13.5l-5 5"/>'), w: 380, h: 520, render: renderAbsence },
    { id: 'notices', title: 'Class Notices', titleVi: 'Thông báo của lớp', iconPath: P('<path d="M3 11v3l12 5V6L3 11z"/><path d="M15 9a3 3 0 0 1 0 6"/>'), w: 380, h: 520, render: renderNotices },
    { id: 'kpickup', title: 'Pickup', titleVi: 'Đón con', iconPath: P('<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>'), w: 360, h: 560, render: renderPickup },
    { id: 'kgrowth', title: 'Health and Growth', titleVi: 'Sức khỏe và phát triển', iconPath: P('<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7 16l4-5 3 3 5-7"/>'), w: 380, h: 480, render: renderGrowth },
    { id: 'kmiles', title: 'Milestones', titleVi: 'Mốc phát triển', iconPath: P('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z"/>'), w: 380, h: 520, render: renderMiles },
    { id: 'kfees', title: 'Fees', titleVi: 'Học phí', iconPath: P('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>'), w: 380, h: 560, render: renderFees },
    { id: 'kobs', title: 'Observations', titleVi: 'Cô quan sát', iconPath: P('<path d="M12 22V12"/><path d="M12 12C12 7 8 4 4 4c0 5 3 8 8 8z"/><path d="M12 14c0-4 3-7 8-7 0 4-3 7-8 7z"/>'), w: 380, h: 520, render: renderObs },
    { id: 'kdigest', title: 'This Week', titleVi: 'Tuần này của con', iconPath: P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2"/>'), w: 380, h: 600, render: renderDigest },
    { id: 'askme', title: 'Ask Me About Today', titleVi: 'Hỏi con về hôm nay', iconPath: P('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5"/><path d="M12 16h.01"/>'), w: 360, h: 460, render: renderAskMe },
  ];
})();

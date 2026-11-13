/* classSchedule — AdminDeck v0.11.0, for trifecta-firebase-backend v2.5.0.
   THE BACKEND PACKAGE DEPLOYS THIS FILE from functions/src/admindeck/ (byte-identical to this copy: tools/check_shared.py). Edit THIS copy, then run
   `python3 tools/check_shared.py --fix`.

   A class's weekly timetable, stored on classes/{id}.schedule:

       { slots: [ { day: 1..7, start: 'HH:MM', end: 'HH:MM', room: 'text' }, ... ], from: 'YYYY-MM-DD' | null, to: 'YYYY-MM-DD' | null }

   day 1 = Monday ... 7 = Sunday (ISO). Times are 24-hour SCHOOL-LOCAL wall-clock times: 08:00 means 08:00 wherever the school is, there is no time zone.
   `from` / `to` optionally limit the timetable to a term (inclusive); either may be null.

   Pure: no database, no clock, no DOM. Used by adminSetSchedule (validation), the SchoolDeck Schedule tab (grid and clash list) and the Calendar widget
   (the timetable overlay), in Node and in the browser (window.ClassScheduleFns).                                                                                  */
'use strict';
(function (root) {
const MAX_SLOTS = 20, ROOM_MAX = 40;
const DAYS = [1, 2, 3, 4, 5, 6, 7];
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/, DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// 'H:MM' / 'HH:MM' -> minutes since midnight, or null
function parseTime(v) {
  const m = TIME_RE.exec(String(v == null ? '' : v).trim());
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
const fmtTime = (mins) => String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
// 'YYYY-MM-DD' that is a real calendar date -> the same string, else null
function parseDate(v) {
  const s = String(v == null ? '' : v).trim(), m = DATE_RE.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? s : null;
}
const normRoom = (r) => String(r == null ? '' : r).trim().replace(/\s+/g, ' ');
const roomKey = (r) => normRoom(r).toLowerCase();

/* ---------------------------------------------------------------- validate
   input: { slots, from?, to? }  (slots may be empty: that clears the timetable)
   -> { ok:true, value:{ slots:[...sorted, canonical], from, to } } | { ok:false, errors:[ { field, code, max? } ] }
   field is 'slots' (the list), 'slots.N.day|start|end|room|overlap' (0-based N, as sent), 'from', 'to' or 'range'.                                        */
function validateSchedule(input) {
  const b = input || {}, errors = [], slots = [];
  if (b.slots !== undefined && !Array.isArray(b.slots)) return { ok: false, errors: [{ field: 'slots', code: 'invalid' }] };
  const raw = b.slots || [];
  if (raw.length > MAX_SLOTS) return { ok: false, errors: [{ field: 'slots', code: 'too_many', max: MAX_SLOTS }] };
  raw.forEach((s, i) => {
    const f = (k) => 'slots.' + i + '.' + k, x = s || {};
    const day = typeof x.day === 'number' ? x.day : /^\d+$/.test(String(x.day)) ? +x.day : NaN;
    const a = parseTime(x.start), z = parseTime(x.end), room = normRoom(x.room);
    let bad = false;
    if (!DAYS.includes(day)) { errors.push({ field: f('day'), code: 'invalid' }); bad = true; }
    if (a === null) { errors.push({ field: f('start'), code: 'invalid_time' }); bad = true; }
    if (z === null) { errors.push({ field: f('end'), code: 'invalid_time' }); bad = true; }
    if (a !== null && z !== null && z <= a) { errors.push({ field: f('end'), code: 'end_before_start' }); bad = true; }
    if (room.length > ROOM_MAX) { errors.push({ field: f('room'), code: 'too_long', max: ROOM_MAX }); bad = true; }
    if (!bad) slots.push({ day, start: fmtTime(a), end: fmtTime(z), room, _i: i });
  });
  // two slots of the same class may not overlap each other (that is a typo, not a clash worth keeping)
  slots.forEach((p, i) => slots.slice(i + 1).forEach((q) => {
    if (p.day === q.day && p.start < q.end && q.start < p.end) errors.push({ field: 'slots.' + Math.max(p._i, q._i) + '.overlap', code: 'overlap' });
  }));
  const blank = (v) => v === undefined || v === null || String(v).trim() === '';
  const from = blank(b.from) ? null : parseDate(b.from), to = blank(b.to) ? null : parseDate(b.to);
  if (!blank(b.from) && from === null) errors.push({ field: 'from', code: 'invalid_date' });
  if (!blank(b.to) && to === null) errors.push({ field: 'to', code: 'invalid_date' });
  if (from && to && to < from) errors.push({ field: 'range', code: 'range_inverted' });
  if (errors.length) return { ok: false, errors };
  slots.sort((p, q) => p.day - q.day || (p.start < q.start ? -1 : p.start > q.start ? 1 : 0));
  return { ok: true, value: { slots: slots.map(({ day, start, end, room }) => ({ day, start, end, room })), from, to } };
}
// Two stored schedules say the same thing? (so an unchanged save writes nothing)
const sameSchedule = (a, b) => JSON.stringify(a || { slots: [], from: null, to: null }) === JSON.stringify(b || { slots: [], from: null, to: null });

/* ---------------------------------------------------------------- clashes
   classes: [ { id, className, teacherUid?, teacherName?, schedule? } ]
   -> [ { kind:'teacher'|'room', day, start, end, label, a:{classId, className, slot}, b:{...} } ]   (one entry per overlapping pair of slots)
   A teacher clash needs the same non-empty teacherUid; a room clash the same room ignoring case and spacing. Two timetables that cover different terms
   (from/to that do not overlap) cannot clash.                                                                                                            */
function rangesOverlap(a, b) {
  const af = a.from || '0000-00-00', at = a.to || '9999-99-99', bf = b.from || '0000-00-00', bt = b.to || '9999-99-99';
  return af <= bt && bf <= at;
}
function findClashes(classes) {
  const rows = [];
  (classes || []).forEach((c) => {
    const sc = c.schedule;
    if (sc && Array.isArray(sc.slots)) sc.slots.forEach((s, i) => rows.push({ c, s, i, from: sc.from || null, to: sc.to || null }));
  });
  const out = [];
  rows.forEach((p, i) => rows.slice(i + 1).forEach((q) => {
    if (p.c.id === q.c.id || p.s.day !== q.s.day || !(p.s.start < q.s.end && q.s.start < p.s.end) || !rangesOverlap(p, q)) return;
    const start = p.s.start > q.s.start ? p.s.start : q.s.start, end = p.s.end < q.s.end ? p.s.end : q.s.end;
    const side = (r) => ({ classId: r.c.id, className: r.c.className, slot: r.i });
    if (p.c.teacherUid && p.c.teacherUid === q.c.teacherUid) out.push({ kind: 'teacher', day: p.s.day, start, end, label: p.c.teacherName || p.c.teacherUid, a: side(p), b: side(q) });
    if (roomKey(p.s.room) && roomKey(p.s.room) === roomKey(q.s.room)) out.push({ kind: 'room', day: p.s.day, start, end, label: normRoom(p.s.room), a: side(p), b: side(q) });
  }));
  return out.sort((x, y) => x.day - y.day || (x.start < y.start ? -1 : x.start > y.start ? 1 : 0));
}

/* ---------------------------------------------------------------- occurrences (the Calendar overlay)
   Every dated lesson of one schedule between two dates, inclusive: [ { date:'YYYY-MM-DD', day, start, end, room } ] in date then time order.
   Dates are walked in UTC so the school's own calendar day never shifts with the viewer's time zone.                                                    */
function occurrences(schedule, fromDate, toDate) {
  if (!schedule || !Array.isArray(schedule.slots) || !schedule.slots.length || !parseDate(fromDate) || !parseDate(toDate)) return [];
  const lo = schedule.from && schedule.from > fromDate ? schedule.from : fromDate, hi = schedule.to && schedule.to < toDate ? schedule.to : toDate;
  if (lo > hi) return [];
  const out = [], pad = (n) => String(n).padStart(2, '0');
  const [y, m, d] = lo.split('-').map(Number);
  for (let t = Date.UTC(y, m - 1, d), end = Date.UTC(...hi.split('-').map((v, i) => (i === 1 ? v - 1 : +v))); t <= end; t += 86400000) {
    const dt = new Date(t), iso = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
    const date = dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
    schedule.slots.forEach((s) => { if (s.day === iso) out.push({ date, day: iso, start: s.start, end: s.end, room: s.room || '' }); });
  }
  return out.sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : p.start < q.start ? -1 : p.start > q.start ? 1 : 0));
}

const api = { MAX_SLOTS, ROOM_MAX, DAYS, parseTime, fmtTime, parseDate, normRoom, roomKey, validateSchedule, sameSchedule, findClashes, occurrences };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ClassScheduleFns = api;
})(typeof self !== 'undefined' ? self : this);

'use strict';
/* ============================================================
   ParentDeck — Tier 1 widgets (from "ParentDeck: 10 New Widgets")
   ------------------------------------------------------------
   Seven widgets that need no new rule, Cloud Function or change in
   another app:
     1 Family Overview      2 Week Ahead*        3 Homework Completion
     4 Rewards Wishlist     5 Goals & Streaks*   6 Conversation Starters
     7 Weekly Digest
     (* Week Ahead has been a tab of the Calendar widget since v0.15.0; Goals & Streaks a section of Student Summary since v0.18.0.)

   Loaded BEFORE app.js. Everything here is declarations only: the render
   functions look up app.js's helpers (t, esc, $, ui, saveUI, PD, emptyState,
   widgetGate, dayKey, locale, toast, levelInfo, switchChild, openWidget,
   front, panels, clamp) when they RUN, long after app.js has defined them.
   app.js merges T1_STRINGS into STRINGS and lists the widgets in WIDGETS.

   Guardrails (from the document's privacy section):
   - No widget reads journal text or the mood word.
   - practice, practiceDaily and homeworkDone come from the child's device:
     they are labelled as reported by the child's app, never as grades.
     A missing homeworkDone mark means "not marked", never "not done".
   - Official points are `xp` (s.points). Nothing here recomputes them.
   - Parent-chosen settings (goals, wishlist pin) live in ui (this device).
   ============================================================ */

const T1_STRINGS = {
  // ---- titles and tray ----
  w_family:   { en:'Family Overview', vi:'Tổng quan gia đình' },
  w_hwc:      { en:'Homework Completion', vi:'Hoàn thành bài tập' },
  w_wish:     { en:'Rewards Wishlist', vi:'Danh sách phần thưởng' },
  w_goals:    { en:'Goals & Streaks', vi:'Mục tiêu & chuỗi ngày' },
  w_starters: { en:'Conversation Starters', vi:'Gợi ý trò chuyện' },
  w_digest:   { en:'Weekly Digest', vi:'Bản tin tuần' },
  acct_demo:  { en:'Try demo', vi:'Dùng thử' },
  w_progress: { en:'Progress Reports', vi:'Báo cáo tiến độ' },
  pr_empty:   { en:'No progress reports for {name} yet. They appear here when the teacher sends one.', vi:'Chưa có báo cáo tiến độ nào cho {name}. Báo cáo sẽ hiện ở đây khi giáo viên gửi.' },
  pr_score:   { en:'Score', vi:'Điểm' },
  pr_skills:  { en:'Skills', vi:'Kỹ năng' },
  pr_improve: { en:'Things to improve', vi:'Cần cải thiện' },
  pr_strengths:{ en:'Strengths', vi:'Điểm mạnh' },
  pr_next:    { en:'Next learning focus', vi:'Trọng tâm học tiếp theo' },
  pr_count:   { en:'{n} report(s) for {name}', vi:'{n} báo cáo cho {name}' },
  pr_nodetail:{ en:'No details were included in this report.', vi:'Báo cáo này không có chi tiết.' },
  pr_freq_weekly:{ en:'Weekly', vi:'Hằng tuần' },
  pr_freq_monthly:{ en:'Monthly', vi:'Hằng tháng' },
  pr_freq_daily:{ en:'Daily', vi:'Hằng ngày' },
  toast_progress:{ en:'{name} has a new progress report', vi:'{name} có báo cáo tiến độ mới' },
  cat_overview: { en:'Overview', vi:'Tổng quan' },
  cat_homework: { en:'Homework & calendar', vi:'Bài tập & lịch' },
  cat_rewards:  { en:'Rewards & goals', vi:'Phần thưởng & mục tiêu' },
  cat_share:    { en:'Talk & share', vi:'Trò chuyện & chia sẻ' },
  cat_settings: { en:'Settings', vi:'Cài đặt' },
  tray_title: { en:'All widgets', vi:'Tất cả widget' },
  tray_open:  { en:'Open all widgets', vi:'Mở tất cả widget' },
  tray_close: { en:'Close', vi:'Đóng' },

  // ---- shared ----
  t1_reported: { en:'Reported by {name}’s app', vi:'Do ứng dụng của {name} ghi nhận' },
  t1_no_subject: { en:'General', vi:'Chung' },

  // ---- Family Overview ----
  fam_hint_one: { en:'Family Overview shows every linked child side by side. Link another child and it fills up.', vi:'Tổng quan gia đình hiển thị tất cả các con đã liên kết cạnh nhau. Liên kết thêm một bé để xem đầy đủ.' },
  fam_due: { en:'{n} due this week', vi:'{n} bài đến hạn tuần này' },
  fam_none_due: { en:'Nothing due this week', vi:'Tuần này không có bài đến hạn' },
  fam_overdue: { en:'{n} past due, not marked', vi:'{n} bài quá hạn, chưa đánh dấu' },
  fam_pts_week: { en:'+{n} pts this week', vi:'+{n} điểm tuần này' },
  fam_streak: { en:'{n}-day streak', vi:'Chuỗi {n} ngày' },
  fam_no_streak: { en:'No streak yet', vi:'Chưa có chuỗi ngày' },
  fam_open: { en:'Open summary', vi:'Mở tóm tắt' },
  fam_pts: { en:'{n} pts', vi:'{n} điểm' },
  fam_notes: { en:'{n} unread from the teacher', vi:'{n} ghi chú chưa đọc từ giáo viên' },

  // ---- Week Ahead ----
  wk_range: { en:'Next 7 days', vi:'7 ngày tới' },
  wk_export: { en:'Add to phone calendar (.ics)', vi:'Thêm vào lịch điện thoại (.ics)' },
  wk_exported: { en:'Calendar file downloaded.', vi:'Đã tải tệp lịch.' },
  wk_nothing: { en:'Nothing due or scheduled in the next 7 days.', vi:'Không có bài hạn nộp hay sự kiện nào trong 7 ngày tới.' },
  wk_today: { en:'Today', vi:'Hôm nay' },
  wk_tomorrow: { en:'Tomorrow', vi:'Ngày mai' },
  wk_done: { en:'Done', vi:'Đã xong' },
  wk_notmarked: { en:'Not marked', vi:'Chưa đánh dấu' },
  wk_hw: { en:'Homework', vi:'Bài tập' },
  wk_event: { en:'Class event', vi:'Sự kiện lớp' },
  wk_due: { en:'due', vi:'hạn nộp' },
  wk_ics_note: { en:'The file is a snapshot of today. Changes your teacher makes later will not update it.', vi:'Tệp này là bản chụp tại thời điểm hôm nay. Thay đổi của giáo viên sau đó sẽ không tự cập nhật.' },

  // ---- Homework Completion ----
  hwc_rate: { en:'Marked done, last 4 weeks', vi:'Đã đánh dấu xong, 4 tuần qua' },
  hwc_of: { en:'{done} of {total} items', vi:'{done} / {total} bài' },
  hwc_by_subject: { en:'By subject', vi:'Theo môn' },
  hwc_ontime: { en:'On time: {n}', vi:'Đúng hạn: {n}' },
  hwc_late: { en:'Late: {n}', vi:'Trễ hạn: {n}' },
  hwc_missing: { en:'Past due, not marked yet', vi:'Quá hạn, chưa đánh dấu' },
  hwc_none: { en:'No homework was due in the last 4 weeks.', vi:'4 tuần qua không có bài tập nào đến hạn.' },
  hwc_clear: { en:'Everything past due is marked done.', vi:'Mọi bài quá hạn đều đã được đánh dấu xong.' },
  hwc_note: { en:'Marks come from {name}’s app. “Not marked” can mean not done, or not ticked yet.', vi:'Dấu hoàn thành do ứng dụng của {name} ghi nhận. “Chưa đánh dấu” có thể là chưa làm, hoặc bé chưa tích.' },

  // ---- Rewards Wishlist ----
  wl_balance: { en:'{name} has {n} points', vi:'{name} có {n} điểm' },
  wl_ready: { en:'Ready now', vi:'Đổi được ngay' },
  wl_togo: { en:'{n} pts to go', vi:'Còn {n} điểm' },
  wl_pin: { en:'Pin as goal', vi:'Ghim làm mục tiêu' },
  wl_unpin: { en:'Unpin', vi:'Bỏ ghim' },
  wl_goal: { en:'Saving for', vi:'Đang tiết kiệm cho' },
  wl_redeemed: { en:'Recently redeemed', vi:'Đã đổi gần đây' },
  wl_none: { en:'No rewards listed for this class yet.', vi:'Lớp này chưa có phần thưởng nào.' },
  wl_no_redeemed: { en:'Nothing redeemed yet.', vi:'Chưa đổi phần thưởng nào.' },
  wl_note: { en:'Only {name} can redeem, from StudentDeck. The pinned goal is saved on this device.', vi:'Chỉ {name} mới đổi thưởng được, trong StudentDeck. Mục tiêu đã ghim được lưu trên thiết bị này.' },

  // ---- Goals & Streaks ----
  gs_streak: { en:'Current streak', vi:'Chuỗi hiện tại' },
  gs_best: { en:'Best streak', vi:'Chuỗi dài nhất' },
  gs_last: { en:'Last active', vi:'Hoạt động gần nhất' },
  gs_today: { en:'today', vi:'hôm nay' },
  gs_yesterday: { en:'yesterday', vi:'hôm qua' },
  gs_days_ago: { en:'{n} days ago', vi:'{n} ngày trước' },
  gs_never: { en:'no activity yet', vi:'chưa có hoạt động' },
  gs_cal: { en:'Last 28 days', vi:'28 ngày qua' },
  gs_goals: { en:'This week’s goals', vi:'Mục tiêu tuần này' },
  gs_set: { en:'Set goals', vi:'Đặt mục tiêu' },
  gs_done_edit: { en:'Done', vi:'Xong' },
  gs_read: { en:'Reading (min)', vi:'Đọc (phút)' },
  gs_focus: { en:'Focus sessions', vi:'Phiên tập trung' },
  gs_hw: { en:'Homework done', vi:'Bài tập đã xong' },
  gs_unset: { en:'No goals yet. Tap “Set goals” to add one.', vi:'Chưa có mục tiêu. Nhấn “Đặt mục tiêu” để thêm.' },
  gs_dev: { en:'Goals are saved on this device only. 0 turns a goal off.', vi:'Mục tiêu chỉ được lưu trên thiết bị này. Nhập 0 để tắt mục tiêu.' },
  gs_day_tip: { en:'{date}: {read} min reading, {focus} focus sessions', vi:'{date}: đọc {read} phút, {focus} phiên tập trung' },

  // ---- Conversation Starters ----
  st_next: { en:'Show different ideas', vi:'Xem gợi ý khác' },
  st_note: { en:'Built from this week’s activity. Journal entries and mood are never used.', vi:'Được tạo từ hoạt động tuần này. Nhật ký và tâm trạng không bao giờ được sử dụng.' },
  st_read: { en:'{name} read for {n} minutes this week. Ask what the story was about.', vi:'{name} đã đọc {n} phút trong tuần này. Hãy hỏi bé về nội dung câu chuyện.' },
  st_game: { en:'{name}’s best score in {game} is {best}{label}. Ask them to show you how it works.', vi:'Điểm cao nhất của {name} trong {game} là {best}{label}. Hãy nhờ bé chỉ cho bạn cách chơi.' },
  st_hw_next: { en:'{title} is due {when}. Ask how it is going and whether any help is needed.', vi:'Bài “{title}” đến hạn {when}. Hãy hỏi bé làm đến đâu và có cần giúp gì không.' },
  st_hw_done: { en:'{name} finished {n} homework items this week. Ask which one was the hardest.', vi:'{name} đã hoàn thành {n} bài tập trong tuần này. Hãy hỏi bài nào khó nhất.' },
  st_focus: { en:'{n} focus sessions this week. Ask what helps {name} concentrate.', vi:'{n} phiên tập trung trong tuần này. Hãy hỏi điều gì giúp {name} tập trung.' },
  st_streak: { en:'{name} is on a {n}-day streak. Celebrate it together.', vi:'{name} đang có chuỗi {n} ngày liên tiếp. Hãy cùng ăn mừng nhé.' },
  st_idiom: { en:'{name} met {n} new idioms this week. Ask them to teach you one.', vi:'{name} đã gặp {n} thành ngữ mới trong tuần này. Hãy nhờ bé dạy bạn một câu.' },
  st_points: { en:'{name} earned {n} points: “{reason}”. Ask what happened.', vi:'{name} nhận {n} điểm: “{reason}”. Hãy hỏi bé chuyện đã xảy ra.' },
  st_g1: { en:'Ask {name} what the best part of the school day was.', vi:'Hãy hỏi {name} phần thú vị nhất trong ngày học là gì.' },
  st_g2: { en:'Ask {name} whether anything in class felt hard this week.', vi:'Hãy hỏi {name} tuần này có điều gì ở lớp thấy khó không.' },
  st_g3: { en:'Ask {name} what they would like to learn more about.', vi:'Hãy hỏi {name} bé muốn tìm hiểu thêm điều gì.' },
  st_when_today: { en:'today', vi:'hôm nay' },
  st_when_tomorrow: { en:'tomorrow', vi:'ngày mai' },
  st_when_on: { en:'on {date}', vi:'vào {date}' },

  // ---- Weekly Digest ----
  dg_title: { en:'Weekly digest', vi:'Bản tin tuần' },
  dg_earned: { en:'Points earned', vi:'Điểm kiếm được' },
  dg_spent: { en:'Points spent', vi:'Điểm đã dùng' },
  dg_balance: { en:'Points balance', vi:'Số điểm hiện có' },
  dg_hw: { en:'Homework marked done', vi:'Bài tập đã xong' },
  dg_read: { en:'Reading (minutes)', vi:'Đọc sách (phút)' },
  dg_focus: { en:'Focus sessions', vi:'Phiên tập trung' },
  dg_games: { en:'Games played', vi:'Trò chơi đã chơi' },
  dg_streak: { en:'Streak (days)', vi:'Chuỗi ngày' },
  dg_level: { en:'Level', vi:'Cấp độ' },
  dg_rank: { en:'Class rank', vi:'Xếp hạng lớp' },
  dg_rank_opt: { en:'Include class rank', vi:'Kèm xếp hạng lớp' },
  dg_rank_hidden: { en:'Class ranks are not shown for this class.', vi:'Lớp này không hiển thị xếp hạng.' },
  dg_rank_of: { en:'#{pos} of {total}', vi:'Hạng {pos}/{total}' },
  dg_copy: { en:'Copy for Zalo', vi:'Sao chép cho Zalo' },
  dg_print: { en:'Print', vi:'In' },
  dg_copied: { en:'Copied. Paste it into Zalo.', vi:'Đã sao chép. Dán vào Zalo.' },
  dg_copy_fail: { en:'Could not copy. Select the text and copy it by hand.', vi:'Không sao chép được. Hãy chọn văn bản và sao chép thủ công.' },
  dg_foot: { en:'Reported by {name}’s app. Points are set by the teacher.', vi:'Do ứng dụng của {name} ghi nhận. Điểm do giáo viên cấp.' },

  // ---- Class Pulse (v0.15.0) ----
  w_pulse:    { en:'Class Pulse', vi:'Nhịp lớp học' },
  pl_intro_h: { en:'See the week next to the class', vi:'Xem tuần học bên cạnh cả lớp' },
  pl_intro:   { en:'Class Pulse puts {name}’s reading, focus and homework for this week beside a typical range for the whole class. It shows ranges only: no names, no ranks, and never another child’s numbers.', vi:'Nhịp lớp học đặt số phút đọc, số phiên tập trung và bài tập tuần này của {name} cạnh khoảng thường gặp của cả lớp. Chỉ hiển thị khoảng giá trị: không có tên, không xếp hạng, và không bao giờ có số liệu của bạn khác.' },
  pl_on:      { en:'Turn on Class Pulse', vi:'Bật Nhịp lớp học' },
  pl_off:     { en:'Turn off', vi:'Tắt' },
  pl_refresh: { en:'Refresh', vi:'Làm mới' },
  pl_retry:   { en:'Try again', vi:'Thử lại' },
  pl_loading: { en:'Checking the class…', vi:'Đang xem số liệu của lớp…' },
  pl_week:    { en:'This week · {from} – {to}', vi:'Tuần này · {from} – {to}' },
  pl_read:    { en:'Reading', vi:'Đọc sách' },
  pl_focus:   { en:'Focus sessions', vi:'Phiên tập trung' },
  pl_hw:      { en:'Homework marked done', vi:'Bài tập đã xong' },
  pl_val_min: { en:'{n} min', vi:'{n} phút' },
  pl_val_n:   { en:'{n}', vi:'{n}' },
  pl_val_pct: { en:'{n}%', vi:'{n}%' },
  pl_typical: { en:'Class typical: {lo} to {hi}', vi:'Lớp thường: {lo} đến {hi}' },
  pl_below:   { en:'A little below the typical range', vi:'Thấp hơn khoảng thường gặp một chút' },
  pl_within:  { en:'Within the typical range', vi:'Nằm trong khoảng thường gặp' },
  pl_above:   { en:'Above the typical range', vi:'Cao hơn khoảng thường gặp' },
  pl_nohw:    { en:'No homework was due this week.', vi:'Tuần này không có bài tập nào đến hạn.' },
  pl_na_small:{ en:'Class Pulse is not shown for this class. Ranges only appear when the class is big enough to keep every child private.', vi:'Lớp này không hiển thị Nhịp lớp học. Khoảng giá trị chỉ xuất hiện khi lớp đủ đông để bảo vệ sự riêng tư của từng bạn.' },
  pl_na_off:  { en:'The teacher has turned Class Pulse off for this class.', vi:'Giáo viên đã tắt Nhịp lớp học cho lớp này.' },
  pl_na_ready:{ en:'Class Pulse is not available yet. It will appear here once the school switches it on.', vi:'Nhịp lớp học chưa sẵn sàng. Tính năng sẽ hiện ở đây khi nhà trường bật.' },
  pl_err:     { en:'Could not load Class Pulse. Check your connection and try again.', vi:'Không tải được Nhịp lớp học. Hãy kiểm tra kết nối và thử lại.' },
  pl_note:    { en:'Reported by the children’s apps, so it is a guide, not a grade. Turning this on is saved on this device only.', vi:'Do ứng dụng của các bạn nhỏ ghi nhận, nên chỉ là tham khảo, không phải điểm số. Việc bật tính năng này chỉ được lưu trên thiết bị này.' },
  pl_aria:    { en:'{label}: {value}. Class typical {lo} to {hi}. {verdict}.', vi:'{label}: {value}. Lớp thường {lo} đến {hi}. {verdict}.' },

  // ---- Attendance (v0.15.0) ----
  w_attend:   { en:'Attendance', vi:'Điểm danh' },
  w_scrapbook:{ en:'Scrapbook', vi:'Sổ lưu niệm' },
  at_present: { en:'Present', vi:'Có mặt' },
  at_late:    { en:'Late', vi:'Đi trễ' },
  at_absent:  { en:'Absent', vi:'Vắng' },
  at_unknown: { en:'Recorded', vi:'Đã ghi nhận' },
  at_none:    { en:'Not recorded', vi:'Chưa ghi nhận' },
  at_prev:    { en:'Previous month', vi:'Tháng trước' },
  at_next:    { en:'Next month', vi:'Tháng sau' },
  at_month:   { en:'This month', vi:'Tháng này' },
  at_total:   { en:'Absences recorded since {date}: {n}', vi:'Số buổi vắng đã ghi nhận từ {date}: {n}' },
  at_total_0: { en:'No absences recorded since {date}.', vi:'Chưa ghi nhận buổi vắng nào từ {date}.' },
  at_empty:   { en:'No attendance has been recorded for {name} yet.', vi:'Chưa có điểm danh nào được ghi nhận cho {name}.' },
  at_na:      { en:'Attendance is not shared with families yet. It will appear here once the school switches it on.', vi:'Điểm danh chưa được chia sẻ với phụ huynh. Dữ liệu sẽ hiện ở đây khi nhà trường bật.' },
  at_note:    { en:'Recorded by the teacher. A day with no mark means nothing was recorded, not that {name} was absent. Weekends are shaded.', vi:'Do giáo viên ghi nhận. Ngày không có dấu nghĩa là chưa có ghi nhận, không phải {name} vắng mặt. Cuối tuần được làm mờ.' },
  at_day_tip: { en:'{date}: {status}', vi:'{date}: {status}' },
  // v0.22.0 (backend v2.8.0): Scrapbook — approved Scrapdeck pages {name} shared with your family (Scrapdeck sharing, M3)
  sb_hint:    { en:'Pages {name} chose to share with your family from StudentDeck’s Scrapdeck, approved by the teacher.', vi:'Các trang {name} chọn chia sẻ với gia đình từ Scrapdeck trên StudentDeck, đã được giáo viên duyệt.' },
  sb_empty:   { en:'{name} hasn’t shared any scrapbook pages with your family yet.', vi:'{name} chưa chia sẻ trang sổ lưu niệm nào với gia đình.' },
  sb_close:   { en:'Close', vi:'Đóng' },
  sb_load_fail: { en:'Couldn’t open this picture right now.', vi:'Không mở được hình này.' }
};

const T1 = (() => {
  const DAY = 864e5;
  const parseKey = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 12); };
  const shiftKey = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const todayK = () => dayKey(Date.now());
  const lastKeys = n => Array.from({ length: n }, (_, i) => shiftKey(todayK(), -(n - 1 - i)));   // oldest first, ends today
  const toMs = v => !v ? 0 : v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : typeof v === 'number' ? v : (Date.parse(v) || 0);
  // Start (local midnight) of the 7-calendar-day window the digest and starters display, so the numbers always match the dates shown.
  const weekStartMs = () => { const d = parseKey(lastKeys(7)[0]); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const keyLabel = k => parseKey(k).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });
  const relDay = k => k === todayK() ? t('wk_today') : k === shiftKey(todayK(), 1) ? t('wk_tomorrow') : keyLabel(k);
  const isActive = r => !!(r && ((r.xp || 0) > 0 || (r.readMin || 0) > 0 || (r.readEntries || 0) > 0 || (r.focus || 0) > 0 || (r.hw || 0) > 0 || (r.games || 0) > 0 || (r.idioms || 0) > 0));
  const sumKeys = (daily, keys, f) => keys.reduce((a, k) => a + ((daily[k] && daily[k][f]) || 0), 0);
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const doneRec = (s, a) => (s.homeworkDone || {})[a.id];
  const isDone = (s, a) => !!(doneRec(s, a) && doneRec(s, a).done);

  // Streak as the existing Stats widget shows it: the synced streak is only as of the child's last visit, so it
  // counts as lapsed when the newest active day is older than yesterday. "Best" is the longest run in loaded history.
  function streakInfo(s) {
    const daily = s.practiceDaily || {}, yest = shiftKey(todayK(), -1);
    const days = Object.keys(daily).filter(k => isActive(daily[k])).sort();
    const newest = days[days.length - 1] || '';
    const current = newest >= yest ? ((s.practice && s.practice.streak) || 0) : 0;
    let best = 0, run = 0, prev = null;
    days.forEach(k => { run = prev && shiftKey(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
    return { current, best: Math.max(best, current), newest };
  }

  // Past-due items are only looked at over the last 28 days so one old forgotten tick doesn't haunt the dashboard.
  function hwStats(s) {
    const today = todayK(), end = shiftKey(today, 6), from = shiftKey(today, -27);
    let dueSoon = 0, overdue = 0;
    (s.homework || []).forEach(a => {
      if (!a.dueDate || isDone(s, a)) return;
      if (a.dueDate >= today && a.dueDate <= end) dueSoon++;
      else if (a.dueDate < today && a.dueDate >= from) overdue++;
    });
    return { dueSoon, overdue };
  }

  function completion(s) {
    const today = todayK(), from = shiftKey(today, -27);
    // Due-today-and-still-open is in progress, not missed, so it stays out of the count until it is ticked.
    const rows = (s.homework || []).filter(a => a.dueDate && a.dueDate >= from && a.dueDate <= today)
      .map(a => ({ a, rec: doneRec(s, a), done: isDone(s, a) })).filter(r => r.a.dueDate < today || r.done);
    const subj = {};
    rows.forEach(r => { const k = r.a.subject || ''; const o = subj[k] || (subj[k] = { done: 0, total: 0 }); o.total++; if (r.done) o.done++; });
    // On time vs late compares doneAt with the end of the due day. Marks flagged `backfilled` count as done but are
    // left out of on-time/late: StudentDeck wrote them after the fact, so their timestamp says nothing about timing.
    let onTime = 0, late = 0;
    rows.forEach(r => {
      if (!r.done || !r.rec || r.rec.backfilled) return;
      const ms = toMs(r.rec.doneAt); if (!ms) return;
      const dueEnd = parseKey(r.a.dueDate); dueEnd.setHours(23, 59, 59, 999);
      if (ms <= dueEnd.getTime()) onTime++; else late++;
    });
    const missing = (s.homework || []).filter(a => a.dueDate && a.dueDate < today && a.dueDate >= from && !isDone(s, a))
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, 8);
    return { total: rows.length, done: rows.filter(r => r.done).length, subj, onTime, late, missing };
  }

  // One body listener per render, removed on cleanup (body outlives every re-render).
  function listen(body, handler) {
    const ac = new AbortController();
    body.addEventListener('click', handler, { signal: ac.signal });
    return ac;
  }
  const subjectName = k => k || t('t1_no_subject');

  return { DAY, parseKey, shiftKey, todayK, lastKeys, weekStartMs, toMs, keyLabel, relDay, isActive, sumKeys, pct, doneRec, isDone, streakInfo, hwStats, completion, listen, subjectName };
})();

/* ============================================================
   1. Family Overview — one card per linked child
   ============================================================ */
function renderFamilyOverview(body) {
  if (!PD.getSession()) { body.innerHTML = emptyState(t('empty_signin')); return null; }
  const kids = PD.getLinkedChildren();
  if (!kids.length) { body.innerHTML = emptyState(t('empty_link_child')); return null; }
  const snaps = {}, unsubs = [];
  const ac = T1.listen(body, e => {
    const id = e.target.closest('[data-kid]')?.dataset.kid; if (!id) return;
    switchChild(id);
    panels.summary ? front(panels.summary.el) : openWidget('summary');
  });
  function draw() {
    // The ✉️ chip below is Notes Home: a COUNT of unread notes only — never their text.
    const cards = kids.map(k => {
      const s = snaps[k.studentId];
      if (!s) return `<div class="famcard"><b>${esc(k.displayName)}</b><span class="muted">${t('loading')}</span></div>`;
      const L = levelInfo((s.practice && s.practice.xpTotal) || 0), st = T1.streakInfo(s), hw = T1.hwStats(s);
      return `<button class="famcard${k.studentId === ui.currentChild ? ' on' : ''}" data-kid="${esc(k.studentId)}">
        <span class="famhead"><b>${esc(s.displayName)}</b><span class="muted">${esc(s.className)}</span></span>
        <span class="famlv"><b>Lv ${L.level}</b><span class="xpbar wide"><i style="width:${T1.pct(L.into, L.need)}%"></i></span><span class="muted">${esc(t('fam_pts', { n: s.points }))}</span></span>
        <span class="famrows">
          <span>🔥 ${esc(st.current ? t('fam_streak', { n: st.current }) : t('fam_no_streak'))}</span>
          <span>📘 ${esc(hw.dueSoon ? t('fam_due', { n: hw.dueSoon }) : t('fam_none_due'))}</span>
          ${hw.overdue ? `<span class="warn">⚠ ${esc(t('fam_overdue', { n: hw.overdue }))}</span>` : ''}
          <span>⭐ ${esc(t('fam_pts_week', { n: s.weekly.pointsEarned }))}</span>
          ${(s.badges || []).length ? `<span>🏅 ${esc(t('fam_badges', { n: s.badges.length, name: BC.clip(s.badges[0].name, 26) }))}</span>` : ''}
          ${(s.notes || []).some(n => !n.read) ? `<span class="warn">✉️ ${esc(t('fam_notes', { n: s.notes.filter(n => !n.read).length }))}</span>` : ''}
        </span>
        <span class="famopen">${esc(t('fam_open'))} ›</span>
      </button>`;
    }).join('');
    body.innerHTML = (kids.length < 2 ? `<p class="muted" style="margin-top:0">${esc(t('fam_hint_one'))}</p>` : '') + `<div class="famgrid">${cards}</div>`;
  }
  kids.forEach(k => unsubs.push(PD.subscribeChild(k.studentId, s => { snaps[k.studentId] = s; draw(); })));
  return () => { ac.abort(); unsubs.forEach(u => u()); };
}

/* ============================================================
   2. Week Ahead — next 7 days of homework + class events, with .ics export.
   Since v0.15.0 it is the second tab of the Calendar widget (renderCalendar in app.js), not a widget of its own:
   this file keeps the data (weekPlan), the .ics builder and the markup; the Calendar widget owns the subscription
   and the click handling.
   ============================================================ */
function weekPlan(s) {
  const keys = Array.from({ length: 7 }, (_, i) => T1.shiftKey(T1.todayK(), i));
  const set = new Set(keys), byDay = {}; keys.forEach(k => { byDay[k] = []; });
  const mirrored = new Set((s.homework || []).map(a => 'assign-' + a.id));   // TeachersDeck mirrors each due date into calendarEvents
  (s.homework || []).forEach(a => {
    if (set.has(a.dueDate)) byDay[a.dueDate].push({ kind: 'hw', id: a.id, title: a.title || '', subject: a.subject || '', time: a.dueTime || '', points: a.points || 0, instructions: a.instructions || '', done: T1.isDone(s, a) });
  });
  (s.calendar || []).forEach(e => {
    if (!set.has(e.date) || mirrored.has(e.id)) return;
    byDay[e.date].push({ kind: 'event', id: e.id, title: e.title || '', time: e.time || '', type: e.type || 'event' });
  });
  keys.forEach(k => byDay[k].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')));
  return { keys, byDay };
}
const icsEsc = x => String(x || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFold = line => { const out = []; let rest = line; while (rest.length > 60) { out.push(rest.slice(0, 60)); rest = ' ' + rest.slice(60); } out.push(rest); return out.join('\r\n'); };
function buildIcs(s, plan) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ParentDeck//Week Ahead//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const compact = k => k.replace(/-/g, '');
  plan.keys.forEach(day => plan.byDay[day].forEach(it => {
    L.push('BEGIN:VEVENT', `UID:${it.kind}-${s.classId || 'class'}-${it.id}@parentdeck`, `DTSTAMP:${stamp}`);
    const m = /^(\d{1,2}):(\d{2})/.exec(it.time || '');
    if (m) {
      const st = T1.parseKey(day); st.setHours(+m[1], +m[2], 0, 0);
      const en = new Date(st.getTime() + 36e5);
      const f = d => `${compact(dayKey(d))}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
      L.push(`DTSTART:${f(st)}`, `DTEND:${f(en)}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${compact(day)}`, `DTEND;VALUE=DATE:${compact(T1.shiftKey(day, 1))}`);
    }
    const summary = it.kind === 'hw' ? `${it.subject ? '[' + it.subject + '] ' : ''}${it.title} (${STRINGS.wk_due.en})` : it.title;
    const desc = [s.displayName, s.className, it.instructions].filter(Boolean).join(' · ');
    L.push(`SUMMARY:${icsEsc(summary)}`, `DESCRIPTION:${icsEsc(desc)}`, 'END:VEVENT');
  }));
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
// "Nguyễn Văn An" -> "nguyen-van-an" (strip diacritics first; \W alone would eat every accented letter)
const slug = x => String(x || 'child').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'child';
function downloadText(name, text, mime) {
  const url = URL.createObjectURL(new Blob([(window.Watermark ? Watermark.stamp(text) : text)], { type: mime }));   // v0.21.5: watermarked (js/watermark.js)
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function weekAheadMarkup(s) {
  const plan = weekPlan(s), any = plan.keys.some(k => plan.byDay[k].length);
      const rows = plan.keys.filter(k => plan.byDay[k].length).map(k => `<h4>${esc(T1.relDay(k))}</h4>` + plan.byDay[k].map(it => it.kind === 'hw'
        ? `<div class="srow"><span><b>${esc((it.subject ? `[${it.subject}] ` : '') + it.title)}</b>${it.time ? ` <span class="muted">${esc(t('wk_due'))} ${esc(it.time)}</span>` : ''}${it.points ? ` <span class="muted">· ${esc(t('hw_points', { n: it.points }))}</span>` : ''}</span><span class="pill ${it.done ? 'ok' : 'warn'}">${it.done ? '✓ ' + esc(t('wk_done')) : esc(t('wk_notmarked'))}</span></div>`
        : `<div class="srow"><span>${esc(it.title)}${it.time ? ` <span class="muted">${esc(it.time)}</span>` : ''}</span><span class="pill">${esc(t('wk_event'))}</span></div>`).join('')).join('');
      return `<div class="row" style="justify-content:space-between;margin-top:0"><span class="muted">${esc(s.className)} · ${esc(t('wk_range'))}</span>${any ? `<button class="btn" data-act="ics">${esc(t('wk_export'))}</button>` : ''}</div>`
        + (any ? rows + `<p class="muted" style="margin-top:12px">${esc(t('wk_ics_note'))}</p>` : emptyState(t('wk_nothing')));
}

/* ============================================================
   3. Homework Completion — four-week rate, by subject, past-due not marked
   ============================================================ */
function renderHomeworkCompletion(body) {
  return widgetGate(body, id => PD.subscribeChild(id, s => {
    if (!s) return;
    const c = T1.completion(s), rate = T1.pct(c.done, c.total);
    if (!c.total) { body.innerHTML = emptyState(t('hwc_none')); return; }
    const subj = Object.keys(c.subj).sort((a, b) => c.subj[b].total - c.subj[a].total).map(k => {
      const o = c.subj[k]; return `<div class="hbar"><span>${esc(T1.subjectName(k))}</span><div class="track"><i style="width:${T1.pct(o.done, o.total)}%"></i></div><b>${o.done}/${o.total}</b></div>`;
    }).join('');
    body.innerHTML = `
      <div class="lvl"><div class="big">${rate}%</div><div style="flex:1"><div class="muted">${esc(t('hwc_rate'))}</div><div class="xpbar wide"><i style="width:${rate}%"></i></div><div class="muted">${esc(t('hwc_of', { done: c.done, total: c.total }))}${c.onTime + c.late ? ` · ${esc(t('hwc_ontime', { n: c.onTime }))} · ${esc(t('hwc_late', { n: c.late }))}` : ''}</div></div></div>
      <h4>${esc(t('hwc_by_subject'))}</h4>${subj}
      <h4>${esc(t('hwc_missing'))}</h4>
      ${c.missing.length ? c.missing.map(a => `<div class="srow"><span>${esc((a.subject ? `[${a.subject}] ` : '') + (a.title || ''))}</span><span class="muted">${esc(T1.keyLabel(a.dueDate))}</span></div>`).join('') : `<p class="muted">${esc(t('hwc_clear'))}</p>`}
      <p class="muted" style="margin-top:12px">${esc(t('hwc_note', { name: s.displayName }))}</p>`;
  }));
}

/* ============================================================
   4. Rewards Wishlist — class catalog, points still needed, a pinned goal, recent redemptions
   ============================================================ */
function renderRewardsWishlist(body) {
  return widgetGate(body, id => {
    let latest = null;
    const ac = T1.listen(body, e => {
      if (e.target.closest('[data-kdsnap]')) {
        if (!latest) return;
        const pinId = (ui.wishlist || {})[id], wishGoal = pinId ? (latest.rewards || []).find(r => r.id === pinId) : null;
        KeepDeckRender.save('rewardsSummary', id, latest, { points: latest.points, pointsLog: latest.pointsLog, wishGoal })
          .then(() => toast(t('kd_saved_scrap'))).catch(() => toast(t('kd_snapshot_fail')));
        return;
      }
      const b = e.target.closest('[data-pin]'); if (!b) return;
      ui.wishlist = ui.wishlist || {};
      if (ui.wishlist[id] === b.dataset.pin) delete ui.wishlist[id]; else ui.wishlist[id] = b.dataset.pin;
      saveUI(); if (latest) draw(latest);
    });
    const unsub = PD.subscribeChild(id, s => { if (!s) return; latest = s; draw(s); });
    function draw(s) {
      const rewards = (s.rewards || []).filter(r => r.active !== false).sort((a, b) => (a.cost || 0) - (b.cost || 0));
      const pinId = (ui.wishlist || {})[id], pinned = rewards.find(r => r.id === pinId);
      const bar = r => { const need = r.cost || 0, p = need ? Math.min(100, Math.round(s.points / need * 100)) : 100; return `<div class="xpbar wide"><i style="width:${p}%"></i></div>`; };
      const status = r => s.points >= (r.cost || 0) ? `<span class="pill ok">${esc(t('wl_ready'))}</span>` : `<span class="pill">${esc(t('wl_togo', { n: (r.cost || 0) - s.points }))}</span>`;
      const redeemed = (s.pointsLog || []).filter(p => p.from === 'Redeemed').slice(0, 5);
      body.innerHTML = `
        <p class="muted" style="margin-top:0">${esc(t('wl_balance', { name: s.displayName, n: s.points }))}</p>
        ${pinned ? `<div class="wishgoal"><span class="muted">${esc(t('wl_goal'))}</span> <b>${esc(pinned.name)}</b> ${status(pinned)}${bar(pinned)}</div>` : ''}
        ${rewards.length ? rewards.map(r => `
          <div class="wishrow">
            <div class="wishmain"><b>${esc(r.name)}</b><span class="muted">${esc(t('hw_points', { n: r.cost || 0 }))}</span>${r.description ? `<span class="muted wishdesc">${esc(r.description)}</span>` : ''}</div>
            ${bar(r)}
            <div class="wishfoot">${status(r)}<button class="btn pinbtn" data-pin="${esc(r.id)}">${r.id === pinId ? '★ ' + esc(t('wl_unpin')) : '☆ ' + esc(t('wl_pin'))}</button></div>
          </div>`).join('') : emptyState(t('wl_none'))}
        <h4>${esc(t('wl_redeemed'))}</h4>
        ${redeemed.length ? redeemed.map(p => `<div class="srow"><span>${esc(fmtDate(p.t))} · ${esc(p.reason || '')}</span><b>${p.amount}</b></div>`).join('') : `<p class="muted">${esc(t('wl_no_redeemed'))}</p>`}
        <button type="button" class="btn sm" data-kdsnap="1">${esc(t('kd_snapshot'))}</button>
        <p class="muted" style="margin-top:12px">${esc(t('wl_note', { name: s.displayName }))}</p>`;
    }
    return () => { ac.abort(); unsub(); };
  });
}

/* ============================================================
   5. Goals & Streaks — 28-day activity calendar, streaks, parent-set weekly goals.
   Since v0.18.0 this is a section of Student Summary (between Reward Points and Class Ranking), not a widget of its own:
   renderGoalsBody mounts into that sub-panel and Summary's own gate covers the child.
   ============================================================ */
const GOAL_FIELDS = [['readMin', 'gs_read'], ['focus', 'gs_focus'], ['hw', 'gs_hw']];
function ringHtml(val, goal, label) {
  const p = Math.max(0, Math.min(1, goal ? val / goal : 0)), C = 113.1;
  return `<div class="ring${p >= 1 ? ' full' : ''}"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="rbg" cx="22" cy="22" r="18"/><circle class="rfg" cx="22" cy="22" r="18" stroke-dasharray="${(p * C).toFixed(1)} ${C}" transform="rotate(-90 22 22)"/></svg><b>${val}</b><span>/ ${goal}</span><em>${esc(label)}</em></div>`;
}
function renderGoalsBody(body, id) {
  {
    let latest = null, editing = false, first = true;
    const ac = T1.listen(body, e => {
      if (e.target.closest('[data-act="edit"]')) { editing = !editing; if (latest) draw(latest, false); }
    });
    body.addEventListener('change', e => {
      const f = e.target.dataset.goal; if (!f) return;
      ui.goals = ui.goals || {}; (ui.goals[id] = ui.goals[id] || {})[f] = clamp(parseInt(e.target.value, 10) || 0, 0, 9999);
      saveUI();
    }, { signal: ac.signal });
    const unsub = PD.subscribeChild(id, s => { if (!s) return; latest = s; draw(s, true); });
    function draw(s, firstDraw) {
      const play = firstDraw && first && !reduceMotion() && !!body.closest('.sm-anim'); if (firstDraw) first = false;   // v0.18.0: same motion rules as the rest of Summary
      const daily = s.practiceDaily || {}, today = T1.todayK(), st = T1.streakInfo(s);
      const cells = T1.lastKeys(28).map((k, i) => {
        const r = daily[k], on = T1.isActive(r);
        const tip = t('gs_day_tip', { date: T1.keyLabel(k), read: (r && r.readMin) || 0, focus: (r && r.focus) || 0 });
        return `<span class="gday${on ? ' on' : ''}${k === today ? ' today' : ''}" style="--i:${i};--d:${((i * 37) % 23) / 10}s" title="${esc(tip)}">${T1.parseKey(k).getDate()}</span>`;
      }).join('');
      let last;
      if (!st.newest) last = t('gs_never');
      else { const n = Math.round((T1.parseKey(today) - T1.parseKey(st.newest)) / T1.DAY); last = n <= 0 ? t('gs_today') : n === 1 ? t('gs_yesterday') : t('gs_days_ago', { n }); }
      // Monday-first week up to today
      const dow = (T1.parseKey(today).getDay() + 6) % 7, wk = Array.from({ length: dow + 1 }, (_, i) => T1.shiftKey(today, i - dow));
      const goals = (ui.goals || {})[id] || {};
      const rings = GOAL_FIELDS.filter(([f]) => goals[f] > 0).map(([f, lk]) => ringHtml(T1.sumKeys(daily, wk, f), goals[f], t(lk))).join('');
      setHtml(body, `
        <div class="tiles tiles3">
          <div class="tile" style="--i:0"><b><span class="flame">🔥</span> ${cnt(st.current, st.current === 1 ? 'day_count' : 'days_count')}</b><span>${esc(t('gs_streak'))}</span></div>
          <div class="tile" style="--i:1"><b>${cnt(st.best, st.best === 1 ? 'day_count' : 'days_count')}</b><span>${esc(t('gs_best'))}</span></div>
          <div class="tile" style="--i:2"><b>${esc(last)}</b><span>${esc(t('gs_last'))}</span></div>
        </div>
        <h4>${esc(t('gs_cal'))}</h4><div class="gcal">${cells}</div>
        <div class="row" style="justify-content:space-between;margin-bottom:0"><h4 style="margin:6px 0">${esc(t('gs_goals'))}</h4><button class="btn" data-act="edit">${esc(editing ? t('gs_done_edit') : t('gs_set'))}</button></div>
        ${editing ? `<div class="goaledit">${GOAL_FIELDS.map(([f, lk]) => `<label><span>${esc(t(lk))}</span><input type="number" class="numin" min="0" max="9999" data-goal="${f}" value="${goals[f] || 0}"></label>`).join('')}</div><p class="muted">${esc(t('gs_dev'))}</p>`
          : (rings ? `<div class="rings">${rings}</div><p class="muted">${esc(t('gs_dev'))}</p>` : `<p class="muted">${esc(t('gs_unset'))}</p>`)}
        <p class="muted" style="margin-top:10px">${esc(t('t1_reported', { name: s.displayName }))}</p>`, play);
      if (play) setTimeout(() => { if (body.isConnected) body.querySelectorAll('.ring.full svg').forEach((el, n) => setTimeout(() => burstAt(body, el, 9), n * 220)); }, 1100);   // v0.20.0: a goal you have met sparkles
    }
    return () => { ac.abort(); unsub(); };
  }
}

/* ============================================================
   6. Conversation Starters — three prompts from the week's real activity (fixed templates, no AI)
   ============================================================ */
function startersFor(s, seed) {
  const name = s.displayName, daily = s.practiceDaily || {}, keys = T1.lastKeys(7), today = T1.todayK(), weekAgo = T1.weekStartMs();
  const c = [];
  const read = T1.sumKeys(daily, keys, 'readMin'); if (read > 0) c.push(['st_read', { name, n: read }]);
  const nextHw = (s.homework || []).filter(a => a.dueDate && a.dueDate >= today && !T1.isDone(s, a)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (nextHw) {
    const when = nextHw.dueDate === today ? t('st_when_today') : nextHw.dueDate === T1.shiftKey(today, 1) ? t('st_when_tomorrow') : t('st_when_on', { date: T1.keyLabel(nextHw.dueDate) });
    c.push(['st_hw_next', { title: nextHw.title || nextHw.subject || '', when }]);
  }
  const doneN = Object.values(s.homeworkDone || {}).filter(r => r.done && !r.backfilled && T1.toMs(r.doneAt) > weekAgo).length;
  if (doneN > 0) c.push(['st_hw_done', { name, n: doneN }]);
  const game = Object.values((s.practice && s.practice.gameScores) || {}).filter(g => g && g.best !== null && g.best !== undefined).sort((a, b) => (b.plays || 0) - (a.plays || 0))[0];
  if (game) c.push(['st_game', { name, game: game.name || '', best: game.best, label: game.label ? ' ' + game.label : '' }]);
  const focus = T1.sumKeys(daily, keys, 'focus'); if (focus > 0) c.push(['st_focus', { name, n: focus }]);
  const streak = T1.streakInfo(s).current; if (streak >= 3) c.push(['st_streak', { name, n: streak }]);
  const idioms = T1.sumKeys(daily, keys, 'idioms'); if (idioms > 0) c.push(['st_idiom', { name, n: idioms }]);
  const award = (s.pointsLog || []).find(p => p.from === 'Teacher' && p.amount > 0 && p.reason && p.t > weekAgo);
  if (award) c.push(['st_points', { name, n: award.amount, reason: award.reason }]);
  c.push(['st_g1', { name }], ['st_g2', { name }], ['st_g3', { name }]);
  const start = (seed * 3) % c.length;
  return [0, 1, 2].map(i => c[(start + i) % c.length]);
}
function renderConversationStarters(body) {
  return widgetGate(body, id => {
    let latest = null, seed = 0;
    const ac = T1.listen(body, e => { if (e.target.closest('[data-act="next"]') && latest) { seed++; draw(latest); } });
    const unsub = PD.subscribeChild(id, s => { if (!s) return; latest = s; draw(s); });
    function draw(s) {
      body.innerHTML = `<ul class="starters">${startersFor(s, seed).map(([k, v]) => `<li>${esc(t(k, v))}</li>`).join('')}</ul>
        <div class="row"><button class="btn" data-act="next">${esc(t('st_next'))}</button></div>
        <p class="muted">${esc(t('st_note'))}</p>`;
    }
    return () => { ac.abort(); unsub(); };
  });
}

/* ============================================================
   7. Weekly Digest — one-screen report; Copy for Zalo (bilingual) or Print
   ============================================================ */
function digestData(s) {
  const keys = T1.lastKeys(7), daily = s.practiceDaily || {}, weekAgo = T1.weekStartMs();
  const log = (s.pointsLog || []).filter(p => p.t >= weekAgo);
  const docs = Object.values(s.homeworkDone || {});
  return {
    from: keys[0], to: keys[6],
    earned: log.filter(p => p.amount > 0).reduce((a, p) => a + p.amount, 0),
    spent: log.filter(p => p.amount < 0).reduce((a, p) => a - p.amount, 0),
    balance: s.points,
    hw: docs.length ? docs.filter(r => r.done && !r.backfilled && T1.toMs(r.doneAt) > weekAgo).length : T1.sumKeys(daily, keys, 'hw'),
    read: T1.sumKeys(daily, keys, 'readMin'), focus: T1.sumKeys(daily, keys, 'focus'), games: T1.sumKeys(daily, keys, 'games'),
    streak: T1.streakInfo(s).current, level: levelInfo((s.practice && s.practice.xpTotal) || 0).level
  };
}
const DIGEST_ROWS = [['dg_earned', 'earned'], ['dg_spent', 'spent'], ['dg_balance', 'balance'], ['dg_hw', 'hw'], ['dg_read', 'read'], ['dg_focus', 'focus'], ['dg_games', 'games'], ['dg_streak', 'streak'], ['dg_level', 'level']];
function rankText(rank, lang) {
  const f = k => (STRINGS[k][lang] || STRINGS[k].en);
  return f('dg_rank_of').replace('{pos}', rank.pos).replace('{total}', rank.total);
}
function digestText(s, rank) {
  const d = digestData(s), both = k => `${STRINGS[k].en} / ${STRINGS[k].vi}`;
  const lines = [`${both('dg_title')}`, `${s.displayName}${s.className ? ' · ' + s.className : ''}`, `${d.from} → ${d.to}`, ''];
  DIGEST_ROWS.forEach(([lk, f]) => lines.push(`• ${both(lk)}: ${d[f]}`));
  if (rank && rank.pos) lines.push(`• ${both('dg_rank')}: ${rankText(rank, 'en')} / ${rankText(rank, 'vi')}`);
  return lines.join('\n');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (err) {} ta.remove(); return ok;
  }
}
async function fetchRank(id, s) {
  try {
    const res = await PD.getRanking(id);
    if (res.visibility !== 'full') return { hidden: true };
    const me = (res.rows || []).find(r => r.displayName === s.displayName);
    return me ? { pos: me.rank, total: res.rows.length } : { hidden: true };
  } catch (e) { return { hidden: true }; }
}
window.addEventListener('afterprint', () => {
  document.body.classList.remove('print-digest');
  document.querySelectorAll('.print-target').forEach(el => el.classList.remove('print-target'));
});
function renderWeeklyDigest(body) {
  return widgetGate(body, id => {
    let latest = null, withRank = false, rank = null;
    const ac = T1.listen(body, async e => {
      if (!latest) return;
      if (e.target.closest('[data-act="copy"]')) toast(await copyText(digestText(latest, withRank && rank)) ? t('dg_copied') : t('dg_copy_fail'), 3200);
      else if (e.target.closest('[data-act="print"]')) {
        document.body.classList.add('print-digest'); body.closest('.widget').classList.add('print-target');
        setTimeout(() => window.print(), 50);
      } else if (e.target.closest('[data-kdsnap]')) {
        const d = digestData(latest);
        KeepDeckRender.save('digest', id, latest, { t: Date.now(), lines: DIGEST_ROWS.map(([lk, f]) => t(lk) + ': ' + d[f]) })
          .then(() => toast(t('kd_saved_scrap'))).catch(() => toast(t('kd_snapshot_fail')));
      }
    });
    body.addEventListener('change', async e => {
      if (e.target.id !== 'dg-rank' || !latest) return;
      withRank = e.target.checked;
      if (withRank && !rank) rank = await fetchRank(id, latest);
      draw(latest);
    }, { signal: ac.signal });
    const unsub = PD.subscribeChild(id, s => { if (!s) return; latest = s; draw(s); });
    function draw(s) {
      const d = digestData(s);
      body.innerHTML = `
        <div class="digest">
          <div class="dghead"><b>${esc(t('dg_title'))}</b><span>${esc(s.displayName)}${s.className ? ' · ' + esc(s.className) : ''}</span><span class="muted">${esc(T1.keyLabel(d.from))} – ${esc(T1.keyLabel(d.to))}</span></div>
          ${DIGEST_ROWS.map(([lk, f]) => `<div class="srow"><span>${esc(t(lk))}</span><b>${d[f]}</b></div>`).join('')}
          ${withRank && rank && rank.pos ? `<div class="srow"><span>${esc(t('dg_rank'))}</span><b>${esc(rankText(rank, ui.lang))}</b></div>` : ''}
          <p class="muted" style="margin:8px 0 0">${esc(t('dg_foot', { name: s.displayName }))}</p>
        </div>
        <label class="row nochrome"><input type="checkbox" id="dg-rank" ${withRank ? 'checked' : ''}> <span>${esc(t('dg_rank_opt'))}</span></label>
        ${withRank && rank && rank.hidden ? `<p class="muted">${esc(t('dg_rank_hidden'))}</p>` : ''}
        <div class="row nochrome"><button class="btn primary" data-act="copy">${esc(t('dg_copy'))}</button><button class="btn" data-act="print">${esc(t('dg_print'))}</button><button type="button" class="btn sm" data-kdsnap="1">${esc(t('kd_snapshot'))}</button></div>`;
    }
    return () => { ac.abort(); unsub(); };
  });
}

/* ============================================================
   8. Progress Reports — what TeachersDeck's Progress Reports widget sends for this child (v0.9.2)
   Each report collapses to one line (date · frequency · score); tap to expand Skills / Things to improve /
   Strengths / Next learning focus. Read-only.
   ============================================================ */
function renderProgressReports(body) {
  return widgetGate(body, id => {
    let latest = undefined; const open = new Set();
    const ac = T1.listen(body, e => {
      const snap = e.target.closest('[data-kdsnap]');
      if (snap) {
        const r = latest && (latest.progressReports || []).find(x => x.id === snap.dataset.kdsnap); if (!r) return;
        const lines = [line(r)].concat(sectLines('pr_skills', r.skills), sectLines('pr_improve', r.improve), sectLines('pr_strengths', r.strengths), sectLines('pr_next', r.nextFocus));
        KeepDeckRender.save('report', id, latest, { t: r.t, lines }).then(() => toast(t('kd_saved_scrap'))).catch(() => toast(t('kd_snapshot_fail')));
        return;
      }
      const row = e.target.closest('[data-rid]'); if (!row || !latest) return;
      const rid = row.dataset.rid; open.has(rid) ? open.delete(rid) : open.add(rid); draw();
    });
    const line = r => [r.t ? fmtDate(r.t) : '', freqLabel(r.frequency), r.score != null ? `${t('pr_score')} ${r.score}` : ''].filter(Boolean).join(' · ');
    const sectLines = (key, items) => (items && items.length) ? [t(key) + ':'].concat(items.map(x => '• ' + x)) : [];
    const freqLabel = f => { const k = 'pr_freq_' + String(f).toLowerCase(); return STRINGS[k] ? t(k) : (f ? f.charAt(0).toUpperCase() + f.slice(1) : ''); };
    const sect = (key, items) => items.length ? `<h4>${esc(t(key))}</h4><ul class="prlist">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    function draw() {
      if (latest === undefined) return;
      if (latest === null) { body.innerHTML = emptyState(t('empty_signin')); return; }
      const s = latest, reps = s.progressReports || [], sc = body.closest('.body'), top = sc ? sc.scrollTop : 0;
      if (!reps.length) { body.innerHTML = emptyState(t('pr_empty', { name: s.displayName })); return; }
      body.innerHTML = `<p class="muted" style="margin:0 0 8px">${esc(t('pr_count', { n: reps.length, name: s.displayName }))}</p>` + reps.map(r => {
        const isOpen = open.has(r.id), lineText = line(r);
        const detail = sect('pr_skills', r.skills) + sect('pr_improve', r.improve) + sect('pr_strengths', r.strengths) + sect('pr_next', r.nextFocus);
        return `<div class="prrep${isOpen ? ' on' : ''}"><button class="prline" data-rid="${esc(r.id)}" aria-expanded="${isOpen}"><span>${esc(lineText || r.id)}</span><b>${isOpen ? '▾' : '▸'}</b></button>${isOpen ? `<div class="prbody">${detail || `<p class="muted">${esc(t('pr_nodetail'))}</p>`}<button type="button" class="btn sm" data-kdsnap="${esc(r.id)}">${esc(t('kd_snapshot'))}</button></div>` : ''}</div>`;
      }).join('');
      if (sc) sc.scrollTop = top;
    }
    // Subscribe last: subscribeChild calls back synchronously when data is cached, and draw() needs the helpers above.
    const unsub = PD.subscribeChild(id, s => { latest = s || null; draw(); });
    return () => { ac.abort(); unsub(); };
  });
}


/* ============================================================
   9. Class Pulse — the child's week beside an anonymous class range (v0.15.0)
   The numbers beside the child's own come from the getClassPulse Cloud Function, which totals the class on the server and
   returns ranges only. This widget never reads another child's data, never shows a name or a rank, and does not call the
   function at all until the parent turns Class Pulse on for that child (the choice is kept on this device: ui.pulseOn).
   The child's own side is worked out here from their own snapshot, over the same 7 calendar days the Digest uses.
   ============================================================ */
const PULSE_TTL = 5 * 60 * 1000, pulseCache = {};   // studentId -> { at, data }: re-opening the widget must not hit the function every time
const PULSE_ROWS = [
  { f: 'readMin', label: 'pl_read',  unit: 'pl_val_min' },
  { f: 'focus',   label: 'pl_focus', unit: 'pl_val_n' },
  { f: 'hwPct',   label: 'pl_hw',    unit: 'pl_val_pct' }
];
// The child's own week, on the same three measures the server ranges describe. hwPct is null when nothing was due.
function pulseMine(s) {
  const keys = T1.lastKeys(7), daily = s.practiceDaily || {}, from = keys[0], to = keys[6];
  const due = (s.homework || []).filter(a => a.dueDate && a.dueDate >= from && a.dueDate <= to);
  return { readMin: T1.sumKeys(daily, keys, 'readMin'), focus: T1.sumKeys(daily, keys, 'focus'), hwPct: due.length ? T1.pct(due.filter(a => T1.isDone(s, a)).length, due.length) : null, from, to };
}
function pulseRowHtml(row, mine, rng) {
  const v = mine[row.f];
  if (v == null) return `<div class="pulse-row"><div class="pulse-top"><b>${esc(t(row.label))}</b></div><p class="muted" style="margin:2px 0 0">${esc(t('pl_nohw'))}</p></div>`;
  const max = Math.max(rng.high * 1.25, v * 1.1, 1), pos = x => Math.min(100, Math.max(0, x / max * 100));
  const verdictKey = v < rng.low ? 'pl_below' : v > rng.high ? 'pl_above' : 'pl_within';
  const fmt = n => t(row.unit, { n });
  const typical = t('pl_typical', { lo: fmt(rng.low), hi: fmt(rng.high) });
  const aria = t('pl_aria', { label: t(row.label), value: fmt(v), lo: fmt(rng.low), hi: fmt(rng.high), verdict: t(verdictKey) });
  return `<div class="pulse-row">
    <div class="pulse-top"><b>${esc(t(row.label))}</b><span class="pulse-val">${esc(fmt(v))}</span></div>
    <div class="pulse-bar" role="img" aria-label="${esc(aria)}">
      <i class="pulse-band" style="left:${pos(rng.low).toFixed(1)}%;width:${Math.max(1.5, pos(rng.high) - pos(rng.low)).toFixed(1)}%"></i>
      <i class="pulse-me ${verdictKey === 'pl_within' ? 'in' : ''}" style="left:${pos(v).toFixed(1)}%"></i>
    </div>
    <div class="pulse-sub"><span class="muted">${esc(typical)}</span><span class="pulse-verdict ${verdictKey}">${esc(t(verdictKey))}</span></div>
  </div>`;
}
function renderClassPulse(body) {
  return widgetGate(body, id => {
    let latest = null, alive = true, pulse = null, loading = false, failed = false;
    ui.pulseOn = ui.pulseOn || {};
    const on = () => !!ui.pulseOn[id];
    async function load(force) {
      if (!on() || loading) return;
      const hit = pulseCache[id];
      if (!force && hit && Date.now() - hit.at < PULSE_TTL) { pulse = hit.data; failed = false; draw(); return; }
      loading = true; failed = false; draw();
      try { pulse = await PD.getClassPulse(id); pulseCache[id] = { at: Date.now(), data: pulse }; }
      catch (e) { failed = true; if (window.console) console.warn('[ParentDeck] getClassPulse failed', e && (e.code || e.message)); }
      loading = false; if (alive) draw();
    }
    const ac = T1.listen(body, e => {
      const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
      if (act === 'on') { ui.pulseOn[id] = true; saveUI(); load(); }
      else if (act === 'off') { ui.pulseOn[id] = false; saveUI(); pulse = null; failed = false; delete pulseCache[id]; draw(); }
      else if (act === 'refresh' || act === 'retry') load(true);
    });
    function draw() {
      if (!alive || !latest) return;
      const s = latest, name = s.displayName;
      if (!on()) {
        body.innerHTML = `<div class="pulse-intro"><h4 style="margin-top:0">${esc(t('pl_intro_h'))}</h4><p>${esc(t('pl_intro', { name }))}</p>
          <div class="row nochrome"><button class="btn primary" data-act="on">${esc(t('pl_on'))}</button></div></div>
          <p class="muted">${esc(t('pl_note'))}</p>`;
        return;
      }
      let main;
      if (loading) main = `<p class="muted" style="text-align:center;margin:24px 0">${esc(t('pl_loading'))}</p>`;
      else if (failed) main = `<p class="muted" style="margin:16px 0">${esc(t('pl_err'))}</p><div class="row nochrome"><button class="btn" data-act="retry">${esc(t('pl_retry'))}</button></div>`;
      else if (!pulse) main = '';
      else if (!pulse.available) main = `<p class="muted" style="margin:16px 0">${esc(t(pulse.reason === 'class-too-small' ? 'pl_na_small' : pulse.reason === 'teacher-off' ? 'pl_na_off' : 'pl_na_ready'))}</p>`;
      else {
        const mine = pulseMine(s);
        const wk = t('pl_week', { from: T1.keyLabel(pulse.weekFrom || mine.from), to: T1.keyLabel(pulse.weekTo || mine.to) });
        main = `<p class="muted" style="margin:0 0 6px">${esc(s.displayName)} · ${esc(wk)}</p>` +
          PULSE_ROWS.filter(r => pulse.ranges[r.f]).map(r => pulseRowHtml(r, mine, pulse.ranges[r.f])).join('');
      }
      body.innerHTML = `${main}
        <div class="row nochrome" style="justify-content:space-between;margin-top:10px"><button class="btn" data-act="refresh">${esc(t('pl_refresh'))}</button><button class="btn" data-act="off">${esc(t('pl_off'))}</button></div>
        <p class="muted">${esc(t('pl_note'))}</p>`;
    }
    const unsub = PD.subscribeChild(id, s => { if (!s) return; const first = !latest; latest = s; if (first) { draw(); load(); } else if (!loading) draw(); });
    return () => { alive = false; ac.abort(); unsub(); };
  });
}

/* ============================================================
   10. Attendance — a month calendar of present / late / absent days (v0.15.0)
   Reads students/{id}/attendance/{date} (one document per child per day, status only) through PD's snapshot. That path is
   per child, so the isGuardianOf rule covers it; the class-wide classes/{id}/attendance/{date} document must never be read
   here. Until TeachersDeck syncs attendance and the rule is deployed, the snapshot says `available: false` and the widget
   says "not shared yet" instead of showing an empty, reassuring calendar. A weekday with no record is "not recorded",
   never "absent". Colour is never the only signal: every status also has its own mark.
   ============================================================ */
const ATT_STATUS = { present: { cls: 'ok', mark: '✓', key: 'at_present' }, late: { cls: 'late', mark: '◷', key: 'at_late' }, absent: { cls: 'abs', mark: '✕', key: 'at_absent' } };
function attendanceMonth(days, y, m) {
  const pad = n => String(n).padStart(2, '0'), prefix = `${y}-${pad(m + 1)}-`, n = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, cells = [], count = { present: 0, late: 0, absent: 0 };   // Monday-first
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= n; d++) {
    const key = prefix + pad(d), rec = days[key], wd = new Date(y, m, d).getDay();
    if (rec && count[rec.status] != null) count[rec.status]++;
    cells.push({ d, key, status: rec ? rec.status : '', weekend: wd === 0 || wd === 6, future: key > T1.todayK() });
  }
  return { cells, count };
}
function renderAttendance(body) {
  return widgetGate(body, id => {
    const now = new Date(); let latest = null, view = { y: now.getFullYear(), m: now.getMonth() };
    const ac = T1.listen(body, e => {
      const nav = e.target.closest('[data-nav]')?.dataset.nav; if (!nav || !latest) return;
      if (nav === 'today') view = { y: now.getFullYear(), m: now.getMonth() };
      else { const d = new Date(view.y, view.m + (nav === 'next' ? 1 : -1), 1); view = { y: d.getFullYear(), m: d.getMonth() }; }
      draw();
    });
    function draw() {
      if (!latest) return;
      const s = latest, att = s.attendance || { available: null, days: {} }, name = s.displayName;
      if (att.available === null) { body.innerHTML = emptyState(t('loading')); return; }
      if (att.available === false) { body.innerHTML = emptyState(t('at_na')); return; }
      const keys = Object.keys(att.days).sort();
      if (!keys.length) { body.innerHTML = emptyState(t('at_empty', { name })); return; }
      const first = keys[0], fy = +first.slice(0, 4), fm = +first.slice(5, 7) - 1;
      const atStart = view.y * 12 + view.m <= fy * 12 + fm, atEnd = view.y * 12 + view.m >= now.getFullYear() * 12 + now.getMonth();
      const mo = attendanceMonth(att.days, view.y, view.m);
      const absences = keys.filter(k => att.days[k].status === 'absent').length, since = T1.keyLabel(first);
      const head = [...Array(7)].map((_, i) => `<span class="att-h">${esc(new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'narrow' }))}</span>`).join('');
      const grid = mo.cells.map(c => {
        if (!c) return '<span></span>';
        const st = ATT_STATUS[c.status], label = st ? t(st.key) : c.status ? t('at_unknown') : t('at_none');
        const tip = t('at_day_tip', { date: T1.keyLabel(c.key), status: label });
        return `<span class="att-day${st ? ' ' + st.cls : c.status ? ' other' : ''}${c.weekend ? ' wknd' : ''}${c.future ? ' fut' : ''}${c.key === T1.todayK() ? ' today' : ''}" title="${esc(tip)}" aria-label="${esc(tip)}"><i>${c.d}</i><b aria-hidden="true">${st ? st.mark : ''}</b></span>`;
      }).join('');
      body.innerHTML = `
        <div class="att-nav"><button class="btn" data-nav="prev" aria-label="${esc(t('at_prev'))}" ${atStart ? 'disabled' : ''}>‹</button>
          <b>${esc(new Date(view.y, view.m, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }))}</b>
          <button class="btn" data-nav="next" aria-label="${esc(t('at_next'))}" ${atEnd ? 'disabled' : ''}>›</button></div>
        <div class="tiles tiles3">
          <div class="tile"><b>${mo.count.present}</b><span>${esc(t('at_present'))}</span></div>
          <div class="tile"><b>${mo.count.late}</b><span>${esc(t('at_late'))}</span></div>
          <div class="tile"><b>${mo.count.absent}</b><span>${esc(t('at_absent'))}</span></div>
        </div>
        <div class="att-grid">${head}${grid}</div>
        <div class="att-legend"><span class="att-key ok">✓ ${esc(t('at_present'))}</span><span class="att-key late">◷ ${esc(t('at_late'))}</span><span class="att-key abs">✕ ${esc(t('at_absent'))}</span></div>
        ${atEnd ? '' : `<div class="row nochrome"><button class="btn" data-nav="today">${esc(t('at_month'))}</button></div>`}
        <p style="margin:8px 0 0"><b>${esc(absences ? t('at_total', { date: since, n: absences }) : t('at_total_0', { date: since }))}</b></p>
        <p class="muted" style="margin-top:6px">${esc(t('at_note', { name }))}</p>`;
    }
    const unsub = PD.subscribeChild(id, s => { if (!s) return; latest = s; draw(); });
    return () => { ac.abort(); unsub(); };
  });
}

/* v0.22.0 (backend v2.8.0): Scrapbook — approved Scrapdeck pages this child shared with your family
   (Scrapdeck sharing, M3). Read-only: a grid of thumbnails, tap to open a full-size view. Nothing here
   is paid for or configured by a parent — a student shares, a teacher approves, this just shows it. */
function renderScrapbook(body) {
  return widgetGate(body, id => {
    let latest = null, box = null; // box: { pageId, loading, url }
    async function openOne(pageId) {
      box = { pageId, loading: true, url: null }; draw();
      try { box.url = await PD.getScrapImage(id, pageId); } catch (e) { box.url = null; }
      box.loading = false; draw();
    }
    const ac = T1.listen(body, e => {
      if (e.target.classList && e.target.classList.contains('sb-modal')) { box = null; draw(); return; }
      if (e.target.closest('[data-close]')) { box = null; draw(); return; }
      const open = e.target.closest('[data-open]'); if (open) openOne(open.dataset.open);
    });
    function draw() {
      if (!latest) return;
      const pages = latest.scrapPages || [];
      const grid = pages.length
        ? '<div class="sb-grid">' + pages.map(p => `<button type="button" class="sb-card" data-open="${esc(p.id)}">
            <img alt="" src="${esc(p.thumbDataUrl || '')}">
            <span class="sb-cap"><b>${esc(p.title || '')}</b>${p.caption ? `<br>${esc(p.caption)}` : ''}</span>
          </button>`).join('') + '</div>'
        : emptyState(t('sb_empty', { name: latest.displayName }));
      const modal = box ? `<div class="sb-modal"><div class="sb-mcard">${box.loading ? `<p class="muted">${esc(t('loading'))}</p>` : (box.url ? `<img alt="" src="${esc(box.url)}">` : `<p class="muted">${esc(t('sb_load_fail'))}</p>`)}<button type="button" class="btn" data-close="1">${esc(t('sb_close'))}</button></div></div>` : '';
      body.innerHTML = `<p class="muted" style="margin:0 0 8px">${esc(t('sb_hint', { name: latest.displayName }))}</p>${grid}${modal}`;
    }
    const unsub = PD.subscribeChild(id, s => { if (!s) return; latest = s; draw(); });
    return () => { ac.abort(); unsub(); };
  });
}

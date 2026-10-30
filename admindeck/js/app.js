'use strict';
/* ============================================================
   AdminDeck — app shell
   Same shell pattern as TeachersDeck: a bottom dock + Android-style
   app tray, draggable/resizable widget panels on a free-form wall,
   a Settings drawer and a Theme drawer, persisted to localStorage.
   Ported (not shared — no build step joins the two projects) and
   trimmed to what this build needs: no layout modes, no edge docks,
   no per-widget dock reassignment, no Pro/license — see README for
   what was deliberately left out of this first build.

   v0.4.1 combined the v0.2.1 line (demo mode, floating School Snapshot) with the v0.4.0 line (School Stats): School Snapshot is a
   normal floating widget again and opens by default, School Stats is a separate full-screen widget you open yourself, and
   the demo school (js/demo.js) feeds every widget, School Stats included.

   v0.3.0 added a widget, School Stats; v0.4.0 MERGED School Snapshot into it (so there are 8 widgets again), and added demo data — a FULL-SCREEN widget (fills the wall, can't be dragged/resized, sits underneath the
   floating ones) ported from ParentDeck's Student Summary pattern. Its logic is in js/schoolstats.js (pure, unit-tested) and
   js/schoolstats-ui.js (drawing); this file only registers it and provides the shell support (`full: true`).

   Covers the first 8 "Now" tier widgets from AdminDeck Expanded
   Product Scope (v2) §7 — all read-only, all built from data that
   already exists via adminListClasses/adminGetClass (js/data.js).
   ============================================================ */
/* Which app this is: this app's own js/edition.js (the first script on the page) sets window.DECK_EDITION — the app's
   name, its version and the edition. UNI = the university edition (UniDeck); U(schoolText, uniText) picks the wording
   for the current edition; APP = the app's name for anything shown to the user. This file is shared with UniDeck's copy
   of the app (teachersdeck/unideck, tools/sync_shared.py): edit it here, keep one-app-only behaviour behind UNI or U(). */
const ED = window.DECK_EDITION || { name: 'AdminDeck', version: '0.0.0', uni: false };
const UNI = !!ED.uni, APP = ED.name || 'AdminDeck', U = (school, uni) => (UNI ? uni : school);
const APP_VERSION = ED.version;
const $ = (sel, root) => (root || document).querySelector(sel);

/* ---------------- i18n ----------------
   Two languages for now (English, Vietnamese) — the scope to expand
   to TeachersDeck's full list (es, fr, zh, ja, ko, tl) is explicit:
   LANGS below is the only place that needs a new entry, plus a
   value for each STRINGS key, for each language added later. t()
   already falls back to English for any key/language it can't find,
   so a partially-translated new language degrades gracefully. */
const LANGS = [   // v0.5.0: the same eight as TeachersDeck (shell strings from js/i18n-shell.js; widget text is English + Tiếng Việt, the rest fall back to English)
  { code:'en', name:'English' },
  { code:'vi', name:'Tiếng Việt' },
  { code:'es', name:'Español' },
  { code:'fr', name:'Français' },
  { code:'zh', name:'中文' },
  { code:'ja', name:'日本語' },
  { code:'ko', name:'한국어' },
  { code:'tl', name:'Tagalog' }
];
const LOCALE_MAP = { en:'en-US', vi:'vi-VN', es:'es-ES', fr:'fr-FR', zh:'zh-CN', ja:'ja-JP', ko:'ko-KR', tl:'fil-PH' };

const STRINGS = {
  settings_title: { en:'Settings', vi:'Cài đặt' },
  theme_title: { en:'Theme', vi:'Giao diện' },
  mode_title: { en:'Mode', vi:'Chế độ' },
  mode_light: { en:'Light', vi:'Sáng' },
  mode_dark: { en:'Dark', vi:'Tối' },
  close: { en:'Close', vi:'Đóng' },
  app_tray_open: { en:'Open app tray', vi:'Mở khay ứng dụng' },
  app_tray_close: { en:'Close app tray', vi:'Đóng khay ứng dụng' },
  app_tray_title: { en:'All widgets', vi:'Tất cả widget' },
  backgrounds: { en:'Backgrounds', vi:'Hình nền' },
  dim_bg: { en:'Dim background (better contrast)', vi:'Làm tối nền (tương phản tốt hơn)' },
  move_action: { en:'Move', vi:'Di chuyển' },
  minimize_action: { en:'Minimize', vi:'Thu nhỏ' },
  restore_action: { en:'Restore', vi:'Khôi phục' },

  status_checking: { en:'Checking…', vi:'Đang kiểm tra…' },
  status_connected: { en:'Connected', vi:'Đã kết nối' },
  status_not_set_up: { en:'Not set up', vi:'Chưa thiết lập' },
  status_error: { en:'Connection error', vi:'Lỗi kết nối' },
  status_demo: { en:'Demo data', vi:'Dữ liệu mẫu' },
  demo_try: { en:'Try demo', vi:'Dùng thử' },
  demo_exit: { en:'Exit demo', vi:'Thoát dùng thử' },
  demo_activity: { en:'New activity came in (demo)', vi:'Có hoạt động mới (dữ liệu mẫu)' },
  autohide_section: { en:'Hide until I hover', vi:'Ẩn cho đến khi rê chuột' },
  toolbar_autohide_label: { en:'Hide the top toolbar until I hover the top edge', vi:'Ẩn thanh công cụ phía trên cho đến khi tôi rê chuột vào mép trên' },
  toolbar_autohide_hint: { en:'The toolbar slides up out of the way and only a thin handle stays at the top edge. Point at the handle (or press Tab to a toolbar button) to bring it back.', vi:'Thanh công cụ trượt lên và chỉ còn một thanh nhỏ ở mép trên. Rê chuột vào thanh đó (hoặc nhấn Tab tới một nút) để hiện lại.' },
  pills_section_hint_ad: { en:'Which pills show in the top toolbar. Settings is always shown.', vi:'Chọn nút nào hiện trên thanh công cụ. Nút Cài đặt luôn hiện.' },
  pill_status_label: { en:'Connection status', vi:'Trạng thái kết nối' },
  bg_remove: { en:'Remove my image', vi:'Xóa hình của tôi' },
  push_section: { en:'Send to TeachersDeck', vi:'Gửi tới TeachersDeck' },
  push_hint: { en:'Sends the look you have picked above (a built-in theme or your image, and the dim setting) to the TeachersDeck of the classes you choose. Each teacher gets it once, as a new background for that class; they can still change it afterwards, or switch school themes off in their Settings.', vi:'Gửi giao diện bạn đã chọn ở trên (chủ đề có sẵn hoặc hình của bạn, cùng độ tối) tới TeachersDeck của các lớp bạn chọn. Mỗi giáo viên nhận một lần, làm hình nền mới cho lớp đó; họ vẫn có thể đổi lại sau hoặc tắt chủ đề của trường trong Cài đặt.' },
  push_scope_label: { en:'Send to', vi:'Gửi tới' },
  push_scope_all: { en:'All classes', vi:'Tất cả các lớp' },
  push_scope_pick: { en:'Choose classes…', vi:'Chọn lớp…' },
  push_btn: { en:'Send to TeachersDeck', vi:'Gửi tới TeachersDeck' },
  push_confirm_go: { en:'Yes, send it', vi:'Có, gửi đi' },
  push_cancel: { en:'Cancel', vi:'Hủy' },
  push_preview_preset: { en:'Built-in theme: {name}', vi:'Chủ đề có sẵn: {name}' },
  push_preview_image: { en:'Your image', vi:'Hình của bạn' },
  push_dim_on: { en:'dimmed', vi:'làm tối' },
  push_dim_off: { en:'not dimmed', vi:'không làm tối' },
  push_confirm_text: { en:'This sets a new background on {n} class(es) in their teachers\u2019 TeachersDeck. Send it?', vi:'Việc này đặt hình nền mới cho {n} lớp trong TeachersDeck của giáo viên. Gửi chứ?' },
  push_done: { en:'Sent to {n} class(es).', vi:'Đã gửi tới {n} lớp.' },
  push_unreachable: { en:'{m} could not be updated.', vi:'{m} lớp không cập nhật được.' },
  push_missing: { en:'{m} no longer exist.', vi:'{m} lớp không còn tồn tại.' },
  push_demo_note: { en:'Demo: nothing was actually sent.', vi:'Dùng thử: thực tế chưa gửi gì.' },
  push_not_deployed: { en:'The adminPushTheme function is not deployed yet (backend v1.5.0 — see the README).', vi:'Hàm adminPushTheme chưa được triển khai (backend v1.5.0 — xem README).' },
  push_pick_none: { en:'Choose at least one class.', vi:'Hãy chọn ít nhất một lớp.' },
  push_need_connect: { en:'Connect in Settings first (or try the demo).', vi:'Hãy kết nối trong Cài đặt trước (hoặc dùng thử).' },
  push_preparing: { en:'Preparing…', vi:'Đang chuẩn bị…' },
  push_no_classes: { en:'No classes found.', vi:'Không có lớp nào.' },
  ss_toolbar_show: { en:'Show toolbar', vi:'Hiện thanh công cụ' },
  ss_toolbar_hide: { en:'Hide toolbar', vi:'Ẩn thanh công cụ' },
  ss_demo_school: { en:'Showing the demo school (made-up data). Use Exit demo in the top bar to go back to your real classes.', vi:'Đang hiển thị trường mẫu (dữ liệu giả). Dùng "Thoát dùng thử" ở thanh trên để quay lại lớp thật.' },

  connection_section: { en:'Connection', vi:'Kết nối' },
  connection_hint: { en:'AdminDeck reads through its own Cloud Functions, gated by a shared admin secret — see the README for deploy steps. Nothing here is written back; every widget is read-only.', vi:'AdminDeck đọc dữ liệu qua các Cloud Functions riêng, được bảo vệ bằng mã bí mật quản trị dùng chung — xem README để biết cách triển khai. Không có gì ở đây được ghi lại; mọi widget đều chỉ đọc.' },
  cfg_project: { en:'Firebase project ID', vi:'ID dự án Firebase' },
  cfg_region: { en:'Functions region', vi:'Khu vực Functions' },
  cfg_secret: { en:'Admin secret', vi:'Mã bí mật quản trị' },
  cfg_save: { en:'Save & reconnect', vi:'Lưu & kết nối lại' },
  cfg_saved: { en:'Saved. Reconnecting…', vi:'Đã lưu. Đang kết nối lại…' },

  language_section: { en:'Language', vi:'Ngôn ngữ' },
  language_hint: { en:'The EN / VI pill in the top bar switches between the two languages you pick here. Widget text is English and Tiếng Việt; other languages show English where there is no translation yet.', vi:'Nút EN / VI trên thanh trên chuyển giữa hai ngôn ngữ bạn chọn ở đây. Nội dung widget có tiếng Anh và tiếng Việt; các ngôn ngữ khác hiện tiếng Anh nếu chưa có bản dịch.' },
  quick_lang_1: { en:'Quick language 1', vi:'Ngôn ngữ nhanh 1' },
  quick_lang_2: { en:'Quick language 2', vi:'Ngôn ngữ nhanh 2' },

  layout_label: { en:'Layout', vi:'Bố cục' },
  reset_layout: { en:'Reset widget positions', vi:'Đặt lại vị trí widget' },
  reset_all: { en:'Reset everything on this device', vi:'Đặt lại mọi thứ trên thiết bị này' },
  reset_all_confirm: { en:'Reset AdminDeck on this device? This clears your connection settings, theme, language and widget layout. This cannot be undone.', vi:'Đặt lại AdminDeck trên thiết bị này? Thao tác này sẽ xóa cài đặt kết nối, giao diện, ngôn ngữ và bố cục widget. Không thể hoàn tác.' },

  // Widget titles (shown in the dock, the app tray, and each panel's title bar)
  w_snapshot: { en:'🏫 School Snapshot', vi:'🏫 Tổng quan trường' },
  /* v0.8.0: five widgets became two, Class Comparison moved into School Stats, School Snapshot is inactive (kept) */
  w_assignments: { en:'📋 Assignments', vi:'📋 Bài tập' },
  w_points: { en:'🏆 Points & Rewards', vi:'🏆 Điểm & phần thưởng' },
  as_tab_week: { en:'Due this week', vi:'Đến hạn tuần này' }, as_tab_class: { en:'Completion by class', vi:'Hoàn thành theo lớp' },
  as_completion_unavailable: { en:'Completion rates are not available yet from this backend.', vi:'Chưa có tỷ lệ hoàn thành từ máy chủ này.' },
  pts_tab_leaders: { en:'Leaderboard', vi:'Bảng xếp hạng' }, pts_tab_economy: { en:'Rewards economy', vi:'Kinh tế phần thưởng' },
  pts_economy_unavailable: { en:'The rewards economy is not available yet from this backend.', vi:'Chưa có dữ liệu kinh tế phần thưởng từ máy chủ này.' },
  /* v0.8.1: stoplight colours on School Stats */
  ss_st_good: { en:'On track', vi:'Đạt' }, ss_st_watch: { en:'Monitor', vi:'Theo dõi' }, ss_st_bad: { en:'Needs attention', vi:'Cần chú ý' },
  ss_st_how: { en:'How are these colours worked out?', vi:'Màu sắc được tính như thế nào?' },
  ss_st_rule_share: { en:'Participation, active students and active classes: green at {g}%+ active, red below {w}%.', vi:'Tham gia, học sinh hoạt động và lớp hoạt động: xanh từ {g}%, đỏ dưới {w}%.' },
  ss_st_rule_hw: { en:'Assignments done: green at {g}%+, red below {w}%.', vi:'Bài tập hoàn thành: xanh từ {g}%, đỏ dưới {w}%.' },
  ss_st_rule_streak: { en:'Average streak: green at {g}+ days, red below {w}.', vi:'Chuỗi ngày trung bình: xanh từ {g} ngày, đỏ dưới {w}.' },
  ss_st_rule_recency: { en:'Last active: green within {g} days, red after {w}.', vi:'Hoạt động gần nhất: xanh trong {g} ngày, đỏ sau {w} ngày.' },
  ss_st_rule_empty: { en:'Empty classes: green when there are none, red above {w}% of classes.', vi:'Lớp trống: xanh khi không có, đỏ khi trên {w}% số lớp.' },
  ss_st_rule_trend: { en:'Homework, reading, games, focus and time are compared with the previous period: green when level or up, red when down more than {w}%. Yellow is in between everywhere.', vi:'Bài tập, đọc, trò chơi, tập trung và thời gian được so với kỳ trước: xanh khi bằng hoặc tăng, đỏ khi giảm hơn {w}%. Màu vàng là mức ở giữa.' },
  ss_st_rule_neutral: { en:'Head-counts and totals with no good or bad (classes, teachers, students, average points, raw class totals) stay uncoloured, and so do activity rates for small classes (under {n} students).', vi:'Các số đếm và tổng không có tốt hay xấu (lớp, giáo viên, học sinh, điểm trung bình, tổng của lớp) không tô màu; tỷ lệ hoạt động của lớp nhỏ (dưới {n} học sinh) cũng vậy.' },
  ss_cmp_title: { en:'Compare classes', vi:'So sánh lớp' }, ss_cmp_col: { en:'Compare', vi:'So sánh' },
  ss_cmp_hint: { en:'Tick up to {n} classes to compare them side by side.', vi:'Đánh dấu tối đa {n} lớp để so sánh cạnh nhau.' },
  ss_cmp_pick_more: { en:'Tick at least 2 classes in the table below.', vi:'Đánh dấu ít nhất 2 lớp trong bảng bên dưới.' },
  ss_cmp_best_note: { en:'★ marks the best rate or average among them.', vi:'★ đánh dấu tỷ lệ hoặc trung bình tốt nhất trong các lớp.' },
  ss_cmp_best: { en:'Best of the picked classes', vi:'Tốt nhất trong các lớp đã chọn' }, ss_cmp_clear: { en:'Clear', vi:'Bỏ chọn' },
  ss_cmp_max: { en:'You can compare up to {n} classes.', vi:'Chỉ so sánh tối đa {n} lớp.' },
  inactive_section: { en:'Inactive widgets', vi:'Widget đã tắt' },
  inactive_hint: { en:'Switched off and hidden from the docks and the tray, but kept — turn one on to bring it back.', vi:'Đã tắt và ẩn khỏi dock và khay nhưng vẫn được giữ lại — bật để dùng lại.' },
  w_calendar: { en:'📅 Calendar Master View', vi:'📅 Lịch toàn trường' },
  w_joincodes: { en:'🔑 Join Code Manager', vi:'🔑 Quản lý mã tham gia' },
  w_rosterhealth: { en:'🩺 Roster Health Checker', vi:'🩺 Kiểm tra danh sách lớp' },
  w_teachers: { en:'🧑‍🏫 Teacher Directory', vi:'🧑‍🏫 Danh bạ giáo viên' },

  refresh: { en:'Refresh', vi:'Làm mới' },
  refreshed: { en:'Refreshed.', vi:'Đã làm mới.' },
  not_configured: { en:'Set your admin secret in Settings to connect AdminDeck to your TeachersDeck data.', vi:'Nhập mã bí mật quản trị trong Cài đặt để kết nối AdminDeck với dữ liệu TeachersDeck của bạn.' },
  loading: { en:'Loading…', vi:'Đang tải…' },
  not_available_yet: { en:'Not available yet', vi:'Chưa có sẵn' },
  empty_no_classes: { en:'No classes yet.', vi:'Chưa có lớp học nào.' },

  snap_classes: { en:'Classes', vi:'Lớp học' },
  snap_teachers: { en:'Teachers', vi:'Giáo viên' },
  snap_students: { en:'Students', vi:'Học sinh' },
  snap_avg_points: { en:'Avg. points / student', vi:'Điểm TB / học sinh' },
  snap_active_week: { en:'Active classes this week', vi:'Lớp hoạt động tuần này' },
  snap_active_week_note: { en:'A class counts as active if any student\u2019s StudentDeck synced in the last 7 days. This is reported by the students\u2019 own devices — a guide, not an attendance record.', vi:'Một lớp được tính là hoạt động nếu có học sinh nào đồng bộ StudentDeck trong 7 ngày qua. Dữ liệu do thiết bị của học sinh báo cáo — chỉ để tham khảo, không phải điểm danh.' },
  snap_empty_classes: { en:'Empty classes', vi:'Lớp trống' },
  snap_by_class: { en:'Students by class', vi:'Học sinh theo lớp' },

  lead_top_students: { en:'Top students', vi:'Học sinh dẫn đầu' },
  lead_top_classes: { en:'Top classes by average points', vi:'Lớp dẫn đầu theo điểm trung bình' },
  lead_anon_note: { en:'Classes set to anonymized/hidden ranking are included in the class average below, but their individual students are left out of the student list above — same rule ParentDeck and the Points Leaderboard widget both follow.', vi:'Các lớp đặt chế độ xếp hạng ẩn danh/ẩn vẫn được tính vào điểm trung bình lớp bên dưới, nhưng học sinh của lớp đó không xuất hiện trong danh sách học sinh ở trên — cùng quy tắc mà ParentDeck và widget Bảng xếp hạng điểm áp dụng.' },
  lead_no_full_classes: { en:'No class currently shows full student rankings — every class is set to anonymized or hidden.', vi:'Hiện không có lớp nào hiển thị xếp hạng học sinh đầy đủ — mọi lớp đều đặt chế độ ẩn danh hoặc ẩn.' },

  cmp_col_class: { en:'Class', vi:'Lớp' },
  cmp_col_teacher: { en:'Teacher', vi:'Giáo viên' },
  cmp_col_students: { en:'Students', vi:'Học sinh' },
  cmp_col_avg: { en:'Avg. points', vi:'Điểm TB' },
  cmp_col_total: { en:'Total points', vi:'Tổng điểm' },
  cmp_col_hw: { en:'Assignments set', vi:'Bài tập đã giao' },
  cmp_col_events: { en:'Calendar events', vi:'Sự kiện lịch' },
  cmp_col_rewards: { en:'Rewards offered', vi:'Phần thưởng' },

  pipe_due_this_week: { en:'Due this week', vi:'Hạn trong tuần này' },
  pipe_overdue: { en:'Past due — not everyone has finished', vi:'Quá hạn — chưa phải ai cũng hoàn thành' },
  pipe_overdue_note: { en:'Counts come from students\u2019 own StudentDeck check-offs (aggregate only — no names). A student who doesn\u2019t use StudentDeck shows as not finished.', vi:'Số liệu lấy từ việc học sinh tự đánh dấu hoàn thành trong StudentDeck (chỉ tổng hợp — không có tên). Học sinh không dùng StudentDeck sẽ được tính là chưa hoàn thành.' },
  pipe_done_of: { en:'{done}/{total} done', vi:'{done}/{total} đã xong' },
  pipe_overdue_dateonly: { en:'Overdue (date only — completion data needs backend v1.3.0)', vi:'Quá hạn (chỉ theo ngày — dữ liệu hoàn thành cần backend v1.3.0)' },
  pipe_all_done: { en:'All classes are up to date.', vi:'Mọi lớp đều đã hoàn thành.' },
  pipe_no_date: { en:'No due date', vi:'Không có hạn' },
  pipe_empty: { en:'Nothing due this week across any class.', vi:'Không có bài tập nào đến hạn trong tuần này ở bất kỳ lớp nào.' },

  cal_filter_all: { en:'All classes', vi:'Tất cả lớp' },
  cal_show_tt: { en:'Show timetable', vi:'Hiện thời khóa biểu' },
  cal_no_events: { en:'No events this day.', vi:'Không có sự kiện trong ngày này.' },
  cal_pick_day: { en:'Tap a day with a dot to see its events.', vi:'Nhấn vào ngày có chấm để xem sự kiện.' },

  jc_student_code: { en:'Student code', vi:'Mã học sinh' },
  jc_parent_code: { en:'Parent code', vi:'Mã phụ huynh' },
  jc_copied: { en:'Copied.', vi:'Đã sao chép.' },
  jc_none: { en:'No code set', vi:'Chưa có mã' },

  rh_dupes: { en:'Possible duplicate students', vi:'Học sinh có thể trùng lặp' },
  rh_empty_classes: { en:'Empty classes', vi:'Lớp không có học sinh' },
  rh_no_homework: { en:'Classes with no assignments', vi:'Lớp chưa có bài tập' },
  rh_no_events: { en:'Classes with no calendar events', vi:'Lớp chưa có sự kiện lịch' },
  rh_all_clear: { en:'All clear — nothing flagged.', vi:'Mọi thứ ổn — không có cảnh báo.' },
  rh_in_class: { en:'in {class}', vi:'trong lớp {class}' },

  td_classes: { en:'{n} class', vi:'{n} lớp' },
  td_classes_p: { en:'{n} classes', vi:'{n} lớp' },
  td_students: { en:'{n} students', vi:'{n} học sinh' },
  td_assignments: { en:'{n} assignments', vi:'{n} bài tập' },
  td_events: { en:'{n} events', vi:'{n} sự kiện' },
  td_last_active: { en:'Last active', vi:'Hoạt động gần nhất' },
  td_no_teacher: { en:'(no teacher account linked)', vi:'(chưa liên kết tài khoản giáo viên)' },

  /* ---- School Stats (v0.3.0, merged with Snapshot in v0.4.0) ---- */
  ss_sec_classtrend: { en:'Class trends', vi:'Xu hướng theo lớp' }, ss_sec_students: { en:'Students by class', vi:'Học sinh theo lớp' },
  ss_classtrend_note: { en:'one line per class (classes under 3 students are left out). Click a name to focus.', vi:'mỗi lớp một đường (bỏ qua lớp dưới 3 học sinh). Nhấp tên lớp để xem riêng.' },
  ss_demo_label: { en:'Demo data', vi:'Dữ liệu mẫu' },
  ss_demo_title: { en:'Show simulated data (120 days) instead of your real classes', vi:'Hiển thị dữ liệu mô phỏng (120 ngày) thay cho lớp thật' },
  ss_demo_banner: { en:'Showing simulated demo data: 30+ days of made-up activity for nine example classes. Connect to your Firebase project to see your real school.', vi:'Đang hiển thị dữ liệu mẫu mô phỏng: hơn 30 ngày hoạt động giả cho chín lớp ví dụ. Kết nối với dự án Firebase để xem trường thật của bạn.' },
  ss_demo_banner_cfg: { en:'Showing simulated demo data, not your real classes.', vi:'Đang hiển thị dữ liệu mẫu mô phỏng, không phải lớp thật của bạn.' },
  ss_demo_use_real: { en:'Use real data', vi:'Dùng dữ liệu thật' }, ss_demo_open_settings: { en:'Open Settings', vi:'Mở Cài đặt' },
  ss_demo_preview: { en:'Preview with demo data', vi:'Xem thử với dữ liệu mẫu' },

  w_schoolstats: { en:'🏫 School Stats', vi:'🏫 Thống kê trường' },
  ss_school: { en:'School', vi:'Toàn trường' },
  ss_clear_focus: { en:'Show the whole school', vi:'Xem toàn trường' },
  ss_range_1d: { en:'Today', vi:'Hôm nay' }, ss_range_7d: { en:'7 days', vi:'7 ngày' }, ss_range_30d: { en:'30 days', vi:'30 ngày' },
  ss_range_90d: { en:'90 days', vi:'90 ngày' }, ss_range_term: { en:'Term', vi:'Học kỳ' },
  ss_term_pick: { en:'Choose a term', vi:'Chọn học kỳ' },
  ss_terms_link: { en:'Set up terms…', vi:'Thiết lập học kỳ…' },
  ss_updated: { en:'Updated {time}', vi:'Cập nhật {time}' },
  ss_loading: { en:'Loading school stats…', vi:'Đang tải thống kê trường…' },
  ss_expand: { en:'Expand', vi:'Mở rộng' }, ss_collapse: { en:'Collapse', vi:'Thu gọn' },
  ss_banner_nobackend: { en:'Trends need backend v1.4.0 (adminGetSchoolStats is not deployed yet). Showing what the current backend can provide.', vi:'Xu hướng cần backend v1.4.0 (adminGetSchoolStats chưa được triển khai). Đang hiển thị dữ liệu mà backend hiện tại cung cấp.' },
  ss_banner_errors: { en:'{n} class(es) could not be loaded and are left out of these numbers.', vi:'Không tải được {n} lớp; các lớp này bị loại khỏi số liệu.' },
  ss_banner_approx: { en:'Some active-student counts are approximate (marked ~): the backend did not send exact figures for this range.', vi:'Một số số học sinh hoạt động chỉ là ước tính (đánh dấu ~): backend không gửi số chính xác cho khoảng này.' },
  ss_na: { en:'Not available yet', vi:'Chưa có' },
  ss_t_active: { en:'Active students', vi:'Học sinh hoạt động' }, ss_t_partic: { en:'Participation', vi:'Tỷ lệ tham gia' },
  ss_t_hw: { en:'Homework done', vi:'Bài tập đã làm' }, ss_t_reading: { en:'Reading', vi:'Đọc' },
  ss_t_games: { en:'Games (started / finished)', vi:'Trò chơi (bắt đầu / hoàn thành)' }, ss_t_focus: { en:'Focus sessions', vi:'Phiên tập trung' },
  ss_t_time: { en:'Active time', vi:'Thời gian hoạt động' }, ss_t_streak: { en:'Average streak (days)', vi:'Chuỗi ngày trung bình' },
  ss_of_students: { en:'of {n} students', vi:'trên {n} học sinh' },
  ss_entries: { en:'{n} entries · {m} min', vi:'{n} mục · {m} phút' },
  ss_vs_prev: { en:'vs the previous period', vi:'so với kỳ trước' },
  ss_m_active: { en:'Active students (daily average)', vi:'Học sinh hoạt động (trung bình ngày)' }, ss_m_hw: { en:'Homework done', vi:'Bài tập đã làm' },
  ss_m_reading: { en:'Reading (minutes)', vi:'Đọc (phút)' }, ss_m_focus: { en:'Focus sessions', vi:'Phiên tập trung' },
  ss_m_games: { en:'Games finished', vi:'Trò chơi hoàn thành' }, ss_m_idioms: { en:'Idioms learned', vi:'Thành ngữ đã học' }, ss_m_time: { en:'Active time (minutes)', vi:'Thời gian hoạt động (phút)' },
  ss_u_students: { en:'students', vi:'học sinh' }, ss_u_done: { en:'done', vi:'đã làm' }, ss_u_min: { en:'min', vi:'phút' },
  ss_u_sessions: { en:'sessions', vi:'phiên' }, ss_u_played: { en:'played', vi:'đã chơi' }, ss_u_learned: { en:'learned', vi:'đã học' },
  ss_sec_trend: { en:'Trend', vi:'Xu hướng' }, ss_sec_byclass: { en:'Stats by class', vi:'Thống kê theo lớp' },
  ss_sec_time: { en:'Time in each widget', vi:'Thời gian ở mỗi widget' }, ss_sec_table: { en:'Class table', vi:'Bảng các lớp' },
  ss_chart_line: { en:'Line', vi:'Đường' }, ss_chart_bar: { en:'Bar', vi:'Cột' }, ss_chart_pie: { en:'Pie', vi:'Tròn' },
  ss_mode_total: { en:'Total', vi:'Tổng' }, ss_mode_per: { en:'Per student', vi:'Mỗi học sinh' },
  ss_this_period: { en:'This period', vi:'Kỳ này' }, ss_prev_line: { en:'Previous period', vi:'Kỳ trước' },
  ss_other: { en:'Other classes', vi:'Các lớp khác' },
  ss_pie_share: { en:'Share of {metric} by class', vi:'Tỷ trọng {metric} theo lớp' },
  ss_sum_up: { en:'{metric}: {cur} {unit}, up {pct}% on the previous period ({prev}).', vi:'{metric}: {cur} {unit}, tăng {pct}% so với kỳ trước ({prev}).' },
  ss_sum_down: { en:'{metric}: {cur} {unit}, down {pct}% on the previous period ({prev}).', vi:'{metric}: {cur} {unit}, giảm {pct}% so với kỳ trước ({prev}).' },
  ss_sum_same: { en:'{metric}: {cur} {unit}, the same as the previous period.', vi:'{metric}: {cur} {unit}, bằng kỳ trước.' },
  ss_sum_fromzero: { en:'{metric}: {cur} {unit}; nothing was recorded in the previous period.', vi:'{metric}: {cur} {unit}; kỳ trước không có dữ liệu.' },
  ss_sum_noprev: { en:'{metric}: {cur} {unit}. Not enough history to compare with the previous period.', vi:'{metric}: {cur} {unit}. Chưa đủ lịch sử để so với kỳ trước.' },
  ss_empty_range: { en:'No activity recorded in this period.', vi:'Không có hoạt động nào trong kỳ này.' },
  ss_empty_nosync: { en:'nothing synced yet', vi:'chưa đồng bộ' },
  ss_click_focus: { en:'Click a class to focus the page on it.', vi:'Nhấp vào một lớp để xem riêng lớp đó.' },
  ss_small_class: { en:'small class', vi:'lớp nhỏ' },
  ss_small_note: { en:'Classes with fewer than {n} students show no day-by-day trend, so one child cannot be picked out.', vi:'Lớp có dưới {n} học sinh không hiển thị xu hướng theo ngày, để không nhận ra từng em.' },
  ss_col_class: { en:'Class', vi:'Lớp' }, ss_col_teacher: { en:'Teacher', vi:'Giáo viên' }, ss_col_students: { en:'Students', vi:'Học sinh' },
  ss_col_active: { en:'Active', vi:'Hoạt động' }, ss_col_partic: { en:'Participation %', vi:'Tham gia %' }, ss_col_hw: { en:'Homework', vi:'Bài tập' },
  ss_col_reading: { en:'Reading (min)', vi:'Đọc (phút)' }, ss_col_games: { en:'Games', vi:'Trò chơi' }, ss_col_focus: { en:'Focus', vi:'Tập trung' },
  ss_col_time: { en:'Time (min)', vi:'Thời gian (phút)' }, ss_col_streak: { en:'Avg streak', vi:'Chuỗi TB' },
  ss_col_hwpct: { en:'Assignments done %', vi:'Bài giao đã xong %' }, ss_col_last: { en:'Last active', vi:'Hoạt động gần nhất' }, ss_col_trend: { en:'14 days', vi:'14 ngày' },
  ss_export_csv: { en:'Export CSV', vi:'Xuất CSV' }, ss_csv_done: { en:'CSV downloaded.', vi:'Đã tải CSV.' },
  ss_terms_label: { en:'Terms', vi:'Học kỳ' },
  ss_terms_hint: { en:'Add your school terms (name, start, end). They appear as a "Term" range on School Stats. Saved on this device.', vi:'Thêm các học kỳ của trường (tên, bắt đầu, kết thúc). Chúng xuất hiện như khoảng "Học kỳ" trong Thống kê trường. Lưu trên thiết bị này.' },
  ss_terms_empty: { en:'No terms yet.', vi:'Chưa có học kỳ.' },
  ss_term_name: { en:'Term name', vi:'Tên học kỳ' }, ss_term_start: { en:'Start date', vi:'Ngày bắt đầu' }, ss_term_end: { en:'End date', vi:'Ngày kết thúc' },
  ss_term_add: { en:'Add term', vi:'Thêm học kỳ' }, ss_term_remove: { en:'Remove term', vi:'Xóa học kỳ' }, ss_term_default: { en:'Term {n}', vi:'Học kỳ {n}' },
  ss_term_bad: { en:'The end date is before the start date, so this term is ignored.', vi:'Ngày kết thúc trước ngày bắt đầu, nên học kỳ này bị bỏ qua.' },
  sd_timer: { en:'Timer', vi:'Hẹn giờ' }, sd_todo: { en:'To-do', vi:'Việc cần làm' }, sd_reading: { en:'Reading', vi:'Đọc' }, sd_games: { en:'Games', vi:'Trò chơi' },
  sd_idiom: { en:'Idioms', vi:'Thành ngữ' }, sd_stats: { en:'Stats', vi:'Thống kê' }, sd_journey: { en:'Journey', vi:'Hành trình' }, sd_class: { en:'Class', vi:'Lớp' },

  td_last_awarded: { en:'Last points awarded', vi:'Lần thưởng điểm gần nhất' },

  // ---- Wave 1 (v0.6.0) ----
  w_pulse: { en:'⚡ Student Activity Pulse', vi:'⚡ Nhịp hoạt động học sinh' },
  w_funnel: { en:'🧭 Class Onboarding Funnel', vi:'🧭 Phễu thiết lập lớp học' },
  w_families: { en:'🏠 Family Link Coverage', vi:'🏠 Độ phủ liên kết phụ huynh' },
  w_engage: { en:'📈 Teacher Engagement', vi:'📈 Mức độ tham gia của giáo viên' },

  snap_active_week_live: { en:'{s} students were active in the last 7 days — from StudentDeck practice activity, which students\' own devices report.', vi:'{s} học sinh đã hoạt động trong 7 ngày qua — dựa trên hoạt động luyện tập của StudentDeck, do thiết bị của học sinh tự báo cáo.' },

  rel_never: { en:'Never', vi:'Chưa bao giờ' },
  rel_today: { en:'today', vi:'hôm nay' },
  rel_yesterday: { en:'yesterday', vi:'hôm qua' },
  rel_days_ago: { en:'{n} days ago', vi:'{n} ngày trước' },

  hw_avg: { en:'Avg. completion (past-due work)', vi:'Hoàn thành TB (bài đã quá hạn)' },
  hw_tracked: { en:'Past-due assignments tracked', vi:'Bài quá hạn được theo dõi' },
  hw_low_classes: { en:'Classes flagged low', vi:'Lớp bị đánh dấu thấp' },
  hw_classes_heading: { en:'Classes, lowest completion first', vi:'Các lớp, hoàn thành thấp nhất trước' },
  hw_done_of: { en:'{done} of {n} done', vi:'{done}/{n} đã xong' },
  hw_on_time: { en:'{n} on time', vi:'{n} đúng hạn' },
  hw_late: { en:'{n} late', vi:'{n} trễ' },
  hw_upcoming: { en:'upcoming', vi:'sắp đến hạn' },
  hw_flag_low: { en:'Low completion', vi:'Hoàn thành thấp' },
  hw_none_any: { en:'No assignments have been pushed from any class yet.', vi:'Chưa có lớp nào đẩy bài tập lên.' },
  hw_no_past: { en:'Nothing past due yet', vi:'Chưa có bài nào quá hạn' },
  hw_note: { en:'Completion is a checkbox on the student\'s own device — treat it as activity, not a grade. A completion recorded when a device first synced (“backfilled”) counts as done but is left out of on-time/late.', vi:'Hoàn thành là một ô đánh dấu trên thiết bị của học sinh — hãy xem đó là hoạt động, không phải điểm số. Bài hoàn thành được ghi khi thiết bị đồng bộ lần đầu (“bù”) vẫn tính là đã xong nhưng không tính vào đúng hạn/trễ.' },

  pulse_7d: { en:'Last 7 days', vi:'7 ngày qua' },
  pulse_30d: { en:'Last 30 days', vi:'30 ngày qua' },
  pulse_active: { en:'Active students', vi:'Học sinh hoạt động' },
  pulse_reading: { en:'Reading min', vi:'Phút đọc' },
  pulse_focus: { en:'Focus min', vi:'Phút tập trung' },
  pulse_games: { en:'Games played', vi:'Lượt chơi game' },
  pulse_idioms: { en:'Idioms learned', vi:'Thành ngữ đã học' },
  pulse_hw: { en:'Homework ticked', vi:'Bài tập đã đánh dấu' },
  pulse_by_class: { en:'By class', vi:'Theo lớp' },
  pulse_active_of: { en:'{a}/{n} active', vi:'{a}/{n} hoạt động' },
  pulse_streak: { en:'avg. streak {n}', vi:'chuỗi TB {n}' },
  pulse_mood: { en:'Mood this week (school-wide)', vi:'Tâm trạng tuần này (toàn trường)' },
  pulse_mood_hidden: { en:'Mood is hidden until at least {n} students have shared one — a smaller group could identify individual children.', vi:'Tâm trạng bị ẩn cho đến khi có ít nhất {n} học sinh chia sẻ — nhóm nhỏ hơn có thể làm lộ danh tính từng em.' },
  pulse_empty: { en:'No student activity recorded in this window yet.', vi:'Chưa có hoạt động nào của học sinh trong khoảng này.' },
  pulse_note: { en:'Reported by students\' own devices (StudentDeck) — activity information, never a score. Journal text never leaves a student\'s device and is not shown anywhere.', vi:'Do thiết bị của học sinh (StudentDeck) tự báo cáo — là thông tin hoạt động, không phải điểm số. Nội dung nhật ký không bao giờ rời khỏi thiết bị của học sinh và không hiển thị ở đâu cả.' },

  eco_awarded: { en:'Points awarded', vi:'Điểm đã thưởng' },
  eco_deducted: { en:'Points deducted', vi:'Điểm bị trừ' },
  eco_redeemed: { en:'Points redeemed', vi:'Điểm đã đổi' },
  eco_rate: { en:'Redemption rate', vi:'Tỷ lệ đổi thưởng' },
  eco_by_class: { en:'By class', vi:'Theo lớp' },
  eco_cat_none: { en:'No rewards', vi:'Chưa có phần thưởng' },
  eco_cat_unreachable: { en:'Nothing affordable', vi:'Chưa ai đủ điểm' },
  eco_cat_ok: { en:'Catalog OK', vi:'Danh mục ổn' },
  pts: { en:'pts', vi:'điểm' },
  eco_cheapest: { en:'Cheapest active reward: {c} pts · top student: {s} pts', vi:'Phần thưởng rẻ nhất: {c} điểm · học sinh cao nhất: {s} điểm' },
  eco_awarded_bar: { en:'Awarded {a} · deducted {d}', vi:'Đã thưởng {a} · bị trừ {d}' },
  eco_redeemed_bar: { en:'Redeemed {r} ({n}×)', vi:'Đã đổi {r} ({n} lần)' },
  eco_redeemed_times: { en:'{n}× redeemed', vi:'đã đổi {n} lần' },
  eco_inactive: { en:'inactive', vi:'ngừng' },
  eco_never: { en:'Never redeemed: {names}', vi:'Chưa từng được đổi: {names}' },
  eco_empty: { en:'No points have been awarded in any class yet.', vi:'Chưa có lớp nào được thưởng điểm.' },
  eco_note: { en:'Totals only — reasons and student names are never shown here. “Nothing affordable” means points have been awarded, nothing has been redeemed, and even the cheapest active reward costs more than the top student has.', vi:'Chỉ hiển thị tổng số — lý do và tên học sinh không bao giờ hiển thị ở đây. “Chưa ai đủ điểm” nghĩa là đã có điểm được thưởng, chưa ai đổi, và ngay cả phần thưởng rẻ nhất cũng đắt hơn điểm của học sinh cao nhất.' },

  fun_students: { en:'Students joined', vi:'Học sinh đã tham gia' },
  fun_parents: { en:'Parents linked', vi:'Đã liên kết phụ huynh' },
  fun_homework: { en:'Homework pushed', vi:'Đã đẩy bài tập' },
  fun_rewards: { en:'Rewards added', vi:'Đã thêm phần thưởng' },
  fun_points: { en:'Points awarded', vi:'Đã thưởng điểm' },
  fun_school: { en:'Across the school', vi:'Toàn trường' },
  fun_classes_heading: { en:'Classes — stuck ones first', vi:'Các lớp — lớp bị kẹt lên trước' },
  fun_stuck: { en:'Stuck', vi:'Bị kẹt' },
  fun_next: { en:'Next: {step}', vi:'Tiếp theo: {step}' },
  fun_complete: { en:'Fully set up', vi:'Đã thiết lập đủ' },
  fun_age: { en:'{n} days old', vi:'{n} ngày tuổi' },
  fun_empty: { en:'No classes yet.', vi:'Chưa có lớp học nào.' },
  fun_note: { en:'Stages are independent checks, not a strict sequence — a teacher can award points before linking parents. “Next” is the first one missing in the usual order. “Stuck” = older than {d} days with setup unfinished.', vi:'Các giai đoạn là các mục kiểm tra độc lập, không theo thứ tự cố định — giáo viên có thể thưởng điểm trước khi liên kết phụ huynh. “Tiếp theo” là mục đầu tiên còn thiếu theo thứ tự thông thường. “Bị kẹt” = quá {d} ngày mà chưa thiết lập xong.' },

  fam_coverage: { en:'Students with a linked guardian', vi:'Học sinh đã có phụ huynh liên kết' },
  fam_none: { en:'Students with none', vi:'Học sinh chưa có' },
  fam_multi: { en:'With 2+ guardians', vi:'Có từ 2 phụ huynh' },
  fam_orphans: { en:'Links to removed students', vi:'Liên kết tới học sinh đã xóa' },
  fam_growth: { en:'New links per week (last 8 weeks)', vi:'Liên kết mới mỗi tuần (8 tuần qua)' },
  fam_by_class: { en:'By class, lowest coverage first', vi:'Theo lớp, độ phủ thấp nhất trước' },
  fam_class_row: { en:'{l}/{n} linked', vi:'{l}/{n} đã liên kết' },
  fam_unlinked: { en:'Not yet linked ({n})', vi:'Chưa liên kết ({n})' },
  fam_more: { en:'…and {n} more', vi:'…và {n} học sinh nữa' },
  fam_code_unused: { en:'Parent code never used', vi:'Mã phụ huynh chưa được dùng' },
  fam_orphan_badge: { en:'{n} orphan link(s)', vi:'{n} liên kết mồ côi' },
  fam_empty: { en:'No classes with students yet.', vi:'Chưa có lớp nào có học sinh.' },
  fam_note: { en:'Parents link with the class parent code plus the student\'s display name, so a typo leaves no trace — low coverage can mean failed attempts, not disinterest, and failed attempts aren\'t logged yet. A link to a removed student lingers because a client-side delete can\'t cascade.', vi:'Phụ huynh liên kết bằng mã phụ huynh của lớp cùng tên hiển thị của học sinh, nên gõ sai sẽ không để lại dấu vết — độ phủ thấp có thể do thử không thành công chứ không phải do thờ ơ, và các lần thử thất bại chưa được ghi lại. Liên kết tới học sinh đã xóa vẫn còn vì thao tác xóa phía máy khách không xóa dây chuyền được.' },

  eng_last: { en:'Last points awarded', vi:'Lần thưởng điểm gần nhất' },
  eng_awards: { en:'{a7} this week · {a30} this month', vi:'{a7} tuần này · {a30} tháng này' },
  eng_classes: { en:'{a} active · {d} dormant · {n} new', vi:'{a} hoạt động · {d} ngưng · {n} mới' },
  eng_feat_rewards: { en:'Rewards', vi:'Phần thưởng' },
  eng_feat_calendar: { en:'Calendar', vi:'Lịch' },
  eng_feat_homework: { en:'Homework', vi:'Bài tập' },
  eng_dormant: { en:'Dormant: {names}', vi:'Ngưng hoạt động: {names}' },
  eng_empty: { en:'No teachers with classes yet.', vi:'Chưa có giáo viên nào có lớp.' },
  eng_note: { en:'Derived from points-award activity, so a teacher who uses TeachersDeck without Cloud Class won\'t show activity here. “Dormant” = no points awarded for {d}+ days; “new” = a class under {d} days old with no awards yet.', vi:'Suy ra từ hoạt động thưởng điểm, nên giáo viên dùng TeachersDeck mà không dùng Cloud Class sẽ không có hoạt động ở đây. “Ngưng” = không thưởng điểm trong {d}+ ngày; “mới” = lớp dưới {d} ngày tuổi chưa thưởng điểm lần nào.' },
  snap_active_week_unavailable: { en:'Needs the updated backend (adminListClasses returning lastActiveAt, backend v1.3.0) or the adminSchoolActivity function — neither is deployed yet.', vi:'Cần backend đã cập nhật (adminListClasses trả về lastActiveAt, backend v1.3.0) hoặc hàm adminSchoolActivity — hiện chưa triển khai cái nào.' },

  // ---- People Directory (v0.7.0) ----
  w_directory: { en:'👥 People Directory', vi:'👥 Danh bạ thành viên' },
  dir_type_all: { en:'All', vi:'Tất cả' }, dir_type_teacher: { en:'Teachers', vi:'Giáo viên' }, dir_type_student: { en:'Students', vi:'Học sinh' },
  dir_type_parent: { en:'Parents', vi:'Phụ huynh' }, dir_type_staff: { en:'Staff', vi:'Nhân viên' },
  dir_one_teacher: { en:'Teacher', vi:'Giáo viên' }, dir_one_student: { en:'Student', vi:'Học sinh' }, dir_one_parent: { en:'Parent', vi:'Phụ huynh' }, dir_one_staff: { en:'Staff', vi:'Nhân viên' },
  dir_status_open: { en:'Active & invited', vi:'Đang hoạt động & đã mời' }, dir_status_archived: { en:'Archived', vi:'Đã lưu trữ' }, dir_status_all: { en:'All statuses', vi:'Mọi trạng thái' },
  dir_st_invited: { en:'Invited', vi:'Đã mời' }, dir_st_active: { en:'Active', vi:'Hoạt động' }, dir_st_archived: { en:'Archived', vi:'Đã lưu trữ' },
  dir_search_ph: { en:'Search name, email, phone, class…', vi:'Tìm tên, email, điện thoại, lớp…' },
  dir_class_all: { en:'All classes', vi:'Mọi lớp' },
  dir_linked_all: { en:'Linked or not', vi:'Đã liên kết hay chưa' }, dir_linked_yes: { en:'Linked to an account', vi:'Đã liên kết tài khoản' }, dir_linked_no: { en:'Not linked yet', vi:'Chưa liên kết' },
  dir_email_all: { en:'Email: any', vi:'Email: bất kỳ' }, dir_email_yes: { en:'Has email', vi:'Có email' }, dir_email_no: { en:'No email', vi:'Không có email' },
  dir_sort_name: { en:'Sort: name', vi:'Xếp: tên' }, dir_sort_added: { en:'Sort: newest', vi:'Xếp: mới nhất' }, dir_sort_class: { en:'Sort: class', vi:'Xếp: lớp' },
  dir_add: { en:'+ Add person', vi:'+ Thêm người' }, dir_import: { en:'Import CSV', vi:'Nhập CSV' }, dir_export: { en:'Export CSV', vi:'Xuất CSV' },
  dir_save: { en:'Save', vi:'Lưu' }, dir_cancel: { en:'Cancel', vi:'Hủy' }, dir_confirm: { en:'Confirm', vi:'Xác nhận' }, dir_edit: { en:'Edit', vi:'Sửa' },
  dir_archive: { en:'Archive', vi:'Lưu trữ' }, dir_restore: { en:'Restore', vi:'Khôi phục' }, dir_add_anyway: { en:'Add anyway', vi:'Vẫn thêm' },
  dir_preview: { en:'Preview', vi:'Xem trước' }, dir_import_n: { en:'Import {n} people', vi:'Nhập {n} người' },
  dir_add_title: { en:'Add a person', vi:'Thêm một người' }, dir_edit_title: { en:'Edit person', vi:'Sửa thông tin' },
  dir_f_type: { en:'Type', vi:'Loại' }, dir_f_name: { en:'Full name', vi:'Họ và tên' }, dir_f_email: { en:'Email', vi:'Email' }, dir_f_phone: { en:'Phone / Zalo', vi:'Điện thoại / Zalo' },
  dir_f_class: { en:'Class', vi:'Lớp' }, dir_f_class_none: { en:'(no class yet)', vi:'(chưa có lớp)' }, dir_f_student_no: { en:'Student number', vi:'Mã học sinh' },
  dir_f_subjects: { en:'Subjects', vi:'Môn dạy' }, dir_f_emp_no: { en:'Employee number', vi:'Mã nhân viên' }, dir_f_relationship: { en:'Relationship to child', vi:'Quan hệ với học sinh' },
  dir_f_contact: { en:'Preferred contact', vi:'Liên hệ ưu tiên' }, dir_f_title: { en:'Job title', vi:'Chức vụ' }, dir_f_dept: { en:'Department', vi:'Phòng ban' },
  dir_contact_email: { en:'Email', vi:'Email' }, dir_contact_phone: { en:'Phone', vi:'Điện thoại' }, dir_contact_zalo: { en:'Zalo', vi:'Zalo' },
  dir_d_classes: { en:'Classes', vi:'Các lớp' }, dir_d_class: { en:'Class', vi:'Lớp' }, dir_d_guardians: { en:'Linked guardians', vi:'Phụ huynh đã liên kết' }, dir_d_children: { en:'Children', vi:'Con' },
  dir_d_account: { en:'Account', vi:'Tài khoản' }, dir_d_linked: { en:'Linked', vi:'Đã liên kết' }, dir_d_not_linked: { en:'Not linked yet — links when they sign in or join', vi:'Chưa liên kết — sẽ liên kết khi họ đăng nhập hoặc tham gia' },
  dir_d_added: { en:'Added', vi:'Ngày thêm' }, dir_d_source: { en:'Source', vi:'Nguồn' },
  dir_count_showing: { en:'{n} shown', vi:'Hiển thị {n}' }, dir_more: { en:'…and {n} more — narrow the filters to see them.', vi:'…và {n} người nữa — thu hẹp bộ lọc để xem.' },
  dir_empty: { en:'No one matches these filters.', vi:'Không có ai khớp với bộ lọc này.' },
  dir_empty_all: { en:'The directory is empty. Add a person, import a CSV, or import the accounts that already exist.', vi:'Danh bạ đang trống. Hãy thêm người, nhập CSV hoặc nhập các tài khoản đã có.' },
  dir_backfill_banner: { en:'{n} existing accounts ({t} teachers, {s} students, {p} parents) aren’t in the directory yet.', vi:'{n} tài khoản đã có ({t} giáo viên, {s} học sinh, {p} phụ huynh) chưa có trong danh bạ.' },
  dir_backfill_btn: { en:'Import existing accounts', vi:'Nhập các tài khoản đã có' },
  dir_backfill_confirm: { en:'Add {n} records? Nothing about the accounts changes — this only creates directory records.', vi:'Thêm {n} hồ sơ? Tài khoản không thay đổi — chỉ tạo hồ sơ trong danh bạ.' },
  dir_backfill_done: { en:'Imported {n} existing accounts', vi:'Đã nhập {n} tài khoản đã có' },
  dir_attn_title: { en:'Needs attention', vi:'Cần chú ý' }, dir_attn_clear: { en:'Show everyone', vi:'Hiện tất cả' },
  dir_attn_student_no_class: { en:'Students with no class', vi:'Học sinh chưa có lớp' }, dir_attn_student_no_guardian: { en:'Students with no linked guardian', vi:'Học sinh chưa có phụ huynh liên kết' },
  dir_attn_parent_no_child: { en:'Parents with no linked child', vi:'Phụ huynh chưa liên kết với học sinh' }, dir_attn_teacher_no_class: { en:'Teachers with no class', vi:'Giáo viên chưa có lớp' },
  dir_attn_duplicates: { en:'Possible duplicates', vi:'Có thể trùng lặp' }, dir_attn_stale_invites: { en:'Invites unclaimed for {d}+ days', vi:'Lời mời chưa nhận sau {d}+ ngày' },
  dir_err_type_invalid: { en:'Choose a type', vi:'Hãy chọn loại' }, dir_err_name_required: { en:'Name is required', vi:'Cần nhập tên' }, dir_err_too_long: { en:'Too long (max {max})', vi:'Quá dài (tối đa {max})' },
  dir_err_email_invalid: { en:'That email doesn’t look right', vi:'Email này có vẻ không đúng' }, dir_err_phone_invalid: { en:'That phone number doesn’t look right', vi:'Số điện thoại này có vẻ không đúng' },
  dir_err_student_no_contact: { en:'Students don’t have contact details here', vi:'Học sinh không có thông tin liên hệ ở đây' }, dir_err_contact_invalid: { en:'Choose email, phone or Zalo', vi:'Chọn email, điện thoại hoặc Zalo' },
  dir_err_class_not_found: { en:'Class not found', vi:'Không tìm thấy lớp' }, dir_err_type_locked: { en:'A person’s type can’t be changed', vi:'Không thể đổi loại của một người' },
  dir_err_locked_linked_student: { en:'This student is linked to a real account, so their name and class are changed through that account (coming with StudentAdmin), not here.', vi:'Học sinh này đã liên kết với tài khoản thật, nên tên và lớp được đổi qua tài khoản đó (sẽ có trong StudentAdmin), không phải ở đây.' },
  dir_err_csv_empty: { en:'The file is empty', vi:'Tệp trống' }, dir_err_csv_no_name_column: { en:'No name column found — add a header such as “Name”', vi:'Không có cột tên — hãy thêm tiêu đề như “Name”' },
  dir_err_csv_too_many_rows: { en:'Only the first {max} rows are used', vi:'Chỉ dùng {max} dòng đầu tiên' },
  dir_dup_title: { en:'Looks like someone already in the directory:', vi:'Có vẻ đã có người này trong danh bạ:' },
  dir_dup_email: { en:'same email', vi:'cùng email' }, dir_dup_name: { en:'same name', vi:'cùng tên' }, dir_dup_name_class: { en:'same name and class', vi:'cùng tên và lớp' },
  dir_import_title: { en:'Import people from a CSV', vi:'Nhập danh sách từ tệp CSV' }, dir_import_type: { en:'These people are', vi:'Những người này là' }, dir_import_file: { en:'Choose a CSV file (or paste below)', vi:'Chọn tệp CSV (hoặc dán bên dưới)' },
  dir_import_hint: { en:'First row = column names. Recognised: name, email, phone, class, title, department, student number, employee number, subjects, relationship. Nothing is saved until you press Import.', vi:'Dòng đầu là tên cột. Nhận diện: name, email, phone, class, title, department, student number, employee number, subjects, relationship. Chưa lưu gì cho đến khi bạn bấm Nhập.' },
  dir_import_summary: { en:'{c} will be added · {d} duplicates skipped · {i} rows with problems', vi:'Sẽ thêm {c} · bỏ qua {d} trùng · {i} dòng có lỗi' },
  dir_import_row: { en:'Row {row}', vi:'Dòng {row}' }, dir_import_done: { en:'Imported {n} people', vi:'Đã nhập {n} người' }, dir_import_ignored: { en:'Ignored columns: {cols}', vi:'Cột bị bỏ qua: {cols}' },
  dir_saved: { en:'Saved', vi:'Đã lưu' }, dir_archived: { en:'{n} archived', vi:'Đã lưu trữ {n}' }, dir_restored: { en:'{n} restored', vi:'Đã khôi phục {n}' }, dir_exported: { en:'Exported {n} people', vi:'Đã xuất {n} người' },
  dir_exp_status: { en:'Status', vi:'Trạng thái' }, dir_exp_linked: { en:'Linked to an account', vi:'Đã liên kết tài khoản' }, dir_exp_details: { en:'Details', vi:'Chi tiết' },
  dir_note: { en:'For the school admin. People are archived, never deleted, and every change is logged. Until someone signs in or joins, their record stays “Invited”.', vi:'Dành cho quản trị trường. Mọi người được lưu trữ chứ không xóa, và mọi thay đổi đều được ghi lại. Cho đến khi họ đăng nhập hoặc tham gia, hồ sơ vẫn ở trạng thái “Đã mời”.' }
};

/* v0.5.0: add the other six languages (and any shell key AdminDeck lacks) from js/i18n-shell.js. AdminDeck's own en/vi wording wins. */
/* v0.8.0 (SchoolDeck line): SchoolDeck's strings live beside its widget (js/schooldeck-ui.js). */
if(typeof SD_STRINGS !== 'undefined') Object.assign(STRINGS, SD_STRINGS);
/* v0.10.0 (ClassDeck): its strings live beside its tab (js/classdeck-ui.js). */
if(typeof CD_STRINGS !== 'undefined') Object.assign(STRINGS, CD_STRINGS);
/* v0.11.0 (Schedule): likewise. */
if(typeof SC_STRINGS !== 'undefined') Object.assign(STRINGS, SC_STRINGS);
/* v0.13.0 (History): likewise (js/history-ui.js). */
if(typeof HS_STRINGS !== 'undefined') Object.assign(STRINGS, HS_STRINGS);
if(typeof SHELL_I18N !== 'undefined'){
  Object.keys(SHELL_I18N).forEach(k=>{ STRINGS[k] = Object.assign({}, SHELL_I18N[k], STRINGS[k] || {}); });
}
function t(key, vars){
  const entry = STRINGS[key];
  let str = (entry && (entry[state.lang] || entry.en)) || key;
  if(vars){ Object.keys(vars).forEach(k=>{ str = str.replace(`{${k}}`, vars[k]); }); }
  return str;
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function localizeNode(root){
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-widget-label]').forEach(el=>{ el.textContent = widgetLabel(el.dataset.i18nWidgetLabel); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-title]').forEach(el=>{ el.title = t(el.dataset.i18nTitle); });
}

/* ---------------- Icons ---------------- */
const ICONS = {
  snapshot:`<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>`,
  trophy:`<path d="M7 3h10v4a5 5 0 0 1-10 0V3Z"/><path d="M7 4H4.5A2.5 2.5 0 0 0 4 8.9L7 11"/><path d="M17 4h2.5A2.5 2.5 0 0 1 20 8.9L17 11"/><path d="M12 12v3.5"/><path d="M9 20h6"/><path d="M9.6 16.5h4.8l.5 3.5H9.1l.5-3.5Z"/>`,
  poll:`<rect x="4" y="11" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="14" rx="1"/><rect x="16" y="14" width="4" height="6" rx="1"/>`,
  clipboard:`<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="8.5" y="2" width="7" height="3.5" rx="1"/><path d="M8.5 11h7M8.5 15h7M8.5 19h4"/>`,
  calendar:`<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18"/><path d="M8 2.5v4M16 2.5v4"/><circle cx="8" cy="14" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>`,
  qrcode:`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14v3M14 19h2M19 19h2"/>`,
  pulse:`<path d="M3 12h4l2-7 4 14 2-7h6"/>`,
  people:`<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8" r="2.4"/><path d="M15.5 14a5 5 0 0 1 5.5 5"/>`,
  settings:`<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.3 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.3-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4L19.4 13Z"/>`,
  close:`<path d="M6 6l12 12M18 6L6 18"/>`,
  grip:`<circle cx="9" cy="6.5" r="1.3"/><circle cx="15" cy="6.5" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17.5" r="1.3"/><circle cx="15" cy="17.5" r="1.3"/>`,
  minimize:`<path d="M5 12h14"/>`,
  restore:`<rect x="6" y="6" width="12" height="12" rx="2"/>`,
  copy:`<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>`,
  school:`<path d="M3 10 12 4l9 6"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5"/><path d="M12 4V2"/>`,
  refresh:`<path d="M3 12a9 9 0 0 1 15.3-6.4M21 12a9 9 0 0 1-15.3 6.4"/><path d="M18 3v4h-4M6 21v-4h4"/>`,
  chart:`<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7 15l4-5 3 3 5-7"/>`,
  tasks:`<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12.5l2.7 2.7L16 9.5"/>`,
  bolt:`<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2Z"/>`,
  coins:`<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>`,
  funnel:`<path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4Z"/>`,
  family:`<path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M12 17.2s-3-1.8-3-3.8a1.7 1.7 0 0 1 3-1.1 1.7 1.7 0 0 1 3 1.1c0 2-3 3.8-3 3.8Z"/>`,
  trend:`<path d="M3 20h18"/><path d="M5 16l4-5 3.5 3L19 6"/><path d="M15 6h4v4"/>`,
  contacts:`<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16.5 5.5a3 3 0 0 1 0 5.6"/><path d="M18 14.8c2 .7 3.3 2.4 3.3 5.2"/>`
};
function iconSvg(name, cls=''){ return `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name]||''}</svg>`; }

/* ---------------- State ---------------- */
const LS_KEY = 'ad_state_v1';
function loadState(){
  let s = null;
  try{ s = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  const st = { lang:'en', langPair:['en','vi'], theme:'dusk', dim:true, active:{}, layout:{}, terms:[], statsUI:{}, tabs:{}, deactivated:{},
    layoutMode:'cozy',                  // 'compact' | 'cozy' | 'custom' — same three as TeachersDeck (see LAYOUT_MODES)
    showEmojisCustom:true, dockPlacement:{}, pillPlacement:{}, dockAutoHide:false, toolbarAutoHide:false,
    customBg:false, activeBgId:'background', ...(s||{}) };
  if(!st.tabs || typeof st.tabs !== 'object') st.tabs = {};
  if(!st.deactivated || typeof st.deactivated !== 'object') st.deactivated = {};
  st.edgeDock = Object.assign({ left:{ visible:true }, right:{ visible:true }, top:{ visible:false } }, (s && s.edgeDock) || {});
  // A device that saved state before layout modes existed keeps its exact setup: Custom mode, every widget in the one bottom dock it had.
  if(s && !s.layoutMode){ st.layoutMode = 'custom'; st.legacyDocks = true; }
  return st;
}
const state = loadState();
function saveState(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){ /* not persisted */ } }

/* ---------- v0.9.3: Pro, schools, notes to teachers (backend v2.1.0) — PRO-TIERS.md ----------
   AdminDeck Pro is a licence for one school (ADPRO-… key, Settings → School & licence). The platform owner always has
   Pro. PRO_GATE_ENABLED stays false until launch: nothing is locked. ?progate=1 previews the gate. */
const PRO_GATE_ENABLED = false;
const PRO_WIDGETS = ['points', 'assignments', 'pulse', 'funnel', 'families', 'engage', 'schooldeck', 'theme'];
let WHO = null;
// v0.9.4 anti-theft: exports carry the school's watermark (js/watermark.js); AdminDeck Key Manager traces it.
if(window.Watermark) Watermark.configure({ identity: ()=> WHO && !WHO.all && WHO.schoolId ? `AD::${WHO.schoolId}` : 'AD::owner' });
ProGate.configure({
  enabled: PRO_GATE_ENABLED, ids: PRO_WIDGETS, pro: (()=>{ try{ return localStorage.getItem('ad_pro') === '1'; }catch(e){ return false; } })(),
  title: '⭐ An AdminDeck Pro feature', text: 'Included with AdminDeck Pro, a licence for your whole school.', ctaLabel: 'Enter a licence key',
  cta: ()=>{ const d = document.getElementById('settings-drawer'); if(d){ d.hidden = false; setTimeout(()=>{ const k = document.getElementById('lic-key'); if(k){ k.scrollIntoView({ block:'center' }); k.focus(); } }, 300); } },
  onChange: ()=>{ if(ProGate.enabled) location.reload(); }
});
function setAdminPro(on){ try{ localStorage.setItem('ad_pro', on ? '1' : '0'); }catch(e){} ProGate.setPro(on); }
async function refreshWho(){
  try{ WHO = await AD.whoAmI(); setAdminPro(!!WHO.pro); }catch(e){ WHO = null; }
  return WHO;
}
setTimeout(()=>{ if(AD.isConfigured()) refreshWho(); }, 0);

function showOnce(box, label, value){
  box.innerHTML = `<div class="sch-once"><b>${esc(label)}</b><code>${esc(value)}</code><button type="button" class="ghost-btn sch-copy">Copy</button><p class="hint">Shown once — copy it now and give it only to that school's admin. Lost? Make a new one.</p></div>`;
  box.querySelector('.sch-copy').addEventListener('click', ()=> (navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject()).then(()=> toast('Copied'), ()=> toast(value)));
}
async function renderSchoolSettings(){
  const box = document.getElementById('school-box'), lic = document.getElementById('lic-box'), adm = document.getElementById('schools-admin');
  const row = document.getElementById('cfg-school-row'), sel = document.getElementById('cfg-school');
  if(!box) return;
  if(!AD.isConfigured()){ box.textContent = 'Connect first (above).'; lic.innerHTML = ''; adm.hidden = true; row.hidden = true; return; }
  box.textContent = 'Checking\u2026';
  const who = await refreshWho();
  if(!who){ box.textContent = 'School details need backend v2.1.0 (see the README).'; return; }
  const code = who.teacherJoinCode ? `<br>Teachers join with school code <b class="sch-code">${esc(who.teacherJoinCode)}</b> (TeachersDeck → Cloud Class → ⚙️ Class settings → School).` : '';
  box.innerHTML = who.role === 'owner'
    ? (who.all ? 'Platform owner — <b>all schools</b>. Pick one below to work inside it.' : `Platform owner — viewing <b>${esc(who.schoolName)}</b>.${code}`)
    : `School admin — <b>${esc(who.schoolName)}</b>.${code}`;
  if(who.role === 'owner') lic.innerHTML = '<p class="hint">⭐ Pro features are always on for the platform owner.</p>';
  else if(who.pro) lic.innerHTML = '<p class="hint">⭐ <b>AdminDeck Pro</b> is active for this school.</p>';
  else {
    lic.innerHTML = `<p class="hint"><b>AdminDeck Pro</b> — Points &amp; Rewards, Assignments analytics, Student Activity Pulse, Onboarding Funnel, Family Links, Teacher Engagement, SchoolDeck and Send to TeachersDeck, for the whole school.</p>
      <label class="upload-row" style="cursor:default"><span>Licence key</span><input type="text" id="lic-key" placeholder="ADPRO-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false"></label>
      <button class="primary-btn" id="lic-go">Activate</button>`;
    document.getElementById('lic-go').addEventListener('click', async ()=>{
      try{ await AD.activateLicense(document.getElementById('lic-key').value.trim()); toast('⭐ AdminDeck Pro is active for this school'); renderSchoolSettings(); }
      catch(e){ toast(e.message || String(e)); }
    });
  }
  renderPolicyBox(who);   // v0.12.0
  if(who.role !== 'owner'){ row.hidden = true; adm.hidden = true; return; }
  let schools = [];
  try{ schools = await AD.listSchools(); }catch(e){}
  row.hidden = false;
  sel.innerHTML = `<option value="">All schools</option>` + schools.map(s=> `<option value="${esc(s.schoolId)}">${esc(s.name)}</option>`).join('');
  sel.value = AD.getSchool() || '';
  sel.onchange = ()=>{ AD.setSchool(sel.value); if(AD.refreshAll) AD.refreshAll(); location.reload(); };
  adm.hidden = false;
  adm.innerHTML = `<p class="drawer-label" style="margin-top:14px">Schools (platform owner)</p>
    <div class="sch-list">${schools.map(s=> `<div class="sch-row" data-id="${esc(s.schoolId)}"><div><b>${esc(s.name)}</b> ${s.pro ? '⭐' : ''}<br><span class="hint">${s.classes} classes · ${s.teachers} teachers · code ${esc(s.teacherJoinCode || '—')}</span></div>
      <div class="sch-acts"><button class="ghost-btn" data-act="rename">Rename</button><button class="ghost-btn" data-act="code">New teacher code</button><button class="ghost-btn" data-act="key">New admin key</button></div></div>`).join('')}</div>
    <div id="sch-once"></div>
    <label class="upload-row" style="cursor:default"><span>New school</span><input type="text" id="sch-new" placeholder="School name"></label>
    <button class="primary-btn" id="sch-create">Create school</button>
    <p class="hint" style="margin-top:10px">Existing classes with no school belong to the pilot school. <button class="ghost-btn" id="sch-backfill">Record that on old data</button></p>`;
  const once = adm.querySelector('#sch-once');
  adm.querySelector('#sch-create').addEventListener('click', async ()=>{
    const name = adm.querySelector('#sch-new').value.trim(); if(!name) return;
    try{ const r = await AD.createSchool(name); await renderSchoolSettings(); showOnce(document.getElementById('sch-once'), `Admin key for ${r.name} (teacher code ${r.teacherJoinCode})`, r.adminKey); }
    catch(e){ toast(e.message || String(e)); }
  });
  adm.querySelector('#sch-backfill').addEventListener('click', async ()=>{
    if(!confirm('Mark every class, directory record and audit entry that has no school as belonging to the pilot school?')) return;
    try{ AD.setSchool(''); const r = await AD.backfillSchools(); toast(`Done: ${r.stamped.classes} classes, ${r.stamped.directory} records, ${r.stamped.adminAudit} audit entries`); renderSchoolSettings(); }
    catch(e){ toast(e.message || String(e)); }
  });
  adm.querySelectorAll('.sch-row [data-act]').forEach(b=> b.addEventListener('click', async ()=>{
    const id = b.closest('.sch-row').dataset.id, act = b.dataset.act;
    try{
      if(act === 'rename'){ const n = prompt('New name for this school:'); if(!n) return; await AD.updateSchool({ schoolId:id, name:n }); renderSchoolSettings(); }
      if(act === 'code'){ if(!confirm('Make a new teacher join code? The old one stops working (teachers already in the school stay).')) return; await AD.updateSchool({ schoolId:id, regenerateTeacherCode:true }); renderSchoolSettings(); }
      if(act === 'key'){ if(!confirm('Make a new admin key for this school? Every older key for it stops working at once.')) return; const r = await AD.updateSchool({ schoolId:id, rotateAdminKey:true }); showOnce(once, 'New admin key', r.adminKey); }
    }catch(e){ toast(e.message || String(e)); }
  }));
}
(()=>{ const d = document.getElementById('settings-drawer'); if(!d) return;
  new MutationObserver(()=>{ if(!d.hidden) renderSchoolSettings(); }).observe(d, { attributes:true, attributeFilter:['hidden'] }); })();

/* v0.12.0 (backend v2.6.0) — Student safety: the school's policy for StudentDeck (Scrapdeck scope, M0).
   FREE on purpose: a safety control is never Pro. Saved for every class in the school at once. */
const POLICY_FLAGS = [
  ['studentPhotos', 'Students may add photos to Scrapdeck', 'Off: Add photo is disabled in every class. Photos already on a student\u2019s computer stay there and can\u2019t be shared.'],
  ['studentSharing', 'Students may share Scrapdeck pages', 'Off: nothing a student makes leaves their computer (sharing arrives in a later StudentDeck update).'],
  ['studentStore', 'Students may see the Scrapdeck Shop', 'For a later update; nothing uses it yet. Students never pay — a parent approves every purchase.'],
];
function renderPolicyBox(who){
  const box = document.getElementById('policy-box'); if(!box) return;
  if(!who || who.all || !who.schoolId){ box.innerHTML = '<p class="drawer-label" style="margin-top:14px">Student safety</p><p class="hint">Pick a school above to set its student safety switches.</p>'; return; }
  const p = who.policy || { studentPhotos: true, studentSharing: true, studentStore: false };
  box.innerHTML = `<p class="drawer-label" style="margin-top:14px">Student safety — ${esc(who.schoolName || '')}</p>`
    + POLICY_FLAGS.map(([k, label, hint])=> `<label class="pol-row"><input type="checkbox" data-pol="${k}" ${p[k] ? 'checked' : ''}><span><b>${esc(label)}</b><br><span class="hint">${esc(hint)}</span></span></label>`).join('')
    + '<p class="hint">Applies to every class in the school, including classes created later. Free.</p>';
  box.querySelectorAll('[data-pol]').forEach(cb=> cb.addEventListener('change', async ()=>{
    cb.disabled = true;
    try{ const r = await AD.setSchoolPolicy({ [cb.dataset.pol]: cb.checked }); if(WHO) WHO.policy = r.policy; toast(`Saved for ${r.classes} class${r.classes === 1 ? '' : 'es'}`); }
    catch(e){ cb.checked = !cb.checked; toast(e.message || String(e)); }
    cb.disabled = false;
  }));
}

function renderTeacherNotes(body){
  let alive = true;
  const ago = ms => { if(!ms) return ''; const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(ms).toLocaleDateString(); };
  async function draw(){
    body.innerHTML = '<p class="hint">Loading\u2026</p>';
    let data;
    try{ data = await AD.listTeacherNotes(); }catch(e){ if(alive) body.innerHTML = '<p class="hint">Notes to teachers need backend v2.1.0 (see the README).</p>'; return; }
    if(!alive) return;
    const who = WHO || {};
    const teachers = data.teachers || [];
    body.innerHTML = `<div class="tn">
      <div class="tn-compose">
        <label class="upload-row" style="cursor:default"><span>To</span><select id="tn-to">${who.all ? '' : '<option value="all">All teachers in this school</option>'}${teachers.map(x=> `<option value="${esc(x.uid)}">${esc(x.name || x.uid)}</option>`).join('')}</select></label>
        <input type="text" id="tn-subject" maxlength="80" placeholder="Subject (optional)">
        <textarea id="tn-text" maxlength="1000" rows="4" placeholder="Your note to the teacher(s)"></textarea>
        <div class="tn-row"><input type="text" id="tn-from" maxlength="60" placeholder="From (e.g. School office)"><span class="hint" id="tn-count">0/1000</span><button class="primary-btn" id="tn-send">Send</button></div>
        ${who.all ? '<p class="hint">Pick a school in Settings to send to all of its teachers at once.</p>' : ''}
      </div>
      <p class="drawer-label" style="margin:12px 0 4px">Sent</p>
      <div class="tn-list">${(data.notes || []).map(n=> `<div class="tn-item"><div class="tn-top"><b>${esc(n.teacherName || n.teacherUid)}</b><span class="hint">${esc(ago(n.createdAtMs))}</span><span class="tn-state ${n.read ? 'read' : ''}">${n.read ? '✓✓ Read' : '✓ Sent'}</span></div>
        ${n.subject ? `<div class="tn-subj">${esc(n.subject)}</div>` : ''}<div class="tn-text">${esc(n.text)}</div></div>`).join('') || '<p class="hint">No notes sent yet.</p>'}</div></div>`;
    const txt = body.querySelector('#tn-text'), cnt = body.querySelector('#tn-count');
    txt.addEventListener('input', ()=>{ cnt.textContent = `${txt.value.length}/1000`; });
    body.querySelector('#tn-send').addEventListener('click', async ()=>{
      const to = body.querySelector('#tn-to').value, text = txt.value.trim();
      if(!text){ toast('Write a note first.'); return; }
      try{
        const r = await AD.sendTeacherNote({ teacherUids: to === 'all' ? 'all' : [to], subject: body.querySelector('#tn-subject').value.trim(), text, from: body.querySelector('#tn-from').value.trim() });
        toast(`✉️ Sent to ${r.sent} teacher${r.sent === 1 ? '' : 's'}`); draw();
      }catch(e){ toast(e.message || String(e)); }
    });
  }
  draw();
  return ()=>{ alive = false; };
}
Object.assign(STRINGS, {
  w_teachernotes: { en:'✉️ Notes to Teachers', vi:'✉️ Ghi chú gửi giáo viên' },
});

function toast(msg, ms){
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast._h);
  toast._h = setTimeout(()=> el.hidden = true, ms || 2200);
}
function emptyState(msg){ return `<p class="empty">${esc(msg)}</p>`; }
function errBox(msg){ return `<p class="err-box">${esc(msg)}</p>`; }

/* ---------------- Theme ---------------- */
const PRESETS = [
  { id:'dusk',  css:'linear-gradient(180deg,#1a2740 0%, #2c3b57 38%, #3f4f68 62%, #263248 100%)' },
  { id:'chalk', css:'linear-gradient(180deg,#2b2f26 0%, #3a4032 60%, #23261e 100%)' },
  { id:'ocean', css:'linear-gradient(180deg,#0e2f3f 0%, #164a5c 55%, #0c2733 100%)' },
  { id:'sunrise', css:'linear-gradient(180deg,#3a2140 0%, #7a4a55 45%, #c98a5e 100%)' },
  { id:'slate', css:'linear-gradient(180deg,#20242c 0%, #2b3038 100%)' },
  { id:'plain', css:'#12161C' }
];
const presetBg = p => (typeof DeckMode !== 'undefined') ? DeckMode.background(p.id, p.css) : p.css;   // Light mode: the same preset, pale (js/mode.js)
let modeSwitch = null, modeToggle = null;   // the Light / Dark switch at the top of the Theme drawer, and its icon-only twin in the top bar (wireThemeDrawer)
const bgLayer = document.getElementById('bg-layer');
const bgOverlay = document.getElementById('bg-overlay');
// A picked background shows immediately from the file itself; if it can't be saved (storage blocked) it lasts for this session only.
let sessionBgUrl = null;
function paintPreset(){
  const p = PRESETS.find(p=>p.id===state.theme) || PRESETS[0];
  bgLayer.style.background = presetBg(p);
  bgLayer.style.backgroundSize = 'cover';
}
function applyTheme(){
  if(sessionBgUrl){ bgLayer.style.background = `center/cover no-repeat url(${sessionBgUrl})`; }
  else if(state.customBg){ /* custom image is applied async from IndexedDB — see initCustomBg() */ }
  else paintPreset();
  bgOverlay.classList.toggle('no-dim', !state.dim);
}
async function initCustomBg(){
  if(!state.customBg) return;
  try{
    const rec = await AD_THEME.idb.get(state.activeBgId || 'background');
    if(rec && rec.blob){ bgLayer.style.background = `center/cover no-repeat url(${URL.createObjectURL(rec.blob)})`; }
    else if(!sessionBgUrl) paintPreset();          // the saved image is gone — show the theme instead of a blank layer
  }catch(err){ console.error('AdminDeck: failed to load custom background', err); if(!sessionBgUrl) paintPreset(); }
}
function buildPresetSwatches(){
  const grid = document.getElementById('theme-presets');
  grid.innerHTML = '';
  PRESETS.forEach(p=>{
    const sw = document.createElement('button');
    sw.className = 'swatch' + ((!state.customBg && !sessionBgUrl && state.theme===p.id) ? ' active' : '');
    sw.style.background = presetBg(p);
    sw.setAttribute('aria-label', p.id); sw.title = p.id;
    sw.addEventListener('click', ()=>{
      state.theme = p.id; state.customBg = false;
      if(sessionBgUrl){ URL.revokeObjectURL(sessionBgUrl); sessionBgUrl = null; }
      saveState(); applyTheme(); buildPresetSwatches(); updatePushPreview();
    });
    grid.appendChild(sw);
  });
  const rm = document.getElementById('bg-remove'); if(rm) rm.hidden = !(state.customBg || sessionBgUrl);
}

/* ---------------- Language ---------------- */
function setLanguage(code){
  state.lang = code; saveState();
  document.documentElement.lang = code;
  localizeNode(document);
  rebuildAllDocks();
  buildLangToggle();
  paintStatusPill(lastStatusKey, lastStatusCls);
  refreshWidgetTitles();
  buildLayoutModeSelector(); buildDockPlacementList(); updatePushPreview();
  [modeSwitch, modeToggle].forEach(sw=>{ if(sw) sw.relabel({ label:t('mode_title'), light:t('mode_light'), dark:t('mode_dark') }); });
  if(widgetEls.schoolstats) ssRerender();
  // Re-render the other open widgets' bodies too, so their text changes language along with the title bar. The data comes from AD's
  // session cache, so nothing is refetched. (School Stats is excluded: it keeps its own focus/range state and has ssRerender above.)
  Object.keys(widgetEls).forEach(id=>{
    if(id === 'schoolstats') return;
    const def = WIDGETS.find(w=>w.id===id), rec = widgetEls[id];
    if(!def || !rec) return;
    if(typeof rec.cleanup === 'function') rec.cleanup();
    rec.cleanup = ProGate.render(def, rec.el.querySelector('.widget-body'));
  });
}
function buildLangToggle(){
  const box = document.getElementById('lang-toggle');
  box.innerHTML = '';
  state.langPair.forEach(code=>{
    const lang = LANGS.find(l=>l.code===code);
    if(!lang) return;
    const btn = document.createElement('button');
    btn.textContent = lang.code.toUpperCase();
    btn.title = lang.name;
    btn.className = state.lang === code ? 'active' : '';
    btn.addEventListener('click', ()=> setLanguage(code));
    box.appendChild(btn);
  });
}
function buildLangSelects(){
  const sel1 = document.getElementById('lang-select-1');
  const sel2 = document.getElementById('lang-select-2');
  [sel1, sel2].forEach(sel=>{ sel.innerHTML = LANGS.map(l=>`<option value="${l.code}">${l.name}</option>`).join(''); });
  sel1.value = state.langPair[0];
  sel2.value = state.langPair[1];
  function onPairChange(){
    state.langPair = [sel1.value, sel2.value];
    saveState();
    if(!state.langPair.includes(state.lang)) setLanguage(state.langPair[0]);
    else buildLangToggle();
  }
  sel1.onchange = onPairChange;                          // assigned, not added: this runs every time Settings opens
  sel2.onchange = onPairChange;
}

/* ---------------- Widget panel system (open/close/drag/resize) ----------------
   Same mechanics as TeachersDeck: one free-form wall, panels positioned with
   absolute left/top/width/height, a z-index counter for "bring to front", and
   a single window-level pointer gesture tracker so a lost pointer capture
   can't strand a drag. Ported from js/app.js there — see its comments for why
   it's shaped this way (bringToFront via z-index rather than DOM reinsertion,
   etc.). */
const wall = document.getElementById('wall');
const widgetEls = {};
let topZ = 10;
function bringToFront(el){
  if(el.classList.contains('full')) return;          // full-screen widgets (School Stats) stay underneath the floating ones
  if(+el.style.zIndex === topZ) return;
  el.style.zIndex = ++topZ;
}
let gesture = null;
function startGesture(g){
  if(gesture && gesture.pointerId !== g.pointerId) endGesture();
  gesture = g;
  bringToFront(g.el);
  if(g.kind === 'move') g.el.classList.add('dragging');
}
/* The wall fills the whole window, but the top bar and the dock are drawn ABOVE it (z-index 5 vs the wall's 2). Before v0.4.1 a window could be
   dragged until its title bar sat under either of them — and a title bar you can't click can't be dragged back ("I can't move a window if I
   put it at the top"). Now the title bar always stays inside the free band between the two. rescueWidgets() applies the same rule to
   windows already stranded by an older build (saved layouts) and after the browser window is resized. */
function freeBand(){
  const tb = document.querySelector('.topbar'), dk = document.getElementById('dock-wrap');
  const top = state.toolbarAutoHide ? 8 : (tb ? Math.ceil(tb.getBoundingClientRect().bottom) : 0);   // auto-hide: only the 8px handle is ever in the way
  const dockTop = dk ? Math.floor(dk.getBoundingClientRect().top) : wall.clientHeight;
  return { top: Math.max(0, top), bottom: dockTop > 0 ? Math.min(wall.clientHeight || dockTop, dockTop) : wall.clientHeight };
}
function clampToBand(el, x, y){
  const band = freeBand(), head = el.querySelector('.widget-head'), hh = (head && head.offsetHeight) || 44;
  const maxX = Math.max(0, wall.clientWidth - 150);
  const maxY = Math.max(band.top, band.bottom - hh);
  return { x: Math.min(maxX, Math.max(0, x)), y: Math.min(maxY, Math.max(band.top, y)) };
}
function rescueWidgets(){
  let changed = false;
  Object.keys(widgetEls).forEach(id => {
    const rec = widgetEls[id]; if(!rec || rec.el.classList.contains('full')) return;
    const p = clampToBand(rec.el, rec.el.offsetLeft, rec.el.offsetTop);
    if(p.x !== rec.el.offsetLeft || p.y !== rec.el.offsetTop){
      rec.el.style.left = p.x + 'px'; rec.el.style.top = p.y + 'px';
      const l = state.layout[id]; if(l){ l.x = p.x; l.y = p.y; }
      changed = true;
    }
  });
  if(changed) saveState();
}
window.addEventListener('resize', rescueWidgets);
function moveGesture(e){
  if(!gesture || e.pointerId !== gesture.pointerId) return;
  const g = gesture;
  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if(g.kind === 'move'){
    const p = clampToBand(g.el, g.ox + dx, g.oy + dy);
    g.el.style.left = p.x + 'px';
    g.el.style.top  = p.y + 'px';
  } else {
    g.el.style.width  = Math.max(260, g.ox + dx) + 'px';
    g.el.style.height = Math.max(160, g.oy + dy) + 'px';
  }
}
function endGesture(e){
  if(!gesture) return;
  if(e && e.pointerId !== undefined && e.pointerId !== gesture.pointerId) return;
  const g = gesture;
  gesture = null;
  g.el.classList.remove('dragging');
  const layout = state.layout[g.id];
  if(layout){
    if(g.kind === 'move'){ layout.x = g.el.offsetLeft; layout.y = g.el.offsetTop; }
    else { layout.w = g.el.offsetWidth; layout.h = g.el.offsetHeight; }
    saveState();
  }
}
window.addEventListener('pointermove', moveGesture);
window.addEventListener('pointerup', endGesture);
window.addEventListener('pointercancel', endGesture);
window.addEventListener('blur', ()=> endGesture());

function makeDraggable(el, id){
  const head = el.querySelector('.widget-head');
  head.addEventListener('pointerdown', e=>{
    if(e.button != null && e.button !== 0) return;
    if(e.target.closest('.widget-head-actions')) return;
    startGesture({ kind:'move', el, id, pointerId:e.pointerId, sx:e.clientX, sy:e.clientY, ox:el.offsetLeft, oy:el.offsetTop });
    try{ head.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
  });
  el.addEventListener('pointerdown', ()=> bringToFront(el));
}
function makeResizable(el, id){
  const handle = el.querySelector('.widget-resize');
  handle.addEventListener('pointerdown', e=>{
    if(e.button != null && e.button !== 0) return;
    startGesture({ kind:'size', el, id, pointerId:e.pointerId, sx:e.clientX, sy:e.clientY, ox:el.offsetWidth, oy:el.offsetHeight });
    try{ handle.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault(); e.stopPropagation();
  });
}
function defaultLayout(def){
  const usedCount = Object.keys(state.layout).filter(k => { const d = WIDGETS.find(w => w.id === k); return !(d && d.full); }).length;
  return { x: 24 + (usedCount % 4) * 40, y: Math.max(90, freeBand().top + 12) + (usedCount % 4) * 34, w: def.w, h: def.h };
}
function openWidget(id){
  const def = WIDGETS.find(w=>w.id===id);
  if(def && !widgetOn(id)) return;                       // an inactive widget (School Snapshot) stays closed, whoever asks
  if(!def || widgetEls[id]){ state.active[id] = true; return; }
  state.active[id] = true;
  // A `full` widget fills the wall: no x/y/w/h, no dragging or resizing (CSS .widget.full does the sizing); only `minimized` is remembered.
  const layout = state.layout[id] || (def.full ? {} : defaultLayout(def));
  state.layout[id] = layout;

  const el = document.createElement('section');
  el.className = 'widget' + (def.full ? ' full' : '') + (layout.minimized ? ' minimized' : '');
  el.dataset.wid = id;   // which widget this is (js/bento.js: tile sizes and order on phones and tablets)
  if(!def.full){
    el.style.left = layout.x+'px'; el.style.top = layout.y+'px'; el.style.width = layout.w+'px';
    if(layout.h && !layout.minimized) el.style.height = layout.h+'px';
  }
  el.innerHTML = `
    <div class="widget-head">
      <button class="widget-drag" aria-label="${t('move_action')}">${iconSvg('grip','wsvg')}</button>
      <span class="widget-title">${esc(widgetLabel(def.labelKey))}</span>
      <div class="widget-head-actions">
        <button class="widget-min" aria-label="${t(layout.minimized ? 'restore_action' : 'minimize_action')}">${iconSvg(layout.minimized ? 'restore' : 'minimize','wsvg')}</button>
        <button class="widget-close" aria-label="${t('close')}">${iconSvg('close','wsvg')}</button>
      </div>
    </div>
    <div class="widget-body"></div>
    <div class="widget-resize"><svg viewBox="0 0 14 14"><path d="M12 2L2 12M12 7L7 12M12 12h0" stroke="currentColor" stroke-width="1.4"/></svg></div>
  `;
  wall.appendChild(el);
  widgetEls[id] = { el, cleanup:null };
  bringToFront(el);
  if(!def.full){ makeDraggable(el, id); makeResizable(el, id); }
  el.querySelector('.widget-close').addEventListener('click', ()=> toggleWidget(id));
  el.querySelector('.widget-min').addEventListener('click', ()=> toggleMinimize(id));

  const body = el.querySelector('.widget-body');
  const cleanup = ProGate.render(def, body);
  widgetEls[id].cleanup = cleanup;
  syncFullscreen();
}
/* v0.4.2: a full-screen widget (School Stats) really takes the whole screen — it starts at the very top and runs to the bottom edge, with the
   top toolbar hidden and the dock floating over it. The toolbar comes back when the page is minimized or closed, or on request (the
   "Show toolbar" button in the School Stats header, remembered in state.statsUI.showToolbar). Floating windows are re-checked afterwards because
   the free band at the top changes size. */
function syncFullscreen(){
  const full = Object.keys(widgetEls).some(id => { const r = widgetEls[id]; return r && r.el.classList.contains('full') && !r.el.classList.contains('minimized'); });
  const on = full && !state.toolbarAutoHide && !(state.statsUI && state.statsUI.showToolbar);   // with auto-hide the toolbar is already out of the way
  document.body.classList.toggle('ss-fullscreen', on);
  rescueWidgets();
}
function toggleMinimize(id){
  const rec = widgetEls[id]; const layout = state.layout[id];
  if(!rec || !layout) return;
  const minBtn = rec.el.querySelector('.widget-min');
  if(!layout.minimized){
    layout.prevH = rec.el.offsetHeight; layout.minimized = true;
    rec.el.classList.add('minimized'); rec.el.style.height = '';
  } else {
    layout.minimized = false; rec.el.classList.remove('minimized');
    if(!rec.el.classList.contains('full')) rec.el.style.height = (layout.prevH || layout.h || 260) + 'px';
  }
  minBtn.innerHTML = iconSvg(layout.minimized ? 'restore' : 'minimize','wsvg');
  minBtn.setAttribute('aria-label', t(layout.minimized ? 'restore_action' : 'minimize_action'));
  saveState();
  syncFullscreen();
}
function closeWidget(id){
  state.active[id] = false;
  const rec = widgetEls[id];
  if(rec){ if(typeof rec.cleanup === 'function') rec.cleanup(); rec.el.remove(); delete widgetEls[id]; }
  syncFullscreen();
}
function toggleWidget(id){
  if(state.active[id]) closeWidget(id); else openWidget(id);
  saveState(); syncDock();
}
function syncDock(){
  document.querySelectorAll('.dock-item[data-id], .dock-top-item[data-id], .app-tray-item[data-id]').forEach(b=>{
    b.classList.toggle('active', !!state.active[b.dataset.id]);
  });
}

/* ---------------- Layout modes, docks and app tray (ported from TeachersDeck v0.15.1) ----------------
   Every widget lives in exactly one launcher: the bottom dock (up to 10), the left or right drawer (up to 5 each), the top toolbar
   (icon-only, up to 5) or none ('hidden' — still reachable any time from the app tray). The layout mode decides which docks are SHOWN:
     Compact — just the bottom dock (the app tray has everything); emoji icons off.
     Cozy    — bottom, left and right docks all shown; emoji icons on.        (default on a new device)
     Custom  — you pick each widget's dock and toggle the drawers yourself.   (a device that predates layout modes starts here, with every
                                                                                 widget still in the one bottom dock it had)
   A widget's assigned dock never changes with the mode; only whether that dock is shown. */
const DOCK_CAPS = { bottom:10, left:5, right:5, top:5 };
const LAYOUT_MODES = ['compact', 'cozy', 'custom'];
const PLACEMENT_OPTIONS = ['bottom', 'left', 'right', 'top', 'hidden'];
// First-run spread for Cozy: the everyday pages along the bottom, the lookup tools in the side drawers.
const DEFAULT_PLACEMENT = { snapshot:'bottom', schoolstats:'bottom', assignments:'bottom', calendar:'bottom', rosterhealth:'bottom',
                            points:'left', joincodes:'right', teachers:'right',
                            pulse:'bottom', funnel:'left', families:'left', engage:'right', directory:'bottom', schooldeck:'bottom' };

/* v0.8.0 — five widgets became two (Assignment Pipeline + Homework Completion = Assignments; Points Leaderboard + Points & Rewards Economy = Points & Rewards),
   Class Comparison moved into the School Stats class table, and School Snapshot is INACTIVE: still in the code and in Settings -> Inactive widgets, just off
   the docks, the tray and the default window until someone turns it back on. migrateWidgets() carries a device's saved layout across once. */
const WIDGET_MERGES = { pipeline:'assignments', hwrates:'assignments', leaderboard:'points', economy:'points' };    // old id -> the widget that now holds it (first one listed wins the window position)
const WIDGET_RETIRED = ['compare'];
const widgetOn = id => !(state.deactivated && state.deactivated[id]);
function migrateWidgets(){
  if(state.widgetsV >= 2) return;
  Object.keys(WIDGET_MERGES).forEach(old => {
    const nu = WIDGET_MERGES[old];
    if(state.active[old]) state.active[nu] = true;
    if(state.layout[old] && !state.layout[nu]) state.layout[nu] = state.layout[old];
    const place = state.dockPlacement[old];
    if(place && (!state.dockPlacement[nu] || (state.dockPlacement[nu] === 'hidden' && place !== 'hidden'))) state.dockPlacement[nu] = place;
    delete state.active[old]; delete state.layout[old]; delete state.dockPlacement[old];
  });
  WIDGET_RETIRED.forEach(old => { delete state.active[old]; delete state.layout[old]; delete state.dockPlacement[old]; });
  state.deactivated.snapshot = true; state.active.snapshot = false;      // one time: Snapshot goes inactive (kept). School Stats' overview row is the same six numbers.
  state.widgetsV = 2; saveState();
}
function setWidgetActive(id, on){
  if(on){
    delete state.deactivated[id];
    const p = state.dockPlacement[id];
    if(!p || p === 'hidden'){ const want = DEFAULT_PLACEMENT[id] || 'bottom'; state.dockPlacement[id] = placementCount(want) >= DOCK_CAPS[want] ? 'hidden' : want; }
  } else {
    state.deactivated[id] = true; state.active[id] = false;
    if(widgetEls[id]) closeWidget(id);
  }
  saveState(); rebuildAllDocks(); buildDockPlacementList(); syncDock();
}
function buildInactiveList(){
  const box = document.getElementById('inactive-widgets-list'); if(!box) return;
  box.innerHTML = '';
  WIDGETS.filter(w => w.deactivatable).forEach(w => {
    const row = document.createElement('label'); row.className = 'switch-row';
    row.innerHTML = `<span>${esc(widgetLabel(w.labelKey))}</span><input type="checkbox" ${widgetOn(w.id) ? 'checked' : ''}>`;
    row.querySelector('input').addEventListener('change', e => setWidgetActive(w.id, e.target.checked));
    box.appendChild(row);
  });
}

function widgetsFor(loc){
  const list = WIDGETS.filter(w => widgetOn(w.id) && state.dockPlacement[w.id] === loc);
  return DOCK_CAPS[loc] ? list.slice(0, DOCK_CAPS[loc]) : list;     // past the cap a widget simply isn't drawn there (the tray still has it)
}
function placementCount(loc){ return widgetsFor(loc).length; }
function ensureDockPlacement(){
  let changed = false;
  WIDGETS.forEach(w => {
    if(state.dockPlacement[w.id]) return;
    state.dockPlacement[w.id] = state.legacyDocks ? 'bottom' : (DEFAULT_PLACEMENT[w.id] || 'hidden');
    changed = true;
  });
  if(state.legacyDocks){ delete state.legacyDocks; changed = true; }
  if(changed) saveState();
}

function effectiveSideVisible(side){
  if(state.layoutMode === 'compact') return false;
  if(state.layoutMode === 'cozy') return true;
  return !!state.edgeDock[side].visible;
}
function emojisVisible(){
  if(state.layoutMode === 'compact') return false;
  if(state.layoutMode === 'cozy') return true;
  return !!state.showEmojisCustom;
}
function stripLeadingEmoji(s){ return String(s).replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, ''); }
// The one place that decides whether a widget's on-screen name carries its emoji (dock buttons, tray, open windows' title bars).
function widgetLabel(key){ const s = t(key); return emojisVisible() ? s : stripLeadingEmoji(s); }
function refreshWidgetTitles(){
  Object.keys(widgetEls).forEach(id=>{
    const def = WIDGETS.find(w=>w.id===id), el = widgetEls[id] && widgetEls[id].el.querySelector('.widget-title');
    if(def && el) el.textContent = widgetLabel(def.labelKey);
  });
  if(typeof widgetEls !== 'undefined' && widgetEls.schoolstats && typeof ssRerender === 'function') ssRerender();
}

function makeDockButton(w){
  const btn = document.createElement('button');
  btn.className = 'dock-item' + (state.active[w.id] ? ' active' : '');
  btn.dataset.id = w.id;
  btn.innerHTML = `<span class="dock-ic">${iconSvg(w.icon)}</span><span class="lbl" data-i18n-widget-label="${w.labelKey}">${esc(widgetLabel(w.labelKey))}</span>`;
  btn.title = t(w.labelKey);
  btn.addEventListener('click', ()=> toggleWidget(w.id));
  return btn;
}
function buildDock(){
  const dock = document.getElementById('dock');
  dock.innerHTML = '';
  widgetsFor('bottom').forEach(w=> dock.appendChild(makeDockButton(w)));
  applyDockAutoHide();
}
function buildSideDock(side){
  const wrapper = document.getElementById(`dock-${side}`), box = document.getElementById(`dock-${side}-items`);
  box.innerHTML = '';
  widgetsFor(side).forEach(w=> box.appendChild(makeDockButton(w)));
  wrapper.hidden = !effectiveSideVisible(side) || !box.children.length;      // an empty drawer would just be a stray empty pill
}
function makeTopDockButton(w){
  const btn = document.createElement('button');
  btn.className = 'dock-top-item' + (state.active[w.id] ? ' active' : '');
  btn.dataset.id = w.id; btn.title = t(w.labelKey); btn.setAttribute('aria-label', t(w.labelKey));
  btn.innerHTML = iconSvg(w.icon);
  btn.addEventListener('click', ()=> toggleWidget(w.id));
  return btn;
}
function buildTopWidgetDock(){
  const box = document.getElementById('dock-top-widgets');
  box.innerHTML = '';
  widgetsFor('top').forEach(w=> box.appendChild(makeTopDockButton(w)));
}
function applyDockAutoHide(){ const w = document.getElementById('dock-wrap'); if(w) w.classList.toggle('auto-hide', !!state.dockAutoHide); }
// v0.5.0 — the top toolbar slides away until the pointer reaches the top edge.
function applyToolbarAutoHide(){
  document.getElementById('topbar').classList.toggle('auto-hide', !!state.toolbarAutoHide);
  document.body.classList.toggle('toolbar-autohide', !!state.toolbarAutoHide);
  syncFullscreen();                                      // the free band at the top just changed size; re-check School Stats and floating windows
}
const PILLS = [
  { id:'status', el: ()=> document.getElementById('status-pill') },
  { id:'lang',   el: ()=> document.getElementById('lang-toggle') },
  { id:'theme',  el: ()=> document.getElementById('btn-theme') },
  { id:'mode',   el: ()=> document.getElementById('mode-toggle') }   // Light / Dark, just left of Settings as in every suite app
];
function applyPills(){ PILLS.forEach(p=>{ const el = p.el(); if(el) el.style.display = (state.pillPlacement[p.id] || 'top') === 'hidden' ? 'none' : ''; }); }

function makeAppTrayButton(w){
  const btn = document.createElement('button');
  btn.className = 'app-tray-item' + (state.active[w.id] ? ' active' : '');
  btn.dataset.id = w.id;
  btn.innerHTML = `<span class="dock-ic">${iconSvg(w.icon)}</span><span data-i18n-widget-label="${w.labelKey}">${esc(widgetLabel(w.labelKey))}</span>`;
  btn.addEventListener('click', ()=> toggleWidget(w.id));
  return btn;
}
function buildAppTray(){
  const grid = document.getElementById('app-tray-grid');
  grid.innerHTML = '';
  WIDGETS.filter(w => widgetOn(w.id)).forEach(w=> grid.appendChild(makeAppTrayButton(w)));      // every ACTIVE widget, whatever its dock or the layout mode
}
function rebuildAllDocks(){ buildDock(); buildSideDock('left'); buildSideDock('right'); buildTopWidgetDock(); buildAppTray(); syncDock(); }

function buildLayoutModeSelector(){
  const grid = document.getElementById('layout-mode-grid');
  if(!grid) return;
  grid.innerHTML = '';
  LAYOUT_MODES.forEach(mode=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layout-mode-opt' + (state.layoutMode === mode ? ' active' : '');
    btn.dataset.mode = mode;
    btn.innerHTML = `<span class="layout-mode-name">${esc(t('layout_mode_' + mode))}</span><span class="layout-mode-desc">${esc(t('layout_mode_' + mode + '_desc'))}</span>`;
    btn.addEventListener('click', ()=>{
      if(state.layoutMode === mode) return;
      state.layoutMode = mode; saveState();
      rebuildAllDocks(); buildLayoutModeSelector(); buildDrawerSettings(); buildDockPlacementList(); buildEmojiToggle();
      localizeNode(document); refreshWidgetTitles();
    });
    grid.appendChild(btn);
  });
}
function buildEmojiToggle(){
  const chk = document.getElementById('show-emojis-toggle');
  if(!chk) return;
  const locked = state.layoutMode !== 'custom';
  chk.checked = emojisVisible(); chk.disabled = locked;
  chk.closest('.switch-row').classList.toggle('locked', locked);
  const hint = document.getElementById('emoji-lock-hint'); if(hint) hint.hidden = !locked;
  chk.onchange = e=>{ state.showEmojisCustom = e.target.checked; saveState(); rebuildAllDocks(); localizeNode(document); refreshWidgetTitles(); };
}
function buildDockPlacementList(){
  const box = document.getElementById('dock-vis-list');
  if(!box) return;
  box.innerHTML = '';
  const locked = state.layoutMode !== 'custom';
  const hint = document.getElementById('dock-buttons-lock-hint'); if(hint) hint.hidden = !locked;
  WIDGETS.filter(w => widgetOn(w.id)).forEach(w=>{
    const row = document.createElement('div');
    row.className = 'dock-vis-row placement-row' + (locked ? ' locked' : '');
    row.innerHTML = `<span>${esc(widgetLabel(w.labelKey))}</span>`;
    const sel = document.createElement('select');
    sel.disabled = locked;
    PLACEMENT_OPTIONS.forEach(opt=>{
      const o = document.createElement('option'); o.value = opt; o.textContent = t('placement_' + opt); sel.appendChild(o);
    });
    sel.value = state.dockPlacement[w.id] || 'hidden';
    sel.addEventListener('change', ()=>{
      const target = sel.value;
      if(target !== 'hidden' && placementCount(target) >= DOCK_CAPS[target]){
        toast(t('drawer_full_toast', { side: t('placement_' + target), max: DOCK_CAPS[target] }));
        sel.value = state.dockPlacement[w.id] || 'hidden';
        return;
      }
      state.dockPlacement[w.id] = target; saveState(); rebuildAllDocks();
    });
    row.appendChild(sel);
    box.appendChild(row);
  });
  buildInactiveList();
}
// These controls are static nodes in index.html that get revisited whenever the layout mode changes, so handlers are ASSIGNED (.onchange), not added.
function buildDrawerSettings(){
  const locked = state.layoutMode !== 'custom';
  const leftChk = document.getElementById('drawer-left-visible'), rightChk = document.getElementById('drawer-right-visible');
  leftChk.checked = effectiveSideVisible('left'); rightChk.checked = effectiveSideVisible('right');
  leftChk.disabled = locked; rightChk.disabled = locked;
  leftChk.closest('.switch-row').classList.toggle('locked', locked); rightChk.closest('.switch-row').classList.toggle('locked', locked);
  const hint = document.getElementById('drawers-lock-hint'); if(hint) hint.hidden = !locked;
  leftChk.onchange = e=>{ state.edgeDock.left.visible = e.target.checked; saveState(); rebuildAllDocks(); };
  rightChk.onchange = e=>{ state.edgeDock.right.visible = e.target.checked; saveState(); rebuildAllDocks(); };

  const dockChk = document.getElementById('dock-autohide-toggle'), barChk = document.getElementById('toolbar-autohide-toggle');
  dockChk.checked = !!state.dockAutoHide; barChk.checked = !!state.toolbarAutoHide;
  dockChk.onchange = e=>{ state.dockAutoHide = e.target.checked; saveState(); applyDockAutoHide(); rescueWidgets(); };
  barChk.onchange = e=>{ state.toolbarAutoHide = e.target.checked; saveState(); applyToolbarAutoHide(); };

  PILLS.forEach(p=>{
    const sel = document.getElementById('pill-place-' + p.id);
    sel.value = state.pillPlacement[p.id] || 'top';
    sel.onchange = ()=>{ state.pillPlacement[p.id] = sel.value; saveState(); applyPills(); };
  });
}

function openAppTray(){
  const backdrop = document.getElementById('app-tray-backdrop'), tab = document.getElementById('app-tray-tab');
  backdrop.hidden = false; tab.classList.add('open'); tab.setAttribute('aria-expanded','true');
}
function closeAppTray(){
  const backdrop = document.getElementById('app-tray-backdrop'), tab = document.getElementById('app-tray-tab');
  backdrop.hidden = true; tab.classList.remove('open'); tab.setAttribute('aria-expanded','false');
}
function wireAppTray(){
  const tab = document.getElementById('app-tray-tab'), backdrop = document.getElementById('app-tray-backdrop'), handle = document.getElementById('app-tray-handle');
  tab.addEventListener('click', ()=> backdrop.hidden ? openAppTray() : closeAppTray());
  handle.addEventListener('click', closeAppTray);
  backdrop.addEventListener('click', e=>{ if(e.target === backdrop) closeAppTray(); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && !backdrop.hidden) closeAppTray(); });
}

/* ---------------- Connection status pill + Settings drawer ---------------- */
let lastStatusKey = 'status_checking', lastStatusCls = '';
function paintStatusPill(key, cls){
  lastStatusKey = key; lastStatusCls = cls || '';
  const pill = document.getElementById('status-pill'), txt = document.getElementById('status-pill-text');
  pill.className = 'status-pill' + (cls ? ' ' + cls : '');
  txt.textContent = t(key);
}
async function refreshStatusPill(){
  if(typeof AD_DEMO !== 'undefined' && AD_DEMO.active){ paintStatusPill('status_demo', 'ok'); return; }   // js/demo.js
  if(!AD.isConfigured()){ paintStatusPill('status_not_set_up'); return; }
  paintStatusPill('status_checking');
  try{ await AD.getClasses(); paintStatusPill('status_connected', 'ok'); }
  catch(e){ paintStatusPill('status_error', 'err'); }
}
function buildConnectionFields(){
  const cfg = AD.getConfig();
  document.getElementById('cfg-project').value = cfg.project;
  document.getElementById('cfg-region').value = cfg.region;
  document.getElementById('cfg-secret').value = cfg.secret;
  document.getElementById('cfg-status').textContent = '';
}
function wireSettingsDrawer(){
  const drawer = document.getElementById('settings-drawer');
  document.getElementById('btn-settings').addEventListener('click', ()=>{
    buildConnectionFields();
    buildLangSelects();
    buildTermsEditor();
    buildLayoutModeSelector(); buildEmojiToggle(); buildDockPlacementList(); buildDrawerSettings();
    drawer.hidden = false;
  });
  document.getElementById('settings-close').addEventListener('click', ()=> drawer.hidden = true);

  document.getElementById('cfg-save').addEventListener('click', async ()=>{
    const cfg = {
      project: document.getElementById('cfg-project').value.trim() || AD.getConfig().project,
      region: document.getElementById('cfg-region').value.trim() || AD.getConfig().region,
      secret: document.getElementById('cfg-secret').value.trim()
    };
    AD.setConfig(cfg);
    AD.refreshAll();
    const statusEl = document.getElementById('cfg-status');
    statusEl.textContent = t('cfg_saved');
    await refreshStatusPill();
    statusEl.textContent = t(lastStatusKey);               // replaces "Saved. Reconnecting…" once the pill knows the real outcome
    refreshOpenWidgets();
  });

  document.getElementById('reset-layout').addEventListener('click', ()=>{
    Object.keys(widgetEls).forEach(id=> closeWidget(id));
    state.layout = {};
    state.active[DEFAULT_WINDOW] = true;                   // the default window always comes back
    WIDGETS.forEach(w=> state.active[w.id] && openWidget(w.id));
    saveState(); syncDock();
    toast(t('refreshed'));
  });
  document.getElementById('reset-all').addEventListener('click', ()=>{
    if(!confirm(t('reset_all_confirm'))) return;
    try{ localStorage.removeItem(LS_KEY); }catch(e){}
    try{ localStorage.removeItem('ad_admin_project'); localStorage.removeItem('ad_admin_region'); localStorage.removeItem('ad_admin_secret'); }catch(e){}
    AD_THEME.idb.destroy();                                 // the saved background image
    location.reload();
  });

  document.getElementById('app-version').textContent = `${APP} ${APP_VERSION}`;
}

/* ---------------- Theme drawer: background image + push to TeachersDeck ---------------- */
let sessionBgBlob = null, pushThumbUrl = null, pushIds = [];
async function currentBackgroundBlob(){
  if(sessionBgBlob) return sessionBgBlob;
  if(!state.customBg) return null;
  const rec = await AD_THEME.idb.get(state.activeBgId || 'background');
  return rec && rec.blob ? rec.blob : null;
}
function updatePushPreview(){
  const box = document.getElementById('push-preview'); if(!box) return;
  const custom = !!(state.customBg || sessionBgUrl);
  const p = PRESETS.find(p=>p.id===state.theme) || PRESETS[0];
  const label = custom ? t('push_preview_image') : t('push_preview_preset', { name: p.id });
  box.innerHTML = `<span class="thumb" style="background:${custom ? '#12161C' : presetBg(p)}"></span><span>${esc(label)} · ${esc(t(state.dim ? 'push_dim_on' : 'push_dim_off'))}</span>`;
  if(custom){
    currentBackgroundBlob().then(b=>{
      if(!b) return;
      if(pushThumbUrl) URL.revokeObjectURL(pushThumbUrl);
      pushThumbUrl = URL.createObjectURL(b);
      const th = box.querySelector('.thumb'); if(th) th.style.background = `center/cover no-repeat url(${pushThumbUrl})`;
    }).catch(()=>{});
  }
}
async function buildPushClasses(){
  const box = document.getElementById('push-classes');
  box.innerHTML = ''; pushIds = [];
  let classes = [];
  try{ classes = await AD.getClasses(); }catch(e){ box.innerHTML = `<p class="hint">${esc(t('push_need_connect'))}</p>`; return; }
  if(!classes.length){ box.innerHTML = `<p class="hint">${esc(t('push_no_classes'))}</p>`; return; }
  classes.forEach(c=>{
    const row = document.createElement('label'); row.className = 'dock-vis-row';
    row.innerHTML = `<input type="checkbox" value="${esc(c.id)}"><span>${esc(c.className)}${c.teacherName ? ' · ' + esc(c.teacherName) : ''}</span>`;
    row.querySelector('input').addEventListener('change', ()=>{ pushIds = [...box.querySelectorAll('input:checked')].map(i=>i.value); });
    box.appendChild(row);
  });
}
async function pushTargets(){        // -> { ids: 'all' | [ids], n }
  const pick = document.getElementById('push-scope').value === 'pick';
  if(pick){ if(!pushIds.length) throw new Error(t('push_pick_none')); return { ids: pushIds.slice(), n: pushIds.length }; }
  let classes; try{ classes = await AD.getClasses(); }catch(e){ throw new Error(t('push_need_connect')); }
  return { ids: 'all', n: classes.length };
}
function wireThemeDrawer(){
  const drawer = document.getElementById('theme-drawer');
  if(typeof DeckMode !== 'undefined'){            // Light / Dark (js/mode.js): only this AdminDeck's look; "Push to teachers" sends the background, not the mode
    modeSwitch = DeckMode.mountSwitch(document.getElementById('mode-switch'), { label:t('mode_title'), light:t('mode_light'), dark:t('mode_dark') });
    modeToggle = DeckMode.mountSwitch(document.getElementById('mode-toggle'), { label:t('mode_title'), light:t('mode_light'), dark:t('mode_dark') }, { compact:true });
    DeckMode.onChange(()=>{ applyTheme(); buildPresetSwatches(); updatePushPreview(); });
  }
  const status = document.getElementById('push-status'), confirmBox = document.getElementById('push-confirm');
  const setStatus = msg => { status.textContent = msg || ''; };
  document.getElementById('btn-theme').addEventListener('click', ()=>{
    buildPresetSwatches();
    document.getElementById('dim-toggle').checked = !!state.dim;
    updatePushPreview(); buildPushClasses(); setStatus(''); confirmBox.hidden = true;
    drawer.hidden = false;
  });
  document.getElementById('theme-close').addEventListener('click', ()=> drawer.hidden = true);
  document.getElementById('dim-toggle').addEventListener('change', e=>{
    state.dim = e.target.checked; saveState(); applyTheme(); updatePushPreview();
  });

  // Upload: shows at once from the file itself, then tries to remember it (IndexedDB), as TeachersDeck does.
  document.getElementById('bg-upload').addEventListener('change', async e=>{
    const file = e.target.files[0];
    e.target.value = '';
    if(!file) return;
    if(sessionBgUrl) URL.revokeObjectURL(sessionBgUrl);
    sessionBgUrl = URL.createObjectURL(file); sessionBgBlob = file;
    applyTheme(); buildPresetSwatches(); updatePushPreview();
    try{
      await Promise.race([AD_THEME.idb.put({ id:'background', blob:file }), new Promise((_, rej)=> setTimeout(()=> rej(new Error('timed out saving background')), 6000))]);
      state.activeBgId = 'background'; state.customBg = true; saveState();
      sessionBgUrl = null;                                 // saved: from here on it loads from storage like any custom background
      buildPresetSwatches(); updatePushPreview();
      toast(t('bg_updated'));
    }catch(err){
      console.error('AdminDeck: background applied but could not be saved', err);
      toast(t('bg_not_saved'), 5000);
    }
  });
  document.getElementById('bg-remove').addEventListener('click', async ()=>{
    if(sessionBgUrl){ URL.revokeObjectURL(sessionBgUrl); sessionBgUrl = null; }
    sessionBgBlob = null; state.customBg = false; saveState();
    try{ await AD_THEME.idb.delete(state.activeBgId || 'background'); }catch(e){}
    applyTheme(); buildPresetSwatches(); updatePushPreview();
  });

  // ---- push to TeachersDeck ----
  document.getElementById('push-scope').addEventListener('change', e=>{
    document.getElementById('push-classes').hidden = e.target.value !== 'pick'; confirmBox.hidden = true;
  });
  document.getElementById('push-btn').addEventListener('click', async ()=>{
    setStatus('');
    try{
      const tg = await pushTargets();
      document.getElementById('push-confirm-text').textContent = t('push_confirm_text', { n: tg.n });
      confirmBox.hidden = false;
    }catch(e){ confirmBox.hidden = true; setStatus(e.message); }
  });
  document.getElementById('push-cancel').addEventListener('click', ()=>{ confirmBox.hidden = true; });
  document.getElementById('push-go').addEventListener('click', async ()=>{
    if(ProGate.locked('theme')){ confirmBox.hidden = true; ProGate.cta('theme'); return; }   // v0.9.3: Send to TeachersDeck is Pro
    confirmBox.hidden = true; setStatus(t('push_preparing'));
    const btn = document.getElementById('push-btn'); btn.disabled = true;
    try{
      const tg = await pushTargets();
      let look;
      if(state.customBg || sessionBgUrl){
        const blob = await currentBackgroundBlob();
        if(!blob) throw new Error(t('bg_not_saved'));
        look = { image: await AD_THEME.blobToDataUrl(blob), dim: state.dim };
      } else look = { preset: state.theme, dim: state.dim };
      const res = await AD.pushTheme(tg.ids, AD_THEME.buildPayload(look));
      let msg = t('push_done', { n: res.updated });
      if(res.failed && res.failed.length) msg += ' ' + t('push_unreachable', { m: res.failed.length });
      if(res.missing && res.missing.length) msg += ' ' + t('push_missing', { m: res.missing.length });
      if(typeof AD_DEMO !== 'undefined' && AD_DEMO.active) msg += ' ' + t('push_demo_note');
      setStatus(msg);
    }catch(e){ setStatus(e && e.notDeployed ? t('push_not_deployed') : (e && e.message) || String(e)); }
    finally{ btn.disabled = false; }
  });
}

/* Called by every widget's own Refresh button via AD.refreshAll(), and by
   Settings after a reconnect — re-renders whichever widgets are currently
   open so they pick up fresh data without the person having to close and
   reopen each one. */
function refreshOpenWidgets(){
  Object.keys(widgetEls).forEach(id=>{
    const def = WIDGETS.find(w=>w.id===id);
    const rec = widgetEls[id];
    if(!def || !rec) return;
    if(typeof rec.cleanup === 'function') rec.cleanup();
    const body = rec.el.querySelector('.widget-body');
    rec.cleanup = ProGate.render(def, body);
  });
}

/* ---------------- Shared widget-content helpers ---------------- */
function frameTop(){
  return `<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="wbtn sm" data-refresh>${iconSvg('refresh','wsvg')} ${esc(t('refresh'))}</button></div>`;
}
function wireRefreshBtn(body){
  const btn = body.querySelector('[data-refresh]');
  if(btn) btn.addEventListener('click', ()=>{ AD.refreshAll(); refreshOpenWidgets(); toast(t('refreshed')); });
}
function widgetBoot(body, draw){
  let alive = true;
  async function run(){
    if(!AD.isConfigured()){
      body.innerHTML = frameTop() + emptyState(t('not_configured'));
      wireRefreshBtn(body);
      return;
    }
    body.innerHTML = frameTop() + emptyState(t('loading'));
    try{
      await draw(body, ()=>alive);
    }catch(e){
      if(alive){ body.innerHTML = frameTop() + errBox(e.message || String(e)); wireRefreshBtn(body); }
    }
  }
  run();
  return ()=>{ alive = false; };
}
function dayKeyLocal(d){
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}
function startOfWeek(d){
  const x = new Date(d); const day = (x.getDay()+6)%7;   // Monday-first week
  x.setDate(x.getDate()-day); x.setHours(0,0,0,0);
  return x;
}

/* ---------------- Widget 1: School Snapshot (restored in v0.4.1 — v0.4.0 had folded it into School Stats) ---------------- */
function renderSnapshot(body){
  return widgetBoot(body, async (body, isAlive)=>{
    const classes = await AD.getClasses();
    if(!isAlive()) return;
    const teacherSet = new Set(classes.map(c=>c.teacherUid).filter(Boolean));
    const totalStudents = classes.reduce((a,c)=>a+(c.studentCount||0),0);
    const emptyClasses = classes.filter(c=>!c.studentCount).length;
    const details = await AD.getAllDetails();
    if(!isAlive()) return;
    let sumPoints = 0, nStudents = 0;
    classes.forEach(c=>{
      const d = details.get(c.id);
      if(d && !d.error && d.roster){ d.roster.forEach(s=>{ sumPoints += s.points||0; nStudents++; }); }
    });
    const avg = nStudents ? sumPoints/nStudents : 0;
    const byClass = classes.slice().sort((a,b)=> (b.studentCount||0) - (a.studentCount||0));
    // lastActiveAt (backend v1.3.0): newest StudentDeck sync among a class's students. An older backend omits the field
    // entirely — then the tile stays "not available yet" instead of claiming every class is idle.
    const activeKnown = classes.some(c=> 'lastActiveAt' in c);
    // v0.6.0 order of preference: lastActiveAt (already in the class list, no extra call) -> the Wave 1 summary (only fetched when that is
    // absent) -> 'not available yet', rather than claiming every class is idle.
    const act = activeKnown ? null : await AD.getSchoolActivityOrNull();
    if(!isAlive()) return;
    let activeValue = null, activeHint;
    if(activeKnown){
      const n = classes.filter(c=> c.lastActiveAt && (Date.now() - c.lastActiveAt) <= 7*864e5).length;
      activeValue = `${n}/${classes.length}`; activeHint = t('snap_active_week_note');
    } else if(act){
      activeValue = `${act.school.activity.activeClasses7}/${classes.length}`;
      activeHint = t('snap_active_week_live', { s: act.school.activity.activeStudents7 });
    } else {
      activeHint = t('snap_active_week_unavailable');
    }
    body.innerHTML = frameTop() + `
      <div class="tiles">
        <div class="tile"><b>${classes.length}</b><span>${t('snap_classes')}</span></div>
        <div class="tile"><b>${teacherSet.size}</b><span>${t('snap_teachers')}</span></div>
        <div class="tile"><b>${totalStudents}</b><span>${t('snap_students')}</span></div>
        <div class="tile"><b>${avg.toFixed(1)}</b><span>${t('snap_avg_points')}</span></div>
        <div class="tile${activeValue === null ? ' na' : ''}"><b>${activeValue === null ? t('not_available_yet') : activeValue}</b><span>${t('snap_active_week')}</span></div>
        <div class="tile"><b>${emptyClasses}</b><span>${t('snap_empty_classes')}</span></div>
      </div>
      <p class="hint">${activeHint}</p>
      <h4 class="wh">${t('snap_by_class')}</h4>
      ${byClass.length ? byClass.map(c=>`<div class="arow"><span class="name">${esc(c.className)}</span><span class="meta">${esc(c.teacherName||t('td_no_teacher'))}</span><span class="val">${c.studentCount||0}</span></div>`).join('') : emptyState(t('empty_no_classes'))}
    `;
    wireRefreshBtn(body);
  });
}


/* ---------------- Widget 2: Points Leaderboard ---------------- */

/* ---------------- Widget 3: Class Comparison ---------------- */

/* ---------------- Widget 4: Assignment Pipeline ---------------- */

/* ---------------- Merged widgets (v0.8.0): tab bars, then Assignments and Points & Rewards ---------------- */
function tabsHtml(tabs, cur){
  return `<div class="seg wtabs" role="tablist">${tabs.map(([k, label]) => `<button type="button" class="chip${k === cur ? ' on' : ''}" role="tab" aria-selected="${k === cur}" data-wtab="${k}">${esc(t(label))}</button>`).join('')}</div>`;
}
const widgetTab = (wid, tabs) => { const k = state.tabs[wid]; return tabs.some(x => x[0] === k) ? k : tabs[0][0]; };     // remembered per widget, on this device
function wireTabs(body, wid, redraw){
  body.querySelectorAll('[data-wtab]').forEach(b => b.addEventListener('click', () => { state.tabs[wid] = b.dataset.wtab; saveState(); redraw(); }));
}

/* Assignments = Assignment Pipeline ("Due this week", from the class details) + Homework Completion ("Completion by class", from the activity summary).
   The completion tiles sit above the tabs because they describe both. An older backend without the activity summary still gets the whole pipeline half. */
function pipelineHtml(classes, details){
    const mon = startOfWeek(new Date());
    const days = Array.from({length:7}, (_,i)=>{ const d = new Date(mon); d.setDate(mon.getDate()+i); return d; });
    const weekKeys = new Set(days.map(dayKeyLocal));
    const todayKey = dayKeyLocal(new Date());
    const byDay = {}; days.forEach(d=> byDay[dayKeyLocal(d)] = []);
    const overdue = [];
    const doneText = h => h.doneCount === undefined ? '' : t('pipe_done_of', { done: h.doneCount, total: h.totalStudents || 0 });
    let anyDone = false;
    classes.forEach(c=>{
      const d = details.get(c.id); if(!d || d.error || !d.homework) return;
      if(d.homework.some(h=> h.doneCount !== undefined)) anyDone = true;
      d.homework.forEach(h=>{
        if(!h.dueDate) return;
        const key = String(h.dueDate).slice(0,10);
        const item = { ...h, className: c.className };
        if(weekKeys.has(key)) (byDay[key] = byDay[key] || []).push(item);
        // Past due AND someone hasn't finished. An older backend sends no doneCount — then we can't tell, so keep the old date-only behaviour.
        else if(key < todayKey && (h.doneCount === undefined || h.doneCount < (h.totalStudents || 0))) overdue.push(item);
      });
    });
    overdue.sort((a,b)=> String(b.dueDate).localeCompare(String(a.dueDate)));
    const dayLabel = d => d.toLocaleDateString(LOCALE_MAP[state.lang] || 'en-US', { weekday:'short', month:'short', day:'numeric' });
    const anyThisWeek = Object.values(byDay).some(arr=>arr.length);
    let html = `<h4 class="wh">${t('pipe_due_this_week')}</h4>`;
    if(!anyThisWeek) html += emptyState(t('pipe_empty'));
    else days.forEach(d=>{
      const items = byDay[dayKeyLocal(d)] || [];
      if(!items.length) return;
      html += `<p class="muted" style="margin:10px 0 4px;font-weight:700;font-family:'Quicksand';font-size:11.5px">${esc(dayLabel(d))}</p>`;
      html += items.map(h=>`<div class="arow"><span class="name">${esc(h.title||'—')}</span><span class="meta">${esc(h.className)}</span><span class="val">${doneText(h)}${h.points!=null?' · '+h.points+'p':''}</span></div>`).join('');
    });
    if(overdue.length){
      html += `<h4 class="wh">${t(anyDone ? 'pipe_overdue' : 'pipe_overdue_dateonly')}</h4>`;
      html += overdue.slice(0,25).map(h=>`<div class="arow"><span class="name">${esc(h.title||'—')}</span><span class="meta">${esc(h.className)} · ${esc(String(h.dueDate).slice(0,10))}</span><span class="val">${doneText(h)}</span></div>`).join('');
    }
    if(!overdue.length && anyDone) html += `<p class="hint">${t('pipe_all_done')}</p>`;
    if(anyDone) html += `<p class="hint">${t('pipe_overdue_note')}</p>`;
    return html;
}

function hwRatesParts(act){
    const classes = act.classes.filter(c=> c.homework.assignmentCount > 0);
    if(!classes.length) return { tiles:'', list: emptyState(t('hw_none_any')) };
    const sorted = classes.slice().sort((a,b)=>{
      const av = a.homework.avgPctDonePast, bv = b.homework.avgPctDonePast;
      if(av == null && bv == null) return a.className.localeCompare(b.className);
      if(av == null) return 1;
      if(bv == null) return -1;
      return av - bv;
    });
    const sc = act.school.homework;
    const rows = sorted.map(c=>{
      const h = c.homework;
      const assignments = h.assignments.map(a=>{
        const timing = (a.onTime || a.late) ? ` · ${t('hw_on_time',{n:a.onTime})} · ${t('hw_late',{n:a.late})}` : '';
        return `<div class="arow" style="flex-wrap:wrap">
          <span class="name">${esc(a.title || '—')}</span>
          ${a.isPast ? '' : `<span class="badge anon">${t('hw_upcoming')}</span>`}
          <span class="meta">${esc(a.dueDate || t('pipe_no_date'))}</span>
          <span class="val">${fmtPct(a.pctDone)}</span>
          <div style="flex-basis:100%">${barHtml(esc(a.subject || ''), esc(t('hw_done_of',{done:a.doneCount,n:a.rosterSize})) + esc(timing), a.pctDone, pctClass(a.pctDone))}</div>
        </div>`;
      }).join('');
      const summary = `<span class="name">${esc(c.className)}</span>${h.lowCompletion ? `<span class="badge bad">${t('hw_flag_low')}</span>` : ''}<span class="val">${h.pastDueCount ? fmtPct(h.avgPctDonePast) : '—'}</span>`;
      return foldHtml(summary, assignments || emptyState(t('hw_no_past')));
    }).join('');
    return { tiles: tilesHtml([[fmtPct(sc.avgPctDonePast), t('hw_avg')], [fmtNum(sc.pastAssignments), t('hw_tracked')], [sc.lowCompletionClasses, t('hw_low_classes')]]), list: `<h4 class="wh">${t('hw_classes_heading')}</h4>` + rows + noteHtml('hw_note') };
}

const ASSIGN_TABS = [['week', 'as_tab_week'], ['class', 'as_tab_class']];
function renderAssignments(body){
  return widgetBoot(body, async (body, isAlive)=>{
    const [classes, details, act] = await Promise.all([AD.getClasses(), AD.getAllDetails(), AD.getSchoolActivityOrNull()]);
    if(!isAlive()) return;
    const week = pipelineHtml(classes, details);
    const comp = act ? hwRatesParts(act) : { tiles:'', list: emptyState(t('as_completion_unavailable')) };
    const draw = () => {
      const cur = widgetTab('assignments', ASSIGN_TABS);
      body.innerHTML = frameTop() + comp.tiles + tabsHtml(ASSIGN_TABS, cur) + (cur === 'week' ? week : comp.list);
      wireRefreshBtn(body); wireTabs(body, 'assignments', draw);
    };
    draw();
  });
}

/* Points & Rewards = Points Leaderboard + Points & Rewards Economy. */
function leaderboardHtml(classes, details){
    let allStudents = [], classAverages = [];
    classes.forEach(c=>{
      const d = details.get(c.id);
      if(!d || d.error || !d.roster) return;
      const n = d.roster.length;
      const total = d.roster.reduce((a,s)=>a+(s.points||0),0);
      classAverages.push({ className: c.className, avg: n ? total/n : 0, total, n });
      if((c.rankingVisibility || 'anonymized') === 'full'){
        d.roster.forEach(s=> allStudents.push({ name: s.name, points: s.points||0, className: c.className }));
      }
    });
    allStudents.sort((a,b)=> b.points - a.points);
    classAverages.sort((a,b)=> b.avg - a.avg);
    const top = allStudents.slice(0,10), topClasses = classAverages.slice(0,10);
    return `
      <h4 class="wh">${t('lead_top_students')}</h4>
      ${top.length ? top.map((s,i)=>`<div class="arow"><span class="rank">${i+1}</span><span class="name">${esc(s.name)}</span><span class="meta">${esc(s.className)}</span><span class="val">${s.points}</span></div>`).join('') : emptyState(t('lead_no_full_classes'))}
      <h4 class="wh">${t('lead_top_classes')}</h4>
      ${topClasses.length ? topClasses.map((c,i)=>`<div class="arow"><span class="rank">${i+1}</span><span class="name">${esc(c.className)}</span><span class="meta">${c.n}</span><span class="val">${c.avg.toFixed(1)}</span></div>`).join('') : emptyState(t('empty_no_classes'))}
      <p class="hint">${t('lead_anon_note')}</p>
    `;
}

function economyParts(act){
    const classes = act.classes.filter(c=> c.rosterSize > 0 || c.economy.awarded || c.economy.redeemed);
    const sc = act.school.economy;
    if(!sc.awarded && !sc.deducted && !sc.redeemed && !classes.some(c=>c.economy.totalRewards)){
      return { tiles:'', list: emptyState(t('eco_empty')) };
    }
    const catBadge = st => st === 'none' ? `<span class="badge anon">${t('eco_cat_none')}</span>`
      : st === 'unreachable' ? `<span class="badge warn">${t('eco_cat_unreachable')}</span>`
      : `<span class="badge full">${t('eco_cat_ok')}</span>`;
    const rows = classes.slice().sort((a,b)=> b.economy.awarded - a.economy.awarded || a.className.localeCompare(b.className)).map(c=>{
      const e = c.economy;
      const maxBar = Math.max(e.awarded, 1);
      const rewardsHtml = e.perReward.map(r=>`<div class="arow"><span class="name">${esc(r.name)}${r.active ? '' : ` <span class="muted">(${t('eco_inactive')})</span>`}</span><span class="meta">${fmtNum(r.cost)} ${t('pts')}</span><span class="val">${r.redemptions ? t('eco_redeemed_times',{n:r.redemptions}) : '—'}</span></div>`).join('');
      const bodyHtml = barHtml(esc(t('eco_awarded_bar',{a:fmtNum(e.awarded),d:fmtNum(e.deducted)})), '', 100)
        + barHtml(esc(t('eco_redeemed_bar',{r:fmtNum(e.redeemed),n:e.redemptions})), fmtPct(e.redemptionRate), e.awarded ? e.redeemed / maxBar * 100 : 0)
        + (e.cheapestActiveCost != null ? `<p class="hint">${esc(t('eco_cheapest',{c:fmtNum(e.cheapestActiveCost),s:fmtNum(e.topStudentPoints)}))}</p>` : '')
        + rewardsHtml
        + (e.neverRedeemed.length ? `<p class="hint">${esc(t('eco_never',{names:e.neverRedeemed.join(', ')}))}</p>` : '');
      const summary = `<span class="name">${esc(c.className)}</span>${catBadge(e.catalogStatus)}<span class="val">${fmtNum(e.awarded)}</span>`;
      return foldHtml(summary, bodyHtml);
    }).join('');
    return { tiles: tilesHtml([[fmtNum(sc.awarded), t('eco_awarded')], [fmtNum(sc.deducted), t('eco_deducted')], [fmtNum(sc.redeemed), t('eco_redeemed')], [fmtPct(sc.redemptionRate), t('eco_rate')]]), list: `<h4 class="wh">${t('eco_by_class')}</h4>` + rows + noteHtml('eco_note') };
}

const POINTS_TABS = [['leaders', 'pts_tab_leaders'], ['economy', 'pts_tab_economy']];
function renderPoints(body){
  return widgetBoot(body, async (body, isAlive)=>{
    const [classes, details, act] = await Promise.all([AD.getClasses(), AD.getAllDetails(), AD.getSchoolActivityOrNull()]);
    if(!isAlive()) return;
    const leaders = leaderboardHtml(classes, details);
    const eco = act ? economyParts(act) : { tiles:'', list: emptyState(t('pts_economy_unavailable')) };
    const draw = () => {
      const cur = widgetTab('points', POINTS_TABS);
      body.innerHTML = frameTop() + tabsHtml(POINTS_TABS, cur) + (cur === 'leaders' ? leaders : eco.tiles + eco.list);
      wireRefreshBtn(body); wireTabs(body, 'points', draw);
    };
    draw();
  });
}

/* ---------------- Widget 5: Calendar Master View ---------------- */
function renderCalendarWidget(body){
  let viewDate = new Date(); viewDate.setDate(1);
  let filterClassId = 'all', selectedDay = null, showTimetable = true;     // v0.11.0: the weekly timetable (SchoolDeck → Schedule) overlays the month
  return widgetBoot(body, async (body, isAlive)=>{
    const classes = await AD.getClasses();
    const details = await AD.getAllDetails();
    if(!isAlive()) return;
    function allEvents(){
      const out = [];
      classes.forEach(c=>{
        if(filterClassId !== 'all' && c.id !== filterClassId) return;
        const d = details.get(c.id); if(!d || d.error || !d.calendarEvents) return;
        d.calendarEvents.forEach(e=> out.push({ ...e, className: c.className }));
      });
      if(showTimetable && typeof ClassScheduleFns !== 'undefined'){
        // Lessons from each class's weekly timetable, for the month on screen. Dates are school calendar days (no time zone), so nothing shifts.
        const pad = n => String(n).padStart(2,'0'), y = viewDate.getFullYear(), m = viewDate.getMonth(), last = new Date(y, m+1, 0).getDate();
        const from = `${y}-${pad(m+1)}-01`, to = `${y}-${pad(m+1)}-${pad(last)}`;
        classes.forEach(c=>{
          if(filterClassId !== 'all' && c.id !== filterClassId) return;
          ClassScheduleFns.occurrences(c.schedule, from, to).forEach(o=> out.push({ date: o.date, title: '🕘 ' + c.className, type: 'timetable', className: c.className, time: o.start + '–' + o.end + (o.room ? ' · ' + o.room : ''), tt: true }));
        });
      }
      return out;
    }
    function draw(){
      const byDate = {};
      allEvents().forEach(e=>{ if(!e.date) return; const k = String(e.date).slice(0,10); (byDate[k] = byDate[k]||[]).push(e); });
      const y = viewDate.getFullYear(), m = viewDate.getMonth();
      const startPad = (new Date(y,m,1).getDay()+6)%7;
      const daysInMonth = new Date(y,m+1,0).getDate();
      const todayKey = dayKeyLocal(new Date());
      const dow = state.lang === 'vi' ? ['T2','T3','T4','T5','T6','T7','CN'] : ['Mo','Tu','We','Th','Fr','Sa','Su'];
      let cells = dow.map(d=>`<div class="cal-dow">${d}</div>`).join('');
      for(let i=0;i<startPad;i++) cells += `<div class="cal-cell pad"></div>`;
      for(let dn=1; dn<=daysInMonth; dn++){
        const k = `${y}-${String(m+1).padStart(2,'0')}-${String(dn).padStart(2,'0')}`;
        const has = byDate[k] && byDate[k].length;
        const cls = ['cal-cell']; if(k===todayKey) cls.push('today'); if(has) cls.push('has-evt'); if(k===selectedDay) cls.push('sel');
        cells += `<div class="${cls.join(' ')}" data-day="${k}">${dn}${has?'<span class="cal-dot"></span>':''}</div>`;
      }
      const classOpts = `<option value="all">${t('cal_filter_all')}</option>` + classes.map(c=>`<option value="${c.id}" ${filterClassId===c.id?'selected':''}>${esc(c.className)}</option>`).join('');
      const monthLabel = viewDate.toLocaleDateString(LOCALE_MAP[state.lang] || 'en-US', { month:'long', year:'numeric' });
      let dayListHtml;
      if(selectedDay){
        const items = (byDate[selectedDay] || []).slice().sort((a, b) => (a.tt ? 1 : 0) - (b.tt ? 1 : 0) || String(a.time || '').localeCompare(String(b.time || '')));
        dayListHtml = `<div class="cal-day-list"><p class="muted" style="font-weight:700;font-family:'Quicksand';margin:0 0 6px">${esc(selectedDay)}</p>`
          + (items.length ? items.map(e=>`<div class="arow"><span class="name">${esc(e.title||e.type||'—')}</span><span class="meta">${e.tt ? esc(e.time) : esc(e.className) + (e.time ? (' · '+esc(e.time)) : '')}</span></div>`).join('') : emptyState(t('cal_no_events')))
          + `</div>`;
      } else {
        dayListHtml = `<p class="hint" style="margin-top:10px">${t('cal_pick_day')}</p>`;
      }
      body.innerHTML = frameTop() + `
        <div class="btn-row" style="margin-bottom:8px;align-items:center">
          <button class="wbtn sm" data-nav="-1">‹</button>
          <span style="flex:1;text-align:center;font-family:'Quicksand';font-weight:700">${esc(monthLabel)}</span>
          <button class="wbtn sm" data-nav="1">›</button>
        </div>
        <select id="cal-filter" style="width:100%;margin-bottom:8px">${classOpts}</select>
        <label class="hint" style="display:flex;gap:6px;align-items:center;margin:0 0 8px"><input type="checkbox" id="cal-tt"${showTimetable ? ' checked' : ''}> ${t('cal_show_tt')}</label>
        <div class="cal-grid">${cells}</div>
        ${dayListHtml}
      `;
      body.querySelectorAll('[data-nav]').forEach(b=> b.addEventListener('click', ()=>{ viewDate.setMonth(viewDate.getMonth()+parseInt(b.dataset.nav)); selectedDay = null; draw(); }));
      body.querySelectorAll('[data-day].has-evt').forEach(c=> c.addEventListener('click', ()=>{ selectedDay = c.dataset.day; draw(); }));
      $('#cal-filter', body).addEventListener('change', e=>{ filterClassId = e.target.value; draw(); });
      $('#cal-tt', body).addEventListener('change', e=>{ showTimetable = e.target.checked; draw(); });
      wireRefreshBtn(body);
    }
    draw();
  });
}

/* ---------------- Widget 6: Join Code Manager ---------------- */
function renderJoinCodes(body){
  return widgetBoot(body, async (body, isAlive)=>{
    const classes = await AD.getClasses();
    const details = await AD.getAllDetails();
    if(!isAlive()) return;
    function codeBox(code){
      if(!code) return `<span class="meta">${t('jc_none')}</span>`;
      return `<span class="code-box"><span>${esc(code)}</span><button data-copy="${esc(code)}">${iconSvg('copy','wsvg')}</button></span>`;
    }
    const html = classes.length ? classes.map(c=>{
      const d = details.get(c.id) || {}; const cls = d.class || {};
      return `<div class="code-row">
        <span class="cname">${esc(c.className)}</span>
        <div class="code-pair">
          <span class="meta">${t('jc_student_code')}</span>${codeBox(cls.studentJoinCode)}
          <span class="meta" style="margin-left:6px">${t('jc_parent_code')}</span>${codeBox(cls.parentJoinCode)}
        </div>
      </div>`;
    }).join('') : emptyState(t('empty_no_classes'));
    body.innerHTML = frameTop() + html;
    body.querySelectorAll('[data-copy]').forEach(btn=> btn.addEventListener('click', async ()=>{
      try{ await navigator.clipboard.writeText(btn.dataset.copy); toast(t('jc_copied')); }
      catch(e){ toast(btn.dataset.copy); }
    }));
    wireRefreshBtn(body);
  });
}

/* ---------------- Widget 7: Roster Health Checker ---------------- */
function renderRosterHealth(body){
  return widgetBoot(body, async (body, isAlive)=>{
    const classes = await AD.getClasses();
    const details = await AD.getAllDetails();
    if(!isAlive()) return;
    const emptyClasses = classes.filter(c=>!c.studentCount);
    const noHomework = [], noEvents = [], dupes = [];
    classes.forEach(c=>{
      const d = details.get(c.id); if(!d || d.error) return;
      if((d.homework||[]).length === 0) noHomework.push(c);
      if((d.calendarEvents||[]).length === 0) noEvents.push(c);
      const seen = {};
      (d.roster||[]).forEach(s=>{
        const key = String(s.name||'').trim().toLowerCase();
        if(!key) return;
        seen[key] = (seen[key]||0) + 1;
      });
      Object.entries(seen).filter(([,n])=>n>1).forEach(([name,n])=> dupes.push({ name, n, className: c.className }));
    });
    const any = emptyClasses.length || noHomework.length || noEvents.length || dupes.length;
    let html;
    if(!any) html = emptyState(t('rh_all_clear'));
    else {
      html = '';
      if(dupes.length) html += `<h4 class="wh">${t('rh_dupes')}</h4>` + dupes.map(d=>`<div class="arow"><span class="name">${esc(d.name)}</span><span class="meta">${t('rh_in_class',{class:d.className})}</span><span class="badge warn">×${d.n}</span></div>`).join('');
      if(emptyClasses.length) html += `<h4 class="wh">${t('rh_empty_classes')}</h4>` + emptyClasses.map(c=>`<div class="arow"><span class="name">${esc(c.className)}</span></div>`).join('');
      if(noHomework.length) html += `<h4 class="wh">${t('rh_no_homework')}</h4>` + noHomework.map(c=>`<div class="arow"><span class="name">${esc(c.className)}</span></div>`).join('');
      if(noEvents.length) html += `<h4 class="wh">${t('rh_no_events')}</h4>` + noEvents.map(c=>`<div class="arow"><span class="name">${esc(c.className)}</span></div>`).join('');
    }
    body.innerHTML = frameTop() + html;
    wireRefreshBtn(body);
  });
}

/* ---------------- Widget 8: Teacher Directory and Activity ---------------- */
function renderTeachers(body){
  return widgetBoot(body, async (body, isAlive)=>{
    const classes = await AD.getClasses();
    const activityP = AD.getSchoolActivityOrNull();    // Wave 1 summary — null (the old placeholder stays) if it isn't deployed
    const details = await AD.getAllDetails();
    const act = await activityP;
    const lastByTeacher = new Map(((act && act.teachers) || []).map(x=>[x.teacherUid || 'none', x]));
    if(!isAlive()) return;
    const byTeacher = new Map();
    classes.forEach(c=>{
      const key = c.teacherUid || 'none';
      if(!byTeacher.has(key)) byTeacher.set(key, { name:c.teacherName, email:c.teacherEmail, classes:[] });
      byTeacher.get(key).classes.push(c);
    });
    const rows = Array.from(byTeacher.entries()).map(([key, te0])=>{
      const te = { ...te0, key };
      let students = 0, assignments = 0, events = 0;
      te.classes.forEach(c=>{
        students += c.studentCount || 0;
        const d = details.get(c.id);
        if(d && !d.error){ assignments += (d.homework||[]).length; events += (d.calendarEvents||[]).length; }
      });
      return { ...te, nClasses: te.classes.length, students, assignments, events };
    }).sort((a,b)=> b.nClasses - a.nClasses);
    const html = rows.length ? rows.map(te => `
      <div class="arow" style="flex-wrap:wrap">
        <span class="name" style="flex-basis:100%;font-weight:700;font-family:'Quicksand'">${esc(te.name || t('td_no_teacher'))}</span>
        <span class="meta">${esc(te.email||'')}</span>
      </div>
      <p class="hint" style="margin:-2px 0 10px">
        ${t(te.nClasses===1?'td_classes':'td_classes_p',{n:te.nClasses})} ·
        ${t('td_students',{n:te.students})} ·
        ${t('td_assignments',{n:te.assignments})} ·
        ${t('td_events',{n:te.events})} ·
        ${act ? `${t('td_last_awarded')}: ${relDay((lastByTeacher.get(te.key) || {}).lastAwardMs)}` : `${t('td_last_active')}: ${t('not_available_yet')}`}
      </p>
    `).join('') : emptyState(t('empty_no_classes'));
    body.innerHTML = frameTop() + html;
    wireRefreshBtn(body);
  });
}

/* ======================================================================
   Wave 1 widgets (v0.6.0)
   All six read ONE cached call — AD.getSchoolActivity() -> the
   adminSchoolActivity Cloud Function (functions/adminDeckWave1.js) — which
   returns counts and percentages per class / teacher / school. Nothing here
   ever sees a raw student row, a points-ledger reason, journal text or a
   parent's contact details; see functions/schoolActivity.js for the exact
   privacy boundaries enforced server-side.
   ====================================================================== */
const fmtPct = v => v == null ? '—' : `${v}%`;
const fmtNum = n => Number(n || 0).toLocaleString(LOCALE_MAP[state.lang] || 'en-US');
function pctClass(v){ return v == null ? '' : v >= 75 ? 'good' : v >= 50 ? 'warn' : 'bad'; }
function barHtml(label, right, pct, cls){
  const w = Math.max(0, Math.min(100, pct == null ? 0 : pct));
  return `<div class="bar"><div class="barlbl"><span>${label}</span><span>${right}</span></div><div class="track"><div class="fill ${cls||''}" style="width:${w}%"></div></div></div>`;
}
function relDay(ms){
  if(ms == null) return t('rel_never');
  const days = Math.floor((Date.now() - ms) / 86400000);
  if(days <= 0) return t('rel_today');
  if(days === 1) return t('rel_yesterday');
  return t('rel_days_ago', { n: days });
}
function tilesHtml(items){
  return `<div class="tiles">${items.map(([v,l])=>`<div class="tile"><b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
}
function foldHtml(summaryHtml, bodyHtml){
  return `<details class="fold"><summary>${summaryHtml}</summary><div class="fold-body">${bodyHtml}</div></details>`;
}
function noteHtml(key, vars){ return `<p class="hint">${esc(t(key, vars))}</p>`; }

/* ---------------- Widget 9: Homework Completion ---------------- */

/* ---------------- Widget 10: Student Activity Pulse ---------------- */
function renderPulse(body){
  let win = 7;
  return widgetBoot(body, async (body, isAlive)=>{
    const act = await AD.getSchoolActivity();
    if(!isAlive()) return;
    function paint(){
      const key = win === 7 ? 'w7' : 'w30';
      const withData = act.classes.filter(c=> c.rosterSize > 0);
      const sum = f => withData.reduce((a,c)=> a + (c.activity[key][f] || 0), 0);
      const rosterTotal = withData.reduce((a,c)=> a + c.rosterSize, 0);
      const active = sum('activeStudents');
      const any = active > 0;
      const rows = withData.slice().sort((a,b)=> (b.activity[key].activeStudents/(b.rosterSize||1)) - (a.activity[key].activeStudents/(a.rosterSize||1))).map(c=>{
        const w = c.activity[key];
        const pa = c.rosterSize ? Math.round(w.activeStudents / c.rosterSize * 1000)/10 : null;
        return `<div class="bar"><div class="barlbl"><span>${esc(c.className)}</span><span>${t('pulse_active_of',{a:w.activeStudents,n:c.rosterSize})}</span></div>
          <div class="track"><div class="fill ${pctClass(pa)}" style="width:${pa||0}%"></div></div>
          <div class="sub">${fmtNum(w.readMin)} ${t('pulse_reading').toLowerCase()} · ${fmtNum(w.focusMin)} ${t('pulse_focus').toLowerCase()} · ${fmtNum(w.games)} ${t('pulse_games').toLowerCase()}${c.activity.avgStreak ? ' · ' + t('pulse_streak',{n:c.activity.avgStreak}) : ''}</div></div>`;
      }).join('');
      const m = act.school.activity.mood;
      let moodHtml = '';
      if(m){
        moodHtml = `<h4 class="wh">${t('pulse_mood')}</h4><div class="mood-row">${['😢','😐','😊'].map(e=>`<span class="mood">${e} <b>${m[e]||0}</b></span>`).join('')}</div>`;
      } else if(act.school.activity.moodSuppressed){
        moodHtml = `<h4 class="wh">${t('pulse_mood')}</h4>${noteHtml('pulse_mood_hidden',{n:act.thresholds.moodMinStudents})}`;
      }
      body.innerHTML = frameTop()
        + `<div class="seg"><button class="chip ${win===7?'on':''}" data-win="7">${t('pulse_7d')}</button><button class="chip ${win===30?'on':''}" data-win="30">${t('pulse_30d')}</button></div>`
        + tilesHtml([
            [`${active}<small>/${rosterTotal}</small>`, t('pulse_active')], [fmtNum(sum('readMin')), t('pulse_reading')], [fmtNum(sum('focusMin')), t('pulse_focus')],
            [fmtNum(sum('games')), t('pulse_games')], [fmtNum(sum('idioms')), t('pulse_idioms')], [fmtNum(sum('hwChecks')), t('pulse_hw')]
          ])
        + (any ? `<h4 class="wh">${t('pulse_by_class')}</h4>${rows}` : emptyState(t('pulse_empty')))
        + moodHtml + noteHtml('pulse_note');
      body.querySelectorAll('[data-win]').forEach(b=> b.addEventListener('click', ()=>{ win = Number(b.dataset.win); paint(); }));
      wireRefreshBtn(body);
    }
    paint();
  });
}

/* ---------------- Widget 11: Points & Rewards Economy ---------------- */

/* ---------------- Widget 12: Class Onboarding Funnel ---------------- */
const FUNNEL_STAGES = ['students','parents','homework','rewards','points'];
function renderFunnel(body){
  return widgetBoot(body, async (body, isAlive)=>{
    const act = await AD.getSchoolActivity();
    if(!isAlive()) return;
    if(!act.classes.length){ body.innerHTML = frameTop() + emptyState(t('fun_empty')); wireRefreshBtn(body); return; }
    const total = act.school.funnel.classes;
    const reached = act.school.funnel.reached;
    const schoolBars = FUNNEL_STAGES.map(k=> barHtml(esc(t('fun_'+k)), `${reached[k]}/${total}`, total ? reached[k]/total*100 : 0, pctClass(total ? reached[k]/total*100 : null))).join('');
    const sorted = act.classes.slice().sort((a,b)=> (b.funnel.stuck - a.funnel.stuck) || (a.funnel.done - b.funnel.done) || a.className.localeCompare(b.className));
    const rows = sorted.map(c=>{
      const f = c.funnel;
      const chips = FUNNEL_STAGES.map(k=>`<span class="chip ${f.stages[k]?'on':''}" title="${esc(t('fun_'+k))}">${f.stages[k]?'✓':'·'} ${esc(t('fun_'+k))}</span>`).join('');
      const status = f.nextStep ? t('fun_next',{step:t('fun_'+f.nextStep)}) : t('fun_complete');
      return `<div class="funnel-row"><div class="arow" style="border-bottom:none;padding-bottom:2px"><span class="name">${esc(c.className)}</span>${f.stuck ? `<span class="badge bad">${t('fun_stuck')}</span>` : ''}<span class="meta">${c.ageDays != null ? t('fun_age',{n:c.ageDays}) : ''}</span></div>
        <div class="chip-row" style="margin:2px 0 2px">${chips}</div><div class="sub">${esc(status)} · ${esc(t('td_students',{n:c.rosterSize}))}</div></div>`;
    }).join('');
    body.innerHTML = frameTop() + `<h4 class="wh">${t('fun_school')}</h4>` + schoolBars
      + `<h4 class="wh">${t('fun_classes_heading')}</h4>` + rows + noteHtml('fun_note',{d:act.thresholds.stuckDays});
    wireRefreshBtn(body);
  });
}

/* ---------------- Widget 13: Family Link Coverage ---------------- */
function renderFamilies(body){
  return widgetBoot(body, async (body, isAlive)=>{
    const act = await AD.getSchoolActivity();
    if(!isAlive()) return;
    const classes = act.classes.filter(c=> c.rosterSize > 0);
    if(!classes.length){ body.innerHTML = frameTop() + emptyState(t('fam_empty')); wireRefreshBtn(body); return; }
    const sf = act.school.families;
    const multi = classes.reduce((a,c)=> a + c.families.multiGuardian, 0);
    const maxWk = Math.max(1, ...sf.linkWeeks.map(w=>w.links));
    const spark = `<div class="spark">${sf.linkWeeks.map(w=>`<i style="height:${Math.max(4, w.links/maxWk*100)}%" title="${esc(w.weekStart)}: ${w.links}"></i>`).join('')}</div>`
      + `<div class="spark-lbl">${sf.linkWeeks.map(w=>`<span>${w.links}</span>`).join('')}</div>`;
    const sorted = classes.slice().sort((a,b)=> (a.families.coveragePct||0) - (b.families.coveragePct||0) || a.className.localeCompare(b.className));
    const rows = sorted.map(c=>{
      const f = c.families;
      const shown = f.unlinked.length;
      const names = f.unlinked.map(u=>`<div class="arow"><span class="name">${esc(u.name)}</span></div>`).join('')
        + (f.unlinkedCount > shown ? `<p class="hint">${esc(t('fam_more',{n:f.unlinkedCount-shown}))}</p>` : '');
      const bodyHtml = (f.unlinkedCount ? `<h4 class="wh" style="margin-top:2px">${t('fam_unlinked',{n:f.unlinkedCount})}</h4>${names}` : '')
        + `<div class="chip-row">${f.parentCodeUsed ? '' : `<span class="badge warn">${t('fam_code_unused')}</span>`}${f.orphanLinks ? `<span class="badge bad">${t('fam_orphan_badge',{n:f.orphanLinks})}</span>` : ''}${f.multiGuardian ? `<span class="badge anon">${t('fam_multi')}: ${f.multiGuardian}</span>` : ''}</div>`;
      const summary = `<span class="name">${esc(c.className)}</span><span class="meta">${t('fam_class_row',{l:f.linkedStudents,n:f.rosterSize})}</span><span class="val">${fmtPct(f.coveragePct)}</span>`
        + `<span class="sumbar"><span class="track"><span class="fill ${pctClass(f.coveragePct)}" style="width:${f.coveragePct || 0}%"></span></span></span>`;
      return foldHtml(summary, bodyHtml || emptyState('✓'));
    }).join('');
    body.innerHTML = frameTop()
      + tilesHtml([[fmtPct(sf.coveragePct), t('fam_coverage')], [sf.unlinkedStudents, t('fam_none')], [multi, t('fam_multi')], [sf.orphanLinks, t('fam_orphans')]])
      + `<h4 class="wh">${t('fam_growth')}</h4>` + spark
      + `<h4 class="wh">${t('fam_by_class')}</h4>` + rows + noteHtml('fam_note');
    wireRefreshBtn(body);
  });
}

/* ---------------- Widget 14: Teacher Engagement ---------------- */
function renderEngagement(body){
  return widgetBoot(body, async (body, isAlive)=>{
    const act = await AD.getSchoolActivity();
    if(!isAlive()) return;
    const teachers = act.teachers.filter(x=> x.teacherUid);
    if(!teachers.length){ body.innerHTML = frameTop() + emptyState(t('eng_empty')); wireRefreshBtn(body); return; }
    // least recently active first, so teachers who may need a nudge surface at the top
    const sorted = teachers.slice().sort((a,b)=>{
      if(a.lastAwardMs == null && b.lastAwardMs == null) return (a.name||'').localeCompare(b.name||'');
      if(a.lastAwardMs == null) return -1;
      if(b.lastAwardMs == null) return 1;
      return a.lastAwardMs - b.lastAwardMs;
    });
    const rows = sorted.map(te=>{
      const feats = ['rewards','calendar','homework'].map(k=>`<span class="chip ${te.features[k] ? 'on' : ''}">${esc(t('eng_feat_'+k))} ${te.features[k]}/${te.classCount}</span>`).join('');
      return `<div class="eng-row">
        <div class="arow" style="border-bottom:none;padding-bottom:0;flex-wrap:wrap">
          <span class="name" style="font-weight:700;font-family:'Quicksand'">${esc(te.name || t('td_no_teacher'))}</span>
          <span class="meta">${t('eng_last')}: <b>${esc(relDay(te.lastAwardMs))}</b></span>
          <span class="meta" style="flex-basis:100%">${esc(te.email || '')}</span>
        </div>
        <div class="sub">${esc(t('eng_awards',{a7:te.awards7d,a30:te.awards30d}))} · ${esc(t('eng_classes',{a:te.classesActive,d:te.classesDormant,n:te.classesNew}))}</div>
        <div class="chip-row" style="margin:4px 0 2px">${feats}</div>
        ${te.dormantClasses.length ? `<div class="sub">${esc(t('eng_dormant',{names:te.dormantClasses.join(', ')}))}</div>` : ''}
      </div>`;
    }).join('');
    body.innerHTML = frameTop() + rows + noteHtml('eng_note',{d:act.thresholds.dormantDays});
    wireRefreshBtn(body);
  });
}

/* ---------------- Widget registry ---------------- */
const WIDGETS = [
  { id:'snapshot', labelKey:'w_snapshot', icon:'snapshot', w:420, h:460, deactivatable:true, render: renderSnapshot },   // v0.8.0: inactive by default, kept (Settings -> Inactive widgets)
  { id:'schoolstats', labelKey:'w_schoolstats', icon:'chart', w:420, h:640, full:true, render: renderSchoolStats },   // v0.3.0 — full-screen (js/schoolstats-ui.js)
  { id:'points', labelKey:'w_points', icon:'trophy', w:420, h:520, render: renderPoints },                 // v0.8.0 — Points Leaderboard + Points & Rewards Economy
  { id:'assignments', labelKey:'w_assignments', icon:'clipboard', w:420, h:520, render: renderAssignments },   // v0.8.0 — Assignment Pipeline + Homework Completion
  { id:'calendar', labelKey:'w_calendar', icon:'calendar', w:400, h:560, render: renderCalendarWidget },
  { id:'joincodes', labelKey:'w_joincodes', icon:'qrcode', w:380, h:400, render: renderJoinCodes },
  { id:'rosterhealth', labelKey:'w_rosterhealth', icon:'pulse', w:380, h:420, render: renderRosterHealth },
  { id:'teachers', labelKey:'w_teachers', icon:'people', w:380, h:420, render: renderTeachers },
  { id:'teachernotes', labelKey:'w_teachernotes', icon:'people', w:440, h:560, render: renderTeacherNotes },   // v0.9.3
  // Wave 1 (v0.6.0) — all fed by adminSchoolActivity
  { id:'pulse', labelKey:'w_pulse', icon:'bolt', w:420, h:520, render: renderPulse },
  { id:'funnel', labelKey:'w_funnel', icon:'funnel', w:440, h:520, render: renderFunnel },
  { id:'families', labelKey:'w_families', icon:'family', w:420, h:520, render: renderFamilies },
  { id:'engage', labelKey:'w_engage', icon:'trend', w:420, h:500, render: renderEngagement },
  // v0.7.0 — the administration build starts here: one directory for teachers, students, parents and staff (js/directory-ui.js)
  { id:'directory', labelKey:'w_directory', icon:'contacts', w:780, h:640, render: renderDirectory },
  // v0.8.0 (SchoolDeck line) — staff directory, parent links, roster import, setup checklist (js/schooldeck-ui.js), built on the People Directory
  { id:'schooldeck', labelKey:'w_schooldeck', icon:'school', w:820, h:680, render: renderSchoolDeck }
];

/* UniDeck phase 1 (CampusDeck): CampusDeck's own js/campus-courses.js lists its widgets in window.UNI_WIDGETS
   ({ id, title, icon, w, h, render, full? }). They join the registry only in the university edition, with their
   labels added to STRINGS (English for now). AdminDeck never loads that file. */
/* v0.14.1: in the university edition (CampusDeck) the school widgets go — they read classes, students' points, homework,
   join codes and families, which universities don't have. CampusDeck shows its own campus widgets instead (courses,
   campus stats, course health, teaching staff), and keeps the People Directory. */
const UNI_KEEP = ['directory'];
if(UNI) for(let i = WIDGETS.length - 1; i >= 0; i--) if(!UNI_KEEP.includes(WIDGETS[i].id)) WIDGETS.splice(i, 1);
const DEFAULT_WINDOW = UNI ? ((window.UNI_WIDGETS || [])[0] || { id:'directory' }).id : 'schoolstats';   // first run and Reset layout
if(UNI) (window.UNI_WIDGETS || []).forEach(w => {
  if(WIDGETS.some(x => x.id === w.id)) return;
  if(!DEFAULT_PLACEMENT[w.id]) DEFAULT_PLACEMENT[w.id] = 'bottom';
  STRINGS['uw_' + w.id] = STRINGS['uw_' + w.id] || { en: w.title };
  WIDGETS.push({ id:w.id, labelKey:'uw_' + w.id, icon:w.icon || 'school', w:w.w, h:w.h, full:!!w.full, render:w.render });
});

/* ---------------- Init ---------------- */
function init(){
  document.documentElement.lang = state.lang;
  applyTheme(); initCustomBg();
  buildLangToggle();
  migrateWidgets();
  ensureDockPlacement();
  rebuildAllDocks();
  applyPills(); applyDockAutoHide(); applyToolbarAutoHide();
  wireAppTray();
  wireSettingsDrawer();
  wireThemeDrawer();
  localizeNode(document);
  // First run on a device: School Stats is the default window (v0.8.0 — it was School Snapshot, which is now inactive; its six numbers are School Stats' overview row).
  // Closing it afterwards sticks. Windows open in dock order and full-screen widgets sit under every floating window.
  if(!state.snapSeeded){ state.active[DEFAULT_WINDOW] = true; state.snapSeeded = true; state.statsSeeded = true; saveState(); }
  WIDGETS.forEach(w=>{ if(state.active[w.id] && widgetOn(w.id)) openWidget(w.id); });
  syncFullscreen();                                      // School Stats open? then the toolbar is hidden and the free band starts at the top
  rescueWidgets();                                       // pull back any window an older build left with its title bar under the top bar / dock
  syncDock();
  refreshStatusPill();
}
init();

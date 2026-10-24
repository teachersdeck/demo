'use strict';
/* ParentDeck v0.1.0 — read-only family dashboard shell.
   Shell (panels/drag/resize/dock/localStorage) follows the same pattern as TeachersDeck/StudentDeck,
   so the three apps stay visually and structurally consistent. All data comes from PD.* (js/data.js) —
   this file never touches localStorage for student data directly, only for its own UI layout, so the
   moment PD.* is backed by real Firebase instead of the demo store, nothing here has to change. */
/* Which app this is: this app's own js/edition.js (the first script on the page) sets window.DECK_EDITION — the app's
   name, its version and the edition. UNI = the university edition (UniDeck); U(schoolText, uniText) picks the wording
   for the current edition; APP = the app's name for anything shown to the user. This file is shared with UniDeck's copy
   of the app (teachersdeck/unideck, tools/sync_shared.py): edit it here, keep one-app-only behaviour behind UNI or U(). */
const ED = window.DECK_EDITION || { name: 'ParentDeck', version: '0.0.0', uni: false };
const UNI = !!ED.uni, APP = ED.name || 'ParentDeck', U = (school, uni) => (UNI ? uni : school);
const VERSION = ED.version, UIKEY = 'pd_ui_v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtDate = t => new Date(t).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
const fmtTime = t => new Date(t).toLocaleString(locale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ---------- Language pack ----------
   Same 8-language set and t(key, vars)/{var} substitution pattern as
   TeachersDeck (see its js/app.js header for LANGS/STRINGS). Only `en`
   and `vi` are actually translated so far — every other code falls back
   to `en`, same convention TeachersDeck itself uses for its newer
   strings. Add a language by filling in more entries below; nothing else
   needs to change. Dynamic content (a child's name, a class name, a
   teacher-written reason/note) is never translated, only this app's own
   chrome — same rule TeachersDeck follows for roster names. */
const LANGS = [
  { code:'en', name:'English' }, { code:'vi', name:'Tiếng Việt' }, { code:'es', name:'Español' },
  { code:'fr', name:'Français' }, { code:'zh', name:'中文' }, { code:'ja', name:'日本語' },
  { code:'ko', name:'한국어' }, { code:'tl', name:'Tagalog' }
];
const LOCALE_MAP = { en:'en-US', vi:'vi-VN', es:'es-ES', fr:'fr-FR', zh:'zh-CN', ja:'ja-JP', ko:'ko-KR', tl:'fil-PH' };
const locale = () => LOCALE_MAP[ui.lang] || 'en-US';
const STRINGS = {
  w_points:     { en:'Reward Points', vi:'Điểm thưởng' },
  w_notes:      { en:'Notes from teacher', vi:'Ghi chú từ giáo viên' },
  notes_empty:  { en:'No notes from the teacher yet.', vi:'Chưa có ghi chú nào từ giáo viên.' },
  notes_tap:    { en:'Tap to read', vi:'Chạm để đọc' },
  notes_good:   { en:'Good news', vi:'Tin vui' },
  notes_concern:{ en:'A note to be aware of', vi:'Một ghi chú cần lưu ý' },
  notes_unread: { en:'{n} unread', vi:'{n} chưa đọc' },
  note_open_good: { en:'🎉 Good news about {name} opened — your teacher can see you’ve read it.', vi:'🎉 Đã mở tin vui về {name} — giáo viên sẽ thấy bạn đã đọc.' },
  note_open_calm: { en:'Thanks for reading. Your teacher can see you’ve opened this note about {name}.', vi:'Cảm ơn bạn đã đọc. Giáo viên sẽ thấy bạn đã mở ghi chú này về {name}.' },
  streak_next:     { en:'{n} more days to reach {m}!', vi:'Còn {n} ngày nữa để đạt {m}!' },
  streak_next_one: { en:'1 more day to reach {m}!', vi:'Còn 1 ngày nữa để đạt {m}!' },
  almost_lv:       { en:'✨ Almost level {n}!', vi:'✨ Sắp lên cấp {n}!' },
  ring_tip:        { en:'Level {n}, {p}% of the way to level {m}', vi:'Cấp {n}, đã được {p}% đến cấp {m}' },
  best_day:        { en:'Best day', vi:'Ngày tốt nhất' },
  notes_f_all:   { en:'All', vi:'Tất cả' },
  notes_f_unread:{ en:'Unread', vi:'Chưa đọc' },
  notes_who_all: { en:'All children', vi:'Tất cả các con' },
  notes_none_unread: { en:'No unread notes.', vi:'Không có ghi chú chưa đọc.' },
  /* layout modes (ported from StudentDeck) */
  lay_title:   { en:'Layout mode', vi:'Chế độ bố cục' },
  lay_hint:    { en:'Choose how docks and the widget tray are arranged', vi:'Chọn cách sắp xếp thanh dock và khay widget' },
  lay_compact: { en:'Compact', vi:'Gọn' },
  lay_compact_d:{ en:'Just the bottom dock — use the tab above it for a tray with every widget', vi:'Chỉ có dock dưới — dùng nút phía trên để mở khay chứa mọi widget' },
  lay_cozy:    { en:'Cozy', vi:'Thoải mái' },
  lay_cozy_d:  { en:'Bottom, left and right docks all shown', vi:'Hiển thị cả dock dưới, trái và phải' },
  lay_custom:  { en:'Custom', vi:'Tùy chỉnh' },
  lay_custom_d:{ en:'Pick each widget’s dock and switch the drawers on or off yourself', vi:'Tự chọn dock cho từng widget và bật/tắt các ngăn bên' },
  lay_buttons: { en:'Dock buttons', vi:'Nút trên dock' },
  lay_buttons_hint:{ en:'Choose where each widget’s launcher lives', vi:'Chọn nơi đặt nút mở của từng widget' },
  lay_locked:  { en:'Set by the layout mode above — switch to Custom to control this yourself', vi:'Do chế độ bố cục ở trên quy định — chuyển sang Tùy chỉnh để tự điều chỉnh' },
  lay_drawers: { en:'Side drawers', vi:'Ngăn bên' },
  lay_left:    { en:'Show left drawer', vi:'Hiện ngăn bên trái' },
  lay_right:   { en:'Show right drawer', vi:'Hiện ngăn bên phải' },
  lay_autohide:{ en:'Hide the bottom dock until I hover its tab', vi:'Ẩn dock dưới cho đến khi tôi rê chuột vào nút của nó' },
  lay_autohide_hint:{ en:'The dock slides away and only its small tab stays at the bottom edge. Point at the tab (or press Tab to a dock button) to bring it back.', vi:'Dock trượt xuống và chỉ còn nút nhỏ ở mép dưới. Rê chuột vào nút đó (hoặc nhấn Tab tới một nút dock) để hiện lại.' },
  place_bottom:{ en:'Bottom dock', vi:'Dock dưới' },
  place_left:  { en:'Left drawer', vi:'Ngăn trái' },
  place_right: { en:'Right drawer', vi:'Ngăn phải' },
  place_hidden:{ en:'Hidden', vi:'Ẩn' },
  place_full:  { en:'{place} is full ({n} max)', vi:'{place} đã đầy (tối đa {n})' },
  /* labels for what StudentDeck v0.9.x added to practiceDaily.xpBy / timeBy (before this they showed as raw keys) */
  xsrc_words:  { en:'Saving words', vi:'Lưu từ vựng' },
  xsrc_cards:  { en:'Flashcards', vi:'Thẻ ghi nhớ' },
  xsrc_notes:  { en:'Notepad', vi:'Sổ ghi chú' },
  xsrc_docs:   { en:'Open documents', vi:'Tài liệu đã mở' },
  sd_translate:{ en:'Translate', vi:'Dịch' },
  sd_dict:     { en:'Dictionary', vi:'Từ điển' },
  sd_cards:    { en:'Flashcards', vi:'Thẻ ghi nhớ' },
  sd_notes:    { en:'Notepad', vi:'Sổ ghi chú' },
  sd_files:    { en:'Files', vi:'Tệp' },
  sd_docs:     { en:'Open documents', vi:'Tài liệu đã mở' },
  notes_read_fail:{ en:'Couldn\u2019t mark that note as read — check your connection.', vi:'Không đánh dấu đã đọc được — hãy kiểm tra kết nối.' },
  toast_note_good:   { en:'✉️ New note from {class} about {name}', vi:'✉️ Ghi chú mới từ {class} về {name}' },
  toast_note_concern:{ en:'✉️ {class} sent a note about {name} — open Notes from teacher', vi:'✉️ {class} đã gửi một ghi chú về {name} — hãy mở Ghi chú từ giáo viên' },
  w_ranking:    { en:'Class Ranking', vi:'Xếp hạng lớp' },
  w_summary:    { en:'Student Summary', vi:'Tóm tắt học sinh' },
  w_stats:      { en:'Student Stats and XP', vi:'Thống kê & XP của học sinh' },
  w_homework:   { en:'Homework Assignments', vi:'Bài tập được giao' },
  w_settings:   { en:'Settings', vi:'Cài đặt' },
  w_theme:      { en:'Theme', vi:'Giao diện' },

  acct_signin:        { en:'Sign in with Google', vi:'Đăng nhập bằng Google' },
  acct_signing_in:    { en:'Signing in…', vi:'Đang đăng nhập…' },
  acct_signed_in_as:  { en:'Signed in as {name}', vi:'Đã đăng nhập với {name}' },
  acct_title:         { en:'Account', vi:'Tài khoản' },
  acct_signed_in_email:{ en:'Signed in as {email}', vi:'Đã đăng nhập bằng {email}' },
  acct_linked_children:{ en:'Linked children', vi:'Con đã liên kết' },
  acct_no_children:   { en:'No children linked yet.', vi:'Chưa liên kết học sinh nào.' },
  acct_link_child:    { en:'Link a child', vi:'Liên kết một học sinh' },
  acct_join_code_ph:  { en:'Family code, e.g. MINH-7F2Q', vi:'Mã gia đình, ví dụ MINH-7F2Q' },
  acct_classcode_summary: { en:'My child\u2019s class gave me a class code instead', vi:'Lớp của con tôi đưa mã lớp thay vào đó' },
  acct_classcode_hint: { en:'Only some classes still use this. Enter the class\u2019s parent code above and your child\u2019s name exactly as it appears in class.', vi:'Chỉ một số lớp còn dùng cách này. Nhập mã phụ huynh của lớp ở trên và tên con đúng như trong danh sách lớp.' },
  pro_title:          { en:'ParentDeck Pro', vi:'ParentDeck Pro' },
  pro_active:         { en:'Active on this account. Every child you link also gets StudentDeck Pro.', vi:'Đang hoạt động trên tài khoản này. Mọi học sinh bạn liên kết cũng được StudentDeck Pro.' },
  pro_pitch:          { en:'Badge Display Case, Class Pulse, Weekly Digest, conversation starters, the rewards wishlist and homework insights — and StudentDeck Pro (games and language tools) for every child you link.', vi:'Tủ huy hiệu, Class Pulse, Tóm tắt tuần, gợi ý trò chuyện, danh sách phần thưởng mong muốn và phân tích bài tập — cùng StudentDeck Pro (trò chơi và công cụ ngôn ngữ) cho mọi học sinh bạn liên kết.' },
  pro_activate:       { en:'Activate', vi:'Kích hoạt' },
  pro_get:            { en:'Get ParentDeck Pro', vi:'Mua ParentDeck Pro' },
  pro_price_line:     { en:'{monthly}/child/month or {annual}/child/year — 30% off the 2nd child, 50% off the 3rd+.', vi:'{monthly}/trẻ/tháng hoặc {annual}/trẻ/năm — giảm 30% cho trẻ thứ 2, giảm 50% từ trẻ thứ 3 trở đi.' },
  pro_activated:      { en:'ParentDeck Pro is active. {n} linked child(ren) now have StudentDeck Pro.', vi:'Đã kích hoạt ParentDeck Pro. {n} học sinh đã liên kết giờ có StudentDeck Pro.' },
  pro_signin_first:   { en:'Sign in first, then activate ParentDeck Pro from your account.', vi:'Hãy đăng nhập trước, rồi kích hoạt ParentDeck Pro trong tài khoản.' },
  acct_link_notfound: { en:'That code wasn\u2019t found. Check it with your child (StudentDeck \u2192 Class) or the teacher.', vi:'Không tìm thấy mã này. Hãy kiểm tra lại với con (StudentDeck \u2192 Lớp) hoặc giáo viên.' },
  acct_join_name_ph:  { en:'Child\u2019s name, as it appears in class', vi:'Tên con, như trong danh sách lớp' },
  acct_link_btn:      { en:'Link', vi:'Liên kết' },
  acct_join_hint:     { en:'Each child has their own family code. Your child can see it in StudentDeck \u2192 Class, or ask the teacher.', vi:'Mỗi học sinh có một mã gia đình riêng. Con bạn xem được trong StudentDeck \u2192 Lớp, hoặc hỏi giáo viên.' },
  acct_signout:       { en:'Sign out', vi:'Đăng xuất' },
  acct_unlinked:      { en:'Unlinked.', vi:'Đã hủy liên kết.' },
  acct_linked_name:   { en:'Linked {name}.', vi:'Đã liên kết {name}.' },
  acct_signed_out:    { en:'Signed out.', vi:'Đã đăng xuất.' },
  kids_add:           { en:'+ Link a child', vi:'+ Liên kết học sinh' },

  empty_signin:       { en:'Sign in to see this.', vi:'Đăng nhập để xem.' },
  empty_link_child:   { en:'Link a child to get started.', vi:'Liên kết một học sinh để bắt đầu.' },
  empty_no_points:    { en:'No points yet.', vi:'Chưa có điểm nào.' },
  empty_tap_refresh:  { en:'Tap refresh to see ranking.', vi:'Nhấn làm mới để xem xếp hạng.' },
  loading:            { en:'Loading…', vi:'Đang tải…' },
  empty_rank_hidden:  { en:'This class\u2019s ranking is set to hide names, so {name}\u2019s exact position can\u2019t be shown here.', vi:'Lớp này đã ẩn tên trong bảng xếp hạng, nên không thể hiện vị trí chính xác của {name} ở đây.' },
  rank_only_own:      { en:'Only {name}\u2019s own rank is shown here \u2014 not other students\u2019 names or scores.', vi:'Chỉ hiển thị thứ hạng của riêng {name} \u2014 không hiện tên hay điểm của học sinh khác.' },
  empty_no_range_data:{ en:'No data yet for this range.', vi:'Chưa có dữ liệu cho khoảng thời gian này.' },
  empty_no_mood:      { en:'No mood entries logged yet.', vi:'Chưa có mục cảm xúc nào được ghi lại.' },
  empty_nothing_up:   { en:'Nothing coming up.', vi:'Không có gì sắp tới.' },
  empty_no_homework:  { en:'No homework assigned right now.', vi:'Hiện chưa có bài tập nào được giao.' },
  hw_done:            { en:'Done \u2705', vi:'Đã xong \u2705' },
  toast_hw_done:      { en:'{name} finished "{title}"', vi:'{name} đã hoàn thành "{title}"' },
  hw_calendar_toggle: { en:'Calendar', vi:'Lịch' },
  cal_untitled:       { en:'Untitled event', vi:'Sự kiện chưa đặt tên' },
  cal_no_events:      { en:'Nothing on this day.', vi:'Không có gì trong ngày này.' },
  w_calendar:         { en:'Calendar', vi:'Lịch' },
  cal_tab_month:      { en:'Month', vi:'Tháng' },
  cal_tab_week:       { en:'Week ahead', vi:'Tuần tới' },
  cal_sys_label:      { en:'Date system', vi:'Hệ lịch' },
  cal_sys_gregorian:  { en:'Gregorian', vi:'Dương lịch' },
  cal_sys_both:       { en:'Both', vi:'Cả hai' },
  cal_sys_lunar:      { en:'Lunar', vi:'Âm lịch' },
  lunar_prefix:       { en:'Lunar', vi:'ÂL' },
  leap_suffix:        { en:' (leap)', vi:' (nhuận)' },
  cal_add_google:     { en:'Add to Google Calendar', vi:'Thêm vào Google Calendar' },
  hw_points:          { en:'{n} pts', vi:'{n} điểm' },

  pts_recent:   { en:'Recent', vi:'Gần đây' },
  pts_redeemed: { en:'Redeemed', vi:'Đã đổi thưởng' },
  pts_teacher:  { en:'Teacher', vi:'Giáo viên' },

  weekly_this_week:  { en:'This week · {name}', vi:'Tuần này · {name}' },
  /* v0.14.0: Student Summary "at a glance" status */
  st_title_good:  { en:'{name} is on track', vi:'{name} đang đi đúng hướng' },
  st_title_watch: { en:'{name} needs monitoring', vi:'{name} cần được theo dõi' },
  st_title_off:   { en:'{name} is off track', vi:'{name} đang chưa theo kịp' },
  st_title_none:  { en:'Not enough data yet', vi:'Chưa đủ dữ liệu' },
  st_sub_good:    { en:'Everything looks good over the past week or two.', vi:'Mọi thứ đều ổn trong một đến hai tuần qua.' },
  st_sub_attn:    { en:'Worth a look: {list}', vi:'Cần chú ý: {list}' },
  st_sub_none:    { en:'A status appears once {name}’s activity has synced.', vi:'Trạng thái sẽ hiển thị khi hoạt động của {name} được đồng bộ.' },
  st_good:        { en:'On track', vi:'Đúng hướng' },
  st_watch:       { en:'Needs monitoring', vi:'Cần theo dõi' },
  st_off:         { en:'Off track', vi:'Chưa theo kịp' },
  st_none:        { en:'No data yet', vi:'Chưa có dữ liệu' },
  st_m_homework:  { en:'Homework', vi:'Bài tập' },
  st_m_practice:  { en:'Daily practice', vi:'Luyện tập hằng ngày' },
  st_m_behaviour: { en:'Behaviour', vi:'Hành vi' },
  st_hw_val:      { en:'{done} of {total} marked done · last 4 weeks', vi:'{done}/{total} bài đã đánh dấu xong · 4 tuần qua' },
  st_hw_none:     { en:'No homework due lately', vi:'Gần đây không có bài tập đến hạn' },
  st_hw_hint:     { en:'{n} past due, not marked', vi:'{n} bài quá hạn, chưa đánh dấu' },
  st_read_val:    { en:'{n} min in the last 7 days', vi:'{n} phút trong 7 ngày qua' },
  st_read_hint:   { en:'Goal: {g} min a week', vi:'Mục tiêu: {g} phút mỗi tuần' },
  st_prac_val:    { en:'Active {n} of the last 7 days', vi:'Hoạt động {n}/7 ngày qua' },
  st_prac_hint:   { en:'Goal: {g}+ days a week', vi:'Mục tiêu: từ {g} ngày mỗi tuần' },
  st_beh_good:    { en:'No concerns from the teacher', vi:'Giáo viên không ghi nhận vấn đề' },
  st_beh_one:     { en:'1 note of concern in the last 2 weeks', vi:'1 ghi chú cần lưu ý trong 2 tuần qua' },
  st_beh_many:    { en:'{n} notes of concern in the last 2 weeks', vi:'{n} ghi chú cần lưu ý trong 2 tuần qua' },
  st_beh_unread:  { en:'Unread — see Notes from teacher below', vi:'Chưa đọc — xem Ghi chú từ giáo viên bên dưới' },
  st_caption:     { en:'A guide based on what the teacher and {name}’s app report — not a grade.', vi:'Chỉ để tham khảo, dựa trên báo cáo của giáo viên và ứng dụng của {name} — không phải điểm số.' },
  st_how:         { en:'How is this worked out?', vi:'Cách tính?' },
  st_rule_hw:     { en:'Homework: on track at {g}%+ marked done, off track below {w}% (last 4 weeks). “Not marked” is not the same as “not done”.', vi:'Bài tập: đúng hướng khi đánh dấu xong từ {g}%, chưa theo kịp khi dưới {w}% (4 tuần qua). “Chưa đánh dấu” không có nghĩa là “chưa làm”.' },
  st_rule_read:   { en:'Reading: on track at {g}+ minutes a week, off track below {w}.', vi:'Đọc sách: đúng hướng khi từ {g} phút mỗi tuần, chưa theo kịp khi dưới {w}.' },
  st_rule_prac:   { en:'Daily practice: on track at {g}+ active days a week, off track below {w}.', vi:'Luyện tập: đúng hướng khi hoạt động từ {g} ngày mỗi tuần, chưa theo kịp khi dưới {w} ngày.' },
  st_rule_beh:    { en:'Behaviour: on track with no notes of concern in 2 weeks, needs monitoring with 1, off track with 2 or more.', vi:'Hành vi: đúng hướng khi không có ghi chú cần lưu ý trong 2 tuần, cần theo dõi khi có 1, chưa theo kịp khi có từ 2.' },
  sl_how:         { en:'How are these colours worked out?', vi:'Màu sắc được tính như thế nào?' },
  sl_rule_hw:     { en:'Homework: the same check as the status card — green at {g}%+ marked done, red below {w}%.', vi:'Bài tập: cùng cách tính với thẻ trạng thái — xanh từ {g}% đã đánh dấu xong, đỏ khi dưới {w}%.' },
  sl_rule_read:   { en:'Reading: green at {g}+ minutes in the last 7 days, red below {w}.', vi:'Đọc sách: xanh từ {g} phút trong 7 ngày qua, đỏ khi dưới {w}.' },
  sl_rule_streak: { en:'Practice streak: green at {g}+ days in a row, red below {w}.', vi:'Chuỗi ngày luyện tập: xanh từ {g} ngày liên tiếp, đỏ khi dưới {w}.' },
  sl_rule_neutral:{ en:'Points earned has no good or bad, so it stays gold. A box with no data yet is never coloured red.', vi:'Điểm đạt được không có tốt hay xấu nên giữ màu vàng. Ô chưa có dữ liệu sẽ không bao giờ bị tô đỏ.' },
  st_rule_all:    { en:'Overall: off track when two or more areas are off track; needs monitoring when one is off track or two need monitoring.', vi:'Tổng thể: chưa theo kịp khi có từ hai mục chưa theo kịp; cần theo dõi khi có một mục chưa theo kịp hoặc hai mục cần theo dõi.' },
  st_detail_h:    { en:'Detailed metrics', vi:'Số liệu chi tiết' },
  weekly_points:     { en:'Points earned', vi:'Điểm đạt được' },
  weekly_hw:         { en:'Homework done', vi:'Bài tập đã làm' },
  weekly_reading:    { en:'Reading', vi:'Đọc sách' },
  weekly_streak:     { en:'Practice streak', vi:'Chuỗi ngày luyện tập' },
  min_short:         { en:'{n} min', vi:'{n} phút' },
  day_count:         { en:'{n} day', vi:'{n} ngày' },
  days_count:        { en:'{n} days', vi:'{n} ngày' },

  rank_refresh:  { en:'Refresh ranking', vi:'Làm mới xếp hạng' },
  rank_of_in:    { en:'of {total} in {class}', vi:'trong tổng số {total} của {class}' },

  metric_reading:  { en:'Reading', vi:'Đọc sách' },
  metric_homework: { en:'Homework', vi:'Bài tập' },
  metric_focus:    { en:'Focus sessions', vi:'Phiên tập trung' },
  metric_games:    { en:'Games', vi:'Trò chơi' },
  metric_idioms:   { en:'Idioms', vi:'Thành ngữ' },
  metric_xp:       { en:'Practice XP', vi:'Điểm kinh nghiệm' },
  metric_mood:     { en:'Mood', vi:'Cảm xúc' },
  unit_min:        { en:'min', vi:'phút' },
  unit_sessions:   { en:'sessions', vi:'phiên' },
  unit_done:       { en:'done', vi:'lần' },
  unit_played:     { en:'played', vi:'lần chơi' },
  unit_learned:    { en:'learned', vi:'đã học' },
  unit_xp:         { en:'XP', vi:'XP' },

  period_daily:   { en:'Daily', vi:'Hằng ngày' },
  period_weekly:  { en:'Weekly', vi:'Hằng tuần' },
  period_monthly: { en:'Monthly', vi:'Hằng tháng' },
  h_practice_trends: { en:'Practice trends', vi:'Xu hướng luyện tập' },
  trend_this_wk:  { en:'This wk', vi:'Tuần này' },
  trend_last_wk:  { en:'Last wk', vi:'Tuần trước' },
  trend_nwk:      { en:'-{n}wk', vi:'-{n}tuần' },
  chart_line:     { en:'Line', vi:'Đường' },
  chart_bar:      { en:'Bar', vi:'Cột' },
  chart_pie:      { en:'Pie', vi:'Tròn' },

  word_yesterday:  { en:'yesterday', vi:'hôm qua' },
  word_lastweek:   { en:'last week', vi:'tuần trước' },
  word_lastmonth:  { en:'last month', vi:'tháng trước' },
  feel_better:     { en:'Feeling better than {word}.', vi:'Cảm thấy tốt hơn so với {word}.' },
  feel_lower:      { en:'Feeling a bit lower than {word}.', vi:'Cảm thấy hơi kém hơn so với {word}.' },
  feel_same:       { en:'Feeling about the same as {word}.', vi:'Cảm thấy tương tự như {word}.' },
  not_enough_mood: { en:'Not enough mood data yet.', vi:'Chưa đủ dữ liệu cảm xúc.' },
  same_as:         { en:'Same as {word}.', vi:'Giống như {word}.' },
  metric_change:   { en:'{metric} {dir} {delta}{unit} vs {word}.', vi:'{metric} {dir} {delta}{unit} so với {word}.' },
  dir_up:          { en:'up', vi:'tăng' },
  dir_down:        { en:'down', vi:'giảm' },

  /* Trends widget (mirrors StudentDeck's Stats & XP dashboard) */
  trends_for:      { en:'Practice stats · {name}', vi:'Thống kê luyện tập · {name}' },
  lvl_progress:    { en:'{into} / {need} XP to level {next} · {total} XP total', vi:'{into} / {need} XP để lên cấp {next} · tổng {total} XP' },
  streak_label:    { en:'Streak', vi:'Chuỗi ngày' },
  xp_bonus:        { en:'×{m} XP bonus', vi:'thưởng ×{m} XP' },
  range_today:     { en:'Today', vi:'Hôm nay' },
  range_week:      { en:'7 days', vi:'7 ngày' },
  range_all:       { en:'All time', vi:'Tất cả' },
  tile_xp:         { en:'XP earned', vi:'XP đạt được' },
  tile_games:      { en:'Games played', vi:'Trò chơi đã chơi' },
  tile_focus:      { en:'Focus sessions', vi:'Phiên tập trung' },
  tile_active:     { en:'Active time', vi:'Thời gian hoạt động' },
  tile_idioms:     { en:'Idioms learned', vi:'Thành ngữ đã học' },
  entry_one:       { en:'{n} entry', vi:'{n} mục' },
  entry_many:      { en:'{n} entries', vi:'{n} mục' },
  games_val:       { en:'{s} ({f} finished)', vi:'{s} ({f} hoàn thành)' },
  vs_word:         { en:'vs {word}', vi:'so với {word}' },
  word_prev7:      { en:'previous 7 days', vi:'7 ngày trước đó' },
  h_xp_source:     { en:'XP by source', vi:'XP theo nguồn' },
  h_time:          { en:'Time in each widget', vi:'Thời gian ở mỗi widget' },
  h_time_note:     { en:'(while active)', vi:'(khi đang hoạt động)' },
  h_games:         { en:'Game scores', vi:'Điểm trò chơi' },
  h_games_note:    { en:'(all time)', vi:'(toàn thời gian)' },
  h_xp7:           { en:'XP, last 7 days', vi:'XP 7 ngày qua' },
  h_recent:        { en:'Recent XP', vi:'XP gần đây' },
  empty_nothing_yet:{ en:'Nothing yet.', vi:'Chưa có gì.' },
  empty_no_xp:     { en:'No XP yet.', vi:'Chưa có XP.' },
  game_line:       { en:'played {n}× · best {b}, last {l} {label}', vi:'đã chơi {n} lần · cao nhất {b}, gần nhất {l} {label}' },
  game_noscore:    { en:'played {n}× · no score yet', vi:'đã chơi {n} lần · chưa có điểm' },
  trends_needs_update:{ en:'Some details (XP by source, time per widget, game scores, recent XP) appear once your child\u2019s StudentDeck is updated to v0.6.3 or newer.', vi:'Một số chi tiết (XP theo nguồn, thời gian mỗi widget, điểm trò chơi, XP gần đây) sẽ hiện khi StudentDeck của con được cập nhật lên v0.6.3 trở lên.' },
  trends_none_yet: { en:'No study activity synced yet. This fills in automatically once {name} opens StudentDeck (with Class joined) and starts using it.', vi:'Chưa có hoạt động học tập nào được đồng bộ. Mục này sẽ tự động có dữ liệu khi {name} mở StudentDeck (đã tham gia lớp) và bắt đầu sử dụng.' },
  stats_refresh:   { en:'Refresh stats', vi:'Làm mới thống kê' },
  stats_refreshed: { en:'Stats refreshed.', vi:'Đã làm mới thống kê.' },
  stats_refreshing:{ en:'Refreshing…', vi:'Đang làm mới…' },
  stats_updated:   { en:'Updated {time}', vi:'Cập nhật lúc {time}' },
  stats_refresh_failed:{ en:'Couldn\u2019t reach the server \u2014 check your connection and try again.', vi:'Không kết nối được máy chủ \u2014 hãy kiểm tra mạng và thử lại.' },
  trends_footnote: { en:'Practice XP is your child\u2019s own study XP from StudentDeck \u2014 separate from the teacher-awarded Reward Points.', vi:'XP luyện tập là điểm học tập riêng của con trong StudentDeck \u2014 tách biệt với Điểm thưởng do giáo viên trao.' },
  sd_timer:   { en:'Focus Timer', vi:'Hẹn giờ tập trung' },
  sd_todo:    { en:'Homework To-Do', vi:'Bài tập cần làm' },
  sd_reading: { en:'Reading Log', vi:'Nhật ký đọc sách' },
  sd_games:   { en:'Games Hub', vi:'Trò chơi' },
  sd_idiom:   { en:'Idiom of the Day', vi:'Thành ngữ hôm nay' },
  sd_stats:   { en:'Stats & XP', vi:'Thống kê & XP' },
  sd_journey: { en:'Journey', vi:'Hành trình' },
  sd_class:   { en:'Class', vi:'Lớp học' },
  xsrc_focus:   { en:'Focus sessions', vi:'Phiên tập trung' },
  xsrc_todo:    { en:'Homework done', vi:'Bài tập đã làm' },
  xsrc_reading: { en:'Reading', vi:'Đọc sách' },
  xsrc_game:    { en:'Games', vi:'Trò chơi' },
  xsrc_idiom:   { en:'Idiom of the day', vi:'Thành ngữ hôm nay' },
  xsrc_journal: { en:'Journal', vi:'Nhật ký' },
  xsrc_daily:   { en:'Daily visit', vi:'Lượt truy cập hằng ngày' },
  settings_lang:        { en:'Language', vi:'Ngôn ngữ' },
  settings_quick_pair:  { en:'Quick pair (header pill)', vi:'Cặp ngôn ngữ nhanh (thanh trên cùng)' },
  settings_theme:       { en:'Theme', vi:'Giao diện' },
  settings_theme_hint:  { en:'Pick a background for ParentDeck \u2014 the same six as StudentDeck. Applies instantly, saved on this device.', vi:'Chọn nền cho ParentDeck \u2014 giống sáu nền của StudentDeck. Áp dụng ngay, lưu trên thiết bị này.' },
  settings_account:     { en:'Account', vi:'Tài khoản' },
  settings_reset_layout:{ en:'Reset widget layout', vi:'Đặt lại bố cục widget' },
  settings_reset_done:  { en:'Layout reset. Reopen widgets from the dock.', vi:'Đã đặt lại bố cục. Mở lại widget từ thanh dock.' },
  settings_about:       { en:'ParentDeck v{v} \u2014 part of the TeachersDeck/StudentDeck/ParentDeck trifecta.', vi:'ParentDeck v{v} \u2014 một phần của bộ ba TeachersDeck/StudentDeck/ParentDeck.' },
  toast_earned: { en:'{name} just earned {n} pts{reason}', vi:'{name} vừa nhận được {n} điểm{reason}' },
  toast_lost:   { en:'{name} just lost {n} pts{reason}', vi:'{name} vừa bị trừ {n} điểm{reason}' },
};
Object.assign(STRINGS, BADGE_STRINGS);   // js/badges.js (loaded first) — Badge Display Case strings, v0.15.0
Object.assign(STRINGS, T1_STRINGS);   // js/tier1.js (loaded first) — titles, tray labels and every Tier 1 widget string
Object.assign(STRINGS, DrawDeck.strings);   // js/drawdeck-engine.js (loaded first) — toolbar/menu strings
Object.assign(STRINGS, KD_STRINGS);   // js/keepdeck.js (loaded first) — KeepDeck's own strings, v0.23.0
function t(key, vars) {
  let s = (STRINGS[key] && (STRINGS[key][ui.lang] || STRINGS[key].en)) || key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

function loadUI() {
  let s = {}; try { s = JSON.parse(localStorage.getItem(UIKEY)) || {}; } catch (e) {}
  // v0.6.0: "Weekly Summary" (id 'weekly') became "Student Summary" (id 'summary') — carry saved layout/open state over.
  if (s.active && 'weekly' in s.active) { s.active.summary = s.active.weekly; delete s.active.weekly; }
  if (s.layout && s.layout.weekly) { s.layout.summary = s.layout.weekly; delete s.layout.weekly; }
  // v0.7.0: Reward Points ('points') and Student Stats and XP ('trends') now live inside the full-screen Student Summary.
  if (s.active && (s.active.points || s.active.trends)) s.active.summary = true;
  if (s.active) { delete s.active.points; delete s.active.trends; }
  if (s.layout) { delete s.layout.points; delete s.layout.trends; }
  // v0.18.0: Goals & Streaks ('goals') is a section of Student Summary now, between Reward Points and Class Ranking.
  // The goals themselves (ui.goals) are untouched; only the old widget's open state, position and dock slot go.
  if (s.active && s.active.goals) s.active.summary = true;
  if (s.active) delete s.active.goals;
  if (s.layout) delete s.layout.goals;
  if (s.dockPlacement) delete s.dockPlacement.goals;
  // v0.8.0: the old standalone Calendar widget went away — its month calendar was nested inside Homework Assignments.
  // v0.15.0 brings a Calendar widget back (month grid + Week Ahead), so that clean-up must only run ONCE, on saves that
  // predate it (calV2 unset) — otherwise it would wipe the new widget's open/position state on every load.
  if (!s.calV2) {
    if (s.active && s.active.calendar) s.active.homework = true;
    if (s.active) delete s.active.calendar;
    if (s.layout) delete s.layout.calendar;
  }
  // v0.15.0: Week Ahead ('week') is now a tab inside Calendar — carry its open state, position and dock slot across.
  if (s.active && 'week' in s.active) { if (s.active.week) s.active.calendar = true; delete s.active.week; }
  if (s.layout && s.layout.week) { s.layout.calendar = s.layout.calendar || s.layout.week; delete s.layout.week; }
  if (s.dockPlacement && s.dockPlacement.week) { s.dockPlacement.calendar = s.dockPlacement.calendar || s.dockPlacement.week; }
  if (s.dockPlacement) delete s.dockPlacement.week;
  s.calV2 = true;
  // v0.12.0: layout modes + dock placement (ported from StudentDeck). Saved state from older builds simply lacks these, so they default in.
  const u = { active: {}, layout: {}, currentChild: null, lang: 'en', langPair: ['en', 'vi'], theme: 'dusk', layoutMode: 'cozy', dockAutoHide: false, dockPlacement: {}, calendarSystem: 'gregorian', calTab: 'month', ...s };
  u.edgeDock = { left: { visible: true, ...((s.edgeDock || {}).left || {}) }, right: { visible: true, ...((s.edgeDock || {}).right || {}) } };
  if (!['compact', 'cozy', 'custom'].includes(u.layoutMode)) u.layoutMode = 'cozy';
  if (!['gregorian', 'lunar', 'both'].includes(u.calendarSystem)) u.calendarSystem = 'gregorian';
  if (!['month', 'week'].includes(u.calTab)) u.calTab = 'month';
  return u;
}
const ui = loadUI();
function saveUI() { try { localStorage.setItem(UIKEY, JSON.stringify(ui)); } catch (e) {} }

/* ---------- Theme presets ----------
   Same six backgrounds/ids as StudentDeck's theme pill (its PRESETS list) — duplicated rather than shared because
   there's no build step. Like StudentDeck, a theme changes only the page background; panels and the gold accent stay
   put, so 'dusk' (the default) is the StudentDeck blue-and-yellow look. Saved ids from older ParentDeck builds that
   no longer exist (forest, grape, sunset) simply fall back to dusk. */
const THEME_PRESETS = [
  { id: 'dusk',    name: 'Dusk',    css: 'linear-gradient(180deg,#1a2740 0%, #2c3b57 38%, #3f4f68 62%, #263248 100%)' },
  { id: 'chalk',   name: 'Chalk',   css: 'linear-gradient(180deg,#2b2f26 0%, #3a4032 60%, #23261e 100%)' },
  { id: 'ocean',   name: 'Ocean',   css: 'linear-gradient(180deg,#0e2f3f 0%, #164a5c 55%, #0c2733 100%)' },
  { id: 'sunrise', name: 'Sunrise', css: 'linear-gradient(180deg,#3a2140 0%, #7a4a55 45%, #c98a5e 100%)' },
  { id: 'slate',   name: 'Slate',   css: 'linear-gradient(180deg,#20242c 0%, #2b3038 100%)' },
  { id: 'plain',   name: 'Plain',   css: '#12161C' }
];
function applyThemePreset(id) {
  const p = THEME_PRESETS.find(x => x.id === id) || THEME_PRESETS[0];
  document.body.style.background = p.css; document.body.style.backgroundSize = 'cover';
}

/* ---------- XP / level maths — the same formulas as StudentDeck's engine (js/app.js there) ---------- */
const levelStart = L => 100 * (L - 1) + 25 * (L - 1) * (L - 2);             // total XP at which level L begins: 0, 100, 250, 450…
function levelInfo(total) { let L = 1; while (total >= levelStart(L + 1)) L++; return { level: L, into: total - levelStart(L), need: levelStart(L + 1) - levelStart(L) }; }
const streakMult = n => n >= 2 ? Math.min(1.5, 1 + 0.1 * (n - 1)) : 1;
const fmtT = sec => sec >= 3600 ? `${Math.floor(sec / 3600)}h ${String(Math.floor(sec % 3600 / 60)).padStart(2, '0')}m` : sec >= 60 ? `${Math.floor(sec / 60)}m` : `${sec}s`;

let toastT;
/* kind: true / 'soft' = calm blue (a note of concern, a thanks); 'good' = warm gold with a little pop (good news). Anything else = the plain gold toast. */
function toast(msg, ms = 2600, kind = false) {
  const t = $('#toast'), k = kind === true ? 'soft' : (kind || '');
  t.textContent = msg; t.classList.remove('soft', 'good'); if (k) t.classList.add(k);
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');   // re-adding the class replays the pop even when a toast is already up
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---------- Flair ----------
   Small, optional motion. Everything here is skipped when the person has asked their system for reduced motion, and
   nothing is needed to read or use the app — the numbers and words are always there. */
const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function confetti(x, y, n = 28) {
  if (reduceMotion()) return;
  const box = document.createElement('div'); box.className = 'confetti'; box.setAttribute('aria-hidden', 'true');
  const palette = ['#f3c765', '#e0a93b', '#7aa7d9', '#9be89b', '#ff8fa3', '#c8a8ff'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${x}px;top:${y}px;background:${palette[i % palette.length]};width:${6 + Math.random() * 5}px;height:${9 + Math.random() * 7}px;--dx:${((Math.random() - .5) * 460).toFixed(0)}px;--dy:${(170 + Math.random() * 280).toFixed(0)}px;--r:${((Math.random() - .5) * 900).toFixed(0)}deg;--d:${(1100 + Math.random() * 900).toFixed(0)}ms`;
    box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 2300);
}
function sparkles(el, n = 9) {
  if (reduceMotion() || !el) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const sp = document.createElement('span'); sp.className = 'spark'; sp.setAttribute('aria-hidden', 'true'); sp.textContent = i % 3 ? '✨' : '⭐';
    const a = (i / n) * Math.PI * 2 + Math.random() * .6, d = 38 + Math.random() * 34;
    sp.style.cssText = `left:${cx}px;top:${cy}px;--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;font-size:${12 + Math.random() * 9}px`;
    document.body.appendChild(sp); setTimeout(() => sp.remove(), 1000);
  }
}
// numbers that count up from 0 (elements carry data-count="final"); the final value is always written, even if a re-render interrupts
function countUp(root) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count; if (!to || reduceMotion()) { el.textContent = el.dataset.count; return; }
    const t0 = performance.now(), dur = 850; el.textContent = '0';
    const step = now => { const k = Math.min(1, (now - t0) / dur); el.textContent = k < 1 ? Math.round(to * (1 - Math.pow(1 - k, 3))) : to; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/* v0.17.0 — Student Summary motion helpers.
   setHtml(el, html, play): writes html only if it differs from what is already there (a cached snapshot followed by an identical
   server one must not rebuild the DOM mid-animation), and toggles the entrance class `cls` on the host: present for the draw that
   should animate, absent for live updates, so a sync never replays it. Returns true when it wrote. */
function setHtml(el, html, play, cls = 'sm-in') {
  if (el._sig === html && !play) return false;
  el._sig = html; el.classList.toggle(cls, !!play); el.innerHTML = html;
  if (play) {
    el.querySelectorAll('.srow').forEach((r, i) => r.style.setProperty('--i', i)); countUp(el);
    // the entrance class comes off once it has played: the hover effects share these elements, and a class that stays would replay the entrance on mouse-out
    setTimeout(() => { if (el._sig === html) el.classList.remove(cls); }, 2800);
  }
  return true;
}
/* v0.20.0 — sparkle, the way StudentDeck does it: a little shower of four-point stars at a point inside `host` (host must be positioned). */
function starBurst(host, x, y, n = 10) {
  if (reduceMotion() || !host) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span'), a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 42;
    p.className = 'sp-spark'; p.setAttribute('aria-hidden', 'true'); p.textContent = Math.random() < .5 ? '\u2726' : '\u2727';
    p.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d - 14).toFixed(1)}px;animation-delay:${(Math.random() * .25).toFixed(2)}s;font-size:${(9 + Math.random() * 9).toFixed(1)}px`;
    host.appendChild(p); setTimeout(() => p.remove(), 1300);
  }
}
// ...centred on an element inside the host
function burstAt(host, el, n = 10) {
  if (!host || !el) return;
  const h = host.getBoundingClientRect(), r = el.getBoundingClientRect();
  starBurst(host, r.left - h.left + r.width / 2, r.top - h.top + r.height / 2, n);
}
// a number inside translated text that counts up: cnt(5, 'min_short') -> "<span data-count=5>5</span> min"
function cnt(n, key) {
  const span = `<span data-count="${+n || 0}">${+n || 0}</span>`;
  return key ? esc(t(key, { n: '\u0001' })).replace('\u0001', span) : span;
}

/* ---------- Modal (used for account / link-a-child) ---------- */
// Only ever holds the Account modal in this app, so this doubles as
// "is the Account modal currently the one showing" — used below to
// know when to redraw it in response to a background data change.
let accountModalOpen = false;
function openModal(title, bodyHTML) {
  $('#m-title').textContent = title; $('#m-body').innerHTML = bodyHTML;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; accountModalOpen = false; }
$('#m-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ---------- Pro (v0.21.4) — PRO-TIERS.md ----------
   ParentDeck Pro is a key bound to this parent's account; while it is active, every linked child is Pro in
   StudentDeck too (backend v2.1.0). PRO_GATE_ENABLED stays false until launch: nothing is locked. ?progate=1
   previews the gate. Never gated: anything a teacher sends (notes, reports, homework, calendar, attendance). */
const PRO_GATE_ENABLED = false;
const PRO_WIDGETS = ['badges', 'hwc', 'wish', 'starters', 'digest', 'pulse'];
const PD_ORDER_FORM_URL = 'https://forms.gle/SGUgGpgLyEjNu5iS8';   // where a family asks for a ParentDeck Pro key (change to your own form)
// v2.3.0: real subscription pricing (official pricing sheet), per child. Sibling discount
// (2nd child 30% off, 3rd+ 50% off) is shown as copy only here — see
// backend/functions/src/license.js for the matching billingCycle/expiresAt fields.
const PD_PRICING_VND = { monthly: 30000, annual: 300000 };
ProGate.configure({
  enabled: PRO_GATE_ENABLED, ids: PRO_WIDGETS,
  title: '⭐ A ParentDeck Pro widget',
  text: 'Included with ParentDeck Pro — which also unlocks StudentDeck Pro for every child you link.',
  ctaLabel: 'Get ParentDeck Pro', cta: () => { if (PD.getSession && PD.getSession()) { openAccountModal(); setTimeout(() => { const k = document.getElementById('pro-key'); if (k) k.focus(); }, 50); } else toast(t('pro_signin_first')); },
  onChange: () => { if (ProGate.enabled) location.reload(); if (accountModalOpen) openAccountModal(); }
});

// v0.21.5 anti-theft: exports carry this account's watermark (js/watermark.js); AdminDeck Key Manager traces it.
if (window.Watermark) Watermark.configure({ identity: () => { const s = PD.getSession && PD.getSession(), p = PD.getPro ? PD.getPro() : {};
  return `PD::${(p.info && p.info.key) || 'free'}::${(s && (s.uid || s.email)) || 'signed-out'}`; } });
/* ---- Official-build check (anti-theft, v0.21.5) ----
   The extension ID comes from the manifest's "key" (konabbakfllochlfepachaijclndabam), so a copy republished under another ID shows a notice and
   cannot activate Pro. Update OFFICIAL_IDS if the Chrome Web Store assigns a different ID when you publish. Pages served
   outside an extension (demo/testing over http) are not checked. */
const OFFICIAL_IDS = ['konabbakfllochlfepachaijclndabam'];
function isOfficialBuild(){ try{ return !(window.chrome && chrome.runtime && chrome.runtime.id) || OFFICIAL_IDS.includes(chrome.runtime.id); }catch(e){ return true; } }
if(!isOfficialBuild()) document.addEventListener('DOMContentLoaded', ()=>{
  const n = document.createElement('div'); n.className = 'unofficial-build'; n.setAttribute('role', 'alert');
  n.textContent = 'This copy of ParentDeck is not an official build. Pro and licence activation are switched off. Please install the official version.';
  document.body.prepend(n);
});

/* ---------- Account area ---------- */
function initials(name) { return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
function renderAcct() {
  const s = PD.getSession(), el = $('#acct');
  if (!s) { el.innerHTML = `<button class="btn primary" id="a-signin">${t('acct_signin')}</button> <button class="btn" id="a-demo">${t('acct_demo')}</button>`;
    $('#a-demo').addEventListener('click', () => PD_DEMO.enter());   // js/demo.js — sample family, no sign-in needed
    $('#a-signin').addEventListener('click', async () => {
      toast(t('acct_signing_in'));
      try { const sess = await PD.signInWithGoogle(); toast(t('acct_signed_in_as', { name: sess.displayName || sess.email })); refreshAll(); }
      catch (e) { toast(e.message || String(e)); }
    });
    return;
  }
  el.innerHTML = `<button class="acctbtn" id="a-open"><span class="avatar">${esc(initials(s.displayName))}</span>${esc(s.displayName)}</button>`;
  $('#a-open').addEventListener('click', openAccountModal);
}
function proSectionHtml() {
  const p = PD.getPro ? PD.getPro() : { active: false };
  if (p.active) return `<h4>⭐ ${t('pro_title')}</h4><p class="pro-on">${t('pro_active')}</p>`;
  const priceLine = t('pro_price_line', { monthly: `${PD_PRICING_VND.monthly.toLocaleString('vi-VN')}₫`, annual: `${PD_PRICING_VND.annual.toLocaleString('vi-VN')}₫` });
  return `<h4>⭐ ${t('pro_title')}</h4><p class="muted">${t('pro_pitch')}</p>
    <p class="muted">${priceLine}</p>
    <div class="row"><input type="text" id="pro-key" placeholder="PDPRO-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false"><button class="btn primary" id="pro-go">${t('pro_activate')}</button></div>
    <p class="muted"><a href="${PD_ORDER_FORM_URL}" target="_blank" rel="noopener">${t('pro_get')}</a></p>`;
}
function openAccountModal() {
  accountModalOpen = true;
  const kids = PD.getLinkedChildren();
  const rows = kids.map(k => `<div class="srow"><span>${esc(k.displayName)} <span class="muted">· ${esc(k.className)}</span></span><button class="x" data-unlink="${esc(k.studentId)}" aria-label="Unlink ${esc(k.displayName)}">×</button></div>`).join('') || `<p class="muted">${t('acct_no_children')}</p>`;
  openModal(t('acct_title'), `
    <p class="muted">${t('acct_signed_in_email', { email: esc(PD.getSession().email) })}</p>
    <h4>${t('acct_linked_children')}</h4>${rows}
    ${proSectionHtml()}
    <h4>${t('acct_link_child')}</h4>
    <div class="row"><input type="text" id="join-code" placeholder="${t('acct_join_code_ph')}" autocomplete="off" spellcheck="false"></div>
    <p class="muted">${t('acct_join_hint')}</p>
    <details class="join-classcode"><summary>${t('acct_classcode_summary')}</summary>
      <p class="muted">${t('acct_classcode_hint')}</p>
      <div class="row"><input type="text" id="join-name" placeholder="${t('acct_join_name_ph')}"></div>
    </details>
    <div class="row"><button class="btn primary" id="join-go">${t('acct_link_btn')}</button></div>
    <div class="row" style="margin-top:16px"><button class="btn" id="a-signout">${t('acct_signout')}</button></div>
  `);
  $('#m-body').querySelectorAll('[data-unlink]').forEach(b => b.addEventListener('click', async () => {
    try { await PD.unlinkChild(b.dataset.unlink); toast(t('acct_unlinked')); openAccountModal(); refreshAll(); }
    catch (e) { toast(e.message || String(e)); }
  }));
  $('#join-go').addEventListener('click', async () => {
    const code = $('#join-code').value, name = $('#join-name').value;
    try { const child = await PD.linkChild(code, name); toast(t('acct_linked_name', { name: child.displayName })); openAccountModal(); refreshAll(); }
    catch (e) {
      const c = String((e && e.code) || '').replace('functions/', '');
      // the server's own wording explains a refused class code, a lockout or a full family; a plain not-found gets ours
      toast(c === 'not-found' ? t('acct_link_notfound') : (e.message || String(e)));
    }
  });
  $('#a-signout').addEventListener('click', () => { PD.signOut(); closeModal(); toast(t('acct_signed_out')); refreshAll(); });
  const proGo = $('#pro-go');
  if (proGo) proGo.addEventListener('click', async () => {
    if (!isOfficialBuild()) { toast('This copy of ParentDeck is not an official build, so Pro cannot be activated here.'); return; }
    const key = $('#pro-key').value;
    proGo.disabled = true;
    try { const r = await PD.activatePro(key); toast(t('pro_activated', { n: r.children || 0 })); openAccountModal(); }
    catch (e) { toast(e.message || String(e)); proGo.disabled = false; }
  });
}

/* ---------- Child switcher ---------- */
function renderKids() { renderKidsInner(); bindXpPill(); }
function renderKidsInner() {
  const el = $('#kids'), kids = PD.getLinkedChildren();
  if (!PD.getSession()) { el.innerHTML = ''; return; }
  if (!kids.length) { el.innerHTML = `<button class="chip" id="k-add">${t('kids_add')}</button>`; $('#k-add').addEventListener('click', openAccountModal); return; }
  if (!ui.currentChild || !kids.some(k => k.studentId === ui.currentChild)) ui.currentChild = kids[0].studentId;
  el.innerHTML = kids.map(k => `<button class="chip kid ${k.studentId === ui.currentChild ? 'on' : ''}" data-id="${esc(k.studentId)}">${esc(k.displayName)}</button>`).join('');
  el.querySelectorAll('.kid').forEach(b => b.addEventListener('click', () => switchChild(b.dataset.id)));
  saveUI();
}
function switchChild(id) {
  if (id === ui.currentChild) return;
  ui.currentChild = id; saveUI(); renderKids();
  Object.keys(panels).forEach(wid => {
    const o = panels[wid], def = WIDGETS.find(w => w.id === wid);
    if (o.cleanup) o.cleanup();
    const body = $('.body', o.el); body.innerHTML = '';
    o.cleanup = ProGate.render(def, body);
  });
}

/* ---------- Header XP pill (StudentDeck-style: level + bar + total; click opens Trends) ---------- */
let pillUnsub = null, pillChild = null;
function bindXpPill() {
  const want = PD.getSession() && ui.currentChild ? ui.currentChild : null;
  if (want === pillChild) return;
  if (pillUnsub) { pillUnsub(); pillUnsub = null; }
  pillChild = want;
  const el = $('#xp');
  if (!want) { el.hidden = true; return; }
  pillUnsub = PD.subscribeChild(want, s => {
    if (!s) { el.hidden = true; return; }
    const total = s.practice.xpTotal || 0, L = levelInfo(total);
    $('#xp-lv').textContent = 'Lv ' + L.level; $('#xp-fill').style.width = Math.round(L.into / L.need * 100) + '%'; $('#xp-tot').textContent = total + ' XP';
    el.hidden = false;
  });
}
$('#xp').addEventListener('click', () => {
  if (!panels.summary) openWidget('summary');
  else { const L = ui.layout.summary; if (L && L.min) { L.min = false; panels.summary.el.classList.remove('min'); saveUI(); } }
  const host = $('#sm-stats'); if (!host) return;
  if (!$('.subbody', host)) $('[data-sub]', host).click();          // expand the section if it was collapsed
  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---------- Widgets ---------- */
function emptyState(msg) { return `<p class="muted" style="margin-top:20px;text-align:center">${esc(msg)}</p>`; }
function widgetGate(body, render) {
  if (!PD.getSession()) { body.innerHTML = emptyState(t('empty_signin')); return null; }
  if (!ui.currentChild) { body.innerHTML = emptyState(t('empty_link_child')); return null; }
  return render(ui.currentChild);
}

/* ---------- Notes Home (teacher -> parent) ----------
   A list of the teacher's notes about the current child. Unread ones stand out; opening one shows it and calls
   markNoteRead (a Cloud Function — the read receipt is written by the server, never by this app), after which the
   teacher's TeachersDeck shows it as Read. A 🙁 note is deliberately styled calmly (not the celebratory look). */
/* One note card, used by the Summary section AND the Teacher Notes widget so they cannot drift apart. `who` (optional) adds the
   child's name for the all-children inbox. Text stays hidden until the card is opened. */
function noteCard(n, isOpen, who) {
  const ms = n.createdAt && n.createdAt.toMillis ? n.createdAt.toMillis() : 0;
  return `<button type="button" class="note-card ${n.mood === 'frowny' ? 'frowny' : 'smiley'}${n.read ? '' : ' unread'}" data-note="${esc(n.id)}"${who ? ` data-kid="${esc(who.id)}"` : ''} aria-expanded="${isOpen}">
    <span class="note-top"><span class="note-mood">${n.mood === 'frowny' ? '🙁' : '🙂'}</span><b>${esc(t(n.mood === 'frowny' ? 'notes_concern' : 'notes_good'))}</b>${who && who.name ? `<span class="note-who">${esc(who.name)}</span>` : ''}<span class="muted">${ms ? esc(fmtTime(ms)) : ''}</span>${n.read ? '' : `<span class="note-dot" aria-label="unread"></span>`}</span>
    <span class="note-text">${isOpen ? esc(n.text || '') : `<span class="muted">${esc(t('notes_tap'))}</span>`}</span></button>`;
}
/* Opening an unread note: once the server has the read receipt, say so — warm and a little festive for good news (toast + confetti),
   calm for a note of concern (soft toast, no confetti). Only the first open of a note does this; re-reading a read note is silent. */
async function markRead(kidId, n, name) {
  try { await PD.markNoteRead(kidId, n.id); }
  catch (e) { if (window.console) console.warn('[ParentDeck] markNoteRead failed', e && (e.code || e.message)); toast(t('notes_read_fail')); return false; }
  const good = n.mood !== 'frowny';
  toast(t(good ? 'note_open_good' : 'note_open_calm', { name: name || '' }), good ? 4200 : 4800, good ? 'good' : 'soft');
  if (good) confetti(innerWidth / 2, 76);
  return true;
}
function renderNotesBody(body, id) {
  const open = new Set();
  let first = true;
  return PD.subscribeChild(id, s => {
    if (!s) return;
    const notes = s.notes || [];
    const play = first && !reduceMotion() && !!body.closest('.sm-anim'); first = false;   // v0.17.0: cards rise in one after another on the Summary's first draw only
    if (!notes.length) { setHtml(body, emptyState(t('notes_empty')), play); return; }
    // the cards are (re)built only when something about them changed, so an identical refresh never cuts the entrance short
    if (!setHtml(body, notes.map((n, i) => noteCard(n, open.has(n.id) || n.read).replace('class="note-card', `style="--i:${i}" class="note-card`)).join(''), play)) return;
    body.querySelectorAll('[data-note]').forEach(btn => btn.addEventListener('click', async () => {
      const n = notes.find(x => x.id === btn.dataset.note); if (!n) return;
      open.add(n.id); btn.setAttribute('aria-expanded', 'true');
      btn.querySelector('.note-text').textContent = n.text || '';
      if (!n.read) await markRead(id, n, s.displayName);
    }));
  });
}

/* ---------- Teacher Notes widget (Tier 2: the Notes Home inbox, every child in one place) ----------
   The Summary section above shows the SELECTED child's notes. This is the full inbox: all linked children, newest first,
   filter by child and by All / Unread. Same rules as the section: text stays hidden until the card is opened, and opening
   an unread card calls markNoteRead (a Cloud Function — the read receipt is written by the server, never by this app), after
   which the teacher sees ✅ Read. There is deliberately NO "mark all as read": that would tell the teacher a parent had read
   notes they had not. A note you opened stays in the Unread view until you leave it, so it doesn't vanish while you read it. */
function renderNotesWidget(body) {
  if (!PD.getSession()) { body.innerHTML = emptyState(t('empty_signin')); return null; }
  const kids = PD.getLinkedChildren();
  if (!kids.length) { body.innerHTML = emptyState(t('empty_link_child')); return null; }
  // state first: subscribeChild calls back synchronously when data is cached, and draw() reads all of this
  const snaps = {}, open = new Set(), unsubs = [], ac = new AbortController();
  let who = 'all', only = 'all', first = true;
  const msOf = n => (n.createdAt && n.createdAt.toMillis ? n.createdAt.toMillis() : 0);
  const unreadOf = id => ((snaps[id] || {}).notes || []).filter(x => !x.read).length;
  body.addEventListener('click', async e => {
    const chip = e.target.closest('[data-who]'); if (chip) { who = chip.dataset.who; draw(); return; }
    const f = e.target.closest('[data-only]'); if (f) { only = f.dataset.only; draw(); return; }
    const snap = e.target.closest('[data-kdnote]');
    if (snap) {
      const kid = snap.dataset.kid, s = snaps[kid], n = ((s || {}).notes || []).find(x => x.id === snap.dataset.kdnote);
      if (!s || !n) return;
      KeepDeckRender.save('note', kid, s, { t: msOf(n), lines: [n.mood === 'frowny' ? t('notes_concern') : t('notes_good'), n.text || ''] })
        .then(() => toast(t('kd_saved_scrap'))).catch(() => toast(t('kd_snapshot_fail')));
      return;
    }
    const card = e.target.closest('[data-note]'); if (!card) return;
    const kid = card.dataset.kid, n = ((snaps[kid] || {}).notes || []).find(x => x.id === card.dataset.note); if (!n) return;
    open.add(n.id); draw();                       // open it straight away; the read receipt follows
    if (!n.read) await markRead(kid, n, (snaps[kid] || {}).displayName);
  }, { signal: ac.signal });
  function draw() {
    const scEl = body.closest('.body'), sc = scEl ? scEl.scrollTop : 0, many = kids.length > 1;
    const rows = [];
    kids.forEach(k => { const s = snaps[k.studentId]; if (!s || (who !== 'all' && who !== k.studentId)) return; (s.notes || []).forEach(n => rows.push({ n, who: { id: k.studentId, name: many ? s.displayName : '' } })); });
    rows.sort((a, b) => msOf(b.n) - msOf(a.n));
    const total = kids.reduce((a, k) => a + unreadOf(k.studentId), 0);
    const shown = only === 'unread' ? rows.filter(r => !r.n.read || open.has(r.n.id)) : rows;
    const chip = (attr, val, label, n, on) => `<button class="chip${on ? ' on' : ''}" ${attr}="${esc(val)}">${esc(label)}${n ? `<i>${n}</i>` : ''}</button>`;
    // v0.20.0: cards rise in once, on the first draw that has every child's notes (with 2+ children the snapshots arrive one by one); an identical refresh leaves the DOM alone
    const ready = kids.every(k => snaps[k.studentId]), play = first && ready && !reduceMotion(); if (ready) first = false;
    let cardN = 0;
    if (!setHtml(body, `
      ${many ? `<div class="nfilters" role="group" aria-label="${esc(t('notes_who_all'))}">${chip('data-who', 'all', t('notes_who_all'), total, who === 'all')}${kids.map(k => chip('data-who', k.studentId, k.displayName, unreadOf(k.studentId), who === k.studentId)).join('')}</div>` : ''}
      <div class="nfilters" role="group">${chip('data-only', 'all', t('notes_f_all'), 0, only === 'all')}${chip('data-only', 'unread', t('notes_f_unread'), who === 'all' ? total : unreadOf(who), only === 'unread')}</div>
      ${shown.length ? shown.map(r => {
        const isOpen = open.has(r.n.id) || r.n.read;
        const card = noteCard(r.n, isOpen, r.who).replace('class="note-card', `style="--i:${cardN++}" class="note-card`);
        return card + (isOpen ? `<button type="button" class="btn sm kd-note-snap" data-kdnote="${esc(r.n.id)}" data-kid="${esc(r.who.id)}">${esc(t('kd_snapshot'))}</button>` : '');
      }).join('') : emptyState(t(rows.length ? 'notes_none_unread' : 'notes_empty'))}`, play)) return;
    if (scEl) scEl.scrollTop = sc;
  }
  kids.forEach(k => unsubs.push(PD.subscribeChild(k.studentId, s => { snaps[k.studentId] = s; draw(); })));
  return () => { ac.abort(); unsubs.forEach(u => u()); };
}

function renderPointsBody(body, id) {
  let first = true, latest = null;
  const ac = new AbortController();
  body.addEventListener('click', e => {
    if (!e.target.closest('[data-kdsnap]') || !latest) return;
    KeepDeckRender.save('rewardsSummary', id, latest, { points: latest.points, pointsLog: latest.pointsLog })
      .then(() => toast(t('kd_saved_scrap'))).catch(() => toast(t('kd_snapshot_fail')));
  }, { signal: ac.signal });
  const unsub = PD.subscribeChild(id, s => {
    if (!s) return;
    latest = s;
    const play = first && !reduceMotion() && !!body.closest('.sm-anim'); first = false;   // v0.17.0: count-up + bar on the Summary's first draw only
    setHtml(body, `
      <div class="lvl"><div class="big">Lv ${s.level}</div><div style="flex:1"><b style="font-size:20px;color:var(--gold-hi)">${cnt(s.points)} pts</b>
        <div class="muted">${esc(s.displayName)} · ${esc(s.className)}</div></div></div>
      <h4>${t('pts_recent')}</h4>
      ${s.pointsLog.slice(0, 8).map(p => `<div class="srow"><span>${fmtDate(p.t)} · ${esc(p.reason || p.from)} <span class="muted">— ${p.from === 'Redeemed' ? t('pts_redeemed') : t('pts_teacher')}</span></span><b>${p.amount >= 0 ? '+' : ''}${p.amount}</b></div>`).join('') || emptyState(t('empty_no_points'))}
      <button type="button" class="btn sm" data-kdsnap="1">${esc(t('kd_snapshot'))}</button>`, play);
    if (play) setTimeout(() => { if (body.isConnected) burstAt(body, body.querySelector('.lvl .big'), 12); }, 520);   // v0.20.0
  });
  return () => { ac.abort(); unsub(); };
}
/* ---------- Nested "widget in a widget" chrome ----------
   Used by Student Summary to embed Reward Points, Student Stats and XP, Class Ranking and
   Practice trends as their own collapsible mini-panels inside the full-screen Summary. `mount(body)`
   fills the sub-panel's own body and returns a cleanup fn (same contract as a top-level widget's
   render). Collapsed state persists per key in ui.summarySub, same as the rest of the UI state. */
function subWidget(container, key, titleKey, mount) {
  container.classList.add('subwidget');
  let cleanup = null;
  function render() {
    const collapsed = !!(ui.summarySub && ui.summarySub[key]);
    container.innerHTML = `<div class="subhead"><span class="subtitle">${t(titleKey)}</span><button class="hbtn" data-sub aria-label="${collapsed ? 'Expand' : 'Collapse'} ${esc(t(titleKey))}">${collapsed ? '+' : '–'}</button></div>${collapsed ? '' : '<div class="subbody"></div>'}`;
    if (cleanup) { cleanup(); cleanup = null; }
    if (!collapsed) cleanup = mount($('.subbody', container));
    $('[data-sub]', container).addEventListener('click', () => {
      ui.summarySub = ui.summarySub || {}; ui.summarySub[key] = !collapsed; saveUI(); render();
    });
  }
  render();
  return () => { if (cleanup) cleanup(); };
}

/* Class Ranking, as a mountable sub-panel body (moved into Student Summary — see renderSummary below; the Behaviour Log
   panel that used to sit beside it was removed in v0.17.0). `id` is the already-gated current child's studentId; no widgetGate
   here, Summary's own gate already covers it. */
function renderRankingBody(b, id) {
  let latest = null, first = true;
  const unsub = PD.subscribeChild(id, s => { if (s) { latest = s; draw(); } });
  const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
  function draw() {
    const play = first && !reduceMotion() && !!b.closest('.sm-anim'); first = false;   // v0.19.0: the button and caption pop in on the Summary's first draw
    // static markup: an identical refresh leaves the DOM alone, so a live update no longer wipes a ranking you already fetched
    if (!setHtml(b, `<div class=\"row center\"><button class=\"btn rk-btn\" id=\"rk-refresh\">${t('rank_refresh')}</button></div><div id=\"rk-out\">${emptyState(t('empty_tap_refresh'))}</div>`, play)) return;
    const btn = $('#rk-refresh', b), out = $('#rk-out', b);
    const show = (html, cls) => { out.className = cls || ''; out.innerHTML = html; };
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.classList.add('busy'); show(emptyState(t('loading')), 'rk-loading');
      try {
        const res = await PD.getRanking(id);
        // Parents' accounts carry no studentId claim, so the backend can only
        // identify "which row is my child" by name — and only when the class's
        // ranking visibility is set to "full". Anonymized/opt-out classes
        // intentionally can't be de-anonymized from here.
        const mine = res.visibility === 'full' ? res.rows.find(r => r.displayName === latest.displayName) : null;
        if (mine) {
          const pct = Math.round((1 - (mine.rank - 1) / Math.max(1, res.rows.length - 1)) * 100);
          out.className = '';
          setHtml(out, `
            <div style=\"text-align:center;margin:8px 0\">
              <div class=\"big\" style=\"font-size:34px;color:var(--gold-hi)\">${MEDAL[mine.rank] ? `<span class=\"rk-medal\" aria-hidden=\"true\">${MEDAL[mine.rank]}</span>` : ''}#${cnt(mine.rank)}</div>
              <div class=\"muted\">${t('rank_of_in', { total: res.rows.length, class: esc(latest.className) })}</div>
            </div>
            <div class=\"xpbar wide\"><i style=\"width:${pct}%\"></i></div>
            <p class=\"muted\" style=\"margin-top:10px\">${t('rank_only_own', { name: esc(latest.displayName) })}</p>`, !reduceMotion());   // a tap on Refresh always plays the reveal
          sparkles($('.big', out));                                   // both are no-ops under reduced motion
          if (mine.rank <= 3) { const r = out.getBoundingClientRect(); confetti(r.left + r.width / 2, r.top + 10, 34); }
        } else {
          show(emptyState(t('empty_rank_hidden', { name: esc(latest.displayName) })), 'rk-fade');
        }
      } catch (e) { show(emptyState(e.message || String(e)), 'rk-fade'); }
      finally { btn.disabled = false; btn.classList.remove('busy'); }
    });
  }
  draw();
  return unsub;
}
/* ---------- Student Summary: simple status at a glance (v0.14.0) ----------
   Four plain-language checks, each On track / Needs monitoring / Off track, rolled up into one headline. Thresholds live in
   STATUS_RULES (the "How is this worked out?" footnote reads the same object, so the two cannot drift apart). Same guardrails as the
   Tier 1 widgets: practice/homework numbers are what the child's app reported, a missing homework mark means "not marked", never
   "not done", and the mood word / journal text is NOT used. Behaviour comes from the teacher's notes (🙁 = note of concern) plus the
   behaviour log when the backend has one. Needs js/tier1.js's T1 (loaded before this file). */
const STATUS_RULES = { hwGood: 80, hwWatch: 50, readGood: 70, readWatch: 30, daysGood: 4, daysWatch: 2, streakGood: 3, streakWatch: 1, behWatch: 1, behOff: 2, behDays: 14 };
const STATUS_ICON = { good: '✅', watch: '👀', off: '⚠️', none: '⏳' };
// v0.21.0: colour is never the only signal — each stoplight box also carries a shape (● on track, ▲ needs monitoring, ■ off track), same as AdminDeck's School Stats
const STATUS_SHAPE = { good: '●', watch: '▲', off: '■', none: '⏳' };
const isLit = lv => lv === 'good' || lv === 'watch' || lv === 'off';
function summaryStatus(s) {
  const R = STATUS_RULES, daily = s.practiceDaily || {}, keys7 = T1.lastKeys(7);
  const lvl = (v, good, watch) => v >= good ? 'good' : v >= watch ? 'watch' : 'off';
  const hasPractice = Object.keys(daily).length > 0 || ((s.practice && s.practice.xpTotal) || 0) > 0;
  const items = [];
  // Homework: share of recent past-due (or already finished) assignments the child has marked done.
  const c = T1.completion(s), open = c.total - c.done;
  if (!c.total) items.push({ key: 'homework', level: 'none', value: t('st_hw_none') });
  else { const pct = Math.round(c.done / c.total * 100), level = lvl(pct, R.hwGood, R.hwWatch);
    items.push({ key: 'homework', level: level, value: t('st_hw_val', { done: c.done, total: c.total }), hint: open && level !== 'good' ? t('st_hw_hint', { n: open }) : '' }); }
  // Reading and daily practice: this past week of what the child's app reported.
  const readMin = T1.sumKeys(daily, keys7, 'readMin'), activeDays = keys7.filter(k => T1.isActive(daily[k])).length;
  items.push(hasPractice ? { key: 'reading', level: lvl(readMin, R.readGood, R.readWatch), value: t('st_read_val', { n: readMin }), hint: t('st_read_hint', { g: R.readGood }) }
                         : { key: 'reading', level: 'none', value: t('st_none') });
  items.push(hasPractice ? { key: 'practice', level: lvl(activeDays, R.daysGood, R.daysWatch), value: t('st_prac_val', { n: activeDays }), hint: t('st_prac_hint', { g: R.daysGood }) }
                         : { key: 'practice', level: 'none', value: t('st_none') });
  // Behaviour: teacher notes of concern + logged demerits in the last two weeks.
  const since = Date.now() - R.behDays * 864e5, ms = n => n.createdAt && n.createdAt.toMillis ? n.createdAt.toMillis() : 0;
  const concerns = (s.notes || []).filter(n => n.mood === 'frowny' && ms(n) >= since), unread = concerns.some(n => !n.read);
  const nBeh = concerns.length + (s.demerits || []).filter(d => (d.t || 0) >= since).length;
  items.push({ key: 'behaviour', level: nBeh >= R.behOff ? 'off' : nBeh >= R.behWatch ? 'watch' : 'good',
    value: nBeh ? t(nBeh === 1 ? 'st_beh_one' : 'st_beh_many', { n: nBeh }) : t('st_beh_good'), hint: unread ? t('st_beh_unread') : '' });
  const known = items.filter(i => i.level !== 'none'), off = known.filter(i => i.level === 'off').length, watch = known.filter(i => i.level === 'watch').length;
  // Behaviour alone can't make a status: it is "good" by default, so with nothing else reported there is nothing to say yet.
  const overall = known.length < 2 ? 'none' : off >= 2 ? 'off' : (off === 1 || watch >= 2) ? 'watch' : 'good';
  return { items, overall, attention: known.filter(i => i.level !== 'good').map(i => i.key === 'reading' ? t('weekly_reading') : t('st_m_' + i.key)) };
}
function statusHtml(s) {
  const R = STATUS_RULES, st = summaryStatus(s), name = esc(s.displayName);
  const label = key => key === 'reading' ? t('weekly_reading') : t('st_m_' + key);
  const sub = st.overall === 'none' ? t('st_sub_none', { name }) : st.attention.length ? t('st_sub_attn', { list: st.attention.join(', ') }) : t('st_sub_good');
  return `<section class="status-card ov-${st.overall}" aria-label="${esc(t('st_title_' + st.overall, { name: s.displayName }))}">
    <div class="st-head"><span class="st-icon" aria-hidden="true">${STATUS_ICON[st.overall]}</span>
      <div><h3 class="st-title">${t('st_title_' + st.overall, { name })}</h3><p class="st-sub">${sub}</p></div></div>
    <div class="st-items">${st.items.map((i, n) => `<div class="st-item lv-${i.level}" style="--i:${n}"${isLit(i.level) ? ` title="${esc(label(i.key))} — ${esc(t('st_' + i.level))}"` : ''}><div class="st-top"><span class="st-label">${esc(label(i.key))}</span><span class="st-pill">${STATUS_SHAPE[i.level]} ${t('st_' + i.level)}</span></div>
      <div class="st-val">${esc(i.value)}</div>${i.hint ? `<div class="muted st-hint">${esc(i.hint)}</div>` : ''}</div>`).join('')}</div>
    <p class="muted st-cap">${t('st_caption', { name })}</p>
    <details class="st-how"><summary>${t('st_how')}</summary>
      <p>${t('st_rule_hw', { g: R.hwGood, w: R.hwWatch })}</p><p>${t('st_rule_read', { g: R.readGood, w: R.readWatch })}</p><p>${t('st_rule_prac', { g: R.daysGood, w: R.daysWatch })}</p><p>${t('st_rule_beh')}</p><p>${t('st_rule_all')}</p></details>
  </section>`;
}

/* ---------- Student Summary: stoplight colours on the top boxes (v0.21.0) ----------
   The same look as the boxes at the top of AdminDeck's School Stats: green = on track, yellow = needs monitoring, red = off track, drawn as a solid
   coloured box with a tint and a glow, with ONE colour for everything on it, plus a shape (●/▲/■) so colour is never the only signal. It covers the four
   status boxes at the very top (they were already rated, only as a small pill) and the four "this week" tiles below them. The thresholds are the ones in
   STATUS_RULES (plus the streak rule), the legend reads the same object, and the tiles take their level from summaryStatus(), so a tile can never disagree
   with the status card. A box with no verdict stays plain: Points earned has no good or bad, and a child with no data yet is never shown as red. */
function weeklyTileLevels(s) {
  const R = STATUS_RULES, items = summaryStatus(s).items, lv = k => (items.find(i => i.key === k) || {}).level || 'none', streak = (s.practice && s.practice.streak) || 0;
  return { points: 'none', homework: lv('homework'), reading: lv('reading'),
           streak: lv('practice') === 'none' ? 'none' : streak >= R.streakGood ? 'good' : streak >= R.streakWatch ? 'watch' : 'off' };
}
function stoplightLegend() {
  const R = STATUS_RULES;
  return `<div class="sl-legend">${['good', 'watch', 'off'].map(k => `<span class="sl-key" data-st="${k === 'off' ? 'bad' : k}">${esc(t('st_' + k))}</span>`).join('')}
    <details><summary>${t('sl_how')}</summary><p>${t('sl_rule_hw', { g: R.hwGood, w: R.hwWatch })}</p><p>${t('sl_rule_read', { g: R.readGood, w: R.readWatch })}</p><p>${t('sl_rule_streak', { g: R.streakGood, w: R.streakWatch })}</p><p class="muted">${t('sl_rule_neutral')}</p></details></div>`;
}
// like cnt(), but the words around the number ("min", "days") are wrapped so a tile can show them smaller than the digits
function cntU(n, key) {
  const [pre, post] = esc(t(key, { n: '\u0001' })).split('\u0001'), u = x => x.trim() ? `<small class="sl-u">${x}</small>` : x;
  return u(pre) + `<span data-count="${+n || 0}">${+n || 0}</span>` + u(post || '');
}

/* ---------- Student Summary: the full-screen home for everything about the child ----------
   Skeleton is built once; each section is a collapsible sub-widget that subscribes to the child's snapshot on its
   own, so a live update redraws only that section (chart/range choices and scroll position survive). Order (v0.14.0): the simple status card
   (On track / Needs monitoring / Off track, see summaryStatus above) comes first, then Notes from teacher, then a "Detailed metrics" heading and everything below it. Detail order (v0.13.1):
   Notes from teacher first (an unread note from the teacher is the one thing here that is waiting for a reply from YOU),
   then Student Stats and XP across the full width, then Reward Points, Goals & Streaks and Class Ranking in a responsive
   grid, then Practice trends across the full width. The six "this week" tiles stay above as the Summary's header strip. */
function renderSummary(body) {
  return widgetGate(body, id => {
    const st = { period: 'daily', chart: 'bar', metric: 'readMin' };   // v0.17.0: bars by default (line and pie are one tap away)
    body.innerHTML = `<div id="sm-status"></div>
      <div class="sgrid sm-anim"><div id="sm-notes" class="sm-wide"></div><h3 class="sm-detail-h sm-wide">${esc(t('st_detail_h'))}</h3><div id="sm-head" class="sm-wide"></div><div id="sm-stats" class="sm-wide"></div><div class="sm-duo sm-wide"><div id="sm-points"></div><div id="sm-goals"></div><div id="sm-ranking"></div></div><div id="sm-trends" class="sm-wide"></div></div>`;
    // v0.20.0 hover sparkle (the rest of it is CSS): a tile's number counts up again, the level badge and goal rings throw stars
    const hac = new AbortController();
    body.addEventListener('mouseover', e => {
      const out = el => !el.contains(e.relatedTarget);
      const tile = e.target.closest('.tile'); if (tile && out(tile)) countUp(tile);
      const lvl = e.target.closest('.lvl'); if (lvl && out(lvl)) burstAt(lvl.closest('.subbody'), lvl.querySelector('.big'), 9);
      const ring = e.target.closest('.ring'); if (ring && out(ring)) burstAt(ring.closest('.subbody'), ring.querySelector('svg'), 6);
    }, { signal: hac.signal });
    let firstDraw = true;                    // v0.17.0: the entrance plays on the first draw for this child only, never on a live update
    const unsub = PD.subscribeChild(id, s => {
      if (!s) return;
      const play = firstDraw && !reduceMotion(); firstDraw = false;
      setHtml($('#sm-status', body), statusHtml(s), play);
      const w = s.weekly;
      const L = weeklyTileLevels(s);
      const tiles = [['points', t('weekly_points'), cnt(w.pointsEarned)], ['homework', t('weekly_hw'), cnt(w.homeworkDone)], ['reading', t('weekly_reading'), cntU(w.readingMinutes, 'min_short')], ['streak', t('weekly_streak'), cntU(s.practice.streak, s.practice.streak === 1 ? 'day_count' : 'days_count')]];
      setHtml($('#sm-head', body), `<p class=\"muted\" style=\"margin:0\">${t('weekly_this_week', { name: esc(s.displayName) })} · ${esc(s.className)}</p>${stoplightLegend()}<div class=\"tiles sm-tiles\">${tiles.map(([k, l, v], n) => `<div class=\"tile\" style=\"--i:${n}\"${isLit(L[k]) ? ` data-st=\"${L[k] === 'off' ? 'bad' : L[k]}\" title=\"${esc(l)} — ${esc(t('st_' + L[k]))}\"` : ''}><b>${v}</b><span>${l}</span></div>`).join('')}</div>`, play);
    });
    const subs = [
      subWidget($('#sm-notes', body), 'notes', 'w_notes', b => renderNotesBody(b, id)),
      subWidget($('#sm-points', body), 'points', 'w_points', b => renderPointsBody(b, id)),
      subWidget($('#sm-stats', body), 'stats', 'w_stats', b => renderStatsBody(b, id)),
      subWidget($('#sm-goals', body), 'goals', 'w_goals', b => renderGoalsBody(b, id)),
      subWidget($('#sm-ranking', body), 'ranking', 'w_ranking', b => renderRankingBody(b, id)),
      subWidget($('#sm-trends', body), 'trends', 'h_practice_trends', b => PD.subscribeChild(id, s => { if (s) drawTrendCharts(b, s, st, !b._drawn); }))
    ];
    return () => { hac.abort(); unsub(); subs.forEach(fn => fn && fn()); };
  });
}

/* ---------- Trends (line / bar / pie over StudentDeck's synced practice numbers + mood) ----------
   Reads s.practiceDaily — { 'YYYY-MM-DD': {xp,hw,readEntries,readMin,focus,games,idioms,mood} } — built
   in js/data.js from StudentDeck's cloud sync. Everything here is derived client-side; nothing is
   fetched separately. Journal text is never part of this data — only the day's mood word. */
const TREND_METRICS = [
  ['readMin', 'metric_reading', 'unit_min'], ['hw', 'metric_homework', 'unit_done'], ['focus', 'metric_focus', 'unit_sessions'],
  ['games', 'metric_games', 'unit_played'], ['idioms', 'metric_idioms', 'unit_learned'], ['xp', 'metric_xp', 'unit_xp']
];
const MOOD_SCORE = { sad: 1, meh: 2, happy: 3 };
const MOOD_EMOJI = { sad: '😢', meh: '😐', happy: '😊' };
const MOOD_COLOR = { sad: '#e05353', meh: '#a9b1c9', happy: '#9be89b' };
const dayKey = d => new Date(d).toLocaleDateString('en-CA');
const metricLabel = k => t((TREND_METRICS.find(m => m[0] === k) || [, 'metric_' + k])[1]);
const metricUnit = k => { const m = TREND_METRICS.find(x => x[0] === k); return m ? t(m[2]) : ''; };

// n buckets of `period`, ending today, each { label, days: [dateKeys...] }.
function trendRanges(period, n) {
  const now = Date.now(), out = [];
  for (let i = n - 1; i >= 0; i--) {
    if (period === 'daily') { const d = dayKey(now - i * 864e5); out.push({ label: new Date(d + 'T12:00').toLocaleDateString(locale(), { weekday: 'short' }), days: [d] }); }
    else if (period === 'weekly') { const days = Array.from({ length: 7 }, (_, j) => dayKey(now - (i * 7 + (6 - j)) * 864e5)); out.push({ label: i === 0 ? t('trend_this_wk') : i === 1 ? t('trend_last_wk') : t('trend_nwk', { n: i }), days }); }
    else { const first = new Date(now); first.setDate(1); first.setMonth(first.getMonth() - i); const days = [], md = new Date(first), month = md.getMonth(), today = new Date(now);
      while (md.getMonth() === month && md <= today) { days.push(dayKey(md)); md.setDate(md.getDate() + 1); }
      out.push({ label: first.toLocaleDateString(locale(), { month: 'short' }), days }); }
  }
  return out;
}
function bucketValue(daily, metric, days) {
  const recs = days.map(d => daily[d]).filter(Boolean);
  if (metric === 'mood') { const vs = recs.map(r => MOOD_SCORE[r.mood]).filter(Boolean); return vs.length ? Math.round(vs.reduce((a, v) => a + v, 0) / vs.length * 10) / 10 : null; }
  return recs.reduce((a, r) => a + (r[metric] || 0), 0);
}
const PERIOD_WORD = { daily: 'word_yesterday', weekly: 'word_lastweek', monthly: 'word_lastmonth' };
function comparisonLine(daily, metric, period) {
  const [prevB, curB] = trendRanges(period, 2), cur = bucketValue(daily, metric, curB.days), prev = bucketValue(daily, metric, prevB.days), word = t(PERIOD_WORD[period]);
  if (metric === 'mood') {
    if (cur === null || prev === null) return { text: t('not_enough_mood'), dir: 'flat' };
    const d = cur - prev;
    return d > 0.15 ? { text: t('feel_better', { word }), dir: 'up' } : d < -0.15 ? { text: t('feel_lower', { word }), dir: 'down' } : { text: t('feel_same', { word }), dir: 'flat' };
  }
  const delta = Math.round(((cur || 0) - (prev || 0)) * 10) / 10, unit = metricUnit(metric) ? ' ' + metricUnit(metric) : '';
  if (!delta) return { text: t('same_as', { word }), dir: 'flat' };
  return { text: t('metric_change', { metric: metricLabel(metric), dir: t(delta > 0 ? 'dir_up' : 'dir_down'), delta: Math.abs(delta), unit, word }), dir: delta > 0 ? 'up' : 'down' };
}
function moodCounts(daily, days) { const c = { sad: 0, meh: 0, happy: 0 }; days.forEach(d => { const m = daily[d] && daily[d].mood; if (m) c[m]++; }); return c; }
function lineChartSvg(points) {
  const W = 280, H = 100, mx = Math.max(1, ...points.map(p => p.value ?? 0)), n = points.length;
  const x = i => n > 1 ? (i / (n - 1)) * (W - 12) + 6 : W / 2;
  const y = v => H - 8 - ((v ?? 0) / mx) * (H - 16);
  const pts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  return `<svg class="linechart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <polyline pathLength="1" points="${pts}"/>${points.map((p, i) => `<circle style="--i:${i}" cx="${x(i)}" cy="${y(p.value)}" r="2.5"><title>${esc(p.label)}: ${p.value ?? '—'}</title></circle>`).join('')}
  </svg>`;
}
function drawTrendCharts(host, s, st, animate) {
  const daily = s.practiceDaily || {};
  const sig = st.metric + '|' + st.period + '|' + st.chart + '|' + JSON.stringify(daily);
  if (host._trSig === sig && !animate) return;          // same data and same choices: leave the DOM (and any animation under way) alone
  host._trSig = sig; host._drawn = true;
  host.classList.toggle('tr-in', !!animate && !reduceMotion());
  if (animate) setTimeout(() => { if (host._trSig === sig) host.classList.remove('tr-in'); }, 2800);   // entrance done: hover effects take over (see setHtml)   // v0.17.0: bars grow / line draws / pie sweeps on first draw and when a choice changes, never on a live update
  host.innerHTML = `
    <div class="row" style="margin:0 0 6px">
      <select id="tr-metric" aria-label="Metric" ${st.chart === 'pie' ? 'disabled' : ''}>${TREND_METRICS.map(([k, l]) => `<option value="${k}" ${k === st.metric ? 'selected' : ''}>${esc(t(l))}</option>`).join('')}<option value="mood" ${st.metric === 'mood' ? 'selected' : ''}>${esc(t('metric_mood'))}</option></select>
      <div class="row" role="group" aria-label="Period" style="margin:0">${[['daily', t('period_daily')], ['weekly', t('period_weekly')], ['monthly', t('period_monthly')]].map(([k, l]) => `<button class="chip ${k === st.period ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="row" role="group" aria-label="Chart type" style="margin:0 0 6px">${[['line', t('chart_line')], ['bar', t('chart_bar')], ['pie', t('chart_pie')]].map(([k, l]) => `<button class="chip ${k === st.chart ? 'on' : ''}" data-c="${k}">${l}</button>`).join('')}</div>
    <div id="tr-chart"></div><div id="tr-delta"></div>`;
  const n = st.chart === 'pie' ? 1 : (st.period === 'daily' ? 10 : st.period === 'weekly' ? 8 : 6);
  if (st.chart === 'pie') {
    const winDays = st.period === 'daily' ? 7 : st.period === 'weekly' ? 56 : 180;
    const days = Array.from({ length: winDays }, (_, i) => dayKey(Date.now() - i * 864e5));
    const c = moodCounts(daily, days), total = c.sad + c.meh + c.happy;
    if (!total) { $('#tr-chart', host).innerHTML = emptyState(t('empty_no_mood')); }
    else {
      let acc = 0; const stops = ['sad', 'meh', 'happy'].filter(k => c[k]).map(k => { const start = acc / total * 360; acc += c[k]; const end = acc / total * 360; return `${MOOD_COLOR[k]} ${start}deg ${end}deg`; }).join(', ');
      $('#tr-chart', host).innerHTML = `<div class="pie" style="background:conic-gradient(${stops})"></div>
        <div class="legend">${['sad', 'meh', 'happy'].filter(k => c[k]).map(k => `<div><span class="sw" style="background:${MOOD_COLOR[k]}"></span>${MOOD_EMOJI[k]} ${Math.round(c[k] / total * 100)}% (${t(c[k] === 1 ? 'day_count' : 'days_count', { n: c[k] })})</div>`).join('')}</div>`;
    }
    $('#tr-delta', host).innerHTML = '';
  } else {
    const buckets = trendRanges(st.period, n).map(r => ({ label: r.label, value: bucketValue(daily, st.metric, r.days) }));
    const hasData = buckets.some(b => b.value);
    if (!hasData) { $('#tr-chart', host).innerHTML = emptyState(t('empty_no_range_data')); }
    else if (st.chart === 'line') $('#tr-chart', host).innerHTML = lineChartSvg(buckets);
    else { const mx = Math.max(1, ...buckets.map(b => b.value ?? 0)), bestN = buckets.reduce((a, b2, n) => (b2.value || 0) > (buckets[a].value || 0) ? n : a, 0);
      $('#tr-chart', host).innerHTML = `<div class="cols">${buckets.map((b, n) => `<div class="col${b.value && n === bestN ? ' best' : ''}" style="--i:${n}" data-v="${b.value ?? '—'}" title="${esc(b.label)}: ${b.value ?? '—'}"><em>${b.value || ''}</em><i style="height:${Math.max(2, Math.round((b.value ?? 0) / mx * 100))}%"></i><span>${esc(b.label)}</span></div>`).join('')}</div>`; }
    const cmp = comparisonLine(daily, st.metric, st.period);
    $('#tr-delta', host).innerHTML = `<div class="delta ${cmp.dir}">${cmp.dir === 'up' ? '▲' : cmp.dir === 'down' ? '▼' : '·'} ${esc(cmp.text)}</div>`;
  }
  if (animate && !reduceMotion()) setTimeout(() => { const bi = host.querySelector('.col.best i'); if (bi && host.isConnected) burstAt(host, bi, 8); }, 1000);   // v0.20.0: a few stars over the best bar
  $('#tr-metric', host).addEventListener('change', e => { st.metric = e.target.value; drawTrendCharts(host, s, st, true); });
  host.querySelectorAll('[data-p]').forEach(btn => btn.addEventListener('click', () => { st.period = btn.dataset.p; drawTrendCharts(host, s, st, true); }));
  host.querySelectorAll('[data-c]').forEach(btn => btn.addEventListener('click', () => { st.chart = btn.dataset.c; drawTrendCharts(host, s, st, true); }));
}

/* ---------- Student Stats and XP: a straight mirror of StudentDeck's own Stats & XP dashboard ----------
   Same tiles, same headings, same Today/7 days/All time ranges, same bar-chart styling, read from what
   StudentDeck syncs into students/{id}.practice (xpTotal, streak, gameScores, recentXp) and its
   practiceDaily/* subcollection ({xp,hw,readEntries,readMin,focus,games,gamesStarted,idioms,mood,xpBy,timeBy}).
   gameScores/recentXp/xpBy/timeBy only exist once the linked child's StudentDeck is v0.6.3+; until then this
   shows the level/streak header, the 6 range tiles and the 7-day XP chart (all always-synced fields) and says
   plainly that the rest needs an update. Only numbers ever reach this widget — never journal text. */
const XP_SOURCES = ['focus', 'todo', 'reading', 'game', 'idiom', 'journal', 'daily', 'words', 'cards', 'notes', 'docs'];
const SD_WIDGETS = ['timer', 'todo', 'reading', 'games', 'idiom', 'stats', 'journey', 'class', 'translate', 'dict', 'cards', 'notes', 'files', 'docs'];
const srcLabel = k => XP_SOURCES.includes(k) ? t('xsrc_' + k) : k;
const sdWidgetLabel = k => SD_WIDGETS.includes(k) ? t('sd_' + k) : k;
let statsRange = 'today';                                        // remembered across redraws/collapses
function renderStatsBody(body, id) {
  {
    let range = statsRange, latest = undefined;                     // undefined = still loading; null = loaded but no snapshot
    let pulling = false, pulledAt = 0;                              // pulling: a forced server fetch is in flight
    let animateNext = true, lastSig = '';                           // v0.13.0: play the entrance on first draw and on a range change, never on a live update; lastSig skips a redraw that would change nothing
    async function pullNow() {
      pulling = true; draw();
      try { await PD.refreshChild(id); pulledAt = Date.now(); toast(t('stats_refreshed')); }
      catch (err) { toast(t('stats_refresh_failed')); if (window.console) console.warn('[ParentDeck] stats refresh failed', err); }
      pulling = false; draw();
    }
    // `bars` must exist before subscribeChild below: it calls back SYNCHRONOUSLY when the child's data is already cached (re-expanding this section, reopening Summary, switching child), and draw() uses it. Defined after the subscribe call, that was a 'Cannot access bars before initialization' crash that left the section blank.
    const bars = rows => { const mx = Math.max(1, ...rows.map(r => r.v)); return rows.map((r, i) => `<div class="bar" style="--i:${i}"><span>${esc(r.l)}</span><div><i style="width:${Math.round(r.v / mx * 100)}%"></i></div><b>${esc(r.t)}</b></div>`).join('') || `<p class="muted">${t('empty_nothing_yet')}</p>`; };
    body.innerHTML = emptyState(t('loading'));
    const unsub = PD.subscribeChild(id, s => { latest = s || null; draw(); });
    const clickAc = new AbortController();   // v0.9.1: removed on cleanup so re-mounts don't stack listeners (one tap = several server pulls)
    body.addEventListener('click', e => {
      const r = e.target.closest('[data-r]')?.dataset.r; if (r && latest) { statsRange = range = r; animateNext = true; draw(); return; }
      const sp = e.target.closest('[data-spark]'); if (sp) { sparkles(sp); return; }
      if (e.target.closest('[data-refresh]') && latest && !pulling) pullNow();
    }, { signal: clickAc.signal });
    const iv = setInterval(() => { if (latest) draw(); }, 60000);            // keeps "today" honest across midnight
    function draw() {
      if (latest === undefined) return;                          // subscribeChild hasn't reported back yet
      if (latest === null) { lastSig = ''; body.innerHTML = emptyState(t('empty_signin')); return; }
      const s = latest, scEl = body.closest('.body'), sc = scEl ? scEl.scrollTop : 0, daily = s.practiceDaily || {}, P = s.practice || { xpTotal: 0, streak: 0 };
      const dayKeys = () => { const all = Object.keys(daily), today = dayKey(Date.now()), cut = dayKey(Date.now() - 6 * 864e5);
        return range === 'today' ? all.filter(k => k === today) : range === 'week' ? all.filter(k => k >= cut) : all; };
      const T = { xp: 0, hw: 0, readEntries: 0, readMin: 0, focus: 0, games: 0, gamesStarted: 0, idioms: 0 }, xpBy = {}, timeBy = {};
      dayKeys().forEach(k => { const r = daily[k];
        Object.keys(T).forEach(f => { T[f] += r[f] || 0; });
        Object.entries(r.xpBy || {}).forEach(([src, n]) => { xpBy[src] = (xpBy[src] || 0) + n; });
        Object.entries(r.timeBy || {}).forEach(([w, n]) => { timeBy[w] = (timeBy[w] || 0) + n; }); });
      const totalT = Object.values(timeBy).reduce((a, c) => a + c, 0);
      const total = P.xpTotal || 0, L = levelInfo(total);
      // The synced streak is as of the child's last visit; if their newest synced day is older than yesterday, treat it as lapsed.
      const newest = Object.keys(daily).sort().pop() || '', streak = newest >= dayKey(Date.now() - 864e5) ? (P.streak || 0) : 0, m = streakMult(streak);
      const neverSynced = !Object.keys(daily).length && !total;
      if (neverSynced) {
        lastSig = ''; body.innerHTML = `<p class="muted" style="margin:0 0 8px">${t('trends_for', { name: esc(s.displayName) })}</p>${emptyState(t('trends_none_yet', { name: s.displayName }))}`;
        if (scEl) scEl.scrollTop = sc; return;
      }
      const hasExt = Object.values(daily).some(r => r.xpBy || r.timeBy) || Array.isArray(P.recentXp) || !!P.gameScores;
      // [emoji, label, shown value, number to count up to (only for plain numbers)]
      const tiles = [
        ['⭐', t('tile_xp'), T.xp, T.xp], ['📘', t('weekly_hw'), T.hw, T.hw],
        ['📖', t('weekly_reading'), `${t(T.readEntries === 1 ? 'entry_one' : 'entry_many', { n: T.readEntries })} · ${t('min_short', { n: T.readMin })}`],
        ['🎮', t('tile_games'), t('games_val', { s: T.gamesStarted, f: T.games })],
        ['⏱', t('tile_focus'), T.focus, T.focus], ['⚡', t('tile_active'), fmtT(totalT)]
      ];
      const xpRows = Object.keys(xpBy).map(k => ({ l: srcLabel(k), v: xpBy[k], t: xpBy[k] + ' XP' })).filter(r => r.v).sort((a, c) => c.v - a.v);
      const timeRows = Object.keys(timeBy).map(k => ({ l: sdWidgetLabel(k), v: timeBy[k], t: fmtT(timeBy[k]) })).filter(r => r.v).sort((a, c) => c.v - a.v);
      const days7 = [6, 5, 4, 3, 2, 1, 0].map(i => { const k = dayKey(Date.now() - i * 864e5); return { k, v: (daily[k] || {}).xp || 0 }; }), mx7 = Math.max(1, ...days7.map(d => d.v));
      const games = P.gameScores ? Object.values(P.gameScores) : null, recent = (P.recentXp || []).slice(-8).reverse();
      // v0.13.0: a horizontal dashboard that uses the whole width — [level ring | XP bar | streak | range controls] across the top, the six
      // tiles in one row, then five panels side by side. Each strip drops to fewer columns by the SECTION'S OWN width (container queries in
      // style.css), so a wide monitor gets one long row and a phone gets a single column.
      const C = 188.5, pctL = Math.round(L.into / L.need * 100), MILES = [3, 7, 14, 30, 60, 100, 365], nextM = MILES.find(x => x > streak);
      const bestIdx = days7.reduce((b, d, i) => d.v > days7[b].v ? i : b, 0), hasBest = days7[bestIdx].v > 0;
      const ringTip = esc(t('ring_tip', { n: L.level, p: pctL, m: L.level + 1 }));
      const nothing = `<p class="muted">${t('empty_nothing_yet')}</p>`;
      const inner = `
        <div class="s3top">
          <button type="button" class="s3ring" data-spark title="${ringTip}" aria-label="${ringTip}">
            <svg viewBox="0 0 72 72" aria-hidden="true"><circle class="rg-bg" cx="36" cy="36" r="30"/><circle class="rg-fg" cx="36" cy="36" r="30" style="--arc:${(pctL / 100 * C).toFixed(1)}" stroke-dasharray="${(pctL / 100 * C).toFixed(1)} ${C}" transform="rotate(-90 36 36)"/></svg>
            <span class="s3lv"><small>Lv</small><b>${L.level}</b></span>
          </button>
          <div class="s3xp">
            <p class="muted" style="margin:0 0 6px">${t('trends_for', { name: esc(s.displayName) })}</p>
            <div class="xpbar wide"><i style="width:${pctL}%"></i></div>
            <div class="muted" style="margin-top:4px">${t('lvl_progress', { into: L.into, need: L.need, next: L.level + 1, total })}</div>
            ${pctL >= 80 ? `<span class="s3almost">${esc(t('almost_lv', { n: L.level + 1 }))}</span>` : ''}
          </div>
          <div class="s3streak">
            <span class="flame${streak ? '' : ' off'}" aria-hidden="true">${streak ? '🔥' : '💤'}</span>
            <div><b>${t(streak === 1 ? 'day_count' : 'days_count', { n: streak })}</b> <span class="muted">${t('streak_label')}${m > 1 ? ' · ' + t('xp_bonus', { m: m.toFixed(1) }) : ''}</span>
              ${streak && nextM ? `<div class="muted s3next">${esc(t(nextM - streak === 1 ? 'streak_next_one' : 'streak_next', { n: nextM - streak, m: nextM }))}</div>` : ''}</div>
          </div>
          <div class="s3ctl">
            <div class="row" role="group" aria-label="Time range">${[['today', t('range_today')], ['week', t('range_week')], ['all', t('range_all')]].map(([k, l]) => `<button class="chip ${k === range ? 'on' : ''}" data-r="${k}">${l}</button>`).join('')}<button class="btn" data-refresh ${pulling ? 'disabled' : ''} title="${esc(t('stats_refresh'))}" aria-label="${esc(t('stats_refresh'))}">↻ ${pulling ? t('stats_refreshing') : t('stats_refresh')}</button></div>
            ${pulledAt ? `<span class="muted">${t('stats_updated', { time: new Date(pulledAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })}</span>` : ''}
            ${hasExt ? '' : `<p class="muted" style="margin:4px 0 0">${t('trends_needs_update')}</p>`}
          </div>
        </div>
        <div class="s3tiles">${tiles.map(([em, l, v, cnt], i) => `<div class="tile" style="--i:${i}"><b${cnt ? ` data-count="${cnt}"` : ''}>${esc(v)}</b><span><em>${em}</em> ${l}</span></div>`).join('')}</div>
        <div class="s3panels">
          <section class="s3p" style="--p:0"><h4>⚡ ${t('h_xp_source')}</h4>${bars(xpRows)}</section>
          <section class="s3p" style="--p:1"><h4>⏱ ${t('h_time')} <span class="muted">${t('h_time_note')}</span></h4>${bars(timeRows)}</section>
          <section class="s3p s3chart" style="--p:2"><h4>📈 ${t('h_xp7')}</h4><div class="cols">${days7.map((d, i) => `<div class="col${i === 6 ? ' today' : ''}${hasBest && i === bestIdx ? ' best' : ''}" style="--i:${i}" title="${d.k}: ${d.v} XP${hasBest && i === bestIdx ? ' · ' + esc(t('best_day')) : ''}"><em>${d.v || ''}</em><i style="height:${Math.round(d.v / mx7 * 100)}%"></i><span>${new Date(d.k + 'T12:00').toLocaleDateString(locale(), { weekday: 'narrow' })}</span></div>`).join('')}</div></section>
          <section class="s3p" style="--p:3"><h4>🎮 ${t('h_games')} <span class="muted">${t('h_games_note')}</span></h4>${games ? games.map(g => `<div class="srow"><span>${esc(g.name || '')}</span><span class="muted">${g.best !== null && g.best !== undefined ? t('game_line', { n: g.plays || 0, b: esc(g.best), l: esc(g.last), label: esc(g.label || '') }) : t('game_noscore', { n: g.plays || 0 })}</span></div>`).join('') : nothing}</section>
          <section class="s3p" style="--p:4"><h4>✨ ${t('h_recent')}</h4>${recent.map(e => `<div class="srow"><span>${fmtTime(e.t)} · ${esc(srcLabel(e.s))}</span><b>+${esc(e.n)}</b></div>`).join('') || `<p class="muted">${t('empty_no_xp')}</p>`}</section>
        </div>
        <p class="muted s3foot">${t('trends_footnote')}</p>`;
      // identical to what is already on screen -> leave the DOM alone (keeps hover, focus and scroll, and a live update never replays the animation)
      if (inner === lastSig && !animateNext) return;
      lastSig = inner;
      body.innerHTML = `<div class="s3${animateNext ? ' s3-in' : ''}">${inner}</div>`;
      if (animateNext) {
        const root = body.firstElementChild; countUp(root); animateNext = false;
        setTimeout(() => root.classList.remove('s3-in'), 2600);   // the entrance class goes away so that hovering a panel can replay ITS graph on its own
      }
      if (scEl) scEl.scrollTop = sc;
    }
    return () => { clickAc.abort(); unsub(); clearInterval(iv); };
  }
}

/* Read-only port of TeachersDeck's canonical month-grid calendar (js/app.js's renderCalendar
   there — same cal-* CSS classes, same layout) with the editing UI stripped out: no add/edit/
   delete, no manage mode, no ICS import. Renders into `el` from `events` (classes/{id}/calendarEvents
   docs, the same shape TeachersDeck writes and StudentDeck already reads). `nav` is the
   {viewYear, viewMonth, selectedDate} state object the CALLER owns and mutates on click — this
   function is a pure render, so the caller's own draw() (which already knows how to redraw its
   whole widget) is what re-invokes it after a nav click, exactly like TeachersDeck's own
   wireCalendar() calling its outer draw(). */
function renderMonthCalendar(el, events, nav, opts) {
  opts = opts || {};   // { lunar: 'gregorian'|'lunar'|'both', google: bool } — Homework's nested calendar passes none and looks exactly as before
  const showLunar = opts.lunar === 'lunar' || opts.lunar === 'both';
  const monthLabel = new Date(nav.viewYear, nav.viewMonth, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  const firstDow = new Date(nav.viewYear, nav.viewMonth, 1).getDay();
  const daysInMonth = new Date(nav.viewYear, nav.viewMonth + 1, 0).getDate();
  const weekdayFmt = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' });
  let weekdayRow = ''; for (let i = 0; i < 7; i++) weekdayRow += `<span>${weekdayFmt.format(new Date(2023, 0, 1 + i))}</span>`;
  const eventsOn = d => events.filter(e => e.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayStr = dayKey(Date.now());

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += `<button class="cal-cell empty" disabled></button>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = isoDate(nav.viewYear, nav.viewMonth + 1, d);
    const hasEvents = eventsOn(dateStr).length > 0;
    const lunarTag = showLunar ? `<span class="cal-lunar-day">${LUNAR.short(new Date(nav.viewYear, nav.viewMonth, d))}</span>` : '';
    cells += `<button class="cal-cell${dateStr === todayStr ? ' today' : ''}${dateStr === nav.selectedDate ? ' selected' : ''}" data-date="${dateStr}">${d}${lunarTag}${hasEvents ? '<span class="cal-dot"></span>' : ''}</button>`;
  }

  const dayEvents = eventsOn(nav.selectedDate);
  const selD = new Date(nav.selectedDate + 'T00:00:00');
  let dayLabel = selD.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' });
  if (opts.lunar === 'lunar') dayLabel = LUNAR.full(selD);
  else if (opts.lunar === 'both') dayLabel += ` \u00b7 ${LUNAR.full(selD)}`;
  const listHtml = dayEvents.length ? dayEvents.map(e => `
      <li class="cal-ev-row">
        ${e.time ? `<span class="cal-ev-time">${esc(e.time)}</span>` : ''}
        <span class="cal-ev-title">${e.type === 'assignment' ? '\ud83d\udcd8 ' : e.type === 'progress-report' ? '\ud83d\udcc8 ' : ''}${esc(e.title || t('cal_untitled'))}</span>
        ${opts.google && e.date ? `<a class="cal-ev-gcal" href="${esc(calGoogleUrl(e))}" target="_blank" rel="noopener" title="${esc(t('cal_add_google'))}" aria-label="${esc(t('cal_add_google'))}">\ud83d\udcc5</a>` : ''}
      </li>`).join('') : `<li class="muted">${t('cal_no_events')}</li>`;

  el.innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" id="mc-prev" aria-label="Previous month">${iconChevron('left')}</button>
      <span class="cal-month">${esc(monthLabel)}</span>
      <button class="cal-nav" id="mc-next" aria-label="Next month">${iconChevron('right')}</button>
    </div>
    <div class="cal-weekdays">${weekdayRow}</div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-day-head"><span class="cal-day-label">${esc(dayLabel)}</span></div>
    <ul class="cal-ev-list">${listHtml}</ul>`;

  el.querySelector('#mc-prev').addEventListener('click', () => { nav.viewMonth--; if (nav.viewMonth < 0) { nav.viewMonth = 11; nav.viewYear--; } renderMonthCalendar(el, events, nav, opts); });
  el.querySelector('#mc-next').addEventListener('click', () => { nav.viewMonth++; if (nav.viewMonth > 11) { nav.viewMonth = 0; nav.viewYear++; } renderMonthCalendar(el, events, nav, opts); });
  el.querySelectorAll('.cal-cell[data-date]').forEach(cell => cell.addEventListener('click', () => { nav.selectedDate = cell.dataset.date; renderMonthCalendar(el, events, nav, opts); }));
}
/* ---------- Lunar dates (ported verbatim from TeachersDeck's Calendar) ----------
   Vietnamese/Chinese lunisolar conversion at UTC+7. The algorithm is wrapped in an IIFE so its short helper names
   (INT, NewMoon, ...) stay private; only LUNAR.short ("15/8") and LUNAR.full ("ÂL 15/8") are exposed. */
const LUNAR = (() => {
const LUNAR_TZ = 7;
function INT(d){ return Math.floor(d); }

function jdFromDate(dd, mm, yy){
  const a = INT((14-mm)/12);
  const y = yy + 4800 - a;
  const m = mm + 12*a - 3;
  let jd = dd + INT((153*m+2)/5) + 365*y + INT(y/4) - INT(y/100) + INT(y/400) - 32045;
  if(jd < 2299161){
    jd = dd + INT((153*m+2)/5) + 365*y + INT(y/4) - 32083;
  }
  return jd;
}

function NewMoon(k){
  const T = k/1236.85, T2 = T*T, T3 = T2*T, dr = Math.PI/180;
  let Jd1 = 2415020.75933 + 29.53058868*k + 0.0001178*T2 - 0.000000155*T3;
  Jd1 += 0.00033*Math.sin((166.56+132.87*T-0.009173*T2)*dr);
  const M = 359.2242 + 29.10535608*k - 0.0000333*T2 - 0.00000347*T3;
  const Mpr = 306.0253 + 385.81691806*k + 0.0107306*T2 + 0.00001236*T3;
  const F = 21.2964 + 390.67050646*k - 0.0016528*T2 - 0.00000239*T3;
  let C1 = (0.1734-0.000393*T)*Math.sin(M*dr) + 0.0021*Math.sin(2*dr*M);
  C1 -= 0.4068*Math.sin(Mpr*dr) + 0.0161*Math.sin(dr*2*Mpr);
  C1 -= 0.0004*Math.sin(dr*3*Mpr);
  C1 += 0.0104*Math.sin(dr*2*F) - 0.0051*Math.sin(dr*(M+Mpr));
  C1 -= 0.0074*Math.sin(dr*(M-Mpr)) + 0.0004*Math.sin(dr*(2*F+M));
  C1 -= 0.0004*Math.sin(dr*(2*F-M)) - 0.0006*Math.sin(dr*(2*F+Mpr));
  C1 += 0.0010*Math.sin(dr*(2*F-Mpr)) + 0.0005*Math.sin(dr*(2*Mpr+M));
  let deltaT;
  if(T < -11) deltaT = 0.001 + 0.000839*T + 0.0002261*T2 - 0.00000845*T3 - 0.000000081*T*T3;
  else deltaT = -0.000278 + 0.000265*T + 0.000262*T2;
  return Jd1 + C1 - deltaT;
}

function sunLongitude(jdn){
  const T = (jdn - 2451545.0)/36525, T2 = T*T, dr = Math.PI/180;
  const M = 357.52910 + 35999.05030*T - 0.0001559*T2 - 0.00000048*T*T2;
  const L0 = 280.46645 + 36000.76983*T + 0.0003032*T2;
  let DL = (1.914600-0.004817*T-0.000014*T2)*Math.sin(dr*M);
  DL += (0.019993-0.000101*T)*Math.sin(dr*2*M) + 0.000290*Math.sin(dr*3*M);
  let L = (L0+DL)*dr;
  L -= Math.PI*2*INT(L/(Math.PI*2));
  return L;
}

function getSunLongitude(dayNumber, tz){ return INT(sunLongitude(dayNumber - 0.5 - tz/24) / Math.PI * 6); }
function getNewMoonDay(k, tz){ return INT(NewMoon(k) + 0.5 + tz/24); }

function getLunarMonth11(yy, tz){
  const off = jdFromDate(31,12,yy) - 2415021;
  const k = INT(off/29.530588853);
  let nm = getNewMoonDay(k, tz);
  if(getSunLongitude(nm, tz) >= 9) nm = getNewMoonDay(k-1, tz);
  return nm;
}

function getLeapMonthOffset(a11, tz){
  const k = INT((a11 - 2415021.076998695)/29.530588853 + 0.5);
  let last = 0, i = 1;
  let arc = getSunLongitude(getNewMoonDay(k+i, tz), tz);
  do{
    last = arc; i++;
    arc = getSunLongitude(getNewMoonDay(k+i, tz), tz);
  } while(arc !== last && i < 14);
  return i-1;
}

function convertSolar2Lunar(dd, mm, yy, tz){
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695)/29.530588853);
  let monthStart = getNewMoonDay(k+1, tz);
  if(monthStart > dayNumber) monthStart = getNewMoonDay(k, tz);
  let a11 = getLunarMonth11(yy, tz);
  let b11 = a11;
  let lunarYear;
  if(a11 >= monthStart){ lunarYear = yy; a11 = getLunarMonth11(yy-1, tz); }
  else { lunarYear = yy+1; b11 = getLunarMonth11(yy+1, tz); }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11)/29);
  let lunarLeap = 0, lunarMonth = diff + 11;
  if(b11 - a11 > 365){
    const leapOff = getLeapMonthOffset(a11, tz);
    if(diff >= leapOff){ lunarMonth = diff + 10; if(diff === leapOff) lunarLeap = 1; }
  }
  if(lunarMonth > 12) lunarMonth -= 12;
  if(lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day:lunarDay, month:lunarMonth, year:lunarYear, leap: lunarLeap===1 };
}
  const of = d => convertSolar2Lunar(d.getDate(), d.getMonth() + 1, d.getFullYear(), LUNAR_TZ);
  return {
    short: d => { const l = of(d); return `${l.day}/${l.month}${l.leap ? t('leap_suffix') : ''}`; },
    full:  d => { const l = of(d); return `${t('lunar_prefix')} ${l.day}/${l.month}${l.leap ? t('leap_suffix') : ''}`; }
  };
})();

/* "Add to Google Calendar" link for one event (TeachersDeck's buildGoogleCalUrl, minus the lesson-duration field ParentDeck never receives). */
function calGoogleUrl(ev) {
  const p2 = n => String(n).padStart(2, '0');
  let dates;
  if (ev.time) {
    const st = new Date(`${ev.date}T${ev.time}:00`), en = new Date(st.getTime() + 60 * 60000);
    const f = d => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00Z`;
    dates = `${f(st)}/${f(en)}`;
  } else {
    const st = new Date(`${ev.date}T00:00:00`), en = new Date(st.getTime() + 24 * 3600000);
    const f = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
    dates = `${f(st)}/${f(en)}`;
  }
  return 'https://calendar.google.com/calendar/render?' + new URLSearchParams({ action: 'TEMPLATE', text: ev.title || '', dates, details: ev.notes || '' }).toString();
}

function iconChevron(dir) { return dir === 'left' ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'; }

/* Calendar — the one place for dates (v0.15.0). TeachersDeck's canonical month grid (read-only here) plus, as a second tab,
   Week Ahead: the next 7 days of homework and class events with the .ics export. It replaces the separate Week Ahead widget.
   Month/day navigation, the chosen tab and the latest snapshot live in this closure, outside the subscribeChild callback, so
   a sync (a points award, say) redraws the pane without resetting the month being viewed. */
function renderCalendar(body) {
  return widgetGate(body, id => {
    const today = new Date();
    const nav = { viewYear: today.getFullYear(), viewMonth: today.getMonth(), selectedDate: dayKey(Date.now()) };
    let latest = null;
    body.innerHTML = `
      <div class="cal-tabs">
        <div class="row" role="tablist" style="margin:0">
          ${['month', 'week'].map(k => `<button class="chip" role="tab" data-tab="${k}">${esc(t('cal_tab_' + k))}</button>`).join('')}
        </div>
        <label class="cal-sys"><span class="muted">${esc(t('cal_sys_label'))}</span>
          <select id="cal-sys">${['gregorian', 'both', 'lunar'].map(k => `<option value="${k}">${esc(t('cal_sys_' + k))}</option>`).join('')}</select></label>
      </div>
      <div id="cal-pane"></div>`;
    const pane = body.querySelector('#cal-pane'), sel = body.querySelector('#cal-sys');
    sel.value = ui.calendarSystem;

    function draw() {
      body.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === ui.calTab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      body.querySelector('.cal-sys').hidden = ui.calTab !== 'month';
      if (!latest) { pane.innerHTML = emptyState(t('loading')); return; }
      if (ui.calTab === 'week') pane.innerHTML = weekAheadMarkup(latest);
      else renderMonthCalendar(pane, latest.calendar || [], nav, { lunar: ui.calendarSystem, google: true });
    }

    const ac = T1.listen(body, e => {
      const tab = e.target.closest('[data-tab]');
      if (tab) { ui.calTab = tab.dataset.tab; saveUI(); draw(); return; }
      if (e.target.closest('[data-act="ics"]') && latest) {
        downloadText(`week-ahead-${slug(latest.displayName)}-${T1.todayK()}.ics`, buildIcs(latest, weekPlan(latest)), 'text/calendar');
        toast(t('wk_exported'));
      }
    });
    sel.addEventListener('change', () => { ui.calendarSystem = sel.value; saveUI(); draw(); }, { signal: ac.signal });
    const unsub = PD.subscribeChild(id, s => { if (!s) return; latest = s; draw(); });
    draw();
    return () => { ac.abort(); unsub(); };
  });
}

/* Homework Assignments — the class's assignment list, same as before, with the TeachersDeck
   canonical month calendar now nested inside it (collapsed by default) instead of living in its
   own top-level widget: the calendar's own nav state (calOpen/viewYear/viewMonth/selectedDate)
   is hoisted to this closure, outside the subscribeChild callback, so paging through months isn't
   reset by an unrelated snapshot update (a points award, say) re-drawing the widget. */
function renderHomework(body) {
  const today = new Date();
  const nav = { viewYear: today.getFullYear(), viewMonth: today.getMonth(), selectedDate: dayKey(Date.now()) };
  let calOpen = false, lastSnap = null;

  function draw(s) {
    lastSnap = s;
    const hw = s.homework || [], done = s.homeworkDone || {};
    const hwHtml = hw.length ? hw.map(a => {
      const finished = !!(done[a.id] && done[a.id].done);
      return `
      <div class="srow" style="align-items:flex-start">
        <span>${finished ? '\u2705' : '\ud83d\udcd8'} ${esc((a.subject ? `[${a.subject}] ` : '') + (a.title || 'Assignment'))}${a.instructions ? `<br><span class="muted">${esc(a.instructions)}</span>` : ''}${a.points ? `<br><span class="muted">${t('hw_points', { n: a.points })}</span>` : ''}</span>
        <span class="muted" style="white-space:nowrap">${finished ? t('hw_done') : (esc(a.dueDate || '') + (a.dueTime ? ' ' + esc(a.dueTime) : ''))}</span>
      </div>`;
    }).join('') : emptyState(t('empty_no_homework'));

    body.innerHTML = `
      <button class="chip${calOpen ? ' on' : ''}" id="hw-cal-toggle" style="margin-bottom:8px">\ud83d\udcc5 ${t('hw_calendar_toggle')}</button>
      <div id="hw-cal-wrap" ${calOpen ? '' : 'hidden'}></div>
      <div id="hw-list">${hwHtml}</div>`;

    body.querySelector('#hw-cal-toggle').addEventListener('click', () => {
      calOpen = !calOpen;
      const wrap = body.querySelector('#hw-cal-wrap');
      wrap.hidden = !calOpen;
      body.querySelector('#hw-cal-toggle').classList.toggle('on', calOpen);
      if (calOpen) renderMonthCalendar(wrap, s.calendar || [], nav);
    });
    if (calOpen) renderMonthCalendar(body.querySelector('#hw-cal-wrap'), s.calendar || [], nav);
  }

  return widgetGate(body, id => PD.subscribeChild(id, s => { if (s) draw(s); }));
}

function renderTheme(body) {
  body.innerHTML = `<p class="muted" style="margin:0 0 8px">${t('settings_theme_hint')}</p><div class="theme-grid" id="th-grid"></div>`;
  function draw() {
    $('#th-grid', body).innerHTML = THEME_PRESETS.map(p => `
      <button class="theme-swatch${ui.theme === p.id ? ' on' : ''}" data-id="${p.id}">
        <span class="theme-swatch-dot" style="background:${p.css}"></span>
        <span>${esc(p.name)}</span>
      </button>`).join('');
  }
  body.addEventListener('click', e => {
    const id = e.target.closest('[data-id]')?.dataset.id; if (!id) return;
    ui.theme = id; saveUI(); applyThemePreset(id); draw();
  });
  draw();
}

/* ---------- Settings widget ---------- */
function renderSettings(body) {
  function draw() {
    body.innerHTML = `
      <div class="settings-row"><span>${t('settings_lang')}</span><select id="st-lang">${LANGS.map(l => `<option value="${l.code}" ${l.code === ui.lang ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
      <div class="settings-row" style="flex-direction:column;align-items:stretch;gap:6px">
        <span>${t('settings_quick_pair')}</span>
        <div class="row" style="margin:0">
          <select id="st-pair1">${LANGS.map(l => `<option value="${l.code}" ${l.code === ui.langPair[0] ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
          <select id="st-pair2">${LANGS.map(l => `<option value="${l.code}" ${l.code === ui.langPair[1] ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="settings-row"><span>${t('settings_theme')}</span><button class="btn" id="st-theme">${t('w_theme')} →</button></div>
      <div class="settings-row"><span>${t('settings_account')}</span><button class="btn" id="st-account">${t('acct_title')}</button></div>
      <div class="settings-row"><span>${t('settings_reset_layout')}</span><button class="btn" id="st-reset">↺</button></div>
      <div class="st-section" id="st-layout"></div>
      <p class="muted" style="margin-top:14px">${t('settings_about', { v: VERSION })}</p>`;
    renderLayoutSettings($('#st-layout', body));
    $('#st-lang', body).addEventListener('change', e => { setLang(e.target.value); });
    $('#st-pair1', body).addEventListener('change', e => { ui.langPair[0] = e.target.value; saveUI(); renderLangPill(); });
    $('#st-pair2', body).addEventListener('change', e => { ui.langPair[1] = e.target.value; saveUI(); renderLangPill(); });
    $('#st-theme', body).addEventListener('click', () => { panels.theme ? front(panels.theme.el) : openWidget('theme'); });
    $('#st-account', body).addEventListener('click', () => { PD.getSession() ? openAccountModal() : $('#a-signin')?.click(); });
    $('#st-reset', body).addEventListener('click', () => {
      ui.layout = {};
      Object.keys(panels).forEach(id => closeWidget(id));
      saveUI(); toast(t('settings_reset_done'));
    });
  }
  draw();
  return () => {}; // nothing to unsubscribe — everything here is local ui state
}

const I = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const WIDGETS = [
  // Reward Points, Student Stats and XP, Goals & Streaks and Class Ranking all live inside Student Summary as nested
  // sub-widgets — see renderSummary/subWidget above. Summary is `full`: it fills the whole wall and can't be moved/resized.
  { id: 'summary', cat: 'overview', titleKey: 'w_summary', icon: I('<path d="M3 10h18M7 3v4M17 3v4M4 6h16v15H4z"/>'), w: 380, h: 640, full: true, render: renderSummary },
  // Badge Display Case (v0.15.0, js/badges.js): full-screen trophy cabinet of the badges the child earned in StudentDeck + the rewards they redeemed.
  { id: 'badges', cat: 'rewards', titleKey: 'w_badges', icon: I('<circle cx="12" cy="9" r="6"/><path d="M8.5 14.2 7 22l5-3 5 3-1.5-7.8"/><path d="m12 6.2.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2L9.1 8.3l2-.3z"/>'), w: 380, h: 640, full: true, render: renderBadgeCase },
  // Teacher Notes (Tier 2): the Notes Home inbox for every linked child. The Summary keeps its own "Notes from teacher" section for the selected child.
  { id: 'notes', cat: 'overview', titleKey: 'w_notes', icon: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'), w: 380, h: 540, render: renderNotesWidget },
  { id: 'homework', cat: 'homework', titleKey: 'w_homework', icon: I('<path d="M6 3h9l3 3v15H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>'), w: 320, h: 440, render: renderHomework },
  { id: 'theme', cat: 'settings', titleKey: 'w_theme', icon: I('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18c1.1 0 2-.6 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="8" r="1"/>'), w: 300, h: 260, render: renderTheme },
  { id: 'settings', cat: 'settings', titleKey: 'w_settings', icon: I('<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.96 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 8.96 4.6a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>'), w: 360, h: 620, render: renderSettings },
  // ---- Tier 1 widgets (js/tier1.js, v0.9.1). Where each launcher lives is DEFAULT_PLACEMENT + the layout mode; the app tray lists them all. ----
  { id: 'family', cat: 'overview', show: () => PD.getLinkedChildren().length >= 2, titleKey: 'w_family', icon: I('<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M2.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6M14.5 14.6c.8-.4 1.6-.6 2.5-.6 2.5 0 4.5 2.4 4.5 6"/>'), w: 380, h: 420, render: renderFamilyOverview },
  { id: 'progress', cat: 'overview', titleKey: 'w_progress', icon: I('<path d="M4 20V10M10 20V4M16 20v-8"/><path d="M3 7l5-4 4 3 5-4"/>'), w: 340, h: 480, render: renderProgressReports },
  { id: 'calendar', cat: 'homework', titleKey: 'w_calendar', icon: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h3M13 14h3M8 17h3"/>'), w: 340, h: 520, render: renderCalendar },
  { id: 'hwc', cat: 'homework', titleKey: 'w_hwc', icon: I('<path d="M9 11l3 3 7-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8"/>'), w: 340, h: 460, render: renderHomeworkCompletion },
  { id: 'wish', cat: 'rewards', titleKey: 'w_wish', icon: I('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8H8.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8zM12 8h3.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8z"/>'), w: 340, h: 500, render: renderRewardsWishlist },
  { id: 'starters', cat: 'share', titleKey: 'w_starters', icon: I('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11h6M9 14h4"/>'), w: 340, h: 340, render: renderConversationStarters },
  { id: 'digest', cat: 'share', titleKey: 'w_digest', icon: I('<path d="M6 3h9l3 3v15H6z"/><path d="M9 9h6M9 13h6M9 17h3"/>'), w: 340, h: 520, render: renderWeeklyDigest },
  // ---- v0.15.0: Class Pulse (needs the getClassPulse Cloud Function; says so until it is deployed) and Attendance (needs TeachersDeck's attendance sync) ----
  { id: 'pulse', cat: 'overview', titleKey: 'w_pulse', icon: I('<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>'), w: 340, h: 480, render: renderClassPulse },
  { id: 'attend', cat: 'overview', titleKey: 'w_attend', icon: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15.5l2 2 4-4"/>'), w: 340, h: 520, render: renderAttendance },
  // v0.22.0 (backend v2.8.0): Scrapbook — approved Scrapdeck pages shared "to my family" (Scrapdeck sharing, M3)
  { id: 'scrapbook', cat: 'share', titleKey: 'w_scrapbook', icon: I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5L8 19"/>'), w: 360, h: 520, render: renderScrapbook },
  // v0.23.0: KeepDeck — Home board (js/keepdeck.js). Full-screen, like Summary/Badge Display Case. No school
  // data: boards live in this device's own IndexedDB, never Firestore.
  { id: 'keepdeck', cat: 'share', titleKey: 'w_keepdeck', icon: I('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>'), w: 380, h: 640, full: true, render: renderKeepDeck }
];

/* ---------- Shell: panels, drag, resize, dock (same pattern as TeachersDeck/StudentDeck) ---------- */
const wall = $('#wall'), panels = {}; let topZ = 10;
function front(el) { if (el.classList.contains('full')) return; if (+el.style.zIndex !== topZ) el.style.zIndex = ++topZ; }   // full-screen widgets stay underneath

function gesture(handle, el, mode, id) {
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || (mode === 'move' && e.target.closest('button'))) return;
    const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop, ow = el.offsetWidth, oh = el.offsetHeight;
    handle.setPointerCapture(e.pointerId); front(el); e.preventDefault();
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (mode === 'move') { el.style.left = clamp(ox + dx, 0, wall.clientWidth - 150) + 'px'; el.style.top = clamp(oy + dy, 0, wall.clientHeight - 44) + 'px'; }
      else { el.style.width = Math.max(220, ow + dx) + 'px'; el.style.height = Math.max(140, oh + dy) + 'px'; }
    };
    const up = () => {
      ['pointermove', 'pointerup', 'pointercancel'].forEach((t, i) => handle.removeEventListener(t, [mv, up, up][i]));
      const L = ui.layout[id]; L.x = el.offsetLeft; L.y = el.offsetTop; L.w = el.offsetWidth; if (!L.min) L.h = el.offsetHeight; saveUI();
    };
    handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  });
}

function openWidget(id) {
  const def = WIDGETS.find(w => w.id === id); if (!def || panels[id]) return;
  const floating = Object.values(panels).filter(o => !o.el.classList.contains('full'));   // full-screen panels don't count for placement
  const n = floating.length;
  const drawerOn = side => { const d = $('#dock-' + side); return !!d && !d.hidden && getComputedStyle(d).display !== 'none'; };
  const clearL = drawerOn('left') ? 132 : 24, clearR = drawerOn('right') ? 112 : 0;   // keep new panels out from under a visible side drawer
  let x = clearL; floating.forEach(o => { x = Math.max(x, o.el.offsetLeft + o.el.offsetWidth + 16); });
  const fits = x + def.w <= wall.clientWidth - clearR, off = 30 + n * 32;
  const L = ui.layout[id] = { x: fits ? x : clearL - 24 + off, y: fits ? 24 : off, w: def.w, h: def.h, min: false, ...ui.layout[id] };
  const el = document.createElement('section'); el.className = 'widget' + (def.full ? ' full' : '') + (L.min ? ' min' : '');
  const top = clamp(L.y, 0, Math.max(0, wall.clientHeight - 44));
  if (def.full) el.style.zIndex = 1;   // raiseFull() below orders the full-screen widgets among themselves
  else el.style.cssText = `left:${clamp(L.x, 0, Math.max(0, wall.clientWidth - 150))}px;top:${top}px;width:${L.w}px;height:${Math.max(140, Math.min(L.h, wall.clientHeight - top - 8))}px`;
  el.innerHTML = `<div class="head"><span class="title">${esc(t(def.titleKey))}</span>
    <button class="hbtn" data-w="min" aria-label="Minimise ${esc(t(def.titleKey))}">–</button><button class="hbtn" data-w="close" aria-label="Close ${esc(t(def.titleKey))}">×</button></div>
    <div class="body"></div><div class="grip" aria-hidden="true"></div>`;
  wall.appendChild(el); front(el);
  if (!def.full) { gesture($('.head', el), el, 'move', id); gesture($('.grip', el), el, 'resize', id); }
  el.addEventListener('pointerdown', () => front(el));
  el.addEventListener('click', e => {
    const w = e.target.closest('[data-w]')?.dataset.w;
    if (w === 'close') closeWidget(id);
    else if (w === 'min') { L.min = !L.min; el.classList.toggle('min', L.min); saveUI(); }
  });
  panels[id] = { el, cleanup: ProGate.render(def, $('.body', el)) };
  if (def.full) raiseFull(id);
  ui.active[id] = true; saveUI(); syncDock();
}
/* Full-screen widgets (Student Summary, Badge Display Case) share the wall, so the most recently opened or chosen one sits on top.
   They stay under every floating widget (those start at z-index 10). */
function raiseFull(id) {
  const ids = Object.keys(panels).filter(k => k !== id && panels[k].el.classList.contains('full')); ids.push(id);
  ids.forEach((k, i) => { panels[k].el.style.zIndex = Math.min(9, 1 + i); });
}
function closeWidget(id) {
  const o = panels[id]; if (!o) return;
  if (o.cleanup) o.cleanup(); o.el.remove(); delete panels[id]; ui.active[id] = false; saveUI(); syncDock();
}
function relabelPanels() {
  Object.keys(panels).forEach(id => {
    const def = WIDGETS.find(w => w.id === id), el = panels[id].el; if (!def || !el) return;
    $('.title', el).textContent = t(def.titleKey);
    el.querySelector('[data-w="min"]').setAttribute('aria-label', `Minimise ${t(def.titleKey)}`);
    el.querySelector('[data-w="close"]').setAttribute('aria-label', `Close ${t(def.titleKey)}`);
  });
}
function renderLangPill() {
  const el = $('#lang-toggle');
  el.innerHTML = ui.langPair.map(code => `<button data-code="${code}" class="${code === ui.lang ? 'on' : ''}">${code.toUpperCase()}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.code)));
}
function setLang(code) {
  ui.lang = code; saveUI();
  rebuildAllDocks(); relabelPanels(); renderLangPill(); refreshAll();
}
/* ---------- Layout modes, docks and the app tray ----------
   Ported from StudentDeck v0.9.0 (which ported it from TeachersDeck v0.14.1): same look, same rules, in ParentDeck's own shell.
   Every widget has exactly one launcher: the bottom dock (up to 10), the left or right side drawer (up to 5 each) or "hidden".
   The app tray — a sheet that slides up from the tab on the dock's top edge — lists EVERY widget whatever its launcher, so
   nothing is ever unreachable.
     Compact : only the bottom dock; side drawers off.
     Cozy    : bottom + left + right docks.   (the default)
     Custom  : the parent chooses each widget's launcher and whether each drawer shows.
   A mode never moves a widget between docks — it only decides which docks are SHOWN — so switching back and forth loses nothing.
   Also ported: "hide the bottom dock until I hover its tab"; a dock never shows more than its cap (the rest stay in the tray);
   side drawers vanish on narrow windows (≤680px).
   Not ported: StudentDeck's emoji toggle (ParentDeck widget names carry no emoji), its document-open dock tuck (ParentDeck has no
   documents), its separate Settings drawer (these controls live in ParentDeck's existing Settings widget instead).
   Differences from StudentDeck on purpose: choosing a widget in the tray closes the tray (ParentDeck's tray always did), and the
   full-screen Student Summary pads its sides and bottom so nothing hides under a drawer or the dock. */
const LAYOUT_MODES = ['compact', 'cozy', 'custom'];
const PLACES = ['bottom', 'left', 'right', 'hidden'];
const DOCK_CAPS = { bottom: 10, left: 5, right: 5 };
const DEFAULT_PLACEMENT = { summary: 'bottom', badges: 'bottom', notes: 'bottom', homework: 'bottom', progress: 'bottom', calendar: 'bottom', hwc: 'bottom', attend: 'bottom', pulse: 'left', wish: 'left', starters: 'left', digest: 'left', family: 'right', theme: 'right', settings: 'right' };
const TRAY_CATS = ['overview', 'homework', 'rewards', 'share', 'settings'];

const isVisible = w => !w.show || w.show();                      // Family Overview only exists with two or more linked children
const widgetsFor = loc => WIDGETS.filter(w => ui.dockPlacement[w.id] === loc && isVisible(w)).slice(0, DOCK_CAPS[loc] || 99);   // a dock never shows more than its cap
const placementCount = loc => widgetsFor(loc).length;
function ensureDockPlacement() {                                  // first run, and any widget added in a later version: its default launcher (or hidden if that dock is full)
  let changed = false;
  WIDGETS.forEach(w => {
    if (ui.dockPlacement[w.id]) return;
    const want = DEFAULT_PLACEMENT[w.id] || 'hidden';
    ui.dockPlacement[w.id] = want !== 'hidden' && placementCount(want) >= DOCK_CAPS[want] ? 'hidden' : want; changed = true;
  });
  if (changed) saveUI();
}
const effectiveSideVisible = side => ui.layoutMode === 'compact' ? false : ui.layoutMode === 'cozy' ? true : !!ui.edgeDock[side].visible;
const toggleWidget = id => {
  const o = panels[id]; if (!o) return openWidget(id);
  // a full-screen widget that is open but hidden under another one is brought to the front instead of closed
  const fullTop = Math.max(0, ...Object.values(panels).filter(x => x.el.classList.contains('full')).map(x => +x.el.style.zIndex || 1));
  if (o.el.classList.contains('full') && (+o.el.style.zIndex || 1) < fullTop) { o.el.classList.remove('min'); raiseFull(id); } else closeWidget(id);
};

function syncDock() {
  document.querySelectorAll('.dock-item[data-id], .app-tray-item[data-id]').forEach(b => b.classList.toggle('active', !!panels[b.dataset.id]));
  updateNotesBadge();
}
// Unread Notes Home count on every launcher that opens the notes: Student Summary (it has the notes section) and Teacher Notes.
function updateNotesBadge() {
  const n = PD.getUnreadNotesCount();
  document.querySelectorAll('.dock-item[data-id="summary"], .dock-item[data-id="notes"], .app-tray-item[data-id="summary"], .app-tray-item[data-id="notes"]').forEach(btn => {
    let b = btn.querySelector('.badge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('i'); b.className = 'badge'; btn.appendChild(b); }
    b.textContent = n > 9 ? '9+' : String(n); b.setAttribute('aria-label', t('notes_unread', { n }));
  });
}
function makeDockButton(w, cls) {
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = cls + (panels[w.id] ? ' active' : ''); btn.dataset.id = w.id;
  btn.setAttribute('aria-label', 'Toggle ' + t(w.titleKey)); btn.title = t(w.titleKey);
  btn.innerHTML = `<span class="dock-ic">${w.icon}</span><span>${esc(t(w.titleKey))}</span>`;
  if (cls === 'dock-item') btn.addEventListener('click', () => toggleWidget(w.id));   // tray items are handled by one delegated listener (they also close the tray)
  return btn;
}
const dock = $('#dock');
function buildDock() {
  dock.innerHTML = ''; widgetsFor('bottom').forEach(w => dock.appendChild(makeDockButton(w, 'dock-item')));
  const auto = !!ui.dockAutoHide;
  $('#dock-wrap').classList.toggle('auto-hide', auto); document.body.classList.toggle('dock-auto', auto);
}
function buildSideDock(side) {
  const box = $('#dock-' + side + '-items'); box.innerHTML = ''; widgetsFor(side).forEach(w => box.appendChild(makeDockButton(w, 'dock-item')));
  const hide = !effectiveSideVisible(side) || !box.children.length;
  $('#dock-' + side).hidden = hide; document.body.classList.toggle(side === 'left' ? 'dl' : 'dr', !hide);   // the full-screen Summary pads itself clear of a visible drawer
}
function buildAppTray() {
  $('#app-tray-title').textContent = t('tray_title'); $('#app-tray-handle').setAttribute('aria-label', t('tray_close'));
  const tab = $('#app-tray-tab'); tab.setAttribute('aria-label', t('tray_open')); tab.title = t('tray_open');
  const grid = $('#app-tray-grid'); grid.innerHTML = '';
  TRAY_CATS.forEach(c => {
    const ws = WIDGETS.filter(w => w.cat === c && isVisible(w)); if (!ws.length) return;
    const h = document.createElement('p'); h.className = 'app-tray-cat'; h.textContent = t('cat_' + c); grid.appendChild(h);
    ws.forEach(w => grid.appendChild(makeDockButton(w, 'app-tray-item')));
  });
}
function openAppTray() { $('#app-tray-backdrop').hidden = false; const tab = $('#app-tray-tab'); tab.classList.add('open'); tab.setAttribute('aria-expanded', 'true'); }
function closeAppTray() { $('#app-tray-backdrop').hidden = true; const tab = $('#app-tray-tab'); tab.classList.remove('open'); tab.setAttribute('aria-expanded', 'false'); }
function rebuildAllDocks() { buildDock(); buildSideDock('left'); buildSideDock('right'); buildAppTray(); syncDock(); syncDockClearance(); }
/* v0.21.1: the wall (where widgets live) must end exactly where the bottom dock begins. The dock is taller than the old fixed 64px
   (tab + labelled buttons + 16px lift ≈ 130px), so the full-screen Summary used to run underneath it and leave a dead strip below.
   Measure the real dock, publish it as --dock-clear on <html>, and pull any floating widget back inside the shorter wall.
   Dock auto-hide keeps its own small clearance (body.dock-auto #wall in the CSS). */
function syncDockClearance() {
  const dw = $('#dock-wrap'); if (!dw) return;
  const lift = parseFloat(getComputedStyle(dw).bottom) || 0;
  const px = Math.ceil(dw.offsetHeight + lift + 12);   // 12px breathing room between the widget and the dock tab
  if (px > 40) document.documentElement.style.setProperty('--dock-clear', px + 'px');
  Object.keys(panels).forEach(id => {
    const el = panels[id].el, L = ui.layout[id]; if (!el || el.classList.contains('full') || !L) return;
    const top = clamp(el.offsetTop, 0, Math.max(0, wall.clientHeight - 44));
    if (top !== el.offsetTop) { el.style.top = top + 'px'; L.y = top; }
    if (!L.min && el.offsetTop + el.offsetHeight > wall.clientHeight - 8) {
      const h = Math.max(140, wall.clientHeight - el.offsetTop - 8); el.style.height = h + 'px'; L.h = h;
    }
  });
}
if (window.ResizeObserver) new ResizeObserver(syncDockClearance).observe($('#dock-wrap'));
window.addEventListener('resize', syncDockClearance);

/* The Layout section of the Settings widget. Re-renders itself after every change; its listeners are removed and re-added
   each time (the host element outlives every re-render, so plain addEventListener would stack duplicates). */
function renderLayoutSettings(host) {
  const locked = ui.layoutMode !== 'custom';
  host.innerHTML = `
    <h4 style="margin-top:0">${esc(t('lay_title'))}</h4><p class="muted">${esc(t('lay_hint'))}</p>
    <div class="layout-mode-grid">${LAYOUT_MODES.map(m => `<button type="button" class="layout-mode-opt${ui.layoutMode === m ? ' active' : ''}" data-mode="${m}"><span class="layout-mode-name">${esc(t('lay_' + m))}</span><span class="layout-mode-desc">${esc(t('lay_' + m + '_d'))}</span></button>`).join('')}</div>
    <h4>${esc(t('lay_buttons'))}</h4><p class="muted" style="margin:0 0 6px">${esc(t('lay_buttons_hint'))}</p>
    ${locked ? `<p class="muted lock-hint">${esc(t('lay_locked'))}</p>` : ''}
    <div class="dock-vis-list">${WIDGETS.filter(isVisible).map(w => `<div class="dock-vis-row placement-row${locked ? ' locked' : ''}"><span>${esc(t(w.titleKey))}</span><select data-place="${w.id}" ${locked ? 'disabled' : ''} aria-label="${esc(t(w.titleKey))}">${PLACES.map(pl => `<option value="${pl}" ${(ui.dockPlacement[w.id] || 'hidden') === pl ? 'selected' : ''}>${esc(t('place_' + pl))}</option>`).join('')}</select></div>`).join('')}</div>
    <h4>${esc(t('lay_drawers'))}</h4>
    ${['left', 'right'].map(sd => `<label class="switch-row${locked ? ' locked' : ''}"><span>${esc(t('lay_' + sd))}</span><input type="checkbox" data-drawer="${sd}" ${effectiveSideVisible(sd) ? 'checked' : ''} ${locked ? 'disabled' : ''}></label>`).join('')}
    ${locked ? `<p class="muted lock-hint">${esc(t('lay_locked'))}</p>` : ''}
    <label class="switch-row"><span>${esc(t('lay_autohide'))}</span><input type="checkbox" data-autohide ${ui.dockAutoHide ? 'checked' : ''}></label>
    <p class="muted" style="margin-top:4px">${esc(t('lay_autohide_hint'))}</p>`;
  if (host._ac) host._ac.abort(); const ac = host._ac = new AbortController();
  host.addEventListener('click', e => {
    const m = e.target.closest('[data-mode]')?.dataset.mode; if (!m || m === ui.layoutMode) return;
    ui.layoutMode = m; saveUI(); rebuildAllDocks(); renderLayoutSettings(host);
  }, { signal: ac.signal });
  host.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.place) {
      const id = el.dataset.place, target = el.value;
      if (target !== 'hidden' && target !== ui.dockPlacement[id] && placementCount(target) >= DOCK_CAPS[target]) { toast(t('place_full', { place: t('place_' + target), n: DOCK_CAPS[target] })); el.value = ui.dockPlacement[id] || 'hidden'; return; }
      ui.dockPlacement[id] = target; saveUI(); rebuildAllDocks(); renderLayoutSettings(host);
    } else if (el.dataset.drawer) { ui.edgeDock[el.dataset.drawer].visible = el.checked; saveUI(); rebuildAllDocks(); }
    else if ('autohide' in el.dataset) { ui.dockAutoHide = el.checked; saveUI(); buildDock(); }
  }, { signal: ac.signal });
}

ensureDockPlacement(); rebuildAllDocks();
$('#app-tray-tab').addEventListener('click', () => $('#app-tray-backdrop').hidden ? openAppTray() : closeAppTray());
$('#app-tray-handle').addEventListener('click', closeAppTray);
$('#app-tray-backdrop').addEventListener('click', e => { if (e.target.id === 'app-tray-backdrop') closeAppTray(); });
$('#app-tray-grid').addEventListener('click', e => {
  const id = e.target.closest('.app-tray-item')?.dataset.id; if (!id) return;
  toggleWidget(id); closeAppTray();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#app-tray-backdrop').hidden) closeAppTray(); });
$('#ver').textContent = 'v' + VERSION;
renderLangPill();
applyThemePreset(ui.theme);
$('#settings-btn').addEventListener('click', () => { panels.settings ? front(panels.settings.el) : openWidget('settings'); });

/* Re-render every open widget in place — used after sign-in/out, link/unlink, or a child switch. */
function refreshAll() {
  renderAcct(); renderKids();
  Object.keys(panels).forEach(id => {
    const o = panels[id], def = WIDGETS.find(w => w.id === id);
    if (o.cleanup) o.cleanup();
    const body = $('.body', o.el); body.innerHTML = '';
    o.cleanup = ProGate.render(def, body);
  });
}

PD.onAuthChanged(() => { renderAcct(); renderKids(); });
PD.onNotesChanged(updateNotesBadge);
// Real-time push for Notes Home: a new note from the teacher about a linked child. A 🙁 note gets a calmer toast than the celebratory ones.
PD.onNoteReceived((student, note) => {
  if (!student) return;
  const concern = note.mood === 'frowny';
  toast(t(concern ? 'toast_note_concern' : 'toast_note_good', { class: student.className || '', name: student.displayName }), concern ? 5200 : 3800, concern);
  updateNotesBadge();
});
// Real-time push: a new progress report for a linked child (same pattern as the points/homework/notes listeners).
PD.onProgressReportReceived((student) => {
  if (!student) return;
  toast(t('toast_progress', { name: student.displayName }), 4200);
});
PD.onLinksChanged(() => { renderKids(); rebuildAllDocks(); refreshAll(); if (accountModalOpen) openAccountModal(); });
// Real-time push: the moment TeachersDeck awards points to a linked child,
// this fires — closing the loop without the parent needing to refresh
// anything.
PD.onPointsAwarded((student, entry) => {
  if (!student) return;
  const verb = entry.delta >= 0 ? 'toast_earned' : 'toast_lost';
  toast(t(verb, { name: student.displayName, n: Math.abs(entry.delta), reason: entry.reason ? ' — ' + entry.reason : '' }));
});
// Real-time push: the moment a linked child ticks off a teacher-assigned
// homework in StudentDeck, this fires — same "no refresh needed" loop as
// the points listener above.
PD.onHomeworkCompleted((student, assignment) => {
  if (!student) return;
  toast(t('toast_hw_done', { name: student.displayName, title: (assignment && (assignment.title || 'Assignment')) || 'Assignment' }));
});
// Real-time push: the moment a linked child earns a new badge in StudentDeck (badges awarded silently on first sync never fire this).
PD.onBadgeEarned((student, badge) => {
  if (!student || !badge) return;
  toast(t('toast_badge', { name: student.displayName, badge: BC.clip(badge.name, 40) }), 4200);
});
renderAcct(); renderKids();
(Object.keys(ui.active || {}).length ? WIDGETS.map(w => w.id).filter(id => ui.active[id]) : ['summary']).forEach(openWidget);   // v0.9.3: first run opens Student Summary (was `Object.keys.length`, always true, so nothing opened)

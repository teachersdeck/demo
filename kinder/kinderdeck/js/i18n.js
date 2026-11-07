/* Shell strings as [English, Tiếng Việt]. Widget content uses L(en, vi) from widgets.js. */
const STR = {
  settings_title:['Settings','Cài đặt'], theme_title:['Theme','Giao diện'], close:['Close','Đóng'],
  app_tray_open:['Open app tray','Mở khay ứng dụng'], app_tray_close:['Close app tray','Đóng khay ứng dụng'], app_tray_title:['All widgets','Tất cả widget'],
  backgrounds:['Backgrounds','Hình nền'], your_image:['Your image or logo','Hình hoặc logo của bạn'], upload_bg:['Upload a background image','Tải hình nền lên'],
  bg_remove:['Remove my image','Xóa hình của tôi'], dim_bg:['Dim background (better contrast)','Làm tối nền (tương phản tốt hơn)'],
  bg_updated:['Background updated.','Đã cập nhật hình nền.'], bg_not_saved:['Background applied but could not be saved on this device.','Đã áp dụng hình nền nhưng không lưu được trên thiết bị này.'],
  status_demo:['Demo data','Dữ liệu mẫu'], status_live:['Live data','Dữ liệu thật'], data_section:['Data','Dữ liệu'], demo_label:['Show demo data','Hiện dữ liệu mẫu'],
  demo_hint:['Turn off to see only what you have entered: kitchen book, documents you added and your own figures. Demo campuses, children, suppliers, licences, menu and sample documents are hidden, not deleted.','Tắt để chỉ xem số liệu thật đã nhập: sổ bếp, tài liệu bạn đã thêm và số liệu của trường. Cơ sở, trẻ, nhà cung cấp, giấy phép, thực đơn và tài liệu mẫu được ẩn đi, không bị xóa.'], loc_all:['All locations','Tất cả cơ sở'],
  layout_mode_section:['Layout mode','Chế độ bố cục'], layout_mode_hint:['Choose how docks and the widget tray are arranged','Chọn cách sắp xếp dock và khay widget'],
  layout_mode_compact:['Compact','Gọn'], layout_mode_compact_desc:['Bottom dock only, no emoji. Everything else is in the app tray.','Chỉ có dock dưới, không emoji. Còn lại nằm trong khay ứng dụng.'],
  layout_mode_cozy:['Cozy','Thoải mái'], layout_mode_cozy_desc:['Emoji, bottom dock and both side drawers.','Có emoji, dock dưới và hai ngăn bên.'],
  layout_mode_custom:['Custom','Tùy chỉnh'], layout_mode_custom_desc:['You choose where each widget lives and what shows.','Bạn chọn vị trí từng widget và những gì hiển thị.'],
  emoji_section:['Widget icons','Biểu tượng widget'], show_emojis_label:['Show emoji icons','Hiện biểu tượng emoji'], layout_lock_hint:['Set by the layout mode above.','Do chế độ bố cục phía trên quyết định.'],
  dock_buttons:['Dock buttons','Nút trên dock'], dock_buttons_hint:['Choose where each widget’s launcher lives','Chọn nơi đặt nút mở từng widget'],
  placement_bottom:['Bottom dock','Dock dưới'], placement_left:['Left drawer','Ngăn trái'], placement_right:['Right drawer','Ngăn phải'], placement_top:['Top bar','Thanh trên'],
  placement_hidden:['Hidden','Ẩn'], placement_shown:['Shown','Hiện'],
  drawer_full_toast:['The {side} is full (max {max}).','{side} đã đầy (tối đa {max}).'],
  inactive_section:['Inactive widgets','Widget đã tắt'], inactive_hint:['Switched off and hidden from the docks and the tray, but kept.','Đã tắt và ẩn khỏi dock và khay nhưng vẫn được giữ lại.'],
  drawers_section:['Side drawers','Ngăn bên'], drawer_left_visible_label:['Show left drawer','Hiện ngăn trái'], drawer_right_visible_label:['Show right drawer','Hiện ngăn phải'],
  autohide_section:['Hide until I hover','Ẩn cho đến khi rê chuột'], dock_autohide_label:['Hide the bottom dock until I hover its tab','Ẩn dock dưới cho đến khi rê chuột vào tab'],
  toolbar_autohide_label:['Hide the top toolbar until I hover the top edge','Ẩn thanh công cụ trên cho đến khi rê chuột vào mép trên'],
  pills_section:['Top bar pills','Nút trên thanh trên'], pills_hint:['Which pills show in the top toolbar. Settings is always shown.','Chọn nút hiện trên thanh công cụ. Nút Cài đặt luôn hiện.'],
  pill_loc_label:['Location switcher','Chọn cơ sở'], pill_status_label:['Data status','Trạng thái dữ liệu'], pill_lang_label:['Language switch','Chuyển ngôn ngữ'], pill_theme_label:['Theme button','Nút giao diện'],
  layout_label:['Layout','Bố cục'], reset_layout:['Reset widget positions','Đặt lại vị trí widget'], reset_all:['Reset everything on this device','Đặt lại mọi thứ trên thiết bị này'],
  reset_all_confirm:['Reset KinderDeck on this device? This clears your theme, language, layout and local data.','Đặt lại KinderDeck trên thiết bị này? Thao tác này xóa giao diện, ngôn ngữ, bố cục và dữ liệu cục bộ.'],
  move_action:['Move','Di chuyển'], minimize_action:['Minimize','Thu nhỏ'], restore_action:['Restore','Khôi phục'],
  sheet_ok:['Done.','Xong.'], copied:['Copied.','Đã sao chép.']
};
const t = (k, v) => { const s = STR[k]; let r = s ? s[state.lang === 'vi' ? 1 : 0] : k; if (v) Object.keys(v).forEach(x => r = r.replace('{' + x + '}', v[x])); return r; };
function localizeNode(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n));
  root.querySelectorAll('[data-i18n-aria]').forEach(e => e.setAttribute('aria-label', t(e.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-title]').forEach(e => e.title = t(e.dataset.i18nTitle));
}

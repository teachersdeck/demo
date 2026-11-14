'use strict';
/* TinyTeachersDeck's edition file — the first script after js/mode.js. It says which app this is; js/app.js reads it.

   TinyTeachersDeck is the Kinder edition of TeachersDeck: js/app.js and the other shared files are TeachersDeck's, copied
   unchanged by ../tools/sync_shared.py from teachersdeck/teachersdeck-suite. `kinder: true` switches on what differs there
   (search app.js for KINDER); this app's own widgets are in js/kinder-widgets.js.

   officialIds: the Chrome extension ids that count as an official build (js/app.js shows a banner otherwise). The id below
   comes from the development `key` in manifest.json. When the extension is published the Chrome Web Store assigns its own
   id: replace it here and drop `key` from manifest.json for the store upload.

   The version lives here (tools/release.py checks it against manifest.json, index.html and the README). */
window.DECK_EDITION = Object.freeze({
  name: 'TinyTeachersDeck',
  version: '0.15.0',
  uni: false,
  kinder: true,
  store: true,   // premium themes, faces and docks are bought in the Shop (js/tdstore.js; owner, 14 Nov 2026)
  officialIds: ['gpefhecchiadgmfkgokghmlpaloggedb']
});

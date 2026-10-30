'use strict';
/* LectureDeck's edition file (UniDeck) — the first script on the page. It says which app this is; js/app.js reads it.

   LectureDeck runs on TeachersDeck's code. js/app.js and the other shared files come unchanged from the suite
   (teachersdeck/teachersdeck-suite, teachersdeck/) through ../tools/sync_shared.py: fix them there, never here. Inside the shared
   js/app.js the university differences sit behind UNI, APP and U(schoolText, uniText); this file switches them on.

   The version lives here (tools/release.py checks it against manifest.json, the HTML pages and the README). */
window.DECK_EDITION = Object.freeze({
  name: 'LectureDeck',
  version: '0.11.0',
  uni: true,                  // the university edition
  officialIds: ['lglogedbdfjcncfhmkbgkehljfnokbjd']   // this build's extension ID (manifest key); js/app.js treats it as official
});
document.documentElement.classList.add('uni');
document.title = '🎓 LectureDeck';

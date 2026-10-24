'use strict';
/* ParentDeck's edition file (UniDeck) — the first script on the page. It says which app this is; js/app.js reads it.

   ParentDeck runs on ParentDeck's code. js/app.js and the other shared files come unchanged from the suite
   (teachersdeck/teachersdeck-suite, parentdeck/) through ../tools/sync_shared.py: fix them there, never here. Inside the shared
   js/app.js the university differences sit behind UNI, APP and U(schoolText, uniText); this file switches them on.

   The version lives here (tools/release.py checks it against manifest.json, the HTML pages and the README). */
window.DECK_EDITION = Object.freeze({
  name: 'ParentDeck',
  version: '0.1.0',
  uni: true                   // the university edition
});
document.documentElement.classList.add('uni');
document.title = '👪 ParentDeck';

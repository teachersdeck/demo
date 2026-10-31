'use strict';
/* StudentDeck's edition file — the first script on the page. It says which app this is; js/app.js reads it.

   js/app.js (and the other shared files) are one file in two apps: StudentDeck here, and UniStudentDeck in the UniDeck
   repository (teachersdeck/unideck), which copies them unchanged with its tools/sync_shared.py. What differs between the
   two apps lives in each app's own edition file, index.html, manifest.json, demo.js and README — never in the shared files.

   VERSION lives here (tools/release.py checks it against manifest.json, index.html and the README). */
window.SD_EDITION = Object.freeze({
  name: 'StudentDeck',
  version: '0.23.0',
  uni: false,                 // the school edition
  xpOn: true,                 // XP, levels, badges and class points are always shown in StudentDeck
  setXp() {}                  // StudentDeck has no XP switch
});

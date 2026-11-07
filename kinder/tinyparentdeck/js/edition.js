'use strict';
/* TinyParentDeck's edition file — the first script after js/mode.js. It says which app this is; js/app.js reads it.

   TinyParentDeck is the Kinder edition of ParentDeck (it was called TinyDeck until 3 Nov 2026): the parents' app for
   preschool and kindergarten. js/app.js and the other shared files are ParentDeck's, copied unchanged by
   ../tools/sync_shared.py from teachersdeck/teachersdeck-suite. `kinder: true` switches on what differs there (search
   app.js for KINDER); this app's own widgets are in js/kinder-widgets.js.

   officialIds: the Chrome extension ids that count as an official build. The id below comes from the development `key`
   in manifest.json. When the extension is published the Chrome Web Store assigns its own id: replace it here and drop
   `key` from manifest.json for the store upload.

   The version lives here (tools/release.py checks it against manifest.json, index.html and the README). */
window.DECK_EDITION = Object.freeze({
  name: 'TinyParentDeck',
  version: '0.7.0',
  uni: false,
  kinder: true,
  officialIds: ['jchohfpfmfkcbofccdgjoakcjpcbnkae']
});

'use strict';
/* UniStudentDeck edition (UniDeck). VERSION lives here: tools/release.py checks it against manifest.json, index.html and the README.
   js/app.js and the other shared files come unchanged from StudentDeck (tools/sync_shared.py); this file says which app this is.
   History: UniStudentDeck began as StudentDeck v0.18.0's "Edition" switch; in UniDeck it is
   its own app, always the university edition. This file is the first script on the page, so the brand, page title and
   top-bar XP pill are right from the first paint.

   One choice is still the student's, stored in the real localStorage (captured before js/demo.js swaps in its throw-away
   storage, so it survives the demo):
     sd_uni_xp   '1' shows XP and levels (off by default, per the UniDeck scope doc)

   What the university edition changes lives in js/app.js under "UniStudentDeck edition"; this file only decides it. */
(function () {
  let ls = null; try { ls = window.localStorage; } catch (e) {}
  const get = k => { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } };
  const put = (k, v) => { try { if (ls) ls.setItem(k, v); } catch (e) {} };

  const xpOn = get('sd_uni_xp') === '1';
  window.SD_EDITION = Object.freeze({
    name: 'UniStudentDeck', version: '0.15.1', uni: true, xpOn,
    setXp(on) { put('sd_uni_xp', on ? '1' : '0'); location.reload(); }
  });

  const html = document.documentElement;
  html.classList.add('uni'); html.classList.toggle('no-xp', !xpOn);
  document.title = '🎓 UniStudentDeck';
})();

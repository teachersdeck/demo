'use strict';
/* StudentDeck / UniStudentDeck edition switch (v0.18.0) — UniDeck scope doc, "From StudentDeck to UniDeck".
   One build, two editions. The edition is read ONCE, here, before anything else runs (this file is the first script on the
   page, so the brand, page title and top-bar XP pill are right from the first paint), and switching reloads the page — the
   widget list is fixed at startup, so nothing has to be torn down live.

   Stored in the REAL localStorage, captured before js/demo.js swaps in its throw-away storage, so the edition survives the demo.
     sd_edition  'uni' | anything else (= StudentDeck)
     sd_uni_xp   '1' turns XP and levels back on in UniStudentDeck (they are off by default there, per the scope doc)
   ?edition=uni / ?edition=student in the URL sets the edition and drops the parameter (used by the demo landing page).

   What UniStudentDeck changes lives in js/app.js under "UniStudentDeck edition"; this file only decides WHICH edition it is. */
(function () {
  let ls = null; try { ls = window.localStorage; } catch (e) {}
  const get = k => { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } };
  const put = (k, v) => { try { if (ls) ls.setItem(k, v); } catch (e) {} };

  try {
    const u = new URL(location.href), p = u.searchParams.get('edition');
    if (p === 'uni' || p === 'student') {
      put('sd_edition', p === 'uni' ? 'uni' : 'student');
      u.searchParams.delete('edition'); history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  } catch (e) {}

  const uni = get('sd_edition') === 'uni', xpOn = !uni || get('sd_uni_xp') === '1';
  const ED = window.SD_EDITION = Object.freeze({
    uni, xpOn,
    name: uni ? 'UniStudentDeck' : 'StudentDeck',
    setUni(on) { put('sd_edition', on ? 'uni' : 'student'); location.reload(); },
    setXp(on) { put('sd_uni_xp', on ? '1' : '0'); location.reload(); }
  });

  const html = document.documentElement;
  html.classList.toggle('uni', uni); html.classList.toggle('no-xp', !xpOn);
  document.title = (uni ? '🎓 ' : '🎒 ') + ED.name;
})();

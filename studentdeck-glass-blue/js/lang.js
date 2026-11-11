'use strict';
/* =========================================================
   StudentDeck's language: English or Vietnamese (v0.22.0). Shared with UniDeck's UniStudentDeck (sync_shared).
   ---------------------------------------------------------
   The page's <html lang> is the one source of truth, the same convention as js/bento.js: any script can ask
   SD_LANG.vi() or write SD_LANG.T('English', 'Tiếng Việt'). Loaded right after js/mode.js, before anything paints.

   - The choice is kept in this browser (localStorage 'sd_lang'); until someone chooses, the app follows the browser's
     language: Vietnamese for a browser set to Vietnamese, English otherwise.
   - Static text in index.html says its Vietnamese in data-vi (and data-vi-aria, data-vi-ph for aria-label and
     placeholder); apply() swaps it in. Text drawn by scripts asks T() when it is drawn.
   - Settings gets a Language row at the top. Changing it reloads the page, so every widget redraws in the new language.
   The storage handle is captured here, before js/demo.js swaps in its throw-away storage, so the choice survives the demo.
   ========================================================= */
(function () {
  let ls = null; try { ls = window.localStorage; } catch (e) {}
  const KEY = 'sd_lang';
  const LANGS = [['en', 'English'], ['vi', 'Tiếng Việt']];
  let saved = null; try { saved = ls ? ls.getItem(KEY) : null; } catch (e) {}
  const browserVi = () => { try { return /^vi/i.test((navigator.languages && navigator.languages[0]) || navigator.language || ''); } catch (e) { return false; } };   // the browser's first choice
  const lang = LANGS.some(([c]) => c === saved) ? saved : browserVi() ? 'vi' : 'en';
  const root = document.documentElement;
  root.lang = lang;

  const vi = () => /^vi/i.test(root.lang || '');
  const T = (en, v) => (vi() && v ? v : en);

  /** Swap static text: data-vi (text), data-vi-aria (aria-label), data-vi-ph (placeholder), data-vi-title (title). */
  function apply(scope) {
    const on = vi();
    (scope || document).querySelectorAll('[data-vi],[data-vi-aria],[data-vi-ph],[data-vi-title]').forEach((el) => {
      for (const [attr, prop] of [['data-vi', null], ['data-vi-aria', 'aria-label'], ['data-vi-ph', 'placeholder'], ['data-vi-title', 'title']]) {
        if (!el.hasAttribute(attr)) continue;
        const keep = `${attr}-en`;
        if (!el.hasAttribute(keep)) el.setAttribute(keep, prop ? el.getAttribute(prop) || '' : el.textContent);
        const text = on ? el.getAttribute(attr) : el.getAttribute(keep);
        if (prop) el.setAttribute(prop, text); else el.textContent = text;
      }
    });
  }

  function set(code) {
    if (!LANGS.some(([c]) => c === code) || code === lang) return;
    try { if (ls) ls.setItem(KEY, code); } catch (e) {}
    location.reload();
  }

  /** The Language row at the top of Settings (bilingual, so anyone can find it). */
  function addPicker() {
    const body = document.querySelector('#settings-drawer .drawer-body');
    if (!body || body.querySelector('[data-sd-lang]')) return;
    const box = document.createElement('div');
    box.setAttribute('data-sd-lang', '');
    box.innerHTML = `<p class="drawer-label">Language · Ngôn ngữ</p><div class="row" role="radiogroup" aria-label="Language · Ngôn ngữ">${LANGS.map(([c, n]) =>
      `<button type="button" class="chip ${c === lang ? 'on' : ''}" role="radio" aria-checked="${c === lang}" data-l="${c}" lang="${c}">${n}</button>`).join('')}</div>
      <p class="dock-vis-hint" style="margin-bottom:20px">${T('The app reloads in the language you choose.', 'Ứng dụng sẽ tải lại bằng ngôn ngữ bạn chọn.')}</p>`;
    body.prepend(box);
    box.querySelectorAll('[data-l]').forEach((b) => { b.onclick = () => set(b.dataset.l); });
  }

  window.SD_LANG = Object.freeze({ LANGS, get: () => lang, vi, T, set, apply });
  const ready = () => { apply(); addPicker(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();

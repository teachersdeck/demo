'use strict';
/* TinyTeachersDeck preschool games: what the three pages share. Vietnamese first, English on the switch; the spoken word
   uses a voice of that language when the device has one (otherwise nothing is said). A round is five stars, then a
   celebration and a new round: nothing is scored, saved or compared between children. */
const KG = (() => {
  let lang = 'vi', sound = true;
  try { lang = localStorage.getItem('kg_lang') || 'vi'; sound = localStorage.getItem('kg_sound') !== 'off'; } catch (e) { /* private window */ }
  const asked = new URLSearchParams(location.search).get('lang');   // the app's language, passed by the Games widget
  if (asked === 'vi' || asked === 'en') lang = asked;
  const L = (en, vi) => (lang === 'en' ? en : vi);
  const $ = s => document.querySelector(s);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a, n) => shuffle(a.slice()).slice(0, n);

  function voice() {
    if (!('speechSynthesis' in window)) return null;
    const want = lang === 'en' ? 'en' : 'vi';
    return speechSynthesis.getVoices().find(v => (v.lang || '').toLowerCase().startsWith(want)) || null;
  }
  function say(text) {
    if (!sound || !text) return;
    const v = voice(); if (!v) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = 0.85; speechSynthesis.speak(u); } catch (e) { /* no speech */ }
  }

  function burst(el) {
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    ['⭐', '✨', '🎉', '💛', '⭐', '✨'].forEach((e, i) => {
      const s = document.createElement('span'); s.className = 'kg-burst'; s.textContent = e;
      const a = (i / 6) * Math.PI * 2; s.style.left = cx + 'px'; s.style.top = cy + 'px';
      s.style.setProperty('--dx', Math.cos(a) * 140 + 'px'); s.style.setProperty('--dy', Math.sin(a) * 140 + 'px');
      document.body.appendChild(s); setTimeout(() => s.remove(), 1100);
    });
  }
  function wiggle(el) { el.classList.remove('kg-wiggle'); void el.offsetWidth; el.classList.add('kg-wiggle'); }

  const PRAISE = () => L(['Great!', 'Well done!', 'Yes!', 'Super!'], ['Giỏi quá!', 'Đúng rồi!', 'Tuyệt vời!', 'Hoan hô!']);
  const AGAIN = () => L('Try again', 'Thử lại nhé');

  /* the page: title, the language and sound switches, the stars of the round */
  function shell(title, onLang) {
    document.title = title();
    $('#kg-title').textContent = title();
    const lb = $('#kg-lang'), sb = $('#kg-sound');
    const paintTop = () => {
      lb.textContent = lang === 'en' ? 'EN' : 'VI'; lb.setAttribute('aria-label', L('Language: English', 'Ngôn ngữ: Tiếng Việt'));
      sb.textContent = sound ? '🔊' : '🔇'; sb.setAttribute('aria-pressed', String(sound)); sb.setAttribute('aria-label', L('Sound', 'Âm thanh'));
      document.documentElement.lang = lang;
    };
    lb.addEventListener('click', () => { lang = lang === 'en' ? 'vi' : 'en'; try { localStorage.setItem('kg_lang', lang); } catch (e) {} paintTop(); document.title = title(); $('#kg-title').textContent = title(); onLang(); });
    sb.addEventListener('click', () => { sound = !sound; try { localStorage.setItem('kg_sound', sound ? 'on' : 'off'); } catch (e) {} if (!sound && 'speechSynthesis' in window) speechSynthesis.cancel(); paintTop(); });
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};   // Chrome loads the voices late
    paintTop();
  }
  let stars = 0;
  function paintStars() { $('#kg-stars').innerHTML = [0, 1, 2, 3, 4].map(i => `<span class="${i < stars ? 'on' : ''}" aria-hidden="true">⭐</span>`).join(''); }
  /* a right answer: a star; at five, the celebration, then next() starts a new round */
  function win(el, next) {
    burst(el); const p = PRAISE(); const msg = p[Math.floor(Math.random() * p.length)];
    $('#kg-hint').textContent = msg; say(msg);
    stars += 1; paintStars();
    if (stars < 5) { setTimeout(next, 900); return; }
    setTimeout(() => {
      const d = document.createElement('div'); d.className = 'kg-done';
      d.innerHTML = `<div style="font-size:80px" aria-hidden="true">🌟</div><b>${L('Five stars!', 'Năm ngôi sao!')}</b><button class="kg-big">${L('Play again', 'Chơi tiếp')}</button>`;
      document.body.appendChild(d); say(L('Five stars!', 'Năm ngôi sao!'));
      d.querySelector('button').addEventListener('click', () => { d.remove(); stars = 0; paintStars(); next(); });
      d.querySelector('button').focus();
    }, 900);
  }
  function miss(el) { wiggle(el); $('#kg-hint').textContent = AGAIN(); }

  return { L, $, pick, shuffle, say, shell, win, miss, paintStars, get lang() { return lang; } };
})();

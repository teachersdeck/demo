'use strict';
/* Chữ cái (Letters): a letter, three pictures; touch the one whose word starts with it. Touching a picture says its word.
   Vietnamese words start with the letter itself, never with a two-letter sound (ch, nh, ng, th, tr…) that begins with it. */
(() => {
  const { L, $, pick, shuffle, say, shell, win, miss, paintStars } = KG;
  const VI = [['a', '👕', 'áo'], ['b', '🐄', 'bò'], ['b', '🦋', 'bướm'], ['c', '🐟', 'cá'], ['c', '🦀', 'cua'], ['c', '🍊', 'cam'], ['d', '🍉', 'dưa hấu'], ['d', '🍍', 'dứa'],
    ['đ', '💡', 'đèn'], ['đ', '🥢', 'đũa'], ['e', '👶', 'em bé'], ['ê', '🐸', 'ếch'], ['g', '🐔', 'gà'], ['g', '🐻', 'gấu'], ['h', '🌸', 'hoa'], ['h', '🐷', 'heo'],
    ['k', '🍬', 'kẹo'], ['k', '✂️', 'kéo'], ['l', '🍐', 'lê'], ['l', '🍃', 'lá'], ['m', '🐱', 'mèo'], ['m', '🎩', 'mũ'], ['n', '🍄', 'nấm'], ['n', '🕯️', 'nến'],
    ['o', '🐝', 'ong'], ['ô', '☂️', 'ô'], ['q', '🎁', 'quà'], ['r', '🐢', 'rùa'], ['r', '🐍', 'rắn'], ['s', '⭐', 'sao'], ['s', '🥛', 'sữa'], ['t', '🍎', 'táo'],
    ['t', '🚂', 'tàu'], ['v', '🐘', 'voi'], ['v', '🦆', 'vịt'], ['x', '🚗', 'xe']];
  const EN = [['a', '🍎', 'apple'], ['b', '⚽', 'ball'], ['c', '🐱', 'cat'], ['d', '🐶', 'dog'], ['e', '🥚', 'egg'], ['f', '🐟', 'fish'], ['g', '🍇', 'grapes'],
    ['h', '🎩', 'hat'], ['i', '🍦', 'ice cream'], ['j', '🧃', 'juice'], ['k', '🪁', 'kite'], ['l', '🦁', 'lion'], ['m', '🌙', 'moon'], ['n', '👃', 'nose'],
    ['o', '🐙', 'octopus'], ['p', '🐷', 'pig'], ['q', '👑', 'queen'], ['r', '🌈', 'rainbow'], ['s', '☀️', 'sun'], ['t', '🐯', 'tiger'], ['u', '☂️', 'umbrella'],
    ['v', '🎻', 'violin'], ['w', '🍉', 'watermelon'], ['y', '🪀', 'yo-yo'], ['z', '🦓', 'zebra']];
  let letter = null, cards = [];
  const words = () => (KG.lang === 'en' ? EN : VI);
  const ask = () => L(`What starts with ${letter.toUpperCase()}?`, `Hình nào bắt đầu bằng chữ ${letter.toUpperCase()}?`);
  function paintAsk() { $('#kg-ask').innerHTML = `<div class="kg-letter">${letter.toUpperCase()}${letter}</div><span>${ask()}</span> <button class="kg-say" aria-label="${L('Say it again', 'Nói lại')}">🔈</button>`; $('#kg-ask .kg-say').addEventListener('click', () => say(ask())); }
  function next() {
    const W = words(), right = pick(W, 1)[0];
    letter = right[0];
    cards = shuffle([right].concat(pick(W.filter(w => w[0] !== letter), 2)));
    $('#kg-hint').textContent = '';
    $('#kg-stage').innerHTML = cards.map((c, i) => `<button class="kg-card" data-i="${i}"><span class="em" aria-hidden="true">${c[1]}</span><span class="wd">${c[2]}</span></button>`).join('');
    $('#kg-stage').querySelectorAll('.kg-card').forEach(b => b.addEventListener('click', () => {
      const c = cards[+b.dataset.i]; say(c[2]);
      if (c[0] === letter) setTimeout(() => win(b, next), 500); else miss(b);
    }));
    paintAsk(); say(ask());
  }
  shell(() => L('Letters', 'Chữ cái'), next);   // a language switch changes the alphabet, so a new card set
  paintStars(); next();
})();

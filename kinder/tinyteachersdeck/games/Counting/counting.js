'use strict';
/* Đếm số (Counting): count the things (touch each one, it shows its number), then touch how many there are.
   1 to 5 to start; the 1–10 switch is for older children. */
(() => {
  const { L, $, pick, shuffle, say, shell, win, miss, paintStars } = KG;
  const THINGS = [['🍎', 'apples', 'quả táo'], ['🐟', 'fish', 'con cá'], ['🧸', 'teddy bears', 'chú gấu bông'], ['🐥', 'chicks', 'chú gà con'], ['🌸', 'flowers', 'bông hoa'],
    ['🚗', 'cars', 'chiếc xe'], ['🎈', 'balloons', 'quả bóng bay'], ['🐞', 'ladybirds', 'con bọ rùa'], ['🍌', 'bananas', 'quả chuối'], ['🦆', 'ducks', 'con vịt']];
  const NUM_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
  const NUM_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  let max = 5, n = 0, thing = null, counted = 0;
  const ask = () => L(`How many ${thing[1]}?`, `Có bao nhiêu ${thing[2]}?`);
  function paintAsk() { $('#kg-ask').innerHTML = `<span>${ask()}</span> <button class="kg-say" aria-label="${L('Say it again', 'Nói lại')}">🔈</button>`; $('#kg-ask .kg-say').addEventListener('click', () => say(ask())); }
  function paintRange() { document.querySelectorAll('[data-max]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.max === max))); }
  function next() {
    n = 1 + Math.floor(Math.random() * max); thing = pick(THINGS, 1)[0]; counted = 0;
    $('#kg-hint').textContent = L('Touch each one to count.', 'Chạm vào từng cái để đếm nhé.');
    $('#kg-stage').innerHTML = `<div class="kg-things">${Array.from({ length: n }, (_, i) => `<button class="kg-thing" data-i="${i}" aria-label="${L(thing[1], thing[2])} ${i + 1}">${thing[0]}</button>`).join('')}</div>`;
    $('#kg-stage').querySelectorAll('.kg-thing').forEach(b => b.addEventListener('click', () => {
      if (b.querySelector('b')) return;
      counted += 1; b.insertAdjacentHTML('beforeend', `<b>${counted}</b>`); say(L(NUM_EN[counted], NUM_VI[counted]));
    }));
    const opts = new Set([n]); while (opts.size < 3) { const k = 1 + Math.floor(Math.random() * max + (max === 5 ? 1 : 0)); if (k <= 10) opts.add(k); }
    $('#kg-nums').innerHTML = shuffle([...opts]).map(k => `<button class="kg-card kg-num" data-k="${k}">${k}</button>`).join('');
    $('#kg-nums').querySelectorAll('.kg-num').forEach(b => b.addEventListener('click', () => {
      const k = +b.dataset.k;
      if (k === n) win(b, next); else { miss(b); say(L(NUM_EN[k], NUM_VI[k])); }
    }));
    paintAsk(); say(ask());
  }
  document.querySelectorAll('[data-max]').forEach(b => b.addEventListener('click', () => { max = +b.dataset.max; paintRange(); next(); }));
  shell(() => L('Counting', 'Đếm số'), () => { paintAsk(); $('#kg-range-lbl').textContent = L('Numbers', 'Số'); });
  $('#kg-range-lbl').textContent = L('Numbers', 'Số');
  paintRange(); paintStars(); next();
})();

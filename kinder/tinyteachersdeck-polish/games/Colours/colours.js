'use strict';
/* Màu sắc (Colours): touch the balloon of the colour asked for. Four balloons, then six once the child has two stars. */
(() => {
  const { L, $, pick, say, shell, win, miss, paintStars } = KG;
  const COLOURS = [
    ['#e53935', 'red', 'đỏ'], ['#fdd835', 'yellow', 'vàng'], ['#43a047', 'green', 'xanh lá cây'], ['#1e88e5', 'blue', 'xanh da trời'],
    ['#fb8c00', 'orange', 'cam'], ['#8e24aa', 'purple', 'tím'], ['#f48fb1', 'pink', 'hồng'], ['#6d4c41', 'brown', 'nâu'],
    ['#212121', 'black', 'đen'], ['#fafafa', 'white', 'trắng'],
  ];
  let round = 0, target = null, set = [];
  const ask = () => L(`Touch the ${target[1]} balloon`, `Chạm vào quả bóng màu ${target[2]}`);
  function paintAsk() { $('#kg-ask').innerHTML = `<span>${ask()}</span> <button class="kg-say" aria-label="${L('Say it again', 'Nói lại')}">🔈</button>`; $('#kg-ask .kg-say').addEventListener('click', () => say(ask())); }
  function next() {
    round += 1;
    set = pick(COLOURS, round > 2 ? 6 : 4); target = set[Math.floor(Math.random() * set.length)];
    $('#kg-hint').textContent = '';
    $('#kg-stage').innerHTML = set.map((c, i) => `<button class="kg-balloon" style="--c:${c[0]}" data-i="${i}" aria-label="${L('Balloon', 'Quả bóng')} ${i + 1}"><i></i></button>`).join('');
    $('#kg-stage').querySelectorAll('.kg-balloon').forEach(b => b.addEventListener('click', () => {
      const c = set[+b.dataset.i];
      if (c === target) { b.classList.add('kg-pop'); win(b, next); }
      else { miss(b); say(L(c[1], c[2])); }
    }));
    paintAsk(); say(ask());
  }
  shell(() => L('Colours', 'Màu sắc'), () => { paintAsk(); });
  paintStars(); next();
})();

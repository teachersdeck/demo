/* Games registry — the single list the Games Hub reads (a script, not a fetch, so it works from the extension,
   a local server, or a plain file). To add a game: drop its folder in games/ and add an entry here.
   scoreLabel/better describe the score the game reports ('low' = fewer is better); bonus(score) = extra XP (0–10)
   on top of the 10 XP for finishing. */
const GAMES = [
  { name: 'Guess the Number', folder: 'example-guess-the-number', entry: 'index.html', instructions: 'instructions.txt',
    scoreLabel: 'guesses', better: 'low', bonus: s => Math.max(0, Math.min(10, 12 - s)) },
  { name: 'Classroom Word Wheel', folder: 'Classroom-Word-Wheel', entry: 'classroom_word_wheel.html', instructions: 'instructions.html',
    scoreLabel: 'top team score', better: 'high', bonus: s => Math.max(0, Math.min(10, Math.round(s / 5))) }
];

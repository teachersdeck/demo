# games/

Games shown in the StudentDeck **Games Hub**. Each game is a folder here, registered in **`js/games.js`** (a script, not a fetched JSON file, so the list loads whether the app runs as an extension, from a server, or as a plain file):

```js
{ name: 'My Game', folder: 'my-game', entry: 'index.html', instructions: 'instructions.txt',
  scoreLabel: 'points', better: 'high', bonus: s => Math.min(10, Math.round(s / 5)) }
```
`instructions` is optional ("?" button). `scoreLabel`/`better` (`'high'` or `'low'`) say what the score means and which direction is better, for the
dashboard's best/last scores. `bonus(score)` is extra XP (0–10) on top of the 10 XP for finishing.

## How games run
The hub plays a game full-screen in a **sandboxed iframe**. `manifest.json` lists `games/*` under `sandbox.pages`, which is what
lets a game use inline `<script>` (normal extension pages may not). Two consequences:
- The game has no access to `localStorage` / IndexedDB or the extension's data — keep game state in memory.
- Keep every game's files inside `games/` so the wildcard covers them.

## Reporting a finished game (the XP hook)
When a round is over, tell the hub:

```js
parent.postMessage({ type: 'sd-xp', game: 'my-game', result: 'won', score: 12 }, '*');
```
The hub counts it under "Finished N×", records best/last score, and awards 10 XP + `bonus(score)` (daily cap 60 XP for games).
Send it once per finished round, not per click.

Included: `example-guess-the-number/`, `Classroom-Word-Wheel/` (both from TeachersDeck v0.7.2; Word Wheel's "Send scores to Scoreboard"
button became **Finish & save game**, since StudentDeck has no Scoreboard widget).

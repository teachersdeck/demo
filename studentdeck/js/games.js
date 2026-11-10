/* Games registry — the single list the Games Hub reads (a script, not a fetch, so it works from the extension,
   a local server, or a plain file). To add a game: drop its folder in games/ and add an entry here.
   scoreLabel/better describe the score the game reports ('low' = fewer is better); bonus(score) = extra XP (0–10)
   on top of the 10 XP for finishing.
   kit: true marks the TeachersDeck Game Library games (copied here by games/tools/build_games.py in the suite). The hub
   opens them one player at a time (?mode=solo) with the student's language and stars, and they report stars (0–3) when a
   round ends; their XP bonus is 3 per star. instructions_vi: the game also speaks Vietnamese. */
const KIT = (name, folder, entry, subject, vi) => ({ name, folder, entry, instructions: 'instructions.html', instructions_vi: vi ? 'instructions.vi.html' : null,
  subject, kit: true, scoreLabel: 'points', better: 'high' });
const GAMES = [
  KIT('Classroom Word Wheel', 'Classroom-Word-Wheel', 'classroom_word_wheel.html', 'en'),
  KIT('Spelling Bee Showdown', 'Spelling-Bee-Showdown', 'spelling_bee_showdown.html', 'en'),
  KIT('Scrambled Sentences', 'Scrambled-Sentences', 'scrambled_sentences.html', 'en'),
  KIT('Parts of Speech Blaster', 'Parts-of-Speech-Blaster', 'parts_of_speech_blaster.html', 'en'),
  KIT('Word Match-Up', 'Word-Match-Up', 'word_match_up.html', 'en'),
  KIT('Punctuation Rescue', 'Punctuation-Rescue', 'punctuation_rescue.html', 'en'),
  KIT('Number Ninja', 'Number-Ninja', 'number_ninja.html', 'maths', true),
  KIT('Tug of War', 'Tug-of-War', 'tug_of_war.html', 'maths', true),
  KIT('Fraction Pizza', 'Fraction-Pizza', 'fraction_pizza.html', 'maths', true),
  KIT('Number Line Leap', 'Number-Line-Leap', 'number_line_leap.html', 'maths', true),
  KIT('Shape Detective', 'Shape-Detective', 'shape_detective.html', 'maths', true),
  KIT('Times Table Tower', 'Times-Table-Tower', 'times_table_tower.html', 'maths', true),
  KIT('Food Chain Builder', 'Food-Chain-Builder', 'food_chain_builder.html', 'science', true),
  KIT('Sort It Out', 'Sort-It-Out', 'sort_it_out.html', 'science', true),
  KIT('Solar System Order', 'Solar-System-Order', 'solar_system_order.html', 'science', true),
  KIT('Matter Lab', 'Matter-Lab', 'matter_lab.html', 'science', true),
  KIT('Body Builder', 'Body-Builder', 'body_builder.html', 'science', true),
  KIT('Circuit Spark', 'Circuit-Spark', 'circuit_spark.html', 'science', true),
  { name: 'Guess the Number', folder: 'example-guess-the-number', entry: 'index.html', instructions: 'instructions.txt', subject: 'more',
    scoreLabel: 'guesses', better: 'low', bonus: s => Math.max(0, Math.min(10, 12 - s)) }
];

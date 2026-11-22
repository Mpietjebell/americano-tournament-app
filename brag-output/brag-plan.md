# Brag plan: NOPA Clubhouse Americano

**What it is:** a phone app for running social padel tournaments (Americano, Mexicano and four other formats). The host sets it up, players join with a code, scores go in courtside, and the podium appears when the host releases it.
**Who it's for:** whoever organises the weekly padel night, and the friends who play it.
**What sets it apart:** the whole evening lives on one phone, from setup to podium. Results stay sealed until the host releases them.
**Most impressive claim:** 8 friends, 2 courts, 7 rounds, 14 matches, and no spreadsheet or whiteboard.
**Visual hook:** the app's own NOPA look. Bodoni display type on deep clubhouse green, cream panels, flat corners, gold for the winner.
**Real UI shown:** the home hero, the join code card, a court score card, the live leaderboard and the podium. All are rebuilt with the app's own tokens and markup from `app/styles/nopa-theme.css` and the routes, and backed by real phone captures from a local run.
**Tone:** `polished`, with life. Restrained type and long holds, but motion on every beat: letters typing, scores counting, rows re-ranking, a podium rising.
**Share caption:** "We built a clubhouse in your pocket: run a whole padel Americano from one phone."

**Data:** every player name (Sofia, Inès, Bram…) and the venue are fictional stand-ins made up for the demo. No real users, emails or hostnames appear.

## Format

Landscape, 1920×1080, 30 fps, **21.0 s** (630 frames). Music at **120 BPM**: one beat is 0.5 s (15 frames) and one bar is 2 s. Every cut lands on a beat, and the scene changes land on bar or half-bar lines.

## Storyboard

| # | Time | Beats | Scene | On screen | Sound |
|---|---|---|---|---|---|
| 1 Hook | 0.0–4.0 | 0–8 | Deep green | "8 friends." / "2 courts." / "7 rounds." land one per beat, then "One phone." in gold italic at 1.5 s. Held to 4.0. | A ball "pock" on each line over a filtered kick. Full groove drops at 4.0. |
| 2 Reveal | 4.0–7.0 | 8–14 | The Clubhouse hero | The clubhouse photo, NOPA wordmark, "THE CLUBHOUSE", **Americano**, and the app's real line "Host a tournament, join one, follow the scores." The home-screen phone rises in from the right. | Drop: kick, clap, bass, chords. |
| 3 Join | 7.0–10.5 | 14–21 | Cream | The join code card. W N B W Y X types in one letter per half beat. Caption "Players join with a six-letter code." The share/QR phone sits beside it. | Soft ticks on each letter. |
| 4 Score | 10.5–15.0 | 21–30 | Cream | A Court 1 card: Jules & Noor vs Lotte & Sofia. 14 then 10 type in, Submit is pressed, and the leaderboard beside it re-ranks. Caption "Scores go in courtside. The table re-ranks live." | Pock on submit, soft ticks on the re-rank. |
| 5 Reveal | 15.0–18.0 | 30–36 | Deep green | "TOURNAMENT COMPLETE · SUNDAY AMERICANO". Podium blocks rise on beats (2, 3, then 1) and the scores count up to 93 / 92 / 93. Gold confetti. Caption "Results stay sealed until the host releases them." | Riser into a bright hit on the winner. |
| 6 Outro | 18.0–21.0 | 36–42 | Deep green | The NOPA wordmark, "The Clubhouse", "Host. Join. Play.", and the app's own line "The Clubhouse is free, thanks to NOPA." | Final chord rings out and fades over the last 0.5 s. |

Transitions stagger (old content out, then new content in) or dip through the scene ground. There are no plain crossfades between busy layouts.

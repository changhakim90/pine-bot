# Current state — the bot as of 6.136.0

Written 2026-09-10. This is the one-page summary; every claim here is true of
the code at 6.136.0 and points to the doc that carries the history. When this
page and an older doc disagree, this page wins and the older doc should be
corrected — not the other way round.

## What it is

A userscript that plays Pine & Co unattended: reads the game's real internals
(lexical globals + exported functions), plans movement on true coordinates,
drives every menu through the game's own API, and learns across runs. Source
is six ordered parts in `src/`, concatenated by `build.js` into
`dist/pine-bot.user.js`; the version is single-sourced from `package.json`.
`npm test` builds, syntax-checks, and runs 106 headless scenarios (~1,950
assertions) in a fake DOM. `claude/repo-layout.md` has the map.

## The goal being measured

**Ten immortal builds per character** — joe, minguk, pat — rotating one
character per run. An immortal build is a run the bot ENDED on purpose because
the build proved itself stable, not one that died:

- the early cap fired (`cap: true`, `capAt < runCapS`),
- via the stable-build arm, not the saturation deadlock arm (`why !==
  'saturated'`),
- while corner-anchored (`parkT > 0`).

The stable-build arm requires, for 300 consecutive game-seconds from gt 2400:
HP ≥ 97%, defense ≥ 34.9 (the game's ceiling is 34.992 = OLIVE 6), and the
**build complete** — `capStable.build`, THREE clauses, AND across:

```
SOUTH SIDE at 6   ·   SIMPLE SYRUP crafted   ·   OLIVE at 6
```

Levels are read from the game's own `player.weapons` map (keys are lowercase,
squashed and abbreviated: `southside`, `syrup`, `olive`, `sweetver`), never
from the bot's `ownedLevels`. A craft result reads max 1 — `syrup: 1` is
complete. The gate self-reports: `pineBot.report().cap.build.legs` names every
clause, the key that answered, and its source, and `short.buildShort` lists
what is missing. Read that before anything else when a run "should" be
immortal.

Counts live in `pineBotGraduation` (namespaced), persisted per run, with a
race ledger (`progress[char]`: runs, marks, when). Six one-time resets have
happened (128, 130, 132, 1321, 133, 134); the current flag is
`GRADUATION_EPOCH = 'resetEpoch134'`. `claude/immortal-stop-rule.md`.

## The gun doctrine

The Rainbow Gun needs six maxed super lines; the plan builds exactly FOUR
(`maxSuperLines: 4`, `SUPER_LINE_COCKTAILS`: SOUTH SIDE, VODKA TONIC, GIN
TONIC, MOJITO) and treats every other line as a leak. Three more plan
cocktails — NEGRONI, WHISKY SOUR, MOSCOW MULE — are *keyless occupants*: they
hold cocktail slots and are meant never to super. **That is a score, not a
guarantee**: LEMON, LIME and CAMPARI have each reached 6 through the −700
arming cap in live runs, because a −700 still wins a two-card hell pool.

The defence that actually holds is **occupancy** — a filled slot cannot be
filled again at any score (6.133.0):

- keyless occupants register gun risk once their key climbs, so their pools
  can trip `forcedGunPool` and spend a re-roll;
- OLD FASHIONED and CORPSE REVIVER NO.2 flip from −300 to a +40 occupant
  claim once the pool is about to narrow (`slotUrgency`, from 900 s or hell);
- the 8-slot ingredient bar reserves its last slots for whatever the build
  gate still lacks — the reserve is DERIVED from the gate (a craft result
  reserves itself and its parts, a cocktail clause reserves its super key, so
  SOUTH SIDE reserves MINT): `{MINT, SIMPLE SYRUP, WATER, SUGAR, OLIVE}`.

`claude/rainbow-lockout.md` (corrected 6.135.0) has the history and the
three live breaches.

## The bug under most of the history

Until 6.134.0, `baseNameOf` never stripped the ` UP` suffix from level-up
cards, so every name-keyed lookup in the scorer matched only the acquisition
card. **Every ingredient level-up scored 9** and was chosen by UCB noise.
This is the single cause behind: WATER never reaching 6, OLIVE stalling at 5
(the largest split in the whole dataset — seated def 35 / 2458 s vs
never-parked 18 / 1373 s), the regen spine doing nothing, LEMON/LIME/CAMPARI
maxing through the arming cap, MANHATTAN arming, and `ownedLevels['OLIVE']`
frozen at 1. It survived ~5,000 runs because all ~1,900 tests scored by base
name. `claude/up-card-blindness.md`. Expect the CEM to re-converge: every
learned mean predates the fix.

## The player's controls (6.135.0)

Panel or console. Persisted in `pineBotControl` — its own key, so no counter
reset can touch it.

| control | panel | console | effect |
|---|---|---|---|
| Start / Stop | ▶ / ■ | `pineBot.start()` / `.stop()` | the tick loop; Stop releases every key |
| Character | ⟳ auto · joe · minguk · pat | `pineBot.pin('pat')` / `pin(null)` | pin bypasses the rotation at the NEXT run start; cursor untouched, so un-pin resumes the cycle |
| Loop mode | 🔁 Loop runs · ① One run | `pineBot.loop('single' \| 'continuous')` | one-run: the run is booked as always, THEN the bot stops at the results screen. Arms at `startRun()` so ▶ on a results screen resumes cleanly; re-arms every run |
| End run now | ⏻ (two clicks) | `pineBot.killNow()` | engages the cap ladder; run books; farm continues |
| Book + stop | — | `pineBot.endRun()` | books the run and stops |

To play a chosen character by hand: ■ Stop (or let one-run mode stop), pick
in the panel, ▶ Start.

## The learners (one shared brain)

CEM over ~30 movement/threat/strategy dims plus UCB bandits (card tags, enemy
type multipliers, item/build, spawn intel). Since 6.127.0 the skill is ONE
store across all three characters (`pineBotUCB_v5_shared`); `runs`, `history`,
`hof` stay per character. There is no offline training — every learner needs
a run's reward and the only source of one is the game.

**A fresh install does not start from zero (6.136.0).** `SHIPPED_SKILL` in
part 01 carries the reference store's learned state — the 2026-09-03 report,
`6.123.0+crown+joe`, 9,569 runs, gen 754: all 29 CEM means (sigma re-floored
to 10% of each box), the six enemy fear multipliers with their counts, and
the boss census timetable. A store with no CEM / empty fear table / empty
timetable starts on it; a store that has any of them keeps its own, so the
reference store itself is untouched. `learning.shippedSkill: false` is the
cold start. `claude/learning-architecture.md`,
`claude/shared-skill-architecture.md`.

## Running it

- **Browser**: install `dist/pine-bot.user.js` from the raw GitHub URL once
  (auto-updates on `@version`). One userscript copy per profile.
- **Headless**: `node run/playwright.js --headless --tabs N --profile ./p`.
  N tabs share one `localStorage`; the multi-tab merges (6.113.0, 6.132.0)
  are what make that safe. `tools/pine-speed.user.js` multiplies game frames
  (default 100×).
- **Report**: 📋 or `copy(JSON.stringify(pineBot.report()))` — every audit in
  ≤60 KB. Judge versions on `compare` median / p60 / p120 / z with n ≥ 20 per
  row; funnel rows are a rolling window and never compare across reports.

## Shipping

The sandbox cannot push. It delivers a `git format-patch` file and the built
userscript; the user applies with `git am` on a branch and merges by PR, or
installs the userscript directly. Never two different builds under one
version number. `claude/release-state.md`.

## Open, in priority order

1. **The arming cap is a score.** Occupancy reduces forced pools; nothing
   makes them impossible. A structural refusal — e.g. never offering the last
   level of a capped key to the picker at all — has not been designed.
2. **BLACK VERMOUTH does not auto-craft** while SIMPLE SYRUP does (`craft`:
   751 ticks owed, 0 seen). Unknown why. The vermouth clause is out of the
   gate, so it no longer blocks immortal builds, but the two vermouths still
   spend two ingredient slots for a craft that never lands.
3. **Post-6.134.0 re-convergence.** Every CEM mean was learned against a
   scorer that could not see level-ups. Judge 6.134.0+ rows on their own.
   `SHIPPED_SKILL` was copied from that pre-fix store; refresh it from a
   post-6.134.0 report once the reference store has settled.
4. **Deep holds break on park, not damage** (`deepBreak.park` ≫ `ring`); the
   seat regen leg (`parkMiss.regen`) is the largest miss reason.
5. `rainbow-rush` was gated (6.135.0) but the '6.79' scoring profile behind
   `scoringProfile` still carries six-super doctrine in its dead branches;
   left deliberately as the A/B alternative.
6. The 30 s per-scenario runner timeout is now reported distinctly, but the
   underlying flake (two `npm test` in flight) is unexplained.

# The learning architecture

Written because "how do I make the bot learn X" kept needing this map rebuilt from scratch. Read this before adding another learned layer.

## Standing epistemics (user, 2026-08-30)

> "This game was built by AI so it has several bugs and misclassifications. The truth is what's being observed in the game itself."

Every hand-written table in this project — `WEAPON_TAGS`, `INGREDIENT_TAGS`, `ENEMY_PROFILE`, `PICKUP_VALUE`, the ring expressions — is a **hypothesis** derived from the recipe book or from demo measurements. Two `WEAPON_TAGS` entries were wrong until the user corrected them from play (see below). Prefer building the machinery that lets runs falsify a table over arguing about the table. When source and observation disagree, observation wins.

## The five learners

| layer | keyed on | reward | enters scoring at |
| --- | --- | --- | --- |
| CEM (CMA-ES-lite) | 27 movement/threat/strategy params | run scalar | `applyParams`, per run |
| item UCB | card name | run scalar | `03-scoring` `ucb` term |
| build/roster/rainbow UCB | primary cocktail, roster, take-or-skip | run scalar | several |
| LinUCB (diagonal) | card name × 10-feature context | run scalar | `ctx-learn`, ±12 |
| **tag bandit (6.107.0)** | **attack-type tag × same context** | run scalar | `tag-learn`, ±8 |

Reward (`04-lifecycle-screens.js` `computeReward`): `0.5·time + 0.3·downs + 0.2·sales + 0.06·supers + 0.05·crafts + 0.25·dayCleared + (0.15 + hellTimeBonus) if hell`. **No kill term, no pickup term.** Anything that pays only through loot collection is learned indirectly and slowly.

Context vector (`CTX_D = 10`): bias, early, mid, late, hell, HP ratio, dpsDeficit, boss share, ranged share, farm richness.

## Design rules learned the hard way

**A generalisation must never outvote a specific record.** The tag layer is bounded ±8 against the card layer's ±12, and averages over a card's tags rather than summing — otherwise a card wins for carrying more labels, which is an artefact of how the table was written.

**Tags do not belong in the context vector.** They don't vary with game state, so in a per-name model a tag feature is a constant and teaches nothing. A second bandit keyed on tag is the right shape.

**Prefer a gain over a fear discount.** The drop anchor holds ground by outbidding the danger field, not by multiplying it down. A blanket danger multiplier while "anchored" would also suppress mark, line and projectile fear — the three things that actually end runs.

**Sweep the box before choosing it.** `anchorValue` was first boxed at 0–34. Swept on a 4-body pack 125px out, 34 moved the chosen direction by one candidate slot and the bot still fled; the hold appears between 34 and 80. A 34 ceiling would have shipped a permanently decorative term — the same mistake as the 6.91.4 flat +12 freeze bonus, which could not move a pick either.

**Open a new box at zero where the idea itself is the hypothesis.** The CEM is allowed to conclude the drop anchor does not pay and switch it off.

**Adding CEM dimensions is safe now, but only because of the loader.** `02-learning.js` seeds any TUNABLE key missing from a stored CEM with `DEFAULT_PARAMS[k]` and a full `sigmaInit`, per key, on every load. That hardening postdates the 6.85.22 accident (six dims added with no seed, NaN drawn for each, batch/hof/step-size poisoned across 27 refits) that the `TUNABLE` comment still warns about. `store-guard` asserts the seeding. Cost: roughly 20–30 runs per new dimension before it separates from noise. Add 4–6 at a time, not 20.

## The enemy-type multiplier: withdrawn, then earned back

6.85.22 learned a per-enemy-type threat multiplier and it produced the worst regression in the project (n=273, median 843, supers 0.1, z=−3.1). Cause: attribution assigned **every** damage event to the nearest type within 140px, so mark, projectile and DoT damage all landed on the commonest mob, which ratcheted to the 2.2 cap within ~10 runs — the bot feared drunks at 2.2× and stopped farming. 6.85.23 withdrew it and left the precondition in writing at the application site: *"applying it again requires sole-candidate attribution, not nearest-type."*

It was also **dead state for twenty versions**: `04-lifecycle` wrote the table at the end of every run and `sanitizeCem` deleted it at the start of every trial. Nobody noticed because nothing read it.

6.107.0 re-applies it under four bounds, all asserted: 1. Only sole-candidate contact events feed it (`cands.length === 1`), credited to the body inside contact reach. Ambiguous events are dropped, not guessed. 2. Target narrowed `1+3·share → 1+1.2·share`, so the 2.2 store clamp is an asymptote rather than the resting state. 3. **Applied** band 0.8–1.4, far inside the 0.6–2.2 the store may hold, gated on `enemyMulMinN = 8` sole hits per type. 4. `CONFIG.learning.enemyMulApply = false` is a live off switch.

The old failure mode is not reachable at a 1.4 ceiling even if the attribution is wrong again.

## What is still NOT learned

- `PICKUP_VALUE` (16 hardcoded per-kind values); only the global `lootPull` gain is searchable.
- `ENEMY_PROFILE` static weights and radii.
- The reward weights themselves.
- `DAY_ORDER`, `charRoadmap`, the avoid lists — fixed policy. Only *which* roster to play, the `auto` roster's self-composition, and measured means displacing the static priority tables at n≥3 are learned.
- Boss orbit (emergent from the ring gradient over 32 sampled directions, not a parameter).

## Reading `pineBot.report().learning`

- `tags` — read `weight` **with** `n`. A big weight at n<20 is noise. A tag whose weight never separates from zero is a tag that does not describe anything real: that is evidence about `WEAPON_TAGS`, not just a bonus.
- `enemy` — `mul` is stored, `applied` is what the danger field actually used. Reporting the store alone would be reading a proxy and calling it the quantity, which is this project's most repeated failure.
- `params` — a mean pinned at a box edge means the box is wrong.
- `anchor` — did the drop anchor arm at all. Firing rate comes before any question about whether it pays.

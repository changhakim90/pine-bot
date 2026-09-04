Last updated 2026-09-04 (6.130.0 confirmed live on `origin/main` — immortal count reset again + per-run rotation; **6.131.0 built — the race ledger, instrument only — push pending**; the mis-stamped-build incident and the shared-store wipe it caused are in their own section below). Measured performance lives in `claude/version-history.md` and `claude/pat-measurements.md`; demo evidence in `claude/pat-manual-demos.md` and `claude/joe-manual-demo.md`; this doc is mechanics and process. **6.125.0's notes are in `claude/batch-6.125.0.md`; 6.126.0's root cause and proof are in `claude/optimizer-ceiling.md`; 6.127.0's shared-skill architecture (CEM/bandits now one store across Joe, Pat, and Minguk) is in `claude/shared-skill-architecture.md`; the immortal rule — now a count of TEN, reset fresh as of 6.128.0 — is in `claude/immortal-stop-rule.md` (note: that doc was accidentally overwritten and partially reconstructed during the 6.128.0 update; flagged at its top). 6.129.0 (cluster-aware ult aiming for Pat/Joe) has no separate doc — its CHANGELOG.md row and this doc's entries below are the full record.**

## Where things stand

| where | version | note |
| --- | --- | --- |
| Built, NOT yet pushed | **6.131.0** (sandbox `1cea890`, rebased onto `origin/main`) | **The race ledger — instrument only, no play-logic change** (user: *"Is there a way to find out who reached immortal build the fastest and with the fewest runs"*). The counter says where each character is, never what it cost. `compare`'s per-version `runs` align with the epoch only because 6.130.0's reset coincided with a version bump — that breaks on the next version, which is why this exists. `bookImmortal` now keeps `graduation.progress[char]`: runs played this epoch, and for every immortal build the run number, wall clock and the `capAt` that proved it (marks read off the COUNTER, not `isImmortalRow`, so the ledger cannot drift from what it measures). `graduationStatus().race` plus three winners reported separately because they disagree: `fewestRuns` (efficiency), `fastestWall` (throughput), `fastestBuild` (median `capAt` — how early in a run each build proved itself). A ledger opened mid-epoch adopts the standing count into `adopted`, making that character's `runsTo` an explicit LOWER BOUND. Summary gains `in N` on the IMMORTAL line and a RACE line. Tests: `immortal-graduation` +6, all six observed failing against 6.130.0. Full write-up: `claude/immortal-stop-rule.md`. Sandbox commit `d364824`; zip verified. Push pending |
| On `origin/main` | **6.130.0** (`6070a95`) | Confirmed pushed 2026-09-04, correct tree, corrected (rotate-always) cut verified on the remote. |
| On `origin/main` | **6.129.1** (`2fd0a79`) | **Version bump only, identical code to 6.129.0** (sandbox `d08b870`). Confirmed pushed and served by the raw URL 2026-09-04. Needed because the mis-stamped 6.124.0-era build Violentmonkey installed is ALSO labelled `6.129.0`, so the real 6.129.0 on `origin/main` will never auto-update over it — same `@version` reads as "up to date". User given a local `sed` + `npm run build` + push block (no zip needed); a verified tree-at-root zip sent as fallback. **The `6.129.0+crown+joe` compare/funnel rows (n=10) are the mis-stamped build — poison, never read them as evidence about the aiming change.** See "THE MIS-STAMPED BUILD WIPED THE SHARED STORE" below for the learning-store damage those ten runs did |
| On `origin/main` | **6.129.0** (`060d4a1`, real tree) | Restored 2026-09-04 by the user via `git checkout 49318e7 -- .` + a plain commit on top of the force-pushed `fffb5e5`; raw URL confirmed serving the real code (6.125.0+ markers present). **Sequence of the incident, 2026-09-04:** (a) my zip carried a wrapper folder → the rsync push landed the tree nested under `pine-bot-6.129.0/` (`dddd126`); (b) the user ran the restore block → `49318e7`, CORRECT — byte-identical to the sandbox's real 6.129.0 (`586a0c5`), verified with `git diff --stat 49318e7 HEAD` empty; (c) the defective rsync block was run a second time → nested again (`17ec3a5`); (d) the user then pushed from the **claude.ai/code cloud session**, which had a STALE checkout, and it **force-pushed** main to `fffb5e5` — `chore: bump version to 6.129.0` + `build: rebuild dist` on top of `2ea2a0a` (the CLAUDE.md commit, pre-6.125.0). Live symptoms the user reported, both explained by this: "reverted back to joe as the main character" (6.124.0 has no graduation logic, just `preferredBartender: 'joe'`) and "immortal build count is no longer there" (the feature arrived in 6.125.0). **Recovery target is `49318e7`** (in the user's local clone history; also saved in the sandbox as branch `good-6.129.0`). Restore block sent: `git rm -rq . && git checkout 49318e7 -- . && git add -A && git commit && git push` — a plain commit on top of `fffb5e5`, no force. Fallback: a correctly built zip was re-delivered (mechanically checked). Not yet confirmed run as of this write.** **Cluster-aware ult aiming for Pat's spiral and Joe's aura* (user: *"let's make the bot allow movement very close or inbetween passouts and use ultimates from there... being in the center of many passouts using like a k-means clustering would allow them to kill them more effectively"). Confirmed first that passouts deal zero contact damage on the ground (source comments), so there was no reason the prior code stood off from a pile — only a reason it aimed at the wrong point. Replaced the single distance-weighted mean over nearby passouts (which lands in the GAP between two separated piles of comparable size/distance, not on either one) with a coverage-scored aim: every nearby passout is a candidate circle center, scored by how much of the pool a circle of radius `ultReach` around it would cover, and the bot aims at the winning candidate's own sub-centroid. Gated on `meleeUlt` (Pat's `spray`, Joe's `aura`) — Minguk's `nuke` keeps the exact prior whole-pool mean, byte-for-byte, since his ult hits the whole field regardless of position. A first pass applied the new scoring unconditionally and regressed `plan-golden-minguk`; caught immediately by the golden suite, fixed by moving the `meleeUlt` gate above the aim computation. New scenario `passout-cluster-aim` (6 assertions, verified failing against the prior single-mean code for Pat/Joe, passing throughout for Minguk). `plan-golden-minguk` unchanged; `plan-golden-joe`/`plan-golden-pat` golden refreshed (intentional change, 1,694/4,320 plan-diff plans differ, all confined to joe/pat scenes with 2+ passouts in range). Suite green. Sandbox commit `586a0c5` (parent `68269c2`); shipped as `pine-bot-6.129.0.zip` (the zip with the wrapper-folder defect) |
| On `origin/main` | **6.128.0** (`f61e049`) | Confirmed pushed 2026-09-04 (found via `git fetch` in the sandbox clone + a live `curl` returning `@version 6.128.0` / `SCRIPT_VERSION 6.128.0` — the sandbox's own local commit was `68269c2`, a different hash for identical content, same pattern as 6.127.0 below). **The immortal-count reset, and the bar raised to ten** (user: *"In the next build I want to rotate among pat, minguk, and joe and have all their immortal build count reset and start from the new version. They should reach 10 immortal build counts."*). `graduation.count: 5 → 10`; every character's persisted count and graduated flag wiped once (guarded by `resetEpoch128`, persisted to `localStorage` immediately at reset — a persistence-timing bug was caught and fixed here, see "Writing tests with teeth" below); a new version floor (`immortalEpochVersion` + `versionAtOrAfterEpoch()`) stops pre-reset rows still sitting in the 240-row phase-audit window from re-inflating the freshly-zeroed counters. `immortal-graduation` rewritten, 33 assertions, 9 confirmed failing pre-fix via `git stash` isolation, plus a separate teeth check on the persistence-timing fix itself. Suite green |
| On `origin/main` | **6.127.0** (`772481d`) | Both 6.126.0 (`45cb76e`) and 6.127.0 (`772481d`) confirmed pushed 2026-09-04. Pushed by the user from their **local terminal Claude Code session** (installed + `/web-setup`-linked to their own `gh` credentials — no proxy restriction), not through this sandbox (which still returns a 403 on push, confirmed again this round) and not through the old zip+Terminal-paste relay. Verified live: `curl -s https://raw.githubusercontent.com/changhakim90/pine-bot/main/dist/pine-bot.user.js` returns `@version 6.127.0` / `SCRIPT_VERSION 6.127.0`. **This is now the standard release path** — see "The release loop that works now" below |
| 6.127.0 content | **Skill is shared across characters; the track record is not** (user: *"same weapon pool, same learnings on cem"*). CEM optimizer, item/build bandits, contextual bandit, learned enemy-type damage multipliers, spawn intel, and the crown-path bandit are now ONE store (`pineBotUCB_v5_shared`) read/written by Joe, Pat, and Minguk alike, seeded once from Joe's own (most-tuned) blob; `runs`/`history`/`runLog`/`genHistory`/`hof` stay per-character so the track record stays honest. Also cleaned up a stale `userRoadmap` comment describing a Pat build that was never actually shipped. Full details, migration mechanics, and the still-open CEM-box-widening question: `claude/shared-skill-architecture.md`. Suite green (994 assertions, +13 new in scenario `shared-skill`, teeth-verified via `git stash` isolation — 7/9 core assertions confirmed failing pre-fix). Sandbox commit `49388b5` (parent `062183b`) — content identical to the pushed `772481d`; the hash differs only because the push landed through the user's local clone, not this sandbox, confirmed via the live `@version` stamp above rather than a hash comparison. |  |
| 6.126.0 content | **planMove was never JIT-compiled** (V8's 61,440-byte bytecode ceiling); candidate loop / danger field / nearest pass extracted into optimizable functions → deep-hell swarm 6.29 → 0.37 ms/tick (17×) vs 6.124.0, uniform 1.44 → 0.19. Hell-latch `innerText` forced-layout scan removed when the `hell` binding exists. Immortal rule is a count (5 at the time, raised to 10 in 6.128.0), persisted. Suite green (981 assertions); **4,320 plans identical to 6.124.0 at 1e-9** (`tools/plan-diff.js`, golden scenarios). |  |
| Browser (measured) | **6.123.0** | n=90, z **−2.04 "worse"** vs 6.122.0 — the pre-registered abort fired; median 1012, dayClear 0.44, supers 0.9 |
| Baseline 6.124.0–6.128.0 are judged against | **6.122.0** | n=118, median 1260, dayClear 0.53, supers 1.2 — all play these rules plus one change (6.125.0–6.128.0 add NO play-logic change; read `spd`/`spdLo` first, and for 6.127.0+ specifically watch Pat/Minguk's own rows since their store just changed shape) |
| Best confirmed row | **6.120.0** | n=102, z **+3.27**, median 1087, dayClear 0.48 |
| Built, NOT shipped | 6.121.0 | `tonic-two-lines` 32→70; **killed** — see below |
| Retracted | 6.119.0 | day-order pair, z −2.49; undone whole in 6.120.0 |
| Local clone | `~/Desktop/Github/pine-bot` — **not** `~/pine-bot` |  |

**6.130.0: THE PIN IS RETIRED FOR A PER-RUN ROUND-ROBIN** (joe → minguk → pat → joe …, every run, graduated or not; the goal of TEN immortal builds each is recorded, not enforced; counts reset to 0 at 6.130.0; `claude/immortal-stop-rule.md`). Everything in the next paragraph describes the 6.125.0–6.129.x pin mechanism, still shipped as the `rotate:false` fallback.

**JOE IS PINNED (6.96.0, user's call) — AND GRADUATES ON A COUNT.** 6.125.0 turned the standing rule into code; 6.126.0 changed the bar at the user's word to a count, not a streak; **6.128.0 raised that bar to TEN and reset every character's count fresh** (user: *"have all their immortal build count reset and start from the new version. They should reach 10 immortal build counts"*) — `cap:true`, `capAt < runCapS`, `why != saturated`, `parkT > 0`, deaths in between neither reset nor count, persisted per run in `pineBotGraduation.counts` so the 240-row audit eviction cannot lose it, and (as of 6.128.0) gated against a version floor so pre-reset rows can't re-inflate the fresh count either. The pin advances joe → minguk → pat the run it becomes true. `r.graduation.counts` and the `IMMORTAL joe 3/10 …` summary line say where each stands; `pineBot.ungraduate('joe')` reverses one and zeroes his counter; `graduation.enabled: false` restores the plain pin. Pat's deep-hell doctrine is proven — run 4589 booked 13,244 s (220 min), ended only by hand. Minguk still rests, not deleted.

**6.120.0 IS THE CURRENT BEST CONFIRMED ROW** (n=102): median 1087, dayClear **0.48**, hellRate 0.48, supersPerRun 1.0, seatedRate 0.80, buildsReady 15, medianReadyAt 1358, capOuts 13, z **+3.27** and rising monotonically with n (+2.25 → +2.32 → +2.70 → +3.27 across n=41/51/68/102). 6.100.0's n=184 row (median 943, best 25,141 s, z +5.46) remains the historical high-water mark for *mean* and for the all-time best run.

**6.122.0 at n=79** confirmed two things worth carrying forward: the death classifier fix holds (`deaths.line` 33 % → 3 % across n=31/61/70/79), which matters beyond telemetry because `lastDeathCause` feeds card scoring in six places plus `cem.batch` and the directed-defense nudge; and the project got its **first genuine deep holds** — `deepHeldRate` non-zero (0.014 → 0.025), maxHold 129 s then **163 s**, against every prior batch's 0 or ≤ 45. `deepBreak` is dominated by **park** (143 of 212), i.e. the seat, not damage.

## The experiment queue (one change per batch)

0. **6.125.0 – 6.128.0 — NOT experiments.** Zero play-logic change for 6.125.0/6.126.0, proven by the golden-plan equivalence (4,320 plans at 1e-9 vs 6.124.0). 6.127.0 shares Joe's learned CEM/bandit state onto Pat/Minguk — also not a play-logic change in itself, but it DOES change what those two characters' searches start from, so their own rows post-6.127.0 are a genuinely new regime and should not be pooled with their pre-6.127.0 rows. 6.128.0 resets the immortal-count bookkeeping only — no play-logic change either, but the same non-pooling caution applies to immortal-count comparisons spanning the reset. **6.129.0 is DIFFERENT from this batch — it IS a play-logic change, deliberately, for Pat and Joe** (cluster-aware ult aim; golden refreshed for their scenes, see the table above). Minguk's plans are unaffected (golden unchanged), so his rows still pool across the 6.129.0 boundary; Pat's and Joe's do not. Acceptance for the perf builds is `spd` / `spdLo` on the phase rows rising off the 6.123.0 floor (worst 0.1–1.4) and the user no longer feeling the game stutter. If `spdLo` stays on the floor with 6.126.0 installed, the remaining cost is NOT the planner (0.17 cores at speed 15 in the worst measured scene): look at the Codex fork sharing the tab/profile, then the overlay cadence. A wall-clock governor on the tick is the last lever and IS a behaviour change. Also read `r.sizes` on the first paste: the report budget is new.
1. **6.124.0's own batch** — CLAIM BEFORE YOU LEVEL. Design, evidence, teeth and the abort in `claude/claim-before-level.md`. Judge against **6.122.0** (n=118, median 1260, dayClear 0.53, supers 1.2), not 6.123.0. Read `supersPerRun` and `dayClearRate` first; the pick log should show plan cocktails claimed in the first ~5 minutes with `claim-before-level(over STIRRING UP=…)` in the `why`, and NO plan cocktail first-claimed in hell. Abort: dayClearRate falls with z ≤ −2 at n ≥ 60 → set `abilities.claimBeforeLevel: false`. 1b. **Entry-regen checkpoint: RETRACTED in 6.124.0** (weights 0/0, code and 13 teeth kept). Its abort fired at n=90: z −2.04, dayClear 0.53→0.44, supers 1.2→0.9, seat still bimodal (entry regen 2.22/1.42/0/0; the 3107 s run never parked, `parkMiss.regen` 57186/57186). If re-armed, do it on a clean baseline at a smaller size (the 66..79 early band) — never alongside another change.
2. **Deep-hold park breaks** — 143 of 212. Same organ as (1) but *after* seating; must not be mixed into the same batch.
3. **Ingredient doctrine, one rank at a time.** CRANBERRY first — it touches no super key.
4. **Not yet implemented:** the user's entry-posture doctrine — *"entrance to hell bosses require kiting or using the ultimate for invincibility or time pause to let southside kill the bosses till all the other upgrades are fully maxed out."*
5. **Proposed, NOT approved: widen the 8 CEM boxes pinned at their max for Minguk** — `movement.standoff`, `movement.standoffPull`, `movement.panicHp`, `movement.lookaheadMs`, `threat.enemyWeight`, `threat.enemyRange`, `threat.projWeight`, `threat.projLookaheadMs`. Found while investigating Pat/Minguk underperformance (see `claude/shared-skill-architecture.md`'s final section). Since 6.127.0 the box is shared search state for all three characters, so widening it changes Joe's regime too — needs the user's explicit go-ahead before touching it, and cannot share a batch with anything else per the box-reopen rule below.

**KILLED: TONIC 32 → 70 (`tonic-two-lines`, 6.121.0).** The n=70 pick log shows TONIC losing to STIRRING UP, which the bump cannot reach. Stated precisely: the bump is proven inert *against what actually beat it in both observed cases* — not against every possible competitor. Not worth a batch.

## Structural problems still open

- **The seat is the bottleneck at both ends.** `parkMiss.regen` is 45.3 % (the 6.123.0 target); `mark` and `hunt` are ~19 % / ~18 % behind it; the corner is **not** mark-immune (`worstMargin` negative in every bucket to 150 min, `coveredSeat` in the thousands, `rMax` 98.8 in the first three buckets); and the deep holds break on **park**, not on damage.
- **CEM suppression of long-horizon terms.** `strategy.regenDeficit` fell 17.82 → 20.05 → 11.36 in a box floored at 0 — the search is right on its own evidence (regen costs day tempo now, pays at the seat 20 min later) and wrong for the run. 6.123.0's answer is a gate outside the box; expect the same problem to recur for any other term whose payoff is that far downstream.
- **The day-order inversion** — TONIC is rank 1 and scores fifth.
- **Boxes pinned at an edge:** `strategy.earlyDps` mean 22.45 against a box max of 24; `movement.passoutValue` at 54 against [18, 54], atEdge AND converged. Re-opening a box changes the search regime and destroys attribution, so it cannot share a batch with an experiment. **Also, per Minguk's own store before 6.127.0's share: 8 more dims pinned at max** — see experiment-queue item 5 above; not yet approved to widen.
- **TIME STOP pays a flat +265** while `pauseAudit` reports 94.2–94.4 % of the field already frozen — diminishing returns unmodelled. Deferred, not forgotten.
- **The craft subsystem reads dead** — `ready 0, seen 0, clicked 0` over 557 runs; per its own note `ready 0` with `seen 0` puts the fault upstream of the craft script.
- **planMove is still ~2,500 lines** and only fits under the JIT ceiling because the candidate loop left it. Any growth of a few hundred lines puts it back in the baseline tier silently. Check `node --trace-opt` after adding to it; move new per-tick work into its own function.
- **Deferred audit findings** (reported, not fixed): contact sole-candidate predicate 16 px too wide; `dangerAccum.proj` 2.5× halo; `distant` bosses in the centroid/`outrunnable`; auraUlt 2.2× reach with no wall/dormant filter; giant threshold raw-vs-padded (`r > 90` twice); day-trek boss scan reading the range-filtered list; `STATE_HANDLERS.playing` dead code; `fuseUntil`/`vomitUntil` truthiness (needs a live probe).

## THE RUN CAP — read this whole section before touching it

Two independent mechanisms, and **both were broken until 6.101.0/6.102.0**. Three behavioral guesses at the kill (6.96.0 nearest-body, 6.96.1 boss-seek, 6.96.2 patrol) all failed, so termination is now structural.

### The clock cap + THE LADDER (6.101.0)

`runCapS: 9000` (150 min). Past it the run must END so it books.

**What was wrong:** the 6.96.2 patrol walked a five-point circuit whose four outer waypoints are the **corner regions** — the exact safe ground `park`/ `seat` is built on, chosen because corner geometry defeats marks. The kill protocol was touring the safest spots on the map. Measured at full scale: 6.100.0 booked **25,141 s and 22,800 s against a 9000 s cap** — the cap fired on time and the bot survived 4.5 more hours.

**Why that is impossible in real contact** (`mitigation-model.md`): `hurtPlayer` sets `invuln = 38` frames → contact caps at 1.58 hits/s × ~9.8 = **~15.5 dps** against 1.71–3.07 HP/s regen. Sustained contact is ~13 HP/s net and kills a 469-HP build in **~36 s**. Surviving 16,000 s means it was never in contact.

**The ladder now**, each rung escalating only if the previous failed:

1. **SMOTHER** — walk onto the nearest boss (biggest `contactDmg`), else the crowd centroid, else field centre; inside contact range set velocity to **zero**. No evasion, no dash, no ult.
2. **`capStandS`** — call the game's own `hurtPlayer` (a top-level `function` declaration, so it really is on `window`). Natural death, booked through the normal `over()` path.
3. **`capForceS`** — hard-book via `finishRun()` (idempotent, so a later real death cannot double-book) + `backToTitle`, so the farm restarts.

Also 6.101.0: **the dash gate got the ult gate's belt-and-braces.** The ult had always ALSO checked `gtU >= runCapS`; the dash read `plan.capDive` alone. A dash is a 0.16 s burst with no i-frames whose only effect past the cap is to **break contact and reset the ~36 s kill clock**.

### The three early-cap arms (current)

Any one latches `capEarly`:

1. `deepHell.capStable: { fromS: 2400, hpFloor: 0.97, defMin: 34.9, supersMin: 3, holdS: 300, dipGraceS: 4 }` — the hold clock runs from gt 0; `fromS` gates only the latch.
2. `deepHell.saturation: { enemyMin: 200, hpFloor: 0.97, holdWallS: 60, minGtS: 1800 }` — **WALL** seconds, no build gate. The deadlock arm.
3. `runCapS: 9000` game-seconds, unconditional.

Ladder after latch: stand in contact 15 s (`capStandS`) → `hurtPlayer()` until 120 wall-s (`capForceS`) → hard `finishRun()` + `backToTitle`. `milestones.immortal: 1.3` cancels the truncation.

**The immortal stop rule keys on arm 1 only:** a row whose `why` is `'saturated'` (arm 2) or whose `capAt >= runCapS` (arm 3) is NOT an immortal build for graduation purposes.

**Two clock doctrines:** anything affecting how the bot *plays* uses GAME time; anything that *ends a run* uses WALL time.

### The early cap was DEAD CODE from 6.99.3 to 6.101.0 (fixed 6.102.0)

**`defMin` shipped at 35 against a hard ceiling of 34.992.** The game computes `player.defense = min(60, 3*upDefense + pas.armor)`; `pas.armor` is 5.832 per OLIVE level, OLIVE caps at 6, `upDefense` is unobtainable → **34.992 max**, so `34.992 >= 35` was false on every frame of every run. That, not the dip-grace and not the `fromS` floor, is why `earlyCaps` read **0 in every row ever published**.

**How it was born:** `parkAudit` prints the entrance build with `+dEnt.toFixed(1)`, so 34.992 **displays as 35.0**, and the gate was written from the audit table instead of from the stat. See "Reading a proxy" below — and note the standing rule *"Check a feature could fire before reading its row"* was violated for four consecutive versions.

`capStable.holdS: 0` disables the early cap; `runCapS: 0` disables the clock cap. `pineBot.capStatus()` reports the rung, `streakS`, `bestStreakS`, `readyAt`, which leg last broke the streak, and `defMinReachable`.

**ROW-READING, by era.** Capped runs are right-censored, never natural deaths:

| versions | capped runs land at | caveat |
| --- | --- | --- |
| 6.96.0–6.99.2 | ~12,0xx | patrol could fail outright |
| 6.99.3–6.100.x | ~9,0xx | **early cap never fired**; patrol could fail (25,141 s observed) |
| 6.101.0+ | `runCapS + 40…250 s` | ladder guarantees termination |
| 6.102.0+ | also `fromS`+ once a build proves out | first era where earlyCaps can be non-zero |

A 6.101.0+ row far above `runCapS + 250` is a **ladder failure** — report it, don't mine it.

## THE PARK GATE — both legs

`parkArmor` needs `defense >= deepHell.parkDefense` (30) **AND** `regen >= deepHell.parkRegenRate` (1.0), plus SOUTH SIDE. Each leg has its own checkpoint, and they are the same shape on purpose:

| leg | checkpoint | tiers | added |
| --- | --- | --- | --- |
| armour | `entry-armor` on OLIVE, bar 34.9 (the ceiling, not the gate) | `entryArmorFromS` 750 / `entryPrepFromS` 1050 → +18 / +40 | 6.99.2, 6.105.0 |
| regen | `park-regen` on WATER + SIMPLE SYRUP, bar read from `parkRegenRate` | `entryRegenFromS` 750 / `entryPrepFromS` 1050 → **0 / 0 (retracted 6.124.0; was +72 / +120)** | 6.123.0, off 6.124.0 |

Both are **gates, not weights**, and neither weight is a TUNABLE dimension — that is the point. The armour checkpoint took `parkMiss.armor` from ~20 % to 1.6–2.2 %; the regen checkpoint is aimed at `parkMiss.regen` at 45.3 %. `claude/regen-seat-lever.md` has the sizing, the teeth and the abort trigger.

**Joe's innate regen is ZERO.** Regen sources are flat per level: **WATER 0.284, SIMPLE SYRUP 0.512.** Reaching 1.0 needs WATER 4 (1.136) or SIMPLE SYRUP 2 (1.024). SIMPLE SYRUP is the WATER + SUGAR craft and must never be scored ahead of its own halves — the 6.112.0 / 6.114.0 mistake, guarded in three places now.

## CONFIRMED LIVE, 2026-08-28/29 (recordings + booked run, 6.95.0+crown+pat)

One run, frames at **130 min and 195 min**: **469/469 HP at both**, PARKED in a corner, **256 enemies, danger 2317 → 2733, posture "normal"** — no panic — TIME STOP +2S picks taken, deep 4% → 31%, DOWN 37.9k, ₩219M, LV 93, build VODKA TONIC, CEM g447. **BOOKED as run 4589: 13,244 s, death `proj`.** The user's named winning elements — corner anchoring, heal generation, no panic, constant ults — all confirmed operating together; the run ended only because the user forced it.

**parkAudit: the ENTRY BUILD is the seat lever.** At n=66 seated runs entered hell at def 35 / regen 1.42, never-parked at 29.2 / 0.85 — just under both park gates. By 6.122.0 n=79 the armour leg is solved and the split is **regen alone**: seated 35 / **2.0**, never-parked 35 / **0**. The def-35 bar is the most predictive single number this project has — **but note it is the rounded print of 34.992, which is exactly how the early cap got a threshold it could never meet.**

**THE SHOP CHANGED: RPD is Lv12** (was 1 pip on 2026-08-28; PWR/HP/REG/DEF Lv6, SPD 8). Every run now carries a ~doubled base-attack rate — a CONFOUND for any z-score spanning that date.

## THE STORE NAMESPACE — two bots on one origin (6.124.0)

"I have another model running made by codex." A fork of this script on the same origin, same browser profile, same localStorage keys: 234 of 240 funnel rows in the 6.123.0 reports were tagged 6.135.0–6.139.0 (medianSpeed 2.7 vs our 15, casts 4 vs 13–21, dayClearRate **0** across all 235 — every one of those runs dies in the day, so `park`/hell instruments were still ours, but funnel/phases/income/damage/mark were not). **Those rows are the Codex fork, not a regression of this bot — do not diagnose from them.** And note: two bots on one tab each run their own planner on the same rAF — the Codex fork's CPU is part of what the user feels, and 6.126.0 cannot fix that side.

Two separations, use both:

1. **A second browser profile** for the Codex bot — localStorage is per origin *per profile*, so this is complete isolation with zero code.
2. **`pineBot.namespace('claude')`** in OUR tab's console, once. It writes an un-suffixed meta key `pineBotNamespace`, reloads, and on the next boot copies every key this bot owns (`pineBotUCB_v5[_char][__bak|_shared]`, the nine audit keys, and from 6.125.0 `pineBotGraduation`) onto `<key>.claude` — COPY, never move, so the Codex fork keeps its bare keys and nothing is lost. `pineBot.namespace()` reads it; `pineBot.namespace('')` goes back to the bare keys. The report header now carries `ns=claude` / `ns=(bare)`, and `report().namespace` says which store a paste came from. `paco_bdh_time` (the game's) and `pineBotDemos` are deliberately not namespaced.

**Until the namespace is set, read only the per-version `compare` rows and the `park` audit from a paste.** Everything windowed is mixed.

## THE REPORT BUDGET (6.125.0)

`pineBot.report()` is trimmed to **60 KB compact JSON** before it reaches the 📋 button; `pineBot.reportFull()` is untrimmed; `report({ budgetKB })` overrides. Read `r.trimmed.steps` to know which shape you hold and `r.sizes` to see which section is growing. **Only nulls are stripped — every 0 and every false in a paste is a measured zero.** If a paste is still refused, the budget is the one number to lower; do not hand-edit the JSON.

## THE PUSH THAT SILENTLY DID NOT HAPPEN (2026-08-26)

Two releases were built, tested green, rsync'd into the clone — and never reached GitHub. The chain ends `... && git add -A && git commit && git push`, and `git add` failed:

```
fatal: sha1 file '/Users/changhakim/Desktop/Github/pine-bot/.git/index.lock'
       write error: Operation timed out
```

`&&` stopped the chain, so no commit and no push. The user's report was "violentmonkey is not auto updating" — the browser was correct; the remote was three versions behind.

**Root cause candidate: iCloud.** The clone lives under `~/Desktop`, which macOS syncs when "Desktop & Documents Folders" is on. Git's lock-file writes block on that sync and can time out. A *stale* lock reads differently ("File exists"), so a **write timeout** points at the filesystem, not a crashed git.

**A second stale-state trap (2026-09-03, 6.125.0):** the clone carried a stale `git am` session from the bundle era, so `git pull --rebase` refused with "It looks like 'git am' is in progress". `git am --quit` (NOT `--abort`, which moves the branch back) cleared it; the push then went through. Check `ls .git | grep -iE "rebase|am|merge"` when a rebase refuses.

```
cd ~/Desktop/Github/pine-bot && rm -f .git/index.lock && git add -A && \
git commit -m "<msg>" && git push origin main && git log --oneline -1
```

**Standing rule: after every release, verify the REMOTE, not the local test output.** A green suite says the code is correct; it says nothing about whether it shipped.

```
curl -s https://raw.githubusercontent.com/changhakim90/pine-bot/main/dist/pine-bot.user.js \
  | grep -m2 -E '@version|SCRIPT_VERSION'
```

If `compare()` reports a `current` older than what was last delivered, the push is the first suspect — before the browser, the CDN, or Violentmonkey. **raw.githubusercontent lags a push by up to ~5 minutes** — the 6.125.0 curl read 6.124.0 right after a successful push; it is the cache, not the push. **Confirmed again for 6.127.0 (2026-09-04): a curl run seconds after the local terminal push already returned the new `@version`/`SCRIPT_VERSION` — the lag is not guaranteed, just possible; always re-curl if a first read looks stale before assuming the push failed.**

## VIOLENTMONKEY AUTO-UPDATE (verified 2026-09-03)

Already wired: `package.json → pineBot.rawBase` stamps `@updateURL` / `@downloadURL` = `https://raw.githubusercontent.com/changhakim90/pine-bot/main/dist/pine-bot.user.js` into every build (present on the remote since 6.124.0). Two conditions on the user's side: the script must be INSTALLED FROM THAT URL once (a hand-pasted copy should be removed first — two copies fight over the keys), and each release must reach `main` with `dist/` rebuilt (CI fails a stale dist). Violentmonkey → Settings → Update → check interval 1 h; ⟳ on the dashboard forces a check. README carries the steps.

## THE ZIP THAT NESTED THE REPO (2026-08-28, cost one broken push)

The 6.96.0 zip was built as `zip -r pine-bot.zip live` — everything nested under `live/`. The rsync block assumes the tree sits at the ZIP ROOT, so `rsync --delete` replaced the whole repo with one `live/` subfolder: the commit landed, the terminal read clean, and `dist/pine-bot.user.js` was GONE from main. Diagnosis that worked: `git ls-tree --name-only HEAD dist/` returned EMPTY while `git log` looked fine.

```
cd ~/Desktop/Github/pine-bot && \
rsync -a live/ ./ && rm -rf live && rm -f .git/index.lock && \
git add -A && git commit -m "restore repo layout" && git push origin main
```

**Standing rule: build zips FROM INSIDE the tree** (`cd live && zip -r ../z.zip . -x ".git/*"`), and verify with `unzip -l | head` that `src/`, `dist/`, `build.js` appear at the root. (6.125.0 through 6.128.0's zips were built this way and verified — 6.127.0's push confirmed the tree landed correctly, 7 files changed / 350 insertions / 68 deletions, no repo wipe.)

**IT HAPPENED AGAIN ON 6.129.0 (2026-09-04), and the "verification" passed it.** The zip was re-packed with a `pine-bot-6.129.0/` wrapper folder (`zip -qr pine-bot-6.129.0.zip pine-bot-6.129.0`), `unzip -l | head` was run, and the listing — `pine-bot-6.129.0/build.js`, `pine-bot-6.129.0/src/` — was read as "tree at root confirmed." It was the opposite. The user's rsync block then landed `origin/main` at `dddd126` with the ENTIRE repo nested under `pine-bot-6.129.0/` and 23 root files deleted; `dist/` gone from the update URL. Restore block (same shape as 6.96.0's, folder name changed): `rsync -a pine-bot-6.129.0/ ./ && rm -rf pine-bot-6.129.0`, then commit + push, then `git ls-tree --name-only HEAD dist/` must print `dist/pine-bot.user.js`. **The check that actually works is mechanical, not a glance:** `unzip -l z.zip | awk '{print $4}' | grep -c '^build.js$'` must print `1`, and `unzip -l z.zip | awk '{print $4}' | grep -c '^[^/]*/build.js$'` must print `0`. Every entry name in the listing must start with `src/`, `dist/`, `test/`, a bare filename — never with a version-named folder. And from the sandbox, `git fetch` + `git ls-tree --name-only origin/main` after the user pushes is the cheap post-push audit: it should list `dist`, `src`, `package.json` at the top level, not a single directory.

## THE MIS-STAMPED BUILD WIPED THE SHARED STORE (2026-09-04)

The 6.124.0-era code that a stale cloud-session checkout force-pushed as "6.129.0" ran ten runs in the user's browser before anyone noticed. Its `saveLearn` writes the shared key as `{versions, snapshots, lastVersion}` — a full replace — so after the first save `pineBotUCB_v5_shared` lost `cem`, `items`, `builds`, `rosters`, `linucb`, `tagucb`, `rainbowPolicy`, `spawnIntel`, `enemyTypeMul` AND the `skillShared6127` migration flag. The paste that revealed it: `gen=1`, all `6.129.0+crown+joe` rows at `gen 0`, `learning.reopen` at run 10096 (= the install moment), no `graduation` section, no IMMORTAL line, params at DEFAULT-shaped means with initial sigmas.

Consequences, stated precisely:

- **On the real code's next load the 6.127.0 migration re-runs** (flag gone) and seeds the shared skill from Joe's per-character blob — which the old code had been saving its own fresh 10-run cem/items into. So the shared skill restarts from that junk, not from the ~10,000-run state.
- **What survived:** every character's per-character blob apart from Joe's cem/items (untouched: `runs`, `history`, `runLog`, `genHistory`, `hof` — the top-5 parameter vectors per character), and `pineBotGraduation` (Joe and Minguk graduated under 6.128.0; Pat is the live character once the real code is back — "reverted to joe" was purely the old code's `preferredBartender: 'joe'` with no graduation logic).
- **Recovery is organic, not exact:** `refitCem` takes `hof.slice(0,3)` as three of its five elites and every 4th run replays `hof[0]`, so the mean is pulled back toward the trained vectors within a couple of generations (`batchSize` 10). The bandits (item/build/LinUCB/tag/enemy-mul/spawn) restart for real. No shared-store backup exists anywhere; no earlier full `learning.params` dump is in the project or the transcripts. If the user finds an old report paste, a console snippet can set the mean back (`pineBot.test.setCemMean` shape, then `saveLearn`).
- **Judge nothing across this boundary.** `6.129.0+crown+joe` (n=10) is a different codebase; 6.129.1+ rows start from a re-seeded store and are a new regime for all three characters.

Two structural follow-ups, NOT yet built (queue them, don't slip them in):

1. **A shared-store backup** (`pineBotUCB_v5_shared__bak`, written the way the per-character `__bak` already is) — one save's worth of insurance against exactly this. Cheap, no play-logic change, needs a teeth test that boots against a wiped primary and recovers from the backup.
2. **Make older code unable to clobber the shared key**: e.g. the real code stamps a `schema` field and refuses to adopt a per-character seed whose `cem.gen` is tiny when a snapshot proves the store was once deep — or simply never delete Joe's own `cem` on split (keep a mirror), so a re-migration seeds from something real. Decide with the user.

**Same-`@version` trap, for the release loop:** Violentmonkey decides "update available" by comparing `@version`. A wrong build published under a version number the browser already holds can NEVER be replaced by auto-update — the fix is always a bump (hence 6.129.1), or a manual reinstall from the raw URL.

## The release loop that works now

**As of 2026-09-04, the working loop is: build + test + zip in the sandbox (unchanged), then the user rsyncs the zip into their clone and pushes from their LOCAL TERMINAL CLAUDE CODE session** (installed via `curl -fsSL https://claude.ai/install.sh | bash`, PATH exported session-only since `~/.zshrc` isn't writable by the user's own account yet — `ls -la ~/.zshrc` / `sudo chown $(whoami) ~/.zshrc` is the follow-up fix, not yet needed — and linked via `/web-setup` to their `gh` account). That session has full, unrestricted local git/gh credentials, no proxy restriction, and pushed 6.126.0, 6.127.0, and 6.128.0 successfully this way (6.128.0 confirmed via `git fetch` + live curl, see the table above — the sandbox clone's own `git status -sb` had read "ahead 4" against a stale local view of `origin/main` before the fetch caught it up); the 6.129.0 zip went through the same path and landed nested (wrapper folder in the zip — my defect, see the zip section); restore pending. This sandbox (Cowork) still cannot push at all — confirmed again on 6.127.0: fetch works, push returns a 403 from the git proxy ("changhakim90/pine-bot is not in this session's authorized repository set"), a real GitHub issue (#84581), structural to this product surface. **`git fetch` in the sandbox clone is cheap and safe to run any time the ahead-count looks stale or a stop-hook fires — it does not need push access, and it is the fastest way to tell "genuinely unpushed" apart from "pushed via the user's local clone, sandbox just hasn't heard yet."**

Ship a **zip of the source tree**, not a git bundle:

```
V=<VER>
cd ~/Downloads && rm -rf "pine-bot-$V" && unzip -q "pine-bot-$V.zip" -d "pine-bot-$V" && \
rsync -a --delete --exclude '.git/' --exclude 'node_modules/' \
  "pine-bot-$V/" ~/Desktop/Github/pine-bot/ && \
cd ~/Desktop/Github/pine-bot && rm -f .git/index.lock && \
git add -A && git commit -m "$V — <summary>" && \
git push origin main && \
git log --oneline -1 && git status -sb | head -1
```

The user pastes this into **Terminal** (or their local Claude Code session's terminal — either works now), after downloading the zip from the file card into `~/Downloads`. Safari may auto-unzip into a folder — then skip the unzip step and rsync from the folder. If the push is rejected "fetch first," `git pull --rebase origin main` then push; if THAT refuses because of a stale am/rebase, `git am --quit` first.

**BUNDLES ARE RETIRED.** `git pull <bundle> main` fails with "divergent branches": the user's `main` is a chain of squashed rsync commits. Zips + rsync side-step history entirely.

Rules that still bite:

1. The clone is at `~/Desktop/Github/pine-bot`. `cd ~/pine-bot` fails.
2. Zips are cumulative — a skipped version is not lost.
3. Bump `package.json` only — the build stamps `@version`/`SCRIPT_VERSION`.
4. `raw.githubusercontent` CAN serve a stale copy for minutes after a push — but doesn't always; re-curl before assuming a push failed (see above).
5. Violentmonkey checks on its own schedule; force it from the VM dashboard.
6. **The zip must have the tree at its ROOT** — `--delete` turns a nested zip into a repo wipe that still commits and pushes clean.
7. `origin/main` carries `CLAUDE.md` (PR #2); the rsync `--delete` from a zip built here keeps it because the sandbox clone fetched it first.
8. **The claude.ai/code cloud session can FORCE-PUSH from a stale checkout (2026-09-04).** It replaced `main` (`17ec3a5`) with `fffb5e5`, two commits on top of `2ea2a0a` — the pre-6.125.0 base — i.e. it never had the last five releases and rewrote history to match. `git fetch` in the sandbox printed `+ 17ec3a5...fffb5e5 main -> origin/main (forced update)`; that `+`/`(forced update)` is the tell. If that surface is used for a push again it must be started fresh from current `main`, and the sandbox should `git fetch` and check for `(forced update)` after every push from anywhere. Recovery from a bad force-push: the previous tip is still in the user's local clone (and the sandbox fetched it), so `git checkout <good-sha> -- .` + commit + push restores it without a second force.
9. **The zip check is mechanical, not a glance** — see "THE ZIP THAT NESTED THE REPO": `unzip -l z.zip | awk '{print $4}' | grep -c '^build.js$'` → 1, and `... | grep -c '^[^/]*/build.js$'` → 0. And after the user pushes, `git fetch && git ls-tree --name-only origin/main` from the sandbox must list `dist src package.json ...` at the top level.
10. **A defective zip left in `~/Downloads` gets replayed.** The 6.129.0 rsync block was run twice; the second run re-nested a repo the user had just restored. Any restore instruction must also `rm -rf` the bad zip and its unpacked folder.
11. `device_bash`/folder-bridge writes into `~/Desktop/Github/pine-bot` are NOT an option — the user has explicitly declined that folder-access request multiple times now (most recently 2026-09-04, in favor of the local-terminal-Claude-Code path instead). Do not re-request it.

## Writing tests with teeth (this keeps going wrong)

Every new assertion must be run against the *unfixed* source and observed to fail. **Fifteen+ toothless tests have shipped or been caught.** The failure mode is always the same shape: **an assertion whose two candidate behaviours agree in the direction being measured.**

- **The gate.** A branch behind `if (!running)` never executed. Call `start()`.
- **The clock.** A 2.2s stall needs a moving `Date.now` stub — one continuous clock, never rewound between phases.
- **The label.** Asserting a verdict string another line also sets. Assert the arithmetic instead.
- **The wiring.** A fix placed in a branch `handleScreens()` never reaches.
- **The mock.** A selector-blind `querySelectorAll` exercises a dead path.
- **The merge.** `setOwned` MERGES — clearing a key needs an explicit `0`.
- **The range.** A test enemy outside the gather window.
- **The other clock.** A budget that had already expired was doing the work. Clock-jumping tests go FIRST in a scenario or LAST with an explicit settle.
- **The agreeing directions.** "Walk to the station" and "walk onto the body" point the same way from a corner seat. Re-write as a sign flip.
- **The wrong scene.** A "day" assertion in an env with `hell: true`. Produced a WRONG FIX that had to be retracted mid-build. `hellDetected` is a **latch** — only `startRun()` clears it.
- **The re-applied params (6.123.0).** `startRun()` re-applies the CEM vector, so a dim override written *before* it silently measures the tuned value. Any test that forces a TUNABLE dim must write it AFTER `startRun()` and assert the override stuck.
- **The double insert.** Python `str.replace` replaces ALL matches.
- **The momentum.** planMove smooths headings across calls; a scene inheriting the last scene's heading asserts the wrong thing. Settle over several ticks.
- **The boot character.** Scenarios inherit the SHIPPED pin at env boot.
- **The shipped constant.** Scenario gts hardcoded against a config value break when the config moves — derive from `pineBot.config` and add one explicit tooth on the shipped value.
- **THE UNREACHABLE THRESHOLD (6.102.0 — the most expensive yet).** Every early-cap test passed for four versions while the mechanism could not fire in a real run, because the *test* set `defense: 35` — a value the game can never produce. **Rule: a threshold test must use the value the GAME can actually reach**, and any gate compared against a capped stat needs a standing assertion that the threshold sits at or under that cap.
- **THE LOUDER TERM (6.122.0).** The crowd-centroid fix genuinely did not bite until `movement.wallSiegeValue` and `movement.bossEngageValue` were silenced in the scenario. A steering bug only steers when nothing louder is talking — **isolate the term under test before concluding a fix is toothless.**
- **THE FIXTURE SELF-CHECK (6.123.0, works — keep doing it).** Head a scenario with one test that asserts the scene is the scene (right phase, right stat, right side of the bar). Break the fixture and six downstream assertions fail loudly instead of passing on the wrong scene.
- **THE EMPTY STORE IS UNDER BUDGET (6.125.0).** A trim/budget test driven from `pineBot.report()` on a fresh env passes on the unfixed source because nothing needs trimming. Assert on a fixture fatter than the budget, and self-check that it IS fatter.
- **PERFORMANCE WORK GETS A GOLDEN, NOT A PROMISE (6.126.0).** "No play-logic change" is proven with `node tools/plan-diff.js <old> <new>` printing `0 differ`, and the `plan-golden-*` scenarios hold every build to the 6.124.0 digest. Teeth: `movement.samples` 32→31 fails 229/240. An INTENDED behaviour change refreshes the golden in the same commit and says so. The cheap teeth check for any new scenario: patch the dist in `/tmp` to the old behaviour, run the scenario, see it fail, restore.
- **THE BLOB THAT NO LONGER HAS THE FIELD (6.127.0).** Trying to prove "the migration only runs once" by mutating Joe's own stored blob's `cem.mean` directly and expecting no effect threw `TypeError: Cannot read properties of undefined` — because post-migration, Joe's own per-character blob legitimately no longer carries `cem` at all (it moved to the shared store). That crash WAS the proof the split worked, just not the assertion form intended. Rewrote as two assertions instead: Joe's own blob has no `cem`/`items`/`builds` post-split, and only clearing the SHARED key (not any character's own key) re-arms the migration.
- **THE OUT-OF-BOX FIXTURE VALUE (6.127.0).** A test tried `T.setCemMean(dim, 201)` against a box whose max was 190 — the normal clamp-on-load logic reduced it to 190 on the next read, and the test read as a failure that was actually just an invalid fixture. Check the dim's `TUNABLE` box before picking a test value for it.
- **THE MOCK TEST-SURFACE HIDES A REAL PERSISTENCE BUG (6.128.0).** Every `immortal-graduation` assertion up to this point drove the reset through `T.setGraduation()`, a test-surface hook that replaces the in-memory `graduation` variable directly — never touches the actual load path in `01-config-data.js`. All of them passed with the new reset logic in place. Only a fresh test that boots a real `makeEnv()` against an actual pre-6.128.0 `localStorage` blob caught that the reset was never written BACK to `localStorage` at the moment it happened — it would only persist incidentally, on the next graduation/`bookImmortal` write. **Rule: when a feature's whole point is what a fresh boot does with existing storage, at least one test has to boot for real against that storage — a test-surface hook that shortcuts the load path can hide exactly the bug the feature exists to fix.**
- **A SECOND `makeEnv()` MID-SCENARIO POISONS THE FIRST (6.128.0).** Booting a second/third env partway through a scenario (to test the real-boot migration above) silently redirected the ORIGINAL `pineBot`/`T`'s later `localStorage` calls to the new env's store — `makeEnv()` reassigns `global.localStorage` wholesale, and the userscript reads `localStorage` as a bare global, not a captured reference, so every later call from the FIRST instance resolves against whichever store is CURRENTLY global. Three originally-passing tests turned red for the wrong reason. Fixed by moving every extra `makeEnv()` call to the very end of the scenario, after everything that still needs the original store to work. **Rule: a second `makeEnv()` inside one scenario file must be the last thing that touches storage, or explicitly restore `global.localStorage` afterward.**
- **A CHANGE UNGATED BY CHARACTER SILENTLY REGRESSES THE ONE CHARACTER IT SHOULDN'T TOUCH (6.129.0).** The first pass at cluster-aware ult aiming applied the new coverage-scored aim to EVERY character, including Minguk, whose nuke ult was never supposed to care about position (existing doctrine, unchanged since 6.86.12). The golden suite caught it immediately — `plan-golden-minguk` diverged from the untouched 6.124.0 digest across all six of its scenes. **Rule: when a change is meant to affect only some characters, gate it explicitly and let the golden suite prove the others are untouched — don't rely on the new logic "happening" to reduce to the old behaviour for the excluded case.**

## Reading a proxy and reporting it as the quantity

The other recurring, expensive error:

- `useUltimate` **calls** ≠ casts (2174 presses vs ~49 real casts).
- `th.lines` ≠ charge lanes. **`th.enemies` is range-filtered; `G.enemies` is the raw field.**
- `ownedLevels['OLIVE']` ≠ armour (reads 1 at the defense cap); and `ownedLevels['WATER']` ≠ regen — gate on `regenRate()` / `player.regenBonus`.
- A hell-latched test scenario ≠ the day.
- "crowd median 0" ≠ avoidance — same statistic, opposite causes.
- A clean `git status -sb` ≠ a shipped release.
- `ultClearsPassouts` ≠ what the ult does.
- **`parkAudit`'s printed `def: 35.0` ≠ the defense stat (34.992).** The rounded display became a config threshold and killed the early cap for four versions. **A number you read off a report has been through `toFixed`.**
- **`dangerAccum.line` ≠ lane deaths** (until 6.122.0): it booked proximity to *unarmed* telegraphs, producing 30 % of all death verdicts from a hazard worth 2 % of HP taken. And `lastDeathCause` is **not telemetry-only** — it feeds card scoring in six places, `cem.batch`, and the CEM directed-defense nudge, so a lying classifier steers the search.
- **A funnel row ≠ a fixed sample.** The funnel is a rolling 240-row window; 6.119.0's row went n=95 → 70 → 61 → 52 across four reports and its `entrySurvival` "improved" 0.36 → 0.64 purely from eviction. **Funnel rows can never be compared across two reports.**
- **`income.firstNegativeMin` ≠ where the bleeding starts** — it reads 20 while bucket 0 is already `net: -0.32`. Read the buckets.
- **A funnel row tagged another version ≠ this bot** (6.135.0–6.139.0 are the Codex fork). Check `namespace` and the version tag before diagnosing.
- **A micro-benchmark of a loop ≠ the function's cost (6.126.0).** The enemy-pass model predicted 11×; the real planMove moved 27 %, because the whole function was unoptimized. Profile the real dist in the harness (`node --cpu-prof`, `--trace-opt`, `performance.now()` marks).
- **A streak count read off a rolling audit ≠ a count (6.126.0).** The immortal count is persisted per run precisely because the rows evict.
- **A character's OWN store reading maxed-out ≠ the search actually needing the max (6.127.0).** Minguk's 8 boxed-at-edge dims, read pre-share, could equally mean the box is genuinely too narrow for his doctrine, OR that 8 runs of data on current-gen code just hasn't settled anywhere else yet — the CEM-box-widening proposal is explicitly NOT confirmed for exactly this reason; more shared-skill runs may resolve it without touching the box.
- **The stop hook is the SANDBOX's, not the user's machine (2026-09-04 — and an earlier version of this bullet said the opposite, which was wrong).** It lives at `/root/.claude/stop-hook-git-check.sh` INSIDE this container and checks this container's clone. `cat ~/.claude/stop-hook-git-check.sh` on the user's Mac returns "No such file". Its "unverified commits" arm scans `git log HEAD --not --remotes` — commits reachable from HEAD that sit on no remote-tracking ref — and requires each to be signed AND committed as `noreply@anthropic.com`. Why it kept naming the user's own 6.125.0 commit and GitHub's PR-#2 merge: the user pushes from THEIR clone, so the same content lands on `origin` under different SHAs, and this clone's whole inherited chain therefore counts as local-only. **Fix applied: reset this clone onto `origin/main` and re-apply only the unshipped work as one fresh commit** (`git diff HEAD~1 HEAD > /tmp/x.patch && git reset --hard origin/main && git apply /tmp/x.patch && git commit`), after which `git rev-list HEAD --not --remotes --count` is 1 and the nag stops. Do this whenever the clone diverges — it also ends the "which SHA is actually live" confusion that ran through this whole session. **Never amend the flagged commits**: they are published, and the rewrite the hook advises means a force-push to `main` — the exact operation that wiped five releases here.
- **An in-memory reset ≠ a persisted one (6.128.0).** The graduation-count reset correctly zeroed the live `graduation` variable the moment the module loaded, but nothing wrote that back to `localStorage` until the next incidental save — so a report or reload taken between the reset and that next save would have read the STALE pre-reset blob straight out of storage, even though the running session already believed it was reset. Caught only by booting a second, real environment against that storage (see "Writing tests with teeth" above) — a mock of the reset was not enough to see the gap.
- **A single distance-weighted mean ≠ the best ult-aim point when two piles are up (6.129.0).** Averaging every nearby passout's position degrades exactly when it matters most — two separated piles pull the mean into the empty space between them, landing a fixed-radius spiral/aura where no body actually is. Verified directly: a scene with a tight 3-body pile 23-25px out and a matching 3-body pile 185-191px out puts the old whole-pool mean ~31-83px from the bot (well outside the near pile, toward the far one).

**Rule: gate on the stat the game actually computes** (`player.defense`, `player.regenBonus`, `liveDefense()`, `regenRate()`), never on a name — or a rendering — that stands in for it.

## Reward scale can change without a code change

`hellTimeBonus` divided its dominant term by the LIVE crown board. Seeding the user's 62686s manual run on 2026-08-26 cut that term 4.1x with no version bump. Fixed in 6.91.6 with a fixed reference (`milestones.crownRefS`); **REWARD_EPOCH is 4 and is deliberately NOT bumped**, to preserve history.

**Survival-time comparisons (median / p60 / p120 / z) are reward-independent and stay valid across epochs.** Reward drives CEM only. Standing confounds: the RPD shop purchase, and right-censoring from capped runs.

## Game facts read from source in the live tab

- **Defense caps at 34.992** — `min(60, 3*upDefense + pas.armor)`, 5.832/OLIVE level, OLIVE caps at 6, `upDefense` unobtainable. The 60 is decoration.
- **Contact is untankable**: `hurtPlayer` sets 38 frames of invuln → ≤1.58 hits/s × ~9.8 = ~15.5 dps vs 1.71–3.07 HP/s regen. ~36 s to kill 469 HP. (`game-source-facts.md` says 33 frames; `hurtPlayer` **writes 38**. The config stays at 38 — a source read out-ranks a rate-inferred estimate that a hit landing as invuln expires would bias down. Open question, documented in-code.)
- **Marks do `player.maxHp * 0.40` / `* 0.35`** — percentage damage, so only POSITION defends against them. Armour is flat subtraction.
- **TIME STOP**: `player.timeStopUntil = frame + secs*60`. **No per-enemy flag.** WHISKY SOUR sets `e.frozenUntil`. FIRECROSS is `player.fireCrossUntil`, in **seconds against `gameTime`**, not frames.
- **Charge lanes (`roadLines`)**: `{x, y, ang, armed, dmg}` — **no `owner`, no `life`**. The game's hit test is `perp < 63`.
- **Enemy objects carry**: `id, x, y, type, tier, bossNo, bossChar, nickname, moving, won, billSprite, r, hp, maxHp, speed, wobble, dmgCd, frozenUntil`. **No `reach`**, no wake timer other than `frozenUntil`.
- **Field is W = H = 540.** Marks spawn in `[52, W-52] x [62, H-62]`, so the TRUE corner (0,0) is 80.92px from the nearest spawnable centre; `(p.r, p.r)` is 70.78 — inside a 70px mark.
- **Attack speed**: `cdMul = max(0.28, 0.86^upRapid * max(0.4, 1-pas.cd)/1.08)` then `*(1/1.01)^u.spd`. No time term.
- **Regen**: innate `(0.035+(lv-1)*0.025)*1.1` for **pat||minguk only — joe has ZERO**. SIMPLE SYRUP/WATER are FLAT per level (0.512/0.284).
- **Passouts die ONLY to base attacks, splash, the flame cross, and the ults** — joe's aura included (demo-verified to 3.2M HP). GIN TONIC's projectile hits passouts and its SLOW is boss mitigation (user doctrine, 6.99.3).
- **Passouts deal NO contact damage** — impassable obstacles only.
- **The dash grants no invulnerability** — `tryDash` sets only dashDx/dashDy/ dashUntil/dashReadyAt. A 0.16 s movement burst.
- **Knockback is a dead mechanism**: one-frame position teleport.
- **Level-up card types**: `sp_timestop`, `sp_firecross`, `sp_tequila`, `gold`, `gen`, `evolve`, `super`, `rainbowup`, `weapon`, `passive`.
- **A level-up card carries the SAME base name as a first pick** — `lv` distinguishes them, so any card-scoring term applies to both unless it guards on `lv`.
- The real pick call is `pickUpgrade(index)`; DOM card fallbacks are dead.
- **The Rainbow Gun has no automatic grant** — `rainbowup` is the only entry.
- **`EVOLUTIONS`** is the crafts array (not `CRAFTS`): `{parts:['WATER','SUGAR'], result:'SIMPLE SYRUP'}` and `{parts:['SWEET VERMOUTH','DRY VERMOUTH'], result:'BLACK VERMOUTH'}`. Secret crafts arrive as a mid-run DOM prompt with `G.state` still `playing`. User rule: **always take MAKE BLACK VERMOUTH.**
- **`hellDetected` is a LATCH** — `global.hell = false` does not clear it; only `T.startRun()` (reading `pendingHellEntry`) does. From 6.126.0 the HUD-text scan runs only when the `hell` binding is ABSENT.
- **The game multiplies rAF by its frame multiplier** — the bot's `mainLoop` runs once per VIRTUAL frame, so anything gated on game time runs `medianSpeed`× more often per wall-second than it reads. (6.125.0.)
- **V8 will not optimize a function over 61,440 bytes of bytecode** — and planMove was one until 6.126.0. `claude/optimizer-ceiling.md`.
- **charRoadmap.joe/.pat/.minguk are deliberately identical lists** — the weapon/ingredient POOL is shared by design (user, 6.127.0: *"Joe, Pat, and Minguk should have similar roadmaps"*); what differs per character is `CHARS` (physical stats/posture), ultimate kind/reach/falloff, and — before 6.127.0's share — separately-namespaced learned priorities.
- **Passouts are pure impassable obstacles — no contact damage, ever, on the ground or mid-fall** (three separate 05-movement.js comments confirm this independently). Nothing about approaching or standing among them is dangerous by itself; the only thing that decides an ult's yield against a pile is how well its aim point covers the bodies actually there.
- **Reading source from the page**: raw text snippets trip the content filter. Return *computed digests* — identifier lists, counts, booleans.

## Console-probe relay (the slow part of every session)

1. Probes that `console.log` a **joined string**.
2. Probes ending in `copy(...)` — warn that it overwrites the clipboard.
3. Never a bare `async` IIFE returning an array — renders as `Promise {<pending>}`.
4. **`JSON.stringify` DROPS undefined keys.** A probe returning `{}` usually means the accessor does not exist. **`player.evolved` is a Set — spread it.**
5. **Never hardcode a constant into a probe.** Ask the page for `W`/`H`.
6. Marks are transient — instrument in the bot instead of retrying a probe.

**A screen recording is worth more than any probe.** Frames pulled with `ffmpeg -ss <t> -frames:v 1` show panel state and posture together.

The Chrome bridge's `execute_javascript` fails until **View → Developer → Allow JavaScript from Apple Events** is enabled, so everything goes through manual paste. **Standing instruction: do not open new tabs to inspect — use the one already running.** (A Cowork session's own tab group cannot see the user's game windows at all; live state must come from a pasted probe.)

## Live instruments (all persist across runs)

`pineBot.namespace('claude')` (store split, see above) / `pineBot.report()` (budgeted; every audit, one paste) / `pineBot.reportFull()` / `pineBot.graduation()` + `pineBot.ungraduate(c)` (6.125.0; counts 6.126.0; bar raised to 10 with a reset floor 6.128.0) / `compare()` / `damageAudit()` / `incomeAudit()` / `huntAudit()` / `markAudit()` / `pauseAudit()` / `parkAudit()` / `bossHitRange()` / `demo()` / `pickAudit()` / `phaseAudit()` / `capStatus()`. Live day probe: `pineBot.plan()` carries `fundRush` and `litter`, and (6.129.0) `poCentroidDist`/`poNearest` for the passout aim point. Manual run end: `pineBot.endRun()`. Store repair: `recenterSearch()` (broken MEAN) vs `restartSearch()` (healthy mean, stuck σ) — never casually. **From 6.127.0, `recenterSearch()`/`restartSearch()` act on the SHARED cem store — running either from any one character's console session now affects all three.**

Sandbox instruments (repo): `tools/plan-diff.js <a> <b>` (equivalence), `tools/plan-diff.js --golden <dist>` (refresh), and the ad-hoc harness shape in `claude/optimizer-ceiling.md` (`test/fake-env.js` + `--cpu-prof` / `--trace-opt`).

**Instruments currently BLACKLISTED — do not quote these numbers:** `bossHit` median (149/210/228/779/886/168/86/189 across consecutive reports of the same build, on a 540 px canvas); the boss census (`growthPer100s: 0` for all ten kinds, `ringAt: null` — cause identified: `spanS` 15–30 s is too short to resolve growth); `hunt.dmgPerAttempt` (≈ 9 × 10¹⁶); `deaths{}` without subtracting `cap:true` rows; `deaths.line` in any 6.120.0/6.121.0 row; `income.firstNegativeMin`; and **any funnel row compared across two reports.**

## Statistics discipline

- `n >= 20` before a median comparison; 60+ for p60; 150+ for p120.
- Rows must never be pooled across bartenders, or across versions with different regimes. **From 6.130.0 the three characters alternate run by run, so each `+char` row fills at a third of the run rate — n≥20 per row takes ~60 runs of wall time, and the immortal counts (reset to 0 at 6.130.0) climb in parallel rather than one character at a time.** **From 6.127.0: Pat/Minguk rows from before the shared- skill migration and rows from after it are different regimes too — don't pool across that boundary either. From 6.128.0: immortal-count figures from before and after the reset are not comparable either — the counter itself, not just the search regime, changed underneath. From 6.129.0: Pat/Joe rows from before and after the cluster-aware ult aiming are a different regime too (Minguk's is provably unchanged, so his rows still pool across the boundary).**
- Read `supers` and `hell` before `median` — build-quality columns move first.
- **Check a feature could fire before reading its row.** This rule existed and was still violated for four versions by the early cap.
- **CEM `batchSize` is 10 against a recommended λ ≈ 14** for 28 `TUNABLE` dims — a standing reason to distrust small z-scores, and to never read a single CEM *sample* as the mean.
- The RPD Lv12 shop purchase (2026-08-28/29) confounds any cross-date z.
- CAPPED runs are right-censored — **subtract `cap:true` rows before reading `deaths{}`**.
- Store-churn rows (6.97.2) mix regimes — never mine them. **Characters used to learn their OWN stores with no cross-character seeding — as of 6.127.0 the CEM/bandit skill is deliberately shared; `runs`/`history`/`hof` are still per-character and still never pooled.**
- **One change per batch.** 6.119.0 shipped two day-side changes together and cost a −2.49 that could not be attributed.
- **Pre-register the abort before the batch runs.** 6.123.0's was written down in `claude/regen-seat-lever.md` — and it FIRED at n=90 (z −2.04), and the retraction shipped in the very next build. The user was calling the long runs "very good" / "close to immortal" while the median fell 20 %; both were true. The abort exists so the row decides, not the highlight.
- **A retraction is not a change.** 6.124.0 reverts 6.123.0's weights AND adds one variable; it is judged against 6.122.0, the last clean baseline, so the batch still has exactly one new thing in it.
- **A performance-only build is judged on `spd`/`spdLo`, not on median.** 6.125.0/6.126.0 change no play logic (golden-proven); if the median moves, look for a confound before crediting the build.

## Tooling on the user's Mac

- `gh` CLI authenticated as `changhakim90`. `~/.config` was root-owned; fixed with `sudo chown -R $(whoami):staff ~/.config`.
- **A Cowork session cannot push** — git proxy 403 ("changhakim90/pine-bot is not in this session's authorized repository set"). Fetch works. Deliver zips; the user rsyncs + commits + pushes. **The restriction is per-SESSION, not per-repo, and is fixed when the session is created** — the proxy's own advice is "add the repository to the session's sources". Measured 2026-09-04: `git ls-remote` against any repo outside the authorized set gets NO credential injected at all ("could not read Username"), so **creating a new repo does not unlock pushing** — a fresh `pine-bot-claude` would be exactly as unpushable. What does work is starting a session with the repo attached as a source, which works for `pine-bot` itself and needs no new repo. Note the GitHub REST API *is* reachable and authenticated as `changhakim90` from here (`GITHUB_TOKEN=proxy-injected`, `GET /user` → 200) — that is not a licence to write repo contents through the API to route around the git proxy's allowlist; the allowlist is the control, whatever the transport.
- **Local terminal Claude Code CLI is installed and IS THE ACTIVE PUSH PATH** (`~/.local/bin`, PATH exported session-only — persisting it needs `~/.zshrc` ownership fixed first, not yet done) and linked via `/web-setup` to the user's `gh` account. Confirmed working for both 6.126.0 and 6.127.0 pushes 2026-09-04, no proxy restriction. claude.ai/code cloud sessions have the same unrestricted push but were not used for these releases.
- `device_bash` unavailable; `~/Desktop` and `~/Movies` folder access was declined — **do not re-request** (declined again 2026-09-03/04 specifically for `~/Desktop/Github/pine-bot`; the user chose the local-terminal-Claude-Code path instead when explicitly asked to choose).

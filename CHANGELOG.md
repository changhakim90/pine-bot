# Changelog / performance log

Metrics come from the in-game 📸 table (`pineBot.compare()`). Judge on median / P60 / P120 / z, never best time. Tag `+crown` = `scoringProfile: 'crown-6.74'`.

| version | runs | median | mean | best | P60 | P120 | hell rate | notes |
|---|---|---|---|---|---|---|---|---|
| 6.74.0 | — | — | — | **252:30** | — | — | — | Won the hell crown. Differs from 6.79 only in scoreCard + reward. |
| 6.79.0 | 93 | — | 26.9m | 164m | — | — | 0.63 | SUPER NEGRONI refused, CAMPARI de-valued in hell, unbounded hell reward (epoch 2, cleared hof). |
| 6.80.0+crown | 33 | 21.3m | 30.1m | 249:00 | 0.07 | 0.03 | 0.73 | Version snapshots; `scoringProfile` switch. |
| 6.81.0+crown | 127 | 21.8m | 30.8m | 246:49 | 0.13 | 0.04 | 0.72 | Median/SD/P60/P120/z in the table; super-UNLOCK counting fix. |
| 6.82.0+crown | 192 | 21.9m | 31.3m | **253:30** (crown beaten, unsaved by choice) | 0.10 | 0.02 | 0.71 | Deep-hell contact posture (neutral on median, z=0.14). Fifth-super push could not fire: roster ceiling was 4 supers. |
| 6.83.0+crown | — | | | | | | | GINGER BEER unbanned in hell → SUPER MOSCOW MULE (knockback) as the fifth super line. |
| 6.84.0+crown | — | | | | | | | `knockback-to-6`: VODKA CRANBERRY / MOSCOW MULE pushed to lv6 (bigger near 6 / in hell / on contact deaths). Fifth-super bonuses removed (top runs have 3 supers). |
| 6.85.0+crown+pat / +joe | — | | | | | | | (6.85.0 never actually rotated: the world-screen START button is wired to minguk; fixed in 6.85.1 by calling startGame(key) from the world screen.) Bartender rotation: Pat and Joe alternate run-by-run, each with its own learn store (`pineBotUCB_v5_pat` / `_joe`) and posture profile; minguk's store untouched. `tank-mitigation` scoring tilt for Pat. |

| 6.85.1+crown+pat | 116 | 15.4m | 17.9m | 86:10 | 0.03 | 0.00 | 0.31 | Pat's first real sample. Median fell 1083→925s over the last 36 runs, hell rate 0.40→0.31, deaths contact 40 / **mark 43** / proj 25 / line 8 — and all five top runs ended on a mark. |
| 6.85.1+crown+joe | 113 | 7.4m | 9.5m | 56:21 | 0.00 | 0.00 | 0.12 | Unplayable. Retired in 6.85.2. |
| 6.85.2+crown+pat | — | | | | | | | Pat recalibrated from three manual demos (see below). Joe out of the rotation, replaced by minguk as a live control. |

| 6.85.3+crown+pat | — | | | | | | | Pat pinned, no rotation. Identical play logic to 6.85.2 — **pool the two `+pat` rows.** |
| 6.85.4+crown+pat | — | | | | | | | Day ring opening 130 → 165 (6.85.2 measured one demo by eye). |
| 6.85.5+crown+pat | — | | | | | | | `bossFloor` retracted to 0 (second hell demo puts hit-`bossD` at med 264 — not contact). Day ring mid/late 75/66 → 90/80. |
| 6.85.6+crown+pat | — | | | | | | | User directives: day bosses over the passout farm, TIME STOP station weight, flight survives low HP. |
| 6.85.7+crown+pat | — | | | | | | | Hell boss engagement no longer deferred to the MOJITO sniper when SOUTH SIDE is owned. |
| 6.85.8+crown+pat | — | | | | | | | Pat's ult has distance falloff: proximity-weighted aim, one-passout gate, 900ms retry. MOJITO deferral deleted. |
| 6.85.9+crown+pat | — | | | | | | | Flame cross: passout station collapses to contact range while it burns; pickup value roughly doubled with passouts up. |
| 6.85.10+crown+pat | — | | | | | | | Passout backlog: field-wide gather (was a 312px window), FIFO trek target, density-scaled `contested`. |
| 6.85.11+crown+pat | — | | | | | | | Frozen-boss stacking: `!projHere` gate removed (it suppressed the branch in hell), two-phase station at SOUTH SIDE burn range. |
| 6.85.12+crown+pat | **145** | **1247** | 1756 | 14115 | 0.12 | 0.01 | 0.53 | **z=5.26 vs the 6.85.1 baseline — the first significant result in the project.** Freeze aura fix; `bossHitRange()` instrument. All five top runs have 4 supers. |
| 6.85.13+crown+pat | — | | | | | | | Instrument only: `pineBot.damageAudit()`. No behaviour change — the classifier is byte-identical so verdicts stay comparable with the 145-run row. |
| 6.85.14+crown+pat | — | | | | | | | Focus fire: the passout kill order was computed but never used — one station target now, others are avoidance only. |
| 6.85.15+crown+pat | — | | | | | | | TIME STOP freezes via `player.timeStopUntil`, which never sets `e.frozenUntil` — the stacking window had never opened on the item. Now it does. |
| 6.85.16+crown+pat | — | | | | | | | Flame anchor; filler coins halved while a passout is up; loot yields during the burn; day boss tips are vital-grade. |
| 6.85.17+crown+pat | — | | | | | | | Kill order charges for transit: target = min(hp + 0.5×dist). Sim: 8 → 13 passouts cleared (+62%). |
| 6.85.18+crown+pat | — | | | | | | | Off-canvas day bosses gathered to 480px (ring pull only) — the bot hugs the nearest edge instead of forgetting them. |
| 6.85.19+crown+pat | **52** | **1244** | 1370 | 5193 | 0.06 | 0 | 0.54 | **Recovery confirmed: z=+3.16 vs the 6.85.16 regression, statistically level with 6.85.12.** Supers 0.9. |
| 6.85.20+crown+pat | — | | | | | | | Bossless deep-hell flight eases kite 1.8→1.25 (grind in the SOUTH SIDE wake for timestop drops); chased flight unchanged. |
| 6.85.21+crown+pat | — | | | | | | | Rainbow Gun skip is a hard veto (−500, was 18) — it could previously win a bad pool with no re-rolls left. |
| 6.85.22+crown+pat | **273** | **843** | 961 | 5585 | 0.02 | 0 | 0.18 | **REGRESSION, z=−3.1.** Null-poisoned params (suicide day ring, ×0 transit charge) + enemy-fear ratchet. Postmortem in 6.85.23. |
| 6.85.23+crown+pat | — | | | | | | | Emergency repair: dims withdrawn, applyParams hardened against null, `sanitizeCem()` every trial, multiplier instrument-only. |
| 6.86.0+crown+pat | — | | | | | | | CEM lockup repair: deduped/mean-tracked hall of fame, auto-restart when sigma dies, rank-based gradient, `deepFocusLv` ceiling 6→4. |
| 6.86.1+crown | — | | | | | | | Per-character ultimates (nuke/spray/aura) read from the game source; passouts corrected to harmless obstacles and HUGGED so `nearestEnemy()` actually targets them; invulnerability windows spend danger instead of fleeing. |
| 6.86.2+crown | — | | | | | | | Passout economics: measured kill-rate gate (abandon what cannot be killed), ult restored as the passout clear tool when adjacent, targeting comparison fixed, armour confidence + holdout anchor, tank first-super premium. |
| 6.86.3+crown | — | | | | | | | 🎥 demo digest: the recorder now emits a pasteable few-KB analysis (passout station percentiles, ult-vs-passout-HP pairing, build/armour timeline) instead of a 9k-sample log. |
| 6.86.4+crown | — | | | | | | | **Bank-and-detonate**, from a 19.7-min manual Pat demo: hug retracted (human stands 61-94px), ult harvest window (drift onto the pile as the ult comes up), armour-as-brawl-licence refuted, first-super premium cut, ult-level spine added. |
| 6.86.5+crown | — | | | | | | | Ult-spine premium runs to the cap (lv<6) and moved into the arm that actually scores `ult`; TOMATO JUICE valued as ult throughput for a tank. From the second manual demo. |
| 6.86.6+crown | — | | | | | | | Demo digest split by phase (day / hell / deep) + 40 ult uses + mid-run start marker. No behaviour change — the 90-minute demo validated the existing time-stop doctrine. |
| 6.86.7+crown | — | | | | | | | **Flame cross was dead code**: `fireCrossUntil` is a gameTime deadline, compared against `frame` since 6.85.9 — always false. Fixed, and the burn re-modelled as the directional flamethrower it is (aim the stream, don't hug). |
| 6.86.8+crown | — | | | | | | | CORPSE REVIVER No.2 + ABSINTHE demoted to the bottom of the junk tier (user: they can't damage holdouts). |
| 6.86.9+crown | — | | | | | | | Rainbow Gun **banned outright** (above the learned policy and the timing window); its +0.5 reward milestone zeroed; `strategy.rainbowReadyS` removed from the CEM search as a dead dimension. |
| 6.86.10+crown | — | | | | | | | Manual demo #4 (62:51) settles the ult-range question: cast effectiveness is a **range** limit, not a damage limit. 9 casts with a body within 160px removed HP every time (1.24M @62px, 1.89M @50px, both at ult **lv3**); 3 casts beyond 160px removed nothing (7.3M @222px, 44.7M @223px, both lv6). `ultAdjacent` widened 130 → 155. Also the first non-zero `flameShare` ever recorded (0.227), confirming the 6.86.7 gameTime units fix. |
| 6.86.11+crown+pat / +minguk | — | | | | | | | **Pat/minguk rotation restored** (user). `preferredBartender` unpinned; `bartenderRotation: ['pat','minguk']` alternates run by run, persisted in `pineBotRotIdx`. Each keeps its own CEM store and its own `compare()` row, so this is a concurrent control instead of the historical one — everything since 6.86.2 was judged against minguk runs from a different fortnight. Halves the per-character sample rate. Doctrine is already per-character and needed no rework: the tank bonuses gate on `style === 'tank'` (minguk is a runner) and the ult gate reads `ultKind` (minguk's nuke ignores `ultAdjacent`). Three new test scenarios assert the rotation actually rotates — the 6.85.0 failure mode. |
| 6.86.12+crown+pat / +minguk | — | | | | | | | **The tank posture stops following the runner.** (User: minguk "can't pass the day time... or dies very early" now that he rotates back in under 6.86 movement.) Three behaviours built from Pat demos were gated only on armour level, which minguk's own doctrine rushes: `holdoutAnchor` (planting a 120 HP runner beside holdouts) and the armour-softened `hpPanic` now require `anchorBias > 0`; `ultHarvest` now requires a melee ult, since minguk's nuke already hits every enemy at any range, so the 4x pull toward the passout pile bought nothing and cost spacing. Separately: his CEM store was reopened once by the 6.86.0 repair (`restartSigma` 0.25), so several dozen runs of wide sampling are expected on top of this. |
| 6.87.0+crown+pat / +minguk | — | | | | | | | **The characters stop sharing one plan.** (User: "they should have had different characteristics encoded on them though they share some similarities on weapon and ingredients roster" / "movement and anchoring and engagement of enemies should also have been different".) **Rosters:** `charRoadmap` replaces the single global `userRoadmap` — which was the MINGUK STALL roster that Pat had been building every run since 6.85.2, and which contains no VODKA MARTINI, so the super the user named as Pat's DPS answer could never be built. Pat's roster is five double-dipping keys (MINT→SOUTH SIDE, CAMPARI→NEGRONI, OLIVE→DRY MARTINI, TOMATO JUICE→BLOODY MARY, DRY VERMOUTH→VODKA MARTINI + the BLACK VERMOUTH craft); minguk's stall roster is unchanged. Both cap at FIVE completable supers, so the six-maxed-super Rainbow Gun gate stays structurally unreachable — asserted by `roster-cap`. **Movement:** `kiteChasers` and `fleeNear` are per character. Kiting and fleeing are speed bets pat (1.9) cannot win, so he commits at 4/6 and holds his ring; minguk keeps the historical 3/4, joe 2/3. |
| 6.87.1+crown | — | | | | | | | **Minguk pinned; rotation off** (user). He is the better character on every number that exists — median 21.9m over ~4,200 runs against pat's 15.4m over 116 — and the one that competed for the crown, so the full sample rate goes to him instead of being split. The 6.87.0 per-character rosters and posture stay encoded and tested; restoring the rotation (or pinning pat) is one line. The `rotation` scenario now asserts both the pin AND that lifting it still alternates, so re-enabling can't silently no-op the way 6.85.0 did. |
| 6.87.2+crown | — | | | | | | | **Junk that walks toward the gun is ranked below junk that doesn't** (user), and the super lines are capped at five (`maxSuperLines`). Measured on the old build: ANGOSTURA at lv5 — one pick from completing SUPER OLD FASHIONED — scored **19**, the TOP of the junk tier, above COINTREAU's 17, and collected a `super-key+5` bonus on the way. The bot was preferring the junk that opens a sixth line. `opensNewSuperLine` only fired on the final pick and only at 5 supers, which is too late to steer a pool; the new `gunPathProgress` scores how far a card carries an OFF-PLAN line (0..1) and orders the junk tier by it, with a hard −500 on any card that completes one, at any super count. Lines that can never complete (LEMON, ORANGE — never hell-unbanned) are correctly ignored, and the planned five are never penalised. |
| 6.87.3+crown | — | | | | | | | **Forced gun pools** (user: "at a certain point in early hell there are only 2 choices forcing the bot to pick a super cocktail leading item"). A pool where EVERY card walks an off-plan super line now (a) re-rolls on its own account, not only when the pool looks weak — the old `best < 22` gate missed two decent cards that both happened to be gun paths; and (b) is RECORDED in `pineBot.gunForced()` with what was offered, each card's risk, and what had to be eaten, so the mechanic behind a two-card pool can be read off real runs rather than guessed at. Working hypothesis to check against that log: the plan's own lines have capped and can no longer absorb a level, leaving the game nothing but new lines to offer. **Also fixed:** `boot()`'s API assignment had a SILENT `catch {}`; a hook referencing a function scoped inside `scoreCard` killed the whole `window.pineBot` API with no message. It logs now. `opensNewSuperLine`, `liveSuperCount` and `isCraftFinish` are all nested inside `scoreCard` — anything outside it cannot call them. |
| 6.87.4+crown | — | | | | | | | **The gun-path tax starts at the halfway mark, not the first level** (`gunPathFloor: 0.5`). 6.87.2 taxed every off-plan line from level 1, and the first 6.87.3 runs showed supers/run **3.2 → 0.5** and hell rate **1.0 → 0.5** (n=5 / n=4, weak evidence but the mechanism is plain): minguk's best recent runs are built on off-plan lines — DRY MARTINI, VODKA CRANBERRY, COSMOPOLITAN — and the tax was suppressing them from their first level. Two levels in an off-plan cocktail is damage, not a gun path; it cannot complete without many more picks, and the −500 completion veto still catches the pick that would finish one. Below half, off-plan cards are judged on merit; above it the tax climbs steeply to −66. |
| 6.87.5+crown | — | | | | | | | **Secret crafts were never being taken, and the super-evolution trigger was unknown.** Both read out of `openRecipe()` live (user: "why does black vermouth upgrade get locked out sometimes?"). (1) **The fusion prompt.** openRecipe states it: *"SECRET CRAFTS · COMBINATIONS (level the ingredients → a fusion prompt appears mid-run)"*. The prompt is a DOM overlay (`#craftBtn` "MAKE BLACK VERMOUTH" / `.craft-no` "NOT NOW") that leaves `G.state` on `'playing'`, so the `craft()` screen handler never fired — and its regex `/make it|craft|confirm|yes/` would not have matched "MAKE BLACK VERMOUTH" anyway. Two independent misses. Live probe caught it red-handed: `sweetver` lv6, `dryver` lv6, `player.absorbed` EMPTY, prompt still on screen, 15 slots in use. `takeCraftPrompt()` now runs from the playing state and clicks MAKE, never NOT NOW. (2) **`applyCraft` shows a craft is pure upside** — 재료는 풀업 상태 그대로 유지, 능력치 효과는 계속 적용, 슬롯 카운트에서만 빠짐 (3칸→1칸): the parts keep their full stat effect and only stop occupying slots. (3) **The evolution trigger is a BOSS TIP** — *"base attack MAX + cocktail Lv6 + key ingredient MAX → evolve at a BOSS TIP"*. The tip is not where the super is offered, it IS the trigger, so `evolutionPending()` now makes a tip VITAL-grade +60 whenever a super is qualified and waiting. |
| 6.87.6+crown | — | | | | | | | **6.87.5's craft fix was itself dead code.** (User screenshot: MAKE BLACK VERMOUTH / NOT NOW sitting on screen at 14:28, both vermouths lv6.) 6.87.5 put `takeCraftPrompt()` in `STATE_HANDLERS.playing()` — but `handleScreens()` **returns inside its own `st === 'playing'` branch**, before the `STATE_HANDLERS` dispatch is ever reached, so the handler could not run. Exactly the failure mode the handover notes warn about ("gates that never open"), and the 6.87.5 test missed it by calling the handler directly instead of going through `handleScreens()`. The prompt check now sits at the top of the playing branch, and the regression test drives `handleScreens()` the way the main loop does — deleting the hook makes it fail. |
| 6.88.0+crown | — | | | | | | | **Static audit: all 16 findings patched.** Five corrupted the reward/statistics the CEM optimises against. **C1** `takeCraftPrompt` counted a craft per 260 ms tick, before the click was known to have landed — a stuck prompt booked ~4 crafts/sec (10 s = 38 crafts = **+1.90 reward**, more than time+downs+sales combined) straight into `cem.batch`, the elites and the hof. Now latched by prompt signature and credited only once the prompt clears. **C2** every guard in `versionRows` used the global `isFinite`, and `isFinite(null) === true` — so `seTimeS === null` at n=1 entered the Welch denominator as **zero**. Reverting the fix reproduces **z = 8.75**, i.e. this is what produced `6.85.18+crown+pat` n=1 z=+8.66 "better" right before its successor read −32.43. `Number.isFinite`, a 2-run floor on verdicts, and an `underpowered` flag on rows below `minMeaningfulRuns` (20). **C3** the hell-entry regex `🔥\s*hell` also matches `#hellToggleBtn` (the results-screen leaderboard toggle, present after normal runs) and had no `/toggle/` exclusion — the loose fallback had one but doesn't latch. A stray click set `pendingHellEntry`, so the whole NEXT day run scored under hell rules and collected `hellEntered` + `hellTimeBonus`. **C4** the level-up dedupe was a 900 ms window, not a latch: a missed click repeated every mutation, drifting `ownedLevels` above true level so `atCap`/`isMaxed` lied to the scorer. **C5** `highscore()` never called `finishRun()`/`releaseAll()`, so a run could go uncredited and the next inherit its state. **D1** `'CORPSE REVIVER No.2'` was mixed case in six tables while `baseNameOf` uppercases — every lookup missed, so the "absolute junk pile" directive never fired and `ownedCocktailCount()` stayed 0 after taking it. **D2** `rainbowChoice` was assigned one line after an unconditional `break`, so the planner's `stallMode` was permanently false. **D3** `e.distant` was written and never read — distant bosses stayed in the danger field, so the bot fled the boss the ring term was paying it to approach. **D4** the anti-linebacker rule keyed on `l.owner`, which the real roadLine shape lacks; now flags on armed lanes. **D5** champion replays applied hof params with no clamp, so vectors from a wider box survived every narrowing (`deepFocusLv` 5.63 after the box shrank to 4); `applyParams` clamps. **D6** `restartSearch` never reset `bestBatchMean`, an all-time high-water mark, so one deep run made every later generation read as not-improving and restarts became a permanent cycle. **R1** `saveLearn` wrote the shared blob first with an empty catch — one quota throw silently discarded all learning, and `learn.versions` grew unbounded to cause it; own store first, `pruneVersions`, logged + surfaced. **R2** a wrong-TYPED stored field threw at module scope and the bot never loaded; body wrapped, bad blob preserved as `.broken`. **R3** `demoTick` read only `frozenUntil`, so every manual demo recorded `frz: 0` and the paused-boss distance measurement was structurally zero. **S1** clicked-element text reached the panel's `innerHTML` (a leaderboard name can get there via the stuck-breaker); the info block is `textContent` nodes now. **S2** unanchored `ok`/`yes`/`confirm` could submit the logbook name form; anchored, plus a `notNameForm` veto on the submit vocabulary while an input is visible. Three new scenarios (35 total); each fix fails its test when reverted. |
| 6.88.1+crown | — | | | | | | | **Fixes the wedged level-up 6.88.0 introduced.** Reported live and captured on video: at LV 71 / TIME 69:46 the LEVEL UP screen sat open with FLAME CROSS / TIME STOP / TEQUILA SHOT unanswered, the game clock frozen, the panel still reading `picked TIME STOP +2S`, while the bot clicked the settings gear, the recipe book, STAFF, ITEMS, CLOSE and pause in a loop. **L2 — the root cause.** AUDIT C4 replaced the 900 ms level-up dedupe window with `if (sig === lastPoolSig) return false`, and `lastPoolSig` is cleared only in `startRun`. Above LV 60 most cards are stat cards carrying no level, so the pool signature repeats within a few levels — and the first repeat latched `handleLevelUp()` to `false` for the rest of the run. The two cases the 900 ms window could not separate are separated by pool IDENTITY instead of content: the game allocates a new array per level-up, so a new object is always a new decision, while the same object inside the window is our own missed click. C4's actual defect — run state recorded for a pick the game never received — is fixed by ORDER rather than a latch: the card is taken first, and `ownedLevels`, `runPicks`, the milestone counters and the LinUCB training row are committed only if it landed. **L3.** `STATE_HANDLERS.levelup()` fell through to `clickCardByIndex(0)`, which returns false whenever `cardElements()` matches none of its six selectors — it matches none in the live DOM — and a false there handed the screen to the generic stuck-breaker. The handler now owns the stall: it claims the tick either way and force-picks card 0 after 2.5 s rather than letting the breaker loose. A suboptimal card costs one pick; a wedged level-up costs the run. **L4.** The breaker's blind click walks `stuckTries` along every visible button, and the persistent HUD (⚙ settings, 📖 book, ⏸ pause, 🔇 mute, the book's tab strip) is always among them — clicking those opens modals that add more buttons, so the breaker feeds itself. Both its branches now veto game chrome; `cardElements()` is vetoed too, since `.cards > *` and `.choice` can resolve to the HUD. **Also:** an unscored card type ties at 0 and hands the pick to card 0, which is indistinguishable from a blind click — unknown types are now logged once. Three new scenarios (38 total); reverting any one of L2/L3/L4 fails its test, and the `chrome-veto` failure output reproduces the video's click order exactly. |
| 6.88.2+crown | — | | | | | | | **Deep-deep posture, all characters, past 150 min — the first change in sixty versions with a measured mechanism behind it.** **Corner anchor.** Boss drop-marks are pushed by `bossAttack` at `x = 52 + rand*(W-104), y = 62 + rand*(H-124)` — **uniformly at random, never aimed at the player** — with `dmg: player.maxHp*0.40` (`again`, r58, 0.6 s telegraph) and `*0.35` (`selfie`, r52, 0.9 s). Because the damage is a PERCENTAGE of max HP, no amount of HP, armour or regen defends; only position does. At the true arena corner the nearest possible mark CENTRE is **80.9 px** away against a ~70 px reach — geometrically immune, against ~8.5% per mark in open field. Marks are 21–47% of all deaths. Past `cornerAnchorFromS` (9000 s) the planner pulls to the nearest corner and the standoff ring is cut to a quarter; marks, lanes and contact still override. Deliberately NOT gated on `hellDetected` — 150 minutes can only be hell, and a missed latch must not disable the posture that matters most. **Mark escape / MINT.** The same 0.6 s telegraph is 36 frames, and clearing r58 needs ~70 px of travel. **Pat covers 1.9 × 36 = 68.4 px and misses by two pixels**; minguk makes 85.5 and joe 108. That is the mechanical reason the death tables split by character — marks are pat's #1 cause in three of four rows (32–47%) against 18–22% for minguk. MINT takes pat to 98 px, so for him it is a SURVIVAL stat, not a mobility perk. The bonus is computed from the character's own speed (`MARK_CLEAR_PX - speed*MARK_TELE_FRAMES`), so the runners correctly get nothing. **Ult retry.** Read live: `ULT_CD` is 80 s scaled by `player.ultCdMul` (0.6667 observed) = a real **53.3 s** cooldown, confirmed by `ultReadyAt - ultSpiralUntil` = 50.5 s. A 2500 ms retry therefore casts ~1.25 s late every cycle; 300 ms costs 0.15 s. Worth ~2% more casts — free, and explicitly **not** a lever. (This corrects a reading in the 6.88.1 notes: manual demo #5's 2174 `ults` were `useUltimate` CALLS, most rejected, not casts. Real invuln uptime is ~5.3%, not 100%.) **Roster (user).** VODKA CRANBERRY replaces MOSCOW MULE — same whip archetype, identical lifesteal line (`steal = 1.356*min(0.5, 0.2+(lv-1)*0.06)`, `healBudget 2.71`), but 110 dmg vs 66, knockback 1.0 vs 0.7 (the mule's own comment reads "★넉백 −30%"), and `cFreeze:45` vs `cSlow:40`. Its super key CRANBERRY is already in the plan where the mule's GINGER BEER was not. **Recorded against it:** the 4400-run table does NOT show this — the mule leads more deep runs (15210, 14940, 14040) than the cranberry (15348, 5753), confounded by `knockback-to-6` making the bot pick it more. **One roster for all three (user).** 6.87.0 split the roster per character; that reasoning was about the DAY, but the deep game they are all trying to reach is identical, and pat and joe were arriving at minute 150 holding a different build from the one the deep posture is designed around. Posture stays per character. WATER joins the plan: it is the `regenBonus` ingredient (measured 2.22 HP/s live — worth 81 levels of pat's character scaling) and half of WATER+SUGAR → SIMPLE SYRUP, and `applyCraft` keeps materials at full level with their stats still applying, so it ends up costing no slot. Neither WATER (WHISKEY HIGHBALL) nor SUGAR (MOJITO) opens a sixth super line — the gun gate stays closed by construction. **Also:** `compare()` verdicts now name WHICH side is thin (a row with n=47 was printing "n<20" because its baseline had n=8); `demoTick` records distance-to-nearest-corner and REAL invulnerability, the two measurements whose absence produced both wrong readings above. Three new scenarios (41 total); `roster-cap` rewritten — it used to assert the per-character split this release reverses. |

## 6.85.23 — EMERGENCY: 6.85.22 postmortem and repair

6.85.22 ran 273 times overnight: **median 843, hell 0.18, supers 0.1, z=−3.1**
— the worst regression of the project, immediately after 6.85.21's n=17 posted
the best p60 in the Pat series (0.29). Both 6.85.22 mechanisms were at fault,
in different ways:

**1. The six new CEM dimensions were added to a LIVE learner with no stored
mean/sigma.** Every sample drew `NaN`. Worse: `JSON.stringify(NaN)` is `null`,
`isFinite(null)` is `true` (null coerces to 0) — so after the first refit the
poisoned means round-tripped through storage as `null` and **`applyParams`
applied them**: `patRing.early = null` collapsed the day station to a ~20px
suicide ring on top of the passouts, and `killOrderDist = null` multiplied
transit by zero — resurrecting the exact frailest-first regression of 6.85.14.
Champion runs and every post-refit run played these params.

**2. The enemy-type multiplier ratcheted.** Attribution assigned every hit —
mark, projectile, DoT included — to the *nearest* type, so the commonest types
climbed to the 2.2 fear cap within ~10 runs and persisted in the learn store.

Repair, all teeth-checked:

- The six dims are **withdrawn from TUNABLE** (knobs stay in CONFIG, settable
  and testable). Adding a dimension to a live learner requires seeding
  `mean = default, sigma = (max−min)/4` first — one at a time, on a measured
  baseline.
- `applyParams` is **hardened**: only `typeof === 'number' && isFinite` values
  are ever applied.
- **`sanitizeCem()`** runs at every trial begin: strips non-finite/null values
  from `mean/sigma/pc`, resets a poisoned step size, cleans `batch`/`hof`
  vectors, and deletes the stored `enemyTypeMul` ratchet.
- The multiplier is **no longer applied** to the danger field. Attribution
  keeps recording (`pineBot.enemyThreat()`, instrument only). Re-applying it
  requires sole-candidate attribution, not nearest-type.

The 273 poisoned runs also fed 27 CEM refits; the sanitizer plus rank-based
elites should recover, but watch `genHistory` and expect some drift.

*Scenario `cem-heal` (5 assertions) + the flipped multiplier assertion in
`learned`. Verified failing without the sanitizer.*

## 6.85.22 — the learner reaches the tactics, and enemy types are learned

User: *"Is there any way to have some reinforcement learning engine on the
attack radius, movement, and other tactics ... also on enemy attacks and enemy
types?"*

The engine already exists — the CEM does per-run evolutionary policy search
over 25 movement/threat/strategy dimensions, with rank-based elites and a
hall-of-fame anchor. What it could NOT reach was (a) every constant hand-tuned
during the 6.85.x calibration, and (b) the per-enemy-type threat weights,
which were static forever. Both are now learnable:

**Six new CEM dimensions** (bounds bracket the demo-measured band or the
hand-tuned value): `patRing.early/mid/late` (the day station curve),
`movement.killOrderDist` (the 6.85.17 transit charge), `movement.stopBossPull`
(the frozen-boss station weight), `movement.grindKiteMul` (the 6.85.20
bossless-flight pressure). Defaults = the shipped 6.85.21 values, so behaviour
is unchanged until the CEM finds better.

**Learned enemy-type threat.** The damage audit now attributes every HP drop
to the nearest gathered enemy TYPE (within 140px), and at run end each type's
share of the run's damage pulls a per-type multiplier toward `1 + 3×share`
(EMA, clamped 0.6–2.2; silent types decay back to 1). `gatherThreats`
multiplies the static profile weight by it — so the danger field fears what
has actually been hurting this bartender, per learn store, across runs.
`pineBot.enemyThreat()` shows the learned multipliers and the raw per-type
damage table.

What this is NOT: within-run RL on micro-decisions. One run = one sample, run
noise is huge (sd ≈ mean), and the frame budget is real — per-run black-box
search over a bounded parameter space plus measured-damage weight adaptation
is the honest version of "RL" this environment supports. Expect the new
dimensions to need ~50+ runs before the CEM's mean drifts anywhere meaningful.

*Tested — `learned`: both killOrderDist extremes flip the target choice, a
widened patRing pushes the station out, a 2× learned multiplier doubles the
danger-field weight, and an HP drop is attributed to the nearby type. Teeth-
checked on both mechanisms. Movement scenarios now pin `applyDefaults()` since
params are CEM-sampled per run.*

## 6.85.21 — skip is now a veto: the Rainbow Gun leak

User: *"rainbowgun is still appearing."* Correct — forced-skip was never a
refusal. The skip path scored the gun card at **18**, while avoided fillers
score *negative* and weak cards score under 18. So in a bad pool with no
re-rolls left, the gun was the best-scoring card and the bot took it against
its own policy. The 25-minute-window logic also re-derived the policy per call
and gave the pre-window gun the same 18, so the leak existed at every game
time.

With skip policy the gun now scores **−500** — it loses to literally anything
else the pool offers. Only an all-rainbow pool could force it. The take-policy
path (400 in window, 18 before it) is unchanged, and the hell hard-lock stays.

*Tested — `gun-veto`: a day-banned filler outbids the gun; both assertions fail
against the 18-point version.*

## 6.85.20 — bossless deep-hell flight is a grind, not a flee

User: *"the deep hell poison kill should be from the mobs. The pat bot has to
keep dashing away and ultimate until the bot can get timestop from the mob
through luck ... frequent killing of mobs with ultimate and southside when
boss is not present should help ... always dashing away while tanking the
ticking of damage."*

Fits the audit exactly: **~18% of all HP lost is an unmodelled DoT** — small
ticks, nothing within 90px — which the user attributes to deep-hell mobs. If
proximity itself costs HP steadily, pure distance was never buying what the
planner thought, and the only exit is a timestop drop, which only mob kills
produce.

Flight now has **two postures**:

- **Chased (boss on field, or no SOUTH SIDE): unchanged** — kite/escape at the
  full 1.8× pressure, dash gate 300ms, ult on cooldown. Dash-away doctrine
  intact.
- **Bossless grind (flight + SOUTH SIDE owned + no boss gathered): kite
  pressure eases to 1.25×.** The pack chases through the bot's own burn wake,
  the ult keeps firing (`ultSpam` already covers flight), kills keep dropping
  items, and one of them is the timestop that ends the chase. Outrunning the
  pack at 1.8× starved that kill loop.

The DoT itself is tanked, as directed — no panic behaviour keys on it, and
flight already survives low HP (6.85.6).

On *"pat bot needs upgrades faster meaning all kills of bosses in day mode"* —
already in place and measured: day boss engagement ×1.5 (6.85.6), boss tips
vital-grade (6.85.16), off-canvas bosses engageable at the hit circle
(6.85.18/19), MOJITO deferral deleted (6.85.8). 6.85.19's n=52 sample confirms
the day economy recovered (median 1244, hell rate 0.54). No further weight
changes without a regression signal — that lesson is one version old.

*Tested — `grind`: bossless flight with SOUTH SIDE grinds, a boss restores the
flee, no zoner restores the flee. Teeth-checked.*

## 6.85.19 — the station targets the hit circle, not the standoff

User: *"the bot is still not able to register the hit radius that's invisible
for bots because they are outside the visible canvas ... by hit radius I mean
the blue inner circle inside the two rings of the bosses."*

6.85.18 added the PULL toward an off-canvas boss but kept the normal standoff
ring — 240px in the day. For a boss whose body is mostly beyond the edge, a
240px station is outside weapon reach: the bot approached, parked, and never
landed a hit. The blue inner circle is the body circle `e.r` (source-verified
in 6.85.15: damage registers at `dist < z.r + e.r`), so the only thing that
matters is overlapping whatever sliver of that circle reaches on-canvas.

- **When the boss centre is off the field, the ring collapses to `e.r + 34`** —
  just outside the contact band of the hit circle. The edge-clamped candidate
  positions then hug the nearest edge/corner point automatically, as close to
  the circle as the field allows. Standoff logic is moot there: the body cannot
  chase onto the field any faster than it drifts.
- **Hell small bosses (r ≤ 90) join the 480px gather extension.** Only the
  deep-hell giants keep the exclusion (engaging them corner-chases into the
  known death trap).

*Tested — `edge-boss` extended: the ring reads < 120 where the old standoff was
240; fails without the collapse.*

## 6.85.18 — off-canvas bosses exist again

User: *"the bot is not recognizing that if a boss goes beyond the boundaries of
the canvas, then it can still attack by going as close to the corners and
edges."*

Correct: the 200px `enemyRange` gather cut made an off-canvas boss **invisible**
— no engagement pull at all, so the bot wandered instead of hugging the nearest
edge point where its weapons still reach the body. Day-only fix: non-wall
bosses are gathered out to 480px and tagged `distant`. A distant boss joins
ONLY the firing-ring pull — the ring-error minimisation over edge-clamped
candidate positions parks the bot at the closest reachable point automatically,
whether the true ring point is on-field or not. Distant bosses do not set
`th.boss` (no ult waste at range), do not join the danger field or crowd
counts, and hell is excluded entirely — deep-hell giants overlapping the field
from off-canvas keep their old invisibility, because engaging them would send
the bot corner-chasing into the known death trap.

*Tested — `edge-boss`, 2 of 3 assertions fail against the unfixed source.*

### ⚠ MEASUREMENT NOTE, same dump: the 6.85.15/16 cluster REGRESSED

6.85.16 at n=47: median 843 / hell 0.26 / supers **0.0** — z ≈ **−5.3** against
6.85.12 (1254 / 0.54 / 1.2, n=156). As significant as the original gain, in the
wrong direction. Projectile deaths became the top cause (15/47), which fits one
mechanism: **6.85.14's frailest-first kill order marched the bot across the map
through shot lanes** to reach frail targets. The sim caught the throughput
problem but not the deaths — it does not model projectiles.

6.85.17 (transit-charged kill order) reads recovered at n=6: median 1182, hell
0.5, p60 0.17. **Hold on 6.85.18 for 30+ runs.** If the median does not return
above ~1100, the next suspects are 6.85.16's safety bypasses (flame anchor
ignoring incoming fire; vital tips walking into boss zones), and they should be
reverted one at a time, not patched further.

## 6.85.17 — the kill order charges for transit

User: *"diagnose and see if the bot can kill passouts faster and more of them
starting in the 10 minute mark — and optimize the bot behaviour."*

Diagnosis first (tick-level simulation of the 10-minute regime, current build):
station-holding is fixed — 96–99% of ticks within weapon range of the target in
the normal cases, so 6.85.14/6.85.16 did their job. Two findings:

- **A NO BOOKING wall halves clear rate** (48% on-target, 2× time-to-clear).
  Deliberate — the wall outranks by user priority — recorded, not changed.
- **Target selection was the real lever.** Frailest-first is distance-blind:
  it sends the bot across the map for a marginally weaker target while a near
  one sits uncleared. In a 500-tick continuous-drizzle sim: **8 kills**.

Fix: the kill order is loot per second, and loot per second includes the walk.
Score = `maxHp + 0.5 × distance`, lowest wins, fell-first breaks ties. Same
sim, same counters: **13 kills (+62%)**. The far-backlog trek keeps oldest-first
(despawn risk dominates out there).

*Tested — `kill-order` fails against frailest-only selection; the sim numbers
are reproducible via /tmp scripts in the session.*

## 6.85.16 — flame anchor; filler loot no longer outbids the payoff

User, three observations in sequence: *"still not clearing the pass outs after
10 minute mark"*, *"the pat bot is not anchoring to fully utilize the flame
cross to defeat the passouts"*, *"it seems to treat the feed filler mark
rewards as the same loot reward as the passouts"* — and the pile now forms *"even
earlier in 6 minute mark"*, where they are *"killable with even low level
ultimates"*.

**Flame anchor.** The anchor requires a quiet field (near ≤ 4 for Pat),
OLIVE/NEGRONI ≥ 2, and no enemy shot within 130px. A 6–10 minute field fails
all three nearly permanently — so the bot never anchored, the kite pull ran at
FULL strength, and the 6.85.9 collapsed flame ring spent every burn window
being dragged off the passout by kiting. While the cross burns with a free
passout in reach, the bot now anchors unconditionally except when hurt, chased
by the rival, or in flight (`caution` already scales 0.72× under flame — the
burn is the defense). *Tested — fails without the change.*

**Filler vs payoff.** Passouts drop bill/tip (source-verified); the ordinary
mob feed scatters coins. The value table ranks a single coin below a single
bill correctly, but the loot pull sums over the floor — a CARPET of filler
coins outbids the two bills a station produces, and the bot leaves the station
to vacuum the feed. With a free passout up, filler (coins + unknown junk kinds)
is halved; it is still collected by the magnet and the walk between stations,
it just cannot outbid the payoff. And during a burn window all non-vital loot
yields ×0.45 (time stops excepted) — a detour that breaks the burn costs more
than any pickup is worth. *Both tested — fail without the change.*

**Day tips are VITAL-grade.** User: *"the bot needs to pick up tip rewards from
killing bosses faster to upgrade faster — even if boss is on the field in day."*
A tip drops where a boss died, which is usually next to the OTHER bosses —
inside the fear gradient, where `lootMul` and the danger field starve its pull
until the area clears and the compounding window is gone. During the day at
HP > 45%, a tip now carries the same `vital` flag as an emergency heal: full
pull at `lootPull × 1.2`, immune to the greed discounts, the burn-window yield,
and the flight discount, and worth one contact tick exactly as a heal is.
*Tested — fails without the change.*

Plumbing: `poFreeRef` is set by `gatherThreats` directly (the previous signal,
`lastPlan.poFree`, was one frame stale and absent outside the live loop).

## 6.85.15 — TIME STOP never set the flag the bot was watching

User: *"the bot is still not registering the two blue rings surrounding the
bosses at hell mode when they become large. The inner blue ring is the one that
should be damaged by southside attacks when they are frozen from time stop."*

Read out of the game source in the live tab:

- **A TIME STOP item does not freeze enemies individually.** The game's enemy
  update loop just does `if (frame < player.timeStopUntil) continue;` —
  `e.frozenUntil` is never set. Only WHISKY SOUR's freeze sets it per enemy.
- The bot's entire frozen-boss machinery — `stopBoss`, `pauseActive`, the
  6.85.11 two-phase burn station, the "dash is wasted during a pause" rule —
  keyed on `e.frozenUntil`. **So the stacking window has only ever opened on
  WHISKY SOUR freezes and never once on the item**, which is the exact window
  the user has been describing since 6.85.6.
- The two blue rings decode as: the **outer** ring is boss_ladies' 300px slow
  aura (`R = 300`, drawn light blue, gameplay predicate `dist < 300` → slow);
  the **inner** ring is the body/hitbox circle. The zone damage predicate is
  `dist(zone, boss) < z.r + e.r` — a burn zone registers when it touches the
  body circle, which is why damage only lands at the inner ring. The 6.85.11
  burn station (`r + 40`, just outside the body) is correct for that predicate;
  it simply never ran on item stops.

Fix: the global stop now counts as frozen for every enemy, with its remaining
frames feeding `frozenLeft`, so the burn/safe two-phase station and the
45-frame wake-up drop work identically for both freeze sources.

*Tested — `item-stop`: with `player.timeStopUntil` set and NO `frozenUntil`
anywhere, the stacking window opens, holds burn range, falls back to safe as
the clock runs down, and drops the target before it wakes. 4 of 6 assertions
fail against the unfixed source.*

## 6.85.14 — focus fire: the kill order was computed and never used

User: *"still not clearing the passouts towards the 10 minute mark and it keeps
piling up ... delaying the upgrades when entering initial hell mode."*

The farm loop computed `frailHp` and `firstId` for the "USER KILL ORDER" — and
then **never referenced either**. Every free passout applied its own ring
gradient simultaneously, so with several on the field the bot steered toward
the SUM of the pulls: a compromise point between rings. A probe at gt 650 with
three passouts showed the chosen heading pointing at the *farthest* one (its
error term dominates the sum). The bot orbited between targets, finished none,
and the pile grew while each one's maxHp kept scaling — so by the finale the
floor was littered with uncollected loot and XP, which is exactly the missing
upgrade funding at hell entry.

Now exactly **one** passout is the station target, in the kill order as
originally documented: frailest first (lowest maxHp = fastest loot per second),
fell-first (lowest id) as the tie-break. Every other passout contributes only
its contact-zone danger — visible, avoided, never a competing attraction. The
6.85.10 trek already handled the out-of-window backlog the same single-target
way; this closes the same bug inside the window.

*Tested — `focus-fire` fails against the unfixed source (heading flips from the
summed direction to the kill-order target).*

## 6.85.13 — instrument dangerAccum

6.85.12 measured out at **z = 5.26** against the 6.85.1 baseline (n=145 vs 243,
median 819 → 1247, mean 924 → 1756). But the thing 6.85.2 was *built* to fix did
not move: mark deaths were 32% of the baseline and are 31% now. Either marks
really are killing us, or the attribution is wrong — and the recorded verdicts
cannot tell us which, because of how they are produced.

`dangerAccum`'s classifier is an if/else chain with two blind spots its own
output can never reveal:

- **It defaults to `contact`.** Every HP drop with no recognised hazard in range
  has been silently booked as a contact death. Contact is 46% of 6.85.12's
  deaths — some unknown share of that is "we have no idea".
- **`mark` is evaluated last, after `proj`.** Any hit with both in range scores
  `proj`, and the mark is never seen.

**This version changes no behaviour.** The classifier is left byte-identical so
death verdicts stay comparable with the 145-run 6.85.12 sample; the audit runs
alongside it and records evidence instead of a verdict.

### `pineBot.damageAudit()`

Every HP drop is evaluated against all hazard predicates independently, not
first-match-wins:

- **`sole`** — events where exactly ONE class was in range. This is ground
  truth; everything else is inference.
- **`byClass`** — every class that was in range, so co-occurrence is visible.
- **`unattributed`** — hits with NO candidate at all, with `bossD` and `near`
  percentiles to characterise them. **A large share here means the hazard model
  is missing a damage source outright**, which the hell analysis already hinted
  at (hit-`bossD` median 264 across two demos, far outside any modelled range).

`nearestBossRef` tracks the nearest boss **field-wide, before the 200px
`enemyRange` cut** — reading `bossD` off the gathered list would be blind at
exactly the distances the hell hypothesis is about.

Also: `pineBot.damageEvents()` returns the last ~300 events with
`{gt, hell, loss, candidates, verdict, bossD, near}`, so the old verdict can be
compared against the evidence event by event. The audit survives page reloads
(persisted once per run on the run-end path, never in the frame loop) and
aggregates across runs; `pineBot.resetDamageAudit()` clears it.

**How to read it.** If `sole.mark` is a small fraction of `byClass.mark`, the
31% mark share is an artifact of co-occurrence and the mark work was aimed at a
phantom. If `unattributed` is a large share of HP lost, the contact figure is
inflated by unknown damage and the next job is identifying that source, not
tuning avoidance.

*Tested — `damage-audit`, all assertions verified against unfixed source.*

## 6.85.12 — the freeze aura was being read as a damage radius

User: *"I think the bot is thinking the freeze aura of the four-hour two-top to
be its damage radius."* Correct, and in four ways at once.

The two-top is a **paired** boss. When the partners close, they form a freeze
field around their **midpoint** — it slows and hard-freezes, it does not damage.
The planner already modelled that correctly as a `pairFreeze` mark at the
midpoint, radius `GZ_FREEZE_R`, only while the pair is seated. Then, separately,
`reach` added **+130** for any boss with a partner. `reach` drives the damage
gradient in the danger loop *and* the boss firing ring, so that term:

1. **double-counted** a field the midpoint mark already handled,
2. centred it on **each boss body** instead of the pair's midpoint,
3. applied it as **damage** when the field only slows and freezes,
4. and fired on `!!e.partner`, which is true for the whole run — so a two-top
   whose partner was across the map carried a phantom 130px aura, was skipped
   for engagement entirely, and pushed the firing ring 130px further out than
   its own body warranted.

The `+130` is gone, and `freezeAura` now means "the field is up (or about to
be)", using the same pair-distance test as the mark. *Tested — three assertions
fail against the unfixed source.*

### New instrument: `pineBot.bossHitRange()`

User: *"the bosses have two blue rings, the inner ring is where the bosses get
damaged."* If that is right then every boss ring in the planner is a guess at
the wrong quantity — hell holds `max(e.r+55, min(reach+10, 150))`, day holds
`max(reach+60, 240)`.

Rather than guess the radius and ship a seventh unmeasured constant, this
measures it. Every frame a boss's HP actually drops, the player→boss distance is
recorded (before the `enemyRange` cut, so a boss engaged at the 240px day
station is still seen; `WeakMap`-keyed on the entity so nothing leaks).
`pineBot.bossHitRange()` returns min / p25 / median / p75 / p95 / max.

**p95 is the answer**: past it, our damage was not landing. Run a few games,
call it, and the boss rings can be set from data the way the day ring was.

## 6.85.11 — the frozen-boss stacking window barely existed

User: *"the bot is not using SOUTH SIDE attacks well for frozen bosses in
hell."* Two separate reasons, and the first one means 6.85.6's weight raise was
tuning a branch that almost never ran.

**1. `!projHere` gated the entire branch.** `projHere` is true whenever any
enemy shot sits within `q.r + 130` of the bot — in hell that is very nearly
always. So the stacking window opened only on a quiet screen, which hell does
not have. A frozen boss cannot act; whether a shot is in flight elsewhere has
nothing to do with whether we should be standing in our own burn zones, and the
danger field already routes around live projectiles on its own. Gate removed.
*Tested — fails without the change.*

**2. The station was outside SOUTH SIDE's reach.** The same fact that drove
6.85.7 and 6.85.9: SOUTH SIDE is a **ground** weapon, its rain lands where the
bot's body is. A flat 150px station meant the boss was never inside the zones,
so "stacking" was orbiting an inert body at range. The station is two-phase now
— while the freeze has real time left (>2s) the bot stands at burn range
(`r + 40`, ~96px on a gathered radius), and as the clock runs down it falls back
to the old safe ring so the wake-up burst cannot reach. The existing
`frozenLeft < 45` cut still drops the target entirely before it moves.
*Tested — fails without the change.*

The `stackStation` diagnostic now reports the number the planner actually steers
to, rather than a separately computed label. The first version of this test
asserted the label and passed against unfixed source — a label can drift from
the behaviour, and then the test measures the label.

## 6.85.10 — the passout backlog was invisible

User, with a screenshot at 17:59 showing ~20 uncleared passouts on the floor
and a panel reading `21e 3p 26m 6L`: *"there's too many passouts"*, then *"it
needs to clear all bosses including no booking mobs and passouts in day"*.

Three separate mechanisms were keeping the floor from draining. The first is
the one that matters.

**1. The bot could only see passouts within 312px.** `gatherThreats` cut
passouts off at `lootRange * 1.3`. On a 540×540 field that is a *local window*:
parked in a corner, most of the floor did not exist to the planner. A backlog
on the far side was not deprioritised — it was **invisible**, so there was
never any reason to travel, and the bot re-farmed its corner while the pile
grew. The whole field is gathered now, with anything outside the old window
tagged `far`.

**2. Nothing pulled the bot across the field.** Twenty scattered passouts each
applying a full ring gradient sums to mush, so `far` ones are excluded from the
station loop and get a single **trek target** instead: when nothing farmable is
left in the local window, pick one distant passout and walk to it. Oldest first
(they despawn, and the user's kill order is FIFO), frailest as the tie-break.
Day only, healthy only, and never while a NO BOOKING wall or the finale rival
owns the field.

**3. `contested` was density-blind.** A passout with 3 live bodies within 85px
was skipped as a baited trap. That is an *absolute* count, so at late-day
crowding essentially every passout tripped it and the farm shut off exactly
when the floor was thickest with loot. (An earlier version bumped 2 → 3, which
was the same bug papered over one notch.) The bar now rises with the live body
count — ~3 on an empty floor, ~7 at the 21 bodies the screenshot showed.

Also: the ult's `passout-farm` bonus was `10 + 10 * min(1, passoutAvg/3)`, so a
20-passout floor scored identically to a 3-passout floor. Every passout-pressure
signal in the scorer saturates at 3 — the pick rules literally could not see a
backlog. The ult's is now `10 + 22 * min(1, passoutAvg/8)`.

**Note on `passoutAvg`:** it is a rolling mean of `th.passouts.length`, which is
now field-wide rather than local, so its scale has changed. Other consumers
(`siegeField`, `loot-radius`, the CEM's farm-richness feature) still threshold
at 1 and saturate at 3 and will now trip more readily. Deliberate, but untuned.

**Not addressed:** NO BOOKING walls are still gathered only within
`threat.enemyRange` (200px), so a distant wall is as invisible as a distant
passout was. Fixing that means touching the threat gather, which also drives the
danger field, crowd counts and panic — too broad to do blind. Bosses already got
a ×1.5 day engagement push in 6.85.6.

*Tested — `backlog` covers all three, and each assertion was verified to fail
against the unfixed source.*

## 6.85.9 — the flame cross is a body-centred burn

User: *"pat also needs to use flame cross to kill passouts as other weapons
don't do much damage to them."*

The cross was already valued as loot, but the bot was throwing the window away
after picking it up. `fireCrossUntil` only made the farm pull 1.3× stronger —
it did nothing to the **station**. So Pat would light up and then keep farming
from his 165px opening-day ring, spending the entire burn on empty floor. The
cross is body-centred: its damage reaches what the bot is standing next to,
nothing further.

- **While the cross burns, the passout station collapses to `zone + 24`** —
  just outside the contact ring, so the flame covers the body. The contact zone
  itself stays off-limits; the existing 55-danger retreat gradient still owns
  that. *Tested — the closing rate goes from ~0 to ~1 with the burn on, and the
  assertion fails without the change.*
- Farm pull during the window 1.3 → 1.6.
- **Pickup value with a passout field up: +28 → +55 (day), +18 → +35 (hell).**
  Given that the rest of the roster barely scratches passouts, a cross on the
  floor while they are up is close to top-priority loot rather than a mild
  preference. On an empty field it stays cheap, so the bot still leaves it lying
  there until it pays — the cross activates on pickup, and grabbing one early
  wastes it.

## 6.85.8 — Pat's ultimate has distance falloff; MOJITO deferral deleted

User: *"mojito doesn't kill the holdouts though. The bot should be using
ultimate more frequently to kill passouts. also ultimate for pat is different
from minguk in that it spirals out and the passouts nearest the ultimate gets
most damage."*

**`CHARS.pat.ultFalloff: true`.** Everything downstream keyed on an assumption
that turned out to be minguk's ult, not Pat's.

- **Aim point.** The bot used the flat centroid of every free passout within
  240px. Under falloff that is wrong in the one case it matters: a spread-out
  group averages to a point that is far from *every* member, so the ult lands
  where the damage is weakest. The aim is now weighted by `1/(d+60)`, which
  collapses onto the densest nearby cluster. Tested against a two-near-plus-one-
  far layout, where the flat centroid sits 53px off the pair.
- **Aim gate.** Closing on the cluster required `anchor` — HP > 0.7 **and**
  `OLIVE`/`NEGRONI` ≥ 2 **and** 2+ passouts. That kept the bot off the cluster
  for the entire early day, which is exactly the window where the user wants
  passout loot funding the ult. Under falloff the gate is now the safety half
  only (not hurt, no mark or shot overlapping the stand position) and one
  passout is enough.
- **Rate.** Adding another ult *trigger* was tried and dropped as measured
  redundant — `lootTargets` already fires on any passout within 190px. The real
  limiter is the **retry gate**: the bot only asks the game for the ult every
  `ultCooldownMs`, so a passout can sit in range for over a second after the
  game's own cooldown has ended. With a passout inside 120px the retry drops to
  900ms. *Tested — fails without the change.*

**The MOJITO sniper deferral is deleted.** "With MOJITO ≥ 3 and a free passout,
leave the boss to the sniper" was a rule built on a false premise. 6.85.6 made
it hell-only and 6.85.7 made it yield to SOUTH SIDE; both were patching a rule
that should not have existed. Bosses are now engaged on their merits in both
phases.

## 6.85.7 — SOUTH SIDE outranks the MOJITO sniper in hell

6.85.6 left a hole in its own directive. "Use SOUTH SIDE to kill bosses in
hell" cannot happen while `MOJITO >= 3` plus any free passout skips boss
engagement outright — SOUTH SIDE is a **ground** weapon, its burn only lands
where the bot's body is, so deferring to a remote sniper means the zone engine
never touches the boss at all. 6.85.6 made that deferral hell-only (day fixed);
it now also yields to `zoner` inside hell. Sniping survives as the fallback for
a build with no zone engine, which is what it was for.

*Tested — `hell-southside` fails without the change.*

## 6.85.6 — three user directives

Doctrine, not measurement. Nothing here comes from a demo; each change is
tagged with whether a test discriminates it.

**"The key to the day run is to kill all the bosses and get the loot and
upgrades to max out the ultimate to clear the passouts."**

- The MOJITO sniper deferral (`MOJITO >= 3` + any free passout ⇒ skip boss
  engagement entirely and stay on the farm) is now a **hell-only** rule. In the
  day the body goes to the boss and the passouts wait for the ult. *Tested —
  fails without the change.*
- Day boss engagement gets ×1.5 before 1200s. `dayFarm` was already amplifying
  the passout pull 1.35× in the same window, which made a boss and a passout
  near-equal bids; the boss is worth more because its loot is what levels the
  ult. *Weight change, not discriminated by a test.*
- The ult is already the top-priority card at 320 (only the rainbow's 400 beats
  it, and the rainbow is force-skipped). No change — now covered by a test so
  it cannot silently regress.

**"Use SOUTH SIDE to kill bosses in hell while not staying too close when the
bot picked up TIME STOP."** The station itself was already right — 150px, from
the 81-minute stall run, and the spring is symmetric so "not too close" was
already handled. An explicit inner-danger term was written, measured, and
**removed**: at 60px the spring alone already bids 50+ to step outward, so the
guard changed nothing. What was actually wrong is the weight: 26 is roughly
what an ordinary passout detour bids, so on a busy field the station lost to
the farm and the free damage window went unused. Now 44. *Weight change, not
discriminated by a test; the branch and the pause detection are covered.*

**"Once mobs become unkillable the bot should constantly dash away and run away
while using ultimate."** Flight mode no longer switches off at `hpPanic`. That
gate meant the bot became *less* mobile as it approached death: the panic
posture that replaced flight does not open the 300 ms dash gate, which keys on
`plan.flight`. *Tested — fails without the change.*

Two things were tried here and reverted rather than shipped:

- Loosening the crowd gates (`near >= 6 → 4`, `>= 4 → 3`). The directive does
  not settle 4-vs-3 and nothing measures it.
- Making `ultSpam` unconditional on HP. Unreachable: flight needs `near >= 4`,
  `hpPanic` implies `panic`, and `defensive` (`panic && near >= 4`) already
  fires the ult in every low-HP flight state.

## 6.85.5 — bossFloor retracted, mid/late day ring widened

Two more manual demos (a third day run and a second hell run, both saved
2026-08-21) contradict two things 6.85.2 shipped.

**bossFloor: 150 → 0.** The 6.85.2 claim was "every damage event in the hell
run happened at `bossD` < 140; above ~150 he took nothing all run." The second
hell run (`endGt` 2246, `hpMin` 23) does not look like that:

| | p25 | median | p75 |
|---|---|---|---|
| `bossD` at every sample | 125 | 170 | 313 |
| `bossD` **when damage landed** | 181 | 264 | 294 |
| `near` when damage landed | 1 | 2 | 4 |

Big hits landed at `bossD` 537, 376, 166, 264, 308, 248, 294 — and one at 39.
Hit-`bossD` medians across the two hell runs are 156 and 264. It is not contact
(the distances are far too large) and not a swarm (`hitNear` median 2, and he
sat at 160 near on full HP without losing a point). Pat is eating ranged fire
or telegraphed AoE at arbitrary range, and a standoff floor cannot touch that —
it only costs damage uptime. n=1 was never enough to ship it; retracted.

`bossFloor` stays in the profile schema and the `bossRingRef` diagnostic stays,
but the `boss-floor` test now asserts the *natural* ring (95–100px for a small
boss) is what the planner uses.

**dayRing mid/late: 75/66 → 90/80.** 6.85.4 fixed the opening (130 → 165) but
left mid/late where 6.85.2 put them, and those sit below every demo's p25:

| window | run A p25 | run B p25 | run C p25 | 6.85.4 | now |
|---|---|---|---|---|---|
| 0–180s | 166 | 138 | 115 | 165 | 165 |
| 180–600s | 78 | 96 | 96 | **75** | 90 |
| 600–1200s | 71 | — | 74 | **66** | 80 |

75 and 66 are tighter than the human ever parked in any of the three runs. The
opening holds at 165 (the widest read, since early day is where ~29% of runs
die). n=3, still provisional.

## 6.85.4 — day-ring correction (6.85.2 was measured wrong)

Demo index 2 — the second Pat day run, `endGt` 1236, which I skipped in 6.85.2
as "redundant" — was read properly. It contradicts the opening figure I shipped.

Percentiles over every sample carrying a `poD`:

| window | p25 | median | p75 | 6.85.2 shipped |
|---|---|---|---|---|
| 0–180s | 166 | 210 | 240 | **130** |
| 180–600s | 78 | 105 | 171 | 72 |
| 600–1200s | 71 | 85 | 96 | 62 |

The mid and late figures survive: they sit on idx2's p25, which is the right
estimator for a farming station, since the median is inflated by transit
between passouts. The opening figure does not survive. 6.85.2's 130 came from
eyeballing stationary samples in idx1 alone, which biased tight, and early day
is exactly where ~29% of runs die — so it erred in the worst direction.

`dayRing` is now **165 / 75 / 66**: the mean of the two demos' station
estimates, with the opening taking the wider read. n=2. Provisional.

Two other corrections to the 6.85.2 write-up, both from idx2:

- **Dashing is unresolved.** idx2 has 18 dashes against idx1's 4. The claim
  that low dash usage was a minguk artefact does not hold — it is not even
  consistent within Pat.
- **The build was not the cause of idx1's death.** idx2 picked CAMPARI,
  NEGRONI, OLIVE and VODKA CRANBERRY — the sustain line idx1 lacked — and
  still died at `gt` 1236, at the hell gate. The "no NEGRONI killed it"
  inference was weaker than it was presented.

## 6.85.3 — Pat pinned

`preferredBartender: 'pat'`, rotation off. Config only; the planner and scoring
are byte-for-byte 6.85.2, so the `6.85.2+crown+pat` and `6.85.3+crown+pat` rows
in `compare()` should be read together (same precedent as 6.83.0/6.83.1).

The version bump exists solely so Violentmonkey's self-update fires — it keys on
`@version`, so a config-only change with the same version would never reach the
browser.

Trade being made: 6.85.2 alternated pat/minguk so minguk was a concurrent
control. Pinning doubles Pat's sample rate, which is what we want while the
recalibration is unproven — but minguk is currently the *better* character
(median 21.9m vs Pat 15.4m), so every run is now on the weaker profile and
crown odds are lower until Pat proves out. minguk's ~600 runs remain as a
historical baseline. Restore the A/B by setting `preferredBartender` back to
`null`.

## 6.85.2 — Pat calibrated from manual play

Three manual Pat runs recorded with the 🎥 demo recorder on 2026-08-21: one full
20-minute day (`endGt` 1359) and one that reached 19 minutes *inside* hell
(`endGt` 2368). The hell demo is the first manual reference we have for Pat past
the finale, and it contradicted several 6.85.0 profile guesses.

What the human actually did, and what changed:

| finding | measured | was | now |
|---|---|---|---|
| Day passout ring | 130px for the first ~3 min, tightening to 72 then 62 | 118 / 112 / 105 | `CHARS.pat.dayRing` 130 / 72 / 62, keyed on gameTime (the tightening happens at ~180s, inside the `early` bucket) |
| Crowd | held station at 100 HP through 50–99 near (day) and 102–156 near (hell) | `panic` fired on crowd count | `CHARS.pat.crowdPanic: false` — HP is the only panic gate for a tank |
| Kiting | — | `kiteMul` 0.7 | 1.0. CEM's own gradient has `movement.kitePull` at corr **+0.41**; cutting it was a guess the data rejects |
| Boss distance in hell | every damage event at `bossD` < 140 (100→74 at 93px, 100→46 at 74px); nothing above ~150 all run | small bosses ringed at `e.r+55` ≈ 95–111px | `CHARS.pat.bossFloor: 150` |
| Day marks | every `marks:3` window is a passout landing 1–2s later; the human never moved for one | falling passouts cancelled the anchor via `markHere` | tagged `drop:true`; still a hazard in the danger field, no longer an anchor-killer |
| TIME STOP | taken **7 of 7** times once the build maxed | already 130 (+45 hell) vs firecross 85 / tequila 65 | no change — the bot already does this |

Also: `bossRingRef` / `pineBot.test.bossRing()` exposes the computed firing ring.
Diagnostic only. It exists because the floor was otherwise untestable — a
direction-based test passes with or without it, since the contact-danger
gradient already pushes away from a boss. With the ring observable, the
unfloored value for a small hell boss measures **111px**, inside the band where
the demo lost 26–54 HP.

**Watch next**: Pat median against the 925s baseline, day-clear against 0.31, and
the mark share. If mark deaths stay near 37% after this, the *attribution* is
suspect rather than the tuning, and the next step is instrumenting
`dangerAccum` rather than moving more constants.

## Findings

### The flame cross was never running (found 2026-08-23, fixed in 6.86.7)

Live probe: `fireCrossUntil` **7968.9**, `gameTime` **8054.4**, `frame` **635073**.

- The game sets `player.fireCrossUntil = gameTime + (5 + fireCrossBonus)` and tests `gameTime < player.fireCrossUntil` — a deadline in SECONDS.
- The bot tested `fireCrossUntil > frame`, so `flameOn` was **permanently false**. Everything gated on it — `flameAnchor`, the burn-range station collapse, the caution discount, the loot-yield rule — has been dead since 6.85.9, when the user asked for exactly this behaviour.
- The unit tests used the same wrong comparison (fake `frame` = 0 makes it always true), so they validated the bug instead of catching it. There is now a regression test asserting a lapsed deadline reads as cold.
- **`timeStopUntil` and `frozenUntil` ARE frame-based** (confirmed against the same live sample) — those comparisons were right and are unchanged.
- The burn is also NOT a body-centred aura, which is what the bot's comments claimed. Source: three projectiles every 3 frames along the aim vector at speed 9-11, "레인보우건급" (rainbow-gun class), for 5s + `fireCrossBonus` (the live run had **+51s**). It is a directional flamethrower: pointing it is the whole skill, so the station no longer collapses and the planner is instead paid for headings that line the best target up with the stream (passout > wall > boss > nearest).

### Manual Pat demo, 2026-08-23 (19:42, 2635 samples) — the passout economy

- Passout HP measured live: **35 @ 2:35, 13.4k @ 4:34, 86k @ 7:36, 193k @ 10:08, 575k @ 14:42, 1.8M @ 18:54.** Pat's whole base output is ~439 dps, so base attacks stop mattering after ~3 minutes. Earlier estimates from the spawn formula were ~50x too low.
- **The ultimate is the entire passout economy.** 14 casts, mean gap 75s (i.e. on cooldown), 13 reduced the passout count, **41 bodies removed** — one lv4 cast took a field of 21 down to 6.
- Every cast was fired **55-109px from the nearest body (median 78)** — never hugging. The human BANKS passouts (24 on the floor at once) and detonates the pile.
- Posture with OLIVE 6 / NEGRONI 5: **crowd p75 = 1 body within 90px, HP median 100%, p10 84%, 10 dashes in 20 minutes.** Armour is spent on surviving the odd hit, not on brawling.
- Build order: OLIVE 1@75s -> 6@525s, NEGRONI 1@286s -> 5@976s, ULT lv2@384 lv3@407 lv4@939 lv5@1097, **first super at 16:49** (3 by the end). Armour, then ult, then supers.
- flameShare 0 — this run cleared everything with ultimates alone.

### Second manual Pat demo, same day (19:51, 2435 samples) — what a better run differs by

Near-identical length to demo 1, but a visibly cleaner run, and the differences are all in ONE variable — how fast the ultimate scaled:

| | demo 1 | demo 2 |
|---|---|---|
| ULT level reached | 5 (by 18:17) | **6 (by 14:52)** |
| NEGRONI | lv5 @ 16:16 | **lv6 @ 7:21** |
| first super | 16:49 | 12:23 |
| passouts ever on floor | 24 | **7** |
| dashes / crowd p75 / HP p10 | 10 / 1 / 84% | **1 / 0 / 93%** |
| ult cadence | 75s (TOMATO JUICE x4) | 98s (none taken) |

- **Ult level is the scaling variable.** Demo 2's lv6 casts wiped million-HP fields outright (3->0, 4->0); its own lv1-lv3 casts had only chipped fields of 3 down to 1.
- Passouts never piled up in demo 2 (7 vs 24) because the casts were clearing, not chipping — the pile-up is a SYMPTOM of a low ult level, not a movement failure.
- Station distance replicates: median 79 vs 82, casts fired 44-102px out. `patRing` late = 80 is right.
- **TOMATO JUICE is throughput**: demo 1's four picks bought 14 casts in 20 min vs demo 2's 12.

### Third manual demo — a 89:48 hell run (recording began at 21:00, 4256 samples)

The deep game is a DIFFERENT PROBLEM from the day, and nothing about passouts applies to it:

- **13 of the 14 recorded casts fired with ZERO passouts on the floor.** The one that had a body cleared it (4.58M HP, 1 -> 0, ult lv6). Passouts are a day/early-hell phenomenon; the deep run is not a passout economy at all.
- **The build is TIME STOP.** 22 of 31 picks after 26:00 were `TIME STOP +2S`, with the two offered supers taken and the rest filler. Ult / OLIVE / NEGRONI were already lv6 before the recording started.
- **Zero damage taken across 69 minutes**: HP p10 = median = 100%, while crowd p75 was **18** bodies within 90px and the max was **220**. Deep hell is survived by keeping the field paused, not by spacing.
- **Zero dashes** in 69 minutes (day demos: 1 and 10).
- Ult cadence stretched to ~131s here versus 75-98s in the day — the game's own cooldown scaling, not a choice.

This validates the existing time-stop doctrine and the pause-aware posture rather than contradicting it, so no scoring change was made on the strength of it: TIME STOP already scores 175 in hell (plus up to +30 crowd-adapt), below super/evolve — which is the order the demo actually played.

- Deep hell is a flat-damage regime: enemy damage caps at ~22 from t=600s, spawns cap at 8, HP grows ×1.4/180s (unkillable), speed grows ~quadratically (25 at 60m, 400 at 255m). Survival past ~4h is about mitigation/sustain and contact avoidance, not kill speed.
- Tag per bartender (`+pat` / `+joe` / none = minguk). Each character needs ~30 warm-up runs before its CEM is meaningful; compare rows per tag, not pooled.

- Crown profile vs 6.79 rules: means inside noise; deep tail roughly double (five runs > 3h40 in ~350 vs none past 164m in 93).
- Every top-5 run of every version ends on **contact** in deep hell (~67% of all deaths).
- Completable super lines in the plan were SOUTH SIDE (MINT), GIN TONIC + VODKA TONIC (TONIC), NEGRONI (CAMPARI) = 4. LEMON / GINGER BEER / ORANGE banned. Fixed in 6.83.0.
- Open: day-phase early deaths (~29% before the finale); `strategy.rainbowReadyS` pinned at its max while rainbow is forced to skip.

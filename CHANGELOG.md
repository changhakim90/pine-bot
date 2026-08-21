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

- Deep hell is a flat-damage regime: enemy damage caps at ~22 from t=600s, spawns cap at 8, HP grows ×1.4/180s (unkillable), speed grows ~quadratically (25 at 60m, 400 at 255m). Survival past ~4h is about mitigation/sustain and contact avoidance, not kill speed.
- Tag per bartender (`+pat` / `+joe` / none = minguk). Each character needs ~30 warm-up runs before its CEM is meaningful; compare rows per tag, not pooled.

- Crown profile vs 6.79 rules: means inside noise; deep tail roughly double (five runs > 3h40 in ~350 vs none past 164m in 93).
- Every top-5 run of every version ends on **contact** in deep hell (~67% of all deaths).
- Completable super lines in the plan were SOUTH SIDE (MINT), GIN TONIC + VODKA TONIC (TONIC), NEGRONI (CAMPARI) = 4. LEMON / GINGER BEER / ORANGE banned. Fixed in 6.83.0.
- Open: day-phase early deaths (~29% before the finale); `strategy.rainbowReadyS` pinned at its max while rainbow is forced to skip.

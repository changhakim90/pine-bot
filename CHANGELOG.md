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

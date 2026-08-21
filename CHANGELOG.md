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

## Findings

- Deep hell is a flat-damage regime: enemy damage caps at ~22 from t=600s, spawns cap at 8, HP grows ×1.4/180s (unkillable), speed grows ~quadratically (25 at 60m, 400 at 255m). Survival past ~4h is about mitigation/sustain and contact avoidance, not kill speed.
- Tag per bartender (`+pat` / `+joe` / none = minguk). Each character needs ~30 warm-up runs before its CEM is meaningful; compare rows per tag, not pooled.

- Crown profile vs 6.79 rules: means inside noise; deep tail roughly double (five runs > 3h40 in ~350 vs none past 164m in 93).
- Every top-5 run of every version ends on **contact** in deep hell (~67% of all deaths).
- Completable super lines in the plan were SOUTH SIDE (MINT), GIN TONIC + VODKA TONIC (TONIC), NEGRONI (CAMPARI) = 4. LEMON / GINGER BEER / ORANGE banned. Fixed in 6.83.0.
- Open: day-phase early deaths (~29% before the finale); `strategy.rainbowReadyS` pinned at its max while rainbow is forced to skip.

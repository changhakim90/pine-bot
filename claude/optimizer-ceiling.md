# The optimizer ceiling

**Status:** fixed in 6.126.0. Read this before touching planMove's size or any hot loop.

## The finding

`node --trace-opt` on the test harness showed **`planMove` was never JIT-compiled**. V8 refuses TurboFan for any function whose bytecode exceeds `--max-optimized-bytecode-size` (61,440 bytes; Chrome ships the same ceiling), and planMove is ~3,100 lines. The planner had run in the baseline tier — no inlining, no typed-array fast paths — for its whole life. Lifting the cap in node with **no code change** took a realistic deep-hell swarm scene from 2.33 ms to 0.66 ms per tick; that was the proof.

Compounding it: the planner tick is gated on GAME time (33 ms), and the game's frame multiplier makes rAF fire once per virtual frame, so at medianSpeed 15 the planner runs **~455 times per wall-second**, not 30. 6.124.0 in the swarm cost 6.29 ms/tick = **2.9 cores** — the game physically could not run at the speed the bot was asking for, which is what the user was feeling.

## Measured (node harness on the real dist, `test/fake-env.js`)

| scene | 6.124.0 | 6.125.0 | 6.126.0 |
| --- | --- | --- | --- |
| uniform field, 35 in-range enemies | 1.44 ms | 0.94 | **0.19** |
| deep-hell swarm, 219 in-range enemies on the corner seat | 6.29 ms | 4.07 | **0.37** |

Wall-CPU at speed 15: 2.9 cores → 0.17.

## What changed (no play-logic change)

1. `Math.hypot` → `hyp()` at all 109 sites (2.4x; hypot is variadic + overflow-safe and not inlinable).
2. Per-tick partitions `th.live / field / siegeWalls / ringBosses`; candidate-invariant hoists (`charOf()`, `ownedLevels`, aura `d0e`).
3. **Structural:** the 640-line candidate loop is `scoreCandidates(C)` (takes planMove's 71 locals as one object), the danger field is `dangerAt()`, nearest-live is `nearestIdx()`. All three plus planMove itself now get TurboFan.
4. Danger field on pooled `Float64Array`s (`DPOOL`) with every per-enemy coefficient precomputed; exact culling (an enemy further than its cutoff + `step` contributes to no candidate; squared-distance reject before sqrt).
5. Nearest-live pass skipped unless joe's pierce term will read it (its only consumer).
6. `latchHellDuringPlay` skips the `innerText` HUD scan (a forced style+layout flush, 4×/wall-second all day) when the lexical `hell` binding exists.

## The equivalence proof — use it for every future perf change

`tools/plan-diff.js <buildA> <buildB>` runs both through 18 deterministic scene families (`test/plan-scenes.js`: day/hell × joe/pat/minguk × 3 seeds, swarm and uniform, 40 scenes × 6 ticks = 4,320 plans) and must print `0 differ` (1e-9). `test/golden-plans.json` is the digest recorded from **6.124.0**; scenarios `plan-golden-{joe,pat,minguk}` assert every build reproduces it. Teeth verified: `movement.samples` 32→31 fails 229/240.

**Rule:** a change that claims "no play-logic change" ships with `0 differ`. An INTENDED behaviour change refreshes the golden file in the same commit (`node tools/plan-diff.js --golden dist/pine-bot.user.js`) and says so.

## Standing rules learned

- **Any function that grows past ~1,500 lines has silently left the JIT.** Check with `node --trace-opt /tmp/prof4.js 2>&1 | grep planMove`. Put hot loops in their own top-level functions that take inputs as parameters.
- The CPU profiler attributes an unoptimized giant function's time to `(anon) line 1`; section-timing with `performance.now()` marks inserted into a copy of the dist is what actually located the cost.
- Everything "per candidate" that does not read `nx, ny` is candidate-invariant and was being computed 33× per tick.
- The 6.135.0–6.139.0 funnel rows with medianSpeed 2–3 and dayClearRate 0 are the Codex fork on the shared origin (see release-state.md), not this bot.

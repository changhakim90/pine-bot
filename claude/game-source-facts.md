# Game source facts

Read out of `pineandco.online`'s inline script (~650 KB) via the console, not inferred from play. These supersede several long-standing assumptions in the bot; where they do, the superseded belief is named.

**Scope gotcha, cost two probes:** the game's state lives in module-scope `let`/`const`, **not on `window`**. `window.player` / `window.gameTime` / `window.enemies` are all `undefined`; bare `player` / `gameTime` / `enemies` resolve fine in the console, which is why the bot reads them via `safe(() => player)`. Game *functions* (`update`, `onHit`, `fireCocktail`, `tryDash`, `dashCd`, …) **are** enumerable on `window`, so `Object.keys(window).filter(k => typeof window[k] === 'function')` is the way to scan source. Write probes accordingly.

## Characters (`const CHARACTERS`, module-scope — NOT on `window`)

|  | pat | joe | minguk |
| --- | --- | --- | --- |
| maxHp | 180 | 100 | 120 |
| moveSpeed | 1.9 | 3.0 | 2.375 |
| base / projKind | shaker | barspoon / mixglass (alternating) | agave |
| fireCd (frames) | 59 | 14 | 59 |
| dmg | 72 | 7.5 | 36 |
| projSpeed | 4.6 | 8.5 | 5.0 |
| splash | 38 | 0 | 0 |
| pierce | 0 | 8 | 0 |
| projectile cap | 6 | 8 | 6 |

Single-target base DPS ≈ pat 439 / joe 257 / minguk 220 (all projectiles hitting). Joe's pierce 8 makes him a crowd shredder; pat is a slow heavy hitter with splash; the agave explodes into spikes at 60% of its damage.

`fireBase()` fires at **`nearestEnemy()` across ALL enemies, passouts included** — the bot cannot choose its base-attack target, only its position. This is the single most consequential fact for farming.

## Speed, and why kiting is not the deep game (measured 2026-08-25)

`dashCd` read whole from source:

```
cd = max(1, 5 - (lv-1) * 4/3)        // dash Lv1 = 5 s, Lv4 = 1 s
cd *= max(0.4, 1 - mintLv * 0.1)     // MINT: -10% per level, capped at -60%
cd = max(0.5, cd)                    // hard floor
```

So **MINT's dash contribution caps at level 6** and then stops. MINT also adds move speed: a live Pat read `player.speed = 2.73` against a 1.9 base (≈ +44%).

**Live sample at `gameTime 7743` (129 min):** `player.speed 2.73`, `enemy max speed 126.6 px/frame`, **263 enemies on the field**, `player.invuln 33`, `hp 430 / maxHp 441`, dash at the 0.5 s floor (`dashReadyAt - dashUntil = 0.34`).

| time | mob px/frame | source |
| --- | --- | --- |
| 10 min | ~1.6 | DIFF() sweep |
| 20 min (hell entry) | 3.9 | DIFF() sweep |
| 60 min | 25.1 | DIFF() sweep |
| **129 min** | **126.6** | **measured live** |
| 255 min | 403.4 | DIFF() sweep |

Fitting `speed ∝ t^1.92` over the deep segment puts **200 min near 290 px/frame** — over half the 540 px arena in one frame, ~100× the player.

**The crossover, and what it implies.** Solving the early segment, mobs pass each character's move speed at roughly **pat 11 min, minguk 14 min, joe 16 min** — all *before* hell entry at 20 min. The bot's entire movement model (`standoff`, `kitePull`, `escapePull`, widest-gap escape) is tuned for a regime that has already ended when hell begins. This is the best available explanation for the structural fact that across every row with n ≥ 100 the median sits 820–1350 s: sixty versions have been tuning a kiting model in a game that stopped being about kiting at minute eleven.

**Two earlier claims corrected by this sample.** The "spawn cap 8" reading of the `DIFF()` table is wrong — 263 enemies were live; that column must be an interval. And the invuln window is **33 frames**, not 38, so contact income is capped near **1.8 hits/sec ≈ 40 dps** at the flat ~22.4 damage.

## Knockback — smaller than assumed, and it skips the swarm

`onHit`: `kb = (e.type === 'boss' ? 6 : 17)`, scaled by a per-projectile `p.knockback` factor that defaults to 1; `fireCocktail` carries per-weapon values (`0.28` and `0.7` observed). So the shove is **17 px against a normal mob, 6 px against a boss**, before weapon scaling.

Gated on `p.knockback && e.type!=='drunk' && e.type!=='passout' && !e.wall` — **knockback never applied to drunks, passouts or walls at all**, only to runners, bombers, throwers, genz and bosses.

Against the speed curve, knockback-as-distance dies early: 17 px buys ~4.4 frames at hell entry, ~0.7 frames at 60 min, and **0.13 frames at 129 min**. Tripling it for a super changes nothing.

This matters because MOSCOW MULE and VODKA CRANBERRY are primary in four of the all-time top runs (255:48 included), and v6.84.0 built `knockback-to-6` scoring on the theory that the shove is the mechanism. **That theory cannot be right in deep hell.** The live candidates for what those cocktails are actually doing are the **lifesteal** that rides with the kick — heal income is exactly what governs a flat-damage attrition regime — or `update: kbActive`, which implies the shove persists across frames and may gate the enemy's own movement (i.e. a micro-stun, whose value scales with hit RATE, not distance). **Unresolved:** whether `kb` writes a position or a velocity, whether anything blocks enemy movement while `kbActive`, and whether the magnitude reads `lv` or `superLv`. One windowed read of `onHit` / `fireCocktail` / `update` settles all three.

Naming note: the in-game description of MOSCOW MULE's attack is **"Donkey kick knocks enemies away + lifesteal"** — the donkey kick *is* the mule, and is unrelated to the dash (`tryDash` / `dashCd`).

## Ultimates — three different weapon classes

- **minguk `nuke`**: `claseUlt` lands after ~2.3 s, then `for(const e of enemies) dealDmg(e, 1e7 * 2.5^(ultLevel-1))`, commented "★passout 포함 전부 타격". Field-wide, range-independent, one-shots anything.
- **pat `spray`**: sets `ultSpiralUntil = gameTime + (1.4 + 0.13*ultLevel)*1.3`. While it runs, rotating arms (`2 + ultLevel`) emit projectiles every 3 frames at `dmg * dmgMul * 9.6 * 2^(ultLevel-1)`, **plus invulnerability for the same window**. Omnidirectional and short: it only pays on what is already adjacent.
- **joe `aura`**: sets `ultUntil = gameTime + 8 + 0.8*(ultLevel-1)`. Invulnerable, and every 14 frames deals `max(dmg,72) * dmgMul * 15.6 * 2.2^(ultLevel-1)` inside radius ≈ `player.r + 149`. The source comment notes this makes Joe's ult stronger than Pat's. Only pays while standing in the crowd.

Both non-nuke ults are genuine invulnerability windows — the contact loop is gated on `!isInvuln()`.

**Reach is a RANGE limit, not a damage limit** (manual demo #4, 31 casts): 9 casts with a body inside 160 px removed HP every time — including 1,241,884 at 62 px and 1,891,914 at 50 px, both at ult **lv3** — while 3 casts beyond 160 px removed nothing (7,320,633 at 222 px, 44,670,758 at 223 px, both lv6). The longest effective casts were 136 px and 153 px. `ultAdjacent` = 155.

## Passouts (만취 손님)

- **They deal NO contact damage.** The contact loop reads `if(e.type!=='passout' && !isInvuln() && dist < e.r+player.r)`, commented "passout=만취 손님은 장애물이라 데미지 없음". They are impassable obstacles that shove the player out. Only the falling **drop-mark** hurts (`hurtPlayer(m.dmg)` on landing) — and marks are modelled separately. **SUPERSEDES** the bot's "SOURCE-VERIFIED: the contact-damage loop has NO passout exemption" comment, which drove the 105-245 px firing ring, the 55/60 danger gradients, and the 0.15 guarded-loot mute.
- HP: drunk-wave passouts carry `d.hp * strength * 2` where `strength = 8 * (1 + (floor(gt/90)-1)*0.7) * (1 + gt/60*0.22)` — roughly 6 k at minute 10 and 86 k at minute 20. Static (`speed:0`), `showHpBar`, radius 36.9, `won = 600 + gt*5`, and only 1 of each 3 gives a tip.
- **Why Pat could not kill them** (user-reported, now explained): with `fireBase()` locked to the nearest enemy and Pat parked on a 165 px station, any wandering mob was nearer than the passout, so not one base attack ever pointed at it — and Pat has no pierce to leak damage through the mob he was actually shooting. Joe's pierce-8 stream and minguk's nuke both hid the bug.
- **Weapons that explicitly skip passouts**: espresso-martini lightning (`enemies.filter(e=>e.type!=='passout')`), chili rollers, vodka-tonic drones, black-vermouth drones, corpse-reviver zombies, Manhattan's `highestHpEnemy()` targeting, and all knockback (see above). A passout field is clearable only by base attacks, splash, the flame cross, and the ults.

## The flame cross

Three projectiles every 3 frames along the **aim vector** at speed 9–11, described in-source as "레인보우건급", for 5 s + `fireCrossBonus` (one live run had +51 s). A directional flamethrower — pointing it is the whole skill. `player.fireCrossUntil` is in **seconds against `gameTime`**, unlike `timeStopUntil` / `frozenUntil`, which are frame counters. The bot compared it against `frame` from 6.85.9 to 6.86.6, so the entire flame branch was dead code for six versions; fixed in 6.86.7 and confirmed live by the first non-zero `flameShare` (0.227) in demo #4.

## Level-up cards

Real card `type` values are `sp_timestop`, `sp_firecross`, `sp_tequila`, `gold`, `gen`, `evolve`, `super`, `rainbowup`, `weapon`, `passive` — **not** `item`. The pick is made by `pickUpgrade(index)`. `cardElements()`'s six DOM selectors match **nothing** in the live page, so every DOM card fallback in the bot is effectively dead code; do not rely on them.

An unrecognised type scores 0, and a pool of unknowns ties at 0 — the sort then hands the pick to card 0, which is indistinguishable from a blind click. 6.88.1 logs an unscored type once so this is visible rather than silent.

## Recipes, crafts and super evolution (`openRecipe`, read 2026-08-24)

`openRecipe()` renders the recipe book and, in doing so, states the three progression rules outright:

1. **WEAPONS · COCKTAILS** — "pick at level-up · weak at first, full power at Lv6".
2. **EVOLUTIONS · SUPER COCKTAILS** — "base attack MAX + cocktail Lv6 + key ingredient MAX → **evolve at a BOSS TIP**". The boss tip is not where the super is offered — it is the **TRIGGER**. A fully qualified super lies dormant until a tip is picked up. This is the likeliest explanation for how erratic `supersPerRun` has been across every measured version. Acted on in 6.87.5: `evolutionPending()` makes a tip VITAL-grade +60 whenever a super is qualified and waiting.
3. **SECRET CRAFTS · COMBINATIONS** — "level the ingredients → **a fusion prompt appears mid-run**". Crafts are NOT level-up cards.

### The fusion prompt (cost: every craft in every run, until 6.87.5)

The prompt is a DOM overlay: `#craftBtn` ("MAKE BLACK VERMOUTH") and `.craft-no` ("NOT NOW"). It **does not change `G.state`** — the state stays `'playing'`. The bot's `craft()` handler only ran when `state === 'craft'`, so it never fired; and its `clickText(/make it|craft|confirm|yes/)` would not have matched "MAKE BLACK VERMOUTH" even if it had. Two independent misses.

Caught live: `player.weapons.sweetver` lv6/max6, `dryver` lv6/max6, `player.absorbed` **empty**, prompt still on screen, 15 entries in `player.weapons`. Both halves finished, fusion unclaimed.

### `applyCraft` — a craft is pure upside

```
if(!rc.cocktail && rc.consume){ player.absorbed[k] = true; }
```

with the comment: 재료는 풀업 상태 그대로 player.weapons에 유지 → **능력치 효과는 계속 적용되고, 슬롯 카운트에서만 빠짐 (3칸 → 조합품 1칸)**. The consumed materials stay at full level and **keep their stat effect**; they only stop counting toward slots. So a craft is a free weapon *plus* slot relief — the bot's older "two consumed, one returned" model understated it by implying the ingredients were lost.

### Container shape

`player.weapons` is **one combined map** of cocktails AND ingredients (`negroni, southside, olive, vodkatonic, campari, mint, sweetver, moscowmule, gintonic, tonic, dryver, sugar, vodkamartini, cranberry, cosmopolitan` in the probed run). There is no separate `player.items`. `player.superLv` holds the made supers (`{gintonic:6, vodkatonic:6, vodkamartini:6, southside:6, negroni:6}` — five maxed, the designed cap). `player.absorbed` marks craft materials. Names are lowercased with spaces stripped.

## Acting on it (shipped in 6.86.1 – 6.88.1)

- `CHARS[*].ultKind` = nuke / spray / aura, with `ultReach` and `ultClearsPassouts`. Harvest / loot-target / falloff-retry triggers are now nuke-only; spray and aura fire on adjacency, contact and low HP.
- The passout **hug** was tried and retracted (6.86.4) — the manual demos show the human banking bodies and detonating from 44–109 px, never hugging.
- Passout bodies are navigation obstacles (`poBlockPenalty`), not threats; the guarded-loot mute went 0.15 → 0.85.
- During either invulnerability window: caution ×0.35, `hpPanic` and flight suspended, and for joe an attraction into the cluster inside spike reach.
- 6.87.5: the fusion prompt is answered from the playing state (MAKE, never NOT NOW), and boss tips are VITAL when an evolution is pending.
- **Not yet acted on:** the speed crossover above, and the knockback finding. `knockback-to-6` (v6.84.0) is still scoring on a mechanism the numbers say cannot work past ~30 min.

# The immortal stop rule

*(Note: this doc was accidentally overwritten during the 6.128.0 update —
the previous, more detailed version's exact prose is lost. This
reconstruction pulls from the still-live doctrine comments in
`01-config-data.js`/`04-lifecycle-screens.js` — which carry the user's
original quotes verbatim — plus what's cross-referenced in
`release-state.md`. If anything here reads thinner than a prior session
remembers, that's why; the mechanics and quotes below are accurate, just
possibly less richly annotated than the original.)*

## 6.132.0 — the bar is the BUILD, not the super count

**User: "let's remove this from the rule and instead replace it with has
southside, simple syrup, olives, and sweet vermouth or black vermouth all
maxed out."**

The prompt was a live `pineBot.report()` the user pasted with "this should
already be counted as an immortal build run". Reading it: HP and defense
both passed, `streakS: 0`, and `supers: 2` against `supersMin: 3` was the
*only* leg holding the gate shut — with ~1,090 game-seconds left, enough
for the 300 s hold if a third super had happened to arm. The 6.103.0
funnel had already recorded supersMin as the binding constraint on nearly
every ready build; this was that finding arriving in a single run.

Supers are also the part of the build the bot steers **least**: a line
arms only when the pool happens to offer its key's last level. The four
ingredients the user named are ones the planner drives on purpose.

### The rule now

`CONFIG.deepHell.capStable.supersMin` is **gone**. In its place:

```js
capStable: { fromS: 2400, hpFloor: 0.97, defMin: 34.9, holdS: 300, dipGraceS: 4,
             build: [['SOUTH SIDE'], ['SIMPLE SYRUP'], ['OLIVE'],
                     ['SWEET VERMOUTH', 'BLACK VERMOUTH']] },
```

Clauses are **AND across, OR within**. An absent or empty `build` list is
the off switch and passes — config, not a code change. The stability proof
is otherwise unchanged: from `fromS`, HP must hold `>= hpFloor` for `holdS`
consecutive game-seconds with `defense >= defMin` and the build complete.

### It reads `player.weapons`, NOT `ownedLevels` — and this is the whole finding

This is 6.91.2's lesson, and it is the single most expensive naming
mistake in the project. A live probe at gt 2218 read `player.defense` =
**34.992** — the cap — while `ownedLevels['OLIVE']` read **1**. In-run
upgrade levels land under `"OLIVE UP"`; the bare `"OLIVE"` key goes to 1
when the ingredient is first acquired and never moves again. (Same dump:
`OLIVE UP` 4, `WATER UP` 3, `OLIVE` 1, `WATER` 1.) Four armour gates spent
four versions comparing 1 against thresholds of 2, 4 and 6 — deep park had
never engaged in a single real run. **A gate keyed on
`ownedLevels['OLIVE']` would have reproduced that failure exactly**, and
silently, because a gate that never fires looks identical to a build that
never qualifies.

`player.weapons` is the game's own combined map. Three independent live
dumps recorded in `01-config-data.js` and `03-scoring.js` agree on its
shape: **lowercase, squashed, and ABBREVIATED** keys with plain numeric
levels.

| display name | weapons key | source |
|---|---|---|
| SOUTH SIDE | `southside` | 373-min Pat run, minute-76 digest |
| SIMPLE SYRUP | `syrup` | 373-min Pat run (`crafts syrup + blackver`) |
| OLIVE | `olive` | minute-76 digest |
| SWEET VERMOUTH | `sweetver` | 373-min run, minute-76 digest, craft probe |
| BLACK VERMOUTH | `blackver` | 373-min Pat run |
| DRY VERMOUTH | `dryver` | same |

**Note `sweetver`, not `sweetvermouth`.** A generic
`toLowerCase().replace(/[^a-z0-9]/g,'')` squash of the display name does
*not* produce the key the game uses. So `buildKeyLevel(name)` tries the
**measured** spellings first, then the squash, in that order.

Resolution order, cheapest first:

1. `player.weapons[key]` for each candidate spelling (object map; an array
   of entries is accepted too, so a shape change degrades to a miss on one
   leg rather than a thrown planner tick).
2. `ownedLevels[name + ' UP']` — **the UP key first**, because that is
   where in-run upgrades actually land.
3. `ownedLevels[name]` — the acquisition flag, last among the level reads.
4. `keyEffectivelyMaxed(name)` / `everMaxed` — the 6.89.0 absorbed-key
   blind spot: a secret craft eats its parts, so a maxed half can leave
   every live reading behind.

`applyCraft` leaves consumed materials in `player.weapons` at full level
("능력치 효과는 계속 적용되고, 슬롯 카운트에서만 빠짐"), so the reading
survives the BLACK VERMOUTH craft that eats SWEET VERMOUTH — and the OR
clause covers it from the other side regardless.

### It self-reports, on purpose

The commitment made before building it: *a wrong key name must be visible
in the first report, not four versions later.* So `capStatus().build` —
and therefore `report().cap.build`, which is what a paste carries —
contains, for every clause: the level, the max, **the key that actually
answered**, and **where the number came from** (`weapons` / `owned` /
`absorbed` / `evermaxed` / `none`), plus the raw weapons map (first 40
keys) so a key this gate does not know is still visible in the paste.
`short.buildShort` names the short clauses with their live levels.

If a spelling is wrong, that leg reads `key: null, src: 'none'` on the
first report after install.

**`capLastResetReason` now also fires when no streak was running.** The
old code wrote that field only on a reset, so a build that never once met
its bars left it `null` — which is exactly the paste that started this:
`streakS: 0` and nothing saying why. "Why has the clock never started" is
the more common question and now has an answer; for the build leg it names
the clause (`build:SIMPLE SYRUP`).

### The third reset (`resetEpoch132`)

Not because the user asked to start over — because the **definition
changed**. Counts standing in the store were earned against `supersMin: 3`;
a graduation mixing the two bars proves nothing. Counts, graduations, the
round-robin cursor and the race ledger all go, and
`immortalEpochVersion` is re-stamped here. Same shape and its own guard,
alongside the 6.128.0 and 6.130.0 flags; a store missing any of the three
gets all three.

### The multi-tab ledger fix (shipped in the same version)

**User: "let's do that as well."** Caught in the same live 6.131.0 paste:
`compare` showed **4/8/6** runs per character while the race ledger read
**1/1/1**, and minguk's `runRange` [618, 621] covered four run numbers for
eight counted runs. Two tabs were each writing the whole graduation blob
and clobbering the other's progress. The learned stores have re-read
shared storage before booking since 6.113.0; the graduation store never
did.

`reloadGraduation()` re-reads `GRADUATION_KEY` at the top of
`bookImmortal` (another tab may have booked runs since this page loaded)
and `graduationPick` (the rotation cursor is shared state too), **guarded
on the current reset flag** so a pre-reset blob can never be adopted back.

This broke four pre-existing tests, and the reason is worth keeping: the
test surface's `setGraduation()` wrote only the in-memory variable, so
`reloadGraduation()` overwrote every fixture from storage before the code
under test saw it. `setGraduation` now writes through to `GRADUATION_KEY`.
Same family as the 6.128.0 lesson already recorded here — **when a
feature's whole point is what a load does with existing storage, the test
surface must not shortcut the load path.**

### Cost control

The planner tick is gated on GAME time, so at medianSpeed 15 the gate
would be called ~455x per wall-second (see `optimizer-ceiling.md`). Levels
only go up, so the pass is **monotone**: `buildGateState()` latches once
every clause is satisfied and returns a shared frozen result, with a 1
game-second recompute below that, and `buildGateState(true)` forces a
fresh read for the report (a report must never show a cached picture).

**The latch is cleared at every run boundary** — `startRun` and both test
resetters, via one `resetBuildGate()`. The first cut cleared it only in
`startRun` and six scenarios went red: a latch taken on a complete build
carried into the next scene. That is the production hazard too — a stale
latch would cap a run immortal before it bought a single card.

### Equivalence and tests

`node tools/plan-diff.js <6.131.0 dist> <6.132.0 dist>` prints
`4320 plans compared, 0 differ`, and the golden-plan scenarios pass
unchanged. The build gate is the intended behaviour change and the golden
scenes do not reach it — stated rather than claimed away.

`run-cap` +11 and `immortal-graduation` +5. Teeth verified individually,
each against the specific defect it guards:

| removing | fails |
|---|---|
| the gate from the proof (`supOk = supersNow >= supersMin`) | 6 |
| the measured `blackver` spelling, leaving only the squash | 1 |
| reading `player.weapons` first (ownedLevels first instead) | 1 |
| the empty-list off switch (fail closed) | 1 |
| `resetBuildGate()` from `resetCapLatch` | 6 |
| the third reset guard (`!g.resetEpoch132`) | 2 |
| `reloadGraduation`'s adoption | 2 of the 3 multi-tab tests |
| `reloadGraduation`'s reset guard | the 3rd multi-tab test |

Shipped in sandbox commit `6182a83`, delivered as `pine-bot-6.132.0.zip`
(mechanically verified tree-at-root: root `build.js` count 1, nested count
0) and `6.132.0.patch`.

## 6.131.0 — the race ledger: who got there cheapest

**User: "Is there a way to find out who reached immortal build the fastest
and with the fewest runs"**

Short answer before the build: **partly, and fragilely.** The counter says
WHERE each character is; it has never said what getting there cost. Two
things in the existing report get close:

- `compare` has per-version rows tagged `6.130.0+crown+<char>`, each with
  its own `runs` — and because the 6.130.0 reset coincided with a version
  bump, those run counts happen to line up exactly with the epoch. Divide
  `graduation.counts[c]` by that row's `runs` and you have each
  character's immortal-per-run rate.
- `graduation.graduated[c].at` orders the finishes by wall clock, and
  `graduated[c].rows[].capAt` says how quickly each of the ten builds
  proved itself in game-seconds.

The failure mode is the alignment: ship any version mid-race and the
`compare` rows split, after which no row spans the epoch and the
denominator is gone. Given how often this project ships, that is close to
guaranteed. It also cannot say which RUN the tenth landed on — only the
total so far.

So 6.131.0 records it directly. `bookImmortal` keeps a per-character epoch
ledger in the graduation store it already owns:

```
graduation.progress[char] = {
  runs, immortal, startedAt, lastAt, startRun, careerRun,
  marks: { "1": {run, careerRun, at, capAt, t}, ... "10": {...} },
  adopted?          // builds counted before this ledger existed
}
```

`runs` counts every finished run that character played since the ledger
opened; `marks[N]` is the exact answer to "reached N in how many runs, and
when". **Marks are read off the COUNTER, not off `isImmortalRow`** — the
counter also backfills from the audit and can rise by more than one, and
reading the row predicate separately is how the ledger would silently
drift from the number it exists to measure.

`graduationStatus()` gains `race` (per character: `runs`, `immortal`,
`perRun`, `runsTo`, `hoursTo`, `medianCapAt`, `adopted`) and **three
winners, reported separately because they can disagree**:

| field | means | reads |
|---|---|---|
| `fewestRuns` | the run the target landed on | efficiency — fewest attempts per immortal build |
| `fastestWall` | hours from the ledger opening to the target | throughput, confounded by how often that character's turn came up |
| `fastestBuild` | median `capAt` across the marks | how EARLY IN A RUN each build proved itself — low = immortal sooner, not just eventually |

`fewestRuns` and `fastestBuild` measure genuinely different things: a
character can need more attempts but, when it does land one, land it at
1800 s where another needs 2700 s. The test fixture asserts exactly that
disagreement rather than assuming they coincide.

**The mid-epoch caveat, stated in the report note rather than hidden:** a
ledger that opens after the reset it measures (this version shipping onto
a 6.130.0 store with runs already booked) adopts the standing count into
`adopted`. Those builds' run numbers are unknowable, so that character's
`runsTo` is a LOWER BOUND, not an exact figure. The race started with ~0
runs on 6.130.0, so in practice `adopted` should be 0 or very small here.

Summary line, so none of this needs the JSON opened:

```
IMMORTAL joe 3/10 in 28+   minguk 10/10 in 26   pat 1/10 in 27+   playing joe
RACE   fewest runs minguk   fastest wall minguk   earliest cap joe   [joe 3/28 cap1800 | minguk 10/26 cap2700 | pat 1/27 cap2600]
```

`in N` is runs this epoch; the `+` marks a character still counting. A
report taken right after a tenth run still reads `10/10`, not 🎓 — the
graduation is recorded on the NEXT pick, and the test asserts both states.

Instrument only, no play-logic change. Tests: `immortal-graduation` +6
(run-number stamping, a death costs a run but never a mark, per-character
ledgers do not pool under the rotation, the three winners including the
fewest-runs / earliest-cap disagreement, the mid-epoch adoption caveat,
both summary lines) — all six observed failing against the 6.130.0 build.

Shipped in sandbox commit `d364824`, delivered as `pine-bot-6.131.0.zip`.

## 6.130.0 — the second reset, and the character rotates EVERY run

**User: "Let's restart the immortal build process again with Joe, Minguk,
and Pat by resetting the counter and starting from 0 with the goal to
getting to 10. For this version, let's rotate the character per run
instead of sticking with one character until it reaches the 10 immortal
build count."**

Context that prompted it: under 6.128.0 the pin had already walked the
whole order — Joe graduated (371 runs), Minguk graduated (112), Pat was
live at ~9 of 10 (the 2026-09-04 paste's `6.128.0+crown+pat` funnel row
showed `earlyCaps 11` in the window, `hp`-arm caps at 2.6k–5.5k s). Then a
mis-stamped 6.124.0-era build ran ten runs with no graduation logic at all
(see `release-state.md`), which is what the user saw as "reverted back to
joe" and "immortal build count is no longer there". The user chose to
restart the whole exercise cleanly rather than resume Pat's count.

Two changes:

1. **`resetEpoch130`** — a second one-time wipe in the `graduation` store's
   own load, guarded like the 6.128.0 one (a store with neither flag gets
   both stamped in one go). Every count and graduation cleared,
   `immortalEpochVersion` re-stamped at the running version so rows tagged
   6.128.x/6.129.x sitting in the 240-row audit window cannot count toward
   the fresh ten, the new round-robin cursor (`lastPlayed`) cleared, and
   the whole thing written to `localStorage` immediately (the 6.128.0
   persistence lesson, kept).
2. **`CONFIG.graduation.rotate: true`** — `graduationPick()` is a plain
   round-robin (`rotationPick` in `04-lifecycle-screens.js`). The user's
   correction to the first cut of this build, which had dropped a
   graduate out of the cycle: **"no I want them to rotate on every
   session regardless of whether they graduated."** So:
   - every run start picks the character after `graduation.lastPlayed`
     in `order`, cyclically — joe → minguk → pat → joe … — and never
     skips anyone; the cursor is persisted in the graduation store so a
     reload mid-cycle continues rather than restarting at joe;
   - reaching the bar is still RECORDED on the next pick, whoever's turn
     it is (`recordGraduation`, shared with the pin path: timestamp,
     version, count, the rows that earned it — the 🎓 in the summary and
     `r.graduation.graduated`), because ten immortal builds per character
     is the goal being measured — but it never changes who plays, and when
     all three have reached ten the rotation simply carries on;
   - `pineBot.ungraduate(c)` clears the record and zeroes the count; the
     cycle was never affected either way.

   `rotate: false` restores the 6.125.0 pin-until-graduated path unchanged
   (kept and tested with the flag explicitly off). `preferredBartender` is
   inert while `rotate` is on. `graduationStatus()` gains `rotate` and
   `lastPlayed`, and `playing` becomes a PREVIEW of the next pick — computed
   by the same function in a mode that neither moves the cursor nor records
   a graduation, so reading a report can never advance the rotation.

What this costs and doesn't: the per-character SAMPLE RATE splits three
ways — each `compare` row (`+joe` / `+minguk` / `+pat`) moves a third as
fast, so expect ~3x the runs before a z on any one row means anything. The
LEARNING does not split: since 6.127.0 the CEM/bandit skill is one shared
store, so every run improves all three regardless of who played it. No
play-logic change — the golden-plan scenarios pass unchanged.

Tests: `immortal-graduation` — the pin block now runs with `rotate:false`
set explicitly and is unchanged; +9 assertions for the round-robin (fresh
cycle order, persisted cursor, preview-does-not-move, graduate-on-anyone's-
turn AND keeps playing, N-1 keeps all three, all-graduated still rotates,
ungraduate leaves the cycle alone, summary line) and the second reset (a 6.128.x store
with graduations is wiped again, both guards + floor stamped, a no-guard
store handled the same); `rotation` +1 (the round-robin outranks the pin).
11 observed failing against the 6.129.1 build with the new tests in place;
the three "graduates keep playing" assertions also observed failing against
the first (drop-out) cut of this build — the correction has its own teeth.
Fixture note: the row makers' default tag version moved to `6.130.0` so
rows clear the new floor — the floor tests still set their own explicit
versions.

Shipped in sandbox commit `7bec775` (the drop-out cut `e4e86d6` was amended
away before any push), delivered as `pine-bot-6.130.0.zip` (mechanically
verified tree-at-root; replaces the first zip of the same name).

## 6.128.0 — the reset, and the bar raised to ten

**User (standing): "In the next build I want to rotate among pat, minguk,
and joe and have all their immortal build count reset and start from the
new version. They should reach 10 immortal build counts."**

Two changes, not one:

1. **The bar is now TEN, not five.** `CONFIG.graduation.count: 10`. The
   joe → minguk → pat rotation itself (`CONFIG.graduation.order`) is
   unchanged — it already was "rotate among pat, minguk, and joe", since
   6.125.0's original implementation of this same rule at a count of five.
   The user's phrasing described the existing mechanic, not a new one.
2. **Every character's persisted count and graduated flag was wiped once**,
   the first time 6.128.0's code ran, and — this is the part that took a
   second pass to get right — **the reset also stamps a version floor** so
   old immortal rows can't sneak back in and undo it.

Why the floor was necessary: `immortalCount()` is `Math.max(the persisted
counter, rows still sitting in the phase audit)` — that backfill exists so
rows booked before the counter existed are never lost (see below). But it
cuts both ways: the phase audit is a rolling 240-row window, so at the
moment of the 6.128.0 upgrade it could easily still contain immortal rows
from 6.127.0 or earlier. Reset the counter to zero without also gating the
backfill, and the very first `pineBot.report()` after upgrading would read
those old rows straight back off the audit and re-inflate the "reset"
counter toward its old value — the reset would look like it never happened.

The fix: the reset stamps `graduation.immortalEpochVersion` with the
version that performed it (read from `SCRIPT_VERSION` at reset time —
`6.128.0`), and a new `versionAtOrAfterEpoch(v)` in `04-lifecycle-screens.js`
gates `immortalRowsCount`: a phase row's `v` (scriptTag, e.g.
`6.127.0+crown+pat`) only counts if its leading `X.Y.Z` is `>=` the stamped
floor. A store with no floor (predates this mechanism) is ungated, same as
always.

**The other bug this caught**: the reset itself was originally only applied
to the in-memory `graduation` variable, never written back to
`localStorage` at the moment it happened — it would only get persisted
incidentally, whenever the next graduation or `bookImmortal` call happened
to call `localStorage.setItem`. A report or a reload in between would read
the STALE pre-reset blob back out of storage even though the live session
had already reset. Caught by a "real boot" test (a fresh `makeEnv()`
against an actual pre-6.128.0 store, not just the `T.setGraduation()`
test-surface shortcut, which bypasses the real load path entirely) — fixed
by writing the reset to `GRADUATION_KEY` immediately, inside the same IIFE
that computes it.

Tests: `immortal-graduation` rewritten, 33 assertions (up from 31 in
6.126.0), including two boot-from-cold tests against a real pre-6.128.0
store. 9 assertions confirmed failing against the pre-6.128.0 source when
isolated via `git stash`; the persistence-timing fix was separately
verified failing before its `localStorage.setItem` call was added.

Shipped in sandbox commit `68269c2`, delivered as `pine-bot-6.128.0.zip`.

## History: how the rule came to exist

**v6.125.0, user (2026-09-03, standing), quoted verbatim from the shipped
config comment:**

> "Each time I run a batch:
> 1. Check if joe has hit 5 immortal builds (doesn't die, completes corner
>    anchoring, early cap triggers)
> 2. If yes → stop training joe, move to minguk
> 3. Same criterion for minguk → when it hits 5, move to pat
> 4. Same for pat"

6.125.0 turned that into code: a pin (`CONFIG.preferredBartender`) is
honoured until the pinned character GRADUATES, then the pin advances to the
next character in `CONFIG.graduation.order` that has not. The graduation is
persisted (`pineBotGraduation`, namespaced like every other store) so a
reload does not send a graduate back to work, and the report carries
`graduation` so a paste says who is where.

**v6.126.0, user: "let's not make it 5 consecutive immortal builds but just
5 as a count of immortal builds as a target."** 6.125.0 had read the bar as
five IN A ROW, any death resetting it. The bar became five (later ten)
immortal builds in TOTAL on the character's own tag — deaths in between
neither reset nor count. The count is PERSISTED in the graduation store the
run it is earned (`bookImmortal`, called from `finishRun`), because the
phase audit is a rolling 240-row window and a count read off the rows alone
would quietly shrink as old immortal rows evict. The live figure
(`immortalCount`) is the larger of the persisted counter and the immortal
rows still in the audit, so rows booked before the counter existed are
backfilled, not lost, on upgrade — this backfill is also exactly what made
the 6.128.0 version-floor necessary (above): backfilling from the audit is
correct in general, but must not cross a deliberate reset.

## What "immortal" means

One predicate, `isImmortalRow(row)` in `04-lifecycle-screens.js`, so the
definition can be asserted rather than re-derived in three places. A row
is immortal when ALL of:

- `cap: true`, `capAt < deepHell.runCapS` — the EARLY cap fired (the build
  proved itself stable), not the 150-minute clock cap.
- `why !== 'saturated'` — the STABLE-BUILD arm, not the deadlock/saturation
  arm. **From 6.132.0 that arm is HP + defense + the four-ingredient BUILD**
  held for the hold window; before 6.132.0 it was HP + defense + `supers >= 3`.
  Rows booked under the old bar are excluded by `resetEpoch132`'s version
  floor, so the two definitions never mix inside one count.
- `parkT > 0` — corner anchoring actually happened.

A capped run is by construction one that did not die on its own — the run
cap's ladder ends it, not the game. `t`, `ph`, `cause` are deliberately not
consulted: a capped run's cause is the ladder, not a real death.

## The mechanics, end to end

- `immortalRowsCount(char, rows)` — counts rows in the phase audit whose
  tag ends `+<char>` and pass `isImmortalRow`, gated (6.128.0+) by
  `versionAtOrAfterEpoch`.
- `immortalCount(char, rows)` — `Math.max(persisted counter,
  immortalRowsCount(...))`.
- `bookImmortal(row)` — called from `finishRun` right after the phase row
  is appended; increments the persisted counter for the row's character if
  the row is immortal, floors it at the freshly-recomputed
  `immortalRowsCount` (so backfill and live booking never disagree), and
  writes `pineBotGraduation` immediately. **(6.131.0: it also maintains
  `graduation.progress[char]`, the race ledger — see that section.)**
- `graduationPick()` — resolves who the pin currently means: if the pinned
  character has already graduated, hands off to the first ungraduated
  character in `order`. Checks whether the current character has now met
  `need` (the count) and, if so and not already graduated, records the
  graduation (timestamp, script version, count, and the specific rows that
  earned it) and advances to the next un-graduated character in `order` —
  same run it becomes true, not the next time someone reads a report. When
  every character in `order` has graduated, the pin resolves to `null` and
  selection falls through to `bartenderRotation` / the learned bandit.
  **(6.130.0: this is the `rotate: false` path. With `rotate: true` —
  the shipped default — `graduationPick` delegates to the round-robin
  described in the 6.130.0 section above, which never skips a graduate.)**
- `graduationStatus()` — the report's view: `enabled`, `countNeeded`,
  `order`, `pin`, `counts` (per character, live), `graduated` (persisted
  record), `playing` (who the pin resolves to right now — under
  `rotate: true`, a preview of the next pick), plus (6.130.0) `rotate` and
  `lastPlayed`, plus (6.131.0) `race` and the three winners
  `fewestRuns` / `fastestWall` / `fastestBuild`.
- `pineBot.capStatus()` (also `report().cap`) — since 6.132.0 carries
  `build.legs`: every clause with its level, max, the weapon key that
  answered and where the number came from. This is the probe to read first
  when a run "should" be immortal and is not.
- `pineBot.ungraduate(c)` — puts a character back on the bench: clears
  `graduated[c]` and zeroes `counts[c]`, so a graduate sent back to work
  starts a fresh count rather than instantly re-graduating off old rows.
  Note it does NOT clear that character's `progress` ledger — the run cost
  already spent is history, not state to be rewritten.
- `graduation.enabled: false` or `count: 0` disables the rule entirely,
  restoring the plain pin, graduations or not.

## Verified against live data (pre-6.128.0 note, historical)

Before the 6.128.0 reset, the user's own pasted `pineBot.report()` showed
joe's count reaching 5 (the then-current bar) via rows backfilled from the
full career phase-audit history, not just runs since the rule existed by
version — confirmed by cross-checking two of the five graduated rows'
`capAt`/`parkT` values exactly against rows visible in the pasted `phases`
array. This was working as designed: `immortalCount` is a career total, not
a since-the-rule-started count. It's also precisely the behavior the
6.128.0 version-floor now scopes going forward — a fresh reset stays fresh.

# Pine Bot

Autonomous player for [Pine & Co](https://pineandco.online/). A userscript that
picks the bartender, moves on the game's real coordinates, chooses every
cocktail and ingredient card, crafts, and books the result — then learns from
it (CEM optimizer + bandits) and plays again.

What it is training toward: a build that **cannot die**. When the bot proves a
build is stable in Hell it ends the run itself and counts an *immortal build*.
The target is ten per bartender (joe, minguk, pat).

The full player manual, with the panel explained button by button, is
published alongside this repo; this README carries the same content in plain
text. Developers: start with `CLAUDE.md` and `claude/current-state.md`.

## Install

### In a browser (Violentmonkey / Tampermonkey)

1. Open the raw URL in the browser that has the manager — it offers to
   install:
   <https://raw.githubusercontent.com/changhakim90/pine-bot/main/dist/pine-bot.user.js>
   Install *from the URL*, not by pasting the file into the editor; that is
   what makes auto-update work (`@updateURL` / `@downloadURL` are stamped
   from `package.json` → `pineBot.rawBase`).
2. Open <https://pineandco.online/>. The 🍸 panel appears in the corner.

Run exactly **one** copy per browser profile. Two copies fight over the keys
and double-count runs. Updates arrive on the manager's schedule (set
Violentmonkey → Settings → Update interval to 1 hour, or force it from the
dashboard ⟳). raw.githubusercontent can lag a push by a few minutes:

```
curl -s https://raw.githubusercontent.com/changhakim90/pine-bot/main/dist/pine-bot.user.js | grep -m2 -E '@version|SCRIPT_VERSION'
```

### Without an extension (Playwright)

```
npm i playwright && npx playwright install chromium
node run/playwright.js                    # window, persistent ./profile
node run/playwright.js --headless
node run/playwright.js --headless --tabs 4 --profile ./farm
```

The persistent profile keeps the game's `localStorage` (learning state, the
immortal ledger, snapshots) between launches. Background-tab throttling is
disabled so every tab keeps full frame rate.

## The panel

```
🍸 Pine Bot v6.135.0                              –
▶ Start   ■ Stop   ⏻ End Run   📋   🎥
⟳ auto   joe   minguk   pat
🔁 Loop runs
idle
```

| control | does |
| --- | --- |
| ▶ Start | Let the bot play. Title screen → picks a bartender and starts; results screen → starts the next run. |
| ■ Stop | Hand control back. Releases every key. The current run is *not* booked. |
| ⏻ End Run | Two clicks. Ends the run on purpose through the bot's own end-of-run ladder, books it, keeps looping. |
| 📋 | The full report — every audit, summary on top, pre-selected for copying. Paste this when asking for tuning help. |
| 🎥 | Record *your* manual play as a teaching demo. Once to start (⏺), again to save. `pineBot.demo()` digests it. |
| ⟳ auto · joe · minguk · pat | Who plays the next run. *auto* follows the rotation (joe → minguk → pat, one per run). A name pins that bartender until un-pinned. Applies at the next run start. |
| 🔁 Loop runs / ① One run, then stop | Loop mode. ① plays one full run, books it, and stops on the results screen. |
| – | Hide the panel; a 🍸 button bottom-right brings it back. |

Character and loop mode persist in their own key (`pineBotControl`), untouched
by any counter reset.

## First session

1. Script installed, game on its title screen.
2. Leave ⟳ auto (or pick one — pat is sturdiest, joe weakest) and 🔁 Loop runs.
3. ▶ Start. Walk away.

The bot drives every menu: select, intro, level-ups, crafts, the after-hours
choice (always Hell), results, next run. To play yourself: ■ Stop, play. To
hand a chosen bartender to the bot: pick the chip, ▶.

It stops on a **Hell #1**: if a run beats the top Hell time the bot stops on
the name-entry screen (`HELL #1 RECORD — type your name yourself`). Type it,
press ▶. `stopOnHellRecord` in the config turns this off.

## How a run works

| phase | what happens |
| --- | --- |
| Title | Bartender from the chip or the rotation. Loop mode armed. |
| Day (gt 0–2400 s) | Serve, level up, fill cocktail and ingredient slots in a fixed order. Four-card pools. |
| Hell (after hours) | Pools shrink to 3 or 2 cards. A slot already filled cannot be offered again. |
| Prove it (from gt 2400) | Parked in a corner, the bot watches HP ≥ 97 %, defense ≥ 34.9, and the build for 300 s straight. If they hold, the run is immortal and the bot ends it. |
| Results | Time, reward, phase rows, the immortal mark. Learners update. Next run — or stop, in ① mode. |

Terms: **gt** game-seconds (the game counts frames, so 60 gt is 60 s only at
1×); **park/seat** the corner anchor, `parkT` how long; **super line** a
cocktail whose key ingredient hit 6; **cap** the bot's own early stop
(`cap: true` = the bot ended it); **saturated** the other cap reason — a
stalled run, not an immortal one.

## The build

An immortal build is all three, held 300 gt while parked, HP ≥ 97 %:

```
SOUTH SIDE at 6 (SUPER, keyed by MINT)   ·   SIMPLE SYRUP crafted   ·   OLIVE at 6 (def 34.99)
```

Levels are read from the game's own `player.weapons` map, never from the
bot's memory of its picks. A craft result reads max 1 — SIMPLE SYRUP
disappearing from the bar once made is *complete*. `report().cap.build.legs`
names each clause and what it saw; `cap.short.buildShort` lists what is
missing.

**The Rainbow Gun is refused.** Six maxed super lines make the gun; the plan
builds exactly four (SOUTH SIDE, VODKA TONIC, GIN TONIC, MOJITO). Hell pools
are too small for a penalty alone to hold, so the real defence is occupancy:
three keyless cocktails (NEGRONI, WHISKY SOUR, MOSCOW MULE) sit in slots and
are never levelled; from 900 s or Hell, OLD FASHIONED and CORPSE REVIVER NO.2
are claimed as junk occupants for any open cocktail slot; and the last
ingredient slots are reserved for what the gate still lacks (MINT, SIMPLE
SYRUP, WATER, SUGAR, OLIVE). A forced sixth line is still possible from an
unlucky pool; `report().picks` shows the pool it came from.

## The immortal count

Each booked run adds to a per-bartender ledger (runs, immortal marks). The
rotation moves one bartender per run regardless of pins, so un-pinning
resumes the cycle where it was. The ledger has been reset six times (128,
130, 132, 132.1, 133, 134 — the version that shipped each reset), each time
the definition changed, so every count was measured under the current rule.
A reset never touches learned skill, snapshots, or the pinned character.
`report().graduation` has counts, next pick, and the race table (runs to
target, hours to target, median gt at which each build proved itself).

## Reading the report

📋, or `copy(JSON.stringify(pineBot.report()))` — under 60 KB.

| block | answers |
| --- | --- |
| `graduation` | immortal counts, next pick, race table |
| `cap` | the early-stop gate live: HP, def, `build.legs`, `short.buildShort` |
| `compare` | versions side by side — judge on `medianTimeS`, `p60`, `p120`, `vsPrev.z` with n ≥ 20, never best time |
| `funnel` / `phases` | where runs end, phase by phase; a rolling window, never compare across reports |
| `craft` | craft prompts owed vs seen (SIMPLE SYRUP auto-crafts; BLACK VERMOUTH does not — open item) |
| `learning` | tag weights (read `weight` with `n`), enemy multipliers, where the CEM has walked |
| `picks` | last card decisions: taken, score, `why`, what it beat |

`pineBot.table()` prints the version table; `pineBot.capStatus()` is the
`cap` block alone.

## Training faster

There is **no offline training**: every learner needs a run's reward and the
only source is the game playing a run. What you can do:

- **Parallel tabs, one brain** — `node run/playwright.js --headless --tabs 4
  --profile ./farm`. All tabs share one `localStorage`; each run merges into
  the shared store when it books (the multi-tab merges of 6.113.0 and 6.132.0
  make this safe).
- **Game speed** — `tools/pine-speed.user.js` multiplies the frame rate
  (default 100×; the game is frame-counted so this is real game-time). Set
  `localStorage.pineSpeed = '1'` and reload to play by hand.
- **Controlled experiments** — ① one run then stop; pin a bartender;
  `pineBot.namespace('trial')` copies every store under a suffix and reloads
  onto it (`namespace('')` comes back, the bare keys are untouched);
  `pineBot.reset()` clears learned skill (snapshots kept — it throws away every
  run, use sparingly).

After 6.134.0: level-up cards (“… UP”) were invisible to the scorer before
that version and scored a flat 9, so every earlier learned mean was fit
against a bot that could not see level-ups. Expect the optimizer to move
again; judge 6.134.0+ rows on their own.

## Console

| call | does |
| --- | --- |
| `pineBot.start()` / `stop()` | ▶ / ■ |
| `pineBot.pin('pat')` / `pin(null)` | pin / back to rotation |
| `pineBot.loop('single')` / `loop('continuous')` | one run then stop / keep looping (mid-run applies to this run) |
| `pineBot.control()` | pin, loop, armed, running |
| `pineBot.killNow()` | ⏻ without the confirm; books, keeps looping |
| `pineBot.endRun()` | books the run **and stops** — then die or quit freely |
| `pineBot.report()` | the 📋 report |
| `pineBot.capStatus()` | the gate, live |
| `pineBot.table()` / `compare()` | version comparison |
| `pineBot.snapshot()` | freeze this version's statistics (before tagging) |
| `pineBot.diagnose()` | check every game function the bot relies on still exists |
| `pineBot.panel(false)` / `panel(true)` | hide / show |
| `pineBot.demo()` | digest of the last 🎥 recording |
| `pineBot.version` | running version |

## When something looks wrong

| you see | it means |
| --- | --- |
| runs booked twice, keys stutter | two copies running — keep one |
| panel version older than the release | manager hasn't pulled yet; force it |
| `HELL #1 RECORD` | type your name, ▶ |
| `run complete — one-run mode` | ① was on; ▶ for another, or switch to 🔁 |
| a run looked immortal but did not count | `report().cap.short.buildShort` names the missing clause; then `why` (saturated ≠ immortal) and `parkT` |
| `⚠ could not save the immortal count` | localStorage refused a write; the run is in the report, the ledger did not advance |
| bot idle on a menu | `pineBot.diagnose()` — a missing game function means the game changed |
| game at 100× but you want to play | `localStorage.pineSpeed = '1'`, reload |

## Develop

```
src/        the script, six ordered parts (edit these, never dist/)
dist/       pine-bot.user.js — built, committed, what the browser installs
test/       headless scenarios (fake DOM + game globals)
run/        Playwright runner
tools/      pine-speed userscript, plan-diff
results/    📸 snapshot JSON per version
claude/     working notes — start with current-state.md
```

```
npm run build                        # src/*.js -> dist/pine-bot.user.js, version from package.json
npm test                             # build + syntax check + headless scenarios
node test/scenario.js controls       # one scenario (reads the BUILT dist — build first)
node tools/plan-diff.js a.json b.json  # must print "0 differ" for a scoring-only change
```

Bump the version in `package.json` only, add a CHANGELOG row, commit `dist/`
with the source, tag `vX.Y.Z`. Never ship two different builds under one
version number.

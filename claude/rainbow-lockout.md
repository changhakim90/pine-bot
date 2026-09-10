# The Rainbow Gun lockout — why runs kept building the gun

Written 2026-08-25 at v6.89.0. Read this before touching anything in
`03-scoring.js` that mentions supers, keys, or crafts.

> **Corrections as of 6.135.0 (2026-09-10).** The narrative below is the
> 6.89.0–6.92.0 record and is kept as written. Four things it states as fact
> have since changed; each is also marked inline with `[6.135.0: …]`.
>
> 1. **The cap is FOUR, not five.** `maxSuperLines` went 5 → 4 in 6.92.1. The
>    four intended lines are `SUPER_LINE_COCKTAILS`: SOUTH SIDE, VODKA TONIC,
>    GIN TONIC, MOJITO. There is no slack at all — the plan builds exactly the
>    cap.
> 2. **`PLAN_COCKTAILS` holds seven, not six.** MOSCOW MULE joined in 6.92.2 as
>    a third keyless occupant (its key GINGER BEER is arming-capped).
> 3. **"Permanently banned" keys DO max.** 6.133.0 measured `whiskysour 6,
>    lemon 6` — SUPER WHISKY SOUR armed — and `lime 6` one report later. The
>    arming cap is a −700 **score**, and a score loses a two-card hell pool.
>    "Never unbanned" means *we never promote it into the plan*; it was read as
>    *it can never be maxed*, and that reading was wrong. See
>    `claude/up-card-blindness.md` for the deeper cause (the scorer never saw
>    a level-up card at all until 6.134.0).
> 4. **The slot-wasters are repriced.** OLD FASHIONED and CORPSE REVIVER NO.2
>    stay −300 in the day but become +40 `slot-occupant` claims once the pool
>    is about to narrow (6.133.0 slot doctrine): a cocktail whose key is
>    arming-capped and still has headroom is the best possible occupant of a
>    slot a gun cocktail would otherwise take.
>
> The structural lesson of this doc — occupancy beats scoring — is the one
> that held. The specific guarantees it claimed for the arming cap did not.

## The gate

The Rainbow Gun unlocks at **six maxed super cocktails**. A super needs three
things: base attack MAXED, the cocktail at Lv6, and its **key ingredient**
MAXED. `CONFIG.maxSuperLines` is 5 `[6.135.0: it is 4 — tightened in 6.92.1]`,
so the doctrine is to build exactly five lines `[6.135.0: four]` and make the
sixth structurally unreachable.

The gun is banned outright (`banRainbowGun`, −1000). That ban is not the
defence — by the time the `rainbowup` card appears the sixth line already
exists. The defence is never opening a sixth line.

## How many lines the plan can actually make

`PLAN_COCKTAILS` holds six names (v6.91.9) `[6.135.0: seven — MOSCOW MULE,
key GINGER BEER, joined in 6.92.2]`, but only four of them can ever super,
because a super needs its key in `PLAN_INGREDIENTS`:

| cocktail | key | can super? |
|---|---|---|
| SOUTH SIDE | MINT | yes |
| VODKA TONIC | TONIC | yes |
| GIN TONIC | TONIC | yes |
| MOJITO | SUGAR | yes |
| NEGRONI | CAMPARI | no — off plan |
| WHISKY SOUR | LEMON | no — permanently banned `[6.135.0: FALSE — it armed in a live 6.132.x run; LEMON reached 6 through the −700 arming cap]` |
| MOSCOW MULE | GINGER BEER | `[6.135.0: added 6.92.2]` no — arming-capped, same caveat as LEMON |

Four, under the cap of 5 `[6.135.0: four AT the cap of 4]`. NEGRONI and WHISKY
SOUR are deliberate keyless occupants: they earn their slot on raw effect and
can never count toward six `[6.135.0: they can — see correction 3; "keyless"
holds only while the key stays under 6, and nothing structural keeps it
there]`. **Any off-plan cocktail that supers is the sixth.** There is no slack.

(GIN TONIC returned in v6.91.9 on the strength of the user's 62686 s crown
run, whose roster was exactly these six: supers GIN TONIC / VODKA TONIC /
MOJITO / SOUTH SIDE, non-supers NEGRONI and WHISKY SOUR, junk SODA WATER and
LIME. It is the cheapest line on the board — GIN TONIC and VODKA TONIC share
the TONIC key, already planned, so the fourth super costs one cocktail slot
and zero ingredient slots.)

## The bug that cost ~15 versions: absorbed keys

A secret craft **consumes its parts**:

- SWEET VERMOUTH + DRY VERMOUTH → **BLACK VERMOUTH**
- WATER + SUGAR → **SIMPLE SYRUP**

The parts leave `ownedLevels` entirely `[6.135.0: the game's own
`player.weapons` keeps the consumed parts at full level and only frees their
slots — "능력치 효과는 계속 적용되고, 슬롯 카운트에서만 빠짐"; and the craft
RESULT lands at level 1 and never moves, because a crafted item leaves the
pool. 6.132.1 was the fix for reading that 1 as 1-of-6]`. **The game keeps
honouring the maxed key for super evolution.** So the moment the craft the plan
deliberately pursues completes, three off-plan cocktails become one Lv6 away
from a super:

| cocktail | key | armed by |
|---|---|---|
| MANHATTAN | SWEET VERMOUTH | BLACK VERMOUTH craft |
| VODKA MARTINI | DRY VERMOUTH | BLACK VERMOUTH craft |
| WHISKEY HIGHBALL | WATER | SIMPLE SYRUP craft |

Every gun guard — `opensNewSuperLine`, `gunPathProgress`, `isMaxed` — read
`ownedLevels[key]`. After the fusion that reads **0**, so the guards scored a
one-pick-from-a-sixth-super MANHATTAN as harmless. They went blind at exactly
the moment the danger became real.

The evidence was in the data the whole time: MANHATTAN appears as the run
`build` at 6.85.3, 6.85.5, 6.85.21, 6.85.23, 6.86.1, 6.86.10 and 6.88.5. It was
read as roster drift. It was the gate opening.

**Fix (6.89.0):** `keyEffectivelyMaxed(key)` — true if the key is maxed now, OR
was ever maxed this run (`everMaxed`, recorded at the pick site *before* a craft
can eat it), OR the craft's result is in the bar. All three guards use it, plus
a `latent-line` veto that refuses an off-plan cocktail whose key is already
satisfied: −600 at level 0, −400 if already owned, at any super count.

`[6.135.0: the latent-line veto did not fire on MANHATTAN in a 6.132.2 run —
`manhattan 6, sweetver 6`, SUPER MANHATTAN armed. Not because the veto was
wrong, but because it never saw the card: the level-up card is `MANHATTAN UP`
and every name-keyed guard matched only `MANHATTAN`. 6.134.0 fixed that at the
root. 6.133.1 also dropped SWEET VERMOUTH from the immortal-build gate,
because the gate was requiring the very ingredient that arms MANHATTAN.]`

## The second hole: the plan's own junk armed two lines (v6.92.0)

Found 2026-08-26 by probing a **live run**, not by reasoning about the code.
`superLv` and `evolved` are both readable off `player`, and `evolved` is a Set
— `JSON.stringify` renders it `{}`, so spread it: `[...player.evolved]`.

```
evolved: [southside, vodkatonic, negroni, mojito, gimlet]     5 of 6, no gun
weapons: { ..., campari: 6, lime: 6, ... }
```

**NEGRONI and GIMLET had both evolved.** NEGRONI is the keyless occupant that
must never super; GIMLET is not on the roster at all. This is not the absorbed
-key subtlety — the bot simply **bought both keys to Lv6**:

- **LIME** is GIMLET's key and sits in `JUNK_ACCEPTABLE` and `HELL_SAFE_JUNK`
  by user direction ("lime, soda water can be junk pool picks"). The safe-junk
  tier armed an off-plan line.
- **CAMPARI** is NEGRONI's key and appeared on **no list whatsoever** — not
  planned, not avoided. A narrow late pool took it to max unopposed.

**Why every existing guard stayed silent:** `gun-guard`, `gun-guard-source`
and the `latent-line` veto are all gated on `nSupers >= CAP`. They say nothing
during the climb from zero to five, which is exactly when the junk keys get
maxed. The guards defend the last step of a staircase nobody was watching.

**Fix (6.92.0) — THE ARMING CAP.** Refuse only the level that *arms* a key.
A key at Lv5 arms nothing, so the junk tier keeps working when the late pool
offers nothing else, which is the entire reason `JUNK_ACCEPTABLE` exists.
Fires at **any** super count. `-700, 'arming-cap'`.

`[6.135.0: and it has failed twice since — LEMON 6 and LIME 6 in consecutive
6.132.x/6.133.0 reports. A −700 loses a two-card hell pool where the other
card is −900, and the pool was never even flagged as forced (so no re-roll was
spent) because `gunPathProgress` treated those lines as unreachable. Both
halves fixed in 6.133.0; the deeper cause — the guard never saw `LIME UP` —
in 6.134.0. The cap is still a score. The slot doctrine (6.133.0) is what
makes forced pools rarer; nothing makes them impossible.]`

The capped set is **computed, never listed**, so a roster edit cannot leave it
stale. An ingredient is arming-capped when all three hold:

1. some cocktail keys off it, AND
2. it is not the key of a line we intend to complete (`SUPER_LINE_COCKTAILS`), AND
3. **it is not in `PLAN_INGREDIENTS`.**

Clause 3 is what makes it safe. OLIVE (DRY MARTINI), TOMATO JUICE (BLOODY
MARY), CRANBERRY (VODKA CRANBERRY), SWEET VERMOUTH (MANHATTAN), DRY VERMOUTH
(VODKA MARTINI) and WATER (WHISKEY HIGHBALL) are **all** keys of off-plan
cocktails, and the plan needs every one of them MAXED for its stat. A blanket
cap would gut the survival core. Those stay guarded by occupancy and
`latent-line`.

Yields exactly the ingredients with no plan value `[6.135.0: "with no plan
value" is wrong — LEMON and GINGER BEER are the keys of two PLAN cocktails.
Capped means "never levelled on purpose", not "worthless" and not "cannot
max"]`: LIME, CAMPARI, LEMON, ORANGE, ANGOSTURA, COINTREAU, GINGER BEER,
ABSINTHE. CAMPARI was also added to `AVOID_INGREDIENTS_BASE`.

**Lesson for the next guard.** Both holes were visible in live state for
months and invisible in the code. `[...player.evolved]` and `player.weapons`
are three seconds of probing and they are ground truth about the gate. Read
them before trusting any argument that a line "cannot" open. `[6.135.0: this
lesson was right and has been re-learned three more times since — see the
`raw` map in `pineBot.report().cap.build`, which now prints `player.weapons`
on every report for exactly this reason.]`

## Why vetoing late does not work

User, on watching runs drift: *"the choices become limited towards building a
rainbow gun as the game was designed that way. for example, only cocktails that
lead towards it down to two choices."*

Late in a run the pool narrows until every cocktail on offer walks a gun line.
Refusing is not available by then. The counter is **occupancy**: a slot that is
already filled cannot be filled by a card. Fill the cocktail slots early, while
the pool is still wide, and the gun line is closed by geometry rather than by
scoring.

That is the `slot-claim` term. Its price is real — at +250 it outranked the
entire survival order and two 6.88.6 runs died in the day at 596 s and 484 s
holding seven level-1 weapons and no armour. It sits at +60 now, under the
survival core. `[6.135.0: and it was DAY-ONLY (`gtOrd < 1200`), so the whole
occupancy defence switched off at the hell entrance — exactly when the pool
narrows. 6.133.0 added the `slotUrgency` window (from 900 s / hell latch), the
`slot-occupant` repricing, and the ingredient-slot lock that reserves the last
slots for the build's own parts. The doctrine in this paragraph is the one the
user restated in 6.133.0; the code had only ever half-implemented it.]`

The arming cap is the same idea applied to the *ingredient* side: a key that
never reaches Lv6 closes its line by arithmetic rather than by scoring, and
does not depend on winning a bidding war in a junk pool. `[6.135.0: it does
depend on exactly that — it IS a bid. See the 6.92.0 correction above.]`

## The survival tier

`SURVIVAL_CORE = [OLIVE, BLACK VERMOUTH, TOMATO JUICE]` — a tier above the day
order, not a place in it (+80, doubled to +150 in the 1800–3000 s window the
user identified as where runs die). Shaving the cocktail bonus instead of
lifting these does not hold: a cocktail collects half a dozen bonuses an
ingredient never sees, so every future cocktail tweak quietly re-opens the hole.

`SLOT_WASTERS = [OLD FASHIONED, CORPSE REVIVER NO.2]` — scored below the
MOSCOW MULE ceiling `[6.135.0: the mule ceiling (LAST_RESORT) was emptied in
6.94.2 and removed in 6.135.0; the wasters are −300 in the day and +40
`slot-occupant` from the urgency window on — correction 4]`. A cocktail slot
is the lockout's currency; these two buy nothing with it `[6.135.0: they buy
the one thing that matters once the pool narrows — a slot no gun cocktail can
take]`. Only a pool with literally nothing else can force one.

## What to watch

`supersPerRun` should sit near **2** with occasional 4–5 line runs `[6.135.0:
4 is the cap; a 5-line run is a leak, not an occasional good run]`, and
`rainbowThisRun` at zero. A run showing MANHATTAN, VODKA MARTINI or
WHISKEY HIGHBALL as its `build` means the 6.89.0 fix regressed; a run showing
**GIMLET** or an evolved **NEGRONI** means the 6.92.0 fix regressed.

The direct check, from the console of a live run:

```js
copy(JSON.stringify({evolved:[...(player.evolved||[])], weapons:player.weapons,
  rainbow:player.rainbow||null}))
```

`evolved.length` is the gate counter. Anything above 4 is a warning; 5 is one
pick from the gun `[6.135.0: 4 is the cap. 5 means a fifth line ARMED — which
has now been observed three times (WHISKY SOUR, MANHATTAN, BLOODY MARY /
VODKA MARTINI in one run). `pineBot.report().cap.build.raw` is the same map
without opening the console.]`
